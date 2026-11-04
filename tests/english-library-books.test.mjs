import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),B=require('../english/library-books.js'),M=require('../english/model.js');
const read=id=>JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)));
const data=read('resource-books'),raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan')},catalog=M.normalize(raw);

test('书目身份、版本、主题和来源完整，目录变更不改变作者阶段参考',()=>{
  assert.equal(new Set(data.books.map(b=>b.id)).size,data.books.length);
  for(const b of data.books){
    assert.ok(catalog.resources.some(r=>r.id===b.resourceId),b.resourceId);
    assert.ok(b.title&&b.edition&&b.topicBasis,b.title);
    assert.ok(b.sourceIds.length,b.title);
    assert.ok(b.sourceIds.every(id=>data.sources.some(s=>s.id===id)),b.title);
    assert.ok(b.topics.every(id=>data.topics.some(t=>t.id===id)),b.title);
  }
  const changed=M.normalize({...raw,resourceBooks:{books:[]}});
  const references=c=>c.stages.map(st=>M.compareStages(c,st.id).map(r=>[r.routeId,r.stageReferences.map(ref=>ref.stageId)]));
  const expected=references(catalog);assert.ok(expected.some(rows=>rows.some(([,ids])=>ids.length)));
  assert.deepEqual(references(changed),expected);
});

test('级别范围先展开，主题与路线及阶段取同一原引用的交集',()=>{
  const resource={id:'test',title:'测试',type:'reader',appearances:[{routeId:'xu',stageId:'xu-one',level:'1–3'},{routeId:'qing',stageId:'qing-one',level:'2'}]};
  const book={id:'b',resourceId:'test',title:'A Boat',level:'2',edition:'版次',topics:['transport']};
  const [entry]=B.entries({books:[book]},[resource],M);
  assert.equal(entry.appearances.length,2);
  assert.equal(B.filter([entry],data,{route:'xu',stageIds:['xu-one'],topic:'transport'}).length,1);
  assert.equal(B.filter([entry],data,{route:'xu',stageIds:['qing-one'],topic:'transport'}).length,0);
  assert.equal(B.filter([entry],data,{route:'xu',stageIds:['xu-one'],topic:'animals'}).length,0);
});

test('异版目录不能冒充阶段版本，未分简单难度的书目不替作者分级',()=>{
  const books=B.entries(data,catalog.resources,M),pink=books.filter(b=>b.resourceId==='resource-g7xvo5'),piggie=books.filter(b=>b.resourceId==='resource-e87t8v');
  assert.ok(pink.length&&piggie.length);
  assert.ok(pink.every(b=>b.editionMatch==='reference-only'&&b.appearances.length===0));
  assert.ok(piggie.every(b=>b.editionMatch==='reference-only'&&b.appearances.length===0));
  const basic=books.filter(b=>b.editionMatch==='unleveled-only');
  assert.equal(basic.length,96);
  assert.ok(basic.every(b=>b.appearances.every(a=>!a.level)));
  const resource={id:'edition-test',appearances:[{routeId:'xu',stageId:'open',level:''},{routeId:'qing',stageId:'old-edition',level:'1–3'}]};
  assert.deepEqual(B.bookAppearances({...basic[0],level:'上辑 · 第1册'},resource,M).map(a=>a.stageId),['open']);
});

test('个人绘本按主题和个人选用阶段筛选，其他不混入作者原书单',()=>{
  const custom={id:'library.custom.v1:mine',custom:true,title:'My Bear',type:'book',topics:['动物'],stageRefs:[{routeId:'xu',stageId:'xu-current-300'}]};
  const books=B.entries(data,[...catalog.resources,custom],M);
  assert.equal(B.filter(books,data,{route:'other',stageIds:['xu-current-300'],topic:'animals'}).length,1);
  assert.equal(B.filter(books,data,{route:'other',stageIds:['qing-s1'],topic:'animals'}).length,0);
  assert.ok(B.filter(books,data,{route:'other'}).every(b=>b.custom));
  assert.equal(B.filter(books,data,{query:'MY bear',route:'other'}).length,1);
  assert.equal(B.entries(data,[{...custom,type:'animation'}],M).length,0);
});
