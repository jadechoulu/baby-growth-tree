import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROFILE, STAGES, localDateString, getAge, getStageForAge,
  skillInStage, getStageSkills, getNextSkills, getSkillAgeStatus, getStats, toggleRecord, completeRecords, validateBackup,
} from '../lib/model.mjs';

const localDay = (year, month, day) => new Date(year, month - 1, day, 12);
const profile = Object.freeze({ name: '测试宝宝', birthDate: '2025-01-15' });

test('公开默认资料不内置生日，未设置时不计算月龄', () => {
  assert.equal(DEFAULT_PROFILE.birthDate, '');
  assert.equal(getAge(DEFAULT_PROFILE.birthDate, localDay(2026, 10, 27)), null);
});

test('按完整日历月计算月龄，并在出生当天返回零月龄', () => {
  assert.deepEqual(getAge(profile.birthDate, localDay(2026, 12, 18)), {
    years: 1, months: 11, days: 3, totalMonths: 23, label: '1岁11个月3天',
  });
  assert.deepEqual(getAge(profile.birthDate, localDay(2025, 1, 15)), {
    years: 0, months: 0, days: 0, totalMonths: 0, label: '0天',
  });
  assert.equal(getAge(profile.birthDate, localDay(2026, 1, 14)).totalMonths, 11);
  assert.equal(getAge(profile.birthDate, localDay(2026, 1, 15)).years, 1);
  assert.equal(getAge(profile.birthDate, localDay(2025, 1, 14)), null);
  assert.equal(getAge('2024-02-30', localDay(2025, 1, 1)), null);
  assert.equal(getAge(profile.birthDate, new Date('invalid')), null);
});

test('月末生日、闰日与跨月天数按日历计算', () => {
  assert.deepEqual(getAge('2024-01-31', localDay(2024, 2, 29)), {
    years: 0, months: 1, days: 0, totalMonths: 1, label: '1个月',
  });
  assert.equal(getAge('2023-01-31', localDay(2023, 2, 28)).totalMonths, 1);
  assert.equal(getAge('2023-01-31', localDay(2023, 3, 30)).days, 30);
  assert.equal(getAge('2023-01-31', localDay(2023, 3, 31)).totalMonths, 2);
  assert.equal(getAge('2024-02-29', localDay(2025, 2, 28)).years, 1);
  assert.equal(getAge('2024-02-29', localDay(2025, 3, 1)).days, 1);
  assert.equal(localDateString(localDay(2024, 2, 9)), '2024-02-09');
});

test('所有月龄阶段连续且不重叠，36个月切入3–6岁', () => {
  for (let month = 0; month <= 72; month += 1) {
    assert.equal(STAGES.filter((stage) => month >= stage.minMonths && month <= stage.maxMonths).length, 1);
    assert.ok(getStageForAge(month));
  }
  for (const [month, stageId] of [[0, 's0'], [3, 's0'], [4, 's1'], [6, 's1'], [7, 's2'], [9, 's2'], [10, 's3'], [12, 's3'], [13, 's4'], [18, 's4'], [19, 's5'], [24, 's5'], [25, 's6'], [30, 's6'], [31, 's7'], [35, 's7'], [36, 's8'], [72, 's8']]) {
    assert.equal(getStageForAge(month).id, stageId);
  }
  for (const value of [-1, 73, NaN, Infinity, '23', null]) assert.equal(getStageForAge(value), null);
});

test('范围技能在多个阶段复用同一技能记录', () => {
  const ranged = { id: 'range', stage: 's1', endStage: 's3' };
  const single = { id: 'single', stage: 's2' };
  assert.equal(skillInStage(ranged, 's0'), false);
  assert.equal(skillInStage(ranged, 's1'), true);
  assert.equal(skillInStage(ranged, 's3'), true);
  assert.equal(skillInStage(ranged, 's4'), false);
  assert.equal(skillInStage({ stage: 's3', endStage: 's1' }, 's2'), false);
  assert.equal(skillInStage(ranged, 'unknown'), false);
  assert.deepEqual(getStageSkills([ranged, single], 's2'), [ranged, single]);
  const records = toggleRecord({}, 'range', '2026-10-27');
  assert.equal(getStats(getStageSkills([ranged, single], 's1'), records).completed, 1);
  assert.equal(getStats(getStageSkills([ranged, single], 's3'), records).completed, 1);
});

