import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),H=require('../english/hello-reading.js'),T=require('../english/topics.js'),G=require('../english/hello-graph.js');
const read=name=>JSON.parse(readFileSync(new URL('../english/data/'+name,import.meta.url)));
const data=read('hello-reading.json'),content=new Map(read('hello-rhyme-content.json').map(r=>[r.id,r]));
for(const rhyme of data.rhymes)Object.assign(rhyme,content.get(rhyme.id));

test('Hello家居主题只命中本Part，不借同册生活场景扩散',()=>{
  const before=JSON.stringify(data),found=H.browse(data,{book:'hello-01',topic:'home'});
  assert.deepEqual(found.scenes.map(row=>row.part.part),[3]);
  assert.equal(found.books.length,1);
  assert.deepEqual(found.books[0].parts.map(p=>p.scene),['家里的房间']);
  assert.ok(!found.rhymes.some(row=>row.rhyme.title==='Can You?'));
  assert.equal(H.browse(data,{book:'hello-01',topic:'home',scene:'睡觉'}).scenes.length,0);
  assert.equal(JSON.stringify(data),before);
});

test('一级包含二级，洗漱与书号曲调原场景保持同一Part交集',()=>{
  const filters={book:['hello-01','hello-18'],topic:'daily',subtopic:'daily.wash',tune:'The Farmer in the Dell'};
  const found=H.browse(data,filters);
  assert.deepEqual(found.scenes.map(row=>[row.book.id,row.part.part]),[['hello-18',2]]);
  assert.deepEqual(found.rhymes.map(row=>row.rhyme.title),['My Toothbrush']);
  assert.ok(H.browse(data,{topic:'daily'}).scenes.length>H.browse(data,{topic:'daily',subtopic:'daily.wash'}).scenes.length);
  assert.equal(H.browse(data,{...filters,topic:'home'}).scenes.length,0);
  assert.equal(H.browse(data,{...filters,scene:'睡觉'}).rhymes.length,0);
});

test('公共主题和原场景均可查找，候选只来自当前主题交集',()=>{
  assert.ok(H.searchSuggestions(data,{},'家居').some(item=>item.kind==='topic'&&item.value==='home'));
  assert.ok(H.searchSuggestions(data,{topic:'daily',subtopic:'daily.wash'},'刷').some(item=>item.kind==='scene'&&item.value==='刷牙'));
  assert.deepEqual(H.searchSuggestions(data,{topic:'home',subtopic:'home.rooms'},'toothbrush'),[]);
  assert.ok(H.searchSuggestions(data,{topic:'home',subtopic:'home.objects'},'toothbrush').some(item=>item.label==='My Toothbrush'));
  assert.ok(H.browse(data,{query:'家居'}).scenes.every(({book,part})=>T.matches(H.partTopics(data,book,part),{topic:'home'})));
});

test('主题筛选后的关系图保留原ID与归属，并排除同册未命中的Part',()=>{
  const before=JSON.stringify(data),scoped=H.topicGraphData(data,{topic:'home'}),graph=G.buildGraph(scoped);
  assert.ok(graph.nodes.some(n=>n.id==='hello-01-part-3'));
  assert.ok(!graph.nodes.some(n=>n.id==='hello-01-part-1'));
  assert.ok(!graph.nodes.some(n=>n.id==='hello-01-part-2'));
  for(const b of scoped.books)for(const p of b.parts)assert.ok(T.matches(H.partTopics(data,b,p),{topic:'home'}));
  for(const r of scoped.rhymes)assert.ok(data.rhymes.some(original=>original.id===r.id&&original.partIds.join()===r.partIds.join()));
  assert.equal(JSON.stringify(data),before);
  assert.equal(H.topicGraphData(data),data);
});
