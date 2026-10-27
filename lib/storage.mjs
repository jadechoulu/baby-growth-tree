import { validateBackup } from './model.mjs';

export const STORAGE_KEY = 'xiaoya-growth-v1';
export const VIEW_STORAGE_KEY = 'xiaoya-growth-view-v1';

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function readSavedAt(value) {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const day = value.slice(0, 10);
  // Date.parse 会把 2 月 30 日自动进位，保存时间只接受真实日历日期。
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return null;
  return value;
}

export function readGrowthSnapshot(raw, validIds) {
  const value = JSON.parse(raw);
  const data = validateBackup(value, validIds);
  return { ...data, savedAt: readSavedAt(value.savedAt) };
}

export function createGrowthStore(indexedDB, validIds) {
  const knownIds = new Set(validIds);
  let database = null;
  let opening = null;
  let cancelOpening = null;

  function openDatabase() {
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    if (!indexedDB || typeof indexedDB.open !== 'function') return Promise.reject(new Error('当前浏览器无法使用 IndexedDB 本地数据库。'));
    const attempt = new Promise((resolve, reject) => {
      let settled = false;
      let request;
      const fail = error => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      cancelOpening = () => fail(new Error('本地数据库连接已关闭，请重试。'));
      try { request = indexedDB.open('xiaoya-growth', 1); }
      catch (error) { fail(error); return; }
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        try {
          for (const name of ['profile', 'records', 'customContent', 'meta']) {
            if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
          }
        } catch (error) {
          fail(error);
          request.transaction?.abort();
        }
      };
      request.onblocked = () => fail(new Error('本地数据库被其他页面占用，请关闭旧页面后重试。'));
      request.onerror = () => fail(request.error || new Error('本地数据库未能打开。'));
      request.onsuccess = () => {
        const connection = request.result;
        if (settled) { connection.close(); return; }
        settled = true;
        database = connection;
        connection.onversionchange = () => {
          connection.close();
          if (database === connection) database = null;
        };
        connection.onclose = () => { if (database === connection) database = null; };
        resolve(connection);
      };
    });
    opening = attempt;
    const clearOpening = () => {
      if (opening === attempt) { opening = null; cancelOpening = null; }
    };
    attempt.then(clearOpening, clearOpening);
    return attempt;
  }

  async function load() {
    const connection = await openDatabase();
    return new Promise((resolve, reject) => {
      let transaction;
      try { transaction = connection.transaction(['profile', 'records', 'meta'], 'readonly'); }
      catch (error) { reject(error); return; }
      transaction.onerror = event => reject(transaction.error || event.target?.error || new Error('本地数据库读取失败。'));
      transaction.onabort = () => reject(transaction.error || new Error('本地数据库读取已中止。'));
      try {
        const profile = transaction.objectStore('profile').get('default');
        const recordStore = transaction.objectStore('records');
        const keys = recordStore.getAllKeys();
        const values = recordStore.getAll();
        const meta = transaction.objectStore('meta').get('snapshot');
        transaction.oncomplete = () => {
          try {
            if (profile.result === undefined && meta.result === undefined && !keys.result.length) { resolve(null); return; }
            const records = Object.fromEntries(keys.result.map((id, index) => [id, values.result[index]]));
            const data = validateBackup({ version: meta.result?.version, profile: profile.result, records }, knownIds);
            resolve({ ...data, savedAt: readSavedAt(meta.result?.savedAt) });
          } catch (error) { reject(error); }
        };
      } catch (error) {
        reject(error);
        transaction.abort();
      }
    });
  }

  async function save({ profile, records }, baseSnapshot = null) {
    const data = validateBackup({ version: 1, profile, records }, knownIds);
    const base = baseSnapshot === null ? null : validateBackup({ version: 1, profile: baseSnapshot.profile, records: baseSnapshot.records }, knownIds);
    const connection = await openDatabase();
    const savedAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      let transaction;
      try { transaction = connection.transaction(['profile', 'records', 'meta'], 'readwrite'); }
      catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(savedAt);
      transaction.onerror = event => reject(transaction.error || event.target?.error || new Error('成长记录未能写入本地数据库。'));
      transaction.onabort = () => reject(transaction.error || new Error('成长记录保存已中止。'));
      const writeChanges = () => {
        try {
          if (!base || JSON.stringify(data.profile) !== JSON.stringify(base.profile)) transaction.objectStore('profile').put(data.profile, 'default');
          const recordStore = transaction.objectStore('records');
          if (!base) {
            recordStore.clear();
            for (const [id, record] of Object.entries(data.records)) recordStore.put(record, id);
          } else {
            // 只提交本标签修改，保留其他标签在同一基线后新增或回退的记录。
            const changedIds = new Set([...Object.keys(base.records), ...Object.keys(data.records)]);
            for (const id of changedIds) {
              if (JSON.stringify(data.records[id]) === JSON.stringify(base.records[id])) continue;
              if (Object.hasOwn(data.records, id)) recordStore.put(data.records[id], id);
              else recordStore.delete(id);
            }
          }
          transaction.objectStore('meta').put({ version: 1, savedAt }, 'snapshot');
        } catch (error) {
          reject(error);
          transaction.abort();
        }
      };
      try {
        if (base) { writeChanges(); return; }
        // 与初始化写入处于同一事务，第二个首次打开的标签不能覆盖先提交的数据。
        const checks = [transaction.objectStore('meta').get('snapshot'), transaction.objectStore('profile').count(), transaction.objectStore('records').count()];
        let remaining = checks.length;
        for (const request of checks) request.onsuccess = () => {
          if (--remaining) return;
          if (checks[0].result !== undefined || checks[1].result || checks[2].result) {
            const error = new Error('本机已有成长记录，请重新读取后再保存。');
            error.code = 'INITIALIZATION_CONFLICT';
            reject(error);
            transaction.abort();
            return;
          }
          writeChanges();
        };
      } catch (error) {
        reject(error);
        transaction.abort();
      }
    });
  }

  function close() {
    cancelOpening?.();
    database?.close();
    database = null;
  }

  return { load, save, close };
}
