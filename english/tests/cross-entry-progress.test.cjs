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
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function fixture(id){
  const entry=EnglishModel.publicationEntry(resourceVolumes,id),resource={id,title:entry.title,type:'reader'};
  const S={records:{}},context={S,BP,P,EnglishModel,READING,BOOKS,window:{ROADMAP_RAW:{resourceVolumes}},C:{stages:[]},byId:new Map([[id,resource]]),
    resourceRouteEntries:()=>[],liaoBookDone:()=>false,h:(tag,props,...children)=>({tag,props,children}),
    resourceSeriesBooks:id=>({kind:'shared-directory',id}),readingPlanDetail:id=>({kind:'shared-plan',id}),libraryQuantityForm:()=>({kind:'independent-quantity'})};
  vm.createContext(context);
  vm.runInContext([between('function readingPlanForResource(','function refreshReadingPlan('),between('function libraryQuantityContext(','function resourceStatusControl('),between('function resourceProgressDetail(','function refreshResourceProgressModal(')].join('\n'),context);
  return {...context,resource};
}
function scopeFor(id,edition){return P.bookScopes(id,[],resourceVolumes).find(scope=>scope.edition===edition);}

test('未选版的全部多目录套系总览公共书目，不以首份目录代表图鉴进度或书单',()=>{
  const tested=[];
  for(const entry of resourceVolumes.series){
    if(entry.catalogResourceId||entry.recordingEditions?.length)continue;
    const plans=BP.catalogPlans(BOOKS,resourceVolumes,entry.resourceId);
    if(plans.length<2)continue;
    const app=fixture(entry.resourceId),last=plans.at(-1).books[0];
    app.S.records=BP.manualUpdate({},last.id,true,BOOKS);
    assert.equal(app.readingPlanForResource(entry.resourceId),null,entry.title);
    assert.equal(app.resourceProgress(app.resource).completed,1,entry.title);
    assert.equal(app.resourceProgress(app.resource).total,null,entry.title);
    assert.equal(app.resourceProgressDetail(entry.resourceId).children.at(-1).kind,'shared-directory',entry.title);
    app.S.records={...app.S.records,...BP.manualUpdate(app.S.records,last.id,false,BOOKS)};
    assert.equal(app.resourceProgress(app.resource).completed,0,entry.title);
    tested.push(entry.resourceId);
  }
  assert.ok(tested.includes('resource-1qnd5uh'),'覆盖RAZ全部级别与虚构范围');
  assert.ok(tested.includes('resource-1n3ix1n'),'覆盖牛津树组合目录');
  assert.ok(tested.includes('resource-1yfs7b5'),'覆盖Hammy不同套装与分级选本');
});

test('RAZ图鉴明确选择AA范围后与路线AA共用单册，A与B的完成不串入',()=>{
  const id='resource-1qnd5uh',app=fixture(id),plans=BP.catalogPlans(BOOKS,resourceVolumes,id);
  const plan=plans.find(plan=>plan.books.length===100&&plan.books.every(book=>book.level==='aa'));
  assert.ok(plan);
  const scope=scopeFor(id,plan.edition);assert.ok(scope);
  const other=plans.find(other=>other.books.every(book=>book.level.toLowerCase()==='b')).books[0];
  app.S.records={...BP.manualUpdate({},plan.books[0].id,true,BOOKS),...BP.manualUpdate({},other.id,true,BOOKS),
    [P.LIBRARY+id]:P.libraryQuantityUpdate(undefined,scope,0,'本')};
  const selected=app.readingPlanForResource(id),route=app.readingPlanForResource(id,scope);
  assert.equal(selected.id,route.id);
  assert.equal(app.resourceProgress(app.resource).completed,1);
  assert.equal(BP.projectQuantity(app.S.records,route,scope,{completed:0}).completed,1);
  assert.equal(app.resourceProgressDetail(id).kind,'shared-plan');
  assert.equal(BP.bookState(app.S.records,plan.books[0].id,BOOKS).done,true);
  app.S.records={...app.S.records,...BP.manualUpdate(app.S.records,plan.books[0].id,false,BOOKS)};
  assert.equal(app.resourceProgress(app.resource).completed,0);
  assert.equal(BP.projectQuantity(app.S.records,route,scope,{completed:0}).completed,0);
  assert.equal(BP.bookState(app.S.records,other.id,BOOKS).done,true);
});

test('明确保存的单级范围不会在图鉴扩成整版，数量与路线同范围一致',()=>{
  const id='resource-1n3ix1n',app=fixture(id);
  const scope=P.bookScopes(id,['1'],resourceVolumes).find(scope=>scope.total>0);
  assert.ok(scope);
  const plan=BP.planForResource(READING,id,BOOKS,resourceVolumes,scope),group=BP.scopeGroup(plan,scope);
  assert.ok(plan);assert.notEqual(group,'all');
  const selected=BP.books(plan,group),other=plan.books.find(book=>!selected.some(own=>own.id===book.id));
  assert.ok(other);
  app.S.records={...BP.manualUpdate({},selected[0].id,true,BOOKS),...BP.manualUpdate({},other.id,true,BOOKS),
    [P.LIBRARY+id]:P.libraryQuantityUpdate(undefined,scope,0,'本')};
  const progress=app.resourceProgress(app.resource),route=BP.projectQuantity(app.S.records,plan,scope,{completed:0});
  assert.equal(progress.completed,route.completed);
  assert.equal(progress.total,route.total);
  assert.equal(progress.total,scope.total);
  assert.equal(progress.completed,1);
});

test('尚未绑定公共目录的本人范围保留数量，不被其他级别已读总览覆盖',()=>{
  const id='resource-1qnd5uh',app=fixture(id),scope={id:'personal-edition',label:'本人版本',total:12,origin:'personal',unit:'本'};
  app.S.records={...BP.manualUpdate({},BP.catalogPlans(BOOKS,resourceVolumes,id)[0].books[0].id,true,BOOKS),
    [P.LIBRARY+id]:P.libraryQuantityUpdate(undefined,scope,3,'本')};
  assert.equal(app.readingPlanForResource(id),null);
  const progress=app.resourceProgress(app.resource);
  assert.equal(progress.completed,3);
  assert.equal(progress.total,12);
  assert.equal(app.resourceProgressDetail(id).kind,'independent-quantity');
});
