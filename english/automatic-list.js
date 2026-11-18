(function(root){
'use strict';
// 所有分页入口共用尾标；IntersectionObserver 会同时考虑页面和弹窗祖先的滚动裁剪。
function createManager(env){
  const doc=env.document,entries=new Map();
  let frame=null,watching=false;
  function visible(node){
    if(!node.isConnected||node.closest('[hidden],[inert]')||!node.getClientRects().length)return false;
    for(let parent=node.parentElement;parent;parent=parent.parentElement){
      if(parent.tagName==='DETAILS'&&!parent.open)return false;
    }
    return true;
  }
  function release(node){entries.delete(node);observer?.unobserve(node);}
  async function advance(node){
    const entry=entries.get(node);
    if(!entry||entry.busy||!visible(node))return;
    entry.busy=true;node.setAttribute('aria-busy','true');
    try{
      // 筛选、关闭或重绘可以在同一轮移除尾标，迟到回调不再推进旧列表。
      await Promise.resolve();
      if(!visible(node)){entry.busy=false;return;}
      await entry.load(node);
      release(node);
    }catch{
      release(node);
      if(node.isConnected){
        node.textContent='加载失败，';
        const retry=doc.createElement('button');retry.type='button';retry.textContent='重试';
        retry.onclick=()=>{node.textContent='加载更多...';entries.set(node,{load:entry.load,busy:false});advance(node);};
        node.append(retry);
      }
    }finally{node.removeAttribute('aria-busy');schedule();}
  }
  const observer=env.IntersectionObserver?new env.IntersectionObserver(changes=>{
    for(const change of changes)if(change.isIntersecting)advance(change.target);
  },{rootMargin:'160px 0px'}):null;
  function scan(){
    frame=null;
    for(const [node,entry] of entries){
      if(!node.isConnected){release(node);continue;}
      if(entry.busy||!visible(node))continue;
      if(observer){observer.unobserve(node);observer.observe(node);}
      else{
        // 旧浏览器仍支持页面及嵌套弹窗滚动，不退回需要点击的分页按钮。
        const rect=node.getBoundingClientRect();let top=0,bottom=env.innerHeight;
        for(let parent=node.parentElement;parent;parent=parent.parentElement){
          if(/auto|scroll|hidden|clip/.test(env.getComputedStyle(parent).overflowY)){
            const clip=parent.getBoundingClientRect();top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);
          }
        }
        if(rect.top<=bottom+160&&rect.bottom>=top)advance(node);
      }
    }
    if(!entries.size&&watching){mutations.disconnect();doc.removeEventListener('scroll',schedule,true);env.removeEventListener('resize',schedule);watching=false;}
  }
  const mutations=new env.MutationObserver(schedule);
  function schedule(){if(frame===null)frame=env.requestAnimationFrame(scan);}
  function create({hasMore,load}){
    const node=doc.createElement('div');node.className='auto-load-status';node.setAttribute('role','status');
    node.textContent=hasMore?'加载更多...':'全部加载完成';
    if(hasMore){
      entries.set(node,{load,busy:false});
      if(!watching){
        mutations.observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','inert']});
        doc.addEventListener('scroll',schedule,true);env.addEventListener('resize',schedule);watching=true;
      }
      schedule();
    }
    return node;
  }
  return {create};
}
let manager;
function tail({total,limit,step,load}){
  const host=root.document.createElement('div');
  function update(){host.replaceChildren(api.create({hasMore:limit<total,load:async()=>{
    const next=Math.min(total,limit+step);await load(limit,next);limit=next;update();
  }}));}
  update();return host;
}
const api={create:options=>(manager??=createManager(root)).create(options),tail,createManager};
if(typeof module==='object'&&module.exports)module.exports=api;
root.EnglishAutomaticList=api;
})(typeof window==='object'?window:globalThis);
