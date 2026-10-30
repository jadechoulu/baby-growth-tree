// 独立会话核验跨版本定位，不接管用户浏览器或连接真实个人记录。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const run = promisify(execFile);
const output = process.argv[2];
if (!output) throw Error('请传入新的验收目录。');
await mkdir(output, { recursive: true });
const { stdout: sessionId } = await run('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'growth-references']);
const session = sessionId.trim();
const base = 'http://127.0.0.1:5318';
const source = base + '/health.html#view=month&month=21&domain=all&status=all&item=wst580-129';
const report = { widths: [], checks: [] };
async function cli(...args) {
  const { stdout } = await run('agent-browser', ['--session', session, ...args, '--json'], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  const result = JSON.parse(stdout); if (!result.success) throw Error(result.error); return result.data;
}
async function evaluate(code) { return (await cli('eval', '-b', Buffer.from(code).toString('base64'))).result; }
async function snap() { await cli('snapshot', '-i'); }
async function focus() { const { tabs } = await cli('tab', 'list'); await cli('tab', tabs.find(tab => tab.active).tabId); }
async function open(url, ready) { await cli('open', url); await focus(); await cli('reload'); await cli('wait', '--fn', ready); await snap(); }
async function checkLayout() {
  return evaluate(`(() => {
    const ref=document.querySelector('dialog[open] .growth-references');
    if(document.documentElement.scrollWidth>innerWidth)throw Error('主体溢出');
    for(const el of ref.querySelectorAll('summary,a,p')) {
      const rect=el.getBoundingClientRect();
      if(el.scrollWidth>el.clientWidth+2 || rect.left<0 || rect.right>innerWidth+1)throw Error('关联内容截断：'+el.textContent);
    }
    return {width:innerWidth,links:ref.querySelectorAll('a').length,noOverflow:true};
  })()`);
}
try {
  await cli('--executable-path', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'open', source);
  await focus(); await cli('reload');
  await cli('wait', '--fn', '!!document.querySelector(".health-dialog[open]")'); await snap();
  await evaluate(`localStorage.setItem('xiaoya-growth-view-v1', JSON.stringify({version:1,view:'next',domain:'fine',treeDomain:'fine',treeFocus:'invalid'}))`);
  for (const width of [320,375,390,768,900,901,1280]) {
    await cli('set', 'viewport', String(width), '969');
    await open(source, 'document.querySelector(".health-dialog h2")?.textContent === "扶楼梯上楼"');
    await cli('click', '.health-dialog .growth-references summary'); await snap();
    await evaluate(`(() => {const r=document.querySelector('.health-dialog .growth-references');if(!r.textContent.includes('部分相关')||!r.textContent.includes('只看上楼')&&!r.textContent.includes('上楼'))throw Error('缺少差异');if(r.querySelectorAll('a').length!==1)throw Error('标准129对应项不正确');})()`);
    await checkLayout();
    await cli('click', '.health-dialog .growth-references a');
    await cli('wait', '--fn', 'document.querySelector("#app-dialog")?.dataset.skillId === "g-both-feet-stairs"'); await snap();
    await evaluate(`(() => {if(!document.querySelector('[data-graph-node="g-both-feet-stairs"].role-focus'))throw Error('图谱未高亮');if(document.querySelector('#dialog-title').textContent!=='重叠步上下楼梯')throw Error('详情错误');})()`);
    await cli('click', '#app-dialog .growth-references summary'); await snap();
    await evaluate(`(() => {const links=[...document.querySelectorAll('#app-dialog .growth-references a')];for(const id of ['wst580-129','wst580-146','wst580-147'])if(!links.some(a=>a.hash.includes(id)))throw Error('一对多丢失：'+id);})()`);
    report.widths.push(await checkLayout());
    if ([390,1280].includes(width)) await cli('screenshot',path.join(output,`关联项目-${width}.png`));
    await cli('click', '#app-dialog [data-action="close-dialog"]'); await snap();
    await evaluate(`(() => {const n=document.querySelector('[data-graph-node="g-both-feet-stairs"].role-focus').getBoundingClientRect(),v=document.querySelector('#graph-viewport').getBoundingClientRect();if(n.right<v.left||n.left>v.right||n.bottom<v.top||n.top>v.bottom)throw Error('关闭详情后图谱未定位');})()`);
    await cli('reload'); await cli('wait','--fn','!!document.querySelector("#app-dialog .growth-references")'); await snap();
    await cli('click','#app-dialog .growth-references summary'); await snap();
    await cli('click','#app-dialog .growth-references a[href*="wst580-129"]');
    await cli('wait','--fn','document.querySelector(".health-dialog h2")?.textContent === "扶楼梯上楼"'); await snap();
  }
  report.checks.push('双向具体项目跳转、覆盖旧偏好、刷新恢复、图谱定位及完整一对多关联通过。');
  await cli('fill','.health-dialog textarea','未保存的验收输入'); await snap();
  await evaluate(`(() => {const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);if(!event.defaultPrevented)throw Error('未保存离开保护丢失');})()`);
  await cli('click','.health-dialog .growth-version-help'); await snap();
  await cli('find','role','button','click','--name','关闭详情','--exact'); await snap();
  await evaluate(`(() => {if(document.querySelector('.health-dialog textarea').value!=='未保存的验收输入')throw Error('说明弹窗丢失输入');})()`);
  await cli('fill','.health-dialog textarea',''); await snap();
  report.checks.push('标准说明与未保存观察保护保留。');
  for (const id of ['wst580-040','wst580-128','wst580-174']) {
    await open(base+'/health.html#month=21&item='+id,'!!document.querySelector(".health-dialog[open]")');
    await evaluate(`(() => {const d=document.querySelector('.health-dialog');if(d.querySelector('.growth-references,.growth-versions'))throw Error('独立或待核对项仍显示对应切换');if(!d.querySelector('.growth-version-help'))throw Error('标准说明入口丢失');})()`);
  }
  await open(base+'/index.html#skill=c-short-memory','document.querySelector("#app-dialog")?.dataset.skillId === "c-short-memory"');
  await evaluate(`(() => {if(document.querySelector('#app-dialog .growth-references,#app-dialog .growth-versions'))throw Error('独立毛版项仍显示对应切换');if(document.querySelectorAll('.growth-content .growth-versions a').length!==2)throw Error('普通导航丢失');})()`);
  report.checks.push('两版独立项目及待核对项无对应入口，页面普通版本导航保留。');
  await open(base+'/health.html#month=1&item=wst580-002','!!document.querySelector(".health-dialog[open]")');
  await cli('click','.health-dialog .growth-references summary'); await snap();
  await evaluate(`(() => {const r=document.querySelector('.health-dialog .growth-references');if(!r.querySelector('.same-action')||!r.textContent.includes('尚未确认测查等价'))throw Error('同类动作被误标为等价');})()`);
  await cli('click','.health-dialog .growth-references a');
  await cli('wait','--fn','document.querySelector("#app-dialog")?.dataset.skillId === "g-prone-head"'); await snap();
  await cli('click','#app-dialog .growth-references summary'); await snap();
  await checkLayout();
  report.checks.push('同类动作与部分相关可区分，俯卧抬头双向跳转及多月龄关联通过。');
  // 共享样式回归：普通英语入口及独立导出均可打开，分类框架不变。
  for (const entry of ['/english/index.html','/output/web/英语启蒙路线导航.html']) {
    await open(base+entry,'!!document.querySelector(".site-bar")');
    await evaluate(`(() => {if(document.documentElement.scrollWidth>innerWidth)throw Error('英语入口主体溢出');if(document.querySelector('.growth-references'))throw Error('英语混入成长参考');})()`);
  }
  report.browserErrors=await cli('errors');
  report.passed=true;
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await cli('close').catch(()=>{});
}
console.log(JSON.stringify(report));
