import { getStore } from '@netlify/blobs';
import { createXhsService } from '../backend/xiaohuasheng.mjs';

// Netlify 的 -background 函数提供最长15分钟；由已鉴权入口发放一次性能力触发。
export default async function handler(request) {
  try {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const raw = await request.text();
    if (raw.length > 512) return new Response(null, { status: 400 });
    const service = createXhsService({ env: process.env, store: getStore({ name: 'xiaoya-xhs-private-v1', consistency: 'strong' }) });
    await service.run(JSON.parse(raw));
  } catch { /* @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 平台日志不输出凭据、书架原值或上游错误。 */ }
  return new Response(null, { status: 204 });
}
