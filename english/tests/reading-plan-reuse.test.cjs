const test=require('node:test');
const assert=require('node:assert/strict');
const BP=require('../book-progress.js');
const P=require('../practice.js');
const M=require('../model.js');
const LB=require('../library-books.js');
const plans=require('../data/reading-plans.json');
const directory=require('../data/resource-books.json');
const catalog=require('../data/resource-volumes.json');

test('GK句型与书籍排列复用同一70册及完成事实，视频顺序另存核对依据',()=>{
  const plan=plans.plans.find(plan=>plan.id==='heinemann-gk70'),before=JSON.stringify(plan);
  assert.deepEqual(plan.readingOrders.map(item=>item.id),['pattern','book']);
  assert.deepEqual(BP.books(plan,'all','pattern').slice(0,4).map(book=>book.number),[1,6,7,8]);
  assert.deepEqual(BP.books(plan,'all','book').map(book=>book.number),Array.from({length:70},(_,i)=>i+1));
  const bookOrder=BP.books(plan,'all','book'),courses=bookOrder.filter(book=>book.campOrder);
  assert.equal(courses.length,51);
  assert.deepEqual(courses.map(book=>book.campOrder),Array.from({length:51},(_,i)=>i+1));
  assert.deepEqual(courses.map(book=>book.videos[0].filename),courses.map(book=>book.videos[0].filename).sort((a,b)=>Number(a.split('.')[0])-Number(b.split('.')[0])));
  assert.equal(bookOrder.slice(51).length,19);
  assert.ok(bookOrder.slice(51).every(book=>!book.campOrder&&!book.videos?.length));
  const records=BP.manualUpdate({},bookOrder[7].id,true);
  for(const group of ['all','A','B','C'])for(const mode of plan.readingOrders){
    const sorted=BP.books(plan,group,mode.id),original=BP.books(plan,group);
    assert.deepEqual(new Set(sorted.map(book=>book.id)),new Set(original.map(book=>book.id)));
    assert.ok(sorted.every(book=>original.includes(book)),'排列不复制或改写原单册与媒体');
    assert.equal(sorted.filter(book=>BP.bookState(records,book).done).length,original.filter(book=>BP.bookState(records,book).done).length);
  }
  assert.equal(JSON.stringify(plan),before);
});

test('多选GK A与B按同一书目并集核算，排序不改变分母和完成事实',()=>{
  const plan=plans.plans.find(plan=>plan.id==='heinemann-gk70');
  const records={...BP.manualUpdate({},BP.books(plan,'A')[0].id,true),...BP.manualUpdate({},BP.books(plan,'B')[0].id,true)};
  const before=JSON.stringify(records);
  for(const mode of plan.readingOrders){
    const selected=BP.books(plan,['A','B'],mode.id);
    assert.equal(selected.length,58);
    assert.equal(new Set(selected.map(book=>book.id)).size,58);
    assert.ok(selected.every(book=>['A','B'].includes(book.group)));
  }
  assert.equal(BP.progress(records,plan,['A','B']).completed,2);
  assert.equal(BP.progress(records,plan,['A','B']).total,58);
  assert.equal(BP.progress(records,plan,'C').completed,0);
  assert.equal(BP.progress(records,plan).completed,2);
  assert.equal(JSON.stringify(records),before);
});

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

test('已核对视频随原单册投影；缺失册不补造视频或改变完成键',()=>{
  const plan=plans.plans.find(plan=>plan.id==='heinemann-gk70');
  const merged=BP.withReadingPlans(directory,plans,catalog);
  const linked=plan.books.filter(book=>book.videos?.length),missing=plan.books.filter(book=>!book.videos?.length);
  assert.equal(linked.length,51);assert.equal(missing.length,19);
  assert.deepEqual(missing.map(book=>book.number).sort((a,b)=>a-b),Array.from({length:19},(_,i)=>52+i));
  assert.equal(new Set(linked.map(book=>book.videos[0].path)).size,51,'每册指向独立已核对文件');
  assert.deepEqual(linked.filter(book=>book.videos[0].note).map(book=>book.number).sort((a,b)=>a-b),[29,33,51]);
  for(const book of plan.books){
    const projected=merged.books.find(item=>item.id===book.id);
    assert.deepEqual(projected.videos,book.videos);
    for(const video of book.videos||[]){
      assert.ok(plan.mediaSources.some(source=>source.id===video.sourceId));
      assert.ok(video.evidence&&video.sampleSeconds.length>=3&&video.durationSeconds>0);
      assert.ok(!/dtoken|play_addr/.test(JSON.stringify(video)),'不保存临时播放凭据');
    }
  }
});
