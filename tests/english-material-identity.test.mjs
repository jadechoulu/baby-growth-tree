import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../english/model.js'),P=require('../english/practice.js'),B=require('../english/library-books.js'),BP=require('../english/book-progress.js');
const read=id=>JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)));
const volumes=read('resource-volumes'),books=read('resource-books');
const raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan'),resourceVolumes:volumes};
const catalog=M.normalize(raw);

test('已核同套系只有一个素材实体，原路线引用、版本与单册身份共同归入该素材',()=>{
  const entries=B.entries(books,catalog.resources,M,volumes);
  assert.equal(new Set(entries.map(b=>b.id)).size,entries.length);
  for(const alias of volumes.series.filter(s=>s.catalogResourceId)){
    assert.ok(!catalog.resources.some(r=>r.id===alias.resourceId));
    const resource=catalog.resources.find(r=>r.id===alias.catalogResourceId);
    assert.ok(resource,alias.resourceId);
    assert.ok(resource.mergedResourceIds.includes(alias.resourceId));
    assert.ok(catalog.stages.every(s=>s.materials.every(m=>m.resourceId!==alias.resourceId)));
    assert.ok(M.publicationScopes(volumes,resource.id).length);
    const expected=books.books.filter(b=>[resource.id,alias.resourceId].includes(b.resourceId));
    assert.ok(expected.every(b=>entries.some(entry=>entry.id===b.id&&entry.resource===resource)));
  }
  const scholastic=entries.filter(book=>book.resource.id==='resource-1cn6i3m');
  assert.equal(B.seriesGroups(scholastic,books).length,1,'历史素材书目不再生成重复的套系筛选Tab');
});

test('统一素材名称与入口不改变所有来源阶段和执行节点的既有进度键',()=>{
  const previous=structuredClone(volumes);
  for(const entry of previous.series)delete entry.catalogResourceId;
  const before=M.normalize({...raw,resourceVolumes:previous});
  const keys=c=>new Set(c.stages.flatMap(stage=>M.getStageMaterials(c,stage).map(item=>P.unitKey(stage,item))));
  assert.deepEqual(keys(catalog),keys(before));
  for(const route of ['xu','qing']){
    const previousKeys=M.getRoutePlan(before,route,'listening').stages.flatMap(stage=>M.getStageMaterials(before,stage).map(item=>P.unitKey(stage,item))).sort();
    const nextKeys=M.getRoutePlan(catalog,route,'listening').stages.flatMap(stage=>M.getStageMaterials(catalog,stage).map(item=>P.unitKey(stage,item))).sort();
    assert.deepEqual(nextKeys,previousKeys);
  }
});

test('历史素材的数量无损回读，新共用数量包括撤回到零均优先，不叠加重复进度',()=>{
  const resource=catalog.resources.find(r=>r.id==='resource-166ekar');
  const scope=M.publicationScopes(volumes,resource.id).find(s=>s.id==='pearson-speaking400-upper');
  const oldId='resource-1vpccvb',records=P.sharedQuantityUpdate({},oldId,scope,3,'本');
  const original=structuredClone(records);
  assert.equal(P.sharedQuantity(records,resource.id,scope,'本',undefined,resource.mergedResourceIds).completed,3);
  const updated={...records,...P.sharedQuantityUpdate(records,resource.id,scope,0,'本')};
  assert.equal(P.sharedQuantity(updated,resource.id,scope,'本',undefined,resource.mergedResourceIds).completed,0);
  assert.deepEqual(records,original);
  assert.ok(Object.keys(records).every(key=>Object.hasOwn(updated,key)));
});

test('历史入口与统一素材共用逐册勾选，新增完整目录不会复制个人事实',()=>{
  const old='resource-1wpc6vb',id='resource-141vfh7';
  const oldPlans=BP.catalogPlans(books,volumes,old),plans=BP.catalogPlans(books,volumes,id);
  assert.deepEqual(oldPlans,plans);
  const book=plans[0].books[0],records=BP.manualUpdate({},book.id,true);
  assert.equal(BP.directoryProgress(records,books,volumes,old).completed,1);
  assert.equal(BP.directoryProgress(records,books,volumes,id).completed,1);
  assert.equal(BP.directoryProgress({...records,...BP.manualUpdate(records,book.id,false)},books,volumes,id).completed,0);
});
