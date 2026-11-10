import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildKnowledge } from '../backend/assistant-knowledge.mjs';
import { STAGES, DOMAINS } from '../lib/model.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url), model = require('../english/model.js'), topics = require('../english/topics.js');
const read = async file => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
const publicJSON = value => JSON.stringify(value, (key, item) => ['originalPath', 'sourceOriginalPath'].includes(key) ? undefined : item);
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).filter(Boolean).join('；') : value && typeof value === 'object' ? Object.entries(value).filter(([key]) => !['originalPath', 'sourceOriginalPath'].includes(key)).map(([, item]) => text(item)).filter(Boolean).join('；') : '';
export async function buildSearchIndex() {
  const raw = {};
  for (const [key, file] of Object.entries({ banana: 'banana', xu: 'xu', qing: 'qing', editorial: 'editorial', resourceCovers: 'resource-covers', resourceVolumes: 'resource-volumes', resourcePrices: 'resource-prices', liaoReading: 'liao-reading', helloReading: 'hello-reading', readingPlans: 'reading-plans', resourceBooks: 'resource-books', sssSongs: 'sss-songs', topicTaxonomy: 'topic-taxonomy', routePlan: 'route-plan', xuCurrent: 'xu-current' })) raw[key] = await read('english/data/' + file + '.json');
  raw.resourceBooks = require('../english/book-progress.js').withReadingPlans(raw.resourceBooks, raw.readingPlans, raw.resourceVolumes);
  raw.xuSupplements = await Promise.all(['xu-thousand', 'xu-panorama'].map(file => read('english/data/' + file + '.json')));
  const catalog = model.normalize(raw), entries = [], knowledgeEntries = [], byResource = new Map(catalog.resources.map(item => [item.id, item]));
  const add = (section, kind, id, title, keywords, body, href, source) => {
    const item = { id: section + ':' + kind + ':' + id, section, kind, title, keywords: text(keywords), text: text(body), href, source: text(source) };
    knowledgeEntries.push(item); entries.push({ ...item, text: item.text.slice(0, 5000) });
  };
  const link = params => 'english/index.html#library?' + new URLSearchParams(params);
  for (const routeId of ['xu', 'qing']) {
    const route = catalog.routes.find(item => item.id === routeId), plan = model.getRoutePlan(catalog, routeId, 'listening');
    add('english', 'route', routeId, route.name + ' · 听力路线依据', ['路线', '阶段', '推荐'], [plan.summary, route.ageCases?.map(item => [item.label, item.ageMinMonths, item.ageMaxMonthsExclusive]), plan.flow?.advanceNote, plan.stages.map(stage => text([stage.title, stage.goal, stage.entry, stage.exit]).slice(0, 200))], link({ stage: plan.stages[0].id }), [plan.sourceId, plan.page]);
  }
  const liao = raw.liaoReading, liaoBooks = new Map([...liao.books, ...(liao.supplementaryBooks || [])].map(book => [book.id, book]));
  for (const item of catalog.resources) {
    const book = liaoBooks.get(item.liaoBookId);
    // 沿用公共素材身份，补入已整理的周次与出处，不另建廖彩杏书目或读取音频／PDF。
    add('english', 'resource', item.id, item.title, [item.aliases, item.levels, item.topics, item.type, book && ['廖彩杏', '有声书', book.references.map(ref => '第' + ref.week + '周')]], [item.text, item.appearances, book && [book.references, book.notes, book.sources, liao.recommendations.filter(relation => [...relation.from, ...relation.to].includes(book.id))]], link({ resource: item.id }), [item.appearances.map(a => [a.routeId, a.sourceId, a.page]), book?.sources]);
  }
  add('english', 'method', 'liao-listening', '廖彩杏 · 有声书聆听方法与52周安排', ['廖彩杏', '怎么用', '学习安排', '每天', '轮换', '复习', '内化'], [liao.method, liao.guidanceTopics, liao.recommendations, liao.reviews, liao.ageNote, liao.levelNote], link({ method: 'liao' }), liao.sources.map(({ id, title, note }) => [id, title, note]));
  for (const item of catalog.stages) add('english', 'stage', item.id, (catalog.routes.find(r => r.id === item.routeId)?.name || '') + ' · ' + item.title, ['路线', item.domain], [item.goal, item.entry, item.exit, item.notes, item.raw], link({ stage: item.id }), [item.sourceId, item.pages]);
  const topicNames = new Map(raw.topicTaxonomy.nodes?.map(item => [item.id, item.label]) || []);
  for (const item of raw.resourceBooks.books) add('english', 'book', item.id, item.title, [byResource.get(item.resourceId)?.title, item.edition, item.level, topics.entryTopics('book', item).map(id => topicNames.get(id) || id)], [item.learningFocus, item.topicEvidence, item.catalogNote], link({ book: item.id }), [item.edition, item.sourceIds]);
  for (const item of raw.sssSongs.songs) add('english', 'song', item.id, item.title, ['SSS', 'Super Simple Songs', '儿歌', item.scene, item.topics], [item.officialTitle, item.scene], link({ song: item.id }), item.url);
  const soundBook = raw.sssSongs.soundBook;
  for (const item of soundBook.songs) add('english', 'song', item.id, item.title, [soundBook.title, '慢葫芦', '青葫芦', '第' + item.page + '页', item.originalTitle], [soundBook.note, item.page, item.matchNote, item.titleNote, item.sssRelated, item.helloTunes], link({ song: item.id }), [soundBook.title, soundBook.isbn, '印刷第' + item.page + '页', soundBook.sources.filter(source => item.sourceIds.includes(source.id))]);
  for (const item of raw.helloReading.books) add('english', 'hello', item.id, 'Hello · ' + item.title, ['杂志', item.parts.map(part => [part.title, part.scene])], [item.parts, item.notes], link({ hello: item.id, collection: 'hello' }), raw.helloReading.editionNote);
  for (const item of raw.helloReading.rhymes) add('english', 'rhyme', item.id, item.title, ['Hello', '童谣', item.tunes], [item.extensions, item.notes], link({ hello: item.bookId, collection: 'hello' }), item.bookId);
  const guides = await read('data/skill-guides.json');
  for (const item of await read('data/catalog.json')) add('growth', 'skill', item.id, item.title, [DOMAINS.find(d => d.id === item.domain)?.label, item.category, STAGES.find(s => s.id === item.stage)?.label], guides.skills[item.id], 'index.html?area=growth#skill=' + encodeURIComponent(item.id), ['毛老师原始图谱', item.sourcePage]);
  const health = await read('data/health-standard.json');
  for (const item of health.items) add('growth', 'health', item.id, item.title, [health.domains.find(d => d.id === item.domain)?.label, item.month + '个月', '卫健委'], [item.method, item.requirement], 'health.html#item=' + encodeURIComponent(item.id), [health.standard, item.methodPage]);
  if (new Set(entries.map(item => item.id)).size !== entries.length) throw new Error('全站索引有重复身份');
  const version = createHash('sha256').update(JSON.stringify(knowledgeEntries)).digest('hex').slice(0, 16);
  return JSON.parse(publicJSON({ version, entries, knowledgeEntries, contextData: { catalog: { rawToCanonical: catalog.rawToCanonical, routes: catalog.routes, stages: catalog.stages, resources: catalog.resources, raw: { routePlan: raw.routePlan } }, resourceVolumes: raw.resourceVolumes, resourceBooks: { ...raw.resourceBooks, books: raw.resourceBooks.books.map(({ id, title, resourceId, edition, level, group, order, number, aliases, externalIds }) => ({ id, title, resourceId, edition, level, group, order, number, aliases, externalIds })) }, sssSongs: raw.sssSongs, readingPlans: raw.readingPlans, liaoReading: raw.liaoReading, helloReading: { externalIds: raw.helloReading.externalIds, books: raw.helloReading.books.map(({ id, title, xiaohuashengBookIds }) => ({ id, title, xiaohuashengBookIds })) } } }));
}
export async function writeSearchIndex() {
  const index = await buildSearchIndex();
  const { contextData, knowledgeEntries, ...publicIndex } = index;
  await writeFile(path.join(ROOT, 'shared/assistant-knowledge.json'), JSON.stringify(buildKnowledge(knowledgeEntries, index.version)));
  await writeFile(path.join(ROOT, 'shared/search-index.json'), JSON.stringify(publicIndex));
  await writeFile(path.join(ROOT, 'shared/assistant-data.json'), publicJSON(contextData));
  const modules = await Promise.all(['shared/assistant-workflow.js', 'english/model.js', 'english/practice.js', 'english/book-progress.js', 'english/vocabulary.js', 'english/shelf-library.js', 'english/library-custom.js', 'shared/assistant-context.js'].map(file => readFile(path.join(ROOT, file), 'utf8')));
  await writeFile(path.join(ROOT, 'shared/assistant-runtime.js'), '(function(root){var window={},globalThis=window,module,exports;\n' + modules.join('\n') + '\nroot.XiaoyaAssistantContext=window.XiaoyaAssistantContext;})(window);');
  return index;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('已生成全站索引：' + (await writeSearchIndex()).entries.length + ' 项');
