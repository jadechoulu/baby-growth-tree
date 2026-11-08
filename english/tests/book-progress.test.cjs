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

test('RAZ按明确级别和完整题名同步单册，部分目录不当出版分母',()=>{
  const directory=require('../data/resource-books.json'),catalog=require('../data/resource-volumes.json');
  const book=directory.books.find(book=>book.resourceId==='resource-1qnd5uh'&&book.level==='aa');
  const input=snapshot([entry('raz-one','RAZ AA: '+book.title),entry('bare',book.title)]);
  const result=B.applyReadSnapshot({},data,input,{directory,catalog,sourcePriority:true});
  assert.equal(result.matched.length,1);
  assert.equal(result.matched[0].publicBookId,book.id);
  assert.equal(result.unmatched.length,1);
  assert.equal(B.bookState(result.changes,book.id).done,true);
  const progress=B.directoryProgress(result.changes,directory,catalog,book.resourceId);
  assert.equal(progress.completed,1);
  assert.equal(progress.total,null);
  assert.equal(progress.percent,null);
  assert.equal(progress.status,'using');
  const manual=B.manualUpdate({},book.id,true);
  assert.equal(B.directoryProgress(manual,directory,catalog,book.resourceId).completed,1);
  assert.equal(B.directoryProgress({...manual,...B.manualUpdate(manual,book.id,false)},directory,catalog,book.resourceId).completed,0);
});

test('明确选择小花生优先后按具体书目计算，旧合计只保留不抬升数量',()=>{
  const old={legacy:{status:'using',note:'原合计保留'}};
  const result=B.applyReadSnapshot(old,data,snapshot([entry('a','Example GK-01 At the market')]),{sourcePriority:true});
  const records={...old,...result.changes};
  assert.equal(B.progress(records,plan,'all',{completed:2}).completed,1);
  assert.equal(B.progress(records,plan,'A',{completed:2}).completed,1);
  assert.equal(B.progress(records,plan,'B',{completed:1}).completed,0);
  assert.deepEqual(records.legacy,old.legacy);
  assert.deepEqual(B.applyReadSnapshot(records,data,snapshot([entry('a','Example GK-01 At the market')]),{sourcePriority:true}).changes,{});
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records))));
  assert.equal(B.progress(restored.records,plan,'all',{completed:2}).completed,1);
  Object.assign(records,B.manualUpdate(records,'sample-03',true));
  assert.equal(B.progress(records,plan).completed,2);
  const merged=B.applyReadSnapshot(records,data,snapshot([entry('a','Example GK-01 At the market')]),{sourcePriority:false});
  assert.equal(B.progress({...records,...merged.changes},plan,'all',{completed:3}).completed,3);
});

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
  assert.deepEqual(B.bookState(records,'sample-01'),{done:true,manual:true,external:[],readCount:null});
  assert.deepEqual(B.progress(records,plan,'A'),{completed:1,total:2,percent:50,status:'using',identifiedCompleted:1,legacyCompleted:0});
  assert.equal(B.progress(records,plan,'all').completed,1);
  assert.equal(B.progress(records,plan,'B').completed,0);
  records={...records,...B.manualUpdate(records,'sample-02',true)};
  assert.equal(B.progress(records,plan,'A').status,'done');
  records={...records,...B.manualUpdate(records,'sample-01',false)};
  assert.equal(B.progress(records,plan,'A').percent,50);
  assert.equal(B.bookState(records,'sample-01').done,false);
});

test('内化星标与完成相互独立；完成与取消不覆盖内化，不计完成数量',()=>{
  let records={other:{status:'using',note:'保留其他记录'}};
  assert.equal(B.internalized(records,'sample-01'),false);
  records={...records,...B.internalizationUpdate(records,'sample-01',true)};
  assert.equal(B.internalized(records,'sample-01'),true);
  assert.equal(B.bookState(records,'sample-01').done,false);
  assert.equal(B.progress(records,plan).completed,0);
  assert.deepEqual(B.internalizationUpdate(records,'sample-01',true),{});
  records={...records,...B.manualUpdate(records,'sample-01',true)};
  assert.equal(B.internalized(records,'sample-01'),true);
  records={...records,...B.internalizationUpdate(records,'sample-01',false)};
  assert.equal(B.internalized(records,'sample-01'),false);
  assert.equal(B.bookState(records,'sample-01').done,true);
  records={...records,...B.internalizationUpdate(records,'sample-01',true),...B.manualUpdate(records,'sample-01',false)};
  assert.equal(B.bookState(records,'sample-01').done,false);
  assert.equal(B.internalized(records,'sample-01'),true);
  assert.deepEqual(records.other,{status:'using',note:'保留其他记录'});
  assert.throws(()=>B.internalizationUpdate(records,'',true));
  assert.throws(()=>B.internalizationUpdate(records,'sample-01','true'));
});

test('同本完成与内化分别同步，备份往返保留星标且取消只改内化记录',()=>{
  const completed=B.manualUpdate({},'sample-01',true),internalized=B.internalizationUpdate({},'sample-01',true);
  const merged=Sync.merge(wrap({}),Sync.normalize('english',wrap(completed)),Sync.normalize('english',wrap(internalized)));
  assert.equal(merged.conflicts.length,0);
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(merged.snapshot)));
  assert.equal(B.bookState(restored.records,'sample-01').done,true);
  assert.equal(B.internalized(restored.records,'sample-01'),true);
  const changes=B.internalizationUpdate(restored.records,'sample-01',false);
  assert.deepEqual(Object.keys(changes),[B.INTERNALIZED+'sample-01']);
  const result=Sync.normalize('english',wrap({...restored.records,...changes}));
  assert.equal(B.internalized(result.records,'sample-01'),false);
  assert.equal(B.bookState(result.records,'sample-01').done,true);
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

