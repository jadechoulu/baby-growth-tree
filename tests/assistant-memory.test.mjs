import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantMemory } from '../backend/assistant-memory.mjs';
import { createAssistant } from '../backend/assistant.mjs';

const conversationId = '00000000-0000-4000-8000-000000000001', requestId = '00000000-0000-4000-8000-000000000002';
function setup() {
  let data, revision = 0, conflict = false, fail = false;
  const repository = { async read() { return { data: data ? structuredClone(data) : null, revision: String(revision) }; }, async write(next, expected) {
    if (fail) throw new Error('private-token');
    if (conflict) { conflict = false; revision++; return false; }
    if (expected !== String(revision)) return false;
    data = structuredClone(next); revision++; return true;
  } };
  return { repository, memory: createAssistantMemory({ repository }), data: () => data, conflict: () => { conflict = true; }, fail: () => { fail = true; } };
}
test('保存短期摘要和家长原话，跨会话复用长期记忆；拒绝模型编造事实', async () => {
  const state = setup(); state.conflict();
  await state.memory.save({ conversationId, requestId, generation: 0, query: '宝宝喜欢动物，每天能陪读十五分钟', reply: { summary: '正在选动物绘本', memories: [{ type: 'preference', quote: '宝宝喜欢动物' }, { type: 'situation', quote: '已经自主阅读' }] }, result: { answer: '推荐先亲子共读', sources: [] } });
  const saved = await state.memory.inspect({ conversationId });
  assert.equal(saved.messages.length, 2); assert.equal(saved.facts.length, 1); assert.equal(saved.facts[0].quote, '宝宝喜欢动物');
  const other = await state.memory.inspect({ conversationId: requestId }); assert.equal(other.messages.length, 0); assert.equal(other.facts.length, 1);
  const receipt = state.data().threads[conversationId].receipts[0]; assert.equal(receipt.requestId, requestId);
});
test('忘记清除旧摘要和回执；并发完成的旧回答不能复活已删除记忆', async () => {
  const state = setup();
  await state.memory.save({ conversationId, requestId, generation: 0, query: '宝宝喜欢动物', reply: { summary: '喜欢动物', memories: [{ type: 'preference', quote: '宝宝喜欢动物' }] }, result: { answer: '好' } });
  const factId = (await state.memory.inspect()).facts[0].id;
  await state.memory.forget({ factId });
  const saved = await state.memory.inspect({ conversationId }); assert.equal(saved.facts.length, 0); assert.equal(saved.messages.length, 0);
  await assert.rejects(state.memory.save({ conversationId, requestId, generation: 0, query: '旧问题', reply: {}, result: { answer: '旧回答' } }), /MEMORY_CHANGED/);
});
test('AI同次回答保存记忆；重放不重复推理；保存失败仍返回答案', async () => {
  const state = setup(); let calls = 0, clock = 100000, budget, etag = 0;
  const store = { async getWithMetadata() { return budget ? { data: structuredClone(budget), etag: String(etag) } : null; }, async setJSON(key, value, options) { if (options.onlyIfMatch && options.onlyIfMatch !== String(etag)) return { modified: false }; budget = structuredClone(value); etag++; return { modified: true }; } };
  const app = createAssistant({ env: {}, store, repository: state.repository, index: { version: 'v1', entries: [{ id: 'animals', title: '动物', text: '动物绘本', source: '公共依据' }] }, now: () => clock,
    model: { provider: 'test', generate: async body => { calls++; const content = JSON.parse(body.messages.at(-1).content);
      if (calls > 1) { assert.equal(content.memory.facts[0].quote, '宝宝喜欢动物'); assert.equal(content.context.records, '当前记录优先'); }
      return { choices: [{ message: { content: JSON.stringify({ mode: 'answer', answer: '先看动物绘本', sourceIds: ['animals'], summary: '选动物绘本', memories: [{ type: 'preference', quote: '宝宝喜欢动物' }] }) } }] };
    } } });
  const q = { query: '宝宝喜欢动物，推荐一本', mode: 'chat', context: {}, conversationId, requestId };
  assert.equal((await app.ask(q)).memory.saved, true); assert.equal((await app.ask(q)).cached, true); assert.equal(calls, 1);
  await assert.rejects(app.ask({ ...q, query: '换个问题' }), { code: 'AI_REQUEST_CONFLICT' }); assert.equal(calls, 1);
  clock += 16000; state.fail();
  const next = await app.ask({ ...q, conversationId: '00000000-0000-4000-8000-000000000003', requestId: '00000000-0000-4000-8000-000000000004', context: { records: '当前记录优先' } });
  assert.equal(next.answer, '先看动物绘本'); assert.equal(next.memory.saved, false); assert.equal(calls, 2); assert.doesNotMatch(JSON.stringify(next), /private-token/);
});
