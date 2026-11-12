import test from 'node:test';
import assert from 'node:assert/strict';
import { importXhsSnapshot } from '../backend/xiaohuasheng-import.mjs';
import { createWorker } from '../worker/index.mjs';
import Sync from '../english/xiaohuasheng-sync.js';
import Shelf from '../english/shelf-library.js';
import publicData from '../shared/assistant-data.json' with { type: 'json' };
import { readFile } from 'node:fs/promises';

const before = () => ({ version: 1, profile: { vocabulary: 83, mode: 'audio' }, favorites: [], records: { 'reading.book.v1:public-one': { status: 'done', note: '手工保留' }, 'practice.stage.v1:stage': { status: 'done', note: '阶段独立完成' } } });
const context = { readingPlans: { plans: [] }, resourceBooks: { books: [{ id: 'public-one', resourceId: 'series', title: 'One', externalIds: { xiaohuasheng: ['guid-one'] } }] }, resourceVolumes: { series: [] }, liaoReading: { books: [] }, catalog: { resources: [] }, helloReading: {} };
const snapshot = () => ({ schemaVersion: 1, sourceKind: 'xiaohuasheng_bookcase_read', transport: 'xiaohuasheng-app-api', predicate: 'readedFlag=1', accountId: '42', snapshotId: 'xhs-one', fetchedAt: '2026-11-12T02:00:00Z', complete: true, authenticated: true, advertisedCount: 1, actualUniqueCount: 1, wholeBookcaseCount: 2, books: [{ bookId: 'guid-one', appBookId: '1', title: 'One', readCount: 4 }], shelfCatalog: { version: 1, complete: true, total: 2, books: [{ bookId: 'guid-one', appBookId: '1', title: 'One', language: '英文', read: true, isCollection: false }, { bookId: 'guid-two', appBookId: '2', title: 'Two', language: '英文', read: false, isCollection: false }], collections: [] } });

test('后台与页面用同一导入结果，先备份再条件保存，保留手工、阶段与档案', async () => {
  let saved, backups = [], calls = [];
  const source = before(), value = snapshot();
  const result = await importXhsSnapshot(value, { context, repository: {
    async read() { calls.push('read'); return { snapshot: source, revision: 'a'.repeat(40) }; },
    async write(next, sha) { calls.push('write'); assert.equal(sha, 'a'.repeat(40)); saved = next; return { snapshot: next, revision: 'b'.repeat(40) }; },
  }, backup: async data => { calls.push('backup'); backups.push(structuredClone(data)); } });
  assert.deepEqual(calls, ['read', 'backup', 'write']); assert.equal(result.saved, true);
  const expected = Sync.prepareImport(source.records, value, (records, data) => Shelf.apply(records, data, { plans: context.readingPlans, directory: context.resourceBooks, catalog: context.resourceVolumes, resources: [], liao: context.liaoReading, sourcePriority: true }));
  assert.deepEqual(saved, { ...source, records: { ...source.records, ...expected.changes } });
  assert.deepEqual(backups, [source]);
  assert.equal(JSON.parse(saved.records['reading.external.v1:42:guid-one'].note).readCount, 4);
  assert.equal(saved.records['reading.book.v1:public-one'].note, '手工保留');
  assert.ok(saved.records['reading.shelf.v1:42:guid-two']);
});

test('SHA冲突后重新读取、备份、重新派生，不覆盖另一设备的新编辑；失败或晚到旧快照不保存', async () => {
  let current = before(), reads = 0, writes = 0, backups = [];
  const repository = {
    async read() { reads++; return { snapshot: current, revision: String(reads).repeat(40) }; },
    async write(next) {
      writes++;
      if (writes === 1) { current = structuredClone(current); current.records['private-new'] = { status: 'using', note: '另一设备的新手记' }; throw Object.assign(new Error(), { code: 'VERSION_CONFLICT' }); }
      assert.deepEqual(next.records['private-new'], current.records['private-new']);
      return { snapshot: next, revision: 'c'.repeat(40) };
    },
  };
  await importXhsSnapshot(snapshot(), { context, repository, backup: async data => { backups.push(structuredClone(data)); } });
  assert.equal(writes, 2); assert.equal(backups.length, 2); assert.ok(backups[1].records['private-new']);
  const fresh = Sync.prepareImport(current.records, { ...snapshot(), fetchedAt: '2026-11-13T02:00:00Z' }, (records, data) => Shelf.apply(records, data, { plans: context.readingPlans, directory: context.resourceBooks, catalog: context.resourceVolumes }));
  current.records = { ...current.records, ...fresh.changes };
  await assert.rejects(importXhsSnapshot(snapshot(), { context, repository, backup: async () => assert.fail('旧快照不应备份或写回') }), { code: 'STALE_SNAPSHOT' });
  assert.equal(writes, 2);
});

