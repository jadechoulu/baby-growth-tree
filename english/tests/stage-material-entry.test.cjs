const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {loadInputs}=require('../../scripts/audit-reading-reuse.cjs');
const EnglishModel=require('../model.js'),P=require('../practice.js'),BP=require('../book-progress.js'),LB=require('../library-books.js');
const input=loadInputs(),BOOKS=BP.withReadingPlans(input.directory,input.reading,input.volumes);
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function fixture(){
  const S={records:{},profile:{},modal:null},C=input.catalog,stages=new Map(C.stages.map(s=>[s.id,s])),routes=new Map(C.routes.map(r=>[r.id,r]));
  const app={S,C,stages,routes,P,BP,LB,EnglishModel,BOOKS,READING:input.reading,window:{ROADMAP_RAW:{resourceVolumes:input.volumes}},byId:new Map(C.resources.map(r=>[r.id,r])),
    stageMaterialCache:new Map(),renderValue:(_key,fn)=>fn(),libraryReadingScope:()=>undefined,renderModal:()=>{},
    h:(tag,props,...children)=>({tag,props,children:children.flat(Infinity).filter(Boolean)}),icon:()=>null,
    materialLabel:item=>item.resource.title,materialLevelParts:item=>item.levelSegments,roleLabel:()=>'',
    resourceSeriesBooks:(id,unit)=>({kind:'reference',books:LB.referenceBooks(BOOKS.books,unit.item.resource,EnglishModel,unit.partLevel?[{level:unit.partLevel.label}]:unit.item.materials)}),
    readingFold:()=>null};
  app.readingPlanDetail=id=>{const scope=S.modal.readingScope,plan=app.readingPlanForResource(id,scope),group=BP.scopeGroup(plan,scope);assert.notEqual(group,null);return {kind:'reading-plan',scope,books:BP.books(plan,group),progress:BP.progress(S.records,plan,group)};};
  vm.createContext(app);
  vm.runInContext([
    between('function btn(','function routeChip('),
    between('function stageMaterials(','function materialUse('),
    between('function stageMaterialAttrs(','function seriesGroups('),
    between('function practicePlan(','function practiceBookLabel('),
    between('function practiceCatalogChoices(','function practiceEditionControls('),
    between('function readingPlanForResource(','function refreshReadingPlan('),
    between('function stageResourceUnit(','function activityDetail(')
  ].join('\n'),app);
  return app;
}
function nodes(tree,predicate){if(!tree||typeof tree!=='object')return [];return [...(predicate(tree)?[tree]:[]),...(tree.children||[]).flatMap(child=>nodes(child,predicate))];}
function open(app,stage,item){const attrs=app.materialTag(item).props;app.S.modal={stageId:attrs['data-stage'],materialIndex:String(attrs['data-material-index'])};return app.resourceDetail(item.resource);}
function reading(tree){return nodes(tree,node=>node.kind==='reading-plan')[0];}

test('三条路线全部来源及执行阶段的素材按钮保留准确阶段和原始引用，不依赖当前页面选中阶段',()=>{
  const app=fixture();let count=0;
  for(const stage of app.C.stages)for(const item of app.stageMaterials(stage)){
    const attrs=app.materialTag(item).props;
    assert.equal(attrs['data-stage'],stage.id);
    assert.equal(attrs['data-material-index'],item.originalIndex);
    app.S.modal={stageId:attrs['data-stage'],materialIndex:String(attrs['data-material-index'])};
    const unit=app.stageResourceUnit(item.resource.id);
    // 点击保留各原始引用；进度页的合并去重不能删除详情入口。
    const expected=app.practiceGroups(stage,app.computePracticeUnits(stage,false)).find(u=>u.resourceId===item.resource.id&&u.item.originalIndex===item.originalIndex);
    assert.equal(unit?.key,expected?.key,stage.id+' '+item.resource.title);
    if(['book','reader'].includes(item.resource.type))assert.ok(unit,stage.id+' '+item.resource.title+' 缺少对应引用');
    if(unit?.bookEligible){const tree=app.resourceDetail(item.resource);assert.ok(tree);count++;}
  }
  assert.ok(count>300);
});

