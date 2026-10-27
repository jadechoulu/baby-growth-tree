import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudStore, mergeGrowthSnapshots } from '../lib/cloud.mjs';

const ids = ['a', 'b', 'c'];
const day = '2026-10-27';
const timestamp = '2026-10-27T08:00:00.000Z';
const clone = value => structuredClone(value);
const snapshot = (records = {}, profile = {}) => ({
  version: 1,
  profile: { name: '小芽', birthDate: '2025-01-01', ...profile },
  records,
});
const envelope = (data, revision = data ? 'r1' : null) => ({ snapshot: clone(data), revision, savedAt: data ? timestamp : null });
const response = (status, payload) => ({ ok: status >= 200 && status < 300, status, json: async () => clone(payload) });

function makeServer(initial) {
  let data = clone(initial);
  let sequence = data ? 1 : 0;
  let revision = data ? `r${sequence}` : null;
  const requests = [];
  const current = () => envelope(data, revision);
  const update = next => { data = clone(next); revision = next ? `r${++sequence}` : null; };
  const fetcher = async (url, options) => {
    requests.push({ url, ...options, body: options.body === undefined ? undefined : JSON.parse(options.body) });
    if (url.endsWith('/api/session')) return response(200, { user: { id: 123, login: 'parent' } });
    if (url.endsWith('/api/logout')) return response(200, { ok: true });
    if (options.method === 'GET') return response(200, current());
    const body = JSON.parse(options.body);
    if (body.revision !== revision) return response(409, { code: 'VERSION_CONFLICT', ...current() });
    update(body.snapshot);
    return response(200, current());
  };
  return { fetcher, requests, current, update };
}

const createClient = fetcher => createCloudStore({ apiBase: 'https://growth.example/', validIds: ids, getToken: () => 'opaque-session', fetcher });

test('不同技能与同技能的完成、手记分别合并，不改变输入快照', () => {
  const base = snapshot({ a: { completedAt: '2026-10-25', note: '原手记' } });
  const local = snapshot({ a: { completedAt: day, note: '原手记' }, b: { completedAt: day } });
  const remote = snapshot({ a: { completedAt: '2026-10-25', note: '云端手记' }, c: { note: '另一设备' } });
  const result = mergeGrowthSnapshots(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.snapshot.records, {
    a: { completedAt: day, note: '云端手记' }, b: { completedAt: day }, c: { note: '另一设备' },
  });
  result.snapshot.records.a.note = '独立对象';
  assert.equal(base.records.a.note, '原手记');
  assert.equal(remote.records.a.note, '云端手记');
});

test('回退完成和编辑手记互不覆盖，显式删除手记仍保留对方完成日期', () => {
  const base = snapshot({ a: { completedAt: '2026-10-25', note: '原手记' } });
  assert.deepEqual(mergeGrowthSnapshots(base,
    snapshot({ a: { note: '原手记' } }),
    snapshot({ a: { completedAt: '2026-10-25', note: '新手记' } }),
  ).snapshot.records, { a: { note: '新手记' } });
  assert.deepEqual(mergeGrowthSnapshots(base,
    snapshot({ a: { completedAt: '2026-10-25' } }),
    snapshot({ a: { completedAt: day, note: '原手记' } }),
  ).snapshot.records, { a: { completedAt: day } });
  assert.deepEqual(mergeGrowthSnapshots(snapshot({ a: { completedAt: day } }), snapshot(), snapshot({ a: { completedAt: day } })).snapshot.records, {});
});

test('相同字段并发编辑保留冲突，明确选择本地或云端后才解决', () => {
  const base = snapshot({ a: { note: '原手记' } });
  const local = snapshot({ a: { note: '本地手记' } });
  const remote = snapshot({ a: { note: '云端手记' } });
  const result = mergeGrowthSnapshots(base, local, remote);
  assert.deepEqual(result.conflicts, [{ key: 'records.a.note', field: 'note', skillId: 'a', base: '原手记', local: '本地手记', remote: '云端手记' }]);
  assert.equal(result.snapshot.records.a.note, '本地手记');
  for (const choice of ['local', 'remote']) {
    const selected = mergeGrowthSnapshots(base, local, remote, { 'records.a.note': choice });
    assert.deepEqual(selected.conflicts, []);
    assert.equal(selected.snapshot.records.a.note, choice === 'local' ? '本地手记' : '云端手记');
  }
});

