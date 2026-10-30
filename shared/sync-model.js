/* 同步边界的数据格式与三方合并；分类继续保留自己的本机数据模型。 */
(function (root) {
  'use strict';
  const copy = value => value === undefined ? undefined : structuredClone(value);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const equal = (a, b) => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
    if (!object(a) || !object(b)) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(key => equal(a[key], b[key]));
  };
  function normalize(area, value, validIds) {
    if (value === null) return null;
    if (!object(value) || value.version !== 1) throw new Error('同步记录格式无效。');
    const fields = (value, allowed) => {
      if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('同步记录包含不支持的字段。');
    };
    const text = (value, limit) => { if (typeof value !== 'string' || value.length > limit) throw new Error('记录文字格式无效。'); return value; };
    const id = value => { if (typeof value !== 'string' || !value || value.length > 160 || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error('记录标识无效。'); return value; };
    if (area === 'profile') {
      fields(value, ['version', 'name', 'birthDate']);
      const name = text(value.name, 30).trim();
      if (!name || value.birthDate !== '2024-11-24') throw new Error('宝宝档案格式无效。');
      return { version: 1, name, birthDate: value.birthDate };
    }
    if (area === 'health') {
      fields(value, ['version', 'standard', 'records']);
      if (value.standard !== 'WS/T 580—2017' || !object(value.records)) throw new Error('卫健委观察记录格式无效。');
      const records = Object.fromEntries(Object.entries(value.records).map(([key, record]) => {
        // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-002 规范: 新领域只接受标准内固定项目标识与明确记录字段。
        if (!/^wst580-\d{3}$/.test(key) || Number(key.slice(7)) < 1 || Number(key.slice(7)) > 261) throw new Error('记录包含未知评估项目。');
        fields(record, ['status', 'observedAt', 'note']);
        const next = {};
        if (Object.hasOwn(record, 'status')) {
          if (!['observed', 'not-yet'].includes(record.status)) throw new Error('观察状态无效。');
          next.status = record.status;
        }
        if (Object.hasOwn(record, 'observedAt')) {
          const date = text(record.observedAt, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new Error('观察日期无效。');
          next.observedAt = date;
        }
        if (Object.hasOwn(record, 'note')) next.note = text(record.note, 2000);
        return [key, next];
      }));
      return { version: 1, standard: value.standard, records };
    }
    if (!['growth', 'english'].includes(area)) throw new Error('未知记录分类。');
    fields(value, area === 'growth' ? ['version', 'records'] : ['version', 'profile', 'favorites', 'records']);
    if (!object(value.records)) throw new Error('记录列表格式无效。');
    const records = Object.fromEntries(Object.entries(value.records).map(([key, record]) => {
      id(key);
      if (area === 'growth' && validIds && !validIds.has(key)) throw new Error('记录包含未知技能。');
      fields(record, area === 'growth' ? ['completedAt', 'note'] : ['status', 'note']);
      const result = {};
      if (Object.hasOwn(record, 'note')) result.note = text(record.note, area === 'growth' ? 2000 : 4000);
      if (Object.hasOwn(record, 'completedAt')) {
        const date = text(record.completedAt, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new Error('完成日期无效。');
        result.completedAt = date;
      }
      if (Object.hasOwn(record, 'status')) {
        if (!['not-started', 'using', 'done'].includes(record.status)) throw new Error('素材状态无效。');
        result.status = record.status;
      }
      return [key, result];
    }));
    if (area === 'growth') return { version: 1, records };
    fields(value.profile, ['vocabulary', 'mode']);
    if (!Number.isInteger(value.profile.vocabulary) || value.profile.vocabulary < 0 || value.profile.vocabulary > 20000 || !['audio', 'video'].includes(value.profile.mode) || !Array.isArray(value.favorites)) throw new Error('英语档案格式无效。');
    return { version: 1, profile: { vocabulary: value.profile.vocabulary, mode: value.profile.mode }, favorites: [...new Set(value.favorites.map(id))].sort(), records };
  }
  function merge(base, local, remote, choices = {}) {
    if (local === null) return { snapshot: copy(remote), conflicts: [] };
    if (remote === null) return { snapshot: copy(local), conflicts: [] };
    const conflicts = [];
    function walk(before, here, there, path) {
      if (equal(here, there)) return copy(here);
      if (equal(here, before)) return copy(there);
      if (equal(there, before)) return copy(here);
      if (Array.isArray(here) && Array.isArray(there)) {
        const was = new Set(before || []), a = new Set(here), b = new Set(there);
        return [...new Set([...was, ...a, ...b])].filter(key => a.has(key) === b.has(key) ? a.has(key) : a.has(key) === was.has(key) ? b.has(key) : a.has(key)).sort();
      }
      if ((here === undefined || object(here)) && (there === undefined || object(there)) && (before === undefined || before === null || object(before))) {
        const result = {};
        for (const key of new Set([...Object.keys(before || {}), ...Object.keys(here || {}), ...Object.keys(there || {})])) {
          const next = walk(before?.[key], here?.[key], there?.[key], [...path, key]);
          if (next !== undefined) Object.defineProperty(result, key, { value: next, enumerable: true, configurable: true, writable: true });
        }
        return Object.keys(result).length || (object(here) && object(there)) ? result : undefined;
      }
      const key = JSON.stringify(path);
      if (choices[key] === 'local') return copy(here);
      if (choices[key] === 'remote') return copy(there);
      conflicts.push({ key, path, base: copy(before), local: copy(here), remote: copy(there) });
      return copy(here);
    }
    return { snapshot: walk(base, local, remote, []), conflicts };
  }
  const api = { normalize, merge, equal, copy };
  root.XiaoyaSyncModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
