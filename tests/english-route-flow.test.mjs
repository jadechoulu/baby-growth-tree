import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const M=createRequire(import.meta.url)('../english/model.js');
const read=id=>JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)));
const raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan')};
const catalog=M.normalize(raw);
const profile={birthDate:'2024-11-24',asOf:'2026-11-03'};

test('许密杉起步的闪卡与绘本同阶段并行，不由听力词数推导其他能力准入',()=>{
  const flow=M.getStageFlow(catalog,'xu-current-300',profile);
  assert.deepEqual(flow.parallel.map(item=>item.text),['闪卡','闪卡式绘本']);
  assert.ok(flow.parallel.every(item=>item.resourceIds.length>0));
  assert.equal(flow.advance,'');
  assert.equal(flow.nextStageId,'xu-current-500');
  assert.equal(flow.later.length,0);
  const changed=M.normalize({...raw,xuCurrent:{...raw.xuCurrent,stages:raw.xuCurrent.stages.map(st=>({...st,materials:[]}))}});
  assert.deepEqual(M.getStageFlow(changed,'xu-current-300',profile).domains,flow.domains);
  assert.equal(M.getStageFlow(catalog,'xu-panorama-reading-literacy',profile),null);
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
  const group=M.compareStages(catalog,'xu-current-800').find(g=>g.routeId==='qing');
  assert.equal(group.materialComparable,false);
  assert.ok(group.stageReferences.every(m=>m.vocabularyAlignment&&!m.materialAlignment));
});
