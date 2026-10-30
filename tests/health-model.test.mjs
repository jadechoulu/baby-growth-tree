import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import M from '../shared/sync-model.js';
import { HEALTH_MONTHS, HEALTH_DOMAINS, HEALTH_STAGES, healthStage, stageHealthItems, completeHealthStage, nextHealthItems, referenceMonth, filterHealth, observationStats, emptyHealth, validateHealthBackup } from '../lib/health-model.mjs';

const source = JSON.parse(await readFile(new URL('../data/health-standard.json', import.meta.url), 'utf8'));

test('阶段全部完成覆盖五能区，保留已有日期手记，不修改其他阶段或输入', () => {
  const before = { ...emptyHealth(), records: {
    'wst580-146': { status: 'observed', observedAt: '2026-09-01', note: '已有观察' },
    'wst580-147': { status: 'not-yet', observedAt: '2026-09-02', note: '保留手记' },
    'wst580-165': { status: 'not-yet', note: '下一阶段' },
  } };
  const original = structuredClone(before), stage = healthStage(27);
  const after = completeHealthStage(before, source.items, stage, '2026-10-30');
  for (const item of stageHealthItems(source.items, stage)) assert.equal(after.records[item.id].status, 'observed');
  assert.deepEqual(after.records['wst580-146'], before.records['wst580-146']);
  assert.deepEqual(after.records['wst580-147'], { status: 'observed', observedAt: '2026-10-30', note: '保留手记' });
  assert.deepEqual(after.records['wst580-165'], before.records['wst580-165']);
  assert.deepEqual(before, original);
  assert.deepEqual(completeHealthStage(after, source.items, stage, '2026-10-31'), after);
  assert.equal(Object.keys(completeHealthStage(null, source.items, stage, '2026-10-30').records).length, stageHealthItems(source.items, stage).length);
  const recommendations = nextHealthItems(source.items, after.records, stage);
  assert.ok(recommendations.every(item => item.month < stage.min || item.month > stage.max));
  assert.ok(recommendations.some(item => item.month > stage.max));
});

test('单能区全部完成仅覆盖指定阶段能区，保留日期手记与其他记录', () => {
  const before = { ...emptyHealth(), records: {
    'wst580-146': { status: 'observed', observedAt: '2026-09-01', note: '已有观察' },
    'wst580-147': { status: 'not-yet', note: '保留手记' },
    'wst580-148': { status: 'not-yet', note: '同阶段其他能区' },
    'wst580-165': { status: 'not-yet', note: '下一阶段' },
  } };
  const original = structuredClone(before), stage = healthStage(27);
  const after = completeHealthStage(before, source.items, stage, '2026-10-30', 'gross');
  const targets = stageHealthItems(source.items, stage).filter(item => item.domain === 'gross');
  assert.ok(targets.length > 1);
  for (const item of targets) assert.equal(after.records[item.id].status, 'observed');
  assert.deepEqual(after.records['wst580-146'], before.records['wst580-146']);
  assert.deepEqual(after.records['wst580-147'], { status: 'observed', observedAt: '2026-10-30', note: '保留手记' });
  for (const item of source.items.filter(item => !targets.includes(item))) assert.deepEqual(after.records[item.id], before.records[item.id]);
  assert.deepEqual(before, original);
  assert.deepEqual(completeHealthStage(after, source.items, stage, '2026-10-31', 'gross'), after);
  const empty = completeHealthStage(null, source.items, stage, '2026-10-30', 'fine');
  assert.deepEqual(Object.keys(empty.records), stageHealthItems(source.items, stage).filter(item => item.domain === 'fine').map(item => item.id));
});

test('阅读区间无遗漏或重复，保留每项标准月龄和旧月龄入口', () => {
  assert.equal(healthStage(21).label, '19–24个月');
  assert.equal(healthStage(24).id, healthStage(21).id);
  assert.equal(healthStage(27).label, '25–30个月');
  assert.equal(healthStage(84).label, '73–84个月');
  const grouped = HEALTH_STAGES.flatMap(stage => stageHealthItems(source.items, stage));
  assert.deepEqual(grouped, source.items);
  assert.equal(new Set(grouped.map(item => item.id)).size, 261);
});

test('下一步保留实际当前及此前项目，不以浏览阶段截断或无记录开放未来', () => {
  const stage = healthStage(21), records = {};
  const initial = nextHealthItems(source.items, records, stage);
  assert.deepEqual(initial.map(item => item.id).sort(), source.items.filter(item => item.month <= 24).map(item => item.id).sort());
  records['wst580-146'] = { note: '只有手记', observedAt: '2026-10-30' };
  records['wst580-156'] = { status: 'not-yet' };
  assert.deepEqual(nextHealthItems(source.items, records, stage), initial);
  assert.equal(nextHealthItems(source.items, Object.fromEntries(source.items.map(item => [item.id, { status: 'observed' }])), healthStage(84)).length, 0);
});

