import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const APP = 'https://app.xiaohuasheng.cn';
const MAX_BODY = 8 * 1024 * 1024;
const GUID = /^[a-zA-Z0-9_-]{1,80}$/;
const ID = /^[1-9][0-9]{0,19}$/;
const JOB_TTL = 16 * 60_000;
const md5 = text => createHash('md5').update(text).digest('hex');
const hash = text => createHash('sha256').update(text).digest('hex');
const errors = {
  XHS_NOT_CONFIGURED: '云端尚未配置小花生授权，原进度保留。',
  XHS_AUTH_REQUIRED: '云端小花生授权已失效，需要更新授权；登录小花生网页不能修复此授权。',
  XHS_UNAVAILABLE: '云端暂时无法读取小花生，请稍后重试；原进度保留。',
  XHS_INCOMPLETE: '小花生书架或目录不完整，未更新进度。',
  XHS_TIMEOUT: '云端读取超时，原进度保留，可重新同步。',
};
export class XhsError extends Error {
  constructor(code) { super(errors[code] || errors.XHS_UNAVAILABLE); this.code = code; }
}
function fail(code = 'XHS_INCOMPLETE') { throw new XhsError(code); }
function credentials(env) {
  let config;
  try { config = JSON.parse(env.XIAOHUASHENG_CREDENTIALS || 'null'); } catch { /* 固定错误，不回显秘密。 */ }
  if (!config || typeof config.userId !== 'string' || !ID.test(config.userId) || typeof config.seed !== 'string' || !config.seed || typeof config.authorization !== 'string' || !config.authorization) fail('XHS_NOT_CONFIGURED');
  return config;
}
function decode(outer) {
  if (String(outer?.M) !== '1001') fail('XHS_AUTH_REQUIRED');
  try {
    if (typeof outer.J !== 'string' || outer.J.length > MAX_BODY * 1.5) fail();
    try { return JSON.parse(outer.J); } catch { /* 兼容已验证CLI的原始内层JSON与Base64编码。 */ }
    const bytes = Buffer.from(outer.J, 'base64');
    const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: MAX_BODY }) : bytes;
    if (decoded.length > MAX_BODY) fail();
    return JSON.parse(decoded.toString('utf8'));
  } catch (error) { if (error instanceof XhsError) throw error; fail(); }
}
async function body(response) {
  const reader = response.body?.getReader();
  if (!reader) fail();
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); fail(); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(); }
}
export function createAppClient({ config, network = fetch, now = Date.now }) {
  const headers = () => ({ Authorization: config.authorization, version: config.version || '4.3.6', platform: config.platform || 'android', 'User-Agent': config.userAgent || 'xiaoya-private-reader', timezone: config.timezone || '8', 'Accept-Encoding': 'identity' });
  async function request(url, extra = {}) {
    // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 授权只发往固定官方地址，拒绝跳转，错误不回显请求或第三方正文。
    let response;
    try { response = await network(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { ...headers(), ...extra } }); }
    catch { fail('XHS_UNAVAILABLE'); }
    if ([401, 403].includes(response.status)) fail('XHS_AUTH_REQUIRED');
    if (!response.ok) fail('XHS_UNAVAILABLE');
    return decode(await body(response));
  }
  return {
    async refresh() {
      const stamp = String(Math.floor(now() / 1000));
      // 原站已验证的旧令牌协议，调用范围与本机CLI一致；不探测或降级其他地址。
      const rows = await request('http://www.xiaohuasheng.cn:83/UserService.svc/getToken/' + config.userId + '/' + stamp + '/' + md5(config.userId + stamp + config.seed));
      if (!Array.isArray(rows) || rows.length !== 1 || !/^[0-9a-fA-F-]{36}$/.test(rows[0]?.name)) fail('XHS_AUTH_REQUIRED');
      config.token = rows[0].name;
    },
    async get(path) {
      // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 仅服务器固定本人书架、目录、详情路由可签名，客户端不指定账号或URL。
      if (typeof config.token !== 'string' || !config.token) fail('XHS_AUTH_REQUIRED');
      const own = new RegExp('^/bookroom/queryBookroomBook/' + config.userId + '/-2/-1/-1/[0-9]+/30$');
      if (!own.test(path) && !/^\/book\/(getBookInfo5\/[1-9][0-9]*|getBooksInTaoxi\/[1-9][0-9]*\/[0-9]+\/100)$/.test(path)) fail();
      const timestamp = String(Math.floor(now() / 1000));
      return request(APP + '/' + path, { userId: config.userId, timestamp, signature: md5(config.userId + timestamp + path + config.token + config.seed) });
    },
  };
}
function identity(row, idKey = 'bookId') {
  if (!row || !ID.test(String(row[idKey])) || typeof row.guid !== 'string' || !GUID.test(row.guid)) fail();
  return String(row[idKey]);
}
export function catalogMetadata(row) {
  const appBookId = identity(row, 'pk');
  if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 1000) fail();
  // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-002 规范: 详情仅提取书目白名单，社区、孩子、评论和未知私人字段不交网页。
  const result = { bookId: row.guid, appBookId, title: row.name.trim(), language: typeof row.language === 'string' ? row.language : '' };
  let cover = row.frontCover;
  if (typeof cover === 'string' && cover.length <= 1500) {
    if (cover && !/^(https?:|\/\/)/.test(cover)) cover = 'https://img.xiaohuasheng.cn/' + cover.replace(/^\/+/, '');
    if (cover.startsWith('https://img.xiaohuasheng.cn/')) result.cover = cover;
  }
  for (const [from, to] of [['isbn13', 'isbn'], ['author', 'author'], ['press', 'publisher']]) if (typeof row[from] === 'string' && row[from].length <= 300) result[to] = row[from];
  if (ID.test(String(row.taoxiId)) && typeof row.taoxiGuid === 'string' && GUID.test(row.taoxiGuid) && typeof row.taoxiName === 'string' && row.taoxiName.trim() && row.taoxiName.length <= 500) result.series = { id: row.taoxiGuid, appBookId: String(row.taoxiId), title: row.taoxiName.trim() };
  return result;
}
async function parallel(items, operation) {
  const results = new Array(items.length); let next = 0, failure;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length && !failure) {
      const index = next++;
      try { results[index] = await operation(items[index]); }
      catch (error) { failure ||= error; }
    }
  }));
  // 等待已经发出的请求结束，避免失败任务落定后仍回写“进行中”。
  if (failure) throw failure;
  return results;
}
const get = async (store, key) => (await store.getWithMetadata(key, { type: 'json', consistency: 'strong' }))?.data;

