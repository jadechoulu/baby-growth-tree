import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{create,catalog,needsBooks,details,resourceTopics}=require('../english/catalog-loader.js');

test('独立素材与资料页不等待全库，依赖逐册数量的视图仍先读取目录',()=>{
  for(const [view,collection] of [['baby'],['sources'],['routes'],['relations'],['library','hello'],['library','liao']])assert.equal(needsBooks(view,collection),false);
  for(const [view,collection] of [['qing-progress'],['xu-progress'],['library','all'],['library','other']])assert.equal(needsBooks(view,collection),true);
});
test('超时终止慢请求，迟到结果不污染目录，下一次可以重试',async()=>{
  const target={books:[],sources:[]};let resolveRead,calls=0,signal;
  const loader=create(target,'books.json',async(url,options)=>{signal=options.signal;if(++calls===1)return new Promise(resolve=>{resolveRead=resolve;});return {ok:true,json:async()=>({books:[{id:'retry'}],sources:[]})};},{timeout:10});
  await assert.rejects(loader.load(),/超时/);assert.equal(signal.aborted,true);assert.equal(loader.ready,false);
  resolveRead({ok:true,json:async()=>({books:[{id:'late'}],sources:[]})});await Promise.resolve();await Promise.resolve();
  assert.deepEqual(target.books,[]);await loader.load();assert.equal(target.books[0].id,'retry');
});

test('宝宝页不请求目录，并发请求共用一次读取且保留目标对象身份',async()=>{
  const target={books:[],sources:[]};let calls=0;
  const loader=create(target,'data/books.json?v=test',async url=>{calls++;assert.equal(url,'data/books.json?v=test');return {ok:true,json:async()=>({books:[{id:'one'}],sources:[]})};});
  assert.equal(calls,0);assert.equal(loader.ready,false);
  const [first,second]=await Promise.all([loader.load(),loader.load()]);
  assert.equal(calls,1);assert.equal(first,target);assert.equal(second,target);assert.equal(loader.ready,true);
  assert.equal((await loader.load()).books[0].id,'one');assert.equal(calls,1);
});
test('失败或不完整目录不污染现有数据，允许再次加载',async()=>{
  const target={books:[],sources:[]};let calls=0;
  const loader=create(target,'books.json',async()=>({ok:true,json:async()=>++calls===1?{books:[{id:'bad'}]}:{books:[{id:'ok'}],sources:[]}}));
  await assert.rejects(loader.load(),/不完整/);assert.equal(loader.ready,false);assert.deepEqual(target.books,[]);
  await loader.load();assert.equal(loader.ready,true);assert.equal(target.books[0].id,'ok');
});
test('离线内嵌目录直接可用，不请求网络',async()=>{
  const target={books:[{id:'offline'}]},loader=create(target,null,()=>{throw Error('不应请求');});
  assert.equal(loader.ready,true);assert.equal(await loader.load(),target);
});

test('逐册证据按分片并发共用，合并到原书目对象且保留索引与进度身份',async()=>{
  const book={id:'one',resourceId:'series',detailChunk:0,title:'Book'},directory={books:[book,{id:'two',detailChunk:0}],detailFiles:['details.json']},taxonomy={bookOverrides:{one:{topics:['animals']}}};let calls=0;
  const loader=details(directory,taxonomy,async url=>{calls++;assert.equal(url,'details.json');return {ok:true,json:async()=>({books:[{id:'one',topicEvidence:[{summary:'已核实'}],coverSource:{kind:'individual-book',sourceUrl:'https://example.com'}},{id:'two',catalogNote:'版本不同'}],topics:{one:{topics:['animals'],basis:'原内页'}}})};});
  assert.equal(calls,0);assert.equal(loader('one'),loader('two'));
  await Promise.all([loader('one').load(),loader('two').load()]);assert.equal(calls,1);
  assert.equal(directory.books[0],book);assert.equal(book.title,'Book');assert.equal(book.resourceId,'series');assert.equal(book.topicEvidence[0].summary,'已核实');assert.equal(taxonomy.bookOverrides.one.basis,'原内页');assert.equal(loader('one').ready,true);
});
test('可选资料加载失败可以重试，成功前不替换已有对象',async()=>{
  const target={books:[{id:'identity'}]};let count=0;
  const loader=create(target,'hello.json',async()=>({ok:true,json:async()=>++count===1?{books:[]}:{books:[{id:'identity',parts:[1]}],rhymes:[]}}),{validate:data=>Array.isArray(data.rhymes)});
  await assert.rejects(loader.load(),/不完整/);assert.equal(target.books[0].id,'identity');await loader.load();assert.deepEqual(target.books[0].parts,[1]);
});

