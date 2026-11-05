import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),H=require('../english/hello-reading.js'),G=require('../english/hello-graph.js'),A=require('../english/audio-player.js');
const fixture=()=>({assetInventory:{sourceFiles:139,downloadedFiles:139},books:[
 {id:'hello-01',title:'1号书',parts:[{part:1,title:'Day and Night',scene:'白天晚上'},{part:2,title:'Song',scene:'刷牙'}],resources:[{id:'original-song',kind:'audio',label:'Song.mp3',file:'original.mp3',rhymeIds:['rhyme-1']},{id:'original-other',kind:'audio',label:'Book extra',file:'extra.mp3'}]},
 {id:'hello-02',title:'2号书',parts:[{part:1,title:'Day and Night',scene:'白天晚上'}],resources:[]}
],rhymes:[{id:'rhyme-1',bookId:'hello-01',title:'Song',partIds:['hello-01-part-2'],tunes:['London Bridge'],themes:['刷牙'],extensions:[]},{id:'rhyme-2',bookId:'hello-02',title:'Song',partIds:['hello-02-part-1'],tunes:[],themes:[],extensions:[]}]});
const resource=(id,extra={})=>({id,bookId:'hello-01',kind:'audio',sourceKind:'reading-pen',role:'part-reading',label:id,file:id+'.mp3',partIds:[],rhymeIds:[],...extra});
const manifest=()=>({schemaVersion:1,source:{title:'Hello点读包',sha256:'source'},resources:[
 resource('pen-part',{partIds:['hello-01-part-1']}),
 resource('pen-rhyme',{role:'rhyme-reading',partIds:['hello-01-part-2'],rhymeIds:['rhyme-1']}),
 resource('pen-poem',{role:'poem-reading',partIds:['hello-01-part-2'],rhymeIds:['rhyme-1']}),
 resource('pen-whole',{role:'whole-book-reading'}),
 resource('unlocated',{label:'Song'})
]});
function merge(reading=fixture(),pen=manifest()){
 // 直接执行构建器的真实合并函数，避免导入整个构建器写生成页或依赖实际清单。
 const script=`import ast,json,sys\nfrom pathlib import Path\ntree=ast.parse(Path('english/build.py').read_text())\nfn=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='merge_hello_pen_audio')\nns={}\nexec(compile(ast.Module(body=[fn],type_ignores=[]),'build.py','exec'),ns)\ndata=json.load(sys.stdin)\nprint(json.dumps(ns['merge_hello_pen_audio'](data['reading'],data['manifest'])))`;
 return JSON.parse(execFileSync('python3',['-c',script],{cwd:new URL('..',import.meta.url),input:JSON.stringify({reading,manifest:pen}),encoding:'utf8',stdio:['pipe','pipe','pipe']}));
}

test('构建仅按已核实书号合入点读资源，139份原资料包库存保持独立',()=>{
 const base=fixture(),before=JSON.stringify(base),data=merge(base);
 assert.deepEqual(data.assetInventory,base.assetInventory);
 assert.equal(data.books[0].resources.length,7);assert.deepEqual(data.books[1].resources,[]);
 assert.deepEqual(data.penAudioSource,manifest().source);assert.equal(JSON.stringify(base),before);
 const crossBook=manifest();crossBook.resources[0].partIds=['hello-02-part-1'];assert.throws(()=>merge(fixture(),crossBook));
 const crossRhyme=manifest();crossRhyme.resources[1].rhymeIds=['rhyme-2'];assert.throws(()=>merge(fixture(),crossRhyme));
 const duplicate=manifest();duplicate.resources.push(duplicate.resources[0]);assert.throws(()=>merge(fixture(),duplicate));
});

test('Part与童谣只取精确ID，未定位同名音频留整册，不按标题或场景推断',()=>{
 const data=merge();
 assert.deepEqual(H.audioResources(data,'hello-01',{partId:'hello-01-part-1'}).map(r=>r.id),['pen-part']);
 assert.deepEqual(H.audioResources(data,'hello-01',{partId:'hello-01-part-2'}).map(r=>r.id),['pen-rhyme','pen-poem']);
 assert.deepEqual(H.audioResources(data,'hello-01',{rhymeId:'rhyme-1'}).map(r=>r.id),['original-song','pen-rhyme','pen-poem']);
 assert.deepEqual(H.audioResources(data,'hello-01',{wholeBook:true}).map(r=>r.id),['original-other','pen-whole','unlocated']);
 assert.deepEqual(H.audioResources(data,'hello-02',{partId:'hello-01-part-1'}),[]);
 assert.deepEqual(H.audioResources(data,'hello-01',{rhymeId:'rhyme-2'}),[]);
 assert.deepEqual(H.browse(data,{scene:'白天晚上',book:'hello-01'}).scenes.map(r=>r.part.part),[1]);
});

