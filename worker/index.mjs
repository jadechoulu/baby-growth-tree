import catalog from '../data/catalog.json' with { type: 'json' };
import { validateBackup } from '../lib/model.mjs';

const VALID_IDS = new Set(catalog.map((skill) => skill.id));
const MAX_BYTES = 1_048_576;
const STATE_TTL = 10 * 60_000;
const SESSION_TTL = 12 * 60 * 60_000;
const COOKIE = '__Host-xiaoya-oauth';
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const REQUEST_NONCE = /^[A-Za-z0-9_-]{32,128}$/;
const SHA = /^[a-f0-9]{40,64}$/;
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

function randomNonce() {
  // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-002 规范: OAuth 和会话使用 256 位密码学随机值。
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantEqual(left, right) {
  const a = encoder.encode(left || '');
  const b = encoder.encode(right || '');
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

function toBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

function decodeContent(content) {
  if (typeof content !== 'string' || content.length > MAX_BYTES * 1.5) throw new HttpError(502, 'INVALID_CLOUD_DATA', '云端记录格式异常，请保留本机记录并检查仓库文件。');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(content.replace(/\s/g, '')), (char) => char.charCodeAt(0))); }
  catch { throw new HttpError(502, 'INVALID_CLOUD_DATA', '云端记录格式异常，请保留本机记录并检查仓库文件。'); }
}

async function readJson(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'JSON_REQUIRED', '请求需要使用 JSON。');
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE', '记录文件不能超过 1 MiB。');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'INVALID_JSON', '请求内容无效。');
  let bytes = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > MAX_BYTES) { await reader.cancel(); throw new HttpError(413, 'BODY_TOO_LARGE', '记录文件不能超过 1 MiB。'); }
    chunks.push(value);
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(combined)); }
  catch { throw new HttpError(400, 'INVALID_JSON', '请求内容不是有效的 JSON。'); }
}

function configuration(env) {
  try {
    const frontend = new URL(env.FRONTEND_URL);
    const worker = new URL(env.WORKER_URL);
    if (frontend.protocol !== 'https:' || worker.protocol !== 'https:' || frontend.username || frontend.password || worker.username || worker.password || frontend.hash || frontend.search || worker.pathname !== '/' || worker.search || worker.hash) throw new Error();
    if (!/^\d+$/.test(env.GITHUB_ALLOWED_USER_ID) || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.GITHUB_DATA_TOKEN || !env.AUTH_STATE) throw new Error();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_DATA_REPO) || !env.GITHUB_DATA_BRANCH || !env.GITHUB_DATA_PATH) throw new Error();
    const segments = env.GITHUB_DATA_PATH.split('/');
    if (segments.some((part) => !part || part === '.' || part === '..')) throw new Error();
    const origins = new Set([frontend.origin]);
    if (env.DEV_FRONTEND_ORIGIN) {
      const dev = new URL(env.DEV_FRONTEND_ORIGIN);
      if (dev.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(dev.hostname) || dev.origin !== env.DEV_FRONTEND_ORIGIN) throw new Error();
      origins.add(dev.origin);
    }
    return { frontend, worker, origins, callback: `${worker.origin}/auth/callback`, ...env };
  } catch { throw new HttpError(503, 'NOT_CONFIGURED', '云端服务尚未完成配置。'); }
}

function cookieValue(request, name) {
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function responseHeaders(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  if (origin) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); }
  return new Response(response.body, { status: response.status, headers });
}

function popupResponse(message, origin, clear = true) {
  const nonce = randomNonce();
  const inline = (value) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 登录结果只发往固定前端来源，令牌不进入 URL。
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>小芽 · GitHub 登录</title><body><p>${message.error ? '登录未完成，请关闭窗口后重试。' : '登录成功，可以关闭此窗口。'}</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${inline(message)},${inline(origin)});window.close();}</script></body></html>`;
  return new Response(html, { status: message.error ? 400 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`, ...(clear ? { 'Set-Cookie': clearCookie } : {}) } });
}