const directory={books:[
  {id:'new-upper-one',resourceId:'series-one',edition:'New upper',level:'Upper · 1',title:'My Home',number:1},
  {id:'new-upper-two',resourceId:'series-one',edition:'New upper',level:'Upper · 2',title:'My Garden',number:2},
  {id:'new-lower-one',resourceId:'series-one',edition:'New lower',level:'Lower · 3',title:'My Home',number:3},
  {id:'old-one',resourceId:'series-one',edition:'Old edition',level:'1',title:'My Home',number:1},
  {id:'other-series-one',resourceId:'series-two',edition:'New upper',level:'Upper · 1',title:'My Home',number:1}
],externalMatches:[
  {resourceId:'series-one',prefixes:['Example New Upper'],directoryMatch:{edition:'New upper'},ignoreNumber:true},
  {resourceId:'series-one',prefixes:['Example New Lower'],directoryMatch:{edition:'New lower'},ignoreNumber:true}
]};
const catalog={series:[{resourceId:'series-one',edition:'New selected edition',scopes:[
  {id:'all-new',label:'Upper and lower',parts:[{label:'Upper',count:2,directoryMatch:{edition:'New upper'}},{label:'Lower',count:1,directoryMatch:{edition:'New lower'}}]},
  {id:'upper',label:'Upper',parts:[{label:'Upper',count:2}]},
  {id:'old',label:'Upper',edition:'Old selected edition',parts:[{label:'Upper',count:5,directoryMatch:{edition:'Old edition'}}]}
]},{resourceId:'series-alias',catalogResourceId:'series-one'},{resourceId:'series-two',edition:'Other selected edition',scopes:[
  {id:'other',label:'Upper',parts:[{label:'Upper',count:2,directoryMatch:{edition:'New upper'}}]}
]}]};
const upperScope={id:'upper-generated',label:'Upper',edition:'New selected edition',total:2,unit:'本',origin:'catalog'};
const lowerScope={...upperScope,id:'lower-generated',label:'Lower',total:1};
const oldQuantity={completed:2,total:2,percent:100,status:'done',unit:'本'};
const directoryImport=(records,items,options={})=>B.applyReadSnapshot(records,{plans:[]},snapshot(items),{directory,catalog,...options});

test('同册在基础选本与完整目录共用勾选，显式子集不混入增补册或另一版',()=>{
  const directory={books:[
    {id:'base-a',resourceId:'same-series',edition:'原版',level:'6',title:'First',externalIds:{xiaohuasheng:['public-a']}},
    {id:'base-b',resourceId:'same-series',edition:'原版',level:'6',title:'Second'},
    {id:'extra',resourceId:'same-series',edition:'原版',level:'6',title:'Extra'},
    {id:'another-edition',resourceId:'same-series',edition:'另一版',level:'6',title:'First'}
  ]},catalog={series:[{resourceId:'same-series',unit:'本',scopes:[
    {id:'complete',edition:'含增补的选本',parts:[{label:'6级完整',count:3,directoryMatch:{edition:'原版',level:'6'}}]},
    {id:'base',edition:'基础选本',parts:[{label:'6级基础',count:2,directoryMatch:{edition:'原版',level:'6',bookIds:['base-a','base-b']}}]}
  ]}]};
  const plans=B.catalogPlans(directory,catalog,'same-series'),all=plans.find(p=>p.edition==='含增补的选本'),base=plans.find(p=>p.edition==='基础选本');
  assert.equal(all.books.length,3);assert.deepEqual(base.books.map(b=>b.id),['base-a','base-b']);
  let records=B.manualUpdate({},'base-a',true);
  assert.equal(B.progress(records,all).completed,1);assert.equal(B.progress(records,base).completed,1);
  records={...records,...B.manualUpdate(records,'extra',true)};
  assert.equal(B.progress(records,all).completed,2);assert.equal(B.progress(records,base).completed,1);
  records={...records,...B.manualUpdate(records,'base-a',false)};
  assert.equal(B.progress(records,base).completed,0);
  const result=B.applyReadSnapshot(records,{plans:[]},snapshot([entry('public-a','First')]),{directory,catalog,sourcePriority:true});
  assert.equal(result.matched.length,1);assert.equal(result.matched[0].publicationScopes.length,2);
  records={...records,...result.changes};
  assert.equal(B.progress(records,base).completed,1);assert.equal(B.progress(records,all).completed,2);
  assert.equal(B.bookState(records,'another-edition').done,false);
});

test('目录匹配限定明确版本和套系，以公共单册分项归属而非外站分包编号计算',()=>{
  const result=directoryImport({},[entry('d1','Example New Upper: 99 My Home'),entry('d2','Example New Upper: 77 My Garden'),entry('bare','My Home')]);
  assert.deepEqual(result.matched.map(item=>item.publicBookId),['new-upper-one','new-upper-two']);
  assert.equal(result.unmatched.length,1);
  const records=result.changes,scope=B.projectScopeQuantity(records,'series-one',upperScope,{completed:0},catalog);
  assert.equal(scope.completed,2);
  assert.equal(scope.externalCompleted,2);
  assert.equal(scope.percent,100);
  assert.equal(scope.sourcePriority,false);
  assert.equal(B.projectScopeQuantity(records,'series-two',{...upperScope,edition:'Other selected edition'},oldQuantity,catalog),oldQuantity);
  assert.equal(B.projectScopeQuantity(records,'series-one',{...upperScope,edition:'Old selected edition',total:5},oldQuantity,catalog),oldQuantity);
  const ambiguous=structuredClone(directory);
  ambiguous.externalMatches.push({resourceId:'series-two',prefixes:['Example New Upper'],directoryMatch:{edition:'New upper'},ignoreNumber:true});
  const uncertain=B.applyReadSnapshot({},data,snapshot([entry('d1','Example New Upper: 99 My Home')]),{directory:ambiguous,catalog});
  assert.equal(uncertain.matched.length,0);
  assert.equal(uncertain.ambiguous.length,1);
  assert.deepEqual(uncertain.changes,{});
});

