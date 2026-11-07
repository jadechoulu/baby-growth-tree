const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const BP=require('../book-progress.js');
const P=require('../practice.js');
const EnglishModel=require('../model.js');
const READING=require('../data/reading-plans.json');
const BOOKS=require('../data/resource-books.json');
const resourceVolumes=require('../data/resource-volumes.json');
const appSource=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const pearson='resource-1nuqi5t';
const publication=EnglishModel.publicationEntry(resourceVolumes,pearson);
const scopes=P.bookScopes(pearson,[],resourceVolumes);
const newer=publication.recordingEditions.find(item=>item.default);
const older=publication.recordingEditions.find(item=>!item.default);
const editionScope=option=>scopes.find(scope=>scope.id===option.scopeId);
const upper={id:'fixture-upper',label:'上辑',edition:editionScope(newer).edition,total:48,origin:'catalog'};

// 执行实际页面的进度衔接代码；只替换DOM和持久化边界，不复制被测实现。
function between(start,end){
  const first=appSource.indexOf(start),last=appSource.indexOf(end,first+start.length);
  assert.ok(first>=0&&last>first,'页面函数边界应存在');
  return appSource.slice(first,last);
}
function appFixture(records={},units=[]){
  const S={records},resource={id:pearson,title:'培生词汇妙趣屋',type:'reader'};
  const context={S,BP,P,EnglishModel,READING,BOOKS,window:{ROADMAP_RAW:{resourceVolumes}},
    C:{stages:[{id:'fixture-stage'}]},byId:new Map([[pearson,resource]]),
    practiceUnits:()=>units,practiceBookScope:unit=>unit.scope,
    practiceRawRecord:unit=>S.records[unit.key],resourceRouteEntries:()=>[],liaoBookDone:()=>false,
    h:(tag,props,...children)=>({tag,props,children}),refreshes:[],saveAllowed:true,
    savePracticeRecords:changes=>{
      if(!context.saveAllowed)return false;
      S.records={...S.records,...changes};return true;
    },refreshReadingPlan:id=>context.refreshes.push(id)};
  vm.createContext(context);
  vm.runInContext([
    between('function readingPlanForResource(','function refreshReadingPlan('),
    between('function bookCompletionControl(','function readingPlanDetail('),
    between('function libraryQuantityContext(','function resourceStatusControl(')
  ].join('\n'),context,{filename:'app-progress-under-test.js'});
  context.resource=resource;return context;
}
function setBook(fixture,book,checked){
  const control=fixture.bookCompletionControl(book,'fixture-book-'+book.id);
  const target={checked};control.props.onchange({target});return target;
}

test('公共选版决定图鉴书单：默认新版、显式旧版及历史手记均不串版',()=>{
  const app=appFixture();
  assert.equal(app.readingPlanForResource(pearson).edition,editionScope(newer).edition);
  assert.equal(app.readingPlanForResource(pearson,editionScope(older)).edition,editionScope(older).edition);
  app.S.records=P.sharedEditionUpdate(pearson,publication.recordingEditions,older.id);
  assert.equal(app.readingPlanForResource(pearson).edition,editionScope(older).edition);
  app.S.records={...app.S.records,...P.sharedEditionUpdate(pearson,publication.recordingEditions,newer.id)};
  assert.equal(app.readingPlanForResource(pearson).edition,editionScope(newer).edition);
  app.S.records={[P.LIBRARY+pearson]:{status:'using',note:'原来的普通手记'}};
  assert.equal(app.readingPlanForResource(pearson).edition,editionScope(newer).edition);
  assert.equal(app.S.records[P.LIBRARY+pearson].note,'原来的普通手记');
});

