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

test('阶段为第一排序键，同阶段采用公共用途顺序，同序保持原顺序',()=>{
  const entries=[resource('later-main',appearance('later')),resource('early-unknown',appearance('early','待核')),
    resource('early-aux',appearance('early','辅线')),resource('early-featured',appearance('early','推荐',{roleEvidence:{status:'confirmed',kind:'featured'}})),
    resource('early-main-b',appearance('early')),resource('early-main-a',appearance('early')),resource('no-stage')];
  const before=structuredClone(entries);
  assert.deepEqual(ids(entries),['early-main-b','early-main-a','early-featured','early-aux','early-unknown','later-main','no-stage']);
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