/** SQLite Durable Object：只有 Worker 绑定可调用；状态消费与删除属于同一原子事务。 */
export class AuthState {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS auth_items (kind TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(kind, key))');
  }

  async fetch(request) {
    const { operation, kind, key, payload, expiresAt, now } = await request.json();
    if (!['state', 'session'].includes(kind) || !/^[a-f0-9]{64}$/.test(key) || !Number.isFinite(now)) return json({ code: 'INVALID_INTERNAL_REQUEST' }, 400);
    // @CfSecAICode 遵循消费金融安全编码 BE-SQL-001 规范: 状态和会话键均通过绑定参数进入固定 SQL。
    const result = this.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM auth_items WHERE expires_at <= ?', now);
      if (operation === 'put') {
        this.sql.exec('INSERT OR REPLACE INTO auth_items (kind, key, payload, expires_at) VALUES (?, ?, ?, ?)', kind, key, JSON.stringify(payload), expiresAt);
        return { ok: true };
      }
      const row = this.sql.exec('SELECT payload FROM auth_items WHERE kind = ? AND key = ?', kind, key).toArray()[0];
      if (operation === 'consume' || operation === 'delete') this.sql.exec('DELETE FROM auth_items WHERE kind = ? AND key = ?', kind, key);
      return operation === 'delete' ? { ok: true } : row ? JSON.parse(row.payload) : null;
    });
    return json(result);
  }
}

