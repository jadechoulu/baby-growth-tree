export const STAGES = Object.freeze([
  { id: 's0', label: '0–3个月', shortLabel: '0–3月', minMonths: 0, maxMonths: 3 },
  { id: 's1', label: '4–6个月', shortLabel: '4–6月', minMonths: 4, maxMonths: 6 },
  { id: 's2', label: '7–9个月', shortLabel: '7–9月', minMonths: 7, maxMonths: 9 },
  { id: 's3', label: '10–12个月', shortLabel: '10–12月', minMonths: 10, maxMonths: 12 },
  { id: 's4', label: '13–18个月', shortLabel: '13–18月', minMonths: 13, maxMonths: 18 },
  { id: 's5', label: '19–24个月', shortLabel: '19–24月', minMonths: 19, maxMonths: 24 },
  { id: 's6', label: '25–30个月', shortLabel: '25–30月', minMonths: 25, maxMonths: 30 },
  { id: 's7', label: '31–36个月', shortLabel: '31–36月', minMonths: 31, maxMonths: 35 },
  { id: 's8', label: '3–6岁', shortLabel: '3–6岁', minMonths: 36, maxMonths: 72 },
].map(Object.freeze));

export const DOMAINS = Object.freeze([
  { id: 'cognition', label: '认知', description: '从认识自己，到理解身边的世界' },
  { id: 'sensory', label: '感知觉', description: '通过视觉、听觉和身体感受认识环境' },
  { id: 'gross', label: '粗大运动', description: '抬头、翻身、行走与全身协调' },
  { id: 'fine', label: '精细动作', description: '抓握、操作与手眼协调' },
].map(Object.freeze));

export const DEFAULT_PROFILE = Object.freeze({ name: '宝宝', birthDate: '' });

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function utcDate(year, monthIndex, day) {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function parseDate(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = utcDate(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

export function localDateString(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('日期无效');
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addCalendarMonths(date, count) {
  const first = utcDate(date.getUTCFullYear(), date.getUTCMonth() + count, 1);
  const lastDay = utcDate(first.getUTCFullYear(), first.getUTCMonth() + 1, 0).getUTCDate();
  return utcDate(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), lastDay));
}

export function getAge(birthDate, now = new Date()) {
  const birth = parseDate(birthDate);
  if (!birth || !(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const today = utcDate(now.getFullYear(), now.getMonth(), now.getDate());
  if (today < birth) return null;

  let totalMonths = (today.getUTCFullYear() - birth.getUTCFullYear()) * 12 + today.getUTCMonth() - birth.getUTCMonth();
  if (addCalendarMonths(birth, totalMonths) > today) totalMonths -= 1;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const days = Math.round((today - addCalendarMonths(birth, totalMonths)) / DAY_MS);
  const label = `${years ? `${years}岁` : ''}${months ? `${months}个月` : ''}${days ? `${days}天` : ''}` || '0天';
  return { years, months, days, totalMonths, label };
}

export function getStageForAge(totalMonths) {
  if (typeof totalMonths !== 'number' || !Number.isFinite(totalMonths) || totalMonths < 0 || totalMonths > 72) return null;
  const completeMonths = Math.floor(totalMonths);
  return STAGES.find((stage) => completeMonths >= stage.minMonths && completeMonths <= stage.maxMonths) || null;
}

export function skillInStage(skill, stageId) {
  const selected = STAGES.findIndex((stage) => stage.id === stageId);
  const start = STAGES.findIndex((stage) => stage.id === skill?.stage);
  const end = skill?.endStage === undefined ? start : STAGES.findIndex((stage) => stage.id === skill.endStage);
  return selected >= 0 && start >= 0 && end >= start && selected >= start && selected <= end;
}

export function getStageSkills(catalog, stageId) {
  return catalog.filter((skill) => skillInStage(skill, stageId));
}

export function getNextSkill(catalog, records, domain) {
  const pending = catalog.filter(skill => skill.domain === domain && !records[skill.id]?.completedAt);
  return pending.find(skill => (skill.parents || []).every(id => records[id]?.completedAt)) || pending[0] || null;
}

export function getSkillAgeStatus(skill, currentStageId) {
  const current = STAGES.findIndex(stage => stage.id === currentStageId);
  const start = STAGES.findIndex(stage => stage.id === skill.stage);
  if (current < 0 || start < 0) return 'unknown';
  if (skillInStage(skill, currentStageId)) return 'current';
  if (start < current) return 'earlier';
  return start === current + 1 ? 'next' : 'later';
}

export function getStats(skills, records) {
  const total = skills.length;
  const completed = skills.reduce((count, skill) => count + (own(records, skill.id) && records[skill.id]?.completedAt ? 1 : 0), 0);
  return { total, completed, remaining: total - completed, percent: total ? Math.round(completed / total * 100) : 0 };
}

export function toggleRecord(records, id, today) {
  if (!parseDate(today)) throw new Error('完成日期应为有效的 YYYY-MM-DD 日期');
  const result = Object.fromEntries(Object.entries(records));
  const previous = own(records, id) ? records[id] : undefined;
  const next = {};
  if (previous && own(previous, 'note')) next.note = previous.note;
  if (!previous?.completedAt) next.completedAt = today;
  if (Object.keys(next).length) {
    Object.defineProperty(result, id, { value: next, enumerable: true, configurable: true, writable: true });
  } else {
    delete result[id];
  }
  return result;
}

export function completeRecords(records, skills, today) {
  if (!parseDate(today)) throw new Error('完成日期应为有效的 YYYY-MM-DD 日期');
  const result = Object.fromEntries(Object.entries(records));
  for (const skill of skills) {
    const previous = own(result, skill.id) ? result[skill.id] : undefined;
    if (previous?.completedAt) continue;
    Object.defineProperty(result, skill.id, {
      value: { ...previous, completedAt: today }, enumerable: true, configurable: true, writable: true,
    });
  }
  return result;
}

function isObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateBackup(value, validIds) {
  if (!isObject(value) || value.version !== 1) throw new Error('备份格式无效或版本不受支持');
  if (!isObject(value.profile)) throw new Error('备份缺少宝宝资料');
  const name = typeof value.profile.name === 'string' ? value.profile.name.trim() : '';
  if (name.length < 1 || name.length > 30) throw new Error('宝宝昵称应为 1–30 个字符');
  if (!parseDate(value.profile.birthDate)) throw new Error('出生日期应为有效的 YYYY-MM-DD 日期');
  if (!isObject(value.records)) throw new Error('备份中的技能记录格式无效');

  const knownIds = new Set(validIds);
  const records = {};
  for (const [id, record] of Object.entries(value.records)) {
    if (!knownIds.has(id)) throw new Error(`备份包含未知技能：${id}`);
    if (!isObject(record)) throw new Error(`技能 ${id} 的记录格式无效`);
    const normalized = {};
    if (own(record, 'completedAt')) {
      if (!parseDate(record.completedAt)) throw new Error(`技能 ${id} 的完成日期无效`);
      normalized.completedAt = record.completedAt;
    }
    if (own(record, 'note')) {
      if (typeof record.note !== 'string' || record.note.length > 2000) throw new Error(`技能 ${id} 的笔记应不超过 2000 个字符`);
      normalized.note = record.note;
    }
    if (Object.keys(normalized).length) {
      Object.defineProperty(records, id, { value: normalized, enumerable: true, configurable: true, writable: true });
    }
  }
  // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-002 规范: 导入数据仅提取公开字段，避免覆盖应用字段。
  return { version: 1, profile: { name, birthDate: value.profile.birthDate }, records };
}
