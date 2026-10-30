/* 英语个人进展：沿用已有 records/status/note 契约，独立记录可分别合并与撤回。 */
(function(root){
'use strict';
const STATUS={ 'not-started':'未开始',using:'进行中',done:'已完成' };
const KINDS={reading:'亲子共读',animation:'动画',audio:'音频',app:'融合App',history:'历史补录（已折算）'};
const SESSION='practice.session.v1:';
const MATERIAL='practice.material.v1:';
const SONG='practice.song.v1:';
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!value.startsWith('0000')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function json(note){try{return JSON.parse(note);}catch{return null;}}
function unitKey(stage,item){
  // 标签的排列、共用加粗及其他路线素材变动不能改变个人记录键。
  const signature=JSON.stringify([item.material.role,[...new Set(item.materials.map(m=>JSON.stringify([m.sourceId,m.level])))].sort()]);
  let a=2166136261,b=5381;
  for(const c of signature){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}
  return MATERIAL+stage.routeId+':'+stage.id+':'+item.resource.id+':'+(a>>>0).toString(36)+(b>>>0).toString(36);
}
function unitRecord(records,key){const r=records[key],meta=json(r?.note),status=Object.hasOwn(STATUS,r?.status)?r.status:'not-started';const percent=meta?.version===1&&Number.isInteger(meta.percent)&&meta.percent>=0&&meta.percent<=100?meta.percent:status==='done'?100:status==='using'?null:0;return {status,percent,text:meta?.version===1&&typeof meta.text==='string'?meta.text:'',date:validDate(meta?.date)?meta.date:''};}
function unitUpdate(status,text,date=today()){
  if(!Object.hasOwn(STATUS,status)||typeof text!=='string'||text.length>2000||!validDate(date))throw new Error('请检查素材状态和备注。');
  return {status,note:JSON.stringify({version:1,text,date})};
}
function unitProgressUpdate(percent,record,date){
  const meta=json(record?.note),previous=meta?.version===1?meta:{text:record?.note||''};
  date??=validDate(previous.date)?previous.date:today();
  if(!Number.isInteger(percent)||percent<0||percent>100||!validDate(date))throw new Error('请输入0–100的整数百分比。');
  return {...record,status:percent===100?'done':percent>0?'using':'not-started',note:JSON.stringify({...previous,version:1,percent,date})};
}
function unitDateUpdate(date,record){
  if(!validDate(date))throw new Error('请选择有效的记录日期。');
  const meta=json(record?.note),previous=meta?.version===1?meta:{text:record?.note||''};
  return {...record,status:record?.status||'not-started',note:JSON.stringify({...previous,version:1,date})};
}
function sessionRecord(value,todayValue=today()){
  if(value?.version!==1||value.routeId!=='qing'||typeof value.stageId!=='string'||!value.stageId.startsWith('qing-')||!validDate(value.date)||value.date>todayValue)throw new Error('请选择庆爸阶段和有效记录日期。');
  const maximum=value.kind==='history'?600000:1440;
  if(!Object.hasOwn(KINDS,value.kind)||!Number.isInteger(value.minutes)||value.minutes<1||value.minutes>maximum)throw new Error(value.kind==='history'?'历史补录请输入1–600000分钟。':'每条日常记录请输入1–1440分钟。');
  if(typeof value.qualified!=='boolean'||(value.kind==='audio'&&![0,0.5,0.8].includes(value.factor)))throw new Error('请确认有效投入条件及音频折算系数。');
  if(typeof value.content!=='string'||value.content.length>2000||typeof value.unitKey!=='string'||typeof value.unitLabel!=='string'||value.unitKey.length>160||value.unitLabel.length>500)throw new Error('请检查素材和记录内容。');
  const createdAt=value.createdAt??value.date+'T00:00:00.000Z';
  if(typeof createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt)||!Number.isFinite(Date.parse(createdAt)))throw new Error('记录创建时间无效。');
  const clean={version:1,routeId:'qing',stageId:value.stageId,date:value.date,createdAt,kind:value.kind,minutes:value.minutes,factor:value.kind==='audio'?value.factor:1,qualified:value.qualified,unitKey:value.unitKey,unitLabel:value.unitLabel,content:value.content};
  const note=JSON.stringify(clean);if(note.length>4000)throw new Error('记录内容过长，请精简备注。');
  return {status:'done',note};
}
function sessions(records,routeId='qing'){
  const out=[],now=today();
  for(const [id,r] of Object.entries(records)){
    if(!id.startsWith(SESSION+routeId+':')||r.status!=='done')continue;
    const value=json(r.note);try{const clean=JSON.parse(sessionRecord(value,now).note);out.push({...clean,id,effectiveMinutes:clean.qualified?clean.minutes*clean.factor:0});}catch{}
  }
  return out.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
}
function summarize(records,stageId=null){
  const entries=sessions(records).filter(s=>!stageId||s.stageId===stageId),byKind={};
  for(const kind of Object.keys(KINDS))byKind[kind]={minutes:0,effectiveMinutes:0};
  for(const e of entries){byKind[e.kind].minutes+=e.minutes;byKind[e.kind].effectiveMinutes+=e.effectiveMinutes;}
  return {entries,minutes:entries.reduce((n,e)=>n+e.minutes,0),effectiveMinutes:entries.reduce((n,e)=>n+e.effectiveMinutes,0),byKind};
}
function recentDays(records,end=today()){
  const entries=sessions(records),out=[];
  for(let i=6;i>=0;i--){const d=new Date(end+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-i);const date=d.toISOString().slice(0,10);out.push({date,minutes:entries.filter(e=>e.date===date).reduce((n,e)=>n+e.effectiveMinutes,0)});}
  return out;
}
function hours(minutes){return Number((minutes/60).toFixed(2)).toLocaleString('zh-CN',{maximumFractionDigits:2});}
// 日期只作日历运算，不受设备时区或夏令时影响；周从周一开始。
function shiftDate(date,days=0,months=0,years=0){const d=new Date(date+'T12:00:00Z');if(months||years)d.setUTCDate(1);d.setUTCFullYear(d.getUTCFullYear()+years);d.setUTCMonth(d.getUTCMonth()+months);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function periodRange(period,anchor=today(),from='',to=''){
  if(!validDate(anchor))throw new Error('统计日期无效。');
  if(period==='all')return {from:'',to:''};
  if(period==='custom'){if(!validDate(from)||!validDate(to)||from>to)throw new Error('请选择正确的起止日期。');return {from,to};}
  if(period==='year')return {from:anchor.slice(0,4)+'-01-01',to:anchor.slice(0,4)+'-12-31'};
  if(period==='month'){const start=anchor.slice(0,7)+'-01';return {from:start,to:shiftDate(shiftDate(start,0,1),-1)};}
  const weekday=new Date(anchor+'T12:00:00Z').getUTCDay(),start=shiftDate(anchor,-((weekday+6)%7));return {from:start,to:shiftDate(start,6)};
}
function groupKey(entry){return entry.kind==='history'?'history':entry.unitKey||'unassigned:'+entry.kind;}
function aggregate(entries,metric='effective'){
  // 历史补录只有已折算量，不能混进实际时长；零有效记录仍保留可追溯性。
  const included=entries.filter(e=>metric!=='actual'||e.kind!=='history'),groups=new Map();
  for(const e of included){const id=groupKey(e);if(!groups.has(id))groups.set(id,{id,label:e.kind==='history'?KINDS.history:e.unitLabel||KINDS[e.kind]+' · 未指定素材',stageId:e.stageId,unitKey:e.unitKey,minutes:0,count:0});const g=groups.get(id);g.minutes+=metric==='actual'?e.minutes:e.effectiveMinutes;g.count++;}
  const minutes=[...groups.values()].reduce((n,g)=>n+g.minutes,0);
  return {entries:included,minutes,days:new Set(included.map(e=>e.date)).size,groups:[...groups.values()].sort((a,b)=>b.minutes-a.minutes||a.id.localeCompare(b.id)).map(g=>({...g,share:minutes?g.minutes/minutes:0})),historyMinutes:entries.filter(e=>e.kind==='history').reduce((n,e)=>n+e.effectiveMinutes,0)};
}
function statistics(records,{stageId=null,period='all',anchor=today(),from='',to='',metric='effective'}={}){
  const range=periodRange(period,anchor,from,to),entries=sessions(records).filter(e=>(!stageId||e.stageId===stageId)&&(!range.from||e.date>=range.from)&&(!range.to||e.date<=range.to));
  return {...aggregate(entries,metric),range};
}
function trendBuckets(entries,{grain='day',anchor=today(),metric='effective',count:requestedCount}={}){
  const count=requestedCount??{day:7,week:8,month:12,year:5}[grain],base=grain==='day'?anchor:periodRange(grain,anchor).from,out=[];
  for(let i=count-1;i>=0;i--){const start=shiftDate(base,grain==='day'?-i:grain==='week'?-i*7:0,grain==='month'?-i:0,grain==='year'?-i:0),range=grain==='day'?{from:start,to:start}:periodRange(grain,start);out.push({...range,...aggregate(entries.filter(e=>e.date>=range.from&&e.date<=range.to),metric)});}
  return out;
}
function calendarDays(month){if(!/^\d{4}-\d{2}$/.test(month)||!validDate(month+'-01'))throw new Error('月份无效。');const first=month+'-01',last=periodRange('month',first).to;return Array.from({length:Number(last.slice(8))},(_,i)=>shiftDate(first,i));}
const api={STATUS,KINDS,SESSION,MATERIAL,SONG,today,validDate,unitKey,unitRecord,unitUpdate,unitProgressUpdate,unitDateUpdate,sessionRecord,sessions,summarize,recentDays,hours,shiftDate,periodRange,groupKey,aggregate,statistics,trendBuckets,calendarDays};
root.EnglishPractice=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
