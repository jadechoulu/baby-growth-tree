import { validateBackup } from './model.mjs';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const RECORD_FIELDS = ['completedAt', 'note'];
const PROFILE_FIELDS = ['name', 'birthDate'];

function cloudError(code, message, details = {}) {
  return Object.assign(new Error(message), details, { code });
}

function normalizeSnapshot(value, validIds) {
  if (value === null) return null;
  // @CfSecAICode 遵循消费金融安全编码 SEC-MAINSITE-DESERIALIZE-001 规范: 云端 JSON 通过现有字段级 schema 后才进入应用状态。
  return validateBackup(value, validIds ?? Object.keys(value?.records ?? {}));
}

function fieldValue(snapshot, key) {
  if (key.startsWith('profile.')) return snapshot?.profile[key.slice(8)];
  const [, skillId, field] = key.split('.');
  return own(snapshot?.records ?? {}, skillId) ? snapshot.records[skillId]?.[field] : undefined;
}

function defineRecord(records, id, record) {
  Object.defineProperty(records, id, { value: record, enumerable: true, writable: true, configurable: true });
}

/** 按资料字段和技能字段三方合并。冲突预览暂取本地值，调用方必须先明确解决冲突。 */
export function mergeGrowthSnapshots(base, local, remote, resolutions = {}) {
  base = normalizeSnapshot(base);
  local = normalizeSnapshot(local);
  remote = normalizeSnapshot(remote);
  if (local === null) return { snapshot: remote, conflicts: [] };
  if (remote === null) return { snapshot: local, conflicts: [] };

  const conflicts = [];
  const choose = (key, field, skillId) => {
    const before = fieldValue(base, key);
    const here = fieldValue(local, key);
    const there = fieldValue(remote, key);
    if (here === there) return here;
    if (here === before) return there;
    if (there === before) return here;
    const resolution = own(resolutions, key) ? resolutions[key] : undefined;
    if (resolution === 'local') return here;
    if (resolution === 'remote') return there;
    conflicts.push({ key, field, ...(skillId ? { skillId } : {}), base: before ?? null, local: here ?? null, remote: there ?? null });
    return here;
  };

  const profile = {};
  for (const field of PROFILE_FIELDS) profile[field] = choose(`profile.${field}`, field);
  const records = {};
  const ids = new Set([...Object.keys(base?.records ?? {}), ...Object.keys(local.records), ...Object.keys(remote.records)]);
  for (const id of ids) {
    const record = {};
    for (const field of RECORD_FIELDS) {
      const value = choose(`records.${id}.${field}`, field, id);
      if (value !== undefined) record[field] = value;
    }
    if (Object.keys(record).length) defineRecord(records, id, record);
  }
  return { snapshot: { version: 1, profile, records }, conflicts };
}

function sameSnapshot(left, right) {
  if (left === null || right === null) return left === right;
  if (PROFILE_FIELDS.some(field => left.profile[field] !== right.profile[field])) return false;
  const ids = new Set([...Object.keys(left.records), ...Object.keys(right.records)]);
  return [...ids].every(id => RECORD_FIELDS.every(field => fieldValue(left, `records.${id}.${field}`) === fieldValue(right, `records.${id}.${field}`)));
}

function normalizeEnvelope(value, validIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !own(value, 'snapshot')) throw cloudError('INVALID_RESPONSE', '云端返回的成长记录格式无效。');
  let snapshot;
  try { snapshot = normalizeSnapshot(value.snapshot, validIds); }
  catch (cause) { throw cloudError('INVALID_RESPONSE', '云端成长记录未通过格式校验，请保留当前记录并重试。', { cause }); }
  const revision = value.revision;
  if (snapshot === null ? revision !== null : typeof revision !== 'string' || !revision.length) throw cloudError('INVALID_RESPONSE', '云端记录缺少有效版本，已停止保存。');
  const savedAt = value.savedAt;
  if (savedAt !== null && (typeof savedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(savedAt) || !Number.isFinite(Date.parse(savedAt)))) throw cloudError('INVALID_RESPONSE', '云端保存时间格式无效。');
  return { snapshot, revision, savedAt };
}