/** 同一派生契约供原有逐本匹配导入；原始书架只保存在私有服务端历史。 */
export async function fetchSnapshot({ config, client, store, history, now = Date.now, progress = async () => {} }) {
  const rows = [], pages = [], ids = new Set(), guids = new Set(); let complete = false;
  for (let page = 0; page < 100; page++) {
    const offset = rows.length, batch = await client.get('/bookroom/queryBookroomBook/' + config.userId + '/-2/-1/-1/' + offset + '/30');
    if (!Array.isArray(batch) || batch.length > 30) fail();
    pages.push({ offset, limit: 30, returned: batch.length, status: 200, M: '1001' });
    for (const row of batch) {
      const id = identity(row);
      if (ids.has(id) || guids.has(row.guid) || ![0, 1].includes(row.readedFlag) || typeof row.readedFlag !== 'number') fail();
      if (row.readedFlag === 1 && (!Number.isSafeInteger(row.readCount) || row.readCount < 0)) fail();
      ids.add(id); guids.add(row.guid); rows.push(row);
    }
    await store.setJSON(history + '/page-' + page, { at: new Date(now()).toISOString(), pages: pages.at(-1), books: batch });
    await progress({ phase: 'bookcase', books: rows.length, pages: pages.length });
    if (batch.length < 30) { complete = true; break; }
  }
  if (!complete || !rows.length) fail();
  const fetchedAt = new Date(now()).toISOString();
  const read = rows.filter(row => row.readedFlag === 1).map(row => {
    const title = row.bookNameFromServer || row.name;
    if (typeof title !== 'string' || !title.trim() || title.length > 1000) fail();
    return { bookId: row.guid, appBookId: String(row.bookId), title: title.trim(), readCount: row.readCount };
  });
  if (!read.length) fail();
  let resolved = 0;
  async function detail(id, guid) {
    const key = 'catalog/' + config.userId + '/' + id;
    let value = await get(store, key);
    if (!value || value.appBookId !== String(id) || guid && value.bookId !== guid) {
      const raw = await client.get('/book/getBookInfo5/' + id);
      value = catalogMetadata(raw);
      if (value.appBookId !== String(id) || guid && value.bookId !== guid) fail();
      await store.setJSON(key, value);
    }
    return value;
  }
  const books = await parallel(rows, async row => {
    const metadata = await detail(String(row.bookId), row.guid);
    resolved++;
    if (resolved % 20 === 0 || resolved === rows.length) await progress({ phase: 'catalog', books: rows.length, resolved, total: rows.length });
    return { ...metadata, read: row.readedFlag === 1, isCollection: row.isTaoxi === 1 };
  });
  const collections = [], readIds = new Set(read.map(book => book.bookId));
  for (const parent of books.filter(book => book.isCollection && book.language === '英文')) {
    const key = 'collection/' + config.userId + '/' + parent.appBookId;
    let collection = await get(store, key);
    if (!collection || collection.parentId !== parent.bookId || collection.complete !== true) {
      const parentRaw = await client.get('/book/getBookInfo5/' + parent.appBookId), total = parentRaw?.bookCount;
      if (identity(parentRaw, 'pk') !== parent.appBookId || parentRaw.guid !== parent.bookId || !Number.isSafeInteger(total) || total < 1) fail();
      const members = [], seen = new Set(), seenGuids = new Set();
      for (let page = 0; page < 100 && members.length < total; page++) {
        const batch = await client.get('/book/getBooksInTaoxi/' + parent.appBookId + '/' + members.length + '/100');
        if (!Array.isArray(batch) || !batch.length || batch.length > 100) fail();
        for (const row of batch) {
          const id = identity(row, row?.pk ? 'pk' : 'bookId');
          if (seen.has(id) || seenGuids.has(row.guid)) fail();
          seen.add(id); seenGuids.add(row.guid); members.push({ id, guid: row.guid });
        }
      }
      if (members.length !== total) fail();
      collection = { parentId: parent.bookId, appBookId: parent.appBookId, title: parent.title, total, complete: true, books: await parallel(members, row => detail(row.id, row.guid)) };
      await store.setJSON(key, collection);
    }
    collections.push({ ...collection, books: collection.books.map(book => ({ ...book, read: readIds.has(book.bookId), isCollection: false, series: { id: parent.bookId, appBookId: parent.appBookId, title: parent.title } })) });
    await progress({ phase: 'collections', resolved: collections.length, total: books.filter(book => book.isCollection && book.language === '英文').length });
  }
  return { schemaVersion: 1, sourceKind: 'xiaohuasheng_bookcase_read', sourceUrl: APP + '//bookroom/queryBookroomBook/' + config.userId + '/-2/-1/-1/0/30', transport: 'xiaohuasheng-app-api', predicate: 'readedFlag=1', accountId: config.userId, snapshotId: 'xiaohuasheng-app-' + config.userId + '-' + fetchedAt, fetchedAt, complete: true, authenticated: true, advertisedCount: read.length, actualUniqueCount: read.length, wholeBookcaseCount: rows.length, pages, books: read, shelfCatalog: { version: 1, complete: true, total: books.length, books, collections } };
}