test('来源优先覆盖本版全部分项，零条分项不回显旧合计；其他版本与原记录完全保留',()=>{
  const previous={legacy:{status:'using',note:'旧数量与手记原样保留'}};
  const result=directoryImport(previous,[entry('d1','Example New Upper: 99 My Home')],{sourcePriority:true});
  const records={...previous,...result.changes};
  const upper=B.projectScopeQuantity(records,'series-alias',upperScope,oldQuantity,catalog);
  assert.equal(upper.completed,1);
  assert.equal(upper.percent,50);
  assert.equal(upper.externalCompleted,1);
  assert.equal(upper.sourcePriority,true);
  const lower=B.projectScopeQuantity(records,'series-one',lowerScope,{completed:1},catalog);
  assert.equal(lower.completed,0);
  assert.equal(lower.percent,0);
  assert.equal(lower.sourcePriority,true);
  assert.deepEqual(records.legacy,previous.legacy);
  assert.deepEqual(previous,{legacy:{status:'using',note:'旧数量与手记原样保留'}});
  for(const scope of [{...upperScope,edition:'Other edition'},{...upperScope,total:3},{...upperScope,origin:'personal'},{...upperScope,unit:'张'}])
    assert.equal(B.projectScopeQuantity(records,'series-one',scope,oldQuantity,catalog),oldQuantity);
  assert.equal(B.projectScopeQuantity(records,'missing',upperScope,oldQuantity,catalog),oldQuantity);
  assert.equal(B.projectScopeQuantity(records,'series-one',null,oldQuantity,catalog),oldQuantity);
  const merge=directoryImport(records,[entry('d1','Example New Upper: 99 My Home')],{sourcePriority:false});
  assert.equal(B.projectScopeQuantity({...records,...merge.changes},'series-one',upperScope,oldQuantity,catalog).completed,2);
});

test('组合范围按分项身份及公共单册去重，重复快照幂等，缺失不清空历史事实',()=>{
  const items=[entry('d1','Example New Upper 99 My Home'),entry('d2','Example New Upper 99 My Home'),entry('d3','Example New Lower 3 My Home')];
  const first=directoryImport({},items,{sourcePriority:true}),records=first.changes;
  const both={id:'combo',label:'Upper+Lower',edition:upperScope.edition,total:3,parts:[{label:'Upper',count:2},{label:'Upper',count:2},{label:'Lower',count:1}]};
  assert.equal(B.projectScopeQuantity(records,'series-one',both,{completed:3},catalog).completed,2);
  assert.equal(B.projectScopeQuantity(records,'series-one',both,{completed:3},catalog).total,3);
  assert.equal(B.projectScopeQuantity(records,'series-one',both,{completed:3},catalog).externalCompleted,2);
  assert.deepEqual(directoryImport(records,items,{sourcePriority:true}).changes,{});
  assert.deepEqual(directoryImport(records,[],{sourcePriority:true}).changes,{});
  const latest=directoryImport(records,[entry('d1','Example New Upper 99 My Home')],{sourcePriority:true});
  assert.equal(B.projectScopeQuantity({...records,...latest.changes},'series-one',both,{completed:3},catalog).completed,2);
  const overlapCatalog=structuredClone(catalog);
  overlapCatalog.series[0].scopes[0].parts[1].directoryMatch={edition:'New upper'};
  const overlap=directoryImport({},items.slice(0,1),{catalog:overlapCatalog,sourcePriority:true});
  assert.equal(B.projectScopeQuantity(overlap.changes,'series-one',both,{completed:3},overlapCatalog).completed,1);
});

test('旧事实升级仅补目录范围元数据，保留来源原时点与未知字段，冲突不改已有映射',()=>{
  const key=B.EXTERNAL+'sample-owner:d1',original={status:'done',note:JSON.stringify({version:1,sourceKind:'xiaohuasheng_bookcase_read',publicBookId:'new-upper-one',snapshotId:'previous-snapshot',observedAt:'2026-11-05T00:00:00Z',custom:'保留'})};
  const records={[key]:original},items=[entry('d1','Example New Upper 99 My Home')];
  const first=directoryImport(records,items),upgraded={...records,...first.changes};
  assert.equal(B.projectScopeQuantity(upgraded,'series-one',upperScope,{completed:0},catalog).completed,1);
  assert.equal(JSON.parse(upgraded[key].note).snapshotId,'previous-snapshot');
  assert.equal(JSON.parse(upgraded[key].note).custom,'保留');
  assert.deepEqual(directoryImport(upgraded,items).changes,{});
  assert.deepEqual(records[key],original);
  const conflict=directoryImport(records,[entry('d1','Example New Upper 99 My Garden')]);
  assert.equal(conflict.ambiguous.length,1);
  assert.deepEqual(conflict.changes,{});
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(upgraded))));
  assert.deepEqual(restored.records,upgraded);
});

test('逐本计划与公共目录指向同一单册时合并匹配元数据，原计划来源优先规则继续有效',()=>{
  const sameDirectory={books:[{id:'sample-01',resourceId:'series-one',edition:'New upper',title:'At the market',number:1}],externalMatches:[{resourceId:'series-one',prefixes:['Example GK'],directoryMatch:{edition:'New upper'}}]};
  const result=B.applyReadSnapshot({},data,snapshot([entry('d1','Example GK 1 At the market')]),{directory:sameDirectory,catalog,sourcePriority:true});
  assert.equal(result.matched.length,1);
  assert.equal(result.matched[0].planId,'sample');
  assert.equal(B.progress(result.changes,plan,'all',{completed:3}).completed,1);
  assert.equal(B.projectScopeQuantity(result.changes,'series-one',upperScope,oldQuantity,catalog).completed,1);
});

