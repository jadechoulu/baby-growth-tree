import { createWorker } from '../worker/index.mjs';
import { createNetlifyAuth } from './netlify-auth.mjs';

const configuredKeys = ['FRONTEND_URL', 'WORKER_URL', 'GITHUB_ALLOWED_USER_ID', 'GITHUB_DATA_REPO', 'GITHUB_DATA_BRANCH', 'GITHUB_DATA_PATH', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_DATA_TOKEN'];

export function createNetlifyHandler({ env = process.env, getStore, network = globalThis.fetch, now = Date.now } = {}) {
  const worker = createWorker({ fetch: network, now });
  return async function handler(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') return Response.json({ provider: 'netlify', ready: configuredKeys.every(key => Boolean(env[key])) }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    try {
      const store = getStore({ name: 'xiaoya-auth-v1', consistency: 'strong' });
      return await worker.fetch(request, { ...env, AUTH_STATE: createNetlifyAuth({ store }) });
    } catch {
      // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: SDK 错误不回显平台凭据或配置。
      return Response.json({ code: 'AUTH_UNAVAILABLE', message: '登录服务暂时不可用，请保留本机记录。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
