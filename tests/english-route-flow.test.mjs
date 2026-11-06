import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const M=createRequire(import.meta.url)('../english/model.js');
const read=id=>JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)));
const raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan')};
const catalog=M.normalize(raw);
const profile={birthDate:'2024-11-24',asOf:'2026-11-03'};

test('许密杉以五个词量节点引用六阶段要求，原阶段与记录身份保留',()=>{
  const plan=M.getRoutePlan(catalog,'xu','listening',profile),route=catalog.routes.find(r=>r.id==='xu');
  assert.deepEqual(plan.stageIds,['xu-node-300','xu-node-500','xu-node-800','xu-node-1000','xu-node-2000']);
  assert.deepEqual(plan.stages.map(stage=>stage.title),['300词','500词','800词','1000词','2000词']);
  assert.equal(route.defaultVariantId,'xu-word-nodes');
  assert.deepEqual(route.stages,plan.stages);
  const flow=M.getStageFlow(catalog,'xu-node-300',profile);
  assert.equal(flow.parallel.length,2);
  assert.ok(flow.parallel.every(item=>item.resourceIds.length>0));
  assert.deepEqual(flow.parallel.map(item=>[item.sourceId,item.page]),[['xu-live-core',2],['xu-live-notes',1]]);
  assert.equal(flow.nextStageId,'xu-node-500');
  assert.equal(flow.later.length,0);
  assert.equal(plan.legacyStages.length,0,'默认选择器不重复列出旧节点');
  assert.equal(M.getStageFlow(catalog,'xu-current-300',profile),null,'旧五节点不再重复作为执行路线');
  assert.equal(M.getStageFlow(catalog,'xu-panorama-reading-literacy',profile),null);
  for(const [id,level] of [['xu-3','A'],['xu-4','B'],['xu-5','C'],['xu-6','3-5']]){
    const items=M.getStageMaterials(catalog,id);
    assert.ok(items.some(item=>item.role.kind==='main'&&item.material.level===level),id);
    assert.ok(items.filter(item=>item.material.role==='parallel').every(item=>item.role.kind==='auxiliary'),id);
  }
  const volumes=read('resource-volumes');
  for(const [id,level,total] of [['xu-3','A',43],['xu-4','B',15],['xu-5','C',12]]){
    const main=M.getStageMaterials(catalog,id).find(item=>item.role.kind==='main');
    const scopes=M.publicationLevelScopes(volumes,main.resource.id,[level],id);
    assert.equal(scopes.find(scope=>scope.default).total,total,'复用已确认GK70公共分级数量，不在路线重复维护');
  }
  const detail=plan.stages[2].activities;
  assert.match(detail.find(a=>a.title==='精听四步法').method,/家长说生词，孩子指画面/);
  assert.equal(detail.find(a=>a.title==='精听四步法').sourceId,'xu-live-notes','文字笔记不能冒充截图逐字原文');
  const r=catalog.resources.find(r=>r.title==='大猫分级');
  assert.ok(M.getSeriesProgression(catalog,r.id).flatMap(g=>g.stages).every(s=>!plan.legacyStageIds.includes(s.stageId)&&!plan.supersededStageIds.includes(s.stageId)));
});

test('庆爸保留原文进阶条件，不用词数目标代替测试和时数',()=>{
  for(const stage of raw.qing.stages){
    const flow=M.getStageFlow(catalog,stage.id,profile);
    assert.equal(flow.advance,stage.exit);
    assert.equal(flow.referenceOnly,true);
    assert.equal(flow.later.length,0);
  }
  assert.match(M.getStageFlow(catalog,'qing-s6',profile).advance,/400小时/);
});