test('公共完整目录生成逐本列表，按精确版本和级别定位，别名引用相同单册ID',()=>{
  const before=structuredClone({directory,catalog});
  const plan=B.planForResource({plans:[]},'series-alias',directory,catalog,upperScope);
  assert.ok(plan.catalog);
  const group=B.scopeGroup(plan,upperScope);
  assert.deepEqual(B.books(plan,group).map(book=>book.id),['new-upper-one','new-upper-two']);
  assert.deepEqual(B.books(plan).map(book=>book.id),['new-upper-one','new-upper-two','new-lower-one']);
  const whole={edition:upperScope.edition,parts:[{label:'Upper',count:2},{label:'Lower',count:1}],total:3};
  assert.equal(B.scopeGroup(plan,whole),'all');
  assert.equal(B.planForResource({plans:[]},'series-one',directory,catalog,{...upperScope,edition:'Old selected edition'}),null);
  assert.equal(B.planForResource({plans:[]},'series-one',directory,catalog,{...upperScope,total:9}),null);
  assert.equal(B.planForResource({plans:[]},'series-one',directory,catalog,null),null,'路线未绑定范围时不能默认首个目录');
  assert.ok(B.planForResource({plans:[]},'series-one',directory,catalog),'套系总览仍可打开公共目录');
  assert.deepEqual({directory,catalog},before);
});

test('目录单册手动和外部勾选去重，刷新及跨路线范围投影一致，不能传播到其他版本',()=>{
  const plan=B.planForResource({plans:[]},'series-one',directory,catalog,upperScope),group=B.scopeGroup(plan,upperScope);
  let records=directoryImport({},[entry('d1','Example New Upper 99 My Home')],{sourcePriority:true}).changes;
  assert.equal(B.progress(records,plan,group,{completed:2}).completed,1);
  Object.assign(records,B.manualUpdate(records,'new-upper-one',true),B.manualUpdate(records,'new-upper-two',true));
  assert.equal(B.progress(records,plan,group).completed,2);
  assert.equal(B.projectScopeQuantity(records,'series-alias',upperScope,{completed:0},catalog,directory).completed,2);
  assert.equal(B.progress(records,plan,B.scopeGroup(plan,lowerScope),{completed:1}).completed,0);
  Object.assign(records,B.manualUpdate(records,'new-upper-two',false));
  records=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records)))).records;
  assert.equal(B.progress(records,plan,group).completed,1);
  assert.equal(B.projectScopeQuantity(records,'series-one',upperScope,{completed:0},catalog,directory).completed,1);
  assert.equal(B.projectScopeQuantity(records,'series-one',{...upperScope,edition:'Old selected edition',total:5},oldQuantity,catalog,directory),oldQuantity);
  const onlyManual=B.manualUpdate({},'new-upper-two',true);
  assert.equal(B.projectScopeQuantity(onlyManual,'series-one',upperScope,{completed:0},catalog,directory).completed,1);
});

test('目录缺册或分项重叠不生成伪完整列表，旧合计不能推断具体哪本已读',()=>{
  const partial={...directory,books:directory.books.filter(book=>book.id!=='new-upper-two')};
  assert.equal(B.planForResource({plans:[]},'series-one',partial,catalog,upperScope),null);
  const overlap=structuredClone(catalog);
  overlap.series[0].scopes[0].parts[1]={label:'Other Upper',count:2,directoryMatch:{edition:'New upper'}};
  assert.equal(B.planForResource({plans:[]},'series-one',directory,overlap,upperScope),null);
  const plan=B.planForResource({plans:[]},'series-one',directory,catalog,upperScope);
  const result=B.progress({},plan,B.scopeGroup(plan,upperScope),{completed:2});
  assert.equal(result.completed,2);
  assert.equal(result.identifiedCompleted,0);
  assert.ok(B.books(plan).every(book=>!B.bookState({},book.id).done));
});

test('同版三个级别中选两个共用原单册事实，撤回与未选级别隔离，缺册不生成完整范围',()=>{
  const directory={books:['A','B','C'].map(level=>({id:'subset-'+level,resourceId:'subset',edition:'同版',level,title:level}))};
  const catalog={series:[{resourceId:'subset',scopes:[{id:'full',edition:'同版',parts:['A','B','C'].map(level=>({label:level,count:1,directoryMatch:{edition:'同版',level}}))}]}]};
  const scope={id:'ab',edition:'同版',total:2,parts:[{label:'A',count:1},{label:'B',count:1}]};
  const plan=B.planForResource({plans:[]},'subset',directory,catalog,scope);
  assert.equal(B.scopeGroup(plan,scope),'all');
  assert.deepEqual(B.books(plan).map(b=>b.id),['subset-A','subset-B']);
  let records={...B.manualUpdate({},'subset-A',true),...B.manualUpdate({},'subset-C',true)};
  assert.equal(B.projectQuantity(records,plan,scope).completed,1);
  Object.assign(records,B.manualUpdate(records,'subset-A',false));
  assert.equal(B.projectQuantity(records,plan,scope).completed,0);
  const partial={books:directory.books.filter(b=>b.level!=='B')};
  assert.equal(B.planForResource({plans:[]},'subset',partial,catalog,scope),null);
  assert.equal(B.planForResource({plans:[]},'subset',directory,catalog,{...scope,edition:'另一版'}),null);
});

