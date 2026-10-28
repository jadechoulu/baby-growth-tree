import { validateBackup } from './model.mjs';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const hasContent = (value) => typeof value === 'string' && value.trim().length > 0;

export function combineLocalImports(sources, validIds) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('没有可导入的本地记录');

  const validated = sources.map((source, index) => {
    const label = source.label || `本地记录 ${index + 1}`;
    try {
      return { label, snapshot: validateBackup(source.snapshot, validIds) };
    } catch (error) {
      throw new Error(`${label} 无法导入：${error.message}`);
    }
  });
  const profile = validated[0].snapshot.profile;
  for (const source of validated.slice(1)) {
    if (source.snapshot.profile.name !== profile.name || source.snapshot.profile.birthDate !== profile.birthDate) {
      throw new Error(`${validated[0].label} 与 ${source.label} 的宝宝昵称或出生日期不一致，请分别预览导入，避免混合不同宝宝的记录。`);
    }
  }

  const records = new Map();
  const provenance = new Map();
  const conflicts = [];
  for (const { label, snapshot } of validated) {
    for (const [skillId, incoming] of Object.entries(snapshot.records)) {
      const record = records.get(skillId) || {};
      const fieldSources = provenance.get(skillId) || {};
      for (const field of ['completedAt', 'note']) {
        if (!own(incoming, field)) continue;
        if (!own(record, field) || (!hasContent(record[field]) && hasContent(incoming[field]))) {
          record[field] = incoming[field];
          fieldSources[field] = label;
        } else if (record[field] !== incoming[field] && hasContent(record[field]) && hasContent(incoming[field])) {
          conflicts.push({
            skillId, field, kept: record[field], ignored: incoming[field],
            keptSource: fieldSources[field], ignoredSource: label,
          });
        }
      }
      records.set(skillId, record);
      provenance.set(skillId, fieldSources);
    }
  }
  return {
    snapshot: { version: 1, profile: { ...profile }, records: Object.fromEntries(records) },
    sources: validated.map((source) => source.label),
    conflicts,
  };
}

export function mergeImportedGrowth(current, imported) {
  const records = new Map(Object.entries(current.records).map(([id, record]) => [id, { ...record }]));
  for (const [id, incoming] of Object.entries(imported.records)) {
    const next = { ...incoming };
    const existing = records.get(id);
    if (!own(incoming, 'note') && existing && own(existing, 'note')) next.note = existing.note;
    records.set(id, next);
  }
  return { version: 1, profile: { ...imported.profile }, records: Object.fromEntries(records) };
}
