import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),G=require('../english/hello-graph.js');
const H=require('../english/hello-reading.js');
const data=JSON.parse(readFileSync(new URL('../english/data/hello-reading.json',import.meta.url)));

test('交互图谱保留完整关系和资源路径，只建立已核实的童谣所属Part',()=>{
  const before=JSON.stringify(data),graph=G.buildGraph(data),ids=new Set(graph.nodes.map(n=>n.id));
  assert.equal(ids.size,graph.nodes.length);
  for(const [type,count] of [['book',24],['part',120],['rhyme',56]])assert.equal(graph.nodes.filter(n=>n.type===type).length,count);
  for(const edge of graph.edges){assert.ok(ids.has(edge.from),edge.from);assert.ok(ids.has(edge.to),edge.to);if(edge.from.includes('-part-')&&edge.to.startsWith('hello-rhyme-'))assert.ok(data.rhymes.find(r=>r.id===edge.to).partIds.includes(edge.from));}
  for(const book of data.books)for(const [i,resource] of book.resources.entries()){
    const node=graph.nodes.find(n=>n.id===(resource.id||book.id+'-resource-'+i));
    assert.equal(node.url,resource.url||resource.file);
    assert.ok(G.neighbors(graph,book.id).some(row=>row.node.id===node.id));
  }
  assert.equal(JSON.stringify(data),before);
});

test('场景一跳可查对应书册和精确Part，未归册年月节点退出图谱',()=>{
  const graph=G.buildGraph(data),rows=G.neighbors(graph,'scene:睡觉');
  assert.deepEqual(rows.filter(r=>r.node.type==='book').map(r=>r.node.id),['hello-01','hello-05','hello-11','hello-12','hello-13','hello-17','hello-18','hello-24']);
  assert.equal(rows.filter(r=>r.node.type==='part').length,9);
  for(const {node} of rows.filter(r=>r.node.type==='part'))assert.equal(data.books.find(b=>b.id===node.bookId).parts.find(p=>p.part===node.part).scene,'睡觉');
  const archive=JSON.parse(readFileSync(new URL('../docs/hello-dated-index-review-20261105.json',import.meta.url)));
  assert.deepEqual(G.buildGraph({...data,issues:archive.issues}),graph);
  assert.ok(!graph.nodes.some(n=>n.type==='issue'));
  assert.ok(!graph.edges.some(e=>e.relation==='年月刊主题'));
});

test('同名音频只关联本册，主曲调和拓展曲调路径分开',()=>{
  const graph=G.buildGraph(data),byId=new Map(graph.nodes.map(n=>[n.id,n]));
  for(const edge of graph.edges.filter(e=>e.relation==='同名音频'))assert.equal(byId.get(edge.from).bookId,byId.get(edge.to).bookId);
  const rhyme=data.rhymes.find(r=>r.title==='My Toothbrush'),rows=G.neighbors(graph,rhyme.id);
  assert.ok(rows.some(r=>r.node.id==='tune:London Bridge Is Falling Down'&&r.relations.includes('建议曲调')));
  assert.ok(!rows.some(r=>r.node.id==='tune:The Farmer in the Dell'));
  assert.ok(rows.some(r=>r.node.type==='extension'&&G.neighbors(graph,r.node.id).some(x=>x.node.id==='tune:The Farmer in the Dell')));
});

test('按准确焦点联动筛选，保留拓展节点内部导航',()=>{
  const graph=G.buildGraph(data);
  for(const node of graph.nodes.filter(n=>['book','scene','part','rhyme','tune'].includes(n.type))){
    const selected=G.selection(node);assert.ok(selected);
    assert.equal(G.focusId(graph,{focus:selected,book:'hello-01'}),node.id);
  }
  assert.equal(G.focusId(graph,{rhyme:'hello-rhyme-02',scene:'睡觉'}),'hello-rhyme-02');
  assert.equal(G.focusId(graph,{scene:'睡觉',book:'all'}),'scene:睡觉');
  assert.equal(G.focusId(graph,{focus:'missing',book:'hello-05'}),'hello-05');
  assert.equal(G.focusId(graph,{query:'my toothbrush'}),data.rhymes.find(r=>r.title==='My Toothbrush').id);
  assert.equal(G.focusId(graph,{query:'Mama\'s Monkey'}),data.rhymes.find(r=>r.title==='Mama’s Monkey').id);
  assert.equal(G.focusId(graph,{query:'睡觉'}),'scene:睡觉');
  assert.equal(G.focusId(graph,{book:'hello-01',query:'my toothbrush'}),'hello-01');
  assert.equal(G.focusId(graph,{book:['hello-01','hello-18']}),'hello-01');
  assert.equal(G.focusId(graph,{book:['hello-01','hello-18'],query:'my toothbrush'}),data.rhymes.find(r=>r.title==='My Toothbrush').id);
  assert.equal(G.focusId(graph,{book:['hello-01','hello-02'],query:'my toothbrush'}),'hello-01');
  assert.equal(G.focusId(graph,{part:'hello-12-part-2',book:'hello-12'}),'hello-12-part-2');
  for(const type of ['extension','resource'])assert.equal(G.selection(graph.nodes.find(n=>n.type===type)),null);
});

