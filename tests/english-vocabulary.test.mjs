import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),V=require('../english/vocabulary.js'),Sync=require('../shared/sync-model.js');
const input=(text,extra={})=>({text,type:'word',channel:'listening',categoryId:'objects',pos:'noun',...extra});
const apply=(records,changes)=>Object.assign(records,changes);
const wrap=records=>({version:1,profile:{vocabulary:70,mode:'audio'},favorites:[],records});

test('词数去重、重复不累计，大小写和明确复数归并，听说与内容类型隔离',()=>{
  const records={};for(const t of ['Feet','foot','feet'])apply(records,V.add(records,input(t)));
  apply(records,V.add(records,input('foot',{channel:'speaking'})));
  apply(records,V.add(records,input('foot',{type:'phrase'})));
  apply(records,V.add(records,input('foot',{type:'pattern'})));
  assert.deepEqual(V.summary(records).listening.word,{unique:1});
  assert.deepEqual(V.summary(records).speaking.word,{unique:1});
  assert.deepEqual(V.summary(records).listening.phrase,{unique:1});
  assert.deepEqual(V.summary(records).listening.pattern,{unique:1});
  assert.equal(new Set(V.entries(records).map(e=>e.key)).size,4);
  assert.equal(V.canonical('toes'),'toe');assert.equal(V.canonical('teeth'),'tooth');
  assert.equal(V.canonical('belly button'),'belly button');assert.equal(V.canonical('constructor'),'constructor');
  assert.deepEqual(V.entries(records).find(e=>e.channel==='listening'&&e.type==='word').aliases,['feet']);
});

test('能力可多选，一次添加分别去重，不自动补另一能力且空选择不写入',()=>{
  const records={};
  apply(records,V.add(records,input('soft',{pos:'adjective'})));
  const existing=records[V.entryKey('soft','word','listening')];
  const defaults={type:'word',pos:'adjective',categoryId:'attributes',channels:['listening','speaking']};
  const data=V.parseImport('soft,SOFT,small',defaults,'');
  apply(records,V.importPlan(records,data));
  assert.equal(V.summary(records).listening.word.unique,2);
  assert.equal(V.summary(records).speaking.word.unique,2);
  assert.equal(V.decode(records[V.entryKey('soft','word','listening')]).categoryId,V.decode(existing).categoryId);
  const before=structuredClone(records);
  assert.throws(()=>V.parseImport('new',{...defaults,channels:[]},''),/至少选择/);
  assert.throws(()=>V.parseImport('new',{...defaults,channels:['unknown']},''));
  assert.deepEqual(records,before);
  apply(records,V.importPlan(records,V.parseImport('quiet',{...defaults,channels:['speaking']},'')));
  assert.equal(V.summary(records).listening.word.unique,2);
  assert.equal(V.summary(records).speaking.word.unique,3);
  assert.equal(records[V.entryKey('quiet','word','listening')],undefined);
  const phrase=V.parseImport('come here',{...defaults,type:'phrase'},'');
  apply(records,V.importPlan(records,phrase));
  assert.equal(V.summary(records).listening.phrase.unique,1);
  assert.equal(V.summary(records).speaking.phrase.unique,1);
  assert.deepEqual(Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records)))).records,records);
});

test('逐行输入独立解析，忽略空行、保留句内标点，批内去重与多能力隔离',()=>{
  const defaults={type:'pattern',categoryId:'actions',channels:['listening','speaking']};
  const data=V.parseImport(['Hello, how are you?','  ','hello, how are you?','Where is it?'],defaults,'');
  const records=V.importPlan({},data);
  assert.deepEqual(V.entries(records).filter(e=>e.channel==='listening').map(e=>e.text),['hello, how are you','where is it']);
  assert.equal(V.summary(records).listening.pattern.unique,2);
  assert.equal(V.summary(records).speaking.pattern.unique,2);
  assert.throws(()=>V.parseImport(['','  '],defaults,''));
  assert.throws(()=>V.parseImport(['valid','x'.repeat(101)],defaults,''));
  assert.throws(()=>V.parseImport(Array(1001).fill('word'),defaults,''));
  assert.equal(V.summary(records).listening.word.unique,0);
});

test('普通批量不拆短语，结构化批次幂等，批内重复去重且不覆盖已有分类',()=>{
  const data=V.parseImport('hello,HELLO\nbye',{type:'word',channel:'listening',categoryId:'objects'},'batch-one');
  const records=V.importPlan({},data);assert.deepEqual(V.summary(records).listening.word,{unique:2});
  assert.deepEqual(V.importPlan(records,data),{});
  const phrase=V.parseImport('wave your hand\nopen the box',{type:'phrase',channel:'listening',categoryId:'actions'},'phrases');
  apply(records,V.importPlan(records,phrase));assert.equal(V.summary(records).listening.word.unique,2);assert.equal(V.summary(records).listening.phrase.unique,2);
  apply(records,V.add(records,input('hello',{categoryId:'food'})));
  assert.equal(V.entries(records).find(e=>e.text==='hello').categoryId,'objects');
  assert.deepEqual(V.summary(records).listening.word,{unique:2});
  const imported=V.parseImport(JSON.stringify({version:1,batchId:'external',entries:[input('again',{count:4})]}),{},'ignored');
  apply(records,V.importPlan(records,imported));assert.equal(V.entries(records).find(e=>e.text==='again').count,1);
  assert.throws(()=>V.parseImport('{"entries":[]}',{},'id'));
});

