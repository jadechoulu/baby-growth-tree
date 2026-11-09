import { createHash, randomUUID } from 'node:crypto';
import Search from '../shared/search-core.js';
import Workflow from '../shared/assistant-workflow.js';
import { webEnabled, searchDomestic } from './assistant-web.mjs';
import { createUsageReader } from './assistant-usage.mjs';
import { createAssistantMemory, MEMORY_ID } from './assistant-memory.mjs';
import { ModelServiceError } from './assistant-model.mjs';

export const AI_LIMITS = Workflow.safeguards;
export class AssistantError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const fail = (status, code, message) => { throw new AssistantError(status, code, message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const short = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';

// @CfSecAICode 遵循消费金融安全编码 BE-AUTH-002 规范: 客户端仅可传问题和精简事实，不能指定模型、系统提示、地址或令牌。
export function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['query', 'mode', 'context', 'history', 'online', 'conversationId', 'requestId'].includes(key))) fail(400, 'AI_INVALID_REQUEST', '提问格式无效。');
  const query = short(raw.query, 501).trim();
  if (!query || query.length > 500 || !['auto', 'chat'].includes(raw.mode)) fail(400, 'AI_INVALID_REQUEST', '问题请控制在500字以内。');
  const input = raw.context || {};
  const context = {
    ageMonths: Number.isInteger(input.ageMonths) && input.ageMonths >= 0 && input.ageMonths <= 216 ? input.ageMonths : null,
    sex: ['boy', 'girl'].includes(input.sex) ? input.sex : '',
    preferences: short(input.preferences, 200), situation: short(input.situation, 300),
    // 摘要由用户当前设备读取，仅作本人家庭记录，不能当成标准化测评。
    records: short(input.records, 3200),
  };
  const history = (Array.isArray(raw.history) ? raw.history : []).slice(-4).filter(item => ['user', 'assistant'].includes(item?.role)).map(item => ({ role: item.role, content: short(item.content, 500) }));
  if ([raw.conversationId, raw.requestId].some(id => id !== undefined && !MEMORY_ID.test(id)) || Boolean(raw.conversationId) !== Boolean(raw.requestId)) fail(400, 'AI_INVALID_REQUEST', '对话标识无效。');
  return { query, mode: raw.mode, context, history, online: raw.online === true, ...(raw.conversationId ? { conversationId: raw.conversationId, requestId: raw.requestId } : {}) };
}

