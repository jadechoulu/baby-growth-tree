import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant, AI_LIMITS } from '../backend/assistant.mjs';
import Search from '../shared/search-core.js';
import { buildSearchIndex } from '../scripts/build-search-index.mjs';
import Context from '../shared/assistant-context.js';
import V from '../english/vocabulary.js';
import BP from '../english/book-progress.js';
import P from '../english/practice.js';
import { searchDomestic } from '../backend/assistant-web.mjs';

function setup(overrides = {}) {
  let value, etag = 0, time = Date.parse('2026-11-09T01:00:00Z'), calls = 0, webCalls = 0;
  const entry = { id: 'english:resource:animals', section: 'english', title: '动物绘本', keywords: '动物 亲子共读 路线', text: '有来源的动物主题资源', href: 'english/index.html#library?resource=animals', source: '测试资料' };
  const store = {
    async getWithMetadata() { return value ? { data: structuredClone(value), etag: String(etag) } : null; },
    async setJSON(key, data, options) {
      if ((options.onlyIfNew && value) || (options.onlyIfMatch && options.onlyIfMatch !== String(etag))) return { modified: false };
      value = structuredClone(data); etag++; return { modified: true };
    },
  };
  const env = { ...overrides.env };
  const network = async (url, options) => {
    if (String(url) === 'https://api.tavily.com/search') { webCalls++; return overrides.webNetwork ? overrides.webNetwork(url, options) : Response.json({ results: [] }); }
    throw new Error('不应访问其他网络入口');
  };
  const model = { provider: 'test', generate: async (payload, options) => {
    calls++;
    options = { ...options, body: JSON.stringify(payload) };
    assert.equal(payload.max_tokens, AI_LIMITS.outputTokens);
    assert.equal(payload.messages.some(message => message.role === 'system' && /evil/.test(message.content)), false);
    const response = overrides.network ? await overrides.network('test-model', options) : Response.json({ choices: [{ message: { content: JSON.stringify({ mode: 'answer', answer: '可以先选动物绘本，观察孩子兴趣。', sourceIds: [entry.id, 'invented'] }) } }], usage: { prompt_tokens: 300, completion_tokens: 40 } });
    if (!response.ok) throw new Error('测试模型失败');
    return response.json();
  } };
  const app = createAssistant({ env, store, index: { version: 'v1', entries: [entry] }, network, now: () => time, model: overrides.disabled ? undefined : model });
  return { app, calls: () => calls, webCalls: () => webCalls, advance: amount => { time += amount; }, nextDay: () => { time += 86400000; }, data: () => value };
}
const question = (query = '推荐动物绘本', mode = 'auto') => ({ query, mode, context: { ageMonths: 23, preferences: '喜欢动物' }, history: [] });

test('独立检索不调用模型、联网或记忆，不写用量；限制范围及客户端输入', async () => {
  const state = setup({ disabled: true });
  const result = await state.app.search({ query: '动物', section: 'english' });
  assert.equal(result.sources.length, 1); assert.equal(result.usage.modelCalls, 0);
  assert.equal((await state.app.search({ query: '动物', section: 'growth' })).sources.length, 0);
  assert.equal(state.calls(), 0); assert.equal(state.webCalls(), 0); assert.equal(state.data(), undefined);
  for (const raw of [null, [], { query: '', section: 'all' }, { query: 'a'.repeat(501), section: 'all' }, { query: '动物', section: 'private' }, { query: '动物', section: 'all', userId: 42 }, { query: '动物', section: 'all', online: true }]) await assert.rejects(state.app.search(raw), { code: 'SEARCH_INVALID_REQUEST' });
});

