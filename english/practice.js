/* 英语个人进展：沿用已有 records/status/note 契约，独立记录可分别合并与撤回。 */
(function(root){
'use strict';
const STATUS={ 'not-started':'未开始',using:'进行中',done:'已完成' };
const KINDS={reading:'亲子共读',animation:'动画',audio:'音频',app:'融合App',history:'历史补录（已折算）'};
const SESSION='practice.session.v1:';
const MATERIAL='practice.material.v1:';
const SONG='practice.song.v1:';
const LIBRARY='library.progress.v1:';
function resourceProgress(entries){
  const unique=[...new Map(entries.map(entry=>[entry.key,entry])).values()];
  const done=unique.filter(entry=>entry.status==='done').length;
  const started=unique.some(entry=>entry.status==='done'||entry.completed>0||entry.minutes>0||entry.effectiveMinutes>0);
  return {status:unique.length&&done===unique.length?'done':started?'using':'not-started',done,total:unique.length};
}
function libraryQuantity(record,scopes=[],unit='个',selectedScope){
  const meta=json(record?.note),saved=meta?.version===1?meta:{};
  const scope=selectedScope!==undefined?selectedScope:Object.hasOwn(saved,'scope')?saved.scope:scopes.find(scope=>scope.default)||null;
  const identity=JSON.stringify([scope?.id,scope?.label,scope?.total,scope?.edition||'',scope?.unit||unit]);
  return {...quantityRecord(saved.quantities?.[identity],scope,unit),scope,identity};
}
function libraryScopes(record,scopes=[],unit='个'){
  const meta=json(record?.note),saved=meta?.version===1?Object.values(meta.quantities||{}):[];
  const previous=saved.flatMap(record=>{const books=unitBooks(record);return books?.mode==='count'&&books.total!==null?[{id:books.scopeId,label:books.label,total:books.total,edition:books.edition,origin:books.origin,unit}]:[];});
  const seen=new Set();
  return [...scopes,...previous].filter(scope=>{const id=JSON.stringify([scope.id,scope.label,scope.total,scope.edition||'',scope.unit||unit]);if(seen.has(id))return false;seen.add(id);return true;});
}
function libraryQuantityUpdate(record,scope,completed,unit='个'){
  // 出版来源、目录及原文由公共目录维护；私人同步只保存选中范围的身份和数量。
  scope=scope?{id:scope.id,label:scope.label,total:scope.total,edition:scope.edition||'',origin:scope.origin||'catalog',unit:scope.unit||unit}:null;
  const quantity=libraryQuantity(record,[],unit,scope),meta=json(record?.note);
  const progress=unitQuantityProgressUpdate(completed,scope,null,unit);
  const note=JSON.stringify({...meta,version:1,scope,quantities:{...meta?.quantities,[quantity.identity]:progress}});
  if(note.length>4000)throw new Error('这份素材的版本记录过多，请先导出备份后整理。');
  return {status:progress.status,note};
}
function matchesMaterialSearch(values,query,aliases=[]){
  const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  // 别名属于整个套系，其中历史级别不能让当前分辑误命中。
  const numbers=values.join(' ').normalize('NFKC').match(/\d+/g)||[];
  if((String(query).normalize('NFKC').match(/\d+/g)||[]).some(number=>!numbers.includes(number)))return false;
  const text=[...values,...aliases.map(alias=>alias.replace(/\p{N}/gu,''))].map(normalize).join(' ');
  return String(query).trim().split(/\s+/u).every(token=>{
    const needle=normalize(token);let index=0;
    for(const char of text)if(char===needle[index])index++;
    return index===needle.length;
  });
}
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
function sortSongsByCompletion(songs,records){
  return songs.slice().sort((a,b)=>Number(records[SONG+a.id]?.status==='done')-Number(records[SONG+b.id]?.status==='done'));
}
function songPlaylistProgress(records,library,categoryId='essential'){
  // 只读取该歌单已有歌曲的独立记录，不把套系或旧素材百分比转为单曲完成。
  const songs=new Set((library?.songs||[]).map(song=>song.id));
  const ids=[...new Set(library?.categories?.find(category=>category.id===categoryId)?.songIds||[])].filter(id=>songs.has(id));
  const total=ids.length,done=ids.filter(id=>records[SONG+id]?.status==='done').length;
  const complete=total>0&&done===total,percent=total?(complete?100:Math.min(99,Math.round(done/total*100))):0;
  return {total,done,percent,status:complete?'done':done>0?'using':'not-started'};
}
function unitUpdate(status,text,date=today()){
  if(!Object.hasOwn(STATUS,status)||typeof text!=='string'||text.length>2000||!validDate(date))throw new Error('请检查素材状态和备注。');
  return {status,note:JSON.stringify({version:1,text,date})};
}
function unitProgressUpdate(percent,record,date){
  const meta=json(record?.note),previous=meta?.version===1?meta:{text:record?.note||''};
  date??=validDate(previous.date)?previous.date:today();
  if(!Number.isInteger(percent)||percent<0||percent>100||!validDate(date))throw new Error('请输入0–100的整数百分比。');
  return {...record,status:percent===100?'done':percent>0?'using':'not-started',note:JSON.stringify({...previous,version:1,percent,date,...(previous.books?{books:{version:1,mode:'percent'}}:{})})};
}
// 出版范围与路线原始级别分开，不能为补册数修改素材签名或跨版本借用分母。
function bookScopes(resourceId,levels,catalog,stageId){
  const model=typeof module==='object'&&module.exports?require('./model.js'):root.EnglishModel;
  return model.publicationLevelScopes(catalog,resourceId,levels,stageId);
}
function unitBooks(record){const meta=json(record?.note);return meta?.version===1&&meta.books?.version===1?meta.books:null;}
function partKey(key,identity){let hash=2166136261;for(const c of identity)hash=Math.imul(hash^c.charCodeAt(0),16777619);return key+':p'+(hash>>>0).toString(36);}
function expandBookUnits(unit,levels,catalog,record){
  const model=typeof module==='object'&&module.exports?require('./model.js'):root.EnglishModel;
  const entry=model.publicationEntry(catalog,unit.resourceId),meta=json(record?.note),old=unitBooks(record);
  const sourceLevels=unit.item.materials.map(m=>m.level).filter(Boolean);
  const canChooseEdition=entry?.recordingLevels?sourceLevels.length>0&&sourceLevels.every(level=>entry.recordingLevels.includes(level)):!sourceLevels.length;
  const editions=canChooseEdition?entry?.recordingEditions:[];
  const edition=editions?.find(e=>e.id===meta?.recordingEdition)||(old?.edition&&editions?.find(e=>{const scope=entry.scopes.find(s=>s.id===e.scopeId);return scope&&(scope.edition||entry.edition)===old.edition;}))||editions?.find(e=>e.default)||editions?.[0];
  const scope=edition?bookScopes(unit.resourceId,[],catalog,unit.stageId).find(s=>s.id===edition.scopeId):unit.bookScopes.find(s=>s.default);
  if(scope&&(scope.parts.length>1||edition))return scope.parts.map(part=>{
    const title=scope.title||unit.item.resource.title,identity=JSON.stringify([scope.edition,part.label]);
    const partScope={id:partKey('part',identity),label:part.label,total:part.count,edition:scope.edition,origin:'catalog'};
    return {...unit,key:partKey(unit.key,identity),parentKey:unit.key,label:title+' · '+part.label,partTitle:title,partScope,editionId:edition?.id,editionOptions:editions||[],recordingNote:edition?entry.recordingNote:'',bookScopes:[]};
  });
  if(levels.length>1)return levels.map(level=>({...unit,key:partKey(unit.key,level.id),parentKey:unit.key,label:unit.item.resource.title+' · '+level.label,partLevel:level,bookScopes:bookScopes(unit.resourceId,[level.label],catalog,unit.stageId)}));
  return [unit];
}
function materialRecord(records,unit){
  if(Object.hasOwn(records,unit.key))return records[unit.key];
  if(!unit.parentKey||!unit.partScope)return undefined;
  const previous=records[unit.parentKey],books=unitBooks(previous),scope=unit.partScope;
  // 只沿用能精确归属单辑的旧记录，不拆分合并百分比或跨版本本数。
  return books?.mode==='count'&&books.label===scope.label&&books.total===scope.total&&books.edition===scope.edition?previous:undefined;
}
function unitEditionUpdate(editionId,record){const meta=json(record?.note);return {...record,status:record?.status||'not-started',note:JSON.stringify({...((meta?.version===1)?meta:{text:record?.note||''}),version:1,recordingEdition:editionId})};}
function validBookScope(scope){return scope&&typeof scope.id==='string'&&scope.id.length<=160&&typeof scope.label==='string'&&scope.label.length<=100&&Number.isInteger(scope.total)&&scope.total>0&&scope.total<=10000;}
function unitBookScopeUpdate(scope,record){
  if(scope!==null&&!validBookScope(scope))throw new Error('请填写选用范围和1–10000本的总数。');
  const meta=json(record?.note),previous=meta?.version===1?meta:{text:record?.note||''},old=unitBooks(record);
  // 用户为原来只记数量的同一条目补选范围时，保留已有数量；已确定的不同版本仍隔离。
  const sameScope=old?.mode==='count'&&old.scopeId===scope?.id&&old.total===scope?.total&&old.label===scope?.label&&old.edition===(scope?.edition||'');
  if(scope&&old?.mode==='count'&&old.total===null&&Number.isInteger(old.completed)&&old.completed>scope.total)throw new Error('已记数量大于这个选本的总量，请核对版本或先修改数量。');
  const addingTotal=old?.mode==='count'&&old.total===null&&old.unit===(scope?.unit||'本')&&Number.isInteger(old.completed)&&old.completed<=scope?.total;
  const books=scope?{version:1,mode:'count',scopeId:scope.id,label:scope.label,total:scope.total,edition:scope.edition||'',origin:scope.origin||'catalog',completed:sameScope||addingTotal?old.completed:null}:{version:1,mode:'percent'};
  // 换范围不反推已读本数、不改变原百分比；用户填写本数后才开始按新分母计算。
  return {...record,status:record?.status||'not-started',note:JSON.stringify({...previous,version:1,books})};
}
function unitBookProgressUpdate(completed,scope,record){
  if(!validBookScope(scope)||!Number.isInteger(completed)||completed<0||completed>scope.total)throw new Error('请输入0–'+(scope?.total||0)+'之间的整数本数。');
  const updated=unitBookScopeUpdate(scope,record),previous=json(updated.note);
  const percent=completed===scope.total?100:Math.min(99,Math.round(completed/scope.total*100));
  return {...updated,status:completed===scope.total?'done':completed>0?'using':'not-started',note:JSON.stringify({...previous,percent,date:validDate(previous.date)?previous.date:today(),books:{...previous.books,completed}})};
}
function quantityUnit(type){return ({animation:'集',song:'首',flashcard:'张',book:'本',reader:'本'})[type]||'个';}
function quantityRecord(record,scope,unit='个'){
  const books=unitBooks(record),total=scope?.total??null;
  const matches=books?.mode==='count'&&(scope?(books.total===total&&books.label===scope.label&&books.edition===(scope.edition||''))||(scope.countOnlyCompatible&&books.total===null&&books.unit===(scope.unit||unit)):books.total===null&&books.unit===unit);
  const completed=matches&&Number.isInteger(books.completed)?books.completed:0;
  const percent=total===null?null:completed===total?100:Math.min(99,Math.round(completed/total*100));
  return {completed,total,unit:scope?.unit||unit,percent,status:total!==null&&completed===total?'done':completed>0?'using':'not-started'};
}
function unitQuantityProgressUpdate(completed,scope,record,unit='个'){
  if(scope)return unitBookProgressUpdate(completed,scope,record);
  if(!Number.isSafeInteger(completed)||completed<0||completed>1000000)throw new Error('请输入0–1000000之间的整数数量。');
  const meta=json(record?.note),previous=meta?.version===1?meta:{text:record?.note||''};
  return {...record,status:completed>0?'using':'not-started',note:JSON.stringify({...previous,version:1,date:validDate(previous.date)?previous.date:today(),books:{version:1,mode:'count',total:null,unit,completed}})};
}
function groupQuantity(record,children){
  const unit=children[0]?.unit||'个',total=children.length&&children.every(c=>c.total!==null&&c.unit===unit)?children.reduce((n,c)=>n+c.total,0):null;
  const id=partKey('group',JSON.stringify(children.map(c=>[c.key,c.total,c.unit,c.scopeIdentity||'']))),meta=json(record?.note);
  // 同一原文范围首次补齐分母时，可回显旧的无分母总项；不同版次不沿用。
  const legacyId=children.length&&children.every(c=>c.countOnlyCompatible)?partKey('group',JSON.stringify(children.map(c=>[c.key,null,c.unit,'']))):null;
  const groups=meta?.version===1?meta.quantityRollup?.groups:null;
  const childCompleted=children.reduce((n,c)=>n+c.completed,0),saved=groups?.[id]?.completed??(legacyId?groups?.[legacyId]?.completed:0);
  const directCompleted=Number.isSafeInteger(saved)&&saved>=0?saved:0,completed=Math.max(directCompleted,childCompleted);
  const percent=total===null?null:completed>=total?100:Math.min(99,Math.round(completed/total*100));
  return {id,unit,total,completed,childCompleted,directCompleted,percent,status:total!==null&&completed>=total?'done':completed>0?'using':'not-started'};
}
function groupQuantityUpdate(completed,children,record){
  const quantity=groupQuantity(record,children),maximum=quantity.total??1000000;
  if(!Number.isSafeInteger(completed)||completed<0||completed>maximum)throw new Error('请输入0–'+maximum+'之间的整数数量。');
  const meta=json(record?.note),previous=meta?.version===1?meta:{text:record?.note||''};
  return {...record,status:record?.status||'not-started',note:JSON.stringify({...previous,version:1,quantityRollup:{...previous.quantityRollup,version:1,groups:{...previous.quantityRollup?.groups,[quantity.id]:{completed}}}})};
}
function materialParentKey(key){return key.startsWith(MATERIAL+'qing:')&&key.split(':').length===6&&/:p[0-9a-z]+$/.test(key)?key.replace(/:p[0-9a-z]+$/,''):'';}
function accountSessionTotals(entries){
  // 父项视作已记总量；子项合计与父项取max。只扣父项被覆盖的份额，原始明细不改。
  const out=entries.map(e=>({...e,countedMinutes:e.kind==='history'?0:e.minutes,countedEffectiveMinutes:e.effectiveMinutes})),groups=new Map();
  for(const e of out){const parent=materialParentKey(e.unitKey),key=e.stageId+'|'+(parent||e.unitKey);if(!e.unitKey)continue;let group=groups.get(key);if(!group)groups.set(key,group={parents:[],children:[]});group[parent?'children':'parents'].push(e);}
  for(const {parents,children}of groups.values()){
    for(const e of parents)e.rollupParent=children.length>0;
    let actual=children.reduce((n,e)=>n+e.countedMinutes,0),effective=children.reduce((n,e)=>n+e.countedEffectiveMinutes,0);
    for(const e of parents.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){
      const a=Math.min(actual,e.countedMinutes),f=Math.min(effective,e.countedEffectiveMinutes);e.countedMinutes-=a;e.countedEffectiveMinutes-=f;actual-=a;effective-=f;
    }
  }
  return out;
}
function materialTime(records,key,childKeys=[],entries=sessions(records)){
  const sum=keys=>entries.filter(e=>keys.includes(e.unitKey)).reduce((n,e)=>({minutes:n.minutes+(e.kind==='history'?0:e.minutes),effectiveMinutes:n.effectiveMinutes+e.effectiveMinutes}),{minutes:0,effectiveMinutes:0});
  const direct=sum([key]),children=sum(childKeys);
  return {minutes:Math.max(direct.minutes,children.minutes),effectiveMinutes:Math.max(direct.effectiveMinutes,children.effectiveMinutes),direct,children};
}
function unitDateUpdate(date,record){
  if(!validDate(date))throw new Error('请选择有效的记录日期。');
  const meta=json(record?.note),previous=meta?.version===1?meta:{text:record?.note||''};
  return {...record,status:record?.status||'not-started',note:JSON.stringify({...previous,version:1,date})};
}
function timeOptions(stageId,type,accounting,hasAnimation=false){
  const options=[],audio=accounting?.verifiedNote?.stageAudio?.find(rule=>rule.stageId===stageId);
  if(['book','reader','flashcard'].includes(type))options.push({id:'reading',label:'共读×1',kind:'reading',factor:1,qualified:true});
  if(type==='animation'||type==='song'||hasAnimation)options.push({id:'animation',label:'动画×1',kind:'animation',factor:1,qualified:true});
  if(type==='app')options.push({id:'app',label:'App×1',kind:'app',factor:1,qualified:true});
  // 系数来自原作者明确的记录阶段；不拿书本级别、宝宝年龄或素材名称反推。
  if(audio)options.push({id:'audio',label:'音频×'+audio.factor,kind:'audio',factor:audio.factor,qualified:true});
  options.push({id:'excluded',label:'不计×0',kind:options[0]?.kind||'audio',factor:options[0]?.factor??0,qualified:false});
  return options;
}
function inlineSessionRecord(value,options,date=today()){
  const mode=options.find(option=>option.id===value.mode);
  if(!mode)throw new Error('请先选择本次实际使用方式。');
  return sessionRecord({version:1,routeId:'qing',stageId:value.stageId,date,createdAt:value.createdAt,unitKey:value.unitKey,unitLabel:value.unitLabel,content:'',kind:mode.kind,factor:mode.factor,qualified:mode.qualified,minutes:value.minutes});
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
  return accountSessionTotals(out.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)));
}
function summarize(records,stageId=null){
  const entries=sessions(records).filter(s=>!stageId||s.stageId===stageId),byKind={};
  for(const kind of Object.keys(KINDS))byKind[kind]={minutes:0,effectiveMinutes:0};
  for(const e of entries){byKind[e.kind].minutes+=e.countedMinutes;byKind[e.kind].effectiveMinutes+=e.countedEffectiveMinutes;}
  return {entries,minutes:entries.reduce((n,e)=>n+e.countedMinutes,0),effectiveMinutes:entries.reduce((n,e)=>n+e.countedEffectiveMinutes,0),byKind};
}
function recentDays(records,end=today()){
  const entries=sessions(records),out=[];
  for(let i=6;i>=0;i--){const d=new Date(end+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-i);const date=d.toISOString().slice(0,10);out.push({date,minutes:entries.filter(e=>e.date===date).reduce((n,e)=>n+e.countedEffectiveMinutes,0)});}
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
  for(const e of included){const id=groupKey(e);if(!groups.has(id))groups.set(id,{id,label:e.kind==='history'?KINDS.history:(e.unitLabel||KINDS[e.kind]+' · 未指定素材')+(e.rollupParent?' · 父项差额':''),stageId:e.stageId,unitKey:e.unitKey,minutes:0,count:0});const g=groups.get(id);g.minutes+=metric==='actual'?(e.countedMinutes??e.minutes):(e.countedEffectiveMinutes??e.effectiveMinutes);g.count++;}
  const minutes=[...groups.values()].reduce((n,g)=>n+g.minutes,0);
  return {entries:included,minutes,days:new Set(included.map(e=>e.date)).size,groups:[...groups.values()].sort((a,b)=>b.minutes-a.minutes||a.id.localeCompare(b.id)).map(g=>({...g,share:minutes?g.minutes/minutes:0})),historyMinutes:entries.filter(e=>e.kind==='history').reduce((n,e)=>n+(e.countedEffectiveMinutes??e.effectiveMinutes),0)};
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
const api={STATUS,KINDS,SESSION,MATERIAL,SONG,LIBRARY,resourceProgress,libraryQuantity,libraryScopes,libraryQuantityUpdate,matchesMaterialSearch,today,validDate,unitKey,unitRecord,sortSongsByCompletion,songPlaylistProgress,unitUpdate,unitProgressUpdate,bookScopes,expandBookUnits,materialRecord,unitEditionUpdate,unitBooks,quantityUnit,quantityRecord,unitQuantityProgressUpdate,groupQuantity,groupQuantityUpdate,materialParentKey,materialTime,unitBookScopeUpdate,unitBookProgressUpdate,unitDateUpdate,timeOptions,inlineSessionRecord,sessionRecord,sessions,summarize,recentDays,hours,shiftDate,periodRange,groupKey,aggregate,statistics,trendBuckets,calendarDays};
root.EnglishPractice=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
