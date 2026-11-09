export const DOMESTIC_DOMAINS = Object.freeze(['xiaohongshu.com', 'zhihu.com', 'douban.com', 'bilibili.com', 'mp.weixin.qq.com']);
export const webEnabled = env => env.XIAOYA_WEB_ENABLED === 'tavily-free' && env.XIAOYA_WEB_FREE_PLAN_CONFIRMED === 'true' && Boolean(env.TAVILY_API_KEY);
export async function searchDomestic({ env, network, candidates, routeQuestion }) {
  // @CfSecAICode 遵循消费金融安全编码 BE-SSRF-001 规范: 固定正规搜索API，不接受客户端URL、不抓取返回页面、不跟随重定向。
  const query = routeQuestion ? '许密杉 庆爸 英语启蒙 路线 阶段 适用条件' : candidates.filter(item => !['route', 'stage'].includes(item.kind)).slice(0, 2).map(item => item.title).join(' ') + ' 育儿 家庭学习 使用经验';
  const response = await network('https://api.tavily.com/search', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + env.TAVILY_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, search_depth: 'basic', auto_parameters: false, max_results: 3, include_answer: false, include_raw_content: false, include_images: false, include_domains: DOMESTIC_DOMAINS, country: 'china' }) });
  if (!response.ok) throw new Error('WEB_UNAVAILABLE');
  const result = await response.json();
  return (Array.isArray(result.results) ? result.results : []).slice(0, 3).flatMap((item, i) => {
    let url; try { url = new URL(item.url); } catch { return []; }
    // @CfSecAICode 遵循消费金融安全编码 FE-XSS-001 规范: 外站链接仅允许HTTPS及已选国内域名，显示时按纯文本处理。
    const parts = url.hostname.split('.'), domestic = DOMESTIC_DOMAINS.some(domain => parts.slice(-domain.split('.').length).join('.') === domain);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !domestic || typeof item.content !== 'string' || !item.content.trim()) return [];
    return [{ id: 'web:' + i, title: String(item.title || url.hostname).slice(0, 160), href: url.href, text: item.content.slice(0, 350), kind: 'web', source: '外部搜索摘要，未核对全文；经验仅供参考' }];
  }).sort((a, b) => Number(new URL(b.href).hostname.includes('xiaohongshu')) - Number(new URL(a.href).hostname.includes('xiaohongshu')));
}
