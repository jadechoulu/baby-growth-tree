const test=require('node:test'),assert=require('node:assert/strict');
const Shelf=require('../shelf-library.js'),BP=require('../book-progress.js');
const options={plans:{plans:[]},directory:{books:[]},catalog:{series:[]},liao:{books:[{title:'Already Here'}]}};
function book(bookId,extra={}){return {bookId,appBookId:String(bookId.charCodeAt(0)),title:'Book '+bookId,language:'英文',read:false,isCollection:false,...extra};}
function snapshot(books){return {schemaVersion:1,sourceKind:'xiaohuasheng_bookcase_read',authenticated:true,complete:true,accountId:'owner',snapshotId:'shelf-1',fetchedAt:'2026-11-09T00:00:00Z',wholeBookcaseCount:books.length,books:books.filter(b=>b.read).map(b=>({bookId:b.bookId,appBookId:b.appBookId,title:b.title})),shelfCatalog:{version:1,complete:true,total:books.length,books}};}
test('英文版本按真实套系归组，中文、双语、未知语言与廖彩杏作品不进入其他',()=>{
  const series={id:'set',appBookId:'901',title:'A Real Series'};
  const snap=snapshot([book('a',{series,read:true}),book('b',{series}),book('c',{language:'中文'}),book('d',{language:''}),book('e',{language:'中英双语'}),book('f',{title:'双语故事'}),book('g',{title:'Already Here'})]);
  const r=Shelf.apply({},snap,options),groups=Shelf.groups(r.changes,options);
  assert.equal(groups.length,1);assert.equal(groups[0].total,2);assert.equal(groups[0].completed,1);assert.equal(groups[0].status,'using');
  assert.equal(BP.bookState(r.changes,'shelf-book-owner-a').external.length,1);
  assert.ok(!JSON.stringify(r.changes).includes('Book c'));
});
test('公共单册只排除本册，明确路线套系身份才排除整个套系',()=>{
  const series={id:'set',appBookId:'901',title:'Set'},snap=snapshot([book('a',{series}),book('b',{series})]);
  const config={...options,directory:{books:[{id:'public-a',resourceId:'r',title:'Public A',externalIds:{xiaohuasheng:['a']}}]}};
  const remaining=Shelf.groups(Shelf.apply({},snap,config).changes,config);
  assert.equal(remaining.length,1);assert.deepEqual(remaining[0].books.map(b=>b.bookId),['b']);
  const source={...options,resources:[{id:'r',title:'Other name',appearances:[{}]}],catalog:{series:[{resourceId:'r',sources:[{url:'https://www.xiaohuasheng.cn/series/set'}]}]}};
  assert.equal(Shelf.groups(Shelf.apply({},snap,source).changes,source).length,0);
});
test('有内容专区但没有公共单册完成映射的套系仍保留书架与阅读状态',()=>{
  const series={id:'hello-set',appBookId:'901',title:'Magazine Collection'};
  const config={...options,collections:[{externalIds:{xiaohuashengSeries:['hello-set']}}]};
  const saved=Shelf.apply({},snapshot([book('a',{series,read:true}),book('b',{series})]),config).changes;
  const groups=Shelf.groups(saved,config);
  assert.equal(groups.length,1);assert.equal(groups[0].total,2);assert.equal(groups[0].completed,1);
  assert.equal(BP.bookState(saved,'shelf-book-owner-a').done,true);
});
test('同名不同外部身份不硬绑；无套系依据保留独立单本',()=>{
  const snap=snapshot([book('a',{title:'Same'}),book('b',{title:'Same'})]);
  const config={...options,directory:{books:[{id:'public',title:'Same',externalIds:{xiaohuasheng:['other']}}]}};
  assert.equal(Shelf.groups(Shelf.apply({},snap,config).changes,config).length,2);
});
test('已核ISBN的大猫外站身份复用公共单册，历史书架入口不重复保留套系',()=>{
  const directory=require('../data/resource-books.json');
  const ids=['751ac6c5ea923304','c6a797906f523304','699a5ecd0ac38d17','bfbca1953089c4a7','ab52f82fbf170c73'];
  const series={id:'synthetic-series',appBookId:'901',title:'Synthetic Series'};
  const entries=ids.map((id,i)=>book(id,{appBookId:String(9000+i),title:'Synthetic Book '+i,series,read:i===0}));
  const config={...options,directory};
  const legacy=Shelf.apply({},snapshot(entries),options).changes;
  assert.equal(Shelf.groups(legacy,options).length,1);
  assert.equal(Shelf.groups(legacy,config).length,0,'公共身份补齐后旧私人目录也即时去重');
  const result=Shelf.apply(legacy,snapshot(entries),config),records={...legacy,...result.changes};
  assert.equal(result.matched.length,1,'只导入合成快照中标为已读的一册');
  assert.ok(entries.every(entry=>BP.matchEntry(options.plans,entry,directory,options.catalog).candidates.length===1));
  assert.equal(Shelf.groups(records,config).length,0);
  assert.equal(BP.bookState(records,'book-0060dd08ba449561').done,true);
  assert.equal(BP.bookState(records,'book-7050d391b5ec6563').done,false);
});
test('反复同步幂等，手工勾选共用记录；原站改为未读只撤回外部勾选',()=>{
  const snap=snapshot([book('a',{read:true}),book('b')]),first=Shelf.apply({},snap,options),records={...first.changes,...BP.manualUpdate({},'shelf-book-owner-b',true)};
  assert.deepEqual(Shelf.apply(records,snap,options).changes,{});
  const next=Shelf.apply(records,snapshot([book('a'),book('b')]),options),saved={...records,...next.changes};
  assert.equal(BP.bookState(saved,'shelf-book-owner-a').done,false);assert.equal(BP.bookState(saved,'shelf-book-owner-b').done,true);
});
test('旧快照不清空私人目录，缺页、重复ID和跨源图片均拒绝整个事务',()=>{
  const snap=snapshot([book('a')]),first=Shelf.apply({},snap,options).changes;
  const old={...snap};delete old.shelfCatalog;
  assert.ok(!Object.keys(Shelf.apply(first,old,options).changes).some(key=>key.startsWith(Shelf.PREFIX)));
  for(const change of [s=>s.shelfCatalog.complete=false,s=>s.shelfCatalog.books.push(book('a')),s=>s.shelfCatalog.books[0].cover='https://evil.example/img',s=>s.shelfCatalog.books[0].read=true]){
    const bad=structuredClone(snap);change(bad);assert.throws(()=>Shelf.apply(first,bad,options));assert.equal(Object.values(first)[0].status,'using');
  }
});
test('离开书架只隐藏元信息，旧完成与手工记录不丢失；扩展公共目录沿身份复用完成',()=>{
  const first=Shelf.apply({},snapshot([book('a',{read:true}),book('b')]),options).changes;
  const saved={...first,...BP.manualUpdate({},'shelf-book-owner-a',true)};
  const next=Shelf.apply(saved,snapshot([book('b')]),options);
  assert.equal(Shelf.groups({...saved,...next.changes},options).length,1);assert.equal(BP.bookState(saved,'shelf-book-owner-a').done,true);
  const expanded={...options,directory:{books:[{id:'public-a',resourceId:'r',title:'A',externalIds:{xiaohuasheng:['a']}}]}};
  const migrated=Shelf.apply(saved,snapshot([book('a',{read:true})]),expanded),records={...saved,...migrated.changes};
  assert.equal(BP.bookState(records,'public-a').done,true);assert.equal(BP.bookState(records,'public-a').manual,true);
  assert.equal(Shelf.groups(records,expanded).length,0);
  const bad=snapshot([book('a',{read:true,appBookId:'999'})]),conflict=Shelf.apply(saved,bad,expanded);
  assert.equal(conflict.ambiguous.length,1);assert.ok(!conflict.changes[BP.MANUAL+'public-a']);
});
test('私人书架元信息通过英语备份与云端规范化，不混入公共目录',()=>{
  const Sync=require('../../shared/sync-model.js');
  const records=Shelf.apply({},snapshot([book('a',{read:true,cover:'https://img.xiaohuasheng.cn/test.jpg'})]),options).changes;
  const normalized=Sync.normalize('english',{version:1,profile:{vocabulary:0,mode:"audio"},favorites:[],records});
  assert.deepEqual(normalized.records,records);assert.equal(Shelf.groups(normalized.records,options)[0].completed,1);
});
test('套装完整目录展开，套装已读不能完成子册，同册在书架和套装只计一次',()=>{
  const parent=book('p',{isCollection:true,read:true}),child=book('a',{read:true}),snap=snapshot([parent,child]);
  const series={id:'p',appBookId:parent.appBookId,title:parent.title};
  snap.shelfCatalog.collections=[{parentId:'p',appBookId:parent.appBookId,title:parent.title,total:2,complete:true,books:[{...child,series},book('b',{series})]}];
  const groups=Shelf.groups(Shelf.apply({},snap,options).changes,options);
  assert.equal(groups.length,1);assert.equal(groups[0].total,2);assert.equal(groups[0].completed,1);
  delete snap.shelfCatalog.collections;assert.throws(()=>Shelf.apply({},snap,options));
});
test('同步进度一次备份保存书架与勾选，云端失败仍保留本机；校验失败不保存',async()=>{
  const X=require('../xiaohuasheng-sync.js'),snap=snapshot([book('a',{read:true})]);
  Object.assign(snap,{transport:'xiaohuasheng-app-api',predicate:'readedFlag=1'});
  let records={},backups=0,saves=0;
  const input={location:{protocol:'http:',hostname:'localhost'},getRecords:()=>records,read:async()=>snap,apply:(records,snapshot)=>Shelf.apply(records,snapshot,options),backup:async base=>{assert.equal(base,records);backups++;},save:changes=>{records={...records,...changes};saves++;return true;},cloud:{sync:async()=>({ok:false,status:'auth-required'})}};
  const result=await X.synchronize(input);
  assert.equal(backups,1);assert.equal(saves,1);assert.equal(result.receipt.shelf.books,1);assert.equal(result.cloud.ok,false);
  assert.equal(Shelf.groups(records,options)[0].completed,1);
  snap.shelfCatalog.complete=false;
  await assert.rejects(X.synchronize(input));assert.equal(saves,1);
  await assert.rejects(X.synchronize({...input,read:async()=>({...snap,accountId:'other'})}),error=>error.code==='ACCOUNT_MISMATCH');
});
