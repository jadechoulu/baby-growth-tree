/* 全站宝宝基础档案；领域记录与导出快照继续保留各自格式。 */
(function (root) {
  'use strict';
  const BIRTH_DATE = '2024-11-24';
  const EMPTY = Object.freeze({ name: '宝宝', birthDate: BIRTH_DATE });
  function normalize(value) {
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 30) return null;
    const day = value.birthDate;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000')) return null;
    const date = new Date(day + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
    return { name: value.name.trim(), birthDate: day };
  }
  function same(a, b) { return (a?.name || '宝宝') === (b?.name || '宝宝') && (a?.birthDate || '') === (b?.birthDate || ''); }
  function conflict() { return Object.assign(new Error('其他页面已更新宝宝资料，请关闭档案后重新打开，再确认修改。'), { code: 'PROFILE_CONFLICT' }); }
  function createStore(indexedDB) {
    let opening;
    async function open() {
      if (!opening) opening = new Promise((resolve, reject) => {
        if (!indexedDB) { reject(new Error('无法使用 IndexedDB，宝宝资料未保存。')); return; }
        let settled = false;
        const fail = error => { if (!settled) { settled = true; reject(error); } };
        const request = indexedDB.open('xiaoya-site', 1);
        request.onupgradeneeded = () => { if (settled) request.transaction.abort(); else request.result.createObjectStore('profile'); };
        request.onerror = () => fail(request.error || new Error('宝宝资料数据库未能打开。'));
        request.onblocked = () => fail(new Error('宝宝资料数据库被旧页面占用，请关闭旧页面后重试。'));
        request.onsuccess = () => { const db = request.result; if (settled) { db.close(); return; } settled = true; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
      }).catch(error => { opening = null; throw error; });
      return opening;
    }
    async function load() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('profile', 'readonly');
        const request = tx.objectStore('profile').get('default');
        tx.oncomplete = () => resolve(request.result || null);
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('宝宝资料读取失败。'));
      });
    }
    async function save(profile, expected, legacySources) {
      const next = normalize({ ...profile, birthDate: BIRTH_DATE });
      if (!next) throw new Error('请填写昵称和有效的出生日期。');
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('profile', 'readwrite');
        const store = tx.objectStore('profile');
        const request = store.get('default');
        let result, error;
        request.onsuccess = () => {
          const current = request.result;
          if (!same(current?.profile, expected) && !same(current?.profile, next)) { error = conflict(); tx.abort(); return; }
          result = { profile: next, savedAt: new Date().toISOString(), legacySources: legacySources || current?.legacySources || [] };
          store.put(result, 'default');
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(error || tx.error || new Error('宝宝资料未能保存。'));
      });
    }
    return { load, save };
  }
  async function legacyGrowth(indexedDB) {
    if (!indexedDB) throw new Error('无法读取已有宝宝资料，请允许浏览器使用 IndexedDB。');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('xiaoya-growth');
      let missing = false;
      request.onupgradeneeded = () => { missing = true; request.transaction.abort(); };
      request.onerror = () => missing ? resolve(null) : reject(request.error || new Error('已有成长档案未能读取。'));
      request.onblocked = () => reject(new Error('已有成长档案被占用，请关闭旧页面后重试。'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('profile')) { db.close(); resolve(null); return; }
        const tx = db.transaction('profile', 'readonly');
        const read = tx.objectStore('profile').get('default');
        tx.oncomplete = () => { db.close(); resolve(read.result || null); };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('已有成长档案读取失败。')); };
      };
    });
  }
  function candidates(growth, oldGrowth, english) {
    const result = [];
    for (const [label, value] of [['成长技能树', growth], ['旧版成长备份', oldGrowth], ['英语启蒙', english]]) {
      const profile = normalize(value);
      if (profile && !result.some(item => same(item.profile, profile))) result.push({ label, profile });
    }
    return result;
  }
  async function initialize(store, sources) {
    const current = await store.load();
    if (current?.profile.birthDate === BIRTH_DATE) return current;
    const options = [...(current?.legacySources || []), ...await sources()];
    if (current?.profile) options.push({ label: '此前共享档案', profile: current.profile });
    const selected = options.find(item => item.profile.birthDate === BIRTH_DATE)?.profile || EMPTY;
    try { return await store.save(selected, current?.profile || null, options); }
    catch (error) { if (error.code === 'PROFILE_CONFLICT') return store.load(); throw error; }
  }
  function createClient(env = root) {
    const store = createStore(env.indexedDB);
    let current = null;
    const listeners = new Set();
    const channel = typeof env.BroadcastChannel === 'function' ? new env.BroadcastChannel('xiaoya-baby-profile') : null;
    function accept(value) {
      const changed = !same(current?.profile, value?.profile);
      current = value;
      if (changed) for (const listener of listeners) listener({ ...(current?.profile || EMPTY) });
      return { ...(current?.profile || EMPTY) };
    }
    async function refresh() { return accept(await store.load()); }
    const onRefresh = () => { refresh().catch(error => { for (const listener of listeners) listener(null, error); }); };
    if (channel) channel.onmessage = onRefresh;
    env.addEventListener?.('focus', onRefresh);
    env.addEventListener?.('pageshow', onRefresh);
    env.document?.addEventListener('visibilitychange', () => { if (env.document.visibilityState === 'visible') onRefresh(); });
    return {
      async init() {
        return accept(await initialize(store, async () => {
          const growth = await legacyGrowth(env.indexedDB);
          const read = key => { const raw = env.localStorage.getItem(key); if (!raw) return null; try { return JSON.parse(raw)?.profile; } catch { return null; } };
          return candidates(growth, read('xiaoya-growth-v1'), read('little-leaf-english-v1'));
        }));
      },
      get() { return { ...(current?.profile || EMPTY) }; },
      async save(profile, expected = current?.profile) { const saved = await store.save(profile, expected); accept(saved); channel?.postMessage('changed'); return this.get(); },
      refresh,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
  }
  const api = { BIRTH_DATE, normalize, same, candidates, initialize, createStore, createClient };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XiaoyaBabyProfile = api;
})(typeof window === 'object' ? window : globalThis);
