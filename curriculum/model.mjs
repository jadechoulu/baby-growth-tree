import { isCharacterKey } from './literacy-model.mjs';
import { validShelfRecord } from './shelf-model.mjs?v=20261119-qiaohu';
export const statuses = { candidate: '待选', planned: '计划中', using: '进行中', done: '已完成', paused: '已暂停' };
export function materialKey(id, grade) { return `material:${id}:${grade}`; }
export function goalKey(id, grade, subject) { return `goal:${grade}:${subject}:${id}`; }
export function statusOf(records, key) { return records[key]?.status || 'planned'; }
export function filterMaterials(materials, records, filters) {
  const terms = (filters.search || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return materials.flatMap(material => material.refs.filter(ref =>
    (!filters.grade || ref.grade === filters.grade) &&
    (!filters.phase || ref.phases.includes(filters.phase)) &&
    (!filters.subject || material.subject === filters.subject) &&
    (!filters.type || material.type === filters.type) &&
    (!filters.status || statusOf(records, materialKey(material.id, ref.grade)) === filters.status) &&
    terms.every(term => [material.title, ref.level, material.note].join(' ').toLocaleLowerCase().includes(term))
  ).map(ref => ({ ...material, ref, key: materialKey(material.id, ref.grade) })));
}
export function summary(items, records) {
 return { total: items.length, done: items.filter(x => statusOf(records,x.key) === 'done').length, using: items.filter(x => statusOf(records,x.key) === 'using').length };
}
// @CfSecAICode 遵循消费金融安全编码 SEC-MAINSITE-DESERIALIZE-001 规范: JSON导入先验证独立分类、记录状态与素材字段，再进入保存事务。
export function validateBackup(input) {
 if (input?.kind !== 'curriculum' || input.version !== 1 || !input.records || typeof input.records !== 'object' || Array.isArray(input.records) || !Array.isArray(input.custom)) throw new Error('请选择幼儿园全科启蒙备份，不能导入英语或成长记录。');
 for (const [key, value] of Object.entries(input.records)) {
  if (/^(shelf:|shelf-sync:)/.test(key) && !validShelfRecord(key,value)) throw new Error('备份中的中文书架格式无效。');
  if ((!/^(material:|goal:|book:|catalog:|shelf:v1:|shelf-sync:v1:)/.test(key) && !isCharacterKey(key)) || !value || typeof value !== 'object' || !Object.hasOwn(statuses, value.status) || (value.note !== undefined && typeof value.note !== 'string')) throw new Error('备份中的状态或记录格式无效。');
 }
 const ids = new Set();
 for (const m of input.custom) {
  if (!m || typeof m.id !== 'string' || !m.id.startsWith('custom-') || ids.has(m.id) || typeof m.title !== 'string' || !m.title.trim() || !['chinese','english','math'].includes(m.subject) || !['reader','picture','poem','workbook','animation','tool'].includes(m.type) || !Array.isArray(m.refs) || !m.refs.length || m.refs.some(r => !['junior','middle','senior'].includes(r.grade) || typeof r.level !== 'string' || !Array.isArray(r.phases) || r.phases.some(p => !['autumn','winter','spring','summer'].includes(p))) || (m.note !== undefined && typeof m.note !== 'string')) throw new Error('备份中的自选素材格式无效。');
  ids.add(m.id);
 }
 return input;
}
// 导入只补本机不存在的键；冲突保留本机，避免旧备份覆盖最新状态。
export function mergeBackup(current, incoming) {
 validateBackup(incoming);
 const records = { ...incoming.records, ...current.records };
 const custom = [...current.custom, ...incoming.custom.filter(x => !current.custom.some(y => y.id === x.id))];
 const conflicts = Object.keys(incoming.records).filter(k => current.records[k] && JSON.stringify(current.records[k]) !== JSON.stringify(incoming.records[k])).length;
 return { value: { ...current, records, custom }, conflicts };
}
export function patchDocument(current, changes, expected) {
 const records = { ...current.records };
 for (const [key, value] of Object.entries(changes.records || {})) {
  if (expected && JSON.stringify(current.records[key]) !== JSON.stringify(expected.records[key])) throw new Error('其他页面已更新同一条记录，请重新打开后再保存。');
  records[key] = { ...records[key], ...value };
 }
 const custom = [...current.custom];
 for (const item of changes.custom || []) {
  const i = custom.findIndex(x => x.id === item.id);
  if (expected && JSON.stringify(current.custom.find(x => x.id === item.id)) !== JSON.stringify(expected.custom.find(x => x.id === item.id))) throw new Error('其他页面已更新这项候选素材，请重新打开后保存。');
  if (i < 0) custom.push(item); else custom[i] = { ...custom[i], ...item };
 }
 return { ...current, records, custom };
}
