import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantModel } from '../backend/assistant-model.mjs';
import { createAssistant } from '../backend/assistant.mjs';

const payload = { messages: [{ role: 'system', content: '仅依据资料输出JSON' }, { role: 'user', content: '前一个问题' }, { role: 'assistant', content: '前一个答案' }, { role: 'user', content: '本轮孩子摘要' }], max_tokens: 99999, model: '付费模型', tools: ['不可调用'] };
const reply = JSON.stringify({ mode: 'answer', answer: '先从已有绘本开始。', sourceIds: ['book'] });
const envFor = provider => ({ XIAOYA_AI_ENABLED: provider + '-free', XIAOYA_AI_FREE_PLAN_CONFIRMED: 'true', ...(provider === 'bailian' ? { DASHSCOPE_API_KEY: 'fake-bailian-key', XIAOYA_BAILIAN_FREE_ONLY_CONFIRMED: 'true' } : { GEMINI_API_KEY: 'fake-gemini-key', XIAOYA_GEMINI_DATA_USE_CONFIRMED: 'true' }) });

test('默认关闭；旧Netlify配置、缺密钥或未确认免费保护均不能启用模型', () => {
  for (const env of [{}, { XIAOYA_AI_ENABLED: 'netlify-free', NETLIFY_AI_GATEWAY_KEY: 'fake' },
    { ...envFor('bailian'), XIAOYA_BAILIAN_FREE_ONLY_CONFIRMED: '' }, { ...envFor('bailian'), DASHSCOPE_API_KEY: '' },
    { ...envFor('gemini'), XIAOYA_GEMINI_DATA_USE_CONFIRMED: '' }, { ...envFor('gemini'), XIAOYA_AI_FREE_PLAN_CONFIRMED: '' }]) {
    assert.equal(createAssistantModel({ env, network: () => assert.fail('不得调用网络') }), null);
  }
});

test('百炼固定北京模型和官方入口，关闭思考与联网，覆盖请求中的模型及输出上限', async () => {
  let calls = 0;
  const model = createAssistantModel({ env: envFor('bailian'), network: async (url, options) => {
    calls++; assert.equal(url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, 'Bearer fake-bailian-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'qwen3.8-flash'); assert.equal(body.max_tokens, 600);
    assert.equal(body.enable_thinking, false); assert.equal(body.preserve_thinking, false); assert.equal(body.tools, undefined);
    assert.deepEqual(body.messages, payload.messages); assert.equal(body.response_format.type, 'json_object');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: reply } }], usage: { prompt_tokens: 70, completion_tokens: 20 } });
  } });
  assert.equal(model.provider, 'bailian'); assert.equal((await model.generate(payload)).choices[0].message.content, reply); assert.equal(calls, 1);
});

test('Gemini映射系统规则与多轮角色，过滤思考内容并保留平台Token统计', async () => {
  const signal = AbortSignal.timeout(1000);
  const model = createAssistantModel({ env: envFor('gemini'), network: async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(options.signal, signal); assert.equal(options.headers['x-goog-api-key'], 'fake-gemini-key'); assert.doesNotMatch(url, /key=/);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.contents.map(item => item.role), ['user', 'model', 'user']);
    assert.equal(body.systemInstruction.parts[0].text, payload.messages[0].content);
    assert.equal(body.generationConfig.responseMimeType, 'application/json'); assert.equal(body.generationConfig.maxOutputTokens, 600);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL'); assert.equal(body.tools, undefined);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: '隐藏思考' }, { text: reply }] } }], usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 25 } });
  } });
  const result = await model.generate(payload, { signal });
  assert.equal(result.choices[0].message.content, reply); assert.deepEqual(result.usage, { prompt_tokens: 80, completion_tokens: 25 });
  assert.doesNotMatch(JSON.stringify(result), /隐藏思考|fake-gemini-key/);
});

test('限流、额度拒绝与授权失败只发起一次请求，不泄露上游错误或凭据', async () => {
  for (const status of [401, 402, 403, 429, 500]) {
    let calls = 0;
    const model = createAssistantModel({ env: envFor('bailian'), network: async () => { calls++; return Response.json({ error: 'private-secret-response' }, { status }); } });
    await assert.rejects(model.generate(payload), error => error.code.startsWith('AI_') && !/private-secret-response|fake-bailian-key/.test(error.message));
    assert.equal(calls, 1);
  }
});

test('输出截断或安全拒绝不能当作完整答案，不自动续写', async () => {
  for (const provider of ['bailian', 'gemini']) {
    let calls = 0;
    const model = createAssistantModel({ env: envFor(provider), network: async () => { calls++; return Response.json(provider === 'bailian' ? { choices: [{ finish_reason: 'length', message: { content: reply } }] } : { candidates: [{ finishReason: 'SAFETY' }] }); } });
    await assert.rejects(model.generate(payload), { code: 'AI_INCOMPLETE' }); assert.equal(calls, 1);
  }
});

test('真实适配器进入共用助手流程；普通检索不调用，额度错误保留次数并释放并发', async () => {
  const env = envFor('bailian'); let data, calls = 0;
  const store = { async getWithMetadata() { return data ? { data: structuredClone(data), etag: '1' } : null; }, async setJSON(key, value) { data = structuredClone(value); return { modified: true }; } };
  const model = createAssistantModel({ env, network: async () => { calls++; return new Response('', { status: 429 }); } });
  const app = createAssistant({ env, store, index: { version: 'test', entries: [{ id: 'book', title: '绘本', text: '绘本使用依据', source: '原资料' }] }, model });
  const q = { query: '绘本', mode: 'auto', context: {} };
  assert.equal((await app.ask(q)).mode, 'results'); assert.equal(calls, 0);
  await assert.rejects(app.ask({ ...q, mode: 'chat' }), { code: 'AI_RATE_LIMITED' });
  assert.equal(calls, 1); assert.equal(data.daily, 1); assert.equal(data.leaseUntil, 0);
  const state = await app.status(); assert.equal(state.model.id, 'bailian:qwen3.8-flash');
  assert.doesNotMatch(JSON.stringify(state), /fake-bailian-key|generate/);
});
