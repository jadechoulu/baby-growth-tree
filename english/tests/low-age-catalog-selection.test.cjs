const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const P=require('../practice.js');
const BP=require('../book-progress.js');
const EnglishModel=require('../model.js');
const BOOKS=require('../data/resource-books.json');
const READING=require('../data/reading-plans.json');
const resourceVolumes=require('../data/resource-volumes.json');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');

function fixture(routeId='low-age'){
  const first=source.indexOf('function practiceSelectableScopes(');
  const last=source.indexOf('function practiceCatalogLinks(',first);
  assert.ok(first>=0&&last>first);
  const context={P,BP,EnglishModel,BOOKS,READING,
    stages:new Map([['fixture-stage',{routeId}]]),byId:new Map(),
    practiceRawRecord:unit=>unit.record,
    practiceQuantityUnit:unit=>EnglishModel.publicationEntry(resourceVolumes,unit.resourceId)?.unit||'本',
    window:{ROADMAP_RAW:{resourceVolumes}}};
  vm.createContext(context);
  vm.runInContext(source.slice(first,last),context,{filename:'actual-catalog-selection.js'});
  const scopeFirst=source.indexOf('function practiceBookScope(');
  const scopeLast=source.indexOf('function practiceBookLabel(',scopeFirst);
  vm.runInContext(source.slice(scopeFirst,scopeLast),context,{filename:'actual-scope-readback.js'});
  return context;
}
function unit(resourceId,level){
  return {resourceId,stageId:'fixture-stage',label:resourceId,bookScopes:[],
    item:{materials:[{sourceId:'low-age',level}]}};
}

test('低幼描述性级别可显式选择公共目录，保存后仍可打开同版逐本计划',()=>{
  const app=fixture();
  for(const [resourceId,level] of [
    ['resource-168yypj','实物图单词书'],
    ['resource-yjrejm','小蝌蚪点读引进版'],
    ['resource-hmas6r','引进版双语']
  ]){
    const u=unit(resourceId,level);
    assert.equal(P.bookScope(undefined,u.bookScopes),null,'不自动使用出版候选作为阶段分母');
    const choices=app.practiceCatalogChoices(u);
    assert.ok(choices.length>0,resourceId+'应提供已核目录入口');
    for(const choice of choices){
      const record=P.unitBookScopeUpdate(choice.scope);
      const restored=P.bookScope(record,u.bookScopes);
      assert.equal(restored.id,choice.scope.id);
      assert.equal(restored.edition,choice.scope.edition);
      const plan=BP.planForResource(READING,resourceId,BOOKS,resourceVolumes,restored);
      assert.ok(plan,'序列化后不能丢失目录关联');
      const group=BP.scopeGroup(plan,restored);
      assert.notEqual(group,null);
      const selected=BP.books(plan,group);
      assert.equal(selected.length,restored.total,'目录数量必须对应所选范围');
      const records=BP.manualUpdate({},selected[0].id,true);
      const progress=BP.projectQuantity(records,plan,restored,{completed:0});
      assert.equal(progress.completed,1,'逐本完成与公共图鉴使用同一事实');
      assert.equal(BP.bookState(records,selected[0].id).done,true);
    }
    assert.equal(u.bookScopes.length,0,'提供候选不修改自动解析范围');
  }
});

test('选择目录不把原三态完成扩散到目录内每一本',()=>{
  const app=fixture(),u=unit('resource-yjrejm','小蝌蚪点读引进版');
  const choice=app.practiceCatalogChoices(u)[0];
  const previous=P.unitUpdate('done','既有整项状态','2026-11-18');
  const record=P.unitBookScopeUpdate(choice.scope,previous);
  const scope=P.bookScope(record,[]);
  const plan=BP.planForResource(READING,u.resourceId,BOOKS,resourceVolumes,scope);
  assert.equal(BP.projectQuantity({},plan,scope,{completed:0}).completed,0);
  for(const book of BP.books(plan,BP.scopeGroup(plan,scope)))assert.equal(BP.bookState({},book.id).done,false);
});

test('同素材候选回退只服务低幼，既有明确范围保持不变',()=>{
  const low=fixture(),other=fixture('qing'),u=unit('resource-yjrejm','未匹配描述');
  assert.equal(other.practiceSelectableScopes(u).length,0);
  const exact=P.bookScopes(u.resourceId,[],resourceVolumes)[0];
  u.bookScopes=[exact];
  assert.equal(low.practiceSelectableScopes(u),u.bookScopes);
  assert.equal(other.practiceSelectableScopes(u),u.bookScopes);
});

test('全部低幼可供选择的逐本目录保存后保留完整范围，并关联等量单册',()=>{
  const app=fixture(),raw={resourceVolumes};
  for(const id of ['banana','xu','qing','low-age'])raw[id]=require('../data/'+id+'.json');
  const resources=EnglishModel.normalize(raw).resources.filter(r=>r.appearances.some(a=>a.routeId==='low-age'));
  let checked=0;
  const failures=[];
  for(const resource of resources){
    const u=unit(resource.id,'描述性范围待核');
    assert.equal(app.practiceBookScope(u),null,'没有私人选版时不得自动绑定');
    for(const choice of app.practiceCatalogChoices(u)){
      checked++;
      try{
        u.record=P.unitBookScopeUpdate(choice.scope);
        const restored=app.practiceBookScope(u);
        const plan=BP.planForResource(READING,choice.resourceId,BOOKS,resourceVolumes,restored);
        const group=BP.scopeGroup(plan,restored);
        assert.notEqual(group,null,'所提供的逐本候选应当能关联计划');
        assert.equal(BP.books(plan,group).length,restored.total,'保存后不能丢组合范围');
      }catch(error){failures.push(resource.title+' · '+choice.scope.label+'：'+error.message);}
    }
  }
  assert.ok(checked>0);
  assert.deepEqual(failures,[]);
});
