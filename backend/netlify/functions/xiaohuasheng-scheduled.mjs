import { getStore } from '@netlify/blobs';
import { createXhsService } from '../backend/xiaohuasheng.mjs';

// 仅由平台定时器调用；沿现有一次性后台能力执行与手动任务去重，浏览器不持有定时任务凭据。
export default async function scheduled() {
  const service = createXhsService({ env: process.env, store: getStore({ name: 'xiaoya-xhs-private-v1', consistency: 'strong' }) });
  const result = await service.start();
  if (result.status === 'failed') throw new Error('XHS_SCHEDULE_FAILED');
}

// Netlify使用UTC：02:00 / 19:00 对应北京时间每天10:00 / 次日03:00。
export const config = { schedule: '0 2,19 * * *' };
