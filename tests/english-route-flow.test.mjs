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
