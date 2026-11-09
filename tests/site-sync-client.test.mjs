import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../shared/site-sync.js', import.meta.url), 'utf8');

// 只模拟依赖边界，验证调用方可等待的结果，不模拟同步面板或布局。
function harness({ apiBase = 'https://sync.example.test', loggedIn = true, expired = false, configurationFails = false, xhsJobs = [], assistantResponses = [], initial = { enabled: true, pending: false, error: null, conflict: null } } = {}) {
  let state = structuredClone(initial), action = async () => {}, calls = 0;
  const storage = new Map(loggedIn ? [['xiaoya-cloud-session-v2:' + apiBase, 'test-session']] : []);
  const engine = {
    async register() {}, async changed() {}, authenticate() {},
    states: () => ({ english: structuredClone(state) }),
    async sync(area) { assert.equal(area, 'english'); calls++; await action(); },
  };
  const window = Object.assign(new EventTarget(), {
    XiaoyaSyncModel: { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    XiaoyaSyncAdapters: { createAdapters: () => ({ english: {} }) },
    XiaoyaSyncEngine: { createJournal: () => ({}), createEngine: () => engine },
    navigator: { locks: { request: (_, callback) => callback() } },
  });
  const requests = [];
  const context = {
    window, document: new EventTarget(), URL, AbortSignal, crypto: { randomUUID: () => 'test-request' },
    location: { protocol: 'https:', hostname: 'pages.example.test' },
    fetch: async (url, options) => {
      if (url.endsWith('cloud-config.json')) {
        if (configurationFails) throw new Error('配置读取失败');
        return { ok: true, json: async () => ({ apiBase }) };
      }
      if (url.startsWith(apiBase + '/api/xiaohuasheng/')) {
        requests.push({ url, options });
        return { ok: true, status: 200, json: async () => url.endsWith('/backup') ? { saved: true } : xhsJobs.shift() };
      }
      if (url.startsWith(apiBase + '/api/assistant')) {
        requests.push({ url, options });
        const result = assistantResponses.shift() || { status: 200, value: { sources: [] } };
        return { ok: result.status === 200, status: result.status, json: async () => result.value };
      }
      assert.equal(url, apiBase + '/api/session');
      return expired ? { status: 401 } : { status: 200, ok: true, json: async () => ({ user: { id: 1, login: 'test-user' } }) };
    },
    sessionStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
    setInterval() {}, setTimeout(callback) { queueMicrotask(callback); }, clearTimeout() {},
  };
  vm.runInNewContext(source, context);
  const client = window.XiaoyaSync.createClient({ profileClient: { subscribe() {} } });
  return { client, requests, calls: () => calls, setState(value) { state = structuredClone(value); }, onSync(value) { action = value; } };
}

test('手动分类同步区别未配置、配置失败、需登录和首次连接，均不伪造成功或自动迁入', async () => {
  for (const [options, status] of [
    [{ apiBase: '' }, 'not-configured'],
    [{ configurationFails: true }, 'configuration-error'],
    [{ loggedIn: false }, 'auth-required'],
    [{ expired: true }, 'auth-required'],
    [{ initial: { enabled: false } }, 'connection-required'],
  ]) {
    const h = harness(options), result = await h.client.sync('english');
    assert.equal(result.status, status); assert.equal(result.ok, false); assert.equal(h.calls(), 0);
  }
});

test('全站搜索走固定带Bearer接口，失效会话通知清理且不再发送后续搜索', async () => {
  const h = harness({ assistantResponses: [{ status: 200, value: { sources: [] } }, { status: 401 }] });
  await h.client.ready;
  const changes = []; h.client.subscribe(area => changes.push(area));
  await h.client.searchAssistant({ query: '动物', section: 'all' });
  assert.equal(h.requests[0].url, 'https://sync.example.test/api/assistant/search');
  assert.equal(h.requests[0].options.method, 'POST'); assert.equal(h.requests[0].options.headers.Authorization, 'Bearer test-session');
  assert.equal(h.requests[0].options.cache, 'no-store'); assert.equal(h.requests[0].options.credentials, 'omit');
  assert.deepEqual(JSON.parse(h.requests[0].options.body), { query: '动物', section: 'all' });
  await assert.rejects(h.client.searchAssistant({ query: '动物', section: 'all' }), { code: 'AUTH_REQUIRED' });
  assert.equal((await h.client.getState('english')).authenticated, false); assert.deepEqual(changes, ['auth']);
  await assert.rejects(h.client.searchAssistant({ query: '动物', section: 'all' }), { code: 'AUTH_REQUIRED' });
  assert.equal(h.requests.length, 2);
  const anonymous = harness({ loggedIn: false });
  await assert.rejects(anonymous.client.searchAssistant({ query: '动物', section: 'all' }), { code: 'AUTH_REQUIRED' });
  assert.equal(anonymous.requests.length, 0);
});

test('手动同步等待分类引擎完成后才返回成功及服务端确认时间', async () => {
  const h = harness({ initial: { enabled: true, pending: true } });
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  h.onSync(async () => {
    entered(); await new Promise(resolve => { release = resolve; });
    h.setState({ enabled: true, pending: false, savedAt: '2026-11-08T01:00:00Z' });
  });
  let finished = false;
  const pending = h.client.sync('english').then(value => { finished = true; return value; });
  await started;
  assert.equal(finished, false);
  assert.equal((await h.client.getState('english')).status, 'pending');
  release();
  const result = await pending;
  assert.equal(result.ok, true); assert.equal(result.status, 'synced');
  assert.equal(result.savedAt, '2026-11-08T01:00:00Z'); assert.equal(h.calls(), 1);
});

test('引擎以状态报告的冲突、网络失败及仍待提交不会被Promise结束误报为成功', async () => {
  for (const [after, status] of [
    [{ enabled: true, conflict: { conflicts: [{ key: 'a' }] }, pending: true }, 'conflict'],
    [{ enabled: true, error: '网络失败', pending: true }, 'error'],
    [{ enabled: true, pending: true }, 'pending'],
    [{ enabled: true, pending: false, syncing: true }, 'syncing'],
  ]) {
    const h = harness(); h.onSync(async () => h.setState(after));
    const result = await h.client.sync('english');
    assert.equal(result.status, status); assert.equal(result.ok, false);
  }
});

test('分类状态快照不能修改引擎内部状态，未知分类明确拒绝', async () => {
  const h = harness();
  const state = await h.client.getState('english'); state.enabled = false;
  assert.equal((await h.client.getState('english')).enabled, true);
  await assert.rejects(h.client.sync('other'), /未知记录分类/);
  await assert.rejects(h.client.getState('other'), /未知记录分类/);
});

test('云端书架任务只发固定本人授权请求，等完整结果后返回；失败和未登录不伪造成功', async () => {
  const snapshot = { complete: true, books: [{ bookId: 'fake-book' }] }, progress = [];
  const h = harness({ xhsJobs: [{ status: 'queued' }, { status: 'running', progress: { phase: 'catalog', resolved: 20 } }, { status: 'complete', snapshot }] });
  assert.deepEqual(await h.client.readXiaohuasheng({ onProgress: value => progress.push(value) }), snapshot);
  assert.equal(progress.length, 2);
  assert.equal(h.requests[0].url, 'https://sync.example.test/api/xiaohuasheng/sync');
  assert.equal(h.requests[0].options.body, '{}'); assert.equal(h.requests[0].options.credentials, 'omit');
  assert.equal(h.requests[0].options.headers.Authorization, 'Bearer test-session');
  assert.equal(h.requests[1].options.method, 'GET');
  await h.client.backupEnglish({ version: 1, records: {} });
  assert.equal(h.requests.at(-1).url, 'https://sync.example.test/api/xiaohuasheng/backup');
  const bad = harness({ xhsJobs: [{ status: 'failed', code: 'XHS_INCOMPLETE', message: '缺页' }] });
  await assert.rejects(bad.client.readXiaohuasheng(), { code: 'XHS_INCOMPLETE' });
  const anonymous = harness({ loggedIn: false });
  await assert.rejects(anonymous.client.readXiaohuasheng(), { code: 'AUTH_REQUIRED' });
  assert.equal(anonymous.requests.length, 0);
});
