const test=require('node:test');
const assert=require('node:assert/strict');
const X=require('../xiaohuasheng-sync.js');
const B=require('../book-progress.js');
const origin='https://www.xiaohuasheng.cn',base=origin+'/bookcase/user_42/tag_-6';
const book=(id,title)=>({bookId:id,title});
const home={authenticated:true,accountId:'42'};
const page=(books,pages=[],extra={})=>({authenticated:true,accountId:'42',isReadCategory:true,advertisedCount:3,books,pages,...extra});
function client(pages){
  const calls=[];
  return {calls,parsePage:JSON.parse,fetch:async(url,options)=>{calls.push({url,options});const value=pages[url];if(value instanceof Error)throw value;if(!value)throw Error('unexpected url');return {ok:value.ok!==false,status:value.status||200,url:value.url||url,text:async()=>JSON.stringify(value)};}};
}
test('发现本人书架与全部动态分页，双链接去重后返回导入器可用的完整快照',async()=>{
  const c=client({[origin+'/myblog']:home,[base]:page([book('a','One'),book('a','One')],[base+'/page_2']),[base+'/page_2']:page([book('b','Two'),book('c','Three')],[base+'/page_2'])});
  const result=await X.read({...c,now:()=>Date.parse('2026-11-07T00:00:00Z')});
  assert.equal(result.complete,true);assert.equal(result.authenticated,true);assert.equal(result.actualUniqueCount,3);assert.equal(result.pages.length,2);
  assert.equal(result.accountId,'42');assert.deepEqual(result.books.map(b=>b.bookId),['a','b','c']);
  assert.ok(c.calls.every(call=>call.options.credentials==='include'));
  assert.doesNotThrow(()=>B.applyReadSnapshot({}, {plans:[]}, result));
});
test('网络或CORS错误与未登录严格区分，不把匿名公开书架当本人',async()=>{
  await assert.rejects(X.read({fetch:async()=>{throw TypeError('Failed to fetch');}}),error=>error.code==='CONNECTION_UNAVAILABLE');
  const c=client({[origin+'/myblog']:{authenticated:false,accountId:'42'}});
  await assert.rejects(X.read(c),error=>error.code==='AUTH_REQUIRED'&&error.loginUrl===origin);
  assert.equal(c.calls.length,1);
  const unknown=client({[origin+'/myblog']:{authenticated:true}});
  await assert.rejects(X.read(unknown),error=>error.code==='INCOMPLETE');
});
test('登录中途失效、全书架回退、缺页和总量变化均不返回可导入快照',async()=>{
  for(const changed of [page([] ,[],{authenticated:false}),page([],[],{isReadCategory:false}),page([],[],{advertisedCount:4}),page([book('b','Two')],[])]){
    const c=client({[origin+'/myblog']:home,[base]:page([book('a','One')],[base+'/page_2']),[base+'/page_2']:changed});
    await assert.rejects(X.read(c),error=>['AUTH_REQUIRED','INCOMPLETE'].includes(error.code));
  }
});
test('空书架明确提示，不能用空快照覆盖原记录',async()=>{
  const c=client({[origin+'/myblog']:home,[base]:page([],[],{advertisedCount:0})});
  await assert.rejects(X.read(c),error=>error.code==='EMPTY');
});
test('页码跳转和外站分页拒绝，任何请求不会前往第三方或其他账号',async()=>{
  for(const next of ['https://evil.example/read',origin+'/bookcase/user_99/tag_-6/page_2',base+'/page_2?proxy=1']){
    const c=client({[origin+'/myblog']:home,[base]:page([book('a','One')],[next])});
    await assert.rejects(X.read(c),error=>error.code==='INVALID_SOURCE');assert.equal(c.calls.length,2);
  }
  const c=client({[origin+'/myblog']:home,[base]:page([book('a','One')],[base+'/page_2']),[base+'/page_2']:page([book('b','Two')],[],{url:base})});
  await assert.rejects(X.read(c),error=>error.code==='INCOMPLETE');
});
test('同一外部ID标题冲突与未确认的分类总数均拒绝',async()=>{
  for(const variant of [page([book('a','One'),book('a','Different')]),page([book('a','One')],[],{advertisedCount:null})]){
    const c=client({[origin+'/myblog']:home,[base]:variant});await assert.rejects(X.read(c),error=>error.code==='INCOMPLETE');
  }
});