test('香蕉妈妈RAZ多级别入口展示本阶段目录，切换级别仍使用图鉴同一单册完成事实',()=>{
  const app=fixture(),stage=app.stages.get('banana-1'),item=app.stageMaterials(stage).find(item=>item.resource.title==='RAZ');
  assert.ok(item);
  let tree=open(app,stage,item),first=reading(tree);assert.ok(first);
  const unit=app.stageResourceUnit(item.resource.id);assert.ok(unit.children.length>1);
  const chosen=first.books[0],otherLevel=unit.children[1];
  app.S.records=BP.manualUpdate({},chosen.id,true,BOOKS);
  tree=app.resourceDetail(item.resource);assert.equal(reading(tree).progress.identifiedCompleted,1);
  assert.ok(BP.bookState(app.S.records,chosen.id,BOOKS).done);
  const next=nodes(tree,n=>n.props?.onclick&&n.props['aria-pressed']==='false')[0];assert.ok(next);next.props.onclick();
  tree=app.resourceDetail(item.resource);const second=reading(tree);assert.ok(second);
  assert.ok(!second.books.some(book=>book.id===chosen.id));assert.equal(second.progress.identifiedCompleted,0);
  assert.equal(app.S.modal.stageReadingUnit,otherLevel.key);
  app.S.records={...app.S.records,...BP.manualUpdate(app.S.records,chosen.id,false,BOOKS)};
  assert.equal(BP.bookState(app.S.records,chosen.id,BOOKS).done,false);
});

test('庆爸RAZ虚构选本与许密杉GK细分范围不扩成整级或整套',()=>{
  const app=fixture();
  for(const [stageId,title] of [['qing-s1','RAZ'],['xu-node-500','海尼曼']]){
    const stage=app.stages.get(stageId),item=app.stageMaterials(stage).find(item=>item.resource.title.includes(title));assert.ok(item);
    const tree=open(app,stage,item),actual=reading(tree),unit=app.stageResourceUnit(item.resource.id),selected=(unit.children||[unit])[0],scope=app.practiceBookScope(selected);
    assert.ok(actual);assert.equal(actual.books.length,scope.total);
    const expected=BP.planForResource(input.reading,item.resource.id,BOOKS,input.volumes,scope);
    assert.deepEqual(actual.books.map(b=>b.id),BP.books(expected,BP.scopeGroup(expected,scope)).map(b=>b.id));
    if(title==='RAZ')assert.ok(actual.books.every(book=>book.genre==='fiction'));
    else assert.ok(actual.books.every(book=>book.group==='A'));
  }
});

test('有多份未选候选时保留同级参考书单，不默取套系首版，也不写入私人选版',()=>{
  const app=fixture();let count=0;
  for(const stage of app.C.stages)for(const item of app.stageMaterials(stage)){
    const unit=app.practiceGroups(stage,app.computePracticeUnits(stage,false)).find(u=>u.resourceId===item.resource.id&&u.item.originalIndex===item.originalIndex);
    if(!unit?.bookEligible||unit.children)continue;
    if(app.practiceBookScope(unit)||app.practiceCatalogChoices(unit).length<2)continue;
    const before=JSON.stringify(app.S.records),tree=open(app,stage,item);
    assert.equal(reading(tree),undefined,stage.id+' '+item.resource.title);
    assert.equal(JSON.stringify(app.S.records),before);
    count++;
  }
  assert.ok(count>0);
});

test('仅带阶段的活动入口合并该阶段同套系的引用，不跳到全套或其他级别',()=>{
  const app=fixture(),stage=app.stages.get('xu-node-500'),item=app.stageMaterials(stage).find(item=>item.resource.title==='海尼曼');
  app.S.modal={stageId:stage.id};
  const unit=app.stageResourceUnit(item.resource.id);assert.ok(unit.children.length>1);
  const tree=app.resourceDetail(item.resource),first=reading(tree);assert.ok(first.books.every(book=>book.group==='A'));
  const next=nodes(tree,n=>n.props?.onclick&&n.props['aria-pressed']==='false')[0];assert.ok(next);next.props.onclick();
  const second=reading(app.resourceDetail(item.resource));assert.ok(second.books.every(book=>book.group==='B'));
  assert.equal(Object.keys(app.S.records).length,0);
});
