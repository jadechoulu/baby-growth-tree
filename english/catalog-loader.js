/* 普通站点按需读取公共书目；离线单文件仍使用内嵌目录。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishCatalogLoader=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
function needsBooks(view,collection){return !['baby','sources'].includes(view)&&!(view==='library'&&['hello','liao'].includes(collection));}
function create(target,url,fetcher,{timeout=30000}={}){
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
      if(!data||!Array.isArray(data.books)||!Array.isArray(data.sources))throw new Error('书目数据不完整，请重试。');
      return data;})();
      let data;try{data=await Promise.race([read,expired]);}finally{clearTimeout(timer);}
      Object.assign(target,data);ready=true;return target;
    })().catch(error=>{pending=null;throw error;});
    return pending;
  }};
}
return {create,needsBooks};
});