test('独立曲调资源在交互与导出图谱一致关联，本地文件复用且外部页面不冒充音频',()=>{
  const tuneAudio=JSON.parse(readFileSync(new URL('../english/data/hello-tune-audio.json',import.meta.url))),enriched={...data,tuneAudio};
  const relations=[];
  for(const build of [G.buildGraph,H.graph]){
    const before=build(data),graph=build(enriched),nodes=new Map(graph.nodes.map(n=>[n.id,n]));
    assert.equal(nodes.size,graph.nodes.length);
    for(const node of graph.nodes.filter(n=>n.type==='resource')){assert.equal(typeof node.url,'string',node.id);assert.ok(!node.id.includes('undefined'));}
    for(const edge of graph.edges){assert.ok(nodes.has(edge.from));assert.ok(nodes.has(edge.to));}
    const relevant=graph.edges.filter(e=>['曲调参考音频','原曲试听片段','官方曲调试听'].includes(e.relation));
    assert.equal(relevant.length,tuneAudio.tunes.filter(t=>t.status==='available'&&t.file||t.status==='preview'&&t.previewUrl||t.status==='external'&&t.sourceUrl).length);
    for(const reference of tuneAudio.tunes){
      const edge=relevant.find(e=>e.from==='tune:'+reference.name);
      if(reference.status==='missing'){assert.equal(edge,undefined);continue;}
      assert.ok(edge,reference.name);const resource=nodes.get(edge.to),local=reference.status==='available'||reference.status==='preview',url=reference.status==='preview'?reference.previewUrl:local?reference.file:reference.sourceUrl;
      assert.equal(resource.type,'resource');assert.equal(resource.kind,local?'audio':'tune-reference');assert.equal(resource.url,url);
      if(local){const original=before.nodes.filter(n=>n.type==='resource'&&n.url===url);assert.equal(graph.nodes.filter(n=>n.type==='resource'&&n.url===url).length,Math.max(1,original.length));}
    }
    relations.push(relevant.map(e=>[e.from,e.to,e.relation]).sort());
  }
  assert.deepEqual(relations[0],relations[1]);
});

test('独立童谣卡与原书页分别关联，词汇图和改编卡不被强配成原文卡',()=>{
  const rhyme=data.rhymes[0],otherBook=data.books.find(b=>b.id!==rhyme.bookId);
  const item=(id,type,origin,extra={})=>({id,type,origin,bookId:rhyme.bookId,rhymeIds:[rhyme.id],title:id,file:id+'.png',preview:id+'.jpg',...extra});
  const items=[item('independent','rhyme-card','standalone-rhyme-card'),item('original','rhyme-card','book-pages'),item('vocab','vocabulary-card','standalone-image'),item('unknown','unclassified','standalone-image'),item('other-book','rhyme-card','standalone-rhyme-card',{bookId:otherBook.id}),item('adaptation','rhyme-card','standalone-rhyme-card',{rhymeIds:[],relatedRhymeIds:[rhyme.id],adaptation:true})];
  const graph=G.buildGraph({...data,materialCards:{items}}),byId=new Map(graph.nodes.map(n=>[n.id,n]));
  assert.ok(graph.edges.some(e=>e.from===rhyme.id&&e.to==='independent'&&e.relation==='独立童谣卡'));
  assert.ok(graph.edges.some(e=>e.from===rhyme.id&&e.to==='original'&&e.relation==='原书童谣页'));
  for(const i of items){assert.equal(byId.get(i.id).materialId,i.id);assert.equal(byId.get(i.id).url,i.file);assert.equal(byId.get(i.id).preview,i.preview);assert.ok(graph.edges.some(e=>e.from===i.bookId&&e.to===i.id));}
  for(const id of ['vocab','unknown','other-book','adaptation'])assert.ok(!graph.edges.some(e=>e.from===rhyme.id&&e.to===id));
});


test('Part到童谣关系与JSON导出一致，且点击Part可精确联动',()=>{
 const interactive=G.buildGraph(data),exported=H.graph(data);
 const edges=graph=>graph.edges.filter(e=>e.relation==='对应童谣').map(e=>[e.from,e.to]).sort();
 assert.equal(edges(interactive).length,56);assert.deepEqual(edges(interactive),edges(exported));
 assert.deepEqual(G.neighbors(interactive,'hello-12-part-2').filter(row=>row.node.type==='rhyme').map(row=>row.node.label),['Make a Splash!']);
 assert.equal(G.neighbors(interactive,'hello-12-part-1').filter(row=>row.node.type==='rhyme').length,0);
 const selected=G.selection(interactive.nodes.find(n=>n.id==='hello-18-part-2'));
 assert.deepEqual(selected,{type:'part',id:'hello-18-part-2',bookId:'hello-18',part:2});
 assert.deepEqual(H.browse(data,{part:selected.id}).rhymes.map(row=>row.rhyme.title),['My Toothbrush']);
});
