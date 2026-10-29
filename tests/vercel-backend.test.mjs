import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBlobAuth, cleanupBlobAuth } from '../backend/blob-auth.mjs';
import { createVercelHandler } from '../backend/handler.mjs';
import { buildSyncBackend, BACKEND_FILES } from '../scripts/build-sync-backend.mjs';

const TIME = Date.parse('2026-10-29T04:00:00Z');
const KEY = 'a'.repeat(64);
const ORIGIN = 'https://example.github.io';
const BASE = 'https://xiaoya-test.vercel.app';

function memoryBlob() {
  const entries = new Map(), calls = [];
  let version = 0, failed = false;
  class BlobPreconditionFailedError extends Error {}
  return {
    entries, calls, BlobPreconditionFailedError,
    fail() { failed = true; },
    async put(path, body, options) {
      if (failed) throw new Error('fake-PRIVATE-CREDENTIAL-must-not-leak');
      calls.push({ op: 'put', path, options });
      assert.equal(options.access, 'private');
      const current = entries.get(path);
      if (options.ifMatch && current?.etag !== options.ifMatch) throw new BlobPreconditionFailedError();
      if (current && !options.allowOverwrite) throw new Error('already exists');
      const entry = { body, etag: String(++version), uploadedAt: new Date(TIME), pathname: path, url: 'https://test.private.blob.vercel-storage.com/' + path };
      entries.set(path, entry); return entry;
    },
    async get(path, options) {
      if (failed) throw new Error('fake-PRIVATE-CREDENTIAL-must-not-leak');
      calls.push({ op: 'get', path, options });
      assert.equal(options.useCache, false); assert.equal(options.access, 'private');
      const entry = entries.get(path);
      return entry ? { statusCode: 200, stream: new Response(entry.body).body, blob: { ...entry } } : null;
    },
    async del(paths) {
      calls.push({ op: 'del', paths });
      for (const value of Array.isArray(paths) ? paths : [paths]) {
        const key = value.replace('https://test.private.blob.vercel-storage.com/', '');
        entries.delete(key);
      }
    },
    async list(options) { calls.push({ op: 'list', options }); return { blobs: [...entries.values()], hasMore: false }; },
  };
}
function internal(store, operation, kind = 'state', extra = {}) {
  return store.get().fetch(new Request('https://auth.internal', { method: 'POST', body: JSON.stringify({ operation, kind, key: KEY, now: TIME, ...extra }) }));
}

test('Vercel 私有 state 条件消费：并发回调仅一次成功，消费标记不能回放', async () => {
  const blob = memoryBlob(); const store = createBlobAuth({ blob });
  const payload = { request: 'r'.repeat(43) };
  assert.equal((await internal(store, 'put', 'state', { payload, expiresAt: TIME + 600_000 })).status, 200);
  const values = await Promise.all([internal(store, 'consume'), internal(store, 'consume')].map(async response => (await response).json()));
  assert.equal(values.filter(v => v !== null).length, 1);
  assert.deepEqual(values.find(v => v), payload);
  assert.equal(await (await internal(store, 'consume')).json(), null);
  assert.equal([...blob.entries.values()][0].body.includes('"consumed":true'), true);
});

test('Vercel 会话过期和注销即时生效；状态存储失败不回显凭据', async () => {
  const blob = memoryBlob(); const store = createBlobAuth({ blob });
  const payload = { user: { id: 42, login: 'example' } };
  await internal(store, 'put', 'session', { payload, expiresAt: TIME + 1000 });
  assert.deepEqual(await (await internal(store, 'get', 'session')).json(), payload);
  assert.equal(await (await internal(store, 'get', 'session', { now: TIME + 1000 })).json(), null);
  await internal(store, 'delete', 'session');
  assert.equal(await (await internal(store, 'get', 'session')).json(), null);
  assert.equal((await internal(store, 'get', 'other')).status, 400);
  blob.fail(); const failed = await internal(store, 'get');
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /CREDENTIAL/);
});

