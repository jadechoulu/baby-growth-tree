import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
const require=createRequire(import.meta.url),H=require('../english/hello-reading.js'),G=require('../english/hello-graph.js');
const read=name=>JSON.parse(readFileSync(new URL('../english/data/'+name,import.meta.url)));
const base=read('hello-reading.json'),content=read('hello-rhyme-content.json'),byId=new Map(content.map(r=>[r.id,r]));
const data={...base,rhymes:base.rhymes.map(r=>({...r,...byId.get(r.id)}))};

test('56条历史汇总截图保留来源依据，不以书册封面或整册场景代替',()=>{
  assert.equal(content.length,56);assert.equal(byId.size,56);
  assert.deepEqual(new Set(byId.keys()),new Set(base.rhymes.map(r=>r.id)));
  assert.equal(new Set(content.map(r=>r.card.file)).size,56);
  for(const r of base.rhymes){
    const extra=byId.get(r.id);assert.equal(extra.card.sourcePage,r.sourcePage);
    assert.equal(extra.card.sourceFile,'assets/hello/rhymes.pdf');
    assert.ok(existsSync(new URL('../english/'+extra.card.file,import.meta.url)));
    assert.ok(extra.themeSource);assert.equal(new Set(extra.themes).size,extra.themes.length);
  }
  assert.equal(byId.get('hello-rhyme-52').card.sourceTitle,'Find It · Pumpkin Moon');
});

test('按睡觉或刷牙找童谣，只返回本首歌词支持的主题',()=>{
  const sleep=H.browse(data,{scene:'睡觉'}).rhymes.map(row=>row.rhyme.id);
  assert.deepEqual(sleep,['hello-rhyme-25','hello-rhyme-39','hello-rhyme-43','hello-rhyme-54','hello-rhyme-57']);
  assert.ok(!sleep.includes('hello-rhyme-02'));
  assert.ok(!sleep.includes('hello-rhyme-09'));
  assert.deepEqual(H.browse(data,{scene:'刷牙'}).rhymes.map(row=>row.rhyme.id),['hello-rhyme-41']);
  assert.equal(H.browse(data,{book:'hello-01',scene:'睡觉'}).rhymes.length,0);
  assert.ok(!H.browse(data,{scene:'动物'}).rhymes.some(row=>row.rhyme.id==='hello-rhyme-38'));
  assert.ok(H.options(data).scenes.includes('收拾玩具'));
});

test('图谱童谣主题边只来自显式主题，与Part场景保持区别',()=>{
  const graph=G.buildGraph(data),edges=graph.edges.filter(e=>e.relation==='童谣主题');
  assert.equal(edges.length,content.reduce((n,r)=>n+r.themes.length,0));
  for(const edge of edges){const r=byId.get(edge.to);assert.ok(r);assert.ok(r.themes.includes(edge.from.replace(/^scene:/,'')));}
  const sleep=G.neighbors(graph,'scene:睡觉').filter(row=>row.node.type==='rhyme');
  assert.equal(sleep.length,5);for(const row of sleep)assert.deepEqual(row.relations,['童谣主题']);
  assert.ok(!graph.nodes.some(node=>node.kind==='card'));
  assert.ok(!graph.edges.some(edge=>edge.relation==='带读汇总页'));
  for(const edge of graph.edges.filter(e=>e.from.includes('-part-')&&e.to.startsWith('hello-rhyme-')))assert.ok(data.rhymes.find(r=>r.id===edge.to).partIds.includes(edge.from));
});
