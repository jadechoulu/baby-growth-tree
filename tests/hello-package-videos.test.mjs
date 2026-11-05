import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),H=require('../english/hello-reading.js'),G=require('../english/hello-graph.js');
const base=JSON.parse(readFileSync(new URL('../english/data/hello-reading.json',import.meta.url)));
function fixture(){
 const data=structuredClone(base),book=data.books[0],rhyme=data.rhymes.find(item=>item.bookId===book.id),partId=rhyme.partIds[0],otherPartId=book.id+'-part-1';
 for(const current of data.books)current.resources=current.resources.filter(resource=>!['package-video','video'].includes(resource.kind));
 const item=(id,extra={})=>({id,kind:'package-video',label:id+'.mp4',url:'https://s.znas.cn/example/'+id,...extra});
 const videos=[item('exact-video',{partIds:[partId],rhymeIds:[rhyme.id],tunes:['New Package Tune'],role:'tune-demo'}),item('tune-video',{tunes:[rhyme.tunes[0]]}),item('book-only',{label:rhyme.title+'.mp4'}),item('part-only',{partIds:[otherPartId],tunes:['Part Only Tune'],role:'extension-song'})];
 book.resources.push(...videos);
 data.books[1].resources.push(item('other-book',{partIds:[partId],rhymeIds:[rhyme.id],tunes:['New Package Tune']}));
 return {data,book,rhyme,partId,otherPartId,videos};
}
test('配套视频按整册保留，Part只读显式定位，童谣只读本册显式童谣或曲调关系',()=>{
 const {data,book,rhyme,partId,otherPartId,videos}=fixture(),before=JSON.stringify(data);
 assert.deepEqual(H.packageVideos(data,book).map(item=>item.id),videos.map(item=>item.id));
 assert.deepEqual(H.packageVideos(data,book,{partId}).map(item=>item.id),['exact-video']);
 assert.deepEqual(H.packageVideos(data,book,{partId:otherPartId}).map(item=>item.id),['part-only']);
 assert.deepEqual(H.packageVideos(data,book,{rhymeId:rhyme.id}).map(item=>item.id),['exact-video','tune-video']);
 assert.deepEqual(H.packageVideos(data,data.books[1],{rhymeId:rhyme.id}),[]);
 assert.deepEqual(H.packageVideos(data,data.books[1],{partId}),[]);
 assert.equal(JSON.stringify(data),before);
});
test('视频来源新增曲调可按场景和书号实时查到精确Part，不改原童谣建议曲调',()=>{
 const {data,book,rhyme,partId,otherPartId}=fixture(),original=[...rhyme.tunes];
 assert.ok(H.options(data).tunes.includes('New Package Tune'));
 assert.deepEqual(H.browse(data,{book:book.id,tune:'New Package Tune'}).scenes.map(row=>book.id+'-part-'+row.part.part),[partId]);
 assert.deepEqual(H.browse(data,{book:book.id,tune:'New Package Tune'}).rhymes.map(row=>row.rhyme.id),[rhyme.id]);
 assert.deepEqual(H.browse(data,{book:book.id,tune:'Part Only Tune'}).scenes.map(row=>book.id+'-part-'+row.part.part),[otherPartId]);
 assert.deepEqual(H.browse(data,{book:book.id,tune:'Part Only Tune'}).rhymes,[]);
 assert.deepEqual(H.browse(data,{book:book.id,query:'exact-video'}).scenes.map(row=>book.id+'-part-'+row.part.part),[partId]);
 assert.ok(H.searchSuggestions(data,{book:book.id},'New Package').some(item=>item.kind==='tune'&&item.value==='New Package Tune'));
 assert.deepEqual(rhyme.tunes,original);
});
test('两种图谱均连到明确Part、童谣和曲调，整册视频不因相近名称强配Part',()=>{
 const {data,book,rhyme,partId}=fixture(),expected=[];
 for(const build of [H.graph,G.buildGraph]){
  const graph=build(data),ids=new Set(graph.nodes.map(node=>node.id));
  for(const edge of graph.edges){assert.ok(ids.has(edge.from),edge.from);assert.ok(ids.has(edge.to),edge.to);}
  assert.ok(graph.edges.some(edge=>edge.from===book.id&&edge.to==='book-only'&&edge.relation==='资料包视频'));
  assert.ok(graph.edges.some(edge=>edge.from===partId&&edge.to==='exact-video'&&edge.relation==='曲调视频'));
  assert.ok(graph.edges.some(edge=>edge.from===rhyme.id&&edge.to==='exact-video'&&edge.relation==='童谣配套视频'));
  assert.ok(graph.edges.some(edge=>edge.from==='tune:New Package Tune'&&edge.to==='exact-video'&&edge.relation==='曲调视频'));
  assert.ok(!graph.edges.some(edge=>edge.from.includes('-part-')&&edge.to==='book-only'));
  assert.ok(!graph.edges.some(edge=>[partId,rhyme.id].includes(edge.from)&&edge.to==='other-book'));
  expected.push(graph.edges.filter(edge=>['资料包视频','曲调视频','拓展视频','童谣配套视频'].includes(edge.relation)).map(edge=>[edge.from,edge.to,edge.relation]).sort());
 }
 assert.deepEqual(expected[0],expected[1]);
});

test('资料与内容核对的8条新增视频精确归Part，拓展不冒充套唱且未定项保留原因',()=>{
 const expected={
  'hello-04-video-package-19d69bdbbce1':'hello-04-part-5',
  'hello-05-video-package-270dfb8b79b1':'hello-05-part-1',
  'hello-06-video-package-245471de1892':'hello-06-part-2',
  'hello-07-video-package-9a179cc4b968':'hello-07-part-2',
  'hello-09-video-package-942373f7621c':'hello-09-part-1',
  'hello-14-video-package-79ad54cc9b74':'hello-14-part-3',
  'hello-22-video-package-64d2efffced9':'hello-22-part-3',
  'hello-23-video-package-9877a8d44583':'hello-23-part-2',
 };
 const videos=base.books.flatMap(b=>H.packageVideos(base,b));
 assert.equal(videos.length,30);
 assert.equal(videos.filter(v=>v.partIds?.length).length,28);
 for(const [id,partId] of Object.entries(expected)){
  const resource=videos.find(v=>v.id===id),book=base.books.find(b=>b.resources.includes(resource));
  assert.deepEqual(resource.partIds,[partId]);
  assert.ok(resource.mappingEvidence.length);
  assert.ok(resource.role.startsWith('extension'));
  assert.equal(resource.tunes?.length||0,0);
  assert.ok(H.packageVideos(base,book,{partId}).includes(resource));
  for(const build of [H.graph,G.buildGraph])assert.ok(build(base).edges.some(e=>e.from===partId&&e.to===id&&e.relation==='拓展视频'));
 }
 const pending=videos.filter(v=>!v.partIds?.length);
 assert.deepEqual(pending.map(v=>v.id),['hello-02-video-package-6bd020d2ca42','hello-02-video-package-5907706f007a']);
 assert.ok(pending.every(v=>v.mappingReview.status==='unresolved'&&v.mappingReview.reason));
});
