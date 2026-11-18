const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../book-progress.js'),M=require('../model.js');
const directory=require('../data/resource-books.json'),catalog=require('../data/resource-volumes.json');
const resourceId='resource-yjrejm',books=directory.books.filter(book=>book.resourceId===resourceId);
const body=books.find(book=>book.appBookId===512652),colors=books.find(book=>book.appBookId===540367);
const owner='identity-test',guid=book=>book.externalIds.xiaohuasheng[0],shelfId=book=>'shelf-book-'+owner+'-'+guid(book);
function shelf(book,extra={}){return {version:1,accountId:owner,bookId:guid(book),appBookId:String(book.appBookId),title:book.title,language:'英文',read:true,isCollection:false,...extra};}
function external(book,extra={}){return {version:1,sourceKind:'xiaohuasheng_bookcase_read',accountId:owner,externalBookId:guid(book),appBookId:String(book.appBookId),publicBookId:shelfId(book),readCount:2,...extra};}
function recordsFor(book){return {['reading.shelf.v1:'+owner+':'+guid(book)]:{status:'using',note:JSON.stringify(shelf(book))},[B.EXTERNAL+owner+':'+guid(book)]:{status:'done',note:JSON.stringify(external(book))}};}

test('同guid与App身份的旧其他事实只读复用到DK公共单册，8册范围共享完成与次数',()=>{
  const records={...recordsFor(body),...recordsFor(colors),...B.manualUpdate({},shelfId(colors),true)};
  const before=JSON.stringify(records),view=B.publicRecordView(records,directory,catalog);
  assert.equal(JSON.stringify(records),before,'不修改真实记录，也不写新的存储键');
  assert.equal(B.bookState(view,body.id).done,true);
  assert.equal(B.bookState(view,colors.id).manual,true);
  assert.equal(B.bookState(view,colors.id).readCount,2);
  assert.equal(B.bookState(records,body.id,directory,catalog).done,true);
  const scope=M.publicationScopes(catalog,resourceId).find(scope=>scope.id==='low-age-xhs-5265013');
  const plan=B.planForResource({plans:[]},resourceId,directory,catalog,scope);
  assert.equal(B.progress(records,plan).completed,2);
  assert.equal(B.progress(records,plan).total,8);
  assert.equal(B.directoryProgress(records,directory,catalog,resourceId).completed,2);
  assert.equal(B.projectScopeQuantity(records,resourceId,scope,{completed:0},catalog,directory).completed,2);
});

test('套装已读、同题不同版及App身份冲突不能扩散单本完成',()=>{
  const records=recordsFor(body),key=B.EXTERNAL+owner+':'+guid(body);
  records[key]={status:'done',note:JSON.stringify(external(body,{appBookId:'999'}))};
  assert.equal(B.bookState(records,body.id,directory,catalog).done,false);
  const container='5f7c2352b6aab9a5';
  records[B.EXTERNAL+owner+':'+container]={status:'done',note:JSON.stringify({version:1,sourceKind:'xiaohuasheng_bookcase_read',accountId:owner,externalBookId:container,appBookId:'5265013',publicBookId:'shelf-book-'+owner+'-'+container})};
  assert.equal(B.directoryProgress(records,directory,catalog,resourceId).completed,0);
  records[B.EXTERNAL+owner+':another-edition']={status:'done',note:JSON.stringify({version:1,sourceKind:'xiaohuasheng_bookcase_read',accountId:owner,externalBookId:'another-edition',appBookId:'5268919',title:body.title,publicBookId:'shelf-book-'+owner+'-another-edition'})};
  assert.equal(B.bookState(records,body.id,directory,catalog).done,false);
});

