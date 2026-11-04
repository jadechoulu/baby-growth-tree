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
return {normalize,topics,topicIds,bookAppearances,entries,filter};
});
