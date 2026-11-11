import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantMemory } from '../backend/assistant-memory.mjs';
import { AuthState, createWorker } from '../worker/index.mjs';

test('四类记录固定私有文件独立读写；两成长版本互不覆盖，英语不包含姓名生日', async () => {
  const app = setup(); const token = await app.login();
  const values = {
    profile: { version: 1, name: '测试宝宝', birthDate: '2024-11-24' },
    growth: { version: 1, records: snapshot().records },
    health: { version: 1, standard: 'WS/T 580—2017', records: { 'wst580-138': { status: 'observed', observedAt: '2026-10-30', note: '家庭观察' } } },
    english: { version: 1, profile: { vocabulary: 70, mode: 'audio' }, favorites: ['sss'], records: { sss: { status: 'using', note: '喜欢' } } },
  };
  for (const [area, value] of Object.entries(values)) {
    const path = '/api/data/' + area;
    assert.deepEqual(await (await app.api(path, token)).json(), { snapshot: null, revision: null, savedAt: null });
    const saved = await app.api(path, token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: value, revision: null }) });
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.deepEqual((await saved.json()).snapshot, value);
    assert.deepEqual((await (await app.api(path, token)).json()).snapshot, value);
  }
  assert.equal((await app.api('/api/data/other', token)).status, 404);
  assert.equal((await app.api('/api/data/health')).status, 401);
  assert.equal((await app.api('/api/data/health', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: { ...values.health, records: { 'wst580-262': {} } }, revision: SHA_A }) })).status, 400);
  assert.equal((await app.api('/api/data/english', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: { ...values.english, token: 'fake-NOT-A-CREDENTIAL' }, revision: SHA_A }) })).status, 400);
  app.private(false); assert.equal((await app.api('/api/data/english', token)).status, 503);
});

test('本机 OAuth 结果只发往 state 中绑定的显式允许来源，任意来源拒绝', async () => {
  const dev = 'http://127.0.0.1:5318';
  const app = setup({ DEV_FRONTEND_ORIGINS: JSON.stringify([dev, 'http://127.0.0.1:5317']) });
  assert.equal((await app.request(`/auth/login?request=${CLIENT_NONCE}&origin=https://evil.example`)).status, 400);
  const start = await app.request(`/auth/login?request=${CLIENT_NONCE}&origin=${encodeURIComponent(dev)}`);
  const flow = { cookie: start.headers.get('Set-Cookie').split(';')[0], state: new URL(start.headers.get('Location')).searchParams.get('state') };
  const html = await (await app.finish(flow)).text();
  assert.match(html, /http:\/\/127\.0\.0\.1:5318/);
  assert.doesNotMatch(html, /evil\.example/);
  const token = /"token":"([A-Za-z0-9_-]{43})"/.exec(html)[1];
  assert.equal((await app.api('/api/data/growth', token, { headers: { Origin: dev } })).status, 200);
  assert.equal((await app.api('/api/data/growth', token, { headers: { Origin: 'http://127.0.0.1:9999' } })).status, 403);
});

