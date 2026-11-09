import { createWorker } from '../worker/index.mjs';
import { createNetlifyAuth } from './netlify-auth.mjs';
import { createAssistant, AssistantError } from './assistant.mjs';
import { createAssistantModel } from './assistant-model.mjs';
import { createKnowledgeSearch } from './assistant-knowledge.mjs';
import knowledge from '../shared/assistant-knowledge.json' with { type: 'json' };
import searchIndex from '../shared/search-index.json' with { type: 'json' };
import { createXhsService, XhsError } from './xiaohuasheng.mjs';

const configuredKeys = ['FRONTEND_URL', 'WORKER_URL', 'GITHUB_ALLOWED_USER_ID', 'GITHUB_DATA_REPO', 'GITHUB_DATA_BRANCH', 'GITHUB_DATA_PATH', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_DATA_TOKEN'];

export function createNetlifyHandler({ env = process.env, getStore, network = globalThis.fetch, now = Date.now } = {}) {
  let retrieve;
  const searchKnowledge = (...args) => (retrieve ||= createKnowledgeSearch(knowledge))(...args);
  const worker = createWorker({ fetch: network, now });
  return async function handler(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') return Response.json({ provider: 'netlify', ready: configuredKeys.every(key => Boolean(env[key])) }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    try {
      const store = getStore({ name: 'xiaoya-auth-v1', consistency: 'strong' });
      return await worker.fetch(request, { ...env, AUTH_STATE: createNetlifyAuth({ store }), ASSISTANT: async (action, question, repository) => {
        try {
          const assistant = createAssistant({ env, store: getStore({ name: 'xiaoya-ai-private-v1', consistency: 'strong' }), index: searchIndex, retrieve: searchKnowledge, network, now, repository, model: createAssistantModel({ env, network }) });
          return { value: await assistant[action](question) };
        } catch (error) {
          return { status: error instanceof AssistantError ? error.status : 503, code: error instanceof AssistantError ? error.code : 'AI_UNAVAILABLE', message: error instanceof AssistantError ? error.message : '全站搜索与智能服务暂不可用，请稍后再试。' };
        }
      }, XIAOHUASHENG_SYNC: async (action, snapshot) => {
        const service = createXhsService({ env, get store() { return getStore({ name: 'xiaoya-xhs-private-v1', consistency: 'strong' }); }, network, now });
        try { return { ok: true, value: await service[action](snapshot) }; }
        catch (error) { return { ok: false, code: error instanceof XhsError ? error.code : 'XHS_UNAVAILABLE', message: error instanceof XhsError ? error.message : '云端小花生服务暂不可用，原进度保留。' }; }
      } });
    } catch {
      // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: SDK 错误不回显平台凭据或配置。
      return Response.json({ code: 'AUTH_UNAVAILABLE', message: '登录服务暂时不可用，请保留本机记录。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