test('未连接、异账号、缺页、备份失败及缺保存回执均不能报成功', async () => {
  let writes = 0;
  const repository = { read: async () => ({ snapshot: before(), revision: 'a'.repeat(40) }), write: async next => { writes++; return { snapshot: next, revision: null }; } };
  await assert.rejects(importXhsSnapshot(snapshot(), { context, repository: { read: async () => ({ snapshot: null, revision: null }) } }), /XHS_CONNECTION_REQUIRED/);
  const source = before(); source.records['reading.shelf.v1:999:old'] = { status: 'using', note: JSON.stringify({ accountId: '999' }) };
  await assert.rejects(importXhsSnapshot(snapshot(), { context, repository: { read: async () => ({ snapshot: source, revision: 'a'.repeat(40) }) } }), { code: 'ACCOUNT_MISMATCH' });
  await assert.rejects(importXhsSnapshot({ ...snapshot(), complete: false }, { context, repository }), { code: 'INCOMPLETE' });
  await assert.rejects(importXhsSnapshot(snapshot(), { context, repository, backup: async () => { throw Error('备份失败'); } }), /备份失败/);
  assert.equal(writes, 0);
  await assert.rejects(importXhsSnapshot(snapshot(), { context, repository, backup: async () => {} }), /XHS_SAVE_NOT_CONFIRMED/);
});

test('服务端英语保存复用固定路径、私有仓核对与SHA，不创建空记录或改写其他分类', async () => {
  let isPrivate = true, writes = 0;
  const env = { GITHUB_DATA_REPO: 'owner/records', GITHUB_DATA_BRANCH: 'main', GITHUB_DATA_TOKEN: 'fake-token' };
  const worker = createWorker({ fetch: async (url, options) => {
    if (url === 'https://api.github.com/repos/owner/records') return Response.json({ private: isPrivate });
    assert.equal(url, 'https://api.github.com/repos/owner/records/contents/records/english.json');
    assert.equal(options.method, 'PUT'); const body = JSON.parse(options.body); assert.equal(body.sha, 'a'.repeat(40));
    assert.equal(JSON.parse(Buffer.from(body.content, 'base64')).records['practice.stage.v1:stage'].status, 'done'); writes++;
    return Response.json({ content: { sha: 'b'.repeat(40) } });
  } });
  const repository = worker.englishRepository(env);
  await assert.rejects(repository.write(before(), null), { code: 'INVALID_REVISION' });
  assert.equal((await repository.write(before(), 'a'.repeat(40))).revision, 'b'.repeat(40));
  isPrivate = false; await assert.rejects(repository.write(before(), 'a'.repeat(40)), { code: 'PRIVATE_REPO_REQUIRED' });
  assert.equal(writes, 1);
});

test('定时配置只在北京时间03:00和10:00触发，使用公共后台任务入口', async () => {
  const source = await readFile(new URL('../backend/netlify/functions/xiaohuasheng-scheduled.mjs', import.meta.url), 'utf8');
  assert.match(source, /schedule: '0 2,19 \* \* \*'/);
  const localHours = [2, 19].map(hour => (hour + 8) % 24).sort((a, b) => a - b);
  assert.deepEqual(localHours, [3, 10]);
  assert.match(source, /await service\.start\(\)/);
});

test('服务端使用的公共目录逐本身份与同册等价关系保持完整', async () => {
  const raw = JSON.parse(await readFile(new URL('../english/data/resource-books.json', import.meta.url), 'utf8'));
  assert.deepEqual(publicData.resourceBooks.readingEquivalences, raw.readingEquivalences);
  for (const book of raw.books) {
    const projected = publicData.resourceBooks.books.find(item => item.id === book.id);
    assert.deepEqual(projected.externalIds, book.externalIds, book.id);
  }
});
