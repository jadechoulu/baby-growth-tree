import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../english/model.js'),P=require('../english/practice.js');
const read=id=>JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)));
const raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan')};
const catalog=M.normalize(raw);
const cat=stage=>M.getStageMaterials(catalog,stage).find(item=>item.resource.title==='大猫分级');

test('同一大猫套系的用途随路线、阶段和资料版本分别确定',()=>{
  assert.equal(cat('qing-s1').role.kind,'auxiliary');
  assert.equal(cat('qing-s2').role.kind,'auxiliary');
  assert.equal(cat('qing-s3').role.kind,'main');
  assert.equal(cat('qing-s6').role.kind,'main');
  assert.equal(cat('qing-s7').role.kind,'auxiliary');
  assert.equal(cat('xu-3').role.kind,'auxiliary');
  assert.equal(cat('xu-current-300').role.kind,'reference');
  assert.equal(cat('xu-current-300').role.label,'并行选读');
  assert.equal(cat('banana-1').role.kind,'reference');
});

test('作者未划分主辅时不以摘要、套系共用、活动分支或整理字段推断',()=>{
  const book=cat('banana-1'),stage=catalog.stages.find(s=>s.id==='banana-1');
  const withSummary={...stage,raw:{...stage.raw,summary:book.resource.title}};
  const withoutSummary={...stage,raw:{...stage.raw,summary:''}};
  for(const st of [withSummary,withoutSummary])assert.equal(M.getStageMaterials(catalog,st).find(i=>i.resource.id===book.resource.id).role.kind,'reference');
  assert.equal(cat('xu-2').material.role,'core');
  assert.equal(cat('xu-2').role.kind,'reference');
  assert.equal(cat('xu-panorama-listening-500').role.kind,'reference');
  const execution=catalog.stages.filter(s=>s.variantId==='xu-thousand').flatMap(st=>M.getStageMaterials(catalog,st));
  assert.ok(execution.some(i=>i.material.role==='main'));
  assert.ok(execution.filter(i=>i.material.role==='main'||i.material.role==='core').every(i=>i.role.kind==='reference'));
});

test('展示角色纠正不改原始引用、来源、级别或个人记录键',()=>{
  const before=structuredClone(catalog);
  for(const stage of catalog.stages){
    for(const item of M.getStageMaterials(catalog,stage)){
      const key=P.unitKey(stage,item);
      const changed={...item,role:{kind:'main',label:'展示变化',basis:'展示依据变化'}};
      assert.equal(P.unitKey(stage,changed),key);
    }
  }
  assert.deepEqual(catalog,before);
});