test('图鉴勾选与撤回通过同一单册事实投影路线数量，切版不继承完成',()=>{
  const app=appFixture(),plan=app.readingPlanForResource(pearson,upper);
  const book=BP.books(plan,BP.scopeGroup(plan,upper))[0];
  setBook(app,book,true);
  assert.equal(app.resourceProgress(app.resource).completed,1);
  assert.equal(BP.projectQuantity(app.S.records,plan,upper,{completed:0}).completed,1);
  assert.equal(app.bookCompletionControl(book,'other-entry').props.checked,true);
  const old=app.readingPlanForResource(pearson,editionScope(older));
  assert.equal(app.sharedReadingProgress(old).completed,0);
  app.S.records={...app.S.records,...P.sharedEditionUpdate(pearson,publication.recordingEditions,older.id)};
  assert.equal(app.resourceProgress(app.resource).completed,0);
  app.S.records={...app.S.records,...P.sharedEditionUpdate(pearson,publication.recordingEditions,newer.id)};
  assert.equal(app.resourceProgress(app.resource).completed,1);
  setBook(app,book,false);
  assert.equal(app.resourceProgress(app.resource).completed,0);
  assert.equal(BP.projectQuantity(app.S.records,plan,upper,{completed:0}).completed,0);
  assert.equal(BP.bookState(app.S.records,book.id).done,false);
  assert.equal(app.refreshes.length,2);
});

test('共用数量显式归零后旧阶段10本不再抬升，原记录与具体单册状态保留',()=>{
  const key=P.MATERIAL+'xu:fixture:'+pearson+':signature';
  const original=P.unitBookProgressUpdate(10,upper);
  const app=appFixture({[key]:original},[{key,resourceId:pearson,scope:upper}]);
  const plan=app.readingPlanForResource(pearson,upper),group=BP.scopeGroup(plan,upper);
  assert.equal(app.sharedReadingProgress(plan,group).completed,10);
  assert.equal(app.sharedReadingProgress(plan,group).identifiedCompleted,0);
  app.S.records={...app.S.records,...P.sharedQuantityUpdate(app.S.records,pearson,upper,0,'本')};
  assert.equal(app.sharedReadingProgress(plan,group).completed,0);
  assert.equal(app.resourceProgress(app.resource).completed,0);
  assert.deepEqual(app.S.records[key],original);
  assert.ok(BP.books(plan,group).every(book=>!BP.bookState(app.S.records,book.id).done));
});

test('小花生逐本事实统一进入图鉴和路线，并向数量控件返回来源优先标记',()=>{
  const book=BOOKS.books.find(book=>book.resourceId===pearson&&book.edition==='培生幼儿英语基础词汇 · 上辑（48本版）');
  const snapshot={schemaVersion:1,sourceKind:'xiaohuasheng_bookcase_read',authenticated:true,complete:true,
    accountId:'test-owner',snapshotId:'synthetic-shared-reading',fetchedAt:'2026-11-07T00:00:00Z',
    books:[{bookId:'test-book',title:'培生幼儿英语.基础词汇.上 '+book.title}]};
  const imported=BP.applyReadSnapshot({},READING,snapshot,{sourcePriority:true,directory:BOOKS,catalog:resourceVolumes});
  assert.equal(imported.matched.length,1);
  const app=appFixture(imported.changes),plan=app.readingPlanForResource(pearson,upper);
  const quantity=BP.projectQuantity(app.S.records,plan,upper,{completed:10});
  assert.equal(quantity.completed,1);
  assert.equal(quantity.sourcePriority,true);
  assert.equal(app.resourceProgress(app.resource).completed,1);
  const control=app.bookCompletionControl(book,'fixture-external');
  assert.equal(control.props.checked,true);
  assert.equal(control.props.disabled,true);
  const before=structuredClone(app.S.records);
  assert.equal(BP.applyReadSnapshot(app.S.records,READING,snapshot,{sourcePriority:true,directory:BOOKS,catalog:resourceVolumes}).matched.length,1);
  assert.deepEqual(app.S.records,before);
});

test('RAZ参考目录无需完整出版计划也能逐本标记，失败不留下虚假勾选',()=>{
  const book=BOOKS.books.find(book=>book.resourceId==='resource-1qnd5uh');
  const app=appFixture();
  assert.equal(app.readingPlanForResource(book.resourceId),null);
  setBook(app,book,true);
  assert.equal(app.bookCompletionControl(book,'other-raz-entry').props.checked,true);
  setBook(app,book,false);
  assert.equal(app.bookCompletionControl(book,'other-raz-entry').props.checked,false);
  app.saveAllowed=false;
  const previous=app.S.records;
  const failed=setBook(app,book,true);
  assert.equal(failed.checked,false);
  assert.equal(app.S.records,previous);
  assert.equal(BP.bookState(app.S.records,book.id).done,false);
});
