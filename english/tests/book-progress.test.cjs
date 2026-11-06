const test=require('node:test');
const assert=require('node:assert/strict');
const B=require('../book-progress.js');
const Sync=require('../../shared/sync-model.js');
const plan={id:'sample',resourceId:'material-one',resourceIds:['material-one','material-alias'],scopeIds:['whole-edition'],groups:[{id:'A',scopeIds:['part-a']},{id:'B',scopeIds:['part-b']}],stageGroups:{'stage-three':'A','stage-four':'B'},externalMatch:{prefixes:['Example GK']},books:[
  {id:'sample-01',number:1,title:'At the market',group:'A',order:2},
  {id:'sample-02',number:2,title:'Funny things',aliases:['Funny'],group:'A',order:1},
  {id:'sample-03',number:3,title:'The park',group:'B',order:3}
]};
const data={version:1,plans:[plan]};
const snapshot=(books,extra={})=>({schemaVersion:1,sourceKind:'xiaohuasheng_bookcase_read',authenticated:true,complete:true,accountId:'sample-owner',snapshotId:'sample-snapshot',fetchedAt:'2026-11-06T00:00:00Z',books,...extra});
const entry=(bookId,title)=>({bookId,title});
const imported=(records,items)=>B.applyReadSnapshot(records,data,snapshot(items));
const wrap=records=>({version:1,profile:{vocabulary:0,mode:'audio'},favorites:[],records});

test('历史素材身份引用同一公共书单；阶段筛选保留原表顺序且不变更源数据',()=>{
  assert.equal(B.planForResource(data,'material-alias'),plan);
  assert.equal(B.planForResource(data,'missing'),null);
  assert.equal(B.groupForStage(plan,'stage-three'),'A');
  assert.equal(B.groupForStage(plan,'unknown'),'all');
  const before=structuredClone(data);
  assert.deepEqual(B.books(plan,'A').map(book=>book.id),['sample-02','sample-01']);
  assert.equal(B.books(plan,'all').length,3);
  assert.deepEqual(data,before);
});

test('手动打勾和取消只修改同一单册身份，各阶段及套系即时投影数量与百分比',()=>{
  let records={};
  records={...records,...B.manualUpdate(records,'sample-01',true)};
  assert.deepEqual(B.bookState(records,'sample-01'),{done:true,manual:true,external:[]});
  assert.deepEqual(B.progress(records,plan,'A'),{completed:1,total:2,percent:50,status:'using',identifiedCompleted:1,legacyCompleted:0});
  assert.equal(B.progress(records,plan,'all').completed,1);
  assert.equal(B.progress(records,plan,'B').completed,0);
  records={...records,...B.manualUpdate(records,'sample-02',true)};
  assert.equal(B.progress(records,plan,'A').status,'done');
  records={...records,...B.manualUpdate(records,'sample-01',false)};
  assert.equal(B.progress(records,plan,'A').percent,50);
  assert.equal(B.bookState(records,'sample-01').done,false);
});

test('历史聚合数量不摊派逐本，不与明确勾选相加；其他版本和未知范围保持独立',()=>{
  const records=B.manualUpdate({},'sample-01',true),legacy={completed:2,total:2,percent:100,status:'done',unit:'本'};
  assert.equal(B.progress(records,plan,'A',legacy).completed,2);
  assert.equal(B.progress(records,plan,'A',legacy).identifiedCompleted,1);
  assert.equal(B.bookState(records,'sample-02').done,false);
  assert.equal(B.projectQuantity(records,plan,{id:'part-a',total:2},legacy).completed,2);
  assert.equal(B.projectQuantity(records,plan,{id:'other-edition',total:3},legacy),legacy);
  assert.equal(B.projectQuantity(records,plan,{id:'part-a',total:50},legacy),legacy);
  assert.equal(B.projectQuantity(records,plan,null,legacy),legacy);
});

test('只接受带明确套系前缀及精确标题的书目；编号冲突与重名版本不自动合并',()=>{
  const result=imported({},[
    entry('a','EXAMPLE GK-01: At the Market'),
    entry('b','Example GK: Funny'),
    entry('c','The park'),
    entry('d','Example GK-01: The Park'),
    entry('e','Another Series GK-03: The Park'),
    entry('f','Example GK-02: Funny things revised')
  ]);
  assert.deepEqual(result.matched.map(book=>book.publicBookId),['sample-01','sample-02']);
  assert.equal(result.unmatched.length,3);
  assert.equal(result.ambiguous.length,1);
  const duplicate=structuredClone(data);
  duplicate.plans.push({...structuredClone(plan),id:'other-edition',books:[{id:'other-book',number:1,title:'At the market',group:'A',order:1}]});
  const uncertain=B.applyReadSnapshot({},duplicate,snapshot([entry('a','Example GK-01 At the Market')]));
  assert.equal(uncertain.matched.length,0);
  assert.equal(uncertain.ambiguous.length,1);
  assert.deepEqual(uncertain.changes,{});
});

test('重复快照及多个外部ID不重复计数，手工和小花生来源分别保留，缺失不清空',()=>{
  let records=B.manualUpdate({},'sample-01',true);
  const first=imported(records,[entry('a','Example GK-01 At the Market'),entry('b','Example GK-01 At the Market')]);
  assert.equal(first.matched.length,2);
  records={...records,...first.changes};
  assert.equal(B.bookState(records,'sample-01').external.length,2);
  assert.equal(B.progress(records,plan).completed,1);
  assert.deepEqual(imported(records,[entry('a','Example GK-01 At the Market'),entry('b','Example GK-01 At the Market')]).changes,{});
  assert.deepEqual(imported(records,[]).changes,{});
  records={...records,...B.manualUpdate(records,'sample-01',false)};
  assert.equal(B.bookState(records,'sample-01').manual,false);
  assert.equal(B.bookState(records,'sample-01').done,true);
  assert.equal(B.progress(records,plan).completed,1);
  const before=structuredClone(records);
  const conflict=imported(records,[entry('a','Example GK-03 The Park')]);
  assert.equal(conflict.ambiguous.length,1);
  assert.deepEqual(conflict.changes,{});
  assert.deepEqual(records,before);
});

