import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { emptyVision, visits, points, equivalentSphere, acuityDecimal, acuityLabel, references, referenceWindow, ageYears, comparison, metricValue } from '../lib/vision-model.mjs';
const require = createRequire(import.meta.url);
const M = require('../shared/sync-model.js');
const record = (date = '2026-11-16', extra = {}) => ({ date, cycloplegia: 'yes', chart: 'decimal', right: { sphere: 0, cylinder: -0.5, axis: 0 }, left: {}, ...extra });
const snapshot = records => ({ ...emptyVision(), records });

test('等效球镜保留正负号与真实0，缺测不补0', () => {
  assert.equal(equivalentSphere({ sphere: 1.25, cylinder: -0.5 }), 1);
  assert.equal(equivalentSphere({ sphere: 0, cylinder: 0 }), 0);
  assert.equal(equivalentSphere({ sphere: 0 }), null);
  assert.equal(equivalentSphere({ cylinder: 0 }), null);
  assert.equal(equivalentSphere({ sphere: null, cylinder: 0 }), null);
});

test('小数与五分视力转换保留意义，不能直接当成屈光度', () => {
  assert.equal(acuityDecimal(5, 'logarithmic'), 1);
  assert.equal(acuityLabel(acuityDecimal(4.9, 'logarithmic'), 'logarithmic'), '4.9');
  assert.equal(acuityLabel(0.5), '0.5');
  assert.equal(acuityLabel(undefined), '—');
});

test('独立视力快照支持同日多条、按日排序、软删除恢复且不改变原数据', () => {
  const value = snapshot({ 'vision-a': record('2026-10-01'), 'vision-b': record(), 'vision-c': record(), 'vision-d': record('2026-09-01', { deleted: true }) });
  assert.deepEqual(visits(value).map(v => v.id), ['vision-b', 'vision-c', 'vision-a']);
  assert.deepEqual(visits(value, true).map(v => v.id), ['vision-d']);
  const next = structuredClone(value); next.records['vision-d'].deleted = false;
  assert.equal(visits(next).length, 4);
  assert.equal(visits(value).length, 3);
  assert.equal(Object.hasOwn(value.records['vision-a'], 'id'), false);
});

test('趋势按检查日期的真实年龄投影，缺测、已删除和生日前记录不出点', () => {
  const value = snapshot({ 'vision-a': record('2026-01-01'), 'vision-b': record('2027-01-01', { deleted: true }), 'vision-c': record('2023-01-01') });
  assert.equal(points(value, '2024-01-01', 'se').length, 1);
  assert.equal(points(value, '', 'se').length, 0);
  assert.equal(points(value, '2024-01-01', 'axialLength').length, 0);
  assert.equal(points(value, '2024-01-01', 'se')[0].value, -0.25);
  assert.ok(Math.abs(ageYears('2024-01-01', '2026-01-01') - 2) < .003);
});

test('SE只比较同眼同散瞳条件，不跨条件或按缺测生成变化', () => {
  const value = snapshot({
    'vision-a': record('2026-01-01', { right: { sphere: 1.5, cylinder: 0 } }),
    'vision-b': record('2026-02-01', { cycloplegia: 'no', right: { sphere: 0, cylinder: 0 } }),
    'vision-c': record('2026-03-01', { right: { sphere: 1, cylinder: 0 } }),
  });
  assert.deepEqual(comparison(value, 'right', 'se'), { delta: -0.5, days: 59 });
  assert.equal(comparison(value, 'left', 'se'), null);
  value.records['vision-c'].cycloplegia = 'unknown';
  assert.equal(comparison(value, 'right', 'se'), null);
});

test('参考按适用指标人群提供，眼轴不套到6岁以下，不生成额外百分位', () => {
  assert.deepEqual(references('axialLength'), []);
  const curves = references('axialLength', 'female');
  assert.equal(curves.length, 3);
  assert.deepEqual(curves[1].values, [[6, 22.54], [9, 23.72], [15, 24.37]]);
  assert.deepEqual(referenceWindow(curves[1], [0, 5]), []);
  assert.deepEqual(references('se').find(r => r.kind === 'dots').values, [[6, 1.38], [15, .31]]);
  assert.deepEqual(referenceWindow(references('se').find(r => r.endExclusive && r.category !== 'education'), [0, 2]), []);
  assert.deepEqual(referenceWindow(references('se').find(r => r.endExclusive && r.category !== 'education'), [6, 15]), []);
  assert.equal(references('sphere').length, 0);
  assert.equal(references('correctedAcuity').length, 0);
  const lower = references('acuity')[1];
  assert.deepEqual(referenceWindow(lower, [6, 15]).map(([age]) => age), [6, 7]);
  assert.equal(lower.values[0][1], acuityDecimal(4.8, 'logarithmic'));
});