test('编辑更名保留旧键墓碑，冲突不能覆盖，删除与撤销不影响其他个人记录',()=>{
  const records={sss:{status:'using',note:'保留'},'practice.material.v1:demo':{status:'done',note:'原备注'}};
  apply(records,V.add(records,input('boat')));const key=V.entryKey('boat','word','listening');
  const old=records[key];apply(records,V.edit(records,key,input('ship',{count:3})));
  assert.equal(records[key].status,'not-started');assert.equal(V.summary(records).listening.word.unique,1);
  const next=V.entryKey('ship','word','listening');apply(records,V.add(records,input('car')));
  assert.throws(()=>V.edit(records,next,input('car')));
  const before=records[next];apply(records,V.remove(records,next));assert.equal(V.summary(records).listening.word.unique,1);
  records[next]=before;assert.equal(V.summary(records).listening.word.unique,2);
  assert.deepEqual(records.sss,{status:'using',note:'保留'});assert.equal(records['practice.material.v1:demo'].status,'done');
  apply(records,V.remove(records,next));apply(records,V.remove(records,V.entryKey('car','word','listening')));assert.equal(V.initialized(records),true);assert.equal(V.summary(records).listening.word.unique,0);
  assert.equal(JSON.parse(old.note).text,'boat');
});

test('分类可增改删，删除分类保留词条；输入越界不产生半批写入',()=>{
  const records=V.categoryChange({},'custom','玩耍');apply(records,V.add(records,input('toy',{categoryId:'custom'})));
  apply(records,V.categoryChange(records,'custom','游戏'));assert.equal(V.categories(records).find(c=>c.id==='custom').name,'游戏');
  assert.throws(()=>V.categoryChange(records,'another','游戏'));
  apply(records,V.categoryChange(records,'custom','',{deleted:true}));assert.equal(V.categories(records).some(c=>c.id==='custom'),false);assert.equal(V.entries(records).length,1);
  const before=structuredClone(records);
  const batch={batchId:'bad',entries:[input('valid'),input('bad',{count:0})].map(e=>({...e,key:V.entryKey(e.text,e.type,e.channel)}))};
  assert.throws(()=>V.importPlan(records,batch));assert.deepEqual(records,before);
  assert.throws(()=>V.add(records,input('item',{count:1.5})));
  assert.throws(()=>V.add(records,input('item',{channel:'unknown'})));
});

test('英语同步备份保留新记录与未知键，独立词条并发合并、同词冲突显式保留',()=>{
  const records={'unknown.future.record':{status:'using',note:'future'}};apply(records,V.add(records,input('item')));
  const base=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records))));assert.deepEqual(base.records,records);
  const local=structuredClone(base),remote=structuredClone(base);apply(local.records,V.add(local.records,input('local')));apply(remote.records,V.add(remote.records,input('remote')));
  const merged=Sync.merge(base,local,remote);assert.equal(merged.conflicts.length,0);assert.equal(V.summary(merged.snapshot.records).listening.word.unique,3);assert.deepEqual(merged.snapshot.records['unknown.future.record'],records['unknown.future.record']);
  const key=V.entryKey('item','word','listening');apply(local.records,V.edit(local.records,key,input('item',{count:2})));apply(remote.records,V.edit(remote.records,key,input('item',{count:3})));
  assert.ok(Sync.merge(base,local,remote).conflicts.length>0);
});


test('历史次数仅保留兼容字段，新输入去重且编辑分类不改旧次数',()=>{
  const key=V.entryKey('ball','word','listening'),records={[key]:V.pack({...input('ball'),count:7,aliases:[],futureField:'保留'})};
  apply(records,V.add(records,input('BALL',{count:99})));
  assert.equal(V.decode(records[key]).count,7);
  assert.equal(V.decode(records[key]).futureField,'保留');
  assert.deepEqual(V.summary(records).listening.word,{unique:1});
  apply(records,V.edit(records,key,{...V.entries(records)[0],categoryId:'food'}));
  assert.equal(V.decode(records[key]).count,7);
});

