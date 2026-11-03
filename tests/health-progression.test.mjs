import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HEALTH_PROGRESSION, healthProgressionContext, healthGraph } from '../lib/health-progression.mjs';
import { layoutGraph } from '../lib/graph.mjs';
import { nextHealthItems, healthStage, HEALTH_STAGES, emptyHealth } from '../lib/health-model.mjs';

const { items } = JSON.parse(await readFile(new URL('../data/health-standard.json', import.meta.url)));
const byId = new Map(items.map(item => [item.id, item]));

test('人工进阶关系引用真实项目、有明确理由、无重复和环，不按相邻月龄补边', () => {
  const seen = new Set();
  for (const edge of HEALTH_PROGRESSION) {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    assert.ok(from && to, JSON.stringify(edge));
    assert.equal(from.domain, to.domain);
    assert.ok(from.month < to.month);
    assert.ok(edge.reason && edge.basis.includes('本站整理'));
    assert.equal(seen.has(`${edge.from}:${edge.to}`), false);
    seen.add(`${edge.from}:${edge.to}`);
    assert.equal(healthProgressionContext(edge.to).after.has(edge.from), false);
  }
  assert.equal(seen.has('wst580-129:wst580-147'), false, '上楼不自动连到同月龄下楼');
  assert.equal(seen.has('wst580-128:wst580-129'), false, '同月龄脚尖走与上楼没有自动关系');
});

test('上楼可跨多个阶段追踪行走、扶扶手、独自和双足交替，独立项目不借月龄配对', () => {
  const context = healthProgressionContext('wst580-146');
  assert.deepEqual(new Set(context.before), new Set(['wst580-077', 'wst580-104', 'wst580-112', 'wst580-129']));
  assert.deepEqual([...context.after], ['wst580-183']);
  assert.equal(context.edges.length, 5);
  assert.deepEqual([...healthProgressionContext('wst580-147').ids], ['wst580-147']);
  const fine = healthProgressionContext('wst580-167');
  assert.deepEqual(new Set(fine.before), new Set(['wst580-149']));
  assert.equal(fine.edges.length, 1, '成人辅助拉动与自行插头条件不同，不强连');
});

test('跨龄关系保留直接长边与分支，不用中间月份的其他任务填链', () => {
  const jump = healthProgressionContext('wst580-184');
  assert.deepEqual([...jump.before], ['wst580-138']);
  assert.deepEqual([...jump.after], ['wst580-194']);
  assert.equal(jump.ids.has('wst580-165'), false, '立定跳远不是从台阶跳下的必经项');
  const balance = healthProgressionContext('wst580-156');
  assert.ok(balance.before.has('wst580-103'), '12月独站可直接连接30月单脚站');
  assert.equal(balance.ids.has('wst580-112'), false, '不把行走插入单脚平衡链');
  const drawing = healthProgressionContext('wst580-175');
  assert.ok(drawing.before.has('wst580-121'));
  assert.equal(drawing.ids.has('wst580-148'), false, '模仿竖线不作交叉线的必经项');
  const shapes = healthProgressionContext('wst580-151');
  assert.deepEqual([...shapes.before], ['wst580-123']);
  assert.deepEqual([...shapes.after], ['wst580-160']);
  assert.equal(shapes.ids.has('wst580-141'), false, '倒放圆块与正放三形为不同分支');
});

test('整理进阶关系不补记完成，也不把参考边当作下一步推荐解锁条件', () => {
  const snapshot = emptyHealth();
  snapshot.records['wst580-146'] = { status: 'observed', observedAt: '2026-11-03' };
  const before = structuredClone(snapshot);
  healthProgressionContext('wst580-146');
  const next = nextHealthItems(items, snapshot.records, healthStage(27));
  assert.ok(next.some(item => item.id === 'wst580-129'), '较早项目仍需独立观察');
  assert.ok(next.some(item => item.id === 'wst580-156'), '原按能区月龄推荐保留');
  assert.deepEqual(snapshot, before);
});

test('全261项均有核对决策，未确认方向的相似任务保留独立', async () => {
  const { review } = JSON.parse(await readFile(new URL('../.rich-harness/tasks/health-skill-progression/review.json', import.meta.url)));
  assert.deepEqual(review.map(row => row.id), items.map(item => item.id));
  for (const row of review) {
    assert.ok(row.reason.length > 12 && row.methodPage);
    const hasEdge = HEALTH_PROGRESSION.some(edge => edge.from === row.id || edge.to === row.id);
    assert.equal(row.decision, hasEdge ? 'linked' : 'no-arrow');
  }
  for (const n of [66, 117, 131, 133, 147, 159, 173, 182, 204, 223]) {
    const id = `wst580-${String(n).padStart(3, '0')}`;
    assert.deepEqual([...healthProgressionContext(id).ids], [id]);
  }
});

test('共享追踪补齐后续的另一分支，宝宝视角保留本阶段全部项目与前后链', () => {
  const graph = healthGraph(items, { domain: 'fine', focus: 'wst580-166' });
  assert.ok(graph.relation.supporting.some(item => item.id === 'wst580-195'));
  assert.ok(graph.nodes.some(item => item.id === 'wst580-235'));
  const stage = healthStage(27), baby = healthGraph(items, { domain: 'gross', stage, focus: 'wst580-146' });
  for (const n of [129, 146, 147, 156, 183, 193, 203]) assert.ok(baby.nodes.some(item => item.number === n));
  assert.equal(baby.edges.some(edge => edge.from === 'wst580-129' && edge.to === 'wst580-147'), false);
  const all = healthGraph(items, { domain: 'gross', focus: 'wst580-146', mode: 'overview' });
  assert.equal(all.nodes.length, items.filter(item => item.domain === 'gross').length);
  assert.ok(all.edges.some(edge => edge.kind === 'ancestor'));
  assert.ok(all.edges.some(edge => edge.kind === 'neutral'));
});

test('卫健委各能区与每项聚焦图均用共享布局，保留阅读阶段及完整边', () => {
  for (const domain of ['gross', 'fine', 'adaptive', 'language', 'social']) {
    const graph = healthGraph(items, { domain });
    const layout = layoutGraph(graph.nodes, graph.edges, HEALTH_STAGES);
    assert.equal(layout.nodes.length, graph.nodes.length);
    assert.equal(layout.edges.length, graph.edges.length);
    for (const stage of layout.stages) assert.equal(stage.label, HEALTH_STAGES.find(value => value.id === stage.id).label);
    for (const edge of layout.edges) {
      const from = layout.nodes.find(node => node.id === edge.from), to = layout.nodes.find(node => node.id === edge.to);
      assert.ok(from.x < to.x, '同一阅读阶段的关系仍向右推进');
    }
    for (const item of graph.nodes) {
      const context = healthGraph(items, { domain, focus: item.id });
      assert.doesNotThrow(() => layoutGraph(context.nodes, context.edges, HEALTH_STAGES));
    }
  }
});