test('完成与撤销保持原状态不可变，撤销保留笔记', () => {
  const initial = { a: { note: '第一次独立做到' }, b: { completedAt: '2026-10-25' } };
  const completed = toggleRecord(initial, 'a', '2026-10-27');
  assert.deepEqual(initial.a, { note: '第一次独立做到' });
  assert.deepEqual(completed.a, { note: '第一次独立做到', completedAt: '2026-10-27' });
  const reverted = toggleRecord(completed, 'a', '2026-10-27');
  assert.deepEqual(reverted.a, { note: '第一次独立做到' });
  assert.equal(completed.a.completedAt, '2026-10-27');
  assert.deepEqual(toggleRecord(initial, 'b', '2026-10-27'), { a: initial.a });
  assert.deepEqual(getStats([{ id: 'a' }, { id: 'b' }, { id: 'c' }], initial), {
    total: 3, completed: 1, remaining: 2, percent: 33,
  });
  assert.deepEqual(getStats([], {}), { total: 0, completed: 0, remaining: 0, percent: 0 });
  assert.throws(() => toggleRecord({}, 'a', '2025-02-29'), /日期/);
});

test('阶段全部完成跨领域覆盖范围技能，保留原记录并可整批撤销', () => {
  const catalog = [
    { id: 'cognition', domain: 'cognition', stage: 's2' },
    { id: 'fine', domain: 'fine', stage: 's2' },
    { id: 'shared', domain: 'gross', stage: 's1', endStage: 's3' },
    { id: 'later', domain: 'sensory', stage: 's4' },
  ];
  const original = Object.freeze({
    cognition: Object.freeze({ completedAt: '2026-10-20', note: '原完成日期' }),
    fine: Object.freeze({ note: '继续保留的手记' }),
    later: Object.freeze({ note: '其他阶段记录' }),
  });
  const stageSkills = getStageSkills(catalog, 's2');
  let records = completeRecords(original, stageSkills, '2026-10-27');
  assert.deepEqual(records, {
    cognition: { completedAt: '2026-10-20', note: '原完成日期' },
    fine: { note: '继续保留的手记', completedAt: '2026-10-27' },
    shared: { completedAt: '2026-10-27' },
    later: { note: '其他阶段记录' },
  });
  assert.equal(records.cognition, original.cognition);
  assert.equal(records.later, original.later);
  assert.deepEqual(original.fine, { note: '继续保留的手记' });
  assert.deepEqual(getStats(stageSkills, records), { total: 3, completed: 3, remaining: 0, percent: 100 });
  assert.deepEqual(completeRecords(records, stageSkills, '2026-10-28'), records);

  // 批量撤销恢复操作前快照，既有完成和手记仍保留。
  records = original;
  assert.deepEqual(getStats(stageSkills, records), { total: 3, completed: 1, remaining: 2, percent: 33 });
  assert.equal(records.cognition.completedAt, '2026-10-20');
  assert.equal(records.fine.note, '继续保留的手记');
  assert.equal(records.shared, undefined);
});

test('阶段全部完成复用跨阶段技能，单项回退同步移除涉及阶段全完成状态', () => {
  const shared = { id: 'shared', stage: 's1', endStage: 's3' };
  const catalog = [shared, { id: 's2-only', stage: 's2' }];
  const s2 = getStageSkills(catalog, 's2');
  const s3 = getStageSkills(catalog, 's3');
  const completed = completeRecords({}, s2, '2026-10-27');
  assert.equal(getStats(s2, completed).remaining, 0);
  assert.equal(getStats(s3, completed).remaining, 0);
  assert.equal(completed.shared.completedAt, '2026-10-27');
  const reverted = toggleRecord(completed, 'shared', '2026-10-28');
  assert.equal(getStats(s2, reverted).remaining, 1);
  assert.equal(getStats(s3, reverted).remaining, 1);
  assert.equal(completed.shared.completedAt, '2026-10-27');
  assert.throws(() => completeRecords({}, s2, '2025-02-29'), /日期/);
});

