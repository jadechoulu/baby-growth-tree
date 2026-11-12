import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../shared/site-sync.js', import.meta.url), 'utf8');

// 只模拟依赖边界，验证调用方可等待的结果，不模拟同步面板或布局。
function harness({ apiBase = 'https://sync.example.test', loggedIn = true, expired = false, configurationFails = false, xhsJobs = [], assistantResponses = [], bookResponses = [], initial = { enabled: true, pending: false, error: null, conflict: null }, areas } = {}) {
  let states = structuredClone(areas || { english: initial }), action = async () => {}, calls = 0;
  const syncedAreas = [];
  const previewedAreas = [], enabledAreas = [];
  const storage = new Map(loggedIn ? [['xiaoya-cloud-session-v2:' + apiBase, 'test-session']] : []);
  const engine = {
    async register() {}, async changed() {}, authenticate() {},
    states: () => structuredClone(states),
    async sync(area) { assert.ok(Object.hasOwn(states, area)); calls++; syncedAreas.push(area); await action(area); },
    async preview(area) { previewedAreas.push(area); return { local: null, remote: { snapshot: null, revision: null, savedAt: null }, conflicts: [] }; },
    async enable(area, reviewed) { assert.ok(reviewed.remote); enabledAreas.push(area); states[area] = { enabled: true, pending: false }; },
  };
  class Element extends EventTarget {
    constructor(tag) { super(); this.tag = tag; this.children = []; this.dataset = {}; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    set textContent(value) { this.text = String(value); }
    get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); }
    setAttribute() {}
    querySelectorAll(selector) { return this.children.flatMap(child => [...(selector.startsWith('[data-') && Object.hasOwn(child.dataset, selector.slice(6, -1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())) || selector.startsWith('.') && child.className === selector.slice(1) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    after(node) { const at = this.parent.children.indexOf(this); node.parent = this.parent; this.parent.children.splice(at + 1, 0, node); }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    focus() {}
    scrollIntoView() {}
  }
  const document = Object.assign(new EventTarget(), { createElement: tag => new Element(tag), body: new Element('body') });
  const window = Object.assign(new EventTarget(), {
    XiaoyaSyncModel: { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    XiaoyaSyncAdapters: { createAdapters: () => Object.fromEntries(Object.keys(states).map(area => [area, {}])) },
    XiaoyaSyncEngine: { createJournal: () => ({}), createEngine: () => engine },
    navigator: { locks: { request: (_, callback) => callback() } },
  });
  const requests = []; let intervals = 0;
  const context = {
    window, document, URL, AbortSignal, crypto: { randomUUID: () => 'test-request' },
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
      if (url === apiBase + '/api/book-finder/accounts') {
        requests.push({ url, options });
        return await bookResponses.shift()();
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
    setInterval() { intervals++; }, setTimeout(callback) { queueMicrotask(callback); }, clearTimeout() {},
  };
  vm.runInNewContext(source, context);
  const client = window.XiaoyaSync.createClient({ profileClient: { subscribe() {} } });
  return { client, document, window, intervals:()=>intervals, previewedAreas, enabledAreas, requests, syncedAreas, calls: () => calls, setState(value, area = 'english') { states[area] = structuredClone(value); }, onSync(value) { action = value; } };
}

test('已同步私人记录不设置轮询，切回和聚焦不拉取；恢复联网只续传未保存修改', async () => {
  const h = harness(); await h.client.ready;
  assert.equal(h.intervals(), 0);
  h.window.dispatchEvent(new Event('focus')); h.document.dispatchEvent(new Event('visibilitychange')); h.window.dispatchEvent(new Event('online'));
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(h.calls(), 0);
  h.setState({enabled:true,pending:true}); h.window.dispatchEvent(new Event('online'));
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(h.calls(), 1);
  h.setState({enabled:true,pending:true,conflict:{}}); h.window.dispatchEvent(new Event('online'));
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(h.calls(), 1);
});

test('全未连接时顶部动作先预览四类记录，明确确认后才连接并执行一键同步', async () => {
  const h = harness({ areas: Object.fromEntries(['profile', 'growth', 'health', 'english'].map(area => [area, { enabled: false }])) });
  await h.client.open();
  const trigger = h.document.body.querySelector('[data-sync-all]');
  assert.equal(trigger.textContent, '连接并同步'); trigger.dispatchEvent(new Event('click'));
  for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.previewedAreas, ['profile', 'growth', 'health', 'english']);
  assert.deepEqual(h.enabledAreas, []); assert.equal(h.calls(), 0);
  const preview = h.document.body.querySelector('[data-sync-connect-all]');
  const confirm = preview.children.find(child => child.tag === 'button');
  assert.equal(confirm.textContent, '确认连接全部并同步'); confirm.dispatchEvent(new Event('click'));
  for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.enabledAreas, ['profile', 'growth', 'health', 'english']);
  assert.deepEqual(h.syncedAreas, h.enabledAreas);
  assert.equal(h.document.body.querySelector('[data-sync-all]').textContent, '一键同步');
});

test('一键同步只处理已连接分类，逐项等待真实结果；失败和冲突不妨碍其余分类', async () => {
  const h = harness({ areas: { profile: { enabled: true }, growth: { enabled: true }, health: { enabled: false }, english: { enabled: true } } });
  h.onSync(async area => {
    if (area === 'profile') h.setState({ enabled: true, pending: false }, area);
    if (area === 'growth') h.setState({ enabled: true, conflict: { conflicts: [{ key: 'a' }] } }, area);
    if (area === 'english') throw Error('网络失败');
  });
  const result = await h.client.syncAll();
  assert.equal(result.ok, false);
  assert.deepEqual(h.syncedAreas, ['profile', 'growth', 'english']);
  assert.deepEqual(Array.from(result.results, item => item.status), ['synced', 'conflict', 'error']);
  assert.deepEqual(Array.from(result.skipped), ['health']);
  assert.equal((await h.client.getState('health')).enabled, false);
});

test('一键同步重复点击复用在途任务，完成后允许重试；不触发外站抓取', async () => {
  const h = harness(); let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  h.onSync(async () => { entered(); await new Promise(resolve => { release = resolve; }); });
  const first = h.client.syncAll(), second = h.client.syncAll();
  assert.equal(first, second); await started; assert.equal(h.calls(), 1);
  release(); assert.equal((await first).ok, true);
  h.onSync(async () => {}); assert.equal((await h.client.syncAll()).ok, true);
  assert.equal(h.calls(), 2); assert.equal(h.requests.length, 0);
});

test('一键同步未登录不发送记录请求，全未连接不能误报全部成功', async () => {
  const anonymous = harness({ loggedIn: false });
  assert.equal((await anonymous.client.syncAll()).results[0].status, 'auth-required');
  assert.equal(anonymous.calls(), 0);
  const disconnected = harness({ initial: { enabled: false } });
  assert.equal((await disconnected.client.syncAll()).ok, false); assert.equal(disconnected.calls(), 0);
});

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


test('找书账号每次实时读取，不要求迁入英语记录，匿名或失效会话不返回账号', async () => {
  const response = value => async () => ({ status: 200, ok: true, json: async () => ({ accounts: { epic: value } }) });
  const h = harness({ initial: { enabled: false }, bookResponses: [response('fake-one'), response('fake-two')] });
  assert.equal((await h.client.bookFinderAccounts()).accounts.epic, 'fake-one');
  assert.equal((await h.client.bookFinderAccounts()).accounts.epic, 'fake-two');
  assert.equal(h.requests.length, 2);
  for (const request of h.requests) { assert.equal(request.options.cache, 'no-store'); assert.equal(request.options.method, 'GET'); }
  const anonymous = harness({ loggedIn: false });
  await assert.rejects(anonymous.client.bookFinderAccounts(), { code: 'AUTH_REQUIRED' });
  assert.equal(anonymous.requests.length, 0);
  const expired = harness({ bookResponses: [async () => ({ status: 401 })] });
  await assert.rejects(expired.client.bookFinderAccounts(), { code: 'AUTH_REQUIRED' });
});

test('找书请求期间会话失效，先前成功响应也不得交给页面', async () => {
  let finish, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const h = harness({ bookResponses: [() => { started(); return new Promise(resolve => { finish = resolve; }); }, async () => ({ status: 401 })] });
  const first = h.client.bookFinderAccounts(); await waiting;
  await assert.rejects(h.client.bookFinderAccounts(), { code: 'AUTH_REQUIRED' });
  finish({ ok: true, status: 200, json: async () => ({ accounts: { epic: 'fake-late' } }) });
  await assert.rejects(first, { code: 'AUTH_REQUIRED' });
});