test('RAZ庆爸虚构选本按公共成员生成分母与逐本进度，同一本跨总览及路线共用事实',()=>{
  const directory=require('../data/resource-books.json'),catalog=require('../data/resource-volumes.json'),P=require('../practice.js');
  for(const [level,total]of [['AA',18],['A',42],['B',57],['C',51],['D',43],['E',44],['F',41],['G',37],['H',34],['I',35],['J',37],['K',31],['M',33]]){
    const scope=P.bookScope(undefined,P.bookScopes('resource-1qnd5uh',[level+' · 虚构部分'],catalog));
    assert.equal(scope.total,total,level);
    const plan=B.planForResource({plans:[]},'resource-1qnd5uh',directory,catalog,scope),group=B.scopeGroup(plan,scope),books=B.books(plan,group);
    assert.equal(books.length,total,level);assert.ok(books.every(book=>book.genre==='fiction'));
    const book=books[0],records=B.manualUpdate({},book.id,true);
    assert.equal(B.projectQuantity(records,plan,scope).completed,1);
    assert.equal(B.directoryProgress(records,directory,catalog,'resource-1qnd5uh').completed,1);
    const nonmember=directory.books.find(b=>b.resourceId==='resource-1qnd5uh'&&b.level.toUpperCase()===level&&b.genre==='nonfiction');
    Object.assign(records,B.manualUpdate(records,nonmember.id,true));
    assert.equal(B.projectQuantity(records,plan,scope).completed,1);
    Object.assign(records,B.manualUpdate(records,book.id,false));
    assert.equal(B.projectQuantity(records,plan,scope).completed,0);
  }
  assert.equal(P.bookScopes('resource-1qnd5uh',['L · 虚构'],catalog).length,0,'分类未完整的L级不能生成完整虚构分母');
});

test('大猫Pink各22本与培生上下各48本使用共用目录，GK原表顺序和句型不变',()=>{
  const data=require('../data/reading-plans.json'),directory=require('../data/resource-books.json'),catalog=require('../data/resource-volumes.json'),P=require('../practice.js');
  for(const [resourceId,levels,expected] of [
    ['resource-g7xvo5',['Pink 1A','Pink 1B'],22],
    ['resource-1nuqi5t',['上辑','下辑'],48]
  ])for(const level of levels){
    const scopes=P.bookScopes(resourceId,[],catalog);
    const parent=scopes.find(scope=>scope.parts?.some(part=>part.label===level&&part.count===expected));
    const part=parent?.parts.find(part=>part.label===level);
    const scope=part&&{id:'part-test',label:part.label,total:part.count,edition:parent.edition,origin:'catalog'};
    assert.ok(scope,level);
    const plan=B.planForResource(data,resourceId,directory,catalog,scope);
    assert.ok(plan,level+' 应有完整公共书单');
    const group=B.scopeGroup(plan,scope);
    assert.equal(B.books(plan,group).length,expected);
    const book=B.books(plan,group)[0],records=B.manualUpdate({},book.id,true);
    assert.equal(B.progress(records,plan,group).completed,1);
    assert.equal(B.projectScopeQuantity(records,resourceId,scope,{completed:0},catalog,directory).completed,1);
    assert.ok(directory.books.some(item=>item.id===book.id));
  }
  const gk=B.planForResource(data,'resource-hojfp0',directory,catalog);
  assert.equal(gk,data.plans[0]);
  assert.deepEqual(B.books(gk).slice(0,7).map(book=>book.number),[1,6,7,8,29,38,45]);
  assert.ok(B.books(gk)[0].patterns.length);
});

test('公开书目身份匹配可承受外站题名变化，重复身份不自动勾选，重复同步幂等',()=>{
  const d=structuredClone(directory);
  d.books[0].externalIds={xiaohuasheng:['public-one']};
  const input=snapshot([entry('public-one','外站重新编辑过的题名')]);
  const result=B.applyReadSnapshot({},data,input,{directory:d,catalog,sourcePriority:true});
  assert.equal(result.matched[0].publicBookId,'new-upper-one');
  assert.equal(B.projectScopeQuantity(result.changes,'series-alias',upperScope,{completed:0},catalog,d).completed,1);
  assert.deepEqual(B.applyReadSnapshot(result.changes,data,input,{directory:d,catalog,sourcePriority:true}).changes,{});
  d.books[1].externalIds={xiaohuasheng:['public-one']};
  const duplicate=B.applyReadSnapshot({},data,input,{directory:d,catalog});
  assert.equal(duplicate.matched.length,0);
  assert.equal(duplicate.ambiguous.length,1);
  assert.deepEqual(duplicate.changes,{});
});

test('目录中的历史套系ID与公共套系共用完整书单和数量，保留原单册ID',()=>{
  const d=structuredClone(directory);
  d.books[0].resourceId='series-alias';
  const plan=B.planForResource({plans:[]},'series-one',d,catalog,upperScope);
  assert.deepEqual(B.books(plan,B.scopeGroup(plan,upperScope)).map(book=>book.id),['new-upper-one','new-upper-two']);
  const records=B.manualUpdate({},'new-upper-one',true);
  assert.equal(B.directoryProgress(records,d,catalog,'series-alias').completed,1);
  assert.equal(B.projectScopeQuantity(records,'series-one',upperScope,{completed:0},catalog,d).completed,1);
});

test('启明星1级44本目录连续完整，素材与两路线引用同一逐本事实',()=>{
  const d=require('../data/resource-books.json'),c=require('../data/resource-volumes.json'),P=require('../practice.js');
  const rid='resource-1mx6gx6',scope=P.bookScopes(rid,['1'],c).find(scope=>scope.id==='pearson-star-1-2025');
  const plan=B.planForResource({plans:[]},rid,d,c,scope),selected=B.books(plan,B.scopeGroup(plan,scope));
  assert.equal(selected.length,44);
  assert.deepEqual(selected.map(book=>book.number),Array.from({length:44},(_,i)=>i+1));
  assert.ok(selected.every(book=>book.cover.startsWith('https://img.xiaohuasheng.cn/')&&book.externalIds.xiaohuasheng.length===1));
  let records=B.manualUpdate({},selected[0].id,true);
  assert.equal(B.projectScopeQuantity(records,rid,scope,{completed:0},c,d).completed,1);
  Object.assign(records,B.manualUpdate(records,selected[0].id,false));
  assert.equal(B.progress(records,plan).completed,0);
  const result=B.applyReadSnapshot(records,{plans:[]},snapshot([entry(selected[1].externalIds.xiaohuasheng[0],selected[1].aliases[0])]),{directory:d,catalog:c,sourcePriority:true});
  assert.equal(result.matched.length,1);
  assert.equal(B.progress({...records,...result.changes},plan).completed,1);
  assert.equal(B.projectScopeQuantity({...records,...result.changes},rid,scope,{completed:30},c,d).completed,1);
});

