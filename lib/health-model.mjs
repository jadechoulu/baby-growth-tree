import { getAge } from './model.mjs';

export const HEALTH_STANDARD = 'WS/T 580—2017';
export const HEALTH_MONTHS = Object.freeze([...Array.from({ length: 12 }, (_, i) => i + 1), ...Array.from({ length: 8 }, (_, i) => 15 + i * 3), ...Array.from({ length: 8 }, (_, i) => 42 + i * 6)]);
export const HEALTH_DOMAINS = Object.freeze([
  { id: 'gross', label: '大运动', description: '身体姿势、头平衡及坐爬立走跑跳' },
  { id: 'fine', label: '精细动作', description: '使用手指的能力' },
  { id: 'adaptive', label: '适应能力', description: '对自然环境和社会需要的反应与适应' },
  { id: 'language', label: '语言', description: '语言理解与表达' },
  { id: 'social', label: '社会行为', description: '与人交往及生活自理' },
]);
export const OBSERVATION_LABELS = Object.freeze({ observed: '已观察到', 'not-yet': '暂未观察到', unrecorded: '未记录' });
export const emptyHealth = () => ({ version: 1, standard: HEALTH_STANDARD, records: {} });

// 仅组织阅读；保留项目原始月龄，不作为正式施测月龄或能力依赖。
export const HEALTH_STAGES = Object.freeze([
  [0, 3], [4, 6], [7, 9], [10, 12], [13, 18], [19, 24], [25, 30], [31, 36],
  [37, 48], [49, 60], [61, 72], [73, 84],
].map(([min, max]) => Object.freeze({ id: `h${min}`, min, max, label: `${min}–${max}个月` })));
export function healthStage(month) {
  return HEALTH_STAGES.find(stage => month >= stage.min && month <= stage.max) || HEALTH_STAGES[0];
}
export function stageHealthItems(items, stage) {
  return items.filter(item => item.month >= stage.min && item.month <= stage.max);
}
export function completeHealthStage(snapshot, items, stage, today, domain = null) {
  const next = structuredClone(snapshot || emptyHealth());
  for (const item of stageHealthItems(items, stage)) {
    if (domain && item.domain !== domain) continue;
    const previous = next.records[item.id];
    if (previous?.status === 'observed') continue;
    next.records[item.id] = { ...previous, status: 'observed', observedAt: today };
  }
  return next;
}
// 月龄仅作阅读参考；观察记录推进同能区的时间序列，不声明前置能力。
export function nextHealthItems(items, records, currentStage) {
  return HEALTH_DOMAINS.flatMap(domain => {
    const timeline = items.filter(item => item.domain === domain.id);
    const observed = timeline.filter(item => records[item.id]?.status === 'observed');
    const latest = observed.length ? Math.max(...observed.map(item => item.month)) : null;
    const candidates = timeline.filter(item => records[item.id]?.status !== 'observed');
    const following = candidates.filter(item => latest !== null && item.month > latest);
    const nextMonth = following.length ? Math.min(...following.map(item => item.month))
      : latest === null && !currentStage && candidates.length ? Math.min(...candidates.map(item => item.month)) : null;
    const availableThrough = Math.max(currentStage?.max ?? 0, latest ?? 0);
    return candidates.filter(item => item.month <= availableThrough || item.month === nextMonth);
  });
}

export function referenceMonth(birthDate, now = new Date()) {
  const age = getAge(birthDate, now);
  if (!age) return 1;
  const months = Math.round((age.totalMonths + age.days / 30) * 10) / 10;
  return HEALTH_MONTHS.findLast(month => month <= months) || 1;
}

export function filterHealth(items, records, { month, domain = 'all', status = 'all', search = '' } = {}) {
  const query = search.trim().toLocaleLowerCase();
  return items.filter(item => (month === undefined || item.month === month)
    && (domain === 'all' || item.domain === domain)
    && (status === 'all' || (records[item.id]?.status || 'unrecorded') === status)
    && (!query || `${item.number} ${item.title} ${item.method} ${item.requirement}`.toLocaleLowerCase().includes(query)));
}

export function observationStats(items, records) {
  return { total: items.length, observed: items.filter(item => records[item.id]?.status === 'observed').length,
    notYet: items.filter(item => records[item.id]?.status === 'not-yet').length,
    recorded: items.filter(item => records[item.id]?.status || records[item.id]?.note).length };
}

// 必须明确所属标准；备份不包含另一版本数据或同步身份。
export function validateHealthBackup(value, normalize) {
  return normalize('health', value);
}