test('不完整、匿名、全书架及计数不一致的来源整体拒绝，不能触碰已有记录',()=>{
  const records=B.manualUpdate({},'sample-01',true),before=structuredClone(records);
  const books=[entry('a','Example GK-03 The Park')];
  for(const extra of [
    {complete:false},{authenticated:false},{sourceKind:'xiaohuasheng_all_books'},
    {sourceUrl:'https://www.xiaohuasheng.cn/bookcase/user_123/tag_-2'},
    {advertisedCount:2},{actualUniqueCount:2},{snapshotId:''},{fetchedAt:'invalid'}
  ])assert.throws(()=>B.applyReadSnapshot(records,data,snapshot(books,extra)));
  assert.throws(()=>imported(records,[...books,entry('a','Example GK-01 At the Market')]));
  assert.deepEqual(records,before);
});

test('公开素材无匹配声明时不推断套系；同标题只能由显式书名别名补证',()=>{
  const unconfigured={plans:[{...plan,externalMatch:undefined}]};
  const result=B.applyReadSnapshot({},unconfigured,snapshot([entry('a','Example GK-01 At the Market')]));
  assert.equal(result.matched.length,0);
  assert.equal(result.unmatched.length,1);
  assert.deepEqual(result.changes,{});
});

test('逐本手工和外部事实沿用英语备份及三方同步契约，互不覆盖并可往返',()=>{
  const manual=B.manualUpdate({},'sample-01',true);
  const external=imported({},[entry('a','Example GK-03 The Park')]).changes;
  const local=Sync.normalize('english',wrap(manual)),remote=Sync.normalize('english',wrap(external));
  const merged=Sync.merge(wrap({}),local,remote);
  assert.equal(merged.conflicts.length,0);
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(merged.snapshot)));
  assert.deepEqual(restored.records,{...manual,...external});
  assert.equal(B.progress(restored.records,plan).completed,2);
  assert.ok(Object.entries(restored.records).every(([key,record])=>key.length<=160&&record.note.length<=4000));
});


test('动态出版范围按显式版本及分项身份投影勾选，不能只按同名级别或相同总册数借用',()=>{
  const localPlan=structuredClone(plan);
  Object.assign(localPlan.groups[0],{edition:'Domestic sample edition',parts:[{label:'A',count:2}]});
  Object.assign(localPlan.groups[1],{edition:'Domestic sample edition',parts:[{label:'B',count:1}]});
  const dynamic={id:'dynamic-range-generated',label:'A selected',edition:'Domestic sample edition',parts:[{label:'A',count:2}],total:2};
  const records=B.manualUpdate({},'sample-01',true),legacy={completed:0,total:2,percent:0,status:'not-started',unit:'本'};
  assert.equal(B.scopeGroup(localPlan,dynamic),'A');
  assert.equal(B.projectQuantity(records,localPlan,dynamic,legacy).completed,1);
  assert.equal(B.projectQuantity(records,localPlan,dynamic,legacy).percent,50);
  for(const scope of [
    {...dynamic,edition:'Another edition'},
    {...dynamic,edition:''},
    {...dynamic,parts:[{label:'B',count:2}]},
    {...dynamic,parts:[{label:'A',count:1}]},
    {...dynamic,parts:[{label:'A',count:2},{label:'extra',count:0}]},
    {...dynamic,parts:[]}
  ]){
    assert.equal(B.scopeGroup(localPlan,scope),null);
    assert.equal(B.projectQuantity(records,localPlan,scope,legacy),legacy);
  }
  assert.equal(B.scopeGroup(localPlan,{id:'whole-edition'}),'all');
  assert.equal(B.scopeGroup(localPlan,{id:'part-a'}),'A');
  assert.equal(B.scopeGroup(localPlan,null),null);
});

test('实际GK70书单覆盖70个稳定单册，六阶段生成的出版范围引用同一份逐本事实',()=>{
  const actual=require('../data/reading-plans.json'),P=require('../practice.js'),volumes=require('../data/resource-volumes.json');
  const plan=B.planForResource(actual,'resource-hojfp0');
  assert.equal(plan,B.planForResource(actual,'resource-9fvmjt'));
  assert.equal(new Set(plan.books.map(b=>b.id)).size,70);
  assert.deepEqual(plan.groups.map(g=>B.books(plan,g.id).length),[43,15,12]);
  assert.deepEqual(B.books(plan).slice(0,7).map(b=>b.number),[1,6,7,8,29,38,45]);
  assert.deepEqual(plan.books.filter(b=>!b.patterns.length).map(b=>b.number).sort((a,b)=>a-b),[60,64,69]);
  const records=B.manualUpdate({},'heinemann-gk70-01',true);
  for(const resourceId of plan.resourceIds){
    const scope=P.bookScopes(resourceId,[resourceId===plan.resourceId?'A':'GK70 A'],volumes,'xu-3').find(s=>B.scopeGroup(plan,s)==='A');
    assert.equal(B.scopeGroup(plan,scope),'A');
    assert.equal(B.projectQuantity(records,plan,scope,{completed:0}).completed,1);
    assert.equal(B.projectQuantity(records,plan,scope,{completed:0}).total,43);
  }
});
