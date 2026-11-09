import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsageReader } from '../backend/assistant-usage.mjs';

function setup(network) {
  const data = new Map(); let time = Date.parse('2026-11-09T01:00:00Z');
  const store = { async getWithMetadata(key) { return data.has(key) ? { data: data.get(key) } : null; }, async setJSON(key, value) { data.set(key, value); } };
  const env = { NETLIFY_USAGE_TOKEN: 'fake-account-token', NETLIFY_ACCOUNT_ID: 'account-id', TAVILY_API_KEY: 'fake-search-key' };
  return { read: createUsageReader({ env, store, network, now: () => time }), advance: amount => { time += amount; } };
}
test('读取账户真实积分，按平台口径展示而非本站请求数；一分钟内复用统计', async () => {
  let calls = 0;
  const state = setup(async (url, options) => {
    calls++; assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(url, 'https://api.tavily.com/usage');
    return Response.json({ key: { usage: 10, limit: 100 }, account: { current_plan: 'Free', plan_usage: 25, plan_limit: 1000, paygo_usage: 0 } });
  });
  const value = await state.read();
  assert.equal(value.netlify, undefined);
  assert.equal(value.tavily.used, 25); assert.equal(value.tavily.keyUsage, 10); assert.equal(value.tavily.keyLimit, 100);
  assert.doesNotMatch(JSON.stringify(value), /fake-account-token|fake-search-key/);
  await state.read(); assert.equal(calls, 1);
  state.advance(61000); await state.read(); assert.equal(calls, 2);
});
test('上游拒绝与字段缺失不伪装零用量，保留最近成功值并标为过期', async () => {
  let fails = false;
  const state = setup(async () => fails ? Response.json({ token: 'private' }, { status: 401 }) : Response.json({ account: { plan_usage: 0, plan_limit: 1000 } }));
  const first = await state.read(); assert.equal(first.tavily.status, 'ok');
  fails = true; state.advance(61000);
  const next = await state.read(); assert.equal(next.tavily.status, 'unavailable'); assert.equal(next.tavily.lastKnown.used, 0);
  assert.equal(next.tavily.used, undefined); assert.doesNotMatch(JSON.stringify(next), /private/);
});
test('停用Netlify用量读取；旧网关及账户凭据不触发网络请求', async () => {
  let calls = 0;
  const read = createUsageReader({ env: { NETLIFY_AI_GATEWAY_KEY: 'fake', NETLIFY_USAGE_TOKEN: 'fake', NETLIFY_ACCOUNT_ID: 'account-id' }, store: {}, network: () => { calls++; throw new Error('不得调用'); } });
  const value = await read(); assert.equal(value.netlify, undefined); assert.equal(value.tavily.status, 'unconfigured'); assert.equal(calls, 0);
});