test('香蕉妈妈后续输出按当前年龄case选择，且低龄只标参考',()=>{
  const low=M.getStageFlow(catalog,'banana-pre',profile);
  assert.equal(low.referenceOnly,true);
  assert.deepEqual(low.later.map(item=>item.stageId),['banana-3','banana-chapter']);
  const four=M.getStageFlow(catalog,'banana-pre',{birthDate:'2022-01-01',asOf:'2026-11-03'});
  assert.equal(four.referenceOnly,false);
  assert.deepEqual(four.later.map(item=>item.stageId),['banana-3','banana-4']);
  const six=M.getStageFlow(catalog,'banana-pre',{birthDate:'2020-01-01',asOf:'2026-11-03'});
  assert.deepEqual(six.later.map(item=>item.stageId),['banana-2','banana-4']);
  assert.ok(six.later.every(item=>item.page===3));
});

test('香蕉妈妈已加入的输出留在本阶段并行安排，年龄不明或超范围不借用方案',()=>{
  const current=M.getStageFlow(catalog,'banana-3',{birthDate:'2022-01-01',asOf:'2026-11-03'});
  assert.ok(current.parallel.some(item=>/跟读Pre/.test(item.text)));
  assert.equal(current.later.some(item=>item.stageId==='banana-3'),false);
  for(const p of [{},{birthDate:'2015-01-01',asOf:'2026-11-03'}]){
    const flow=M.getStageFlow(catalog,'banana-pre',p);
    assert.equal(flow.parallel.length,0);
    assert.equal(flow.later.length,0);
    assert.equal(flow.advance,'');
  }
});

test('香蕉妈妈显式按素材重合关联，正反向使用同一组主对照',()=>{
  const view={...catalog,routes:catalog.routes.map(route=>({...route,stages:M.getRoutePlan(catalog,route.id,'listening',profile).stages}))};
  const before=structuredClone(view);
  for(const stage of view.routes.find(r=>r.id==='banana').stages){
    for(const group of M.compareStages(view,stage.id)){
      assert.equal(group.materialComparable,true);
      if(group.matches.some(m=>m.overlapCount||m.unspecifiedCount))assert.ok(group.stageReferences.length>0,stage.id+' 应有素材重合参考');
      else assert.equal(group.stageReferences.length,0,'级别不重合时不强行关联');
      for(const match of group.stageReferences){
        assert.ok(match.materialAlignment.score>0);
        assert.equal(match.vocabularyAlignment,null);
        assert.equal(match.startingAlignment,null);
        const reverse=M.compareStages(view,match.stageId).find(g=>g.routeId==='banana');
        const back=reverse.stageReferences.find(m=>m.stageId===stage.id);
        assert.ok(back,stage.id+' ↔ '+match.stageId);
        assert.equal(back.materialAlignment.score,match.materialAlignment.score);
      }
    }
  }
  assert.deepEqual(view,before,'不改阶段、原始引用或晋级条件');
});

test('素材重合策略按套系去重，级别不同不计匹配，其他路线仍由词汇目标对应',()=>{
  const duplicate={...catalog,stages:catalog.stages.map(s=>({...s,materials:s.materials.concat(s.materials)})),routes:catalog.routes.map(r=>({...r,stages:r.stages.map(s=>({...s,materials:s.materials.concat(s.materials)}))}))};
  for(const stage of catalog.routes.find(r=>r.id==='banana').stages){
    const summary=c=>M.compareStages(c,stage.id).map(g=>[g.routeId,g.stageReferences.map(m=>[m.stageId,m.materialAlignment.score])]);
    assert.deepEqual(summary(duplicate),summary(catalog));
  }
  const cleared={...catalog,stages:catalog.stages.map(s=>({...s,materials:[]})),routes:catalog.routes.map(r=>({...r,stages:r.stages.map(s=>({...s,materials:[]}))}))};
  assert.ok(M.compareStages(cleared,'banana-1').every(g=>!g.stageReferences.length));
  const group=M.compareStages(catalog,'xu-6').find(g=>g.routeId==='qing');
  assert.equal(group.materialComparable,false);
  assert.ok(group.stageReferences.every(m=>m.vocabularyAlignment&&!m.materialAlignment));
});
