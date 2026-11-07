/* 小花生原站读取：仅完整、已登录且逐页核对的读过书架可进入公共导入模型。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishXiaohuashengSync=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const ORIGIN='https://www.xiaohuasheng.cn',LOGIN_URL=ORIGIN;
class SyncError extends Error{constructor(code,message){super(message);this.name='SyncError';this.code=code;this.loginUrl=LOGIN_URL;}}
const fail=(code,message)=>{throw new SyncError(code,message);};
function sourceUrl(value,base=ORIGIN){
  let url;try{url=new URL(value,base);}catch{fail('INVALID_SOURCE','小花生返回的来源地址无效。');}
  // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 账号和分页只接受小花生原站，不能把响应地址改为任意代理。
  if(url.origin!==ORIGIN||url.username||url.password)fail('INVALID_SOURCE','小花生返回了非原站地址，未更新进度。');
  return url;
}
function parsePage(html,url){
  if(typeof DOMParser==='undefined')fail('CONNECTION_UNAVAILABLE','当前环境无法解析小花生页面。');
  const doc=new DOMParser().parseFromString(html,'text/html'),page=sourceUrl(url);
  const links=[...doc.querySelectorAll('a[href]')];
  const authenticated=links.some(link=>/loginOut\s*\(/i.test(link.getAttribute('onclick')||'')||/^\/(?:Account\/LoginOut)(?:[/?#]|$)/i.test(link.getAttribute('href')||''));
  const ids=new Set(links.flatMap(link=>{const path=link.getAttribute('href')||'',match=path.match(/^\/bookcase\/user_(\d+)(?:\/|$)/);return match?[match[1]]:[];}));
  const own=page.pathname.match(/^\/(?:myblog|user_\d+)\/?$/),bookcase=page.pathname.match(/^\/bookcase\/user_(\d+)\/tag_-6(?:\/page_(\d+))?\/?$/);
  const accountId=bookcase?.[1]||(own&&ids.size===1?[...ids][0]:null);
  const title=doc.querySelector('.book_case_title')?.textContent||'';
  const count=title.match(/共\s*([\d,]+)\s*本/);
  // 原站可能把匿名请求退回整个书架；必须实际标注读过分类，不能仅凭请求URL认定。
  const isReadCategory=/读过/.test(title);
  const container=doc.querySelector('.like_books'),books=new Map();
  for(const link of container?.querySelectorAll('a[href]')||[]){
    const href=link.getAttribute('href')||'',match=href.match(/^\/book\/([a-zA-Z0-9_-]+)\/?$/);if(!match)continue;
    const name=(link.getAttribute('title')||link.textContent||'').trim();
    if(!name)fail('INCOMPLETE','小花生有书目缺少标题，未更新进度。');
    const previous=books.get(match[1]);if(previous&&previous.title!==name)fail('INCOMPLETE','同一书目出现不同标题，未更新进度。');
    books.set(match[1],{bookId:match[1],title:name,url:ORIGIN+href});
  }
  const pages=links.map(link=>link.getAttribute('href')).filter(href=>/^\/bookcase\/user_\d+\/tag_-6\/page_\d+\/?$/.test(href||''));
  return {authenticated,accountId,isReadCategory,advertisedCount:count?Number(count[1].replaceAll(',','')):null,books:[...books.values()],pages};
}
async function read(options={}){
  const fetchPage=options.fetch||globalThis.fetch,parse=options.parsePage||parsePage,now=options.now||Date.now;
  if(typeof fetchPage!=='function')fail('CONNECTION_UNAVAILABLE','当前环境无法连接小花生。');
  async function load(address){
    const requested=sourceUrl(address);let response;
    const controller=new AbortController(),abort=()=>controller.abort();
    if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,20000);
    try{
      // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 仅由浏览器携带原站会话，不读取、复制或持久化Cookie及登录凭据。
      response=await fetchPage(requested.href,{credentials:'include',signal:controller.signal,redirect:'follow',cache:'no-store'});
    const final=sourceUrl(response.url||requested.href);
    if(response.status===401||response.status===403)fail('AUTH_REQUIRED','请先前往小花生登录，再回来重新同步。');
    if(!response.ok)fail('CONNECTION_UNAVAILABLE','小花生暂未返回可读取的数据，未更新进度。');
    let html;try{html=await response.text();}catch{fail('CONNECTION_UNAVAILABLE','小花生页面读取中断，未更新进度。');}
    return {url:final,page:parse(html,final.href)};
    }catch(error){
      if(error instanceof SyncError)throw error;
      if(error?.name==='AbortError')fail('CONNECTION_UNAVAILABLE','读取小花生已超时或取消，请重试；原进度保留。');
      fail('CONNECTION_UNAVAILABLE','无法读取小花生原站；浏览器跨站限制或网络异常，未更新进度。');
    }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
  }
  const home=await load(ORIGIN+'/myblog');
  // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 本人账号必须来自已登录主页，不能以调用方传入的ID或公开书架充当本人。
  if(!home.page.authenticated)fail('AUTH_REQUIRED','请先前往小花生登录，再回来重新同步。');
  const accountId=String(home.page.accountId||'');
  if(!/^\d+$/.test(accountId))fail('INCOMPLETE','尚未从小花生本人主页确认书架，未更新进度。');
  const base=ORIGIN+'/bookcase/user_'+accountId+'/tag_-6',queue=[base],visited=new Set(),books=new Map(),pageCounts=[];let advertisedCount=null;
  for(let cursor=0;cursor<queue.length;cursor++){
    const address=queue[cursor];if(visited.has(address))continue;
    const result=await load(address),page=result.page;
    if(!page.authenticated)fail('AUTH_REQUIRED','小花生登录已失效，请登录后重试；原进度保留。');
    if(String(page.accountId)!==accountId||!page.isReadCategory)fail('INCOMPLETE','小花生返回的不是本人的读过分类，未更新进度。');
    if(!Number.isSafeInteger(page.advertisedCount)||page.advertisedCount<0)fail('INCOMPLETE','无法确认小花生读过总量，未更新进度。');
    if(advertisedCount!==null&&advertisedCount!==page.advertisedCount)fail('INCOMPLETE','同步期间书架总量变化，请重新同步；原进度保留。');
    advertisedCount=page.advertisedCount;
    const final=result.url.pathname.match(/^\/bookcase\/user_(\d+)\/tag_-6(?:\/page_(\d+))?\/?$/);
    const expected=sourceUrl(address).pathname.match(/\/page_(\d+)\/?$/)?.[1]||'1';
    if(!final||final[1]!==accountId||(final[2]||'1')!==expected)fail('INCOMPLETE','小花生分页跳转不完整，未更新进度。');
    const local=new Set();
    for(const book of page.books||[]){
      if(!/^[a-zA-Z0-9_-]{1,80}$/.test(book.bookId||'')||typeof book.title!=='string'||!book.title.trim())fail('INCOMPLETE','小花生书目资料不完整，未更新进度。');
      const previous=books.get(book.bookId);if(previous&&previous.title!==book.title)fail('INCOMPLETE','分页中书目标题冲突，未更新进度。');
      books.set(book.bookId,{bookId:book.bookId,title:book.title,url:ORIGIN+'/book/'+book.bookId});local.add(book.bookId);
    }
    visited.add(address);pageCounts.push({url:address,uniqueCount:local.size});
    for(const href of page.pages||[]){
      const link=sourceUrl(href,result.url.href),match=link.pathname.match(/^\/bookcase\/user_(\d+)\/tag_-6\/page_([1-9]\d*)\/?$/);
      if(!match||match[1]!==accountId||link.search||link.hash)fail('INVALID_SOURCE','小花生分页来源不一致，未更新进度。');
      if(!queue.includes(link.href))queue.push(link.href);
    }
    options.onProgress?.({visitedPages:visited.size,discoveredPages:queue.length,books:books.size});
  }
  if(advertisedCount===0&&books.size===0)fail('EMPTY','小花生读过清单为空，请核对登录账号后再次同步；原进度保留。');
  if(books.size!==advertisedCount||visited.size!==queue.length||pageCounts.some(page=>page.uniqueCount===0))fail('INCOMPLETE','小花生书目数量或分页不完整，未更新进度。');
  const fetchedAt=new Date(now()).toISOString();
  return {schemaVersion:1,sourceKind:'xiaohuasheng_bookcase_read',snapshotId:'xiaohuasheng-'+accountId+'-'+fetchedAt,fetchedAt,accountId,sourceUrl:base,authenticated:true,complete:true,advertisedCount,actualUniqueCount:books.size,pages:pageCounts,books:[...books.values()]};
}
return {LOGIN_URL,SyncError,parsePage,read};
});
