/* 公共书单与个人逐本事实：各路线只投影同一身份，不把合计数量摊到单册。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishBookProgress=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const MANUAL='reading.book.v1:',EXTERNAL='reading.external.v1:',AUTHORITY='reading.authority.v1:',INTERNALIZED='reading.internalized.v1:';
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function planForResource(data,id,directory,catalog,scope){
  const authored=data?.plans?.find(plan=>plan.resourceId===id||plan.resourceIds?.includes(id));
  if(authored)return authored;
  // null 表示当前路线尚无已绑定范围；不能拿套系首个版本冒充本阶段目录。
  if(scope===null)return null;
  const plans=catalogPlans(directory,catalog,id);
  if(!scope)return plans[0]||null;
  const direct=plans.find(plan=>scopeGroup(plan,scope)!==null);
  if(direct)return direct;
  // 同版的任意多个完整分项也可组成选读范围；不只支持单级或整套。
  for(const plan of plans){
    if(plan.edition!==scope.edition||!scope.parts?.length)continue;
    const groups=plan.groups.filter(group=>group.parts.every(part=>scope.parts.some(selected=>selected.label===part.label&&selected.count===part.count)));
    if(groups.length!==scope.parts.length||groups.reduce((sum,group)=>sum+group.publicationScope.total,0)!==scope.total)continue;
    const ids=new Set(groups.map(group=>group.id));
    return {...plan,scopeIds:[scope.id],groups,books:plan.books.filter(book=>ids.has(book.group))};
  }
  return null;
}
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
function directoryProgress(records,directory,catalog,resourceId){
  const canonical=catalogResource(catalog,resourceId)?.resourceId||resourceId;
  const selected=directoryIndex(directory,catalog).byResource.get(canonical)||[],known=new Set(externalFacts(records).map(fact=>fact.publicBookId));
  const completed=new Set(selected.filter(book=>records?.[MANUAL+book.id]?.status==='done'||known.has(book.id)).map(book=>book.id)).size;
  // 部分目录只表示已识别的单册，不能将条目数作为整套出版分母。
  return {completed,identifiedCompleted:completed,total:null,percent:null,unit:'本',status:completed?'using':'not-started'};
}
function bookUpdate(records,prefix,bookId,done){
  if(typeof bookId!=='string'||!bookId||prefix.length+bookId.length>160||typeof done!=='boolean')throw new Error('单册记录标识或状态无效。');
  const key=prefix+bookId,previous=records?.[key],meta=parse(previous?.note);
  const next={status:done?'done':'not-started',note:JSON.stringify({...meta,version:1,bookId})};
  if(next.note.length>4000)throw new Error('单册记录内容过长。');
  return previous?.status===next.status&&previous?.note===next.note?{}:{[key]:next};
}
function manualUpdate(records,bookId,done){return bookUpdate(records,MANUAL,bookId,done);}
function internalized(records,bookId){return records?.[INTERNALIZED+bookId]?.status==='done';}
function internalizationUpdate(records,bookId,value){return bookUpdate(records,INTERNALIZED,bookId,value);}
function progress(records,plan,group='all',legacy){
  const selected=books(plan,group),known=new Set(externalFacts(records).map(fact=>fact.publicBookId));
  const identifiedCompleted=selected.filter(book=>records?.[MANUAL+book.id]?.status==='done'||known.has(book.id)).length;
  const legacyCompleted=Number.isSafeInteger(legacy?.completed)&&legacy.completed>=0?legacy.completed:0;
  const total=selected.length,completed=Math.min(total,Math.max(identifiedCompleted,sourcePriority(records,plan,group)?0:legacyCompleted));
  const percent=total?(completed===total?100:Math.min(99,Math.round(completed/total*100))):0;
  return {completed,total,percent,status:total>0&&completed===total?'done':completed>0?'using':'not-started',identifiedCompleted,legacyCompleted};
}
function sourcePriority(records,plan,group='all'){
  if(plan.catalog){
    const selected=plan.groups.filter(item=>group==='all'||item.id===group);
    return selected.length>0&&selected.every(item=>scopeAuthority(records,item.publicationScope));
  }
  const record=records?.[AUTHORITY+plan.id],meta=parse(record?.note);
  return record?.status==='done'&&meta?.version===1&&meta.policy==='source-priority'&&meta.sourceKind==='xiaohuasheng_bookcase_read';
}
function scopeGroup(plan,scope){
  if(!plan||!scope)return null;
  if(plan.catalog&&scope.edition!==plan.edition)return null;
  if(plan.scopeIds?.includes(scope.id))return 'all';
  const direct=plan.groups?.find(group=>group.scopeIds?.includes(scope.id));
  if(direct)return direct.id;
  // 组合范围的ID由公共出版模型动态生成；只认显式同版、同分项身份，不用标签猜级别。
  const partsIdentity=parts=>JSON.stringify(parts.map(part=>[part.label,part.count]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const parts=scope.parts?.length?scope.parts:plan.catalog?[{label:scope.label,count:scope.total}]:[];
  if(!scope.edition||!parts.length)return null;
  const identity=partsIdentity(parts);
  if(plan.catalog&&plan.edition===scope.edition&&partsIdentity(plan.groups.flatMap(group=>group.parts))===identity)return 'all';
  const matches=(plan.groups||[]).filter(group=>group.edition===scope.edition&&group.parts?.length&&partsIdentity(group.parts)===identity);
  return matches.length===1?matches[0].id:null;
}
function projectQuantity(records,plan,scope,legacy){
  const group=scopeGroup(plan,scope);
  if(group===null)return legacy;
  const result=progress(records,plan,group,legacy);
  // 同一公共范围的数量有冲突时保留原数量，不混入另一版／个人自选范围。
  if(scope.total!==undefined&&scope.total!==result.total)return legacy;
  return {...legacy,...result,unit:'本',sourcePriority:sourcePriority(records,plan,group)};
}
const publicationIndex=new WeakMap(),directoryIndexes=new WeakMap(),publicationPartCache=new WeakMap();
function catalogResource(catalog,resourceId){
  if(!catalog)return undefined;
  let index=publicationIndex.get(catalog);
  if(!index){index=new Map((catalog.series||[]).map(item=>[item.resourceId,item]));publicationIndex.set(catalog,index);}
  const entry=index.get(resourceId);
  return entry?.catalogResourceId?catalogResource(catalog,entry.catalogResourceId):entry;
}
// 公共目录在页面生命周期内不变；只缓存书目索引，个人事实每次读取，保留原对象内修改的即时性。
function directoryIndex(directory,catalog){
  if(!directory||!catalog)return {byResource:new Map(),byId:new Map()};
  let indexes=directoryIndexes.get(directory);
  if(!indexes){indexes=new WeakMap();directoryIndexes.set(directory,indexes);}
  let index=indexes.get(catalog);
  if(!index){
    index={byResource:new Map(),byId:new Map()};
    for(const book of directory.books||[]){
      const id=catalogResource(catalog,book.resourceId)?.resourceId||book.resourceId;
      if(!index.byResource.has(id))index.byResource.set(id,[]);
      index.byResource.get(id).push(book);index.byId.set(book.id,book);
    }
    indexes.set(catalog,index);
  }
  return index;
}
const scopeIdentity=scope=>JSON.stringify([scope.resourceId,scope.edition,scope.label,scope.total,scope.unit||'本']);
function directoryMatches(book,match){
  return !!match&&['edition','level'].every(key=>match[key]===undefined||book[key]===match[key])&&
    (match.bookIds===undefined||match.bookIds.includes(book.id));
}
function publicationParts(catalog,resourceId){
  const entry=catalogResource(catalog,resourceId),parts=new Map();
  if(!entry)return [];
  if(publicationPartCache.has(entry))return publicationPartCache.get(entry);
  for(const scope of entry?.scopes||[])for(const part of scope.parts||[]){
    const value={resourceId:entry.resourceId,edition:scope.edition||entry.edition||'',label:part.label,total:part.count,unit:scope.unit||entry.unit||'本'};
    const key=scopeIdentity(value),previous=parts.get(key)||{...value,directoryMatches:[]};
    if(part.directoryMatch&&!previous.directoryMatches.some(match=>JSON.stringify(match)===JSON.stringify(part.directoryMatch)))previous.directoryMatches.push(part.directoryMatch);
    parts.set(key,previous);
  }
  const result=[...parts.values()];publicationPartCache.set(entry,result);return result;
}
// 仅完整目录可生成逐本进度；版本与分项来自公共出版映射，不再维护第二份书目。
const catalogPlanCache=new WeakMap();
function catalogPlans(directory,catalog,resourceId){
  if(!directory||!catalog)return [];
  let byCatalog=catalogPlanCache.get(directory);
  if(!byCatalog){byCatalog=new WeakMap();catalogPlanCache.set(directory,byCatalog);}
  let byResource=byCatalog.get(catalog);
  if(!byResource){byResource=new Map();byCatalog.set(catalog,byResource);}
  if(byResource.has(resourceId))return byResource.get(resourceId);
  const entry=catalogResource(catalog,resourceId),editions=new Map();
  for(const part of publicationParts(catalog,resourceId)){
    if(part.unit!=='本'||!part.total||!part.directoryMatches.length)continue;
    const selected=[...new Map((directoryIndex(directory,catalog).byResource.get(entry.resourceId)||[]).filter(book=>part.directoryMatches.some(match=>directoryMatches(book,match))).map(book=>[book.id,book])).values()];
    if(selected.length!==part.total)continue;
    if(!editions.has(part.edition))editions.set(part.edition,[]);
    editions.get(part.edition).push({part,selected});
  }
  const plans=[...editions].flatMap(([edition,parts])=>{
    // 重叠分项无法互斥分组时不合成可勾选书单。
    const ids=parts.flatMap(item=>item.selected.map(book=>book.id));
    if(new Set(ids).size!==ids.length)return [];
    const groups=parts.map(({part})=>({id:scopeAuthorityKey(part).split(':').pop(),label:part.label,edition,parts:[{label:part.label,count:part.total}],publicationScope:part}));
    const books=parts.flatMap(({selected},index)=>selected.map((book,order)=>({...book,group:groups[index].id,order:index*100000+order,number:book.number??order+1,patterns:[]})));
    const scopeIds=(entry.scopes||[]).filter(scope=>{
      const scopeEdition=scope.edition||entry.edition||'';
      return scopeEdition===edition&&scope.parts?.length===parts.length&&scope.parts.every(part=>parts.some(item=>item.part.label===part.label&&item.part.total===part.count));
    }).map(scope=>scope.id);
    return [{id:'catalog-'+groups.map(group=>group.id).join('-'),catalog:true,resourceId:entry.resourceId,resourceIds:[entry.resourceId,...(catalog.series||[]).filter(item=>item.catalogResourceId===entry.resourceId).map(item=>item.resourceId)],title:entry.title||entry.name||'',edition,scopeIds,groups,books}];
  });
  byResource.set(resourceId,plans);return plans;
}
function bookPublicationScopes(book,catalog){
  return publicationParts(catalog,book.resourceId).filter(part=>part.directoryMatches.some(match=>directoryMatches(book,match))).map(({directoryMatches,...part})=>part);
}
function scopeAuthorityKey(scope){
  let hash=2166136261;
  for(const c of scopeIdentity(scope))hash=Math.imul(hash^c.charCodeAt(0),16777619);
  return AUTHORITY+'scope:'+(hash>>>0).toString(36);
}
function scopeAuthority(records,scope){
  const record=records?.[scopeAuthorityKey(scope)],meta=parse(record?.note);
  return meta?.version===1&&meta.sourceKind==='xiaohuasheng_bookcase_read'&&meta.publicationScope&&scopeIdentity(meta.publicationScope)===scopeIdentity(scope)
    ?record?.status==='done'&&meta.policy==='source-priority':false;
}
function projectScopeQuantity(records,resourceId,scope,legacy,catalog,directory){
  if(!scope||scope.origin==='personal')return legacy;
  const entry=catalogResource(catalog,resourceId),unit=scope.unit||entry?.unit||legacy?.unit||'本';
  if(!entry||unit!=='本')return legacy;
  const known=publicationParts(catalog,resourceId),requested=scope.parts?.length?scope.parts.map(part=>({label:part.label,total:part.count})):[{label:scope.label,total:scope.total}];
  const selected=[...new Map(requested.map(part=>{const value={...part,resourceId:entry.resourceId,edition:scope.edition||'',unit};return [scopeIdentity(value),value];})).values()];
  if(!selected.length||selected.some(part=>!known.some(candidate=>scopeIdentity(candidate)===scopeIdentity(part))))return legacy;
  const total=selected.reduce((sum,part)=>sum+part.total,0);
  if(scope.total!==undefined&&scope.total!==total)return legacy;
  const identities=new Set(selected.map(scopeIdentity)),facts=externalFacts(records).filter(fact=>fact.publicationScopes?.some(part=>identities.has(scopeIdentity(part))));
  const priority=selected.every(part=>scopeAuthority(records,part));
  const completedIds=new Set(facts.map(fact=>fact.publicBookId));
  const index=directoryIndex(directory,catalog);
  for(const [key,record] of Object.entries(records||{}))if(key.startsWith(MANUAL)&&record?.status==='done'){
    const book=index.byId.get(key.slice(MANUAL.length));
    if(book&&bookPublicationScopes(book,catalog).some(part=>identities.has(scopeIdentity(part))))completedIds.add(book.id);
  }
  if(!completedIds.size&&!priority)return legacy;
  const externalCompleted=new Set(facts.map(fact=>fact.publicBookId)).size,legacyCompleted=Number.isSafeInteger(legacy?.completed)&&legacy.completed>=0?legacy.completed:0;
  const completed=Math.min(total,Math.max(completedIds.size,priority?0:legacyCompleted)),percent=total?(completed===total?100:Math.min(99,Math.round(completed/total*100))):0;
  return {...legacy,completed,total,percent,status:total>0&&completed===total?'done':completed>0?'using':'not-started',unit,externalCompleted,sourcePriority:priority};
}
function matchEntry(data,entry,directory,catalog){
  const title=normalize(entry.title),candidates=[],conflicts=[];
  // 已核定的公开书目身份优先于外站可变题名；重复身份仍交由多候选流程拒绝。
  const identified=(directory?.books||[]).filter(book=>book.externalIds?.xiaohuasheng?.includes(entry.bookId));
  if(identified.length)return {candidates:identified.map(book=>({publicBookId:book.id,title:book.title,resourceId:catalogResource(catalog,book.resourceId)?.resourceId||book.resourceId,publicationScopes:bookPublicationScopes(book,catalog)})),conflicts};
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
  for(const declaration of directory?.externalMatches||[]){
    for(const prefix of declaration.prefixes||[]){
      const head=normalize(prefix);
      if(!head||!title.startsWith(head)||!/^\s|^$/.test(title.slice(head.length)))continue;
      const tail=title.slice(head.length).trim(),numberMatch=tail.match(/^(\d+)\s+(.+)$/),number=numberMatch?Number(numberMatch[1]):null,bookTitle=numberMatch?numberMatch[2]:tail;
      for(const book of directory.books||[]){
        if(book.resourceId!==declaration.resourceId||!directoryMatches(book,declaration.directoryMatch)||![book.title,...(book.aliases||[])].some(alias=>normalize(alias)===bookTitle))continue;
        const item={publicBookId:book.id,title:book.title,resourceId:catalogResource(catalog,book.resourceId)?.resourceId||book.resourceId,publicationScopes:bookPublicationScopes(book,catalog)};
        if(!declaration.ignoreNumber&&number!==null&&book.number!==undefined&&number!==book.number)conflicts.push(item);
        else candidates.push(item);
      }
    }
  }
  const unique=items=>[...items.reduce((all,item)=>all.set(item.publicBookId,{...all.get(item.publicBookId),...item}),new Map()).values()];
  return {candidates:unique(candidates),conflicts:unique(conflicts)};
}
function validateSnapshot(snapshot){
  if(snapshot?.schemaVersion!==1||snapshot.sourceKind!=='xiaohuasheng_bookcase_read'||snapshot.complete!==true||snapshot.authenticated!==true||!Array.isArray(snapshot.books))throw new Error('只可导入已登录且完整核对的书架“读过”快照；失败或缺页不能更新进度。');
  if(typeof snapshot.snapshotId!=='string'||!snapshot.snapshotId||snapshot.snapshotId.length>160||typeof snapshot.fetchedAt!=='string'||!Number.isFinite(Date.parse(snapshot.fetchedAt)))throw new Error('已读快照标识或获取时间无效。');
  const owner=String(snapshot.accountId??'default');
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(owner))throw new Error('已读快照账号标识无效。');
  if(snapshot.sourceUrl){
    let url;try{url=new URL(snapshot.sourceUrl);}catch{throw new Error('已读快照来源无效。');}
    const web=['www.xiaohuasheng.cn','xiaohuasheng.cn'].includes(url.hostname)&&/^\/bookcase\/user_\d+\/tag_-6(?:\/page_\d+)?\/?$/.test(url.pathname);
    // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: App快照仅接受本人固定全书架查询来源，不接收其他账号、筛选或任意接口。
    const app=snapshot.transport==='xiaohuasheng-app-api'&&snapshot.predicate==='readedFlag=1'&&url.origin==='https://app.xiaohuasheng.cn'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='//bookroom/queryBookroomBook/'+owner+'/-2/-1/-1/0/30';
    if(url.protocol!=='https:'||(!web&&!app))throw new Error('快照必须来自小花生完整已读书架，或本人App全书架的已读状态。');
  }
  const entries=new Map();
  for(const entry of snapshot.books){
    if(!entry||typeof entry.bookId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(entry.bookId)||typeof entry.title!=='string'||!entry.title.trim()||entry.title.length>1000)throw new Error('已读快照含无效书目，未更新任何记录。');
    if(entry.appBookId!==undefined&&!(typeof entry.appBookId==='string'&&/^[1-9]\d{0,19}$/.test(entry.appBookId)||Number.isSafeInteger(entry.appBookId)&&entry.appBookId>0))throw new Error('App数字书目标识无效，未更新任何记录。');
    const previous=entries.get(entry.bookId);
    if(previous&&(previous.title!==entry.title||previous.appBookId!==undefined&&entry.appBookId!==undefined&&previous.appBookId!==String(entry.appBookId)))throw new Error('同一小花生书目出现不同标题或App身份，请先核对快照。');
    entries.set(entry.bookId,{...entry,...(entry.appBookId!==undefined?{appBookId:String(entry.appBookId)}:previous?.appBookId!==undefined?{appBookId:previous.appBookId}:{})});
  }
  if(['actualUniqueCount','advertisedCount'].some(key=>snapshot[key]!==undefined&&snapshot[key]!==entries.size))throw new Error('快照书目数与已核对总数不一致，未更新进度。');
  return {owner,entries:[...entries.values()]};
}
function applyReadSnapshot(records,data,snapshot,options={}){
  const {owner,entries}=validateSnapshot(snapshot),changes={},matched=[],unmatched=[],ambiguous=[];
  for(const entry of entries){
    const {candidates,conflicts}=matchEntry(data,entry,options.directory,options.catalog);
    if(!candidates.length&&!conflicts.length&&options.shelfMatches?.has(entry.bookId))candidates.push(options.shelfMatches.get(entry.bookId));
    if(candidates.length!==1){
      if(candidates.length>1||conflicts.length)ambiguous.push({...entry,candidates:candidates.length?candidates:conflicts,reason:conflicts.length?'number-conflict':'multiple-books'});
      else unmatched.push({...entry,reason:'no-exact-edition-match'});
      continue;
    }
    const match=candidates[0],key=EXTERNAL+owner+':'+entry.bookId,existing=records?.[key],previous=parse(existing?.note);
    if(previous?.appBookId!==undefined&&entry.appBookId!==undefined&&String(previous.appBookId)!==entry.appBookId){ambiguous.push({...entry,candidates:[match],reason:'existing-app-id-conflict'});continue;}
    if(previous?.publicBookId&&previous.publicBookId!==match.publicBookId){
      // 同一外站身份后来进入公共目录时沿用其记录；只迁接精确的私人书目ID，不按题名跨版。
      if(previous.publicBookId==='shelf-book-'+owner+'-'+entry.bookId){
        const manual=records?.[MANUAL+previous.publicBookId];
        if(manual&&!records?.[MANUAL+match.publicBookId])changes[MANUAL+match.publicBookId]={...manual};
      }else{ambiguous.push({...entry,candidates:[{publicBookId:previous.publicBookId},match],reason:'existing-mapping-conflict'});continue;}
    }
    matched.push({...entry,...match});
    // 已有单册映射不重建；首次升级时仅补目录范围和App数字身份，保留来源原时点及未知字段。
    if(existing?.status==='done'&&previous?.publicBookId===match.publicBookId){
      const additions={};
      if(match.publicationScopes?.length&&JSON.stringify(previous.publicationScopes)!==JSON.stringify(match.publicationScopes))additions.publicationScopes=match.publicationScopes;
      if(entry.appBookId!==undefined&&previous.appBookId===undefined)additions.appBookId=entry.appBookId;
      if(Object.keys(additions).length)changes[key]={...existing,note:JSON.stringify({...previous,...additions})};
      continue;
    }
    changes[key]={status:'done',note:JSON.stringify({version:1,sourceKind:snapshot.sourceKind,accountId:owner,externalBookId:entry.bookId,...(entry.appBookId!==undefined?{appBookId:entry.appBookId}:{}),publicBookId:match.publicBookId,...(match.planId?{planId:match.planId}:{}),...(match.publicationScopes?{publicationScopes:match.publicationScopes}:{}),title:entry.title,snapshotId:snapshot.snapshotId,observedAt:snapshot.fetchedAt})};
  }
  if(Object.hasOwn(options,'sourcePriority'))for(const planId of new Set(matched.map(item=>item.planId).filter(Boolean))){
    const key=AUTHORITY+planId,priority=options.sourcePriority===true;
    const next={status:priority?'done':'not-started',note:JSON.stringify({version:1,sourceKind:snapshot.sourceKind,policy:priority?'source-priority':'merge',snapshotId:snapshot.snapshotId})};
    if(records?.[key]?.status!==next.status||records?.[key]?.note!==next.note)changes[key]=next;
  }
  if(Object.hasOwn(options,'sourcePriority')){
    const touched=new Set(matched.flatMap(item=>item.publicationScopes||[]).map(part=>JSON.stringify([part.resourceId,part.edition,part.unit]))),parts=new Map();
    for(const item of matched)if(item.resourceId)for(const part of publicationParts(options.catalog,item.resourceId)){
      // 同一出版版本全部有效分项一起采用来源优先，零条的分项也不再被旧合计抬升。
      if(part.directoryMatches.length&&touched.has(JSON.stringify([part.resourceId,part.edition,part.unit])))parts.set(scopeIdentity(part),part);
    }
    for(const {directoryMatches,...publicationScope} of parts.values()){
      const key=scopeAuthorityKey(publicationScope),priority=options.sourcePriority===true;
      const next={status:priority?'done':'not-started',note:JSON.stringify({version:1,sourceKind:snapshot.sourceKind,policy:priority?'source-priority':'merge',snapshotId:snapshot.snapshotId,publicationScope})};
      if(records?.[key]?.status!==next.status||records?.[key]?.note!==next.note)changes[key]=next;
    }
  }
  return {changes,matched,unmatched,ambiguous};
}
return {MANUAL,EXTERNAL,AUTHORITY,INTERNALIZED,normalize,planForResource,catalogPlans,groupForStage,scopeGroup,books,bookState,directoryProgress,manualUpdate,internalized,internalizationUpdate,progress,sourcePriority,projectQuantity,projectScopeQuantity,applyReadSnapshot,matchEntry,validateSnapshot};
});