export function createWorker({ fetch: network = globalThis.fetch, now = Date.now } = {}) {
  async function stateStore(config, operation, kind, key, payload, expiresAt) {
    const stub = config.AUTH_STATE.get(config.AUTH_STATE.idFromName('xiaoya-auth'));
    const response = await stub.fetch(new Request('https://auth.internal/', { method: 'POST', body: JSON.stringify({ operation, kind, key, payload, expiresAt, now: now() }) }));
    if (!response.ok) throw new HttpError(503, 'AUTH_UNAVAILABLE', '登录服务暂时不可用。');
    return response.json();
  }

  async function github(config, path, options = {}) {
    // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 私有仓库凭据只用于服务端 GitHub API，不进入响应或日志。
    let response;
    try { response = await network(`https://api.github.com${path}`, { ...options, redirect: 'error', headers: { Authorization: `Bearer ${config.GITHUB_DATA_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'xiaoya-growth-worker', ...options.headers } }); }
    catch { throw new HttpError(502, 'GITHUB_UNAVAILABLE', 'GitHub 暂时不可用，修改仍需保留，稍后重试。'); }
    return response;
  }

  function repoPath(config) { return `/repos/${config.GITHUB_DATA_REPO}`; }
  function contentPath(config) { return `${repoPath(config)}/contents/${config.GITHUB_DATA_PATH.split('/').map(encodeURIComponent).join('/')}`; }

  async function privateRepo(config) {
    const response = await github(config, repoPath(config));
    if (!response.ok) throw new HttpError(502, 'GITHUB_UNAVAILABLE', '无法确认记录仓库，请检查服务端配置。');
    const repo = await response.json();
    // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 仅向已确认的私有仓库读写个人记录。
    if (repo.private !== true) throw new HttpError(503, 'PRIVATE_REPO_REQUIRED', '记录仓库必须为私有仓库。');
  }

  async function loadRecords(config) {
    const response = await github(config, `${contentPath(config)}?ref=${encodeURIComponent(config.GITHUB_DATA_BRANCH)}`);
    if (response.status === 404) return { snapshot: null, revision: null, savedAt: null };
    if (!response.ok) throw new HttpError(502, 'GITHUB_UNAVAILABLE', '读取云端记录失败，请稍后重试。');
    try {
      const file = await response.json();
      if (file.encoding !== 'base64' || !SHA.test(file.sha)) throw new Error();
      const raw = JSON.parse(decodeContent(file.content));
      const snapshot = validateBackup(raw, VALID_IDS);
      const savedAt = typeof raw.savedAt === 'string' && Number.isFinite(Date.parse(raw.savedAt)) ? raw.savedAt : null;
      return { snapshot, revision: file.sha, savedAt };
    } catch { throw new HttpError(502, 'INVALID_CLOUD_DATA', '云端记录格式异常，未覆盖任何记录，请检查仓库文件。'); }
  }

  async function session(request, config) {
    const authorization = request.headers.get('Authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 每次私有 API 请求校验服务端会话与允许的稳定 GitHub 身份。
    if (!NONCE.test(token)) throw new HttpError(401, 'LOGIN_REQUIRED', '请先登录本人 GitHub 账号。');
    const hash = await digest(token);
    const data = await stateStore(config, 'get', 'session', hash);
    if (!data || String(data.user?.id) !== config.GITHUB_ALLOWED_USER_ID) throw new HttpError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录。');
    return { hash, ...data };
  }

  async function login(url, config) {
    const requestNonce = url.searchParams.get('request') || '';
    if (!REQUEST_NONCE.test(requestNonce)) throw new HttpError(400, 'INVALID_LOGIN_REQUEST', '登录请求无效，请从页面重新登录。');
    const state = randomNonce();
    const browser = randomNonce();
    // @CfSecAICode 遵循消费金融安全编码 GO-OAUTH-001 规范: state 与浏览器、客户端和固定回调绑定，十分钟过期且仅消费一次。
    await stateStore(config, 'put', 'state', await digest(state), { browserHash: await digest(browser), request: requestNonce, clientId: config.GITHUB_CLIENT_ID, callback: config.callback, frontendOrigin: config.frontend.origin }, now() + STATE_TTL);
    const authorize = new URL('https://github.com/login/oauth/authorize');
    authorize.search = new URLSearchParams({ client_id: config.GITHUB_CLIENT_ID, redirect_uri: config.callback, scope: 'read:user', state }).toString();
    // @CfSecAICode 遵循消费金融安全编码 FE-CSRF-001 规范: OAuth 绑定 cookie 禁止脚本读取，仅 HTTPS，回调使用 Lax 同站策略。
    return new Response(null, { status: 302, headers: { Location: authorize.href, 'Set-Cookie': `${COOKIE}=${state}.${browser}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_TTL / 1000}` } });
  }

  async function callback(request, url, config) {
    const state = url.searchParams.get('state') || '';
    const [cookieState = '', browser = ''] = cookieValue(request, COOKIE).split('.');
    let pending = null;
    try {
      // @CfSecAICode 遵循消费金融安全编码 GO-OAUTH-001 规范: 在交换 code 前常量时间校验绑定，并原子消费一次性 state。
      const matches = NONCE.test(state) && NONCE.test(browser) && constantEqual(state, cookieState);
      if (NONCE.test(state)) pending = await stateStore(config, 'consume', 'state', await digest(state));
      if (!matches || !pending || !constantEqual(pending.browserHash, await digest(browser)) || pending.clientId !== config.GITHUB_CLIENT_ID || pending.callback !== config.callback || pending.frontendOrigin !== config.frontend.origin) throw new HttpError(400, 'INVALID_OAUTH_STATE', '登录请求无效或已过期，请重新登录。');
      const code = url.searchParams.get('code');
      if (!code || code.length > 512 || url.searchParams.has('error')) throw new HttpError(400, 'OAUTH_CANCELLED', 'GitHub 登录未完成。');
      let exchange;
      try { exchange = await network('https://github.com/login/oauth/access_token', { method: 'POST', redirect: 'error', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: config.GITHUB_CLIENT_ID, client_secret: config.GITHUB_CLIENT_SECRET, code, redirect_uri: config.callback }) }); }
      catch { throw new HttpError(502, 'OAUTH_UNAVAILABLE', 'GitHub 登录暂时不可用。'); }
      const authorization = await exchange.json();
      if (!exchange.ok || typeof authorization.access_token !== 'string' || authorization.error) throw new HttpError(502, 'OAUTH_EXCHANGE_FAILED', 'GitHub 授权未完成，请重新登录。');
      const identity = await network('https://api.github.com/user', { redirect: 'error', headers: { Authorization: `Bearer ${authorization.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'xiaoya-growth-worker', 'X-GitHub-Api-Version': '2022-11-28' } });
      const user = await identity.json();
      // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: OAuth 只验证身份，只有指定 numeric ID 可获个人数据会话。
      if (!identity.ok || !Number.isSafeInteger(user.id) || String(user.id) !== config.GITHUB_ALLOWED_USER_ID || typeof user.login !== 'string') throw new HttpError(403, 'IDENTITY_NOT_ALLOWED', '此 GitHub 账号无权访问个人记录。');
      const token = randomNonce();
      await stateStore(config, 'put', 'session', await digest(token), { user: { id: user.id, login: user.login } }, now() + SESSION_TTL);
      return popupResponse({ type: 'xiaoya-auth', request: pending.request, token }, config.frontend.origin);
    } catch (error) {
      const code = error instanceof HttpError ? error.code : 'OAUTH_UNAVAILABLE';
      return popupResponse({ type: 'xiaoya-auth', ...(pending ? { request: pending.request } : {}), error: code }, config.frontend.origin);
    }
  }

  return {
    async fetch(request, env) {
      let origin;
      try {
        const config = configuration(env);
        const url = new URL(request.url);
        if (url.origin !== config.worker.origin) throw new HttpError(400, 'INVALID_HOST', '服务地址无效。');
        if (url.pathname === '/auth/login' && request.method === 'GET') return responseHeaders(await login(url, config));
        if (url.pathname === '/auth/callback' && request.method === 'GET') return responseHeaders(await callback(request, url, config));
        if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'NOT_FOUND', '接口不存在。');
        const requestOrigin = request.headers.get('Origin');
        // @CfSecAICode 遵循消费金融安全编码 FE-CSRF-001 规范: 私有 API 同时校验固定来源和显式 Bearer，不以 CORS 或 cookie 代替鉴权。
        if (!config.origins.has(requestOrigin)) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', '此页面来源无权访问个人记录。');
        origin = requestOrigin;
        if (request.method === 'OPTIONS') return responseHeaders(new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' } }), origin);
        const current = await session(request, config);
        if (url.pathname === '/api/session' && request.method === 'GET') return responseHeaders(json({ user: current.user }), origin);
        if (url.pathname === '/api/logout' && request.method === 'POST') {
          await stateStore(config, 'delete', 'session', current.hash);
          return responseHeaders(json({ ok: true, revoked: true }), origin);
        }
        if (url.pathname !== '/api/records') throw new HttpError(404, 'NOT_FOUND', '接口不存在。');
        if (!['GET', 'PUT'].includes(request.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', '请求方法不支持。');
        let incoming;
        if (request.method === 'PUT') {
          const raw = await readJson(request);
          if (!raw || typeof raw !== 'object' || !Object.hasOwn(raw, 'revision') || (raw.revision !== null && (typeof raw.revision !== 'string' || !SHA.test(raw.revision)))) throw new HttpError(400, 'INVALID_REVISION', '云端版本无效，请重新读取记录。');
          try { incoming = { snapshot: validateBackup(raw.snapshot, VALID_IDS), revision: raw.revision }; }
          catch { throw new HttpError(400, 'INVALID_SNAPSHOT', '宝宝资料或技能记录格式无效。'); }
        }
        await privateRepo(config);
        if (request.method === 'GET') return responseHeaders(json(await loadRecords(config)), origin);
        const savedAt = new Date(now()).toISOString();
        const file = { ...incoming.snapshot, savedAt };
        const body = { message: '保存宝宝成长记录', branch: config.GITHUB_DATA_BRANCH, content: toBase64(encoder.encode(JSON.stringify(file, null, 2))), ...(incoming.revision ? { sha: incoming.revision } : {}) };
        const saved = await github(config, contentPath(config), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (saved.status === 409 || saved.status === 422) return responseHeaders(json({ code: 'VERSION_CONFLICT', ...(await loadRecords(config)) }, 409), origin);
        if (!saved.ok) throw new HttpError(502, 'GITHUB_UNAVAILABLE', '保存云端记录失败，当前修改尚未同步，请稍后重试。');
        const confirmed = await saved.json();
        if (!SHA.test(confirmed.content?.sha)) throw new HttpError(502, 'SAVE_NOT_CONFIRMED', '云端保存结果未确认，请重新读取后重试。');
        return responseHeaders(json({ snapshot: incoming.snapshot, revision: confirmed.content.sha, savedAt }), origin);
      } catch (error) {
        // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 对外错误只返回固定消息，不回显第三方响应、请求内容或凭据。
        const known = error instanceof HttpError;
        return responseHeaders(json({ code: known ? error.code : 'SERVICE_UNAVAILABLE', message: known ? error.message : '云端服务暂时不可用，请保留当前修改并稍后重试。' }, known ? error.status : 503), origin);
      }
    },
  };
}

export default createWorker();
