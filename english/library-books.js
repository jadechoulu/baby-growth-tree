(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishLibraryBooks=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ').trim();
function topics(data,custom=[]){
  const result=data.topics.map(t=>({...t}));
  for(const book of custom)for(const name of book.topics||[])if(!result.some(t=>t.id===name||t.label===name))result.push({id:name,label:name});
  return result;
}
function topicIds(book,data){return (book.topics||[]).map(value=>data.topics.find(t=>t.id===value||t.label===value)?.id||value);}
function bookAppearances(book,resource,model){
  if(book.custom)return book.stageRefs||[];
  // 逐册级别来自具体版本目录；未标级别的原文只能关联套系，不能补造逐册阶段。
  const restrictions=book.stageIds;
  return (resource?.appearances||[]).filter(a=>{
    if(restrictions)return restrictions.includes(a.stageId);
    if(book.editionMatch==='reference-only')return false;
    if(book.editionMatch==='unleveled-only')return !a.level&&!!book.unleveledSeries;
    if(!a.level&&book.unleveledSeries)return true;
    if(!book.level)return !a.level;
    const own=model.getMaterialLevels({resource,materials:[{level:book.level}]}),other=model.getMaterialLevels({resource,materials:[a]});
    return own.length>0&&other.some(t=>own.some(o=>o.id===t.id))&&(!book.qualifier||String(a.level).includes(book.qualifier));
  });
}
function entries(data,resources,model){
  const byId=new Map(resources.map(r=>[r.id,r]));
  return data.books.filter(book=>byId.has(book.resourceId)).map(book=>({...book,resource:byId.get(book.resourceId),appearances:bookAppearances(book,byId.get(book.resourceId),model)}))
    .concat(resources.filter(r=>r.custom&&['book','reader'].includes(r.type)).map(r=>({id:r.id,resourceId:r.id,title:r.title,custom:true,resource:r,topics:r.topics,edition:'个人新增',level:'',appearances:r.stageRefs||[],sourceIds:[]})));
}
function filter(books,data,filters={}){
  const query=normalize(filters.query);
  return books.filter(book=>{
    const resource=book.resource;
    if(filters.route&&filters.route!=='all'&&(filters.route==='other'?!book.custom:!book.appearances.some(a=>a.routeId===filters.route)))return false;
    if(filters.stageIds&&!book.appearances.some(a=>filters.stageIds.includes(a.stageId)&&(!filters.route||['all','other'].includes(filters.route)||a.routeId===filters.route)))return false;
    if(filters.topic&&filters.topic!=='all'&&!topicIds(book,data).includes(filters.topic))return false;
    if(filters.type&&filters.type!=='all'&&resource.type!==filters.type)return false;
    if(filters.favoriteIds&&!filters.favoriteIds.includes(resource.id))return false;
    if(filters.sharedOnly&&new Set(book.appearances.map(a=>a.routeId)).size<2)return false;
    if(query&&!normalize([book.title,book.edition,book.level,resource.title,...(resource.aliases||[]),...(book.topics||[]).map(id=>data.topics.find(t=>t.id===id)?.label||id)].join(' ')).includes(query))return false;
    return true;
  });
}
function seriesCount(data,resource,model,volumes,filters={}){
  const route=filters.route,stageIds=filters.stageIds;
  const narrowed=!!(route&&route!=='all'||stageIds);
  const appearances=(resource.appearances||[]).filter(a=>(!route||route==='all'||a.routeId===route)&&(!stageIds||stageIds.includes(a.stageId)));
  const allBooks=entries(data,[resource],model);
  let books=filter(allBooks,data,{route,stageIds});
  const entry=volumes?.series?.find(s=>s.resourceId===resource.id),unit=entry?.unit||(['book','reader'].includes(resource.type)?'本':resource.type==='animation'?'集':resource.type==='song'?'首':resource.type==='flashcard'?'张':'个');
  const levels=level=>model.getMaterialLevels({resource,materials:[{level}]}).map(x=>x.id);
  const qualified=level=>/[（(][^）)]*(?:虚构|挑选|部分|复习|版)[^）)]*[）)]/.test(level||'');
  const parts=new Map(),covered=new Set(),selectionByAppearance=new Map();
  if(narrowed)for(const selection of filters.selections||[])for(const a of appearances){
    if(a.routeId===selection.routeId&&a.stageId===selection.stageId)selectionByAppearance.set(a,selection);
  }
  for(const scope of entry?.scopes||[]){
    // 全部素材可汇总已核出版版本；路线筛选只接受已对应或用户实际选用的版本。
    if(scope.referenceOnly&&narrowed)continue;
    const scopeLevel=normalize(scope.level),scopeTokens=levels(scope.level);
    for(const part of scope.parts){
      const partTokens=levels(part.label),matching=[];
      for(const a of appearances){
        if(scope.stageIds&&!scope.stageIds.includes(a.stageId))continue;
        if(selectionByAppearance.has(a))continue;
        if(!a.level){matching.push(a);continue;}
        // 原文只挑虚构或某个子集时，不能借整级册数充当该子集总量。
        if(qualified(a.level)&&normalize(a.level)!==scopeLevel)continue;
        const own=levels(a.level),exact=normalize(a.level)===scopeLevel;
        const tokens=partTokens.length?partTokens:scopeTokens;
        if(exact&&(!partTokens.length||!own.length||partTokens.some(t=>own.includes(t)))||own.length&&tokens.length&&tokens.every(t=>own.includes(t))){matching.push(a);}
      }
      if((narrowed||scope.stageIds)&&!matching.length)continue;
      const edition=scope.edition||entry.edition||'',key=JSON.stringify([edition,normalize(part.label),scope.unit||unit]);
      if(!parts.has(key))parts.set(key,{edition,label:part.label,count:part.count,unit:scope.unit||unit,source:'quantity',sourceIds:[],sources:entry.sources||[],levelIds:[]});
      const component=parts.get(key);
      component.levelIds=[...new Set(component.levelIds.concat(partTokens.length?partTokens:scopeTokens.length===1?scopeTokens:[]))];
      for(const a of matching){
        const own=levels(a.level);
        if(!a.level||normalize(a.level)===scopeLevel)covered.add(a);
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
          if(book.edition===part.directoryMatch.edition&&(!part.directoryMatch.level||book.level===part.directoryMatch.level))selectedBooks.add(book);
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
return {normalize,topics,topicIds,bookAppearances,entries,filter,seriesCount};
});
