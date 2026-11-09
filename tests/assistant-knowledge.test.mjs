import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledge, createKnowledgeSearch } from '../backend/assistant-knowledge.mjs';
import { buildSearchIndex } from '../scripts/build-search-index.mjs';
import { createAssistant, AI_LIMITS } from '../backend/assistant.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('构建倒排索引保留全文后段、原始资源身份和出处；线上召回不重新整理资料', () => {
  const entry = { id: 'reference', kind: 'resource', title: '阅读资料', keywords: '亲子共读', text: '无关内容'.repeat(1500) + '晚期出现的独特检索词：星际恐龙', source: '原书第八页', href: 'english/index.html#library' };
  const data = buildKnowledge([entry], 'version');
  const restore = createKnowledgeSearch(JSON.parse(JSON.stringify(data)));
  const result = restore('星际恐龙');
  assert.equal(result.length, 1); assert.equal(result[0].id, entry.id); assert.match(result[0].text, /星际恐龙/); assert.equal(result[0].source, entry.source); assert.equal(result[0].href, entry.href);
});
test('离线知识覆盖全站公共索引，支持中文和英文检索，保留两个路线入口', async () => {
  const index = await buildSearchIndex(), data = buildKnowledge(index.knowledgeEntries, index.version), search = createKnowledgeSearch(data);
  assert.equal(new Set(data.chunks.map(item => item.parentId)).size, index.entries.length);
  assert.ok(search('Brown Bear').some(item => /Brown Bear/.test(item.title)));
  assert.equal(search('拥有短暂记忆')[0].kind, 'skill');
  const routes = search('路线 阶段', { limit: 20 }).filter(item => item.kind === 'route'); assert.equal(routes.length, 2);
  const liao = index.entries.find(item => item.title === 'My Very First Mother Goose' && item.kind === 'resource');
  assert.match(liao.text, /52周计划/); assert.match(liao.source, /liao-book-source/);
  assert.equal(index.entries.filter(item => item.kind === 'song' && item.id.includes('manhulu-9787533574901')).length, 50);
  assert.ok(search('廖彩杏 常态 每天 轮换', { limit: 8 }).some(item => item.kind === 'method'));
  assert.ok(search('慢葫芦 Rain Rain Go Away', { limit: 8 }).some(item => item.id.includes('manhulu-9787533574901-p002')));
  assert.doesNotMatch(JSON.stringify(data), /\/Users\/|originalPath|sourceOriginalPath/);
});

test('真实离线索引每次只召回至多8份资料，路线保留双依据，完整模型消息不超过预算', async () => {
  const index = await buildSearchIndex(), retrieve = createKnowledgeSearch(buildKnowledge(index.knowledgeEntries, index.version));
  let stored, calls = 0;
  const assistant = createAssistant({ env: {}, index, retrieve,
    store: { async getWithMetadata() { return stored ? { data: stored, etag: 'test' } : null; }, async setJSON(key, data) { stored = data; return { modified: true }; } },
    network: async () => { throw new Error('不允许外部网络'); },
    model: { provider: 'test', id: 'test', async generate(payload) {
      calls++;
      const content = JSON.parse(payload.messages.at(-1).content);
      assert.ok(Buffer.byteLength(JSON.stringify(payload.messages)) <= AI_LIMITS.inputBytes);
      assert.ok(content.documents.length <= 8);
      assert.equal(content.documents.filter(doc => doc.id.includes(':route:')).length, 2);
      assert.equal(content.context.records, '当前孩子摘要'.repeat(400).slice(0, 3200));
      assert.equal(content.entries, undefined); assert.equal(content.index, undefined);
      return { choices: [{ message: { content: JSON.stringify({ mode: 'answer', answer: '依据片段回答', sourceIds: [content.documents[0].id] }) } }] };
    } },
  });
  await assistant.ask({ query: '我家宝宝适合哪个路线的哪个阶段', mode: 'chat', context: { records: '当前孩子摘要'.repeat(400).slice(0, 3200) }, history: ['user', 'assistant', 'user', 'assistant'].map(role => ({ role, content: '历史讨论'.repeat(125) })) });
  assert.equal(calls, 1);
});

test('索引结果打开慢葫芦原目录与廖彩杏方法，不错跳SSS或改个人记录', async () => {
  const source = await readFile(new URL('../english/app.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function openSearchResult(entry){'), source.indexOf('window.EnglishApp='));
  const opened = [], S = { songCategory: 'all', soundBookOverlap: 'sss' }, soundSong = { id: 'manhulu-9787533574901-p002', title: 'Rain Rain Go Away' };
  const ctx = vm.createContext({ URLSearchParams, S, SSS: { resourceId: 'sss', soundBook: { songs: [soundSong] } }, closeModal() {}, render() {}, findSong: () => soundSong, openModal: (...args) => opened.push(args), libraryCollection: 'all' });
  vm.runInContext(fn, ctx);
  await ctx.openSearchResult({ href: 'english/index.html#library?song=' + soundSong.id });
  assert.equal(S.songCategory, 'soundBook'); assert.equal(S.soundBookOverlap, 'all'); assert.equal(S.songSearch, soundSong.title);
  await ctx.openSearchResult({ href: 'english/index.html#library?method=liao' });
  assert.equal(ctx.libraryCollection, 'liao'); assert.equal(S.view, 'library');
  assert.deepEqual(opened, [['sss-songs', 'sss'], ['liao-method']]);
});