test('下一步同时覆盖当前阶段所有分支、同分支分叉，合流节点去重且不越过未完成项', () => {
  const catalog = [
    { id: 'root', domain: 'cognition', stage: 's4', parents: [] },
    { id: 'a', domain: 'cognition', stage: 's5', category: '同一分支', parents: ['root'] },
    { id: 'b', domain: 'cognition', stage: 's5', category: '同一分支', parents: ['root'] },
    { id: 'independent', domain: 'cognition', stage: 's5', parents: [] },
    { id: 'merge', domain: 'cognition', stage: 's6', parents: ['a', 'b'] },
    { id: 'after', domain: 'cognition', stage: 's7', parents: ['merge'] },
    { id: 'other', domain: 'gross', stage: 's5', parents: [] },
  ];
  const ids = records => getNextSkills(catalog, records, 'cognition', 's5').map(skill => skill.id);
  const records = Object.freeze({ root: Object.freeze({ completedAt: '2026-10-27' }) });
  assert.deepEqual(ids(records), ['a', 'b', 'independent']);
  const doneA = toggleRecord(records, 'a', '2026-10-28');
  assert.deepEqual(ids(doneA), ['b', 'independent']);
  const doneB = toggleRecord(doneA, 'b', '2026-10-28');
  assert.deepEqual(ids(doneB), ['independent', 'merge']);
  const doneMerge = toggleRecord(doneB, 'merge', '2026-10-28');
  assert.deepEqual(ids(doneMerge), ['independent', 'after']);
  assert.deepEqual(ids(toggleRecord(doneMerge, 'merge', '2026-10-28')), ['independent', 'merge']);
  assert.equal(records.a, undefined);
  assert.deepEqual(getNextSkills(catalog, doneB, 'unknown', 's5'), []);
});

test('下一步跨越紧邻和更后月龄，未来独立起点等到相应月龄，跨阶段技能仍可列出', () => {
  const catalog = [
    { id: 'past', domain: 'fine', stage: 's3', parents: [] },
    { id: 'shared', domain: 'fine', stage: 's4', endStage: 's7', parents: [] },
    { id: 'future-root', domain: 'fine', stage: 's6', parents: [] },
    { id: 'next', domain: 'fine', stage: 's6', parents: ['past'] },
    { id: 'skip', domain: 'fine', stage: 's8', parents: ['past'] },
  ];
  assert.deepEqual(getNextSkills(catalog, {}, 'fine', 's5').map(s => s.id), ['past', 'shared']);
  const records = { past: { completedAt: '2026-10-28' } };
  assert.deepEqual(getNextSkills(catalog, records, 'fine', 's5').map(s => s.id), ['shared', 'next', 'skip']);
  assert.deepEqual(getNextSkills(catalog, records, 'fine', 's6').map(s => s.id), ['shared', 'future-root', 'next', 'skip']);
  assert.equal(getSkillAgeStatus(catalog[1], 's5'), 'current');
  assert.equal(getSkillAgeStatus(catalog[3], 's5'), 'next');
  assert.equal(getSkillAgeStatus(catalog[4], 's5'), 'later');
});

