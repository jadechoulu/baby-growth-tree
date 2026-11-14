/* 普通站点按需读取公共书目；离线单文件仍使用内嵌目录。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishCatalogLoader=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
function needsBooks(view,collection){return ['qing-progress','xu-progress'].includes(view)||(view==='library'&&!['hello','liao'].includes(collection));}
function create(target,url,fetcher,{timeout=30000,validate=data=>data&&Array.isArray(data.books)&&Array.isArray(data.sources),apply=data=>Object.assign(target,data)}={}){
  let ready=!url,pending=null;
  return {get ready(){return ready;},load(){
    if(ready)return Promise.resolve(target);
    if(!pending)pending=(async()=>{
      const controller=new AbortController();
      let timer;
      const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('书目加载超时，请重试。'));},timeout);});
      const read=(async()=>{const response=await fetcher(url,{signal:controller.signal});
      if(!response.ok)throw new Error('书目暂时未能加载，请重试。');
      const data=await response.json();
      if(!validate(data))throw new Error('资料数据不完整，请重试。');
      return data;})();
      let data;try{data=await Promise.race([read,expired]);}finally{clearTimeout(timer);}
      apply(data);ready=true;return target;
    })().catch(error=>{pending=null;throw error;});
    return pending;
  }};
}
function details(directory,taxonomy,fetcher){
  const chunks=new Map();
  return id=>{
    const book=directory.books.find(book=>book.id===id),url=directory.detailFiles?.[book?.detailChunk];
    if(!url)return create({},null,fetcher);
    if(!chunks.has(url))chunks.set(url,create({},url,fetcher,{validate:data=>Array.isArray(data?.books)&&data.books.every(item=>directory.books.some(book=>book.id===item.id)),apply:data=>{
      for(const item of data.books)Object.assign(directory.books.find(book=>book.id===item.id),item);
      Object.assign(taxonomy.bookOverrides,data.topics);
    }}));
    return chunks.get(url);
  };
}
function resourceTopics(taxonomy,url,fetcher){
  const target=taxonomy.resourceMappings||={};
  return create(target,url,fetcher,{
    validate:data=>data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(target).length===Object.keys(data).length&&Object.keys(target).every(id=>Array.isArray(data[id]?.topics)),
    apply:data=>{for(const [id,item]of Object.entries(data))Object.assign(target[id],item);}
  });
}
return {create,needsBooks,details,resourceTopics};
});