test('下一步依据各能区观察进度跨阶段推进，不等待同组全部完成，撤回恢复', () => {
  const stage = healthStage(21), records = { 'wst580-146': { status: 'observed' } };
  const initial = nextHealthItems(source.items, {}, stage);
  const advanced = nextHealthItems(source.items, records, stage);
  assert.ok(advanced.some(item => item.id === 'wst580-147'), '同组未观察项保留');
  assert.ok(advanced.some(item => item.id === 'wst580-156'), '27月龄记录可继续30月龄');
  assert.ok(advanced.some(item => item.number === 1), '此前未观察项不被跳过');
  assert.ok(!advanced.some(item => item.id === 'wst580-165'));
  assert.deepEqual(advanced.filter(item => item.domain !== 'gross'), initial.filter(item => item.domain !== 'gross'));
  records['wst580-156'] = { status: 'observed' };
  const later = nextHealthItems(source.items, records, stage);
  assert.ok(later.some(item => item.id === 'wst580-165'), '30月龄记录继续33月龄，无须补齐27月龄');
  assert.ok(later.some(item => item.id === 'wst580-147'));
  records['wst580-156'].status = 'not-yet';
  assert.deepEqual(nextHealthItems(source.items, records, stage), advanced);
  assert.deepEqual(new Set(nextHealthItems([...source.items].reverse(), records, stage).map(i => i.id)), new Set(advanced.map(i => i.id)));
  assert.deepEqual(nextHealthItems([], {}, stage), []);
});

test('跨版本关系采用完整的双向集合，一对多不丢失且只跳具体技能', async () => {
  const window = {};
  for (const file of ['growth-references.js', 'growth-versions.js']) {
    runInNewContext(await readFile(new URL('../shared/' + file, import.meta.url), 'utf8'), { window, URLSearchParams });
  }
  const api = window.XiaoyaGrowthVersions;
  const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const ids = new Set();
  for (const ref of window.XiaoyaGrowthReferences) {
    const key = ref.mao + '/' + ref.health;
    assert.ok(!ids.has(key), '重复关联：' + key); ids.add(key);
    assert.equal(catalog.find(skill => skill.id === ref.mao)?.title, ref.maoTitle);
    const item = source.items.find(item => item.id === ref.health);
    assert.equal(item?.title, ref.healthTitle);
    assert.equal(item.month, ref.month); assert.equal(item.domain, ref.domain);
    assert.ok(['same-action', 'partial'].includes(ref.kind), '无证据不得标为完全一致');
    assert.ok(ref.note);
    assert.ok(api.references('health', ref.health).includes(ref));
    assert.ok(api.references('mao', ref.mao).includes(ref));
    const maoURL = new URL(api.itemHref('mao', ref), 'https://example.test/nested/health.html');
    assert.equal(maoURL.pathname, '/nested/index.html');
    assert.equal(new URLSearchParams(maoURL.hash.slice(1)).get('skill'), ref.mao);
    const healthURL = new URL(api.itemHref('health', ref), maoURL);
    const params = new URLSearchParams(healthURL.hash.slice(1));
    assert.equal(healthURL.pathname, '/nested/health.html');
    assert.equal(params.get('item'), ref.health); assert.equal(params.get('month'), String(ref.month));
    assert.equal(params.get('domain'), ref.domain); assert.equal(params.get('status'), 'all');
  }
  assert.equal(ids.size, 222);
  assert.equal(new Set(window.XiaoyaGrowthReferences.map(ref => ref.health)).size, 199);
  const stairs = api.references('mao', 'g-both-feet-stairs');
  for (const id of ['wst580-129', 'wst580-146', 'wst580-147']) assert.ok(stairs.some(ref => ref.health === id));
  assert.equal(api.references('health', 'wst580-129')[0].kind, 'partial');
  assert.equal(api.references('health', 'wst580-002')[0].kind, 'same-action');
  assert.equal(api.references('health', 'wst580-096').length, 2);
  for (const id of ['wst580-040', 'wst580-128', 'wst580-174', '<invalid-id>']) assert.equal(api.references('health', id).length, 0);
  for (const skill of catalog.filter(skill => !window.XiaoyaGrowthReferences.some(ref => ref.mao === skill.id))) {
    assert.equal(api.references('mao', skill.id).length, 0);
  }
});