test('学乐A与小书虫1级完整目录按明确版本共用逐本事实，不替代未核路线版本',()=>{
  const directory=require('../data/resource-books.json'),catalog=require('../data/resource-volumes.json'),P=require('../practice.js');
  for(const [rid,scopeId,total,prefix] of [
    ['resource-1cn6i3m','flr-parent-a',25,'First Little Readers Level A'],
    ['resource-10bn1i2','oxford-little-bookworms-1',8,'小书虫 牛津英语分级读物 1级']
  ]){
    const scope=P.bookScopes(rid,[],catalog).find(scope=>scope.id===scopeId);
    assert.equal(scope.default,false,'公开目录不能指定作者所用版本');
    const plan=B.planForResource({plans:[]},rid,directory,catalog,scope),group=B.scopeGroup(plan,scope),books=B.books(plan,group);
    assert.equal(books.length,total);
    const chosen=books[0],input=snapshot([entry(chosen.externalIds.xiaohuasheng[0],chosen.aliases[0])]);
    const synced=B.applyReadSnapshot({},{plans:[]},input,{directory,catalog,sourcePriority:true});
    assert.equal(synced.matched.length,1);
    assert.equal(B.projectScopeQuantity(synced.changes,rid,scope,{completed:0},catalog,directory).completed,1);
    assert.equal(B.directoryProgress(synced.changes,directory,catalog,rid).completed,1);
    const manual=B.manualUpdate({},chosen.id,true);
    assert.equal(B.progress(manual,plan,group).completed,1);
    assert.equal(B.progress({...manual,...B.manualUpdate(manual,chosen.id,false)},plan,group).completed,0);
    const titled=B.applyReadSnapshot({},{plans:[]},snapshot([entry('other-public-id',prefix+' '+chosen.title)]),{directory,catalog});
    assert.equal(titled.matched.length,1);
    assert.equal(titled.matched[0].publicBookId,chosen.id);
    assert.equal(B.planForResource({plans:[]},rid,directory,catalog,{...scope,edition:'另一未核版本'}),null);
  }
  assert.equal(B.planForResource({plans:[]},'resource-149sp5j',directory,catalog),null,'旧英汉双语书虫不自动借用小书虫目录');
});

test('早期阶段完整分项目录共用手工与公开身份事实，缺目录级别不借用相邻级',()=>{
  const directory=require('../data/resource-books.json'),catalog=require('../data/resource-volumes.json'),P=require('../practice.js');
  for(const [rid,scopeId,total] of [
    ['resource-1mx6gx6','pearson-star-2-2025',41],
    ['resource-1mx6gx6','pearson-star-3-2025',42],
    ['resource-1mx6gx6','pearson-star-4-2025',31],
    ['resource-141vfh7','pearson-story-basic',28],
    ['resource-141vfh7','pearson-story-advanced',28],
    ['resource-zl69cf','buddy-parent-a',20],
    ['resource-zl69cf','buddy-parent-b',20],
    ['resource-zl69cf','buddy-parent-c',20],
    ['resource-zl69cf','buddy-parent-d',20],
    ['resource-ckc2k','badanamu-speaking-24',24],
    ['resource-10bn1i2','oxford-little-bookworms-2',8],
    ['resource-10bn1i2','oxford-little-bookworms-3',8],
    ['resource-10bn1i2','oxford-little-bookworms-4',8],
    ['resource-1yfs7b5','super-hammy-my-first-reading-15',15],
    ['resource-1yfs7b5','super-hammy-2-15',15],
    ['resource-1qnd5uh','xhs-raz-b99-20261108',99],
    ['resource-1n3ix1n','ort-school-red-1',84],
    ['resource-1n3ix1n','ort-school-red-2',48],
    ['resource-1cn6i3m','flr-parent-b',25],
    ['resource-1cn6i3m','flr-parent-c',25],
    ['resource-1cn6i3m','flr-parent-d',25],
    ['resource-1cn6i3m','flr-parent-e',8],
    ['resource-1cn6i3m','flr-parent-f',8],
    ['resource-1pinwiv','gyuri-rainbow-rabbit-12',12],
    ['resource-123ikqd','qplay-main-story10',10],
    ['resource-1qj90tg','wplay-official-storybooks-12',12]
  ]){
    const scope=P.bookScopes(rid,[],catalog).find(item=>item.id===scopeId);
    const plan=B.planForResource({plans:[]},rid,directory,catalog,scope),group=B.scopeGroup(plan,scope),selected=B.books(plan,group);
    assert.equal(selected.length,total,scopeId);
    assert.equal(new Set(selected.map(book=>book.id)).size,total);
    const chosen=selected[0],manual=B.manualUpdate({},chosen.id,true);
    assert.equal(B.projectScopeQuantity(manual,rid,scope,{completed:0},catalog,directory).completed,1);
    assert.equal(B.directoryProgress(manual,directory,catalog,rid).completed,1);
    assert.equal(B.progress({...manual,...B.manualUpdate(manual,chosen.id,false)},plan,group).completed,0);
    if(chosen.externalIds?.xiaohuasheng?.length){
      const result=B.applyReadSnapshot(manual,{plans:[]},snapshot([entry(chosen.externalIds.xiaohuasheng[0],'外站题名更新')]),{directory,catalog,sourcePriority:true});
      assert.equal(result.matched.length,1);
      assert.equal(result.matched[0].publicBookId,chosen.id);
      assert.equal(B.projectScopeQuantity({...manual,...result.changes},rid,scope,{completed:0},catalog,directory).completed,1,'手工和外部事实不能重复计数');
    }
  }

});

