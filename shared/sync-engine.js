/* 领域记录先落本机；此日志只保存同步基线、确认回执和冲突，不保存任何凭据。 */
(function (root) {
  'use strict';
  const M = root.XiaoyaSyncModel || (typeof require === 'function' && require('./sync-model.js'));
  function createJournal(indexedDB) {
    let opening;
    function open() {
      if (!opening) opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('xiaoya-sync', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('documents');
        request.onblocked = () => reject(new Error('同步日志被旧页面占用，请关闭旧页面后重试。'));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
      }).catch(error => { opening = null; throw error; });
      return opening;
    }
    async function update(key, change) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        const request = store.get(key);
        let result, error;
        request.onsuccess = () => {
          try { result = change(request.result || { enabled: false, base: null, incoming: null, conflict: null }); store.put(result, key); }
          catch (failure) { error = failure; tx.abort(); }
        };
        tx.oncomplete = () => resolve(M.copy(result));
        tx.onabort = tx.onerror = () => reject(error || tx.error || new Error('同步日志未能保存。'));
      });
    }
    return { update, get: key => update(key, value => value) };
  }
  function createEngine({ journal, request, lock = (_, job) => job(), onStatus = () => {}, debounceMs = 1800, retryMs = 5000 }) {
    const adapters = new Map(), states = new Map(), timers = new Map(), running = new Map();
    let authenticated = false, closed = false;
    const keyFor = area => area;
    const report = (area, status) => { states.set(area, { ...states.get(area), ...status }); onStatus(area, M.copy(states.get(area))); };
    function schedule(area, delay = debounceMs) {
      clearTimeout(timers.get(area));
      if (!closed) timers.set(area, setTimeout(() => { timers.delete(area); void sync(area); }, delay));
    }
    async function local(area) {
      return M.normalize(area, await adapters.get(area).read());
    }
    async function envelope(area, value) {
      if (!value || !Object.hasOwn(value, 'snapshot') || (value.snapshot === null ? value.revision !== null : typeof value.revision !== 'string' || !value.revision) || (value.savedAt !== null && !Number.isFinite(Date.parse(value.savedAt)))) throw new Error('云端返回的记录版本无效。');
      return { snapshot: M.normalize(area, value.snapshot), revision: value.revision, savedAt: value.savedAt };
    }
    async function register(area, adapter) {
      if (adapters.has(area)) return;
      adapters.set(area, adapter);
      const entry = await journal.get(keyFor(area));
      report(area, { enabled: entry.enabled, pending: !M.equal(await local(area), entry.base), conflict: entry.conflict, error: null, savedAt: entry.savedAt || null });
      if (entry.enabled && authenticated) schedule(area, 0);
    }
    async function changed(area) {
      if (!adapters.has(area)) return;
      const entry = await journal.get(keyFor(area));
      report(area, { pending: !M.equal(await local(area), entry.base), error: null });
      if (entry.enabled && authenticated) schedule(area);
    }
    async function preview(area) {
      const remote = await envelope(area, await request(area, 'GET'));
      const here = await local(area);
      return { local: here, remote, ...M.merge(null, here, remote.snapshot) };
    }
    async function enable(area, reviewed) {
      // 确认时再次核对两侧，避免预览期间变化后仍沿用旧决议。
      const current = await preview(area);
      if (!M.equal(current.local, reviewed.local) || !M.equal(current.remote, reviewed.remote)) throw new Error('预览期间记录已变化，请重新查看后连接。');
      await journal.update(keyFor(area), entry => ({ ...entry, enabled: true, migrations: [...(entry.migrations || []), { local: reviewed.local, remote: reviewed.remote, at: new Date().toISOString() }] }));
      report(area, { enabled: true });
      return sync(area);
    }
    async function applyReceipt(area, receipt) {
      // 回执先持久化再合入领域库；页面在这两步之间关闭时，下次打开继续处理。
      await journal.update(keyFor(area), entry => ({ ...entry, incoming: receipt }));
      const result = await adapters.get(area).apply(receipt.resolved || receipt.remote.snapshot, receipt.local);
      const actual = M.normalize(area, result);
      await journal.update(keyFor(area), entry => ({ ...entry, incoming: null, conflict: null, base: receipt.remote.snapshot, savedAt: receipt.remote.savedAt }));
      report(area, { conflict: null, error: null, savedAt: receipt.remote.savedAt, pending: !M.equal(actual, receipt.remote.snapshot) });
      return actual;
    }
    async function perform(area) {
      const key = keyFor(area);
      let entry = await journal.get(key);
      if (!entry.enabled || !authenticated) return;
      report(area, { syncing: true, error: null });
      try {
        if (entry.incoming) {
          await applyReceipt(area, entry.incoming);
          entry = await journal.get(key);
        }
        for (let attempt = 0; attempt < 4; attempt++) {
          const remote = await envelope(area, await request(area, 'GET'));
          const here = await local(area);
          // 冲突选择只对预览过的远端版本有效。
          const choices = entry.conflict && M.equal(remote, entry.conflict.remote) && M.equal(here, entry.conflict.local) ? entry.conflict.choices || {} : {};
          const merged = M.merge(entry.base, here, remote.snapshot, choices);
          if (merged.conflicts.length) {
            const conflict = { local: here, remote, base: entry.base, conflicts: merged.conflicts };
            await journal.update(key, value => ({ ...value, conflict }));
            report(area, { conflict, pending: true });
            return;
          }
          let saved = remote;
          if (!M.equal(merged.snapshot, remote.snapshot)) {
            try { saved = await envelope(area, await request(area, 'PUT', { snapshot: merged.snapshot, revision: remote.revision })); }
            catch (error) { if (error.code === 'VERSION_CONFLICT' && attempt < 3) continue; throw error; }
            if (!M.equal(saved.snapshot, merged.snapshot)) throw new Error('云端确认内容与提交不同，尚未标记已同步。');
          }
          if (M.equal(await local(area), saved.snapshot)) {
            await journal.update(key, value => ({ ...value, incoming: null, conflict: null, base: saved.snapshot, savedAt: saved.savedAt }));
            report(area, { conflict: null, error: null, savedAt: saved.savedAt, pending: false });
            return;
          }
          const actual = await applyReceipt(area, { local: here, remote: saved });
          if (!M.equal(actual, saved.snapshot)) schedule(area);
          return;
        }
      } catch (error) {
        const current = await journal.get(key);
        if (error.code === 'MERGE_CONFLICT' && current.incoming) {
          const conflict = { local: await local(area), remote: current.incoming.remote, base: current.incoming.local, conflicts: error.conflicts, applying: true };
          await journal.update(key, value => ({ ...value, conflict }));
          report(area, { conflict, pending: true });
        } else {
          report(area, { error: error.message, pending: true, authRequired: error.code === 'AUTH_REQUIRED' });
          if (!['AUTH_REQUIRED', 'ACCESS_DENIED'].includes(error.code)) schedule(area, retryMs);
        }
      } finally { report(area, { syncing: false }); }
    }
    function sync(area) {
      if (!adapters.has(area) || closed) return Promise.resolve();
      if (running.has(area)) { schedule(area); return running.get(area); }
      clearTimeout(timers.get(area)); timers.delete(area);
      const task = lock('xiaoya-sync:' + area, () => perform(area)).catch(error => report(area, { error: error.message, pending: true }));
      running.set(area, task);
      task.finally(() => running.delete(area));
      return task;
    }
    async function resolve(area, choices) {
      const entry = await journal.get(keyFor(area));
      if (!entry.conflict) return;
      const conflict = entry.conflict;
      if (!M.equal(await local(area), conflict.local)) throw new Error('本机记录已变化，请重新同步并查看冲突。');
      if (conflict.conflicts.some(item => !['local', 'remote'].includes(choices[item.key]))) throw new Error('请为每项冲突选择保留内容。');
      if (conflict.applying) {
        const merged = M.merge(conflict.base, conflict.local, conflict.remote.snapshot, choices);
        // 已获云端确认，仅处理本机合入时产生的后续编辑冲突。
        await applyReceipt(area, { local: conflict.local, remote: conflict.remote, resolved: merged.snapshot });
      } else await journal.update(keyFor(area), value => ({ ...value, conflict: { ...conflict, choices } }));
      return sync(area);
    }
    return {
      register, changed, preview, enable, sync, resolve,
      states: () => Object.fromEntries([...states].map(([key, value]) => [key, M.copy(value)])),
      authenticate(value) { authenticated = value; if (value) for (const area of adapters.keys()) schedule(area, 0); },
      async disable(area) { await journal.update(keyFor(area), entry => ({ ...entry, enabled: false })); clearTimeout(timers.get(area)); report(area, { enabled: false }); },
      destroy() { closed = true; for (const timer of timers.values()) clearTimeout(timer); },
    };
  }
  const api = { createJournal, createEngine };
  root.XiaoyaSyncEngine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
