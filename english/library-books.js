(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./topics.js'):root.EnglishTopics);if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishLibraryBooks=api;})(typeof window==='object'?window:globalThis,function(T){
'use strict';
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ').trim();
const qualified=level=>/虚构|挑选|部分|复习|版/.test(level||'');
function topics(data,custom=[]){
  const result=T.roots().map(t=>({...t}));
  for(const book of custom)for(const id of topicIds(book,data))if(!T.node(id)&&!result.some(t=>t.id===id))result.push({id,label:id});
  return result;
}
function topicIds(book,data){return T.entryTopics('book',book);}
function seriesGroup(book,data){
  const source=data.sources.find(source=>source.id===book.studyGuide?.sourceId),level=source?.level||'';
  return {id:JSON.stringify([book.resource?.id||book.resourceId,book.seriesTitle||'',normalize(level)]),
    label:[book.seriesTitle||book.resource.title,level.toUpperCase()].filter(Boolean).join(' ')};
}
function seriesGroups(books,data){
  const groups=new Map();
  for(const book of books){
    const group=seriesGroup(book,data);
    if(!groups.has(group.id))groups.set(group.id,{...group,count:0});
    groups.get(group.id).count++;
  }
  return [...groups.values()];
}
function seriesFilter(books,{edition='all',topic='all',subtopic='all'}={}){
  return books.filter(book=>(edition==='all'||book.edition===edition)&&T.matches(T.entryTopics('book',book),{topic,subtopic}));
}
// 参考目录只按当前引用的公共级别取候选，不据此绑定版次、虚构子集或阶段分母。
function referenceBooks(books,resource,model,materials){
  const levels=model.getMaterialLevels({resource,materials});
  return books.filter(book=>(book.resourceIds||[book.resourceId]).includes(resource.id)&&(!levels.length||model.getMaterialLevels({resource,materials:[{level:book.level}]}).some(level=>levels.some(own=>own.id===level.id))));
}
// 数量参考只说明已核出版信息，不能把整级或另一版的数量当作路线选材分母。
function quantityReference(data,resource,model,catalog,materials){
  const restricted=(materials||[]).some(material=>qualified(material.level));
  const plain=(materials||[]).map(material=>String(material.level||'').replace(/[（(][^）)]*[）)]/g,'').trim()).filter(Boolean);
  const matching=model.publicationLevelScopes(catalog,resource.id,plain);
  const summarize=scopes=>levelGroups(scopes.flatMap(scope=>scope.parts.map(part=>({...part,edition:scope.edition,unit:scope.unit||'本'}))));
  const groups=summarize(matching);
  if(groups.length){
    const totals=[...new Set(groups.map(group=>group.total))];
    return {label:(restricted?'整级':'已核')+totals.join('／')+'本',note:groups.map(group=>group.edition+'：'+group.groups.map(part=>part.label+' '+part.count+'本').join('、')).join('；')+'。'+(restricted?'本阶段只取其中子集，逐册范围尚未对应；整级数量不计作进度分母。':'原路线级别与出版目录尚未绑定，不计作进度分母。'),gap:restricted?'子集待对应':'级别待对应'};
  }
  const books=referenceBooks(data.books,resource,model,materials);
  if(books.length)return {label:'已收录'+books.length+'本',note:'当前对应级别的参考书目收录数；尚未核定出版全集与本阶段选材范围，不是进度分母。',gap:restricted?'子集待对应':'选本待对应'};
  const publications=summarize(model.publicationScopes(catalog,resource.id));
  if(publications.length){
    const totals=[...new Set(publications.map(group=>group.total))];
    return {label:publications.length===1?'套装'+totals[0]+'本':totals.length===1?publications.length+'套各'+totals[0]+'本':totals.join('／')+'本（不同套装）',note:publications.map(group=>group.edition+'：'+group.total+'本').join('；')+'。已核套装册数，尚缺原路线级别与这些目录的逐册对应，不计作阶段进度分母。',gap:'级别待对应'};
  }
  return {label:'总册数待补',note:'尚未取得该引用范围可核实的册数，不将级别、季数或其他版本换算为本阶段总数。',gap:''};
}
const membershipCache=new WeakMap();
function explicitMembership(book,resource,appearance,model,volumes){
  if(!volumes)return null;
  let cache=membershipCache.get(volumes);
  if(!cache){cache=new Map();membershipCache.set(volumes,cache);}
  const key=JSON.stringify([resource.id,appearance.stageId,appearance.level]);
  if(!cache.has(key)){
    const levels=[appearance.level,...model.getMaterialLevels({resource,materials:[appearance]}).map(level=>level.label)];
    cache.set(key,levels.flatMap(level=>model.publicationLevelScopes(volumes,resource.id,[level],appearance.stageId)).flatMap(scope=>scope.parts.map(part=>part.directoryMatch).filter(match=>match?.bookIds)));
  }
  const matches=cache.get(key);
  return matches.length?matches.some(match=>['edition','level'].every(field=>match[field]===undefined||book[field]===match[field])&&match.bookIds.includes(book.id)):null;
}
function bookAppearances(book,resource,model,volumes){
  if(book.custom)return book.stageRefs||[];
  // 逐册级别来自具体版本目录；未标级别的原文只能关联套系，不能补造逐册阶段。
  const restrictions=book.stageIds;
  return (resource?.appearances||[]).filter(a=>{
    if(restrictions)return restrictions.includes(a.stageId);
    // 已核具名目录的显式成员优先；原表参考标记不能挡住后续补证的同一单册。
    const member=explicitMembership(book,resource,a,model,volumes);
    if(member!==null)return member;
    if(book.editionMatch==='reference-only')return false;
    if(book.editionMatch==='unleveled-only')return !a.level&&!!book.unleveledSeries;
    // 整级目录不证明单册属于作者指定的虚构／挑选子集。
    if(qualified(a.level)&&!book.qualifier)return false;
    if(!a.level&&book.unleveledSeries)return true;
    if(!book.level)return !a.level;
    const own=model.getMaterialLevels({resource,materials:[{level:book.level}]}),other=model.getMaterialLevels({resource,materials:[a]});
    return own.length>0&&other.some(t=>own.some(o=>o.id===t.id))&&(!book.qualifier||String(a.level).includes(book.qualifier));
  });
}
function entries(data,resources,model,volumes){
  const identity=id=>model.publicationEntry(volumes,id)?.catalogResourceId||id,bySeries=new Map();
  for(const resource of resources){
    const id=identity(resource.id);
    if(!bySeries.has(id))bySeries.set(id,[]);
    bySeries.get(id).push(resource);
  }
  // 同一公共目录只生成一条单册；别名入口共享身份、引用和完成记录。
  return data.books.filter(book=>bySeries.has(identity(book.resourceId))).map(book=>{
    const references=bySeries.get(identity(book.resourceId)),resource=references.find(r=>r.id===book.resourceId)||references[0];
    return {...book,resource,resourceIds:[...new Set(references.flatMap(r=>[r.id,...(r.mergedResourceIds||[])]))],appearances:references.flatMap(r=>bookAppearances(book,r,model,volumes))};
  })
    .concat(resources.filter(r=>r.custom&&['book','reader'].includes(r.type)).map(r=>({id:r.id,resourceId:r.id,resourceIds:[r.id],title:r.title,custom:true,resource:r,topics:r.topics,edition:'个人新增',level:'',appearances:r.stageRefs||[],sourceIds:[]})));
}
function filter(books,data,filters={}){
  const query=normalize(filters.query);
  return books.filter(book=>{
    const resource=book.resource;
    if(filters.route&&filters.route!=='all'&&(filters.route==='other'?!book.custom:!book.appearances.some(a=>a.routeId===filters.route)))return false;
    if(filters.stageIds&&!book.appearances.some(a=>filters.stageIds.includes(a.stageId)&&(!filters.route||['all','other'].includes(filters.route)||a.routeId===filters.route)))return false;
    if(!T.matches(topicIds(book,data),{topic:filters.topic||'all',subtopic:filters.subtopic||'all'}))return false;
    if(filters.series&&filters.series!=='all'&&seriesGroup(book,data).id!==filters.series)return false;
    if(filters.type&&filters.type!=='all'&&resource.type!==filters.type)return false;
    if(filters.sharedOnly&&new Set(book.appearances.map(a=>a.routeId)).size<2)return false;
    if(query&&!normalize([book.title,...(book.aliases||[]),book.edition,book.level,resource.title,...(resource.aliases||[]),...T.labels(T.expand(topicIds(book,data))),...(book.topics||[]).map(id=>data.topics.find(t=>t.id===id)?.label||id)].join(' ')).includes(query))return false;
    return true;
  });
}
function seriesCount(data,resource,model,volumes,filters={}){
  const route=filters.route,stageIds=filters.stageIds;
  const narrowed=!!(route&&route!=='all'||stageIds);
  const appearances=(resource.appearances||[]).filter(a=>(!route||route==='all'||a.routeId===route)&&(!stageIds||stageIds.includes(a.stageId)));
  const allBooks=entries(data,[resource],model,volumes);
  let books=filter(allBooks,data,{route,stageIds});
  const entry=model.publicationEntry(volumes,resource.id),unit=entry?.unit||(['book','reader'].includes(resource.type)?'本':resource.type==='animation'?'集':resource.type==='song'?'首':resource.type==='flashcard'?'张':'个');
  const levels=level=>model.getMaterialLevels({resource,materials:[{level}]}).map(x=>x.id);
  const parts=new Map(),covered=new Set(),selectionByAppearance=new Map();
  if(narrowed)for(const selection of filters.selections||[])for(const a of appearances){
    if(a.routeId===selection.routeId&&a.stageId===selection.stageId)selectionByAppearance.set(a,selection);
  }
  const scopes=entry?.scopes||[];
  for(const scope of scopes){
    // 全部素材可汇总已核出版版本；路线筛选只接受已对应或用户实际选用的版本。
    const references=model.publicationBindings(volumes,resource.id,scope.id);
    if(scope.referenceOnly&&narrowed&&!appearances.some(a=>references.some(ref=>ref.stageId===a.stageId)))continue;
    // 同版小包已包含在完整目录内，未筛选汇总只计一次；保留小包供精确选级。
    if(!narrowed&&(scope.includedIn||[]).some(id=>scopes.some(s=>s.id===id)))continue;
    const scopeLevel=normalize(scope.level),scopeTokens=levels(scope.level);
    for(const part of scope.parts){
      const partTokens=levels(part.level||part.label),matching=[];
      for(const a of appearances){
        if(scope.referenceOnly&&narrowed&&!references.some(ref=>ref.stageId===a.stageId))continue;
        if(selectionByAppearance.has(a))continue;
        if(!a.level){matching.push(a);continue;}
        // 原文只挑虚构或某个子集时，不能借整级册数充当该子集总量。
        const own=levels(a.level),exact=normalize(a.level)===scopeLevel||(scope.levelAliases||[]).some(alias=>normalize(alias)===normalize(a.level));
        if(qualified(a.level)&&!exact)continue;
        const tokens=partTokens.length?partTokens:scopeTokens;
        if(exact||own.length&&tokens.length&&tokens.every(t=>own.includes(t))){matching.push(a);}
      }
      if(narrowed&&!matching.length)continue;
      const edition=scope.edition||entry.edition||'',key=JSON.stringify([edition,normalize(part.label),scope.unit||unit]);
      if(!parts.has(key))parts.set(key,{edition,label:part.label,count:part.count,unit:scope.unit||unit,source:'quantity',sourceIds:[],sources:entry.sources||[],displayEdition:scope.displayEdition,group:part.group||scope.displayGroup||'',levelIds:[]});
      const component=parts.get(key);
      component.levelIds=[...new Set(component.levelIds.concat(partTokens.length?partTokens:scopeTokens.length===1?scopeTokens:[]))];
      for(const a of matching){
        const own=levels(a.level);
        if(!a.level||normalize(a.level)===scopeLevel||(scope.levelAliases||[]).some(alias=>normalize(alias)===normalize(a.level)))covered.add(a);
        else if(own.length&&own.every(t=>[...parts.values()].some(p=>p.edition===edition&&levels(p.label).includes(t))))covered.add(a);
      }
    }
  }
  for(const a of appearances){
    const own=levels(a.level);
    if(!selectionByAppearance.has(a)&&!qualified(a.level)&&own.length&&own.every(t=>[...parts.values()].some(p=>p.levelIds.includes(t))))covered.add(a);
  }
  if(selectionByAppearance.size){
    const selectedBooks=new Set();
    for(const [a,selection]of selectionByAppearance){
      covered.add(a);
      for(const part of selection.parts){
        const key=JSON.stringify([part.edition,normalize(part.label),part.unit||unit]);
        parts.set(key,{...part,unit:part.unit||unit,source:'selection',levelIds:[],sourceIds:[],sources:entry?.sources||[]});
        if(part.directoryMatch)for(const book of allBooks){
          if(['edition','level'].every(key=>part.directoryMatch[key]===undefined||book[key]===part.directoryMatch[key])&&(!part.directoryMatch.bookIds||part.directoryMatch.bookIds.includes(book.id)))selectedBooks.add(book);
        }
      }
    }
    books=allBooks.filter(book=>selectedBooks.has(book)||books.includes(book)&&book.appearances.some(a=>appearances.includes(a)&&!selectionByAppearance.has(a)));
  }
  // 已有数量来源时以其版本、分项为准，逐册目录只用于展示覆盖，不重复相加。
  if(!entry?.scopes?.length&&!selectionByAppearance.size){
    const groups=new Map();
    for(const book of (narrowed?books:allBooks)){
      const group=groups.get(book.edition)||{edition:book.edition,label:'当前收录目录',count:0,unit:'本',source:'directory',sourceIds:[]};
      group.count++;group.sourceIds=[...new Set(group.sourceIds.concat(book.sourceIds||[]))];groups.set(book.edition,group);
      for(const a of book.appearances)if(appearances.includes(a))covered.add(a);
    }
    for(const [key,value]of groups)parts.set(key,value);
  }
  // 原文明确写出“24本”等封闭数量时可直接采用，不从级别数字推断册数。
  for(const a of appearances){
    if(covered.has(a))continue;
    const match=String(a.level||'').match(/^\s*(\d+)\s*(本|册|集|张|首)\s*$/);
    if(!match)continue;
    const partUnit=match[2]==='册'?'本':match[2],key=JSON.stringify(['source-count',a.sourceId,Number(match[1]),partUnit]);
    parts.set(key,{edition:'路线原文明确数量',label:a.level,count:Number(match[1]),unit:partUnit,source:'route',sourceIds:[a.sourceId]});covered.add(a);
  }
  const unknown=[...new Set(appearances.filter(a=>!covered.has(a)).map(a=>a.level||'未限定级别／版本'))];
  const components=[...parts.values()].filter(p=>p.unit===unit);
  const basis=components.length&&components.every(p=>p.source==='directory')?'directory':components.length&&components.every(p=>p.source==='selection')?'selection':'known-range';
  return {total:components.reduce((n,p)=>n+p.count,0),unit,parts:components,unknown,partial:unknown.length>0,narrowed,basis,books,allBooks};
}
function levelGroups(parts){
  const editions=new Map(),seen=new Set();
  for(const part of parts){
    const identity=JSON.stringify([part.edition,normalize(part.label),part.unit]);
    if(seen.has(identity))continue;
    seen.add(identity);
    const displayEdition=part.displayEdition||part.edition,editionKey=JSON.stringify([displayEdition,part.unit]);
    if(!editions.has(editionKey))editions.set(editionKey,{edition:displayEdition,unit:part.unit,total:0,groups:[]});
    const edition=editions.get(editionKey),label=part.group||part.label;
    let group=edition.groups.find(g=>g.label===label);
    if(!group){group={label,count:0,parts:[]};edition.groups.push(group);}
    group.count+=part.count;group.parts.push(part);edition.total+=part.count;
  }
  return [...editions.values()];
}
return {normalize,topics,topicIds,seriesGroup,seriesGroups,seriesFilter,referenceBooks,quantityReference,bookAppearances,entries,filter,seriesCount,levelGroups};
});