test('查看同ISBN书目时按需读取两侧依据，失败可重试且不读取未核版次',async()=>{
  const directory={books:[{id:'one',detailChunk:0},{id:'same',detailChunk:1},{id:'other',detailChunk:2}],detailFiles:['one.json','same.json','other.json'],
    readingEquivalences:[{kind:'same-isbn',isbn:'9780007185399',sourceIds:['checked'],bookIds:['one','same']},{kind:'same-title',bookIds:['one','other']}]};
  const taxonomy={bookOverrides:{}},calls=[];let fail=true;
  const loader=details(directory,taxonomy,async url=>{calls.push(url);if(url==='same.json'&&fail){fail=false;throw Error('临时失败');}const id=url==='one.json'?'one':'same';return {ok:true,json:async()=>({books:[{id,topicEvidence:[{summary:'原文依据'}]}],topics:{[id]:{basis:'已核原文'}}})};});
  assert.deepEqual(calls,[]);assert.equal(loader('one').ready,false);
  await assert.rejects(loader('one').load(),/临时失败/);
  await Promise.all([loader('one').load(),loader('same').load()]);
  assert.equal(loader('one').ready,true);assert.deepEqual(calls.sort(),['one.json','same.json','same.json']);
  assert.equal(taxonomy.bookOverrides.same.basis,'已核原文');assert.equal(directory.books[2].topicEvidence,undefined);
});

test('资源主题证据按需并发共用，恢复原映射对象，缺页失败不覆盖轻索引且允许重试',async()=>{
  const mapping={topics:['animals'],status:'title-fallback',patterns:[{text:'I see …',sourceId:'source'}]},taxonomy={resourceMappings:{series:mapping}};
  let calls=0;
  const loader=resourceTopics(taxonomy,'resource-topics.json',async()=>({ok:true,json:async()=>++calls===1?{}:{series:{...mapping,basis:'本系列已查简介',sourceIds:['source'],evidence:[{summary:'简介摘录'}]}}}));
  assert.equal(calls,0);assert.equal(loader.ready,false);
  await assert.rejects(loader.load(),/不完整/);assert.equal(mapping.basis,undefined);assert.equal(loader.ready,false);
  await Promise.all([loader.load(),loader.load()]);
  assert.equal(calls,2);assert.equal(loader.ready,true);assert.equal(taxonomy.resourceMappings.series,mapping);
  assert.equal(mapping.evidence[0].summary,'简介摘录');assert.deepEqual(mapping.topics,['animals']);
  const offline=resourceTopics(taxonomy,null,()=>{throw Error('离线不应请求');});assert.equal(offline.ready,true);await offline.load();
});


test('分片目录能恢复完整顺序，且不暴露内部排序字段',async()=>{
  const target={books:[],sources:[]};
  const data={
    'manifest.json':{schemaVersion:1,totalBooks:4,meta:'meta.json',chunks:['chunk-2.json','chunk-0.json','chunk-3.json','chunk-1.json']},
    'meta.json':{sources:[{id:'source'}]},
    'chunk-2.json':{books:[{id:'c',sortIndex:2}]},
    'chunk-0.json':{books:[{id:'b',sortIndex:1}]},
    'chunk-3.json':{books:[{id:'a',sortIndex:0}]},
    'chunk-1.json':{books:[{id:'d',sortIndex:3}]}
  };
  const loader=catalog(target,'manifest.json',async url=>({ok:true,json:async()=>data[url]}));
  await loader.load();
  assert.equal(loader.ready,true);
  assert.deepEqual(target.books.map(book=>book.id),['a','b','c','d']);
  assert.ok(target.books.every(book=>!('sortIndex' in book)));
  assert.equal(target.sources[0].id,'source');
});
