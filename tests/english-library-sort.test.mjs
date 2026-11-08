import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const M=createRequire(import.meta.url)('../english/model.js');
const catalog={stages:[
  {id:'early',routeId:'qing',order:1},
  {id:'later',routeId:'qing',order:2},
  {id:'other',routeId:'banana',order:1}
]};
const appearance=(stageId,role='主线',extra={})=>({stageId,routeId:stageId==='other'?'banana':'qing',role,...extra});
const resource=(id,...appearances)=>({id,appearances});
const ids=(entries,filters)=>M.sortLibraryMaterials(catalog,entries,filters).map(r=>r.id);

test('图鉴标题用途随阶段与路线交集变化，不把整套固定成主线',()=>{
  const entry=resource('series',appearance('early','辅线'),appearance('later'));
  assert.equal(M.libraryMaterialRole(catalog,entry,{stageIds:['early']}).kind,'auxiliary');
  assert.equal(M.libraryMaterialRole(catalog,entry,{stageIds:['later'],route:'qing'}).kind,'main');
  assert.equal(M.libraryMaterialRole(catalog,entry,{stageIds:['later'],route:'banana'}),null);
  assert.equal(M.libraryMaterialRole(catalog,entry,{}),null);
});

test('多阶段用途冲突或尚未核定时保留中性，不借筛选外主线',()=>{
  const entry=resource('series',appearance('early','辅线'),appearance('later'));
  assert.equal(M.libraryMaterialRole(catalog,entry,{stageIds:['early','later']}).kind,'reference');
  const unresolved=resource('series',appearance('early','主线',{roleEvidence:{status:'unresolved'}}));
  assert.equal(M.libraryMaterialRole(catalog,unresolved,{stageIds:['early']}).kind,'reference');
});

test('主题单册用途只读取本册引用，不从整套借用角色',()=>{
  const book={resource:resource('series',appearance('early')),appearances:[appearance('later','辅线')]};
  assert.equal(M.libraryMaterialRole(catalog,book,{stageIds:['early']}),null);
  assert.equal(M.libraryMaterialRole(catalog,book,{stageIds:['later']}).kind,'auxiliary');
});

test('阶段为第一排序键，同阶段采用公共用途顺序，同序保持原顺序',()=>{
  const entries=[resource('later-main',appearance('later')),resource('early-unknown',appearance('early','待核')),
    resource('early-aux',appearance('early','辅线')),resource('early-featured',appearance('early','推荐',{roleEvidence:{status:'confirmed',kind:'featured'}})),
    resource('early-main-b',appearance('early')),resource('early-main-a',appearance('early')),resource('no-stage')];
  const before=structuredClone(entries);
  assert.deepEqual(ids(entries),['early-main-b','early-main-a','early-aux','early-unknown','early-featured','later-main','no-stage']);
  assert.deepEqual(entries,before);
});

test('较晚阶段的主线不能替换同一素材在最早阶段的辅线用途',()=>{
  const entries=[resource('multi',appearance('early','辅线'),appearance('later')),
    resource('early-main',appearance('early')),resource('early-aux',appearance('early','辅线'))];
  assert.deepEqual(ids(entries),['early-main','multi','early-aux']);
});

test('路线与阶段筛选取同一引用交集，不借用筛选外的阶段和主线',()=>{
  const entries=[resource('multi',appearance('other'),appearance('later','辅线')),
    resource('qing-early',appearance('early','辅线')),resource('qing-later',appearance('later'))];
  assert.deepEqual(ids(entries,{route:'qing'}),['qing-early','qing-later','multi']);
  assert.deepEqual(ids(entries,{route:'qing',stageIds:['later']}),['qing-later','multi','qing-early']);
});

test('未核定主辅仍按未标主辅排序，不能由旧用途猜成主线',()=>{
  const entries=[resource('unresolved',appearance('early','主线',{roleEvidence:{status:'unresolved',kind:'reference'}})),
    resource('aux',appearance('early','辅线'))];
  assert.deepEqual(ids(entries),['aux','unresolved']);
});

test('主题单册仅按本册实际引用排序，个人素材使用个人阶段参考',()=>{
  const entries=[{id:'later-book',resource:resource('series',appearance('early')),appearances:[appearance('later')]},
    {id:'personal',custom:true,stageRefs:[appearance('early')]}];
  assert.deepEqual(ids(entries),['personal','later-book']);
  assert.deepEqual(ids(entries,{route:'other'}),['personal','later-book']);
});


