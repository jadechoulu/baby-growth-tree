// 独立浏览器、合成记录，检查阶段批量观察；不连接真实记录仓。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const run = promisify(execFile), output = process.argv[2];
if (!output) throw Error('请指定新的验收目录');
await mkdir(output, { recursive: true });
const session = 'health-bulk-' + Date.now(), report = { widths: [], checks: [] };
async function cli(...args) {
  const { stdout } = await run('agent-browser', ['--session', session, ...args, '--json'], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  const result = JSON.parse(stdout); if (!result.success) throw Error(result.error); return result.data;
}
async function evaluate(code) { return (await cli('eval', '-b', Buffer.from(code).toString('base64'))).result; }
async function ready() { await cli('tab', 't1'); await cli('wait', '--fn', '!!document.querySelector("[data-complete-stage=h25]")'); }
try {
  await cli('--executable-path', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'open', 'http://127.0.0.1:5318/health.html#view=month&month=27&domain=gross&status=not-yet'); await ready();
  await evaluate(`(async()=>{
    const a=XiaoyaSyncAdapters.createAdapters({indexedDB,localStorage,profileClient:{get:()=>({})}});
    await a.health.apply({version:1,standard:'WS/T 580—2017',records:{
      'wst580-146':{status:'observed',observedAt:'2026-09-01',note:'已有观察'},
      'wst580-147':{status:'not-yet',observedAt:'2026-09-02',note:'保留手记'},
      'wst580-148':{status:'not-yet',note:'同阶段精细动作'},
      'wst580-165':{status:'not-yet',note:'下一阶段'}
    }},null);
  })()`);
  await cli('reload'); await ready();
  for (const width of [320,375,390,768,900,901,1280]) {
    await cli('set', 'viewport', String(width), '969');
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
    report.widths.push(await evaluate(`(()=>{
      const b=document.querySelector('[data-complete-stage=h25]'), r=b.getBoundingClientRect();
      if(document.documentElement.scrollWidth>innerWidth||r.left<0||r.right>innerWidth||b.scrollWidth>b.clientWidth+2)throw Error('批量按钮布局截断');
      if(b.disabled||!b.title.includes('五能区'))throw Error('批量按钮状态或范围错误');
      const d=document.querySelector('[data-complete-domain=gross]'),dr=d.getBoundingClientRect();
      if(d.disabled||dr.left<0||dr.right>innerWidth||dr.width<44||dr.height<44||!d.title.includes('大运动'))throw Error('能区批量按钮不可用或布局截断');
      if(d.closest('details').open)throw Error('能区初始不应展开');
      return {width:innerWidth,noOverflow:true,buttonVisible:true};
    })()`));
    if(width===390||width===1280)await cli('screenshot',path.join(output,`全部完成-${width}.png`));
  }
  await cli('set','viewport','390','969');
  await cli('click','[data-complete-domain=gross]'); await cli('snapshot','-i');
  await cli('wait','--fn','document.querySelector("#health-notice").textContent.includes("大运动全部")');
  await evaluate(`(async()=>{
    const a=XiaoyaSyncAdapters.createAdapters({indexedDB,localStorage,profileClient:{get:()=>({})}}),h=await a.health.read();
    const items=(await (await fetch('./data/health-standard.json')).json()).items.filter(i=>i.month>=25&&i.month<=30&&i.domain==='gross');
    if(items.some(i=>h.records[i.id]?.status!=='observed'))throw Error('能区批量遗漏未记录项目');
    if(h.records['wst580-146'].observedAt!=='2026-09-01'||h.records['wst580-147'].note!=='保留手记')throw Error('能区批量覆盖日期或手记');
    if(h.records['wst580-148'].status!=='not-yet'||h.records['wst580-148'].note!=='同阶段精细动作'||h.records['wst580-165'].status!=='not-yet'||await a.growth.read()!==null)throw Error('能区批量越界');
  })()`);
  await cli('select','[aria-label="按观察状态筛选"]','all'); await cli('snapshot','-i');
  await evaluate(`(()=>{const d=document.querySelector('[data-complete-domain=gross]');if(!d.disabled||d.closest('details').open||document.querySelector('[data-complete-stage=h25]').disabled)throw Error('能区批量错误展开或禁用其他范围')})()`);
  await cli('click','details[data-domain=gross]>summary'); await cli('snapshot','-i');
  await cli('click','.health-groups [data-item=wst580-156] .health-check'); await cli('snapshot','-i');
  await cli('wait','--fn','document.querySelector("[data-complete-domain=gross]")?.disabled===false');
  await cli('click','[data-complete-domain=gross]'); await cli('snapshot','-i');
  await cli('wait','--fn','document.querySelector("[data-complete-domain=gross]")?.disabled===true');
  await evaluate(`(()=>{if(!document.querySelector('details[data-domain=gross]').open)throw Error('批量操作收起能区')})()`);
  await cli('reload'); await ready();
  await evaluate(`(()=>{if(!document.querySelector('[data-complete-domain=gross]').disabled||document.querySelector('[data-complete-stage=h25]').disabled)throw Error('刷新后能区范围状态错误')})()`);
  report.checks.push('单能区批量覆盖所选阶段该能区全部项目，不受状态筛选影响，保留日期手记，不修改其他能区、阶段或毛老师记录；点击不切换折叠，撤回后可再次完成，刷新保持。');
  await cli('select','[aria-label="按观察状态筛选"]','not-yet'); await cli('snapshot','-i');
  await cli('click','[data-complete-stage=h25]'); await cli('snapshot','-i');
  await cli('wait','--fn','document.querySelector("[data-complete-stage=h25]")?.disabled===true && document.querySelector("#health-notice").textContent.includes("五能区全部")');
  await evaluate(`(async()=>{
    const a=XiaoyaSyncAdapters.createAdapters({indexedDB,localStorage,profileClient:{get:()=>({})}}),h=await a.health.read();
    const items=(await (await fetch('./data/health-standard.json')).json()).items.filter(i=>i.month>=25&&i.month<=30);
    if(items.some(i=>h.records[i.id]?.status!=='observed'))throw Error('能区或筛选限制了批量范围');
    if(h.records['wst580-146'].observedAt!=='2026-09-01'||h.records['wst580-146'].note!=='已有观察'||h.records['wst580-147'].note!=='保留手记')throw Error('已有日期手记被覆盖');
    if(h.records['wst580-165'].status!=='not-yet'||await a.growth.read()!==null)throw Error('其他阶段或版本被写入');
  })()`);
  report.checks.push('单能区与暂未观察筛选下，仍仅将当前阶段五能区全部标记观察；保留已有观察日期和手记，不修改其他阶段或版本。');
  await cli('reload'); await ready();
  await evaluate(`(()=>{if(!document.querySelector('[data-complete-stage=h25]').disabled)throw Error('刷新后重复批量入口仍可用')})()`);
  await cli('click','.site-shortcuts [data-site-item=next]'); await cli('snapshot','-i');
  await evaluate(`(()=>{if(!document.querySelector('.health-groups [data-item=wst580-165]')||document.querySelector('.health-groups [data-item=wst580-146]'))throw Error('下一步未推进')})()`);
  await cli('click','.site-shortcuts [data-site-item=overview]'); await cli('snapshot','-i');
  await evaluate(`(()=>{if(!document.querySelector('.health-lineage-heading [data-complete-stage=h25]')?.disabled)throw Error('脉络入口状态未更新')})()`);
  await cli('click','.health-lineage [data-item=wst580-146] .health-check'); await cli('snapshot','-i');
  await cli('wait','--fn','document.querySelector("[data-complete-stage=h25]")?.disabled===false');
  report.checks.push('刷新保持批量结果并禁用已完成按钮；下一步推进；脉络入口一致，单项撤回后可再次批量完成。');
  report.passed=true;
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await cli('close').catch(()=>{});
}
console.log(JSON.stringify(report));
