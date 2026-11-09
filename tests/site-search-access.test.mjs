import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import Search from '../shared/search-core.js';

const source = await readFile(new URL('../shared/site-search.js', import.meta.url), 'utf8');
const settle = async () => { for (let n = 0; n < 12; n++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// 只模拟DOM事件边界，验证鉴权、私人读取顺序与退出时迟到请求的业务行为。
function harness({ authenticated = true, search, memory, ask, getQuery } = {}) {
  const elements = [], calls = [], asked = deferred();
  class Element extends EventTarget {
    constructor(tag) { super(); this.tag = tag; this.children = []; this.value = ''; elements.push(this); }
    set textContent(value) { this.children = [String(value)]; }
    get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
  }
  const document = Object.assign(new EventTarget(), { createElement: tag => new Element(tag), body: new Element('body'), head: new Element('head') });
  const storage = new Map();
  let authListener;
  const client = {
    getState: async () => ({ authenticated }),
    subscribe(callback) { authListener = callback; },
    async searchAssistant(payload) { calls.push('search'); return search ? search(payload) : { sources: [{ id: 'public', title: '动物绘本', kind: 'book', section: 'english', href: 'english/index.html#library', keywords: '动物', text: '' }] }; },
    async readAssistantRecords() { calls.push('records'); return { english: { records: { 'library.custom.v1:test': { note: JSON.stringify({ version: 1, title: '动物私人书' }) } } } }; },
    async assistantStatus() { calls.push('status'); return {}; },
    async assistantMemory() { calls.push('memory'); return memory ? memory() : { messages: [], facts: [] }; },
    async askAssistant(payload) { calls.push('ask'); asked.resolve(); return ask(payload); },
  };
  const window = { XiaoyaSync: { createClient: () => client }, XiaoyaSite: { icon: () => new Element('svg') }, XiaoyaSearchCore: Search, XiaoyaAssistantWorkflow: { officialAllowances: { tavily: {} } }, XiaoyaAssistantContext: { collect: () => ({ records: '当前摘要' }) }, XIAOYA_ASSISTANT_DATA: {}, XIAOYA_SEARCH_INDEX: { entries: [] } };
  vm.runInNewContext(source, { window, document, crypto: webcrypto, TextEncoder, URL, Event, setTimeout, clearTimeout, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  window.XiaoyaSiteSearch.create({ profileClient: { get: () => ({}) }, getQuery });
  const byClass = cls => elements.find(el => el.className?.split(' ').includes(cls));
  const input = elements.find(el => el.tag === 'input');
  const scope = elements.find(el => el.tag === 'select'); scope.value = 'all';
  return { calls, input, byClass, asked: asked.promise, open: options => window.XiaoyaSiteSearch.open(options), async submit(query) { input.value = query; byClass('site-search-form').dispatchEvent(new Event('submit')); await settle(); }, logout() { authenticated = false; authListener('auth'); } };
}

test('分类搜索按钮带入当前问题并提交，路线比较进入AI；普通书名只检索站内', { timeout: 5000 }, async () => {
  let current = '许密杉和庆爸', payload;
  const h = harness({ getQuery: () => current, ask: async value => { payload = value; return { mode: 'answer', answer: '路线对比', sources: [] }; } });
  await settle(); h.calls.length = 0;
  h.byClass('site-search-trigger').dispatchEvent(new Event('click')); await h.asked; await settle();
  assert.equal(h.input.value, current); assert.equal(payload.query, current);
  assert.equal(h.calls.filter(call => call === 'ask').length, 1);
  current = '动物'; h.calls.length = 0;
  h.byClass('site-search-trigger').dispatchEvent(new Event('click')); await settle();
  assert.equal(h.input.value, '动物'); assert.ok(h.calls.includes('search')); assert.ok(!h.calls.includes('ask'));
  assert.equal(h.byClass('site-search-answer').hidden, true);
});

test('顶部回车入口共用本人鉴权，未登录不能通过传入问题调用模型', async () => {
  const h = harness({ authenticated: false }); await settle();
  h.open({ query: '许密杉和庆爸，哪个适合我家娃', submit: true }); await settle();
  assert.deepEqual(h.calls, []); assert.match(h.byClass('site-search-status').textContent, /仅限本人 GitHub/);
});

test('匿名的普通搜索与强制AI均不请求服务、不读取私人书架或记忆', async () => {
  const h = harness({ authenticated: false }); await settle();
  await h.submit('动物');
  h.byClass('site-search-ai').dispatchEvent(new Event('click')); await settle();
  h.byClass('site-search-memory').open = true;
  h.byClass('site-search-memory').dispatchEvent(new Event('toggle')); await settle();
  assert.deepEqual(h.calls, []);
  assert.match(h.byClass('site-search-status').textContent, /仅限本人 GitHub/);
});

test('本人先获得服务端检索授权，再临时合并本机书架，不发模型调用', async () => {
  const h = harness(); await settle(); h.calls.length = 0;
  await h.submit('动物');
  assert.deepEqual(h.calls, ['search', 'records']);
  assert.match(h.byClass('site-search-results').textContent, /动物绘本/);
  assert.match(h.byClass('site-search-results').textContent, /动物私人书/);
  assert.equal(h.byClass('site-search-mode').textContent, '站内检索 · 未调用AI');
});

test('推荐问题标明AI进行中与回答完成，编辑为普通检索后隐藏旧回答', { timeout: 5000 }, async () => {
  const answered = deferred(), h = harness({ ask: () => answered.promise });
  await settle(); await h.submit('推荐动物'); await h.asked;
  assert.equal(h.byClass('site-search-mode').textContent, 'AI回答中…');
  answered.resolve({ mode: 'answer', answer: '推荐答案', sources: [] }); await settle();
  assert.equal(h.byClass('site-search-mode').textContent, 'AI已回答');
  assert.equal(h.byClass('site-search-answer').hidden, false);
  await h.submit('动物');
  assert.equal(h.byClass('site-search-mode').textContent, '站内检索 · 未调用AI');
  assert.equal(h.byClass('site-search-answer').hidden, true);
});

test('模型未配置时明确标示未启用，保留站内结果；缓存回答不冒充新的模型调用', { timeout: 5000 }, async () => {
  const unavailable = harness({ ask: async () => { throw Object.assign(new Error('模型尚未配置'), { code: 'AI_NOT_CONFIGURED' }); } });
  await settle(); await unavailable.submit('推荐动物'); await unavailable.asked; await settle();
  assert.equal(unavailable.byClass('site-search-mode').textContent, 'AI未启用 · 展示站内结果');
  assert.match(unavailable.byClass('site-search-status').textContent, /本次未生成AI回答/);
  assert.match(unavailable.byClass('site-search-results').textContent, /动物绘本/);
  const cached = harness({ ask: async () => ({ mode: 'answer', cached: true, answer: '缓存答案', sources: [] }) });
  await settle(); await cached.submit('推荐动物'); await cached.asked; await settle();
  assert.equal(cached.byClass('site-search-mode').textContent, 'AI历史回答 · 本次未调用模型');
});

test('模型选择仅展示资源时，仍说明已经过AI判断', { timeout: 5000 }, async () => {
  const h = harness({ ask: async () => ({ mode: 'results', sources: [], usage: { modelCalls: 1 } }) });
  await settle(); await h.submit('推荐动物'); await h.asked; await settle();
  assert.equal(h.byClass('site-search-mode').textContent, 'AI已判断 · 展示站内内容');
  assert.equal(h.byClass('site-search-answer').hidden, true);
});

test('服务端拒绝旧会话后不退回本机检索或读取私人数据', async () => {
  const h = harness({ search: async () => { throw Object.assign(new Error('登录已过期'), { code: 'AUTH_REQUIRED' }); } });
  await settle(); h.calls.length = 0; await h.submit('动物');
  assert.deepEqual(h.calls, ['search']); assert.equal(h.byClass('site-search-results').textContent, '');
  assert.match(h.byClass('site-search-status').textContent, /登录本人 GitHub/);
});

test('退出后拒绝迟到搜索结果，且不继续读取私人书架', async () => {
  const pending = deferred(), h = harness({ search: () => pending.promise });
  await settle(); h.calls.length = 0; await h.submit('动物'); h.logout();
  pending.resolve({ sources: [{ id: 'late', title: '动物迟到结果' }] }); await settle();
  assert.deepEqual(h.calls, ['search']); assert.equal(h.byClass('site-search-results').textContent, '');
});

test('退出立即清空私人结果，迟到记忆与AI回答不能恢复展示', { timeout: 5000 }, async () => {
  const remembered = deferred(), answered = deferred();
  const h = harness({ memory: () => remembered.promise, ask: () => answered.promise });
  await settle(); await h.submit('动物');
  assert.match(h.byClass('site-search-results').textContent, /动物私人书/);
  h.byClass('site-search-memory').open = true; h.byClass('site-search-memory').dispatchEvent(new Event('toggle'));
  h.input.value = '推荐动物'; h.byClass('site-search-ai').dispatchEvent(new Event('click')); await settle();
  await h.asked;
  assert.ok(h.calls.includes('ask')); h.logout();
  remembered.resolve({ messages: [{ role: 'assistant', content: '私人历史回答' }], facts: [{ quote: '私人偏好' }] });
  answered.resolve({ mode: 'answer', answer: '私人迟到回答', sources: [] }); await settle();
  assert.equal(h.byClass('site-search-results').textContent, '');
  assert.equal(h.byClass('site-search-answer').textContent, '');
  assert.equal(h.byClass('site-search-memory').textContent, '对话与记忆');
});
