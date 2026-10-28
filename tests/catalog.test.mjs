import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STAGES, DOMAINS, getStageSkills, getStats, toggleRecord } from '../lib/model.mjs';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('技能目录覆盖五页原图，节点唯一且上游引用完整', () => {
  const byId = new Map(catalog.map(skill => [skill.id, skill]));
  assert.equal(byId.size, catalog.length);
  assert.equal(catalog.length, 248);
  assert.deepEqual(new Set(catalog.map(skill => skill.sourcePage)), new Set([1, 2, 3, 4, 5]));
  for (const skill of catalog) {
    assert.ok(DOMAINS.some(domain => domain.id === skill.domain));
    assert.ok(STAGES.some(stage => stage.id === skill.stage));
    assert.ok(skill.title.trim());
    for (const parent of skill.parents) {
      assert.ok(byId.has(parent), `${skill.id} 的上游 ${parent} 不存在`);
      assert.equal(byId.get(parent).domain, skill.domain);
    }
  }
  const visited = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    assert.equal(visiting.has(id), false, `技能关系存在循环：${id}`);
    visiting.add(id);
    for (const parent of byId.get(id).parents) visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
});

test('原图跨13–36月技能只记录一次，各阶段统计和回退复用状态', () => {
  const skill = catalog.find(item => item.id === 'fine-roleplay-tools');
  assert.equal(skill.stage, 's4');
  assert.equal(skill.endStage, 's7');
  const completed = toggleRecord({}, skill.id, '2026-10-27');
  for (const stage of ['s4', 's5', 's6', 's7']) {
    const items = getStageSkills(catalog, stage);
    assert.equal(items.filter(item => item.id === skill.id).length, 1);
    assert.equal(getStats(items, completed).completed, 1);
    assert.equal(getStats(items, toggleRecord(completed, skill.id, '2026-10-27')).completed, 0);
  }
  assert.equal(getStageSkills(catalog, 's8').some(item => item.id === skill.id), false);
});