test('App完整书架派生快照按guid匹配并另存数字ID，重复导入和备份往返不重复计数',()=>{
  const d=structuredClone(directory);
  d.books[0].externalIds={xiaohuasheng:['sample-guid']};
  d.books[1].externalIds={xiaohuasheng:['987654']};
  const input=snapshot([{bookId:'sample-guid',appBookId:987654,title:'外站已更新题名'}],{
    transport:'xiaohuasheng-app-api',predicate:'readedFlag=1',sourceUrl:'https://app.xiaohuasheng.cn//bookroom/queryBookroomBook/sample-owner/-2/-1/-1/0/30',
    advertisedCount:1,actualUniqueCount:1
  });
  const result=B.applyReadSnapshot({},data,input,{directory:d,catalog,sourcePriority:true});
  assert.equal(result.matched.length,1);
  assert.equal(result.matched[0].publicBookId,'new-upper-one');
  const fact=JSON.parse(result.changes[B.EXTERNAL+'sample-owner:sample-guid'].note);
  assert.equal(fact.externalBookId,'sample-guid');
  assert.equal(fact.appBookId,'987654');
  assert.equal(B.bookState(result.changes,'new-upper-two').done,false,'数字ID不可冒充网页bookId参与匹配');
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(result.changes))));
  assert.equal(B.projectScopeQuantity(restored.records,'series-one',upperScope,{completed:0},catalog,d).completed,1);
  assert.deepEqual(B.applyReadSnapshot(restored.records,data,input,{directory:d,catalog,sourcePriority:true}).changes,{});
});

test('App来源限定本人固定全书架入口，数字身份无效或同guid冲突时整批拒绝',()=>{
  const base='https://app.xiaohuasheng.cn//bookroom/queryBookroomBook/sample-owner/-2/-1/-1/0/30';
  const items=[{bookId:'guid-one',appBookId:'12345',title:'Example GK-01 At the Market'}];
  const records=B.manualUpdate({},'sample-03',true),before=structuredClone(records);
  for(const sourceUrl of [
    base.replace('sample-owner','other-owner'),base.replace('/-2/-1/-1/','/-6/-1/-1/'),
    base.replace('//bookroom/','/bookroom/'),base.replace('/0/30','/30/30'),
    base+'?token=synthetic',base+'#fragment',base.replace('https:','http:'),
    base.replace('app.xiaohuasheng.cn','app.xiaohuasheng.cn.evil.example'),
    base.replace('https://','https://synthetic@')
  ])assert.throws(()=>B.applyReadSnapshot(records,data,snapshot(items,{sourceUrl,transport:'xiaohuasheng-app-api',predicate:'readedFlag=1'})));
  for(const appBookId of ['',0,-1,1.5,'not-a-number',Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>B.applyReadSnapshot(records,data,snapshot([{...items[0],appBookId}],{sourceUrl:base,transport:'xiaohuasheng-app-api',predicate:'readedFlag=1'})));
  }
  assert.throws(()=>B.applyReadSnapshot(records,data,snapshot([items[0],{...items[0],appBookId:'67890'}],{sourceUrl:base,transport:'xiaohuasheng-app-api',predicate:'readedFlag=1'})));
  for(const extra of [{},{transport:'xiaohuasheng-app-api'},{transport:'xiaohuasheng-app-api',predicate:'readCount>0'}])assert.throws(()=>B.applyReadSnapshot(records,data,snapshot(items,{sourceUrl:base,...extra})));
  assert.deepEqual(records,before);
  assert.doesNotThrow(()=>B.applyReadSnapshot(records,data,snapshot(items,{sourceUrl:'https://www.xiaohuasheng.cn/bookcase/user_123/tag_-6'})),'历史网页快照继续兼容');
});

test('App数字身份补入旧事实时保留原时点和未知字段，身份冲突不覆盖旧映射',()=>{
  const key=B.EXTERNAL+'sample-owner:guid-one';
  const original={status:'done',note:JSON.stringify({version:1,sourceKind:'xiaohuasheng_bookcase_read',publicBookId:'sample-01',snapshotId:'historical-snapshot',observedAt:'2026-11-05T00:00:00Z',custom:'保留原字段'})};
  const records={[key]:original};
  const input=snapshot([{bookId:'guid-one',appBookId:'12345',title:'Example GK-01 At the Market'}]);
  const first=B.applyReadSnapshot(records,data,input),upgraded={...records,...first.changes};
  assert.deepEqual(JSON.parse(upgraded[key].note),{...JSON.parse(original.note),appBookId:'12345'});
  assert.deepEqual(B.applyReadSnapshot(upgraded,data,input).changes,{});
  const changed=snapshot([{...input.books[0],appBookId:'67890'}]);
  const conflict=B.applyReadSnapshot(upgraded,data,changed);
  assert.equal(conflict.matched.length,0);
  assert.equal(conflict.ambiguous[0].reason,'existing-app-id-conflict');
  assert.deepEqual(conflict.changes,{});
  assert.deepEqual(records[key],original);
});