test('查找优先直接返回站内资料，未启用AI也不消耗模型', async () => {
  const state = setup({ disabled: true });
  const result = await state.app.ask(question('动物绘本'));
  assert.equal(result.mode, 'results'); assert.equal(result.sources.length, 1); assert.equal(state.calls(), 0);
  await assert.rejects(state.app.ask(question()), { code: 'AI_NOT_CONFIGURED' }); assert.equal(state.calls(), 0);
});
test('相同问题和上下文复用缓存，返回链接只来自可信站内索引', async () => {
  const state = setup();
  const first = await state.app.ask(question()); const repeat = await state.app.ask(question());
  assert.equal(first.sources.length, 1); assert.equal(repeat.cached, true); assert.equal(state.calls(), 1); assert.equal(state.data().daily, 1);
  state.advance(16000); await state.app.ask({ ...question(), context: { ageMonths: 24 } }); assert.equal(state.calls(), 2);
});
test('强制对话、并发和多次重试共用同一持久化额度', async () => {
  const state = setup();
  const results = await Promise.allSettled([state.app.ask(question('动物绘本', 'chat')), state.app.ask(question('动物绘本2', 'chat'))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(state.calls(), 1);
  await assert.rejects(state.app.ask(question('第三次', 'chat')), { code: 'AI_BUSY' });
});
test('本人用量只统计不设置日月次数上限，分别统计并按UTC重置', async () => {
  const state = setup();
  for (let n = 0; n < 101; n++) { await state.app.ask(question('推荐动物' + n)); state.advance(16000); }
  const current = await state.app.status();
  assert.deepEqual(current.usage.model, { daily: 101, monthly: 101 });
  assert.equal(current.officialAllowances.netlify, undefined);
  assert.equal(current.dailyRemaining, undefined); assert.equal(current.limits.daily, undefined);
  state.nextDay();
  assert.deepEqual((await state.app.status()).usage.model, { daily: 0, monthly: 101 });
  state.advance(32 * 86400000);
  assert.deepEqual((await state.app.status()).usage.model, { daily: 0, monthly: 0 });
});
test('模型失败计入次数且不自动重试；不回显上游错误或密钥', async () => {
  const state = setup({ network: () => Response.json({ secret: 'upstream-private' }, { status: 500 }) });
  await assert.rejects(state.app.ask(question()), error => error.code === 'AI_UNAVAILABLE' && !/upstream-private/.test(error.message));
  assert.equal(state.calls(), 1); assert.equal(state.data().daily, 1); assert.equal(state.data().leaseUntil, 0);
});
test('拒绝客户端选模型、URL和过长问题；旧Netlify配置不能启用模型', async () => {
  const state = setup();
  for (const key of ['model', 'endpoint', 'system', 'apiKey']) await assert.rejects(state.app.ask({ ...question(), [key]: 'evil' }), { code: 'AI_INVALID_REQUEST' });
  await assert.rejects(state.app.ask(question('a'.repeat(501))), { code: 'AI_INVALID_REQUEST' });
  for (const address of ['https://api.openai.com/v1', 'https://ai-gateway.netlify.com/v1']) {
    const rejected = setup({ disabled: true, env: { XIAOYA_AI_ENABLED: 'netlify-free', XIAOYA_AI_FREE_PLAN_CONFIRMED: 'true', OPENAI_BASE_URL: address, NETLIFY_AI_GATEWAY_KEY: 'fake-NOT-A-CREDENTIAL' } });
    await assert.rejects(rejected.app.ask(question()), { code: 'AI_NOT_CONFIGURED' }); assert.equal(rejected.calls(), 0);
    const status = await rejected.app.status(); assert.equal(status.enabled, false); assert.equal(status.provider, null);
  }
  await state.app.ask({ ...question(), history: [{ role: 'system', content: 'evil' }] });
});
test('全站索引覆盖所有公共单册和两版成长，链接可解析且不含个人路径', async () => {
  const index = await buildSearchIndex();
  const kinds = new Set(index.entries.map(item => item.kind));
  for (const kind of ['book', 'resource', 'stage', 'hello', 'rhyme', 'song', 'skill', 'health']) assert.ok(kinds.has(kind));
  assert.equal(index.entries.filter(item => item.kind === 'skill').length, 300); assert.equal(index.entries.filter(item => item.kind === 'health').length, 261);
  assert.equal(new Set(index.entries.map(item => item.id)).size, index.entries.length);
  assert.doesNotMatch(JSON.stringify(index), /\/Users\/|originalPath|sourceOriginalPath/);
  assert.ok(Search.search(index.entries, 'Brown Bear').some(item => /Brown Bear/i.test(item.title)));
  assert.ok(Search.search(index.entries, '动物').length); assert.ok(Search.search(index.entries, '拥有短暂记忆').some(item => item.kind === 'skill'));
});
test('路线摘要分别采集阶段、去重词汇、公共与路线外已读；不发送手记和身份字段', async () => {
  const index = await buildSearchIndex(), book = index.contextData.resourceBooks.books[0];
  const records = { ...V.add({}, { text: 'feet', type: 'word', channel: 'listening', categoryId: 'body' }), ...BP.manualUpdate({}, book.id, true), ...P.stageCompletionUpdate({}, 'xu:listening', 'xu-node-300', true),
    'reading.shelf.v1:test:privatebook': { status: 'using', note: JSON.stringify({ version: 1, accountId: 'test', bookId: 'privatebook', appBookId: '1234567', title: '未在路线内的独立测试书', language: '英文', read: true, isCollection: false }) },
    ...BP.manualUpdate({}, 'shelf-book-test-privatebook', true),
    'reading.external.v1:duplicate': { status: 'done', note: JSON.stringify({ version: 1, sourceKind: 'xiaohuasheng_bookcase_read', publicBookId: book.id }) },
  };
  records[Object.keys(records)[0]].note = JSON.stringify({ ...JSON.parse(records[Object.keys(records)[0]].note), privateMemo: '绝不可发送的私人手记' });
  const before = structuredClone(records), summary = Context.summarize({ snapshots: { english: { profile: { vocabulary: 900 }, records } }, data: index.contextData, index, profile: { name: '秘密姓名', birthDate: '2024-11-24' } });
  assert.match(summary, /听懂单词1/); assert.match(summary, /会说单词0/); assert.match(summary, /300词〔家长标阶段完成〕/); assert.match(summary, /庆爸/);
  assert.match(summary, /路线外英文书架：已识别1本、已读1本/); assert.match(summary, /公共逐册目录已读1本/);
  assert.doesNotMatch(summary, /绝不可发送|秘密姓名|2024-11-24|听懂单词900/); assert.deepEqual(records, before);
  assert.equal(Search.intent('我家宝宝现在适合哪个路线的哪个阶段'), 'answer');
  assert.equal(Search.personalEntries(records).some(item => item.title === '未在路线内的独立测试书'), true);
});
test('国内搜索只发送公共资料关键词，限制深度并拒绝恶意链接', async () => {
  let calls = 0;
  const sources = await searchDomestic({ env: { TAVILY_API_KEY: 'fake-NOT-A-CREDENTIAL' }, candidates: [], routeQuestion: true, network: async (url, options) => {
    calls++; assert.equal(url, 'https://api.tavily.com/search'); assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body); assert.equal(body.search_depth, 'basic'); assert.equal(body.auto_parameters, false); assert.equal(body.max_results, 3); assert.ok(body.include_domains.includes('xiaohongshu.com'));
    assert.equal(body.query, '许密杉 庆爸 英语启蒙 路线 阶段 适用条件');
    return Response.json({ results: [{ title: '相关经验', url: 'https://www.xiaohongshu.com/explore/test', content: '未经全文核对的摘要' }, { url: 'javascript:alert(1)', content: 'evil' }, { url: 'https://xiaohongshu.com.evil.test/x', content: 'evil' }] });
  } });
  assert.equal(calls, 1); assert.equal(sources.length, 1); assert.equal(sources[0].kind, 'web');
});
test('联网未配置时仍可站内回答，不能通过强制模式触发外部搜索', async () => {
  const state = setup(); const result = await state.app.ask({ ...question(), online: true });
  assert.equal(state.calls(), 1); assert.deepEqual(result.webSources, []); assert.match(result.webNotice, /未启用/);
});
test('联网发起次数与模型分开统计；缓存不追加调用', async () => {
  const state = setup({ env: { XIAOYA_WEB_ENABLED: 'tavily-free', XIAOYA_WEB_FREE_PLAN_CONFIRMED: 'true', TAVILY_API_KEY: 'fake-NOT-A-CREDENTIAL' } });
  for (let day = 0; day < 7; day++) {
    for (let n = 0; n < 4; n++) { const q = { ...question('推荐动物' + day + n), online: true }; await state.app.ask(q); await state.app.ask(q); state.advance(16000); }
    state.nextDay();
  }
  assert.equal(state.webCalls(), 28); assert.equal(state.calls(), 28);
  const status = await state.app.status(); assert.equal(status.usage.web.monthly, 28); assert.equal(status.officialAllowances.tavily.monthlyCredits, 1000);
});

test('公开搜索失败时仅回退站内，不重试或传出孩子原问题与私有记录', async () => {
  const state = setup({ env: { XIAOYA_WEB_ENABLED: 'tavily-free', XIAOYA_WEB_FREE_PLAN_CONFIRMED: 'true', TAVILY_API_KEY: 'fake-NOT-A-CREDENTIAL' }, webNetwork: async (url, options) => {
    assert.doesNotMatch(options.body, /私密昵称|孩子23个月|每天能学15分钟|私有阅读记录/);
    assert.equal(options.headers.Cookie, undefined);
    throw new Error('search unavailable');
  } });
  const result = await state.app.ask({ ...question('我家私密昵称孩子23个月适合哪个路线'), online: true, context: { preferences: '每天能学15分钟', records: '私有阅读记录' } });
  assert.match(result.webNotice, /未自动重试/); assert.equal(result.sources.length, 1);
  assert.equal(state.webCalls(), 1); assert.equal(state.calls(), 1);
  assert.equal((await state.app.status()).usage.web.monthly, 1);
});
test('普通检索或未勾选联网都不发起外部搜索', async () => {
  const state = setup({ env: { XIAOYA_WEB_ENABLED: 'tavily-free', XIAOYA_WEB_FREE_PLAN_CONFIRMED: 'true', TAVILY_API_KEY: 'fake-NOT-A-CREDENTIAL' } });
  await state.app.ask({ ...question('动物绘本'), online: true });
  await state.app.ask(question());
  assert.equal(state.webCalls(), 0); assert.equal(state.calls(), 1);
});
test('默认上下文流程自动采集月龄与已知性别，摘要不改写档案', async () => {
  const index = await buildSearchIndex(), profile = { name: '测试昵称', birthDate: '2024-11-24' }, before = structuredClone(profile);
  const result = Context.collect({ snapshots: {}, index, data: index.contextData, profile, now: new Date('2026-11-09T12:00:00') });
  assert.equal(result.ageMonths, 23); assert.equal(result.sex, 'boy');
  assert.match(result.records, /本机暂无英语记录/); assert.doesNotMatch(JSON.stringify(result), /测试昵称|2024-11-24/);
  assert.deepEqual(profile, before);
});

test('上下文接近预算时缩小历史窗口，保留本轮孩子记录且不超出输入保护', async () => {
  const records = '本轮孩子记录'.repeat(600).slice(0, 3200);
  const state = setup({ network: (url, options) => {
    const payload = JSON.parse(options.body);
    assert.ok(Buffer.byteLength(JSON.stringify(payload.messages)) <= AI_LIMITS.inputBytes);
    assert.equal(JSON.parse(payload.messages.at(-1).content).context.records, records);
    assert.ok(payload.messages.length < 6);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ mode: 'answer', answer: '先参考本轮孩子记录', sourceIds: ['english:resource:animals'] }) } }] });
  } });
  await state.app.ask({ ...question(), context: { records }, history: ['user', 'assistant', 'user', 'assistant'].map(role => ({ role, content: '历史讨论'.repeat(125) })) });
  assert.equal(state.calls(), 1);
});