test('卫健委原文261编号完整、28月龄五能区、每格1～2项且附录B均关联', () => {
  assert.deepEqual(source.items.map(item => item.number), Array.from({ length: 261 }, (_, i) => i + 1));
  assert.deepEqual(source.months, HEALTH_MONTHS);
  assert.deepEqual(source.domains.map(d => d.id), HEALTH_DOMAINS.map(d => d.id));
  const ids = new Set();
  for (const item of source.items) {
    assert.equal(item.id, `wst580-${String(item.number).padStart(3, '0')}`);
    ids.add(item.id);
    assert.ok(item.title && item.method && item.requirement && item.methodTitle);
    assert.ok(item.tablePage >= 6 && item.tablePage <= 8);
    assert.ok(item.methodPage >= 12 && item.methodPage <= 26);
    assert.ok(!Object.hasOwn(item, 'parents'), '不得编造前置关系');
  }
  assert.equal(ids.size, 261);
  for (const month of HEALTH_MONTHS) for (const domain of HEALTH_DOMAINS) {
    assert.ok([1, 2].includes(source.items.filter(item => item.month === month && item.domain === domain.id).length), `${month}/${domain.id}`);
  }
  assert.deepEqual(source.items.filter(item => item.attention).map(item => item.number), [5, 8, 14, 16, 34, 59, 86]);
  assert.equal(source.items[142].title, '说常见物用途（碗笔凳球）');
  assert.equal(source.items[238].title, '上班、窗、苹果、香蕉（2/3）');
  assert.equal(source.items[134].parentReport, true);
  assert.equal(source.items[134].month, 21);
  assert.match(source.items[0].requirement, /2s/);
});

test('阅读月龄在两组间取较小组，保留78/84、不同于毛老师阶段', () => {
  assert.equal(referenceMonth('2024-11-24', new Date(2026, 9, 30)), 21);
  assert.equal(referenceMonth('2024-11-24', new Date(2026, 10, 24)), 24);
  assert.equal(referenceMonth('2024-11-24', new Date(2031, 4, 24)), 78);
  assert.equal(referenceMonth('2024-11-24', new Date(2031, 10, 24)), 84);
  assert.equal(referenceMonth('', new Date()), 1);
});

test('观察状态和筛选不把未观察当作正式未通过，且搜索可跨月龄', () => {
  const records = { 'wst580-128': { status: 'observed', observedAt: '2026-10-30' }, 'wst580-129': { status: 'not-yet' }, 'wst580-130': { note: '准备工具' } };
  assert.equal(filterHealth(source.items, records, { month: 21, domain: 'gross', status: 'observed' })[0].number, 128);
  assert.equal(filterHealth(source.items, records, { month: 21, domain: 'gross', status: 'not-yet' })[0].number, 129);
  assert.equal(filterHealth(source.items, records, { search: '261' })[0].number, 261);
  assert.deepEqual(observationStats(source.items, records), { total: 261, observed: 1, notYet: 1, recorded: 3 });
});

test('本版备份独立且严格识别来源，拒绝另一版、未知编号及多余身份字段', () => {
  const value = { ...emptyHealth(), records: { 'wst580-138': { status: 'observed', observedAt: '2026-10-30', note: '自己跳起来了' } } };
  assert.deepEqual(validateHealthBackup(JSON.parse(JSON.stringify(value)), M.normalize), value);
  for (const wrong of [
    { version: 1, records: {} }, { ...value, token: 'fake-NOT-A-CREDENTIAL' },
    { ...value, records: { 'c-short-memory': { status: 'observed' } } },
    { ...value, records: { 'wst580-262': {} } }, { ...value, records: { 'wst580-000': {} } },
    { ...value, records: { 'wst580-138': { status: 'passed' } } },
    { ...value, records: { 'wst580-138': { observedAt: '2026-02-30' } } },
  ]) assert.throws(() => validateHealthBackup(wrong, M.normalize));
  assert.throws(() => M.normalize('growth', value));
});

test('观察与手记的跨设备合并保留双方变化，同字段冲突可明确选择和重放', () => {
  const base = { ...emptyHealth(), records: { 'wst580-138': { note: '旧手记' } } };
  const local = { ...emptyHealth(), records: { 'wst580-138': { note: '旧手记', status: 'observed', observedAt: '2026-10-30' } } };
  const remote = { ...emptyHealth(), records: { 'wst580-138': { note: '新手记' } } };
  const merged = M.merge(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.snapshot.records['wst580-138'], { note: '新手记', status: 'observed', observedAt: '2026-10-30' });
  const other = structuredClone(local); other.records['wst580-138'].status = 'not-yet';
  const conflict = M.merge(base, local, other); assert.equal(conflict.conflicts.length, 1);
  const choices = { [conflict.conflicts[0].key]: 'remote' };
  const resolved = M.merge(base, local, other, choices); assert.deepEqual(resolved.snapshot, other);
  assert.deepEqual(M.merge(other, resolved.snapshot, other).conflicts, []);
});