test('单词按名词、动词及其他分组，分类使用定义顺序并保留全部已记录分类',()=>{
  const records={};
  for(const e of [input('run',{categoryId:'actions',pos:'verb'}),input('cat',{categoryId:'animals'}),input('ear',{categoryId:'body'}),input('red',{categoryId:'attributes',pos:''}),input('apple',{categoryId:'food'}),input('bye',{type:'phrase',categoryId:'routines'}),input('cat',{channel:'speaking'})])apply(records,V.add(records,e));
  const before=structuredClone(records),groups=V.groupEntries(records);
  assert.deepEqual(groups.map(g=>g.id),['noun','verb','other']);
  assert.deepEqual(groups[0].categories.map(c=>c.id),['body','objects','nature']);
  assert.equal(groups.reduce((n,g)=>n+g.total,0),5);
  assert.equal(V.groupEntries(records,{search:'动物'})[0].categories[0].entries[0].text,'cat');
  assert.equal(V.groupEntries(records,{channel:'speaking'})[0].total,1);
  assert.deepEqual(V.groupEntries(records,{type:'phrase'}).map(g=>g.id),['phrase']);
  apply(records,V.categoryChange(records,'nature','',{deleted:true}));
  assert.equal(V.groupEntries(records)[0].categories.at(-1).id,'uncategorized');
  assert.equal(V.summary(records).listening.word.unique,5);
  assert.deepEqual(Object.keys(before).filter(k=>k.startsWith(V.ENTRY)),Object.keys(records).filter(k=>k.startsWith(V.ENTRY)));
});


test('形容词和副词独立分组，编辑、导入与同步保留词性，重复不覆盖旧词性',()=>{
  const records={};
  apply(records,V.add(records,input('soft',{pos:'adjective',categoryId:'attributes'})));
  const data=V.parseImport('slowly',{type:'word',channel:'listening',pos:'adverb',categoryId:'attributes'},'adverbs');
  apply(records,V.importPlan(records,data));
  assert.deepEqual(V.groupEntries(records).map(g=>g.id),['adjective','adverb']);
  assert.deepEqual(V.summary(records).listening.word,{unique:2});
  const key=V.entryKey('soft','word','listening');
  apply(records,V.add(records,input('soft',{pos:'noun'})));
  assert.equal(V.decode(records[key]).pos,'adjective');
  apply(records,V.edit(records,key,{...V.entries(records).find(e=>e.key===key),pos:'adverb'}));
  const roundtrip=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records))));
  assert.deepEqual(roundtrip.records,records);
  assert.deepEqual(V.groupEntries(roundtrip.records).map(g=>[g.id,g.total]),[['adverb',2]]);
  assert.equal(V.summary(records).speaking.word.unique,0);
});

test('粗分类兼容旧分类ID与默认旧名称，读取分组不改原词条或丢失个人分类',()=>{
  const records={
    [V.CATEGORY+'objects']:V.pack({name:'日常物品'}),
    [V.CATEGORY+'food']:V.pack({name:'食物饮品'}),
    [V.CATEGORY+'custom']:V.pack({name:'自建分类'}),
    [V.CATEGORY+'gone']:V.pack({name:'已删除'},'not-started')
  };
  for(const [name,categoryId] of [['milk','food'],['hat','clothing'],['ball','objects'],['cat','animals'],['tree','nature'],['mother','people'],['home','places'],['wash','routines'],['toy','custom'],['old','gone']]){
    const e={...input(name,{categoryId}),count:4,aliases:[],futureField:9};records[V.entryKey(name,'word','listening')]=V.pack(e);
  }
  const before=structuredClone(records),cats=V.categories(records);
  assert.deepEqual(cats.map(c=>c.id),['body','objects','nature','transport','actions','attributes','custom','uncategorized']);
  assert.equal(cats.find(c=>c.id==='objects').name,'日常用品');
  const all=V.groupEntries(records)[0].categories;
  assert.deepEqual(all.find(c=>c.id==='objects').entries.map(e=>e.text),['ball','hat','milk']);
  assert.deepEqual(all.find(c=>c.id==='nature').entries.map(e=>e.text),['cat','tree']);
  assert.equal(V.resolveCategory(records,'food'),'objects');
  assert.equal(V.resolveCategory(records,'clothing'),'objects');
  assert.equal(V.resolveCategory(records,'gone'),'uncategorized');
  assert.equal(V.summary(records).listening.word.unique,10);
  assert.deepEqual(records,before);
  assert.deepEqual(Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records)))).records,before);
  const foodOnly=V.groupEntries(records,{categoryId:'objects'})[0].categories;
  assert.equal(foodOnly[0].entries.length,3);
  assert.equal(V.groupEntries(records,{categoryId:'food'})[0].categories[0].entries.length,3);
  const legacy=V.parseImport(JSON.stringify({version:1,batchId:'legacy-categories',entries:[input('apple',{categoryId:'food'})]}),{},'ignored');
  const imported=V.importPlan(records,legacy);
  assert.equal(V.decode(imported[V.entryKey('apple','word','listening')]).categoryId,'objects');
  apply(records,V.categoryChange(records,'objects','',{deleted:true}));
  assert.equal(V.resolveCategory(records,'food'),'uncategorized');
  assert.equal(V.groupEntries(records)[0].categories.at(-1).entries.length,4);
});