test('下一步复用跨领域完成记录，不把前置未完成的节点当作可开始，回退会恢复前置', () => {
  const catalog = [
    { id: 'parent', domain: 'gross', stage: 's1', parents: [] },
    { id: 'child', domain: 'fine', stage: 's2', parents: ['parent'] },
    { id: 'future', domain: 'fine', stage: 's8', parents: [] },
  ];
  assert.deepEqual(getNextSkills(catalog, {}, 'fine', 's5'), []);
  const records = { parent: { completedAt: '2026-10-28' }, child: { note: '只有手记' } };
  assert.deepEqual(getNextSkills(catalog, records, 'fine', 's5').map(s => s.id), ['child']);
  const completed = completeRecords(records, catalog, '2026-10-28');
  assert.deepEqual(getNextSkills(catalog, completed, 'fine', 's5'), []);
  const reverted = toggleRecord(completed, 'parent', '2026-10-28');
  assert.deepEqual(getNextSkills(catalog, reverted, 'gross', 's5').map(s => s.id), ['parent']);
  assert.deepEqual(getNextSkills(catalog, {}, 'fine').map(s => s.id), ['future']);
  assert.deepEqual(getNextSkills([], {}, 'fine', 's5'), []);
});

test('下一步年龄提示区分当前、紧邻下一阶段、更后、此前及未知；跨阶段技能按范围判断', () => {
  assert.equal(getSkillAgeStatus({ stage: 's5' }, 's5'), 'current');
  assert.equal(getSkillAgeStatus({ stage: 's6' }, 's5'), 'next');
  assert.equal(getSkillAgeStatus({ stage: 's7' }, 's5'), 'later');
  assert.equal(getSkillAgeStatus({ stage: 's4' }, 's5'), 'earlier');
  assert.equal(getSkillAgeStatus({ stage: 's4', endStage: 's7' }, 's5'), 'current');
  assert.equal(getSkillAgeStatus({ stage: 's4', endStage: 's5' }, 's6'), 'earlier');
  assert.equal(getSkillAgeStatus({ stage: 's0' }, undefined), 'unknown');
  assert.equal(getSkillAgeStatus({ stage: 's8' }, 's8'), 'current');
});

const backup = () => ({
  version: 1,
  profile: { name: '  宝宝  ', birthDate: profile.birthDate },
  records: { a: { completedAt: '2024-02-29', note: '会翻身了' } },
});

test('备份规范化只保留资料和技能记录的公开字段', () => {
  const input = backup();
  input.profile.records = '不能覆盖系统字段';
  input.records.a.id = 'b';
  input.records.a.unknown = true;
  input.records.b = {};
  const result = validateBackup(input, new Set(['a', 'b']));
  assert.deepEqual(result, {
    version: 1, profile: { name: '宝宝', birthDate: profile.birthDate },
    records: { a: { completedAt: '2024-02-29', note: '会翻身了' } },
  });
  result.records.a.note = '新笔记';
  assert.equal(input.records.a.note, '会翻身了');
});

test('备份拒绝无效结构、未知技能、不真实日期和超长字段', () => {
  const invalid = [null, [], {}, { ...backup(), version: 2 }, { ...backup(), profile: [] }, { ...backup(), records: [] }];
  for (const value of invalid) assert.throws(() => validateBackup(value, ['a']), Error);
  for (const birthDate of ['2025-02-29', '2024-04-31', '2024-1-01', '2024-01-00', '0000-01-01']) {
    assert.throws(() => validateBackup({ ...backup(), profile: { name: '宝宝', birthDate } }, ['a']), /出生日期/);
  }
  for (const name of ['', '   ', '宝'.repeat(31), 12]) {
    assert.throws(() => validateBackup({ ...backup(), profile: { name, birthDate: profile.birthDate } }, ['a']), /昵称/);
  }
  assert.throws(() => validateBackup(backup(), ['other']), /未知技能/);
  const prototypeKey = JSON.parse('{"version":1,"profile":{"name":"宝宝","birthDate":"2025-01-15","__proto__":{"admin":true}},"records":{"__proto__":{"completedAt":"2026-10-27"}}}');
  assert.throws(() => validateBackup(prototypeKey, ['a']), /未知技能/);
  assert.equal({}.admin, undefined);
  for (const record of [[], null, 'done', { completedAt: '2025-02-29' }, { completedAt: null }, { note: 3 }, { note: '字'.repeat(2001) }]) {
    assert.throws(() => validateBackup({ ...backup(), records: { a: record } }, ['a']), Error);
  }
});
