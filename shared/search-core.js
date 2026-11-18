(function (root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function terms(query) {
    const text = normalize(query).replace(/请问|帮我|宝宝|孩子|有没有|有哪些|推荐|适合|搜索|查找|资源|安排|总结/g, ' ');
    const result = new Set();
    for (const part of text.split(/\s+/).filter(Boolean)) {
      result.add(part);
      if (/[\u3400-\u9fff]/.test(part) && part.length > 2) for (let i = 0; i < part.length - 1; i++) result.add(part.slice(i, i + 2));
    }
    return [...result];
  }
  function search(entries, query, { limit = 18, section = 'all' } = {}) {
    const q = normalize(query), tokens = terms(query);
    if (!q) return [];
    return entries.filter(entry => section === 'all' || entry.section === section).map(entry => {
      const title = normalize(entry.title), keywords = normalize(entry.keywords), text = normalize(entry.text);
      let score = title === q ? 120 : title.startsWith(q) ? 90 : title.includes(q) ? 60 : 0;
      for (const token of tokens) score += title.includes(token) ? 12 : keywords.includes(token) ? 7 : text.includes(token) ? 2 : 0;
      return { ...entry, score };
    }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || Number(a.kind === 'personal') - Number(b.kind === 'personal') || a.id.localeCompare(b.id)).slice(0, limit);
  }
  function intent(query, mode = 'auto') {
    if (mode === 'chat') return 'answer';
    const routeComparison = /许密杉/.test(query) && /庆爸/.test(query) && /和|与|还是|vs\b/i.test(query);
    return routeComparison || /推荐|怎么|如何|为什么|计划|安排|路线|阶段|总结|复盘|下一步|适合|偏好|喜欢|不喜欢|根据|比较|对比|区别|哪个好|哪个更|哪条|每天|本周/.test(query) ? 'answer' : 'results';
  }
  function personalEntries(records = {}) {
    return Object.entries(records).flatMap(([id, record]) => {
      if (!id.startsWith('library.custom.v1:') && !id.startsWith('reading.shelf.v1:')) return [];
      let item; try { item = JSON.parse(record.note); } catch { return []; }
      if (item.version !== 1 || typeof item.title !== 'string' || item.deleted) return [];
      const shelf = id.startsWith('reading.shelf.v1:');
      if (shelf && (record.status !== 'using' || item.language !== '英文' || item.isCollection)) return [];
      const params = new URLSearchParams(shelf ? { shelf: item.bookId, collection: 'other' } : { custom: id, collection: 'other' });
      return [{ id: 'english:personal:' + id, title: item.title, section: 'english', kind: 'personal', keywords: [item.series?.title, ...(item.topics || [])].filter(Boolean).join(' '), text: '', href: 'english/index.html#library?' + params }];
    });
  }
  const api = { normalize, terms, search, intent, personalEntries };
  root.XiaoyaSearchCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