test('默认执行主表优先于补充资料的同名序号，显式筛选补充阶段仍可正常排序',()=>{
  const configured={...catalog,raw:{routePlan:{routes:{qing:{listening:{stageIds:['early','later']}}}}}};
  const entries=[resource('supplement',appearance('other')),resource('both',appearance('other'),appearance('later','辅线')),resource('start',appearance('early'))];
  configured.stages=[...configured.stages,{id:'supplement',routeId:'qing',order:1}];
  entries[0].appearances=[appearance('supplement')];entries[1].appearances=[appearance('supplement'),appearance('later','辅线')];
  assert.deepEqual(M.sortLibraryMaterials(configured,entries).map(e=>e.id),['start','both','supplement']);
  assert.deepEqual(M.sortLibraryMaterials(configured,entries,{stageIds:['supplement']}).map(e=>e.id),['supplement','both','start']);
});

test('全部路线按有据听力区间排序，不把庆爸常规1排在许密杉零起步材料之前',()=>{
  const configured={stages:[
    {id:'xu-300',routeId:'xu',domain:'listening',variantId:'xu-current',order:1,raw:{listeningTargetWords:300}},
    {id:'qing-1',routeId:'qing',domain:'listening',order:1,raw:{vocabularyMin:200,vocabularyMax:300}},
    {id:'xu-500',routeId:'xu',domain:'listening',variantId:'xu-current',order:2,raw:{listeningTargetWords:500}}
  ],raw:{routePlan:{routes:{xu:{listening:{stageIds:['xu-300','xu-500']}},qing:{listening:{stageIds:['qing-1']}}}}}};
  const entries=[resource('qing-main',{routeId:'qing',stageId:'qing-1',role:'主线'}),
    resource('flashcards',{routeId:'xu',stageId:'xu-300',role:'闪卡'}),
    resource('later-main',{routeId:'xu',stageId:'xu-500',roleEvidence:{status:'confirmed',kind:'main'}}),
    resource('start-main',{routeId:'xu',stageId:'xu-300',roleEvidence:{status:'confirmed',kind:'main'}})];
  assert.deepEqual(M.sortLibraryMaterials(configured,entries).map(e=>e.id),['start-main','flashcards','qing-main','later-main']);
});

test('无词量路线以最强素材重合关联排序，不采用更早但重合更低的阶段',()=>{
  const mat=id=>({resourceId:id,level:'1',role:'未定'});
  const configured={resources:[{id:'x',title:'X',type:'reader'},{id:'y',title:'Y',type:'reader'}],stages:[
    {id:'xu-300',routeId:'xu',domain:'listening',variantId:'xu-current',order:1,raw:{listeningTargetWords:300},materials:[mat('x'),mat('y')]},
    {id:'qing-1',routeId:'qing',domain:'listening',order:1,raw:{vocabularyMin:200,vocabularyMax:300},materials:[mat('x')]},
    {id:'banana-pre',routeId:'banana',domain:'listening',order:1,raw:{},materials:[mat('x')]}
  ],raw:{routePlan:{routes:{xu:{listening:{stageIds:['xu-300']}},qing:{listening:{stageIds:['qing-1']}},banana:{listening:{stageIds:['banana-pre'],stageComparison:{strategy:'material-overlap'}}}}}}};
  const entries=[resource('banana-book',{routeId:'banana',stageId:'banana-pre',role:'未定'}),
    resource('flashcards',{routeId:'xu',stageId:'xu-300',role:'闪卡'}),
    resource('qing-main',{routeId:'qing',stageId:'qing-1',role:'主线'})];
  const before=structuredClone(configured);
  assert.deepEqual(M.sortLibraryMaterials(configured,entries).map(e=>e.id),['flashcards','qing-main','banana-book']);
  assert.deepEqual(configured,before);
});

test('路线筛选按执行主表真实顺序，不按其他版本的原始序号或词量替换',()=>{
  const configured={stages:[
    {id:'merged-start',routeId:'xu',domain:'listening',order:9,raw:{listeningTargetWords:300}},
    {id:'merged-next',routeId:'xu',domain:'listening',order:1,raw:{listeningTargetWords:500}}
  ],raw:{routePlan:{routes:{xu:{listening:{stageIds:['merged-start','merged-next']}}}}}};
  const entries=[resource('next',{routeId:'xu',stageId:'merged-next',roleEvidence:{status:'confirmed',kind:'main'}}),
    resource('start',{routeId:'xu',stageId:'merged-start',role:'未定'})];
  assert.deepEqual(M.sortLibraryMaterials(configured,entries,{route:'xu'}).map(e=>e.id),['start','next']);
});
