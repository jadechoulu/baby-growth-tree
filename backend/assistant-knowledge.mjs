import MiniSearch from '../vendor/minisearch/index.cjs';
import Search from '../shared/search-core.js';

const options = { fields: ['title', 'keywords', 'text'], tokenize: Search.terms, processTerm: term => term, searchOptions: { boost: { title: 4, keywords: 2 }, combineWith: 'OR' } };
// 构建时分段并创建倒排索引，线上只恢复索引并召回片段，不调用模型整理全站资料。
export function buildKnowledge(entries, version) {
  const chunks = [];
  for (const item of entries) {
    const body = item.text || item.title;
    for (let offset = 0; offset < body.length; offset += 600) chunks.push({ ...item, id: item.id + ':chunk:' + offset, parentId: item.id, text: body.slice(offset, offset + 720) });
  }
  const index = new MiniSearch(options); index.addAll(chunks);
  return { version, engine: 'minisearch@7.2.0', chunks, index: index.toJSON() };
}
export function createKnowledgeSearch(data) {
  const index = MiniSearch.loadJS(data.index, options), byId = new Map(data.chunks.map(item => [item.id, item]));
  return (query, { limit = 8 } = {}) => {
    const results = [], seen = new Set();
    for (const result of index.search(query)) {
      const chunk = byId.get(result.id);
      if (seen.has(chunk.parentId)) continue;
      seen.add(chunk.parentId);
      results.push({ ...chunk, id: chunk.parentId, passageId: chunk.id, score: result.score });
      if (results.length === limit) break;
    }
    return results;
  };
}
