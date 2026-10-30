// 独立浏览器会话与合成记录；不连接用户浏览器或真实私有仓。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const run = promisify(execFile);
const output = process.argv[2];
if (!output) throw new Error('请传入新的验收产物目录。');
await mkdir(output, { recursive: true });
const session = 'health-accept-' + Date.now();
const base = process.env.XIAOYA_PREVIEW || 'http://127.0.0.1:5318';
const report = { session, base, widths: [], checks: [] };
async function cli(...args) {
  const { stdout } = await run('agent-browser', ['--session', session, ...args, '--json'], { maxBuffer: 4 * 1024 * 1024, timeout: 60000 });
  const response = JSON.parse(stdout);
  if (!response.success) throw new Error(response.error);
  return response.data;
}
async function evaluate(script) { return (await cli('eval', '-b', Buffer.from(script).toString('base64'))).result; }
try {
  await cli('--executable-path', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'open', base + '/health.html');
  await cli('wait', '--fn', '!!document.querySelector(".health-lineage-viewport")');
  for (const width of [320, 375, 390, 768, 900, 901, 1280]) {
    await cli('set', 'viewport', String(width), '969');
    const result = await evaluate(`(() => {
      const check = (condition, label) => { if (!condition) throw Error(label); };
      check(document.documentElement.scrollWidth <= innerWidth, '主体横向溢出');
      const truncated = [...document.querySelectorAll('.health-item-title,.health-summary,.health-toolbar input')].filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.className);
      check(!truncated.length, '内容截断:' + truncated);
      const first = document.querySelector('.health-lineage-stage.is-current .health-check');
      const size = first.getBoundingClientRect(); check(size.width === 18 && size.height === 18, '完成圆大小');
      check(getComputedStyle(document.querySelector('.site-directory-button')).display !== 'none' === (innerWidth <= 900), '目录断点');
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,firstAction:Math.round(size.top),items:document.querySelectorAll('.health-item').length};
    })()`);
    report.widths.push(result);
    if ([320,390,768,1280].includes(width)) await cli('screenshot', path.join(output, `月龄观察-${width}.png`), '--full');
  }
  await cli('set', 'viewport', '390', '969');
  await cli('click', '.site-directory-button'); await cli('snapshot', '-i');
  await evaluate(`(() => {if(!document.querySelector('dialog.site-directory-dialog[open]'))throw Error('移动目录未展开')})()`);
  await cli('press', 'Escape'); await cli('snapshot', '-i');
  await cli('click', '.health-lineage .health-item[data-item="wst580-128"] .health-check');
  await cli('wait', '--fn', 'document.querySelector("[data-item=wst580-128] .health-check").getAttribute("aria-pressed")==="true"');
  await cli('reload'); await cli('wait', '--fn', '!!document.querySelector(".health-lineage-viewport")');
  await evaluate(`(() => { if(document.querySelector('[data-item=wst580-128] .health-check').getAttribute('aria-pressed') !== 'true') throw Error('刷新丢记录'); })()`);
  await cli('click', '.health-lineage [data-item=wst580-128] .health-item-open');
  await cli('snapshot', '-i');
  await cli('fill', 'textarea[aria-label="观察手记"]', '验收合成手记：踮脚走过三步');
  await cli('select', '.health-dialog select[aria-label="观察状态"]', 'not-yet');
  await cli('screenshot', path.join(output, '原文与观察详情-390.png'), '--full');
  await cli('click', '.health-observation-form button[type=submit]');
  await cli('wait', '--fn', '!document.querySelector(".health-dialog")');
  await cli('reload'); await cli('wait', '--fn', '!!document.querySelector(".health-lineage-viewport")');
  const storage = await evaluate(`(async () => {
    const a = XiaoyaSyncAdapters.createAdapters({indexedDB,localStorage,profileClient:{get:()=>({})}});
    const health = await a.health.read(); if(health.records['wst580-128'].status !== 'not-yet' || !health.records['wst580-128'].note.includes('合成手记')) throw Error('观察状态/手记丢失');
    if(await a.growth.read() !== null || localStorage.getItem('little-leaf-english-v1') !== null) throw Error('污染其他领域记录');
    return {healthRecords:Object.keys(health.records).length,growthUnchanged:true,englishUnchanged:true};
  })()`);
  report.checks.push(storage);
  await cli('click', '.site-shortcuts [data-site-item="overview"]'); await cli('snapshot', '-i');
  await cli('screenshot', path.join(output, '能区全览-390.png'), '--full');
  await cli('fill', '.health-search', '261');
  await cli('click', '.health-results-heading button'); // 查看全部能区，搜索跨全部月龄。
  await evaluate(`(() => { if(document.querySelectorAll('.health-item').length!==1 || !document.querySelector('[data-item=wst580-261]')) throw Error('搜索范围错误'); })()`);
  const concurrency = await evaluate(`(async () => {
    const M=XiaoyaSyncModel, options={indexedDB,localStorage,profileClient:{get:()=>({})}};
    const a=XiaoyaSyncAdapters.createAdapters(options).health,b=XiaoyaSyncAdapters.createAdapters(options).health;
    const base=await a.read(),left=structuredClone(base),right=structuredClone(base);
    left.records['wst580-129']={note:'页面甲'}; right.records['wst580-130']={note:'页面乙'};
    await Promise.all([a.apply(left,base),b.apply(right,base)]);
    const both=await a.read(); if(!both.records['wst580-129']||!both.records['wst580-130'])throw Error('并发覆盖');
    const c=structuredClone(both),d=structuredClone(both);c.records['wst580-129'].note='甲新';d.records['wst580-129'].note='乙新';
    await a.apply(c,both);let conflict=false;try{await b.apply(d,both)}catch(e){conflict=e.code==='MERGE_CONFLICT'}
    if(!conflict||(await a.read()).records['wst580-129'].note!=='甲新')throw Error('同字段并发未阻止');
    return {concurrentEditsPreserved:true,sameFieldConflictStopped:true};
  })()`);
  report.checks.push(concurrency);
  const synchronization = await evaluate(`(async () => {
    const M=XiaoyaSyncModel, fakeDB={open:(name,...args)=>indexedDB.open('accept-device2-'+name,...args)};
    const opts=db=>({indexedDB:db,localStorage,profileClient:{get:()=>({})}});
    const adapters=[XiaoyaSyncAdapters.createAdapters(opts(indexedDB)).health,XiaoyaSyncAdapters.createAdapters(opts(fakeDB)).health];
    const journal1=XiaoyaSyncEngine.createJournal(indexedDB),journal2=XiaoyaSyncEngine.createJournal(fakeDB);
    let cloud={snapshot:null,revision:null,savedAt:null},revision=0,offline=false;
    const request=async (area,method,body)=>{if(offline)throw Error('模拟断网');if(method==='PUT'){if(body.revision!==cloud.revision)throw Object.assign(Error('版本冲突'),{code:'VERSION_CONFLICT'});cloud={snapshot:structuredClone(body.snapshot),revision:String(++revision),savedAt:new Date().toISOString()};}return structuredClone(cloud)};
    const make=async (i)=>{const original=i===0?journal1:journal2;const journal={get:k=>original.get('accept|'+k),update:(k,fn)=>original.update('accept|'+k,fn)};const e=XiaoyaSyncEngine.createEngine({journal,request,retryMs:60000});await e.register('health',adapters[i]);e.authenticate(true);return e};
    const a=await make(0);let b=await make(1);
    try {
      await a.enable('health',await a.preview('health'));await b.enable('health',await b.preview('health'));
      const base=await adapters[0].read(),next=structuredClone(base);next.records['wst580-138']={status:'observed',observedAt:'2026-10-30'};await adapters[0].apply(next,base);await a.changed('health');await a.sync('health');await b.sync('health');
      if(!(await adapters[1].read()).records['wst580-138'])throw Error('双端未拉取');
      const l=await adapters[0].read(),r=await adapters[1].read(),ln=structuredClone(l),rn=structuredClone(r);ln.records['wst580-138'].note='甲端';rn.records['wst580-138'].note='乙端';await adapters[0].apply(ln,l);await adapters[1].apply(rn,r);await a.sync('health');await b.sync('health');
      const conflict=b.states().health.conflict;if(!conflict)throw Error('云端冲突未检测');
      await b.resolve('health',Object.fromEntries(conflict.conflicts.map(c=>[c.key,'remote'])),conflict);b.destroy();b=await make(1);await b.sync('health');if(b.states().health.conflict)throw Error('刷新重复冲突');
      offline=true;const before=await adapters[1].read(),pending=structuredClone(before);pending.records['wst580-138'].status='not-yet';await adapters[1].apply(pending,before);await b.changed('health');await b.sync('health');if(!b.states().health.pending)throw Error('离线未标待同步');b.destroy();b=await make(1);offline=false;await b.sync('health');await a.sync('health');if((await adapters[0].read()).records['wst580-138'].status!=='not-yet')throw Error('重开后离线变更未恢复');
      return {twoDevices:true,cloudConflictResolvedAfterReload:true,offlineRestartRecovery:true};
    }finally{a.destroy();b.destroy()}
  })()`);
  report.checks.push(synchronization);
  await cli('click', '.site-actions button[aria-label="本版记录与备份"]'); await cli('snapshot', '-i');
  await cli('click', '.health-dialog-body > button');
  await cli('wait', '--text', '已保存备份：');
  const backupPath = await evaluate(`document.querySelector('.health-dialog-body [role=status]').textContent.replace('已保存备份：','')`);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  if (backup.standard !== 'WS/T 580—2017' || backup.profile) throw Error('备份混入另一版本');
  const importPath = path.join(output, '合成导入样本.json');
  await writeFile(importPath, JSON.stringify({version:1,standard:'WS/T 580—2017',records:{'wst580-261':{status:'observed',observedAt:'2026-10-30',note:'合成导入验收'}}}));
  await cli('upload', '.health-import-label input', importPath); await cli('snapshot', '-i');
  await cli('click', '.health-dialog form button[type=submit]'); await cli('wait', '--fn', '!document.querySelector(".health-dialog")');
  await evaluate(`(async()=>{const a=XiaoyaSyncAdapters.createAdapters({indexedDB,localStorage,profileClient:{get:()=>({})}}).health;const value=await a.read();if(value.records['wst580-261']?.note!=='合成导入验收'||!value.records['wst580-128'])throw Error('导入未保留双方记录')})()`);
  report.checks.push({backupPath,importPreviewAndMerge:true});
  await cli('open', base + '/index.html'); await cli('wait', '--text', '毛老师版');
  await cli('click', '.growth-versions a[href="./health.html"]'); await cli('wait', '--fn', '!!document.querySelector(".health-lineage-viewport")');
  report.checks.push({versionNavigation:true});
  const errors = await cli('errors'); report.console = errors;
  await writeFile(path.join(output, '浏览器验收.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await cli('close').catch(()=>{}); }
