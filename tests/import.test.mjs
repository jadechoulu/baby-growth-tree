import test from 'node:test';
import assert from 'node:assert/strict';
import { combineLocalImports, mergeImportedGrowth } from '../lib/import.mjs';

const profile = Object.freeze({ name: '测试宝宝', birthDate: '2025-01-15' });
const snapshot = (records = {}, otherProfile = profile) => ({ version: 1, profile: { ...otherProfile }, records });
const source = (label, records, otherProfile) => ({ label, snapshot: snapshot(records, otherProfile) });
const validIds = ['a', 'b', 'c'];

test('本地全部导入合并全部有效来源，重复记录只保留一份且不改变原记录', () => {
  const sources = [
    source('IndexedDB', { a: { completedAt: '2026-10-26' } }),
    source('旧版记录', { a: { completedAt: '2026-10-26' }, b: { completedAt: '2026-10-27' } }),
  ];
  const original = structuredClone(sources);
  const result = combineLocalImports(sources, validIds);
  assert.deepEqual(result.sources, ['IndexedDB', '旧版记录']);
  assert.deepEqual(result.snapshot, snapshot({
    a: { completedAt: '2026-10-26' }, b: { completedAt: '2026-10-27' },
  }));
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(sources, original);
  result.snapshot.records.a.completedAt = '2026-10-28';
  assert.deepEqual(sources, original);
});

test('同技能缺少字段或手记为空时，补齐后续来源的完成日期和手记', () => {
  const result = combineLocalImports([
    source('IndexedDB', { a: { completedAt: '2026-10-26' }, b: { note: '  ' }, c: { note: '已观察' } }),
    source('旧版记录', {
      a: { note: '第一次独立完成' }, b: { completedAt: '2026-10-27', note: '家中练习' },
      c: { completedAt: '2026-10-28', note: '' },
    }),
  ], validIds);
  assert.deepEqual(result.snapshot.records, {
    a: { completedAt: '2026-10-26', note: '第一次独立完成' },
    b: { note: '家中练习', completedAt: '2026-10-27' },
    c: { note: '已观察', completedAt: '2026-10-28' },
  });
  assert.deepEqual(result.conflicts, []);
});

test('不同非空字段保留优先来源，并逐项列出冲突及实际保留来源', () => {
  const result = combineLocalImports([
    source('IndexedDB', { a: { completedAt: '2026-10-26', note: '' } }),
    source('旧版记录', { a: { completedAt: '2026-10-27', note: '在家完成' } }),
    source('另一份备份', { a: { completedAt: '2026-10-28', note: '在公园完成' } }),
  ], validIds);
  assert.deepEqual(result.snapshot.records.a, { completedAt: '2026-10-26', note: '在家完成' });
  assert.deepEqual(result.conflicts, [
    { skillId: 'a', field: 'completedAt', kept: '2026-10-26', ignored: '2026-10-27', keptSource: 'IndexedDB', ignoredSource: '旧版记录' },
    { skillId: 'a', field: 'completedAt', kept: '2026-10-26', ignored: '2026-10-28', keptSource: 'IndexedDB', ignoredSource: '另一份备份' },
    { skillId: 'a', field: 'note', kept: '在家完成', ignored: '在公园完成', keptSource: '旧版记录', ignoredSource: '另一份备份' },
  ]);
});

test('昵称或出生日期不同拒绝批量混合，同一昵称去掉首尾空格后仍可合并', () => {
  for (const different of [
    { ...profile, name: '另一个宝宝' },
    { ...profile, birthDate: '2025-01-16' },
  ]) {
    assert.throws(() => combineLocalImports([
      source('IndexedDB', { a: { note: '本机手记' } }), source('旧版记录', {}, different),
    ], validIds), /IndexedDB 与 旧版记录.*昵称或出生日期不一致/);
  }
  const result = combineLocalImports([
    source('IndexedDB', {}), source('旧版记录', {}, { ...profile, name: '  测试宝宝  ' }),
  ], validIds);
  assert.deepEqual(result.snapshot.profile, profile);
});

test('每份来源都校验未知技能和非法字段，错误指出对应来源', () => {
  assert.throws(() => combineLocalImports([], validIds), /没有可导入/);
  assert.throws(() => combineLocalImports([
    source('IndexedDB', {}), source('旧版记录', { unknown: { completedAt: '2026-10-27' } }),
  ], validIds), /旧版记录 无法导入：备份包含未知技能：unknown/);
  assert.throws(() => combineLocalImports([
    source('IndexedDB', { a: { completedAt: '2026-02-30' } }),
  ], validIds), /IndexedDB 无法导入.*完成日期无效/);
  const input = source('IndexedDB', { a: { note: '有效手记', arbitrary: '忽略' } });
  input.snapshot.profile.arbitrary = true;
  assert.deepEqual(combineLocalImports([input], validIds).snapshot, snapshot({ a: { note: '有效手记' } }));
});

test('恢复完成记录保留原手记和未导入技能，资料使用导入内容且不改变输入', () => {
  const current = snapshot({ a: { completedAt: '2026-10-25', note: '珍贵手记' }, b: { note: '继续保留' } });
  const imported = snapshot({ a: { completedAt: '2026-10-27' } }, { ...profile, name: '新的昵称' });
  const originalCurrent = structuredClone(current);
  const originalImported = structuredClone(imported);
  const merged = mergeImportedGrowth(current, imported);
  assert.deepEqual(merged, snapshot({
    a: { completedAt: '2026-10-27', note: '珍贵手记' }, b: { note: '继续保留' },
  }, { ...profile, name: '新的昵称' }));
  merged.records.b.note = '改动合并结果';
  merged.profile.name = '改动昵称';
  assert.deepEqual(current, originalCurrent);
  assert.deepEqual(imported, originalImported);
});

test('导入缺少完成日期仍可回退完成，显式空手记允许清空，重复导入结果稳定', () => {
  const current = snapshot({
    a: { completedAt: '2026-10-25', note: '保留手记' },
    b: { completedAt: '2026-10-25', note: '清空手记' },
  });
  const imported = snapshot({ a: {}, b: { note: '' } });
  const merged = mergeImportedGrowth(current, imported);
  assert.deepEqual(merged.records, { a: { note: '保留手记' }, b: { note: '' } });
  assert.deepEqual(mergeImportedGrowth(merged, imported), merged);
});
