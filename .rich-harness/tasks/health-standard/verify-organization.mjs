// 用隔离浏览器与合成记录验证阅读组织；不接管用户浏览器，不连接真实记录仓。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const run = promisify(execFile), output = process.argv[2];
if (!output) throw Error('请传入新的验收目录');
await mkdir(output, { recursive: true });
const session = 'health-organization-' + Date.now(), base = 'http://127.0.0.1:5318';
const report = { widths: [], checks: [] };
async function cli(...args) {
  const { stdout } = await run('agent-browser', ['--session', session, ...args, '--json'], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  const result = JSON.parse(stdout); if (!result.success) throw Error(result.error); return result.data;
}
async function evaluate(code) { return (await cli('eval', '-b', Buffer.from(code).toString('base64'))).result; }
async function ready() {
  // 无头 Chrome 关闭原生 dialog 后可能将标签留在后台，前台才会运行定位动画帧。
  await cli('tab', 't1');
  await cli('wait', '--fn', '!!document.querySelector(".health-lineage-viewport")?.style.height');
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
}
try {
  await cli('--executable-path', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'open', base + '/health.html#view=month&month=27&domain=gross'); await ready();
  for (const width of [320, 375, 390, 768, 900, 901, 1280]) {
    await cli('set', 'viewport', String(width), '969'); await cli('reload'); await ready();
    report.widths.push(await evaluate(`(() => {
      if(document.documentElement.scrollWidth>innerWidth)throw Error('主体溢出');
      const select=document.querySelector('[aria-label="选择成长阶段"]');if(select.selectedOptions[0].textContent!=='25–30个月')throw Error('旧月龄链接未恢复区间');
      if(document.querySelector('[data-site-item="source"]'))throw Error('使用说明仍是导航标签');
      const viewport=document.querySelector('.health-lineage-viewport'),column=viewport.querySelector('[data-stage="h25"]');
      const a=viewport.getBoundingClientRect(),b=column.getBoundingClientRect();if(b.right<a.left||b.left>a.right)throw Error('当前阶段未定位');
      const check=column.querySelector('.health-check').getBoundingClientRect();if(check.width!==18||check.height!==18)throw Error('完成圆尺寸');
      return {width:innerWidth,range:select.selectedOptions[0].textContent,noOverflow:true,firstGroup:Math.round(document.querySelector('.health-group-heading').getBoundingClientRect().top)};
    })()`));
    if ([390,1280].includes(width)) await cli('screenshot', path.join(output, `宝宝视角-${width}.png`));
    await cli('click', '.health-content>.growth-versions .growth-version-help'); await cli('snapshot', '-i');
    await evaluate(`(() => {if(!document.querySelector('.health-dialog[open] h2').textContent.includes('标准与使用方法'))throw Error('问号未打开说明');})()`);
    await cli('press', 'Escape'); await cli('tab', 't1'); await cli('snapshot', '-i');
    await evaluate(`(() => {if(document.activeElement.className!=='growth-version-help')throw Error('问号焦点未恢复');})()`);
  }
  report.checks.push('七种宽度下区间、当前阶段定位、问号弹窗、Escape及焦点恢复通过。');
  await cli('set', 'viewport', '390', '969');
  await cli('click', '.health-group-heading'); await cli('snapshot', '-i');
  await cli('click', '.health-groups [data-item="wst580-146"] .health-check');
  await cli('wait', '--fn', 'document.querySelector(".health-groups [data-item=wst580-146] .health-check")?.getAttribute("aria-pressed")==="true"');
  await evaluate(`(() => {if(!document.querySelector('.health-group').open)throw Error('记录重绘丢失展开状态');})()`);
  await cli('click', '.health-groups [data-item="wst580-146"] .health-item-open'); await cli('snapshot', '-i');
  await cli('fill', '.health-observation-form textarea', '待保存的隔离验收手记');
  await cli('click', '.health-dialog .growth-version-help'); await cli('snapshot', '-i');
  await evaluate(`(() => {if(document.querySelectorAll('.health-dialog[open]').length!==2)throw Error('说明替换了项目详情');})()`);
  await cli('press', 'Escape'); await cli('tab', 't1'); await cli('snapshot', '-i');
  await evaluate(`(() => {
    if(document.querySelector('.health-observation-form textarea').value!=='待保存的隔离验收手记')throw Error('帮助弹窗丢失手记');
    if(new URLSearchParams(location.hash.slice(1)).get('item')!=='wst580-146')throw Error('帮助弹窗清掉深链接');
  })()`);
  await cli('fill', '.health-observation-form textarea', '');
  await cli('scrollintoview', '.health-adjacent button:last-child'); await cli('snapshot', '-i');
  await cli('click', '.health-adjacent button:last-child'); await cli('snapshot', '-i');
  await evaluate(`(() => {if(document.querySelector('.health-dialog h2').textContent!=='独自下楼'||new URLSearchParams(location.hash.slice(1)).get('item')!=='wst580-147')throw Error('下一项跨详情定位错误');})()`);
  await cli('press', 'Escape'); await cli('tab', 't1'); await cli('snapshot', '-i');
  report.checks.push('记录后保留清单展开；详情问号保留未保存手记；下一项打开同能区相邻项目且深链接保留。');
  await cli('click', '.site-shortcuts [data-site-item="next"]'); await cli('snapshot', '-i');
  await cli('wait', '--fn', '!!document.querySelector(".health-groups [data-item=wst580-147]")');
  await evaluate(`(() => {if(document.querySelector('.health-groups [data-item=wst580-146]'))throw Error('已观察项仍被推荐');})()`);
  for (const id of ['wst580-147','wst580-156']) {
    await cli('click', `.health-groups [data-item="${id}"] .health-check`);
    await cli('wait', '--fn', `!document.querySelector('.health-groups [data-item="${id}"]')`); await cli('snapshot', '-i');
  }
  await evaluate(`(() => {if(!document.querySelector('.health-groups [data-item=wst580-165]'))throw Error('完成后未推进到下一阶段');})()`);
  await cli('screenshot', path.join(output, '下一步-390.png'));
  await cli('click', '.health-groups [data-item="wst580-165"] [aria-label*="能力脉络"]'); await cli('snapshot', '-i');
  await evaluate(`(() => {const row=document.querySelector('.health-lineage [data-item=wst580-165]');if(!row?.classList.contains('is-focus'))throw Error('脉络入口未高亮');})()`);
  await cli('screenshot', path.join(output, '脉络定位-390.png'));
  await cli('reload'); await ready();
  await evaluate(`(() => {if(!document.querySelector('.health-lineage [data-item=wst580-165].is-focus'))throw Error('刷新丢失脉络焦点');})()`);
  report.checks.push('下一步排除已观察项，逐能区推进到后续阶段；行内脉络入口定位、高亮与刷新恢复通过。');
  await cli('click', '.site-shortcuts [data-site-item="month"]'); await cli('snapshot', '-i');
  await cli('select', '[aria-label="选择成长阶段"]', 'h25'); await cli('snapshot', '-i');
  await cli('click', '[aria-label="下一个成长阶段"]'); await cli('snapshot', '-i');
  await evaluate(`(() => {if(document.querySelector('[aria-label="选择成长阶段"]').value!=='h31'||!document.querySelector('.health-groups [data-item=wst580-165]'))throw Error('阶段前进未切换内容');})()`);
  await cli('click', '[aria-label="上一个成长阶段"]'); await cli('snapshot', '-i');
  await evaluate(`(() => {if(document.querySelector('[aria-label="选择成长阶段"]').value!=='h25')throw Error('阶段返回失败');})()`);
  await cli('reload'); await ready();
  await evaluate(`(async () => {const a=XiaoyaSyncAdapters.createAdapters({indexedDB,localStorage,profileClient:{get:()=>({})}});const h=await a.health.read();if(h.records['wst580-146'].status!=='observed')throw Error('观察未持久保存');if(await a.growth.read()!==null)throw Error('写入了另一版本记录');})()`);
  report.checks.push('阶段前后切换同步更新清单；观察刷新恢复，毛老师版记录未被写入。');
  report.passed = true;
} catch (error) {
  report.error = error.message;
  report.page = await evaluate(`(() => {const v=document.querySelector('.health-lineage-viewport');return {url:location.href,text:document.body.innerText,viewport:v&&{style:v.style.cssText,key:v.dataset.key,scroll:v.scrollLeft}}})()`).catch(() => null);
  await cli('screenshot', path.join(output, '失败现场.png')).catch(()=>{});
  throw error;
} finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)+'\n'); await cli('close').catch(()=>{}); }
console.log(JSON.stringify(report));
