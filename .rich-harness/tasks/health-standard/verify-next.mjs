// 独立浏览器与合成记录；不接管用户浏览器或连接真实记录仓。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const run = promisify(execFile), output = process.argv[2];
if (!output) throw Error('请指定新的验收目录');
await mkdir(output, { recursive: true });
const session = 'health-next-' + Date.now(), base = 'http://127.0.0.1:5318/health.html';
const report = { widths: [], checks: [] };
async function cli(...args) {
  const { stdout } = await run('agent-browser', ['--session', session, ...args, '--json'], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  const result = JSON.parse(stdout); if (!result.success) throw Error(result.error); return result.data;
}
async function evaluate(code) { return (await cli('eval', '-b', Buffer.from(code).toString('base64'))).result; }
async function ready() { await cli('tab','t1'); await cli('wait','--fn','!!document.querySelector(".health-next-context")'); }
async function snapshot() { await cli('snapshot','-i'); }
try {
  await cli('--executable-path','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','open',base+'#view=next&month=33&domain=gross&status=all'); await ready();
  await evaluate(`(()=>{
    if(!document.querySelector('.health-next-context').textContent.includes('19–24个月'))throw Error('深链接月龄覆盖宝宝当前阶段');
    if(document.querySelector('.health-groups [data-item=wst580-165]'))throw Error('无记录时开放未来项目');
  })()`);
  await evaluate(`(async()=>{const a=XiaoyaSyncAdapters.createAdapters({indexedDB,localStorage,profileClient:{get:()=>({})}});await a.health.apply({version:1,standard:'WS/T 580—2017',records:{'wst580-146':{status:'observed',observedAt:'2026-10-30',note:'隔离验收'}}},null)})()`);
  await cli('reload'); await ready();
  for(const width of [320,375,390,768,900,901,1280]) {
    await cli('set','viewport',String(width),'969');
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
    report.widths.push(await evaluate(`(()=>{
      if(document.documentElement.scrollWidth>innerWidth)throw Error('主体横向溢出');
      if(document.querySelector('[aria-label="选择成长阶段"]'))throw Error('下一步仍受阶段选择控制');
      for(const id of ['wst580-147','wst580-156'])if(!document.querySelector('.health-groups [data-item='+id+']'))throw Error('同组剩余项或后续项缺失');
      if(document.querySelector('.health-groups [data-item=wst580-165]'))throw Error('越过当前观察进度');
      const count=document.querySelector('.health-domain[data-domain=gross] .health-domain-count').textContent;
      if(count.includes('/'))throw Error('待探索数量仍显示完成比例');
      if(document.querySelector('.health-more,details.health-group,.health-group>summary'))throw Error('下一步仍有分批或收起入口');
      if(document.querySelectorAll('.health-groups [data-item]').length!==parseInt(count))throw Error('推荐项未完整展示');
      if(!document.querySelector('.health-groups [data-item=wst580-001]'))throw Error('此前项目未直接展示');
      return {width:innerWidth,noOverflow:true,actualStage:document.querySelector('.health-next-context').textContent,count};
    })()`));
    if(width===390||width===1280)await cli('screenshot',path.join(output,'下一步-'+width+'.png'));
  }
  report.checks.push('七种宽度无溢出；33月龄深链接不覆盖实际19–24个月参考；一项27月龄已观察即可继续30月龄，同时保留同组未观察项。');
  await cli('set','viewport','390','969');
  await cli('click','.health-groups [data-item=wst580-156] .health-check'); await snapshot();
  await cli('wait','--fn','!!document.querySelector(".health-groups [data-item=wst580-165]")');
  await evaluate(`(()=>{if(!document.querySelector('.health-groups [data-item=wst580-147]'))throw Error('同组遗漏被丢弃');})()`);
  const count=await evaluate(`document.querySelector('.health-domain[data-domain=gross] .health-domain-count').textContent`);
  await cli('click','.site-shortcuts [data-site-item=month]'); await snapshot();
  await cli('select','[aria-label="选择成长阶段"]','h0'); await snapshot();
  await cli('click','.site-shortcuts [data-site-item=next]'); await snapshot();
  await evaluate(`(()=>{if(document.querySelector('.health-domain[data-domain=gross] .health-domain-count').textContent!==${JSON.stringify(count)}||!document.querySelector('.health-groups [data-item=wst580-165]'))throw Error('预览阶段改变了下一步')})()`);
  await cli('reload'); await ready();
  await evaluate(`(()=>{if(!document.querySelector('.health-groups [data-item=wst580-165]'))throw Error('刷新后未按记录恢复推进')})()`);
  report.checks.push('30月龄观察后继续33月龄，保留27月龄遗漏；切换到0–3个月预览再返回以及刷新，推荐和数量保持一致。');
  for(const query of ['156','257']) {
    await cli('fill','.health-search',query); await snapshot();
    await evaluate(`(()=>{if(document.querySelector('.health-groups [data-item]'))throw Error('搜索返回已观察或未开放的项目')})()`);
  }
  await cli('fill','.health-search',''); await snapshot();
  const before=await evaluate('document.querySelectorAll(".health-groups [data-item]").length');
  await cli('click','.health-group-heading'); await snapshot();
  await evaluate(`(()=>{if(document.querySelectorAll('.health-groups [data-item]').length!==${before}||!document.querySelector('.health-groups [data-item=wst580-001]')?.checkVisibility())throw Error('点击能区标题隐藏了项目')})()`);
  report.checks.push('搜索不越出推荐集合，已观察及未开放未来项不混入；推荐完整展示，点击能区标题不会收起项目。');
  await cli('click','.site-shortcuts [data-site-item=overview]'); await snapshot();
  await cli('tab','t1');
  await cli('scrollintoview','.health-lineage [data-item=wst580-156] .health-check'); await snapshot();
  await cli('click','.health-lineage [data-item=wst580-156] .health-check'); await snapshot();
  await cli('wait','--fn','document.querySelector(".health-lineage [data-item=wst580-156] .health-check")?.getAttribute("aria-pressed")==="false"');
  await cli('click','.site-shortcuts [data-site-item=next]'); await snapshot();
  await evaluate(`(()=>{if(document.querySelector('.health-groups [data-item=wst580-165]')||!document.querySelector('.health-groups [data-item=wst580-156]'))throw Error('撤回后未恢复对应进度')})()`);
  report.checks.push('脉络撤回30月龄观察后，下一步恢复30月龄并撤去33月龄；未改动其他版本记录。');
  report.passed=true;
} catch(error) {
  report.error=error.message;
  await cli('screenshot',path.join(output,'失败现场.png')).catch(()=>{});
  throw error;
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await cli('close').catch(()=>{});
}
console.log(JSON.stringify(report));
