import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../english/model.js'),P=require('../english/practice.js'),L=require('../english/low-age.js');
const read=id=>JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)));
const raw={banana:read('banana'),xu:read('xu'),qing:read('qing'),'low-age':read('low-age'),routePlan:read('route-plan'),resourceVolumes:read('resource-volumes')};
const catalog=M.normalize(raw),route=catalog.routes.find(route=>route.id==='low-age');
const profile={birthDate:'2024-11-24',asOf:'2026-11-18',listeningWords:70};
test('低幼原文在页内打开并定位当前阶段，关闭后返回且不修改记录',()=>{
 const app=fs.readFileSync(new URL('../english/app.js',import.meta.url),'utf8');
 const part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)+a.length));
 const records={keep:{status:'done'}},S={preview:null,view:'routes',compareStage:'low-age-2',records};
 const trigger={isConnected:true,focus(){this.focused=true;}},previewButton={focus(){}};
 const context={S,window:{ROADMAP_RAW:raw},src:id=>catalog.sources.find(source=>source.id===id),
  stages:new Map(catalog.stages.map(stage=>[stage.id,stage])),BOOKS:{sources:[]},byId:new Map(),
  btn:(label,action,attrs)=>({tag:'button',action,attrs}),h:(tag,attrs)=>({tag,attrs}),icon:()=>null,asset:path=>path,
  document:{activeElement:trigger,body:{style:{}}},el:{inert:false},overlay:{inert:false},
  previewRoot:{querySelector:()=>previewButton,replaceChildren(){}},previewFocus:null,renderPreview(){}};
 vm.createContext(context);
 vm.runInContext([part('function sourceBtn(','function stageSourceLinks('),part('function previewSource(','function renderPreview(')].join('\n'),context);
 assert.equal(context.sourceBtn('low-age',1).tag,'button');
 assert.equal(context.sourceBtn('low-age',1).action,'preview');
 const source=context.previewSource({sourceId:'low-age'});
 assert.equal(source.previews.length,6);
 assert.ok(source.previews.every(page=>page.fields.length===3&&page.groups.length===7));
 context.showPreview('low-age',1);
 assert.equal(S.preview.page,2);assert.equal(S.preview.sourceId,'low-age');assert.equal(context.el.inert,true);
 assert.equal(source.previews[1].fields[1].text,'100词汇量');
 context.closePreview();
 assert.equal(S.preview,null);assert.equal(context.el.inert,false);assert.equal(trigger.focused,true);
 assert.deepEqual(S.records,records);
});
test('六阶段保留原表栏目、合并格与独立选材要求',()=>{
 assert.equal(route.stages.length,6);
 assert.deepEqual(route.stages.map(stage=>stage.goal),['目标：约50词。从动物、水果、汽车、身体和家人等熟悉实物开始。','目标：约100词。以名词和动作为主。','目标：约150词。在生活中认识颜色、形状、大小和数量，理解短句。','目标：约300词。共读短故事和入门分级，积累常用句型。','目标：500–700词。扩展喜欢的角色与主题，跟随连续情节。','目标：800–1000词。通过故事和简单科普探索感兴趣的话题。']);
 assert.ok(route.stages.every(stage=>stage.raw.sourceGroups.length===7));
 assert.equal(route.stages[2].raw.sourceGroups.find(group=>group.label.startsWith('亲子')).range,'I13:S13');
 assert.equal(route.stages[5].raw.sourceGroups.find(group=>group.label==='单词书／认知').range,'AD19:AN19');
 for(const stage of route.stages)for(const item of M.getStageMaterials(catalog,stage)){
  assert.ok(item.material.sourceCell);assert.ok(item.material.matchBasis);assert.ok(item.role.selection);
  assert.equal(item.role.kind,item.material.selection.label.startsWith('必')?'main':'reference');
 }
 assert.ok(route.stages[5].materials.some(m=>m.level.includes('第9–10套（原表未列8）')));
 for(const domain of ['speaking','reading','writing'])assert.equal(M.getRoutePlan(catalog,'low-age',domain,profile).stages.length,0);
});
test('低幼选择范围区分类别互选与组内至少一，其他路线不继承此关系',()=>{
 const items=M.getStageMaterials(catalog,'low-age-3');
 const path=title=>items.find(item=>item.resource.title===title).role.selection.groupPath;
 assert.deepEqual(path('SSS 指令式儿歌').map(g=>g.id),['songs']);
 assert.deepEqual(path('Super Jojo儿歌').map(g=>g.id),['songs']);
 assert.deepEqual(path('阿布巴布动词卡').map(g=>g.id),['vocabulary','flashcards']);
 assert.deepEqual(path('Peekaboo').map(g=>g.id),['vocabulary','wordbooks','nonreal']);
 assert.deepEqual(path('Priddy Lift the Flap First 100').map(g=>g.id),['vocabulary','wordbooks','real']);
 const titles=id=>items.filter(item=>item.role.selection.groupPath.at(-1).id===id).map(item=>item.resource.title).sort();
 assert.deepEqual(titles('nonreal'),['Peekaboo','尤斯伯恩First Thousand Words','尤斯伯恩看里面认知版'].sort());
 assert.deepEqual(titles('real'),['DK My First花边书','Priddy Lift the Flap First 100'].sort());
 for(const stage of route.stages)for(const item of M.getStageMaterials(catalog,stage)){
  assert.ok(item.role.selection.groupPath.length);
  assert.ok(item.role.selection.groupPath.every(g=>g.sources.every(s=>s.range&&s.text)));
 }
 assert.ok(catalog.stages.filter(s=>s.routeId!=='low-age').flatMap(s=>M.getStageMaterials(catalog,s)).every(item=>!item.role.selection?.groupPath));
});
test('年龄和词量只调整浏览，完成记录保持不变',()=>{
 const records={},before=JSON.stringify(records),first=L.recommend(catalog,profile,records);
 assert.equal(first.currentStageId,'low-age-1');assert.equal(first.trialStageId,'low-age-2');
 const older=L.recommend(catalog,{...profile,asOf:'2027-11-24',listeningWords:900},records);
 assert.equal(older.currentStageId,'low-age-1');assert.equal(older.automaticPromotion,false);
 assert.equal(JSON.stringify(records),before);
 assert.match(L.recommend(catalog,{...profile,wordsKnown:false},{}).reason,/空白不表示零基础/);
});
test('阶段完成及撤回独立于素材、其他路线与浏览状态',()=>{
 const other={'practice.stage.v1:xu:listening:xu-1':{status:'done',note:'其他路线保留'}};
 let records={...other,...P.stageCompletionUpdate(other,'low-age:listening','low-age-1',true)};
 assert.equal(L.recommend(catalog,profile,records).currentStageId,'low-age-2');
 records={...records,...P.stageCompletionUpdate(records,'low-age:listening','low-age-1',false)};
 assert.equal(L.recommend(catalog,profile,records).currentStageId,'low-age-1');
 assert.deepEqual(records[Object.keys(other)[0]],Object.values(other)[0]);
 const item=M.getStageMaterials(catalog,'low-age-3')[0],key=P.unitKey(route.stages[2],item);
 records[key]=P.unitUpdate('using','喜欢这个主题','2026-11-18');
 assert.equal(L.recommend(catalog,profile,records).currentStageId,'low-age-3');
 assert.equal(P.stageDone(records,'low-age:listening','low-age-3'),false);
});
test('低幼未绑定数量的素材可直接记录状态，不显示0本',()=>{
 const app=fs.readFileSync(new URL('../english/app.js',import.meta.url),'utf8');
 const part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)+a.length));
 const stage=route.stages[0],unit={key:'material.low-age-status-test',stageId:stage.id,children:null,label:'小蓝鸟发声童谣',item:{resource:{type:'book'},materials:[]}};
 const S={records:{}},context={
  S,h:(tag,attrs,...children)=>({tag,attrs,children}),P,stages:new Map([[stage.id,stage]]),record:null,renderValue:(_key,read)=>read(),
  practiceBookScope:()=>null,readingPlanForResource:()=>null,practiceRawRecord:u=>S.records[u.key],isXuSongUnit:()=>false,
  savePracticeRecords(changes){Object.assign(S.records,changes);return true;},render(){},document:{getElementById:()=>({focus(){}})}
 };
 vm.createContext(context);
 vm.runInContext([part('function isLowAgeStatusUnit(','function practiceBookScope('),part('function practiceUnitPercent(','function practiceUnitDate(')].join('\n'),context);
 const control=context.practiceUnitPercent(unit);
 assert.ok(control.attrs.class.includes('low-age-status-control'));
 const using=control.children.flat().find(button=>button.attrs.class.includes('using'));
 using.attrs.onclick();
 assert.equal(context.practiceUnitRecord(unit).status,'using');
 assert.equal(S.records[unit.key].status,'using');
 assert.ok(!JSON.stringify(S.records[unit.key]).includes('books'));
 // 套系别的版本已有目录，不应把本阶段未选版的状态变成0本。
 context.readingPlanForResource=()=>({id:'another-edition',groups:[]});
 assert.equal(context.isLowAgeStatusUnit(unit),true);
 assert.equal(context.practiceUnitPercent(unit).children.flat().find(button=>button.attrs.class.includes('using')).attrs['aria-pressed'],'true');
});
test('低幼公共素材优先复用既有身份、级别分母与共享进度',()=>{
 const cases=[
  ['low-age-3','大猫分级','粉色A（原表标尺）','resource-g7xvo5',22],
  ['low-age-3','学乐小读者科普版','A','resource-nqvpg2',16],
  ['low-age-3','学乐巴蒂小读者','A','resource-zl69cf',20],
  ['low-age-4','绿色大森林','Little Fox L1','resource-1u3sl6e',24],
  ['low-age-5','蝙蝠和朋友们','Little Fox L1','resource-smispi',72],
  ['low-age-5','波西与皮普','英文版','resource-o2t6vh',12],
  ['low-age-5','国家地理','Pre-reader','resource-5iilo9',12]
 ];
 for(const [stageId,title,label,id,total] of cases){
  const item=M.getStageMaterials(catalog,'low-age-3'===stageId?route.stages[2]:'low-age-4'===stageId?route.stages[3]:route.stages[4]).find(item=>item.material.level===label&&item.resource.id===id);
  assert.ok(item,stageId+' '+title+' 未复用既有素材');
  assert.equal(item.resource.id,id,title+' 必须复用公共素材身份');
  assert.ok(item.resource.appearances.some(appearance=>appearance.routeId!=='low-age'),title+' 应保留其他路线引用');
  const scopes=M.publicationLevelScopes(raw.resourceVolumes,id,[label],stageId);
  assert.equal(scopes.length,1,title+' 应命中唯一分项范围');
  assert.equal(scopes[0].total,total,title+' 应复用公共分项分母');
  const scope=P.bookScopes(id,[label],raw.resourceVolumes,stageId)[0];
  const records=P.sharedQuantityUpdate({},id,scope,2,'本');
  assert.equal(P.sharedQuantity(records,id,scope,'本').completed,2,title+' 的数量应写入公共共享进度');
 }
 for(const [id,level] of [['resource-19jrpig','A'],['resource-19jrpig','B'],['resource-z5w7e2','第一辑']]){
  assert.equal(M.publicationLevelScopes(raw.resourceVolumes,id,[level],'low-age-3').length,0,'未证实的单级或辑次不能借用合装/另一版数量');
 }
 const buddy=M.getStageMaterials(catalog,'low-age-3').find(item=>item.resource.id==='resource-zl69cf');
 assert.equal(buddy.material.recordResourceId,'resource-d2cdat','公共身份变化时保留旧低幼进度键');
 assert.ok(buddy.resource.mergedResourceIds.includes('resource-d2cdat'),'旧键仍可回读共享数量');
 assert.ok(P.unitKey(route.stages[2],buddy).includes('resource-d2cdat'),'低幼阶段键不因展示身份归并而漂移');
 const oldKey=P.unitKey(route.stages[2],buddy),oldRecords={[oldKey]:P.unitUpdate('using','旧低幼状态','2026-11-18')};
 assert.equal(P.unitRecord(oldRecords,oldKey).status,'using');
 const thomas=M.getStageMaterials(catalog,'low-age-5').find(item=>item.resource.id==='resource-a3pj5d');
 assert.ok(thomas,'托马斯小火车应按分级读物复用托马斯和朋友');
 assert.equal(thomas.resource.type,'reader');
 const thomasScopes=M.publicationLevelScopes(raw.resourceVolumes,'resource-a3pj5d',['1级'],'low-age-5');
 assert.equal(thomasScopes.length,1);
 assert.equal(thomasScopes[0].total,8,'有据的英文分级1级为8册故事，不能借双语盒装12册或把手册计入');
 assert.ok(thomasScopes[0].referenceOnly,'已核出版候选不冒充作者指定版次');
 const icr=M.getStageMaterials(catalog,'low-age-5').find(item=>item.resource.id==='resource-1qn098f');
 assert.ok(icr,'I can read应复用既有分级身份');
 assert.equal(M.publicationLevelScopes(raw.resourceVolumes,'resource-1qn098f',['预备级·中信引进版'],'low-age-5').length,0,'未核版次不借具体I can read选本分母');
 assert.equal(raw['low-age'].resources.length,89);
});
test('同媒介套系复用公共身份，未核版次及不同媒介不借进度',()=>{
 const stage=route.stages[2],raz=M.getStageMaterials(catalog,stage).find(item=>item.resource.title==='RAZ');
 assert.equal(raz.resource.id,'resource-1qnd5uh');
 const scope=M.publicationLevelScopes(raw.resourceVolumes,raz.resource.id,['AA'],stage.id)[0];
 assert.ok(scope);
 const records=P.sharedQuantityUpdate({},raz.resource.id,scope,2,'本');
 assert.equal(P.sharedQuantity(records,raz.resource.id,scope,'本').completed,2);
 assert.equal(P.sharedQuantity(records,raz.resource.id,{...scope,edition:'另一版'},'本').completed,0);
 const maisy=catalog.resources.filter(r=>r.title==='小鼠波波');assert.ok(maisy.some(r=>r.type==='book'));assert.ok(maisy.some(r=>r.type==='animation'));
 assert.notEqual(maisy.find(r=>r.type==='book').id,maisy.find(r=>r.type==='animation').id);
 const gk=stage.materials.find(m=>catalog.resources.find(r=>r.id===m.resourceId).title==='海尼曼');
 assert.equal(M.publicationLevelScopes(raw.resourceVolumes,gk.resourceId,[gk.level],stage.id).length,0);
 const gkItem=M.getStageMaterials(catalog,stage).find(item=>item.resource.id===gk.resourceId);
 assert.equal(gkItem.levelSegments.map(part=>part.text).join(''),gk.level);
 assert.equal(P.bookScopes(gk.resourceId,gkItem.materials.map(m=>m.level),raw.resourceVolumes,stage.id).length,0);
});
test('低幼六阶段按目标积累区间对照许密杉、庆爸与香蕉妈妈，双向一致',()=>{
 const completeRaw={...raw,xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')]},completeCatalog=M.normalize(completeRaw);
 const expected=[
  {xu:['xu-node-300'],qing:['qing-s1'],banana:['banana-pre']},
  {xu:['xu-node-300'],qing:['qing-s1'],banana:['banana-pre']},
  {xu:['xu-node-300'],qing:['qing-s1'],banana:['banana-pre']},
  {xu:['xu-node-300'],qing:['qing-s1'],banana:['banana-pre']},
  {xu:['xu-node-500','xu-node-800'],qing:['qing-s2','qing-s3'],banana:['banana-1','banana-2']},
  {xu:['xu-node-800','xu-node-1000'],qing:['qing-s3','qing-s4'],banana:['banana-2']}
 ];
 const before=structuredClone(completeCatalog);
 for(let index=0;index<6;index++){
  const stageId='low-age-'+(index+1),groups=M.compareStages(completeCatalog,stageId);
  for(const routeId of ['xu','qing','banana']){
   const group=groups.find(g=>g.routeId===routeId);
   assert.deepEqual(group.stageReferences.map(m=>m.stageId).sort(),expected[index][routeId].slice().sort());
   for(const ref of group.stageReferences){
    assert.ok(ref.vocabularyAlignment);
    assert.equal(ref.startingAlignment,null);
    assert.equal(ref.materialAlignment,null);
    const reverse=M.compareStages(completeCatalog,ref.stageId).find(g=>g.routeId==='low-age').stageReferences.find(m=>m.stageId===stageId);
    assert.ok(reverse);
    assert.deepEqual(reverse.vocabularyAlignment.focus,ref.vocabularyAlignment.target);
    assert.deepEqual(reverse.vocabularyAlignment.target,ref.vocabularyAlignment.focus);
    if(routeId==='banana')assert.equal(ref.vocabularyAlignment.target.estimated,true);
   }
  }
 }
 assert.deepEqual(completeCatalog,before,'只作参考，不改目标、准入或个人阶段');
 const noMaterials=M.normalize({...completeRaw,'low-age':{...raw['low-age'],stages:raw['low-age'].stages.map(stage=>({...stage,materials:[]}))}});
 for(let index=0;index<6;index++)assert.deepEqual(M.compareStages(noMaterials,'low-age-'+(index+1)).map(g=>[g.routeId,g.stageReferences.map(m=>m.stageId)]),M.compareStages(completeCatalog,'low-age-'+(index+1)).map(g=>[g.routeId,g.stageReferences.map(m=>m.stageId)]));
});

test('低幼已接入的完整目录都能打开对应范围，同名单本不同版不互相挤掉',()=>{
 const B=require('../english/book-progress.js'),directory=read('resource-books'),volumes=raw.resourceVolumes;
 const failures=[];
 for(const entry of volumes.series)for(const scope of M.publicationScopes(volumes,entry.resourceId)){
  if(!scope.id.startsWith('low-age-')||scope.unit!=='本'||!scope.parts.every(part=>part.directoryMatch))continue;
  const expected=[...new Set(scope.parts.flatMap(part=>part.directoryMatch.bookIds||[]))];
  if(!expected.length)continue;
  const plan=B.planForResource({plans:[]},entry.resourceId,directory,volumes,scope);
  const group=B.scopeGroup(plan,scope);
  const actual=group===null?[]:B.books(plan,group).map(book=>book.id);
  if(JSON.stringify([...actual].sort())!==JSON.stringify([...expected].sort()))failures.push(entry.title+' / '+scope.edition);
 }
 assert.deepEqual(failures,[],'已核完整目录必须可打开，不能只在数据中有书却没有逐本入口');
});

test('百科与Readers、悠游套号和基础词汇版本保持准确范围',()=>{
 const encyclopedia=M.getStageMaterials(catalog,'low-age-4').find(item=>item.resource.title==='国家地理儿童百科');
 assert.equal(encyclopedia.resource.id,'resource-1fxwtds');
 assert.equal(M.publicationLevelScopes(raw.resourceVolumes,encyclopedia.resource.id,['入门级'],'low-age-4')[0].total,24);
 const readers=M.getStageMaterials(catalog,'low-age-5').find(item=>item.material.level==='Pre-reader');
 assert.equal(readers.resource.id,'resource-5iilo9');
 assert.notEqual(readers.resource.id,encyclopedia.resource.id);
 const foundation=M.getStageMaterials(catalog,'low-age-3').find(item=>item.material.displayTitle==='培生基础词汇');
 assert.ok(foundation);
 const foundationScopes=P.bookScopes(foundation.resource.id,[foundation.material.level],raw.resourceVolumes,'low-age-3');
 assert.deepEqual(foundationScopes.map(s=>s.total).sort((a,b)=>a-b),[48,48,96]);
 assert.equal(P.defaultBookScope(foundationScopes),null,'上下辑未指定不能默选妙趣屋32册');
 const B=require('../english/book-progress.js'),directory=read('resource-books');
 for(const [stageId,total] of [['low-age-3',12],['low-age-4',18],['low-age-5',12],['low-age-6',12]]){
  const item=M.getStageMaterials(catalog,stageId).find(item=>item.resource.title==='悠游阅读成长计划');
  const scopes=P.bookScopes(item.resource.id,[item.material.level],raw.resourceVolumes,stageId);
  assert.equal(scopes.length,1);assert.equal(scopes[0].total,total,'套号范围由逐套6册成员计算');
  const plan=B.planForResource({plans:[]},item.resource.id,directory,raw.resourceVolumes,scopes[0]);
  assert.equal(B.books(plan,B.scopeGroup(plan,scopes[0])).length,total);
 }
});
