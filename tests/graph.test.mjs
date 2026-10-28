import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMAINS, STAGES, getStageSkills } from '../lib/model.mjs';
import { getSkillRelations, getBranchGraph, getStageGraph, getLineagePaths, layoutGraph } from '../lib/graph.mjs';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const byId = new Map(catalog.map(skill => [skill.id, skill]));
const ids = skills => skills.map(skill => skill.id);

function walk(start, neighbours) {
  const result = new Set();
  function visit(id) {
    for (const related of neighbours(id)) {
      if (result.has(related)) continue;
      result.add(related);
      visit(related);
    }
  }
  visit(start);
  return result;
}

test('阶段脉络保留本阶段所有技能、完整前后关系及汇合分支，且不混入无关技能', () => {
  for (const stage of STAGES) for (const domain of DOMAINS) {
    const graph = getStageGraph(catalog, stage.id, domain.id);
    const selected = getStageSkills(catalog, stage.id).filter(skill => skill.domain === domain.id);
    assert.deepEqual(graph.stageIds, ids(selected));
    const expected = new Set(ids(selected));
    for (const skill of selected) {
      for (const child of walk(skill.id, id => catalog.filter(item => item.parents.includes(id)).map(item => item.id))) expected.add(child);
    }
    for (const id of [...expected]) for (const parent of walk(id, id => byId.get(id).parents)) expected.add(parent);
    assert.deepEqual(new Set(ids(graph.nodes)), expected);
    for (const skill of graph.nodes) for (const parent of skill.parents) {
      assert.ok(expected.has(parent));
      assert.ok(graph.edges.some(edge => edge.from === parent && edge.to === skill.id));
    }
    const layout = layoutGraph(graph.nodes, graph.edges);
    assert.equal(layout.nodes.length, expected.size);
  }
});

test('阶段脉络按技能的跨阶段范围选取，并补齐后续所需的其他前序', () => {
  const skills = [
    { id: 'pre', stage: 's0', domain: 'fine', parents: [] },
    { id: 'range', stage: 's1', endStage: 's3', domain: 'fine', parents: ['pre'] },
    { id: 'support', stage: 's2', domain: 'gross', parents: [] },
    { id: 'next', stage: 's4', domain: 'fine', parents: ['range', 'support'] },
    { id: 'unrelated', stage: 's0', domain: 'fine', parents: [] },
  ];
  const graph = getStageGraph(skills, 's3', 'fine');
  assert.deepEqual(graph.stageIds, ['range']);
  assert.deepEqual(ids(graph.nodes), ['pre', 'range', 'support', 'next']);
  assert.equal(getStageGraph(skills, 's8', 'fine').nodes.length, 0);
});

test('每个技能都能追溯完整祖先、后续及后续所需的额外前序', () => {
  for (const skill of catalog) {
    const relation = getSkillRelations(catalog, skill.id);
    const ancestors = walk(skill.id, id => byId.get(id).parents);
    const descendants = walk(skill.id, id => catalog.filter(item => item.parents.includes(id)).map(item => item.id));
    assert.deepEqual(new Set(ids(relation.ancestors)), ancestors, skill.id);
    assert.deepEqual(new Set(ids(relation.descendants)), descendants, skill.id);
    assert.deepEqual(ids(relation.parents), catalog.filter(item => skill.parents.includes(item.id)).map(item => item.id));
    assert.deepEqual(ids(relation.children), catalog.filter(item => item.parents.includes(skill.id)).map(item => item.id));
    const expected = new Set([skill.id, ...ancestors, ...descendants]);
    for (const id of descendants) for (const parent of walk(id, current => byId.get(current).parents)) expected.add(parent);
    assert.deepEqual(ids(relation.nodes), catalog.filter(item => expected.has(item.id)).map(item => item.id));
    assert.deepEqual(ids(relation.supporting), catalog.filter(item => expected.has(item.id)
      && item.id !== skill.id && !ancestors.has(item.id) && !descendants.has(item.id)).map(item => item.id));
    assert.equal(relation.skill, skill);
  }
  assert.equal(getSkillRelations(catalog, 'unknown-skill'), null);
});

