const test=require('node:test');
const assert=require('node:assert/strict');
const BP=require('../book-progress.js');
const P=require('../practice.js');
const M=require('../model.js');
const LB=require('../library-books.js');
const plans=require('../data/reading-plans.json');
const directory=require('../data/resource-books.json');
const catalog=require('../data/resource-volumes.json');

test('原表阅读计划派生公共目录，稳定ID、顺序和句型只维护一份，重复合成不增加单册',()=>{
  const before=JSON.stringify([directory,plans,catalog]);
  const merged=BP.withReadingPlans(directory,plans,catalog);
  const authored=plans.plans.flatMap(plan=>plan.books);
  assert.equal(new Set(merged.books.map(book=>book.id)).size,merged.books.length);
  for(const plan of plans.plans){
    const resourceId=M.publicationEntry(catalog,plan.resourceId)?.resourceId||plan.resourceId;
    const actual=merged.books.filter(book=>plan.books.some(original=>original.id===book.id));
    assert.equal(actual.length,plan.books.length);
    for(const original of plan.books){
      const book=actual.find(book=>book.id===original.id);
      assert.equal(book.title,original.title);
      assert.equal(book.resourceId,resourceId);
      assert.equal(book.edition,plan.edition);
      const group=plan.groups.find(group=>group.id===original.group);
      const scope=M.publicationEntry(catalog,plan.resourceId)?.scopes.find(scope=>group.scopeIds.includes(scope.id));
      assert.equal(book.level,scope?.levelAliases?.[0]||group.id,'机器级别复用公共范围中的显式别名，不把GK A显示标签当作级别');
      assert.equal(book.number,original.number);
      assert.equal(book.order,original.order);
      assert.deepEqual(book.patterns,original.patterns);
      assert.equal(book.cover,original.cover,'原表单册的封面随公共目录投影保留');
      assert.deepEqual(book.coverSource,original.coverSource,'保留逐册封面核对来源');
      if(original.externalIds?.xiaohuasheng)for(const bookId of original.externalIds.xiaohuasheng){
        const match=BP.matchEntry(plans,{bookId,title:'外站可变题名'},merged,catalog);
        assert.equal(match.candidates.length,1);
        assert.equal(match.candidates[0].publicBookId,original.id,'精确外站身份不受括号、标点或题名改动影响');
      }
      assert.ok(book.sourceIds.length,'派生目录保留原表来源');
      assert.ok(book.sourceIds.every(id=>merged.sources.some(source=>source.id===id)));
    }
    const publicSource=merged.sources.find(source=>source.url===plan.source.url);
    assert.ok(publicSource,'同一原表作为公共目录的来源');
    assert.deepEqual(BP.books(plan).map(book=>book.id),actual.sort((a,b)=>a.order-b.order).map(book=>book.id));
  }
  assert.equal(merged.books.filter(book=>authored.some(original=>original.id===book.id)).length,authored.length);
  assert.deepEqual(BP.withReadingPlans(merged,plans,catalog),merged);
  assert.equal(JSON.stringify([directory,plans,catalog]),before,'合成不能修改原始目录、原表或出版范围');
});

test('海尼曼GK70在图鉴及路线共用同册ID，A/B/C勾选与撤回只更新同一完成事实',()=>{
  const merged=BP.withReadingPlans(directory,plans,catalog);
  const plan=plans.plans.find(plan=>plan.id==='heinemann-gk70');
  assert.equal(plan.books.length,70);
  const resources=[{id:plan.resourceId,title:plan.title,appearances:[]}];
  const entries=LB.entries(merged,resources,M,catalog);
  assert.equal(entries.length,70);
  let records={};
  for(const group of plan.groups){
    const book=BP.books(plan,group.id)[0],publicBook=entries.find(entry=>entry.id===book.id);
    records={...records,...BP.manualUpdate(records,publicBook.id,true)};
    assert.equal(BP.bookState(records,book.id).done,true);
    for(const resourceId of plan.resourceIds){
      const samePlan=BP.planForResource(plans,resourceId,merged,catalog);
      assert.equal(samePlan,plan);
      const level=resourceId===plan.resourceId?group.id:'GK70 '+group.id;
      const scope=P.bookScopes(resourceId,[level],catalog).find(scope=>BP.scopeGroup(plan,scope)===group.id);
      assert.ok(scope,'原路线级别能定位原表分组 '+level);
      assert.equal(BP.projectQuantity(records,samePlan,scope,{completed:0}).completed,1);
    }
  }
  assert.equal(BP.progress(records,plan).completed,3);
  assert.equal(BP.directoryProgress(records,merged,catalog,plan.resourceId).completed,3);
  assert.equal(Object.keys(records).filter(key=>key.startsWith(BP.MANUAL)).length,3);
  for(const publicBook of entries)if(BP.bookState(records,publicBook.id).manual){
    records={...records,...BP.manualUpdate(records,publicBook.id,false)};
  }
  assert.equal(BP.progress(records,plan).completed,0);
  assert.equal(BP.directoryProgress(records,merged,catalog,plan.resourceId).completed,0);
});

