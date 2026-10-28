import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { BIRTH_DATE, normalize, same, candidates, initialize, createStore } = createRequire(import.meta.url)('../shared/baby-profile.js');
const a = { name: '测试甲', birthDate: BIRTH_DATE };
const b = { name: '测试乙', birthDate: BIRTH_DATE };

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

test('旧资料不一致时自动选指定生日，不需要选择，原始来源仍保留', async () => {
  const old = { name: '其他档案', birthDate: '2025-01-10' };
  const sources = candidates(old, null, a);
  let saved;
  const result = await initialize({ load: async () => null, save: async (...args) => { saved = args; return { profile: args[0] }; } }, async () => sources);
  assert.deepEqual(result.profile, a);
  assert.deepEqual(saved, [a, null, sources]);
});

test('全新浏览器默认建立指定生日，已有错误生日自动改用指定档案', async () => {
  const writes = [];
  const old = { name: '其他档案', birthDate: '2025-01-10' };
  const store = { load: async () => ({ profile: old }), save: async (...args) => { writes.push(args); return { profile: args[0] }; } };
  assert.deepEqual((await initialize(store, async () => candidates(a))).profile, a);
  assert.deepEqual(writes[0][1], old);
  assert.deepEqual(writes[0][2].at(-1).profile, old);
  const fresh = { load: async () => null, save: async profile => ({ profile }) };
  assert.deepEqual((await initialize(fresh, async () => [])).profile, { name: '宝宝', birthDate: BIRTH_DATE });
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


test('保存昵称或导入旧资料时，调用方不能更换固定生日', async () => {
  const fake = database({ profile: a });
  const saved = await createStore(fake).save({ ...a, birthDate: '2025-03-01' }, a);
  assert.equal(saved.profile.birthDate, '2024-11-24');
});
