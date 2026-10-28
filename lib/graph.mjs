import { STAGES, getStageSkills } from './model.mjs';

function indexCatalog(catalog) {
  const byId = new Map(catalog.map(skill => [skill.id, skill]));
  const children = new Map(catalog.map(skill => [skill.id, []]));
  for (const skill of catalog) {
    for (const parent of skill.parents || []) children.get(parent)?.push(skill.id);
  }
  return { byId, children };
}

function collectRelated(startIds, nextIds) {
  const found = new Set();
  const pending = [...startIds];
  while (pending.length) {
    const id = pending.pop();
    if (found.has(id)) continue;
    found.add(id);
    pending.push(...nextIds(id));
  }
  return found;
}

function graphEdges(nodes, kindForEdge) {
  const included = new Set(nodes.map(skill => skill.id));
  return nodes.flatMap(skill => (skill.parents || [])
    .filter(parent => included.has(parent))
    .map(parent => ({ from: parent, to: skill.id, kind: kindForEdge(parent, skill.id) })));
}

export function getSkillRelations(catalog, id) {
  const { byId, children: childIds } = indexCatalog(catalog);
  const skill = byId.get(id);
  if (!skill) return null;

  const ancestorIds = collectRelated(skill.parents || [], current => byId.get(current)?.parents || []);
  const descendantIds = collectRelated(childIds.get(id) || [], current => childIds.get(current) || []);
  const included = collectRelated([id, ...descendantIds], current => byId.get(current)?.parents || []);
  const supportingIds = new Set([...included].filter(current => current !== id
    && !ancestorIds.has(current) && !descendantIds.has(current)));
  const select = ids => catalog.filter(item => ids.has(item.id));
  const nodes = select(included);

  return {
    skill,
    parents: select(new Set(skill.parents || [])),
    children: select(new Set(childIds.get(id))),
    ancestors: select(ancestorIds),
    descendants: select(descendantIds),
    supporting: select(supportingIds),
    nodes,
    edges: graphEdges(nodes, (from, to) => supportingIds.has(from) || supportingIds.has(to)
      ? 'supporting'
      : to === id || ancestorIds.has(to) ? 'ancestor' : 'descendant'),
  };
}

export function getBranchGraph(catalog, domain, category = 'all') {
  const { byId } = indexCatalog(catalog);
  const selected = catalog.filter(skill => (domain === 'all' || skill.domain === domain)
    && (category === 'all' || skill.category === category));
  const selectedIds = new Set(selected.map(skill => skill.id));
  const included = collectRelated([...selectedIds], id => byId.get(id)?.parents || []);
  const nodes = catalog.filter(skill => included.has(skill.id));
  const contextIds = nodes.filter(skill => !selectedIds.has(skill.id)).map(skill => skill.id);
  const context = new Set(contextIds);
  return {
    nodes,
    edges: graphEdges(nodes, (from, to) => context.has(from) || context.has(to) ? 'supporting' : 'descendant'),
    contextIds,
  };
}

export function getStageGraph(catalog, stageId, domain) {
  const { byId, children } = indexCatalog(catalog);
  const stageSkills = getStageSkills(catalog, stageId).filter(skill => skill.domain === domain);
  const stageIds = stageSkills.map(skill => skill.id);
  const downstream = collectRelated(stageIds, id => children.get(id) || []);
  // 后续技能可能由多条分支汇合，连同这些分支的前序一起保留。
  const included = collectRelated([...downstream], id => byId.get(id)?.parents || []);
  const nodes = catalog.filter(skill => included.has(skill.id));
  return { nodes, edges: graphEdges(nodes, () => 'neutral'), stageIds, contextIds: [] };
}

export function getLineagePaths(catalog, id, maxPaths = 120) {
  const { byId, children } = indexCatalog(catalog);
  if (!byId.has(id)) return null;
  const order = new Map(catalog.map((skill, index) => [skill.id, index]));
  const parentIds = current => [...(byId.get(current).parents || [])]
    .sort((a, b) => order.get(a) - order.get(b));
  const childIds = current => children.get(current);
  const countPaths = (current, next, memo) => {
    if (memo.has(current)) return memo.get(current);
    const neighbours = next(current);
    const count = neighbours.length
      ? neighbours.reduce((sum, related) => sum + countPaths(related, next, memo), 0)
      : 1;
    memo.set(current, count);
    return count;
  };
  const total = countPaths(id, parentIds, new Map()) * countPaths(id, childIds, new Map());
  const limit = Math.max(0, Math.floor(maxPaths));
  const enumerate = (current, next) => {
    const paths = [];
    const visit = (path, endpoint) => {
      if (paths.length >= limit) return;
      const neighbours = next(endpoint);
      if (!neighbours.length) {
        paths.push(path);
        return;
      }
      for (const related of neighbours) {
        visit([...path, related], related);
        if (paths.length >= limit) break;
      }
    };
    visit([current], current);
    return paths;
  };
  const prefixes = enumerate(id, parentIds).map(path => path.reverse());
  const suffixes = enumerate(id, childIds);
  const paths = [];
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      if (paths.length >= limit) break;
      paths.push({ ids: [...prefix, ...suffix.slice(1)] });
    }
    if (paths.length >= limit) break;
  }
  return { paths, total, truncated: paths.length < total };
}