test('启用本机任意端口后，登录回执仍绑定实际来源且API仍需本人会话，外站及伪造本机地址拒绝', async () => {
  const app = setup({ DEV_FRONTEND_ANY_PORT: 'true' });
  for (const origin of ['http://127.0.0.1:5326', 'http://localhost:54321', 'http://[::1]:55555']) {
    const start = await app.request(`/auth/login?request=${CLIENT_NONCE}&origin=${encodeURIComponent(origin)}`);
    assert.equal(start.status, 302);
    const flow = { cookie: start.headers.get('Set-Cookie').split(';')[0], state: new URL(start.headers.get('Location')).searchParams.get('state') };
    const html = await (await app.finish(flow)).text();
    assert.ok(html.includes(JSON.stringify(origin)), '回执只投递给当前端口');
    const token = /"token":"([A-Za-z0-9_-]{43})"/.exec(html)[1];
    assert.equal((await app.api('/api/session', undefined, { headers: { Origin: origin } })).status, 401);
    const session = await app.api('/api/session', token, { headers: { Origin: origin } });
    assert.equal(session.status, 200); assert.equal(session.headers.get('Access-Control-Allow-Origin'), origin);
    for (const denied of ['https://evil.example', 'http://127.0.0.1.evil.example:5326', 'http://localhost.evil.example:5326', 'http://192.168.1.1:5326', 'http://user@localhost:5326', 'http://localhost:5326/path', 'http://localhost:5326?x=1', 'http://localhost:5326#x', 'null']) {
      assert.equal((await app.request(`/auth/login?request=${CLIENT_NONCE}&origin=${encodeURIComponent(denied)}`)).status, 400, denied);
      assert.equal((await app.api('/api/session', token, { headers: { Origin: denied } })).status, 403, denied);
    }
    assert.equal((await app.finish(flow)).status, 400, '已消费的state不能重放');
  }
  const disabled = setup();
  assert.equal((await disabled.request(`/auth/login?request=${CLIENT_NONCE}&origin=${encodeURIComponent('http://127.0.0.1:5326')}`)).status, 400);
});

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
  const documents = new Map();
  let bookAccounts = null;
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
    if (url.startsWith('https://api.github.com/repos/example/private-records/contents/assistant/memory-v1.json')) {
      const current = documents.get('assistant');
      if (options.method === 'PUT') {
        const incoming = JSON.parse(options.body);
        if ((incoming.sha || null) !== (current?.sha || null)) return Response.json({}, { status: 409 });
        documents.set('assistant', { sha: current?.sha === SHA_A ? SHA_B : SHA_A, raw: JSON.parse(Buffer.from(incoming.content, 'base64').toString('utf8')) });
        return Response.json({}, { status: 201 });
      }
      return current ? Response.json({ sha: current.sha, encoding: 'base64', content: Buffer.from(JSON.stringify(current.raw)).toString('base64') }) : Response.json({}, { status: 404 });
    }
    if (url.startsWith('https://api.github.com/repos/example/private-records/contents/private/book-finder.json')) {
      return bookAccounts ? Response.json({ sha: SHA_A, encoding: 'base64', content: Buffer.from(JSON.stringify(bookAccounts)).toString('base64') }) : Response.json({}, { status: 404 });
    }
    const match = /^https:\/\/api\.github\.com\/repos\/example\/private-records\/contents\/records\/(profile|growth|health|english)\.json/.exec(url);
    if (match) {
      const area = match[1], current = documents.get(area);
      if (options.method === 'PUT') {
        const incoming = JSON.parse(options.body);
        if ((incoming.sha || null) !== (current?.sha || null)) return Response.json({}, { status: 409 });
        const saved = { sha: (current?.sha === SHA_A ? SHA_B : SHA_A), raw: JSON.parse(Buffer.from(incoming.content, 'base64').toString('utf8')) };
        documents.set(area, saved);
        return Response.json({ content: { sha: saved.sha } }, { status: 201 });
      }
      return current ? Response.json({ sha: current.sha, encoding: 'base64', content: Buffer.from(JSON.stringify(current.raw)).toString('base64') }) : Response.json({}, { status: 404 });
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
  return { bookAccounts: value => { bookAccounts = value; }, env, sql, calls, request, api, begin, finish, login, advance: (ms) => { time += ms; }, identity: (value) => { identity = value; }, private: (value) => { privateRepo = value; }, file: (raw, sha = SHA_A) => { file = raw === null ? null : { raw, sha }; }, cloudFile: () => file, conflict: (value) => { conflict = value; }, failNetwork: () => { networkFailure = true; } };
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


test('云端小花生沿本人会话及来源鉴权，拒绝客户端账号；备份必须为合法英语快照', async () => {
  const calls = [], app = setup({ XIAOHUASHENG_SYNC: async (action, snapshot) => { calls.push({ action, snapshot }); return { ok: true, value: action === 'backup' ? { saved: true } : { status: 'queued' } }; } });
  const route = '/api/xiaohuasheng/sync';
  assert.equal((await app.api(route)).status, 401); assert.equal(calls.length, 0);
  const token = await app.login();
  assert.equal((await app.api(route, token, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await app.api(route, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: '99' }) })).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await app.api(route, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
  assert.equal(calls.at(-1).action, 'start');
  assert.equal((await app.api(route, token)).status, 200); assert.equal(calls.at(-1).action, 'status');
  const snapshot = { version: 1, profile: { vocabulary: 0, mode: 'audio' }, favorites: [], records: {} };
  const backup = await app.api('/api/xiaohuasheng/backup', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }) });
  assert.equal(backup.status, 200); assert.deepEqual(calls.at(-1), { action: 'backup', snapshot });
  const bad = await app.api('/api/xiaohuasheng/backup', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: { ...snapshot, token: 'not-allowed' } }) });
  assert.equal(bad.status, 400);
});

