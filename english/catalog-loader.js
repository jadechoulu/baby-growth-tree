/* 普通站点按需读取公共书目；离线单文件仍使用内嵌目录。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishCatalogLoader=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
function create(target,url,fetcher){
  let ready=!url,pending=null;
  return {get ready(){return ready;},load(){
    if(ready)return Promise.resolve(target);
    if(!pending)pending=(async()=>{
      const response=await fetcher(url);
      if(!response.ok)throw new Error('书目暂时未能加载，请重试。');
      const data=await response.json();
      if(!data||!Array.isArray(data.books)||!Array.isArray(data.sources))throw new Error('书目数据不完整，请重试。');
      Object.assign(target,data);ready=true;return target;
    })().catch(error=>{pending=null;throw error;});
    return pending;
  }};
}
return {create};
});
