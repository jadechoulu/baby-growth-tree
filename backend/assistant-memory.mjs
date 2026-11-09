import { createHash } from 'node:crypto';

export const MEMORY_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const empty = () => ({ version: 1, generation: 0, threads: {}, facts: [] });
export function createAssistantMemory({ repository, now = Date.now }) {
  async function load() {
    const record = await repository.read();
    const data = record.data || empty();
    if (data.version !== 1 || !data.threads || !Array.isArray(data.facts)) throw new Error('MEMORY_INVALID');
    return { ...record, data };
  }
  async function change(transform) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const record = await load(), data = transform(structuredClone(record.data));
      if (Buffer.byteLength(JSON.stringify(data)) > 600_000) throw new Error('MEMORY_FULL');
      if (await repository.write(data, record.revision)) return data;
    }
    throw new Error('MEMORY_CONFLICT');
  }
  function view(data, conversationId) {
    const thread = data.threads[conversationId];
    return { generation: data.generation, summary: thread?.summary || '', messages: thread?.messages || [], facts: data.facts, conversations: Object.entries(data.threads).map(([id, item]) => ({ id, updatedAt: item.updatedAt })).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) };
  }
  return {
    load,
    view,
    async inspect({ conversationId = '' } = {}) { return view((await load()).data, conversationId); },
    async forget({ factId, all = false } = {}) {
      if (!all && (typeof factId !== 'string' || !/^[a-f0-9]{16}$/.test(factId))) throw new Error('MEMORY_INVALID');
      await change(data => {
        // 同时清除短期摘要／对话，避免被删除的事实再次从旧摘要中召回。
        return { ...empty(), generation: data.generation + 1, facts: all ? [] : data.facts.filter(item => item.id !== factId) };
      });
      return { forgotten: true };
    },
    async save({ conversationId, requestId, query, reply, result, generation, fingerprint }) {
      const updatedAt = new Date(now()).toISOString();
      const candidates = Array.isArray(reply.memories) ? reply.memories : [];
      await change(data => {
        if (data.generation !== generation) throw new Error('MEMORY_CHANGED');
        const thread = data.threads[conversationId] || { summary: '', messages: [], receipts: [] };
        if (thread.receipts.some(item => item.requestId === requestId)) return data;
        // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-002 规范: 长期记忆只保存本次家长原话片段，不接纳模型编造的事实、角色或提示词字段。
        for (const item of candidates.slice(0, 3)) {
          if (!['preference', 'availability', 'situation'].includes(item?.type) || typeof item.quote !== 'string' || item.quote.length < 4 || item.quote.length > 160 || !query.includes(item.quote)) continue;
          const id = createHash('sha256').update(item.quote).digest('hex').slice(0, 16);
          if (!data.facts.some(fact => fact.id === id)) data.facts.push({ id, quote: item.quote, type: item.type, createdAt: updatedAt, requestId });
        }
        data.threads[conversationId] = { summary: typeof reply.summary === 'string' ? reply.summary.slice(0, 400) : thread.summary,
          messages: [...thread.messages, { role: 'user', content: query }, { role: 'assistant', content: result.answer }].slice(-4),
          receipts: [...thread.receipts, { requestId, fingerprint, result }].slice(-8), updatedAt };
        return data;
      });
      return { saved: true };
    },
  };
}