test('全站检索入口只接受本人固定ID会话和允许来源，其他账号及退出会话不执行检索', async () => {
  const calls = [];
  const app = setup({ ASSISTANT: async (action, payload) => { calls.push({ action, payload }); return { value: { sources: [] } }; } });
  const route = '/api/assistant/search', options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '动物', section: 'english' }) };
  assert.equal((await app.api(route, undefined, options)).status, 401); assert.equal(calls.length, 0);
  const token = await app.login();
  assert.equal((await app.api(route, token, { ...options, headers: { ...options.headers, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await app.api(route, token)).status, 405); assert.equal(calls.length, 0);
  assert.equal((await app.api(route, token, options)).status, 200);
  assert.deepEqual(calls, [{ action: 'search', payload: { query: '动物', section: 'english' } }]);
  app.env.GITHUB_ALLOWED_USER_ID = '99';
  assert.equal((await app.api(route, token, options)).status, 401); assert.equal(calls.length, 1);
  app.env.GITHUB_ALLOWED_USER_ID = '42';
  app.identity({ id: 99, login: 'example' });
  const rejected = await app.finish(await app.begin());
  assert.equal(rejected.status, 400); assert.match(await rejected.text(), /IDENTITY_NOT_ALLOWED/); assert.equal(calls.length, 1);
  await app.api('/api/logout', token, { method: 'POST' });
  assert.equal((await app.api(route, token, options)).status, 401); assert.equal(calls.length, 1);
});

test('智能入口必须经过本人会话、固定Origin和小请求限制，匿名不触发模型', async () => {
  let calls = 0;
  const app = setup({ ASSISTANT: async () => { calls++; return { value: { enabled: false } }; } });
  assert.equal((await app.api('/api/assistant')).status, 401);
  assert.equal(calls, 0);
  const token = await app.login();
  assert.equal((await app.api('/api/assistant', token, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal(calls, 0);
  assert.equal((await app.api('/api/assistant', token)).status, 200);
  assert.equal(calls, 1);
  assert.equal((await app.api('/api/assistant', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'a'.repeat(17000) }) })).status, 413);
  assert.equal(calls, 1);
});


test('助手记忆复用本人鉴权与固定私有文件，不写入原英语档案，公开仓拒绝', async () => {
  let calls = 0;
  const app = setup({ ASSISTANT: async (action, payload, repository) => {
    calls++; const memory = createAssistantMemory({ repository });
    return { value: await (action === 'remember' ? memory.inspect(payload) : memory.forget(payload)) };
  } });
  assert.equal((await app.api('/api/assistant/memory')).status, 401); assert.equal(calls, 0);
  const token = await app.login();
  assert.equal((await app.api('/api/assistant/memory', token, { headers: { Origin: 'https://evil.example' } })).status, 403); assert.equal(calls, 0);
  const empty = await app.api('/api/assistant/memory', token); assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).facts, []);
  const cleared = await app.api('/api/assistant/memory', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"all":true}' });
  assert.equal(cleared.status, 200);
  const original = await app.api('/api/data/english', token); assert.equal((await original.json()).snapshot, null);
  app.private(false); assert.equal((await app.api('/api/assistant/memory', token)).status, 503);
});


test('找书账号仅限本人有效会话与允许来源，匿名、异人、过期与注销均拒绝', async () => {
  const app = setup();
  const path = '/api/book-finder/accounts';
  assert.equal((await app.api(path)).status, 401);
  assert.equal(app.calls.length, 0);
  const token = await app.login();
  const before = app.calls.length;
  assert.equal((await app.api(path, token, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal(app.calls.length, before);
  await app.api('/api/logout', token, { method: 'POST' });
  assert.equal((await app.api(path, token)).status, 401);
  const next = await app.login(); app.advance(13 * 60 * 60_000);
  assert.equal((await app.api(path, next)).status, 401);
  const other = setup(); other.identity({ id: 99, login: 'other' });
  assert.equal((await other.finish(await other.begin())).status, 400);
});

test('找书只读固定私人文件、无缓存且实时返回白名单；拒绝公开仓和非法数据', async () => {
  const app = setup(), token = await app.login(), path = '/api/book-finder/accounts';
  assert.deepEqual(await (await app.api(path, token)).json(), { accounts: {} });
  app.bookAccounts({ version: 1, accounts: { epic: 'fake-epic@example.test', overdrive: 'fake-library', ignored: 'not-returned' }, extra: 'not-returned' });
  const response = await app.api(path + '?path=evil.json', token);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { accounts: { epic: 'fake-epic@example.test', overdrive: 'fake-library' } });
  const read = app.calls.at(-1);
  assert.equal(read.url, 'https://api.github.com/repos/example/private-records/contents/private/book-finder.json?ref=main');
  assert.equal(read.options.cache, 'no-store');
  app.bookAccounts({ version: 1, accounts: { epic: 'changed@example.test' } });
  assert.equal((await (await app.api(path, token)).json()).accounts.epic, 'changed@example.test');
  assert.equal((await app.api(path, token, { method: 'PUT' })).status, 405);
  app.bookAccounts({ version: 1, accounts: { epic: { secret: 'must-not-leak' } } });
  const invalid = await app.api(path, token);
  assert.equal(invalid.status, 502); assert.doesNotMatch(await invalid.text(), /must-not-leak/);
  app.private(false); assert.equal((await app.api(path, token)).status, 503);
});
