const test=require('node:test');
const assert=require('node:assert/strict');
const X=require('../xiaohuasheng-sync.js');
const B=require('../book-progress.js');
const origin='https://www.xiaohuasheng.cn',base=origin+'/bookcase/user_42/tag_-6';
const book=(id,title)=>({bookId:id,title});
const home={authenticated:true,accountId:'42'};

test('每次页面打开只自动抓取一次，等待本人连接及初次记录同步，不因重绘、聚焦或失败循环抓取',async()=>{
  let state={authenticated:false,enabled:false},calls=0;
  const options={getState:async()=>state,synchronize:async()=>{calls++;}};
  const attempt=X.onPageOpen(options);
  assert.equal(await attempt(),false);
  state={authenticated:true,enabled:true,syncing:true}; assert.equal(await attempt(),false);
  state={authenticated:true,enabled:true};
  await Promise.all([attempt(),attempt(),attempt()]); assert.equal(calls,1);
  await attempt(); assert.equal(calls,1);
  await X.onPageOpen(options)(); assert.equal(calls,2,'新页面可重新抓取');
  let failures=0;
  const failed=X.onPageOpen({getState:async()=>state,synchronize:async()=>{failures++;throw Error('离线');}});
  await assert.rejects(failed()); assert.equal(await failed(),false); assert.equal(failures,1);
});
const page=(books,pages=[],extra={})=>({authenticated:true,accountId:'42',isReadCategory:true,advertisedCount:3,books,pages,...extra});
function client(pages){
  const calls=[];
  return {calls,parsePage:JSON.parse,fetch:async(url,options)=>{calls.push({url,options});const value=pages[url];if(value instanceof Error)throw value;if(!value)throw Error('unexpected url');return {ok:value.ok!==false,status:value.status||200,url:value.url||url,text:async()=>JSON.stringify(value)};}};
}
test('发现本人书架与全部动态分页，双链接去重后返回导入器可用的完整快照',async()=>{
  const c=client({[origin+'/myblog']:home,[base]:page([book('a','One'),book('a','One')],[base+'/page_2']),[base+'/page_2']:page([book('b','Two'),book('c','Three')],[base+'/page_2'])});
  const result=await X.readWebLegacy({...c,now:()=>Date.parse('2026-11-07T00:00:00Z')});
  assert.equal(result.complete,true);assert.equal(result.authenticated,true);assert.equal(result.actualUniqueCount,3);assert.equal(result.pages.length,2);
  assert.equal(result.accountId,'42');assert.deepEqual(result.books.map(b=>b.bookId),['a','b','c']);
  assert.ok(c.calls.every(call=>call.options.credentials==='include'));
  assert.doesNotThrow(()=>B.applyReadSnapshot({}, {plans:[]}, result));
});
test('网络或CORS错误与未登录严格区分，不把匿名公开书架当本人',async()=>{
  await assert.rejects(X.readWebLegacy({fetch:async()=>{throw TypeError('Failed to fetch');}}),error=>error.code==='CONNECTION_UNAVAILABLE');
  const c=client({[origin+'/myblog']:{authenticated:false,accountId:'42'}});
  await assert.rejects(X.readWebLegacy(c),error=>error.code==='AUTH_REQUIRED'&&error.loginUrl===origin);
  assert.equal(c.calls.length,1);
  const unknown=client({[origin+'/myblog']:{authenticated:true}});
  await assert.rejects(X.readWebLegacy(unknown),error=>error.code==='INCOMPLETE');
});
test('登录中途失效、全书架回退、缺页和总量变化均不返回可导入快照',async()=>{
  for(const changed of [page([] ,[],{authenticated:false}),page([],[],{isReadCategory:false}),page([],[],{advertisedCount:4}),page([book('b','Two')],[])]){
    const c=client({[origin+'/myblog']:home,[base]:page([book('a','One')],[base+'/page_2']),[base+'/page_2']:changed});
    await assert.rejects(X.readWebLegacy(c),error=>['AUTH_REQUIRED','INCOMPLETE'].includes(error.code));
  }
});
test('空书架明确提示，不能用空快照覆盖原记录',async()=>{
  const c=client({[origin+'/myblog']:home,[base]:page([],[],{advertisedCount:0})});
  await assert.rejects(X.readWebLegacy(c),error=>error.code==='EMPTY');
});
test('页码跳转和外站分页拒绝，任何请求不会前往第三方或其他账号',async()=>{
  for(const next of ['https://evil.example/read',origin+'/bookcase/user_99/tag_-6/page_2',base+'/page_2?proxy=1']){
    const c=client({[origin+'/myblog']:home,[base]:page([book('a','One')],[next])});
    await assert.rejects(X.readWebLegacy(c),error=>error.code==='INVALID_SOURCE');assert.equal(c.calls.length,2);
  }
  const c=client({[origin+'/myblog']:home,[base]:page([book('a','One')],[base+'/page_2']),[base+'/page_2']:page([book('b','Two')],[],{url:base})});
  await assert.rejects(X.readWebLegacy(c),error=>error.code==='INCOMPLETE');
});
test('同一外部ID标题冲突与未确认的分类总数均拒绝',async()=>{
  for(const variant of [page([book('a','One'),book('a','Different')]),page([book('a','One')],[],{advertisedCount:null})]){
    const c=client({[origin+'/myblog']:home,[base]:variant});await assert.rejects(X.readWebLegacy(c),error=>error.code==='INCOMPLETE');
  }
});
const localLocation={protocol:'http:',hostname:'127.0.0.1'};
const onlineLocation={protocol:'https:',hostname:'example.github.io'};
const appSnapshot=()=>({schemaVersion:1,sourceKind:'xiaohuasheng_bookcase_read',transport:'xiaohuasheng-app-api',predicate:'readedFlag=1',accountId:'42',snapshotId:'app-42-test',fetchedAt:'2026-11-08T00:00:00Z',complete:true,authenticated:true,wholeBookcaseCount:2,actualUniqueCount:1,advertisedCount:1,sourceUrl:'https://app.xiaohuasheng.cn//bookroom/queryBookroomBook/42/-2/-1/-1/0/30',books:[{bookId:'guid-one',appBookId:'123',title:'Example GK One'}]});
test('本地主路径只调用同源固定POST，不携带外站cookie或浏览器提供的账号',async()=>{
  const calls=[];
  const value=await X.read({location:localLocation,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>appSnapshot()};}});
  assert.equal(value.books[0].bookId,'guid-one');assert.equal(calls.length,1);
  assert.equal(calls[0].url,'/__xiaohuasheng-sync');assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.body,'{}');assert.equal(calls[0].options.credentials,'same-origin');
  let requested=false;
  await assert.rejects(X.read({location:onlineLocation,fetch:async()=>{requested=true;}}),{code:'LOCAL_REQUIRED'});
  assert.equal(requested,false);
});
test('本机接口缺失、授权失效与不完整返回都不变成空快照',async()=>{
  await assert.rejects(X.read({location:localLocation,fetch:async()=>({ok:false,json:async()=>({code:'AUTH_REQUIRED',error:'授权失效'})})}),{code:'AUTH_REQUIRED'});
  await assert.rejects(X.read({location:localLocation,fetch:async()=>({ok:false,json:async()=>{throw Error();}})}),{code:'LOCAL_UNAVAILABLE'});
  await assert.rejects(X.read({location:localLocation,fetch:async()=>({ok:true,json:async()=>({...appSnapshot(),complete:false})})}),{code:'INCOMPLETE'});
});
function syncHarness(extra={}){
  let records={manual:{status:'done',note:JSON.stringify({date:'2026-10-20',text:'保留'})},timer:{status:'using',note:'计时保留'}};
  const events=[],plan={id:'test',groups:[{id:'a'}],externalMatch:{prefixes:['Example GK']},books:[{id:'one',title:'One',group:'a',number:1}]};
  const options={location:localLocation,getRecords:()=>records,read:async()=>{events.push('read');return appSnapshot();},apply:(base,snapshot)=>B.applyReadSnapshot(base,{plans:[plan]},snapshot),backup:async()=>{events.push('backup');},save:changes=>{events.push('save');records={...records,...changes};return true;},cloud:{sync:async()=>{events.push('cloud');return {ok:true,status:'synced'};}},...extra};
  return {options,events,get records(){return records;},edit:()=>{records={...records,newManual:{status:'done'}};}};
}
test('真实导入模型顺序为完整读取、备份、原子保存、私人同步；历史记录不变',async()=>{
  const h=syncHarness(),before=structuredClone(h.records),result=await X.synchronize(h.options);
  assert.deepEqual(h.events,['read','backup','save','cloud']);assert.equal(result.mode,'local');
  assert.equal(B.bookState(h.records,'one').done,true);assert.deepEqual(h.records.manual,before.manual);assert.deepEqual(h.records.timer,before.timer);
  assert.equal(X.receipt(h.records).fetchedAt,appSnapshot().fetchedAt);
  const portable=require('../../shared/sync-model.js').normalize('english',{version:1,profile:{vocabulary:0,mode:'audio'},favorites:[],records:h.records});
  assert.deepEqual(X.receipt(portable.records),X.receipt(h.records));
});
test('备份失败、不同账号和备份间新编辑均不写入任何导入记录',async()=>{
  const failed=syncHarness({backup:async()=>{throw Error('备份失败');}});
  await assert.rejects(X.synchronize(failed.options),/备份失败/);assert.deepEqual(failed.events,['read']);
  const other=syncHarness();other.records['reading.external.v1:99:x']={status:'done',note:JSON.stringify({sourceKind:'xiaohuasheng_bookcase_read',accountId:'99'})};
  await assert.rejects(X.synchronize(other.options),{code:'ACCOUNT_MISMATCH'});assert.deepEqual(other.events,['read']);
  const concurrent=syncHarness();concurrent.options.backup=async()=>concurrent.edit();
  await assert.rejects(X.synchronize(concurrent.options),{code:'RECORDS_CHANGED'});assert.equal(concurrent.records.newManual.status,'done');assert.equal(X.receipt(concurrent.records),null);
});
test('正式站只合入私人记录，显示抓取时点；未连接、冲突或无快照不报实时获取成功',async()=>{
  const local=syncHarness();await X.synchronize(local.options);
  const cloud=syncHarness({location:onlineLocation,getRecords:()=>local.records});
  const result=await X.synchronize(cloud.options);assert.deepEqual(cloud.events,['cloud']);assert.equal(result.mode,'cloud');assert.equal(result.receipt.fetchedAt,appSnapshot().fetchedAt);
  for(const status of ['auth-required','connection-required','conflict','error']){
    const h=syncHarness({location:onlineLocation,cloud:{sync:async()=>({ok:false,status})}});
    const r=await X.synchronize(h.options);assert.equal(r.receipt,null);assert.equal(r.cloud.ok,false);assert.deepEqual(h.events,[]);
  }
  const empty=syncHarness({location:onlineLocation});assert.equal((await X.synchronize(empty.options)).receipt,null);
});
test('本地导入成功但云端未连接时保留本地成功及独立云端状态',async()=>{
  const h=syncHarness({cloud:{sync:async()=>({ok:false,status:'auth-required'})}}),result=await X.synchronize(h.options);
  assert.equal(result.mode,'local');assert.equal(result.cloud.ok,false);assert.equal(B.bookState(h.records,'one').done,true);
});
test('云端实时读取复用原单册导入和次数；先连接、完整取数、私有备份，再保存和同步',async()=>{
  for(const location of [onlineLocation,localLocation]){
    const h=syncHarness({location});
    h.options.cloud={getState:async()=>({authenticated:true,enabled:true}),sync:async()=>{h.events.push('cloud');return {ok:true,status:'synced'};},readXiaohuasheng:async()=>{h.events.push('cloud-read');return {...appSnapshot(),books:appSnapshot().books.map(book=>({...book,readCount:3}))};}};
    h.options.cloudBackup=async()=>h.events.push('cloud-backup');
    const result=await X.synchronize(h.options);
    assert.equal(result.mode,'cloud-live');assert.equal(B.bookState(h.records,'one').readCount,3);
    assert.deepEqual(h.events,['cloud','cloud-read','cloud-backup','save','cloud']);
  }
});
test('云端未连接、抓取失败、备份失败、账号冲突和备份期间新编辑均不覆盖个人记录',async()=>{
  for(const kind of ['unconnected','fetch','backup','owner','concurrent']){
    const h=syncHarness({location:onlineLocation}),before=structuredClone(h.records);
    h.options.cloud={sync:async()=>({ok:kind!=='unconnected',status:kind==='unconnected'?'auth-required':'synced'}),readXiaohuasheng:async()=>{if(kind==='fetch')throw Error('抓取失败');return {...appSnapshot(),...(kind==='owner'?{accountId:'99'}:{})};}};
    if(kind==='owner')h.records[X.RECEIPT]={status:'done',note:JSON.stringify({version:1,transport:'xiaohuasheng-app-api',predicate:'readedFlag=1',fetchedAt:'2026-11-07T00:00:00Z',total:1,accountId:'42'})};
    h.options.cloudBackup=async()=>{if(kind==='backup')throw Error('备份失败');if(kind==='concurrent')h.edit();};
    if(kind==='unconnected')assert.equal((await X.synchronize(h.options)).cloud.ok,false);
    else await assert.rejects(X.synchronize(h.options));
    assert.equal(h.events.includes('save'),false);
    assert.deepEqual(h.records.manual,before.manual);assert.deepEqual(h.records.timer,before.timer);
  }
});