test('撤回的外部事实保持撤回，已存在公共手工选择优先于旧私人手工选择',()=>{
  const records={...recordsFor(body),...B.manualUpdate({},shelfId(body),true),...B.manualUpdate({},body.id,false)};
  records[B.EXTERNAL+owner+':'+guid(body)].status='not-started';
  const view=B.publicRecordView(records,directory,catalog);
  assert.equal(B.bookState(view,body.id).done,false);
  assert.equal(view[B.MANUAL+body.id].status,'not-started');
  assert.equal(B.bookState(view,shelfId(body)).manual,true,'旧手工事实仍完整保留');
});

test('重复公共guid有歧义时保持原身份，不猜素材或版本',()=>{
  const records=recordsFor(body),ambiguous={books:[body,{...body,id:'duplicate-public-id'}]};
  assert.equal(B.publicRecordView(records,ambiguous,catalog),records);
});

test('GK70及大猫Pink旧其他进度沿精确身份复用，其他去重不隐藏另版',()=>{
  const Shelf=require('../shelf-library.js'),plans=require('../data/reading-plans.json');
  const river=directory.books.find(book=>book.id==='heinemann-gk70-45');
  const pink=directory.books.filter(book=>book.sourceIds?.includes('collins-pink-xhs-identities-20261118'));
  assert.equal(pink.length,22);
  const selected=[river,...pink.slice(0,5)],records=Object.assign({},...selected.map(recordsFor));
  const separate={...shelf(pink[0]),bookId:'different-edition-guid',appBookId:'99999999'};
  records['reading.shelf.v1:'+owner+':'+separate.bookId]={status:'using',note:JSON.stringify(separate)};
  const before=JSON.stringify(records),view=B.publicRecordView(records,directory,catalog);
  assert.equal(B.progress(records,plans.plans.find(plan=>plan.id==='heinemann-gk70')).completed,1);
  assert.equal(B.directoryProgress(records,directory,catalog,'resource-9fvmjt').completed,1);
  assert.equal(B.directoryProgress(records,directory,catalog,'resource-g7xvo5').completed,5);
  for(const book of selected)assert.equal(B.bookState(view,book.id).done,true);
  const foreign=directory.books.find(book=>book.id==='book-a2d5414efedcd1f3');
  assert.equal(B.bookState(view,foreign.id).done,false,'外研另一ISBN版本不继承Pink原版完成');
  const remaining=Shelf.groups(records,{plans,directory,catalog,liao:{books:[]}}).flatMap(group=>group.books);
  assert.deepEqual(remaining.map(book=>book.bookId),[separate.bookId]);
  assert.equal(JSON.stringify(records),before);
});

test('同步核对公共App ID，冲突不写入公共完成事实',()=>{
  const input={schemaVersion:1,sourceKind:'xiaohuasheng_bookcase_read',authenticated:true,complete:true,accountId:owner,snapshotId:'app-conflict',fetchedAt:'2026-11-18T00:00:00Z',books:[{bookId:guid(body),appBookId:'99999999',title:body.title}]};
  const result=B.applyReadSnapshot({},{plans:[]},input,{directory,catalog});
  assert.equal(result.matched.length,0);
  assert.equal(result.ambiguous[0].reason,'public-app-id-conflict');
  assert.deepEqual(result.changes,{});
});

test('旧其他事实兼容main已核阅读等价组，公共撤回不被旧私人手工覆盖',()=>{
  const original={...body,id:'original'},selection={...body,id:'selection'};
  const linked={books:[original,selection],readingEquivalences:[{bookIds:['original','selection'],isbn:body.isbn}]};
  const records={...recordsFor(body),...B.manualUpdate({},shelfId(body),true)};
  for(const id of ['original','selection'])assert.equal(B.bookState(records,id,linked).done,true);
  const manualOnly={...records};delete manualOnly[B.EXTERNAL+owner+':'+guid(body)];
  Object.assign(manualOnly,B.manualUpdate({},'selection',false));
  for(const id of ['original','selection'])assert.equal(B.bookState(manualOnly,id,linked).done,false);
  assert.equal(B.bookState(B.publicRecordView(records,{books:[original,selection]}),'original').done,false,'未声明等价组不能折叠重复guid');
});
