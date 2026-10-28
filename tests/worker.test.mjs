import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthState, createWorker } from '../worker/index.mjs';

const ORIGIN = 'https://example.github.io';
const WORKER = 'https://growth.example.workers.dev';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const CLIENT_NONCE = 'r'.repeat(43);
const snapshot = () => ({ version: 1, profile: { name: '测试宝宝', birthDate: '2023-01-01' }, records: { 'c-short-memory': { completedAt: '2026-01-02', note: '测试手记' } } });

class MemorySql {
  rows = new Map();
  exec(sql, ...args) {
    let result = [];
    if (sql.startsWith('CREATE TABLE')) return { toArray: () => [] };
    if (sql === 'DELETE FROM auth_items WHERE expires_at <= ?') {
      for (const [key, value] of this.rows) if (value.expiresAt <= args[0]) this.rows.delete(key);
    } else if (sql.startsWith('INSERT OR REPLACE')) this.rows.set(`${args[0]}:${args[1]}`, { payload: args[2], expiresAt: args[3] });
    else if (sql.startsWith('SELECT payload')) {
      const row = this.rows.get(`${args[0]}:${args[1]}`);
      if (row) result = [{ payload: row.payload }];
    } else if (sql === 'DELETE FROM auth_items WHERE kind = ? AND key = ?') this.rows.delete(`${args[0]}:${args[1]}`);
    else throw new Error(`Unexpected SQL: ${sql}`);
    return { toArray: () => result };
  }
}