const NODE_WIDTH = 212;
const NODE_HEIGHT = 112;
const COLUMN_GAP = 104;
const ROW_GAP = 32;
const COLUMN_PITCH = NODE_WIDTH + COLUMN_GAP;
const ROW_PITCH = NODE_HEIGHT + ROW_GAP;
const PAD_X = 32;
const PAD_Y = 96;

// 阶段先确定左右次序；同一阶段中继续按前序关系增加列数。
function rankNodes(nodes, edges) {
  const byId = new Map(nodes.map((node, index) => [node.id, { node, index }]));
  const parents = new Map(nodes.map(node => [node.id, []]));
  const children = new Map(nodes.map(node => [node.id, []]));
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    parents.get(edge.to).push(edge.from);
    children.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  const pending = nodes.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  const ordered = [];
  while (pending.length) {
    const id = pending.shift();
    ordered.push(id);
    for (const child of children.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) pending.push(child);
    }
  }
  if (ordered.length !== nodes.length) throw new Error('技能依赖存在循环，无法绘制成长脉络');

  const stageIndex = new Map(STAGES.map((stage, index) => [stage.id, index]));
  const knownStages = [...new Set(nodes.map(node => node.stage))]
    .sort((a, b) => (stageIndex.get(a) ?? STAGES.length) - (stageIndex.get(b) ?? STAGES.length));
  const ranks = new Map();
  let nextRank = 0;
  for (const stage of knownStages) {
    const stageNodes = ordered.filter(id => byId.get(id).node.stage === stage);
    let stageLastRank = nextRank;
    for (const id of stageNodes) {
      const parentRanks = parents.get(id).filter(parent => ranks.has(parent)).map(parent => ranks.get(parent) + 1);
      const rank = Math.max(nextRank, ...parentRanks);
      ranks.set(id, rank);
      stageLastRank = Math.max(stageLastRank, rank);
    }
    nextRank = stageLastRank + 1;
  }

  // 对未来配置中阶段标注晚于后续技能的情况，仍以依赖顺序保证从左到右。
  for (const id of ordered) {
    const minRank = Math.max(0, ...parents.get(id).map(parent => ranks.get(parent) + 1));
    ranks.set(id, Math.max(ranks.get(id), minRank));
  }
  return { byId, parents, children, ranks };
}

function orderColumns(nodes, graph) {
  const columns = new Map();
  for (const node of nodes) {
    const rank = graph.ranks.get(node.id);
    if (!columns.has(rank)) columns.set(rank, []);
    columns.get(rank).push(node.id);
  }
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  const rowCount = Math.max(...[...columns.values()].map(ids => ids.length));
  const rowPositions = new Map();
  const updateRows = rank => {
    const ids = columns.get(rank);
    const offset = Math.floor((rowCount - ids.length) / 2);
    ids.forEach((id, index) => rowPositions.set(id, index + offset));
  };
  ranks.forEach(updateRows);
  const reorder = (rank, neighbours) => {
    const score = id => {
      const related = neighbours.get(id);
      return related.length ? related.reduce((sum, other) => sum + rowPositions.get(other), 0) / related.length : rowPositions.get(id);
    };
    const scores = new Map(columns.get(rank).map(id => [id, score(id)]));
    columns.get(rank).sort((a, b) => scores.get(a) - scores.get(b)
      || graph.byId.get(a).index - graph.byId.get(b).index);
    updateRows(rank);
  };
  for (let pass = 0; pass < 4; pass += 1) {
    ranks.forEach(rank => reorder(rank, graph.parents));
    [...ranks].reverse().forEach(rank => reorder(rank, graph.children));
  }
  return { rowPositions, rowCount };
}

const round = value => Math.round(value * 100) / 100;
const pathFromPoints = points => points.map(([x, y], index) => `${index ? 'L' : 'M'} ${round(x)} ${round(y)}`).join(' ');