/** 仅保存 Worker 会话令牌；GitHub OAuth 凭据由服务端管理，客户端不写任何本机记录。 */
export function createCloudStore({ apiBase, validIds, getToken, fetcher = globalThis.fetch }) {
  if (typeof apiBase !== 'string' || !apiBase.trim()) throw new Error('尚未配置云端服务地址。');
  if (typeof getToken !== 'function' || typeof fetcher !== 'function') throw new Error('云端连接配置无效。');
  const baseUrl = apiBase.replace(/\/+$/, '');
  const knownIds = new Set(validIds);
  let latest = { snapshot: null, revision: null, savedAt: null };
  let loaded = false;

  async function request(path, method = 'GET', body) {
    const token = await getToken();
    if (typeof token !== 'string' || !token) throw cloudError('AUTH_REQUIRED', '请先登录 GitHub，再读取或保存成长记录。');
    // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 会话令牌仅作为授权请求头传给配置的服务，不进入 URL、日志或本机存储。
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        method, headers, credentials: 'omit', cache: 'no-store', redirect: 'error',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw cloudError('NETWORK_ERROR', '无法连接云端，当前修改尚未同步，请重试或导出备份。', { cause });
    }
    let payload;
    try { payload = await response.json(); }
    catch (cause) {
      if (response.status === 401) throw cloudError('AUTH_REQUIRED', '登录已失效，请重新登录后继续同步。');
      if (!response.ok) throw cloudError('HTTP_ERROR', '云端暂时无法保存，当前修改尚未同步。', { status: response.status });
      throw cloudError('INVALID_RESPONSE', '云端响应格式无效，当前修改尚未确认同步。', { cause });
    }
    if (response.status === 401) throw cloudError('AUTH_REQUIRED', '登录已失效，请重新登录后继续同步。');
    if (response.status === 403) throw cloudError('ACCESS_DENIED', '当前 GitHub 账号没有这份成长记录的访问权限。');
    if (!response.ok) {
      if (response.status === 409 && payload?.code === 'VERSION_CONFLICT') throw cloudError('VERSION_CONFLICT', '云端记录已由其他设备更新。', { payload });
      throw cloudError('HTTP_ERROR', '云端暂时无法保存，当前修改尚未同步。', { status: response.status });
    }
    return payload;
  }

  async function load() {
    latest = normalizeEnvelope(await request('/api/records'), knownIds);
    loaded = true;
    return normalizeEnvelope(latest, knownIds);
  }

  async function save(snapshot, baseSnapshot = null, resolutions = {}) {
    const local = normalizeSnapshot(snapshot, knownIds);
    if (local === null) throw new Error('不能将空资料写入云端。');
    const base = normalizeSnapshot(baseSnapshot, knownIds);
    if (!loaded) await load(); // 首次保存前必须读取，空默认状态不能盲目覆盖已有云端记录。
    const resolvedRemoteValues = new Map(Object.keys(resolutions).map(key => [key, fieldValue(latest.snapshot, key)]));

    for (let attempt = 0; attempt <= 3; attempt += 1) {
      const applicableResolutions = Object.fromEntries(Object.entries(resolutions).filter(([key]) => fieldValue(latest.snapshot, key) === resolvedRemoteValues.get(key)));
      const merged = mergeGrowthSnapshots(base, local, latest.snapshot, applicableResolutions);
      if (merged.conflicts.length) {
        throw cloudError('MERGE_CONFLICT', '多个设备修改了相同内容，请选择保留哪个版本后继续同步。', {
          conflicts: merged.conflicts, snapshot: merged.snapshot, base, local,
          remote: normalizeSnapshot(latest.snapshot, knownIds), revision: latest.revision, savedAt: latest.savedAt,
        });
      }
      if (sameSnapshot(merged.snapshot, latest.snapshot)) return normalizeEnvelope(latest, knownIds);
      try {
        const saved = normalizeEnvelope(await request('/api/records', 'PUT', { snapshot: merged.snapshot, revision: latest.revision }), knownIds);
        // 必须收到服务端确认的规范化快照和版本，不能把本机更新当作云端保存成功。
        if (!sameSnapshot(saved.snapshot, merged.snapshot)) throw cloudError('INVALID_RESPONSE', '云端确认的内容与本次保存不同，请重新读取后重试。');
        latest = saved;
        return normalizeEnvelope(saved, knownIds);
      } catch (error) {
        if (error.code !== 'VERSION_CONFLICT') throw error;
        latest = normalizeEnvelope(error.payload, knownIds);
        if (attempt === 3) throw cloudError('RETRY_EXHAUSTED', '云端记录正在被其他设备连续更新，请稍后重试；当前修改仍保留在页面中。', {
          remote: normalizeSnapshot(latest.snapshot, knownIds), revision: latest.revision, savedAt: latest.savedAt,
        });
      }
    }
  }

  async function session() {
    const payload = await request('/api/session');
    const user = payload?.user;
    if (!user || !Number.isSafeInteger(user.id) || user.id < 1 || typeof user.login !== 'string' || !user.login.length) throw cloudError('INVALID_RESPONSE', '登录身份校验失败，请重新登录。');
    return { user: { id: user.id, login: user.login } };
  }

  async function logout() {
    try { await request('/api/logout', 'POST'); }
    finally { latest = { snapshot: null, revision: null, savedAt: null }; loaded = false; }
  }

  return { load, save, session, logout };
}