test('海尼曼三组新已读及阅读次数一次导入即可同步公共目录与路线，重复同步不另建事实',()=>{
  const merged=BP.withReadingPlans(directory,plans,catalog);
  const plan=plans.plans.find(plan=>plan.id==='heinemann-gk70');
  const selected=plan.groups.map(group=>BP.books(plan,group.id)[0]);
  const snapshot={schemaVersion:1,sourceKind:'xiaohuasheng_bookcase_read',authenticated:true,complete:true,
    accountId:'fixture-owner',snapshotId:'fixture-gk-progress',fetchedAt:'2026-11-11T00:00:00Z',
    books:selected.map((book,index)=>({bookId:'fixture-gk-'+index,appBookId:String(1000+index),title:'Heinemann GK-'+book.number+': '+book.title,readCount:index+1}))};
  const result=BP.applyReadSnapshot({},plans,snapshot,{directory:merged,catalog,sourcePriority:true});
  assert.equal(result.matched.length,3);
  assert.equal(result.unmatched.length,0);
  assert.equal(result.ambiguous.length,0);
  const records=result.changes;
  for(const [index,book] of selected.entries()){
    const publicBook=merged.books.find(publicBook=>publicBook.id===book.id);
    assert.equal(BP.bookState(records,publicBook.id).done,true);
    assert.equal(BP.bookState(records,publicBook.id).readCount,index+1);
    assert.equal(BP.progress(records,plan,book.group).completed,1);
  }
  assert.equal(BP.directoryProgress(records,merged,catalog,plan.resourceId).completed,3);
  assert.equal(BP.progress(records,plan).completed,3);
  assert.equal(Object.keys(records).filter(key=>key.startsWith(BP.EXTERNAL)).length,3);
  assert.deepEqual(BP.applyReadSnapshot(records,plans,snapshot,{directory:merged,catalog,sourcePriority:true}).changes,{});
});

test('海尼曼公共书目按原计划分组参与许密杉五节点筛选，不混入香蕉妈妈的另一套GK体系',()=>{
  const load=name=>require('../data/'+name+'.json');
  const raw={...Object.fromEntries(['banana','xu','qing','editorial'].map(name=>[name,load(name)])),
    resourceVolumes:catalog,routePlan:load('route-plan'),xuCurrent:load('xu-current'),xuSupplements:['xu-thousand','xu-panorama'].map(load)};
  const normalized=M.normalize(raw),merged=BP.withReadingPlans(directory,plans,catalog);
  const plan=plans.plans.find(plan=>plan.id==='heinemann-gk70'),resource=normalized.resources.find(resource=>resource.id===plan.resourceId);
  const entries=LB.entries(merged,[resource],M,catalog);
  assert.equal(entries.length,70);
  for(const entry of entries){
    const original=plan.books.find(book=>book.id===entry.id),stage=original.group==='C'?'xu-node-800':'xu-node-500';
    assert.ok(entry.appearances.some(appearance=>appearance.stageId===stage),entry.title+'应能按其原GK70组别筛入对应节点');
    assert.ok(entry.appearances.every(appearance=>appearance.routeId!=='banana'),'不将另一GK分级体系当作相同目录');
  }
  const unrelated=P.bookScopes(resource.id,['A'],catalog).find(scope=>scope.edition==='LLI Orange Grade K');
  assert.ok(unrelated);
  assert.notEqual(BP.planForResource(plans,resource.id,merged,catalog,unrelated),plan,'明确另一出版版本时不默认打开GK70原表');
});