test('新App快照缺失历史书目不清空，手工单册日期、计时和阶段完成原样保留',()=>{
  const missing=imported({},[entry('old-guid','Example GK-02 Funny things')]).changes;
  const manual={...B.manualUpdate({},'sample-03',true)};
  manual[B.MANUAL+'sample-03'].note=JSON.stringify({version:1,bookId:'sample-03',completedAt:'2026-11-04',custom:'手工记录'});
  const kept={...missing,...manual,
    'practice.stage.v1:xu:listening:xu-3':{status:'done',note:JSON.stringify({completedAt:'2026-11-06',note:'阶段原记录'})},
    'practice.session.v1:synthetic':{status:'using',note:JSON.stringify({date:'2026-11-06',minutes:18,note:'原计时'})},
    'legacy-count':{status:'using',note:'旧合计原样保留'}
  };
  const before=structuredClone(kept);
  const input=snapshot([{bookId:'new-guid',appBookId:'12345',title:'Example GK-01 At the Market'}],{
    transport:'xiaohuasheng-app-api',predicate:'readedFlag=1',sourceUrl:'https://app.xiaohuasheng.cn//bookroom/queryBookroomBook/sample-owner/-2/-1/-1/0/30'
  });
  const result=B.applyReadSnapshot(kept,data,input,{sourcePriority:true}),merged={...kept,...result.changes};
  for(const [key,value] of Object.entries(before))assert.deepEqual(merged[key],value,key);
  assert.equal(B.progress(merged,plan).completed,3);
  assert.equal(B.bookState(merged,'sample-02').done,true,'缺失历史来源事实不撤回');
  assert.equal(B.bookState(merged,'sample-03').manual,true);
  assert.deepEqual(kept,before,'导入模型不直接修改原记录');
});

test('目录索引复用后，原记录对象内的手工撤回和来源修正仍即时生效',()=>{
  const catalog={series:[{resourceId:'canonical',scopes:[]},{resourceId:'old',catalogResourceId:'canonical'}]};
  const directory={books:[{id:'one',resourceId:'old'},{id:'two',resourceId:'canonical'}]},records={};
  assert.equal(B.directoryProgress(records,directory,catalog,'canonical').completed,0);
  records[B.MANUAL+'one']={status:'done'};
  assert.equal(B.directoryProgress(records,directory,catalog,'old').completed,1);
  records[B.EXTERNAL+'test:two']={status:'done',note:JSON.stringify({version:1,sourceKind:'xiaohuasheng_bookcase_read',publicBookId:'two'})};
  assert.equal(B.directoryProgress(records,directory,catalog,'canonical').completed,2);
  records[B.MANUAL+'one'].status='not-started';records[B.EXTERNAL+'test:two'].status='not-started';
  assert.equal(B.directoryProgress(records,directory,catalog,'canonical').completed,0);
});

test('逐本阅读次数随同一外部事实更新，幂等、降次和旧快照兼容，不累加完成本数',()=>{
  const item={...entry('times','Example GK-01 At the market'),readCount:3};
  const first=B.applyReadSnapshot({},data,snapshot([item]));
  let records=first.changes;
  assert.equal(B.bookState(records,'sample-01').readCount,3);
  assert.equal(B.progress(records,plan).completed,1);
  assert.deepEqual(B.applyReadSnapshot(records,data,snapshot([item])).changes,{});
  Object.assign(records,B.manualUpdate(records,'sample-01',true));
  assert.equal(B.bookState(records,'sample-01').readCount,3);
  const newer=snapshot([{...item,readCount:2}],{snapshotId:'newer',fetchedAt:'2026-11-07T00:00:00Z'});
  Object.assign(records,B.applyReadSnapshot(records,data,newer).changes);
  assert.equal(B.bookState(records,'sample-01').readCount,2);
  assert.deepEqual(B.applyReadSnapshot(records,data,snapshot([item])).changes,{});
  assert.deepEqual(B.applyReadSnapshot(records,data,snapshot([entry('times',item.title)])).changes,{});
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records))));
  assert.equal(B.bookState(restored.records,'sample-01').readCount,2);
  assert.equal(B.progress(restored.records,plan).completed,1);
  const latest=snapshot([{...item,readCount:1}],{fetchedAt:'2026-11-08T00:00:00Z'});
  Object.assign(records,B.applyReadSnapshot(records,data,latest).changes);
  assert.equal(B.bookState(records,'sample-01').readCount,1);
  assert.equal(B.bookState(records,'sample-01').done,true);
});

test('阅读次数只取有效单册来源，不合并重复身份或推测手工次数，冲突和非法次数拒绝导入',()=>{
  const a={...entry('a','Example GK-01 At the market'),readCount:2};
  const b={...entry('b',a.title),readCount:3};
  const records=B.applyReadSnapshot({},data,snapshot([a,b])).changes;
  assert.equal(B.bookState(records,'sample-01').readCount,3);
  assert.equal(B.progress(records,plan).completed,1);
  assert.equal(B.bookState(B.manualUpdate({},'sample-01',true),'sample-01').readCount,null);
  for(const readCount of [-1,1.5,'3',true,null,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>B.applyReadSnapshot(records,data,snapshot([{...a,readCount}])));
  }
  assert.throws(()=>B.applyReadSnapshot(records,data,snapshot([a,{...a,readCount:4}])));
  const zero=B.applyReadSnapshot({},data,snapshot([{...a,readCount:0}])).changes;
  assert.equal(B.bookState(zero,'sample-01').readCount,0);
  assert.equal(B.bookState(zero,'sample-01').done,true);
});

test('既有精确外站身份可刷新次数，目录映射冲突不重绑、不丢旧完成，App身份冲突不更新',()=>{
  const item={...entry('times','Example GK-01 At the market'),appBookId:'123',readCount:3};
  const first=B.applyReadSnapshot({},data,snapshot([item])).changes;
  const changed={...data,plans:[{...plan,books:plan.books.map(book=>({...book,id:'new-'+book.id}))}]};
  const newer=snapshot([{...item,readCount:4}],{fetchedAt:'2026-11-07T00:00:00Z'});
  const result=B.applyReadSnapshot(first,changed,newer);
  const saved={...first,...result.changes};
  assert.equal(result.ambiguous.length,1);
  assert.equal(B.bookState(saved,'sample-01').readCount,4);
  assert.equal(B.bookState(saved,'new-sample-01').done,false);
  assert.equal(B.progress(saved,plan).completed,1);
  const conflict=B.applyReadSnapshot(first,data,snapshot([{...item,appBookId:'456',readCount:5}]));
  assert.deepEqual(conflict.changes,{});
  assert.equal(conflict.ambiguous.length,1);
});