test('资料逐字段合并；首次迁移与已有云端资料不一致必须明确选择', () => {
  const base = snapshot();
  assert.deepEqual(mergeGrowthSnapshots(base, snapshot({}, { name: '本地昵称' }), snapshot({}, { birthDate: '2025-02-01' })).snapshot.profile, { name: '本地昵称', birthDate: '2025-02-01' });
  const migrated = mergeGrowthSnapshots(null, snapshot({ a: { note: '本机记录' } }, { name: '本机宝宝' }), snapshot({ b: { completedAt: day } }));
  assert.equal(migrated.conflicts[0].key, 'profile.name');
  assert.deepEqual(migrated.snapshot.records, { a: { note: '本机记录' }, b: { completedAt: day } });
  assert.deepEqual(mergeGrowthSnapshots(null, null, base), { snapshot: base, conflicts: [] });
  assert.deepEqual(mergeGrowthSnapshots(null, base, null), { snapshot: base, conflicts: [] });
});

test('空库读取不写入，首次保存先读取并以空版本创建', async () => {
  const server = makeServer(null);
  const client = createClient(server.fetcher);
  assert.deepEqual(await client.load(), { snapshot: null, revision: null, savedAt: null });
  assert.equal(server.requests.length, 1);
  const saved = await client.save(snapshot({ a: { completedAt: day } }));
  assert.equal(server.requests.length, 2);
  assert.deepEqual(server.requests[1].body, { snapshot: snapshot({ a: { completedAt: day } }), revision: null });
  assert.equal(saved.revision, 'r1');
  assert.equal(saved.savedAt, timestamp);
});

test('从未读云端的本机默认资料不能覆盖已有宝宝资料', async () => {
  const remote = snapshot({ a: { note: '云端保留' } });
  const server = makeServer(remote);
  const client = createClient(server.fetcher);
  await assert.rejects(client.save(snapshot({}, { name: '另一个宝宝', birthDate: '2026-01-01' })), error => {
    assert.equal(error.code, 'MERGE_CONFLICT');
    assert.deepEqual(error.remote, remote);
    assert.deepEqual(error.conflicts.map(item => item.key), ['profile.name', 'profile.birthDate']);
    return true;
  });
  assert.equal(server.requests.filter(item => item.method === 'PUT').length, 0);
  assert.deepEqual(server.current().snapshot, remote);
});

test('两个设备基于相同版本完成不同技能，409后自动合并并保留两项', async () => {
  const base = snapshot();
  const server = makeServer(base);
  const first = createClient(server.fetcher);
  const second = createClient(server.fetcher);
  await Promise.all([first.load(), second.load()]);
  await first.save(snapshot({ a: { completedAt: day } }), base);
  const saved = await second.save(snapshot({ b: { completedAt: day } }), base);
  assert.deepEqual(saved.snapshot.records, { a: { completedAt: day }, b: { completedAt: day } });
  assert.equal(saved.revision, 'r3');
  assert.equal(server.requests.filter(item => item.method === 'PUT').length, 3);
});

test('409后的同字段冲突停止保存；双方选择都可明确提交', async () => {
  for (const choice of ['local', 'remote']) {
    const base = snapshot({ a: { note: '原手记' } });
    const local = snapshot({ a: { note: '本地手记' } });
    const remote = snapshot({ a: { note: '云端手记' }, b: { completedAt: day } });
    const server = makeServer(base);
    const client = createClient(server.fetcher);
    await client.load();
    server.update(remote);
    await assert.rejects(client.save(local, base), error => {
      assert.equal(error.code, 'MERGE_CONFLICT');
      assert.equal(error.conflicts.length, 1);
      assert.deepEqual(error.base, base);
      assert.deepEqual(error.local, local);
      assert.deepEqual(error.remote, remote);
      assert.equal(error.revision, 'r2');
      return true;
    });
    assert.deepEqual(server.current().snapshot, remote);
    const saved = await client.save(local, base, { 'records.a.note': choice });
    assert.equal(saved.snapshot.records.a.note, choice === 'local' ? '本地手记' : '云端手记');
    assert.equal(saved.snapshot.records.b.completedAt, day);
  }
});

