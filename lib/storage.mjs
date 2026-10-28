import { validateBackup } from './model.mjs';
import { mergeGrowthSnapshots } from './cloud.mjs';

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
      const writeChanges = (next = data, previous = base) => {
        try {
          if (!previous || JSON.stringify(next.profile) !== JSON.stringify(previous.profile)) transaction.objectStore('profile').put(next.profile, 'default');
          const recordStore = transaction.objectStore('records');
          if (!previous) {
            recordStore.clear();
            for (const [id, record] of Object.entries(next.records)) recordStore.put(record, id);
          } else {
            const changedIds = new Set([...Object.keys(previous.records), ...Object.keys(next.records)]);
            for (const id of changedIds) {
              if (JSON.stringify(next.records[id]) === JSON.stringify(previous.records[id])) continue;
              if (Object.hasOwn(next.records, id)) recordStore.put(next.records[id], id);
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
        if (base) {
          // 在同一写事务读取并合并最新字段，避免旧标签回退完成时覆盖另一标签的新手记。
          const currentProfile = transaction.objectStore('profile').get('default');
          const recordStore = transaction.objectStore('records');
          const keys = recordStore.getAllKeys();
          const values = recordStore.getAll();
          const meta = transaction.objectStore('meta').get('snapshot');
          let remaining = 4;
          for (const request of [currentProfile, keys, values, meta]) request.onsuccess = () => {
            if (--remaining) return;
            try {
              const current = currentProfile.result === undefined && meta.result === undefined && !keys.result.length
                ? null
                : validateBackup({
                  version: meta.result?.version, profile: currentProfile.result,
                  records: Object.fromEntries(keys.result.map((id, index) => [id, values.result[index]])),
                }, knownIds);
              const merged = mergeGrowthSnapshots(base, data, current);
              if (merged.conflicts.length) {
                throw Object.assign(new Error('多个页面修改了相同内容，请选择要保留的记录后再保存。'), {
                  code: 'MERGE_CONFLICT', base, local: data, remote: current,
                  snapshot: merged.snapshot, conflicts: merged.conflicts, savedAt: readSavedAt(meta.result?.savedAt),
                });
              }
              writeChanges(merged.snapshot, current);
            } catch (error) {
              reject(error);
              transaction.abort();
            }
          };
          return;
        }
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

// 适配保存队列：提交后回读实际数据库，包含其他标签页已经提交的记录。
export function createLocalSaveStore(indexedDB, validIds) {
  const store = createGrowthStore(indexedDB, validIds);

  async function load() {
    const loaded = await store.load();
    if (loaded === null) return { snapshot: null, savedAt: null };
    const { savedAt, ...snapshot } = loaded;
    return { snapshot, savedAt };
  }

  async function save(data, baseSnapshot = null) {
    try {
      await store.save(data, baseSnapshot);
    } catch (error) {
      if (error.code !== 'INITIALIZATION_CONFLICT') throw error;
      const remote = await load();
      const local = { version: 1, profile: data.profile, records: data.records };
      const merged = mergeGrowthSnapshots(null, local, remote.snapshot);
      throw Object.assign(new Error('另一页面已保存本机成长记录，请确认要保留的内容。'), {
        code: 'MERGE_CONFLICT', base: null, local, remote: remote.snapshot,
        snapshot: merged.snapshot, conflicts: merged.conflicts, savedAt: remote.savedAt,
      });
    }
    return load();
  }

  return { load, save, close: () => store.close() };
}
