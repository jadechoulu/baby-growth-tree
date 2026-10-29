/* 连接既有领域存储，不重命名数据库，不清理旧数据。 */
(function (root) {
  'use strict';
  const M = root.XiaoyaSyncModel;
  const ENGLISH_KEY = 'little-leaf-english-v1';
  function conflict(result) {
    if (result.conflicts.length) throw Object.assign(new Error('保存期间相同字段发生变化，请处理冲突。'), { code: 'MERGE_CONFLICT', conflicts: result.conflicts });
    return result.snapshot;
  }
  function createAdapters({ indexedDB, localStorage, profileClient, notify = () => {} }) {
    let opening;
    function growthDatabase() {
      if (!opening) opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('xiaoya-growth', 1);
        request.onupgradeneeded = () => {
          for (const name of ['profile', 'records', 'customContent', 'meta']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
        };
        request.onblocked = () => reject(new Error('成长数据库被旧页面占用。'));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
      }).catch(error => { opening = null; throw error; });
      return opening;
    }
    async function growthTransaction(write, next, base) {
      const db = await growthDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['profile', 'records', 'meta'], write ? 'readwrite' : 'readonly');
        const store = tx.objectStore('records');
        const keys = store.getAllKeys(), values = store.getAll(), meta = tx.objectStore('meta').get('snapshot');
        let remaining = 3, result, error;
        for (const request of [keys, values, meta]) request.onsuccess = () => {
          if (--remaining) return;
          try {
            const current = keys.result.length || meta.result ? { version: 1, records: Object.fromEntries(keys.result.map((key, i) => [key, values.result[i]])) } : null;
            if (!write) { result = M.normalize('growth', current); return; }
            result = conflict(M.merge(base, current, next));
            if (!result) return;
            result = M.normalize('growth', result);
            for (const key of new Set([...keys.result, ...Object.keys(result.records)])) {
              if (Object.hasOwn(result.records, key)) store.put(result.records[key], key);
              else store.delete(key);
            }
            tx.objectStore('profile').put(profileClient.get(), 'default');
            tx.objectStore('meta').put({ version: 1, savedAt: new Date().toISOString() }, 'snapshot');
          } catch (failure) { error = failure; tx.abort(); }
        };
        tx.oncomplete = () => { if (write) notify('growth'); resolve(result); };
        tx.onabort = tx.onerror = () => reject(error || tx.error || new Error('成长记录保存失败。'));
      });
    }
    function readEnglish() {
      const raw = localStorage.getItem(ENGLISH_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      return M.normalize('english', { version: 1, profile: { vocabulary: value.profile?.vocabulary ?? 0, mode: value.profile?.mode || 'audio' }, favorites: value.favorites || [], records: value.records || {} });
    }
    return {
      profile: {
        async read() { await profileClient.refresh(); return { version: 1, ...profileClient.get() }; },
        async apply(next, base) {
          if (!next) return null;
          await profileClient.refresh();
          const current = profileClient.get();
          const here = { version: 1, ...current };
          const merged = conflict(M.merge(base, here, next));
          await profileClient.save(merged, current);
          notify('profile');
          return { version: 1, ...profileClient.get() };
        },
      },
      growth: { read: () => growthTransaction(false), apply: (next, base) => growthTransaction(true, next, base) },
      english: {
        read: async () => readEnglish(),
        async apply(next, base) {
          const merged = conflict(M.merge(base, readEnglish(), next));
          if (!merged) return null;
          const normalized = M.normalize('english', merged);
          localStorage.setItem(ENGLISH_KEY, JSON.stringify({ profile: normalized.profile, favorites: normalized.favorites, records: normalized.records }));
          notify('english');
          return normalized;
        },
      },
    };
  }
  const api = { createAdapters };
  root.XiaoyaSyncAdapters = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