test('导入保留有效0，拒绝跨领域、错误日期、超范围和预约字段', () => {
  const valid = snapshot({ 'vision-a': record() });
  assert.deepEqual(M.normalize('vision', valid), valid);
  for (const patch of [{ date: '2026-02-30' }, { nextVisit: '2026-12-01' }, { right: { axis: 0.5 } }, { right: { acuity: 5 } }, { right: { sphere: '0' } }, { right: {}, left: {} }, { token: 'TEST-NOT-A-TOKEN' }]) {
    assert.throws(() => M.normalize('vision', snapshot({ 'vision-a': record('2026-11-16', patch) })));
  }
  assert.throws(() => M.normalize('vision', { version: 1, records: {} }));
  assert.throws(() => M.normalize('health', valid));
});

test('三方合并保留不同日期和不同眼编辑，同字段冲突保留原值不覆盖', () => {
  const base = snapshot({ 'vision-a': record() }), local = structuredClone(base), remote = structuredClone(base);
  local.records['vision-a'].right.sphere = 1;
  remote.records['vision-a'].left.axialLength = 22.5;
  remote.records['vision-b'] = record('2026-10-01');
  const merged = M.merge(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.snapshot.records['vision-a'].right.sphere, 1);
  assert.equal(merged.snapshot.records['vision-a'].left.axialLength, 22.5);
  assert.equal(visits(merged.snapshot).length, 2);
  remote.records['vision-a'].right.sphere = 2;
  assert.equal(M.merge(base, local, remote).conflicts.length, 1);
});

test('球镜按度投影，同一事实仍按D保存，不能套用等效球镜参考', () => {
  const value = snapshot({ 'vision-a': record('2026-01-01', { right: { sphere: -1, cylinder: -.5 }, left: { sphere: -1.5 } }), 'vision-b': record('2026-03-01', { right: { sphere: -1.25 }, left: {} }) });
  assert.equal(metricValue({ sphere: -1 }, 'sphere'), -100);
  assert.equal(metricValue({ sphere: 1.5 }, 'sphere'), 150);
  assert.equal(metricValue({}, 'sphere'), null);
  assert.deepEqual(points(value, '2024-01-01', 'sphere').map(p => p.value), [-100,-150,-125]);
  assert.deepEqual(comparison(value, 'right', 'sphere'), {delta:-25,days:59});
  assert.equal(value.records['vision-a'].right.sphere, -1);
  value.records['vision-b'].cycloplegia = 'unknown';
  assert.equal(comparison(value, 'right', 'sphere'), null);
});

test('婴幼儿条栅视力区间与普通裸眼视力、屈光度及个人事实隔离', () => {
  const [lower, upper] = references('tellerReference');
  assert.equal(lower.values.length, 24);
  assert.deepEqual(lower.values[0], [1/12,.353]);
  assert.deepEqual(upper.values.at(-1), [3,28.015]);
  assert.deepEqual(referenceWindow(lower, [4,6]), []);
  assert.equal(lower.values.find(([age]) => age === 12.096/12)[1], 3.749);
  assert.equal(upper.values.find(([age]) => age === 12.096/12)[1], 15.061);
  assert.deepEqual(points(snapshot({'vision-a': record()}), '2024-01-01', 'tellerReference'), []);
  assert.equal(references('acuity').some(r => r.band), false);
});

test('散瞳SE参考带使用原表上下界，不向6岁以下外推', () => {
  const band = references('se').filter(r => r.band === 'se-consensus');
  assert.equal(band.length, 2);
  assert.deepEqual(band.map(r => r.values[0]), [[6,.38],[6,3.63]]);
  assert.deepEqual(band.map(r => r.values.at(-1)), [[15,-.38],[15,1.13]]);
  for (const curve of band) assert.deepEqual(referenceWindow(curve, [0,5]), []);
  for (let i=0;i<10;i++) assert.ok(band[0].values[i][1] < band[1].values[i][1]);
});

test('科普单值不生成上下界，周岁分组不外推或替换现行标准', () => {
  const refs = references('se');
  const edu = refs.filter(r => r.category === 'education');
  assert.deepEqual(edu[0].values, [[0,3],[4,3]]);
  assert.equal(edu[0].band, undefined);
  assert.deepEqual(referenceWindow(edu[0], [4,6]), []);
  assert.deepEqual(edu.filter(r => r.band === 'education-4').map(r => r.values), [[[4,1.5],[6,1.5]],[[4,2],[6,2]]]);
  assert.deepEqual(edu.filter(r => r.band === 'education-6').map(r => r.values[0][1]), [1,1.5]);
  assert.ok(refs.some(r => r.category !== 'education' && r.endExclusive && r.values[0][0] === 3 && r.values[0][1] === 2.05));
});
