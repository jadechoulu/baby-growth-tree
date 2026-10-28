import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { normalize, same, candidates, initialize, createStore } = createRequire(import.meta.url)('../shared/baby-profile.js');
const a = { name: '测试甲', birthDate: '2025-01-10' };
const b = { name: '测试乙', birthDate: '2025-02-11' };

test('基础档案只读取昵称生日，专属英语字段不进入共享数据', () => {
  assert.deepEqual(normalize({ ...a, vocabulary: 80, mode: 'audio' }), a);
  assert.equal(normalize({ ...a, birthDate: '2025-02-30' }), null);
  assert.equal(normalize({ name: '', birthDate: a.birthDate }), null);
  assert.equal(normalize({ ...a, birthDate: '' }), null);
  assert.ok(same(null, { name: '宝宝', birthDate: '' }));
});

test('迁移收集成长、旧版和英语档案，相同资料去重，不修改原对象', () => {
  const english = { ...b, vocabulary: 70 };
  assert.deepEqual(candidates(a, { ...a }, english), [{ label: '成长技能树', profile: a }, { label: '英语启蒙', profile: b }]);
  assert.equal(english.vocabulary, 70);
});

test('已有共享档案时直接复用，不再把旧分页资料覆盖回来', async () => {
  const current = { profile: a };
  const result = await initialize({ load: async () => current }, () => assert.fail('不应再次迁移'), () => assert.fail('不应选择'));
  assert.deepEqual(result, current);
});

test('只有一份旧档案时自动迁移，并留存迁移来源', async () => {
  const sources = candidates(null, null, a);
  let saved;
  const result = await initialize({ load: async () => null, save: async (...args) => { saved = args; return { profile: args[0] }; } }, async () => sources, () => assert.fail('不应选择'));
  assert.deepEqual(result.profile, a);
  assert.deepEqual(saved, [a, null, sources]);
});

test('旧资料冲突必须经过选择，取消不写入，选择保留所有来源', async () => {
  const sources = candidates(a, null, b);
  let writes = 0;
  const store = { load: async () => null, save: async (profile, expected, originals) => { writes++; assert.deepEqual(originals, sources); return { profile }; } };
  assert.equal(await initialize(store, async () => sources, async () => null), null);
  assert.equal(writes, 0);
  assert.deepEqual((await initialize(store, async () => sources, async () => b)).profile, b);
  assert.equal(writes, 1);
});

test('两个页面同时首次迁移时，以已成功提交的共享档案为准', async () => {
  let reads = 0;
  const store = { load: async () => ++reads === 1 ? null : { profile: b }, save: async () => { throw Object.assign(new Error('并发'), { code: 'PROFILE_CONFLICT' }); } };
  assert.deepEqual(await initialize(store, async () => candidates(a), () => assert.fail()), { profile: b });
});

test('读取与保存失败必须返回错误，不能当作没有资料或迁移成功', async () => {
  const error = new Error('禁止写入');
  await assert.rejects(initialize({ load: async () => { throw error; } }, () => assert.fail(), () => assert.fail()), value => value === error);
  await assert.rejects(initialize({ load: async () => null, save: async () => { throw error; } }, async () => candidates(a), () => assert.fail()), value => value === error);
  await assert.rejects(createStore(undefined).load(), /IndexedDB/);
});

function database(initial) {
  let row = initial;
  const db = { transaction() {
    const tx = { error: null, abort() { queueMicrotask(() => tx.onabort()); }, objectStore() { return {
      get() { const request = {}; queueMicrotask(() => { request.result = row; request.onsuccess?.(); if (!tx.aborted) queueMicrotask(() => tx.oncomplete?.()); }); return request; },
      put(value) { row = structuredClone(value); },
    }; } };
    const abort = tx.abort; tx.abort = () => { tx.aborted = true; abort(); };
    return tx;
  } };
  return { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; }, row: () => row };
}

test('共享写入保留迁移来源，旧表单不能覆盖另一页的新昵称生日', async () => {
  const originals = candidates(a, null, b);
  const fake = database({ profile: a, legacySources: originals });
  const store = createStore(fake);
  await store.save(b, a);
  assert.deepEqual((await store.load()).profile, b);
  await assert.rejects(store.save({ ...a, name: '旧表单' }, a), error => error.code === 'PROFILE_CONFLICT');
  assert.deepEqual(fake.row().profile, b);
  assert.deepEqual(fake.row().legacySources, originals);
});

test('两分类客户端通知后共同回读已提交资料，不必刷新页面', async () => {
  const { createClient } = createRequire(import.meta.url)('../shared/baby-profile.js');
  const channels = [];
  class Channel {
    constructor() { channels.push(this); }
    postMessage() { for (const other of channels) if (other !== this) other.onmessage?.(); }
  }
  const fake = database({ profile: a });
  const env = { indexedDB: fake, BroadcastChannel: Channel };
  const growth = createClient(env), english = createClient(env);
  await growth.init(); await english.init();
  const updates = []; english.subscribe(value => updates.push(value));
  await growth.save(b, a);
  await new Promise(setImmediate);
  assert.deepEqual(english.get(), b);
  assert.deepEqual(updates, [b]);
});

test('没有 BroadcastChannel 时，重新聚焦页面也会读到另一分类的新资料', async () => {
  const { createClient } = createRequire(import.meta.url)('../shared/baby-profile.js');
  const fake = database({ profile: a });
  const events = {};
  const client = createClient({ indexedDB: fake, addEventListener: (name, callback) => { events[name] = callback; } });
  await client.init();
  await createStore(fake).save(b, a);
  assert.deepEqual(client.get(), a);
  events.focus(); await new Promise(setImmediate);
  assert.deepEqual(client.get(), b);
});