test('同一童谣的原包演唱与点读朗读保留独立版本，重复版本有可辨识编号',()=>{
 const data=merge(),versions=H.audioVersions(H.audioResources(data,'hello-01',{rhymeId:'rhyme-1'}));
 assert.deepEqual(versions.map(r=>r.label),['原包演唱','点读朗读 1','点读朗读 2']);
 assert.deepEqual(versions.map(r=>r.resource.file),['original.mp3','pen-rhyme.mp3','pen-poem.mp3']);
 assert.equal(H.audioVariantLabel({...resource('alternate'),sourceKind:undefined,variantLabel:'资料包另版（M4A）'}),'资料包另版（M4A）');
 assert.equal(A.tuneSource('Song',data),null);assert.equal(A.tuneSource('London Bridge',data),null);
 const bad=manifest();bad.resources[0].tunes=['London Bridge'];assert.throws(()=>merge(fixture(),bad));
});

test('交互图谱与导出图谱具有相同精确Part音频关系，未定位不产生额外关联',()=>{
 const data=merge(),relations=[];
 for(const build of [H.graph,G.buildGraph]){
  const graph=build(data),edges=graph.edges.filter(e=>e.relation==='点读朗读');
  relations.push(edges.map(e=>[e.from,e.to,e.relation]).sort());
  assert.deepEqual(edges.filter(e=>e.from==='hello-01-part-1').map(e=>e.to),['pen-part']);
  assert.deepEqual(edges.filter(e=>e.from==='rhyme-1').map(e=>e.to),['pen-rhyme','pen-poem']);
  assert.ok(!edges.some(e=>e.to==='unlocated'||e.to==='pen-whole'));
  for(const id of ['pen-part','pen-rhyme','pen-poem','pen-whole','unlocated']){
   assert.ok(graph.edges.some(e=>e.from==='hello-01'&&e.to===id));
   assert.ok(!graph.edges.some(e=>(e.from===id&&e.to.startsWith('tune:'))||(e.to===id&&e.from.startsWith('tune:'))));
   assert.equal(graph.nodes.find(n=>n.id===id).audioVariant,'点读朗读');
  }
 }
 assert.deepEqual(relations[0],relations[1]);
});


test('显式点读栏目标签优先，按钮版本与两份图谱使用同一标签',()=>{
 for(const label of ['点读演唱','点读诗歌','点读故事','点读找图','点读整册']){
  const pen=manifest();pen.resources[0].variantLabel=label;
  const data=merge(fixture(),pen),resource=data.books[0].resources.find(r=>r.id==='pen-part');
  assert.equal(H.audioVariantLabel(resource),label);
  assert.equal(H.audioVersions([resource])[0].label,label);
  for(const build of [H.graph,G.buildGraph])assert.equal(build(data).nodes.find(n=>n.id==='pen-part').audioVariant,label);
 }
});

test('实际音频逐条可追溯到本册原书和采样，文件哈希完整且不会把改编卡关联为原唱',()=>{
 const reading=JSON.parse(readFileSync(new URL('../english/data/hello-reading.json',import.meta.url)));
 const pen=JSON.parse(readFileSync(new URL('../english/data/hello-pen-audio.json',import.meta.url)));
 assert.ok(pen.resources.length>0);
 const data=merge(reading,pen),seen=new Set();
 for(const resource of pen.resources){
  assert.ok(!seen.has(resource.id));seen.add(resource.id);
  assert.ok(resource.durationSeconds>15);
  const file=new URL('../english/'+resource.file,import.meta.url);
  assert.equal(statSync(file).size,resource.bytes);
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),resource.sha256);
  const evidence=resource.matchEvidence,book=reading.books.find(b=>b.id===resource.bookId);
  assert.equal(evidence.status,'confirmed');assert.ok(evidence.basis);
  assert.ok(evidence.samples.length>=1&&evidence.samples.every(s=>s.text&&s.durationSeconds>0));
  assert.ok(evidence.originalSources.length>=1);
  for(const source of evidence.originalSources){
   assert.ok(book.resources.some(r=>r.role==='original-book'&&r.file===source.file));
   assert.ok(source.pages.length&&source.quote&&source.method);
  }
  assert.ok(!resource.rhymeIds.includes('hello-rhyme-52'));
  assert.ok(!(resource.tunes||[]).length);
  if(resource.role==='whole-book-reading'){
   assert.equal(resource.partIds.length,0);assert.ok(evidence.samples.length>=2);
   assert.ok(evidence.samples.some(s=>s.startSeconds>0));
  }else assert.equal(resource.partIds.length,1);
  for(const partId of resource.partIds)assert.ok(H.audioResources(data,resource.bookId,{partId}).some(r=>r.id===resource.id));
 }
});
