/* 同一公共素材资源内完全同名的可选项共享单一已读事实；不跨资源、不冒充同一正文证据。 */
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'english/data/resource-books.json');
const sourceId = 'user-optional-title-20261118';
const normalize = value => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const byResource = new Map();
for (const book of data.books || []) {
  const title = normalize(book.title);
  if (!byResource.has(book.resourceId)) byResource.set(book.resourceId, new Map());
  const groups = byResource.get(book.resourceId);
  if (!groups.has(title)) groups.set(title, []);
  groups.get(title).push(book);
}
const linked = new Set((data.readingEquivalences || []).flatMap(group => group.bookIds || []));
const next = [];
for (const [resourceId, groups] of byResource) {
  for (const [title, books] of groups) {
    if (books.length < 2 || books.some(book => linked.has(book.id))) continue;
    next.push({
      kind: 'same-title',
      resourceId,
      title: books[0].title,
      sourceIds: [sourceId],
      scope: 'same-resource-reading-choice',
      bookIds: books.map(book => book.id).sort(),
      checkedAt: '2026-11-18'
    });
  }
}
if (!next.length) {
  console.log(JSON.stringify({ added: 0, sourceId }, null, 2));
  process.exit(0);
}
if (!(data.sources || []).some(source => source.id === sourceId)) {
  data.sources.push({
    id: sourceId,
    title: '公共目录可选项的同名单册共享已读状态',
    kind: 'user-confirmed-alternative-reading',
    checkedAt: '2026-11-18',
    note: '同一resourceId内题名规范化后完全一致的多版／多目录条目视为二选一同册，共享已读事实；仅用于完成状态与阅读次数，不传播内容主题、句型证据或个人选版。'
  });
}
data.readingEquivalences = [...(data.readingEquivalences || []), ...next];
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ added: next.length, sourceId }, null, 2));