/** 私有任务状态与缓存；仅由通过既有本人鉴权的API及一次性后台能力调用。 */
export function createXhsService({ env, store, network = fetch, now = Date.now }) {
  const owner = String(env.GITHUB_ALLOWED_USER_ID), current = 'current/' + owner;
  const config = () => credentials(env);
  const publicJob = job => ({ status: job.status, progress: job.progress || null, ...(job.status === 'complete' ? { snapshot: job.snapshot } : {}), ...(job.status === 'failed' ? { code: job.code, message: errors[job.code] || errors.XHS_UNAVAILABLE } : {}) });
  async function status() {
    const job = await get(store, current);
    if (!job) return { status: 'idle' };
    if (['queued', 'running'].includes(job.status) && now() - job.createdAt > JOB_TTL) return { status: 'failed', code: 'XHS_TIMEOUT', message: errors.XHS_TIMEOUT };
    return publicJob(job);
  }
  return {
    status,
    async backup(snapshot) {
      const key = 'backups/' + owner + '/' + now() + '-' + randomBytes(12).toString('hex');
      await store.setJSON(key, { savedAt: new Date(now()).toISOString(), snapshot }, { onlyIfNew: true });
      return { saved: true };
    },
    async start() {
      config();
      const entry = await store.getWithMetadata(current, { type: 'json', consistency: 'strong' });
      if (entry && now() - entry.data.createdAt < JOB_TTL && ['queued', 'running'].includes(entry.data.status)) return publicJob(entry.data);
      const jobId = randomBytes(16).toString('hex'), capability = randomBytes(32).toString('hex');
      const job = { jobId, createdAt: now(), status: 'queued', capabilityHash: hash(capability) };
      const result = await store.setJSON(current, job, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
      if (!result.modified) return status();
      try {
        // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-002 规范: 后台仅接收一次性随机能力，不接收小花生凭据；固定本站目标且拒绝跳转。
        const response = await network(new URL('/.netlify/functions/xiaohuasheng-background', env.WORKER_URL), { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, capability }), signal: AbortSignal.timeout(10000) });
        if (response.status !== 202) fail('XHS_UNAVAILABLE');
      } catch { await store.setJSON(current, { ...job, status: 'failed', code: 'XHS_UNAVAILABLE' }); }
      return status();
    },
    async run({ jobId, capability }) {
      if (!/^[a-f0-9]{32}$/.test(jobId || '') || !/^[a-f0-9]{64}$/.test(capability || '')) return false;
      const entry = await store.getWithMetadata(current, { type: 'json', consistency: 'strong' }), job = entry?.data;
      // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 后台以原子条件消费一次性能力；猜ID、重放、过期任务均不能抓取本人书架。
      if (!job || job.jobId !== jobId || job.status !== 'queued' || now() - job.createdAt > JOB_TTL || !timingSafeEqual(Buffer.from(hash(capability)), Buffer.from(job.capabilityHash))) return false;
      const claimed = await store.setJSON(current, { ...job, status: 'running' }, { onlyIfMatch: entry.etag });
      if (!claimed.modified) return false;
      const history = 'history/' + owner + '/' + jobId;
      try {
        const settings = config(), client = createAppClient({ config: settings, network, now });
        await client.refresh();
        const snapshot = await fetchSnapshot({ config: settings, client, store, history, now, progress: async progress => store.setJSON(current, { ...job, status: 'running', progress }) });
        await store.setJSON(history + '/snapshot', snapshot);
        await store.setJSON(current, { ...job, status: 'complete', snapshot });
      } catch (error) {
        const result = { status: 'failed', code: error instanceof XhsError ? error.code : 'XHS_UNAVAILABLE', finishedAt: new Date(now()).toISOString() };
        await store.setJSON(history + '/result', result);
        await store.setJSON(current, { ...job, ...result });
      }
      return true;
    },
  };
}