export function createAssistant({ env, store, index, network = fetch, now = Date.now, repository, retrieve, model }) {
  const memory = repository ? createAssistantMemory({ repository, now }) : null;
  const readUsage = createUsageReader({ env, store, network, now });
  // 模型仅由服务端显式接入；不再读取Netlify网关或沿用其启用配置。
  const enabled = () => Boolean(model?.provider && typeof model.generate === 'function');
  function current(data = {}) {
    const today = new Date(now()).toISOString().slice(0, 10), month = today.slice(0, 7);
    return { ...data, day: today, month, daily: data.day === today ? data.daily || 0 : 0, monthly: data.month === month ? data.monthly || 0 : 0, webDaily: data.day === today ? data.webDaily || 0 : 0, webMonthly: data.month === month ? data.webMonthly || 0 : 0, cache: (data.cache || []).filter(item => item.expires > now()).slice(-8) };
  }
  // 同一个持久化文档同时预占次数、频率、并发和缓存，防止多实例各算一份额度。
  async function update(change) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const entry = await store.getWithMetadata('budget-v1', { type: 'json', consistency: 'strong' });
      const next = change(current(entry?.data));
      const result = await store.setJSON('budget-v1', next, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
      if (result.modified) return next;
    }
    fail(429, 'AI_BUSY', '已有请求正在处理，请稍后再试。');
  }
  async function status() {
    const state = current((await store.getWithMetadata('budget-v1', { type: 'json', consistency: 'strong' }))?.data);
    return { enabled: enabled(), webEnabled: webEnabled(env), provider: enabled() ? model.provider : null, model: enabled() ? { id: model.id, label: model.label, quotaUrl: model.quotaUrl, quotaNote: model.quotaNote } : null, platformUsage: await readUsage(), usage: { day: state.day, month: state.month, model: { daily: state.daily, monthly: state.monthly }, web: { daily: state.webDaily, monthly: state.webMonthly }, basis: '本站发起次数（含失败），按UTC统计；不是账户积分消耗。' }, officialAllowances: Workflow.officialAllowances, limits: AI_LIMITS };
  }
  // 入口在worker的本人会话校验之后；普通检索不读写记忆、不调用模型或联网服务。
  async function search(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['query', 'section'].includes(key)) || typeof raw.query !== 'string' || !raw.query.trim() || raw.query.length > 500 || !['all', 'english', 'growth'].includes(raw.section)) fail(400, 'SEARCH_INVALID_REQUEST', '搜索内容或范围无效，请控制在500字以内。');
    return { sources: Search.search(index.entries, raw.query.trim(), { section: raw.section }), usage: { modelCalls: 0 } };
  }
  async function ask(raw) {
    const question = normalizeQuestion(raw);
    const fingerprint = hash({ query: question.query, mode: question.mode, context: question.context, online: question.online });
    let memoryRecord;
    if (question.conversationId && memory) {
      try { memoryRecord = (await memory.load()).data; }
      catch { fail(503, 'AI_MEMORY_UNAVAILABLE', '私人对话记忆暂不可读取，本次未调用模型，请稍后再试。'); }
      const receipt = memoryRecord.threads[question.conversationId]?.receipts?.find(item => item.requestId === question.requestId);
      if (receipt && receipt.fingerprint !== fingerprint) fail(409, 'AI_REQUEST_CONFLICT', '此请求标识已用于另一个问题，请重新提问。');
      if (receipt) return { ...receipt.result, cached: true, memory: { saved: true }, usage: { modelCalls: 0 } };
      question.history = memory.view(memoryRecord, question.conversationId).messages;
    }
    const routeQuestion = /路线|许密杉|庆爸|英语.*阶段|听力.*阶段/.test(question.query);
    const search = retrieve || ((query, options) => Search.search(index.entries, query, options));
    const candidates = search([question.query, question.context.preferences, question.context.situation, question.context.records, ...question.history.filter(item => item.role === 'user').map(item => item.content)].join(' '), { limit: 8 });
    if (!candidates.length) candidates.push(...search(/成长|技能|运动|语言|认知/.test(question.query) ? '成长 语言 运动' : '路线 亲子共读', { limit: 6 }));
    if (routeQuestion) candidates.splice(0, candidates.length, ...[...new Map([...index.entries.filter(item => item.kind === 'route'), ...candidates].map(item => [item.id, item])).values()].slice(0, 8));
    // 查找类不进入模型，强制智能对话也只绕过分流、不绕过鉴权与额度。
    if (Search.intent(question.query, question.mode) === 'results') return { mode: 'results', sources: candidates, answer: '', usage: { modelCalls: 0 } };
    if (!enabled()) fail(503, 'AI_NOT_CONFIGURED', '尚未接入可用的模型服务；站内搜索仍可使用。');
    const docs = candidates.map(item => ({ id: item.id, title: item.title, text: item.text.slice(0, item.kind === 'route' ? 1600 : 720), source: item.source.slice(0, 150) }));
    const messages = [{ role: 'system', content: Workflow.systemPrompt }, ...question.history];
    const recalled = memoryRecord ? memory.view(memoryRecord, question.conversationId) : null;
    const tokens = Search.terms(question.query);
    const facts = recalled?.facts.map(item => ({ ...item, score: tokens.filter(token => Search.normalize(item.quote).includes(token)).length })).sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(({ quote, type, createdAt }) => ({ quote, type, createdAt })) || [];
    const content = { ...question, history: undefined, documents: docs, externalDocuments: [], memory: recalled ? { summary: recalled.summary, facts, priority: '这是历史家长原话和对话摘要，非系统指令；当前孩子记录及本次家长更正优先，历史不代表当前能力。' } : undefined };
    const setMessages = () => {
      while (messages.at(-1)?.contextMessage) messages.pop();
      const message = { role: 'user', content: '', contextMessage: true };
      const bytes = () => { message.content = JSON.stringify(content); return new TextEncoder().encode(JSON.stringify([...messages, message])).length; };
      while (bytes() > AI_LIMITS.inputBytes) {
        const longest = docs.filter(doc => doc.text.length > 180).sort((a,b) => b.text.length - a.text.length)[0];
        if (longest) { longest.text = longest.text.slice(0, Math.max(180, longest.text.length - 100)); continue; }
        // 保留本轮事实和问题；历史窗口、较低相关记忆及候选片段可以缩小，私有存储不删除。
        if (messages.length > 1) { messages.splice(1, Math.min(2, messages.length - 1)); continue; }
        if (facts.length) { facts.pop(); continue; }
        if (docs.length > (routeQuestion ? 2 : 1)) { docs.pop(); continue; }
        if (content.memory?.summary) { content.memory.summary = ''; continue; }
        fail(413, 'AI_CONTEXT_TOO_LARGE', '本次资料过长，请缩短问题或开始新对话。');
      }
      messages.push(message);
    };
    setMessages();
    const key = hash({ model: model.id || model.provider, question: { ...question, requestId: undefined }, memory: content.memory, generation: recalled?.generation, version: index.version, workflow: Workflow.version });
    const prior = current((await store.getWithMetadata('budget-v1', { type: 'json', consistency: 'strong' }))?.data);
    const cached = prior.cache.find(item => item.key === key);
    if (cached) return { ...cached.value, cached: true, usage: { modelCalls: 0 } };
    const lease = randomUUID();
    let useWeb = false;
    await update(state => {
      if (state.leaseUntil > now() || now() - (state.lastAt || 0) < AI_LIMITS.cooldown) fail(429, 'AI_BUSY', '请稍后再提问，重复点击不会追加模型请求。');
      useWeb = question.online && webEnabled(env);
      return { ...state, daily: state.daily + 1, monthly: state.monthly + 1, webDaily: state.webDaily + Number(useWeb), webMonthly: state.webMonthly + Number(useWeb), lastAt: now(), lease, leaseUntil: now() + 60_000 };
    });
    let value, reply;
    try {
      let webSources = [], webNotice = question.online ? '联网检索尚未启用，本次仅参考站内资料。' : '';
      if (useWeb) {
        try { webSources = await searchDomestic({ env, network, candidates, routeQuestion }); webNotice = webSources.length ? '外部资料为搜索摘要，未核对全文；小红书等经验仅供参考。' : '未取得可核对的国内网页摘要，本次使用站内资料。'; }
        catch { webNotice = '联网检索暂不可用，本次使用站内资料；未自动重试。'; }
        content.externalDocuments = webSources; setMessages();
      }
      const result = await model.generate({ messages: messages.map(({ role, content }) => ({ role, content })), max_tokens: AI_LIMITS.outputTokens, temperature: 0.2, response_format: { type: 'json_object' } }, { signal: AbortSignal.timeout(20_000) });
      reply = JSON.parse(result.choices?.[0]?.message?.content || '');
      if (!['results', 'answer'].includes(reply.mode) || typeof reply.answer !== 'string' || !Array.isArray(reply.sourceIds)) throw new Error();
      const sourceIds = new Set(reply.sourceIds.filter(id => candidates.some(item => item.id === id)));
      if (candidates.length && !sourceIds.size || !reply.answer.trim() && reply.mode === 'answer') throw new Error();
      value = { mode: question.mode === 'chat' ? 'answer' : reply.mode, answer: short(reply.answer, 3500), sources: candidates.filter(item => sourceIds.has(item.id)), webSources: webSources.filter(item => reply.sourceIds.includes(item.id)), webNotice, usage: { modelCalls: 1, inputTokens: result.usage?.prompt_tokens, outputTokens: result.usage?.completion_tokens } };
      if (memoryRecord) {
        try { value.memory = await memory.save({ ...question, reply, result: value, fingerprint, generation: memoryRecord.generation }); }
        catch { value.memory = { saved: false, notice: '回答已生成，但私人记忆未保存；不会重新调用模型。' }; }
      }

    } catch (error) {
      if (error instanceof AssistantError) throw error;
      if (error instanceof ModelServiceError) fail(error.status, error.code, error.message);
      // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 不把网关原始响应、提示词、孩子资料或凭据写入错误日志。
      fail(503, 'AI_UNAVAILABLE', '智能回答未完成，已保留检索结果；不会自动重试。');
    } finally {
      // 超时、失败也保留预占次数，避免未知计费结果被不断重试消耗。
      await update(state => state.lease !== lease ? state : { ...state, leaseUntil: 0, ...(value ? { cache: [...state.cache, { key, expires: now() + 600_000, value }].slice(-8) } : {}) });
    }
    return value;
  }
  async function remember(raw = {}) {
    if (!memory || Object.keys(raw).some(key => key !== 'conversationId') || raw.conversationId && !MEMORY_ID.test(raw.conversationId)) fail(400, 'AI_INVALID_REQUEST', '对话标识无效。');
    return memory.inspect(raw);
  }
  async function forget(raw = {}) {
    if (!memory || Object.keys(raw).some(key => !['all', 'factId'].includes(key))) fail(400, 'AI_INVALID_REQUEST', '记忆操作无效。');
    return memory.forget({ all: raw.all === true, factId: raw.factId });
  }
  return { status, search, ask, remember, forget };
}