test('冲突选择后云端同字段又变化，旧选择不得静默覆盖新值', async () => {
  const base = snapshot({ a: { note: '原手记' } });
  const local = snapshot({ a: { note: '本地手记' } });
  const server = makeServer(snapshot({ a: { note: '云端第一版' } }));
  const client = createClient(server.fetcher);
  await client.load();
  await assert.rejects(client.save(local, base), { code: 'MERGE_CONFLICT' });
  server.update(snapshot({ a: { note: '云端第二版' } }));
  await assert.rejects(client.save(local, base, { 'records.a.note': 'local' }), error => {
    assert.equal(error.code, 'MERGE_CONFLICT');
    assert.equal(error.conflicts[0].remote, '云端第二版');
    return true;
  });
  assert.equal(server.current().snapshot.records.a.note, '云端第二版');
});

test('已合并内容与云端相同则无需提交，不制造空提交', async () => {
  const base = snapshot({ a: { completedAt: day } });
  const server = makeServer(base);
  const client = createClient(server.fetcher);
  await client.load();
  assert.deepEqual(await client.save(base, base), server.current());
  assert.equal(server.requests.filter(item => item.method === 'PUT').length, 0);
});

test('连续版本冲突最多重试三次，失败不会报告同步成功', async () => {
  let puts = 0;
  const client = createClient(async (url, options) => {
    if (options.method === 'GET') return response(200, envelope(snapshot(), 'r0'));
    puts += 1;
    return response(409, { code: 'VERSION_CONFLICT', ...envelope(snapshot({ b: { note: `设备${puts}` } }), `r${puts}`) });
  });
  await assert.rejects(client.save(snapshot({ a: { completedAt: day } }), snapshot()), { code: 'RETRY_EXHAUSTED' });
  assert.equal(puts, 4);
});

test('无会话或401要求重新登录，禁止未授权写入', async () => {
  let calls = 0;
  const missing = createCloudStore({ apiBase: 'https://growth.example', validIds: ids, getToken: () => null, fetcher: async () => { calls += 1; } });
  await assert.rejects(missing.load(), { code: 'AUTH_REQUIRED' });
  assert.equal(calls, 0);
  const expired = createClient(async () => response(401, { error: 'expired' }));
  await assert.rejects(expired.save(snapshot()), { code: 'AUTH_REQUIRED' });
  await assert.rejects(expired.session(), { code: 'AUTH_REQUIRED' });
});

test('网络失败、服务端失败和不一致确认均不能算保存成功', async () => {
  for (const [failure, code] of [
    [() => { throw new TypeError('offline'); }, 'NETWORK_ERROR'],
    [() => response(503, { error: 'unavailable' }), 'HTTP_ERROR'],
    [() => response(200, envelope(snapshot({ b: { note: '错误确认' } }), 'r2')), 'INVALID_RESPONSE'],
  ]) {
    const client = createClient(async (url, options) => options.method === 'GET' ? response(200, envelope(snapshot())) : failure());
    await assert.rejects(client.save(snapshot({ a: { completedAt: day } }), snapshot()), { code });
  }
});

test('云端跨边界校验拒绝未知技能、非法字段和缺失版本', async () => {
  for (const value of [
    envelope(snapshot({ unknown: { completedAt: day } })),
    envelope(snapshot({ a: { completedAt: '2026-02-30' } })),
    { ...envelope(snapshot()), revision: null },
    { ...envelope(snapshot()), savedAt: 'not-a-date' },
    { revision: null, savedAt: null },
  ]) {
    await assert.rejects(createClient(async () => response(200, value)).load(), { code: 'INVALID_RESPONSE' });
  }
  const client = createClient(async () => response(200, envelope(null)));
  await assert.rejects(client.save(snapshot({ unknown: { note: '非法本地输入' } })), /未知技能/);
});

test('身份读取与注销使用授权头及独立端点，不携带浏览器Cookie', async () => {
  const server = makeServer(snapshot());
  const client = createClient(server.fetcher);
  assert.deepEqual(await client.session(), { user: { id: 123, login: 'parent' } });
  await client.logout();
  assert.equal(server.requests[0].url, 'https://growth.example/api/session');
  assert.equal(server.requests[1].url, 'https://growth.example/api/logout');
  assert.equal(server.requests[1].method, 'POST');
  for (const request of server.requests) {
    assert.equal(request.credentials, 'omit');
    assert.equal(request.headers.Authorization, 'Bearer opaque-session');
    assert.equal(request.url.includes('opaque-session'), false);
  }
  await assert.rejects(createClient(async () => response(200, { user: { id: '123', login: 'parent' } })).session(), { code: 'INVALID_RESPONSE' });
});
