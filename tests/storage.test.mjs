import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE, toggleRecord } from '../lib/model.mjs';
import { STORAGE_KEY, VIEW_STORAGE_KEY, createGrowthStore, readGrowthSnapshot } from '../lib/storage.mjs';

const savedAt = '2026-10-27T08:30:00.000Z';
const profile = { ...DEFAULT_PROFILE, name: '小芽' };
const validIds = ['a', 'b'];

test('JSON 备份继续复用完成、回退、手记和宝宝资料', () => {
  const records = toggleRecord({ a: { note: '今天终于自己站起来了' } }, 'a', '2026-10-27');
  const raw = JSON.stringify({ version: 1, profile, records, savedAt });
  const reloaded = readGrowthSnapshot(raw, validIds);
  assert.deepEqual(reloaded, { version: 1, profile, records, savedAt });
  const reverted = toggleRecord(reloaded.records, 'a', '2026-10-27');
  const nextProfile = { name: '小小芽', birthDate: '2024-11-25' };
  const revertedRaw = JSON.stringify({ version: 1, profile: nextProfile, records: reverted });
  assert.deepEqual(readGrowthSnapshot(revertedRaw, validIds), {
    version: 1, profile: nextProfile, records: { a: { note: '今天终于自己站起来了' } }, savedAt: null,
  });
});

test('旧 v1 记录和迁移 key 保持兼容', () => {
  assert.equal(STORAGE_KEY, 'xiaoya-growth-v1');
  assert.equal(VIEW_STORAGE_KEY, 'xiaoya-growth-view-v1');
  const records = { a: { completedAt: '2026-10-27', note: '第一次' } };
  const raw = JSON.stringify({ version: 1, profile, records });
  assert.deepEqual(readGrowthSnapshot(raw, validIds), { version: 1, profile, records, savedAt: null });
});

test('保存时间只接受有效的 ISO 时间，异常元数据不丢弃正常记录', () => {
  const snapshot = { version: 1, profile, records: { a: { note: '原笔记' } } };
  for (const value of [undefined, null, 123, '昨天', '2026-10-27', '2026-02-30T08:30:00.000Z', '2026-13-27T08:30:00Z']) {
    const result = readGrowthSnapshot(JSON.stringify({ ...snapshot, savedAt: value }), validIds);
    assert.equal(result.savedAt, null);
    assert.deepEqual(result.records, snapshot.records);
  }
  for (const value of [savedAt, '2026-10-27T08:30:00Z', '2026-10-27T16:30:00+08:00']) {
    assert.equal(readGrowthSnapshot(JSON.stringify({ ...snapshot, savedAt: value }), validIds).savedAt, value);
  }
});

test('坏 JSON 和未知技能校验失败时保留调用者持有的原文', () => {
  for (const raw of ['{无法解析', JSON.stringify({ version: 1, profile, records: { missing: { completedAt: '2026-10-27' } } })]) {
    const original = raw;
    assert.throws(() => readGrowthSnapshot(raw, validIds));
    assert.equal(raw, original);
  }
});

test('IndexedDB 不可用时明确失败，不把其他存储当作保存成功', async () => {
  const store = createGrowthStore(undefined, validIds);
  await assert.rejects(store.load(), /IndexedDB/);
  await assert.rejects(store.save({ profile, records: {} }), /IndexedDB/);
});

test('打开数据库失败或被阻塞时明确拒绝，下一次操作可重试', async () => {
  const requests = [];
  const factory = { open(name, version) { assert.equal(name, 'xiaoya-growth'); assert.equal(version, 1); const request = {}; requests.push(request); return request; } };
  const store = createGrowthStore(factory, validIds);
  const failed = store.load();
  const denied = new Error('存储被禁用');
  requests[0].error = denied;
  requests[0].onerror();
  await assert.rejects(failed, error => error === denied);
  const blocked = store.load();
  assert.equal(requests.length, 2);
  requests[1].onblocked();
  await assert.rejects(blocked, /其他页面占用/);
});

test('打开数据库同步抛错也能再次重试', async () => {
  let attempts = 0;
  const denied = new Error('禁止访问');
  const store = createGrowthStore({ open() { attempts += 1; throw denied; } }, validIds);
  await assert.rejects(store.load(), error => error === denied);
  await assert.rejects(store.load(), error => error === denied);
  assert.equal(attempts, 2);
});

