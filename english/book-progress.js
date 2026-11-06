/* 公共书单与个人逐本事实：各路线只投影同一身份，不把合计数量摊到单册。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishBookProgress=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const MANUAL='reading.book.v1:',EXTERNAL='reading.external.v1:';
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function planForResource(data,id){return data?.plans?.find(plan=>plan.resourceId===id||plan.resourceIds?.includes(id))||null;}
function groupForStage(plan,stageId){return plan?.stageGroups?.[stageId]||'all';}
function books(plan,group='all'){
  return [...new Map((plan?.books||[]).filter(book=>group==='all'||book.group===group).map(book=>[book.id,book])).values()].sort((a,b)=>a.order-b.order);
}
function externalFacts(records){
  return Object.entries(records||{}).filter(([key,record])=>key.startsWith(EXTERNAL)&&record?.status==='done').flatMap(([key,record])=>{
    const fact=parse(record.note);
    return fact?.version===1&&fact.sourceKind==='xiaohuasheng_bookcase_read'&&typeof fact.publicBookId==='string'?[{...fact,key}]:[];
  });
}
function bookState(records,bookId){
  const manual=records?.[MANUAL+bookId]?.status==='done';
  const external=externalFacts(records).filter(fact=>fact.publicBookId===bookId);
  return {done:manual||external.length>0,manual,external};
}
function manualUpdate(records,bookId,done){
  if(typeof bookId!=='string'||!bookId||MANUAL.length+bookId.length>160||typeof done!=='boolean')throw new Error('单册记录标识或完成状态无效。');
  const key=MANUAL+bookId,previous=records?.[key],meta=parse(previous?.note);
  const next={status:done?'done':'not-started',note:JSON.stringify({...meta,version:1,bookId})};
  if(next.note.length>4000)throw new Error('单册记录内容过长。');
  return previous?.status===next.status&&previous?.note===next.note?{}:{[key]:next};
}
function progress(records,plan,group='all',legacy){
  const selected=books(plan,group),known=new Set(externalFacts(records).map(fact=>fact.publicBookId));
  const identifiedCompleted=selected.filter(book=>records?.[MANUAL+book.id]?.status==='done'||known.has(book.id)).length;
  const legacyCompleted=Number.isSafeInteger(legacy?.completed)&&legacy.completed>=0?legacy.completed:0;
  const total=selected.length,completed=Math.min(total,Math.max(identifiedCompleted,legacyCompleted));
  const percent=total?(completed===total?100:Math.min(99,Math.round(completed/total*100))):0;
  return {completed,total,percent,status:total>0&&completed===total?'done':completed>0?'using':'not-started',identifiedCompleted,legacyCompleted};
}
function scopeGroup(plan,scope){
  if(!plan||!scope)return null;
  if(plan.scopeIds?.includes(scope.id))return 'all';
  const direct=plan.groups?.find(group=>group.scopeIds?.includes(scope.id));
  if(direct)return direct.id;
  // 组合范围的ID由公共出版模型动态生成；只认显式同版、同分项身份，不用标签猜级别。
  const partsIdentity=parts=>JSON.stringify(parts.map(part=>[part.label,part.count]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if(!scope.edition||!scope.parts?.length)return null;
  const identity=partsIdentity(scope.parts);
  const matches=(plan.groups||[]).filter(group=>group.edition===scope.edition&&group.parts?.length&&partsIdentity(group.parts)===identity);
  return matches.length===1?matches[0].id:null;
}
function projectQuantity(records,plan,scope,legacy){
  const group=scopeGroup(plan,scope);
  if(group===null)return legacy;
  const result=progress(records,plan,group,legacy);
  // 同一公共范围的数量有冲突时保留原数量，不混入另一版／个人自选范围。
  if(scope.total!==undefined&&scope.total!==result.total)return legacy;
  return {...legacy,...result,unit:'本'};
}
function matchEntry(data,entry){
  const title=normalize(entry.title),candidates=[],conflicts=[];
  for(const plan of data?.plans||[]){
    for(const prefix of plan.externalMatch?.prefixes||[]){
      const head=normalize(prefix);
      if(!head||!title.startsWith(head)||!/^\s|^$/.test(title.slice(head.length)))continue;
      const tail=title.slice(head.length).trim(),numberMatch=tail.match(/^(\d+)\s+(.+)$/);
      const number=numberMatch?Number(numberMatch[1]):null,bookTitle=numberMatch?numberMatch[2]:tail;
      for(const book of plan.books||[]){
        if(![book.title,...(book.aliases||[])].some(alias=>normalize(alias)===bookTitle))continue;
        const item={planId:plan.id,publicBookId:book.id,title:book.title};
        if(number!==null&&number!==book.number)conflicts.push(item);
        else candidates.push(item);
      }
    }
  }
  const unique=items=>[...new Map(items.map(item=>[item.publicBookId,item])).values()];
  return {candidates:unique(candidates),conflicts:unique(conflicts)};
}
function validateSnapshot(snapshot){
  if(snapshot?.schemaVersion!==1||snapshot.sourceKind!=='xiaohuasheng_bookcase_read'||snapshot.complete!==true||snapshot.authenticated!==true||!Array.isArray(snapshot.books))throw new Error('只可导入已登录且完整核对的书架“读过”快照；失败或缺页不能更新进度。');
  if(typeof snapshot.snapshotId!=='string'||!snapshot.snapshotId||snapshot.snapshotId.length>160||typeof snapshot.fetchedAt!=='string'||!Number.isFinite(Date.parse(snapshot.fetchedAt)))throw new Error('已读快照标识或获取时间无效。');
  if(snapshot.sourceUrl){
    let url;try{url=new URL(snapshot.sourceUrl);}catch{throw new Error('已读快照来源无效。');}
    if(url.protocol!=='https:'||!['www.xiaohuasheng.cn','xiaohuasheng.cn'].includes(url.hostname)||!/^\/bookcase\/user_\d+\/tag_-6(?:\/page_\d+)?\/?$/.test(url.pathname))throw new Error('快照必须来自小花生书架“读过”分类。');
  }
  const owner=String(snapshot.accountId??'default');
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(owner))throw new Error('已读快照账号标识无效。');
  const entries=new Map();
  for(const entry of snapshot.books){
    if(!entry||typeof entry.bookId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(entry.bookId)||typeof entry.title!=='string'||!entry.title.trim()||entry.title.length>1000)throw new Error('已读快照含无效书目，未更新任何记录。');
    const previous=entries.get(entry.bookId);
    if(previous&&previous.title!==entry.title)throw new Error('同一小花生书目出现不同标题，请先核对快照。');
    entries.set(entry.bookId,entry);
  }
  if(['actualUniqueCount','advertisedCount'].some(key=>snapshot[key]!==undefined&&snapshot[key]!==entries.size))throw new Error('快照书目数与已核对总数不一致，未更新进度。');
  return {owner,entries:[...entries.values()]};
}
function applyReadSnapshot(records,data,snapshot){
  const {owner,entries}=validateSnapshot(snapshot),changes={},matched=[],unmatched=[],ambiguous=[];
  for(const entry of entries){
    const {candidates,conflicts}=matchEntry(data,entry);
    if(candidates.length!==1){
      if(candidates.length>1||conflicts.length)ambiguous.push({...entry,candidates:candidates.length?candidates:conflicts,reason:conflicts.length?'number-conflict':'multiple-books'});
      else unmatched.push({...entry,reason:'no-exact-edition-match'});
      continue;
    }
    const match=candidates[0],key=EXTERNAL+owner+':'+entry.bookId,existing=records?.[key],previous=parse(existing?.note);
    if(previous?.publicBookId&&previous.publicBookId!==match.publicBookId){ambiguous.push({...entry,candidates:[{publicBookId:previous.publicBookId},match],reason:'existing-mapping-conflict'});continue;}
    matched.push({...entry,...match});
    // 同一外部身份只写一次；后续完整快照缺失或重复均不撤销历史事实。
    if(existing?.status==='done'&&previous?.publicBookId===match.publicBookId)continue;
    changes[key]={status:'done',note:JSON.stringify({version:1,sourceKind:snapshot.sourceKind,accountId:owner,externalBookId:entry.bookId,publicBookId:match.publicBookId,planId:match.planId,title:entry.title,snapshotId:snapshot.snapshotId,observedAt:snapshot.fetchedAt})};
  }
  return {changes,matched,unmatched,ambiguous};
}
return {MANUAL,EXTERNAL,normalize,planForResource,groupForStage,scopeGroup,books,bookState,manualUpdate,progress,projectQuantity,applyReadSnapshot};
});
