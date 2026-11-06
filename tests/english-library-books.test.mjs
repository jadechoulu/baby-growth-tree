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

test('主题套系分组覆盖全部结果，RAZ级别分开且培生上下辑共用一个入口',()=>{
  const books=B.entries(data,catalog.resources,M),groups=B.seriesGroups(books,data);
  assert.equal(groups.reduce((sum,group)=>sum+group.count,0),books.length);
  const aa=groups.find(group=>group.label==='RAZ AA'),a=groups.find(group=>group.label==='RAZ A');
  assert.equal(aa.count,103);assert.equal(a.count,100);assert.notEqual(aa.id,a.id);
  const pearson=groups.find(group=>group.label==='培生幼儿英语基础词汇');
  assert.equal(pearson.count,96);
  const selected=B.filter(books,data,{series:pearson.id});
  assert.equal(new Set(selected.map(book=>book.edition)).size,2);
  assert.equal(new Set(selected.map(book=>book.id)).size,96);
});

test('套系与一级二级主题、路线条件取交集，全部套系恢复完整主题结果',()=>{
  const books=B.entries(data,catalog.resources,M),filters={topic:'animals',subtopic:'animals.birds'};
  const matching=B.filter(books,data,filters),groups=B.seriesGroups(matching,data),a=groups.find(group=>group.label==='RAZ A');
  assert.ok(a);
  const selected=B.filter(books,data,{...filters,series:a.id});
  assert.equal(selected.length,a.count);assert.equal(selected.length,3);
  assert.ok(selected.every(book=>book.level==='A'));
  assert.equal(B.filter(books,data,{...filters,series:a.id,route:'other'}).length,0);
  assert.deepEqual(B.filter(books,data,{...filters,series:'all'}),matching);
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

test('主题筛选只接纳有来源的内容或分类核对，未读内容不凭书名命中',()=>{
  const sourceIds=new Set(data.sources.map(s=>s.id));
  for(const book of data.books){
    assert.ok(['content-verified','classification-verified','pending','title-fallback'].includes(book.topicStatus),book.title);
    if(book.topicStatus==='pending')assert.deepEqual(book.topics,[],book.title);
    else {
      assert.ok(book.topicEvidence.length,book.title);
      for(const evidence of book.topicEvidence){
        assert.ok(sourceIds.has(evidence.sourceId),book.title);
        assert.ok(evidence.locator&&evidence.summary,book.title);
      }
    }
    if(book.topicStatus==='title-fallback')assert.ok(data.seriesResearch.find(r=>r.resourceId===book.resourceId)?.searchLog.length,book.title);
  }
  const books=B.entries(data,catalog.resources,M),pending=books.filter(b=>b.topicStatus==='pending');
  for(const topic of data.topics)assert.equal(B.filter(pending,data,{topic:topic.id}).length,0);
});

test('内容核对纠正同名误判，分版本分类及句型不混用',()=>{
  const pearson=data.books.filter(b=>b.resourceId==='resource-1nuqi5t');
  assert.ok(pearson.find(b=>b.title==='A Garden').topics.includes('food'));
  assert.ok(pearson.find(b=>b.title==='I Like Birds').topics.includes('concepts'));
  assert.ok(pearson.find(b=>b.title==='The Snake').topics.includes('clothing'));
  assert.equal(pearson.find(b=>b.title==='The birthday'&&b.level==='3').topicStatus,'pending');
  const scary=data.books.find(b=>b.title==='Pip and Posy: The Scary Monster');
  assert.ok(scary.topics.includes('friendship'));
  assert.ok(!scary.topics.includes('fantasy'));
  const yum=data.books.find(b=>b.resourceId==='resource-g7xvo5'&&b.title==='Yum');
  assert.ok(yum.topics.includes('animals'));
  assert.ok(!yum.topics.includes('food'));
});

test('每套查证记录可直接呈现，分类配图存在且不公开浏览器会话',()=>{
  assert.equal(data.seriesResearch.length,new Set(data.books.map(b=>b.resourceId)).size);
  for(const research of data.seriesResearch){
    assert.ok(Array.isArray(research.readingGuide));
    assert.ok(Array.isArray(research.searchLog));
  }
  for(const source of data.sources){
    assert.ok(!source.url?.includes('xsec_token'),source.id);
    for(const image of source.images||[]){
      assert.ok(Number.isInteger(image.page),source.id);
      assert.ok(fs.existsSync(new URL('../english/'+image.path,import.meta.url)),image.path);
    }
  }
  for(const book of data.books)if(book.cover)assert.ok(fs.existsSync(new URL('../english/'+book.cover,import.meta.url)),book.cover);
});
