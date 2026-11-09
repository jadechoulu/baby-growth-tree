// 平台积分与本站发起次数分开；读取失败不能当作零用量。
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function createUsageReader({ env, store, network = fetch, now = Date.now }) {
  async function read() {
    if (!env.TAVILY_API_KEY) return { status: 'unconfigured', reason: '尚未配置搜索服务' };
    const key = 'platform-usage-v1-tavily';
    let prior;
    try { prior = (await store.getWithMetadata(key, { type: 'json', consistency: 'strong' }))?.data; } catch { /* 缓存故障仍可读取平台。 */ }
    if (prior?.expires > now()) return prior.value;
    let value;
    try {
      // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 固定官方入口，账户令牌不下传、不进入缓存或错误响应。
      const response = await network('https://api.tavily.com/usage', {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + env.TAVILY_API_KEY },
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const used = data.account?.plan_usage;
      const limit = data.account?.plan_limit;
      if (!finite(used) || !finite(limit)) throw new Error();
      value = { status: 'ok', used, limit, unit: 'credits', period: 'billing-cycle', plan: String(data.account?.current_plan || '').slice(0, 60), checkedAt: new Date(now()).toISOString(),
        scope: 'account', keyUsage: finite(data.key?.usage) ? data.key.usage : null, keyLimit: finite(data.key?.limit) ? data.key.limit : null, paygoUsage: finite(data.account?.paygo_usage) ? data.account.paygo_usage : null };
    } catch {
      value = { status: 'unavailable', reason: '平台用量暂不可读取', ...((prior?.value?.status === 'ok' ? prior.value : prior?.value?.lastKnown) ? { lastKnown: prior.value.status === 'ok' ? prior.value : prior.value.lastKnown } : {}) };
    }
    try { await store.setJSON(key, { value, expires: now() + (value.status === 'ok' ? 60_000 : 30_000) }); } catch { /* 统计缓存写入不阻塞站内检索。 */ }
    return value;
  }
  return async () => ({ tavily: await read() });
}
