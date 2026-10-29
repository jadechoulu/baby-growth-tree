import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { createWorker } from '../worker/index.mjs';
import { createBlobAuth, cleanupBlobAuth } from './blob-auth.mjs';

const configuredKeys = ['FRONTEND_URL', 'WORKER_URL', 'GITHUB_ALLOWED_USER_ID', 'GITHUB_DATA_REPO', 'GITHUB_DATA_BRANCH', 'GITHUB_DATA_PATH', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_DATA_TOKEN'];
function hasBlob(env) { return Boolean(env.BLOB_READ_WRITE_TOKEN || (env.BLOB_STORE_ID && env.VERCEL_OIDC_TOKEN)); }

export function createVercelHandler({ env = process.env, blob, network = globalThis.fetch, now = Date.now } = {}) {
  const worker = createWorker({ fetch: network, now });
  function blobOptions() {
    return env.BLOB_STORE_ID && env.VERCEL_OIDC_TOKEN ? { storeId: env.BLOB_STORE_ID, oidcToken: env.VERCEL_OIDC_TOKEN } : { token: env.BLOB_READ_WRITE_TOKEN };
  }
  async function fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/auth/')) url.pathname = url.pathname.slice(4);
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return Response.json({ provider: 'vercel', ready: hasBlob(env) && configuredKeys.every(key => Boolean(env[key])) }, { headers });
    }
    if (url.pathname === '/api/cron/auth-cleanup' && request.method === 'GET') {
      const supplied = Buffer.from(request.headers.get('Authorization') || '');
      const expected = Buffer.from('Bearer ' + (env.CRON_SECRET || ''));
      // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 清理任务只能由持有服务端 Cron 凭据的调用者执行。
      if (!env.CRON_SECRET || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ code: 'UNAUTHORIZED' }, { status: 401, headers });
      try { return Response.json(await cleanupBlobAuth({ blob, options: blobOptions(), now: now() }), { headers }); }
      catch { return Response.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503, headers }); }
    }
    const config = {
      ...env,
      AUTH_STATE: hasBlob(env) ? createBlobAuth({ blob, options: blobOptions() }) : null,
    };
    return worker.fetch(new Request(url, request), config);
  }
  return {
    fetch,
    async node(request, response) {
      try {
        // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 采用显式服务地址，不信任转发 Host 来生成 OAuth 回调。
        const url = new URL(request.url, env.WORKER_URL || 'https://unconfigured.invalid');
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        const init = { method: request.method, headers };
        if (!['GET', 'HEAD'].includes(request.method)) {
          // Vercel 默认可能预解析 JSON；按原字节优先，已有解析体则恢复 JSON 交给统一边界校验。
          init.body = request.body === undefined ? Readable.toWeb(request) : typeof request.body === 'string' || Buffer.isBuffer(request.body) ? request.body : JSON.stringify(request.body);
          init.duplex = 'half';
        }
        const result = await fetch(new Request(url, init));
        response.statusCode = result.status;
        for (const [key, value] of result.headers) response.setHeader(key, value);
        response.end(Buffer.from(await result.arrayBuffer()));
      } catch {
        response.statusCode = 503;
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: '云端服务暂时不可用，请保留本机记录。' }));
      }
    },
  };
}