// 这里只控制 IndexedDB 的事件边界；实际数据库读写和刷新由浏览器验收。
function controlledDatabase(entries = {}, manualReads = false) {
  const transactions = [];
  const connection = {
    close() {},
    transaction(names, mode) {
      const operations = [];
      const tx = {
        names, mode, operations,
        objectStore(name) {
          assert.ok(names.includes(name));
          return {
            put(value, key) { operations.push({ name, value, key, operation: 'put' }); },
            delete(key) { operations.push({ name, key, operation: 'delete' }); },
            clear() { operations.push({ name, operation: 'clear' }); },
            get(key) {
              const request = { result: undefined };
              const fulfill = () => { request.result = entries[name]?.get(key); request.onsuccess?.(); };
              operations.push({ name, key, operation: 'get', request, fulfill });
              if (!manualReads) queueMicrotask(fulfill);
              return request;
            },
            count() {
              const request = { result: 0 };
              const fulfill = () => { request.result = entries[name]?.size || 0; request.onsuccess?.(); };
              operations.push({ name, operation: 'count', request, fulfill });
              if (!manualReads) queueMicrotask(fulfill);
              return request;
            },
            getAllKeys() { const request = { result: [] }; operations.push({ name, operation: 'getAllKeys', request }); return request; },
            getAll() { const request = { result: [] }; operations.push({ name, operation: 'getAll', request }); return request; },
          };
        },
        completeReads() { for (const operation of operations) operation.fulfill?.(); },
        abort() { this.onabort(); },
      };
      transactions.push(tx);
      return tx;
    },
  };
  const factory = {
    open() {
      const request = { result: connection };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  return { store: createGrowthStore(factory, validIds), transactions, connection, factory };
}

test('保存仅在同一个写事务提交后成功，预留的 customContent 不会被清空', async () => {
  const { store, transactions } = controlledDatabase();
  let resolved = false;
  const saving = store.save({ profile, records: { a: { completedAt: '2026-10-27', note: '自己做到了' } } }).then(value => { resolved = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, false);
  const tx = transactions[0];
  assert.equal(tx.mode, 'readwrite');
  assert.deepEqual(tx.names, ['profile', 'records', 'meta']);
  assert.deepEqual(tx.operations.find(item => item.name === 'records' && item.operation === 'put'), {
    name: 'records', operation: 'put', key: 'a', value: { completedAt: '2026-10-27', note: '自己做到了' },
  });
  assert.equal(tx.operations.some(item => item.name === 'customContent'), false);
  tx.oncomplete();
  const timestamp = await saving;
  assert.equal(Number.isFinite(Date.parse(timestamp)), true);
  assert.equal(tx.operations.find(item => item.name === 'meta' && item.operation === 'put').value.savedAt, timestamp);
});

test('事务中止或出错都拒绝保存，不能提前显示已保存', async () => {
  for (const event of ['onabort', 'onerror']) {
    const { store, transactions } = controlledDatabase();
    const saving = store.save({ profile, records: {} });
    await new Promise(resolve => setImmediate(resolve));
    const denied = new Error('事务提交失败');
    const tx = transactions[0];
    tx.error = denied;
    tx[event]({ target: tx });
    await assert.rejects(saving, error => error === denied);
  }
});

test('读取在同一个事务结束后统一校验，空数据库返回 null', async () => {
  const { store, transactions } = controlledDatabase();
  const loading = store.load();
  await new Promise(resolve => setImmediate(resolve));
  const tx = transactions[0];
  assert.equal(tx.mode, 'readonly');
  tx.oncomplete();
  assert.equal(await loading, null);

  const reloading = store.load();
  await new Promise(resolve => setImmediate(resolve));
  const next = transactions[1];
  for (const operation of next.operations) {
    if (operation.name === 'profile') operation.request.result = profile;
    if (operation.name === 'meta') operation.request.result = { version: 1, savedAt };
    if (operation.operation === 'getAllKeys') operation.request.result = ['a'];
    if (operation.operation === 'getAll') operation.request.result = [{ completedAt: '2026-10-27', note: '记录' }];
  }
  next.oncomplete();
  assert.deepEqual(await reloading, { version: 1, profile, records: { a: { completedAt: '2026-10-27', note: '记录' } }, savedAt });
});

function commitWrites(transaction, entries) {
  for (const operation of transaction.operations) {
    const store = entries[operation.name];
    if (operation.operation === 'clear') store.clear();
    if (operation.operation === 'put') store.set(operation.key, structuredClone(operation.value));
    if (operation.operation === 'delete') store.delete(operation.key);
  }
  transaction.oncomplete();
}

test('两份相同基线分别修改不同技能时，增量事务保留彼此记录和远端资料', async () => {
  const { store, transactions } = controlledDatabase();
  const base = { profile, records: {} };
  const remoteProfile = { ...profile, name: '另一个标签更新的昵称' };
  const entries = {
    profile: new Map([['default', remoteProfile]]),
    records: new Map(), meta: new Map(),
    customContent: new Map([['toy', { title: '玩具候选' }]]),
  };
  const first = store.save({ profile, records: { a: { completedAt: '2026-10-27', note: '第一个标签的记录' } } }, base);
  await new Promise(resolve => setImmediate(resolve));
  commitWrites(transactions[0], entries);
  await first;
  const second = store.save({ profile, records: { b: { completedAt: '2026-10-27' } } }, base);
  await new Promise(resolve => setImmediate(resolve));
  commitWrites(transactions[1], entries);
  await second;
  assert.deepEqual(Object.fromEntries(entries.records), {
    a: { completedAt: '2026-10-27', note: '第一个标签的记录' },
    b: { completedAt: '2026-10-27' },
  });
  assert.deepEqual(entries.profile.get('default'), remoteProfile);
  assert.deepEqual(entries.customContent.get('toy'), { title: '玩具候选' });
  for (const tx of transactions) {
    assert.equal(tx.operations.some(operation => operation.operation === 'clear'), false);
    assert.equal(tx.operations.some(operation => operation.name === 'profile'), false);
  }
});

test('增量回退仅删除本地明确移除的技能，保留其他标签新增的记录', async () => {
  const { store, transactions } = controlledDatabase();
  const entries = {
    profile: new Map([['default', profile]]),
    records: new Map([['a', { completedAt: '2026-10-27' }], ['b', { completedAt: '2026-10-26', note: '另一个标签新增' }]]),
    meta: new Map(),
  };
  const saving = store.save({ profile, records: {} }, { profile, records: { a: { completedAt: '2026-10-27' } } });
  await new Promise(resolve => setImmediate(resolve));
  const tx = transactions[0];
  assert.deepEqual(tx.operations.filter(operation => operation.name === 'records'), [{ name: 'records', key: 'a', operation: 'delete' }]);
  commitWrites(tx, entries);
  await saving;
  assert.deepEqual(Object.fromEntries(entries.records), { b: { completedAt: '2026-10-26', note: '另一个标签新增' } });
});

test('增量写入只修改真正变化的资料和规范化后变化的技能', async () => {
  const { store, transactions } = controlledDatabase();
  const base = { profile, records: { a: { completedAt: '2026-10-27', note: '保留原文' }, b: { note: '旧手记' } } };
  const nextProfile = { ...profile, name: '新昵称' };
  const saving = store.save({ profile: nextProfile, records: { a: { note: '保留原文', completedAt: '2026-10-27', extra: true }, b: { note: '新手记' } } }, base);
  await new Promise(resolve => setImmediate(resolve));
  const tx = transactions[0];
  assert.deepEqual(tx.operations.filter(operation => operation.name === 'profile'), [{ name: 'profile', key: 'default', value: nextProfile, operation: 'put' }]);
  assert.deepEqual(tx.operations.filter(operation => operation.name === 'records'), [{ name: 'records', key: 'b', value: { note: '新手记' }, operation: 'put' }]);
  tx.oncomplete();
  await saving;
});

test('首次双标签同时初始化时，后提交的事务拒绝覆盖已提交的成长记录', async () => {
  const entries = {
    profile: new Map(), records: new Map(), meta: new Map(),
    customContent: new Map([['toy', { title: '玩具候选' }]]),
  };
  const { store, factory, transactions } = controlledDatabase(entries, true);
  const secondStore = createGrowthStore(factory, validIds);
  const first = store.save({ profile, records: { a: { completedAt: '2026-10-27' } } });
  const second = secondStore.save({ profile: { ...profile, name: '第二个标签' }, records: { b: { completedAt: '2026-10-27' } } });
  const rejected = assert.rejects(second, error => error.code === 'INITIALIZATION_CONFLICT');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(transactions.length, 2);
  // IndexedDB 对相同 store 的写事务串行执行；第二个事务的检查在第一个提交后读取。
  transactions[0].completeReads();
  commitWrites(transactions[0], entries);
  await first;
  transactions[1].completeReads();
  await rejected;
  assert.equal(transactions[1].operations.some(operation => ['put', 'clear', 'delete'].includes(operation.operation)), false);
  assert.deepEqual(Object.fromEntries(entries.records), { a: { completedAt: '2026-10-27' } });
  assert.deepEqual(entries.profile.get('default'), profile);
  assert.deepEqual(entries.customContent.get('toy'), { title: '玩具候选' });
});

test('缺少元数据但存在资料或技能记录时，也拒绝用初始化覆盖它们', async () => {
  for (const existing of ['profile', 'records']) {
    const entries = { profile: new Map(), records: new Map(), meta: new Map() };
    entries[existing].set(existing === 'profile' ? 'default' : 'a', existing === 'profile' ? profile : { note: '仍需恢复的旧记录' });
    const { store, transactions } = controlledDatabase(entries);
    const saving = store.save({ profile, records: {} });
    await assert.rejects(saving, error => error.code === 'INITIALIZATION_CONFLICT');
    assert.equal(transactions[0].operations.some(operation => ['put', 'clear', 'delete'].includes(operation.operation)), false);
    assert.equal(entries[existing].size, 1);
  }
});