test('焦点脉络补齐汇合分支，并为前序、后续、补充条件保留不同角色', () => {
  const skills = [
    { id: 'other-root', parents: [] },
    { id: 'root', parents: [] },
    { id: 'focus', parents: ['root'] },
    { id: 'other', parents: ['other-root'] },
    { id: 'next', parents: ['focus', 'other'] },
    { id: 'last', parents: ['next'] },
    { id: 'unrelated', parents: [] },
  ];
  const relation = getSkillRelations(skills, 'focus');
  assert.deepEqual(ids(relation.nodes), ['other-root', 'root', 'focus', 'other', 'next', 'last']);
  assert.deepEqual(ids(relation.supporting), ['other-root', 'other']);
  assert.deepEqual(relation.edges, [
    { from: 'root', to: 'focus', kind: 'ancestor' },
    { from: 'other-root', to: 'other', kind: 'supporting' },
    { from: 'focus', to: 'next', kind: 'descendant' },
    { from: 'other', to: 'next', kind: 'supporting' },
    { from: 'next', to: 'last', kind: 'descendant' },
  ]);
});

test('分类筛选仍保留跨分支的递归前序，避免依赖断链', () => {
  let crossBranchCount = 0;
  for (const domain of DOMAINS) {
    const categories = new Set(catalog.filter(skill => skill.domain === domain.id).map(skill => skill.category));
    for (const category of categories) {
      const branch = getBranchGraph(catalog, domain.id, category);
      const selected = catalog.filter(skill => skill.domain === domain.id && skill.category === category);
      const expected = new Set(ids(selected));
      for (const skill of selected) for (const parent of walk(skill.id, id => byId.get(id).parents)) expected.add(parent);
      assert.deepEqual(ids(branch.nodes), catalog.filter(skill => expected.has(skill.id)).map(skill => skill.id));
      assert.deepEqual(branch.contextIds, branch.nodes.filter(skill => skill.category !== category).map(skill => skill.id));
      const visible = new Set(ids(branch.nodes));
      for (const skill of branch.nodes) for (const parent of skill.parents) assert.ok(visible.has(parent));
      crossBranchCount += branch.contextIds.length;
    }
  }
  assert.ok(crossBranchCount > 0, '真实目录应包含跨分支前序用例');
  assert.equal(getBranchGraph(catalog, 'unknown-domain').nodes.length, 0);
});

test('完整路径覆盖根到末端的分叉、合流和跳阶段，截断时保留真实总数', () => {
  const skills = [
    { id: 'root-a', stage: 's0', parents: [] },
    { id: 'root-b', stage: 's0', parents: [] },
    { id: 'pre', stage: 's1', parents: ['root-a', 'root-b'] },
    { id: 'focus', stage: 's3', parents: ['pre', 'root-a'] },
    { id: 'left', stage: 's5', parents: ['focus'] },
    { id: 'right', stage: 's5', parents: ['focus'] },
    { id: 'join', stage: 's7', parents: ['left', 'right'] },
    { id: 'leaf', stage: 's8', parents: ['join'] },
  ];
  const result = getLineagePaths(skills, 'focus');
  assert.equal(result.total, 6);
  assert.equal(result.paths.length, 6);
  assert.equal(result.truncated, false);
  assert.deepEqual(new Set(result.paths.map(path => path.ids.join('→'))), new Set([
    'root-a→focus→left→join→leaf',
    'root-a→focus→right→join→leaf',
    'root-a→pre→focus→left→join→leaf',
    'root-a→pre→focus→right→join→leaf',
    'root-b→pre→focus→left→join→leaf',
    'root-b→pre→focus→right→join→leaf',
  ]));
  const partial = getLineagePaths(skills, 'focus', 2);
  assert.equal(partial.total, 6);
  assert.equal(partial.paths.length, 2);
  assert.equal(partial.truncated, true);
  assert.equal(getLineagePaths(skills, 'unknown'), null);
});

test('真实目录的每条完整路径均经过焦点且每一步都有依赖关系', () => {
  let maximum = 0;
  for (const skill of catalog) {
    const result = getLineagePaths(catalog, skill.id);
    maximum = Math.max(maximum, result.total);
    assert.equal(result.truncated, false);
    assert.equal(result.paths.length, result.total);
    assert.equal(new Set(result.paths.map(path => path.ids.join('→'))).size, result.paths.length);
    for (const { ids: path } of result.paths) {
      assert.ok(path.includes(skill.id));
      assert.equal(byId.get(path[0]).parents.length, 0, '路径应从真实根技能开始');
      assert.equal(catalog.some(item => item.parents.includes(path.at(-1))), false, '路径应到真实末端技能结束');
      for (let index = 1; index < path.length; index += 1) {
        assert.ok(byId.get(path[index]).parents.includes(path[index - 1]));
      }
    }
  }
  assert.equal(maximum, 12);
});