export function layoutGraph(nodes, edges) {
  if (!nodes.length) return { width: 0, height: 0, nodes: [], edges: [], stages: [] };
  const graph = rankNodes(nodes, edges);
  const { rowPositions, rowCount } = orderColumns(nodes, graph);
  const positioned = nodes.map(node => ({
    id: node.id,
    x: PAD_X + graph.ranks.get(node.id) * COLUMN_PITCH,
    y: rowPositions.get(node.id) * ROW_PITCH,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    rank: graph.ranks.get(node.id),
  }));
  const byId = new Map(positioned.map(node => [node.id, node]));
  const routes = edges.filter(edge => byId.has(edge.from) && byId.has(edge.to)).map(edge => ({
    ...edge,
    source: byId.get(edge.from),
    target: byId.get(edge.to),
  }));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  const incoming = new Map(nodes.map(node => [node.id, []]));
  const gapRoutes = new Map();
  const addGapRoute = (rank, route, side) => {
    if (!gapRoutes.has(rank)) gapRoutes.set(rank, []);
    gapRoutes.get(rank).push({ route, side });
  };
  for (const route of routes) {
    outgoing.get(route.from).push(route);
    incoming.get(route.to).push(route);
    addGapRoute(route.source.rank, route, 'departureX');
    if (route.target.rank > route.source.rank + 1) addGapRoute(route.target.rank - 1, route, 'arrivalX');
  }
  // 每一条垂直线有自己的列间通道，箭头进入节点时保留水平段。
  for (const [rank, gap] of gapRoutes) {
    gap.forEach(({ route, side }, index) => {
      route[side] = PAD_X + rank * COLUMN_PITCH + NODE_WIDTH + 16 + (index + 1) * (COLUMN_GAP - 32) / (gap.length + 1);
    });
  }
  const assignPorts = (groups, field, other) => {
    for (const group of groups.values()) {
      group.sort((a, b) => a[other].y - b[other].y);
      group.forEach((route, index) => {
        const portOffset = group.length === 1 ? 0 : -28 + index * 56 / (group.length - 1);
        route[field] = route[field === 'sourceY' ? 'source' : 'target'].y + NODE_HEIGHT / 2 + portOffset;
      });
    }
  };
  assignPorts(outgoing, 'sourceY', 'target');
  assignPorts(incoming, 'targetY', 'source');

  // 所有列使用同一行网格，跨列水平线只走行间空白，绝不切穿技能卡片。
  const gridBottom = (rowCount - 1) * ROW_PITCH + NODE_HEIGHT;
  const tracks = [];
  for (let row = 0; row < rowCount - 1; row += 1) {
    for (const offset of [8, 16, 24]) tracks.push({ y: row * ROW_PITCH + NODE_HEIGHT + offset, intervals: [] });
  }
  tracks.push({ y: -16, intervals: [] }, { y: gridBottom + 16, intervals: [] });
  let outerTrackCount = 1;
  const longRoutes = routes.filter(route => route.target.rank > route.source.rank + 1)
    .sort((a, b) => (b.target.rank - b.source.rank) - (a.target.rank - a.source.rank));
  for (const route of longRoutes) {
    const left = route.departureX;
    const right = route.arrivalX;
    const candidates = tracks.filter(track => track.intervals.every(([start, end]) => right + 10 < start || left > end + 10));
    let track = candidates.sort((a, b) => {
      const cost = candidate => Math.abs(route.sourceY - candidate.y) + Math.abs(route.targetY - candidate.y)
        + Math.abs((route.sourceY + route.targetY) / 2 - candidate.y) * 0.01;
      return cost(a) - cost(b);
    })[0];
    if (!track) {
      outerTrackCount += 1;
      const above = { y: -16 * outerTrackCount, intervals: [] };
      const below = { y: gridBottom + 16 * outerTrackCount, intervals: [] };
      tracks.push(above, below);
      track = route.sourceY + route.targetY < gridBottom ? above : below;
    }
    track.intervals.push([left, right]);
    route.trackY = track.y;
  }

  const usedTracks = longRoutes.map(route => route.trackY);
  const offsetY = PAD_Y - Math.min(0, ...usedTracks);
  positioned.forEach(node => { node.y += offsetY; });
  const routedEdges = routes.map(route => {
    const startX = route.source.x + NODE_WIDTH;
    const endX = route.target.x;
    const sourceY = route.sourceY + offsetY;
    const targetY = route.targetY + offsetY;
    const adjacent = route.target.rank === route.source.rank + 1;
    const points = adjacent
      ? [[startX, sourceY], [route.departureX, sourceY], [route.departureX, targetY], [endX, targetY]]
      : [[startX, sourceY], [route.departureX, sourceY], [route.departureX, route.trackY + offsetY],
        [route.arrivalX, route.trackY + offsetY], [route.arrivalX, targetY], [endX, targetY]];
    return {
      from: route.from,
      to: route.to,
      kind: route.kind,
      path: pathFromPoints(points),
      labelX: adjacent ? round(route.departureX) : round((route.departureX + route.arrivalX) / 2),
      labelY: adjacent ? round((sourceY + targetY) / 2) : round(route.trackY + offsetY),
    };
  });
  const stages = [...new Set(nodes.map(node => node.stage))].map(id => {
    const members = nodes.filter(node => node.stage === id).map(node => byId.get(node.id));
    const left = Math.min(...members.map(node => node.x));
    const right = Math.max(...members.map(node => node.x + NODE_WIDTH));
    return { id, label: STAGES.find(stage => stage.id === id)?.label || id, x: left - 16, width: right - left + 32 };
  }).sort((a, b) => a.x - b.x);
  return {
    width: Math.max(...positioned.map(node => node.x + NODE_WIDTH)) + PAD_X,
    height: Math.max(gridBottom, ...usedTracks) + offsetY + 32,
    nodes: positioned,
    edges: routedEdges,
    stages,
  };
}