function setup(overrides = {}) {
  let time = Date.parse('2026-01-02T03:04:05Z');
  const sql = new MemorySql();
  const object = new AuthState({ storage: { sql, transactionSync: (callback) => callback() } });
  const env = {
    FRONTEND_URL: `${ORIGIN}/baby/`, WORKER_URL: WORKER,
    GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'fake-client-secret-NOT-A-CREDENTIAL',
    GITHUB_DATA_TOKEN: 'fake-data-token-NOT-A-CREDENTIAL', GITHUB_ALLOWED_USER_ID: '42',
    GITHUB_DATA_REPO: 'example/private-records', GITHUB_DATA_BRANCH: 'main', GITHUB_DATA_PATH: 'records/xiaoya.json',
    AUTH_STATE: { idFromName: (name) => name, get: () => object },
    ...overrides,
  };
  const calls = [];
  let identity = { id: 42, login: 'example' };
  let privateRepo = true;
  let file = null;
  let conflict = null;
  let networkFailure = false;
  async function network(url, options = {}) {
    calls.push({ url, options });
    if (networkFailure) throw new Error('upstream included fake-data-token-NOT-A-CREDENTIAL');
    if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'fake-oauth-token-NOT-A-CREDENTIAL' });
    if (url === 'https://api.github.com/user') return Response.json(identity);
    if (url === 'https://api.github.com/repos/example/private-records') return Response.json({ private: privateRepo });
    if (url.startsWith('https://api.github.com/repos/example/private-records/contents/records/xiaoya.json')) {
      if (options.method === 'PUT') {
        if (conflict) return Response.json({ message: 'fake upstream secret must not be returned' }, { status: conflict });
        const incoming = JSON.parse(options.body);
        if ((file && incoming.sha !== file.sha) || (!file && incoming.sha)) return Response.json({}, { status: 409 });
        file = { sha: SHA_B, raw: JSON.parse(Buffer.from(incoming.content, 'base64').toString('utf8')) };
        return Response.json({ content: { sha: file.sha } }, { status: 201 });
      }
      return file ? Response.json({ sha: file.sha, encoding: 'base64', content: Buffer.from(JSON.stringify(file.raw)).toString('base64') }) : Response.json({}, { status: 404 });
    }
    throw new Error(`Unexpected request: ${url}`);
  }
  const worker = createWorker({ fetch: network, now: () => time });
  const request = (path, options = {}) => worker.fetch(new Request(`${WORKER}${path}`, options), env);
  const api = (path, token, options = {}) => request(path, { ...options, headers: { Origin: ORIGIN, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  async function begin() {
    const response = await request(`/auth/login?request=${CLIENT_NONCE}&redirect=https://evil.example`);
    const cookie = response.headers.get('Set-Cookie').split(';')[0];
    const state = new URL(response.headers.get('Location')).searchParams.get('state');
    return { response, cookie, state };
  }
  async function finish(flow, extra = '') {
    return request(`/auth/callback?code=test-authorization-code&state=${flow.state}${extra}`, { headers: { Cookie: flow.cookie } });
  }
  async function login() {
    const flow = await begin();
    const response = await finish(flow);
    const html = await response.text();
    assert.equal(response.status, 200, html);
    const token = /"token":"([A-Za-z0-9_-]{43})"/.exec(html)?.[1];
    assert.ok(token);
    return token;
  }
  return { env, sql, calls, request, api, begin, finish, login, advance: (ms) => { time += ms; }, identity: (value) => { identity = value; }, private: (value) => { privateRepo = value; }, file: (raw, sha = SHA_A) => { file = raw === null ? null : { raw, sha }; }, cloudFile: () => file, conflict: (value) => { conflict = value; }, failNetwork: () => { networkFailure = true; } };
}

test('未配置、未登录及其他来源不会访问 GitHub 私有数据', async () => {
  const unconfigured = setup({ GITHUB_CLIENT_SECRET: '' });
  assert.equal((await unconfigured.api('/api/records')).status, 503);
  const app = setup();
  const unauthenticated = await app.api('/api/records');
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get('Cache-Control'), 'no-store');
  const foreign = await app.api('/api/records', null, { headers: { Origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await app.request('/api/records')).status, 403);
  assert.equal(app.calls.length, 0);
});

test('OAuth state 随机绑定 cookie，固定回调，最小身份 scope，消息不向任意 redirect 发送', async () => {
  const app = setup();
  assert.equal((await app.request(`/auth/login?request=${crypto.randomUUID()}`)).status, 302);
  assert.equal((await app.request('/auth/login?request=too-short')).status, 400);
  const one = await app.begin();
  const two = await app.begin();
  assert.notEqual(one.state, two.state);
  const authorize = new URL(one.response.headers.get('Location'));
  assert.equal(authorize.origin, 'https://github.com');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${WORKER}/auth/callback`);
  assert.equal(authorize.searchParams.get('scope'), 'read:user');
  assert.match(one.response.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const response = await app.finish(one);
  const html = await response.text();
  assert.match(html, new RegExp(ORIGIN));
  assert.doesNotMatch(html, /evil\.example|fake-oauth-token|fake-data-token|fake-client-secret/);
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
  const stored = [...app.sql.rows.entries()].filter(([key]) => key.startsWith('session:'));
  assert.equal(stored.length, 1);
  const token = /"token":"([A-Za-z0-9_-]{43})"/.exec(html)[1];
  assert.ok(!JSON.stringify(stored).includes(token));
});

test('state 不能重放或跨浏览器交换，失败不交换 code', async () => {
  const app = setup();
  const flow = await app.begin();
  assert.equal((await app.finish(flow)).status, 200);
  const exchanges = app.calls.filter((call) => call.url.includes('access_token')).length;
  assert.equal((await app.finish(flow)).status, 400);
  assert.equal(app.calls.filter((call) => call.url.includes('access_token')).length, exchanges);
  const other = await app.begin();
  const result = await app.request(`/auth/callback?code=test&state=${other.state}`, { headers: { Cookie: `${other.cookie}changed` } });
  assert.equal(result.status, 400);
  assert.equal(app.calls.filter((call) => call.url.includes('access_token')).length, exchanges);
  assert.equal((await app.finish(other)).status, 400);
});

test('过期和并发重复 OAuth 回调只有一份 state 可用', async () => {
  const app = setup();
  const flow = await app.begin();
  app.advance(10 * 60_000);
  assert.equal((await app.finish(flow)).status, 400);
  const concurrent = await app.begin();
  const results = await Promise.all([app.finish(concurrent), app.finish(concurrent)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
});

test('同名但不同稳定 ID 的 GitHub 用户没有会话，客户端不能自报身份', async () => {
  const app = setup();
  app.identity({ id: 43, login: 'example' });
  const response = await app.finish(await app.begin());
  const html = await response.text();
  assert.equal(response.status, 400);
  assert.match(html, /IDENTITY_NOT_ALLOWED/);
  assert.doesNotMatch(html, /"token"/);
  assert.equal([...app.sql.rows.keys()].filter((key) => key.startsWith('session:')).length, 0);
  assert.equal((await app.api('/api/session?userId=42', 'a'.repeat(43))).status, 401);
});

test('本人登录后读取空仓库只返回空 envelope，绝不自动写默认资料', async () => {
  const app = setup();
  const token = await app.login();
  assert.deepEqual(await (await app.api('/api/session', token)).json(), { user: { id: 42, login: 'example' } });
  const response = await app.api('/api/records', token);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { snapshot: null, revision: null, savedAt: null });
  assert.equal(app.calls.filter((call) => call.options.method === 'PUT').length, 0);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('公开数据仓库拒绝读写，不发送资料到 contents API', async () => {
  const app = setup();
  const token = await app.login();
  app.private(false);
  assert.equal((await app.api('/api/records', token)).status, 503);
  assert.equal((await app.api('/api/records', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: snapshot(), revision: null }) })).status, 503);
  assert.equal(app.calls.filter((call) => call.url.includes('/contents/')).length, 0);
});

test('首次明确保存与后续 SHA 更新往固定私有路径，GitHub 确认后才返回 savedAt', async () => {
  const app = setup();
  const token = await app.login();
  const raw = { ...snapshot(), role: 'admin' };
  const response = await app.api('/api/records?repo=evil/repo&path=elsewhere', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: raw, revision: null }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result, { snapshot: snapshot(), revision: SHA_B, savedAt: '2026-01-02T03:04:05.000Z' });
  assert.deepEqual(app.cloudFile().raw, { ...snapshot(), savedAt: result.savedAt });
  const write = app.calls.find((call) => call.options.method === 'PUT');
  assert.equal(write.url, 'https://api.github.com/repos/example/private-records/contents/records/xiaoya.json');
  assert.equal(write.options.headers.Authorization, `Bearer ${app.env.GITHUB_DATA_TOKEN}`);
  assert.equal(JSON.parse(write.options.body).branch, 'main');
  assert.equal(Object.hasOwn(JSON.parse(write.options.body), 'sha'), false);
  const loaded = await (await app.api('/api/records', token)).json();
  assert.deepEqual(loaded, result);
  const updated = snapshot();
  updated.records['c-short-memory'].note = '后续修改';
  assert.equal((await app.api('/api/records', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: updated, revision: SHA_B }) })).status, 200);
  assert.equal(app.cloudFile().raw.records['c-short-memory'].note, '后续修改');
});

for (const conflictStatus of [409, 422]) test(`GitHub ${conflictStatus} 返回最新版本冲突，不覆盖其他设备记录`, async () => {
  const app = setup();
  const token = await app.login();
  const remote = snapshot();
  remote.records['c-short-memory'].note = '另一台设备的记录';
  app.file({ ...remote, savedAt: '2026-01-01T01:00:00Z' });
  app.conflict(conflictStatus);
  const response = await app.api('/api/records', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: snapshot(), revision: SHA_B }) });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: 'VERSION_CONFLICT', snapshot: remote, revision: SHA_A, savedAt: '2026-01-01T01:00:00Z' });
  assert.equal(app.cloudFile().raw.records['c-short-memory'].note, '另一台设备的记录');
});

test('无效资料、未知技能、缺失 revision、超限内容不会写入', async () => {
  const app = setup();
  const token = await app.login();
  for (const payload of [{ snapshot: snapshot() }, { snapshot: snapshot(), revision: 'bad' }, { snapshot: { ...snapshot(), records: { unknown: { note: 'x' } } }, revision: null }, { snapshot: { ...snapshot(), profile: { name: 'x', birthDate: '2025-02-29' } }, revision: null }]) {
    assert.equal((await app.api('/api/records', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status, 400);
  }
  assert.equal((await app.api('/api/records', token, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await app.api('/api/records', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(1_048_577) })).status, 413);
  assert.equal(app.calls.filter((call) => call.options.method === 'PUT').length, 0);
});

test('注销即撤销，12 小时到期后不能读写，旧配置身份也不能沿用', async () => {
  const app = setup();
  const token = await app.login();
  assert.deepEqual(await (await app.api('/api/logout', token, { method: 'POST' })).json(), { ok: true, revoked: true });
  assert.equal((await app.api('/api/records', token)).status, 401);
  const second = await app.login();
  app.advance(12 * 60 * 60_000);
  assert.equal((await app.api('/api/records', second)).status, 401);
  const third = await app.login();
  app.env.GITHUB_ALLOWED_USER_ID = '43';
  assert.equal((await app.api('/api/records', third)).status, 401);
});

test('上游失败不回显秘密或误报同步成功，损坏云端文件不写默认资料', async () => {
  const app = setup();
  const token = await app.login();
  app.file({ invalid: 'not-a-backup' });
  const malformed = await app.api('/api/records', token);
  assert.equal(malformed.status, 502);
  assert.equal((await malformed.json()).code, 'INVALID_CLOUD_DATA');
  app.failNetwork();
  const failed = await app.api('/api/records', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: snapshot(), revision: SHA_A }) });
  assert.equal(failed.status, 502);
  const text = await failed.text();
  assert.doesNotMatch(text, /fake-data-token|fake-client-secret|fake-oauth-token|upstream included|测试手记/);
  assert.equal(app.calls.filter((call) => call.options.method === 'PUT').length, 0);
});

test('预检只给固定来源，API cookie 不足以读取私有资料', async () => {
  const app = setup();
  const response = await app.api('/api/records', null, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await app.api('/api/records', null, { headers: { Cookie: 'session=forged' } })).status, 401);
});
