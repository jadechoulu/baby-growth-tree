import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createNetlifyAuth, cleanupNetlifyAuth } from '../backend/netlify-auth.mjs';
import { createNetlifyHandler } from '../backend/netlify-handler.mjs';
import { buildSyncBackend, NETLIFY_BACKEND_FILES } from '../scripts/build-sync-backend.mjs';

const NOW = Date.parse('2026-10-29T10:00:00Z');
const KEY = 'a'.repeat(64);
function memoryStore() {
  const entries = new Map(); let version = 0, failed = false;
  return {
    entries, fail() { failed = true; },
    async setJSON(key, data, options) {
      if (failed) throw new Error('fake-CREDENTIAL-must-not-leak');
      const previous = entries.get(key);
      if ((options.onlyIfNew && previous) || (options.onlyIfMatch && previous?.etag !== options.onlyIfMatch)) return { modified: false };
      const etag = String(++version); entries.set(key, { etag, data: structuredClone(data) }); return { modified: true, etag };
    },
    async getWithMetadata(key, options) {
      assert.equal(options.consistency, 'strong'); assert.equal(options.type, 'json');
      if (failed) throw new Error('fake-CREDENTIAL-must-not-leak');
      return structuredClone(entries.get(key) || null);
    },
    async delete(key) { entries.delete(key); },
    async *list(options) { assert.equal(options.paginate, true); yield { blobs: [...entries.keys()].map(key => ({ key })) }; },
  };
}
const call = (auth, operation, extra = {}) => auth.get().fetch(new Request('https://auth.internal', { method: 'POST', body: JSON.stringify({ operation, kind: 'state', key: KEY, now: NOW, ...extra }) }));

test('Netlify 条件消费原子拒绝并发回调、重放和重复写入', async () => {
  const store = memoryStore(), auth = createNetlifyAuth({ store });
  const payload = { request: 'r'.repeat(43) };
  assert.equal((await call(auth, 'put', { payload, expiresAt: NOW + 600_000 })).status, 200);
  assert.equal((await call(auth, 'put', { payload, expiresAt: NOW + 600_000 })).status, 503);
  const result = await Promise.all([call(auth, 'consume'), call(auth, 'consume')].map(async response => (await response).json()));
  assert.equal(result.filter(Boolean).length, 1); assert.deepEqual(result.find(Boolean), payload);
  assert.equal(await (await call(auth, 'consume')).json(), null);
});

test('Netlify 会话过期、注销立即拒绝；失败不泄密；清理不越界', async () => {
  const store = memoryStore(), auth = createNetlifyAuth({ store });
  await call(auth, 'put', { kind: 'session', payload: { user: 42 }, expiresAt: NOW + 1000 });
  assert.deepEqual(await (await call(auth, 'get', { kind: 'session' })).json(), { user: 42 });
  assert.equal(await (await call(auth, 'get', { kind: 'session', now: NOW + 1000 })).json(), null);
  await call(auth, 'delete', { kind: 'session' });
  assert.equal(await (await call(auth, 'get', { kind: 'session' })).json(), null);
  await call(auth, 'put', { payload: {}, expiresAt: NOW + 1000 });
  store.entries.set('records/growth.json', { data: { expiresAt: 0 }, etag: 'external' });
  store.entries.set('session/' + 'b'.repeat(64), { data: { expiresAt: NOW + 10_000 }, etag: 'future' });
  assert.equal((await cleanupNetlifyAuth({ store, now: NOW + 2000 })).deleted, 1);
  assert.equal(store.entries.has('records/growth.json'), true); assert.equal(store.entries.size, 2);
  store.fail(); const response = await call(auth, 'get');
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /CREDENTIAL/);
});

test('Netlify 原生 Request 入口完成 OAuth 与本人会话校验，未配置及状态库失败关闭', async () => {
  const store = memoryStore(); let exchanges = 0;
  const env = { FRONTEND_URL: 'https://example.github.io/site/', WORKER_URL: 'https://example.netlify.app', GITHUB_ALLOWED_USER_ID: '42', GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'fake-secret', GITHUB_DATA_TOKEN: 'fake-token', GITHUB_DATA_REPO: 'example/private', GITHUB_DATA_BRANCH: 'main', GITHUB_DATA_PATH: 'records/xiaoya.json' };
  const handler = createNetlifyHandler({ env, now: () => NOW, getStore(options) { assert.deepEqual(options, { name: 'xiaoya-auth-v1', consistency: 'strong' }); return store; }, network: async url => {
    if (url === 'https://github.com/login/oauth/access_token') { exchanges += 1; return Response.json({ access_token: 'fake-oauth' }); }
    if (url === 'https://api.github.com/user') return Response.json({ id: 42, login: 'example' });
    throw new Error('unexpected network');
  } });
  const request = (route, options) => handler(new Request(env.WORKER_URL + route, options));
  assert.deepEqual(await (await request('/api/health')).json(), { provider: 'netlify', ready: true });
  const start = await request('/auth/login?request=' + 'r'.repeat(43));
  assert.equal(start.status, 302); assert.match(start.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const authorize = new URL(start.headers.get('Location'));
  assert.equal(authorize.searchParams.get('redirect_uri'), env.WORKER_URL + '/auth/callback');
  const callback = '/auth/callback?code=fake-code&state=' + authorize.searchParams.get('state');
  const options = { headers: { Cookie: start.headers.get('Set-Cookie').split(';')[0] } };
  const response = await request(callback, options); assert.equal(response.status, 200);
  const token = /"token":"([A-Za-z0-9_-]{43})"/.exec(await response.text())[1];
  assert.equal((await request(callback, options)).status, 400); assert.equal(exchanges, 1);
  const headers = { Origin: 'https://example.github.io', Authorization: 'Bearer ' + token };
  assert.equal((await request('/api/session', { headers })).status, 200);
  await request('/api/logout', { method: 'POST', headers });
  assert.equal((await request('/api/session', { headers })).status, 401);
  env.GITHUB_CLIENT_SECRET = '';
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/session', { headers })).status, 503);
  const broken = createNetlifyHandler({ getStore() { throw new Error('fake-CREDENTIAL'); } });
  const failed = await broken(new Request(env.WORKER_URL + '/api/session'));
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /CREDENTIAL/);
});

test('Netlify 后端部署包只含显式运行文件与空介绍页', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'xiaoya-netlify-')); t.after(() => rm(root, { recursive: true, force: true }));
  const output = path.join(root, 'backend'); await buildSyncBackend(output, { provider: 'netlify' });
  async function list(prefix = '') {
    const items = [];
    for (const item of await readdir(path.join(output, prefix), { withFileTypes: true })) items.push(...(item.isDirectory() ? await list(path.join(prefix, item.name)) : [path.join(prefix, item.name)]));
    return items;
  }
  assert.deepEqual((await list()).sort(), [...NETLIFY_BACKEND_FILES.map(([, target]) => target), 'public/index.html'].sort());
});