function segmentHitsInterior(start, end, box) {
  const [x1, y1] = start;
  const [x2, y2] = end;
  const epsilon = 0.01;
  if (Math.abs(x1 - x2) < epsilon) {
    return x1 > box.x + epsilon && x1 < box.x + box.width - epsilon
      && Math.max(y1, y2) > box.y + epsilon && Math.min(y1, y2) < box.y + box.height - epsilon;
  }
  assert.ok(Math.abs(y1 - y2) < epsilon, '连线路由应为正交线段');
  return y1 > box.y + epsilon && y1 < box.y + box.height - epsilon
    && Math.max(x1, x2) > box.x + epsilon && Math.min(x1, x2) < box.x + box.width - epsilon;
}

function verifyLayout(skills, inputEdges) {
  const result = layoutGraph(skills, inputEdges);
  assert.deepEqual(ids(result.nodes), ids(skills), '布局不得丢失或重排原始节点');
  assert.deepEqual(result.edges.map(({ from, to, kind }) => ({ from, to, kind })), inputEdges, '布局不得丢失原有连线');
  const boxes = new Map(result.nodes.map(node => [node.id, node]));
  for (let index = 0; index < result.nodes.length; index += 1) {
    const node = result.nodes[index];
    assert.ok(node.x >= 0 && node.y >= 0);
    assert.ok(node.x + node.width <= result.width);
    assert.ok(node.y + node.height <= result.height);
    for (const other of result.nodes.slice(index + 1)) {
      const overlap = node.x < other.x + other.width && node.x + node.width > other.x
        && node.y < other.y + other.height && node.y + node.height > other.y;
      assert.equal(overlap, false, `${node.id} 与 ${other.id} 不应重叠`);
    }
  }
  for (const edge of result.edges) {
    const source = boxes.get(edge.from);
    const target = boxes.get(edge.to);
    assert.ok(source.rank < target.rank, `${edge.from} → ${edge.to} 应从左到右`);
    assert.ok(source.x + source.width < target.x);
    const coordinates = edge.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const points = [];
    for (let index = 0; index < coordinates.length; index += 2) points.push(coordinates.slice(index, index + 2));
    assert.equal(points[0][0], source.x + source.width);
    assert.equal(points.at(-1)[0], target.x);
    assert.ok(points[0][1] > source.y && points[0][1] < source.y + source.height);
    assert.ok(points.at(-1)[1] > target.y && points.at(-1)[1] < target.y + target.height);
    for (const point of points) assert.ok(point[0] >= 0 && point[0] <= result.width && point[1] >= 0 && point[1] <= result.height);
    for (let index = 1; index < points.length; index += 1) {
      for (const node of result.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue;
        assert.equal(segmentHitsInterior(points[index - 1], points[index], node), false,
          `${edge.from} → ${edge.to} 的线段穿过 ${node.id}`);
      }
    }
  }
  return result;
}

test('真实 248 节点总图和四个领域保留所有边、无重叠且连线不穿节点', () => {
  const all = getBranchGraph(catalog, 'all');
  verifyLayout(all.nodes, all.edges);
  for (const domain of DOMAINS) {
    const branch = getBranchGraph(catalog, domain.id);
    const result = verifyLayout(branch.nodes, branch.edges);
    for (let index = 1; index < result.stages.length; index += 1) {
      assert.ok(result.stages[index - 1].x + result.stages[index - 1].width < result.stages[index].x);
    }
  }
});

test('同阶段依赖继续水平推进，跨列长边绕开中间卡片', () => {
  const skills = [
    { id: 'start', stage: 's1' },
    { id: 'middle', stage: 's1' },
    { id: 'finish', stage: 's1' },
    { id: 'later', stage: 's2' },
  ];
  const edges = [
    { from: 'start', to: 'middle', kind: 'ancestor' },
    { from: 'middle', to: 'finish', kind: 'descendant' },
    { from: 'start', to: 'finish', kind: 'supporting' },
    { from: 'finish', to: 'later', kind: 'descendant' },
  ];
  const result = verifyLayout(skills, edges);
  assert.deepEqual(result.nodes.map(node => node.rank), [0, 1, 2, 3]);
  assert.equal(result.stages.length, 2);
  assert.ok(result.stages[0].width > result.nodes[0].width * 3);
});

test('空图可正常显示，循环依赖提供明确错误', () => {
  assert.deepEqual(layoutGraph([], []), { width: 0, height: 0, nodes: [], edges: [], stages: [] });
  assert.throws(() => layoutGraph([{ id: 'a', stage: 's0' }, { id: 'b', stage: 's0' }], [
    { from: 'a', to: 'b' }, { from: 'b', to: 'a' },
  ]), /技能依赖存在循环/);
});