function setup() {
  const blob = memoryBlob(); let time = TIME;
  const env = {
    FRONTEND_URL: ORIGIN + '/baby-growth-tree/', WORKER_URL: BASE,
    GITHUB_ALLOWED_USER_ID: '42', GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'fake-SECRET-NOT-A-CREDENTIAL', GITHUB_DATA_TOKEN: 'fake-TOKEN-NOT-A-CREDENTIAL',
    GITHUB_DATA_REPO: 'example/private-records', GITHUB_DATA_BRANCH: 'main', GITHUB_DATA_PATH: 'records/xiaoya.json',
    BLOB_READ_WRITE_TOKEN: 'fake-BLOB-NOT-A-CREDENTIAL', CRON_SECRET: 'fake-CRON-NOT-A-CREDENTIAL',
    DEV_FRONTEND_ORIGINS: '["http://127.0.0.1:5318"]',
  };
  const calls = []; let document = null;
  async function network(url, options = {}) {
    calls.push({ url, options });
    if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'fake-OAUTH-NOT-A-CREDENTIAL' });
    if (url === 'https://api.github.com/user') return Response.json({ id: 42, login: 'example' });
    if (url === 'https://api.github.com/repos/example/private-records') return Response.json({ private: true });
    if (url.startsWith('https://api.github.com/repos/example/private-records/contents/records/growth.json')) {
      if (options.method === 'PUT') {
        const incoming = JSON.parse(options.body); document = JSON.parse(Buffer.from(incoming.content, 'base64').toString('utf8'));
        return Response.json({ content: { sha: 'a'.repeat(40) } });
      }
      return document ? Response.json({ content: Buffer.from(JSON.stringify(document)).toString('base64'), encoding: 'base64', sha: 'a'.repeat(40) }) : Response.json({}, { status: 404 });
    }
    throw new Error('unexpected test network');
  }
  const app = createVercelHandler({ env, blob, network, now: () => time });
  const request = (route, options) => app.fetch(new Request(BASE + route, options));
  async function login() {
    const start = await request('/api/auth/login?request=' + 'r'.repeat(43) + '&origin=' + encodeURIComponent(ORIGIN));
    assert.equal(start.status, 302);
    const authorize = new URL(start.headers.get('Location'));
    assert.equal(authorize.searchParams.get('redirect_uri'), BASE + '/auth/callback');
    const cookie = start.headers.get('Set-Cookie').split(';')[0];
    const callbackPath = '/auth/callback?code=fake-code&state=' + authorize.searchParams.get('state');
    const result = await request(callbackPath, { headers: { Cookie: cookie } });
    assert.equal(result.status, 200);
    const token = /"token":"([A-Za-z0-9_-]{43})"/.exec(await result.text())[1];
    return { token, callbackPath, cookie };
  }
  const api = (route, token, options = {}) => request(route, { ...options, headers: { Origin: ORIGIN, Authorization: 'Bearer ' + token, ...options.headers } });
  return { env, blob, app, calls, request, api, login, advance: ms => { time += ms; } };
}

test('Vercel 重写入口完整走通 GitHub OAuth、私有记录读写和注销，回调不可重放', async () => {
  const t = setup(); const { token, callbackPath, cookie } = await t.login();
  assert.equal((await t.request(callbackPath, { headers: { Cookie: cookie } })).status, 400);
  assert.equal((await t.api('/api/session', token)).status, 200);
  assert.equal((await t.api('/api/data/growth', token, { headers: { Origin: 'https://evil.example' } })).status, 403);
  const snapshot = { version: 1, records: { 'c-short-memory': { note: 'Vercel 验收手记' } } };
  const saved = await t.api('/api/data/growth', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot, revision: null }) });
  assert.equal(saved.status, 200); assert.deepEqual((await saved.json()).snapshot, snapshot);
  assert.deepEqual((await (await t.api('/api/data/growth', token)).json()).snapshot, snapshot);
  assert.equal((await t.api('/api/logout', token, { method: 'POST' })).status, 200);
  assert.equal((await t.api('/api/session', token)).status, 401);
  assert.equal(t.calls.filter(c => c.url === 'https://github.com/login/oauth/access_token').length, 1);
});

test('Vercel 未配置时健康检查可用，数据接口关闭；每日清理须鉴权且不碰非会话文件', async () => {
  const t = setup(); t.env.GITHUB_CLIENT_SECRET = '';
  const health = await t.request('/api/health');
  assert.deepEqual(await health.json(), { provider: 'vercel', ready: false });
  assert.equal((await t.api('/api/data/growth', 'x')).status, 503);
  assert.equal((await t.request('/api/cron/auth-cleanup')).status, 401);
  t.blob.entries.set('records/growth.json', { pathname: 'records/growth.json', uploadedAt: new Date(0), url: 'records/growth.json' });
  await internal(createBlobAuth({ blob: t.blob }), 'put', 'session', { payload: {}, expiresAt: TIME + 1000 });
  const result = await cleanupBlobAuth({ blob: t.blob, now: TIME + 13 * 60 * 60_000 });
  assert.equal(result.deleted, 1); assert.equal(t.blob.entries.has('records/growth.json'), true);
});

test('Node 实际 HTTP 适配传递 Origin、Bearer、原始 JSON 与 OAuth cookie', async t => {
  const env = setup(); const { token } = await env.login();
  const server = createServer(env.app.node); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { Origin: ORIGIN, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const snapshot = { version: 1, records: { 'c-short-memory': { note: '真实 HTTP 请求' } } };
  const saved = await fetch(base + '/api/data/growth', { method: 'PUT', headers, body: JSON.stringify({ snapshot, revision: null }) });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.deepEqual((await saved.json()).snapshot, snapshot);
  const start = await fetch(base + '/api/auth/login?request=' + 'r'.repeat(43), { redirect: 'manual' });
  assert.equal(start.status, 302); assert.match(start.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
});

test('Vercel 部署白名单只包含后端运行文件，不上传网页、备份、环境密钥和工作区', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'xiaoya-vercel-')); t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = path.join(temporary, 'backend'); await buildSyncBackend(output);
  async function files(root, prefix = '') {
    const result = [];
    for (const item of await readdir(path.join(root, prefix), { withFileTypes: true })) result.push(...(item.isDirectory() ? await files(root, path.join(prefix, item.name)) : [path.join(prefix, item.name)]));
    return result;
  }
  assert.deepEqual((await files(output)).sort(), [...BACKEND_FILES.map(([, target]) => target), 'public/index.html'].sort());
  const packageJson = JSON.parse(await readFile(path.join(output, 'package.json')));
  assert.equal(packageJson.dependencies['@vercel/blob'], '2.8.2');
});
