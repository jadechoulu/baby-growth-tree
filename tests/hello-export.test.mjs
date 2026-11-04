import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),H=require('../english/hello-reading.js'),G=require('../english/hello-graph.js');
const read=name=>JSON.parse(readFileSync(new URL('../english/data/'+name,import.meta.url)));
const base=read('hello-reading.json');
test('曲目类型独立于Hello童谣及音源存放位置，交互和导出保留同一分类依据',()=>{
 const data={...base,tuneAudio:read('hello-tune-audio.json')};
 for(const name of ['Five Little Monkeys','Five Little Ducks','London Bridge Is Falling Down'])assert.equal(H.tuneCategory(data,name).kind,'classic-rhyme');
 assert.equal(H.tuneCategory(data,'Clean Up').kind,'sss-song');
 assert.equal(H.tuneCategory(data,'Edelweiss（雪绒花）').kind,'work-song');
 assert.equal(H.tuneCategory(data,'勃拉姆斯摇篮曲').kind,'classical-music');
 assert.equal(H.tuneCategory(data,'听妈妈的话').kind,'unverified');
 assert.equal(H.tuneCategory({tuneAudio:{tunes:[{name:'新曲',status:'available',file:'hello.mp3'}]}},'新曲').kind,'unverified');
 for(const build of [H.graph,G.buildGraph]){
  const graph=build(data);
  for(const item of data.tuneAudio.tunes){
   assert.ok(item.repertoire.basis);
   assert.deepEqual(graph.nodes.find(node=>node.id==='tune:'+item.name).repertoire,item.repertoire);
   assert.notEqual(item.repertoire.kind,'hello-original');
  }
 }
 const rhyme=base.rhymes.find(item=>item.title==='First Steps');
 assert.deepEqual(rhyme.tunes,['Five Little Monkeys','Five Little Ducks']);
 assert.equal(H.tuneCategory(data,rhyme.title).kind,'unverified');
});
test('导出试听片段使用previewUrl，复用已有音源且无undefined资源',()=>{
 const d=structuredClone(base),existing=d.books[0].resources.find(r=>r.kind==='audio');
 d.tuneAudio={tunes:[{name:'单独试听曲调',status:'preview',previewUrl:'assets/hello/tunes/preview-example.mp3'},{name:'已有音源试听',status:'preview',previewUrl:existing.file}]};
 const result=[];
 for(const build of [H.graph,G.buildGraph]){
  const g=build(d),byId=new Map(g.nodes.map(n=>[n.id,n]));
  for(const ref of d.tuneAudio.tunes){const edge=g.edges.find(e=>e.from==='tune:'+ref.name&&e.relation==='原曲试听片段');assert.ok(edge);assert.equal(byId.get(edge.to).url,ref.previewUrl);assert.equal(byId.get(edge.to).kind,'audio');}
  assert.equal(g.nodes.filter(n=>n.type==='resource'&&n.url===existing.file).length,1);
  assert.ok(!g.nodes.some(n=>n.id.includes('undefined')));
  result.push(g.edges.filter(e=>e.relation==='原曲试听片段').map(e=>[e.from,e.to,e.relation]).sort());
 }
 assert.deepEqual(result[0],result[1]);
});
test('素材卡在交互与导出图谱的资源及精确书册童谣关系一致',()=>{
 const d=structuredClone(base);d.materialCards=read('hello-material-cards.json');
 const sample=d.materialCards.items.find(item=>item.type==='rhyme-card'&&item.rhymeIds.length);
 d.materialCards.items.push({...sample,id:'fixture-standalone-card',origin:'standalone-rhyme-card'},{...sample,id:'fixture-vocabulary-card',type:'vocabulary-card'});
 const result=[];
 for(const build of [H.graph,G.buildGraph]){
  const graph=build(d),byId=new Map(graph.nodes.map(n=>[n.id,n])),materialIds=new Set(d.materialCards.items.map(i=>i.id));
  assert.equal(byId.size,graph.nodes.length);
  for(const item of d.materialCards.items){
   const node=byId.get(item.id);assert.ok(node,item.id);
   assert.deepEqual(Object.fromEntries(['id','type','kind','materialId','label','url','preview','bookId','origin'].map(k=>[k,node[k]])),{id:item.id,type:'resource',kind:item.type,materialId:item.id,label:item.title,url:item.file,preview:item.preview,bookId:item.bookId,origin:item.origin});
   assert.ok(graph.edges.some(e=>e.from===item.bookId&&e.to===item.id));
   if(item.id==='fixture-standalone-card')assert.ok(graph.edges.some(e=>e.to===item.id&&e.relation==='独立童谣卡'));
   const linked=graph.edges.filter(e=>e.to===item.id&&e.from.startsWith('hello-rhyme-')).map(e=>e.from).sort();
   assert.deepEqual(linked,['vocabulary-card','unclassified'].includes(item.type)?[]:item.rhymeIds.filter(id=>d.rhymes.find(r=>r.id===id)?.bookId===item.bookId).sort());
  }
  for(const edge of graph.edges){assert.ok(byId.has(edge.from),edge.from);assert.ok(byId.has(edge.to),edge.to);}
  result.push(graph.edges.filter(e=>materialIds.has(e.to)).map(e=>[e.from,e.to,e.relation]).sort());
 }
 assert.deepEqual(result[0],result[1]);
});
