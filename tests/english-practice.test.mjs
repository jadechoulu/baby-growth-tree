import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const P=require('../english/practice.js');
const M=require('../english/model.js');
const Sync=require('../shared/sync-model.js');
const raw=Object.fromEntries(['banana','qing','xu','xu-current','xu-panorama','xu-thousand','route-plan'].map(id=>[id,JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)))]));
const catalog=M.normalize({...raw,xuCurrent:raw['xu-current'],xuSupplements:[raw['xu-panorama'],raw['xu-thousand']],routePlan:raw['route-plan']});
const entry=(changes={})=>({version:1,routeId:'qing',stageId:'qing-s1',date:'2026-10-29',kind:'reading',minutes:30,factor:1,qualified:true,unitKey:'',unitLabel:'',content:'',...changes});
const wrap=records=>({version:1,profile:{vocabulary:70,mode:'audio'},favorites:[],records});
const key=id=>P.SESSION+'qing:'+id;
const songLibrary=JSON.parse(fs.readFileSync(new URL('../english/data/sss-songs.json',import.meta.url)));

test('唯一有册数的匹配目录默认采用，多个候选不猜版，已有选版优先且不写记录',()=>{
  const one={id:'only',label:'1级',total:8,edition:'参考版',unit:'本'},two={...one,id:'other',edition:'另一版'};
  const old=P.unitQuantityProgressUpdate(3,null,P.unitUpdate('using','手记','2026-10-01'),'本');
  const before=JSON.stringify(old),scope=P.bookScope(old,[one],'本');
  assert.equal(scope.automaticDefault,true);
  assert.equal(P.quantityRecord(old,scope,'本').completed,3);
  assert.equal(P.quantityRecord(old,scope,'本').total,8);
  assert.equal(JSON.stringify(old),before);
  assert.equal(P.bookScope(null,[one,two],'本'),null);
  assert.equal(P.bookScope(null,[],'本'),null);
  const saved=P.unitBookProgressUpdate(2,two);
  assert.equal(P.bookScope(saved,[one],'本').edition,'另一版');
  assert.equal(P.bookScope(null,[one,{...two,default:true}],'本').id,'other');
  assert.equal(P.libraryQuantity(null,[one],'本').total,8);
  const unknown={id:'unknown',label:'未核目录',total:null,edition:'另一版',default:true};
  assert.equal(P.bookScope(null,[unknown,one],'本').id,'only','无分母候选不能挡住唯一完整目录');
  assert.equal(P.bookScope(null,[unknown],'本'),null);
});

test('自动补唯一分母不把别的路线级别无分母数量借到当前级别',()=>{
  const scope=P.defaultBookScope([{id:'one',label:'1级',total:8,edition:'参考版',unit:'本'}]);
  const own=P.unitQuantityProgressUpdate(2,null,undefined,'本');
  const other=P.unitQuantityProgressUpdate(5,null,undefined,'本');
  const records={[P.MATERIAL+'qing:stage:r:other']:other};
  assert.equal(P.sharedQuantity(records,'r',scope,'本',own).completed,2);
  assert.equal(P.sharedQuantity(records,'r',scope,'本').completed,0);
});

test('原文分集补总量后沿用既有分项键与已记集数，不把季数当集数',()=>{
  const volumes=JSON.parse(fs.readFileSync(new URL('../english/data/resource-volumes.json',import.meta.url)));
  const item=M.getStageMaterials(catalog,'qing-s1').find(item=>item.resource.title==='Muzzy');
  const unit={item,key:P.unitKey(catalog.stages.find(s=>s.id==='qing-s1'),item),resourceId:item.resource.id,stageId:'qing-s1',bookScopes:[]};
  const levels=M.getMaterialLevels(item);
  const previous=P.expandBookUnits(unit,levels,{series:[]});
  unit.bookScopes=P.bookScopes(unit.resourceId,item.materials.map(m=>M.formatLevel(m.level,item.resource)),volumes,unit.stageId);
  const current=P.expandBookUnits(unit,levels,volumes);
  assert.deepEqual(current.map(u=>u.key),previous.map(u=>u.key));
  assert.equal(current.length,6);
  const old=P.unitQuantityProgressUpdate(1,null,undefined,'集');
  const children=current.map(child=>{
    const scope=child.bookScopes.find(scope=>scope.default);
    assert.equal(scope.total,1);
    return {key:child.key,scopeIdentity:JSON.stringify([scope.id,scope.label,scope.edition]),countOnlyCompatible:scope.countOnlyCompatible,...P.quantityRecord(child.key===current[0].key?old:null,scope,'集')};
  });
  assert.equal(P.groupQuantity(undefined,children).total,6);
  assert.equal(P.groupQuantity(undefined,children).completed,1);
  assert.equal(P.groupQuantity(undefined,children).percent,17);
  const oldChildren=previous.map(child=>({key:child.key,total:null,completed:0,unit:'集',scopeIdentity:''}));
  const oldParent=P.groupQuantityUpdate(3,oldChildren,undefined);
  assert.equal(P.groupQuantity(oldParent,children).completed,3,'补分母保留原父项已记数量');
  assert.equal(P.groupQuantity(oldParent,children).total,6);
});

test('进度素材按分级、绘本、其他排列，同系列各级不因完成状态分散',()=>{
  const unit=(key,resourceId,type,status)=>({key,resourceId,item:{resource:{id:resourceId,type}},status});
  const units=[unit('song','songs','song','using'),unit('pearson-upper','pearson','reader','using'),unit('cat-pink-a','cat','reader','using'),unit('picture','picture','book','not-started'),unit('pearson-lower','pearson','reader','not-started'),unit('cat-pink-b','cat','reader','done'),unit('animation','animation','animation','using')];
  const before=structuredClone(units);
  assert.deepEqual(P.sortMaterialUnits(units).map(u=>u.key),['pearson-upper','pearson-lower','cat-pink-a','cat-pink-b','picture','song','animation']);
  assert.deepEqual(units,before);
});

test('系列历史ID按公共目录归组，庆爸父子层级和组内原级别顺序保留',()=>{
  const child={key:'cat-level-1',resourceId:'cat',item:{resource:{id:'cat',type:'reader'}}};
  const unit=(key,resourceId,type)=>({key,resourceId,item:{resource:{id:resourceId,type}}});
  const parent={...unit('cat-parent','cat','reader'),children:[child]};
  const alias=unit('cat-alias','cat-legacy','reader'),other=unit('other','other','reader');
  const volumes={series:[{resourceId:'cat',scopes:[]},{resourceId:'cat-legacy',catalogResourceId:'cat',scopes:[]}]};
  const result=P.sortMaterialUnits([parent,other,alias],volumes);
  assert.deepEqual(result.map(u=>u.key),['cat-parent','cat-alias','other']);
  assert.equal(result[0],parent);assert.equal(result[0].children[0],child);
});

test('同版同级别跨阶段回读原数量，范围ID变化不清零也不重复求和',()=>{
  const scope={id:'new-part',label:'Pink 1A',total:22,edition:'指定旧版',origin:'catalog'};
  const old={...scope,id:'old-part'},records={
    [P.MATERIAL+'xu:old:series:sig:part']:P.unitBookProgressUpdate(10,old),
    [P.MATERIAL+'qing:other:series:signature']:P.unitBookProgressUpdate(7,old)
  },before=structuredClone(records);
  const quantity=P.sharedQuantity(records,'series',scope,'本');
  assert.equal(quantity.completed,10);assert.equal(quantity.percent,45);
  assert.deepEqual(records,before);
  assert.equal(P.sharedQuantity(records,'series',{...scope,label:'Pink 1B'},'本').completed,0);
  assert.equal(P.sharedQuantity(records,'series',{...scope,edition:'另一版'},'本').completed,0);
  assert.equal(P.sharedQuantity(records,'other-series',scope,'本').completed,0);
});

test('共用范围修改和撤回覆盖旧数量，不让旧阶段较大值重新抬升',()=>{
  const scope={id:'part',label:'上辑',total:48,edition:'基础词汇',origin:'catalog'};
  const oldKey=P.MATERIAL+'xu:old:series:signature',records={[oldKey]:P.unitBookProgressUpdate(10,scope)};
  Object.assign(records,P.sharedQuantityUpdate(records,'series',scope,2,'本'));
  assert.equal(P.sharedQuantity(records,'series',{...scope,id:'another-reference'},'本').completed,2);
  Object.assign(records,P.sharedQuantityUpdate(records,'series',scope,0,'本'));
  assert.equal(P.sharedQuantity(records,'series',scope,'本').status,'not-started');
  assert.equal(P.unitBooks(records[oldKey]).completed,10);
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records))));
  assert.equal(P.sharedQuantity(restored.records,'series',scope,'本').completed,0);
});

test('图鉴和路线引用同一范围，整套总数不拆摊到不同级别',()=>{
  const scope={id:'all',label:'整套',total:70,edition:'GK70',origin:'catalog'};
  const record=P.libraryQuantityUpdate(null,scope,4,'本');
  const records={[P.LIBRARY+'series']:record};
  assert.equal(P.sharedQuantity(records,'series',scope,'本').completed,4);
  assert.equal(P.sharedQuantity(records,'series',{...scope,label:'A',total:43},'本').completed,0);
  assert.equal(P.sharedQuantityKey('series',{...scope,origin:'personal'}),null);
});

test('选读版本跨阶段共用，旧选择可回读且旧记录不改写',()=>{
  // 使用真实出版目录形状，避免通过显示名称猜测套系。
  const actual=JSON.parse(fs.readFileSync(new URL('../english/data/resource-volumes.json',import.meta.url)));
  const resourceId='resource-g7xvo5',entry=M.publicationEntry(actual,resourceId),options=entry.recordingEditions;
  const oldKey=P.MATERIAL+'xu:old:'+resourceId+':old-signature';
  const unit={key:P.MATERIAL+'xu:new:'+resourceId+':new-signature',resourceId};
  const records={[oldKey]:P.unitEditionUpdate(options[1].id)},before=structuredClone(records);
  assert.equal(JSON.parse(P.sharedEditionRecord(records,unit,actual).note).recordingEdition,options[1].id);
  Object.assign(records,P.sharedEditionUpdate(resourceId,options,options[0].id));
  assert.equal(JSON.parse(P.sharedEditionRecord(records,unit,actual).note).recordingEdition,options[0].id);
  assert.deepEqual(records[oldKey],before[oldKey]);
  assert.ok(P.sharedEditionKey(resourceId,options).length<=160);
});

test('素材搜索支持简称、别名、全角和多关键词，空输入恢复全部',()=>{
  const names=['培生词汇妙趣屋 · 1辑','培生幼儿基础词汇 · 上','Pearson Vocabulary'];
  for(const query of ['培生 1','培妙屋','幼儿 上','ＰＥＡＲＳＯＮ','vocab','  '])assert.equal(P.matchesMaterialSearch(names,query),true,query);
  for(const query of ['大猫','培生 2','下册'])assert.equal(P.matchesMaterialSearch(names,query),false,query);
  assert.equal(P.matchesMaterialSearch(['培生词汇妙趣屋 · 2辑'],'培妙屋 1',['培生词汇妙趣屋1–3']),false);
  assert.equal(P.matchesMaterialSearch(['培生词汇妙趣屋 · 1辑'],'幼儿基础 1',['培生幼儿基础词汇']),true);
  assert.equal(P.matchesMaterialSearch(['大猫 · 12级'],'大猫 1'),false);
});

test('SSS必备歌单按独立勾选汇总，完成与撤回即时改变数量、百分比及状态',()=>{
  const ids=songLibrary.categories.find(category=>category.id==='essential').songIds;
  const records={};
  assert.equal(ids.length,10);
  assert.deepEqual(P.songPlaylistProgress(records,songLibrary),{total:10,done:0,percent:0,status:'not-started'});
  records[P.SONG+ids[0]]={status:'done',note:''};
  assert.deepEqual(P.songPlaylistProgress(records,songLibrary),{total:10,done:1,percent:10,status:'using'});
  for(const id of ids)records[P.SONG+id]={status:'done',note:''};
  assert.deepEqual(P.songPlaylistProgress(records,songLibrary),{total:10,done:10,percent:100,status:'done'});
  records[P.SONG+ids[0]]={status:'not-started',note:'保留撤回记录'};
  assert.deepEqual(P.songPlaylistProgress(records,songLibrary),{total:10,done:9,percent:90,status:'using'});
});

test('SSS歌单分母只计去重后的真实歌曲，其他歌单和未知歌曲不扩大当前进度',()=>{
  const ids=songLibrary.categories.find(category=>category.id==='essential').songIds;
  const other=songLibrary.songs.find(song=>!ids.includes(song.id)).id;
  const records={[P.SONG+other]:{status:'done',note:''},[P.SONG+'unknown']:{status:'done',note:''}};
  assert.deepEqual(P.songPlaylistProgress(records,songLibrary),{total:10,done:0,percent:0,status:'not-started'});
  const library=structuredClone(songLibrary);
  library.categories.find(category=>category.id==='essential').songIds.push(ids[0],ids[0],'unknown');
  records[P.SONG+ids[0]]={status:'done',note:''};
  assert.deepEqual(P.songPlaylistProgress(records,library),{total:10,done:1,percent:10,status:'using'});
  assert.equal(P.songPlaylistProgress(records,library,'recommended').done,2);
  assert.deepEqual(P.songPlaylistProgress(records,library,'missing'),{total:0,done:0,percent:0,status:'not-started'});
  assert.deepEqual(P.songPlaylistProgress(records,{categories:[{id:'essential',songIds:[]}],songs:[]}),{total:0,done:0,percent:0,status:'not-started'});
});

test('SSS派生进度不改素材旧百分比、备注及未知键，单曲记录经备份同步往返后仍可汇总',()=>{
  const id=songLibrary.categories.find(category=>category.id==='essential').songIds[0];
  const records={
    [P.SONG+id]:{status:'done',note:'歌曲备注'},
    [P.MATERIAL+'xu:sss']:P.unitProgressUpdate(100,{status:'using',note:'旧素材备注'},'2026-10-29'),
    [P.MATERIAL+'qing:sss']:P.unitProgressUpdate(35,{status:'using',note:'庆爸独立进度'},'2026-10-29'),
    [songLibrary.resourceId]:{status:'done',note:'整套状态'},
    'future.record':{status:'using',note:'未知字段'}
  };
  const before=structuredClone(records),expected={total:10,done:1,percent:10,status:'using'};
  assert.deepEqual(P.songPlaylistProgress(records,songLibrary),expected);
  assert.deepEqual(records,before);
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records))));
  assert.deepEqual(restored.records,before);
  assert.deepEqual(P.songPlaylistProgress(restored.records,songLibrary),expected);
  delete restored.records[P.SONG+id];
  assert.deepEqual(P.songPlaylistProgress(restored.records,songLibrary),{total:10,done:0,percent:0,status:'not-started'});
  assert.deepEqual(records,before);
});

test('SSS单曲独立同步与备份，跨歌单使用同一ID，撤回不影响其他歌和套系',()=>{
  const songs=JSON.parse(fs.readFileSync(new URL('../english/data/sss-songs.json',import.meta.url))).songs;
  const song=songs.find(s=>s.categories.length>1),id=P.SONG+song.id,other=P.SONG+songs.find(s=>s.id!==song.id).id;
  assert.equal(new Set(songs.map(s=>P.SONG+s.id)).size,songs.length);
  assert.ok(songs.every(s=>(P.SONG+s.id).length<=160));
  const base=wrap({[id]:{status:'done',note:''},sss:{status:'using',note:'原套系笔记'}});
  assert.deepEqual(Sync.normalize('english',JSON.parse(JSON.stringify(base))),base);
  const local=structuredClone(base),remote=structuredClone(base);
  local.records[id]={status:'not-started',note:''};
  remote.records[other]={status:'done',note:''};
  const merged=Sync.merge(base,local,remote);
  assert.equal(merged.conflicts.length,0);
  assert.equal(merged.snapshot.records[id].status,'not-started');
  assert.equal(merged.snapshot.records[other].status,'done');
  assert.deepEqual(merged.snapshot.records.sss,base.records.sss);
});

test('庆爸按原始分钟和音频系数分别计算，未满足有效条件的记录只保留实际时间',()=>{
  const records={
    [key('read')]:P.sessionRecord(entry({minutes:60})),
    [key('anim')]:P.sessionRecord(entry({kind:'animation',minutes:20})),
    [key('a0')]:P.sessionRecord(entry({kind:'audio',minutes:40,factor:0})),
    [key('a5')]:P.sessionRecord(entry({stageId:'qing-s3',kind:'audio',minutes:60,factor:0.5})),
    [key('a8')]:P.sessionRecord(entry({stageId:'qing-s4',kind:'audio',minutes:100,factor:0.8})),
    [key('invalid')]:P.sessionRecord(entry({minutes:40,qualified:false})),
  };
  assert.equal(P.summarize(records).minutes,320);
  assert.equal(P.summarize(records).effectiveMinutes,190);
  assert.equal(P.summarize(records,'qing-s1').effectiveMinutes,80);
  assert.equal(P.summarize(records).byKind.audio.minutes,200);
});

test('每条记录编辑替换后不重复累计，撤回与恢复保留原值，历史补录只按已折算时间计',()=>{
  const id=key('one'),records={[id]:P.sessionRecord(entry())};
  records[id]=P.sessionRecord(entry({minutes:60}));
  assert.equal(P.summarize(records).effectiveMinutes,60);
  const original=records[id];records[id]={...original,status:'not-started'};
  assert.equal(P.summarize(records).effectiveMinutes,0);
  records[id]=original;records[key('history')]=P.sessionRecord(entry({kind:'history',minutes:120,factor:0.8}));
  assert.equal(P.summarize(records).effectiveMinutes,180);
  records[key('long-history')]=P.sessionRecord(entry({kind:'history',minutes:6000}));
  assert.equal(P.summarize(records).effectiveMinutes,6180);
});

test('素材进度键隔离路线、阶段、用途与级别，不受排序、重复引用和共用加粗影响',()=>{
  const st=catalog.stages.find(s=>s.id==='qing-s1'),items=M.getStageMaterials(catalog,st);
  const item=items.find(x=>x.materials.length>1)||items[0],key=P.unitKey(st,item);
  assert.equal(P.unitKey(st,{...item,materials:[...item.materials].reverse().concat(item.materials[0]),shared:false}),key);
  assert.notEqual(P.unitKey({...st,routeId:'xu'},item),key);
  assert.notEqual(P.unitKey({...st,id:'qing-s2'},item),key);
  assert.notEqual(P.unitKey(st,{...item,material:{...item.material,role:'other'}}),key);
  assert.notEqual(P.unitKey(st,{...item,materials:item.materials.map(m=>({...m,level:m.level+'另一级'}))}),key);
  const records={[key]:P.unitUpdate('done','只记录这一阶段','2026-10-29')};
  assert.equal(P.unitRecord(records,key).status,'done');
  assert.equal(P.unitRecord(records,P.unitKey({...st,routeId:'xu'},item)).status,'not-started');
  assert.equal(records[item.resource.id],undefined);
});

test('所有既有阶段记录键均唯一且符合已部署同步长度契约',()=>{
  const keys=[];
  for(const st of catalog.stages.filter(s=>['qing','xu'].includes(s.routeId)&&!s.sourceStageIds))for(const item of M.getStageMaterials(catalog,st))keys.push(P.unitKey(st,item));
  assert.equal(new Set(keys).size,keys.length);
  assert.ok(keys.every(k=>k.length<=160));
});

test('合并词量节点逐项引用原阶段记录键，GK A与B分别保留且数量不串级',()=>{
  for(const node of M.getRoutePlan(catalog,'xu','listening').stages){
    for(const item of M.getStageMaterials(catalog,node)){
      const original=catalog.stages.find(stage=>stage.id===item.material.recordStageId);
      const source=M.getStageMaterials(catalog,original).find(candidate=>P.unitKey(original,candidate)===P.unitKey(node,item));
      assert.ok(source,node.id+' '+item.resource.title+' 必须继续引用原记录');
      assert.deepEqual(item.role,source.role);
    }
  }
  const node=catalog.stages.find(s=>s.id==='xu-node-500');
  assert.deepEqual(M.getStageMaterials(catalog,node).filter(item=>item.role.kind==='main').map(item=>item.material.level),['A','B']);
  const original=catalog.stages.find(s=>s.id==='xu-3'),main=M.getStageMaterials(catalog,original).find(i=>i.role.kind==='main');
  const key=P.unitKey(original,main),record=P.unitProgressUpdate(20);
  const restored=Sync.normalize('english',wrap({[key]:record}));
  const projected=M.getStageMaterials(catalog,node).find(i=>i.material.level==='A'&&i.role.kind==='main');
  assert.equal(P.unitRecord(restored.records,P.unitKey(node,projected)).percent,20);
});

test('素材百分比保留备注并映射状态，通过原同步和备份契约往返',()=>{
  const id=P.MATERIAL+'xu:test',other=P.MATERIAL+'qing:test';
  const old=P.unitUpdate('using','读到第8本','2026-10-29');
  assert.equal(P.unitRecord({[id]:old},id).percent,null);
  for(const [percent,status] of [[0,'not-started'],[35,'using'],[100,'done'],[20,'using']]){
    const records={[id]:P.unitProgressUpdate(percent,old,'2026-10-30'),[other]:old};
    const record=P.unitRecord(records,id);
    assert.deepEqual(record,{status,percent,text:'读到第8本',date:'2026-10-30'});
    assert.deepEqual(records[other],old);
    const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records))));
    assert.deepEqual(restored.records,records);
  }
  assert.equal(P.unitRecord({[id]:P.unitUpdate('done','')},id).percent,100);
  assert.equal(P.unitRecord({},id).percent,0);
  const plain=P.unitProgressUpdate(25,{status:'using',note:'原有纯文本备注'},'2026-10-30');
  assert.equal(P.unitRecord({[id]:plain},id).text,'原有纯文本备注');
  for(const invalid of [-1,101,1.5,NaN,'50',null])assert.throws(()=>P.unitProgressUpdate(invalid,old));
  assert.deepEqual(old,P.unitUpdate('using','读到第8本','2026-10-29'));
});

test('素材日期可独立回填，后续进度更新保留所选日期及旧状态备注',()=>{
  const id=P.MATERIAL+'xu:date',other=P.MATERIAL+'qing:date';
  const old=P.unitProgressUpdate(35,P.unitUpdate('using','读到第8本','2026-10-29'));
  const dated=P.unitDateUpdate('2026-09-15',old);
  assert.deepEqual(P.unitRecord({[id]:dated},id),{status:'using',percent:35,text:'读到第8本',date:'2026-09-15'});
  const changed=P.unitProgressUpdate(60,dated);
  assert.deepEqual(P.unitRecord({[id]:changed},id),{status:'using',percent:60,text:'读到第8本',date:'2026-09-15'});
  const records={[id]:changed,[other]:old};
  assert.deepEqual(Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records)))).records,records);
  const legacy=P.unitDateUpdate('2026-09-15',P.unitUpdate('using','旧备注','2026-10-29'));
  assert.equal(P.unitRecord({[id]:legacy},id).percent,null);
  assert.equal(P.unitRecord({[id]:legacy},id).status,'using');
  assert.equal(P.unitRecord({[id]:old},id).date,'2026-10-29');
  for(const date of ['',null,'2026-02-30','2026-9-15'])assert.throws(()=>P.unitDateUpdate(date,old));
});

test('旧素材状态、笔记与收藏和新路线记录通过现有同步与JSON备份往返，不迁移旧键',()=>{
  const records={book:{status:'using',note:'原有手记'},[key('one')]:P.sessionRecord(entry({content:'绘本第一册'})),[P.MATERIAL+'test']:P.unitUpdate('done','读到第8本','2026-10-29')};
  const data={...wrap(records),favorites:['book']};
  const normalized=Sync.normalize('english',data);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)),data);
  const remote=structuredClone(data),local=structuredClone(data);
  local.records[key('local')]=P.sessionRecord(entry({minutes:10}));
  remote.records[key('remote')]=P.sessionRecord(entry({minutes:20}));
  const merged=Sync.merge(data,local,remote);
  assert.equal(merged.conflicts.length,0);
  assert.equal(P.summarize(merged.snapshot.records).effectiveMinutes,60);
  assert.deepEqual(merged.snapshot.records.book,records.book);
});

test('同一活动的并发编辑需显式解决冲突，撤回墓碑不会因另一设备新增活动而复活',()=>{
  const id=key('one'),base=wrap({[id]:P.sessionRecord(entry())}),local=structuredClone(base),remote=structuredClone(base);
  local.records[id]=P.sessionRecord(entry({minutes:10}));
  remote.records[id]=P.sessionRecord(entry({minutes:20}));
  assert.equal(Sync.merge(base,local,remote).conflicts.length,1);
  local.records[id]={...base.records[id],status:'not-started'};remote.records[id]=base.records[id];
  remote.records[key('new')]=P.sessionRecord(entry({minutes:5}));
  const merged=Sync.merge(base,local,remote);
  assert.equal(merged.conflicts.length,0);
  assert.equal(P.summarize(merged.snapshot.records).effectiveMinutes,5);
});

test('无效输入及未来日期不参与累计，近7天按上海日历归组',()=>{
  for(const changes of [{minutes:0},{minutes:-5},{minutes:NaN},{minutes:1.5},{minutes:1441},{date:'2026-02-30'},{date:'9999-01-01'},{routeId:'xu'},{kind:'unknown'},{kind:'audio',factor:1},{content:'x'.repeat(2001)}])assert.throws(()=>P.sessionRecord(entry(changes)));
  const records={[key('valid')]:P.sessionRecord(entry({date:'2026-10-29'})),[key('bad')]:{status:'done',note:'损坏的记录'}};
  const days=P.recentDays(records,'2026-10-30');
  assert.equal(days.length,7);assert.equal(days[5].minutes,30);assert.equal(days[6].minutes,0);
  assert.equal(P.summarize(records).minutes,30);
  assert.equal(P.validDate('2024-02-29'),true);assert.equal(P.validDate('2025-02-29'),false);
});

test('同一天的明细按创建时间排序，恢复浏览阶段不依赖随机UUID顺序，旧记录仍可读取',()=>{
  const records={
    [key('z-old')]:P.sessionRecord(entry({createdAt:'2026-10-29T01:00:00.000Z'})),
    [key('a-new')]:P.sessionRecord(entry({stageId:'qing-s2',createdAt:'2026-10-29T02:00:00.000Z'})),
    [key('legacy')]:{status:'done',note:JSON.stringify(entry())},
  };
  assert.equal(P.sessions(records)[0].stageId,'qing-s2');
  assert.equal(P.sessions(records).length,3);
  assert.equal(P.summarize(records).minutes,90);
});

test('投入复盘按周一划周，正确处理跨年、闰年与自定义日期边界',()=>{
  assert.deepEqual(P.periodRange('week','2026-01-01'),{from:'2025-12-29',to:'2026-01-04'});
  assert.deepEqual(P.periodRange('month','2024-02-29'),{from:'2024-02-01',to:'2024-02-29'});
  assert.deepEqual(P.periodRange('year','2026-10-30'),{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(P.shiftDate('2026-01-31',0,1),'2026-02-01');
  assert.equal(P.calendarDays('2024-02').length,29);
  assert.throws(()=>P.calendarDays('2026-13'));
  assert.throws(()=>P.periodRange('custom','2026-10-30','2026-10-31','2026-10-01'));
});

test('复盘阶段与日期先过滤，实际口径排除已折算历史，零有效仍保留记录日和明细',()=>{
  const records={
    [key('zero')]:P.sessionRecord(entry({kind:'audio',factor:0,minutes:60,date:'2026-10-28'})),
    [key('reading')]:P.sessionRecord(entry({minutes:40,date:'2026-10-29'})),
    [key('history')]:P.sessionRecord(entry({kind:'history',minutes:600,date:'2026-10-29'})),
    [key('other')]:P.sessionRecord(entry({stageId:'qing-s2',minutes:90,date:'2026-09-30'})),
  };
  const options={stageId:'qing-s1',period:'custom',anchor:'2026-10-30',from:'2026-10-28',to:'2026-10-29'};
  const effective=P.statistics(records,options),actual=P.statistics(records,{...options,metric:'actual'});
  assert.equal(effective.minutes,640);assert.equal(effective.days,2);assert.equal(effective.entries.length,3);
  assert.equal(actual.minutes,100);assert.equal(actual.historyMinutes,600);assert.equal(actual.entries.length,2);
  assert.equal(P.statistics(records,{...options,from:'2026-10-29'}).minutes,640);
  assert.equal(P.statistics(records).minutes,730);
});

test('素材排行按稳定键区分同名阶段素材，未指定素材按活动分类，交互筛选不改变汇总分母',()=>{
  const records=Object.fromEntries([
    ['a',entry({unitKey:'stage1-book',unitLabel:'古力小超人 · 1',minutes:60})],
    ['b',entry({unitKey:'stage2-book',unitLabel:'古力小超人 · 1',minutes:30,stageId:'qing-s2'})],
    ['c',entry({kind:'animation',minutes:20})],['d',entry({kind:'reading',minutes:10})],
  ].map(([id,value])=>[key(id),P.sessionRecord(value)]));
  const data=P.statistics(records);
  assert.equal(data.groups.length,4);assert.equal(data.groups[0].share,.5);assert.equal(data.minutes,120);
  assert.equal(data.groups.filter(g=>g.label==='古力小超人 · 1').length,2);
  const byDay=P.trendBuckets(data.entries,{anchor:'2026-10-30',grain:'day'});
  assert.equal(byDay.length,7);assert.equal(byDay[5].minutes,120);assert.equal(byDay[6].minutes,0);
  const byWeek=P.trendBuckets(data.entries,{anchor:'2026-10-30',grain:'week'});
  assert.equal(byWeek.at(-1).from,'2026-10-26');assert.equal(byWeek.at(-1).minutes,120);
  for(const grain of ['week','month','year'])assert.equal(P.trendBuckets(data.entries,{anchor:'2026-10-30',grain}).reduce((n,b)=>n+b.minutes,0),120);
  const selected=data.entries.filter(e=>P.groupKey(e)==='stage1-book');
  assert.equal(P.aggregate(selected).minutes,60);assert.equal(data.minutes,120);
});

test('编辑、删除与撤销后图表重算，历史与日常不混淆，未来和损坏记录不进入复盘',()=>{
  const id=key('edit'),records={[id]:P.sessionRecord(entry({minutes:30}))};
  const original=records[id];
  assert.equal(P.statistics(records).minutes,30);
  records[id]=P.sessionRecord(entry({kind:'audio',factor:.5,minutes:60}));
  assert.equal(P.statistics(records).minutes,30);assert.equal(P.statistics(records,{metric:'actual'}).minutes,60);
  records[id]={...records[id],status:'not-started'};assert.equal(P.statistics(records).groups.length,0);
  records[id]=original;assert.equal(P.statistics(records).minutes,30);
  records[key('future')]={status:'done',note:JSON.stringify(entry({date:'2999-01-01'}))};
  records[key('broken')]={status:'done',note:'broken'};
  assert.equal(P.statistics(records).minutes,30);
});


const volumes=JSON.parse(fs.readFileSync(new URL('../english/data/resource-volumes.json',import.meta.url)));
const scopeFor=(resourceId,levels)=>P.bookScopes(resourceId,levels,volumes);
test('出版册数只匹配本套系本级别的范围，分辑不自动成为作者要求',()=>{
  const pearson=scopeFor('resource-1nuqi5t',['']).filter(scope=>!scope.level);
  assert.deepEqual(pearson.map(s=>s.total),[32,32,32,64,96,48,48,96]);
  assert.ok(pearson.every(s=>!s.default));
  assert.equal(scopeFor('resource-g7xvo5',['预备级'])[0].total,18);
  assert.equal(scopeFor('resource-g7xvo5',['1–3'])[0].total,86);
  assert.equal(scopeFor('resource-g7xvo5',['4、5'])[0].total,46);
  assert.equal(scopeFor('resource-1mx6gx6',['1–3'])[0].total,127);
  assert.equal(scopeFor('resource-1mx6gx6',['1、2'])[0].total,85);
  assert.equal(scopeFor('resource-1mx6gx6',['4、5'])[0].total,60);
  assert.equal(scopeFor('resource-141vfh7',['进阶级'])[0].total,28);
  assert.equal(scopeFor('resource-1mx6gx6',['6'])[0].total,18);
  assert.equal(scopeFor('resource-1mx6gx6',['6'])[0].default,false);
  for(const [id,levels] of [['resource-g7xvo5',['1–3 · 24册']],['resource-1mx6gx6',['1+']]])assert.deepEqual(scopeFor(id,levels),[]);
  assert.equal(scopeFor('resource-1mx6gx6',['1–3','4、5'])[0].total,187);
});

test('基础词汇改版归入原套系且保留新旧分装边界与进度隔离',()=>{
  const scopes=scopeFor('resource-1nuqi5t',['']),old=scopes.find(s=>s.id==='pearson-vocab-1'),upper=scopes.find(s=>s.id==='pearson-basic-vocab-upper');
  assert.notEqual(old.edition,upper.edition);
  const existing=P.unitBookProgressUpdate(16,old,P.unitUpdate('using','保留备注','2026-09-15'));
  const changed=P.unitBookScopeUpdate(upper,existing);
  assert.equal(P.unitBooks(changed).completed,null);
  assert.deepEqual(P.unitRecord({a:changed},'a'),P.unitRecord({a:existing},'a'));
  const updated=P.unitBookProgressUpdate(24,upper,changed);
  assert.equal(P.unitBooks(updated).total,48);
  assert.equal(P.unitRecord({a:updated},'a').percent,50);
  assert.equal(P.unitBooks(P.unitBookScopeUpdate(old,updated)).completed,null);
  // 旧版原文限定1、2或3，不借新版上下辑核算。
  assert.equal(scopeFor('resource-1nuqi5t',['1、2'])[0].total,64);
  assert.equal(scopeFor('resource-1nuqi5t',['3'])[0].total,32);
  const normalized=M.normalize({...raw,xuCurrent:raw['xu-current'],xuSupplements:[raw['xu-panorama'],raw['xu-thousand']],routePlan:raw['route-plan'],resourceVolumes:volumes});
  const resource=normalized.resources.find(r=>r.id==='resource-1nuqi5t');
  assert.ok(resource.aliases.includes('培生幼儿基础词汇'));
  const names=['培生词汇妙趣屋',...volumes.series[0].aliases,'培生幼儿英语基础级'];
  const identities=M.normalize({banana:{stages:[{id:'b'}],resources:names.map((title,i)=>({id:'book-'+i,title,category:'绘本',stageIds:['b']}))}});
  for(let i=1;i<names.length-1;i++)assert.equal(identities.rawToCanonical['book-'+i],identities.rawToCanonical['book-0']);
  assert.notEqual(identities.rawToCanonical['book-'+(names.length-1)],identities.rawToCanonical['book-0']);
  const st=normalized.stages.find(s=>s.id==='xu-current-300'),before=catalog.stages.find(s=>s.id===st.id);
  const item=M.getStageMaterials(normalized,st).find(i=>i.resource.id===resource.id),previous=M.getStageMaterials(catalog,before).find(i=>i.resource.id===resource.id);
  assert.equal(P.unitKey(st,item),P.unitKey(before,previous));
});

test('填写本数后自动计算百分比，保留日期备注未知字段，沿原同步契约往返',()=>{
  const scope=scopeFor('resource-g7xvo5',['预备级'])[0],id=P.MATERIAL+'xu:books';
  const old={status:'using',note:JSON.stringify({version:1,text:'喜欢动物',date:'2026-09-15',percent:30,futureField:{x:1}})};
  const selected=P.unitBookScopeUpdate(scope,old);
  assert.equal(P.unitBooks(selected).completed,null);
  assert.equal(P.unitRecord({[id]:selected},id).percent,30);
  for(const [n,percent,status] of [[0,0,'not-started'],[9,50,'using'],[18,100,'done'],[17,94,'using']]){
    const value=P.unitBookProgressUpdate(n,scope,old),meta=JSON.parse(value.note);
    assert.deepEqual(P.unitRecord({[id]:value},id),{status,percent,text:'喜欢动物',date:'2026-09-15'});
    assert.deepEqual(meta.futureField,{x:1});assert.equal(meta.books.completed,n);
    assert.deepEqual(Sync.normalize('english',JSON.parse(JSON.stringify(wrap({[id]:value})))).records[id],value);
    assert.equal(P.unitBooks(P.unitDateUpdate('2026-10-01',value)).completed,n);
  }
  for(const invalid of [-1,19,1.5,'2',null,NaN])assert.throws(()=>P.unitBookProgressUpdate(invalid,scope,old));
  const large={id:'personal',label:'自选1000本',total:1000,edition:'本人选用范围',origin:'personal'};
  const value=P.unitBookProgressUpdate(999,large,old);
  assert.equal(value.status,'using');assert.equal(P.unitRecord({[id]:value},id).percent,99);
  assert.equal(P.unitBookProgressUpdate(1,{...large,total:10000},old).status,'using');
});

test('改选范围不沿用旧本数，不由旧百分比推测数量，切回百分比不留活动本数',()=>{
  const one=scopeFor('resource-1nuqi5t',[''])[0],two=scopeFor('resource-1nuqi5t',[''])[1];
  const old=P.unitBookProgressUpdate(16,one,P.unitUpdate('using','原备注','2026-09-15'));
  assert.equal(P.unitBooks(P.unitBookScopeUpdate(one,old)).completed,16);
  for(const next of [two,{...one,label:'不同选材同32本'},{...one,edition:'另一版'}]){
    const changed=P.unitBookScopeUpdate(next,old);
    assert.equal(P.unitBooks(changed).completed,null);
    assert.equal(P.unitRecord({a:changed},'a').percent,50);
  }
  const percent=P.unitProgressUpdate(70,old);
  assert.equal(P.unitBooks(percent).mode,'percent');
  assert.equal(P.unitBooks(P.unitBookScopeUpdate(one,percent)).completed,null);
  for(const status of ['using','done']){
    const previous=P.unitUpdate(status,'旧记录','2026-09-15'),chosen=P.unitBookScopeUpdate(one,previous);
    assert.equal(P.unitBooks(chosen).completed,null);
    assert.deepEqual(P.unitRecord({a:chosen},'a'),P.unitRecord({a:previous},'a'));
  }
  assert.equal(P.unitBooks(P.unitBookScopeUpdate(null,old)).mode,'percent');
});

test('补充出版册数及个人选用范围不改变原素材键，不传播到其他路线或套系',()=>{
  const st=catalog.stages.find(s=>s.id==='xu-current-300'),item=M.getStageMaterials(catalog,st).find(i=>i.resource.title==='培生词汇妙趣屋');
  const before=P.unitKey(st,item),withBooks={...item,bookScopes:scopeFor(item.resource.id,['']),label:item.resource.title+' · 1辑'};
  assert.equal(P.unitKey(st,withBooks),before);
  assert.equal(item.materials[0].level,'');
  const one=scopeFor(item.resource.id,[''])[0],records={[before]:P.unitBookProgressUpdate(32,one),[item.resource.id]:{status:'using',note:'套系记录'}};
  assert.equal(P.unitRecord(records,P.unitKey({...st,routeId:'qing'},item)).status,'not-started');
  assert.equal(records[item.resource.id].status,'using');
});

const flatUnits=(stageId,records={})=>{
  const st=catalog.stages.find(s=>s.id===stageId);
  return M.getStageMaterials(catalog,st).flatMap(item=>{
    const unit={item,key:P.unitKey(st,item),label:item.resource.title,resourceId:item.resource.id,stageId};
    unit.bookScopes=P.bookScopes(unit.resourceId,item.materials.map(m=>M.formatLevel(m.level,item.resource)),volumes,stageId);
    if(!unit.bookScopes.length)unit.bookScopes=P.bookScopes(unit.resourceId,[item.levelSegments.map(s=>s.text).join('')],volumes,stageId);
    return ['book','reader'].includes(item.resource.type)?P.expandBookUnits(unit,M.getMaterialLevels(item),volumes,records[unit.key]):[unit];
  });
};
test('进度按阶段所列级别和出版分辑平铺，旧版三辑与新版两辑分别独立',()=>{
  const defaults=flatUnits('xu-current-300').filter(u=>u.resourceId==='resource-1nuqi5t');
  assert.deepEqual(defaults.map(u=>[u.editionId,u.partScope.label,u.partScope.total]),[['pearson-vocab-basic','上辑',48],['pearson-vocab-basic','下辑',48]]);
  const old=flatUnits('xu-current-300',{[defaults[0].parentKey]:P.unitEditionUpdate('pearson-vocab-original')}).filter(u=>u.resourceId==='resource-1nuqi5t');
  assert.deepEqual(old.map(u=>u.partScope.label),['1辑','2辑','3辑']);
  assert.deepEqual(old.map(u=>u.partScope.total),[32,32,32]);
  const record=P.unitEditionUpdate('pearson-vocab-basic');
  const revised=flatUnits('xu-current-300',{[old[0].parentKey]:record}).filter(u=>u.resourceId===old[0].resourceId);
  assert.deepEqual(revised.map(u=>u.partScope.label),['上辑','下辑']);
  assert.deepEqual(revised.map(u=>u.partScope.total),[48,48]);
  assert.ok(revised.every(u=>!old.some(v=>v.key===u.key)));
  const after=flatUnits('xu-current-500');
  const cat=after.filter(u=>u.resourceId==='resource-g7xvo5');
  assert.deepEqual(cat.map(u=>u.partScope.total),[30,31,25]);
  const stars=after.filter(u=>u.resourceId==='resource-1mx6gx6');
  assert.deepEqual(stars.map(u=>u.partScope.total),[44,41,42]);
  for(const st of catalog.stages){const units=flatUnits(st.id);assert.equal(new Set(units.map(u=>u.key)).size,units.length);assert.ok(units.every(u=>u.key.length<=160));}
});
test('分辑记录精确沿用可归属单辑的旧本数，合并及百分比记录不摊派',()=>{
  const parent=flatUnits('xu-current-300').find(u=>u.resourceId==='resource-1nuqi5t').parentKey;
  const units=flatUnits('xu-current-300',{[parent]:P.unitEditionUpdate('pearson-vocab-original')}).filter(u=>u.resourceId==='resource-1nuqi5t'),one=units[0],two=units[1];
  const legacy=P.unitBookProgressUpdate(16,scopeFor(one.resourceId,[''])[0],P.unitUpdate('using','旧备注','2026-09-15'));
  const records={[one.parentKey]:legacy};
  assert.deepEqual(flatUnits('xu-current-300',records).filter(u=>u.resourceId===one.resourceId).map(u=>u.editionId),Array(3).fill('pearson-vocab-original'));
  assert.equal(P.materialRecord(records,one),legacy);
  assert.equal(P.materialRecord(records,two),undefined);
  const next=P.unitBookProgressUpdate(32,one.partScope,P.materialRecord(records,one));
  records[one.key]=next;
  assert.equal(P.materialRecord(records,one).status,'done');
  assert.equal(JSON.parse(next.note).text,'旧备注');
  assert.equal(JSON.parse(next.note).date,'2026-09-15');
  assert.equal(records[one.parentKey],legacy);
  const merged=P.unitBookProgressUpdate(32,scopeFor(one.resourceId,['']).find(s=>s.total===64));
  assert.ok(units.every(u=>!P.materialRecord({[one.parentKey]:merged},u)));
  const percent=P.unitProgressUpdate(100);
  assert.ok(units.every(u=>!P.materialRecord({[one.parentKey]:percent},u)));
  records[one.key]=P.unitBookProgressUpdate(0,one.partScope,next);
  assert.equal(P.materialRecord(records,one).status,'not-started');
  const newEdition=P.unitEditionUpdate('pearson-vocab-basic',legacy);
  assert.equal(P.unitBooks(newEdition).completed,16);
  assert.equal(JSON.parse(newEdition.note).text,'旧备注');
  assert.deepEqual(Sync.normalize('english',wrap(records)).records,records);
});
test('列表切换版次后按各版分辑本数回显，来回切换与备份同步保留独立完成量',()=>{
  const parent=flatUnits('xu-current-300').find(u=>u.resourceId==='resource-1nuqi5t').parentKey;
  const old=flatUnits('xu-current-300',{[parent]:P.unitEditionUpdate('pearson-vocab-original')}).filter(u=>u.resourceId==='resource-1nuqi5t');
  const records={unknown:{status:'using',note:'其他记录'},[parent]:{status:'not-started',note:JSON.stringify({version:1,text:'保留选读备注',futureField:7})}};
  records[old[0].key]=P.unitBookProgressUpdate(16,old[0].partScope);
  records[parent]=P.unitEditionUpdate('pearson-vocab-basic',records[parent]);
  const revised=flatUnits('xu-current-300',records).filter(u=>u.resourceId===old[0].resourceId);
  assert.deepEqual(revised.map(u=>[u.partScope.label,u.partScope.total]),[['上辑',48],['下辑',48]]);
  assert.ok(revised.every(u=>!P.materialRecord(records,u)));
  records[revised[0].key]=P.unitBookProgressUpdate(24,revised[0].partScope);
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records)))).records;
  restored[parent]=P.unitEditionUpdate('pearson-vocab-original',restored[parent]);
  const original=flatUnits('xu-current-300',restored).filter(u=>u.resourceId===old[0].resourceId);
  assert.deepEqual(original.map(u=>[u.partScope.label,u.partScope.total]),[['1辑',32],['2辑',32],['3辑',32]]);
  assert.equal(P.unitBooks(P.materialRecord(restored,original[0])).completed,16);
  assert.equal(P.materialRecord(restored,original[1]),undefined);
  restored[parent]=P.unitEditionUpdate('pearson-vocab-basic',restored[parent]);
  assert.equal(P.unitBooks(P.materialRecord(restored,revised[0])).completed,24);
  assert.equal(P.unitRecord(restored,revised[0].key).percent,50);
  assert.equal(JSON.parse(restored[parent].note).text,'保留选读备注');
  assert.equal(JSON.parse(restored[parent].note).futureField,7);
  assert.deepEqual(restored.unknown,records.unknown);
});
test('原文组合级别拆开但保留标尺限定，不把数量或跨版本当成单级',()=>{
  const item=level=>({resource:{title:'牛津树'},materials:[{level}]});
  assert.deepEqual(M.getMaterialLevels(item('1–3')).map(p=>p.label),['1','2','3']);
  assert.deepEqual(M.getMaterialLevels(item('A&B')).map(p=>p.label),['A','B']);
  assert.deepEqual(M.getMaterialLevels(item('1+、2')).map(p=>p.label),['1+','2']);
  assert.deepEqual(M.getMaterialLevels(item('1–2（虚构部分）')).map(p=>p.label),['1 · 虚构部分','2 · 虚构部分']);
  assert.deepEqual(M.getMaterialLevels(item('1–2 · 24册')),[]);
});

test('歌单未完成在前、已完成在后，同状态保留原顺序且不修改原歌单或记录',()=>{
  const songs=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
  const records={
    [P.SONG+'a']:{status:'done',note:'保留备注'},
    [P.SONG+'b']:{status:'using',note:''},
    [P.SONG+'c']:{status:'done',note:''},
    unrelated:{status:'done',note:''}
  };
  const before=structuredClone({songs,records});
  assert.deepEqual(P.sortSongsByCompletion(songs,records).map(s=>s.id),['b','d','a','c']);
  assert.deepEqual(P.sortSongsByCompletion([songs[2],songs[0],songs[3]],records).map(s=>s.id),['d','c','a']);
  assert.deepEqual(P.sortSongsByCompletion(songs,{}),songs);
  assert.deepEqual(P.sortSongsByCompletion([],records),[]);
  assert.deepEqual({songs,records},before);
  records[P.SONG+'a']={status:'not-started',note:'保留备注'};
  assert.deepEqual(P.sortSongsByCompletion(songs,records).map(s=>s.id),['a','b','d','c']);
  records[P.SONG+'b']={status:'done',note:''};
  assert.deepEqual(P.sortSongsByCompletion(songs,records).map(s=>s.id),['a','d','b','c']);
});

test('大猫粉色44本只在明确的预备级引用提供选版，不改后续阶段分母或原文级别',()=>{
  const pink=flatUnits('xu-current-300').filter(u=>u.resourceId==='resource-g7xvo5');
  assert.deepEqual(pink.map(u=>[u.editionId,u.partScope.label,u.partScope.total]),[['big-cat-pink-44','Pink 1A',22],['big-cat-pink-44','Pink 1B',22]]);
  assert.ok(pink.every(u=>u.item.materials.every(m=>m.level==='预备级')));
  const parent=pink[0].parentKey;
  const old=flatUnits('xu-current-300',{[parent]:P.unitEditionUpdate('big-cat-fltrp-pre-2023')}).filter(u=>u.resourceId==='resource-g7xvo5');
  assert.deepEqual(old.map(u=>[u.partScope.label,u.partScope.total]),[['预备级1',9],['预备级2',9]]);
  const previousVolumes=structuredClone(volumes),previousEntry=previousVolumes.series.find(s=>s.resourceId==='resource-g7xvo5');
  delete previousEntry.recordingLevels;delete previousEntry.recordingEditions;
  const base={...old[0],key:parent,bookScopes:P.bookScopes(old[0].resourceId,['预备级'],previousVolumes)};
  const legacyUnits=P.expandBookUnits(base,M.getMaterialLevels(base.item),previousVolumes);
  assert.deepEqual(old.map(u=>u.key),legacyUnits.map(u=>u.key));
  const later=flatUnits('xu-current-500',{[parent]:P.unitEditionUpdate('big-cat-pink-44')}).filter(u=>u.resourceId==='resource-g7xvo5');
  assert.deepEqual(later.map(u=>u.partScope.total),[30,31,25]);
  assert.ok(later.every(u=>!u.editionOptions.length));
});

test('大猫英版与外研社记录隔离，切换刷新及备份往返保留各版独立本数',()=>{
  const pink=flatUnits('xu-current-300').filter(u=>u.resourceId==='resource-g7xvo5'),parent=pink[0].parentKey;
  const original=flatUnits('xu-current-300',{[parent]:P.unitEditionUpdate('big-cat-fltrp-pre-2023')}).filter(u=>u.resourceId==='resource-g7xvo5');
  const legacy=P.unitBookProgressUpdate(9,original[0].partScope,P.unitUpdate('using','保留旧版备注','2026-10-30'));
  const records={unknown:{status:'using',note:'保留未知键'},[original[0].key]:legacy,[parent]:P.unitEditionUpdate('big-cat-pink-44')};
  assert.ok(pink.every(u=>P.materialRecord(records,u)===undefined));
  records[pink[0].key]=P.unitBookProgressUpdate(11,pink[0].partScope);
  assert.equal(P.unitRecord(records,pink[0].key).percent,50);
  assert.equal(P.unitRecord(records,pink[1].key).percent,0);
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records)))).records;
  restored[parent]=P.unitEditionUpdate('big-cat-fltrp-pre-2023',restored[parent]);
  const old=flatUnits('xu-current-300',restored).filter(u=>u.resourceId==='resource-g7xvo5');
  assert.deepEqual(P.materialRecord(restored,old[0]),legacy);
  restored[parent]=P.unitEditionUpdate('big-cat-pink-44',restored[parent]);
  assert.equal(P.unitBooks(P.materialRecord(restored,pink[0])).completed,11);
  assert.deepEqual(restored.unknown,records.unknown);
});

test('未知总量只记数量，不从旧百分比反推数量，保留备注日期及同步未知元数据',()=>{
  const old={status:'using',note:JSON.stringify({version:1,percent:65,text:'历史备注',date:'2026-10-30',custom:{keep:true}})};
  assert.deepEqual(P.quantityRecord(old,null,'张'),{completed:0,total:null,unit:'张',percent:null,status:'not-started'});
  const next=P.unitQuantityProgressUpdate(120,null,old,'张'),meta=JSON.parse(next.note);
  assert.equal(next.status,'using');assert.equal(meta.percent,65);assert.equal(meta.text,'历史备注');assert.equal(meta.date,'2026-10-30');assert.deepEqual(meta.custom,{keep:true});
  assert.deepEqual(P.quantityRecord(next,null,'张'),{completed:120,total:null,unit:'张',percent:null,status:'using'});
  assert.equal(P.quantityRecord(P.unitQuantityProgressUpdate(0,null,next,'张'),null,'张').completed,0);
  for(const value of [-1,0.5,NaN,Infinity,1000001])assert.throws(()=>P.unitQuantityProgressUpdate(value,null,next,'张'));
  const records={[P.MATERIAL+'xu:quantity-test']:next};
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(records))));
  assert.equal(restored.records[P.MATERIAL+'xu:quantity-test'].note,next.note);
});

test('已核实总量使用相应单位自动计算，未知分母不借用旧数量或百分比',()=>{
  const animation=scopeFor('resource-1u3sl6e',[''])[0];
  assert.equal(animation.total,24);assert.equal(animation.unit,'集');
  const half=P.unitQuantityProgressUpdate(12,animation,undefined,'集');
  assert.deepEqual(P.quantityRecord(half,animation,'集'),{completed:12,total:24,unit:'集',percent:50,status:'using'});
  assert.equal(P.quantityRecord(P.unitQuantityProgressUpdate(24,animation,half,'集'),animation,'集').status,'done');
  assert.throws(()=>P.unitQuantityProgressUpdate(25,animation,half,'集'));
  assert.equal(P.quantityRecord(half,null,'集').completed,0);
  assert.equal(P.quantityRecord(P.unitQuantityProgressUpdate(12,null,half,'集'),animation,'集').completed,0);
  assert.equal(scopeFor('resource-29ukn0',['1'])[0].total,60);
  assert.equal(scopeFor('resource-smispi',[''])[0].total,72);
  assert.equal(scopeFor('resource-ngqkjv',[''])[0].total,7);
  for(const type of ['reader','book','animation','flashcard','song'])assert.ok(['本','集','张','首'].includes(P.quantityUnit(type)));
});


test('庆爸全部阶段复用级别展开，A/B、范围和册数标尺保持正确且稳定键不变',()=>{
  const stages=catalog.routes.find(r=>r.id==='qing').stages,all=[];
  for(const st of stages)for(const item of M.getStageMaterials(catalog,st)){
    const unit={key:P.unitKey(st,item),item,resourceId:item.resource.id,bookScopes:scopeFor(item.resource.id,item.materials.map(m=>M.formatLevel(m.level,item.resource)))};
    const parts=P.expandBookUnits(unit,M.getMaterialLevels(item),volumes);
    for(const part of parts){assert.ok(part.key.length<=160);all.push(part.key);}
    if(item.resource.title==='Buddy Reader')assert.deepEqual(parts.map(p=>p.partLevel.label),M.getMaterialLevels(item).map(l=>l.label));
    if(item.materials.some(m=>m.level==='24本'))assert.equal(parts.length,1);
    if(item.resource.id==='resource-1nuqi5t'){
      const expected=st.id==='qing-s1'?['1','2']:['3'];
      assert.deepEqual(M.getMaterialLevels(item).map(l=>l.label),expected);
      for(const level of expected)assert.equal(scopeFor(item.resource.id,[level])[0].total,32);
    }
  }
  assert.equal(new Set(all).size,all.length);
});

test('父项数量取max，子项更改即时重算；旧父记录不拆摊，范围及备份同步隔离',()=>{
  const children=[{key:'a',unit:'本',completed:2,total:10},{key:'b',unit:'本',completed:3,total:10}];
  const original={status:'using',futureField:'keep',note:JSON.stringify({version:1,text:'旧备注',date:'2026-09-15',percent:45,books:{version:1,mode:'count',label:'原合并',total:20,completed:9},unknown:{keep:true}})};
  assert.equal(P.groupQuantity(original,children).completed,5);
  const saved=P.groupQuantityUpdate(12,children,original);
  assert.equal(P.groupQuantity(saved,children).completed,12);
  assert.equal(P.groupQuantity(saved,children).percent,60);
  assert.equal(P.groupQuantity(saved,[{...children[0],completed:10},{...children[1],completed:9}]).completed,19);
  assert.equal(P.groupQuantity(saved,[{...children[0],completed:10},{...children[1],completed:10}]).status,'done');
  assert.equal(P.groupQuantity(saved,[{...children[0],completed:0},{...children[1],completed:0}]).completed,12);
  assert.equal(P.groupQuantity(P.groupQuantityUpdate(0,children,saved),children).completed,5);
  assert.equal(P.groupQuantity(saved,[{...children[0],key:'other'},children[1]]).completed,5);
  const unknown=children.map(c=>({...c,total:null}));assert.equal(P.groupQuantity(saved,unknown).percent,null);
  const savedMeta=JSON.parse(saved.note),oldMeta=JSON.parse(original.note);
  for(const name of ['text','date','percent','books','unknown'])assert.deepEqual(savedMeta[name],oldMeta[name]);
  assert.equal(saved.futureField,'keep');
  const id=P.MATERIAL+'qing:qing-s1:resource-test:abc';
  const {futureField,...syncRecord}=saved;assert.deepEqual(Sync.normalize('english',wrap({[id]:syncRecord})).records[id],syncRecord);
  for(const invalid of [-1,21,1.5,NaN])assert.throws(()=>P.groupQuantityUpdate(invalid,children,saved));
});

test('父子计时取max且投入统计不重复，编辑撤回后自动重算并保留原始活动',()=>{
  const parent=P.MATERIAL+'qing:qing-s1:resource-test:abc',a=parent+':paaa',b=parent+':pbbb';
  const records={};
  const put=(id,unitKey,minutes,factor=1)=>records[key(id)]=P.sessionRecord(entry({unitKey,stageId:id==='other'?'qing-s2':'qing-s1',unitLabel:id,minutes,kind:factor===1?'reading':'audio',factor}));
  put('parent',parent,60);put('a',a,20);put('b',b,30);
  assert.equal(P.materialTime(records,parent,[a,b]).minutes,60);
  assert.equal(P.summarize(records).minutes,60);assert.equal(P.statistics(records).minutes,60);
  assert.equal(P.statistics(records,{metric:'actual'}).minutes,60);
  assert.equal(P.sessions(records).find(e=>e.unitKey===parent).minutes,60);
  put('b',b,50);
  assert.equal(P.materialTime(records,parent,[a,b]).minutes,70);assert.equal(P.statistics(records).minutes,70);
  records[key('b')].status='not-started';assert.equal(P.statistics(records).minutes,60);
  put('b',b,100,.5);assert.equal(P.statistics(records).minutes,70);assert.equal(P.statistics(records,{metric:'actual'}).minutes,120);
  const data=P.statistics(records),buckets=P.trendBuckets(data.entries,{anchor:'2026-10-29'});
  assert.equal(buckets.reduce((n,d)=>n+d.minutes,0),data.minutes);
  assert.equal(data.groups.reduce((n,g)=>n+g.minutes,0),data.minutes);
  put('other',P.MATERIAL+'qing:qing-s2:resource-test:abc',15);assert.equal(P.statistics(records).minutes,85);
  assert.equal(P.statistics(records,{stageId:'qing-s1'}).minutes,70);
  const restored=Sync.normalize('english',wrap(records)).records;assert.equal(P.statistics(restored).minutes,85);
  assert.equal(P.materialTime({},parent,[a,b]).minutes,0);
  assert.equal(P.materialParentKey(P.MATERIAL+'qing:qing-s1:resource-test:pabc'),'');
  assert.equal(P.materialParentKey(a),parent);
});

test('跨日期父子max先分配再筛选，趋势与日期总和一致，历史补录不进入实际口径',()=>{
  const parent=P.MATERIAL+'qing:qing-s1:resource-test:dated',child=parent+':pchild';
  const records={
    [key('dated-parent')]:P.sessionRecord(entry({unitKey:parent,minutes:60,date:'2026-10-28'})),
    [key('dated-child')]:P.sessionRecord(entry({unitKey:child,minutes:40,date:'2026-10-29'}))
  };
  const options={period:'custom',anchor:'2026-10-29',from:'2026-10-28',to:'2026-10-29'};
  assert.equal(P.statistics(records,options).minutes,60);
  assert.equal(P.statistics(records,{...options,to:'2026-10-28'}).minutes,20);
  assert.equal(P.statistics(records,{...options,from:'2026-10-29'}).minutes,40);
  assert.equal(P.trendBuckets(P.sessions(records),{anchor:'2026-10-29'}).reduce((n,b)=>n+b.minutes,0),60);
  assert.equal(P.recentDays(records,'2026-10-29').reduce((n,b)=>n+b.minutes,0),60);
  records[key('dated-parent')]=P.sessionRecord(entry({unitKey:parent,minutes:60,date:'2026-10-28',kind:'history'}));
  assert.equal(P.statistics(records,options).minutes,60);
  assert.equal(P.statistics(records,{...options,metric:'actual'}).minutes,40);
  assert.equal(P.statistics(records,{...options,metric:'actual'}).historyMinutes,20);
});

test('行内计时按当前记录阶段与使用方式折算，不按书名级别推系数',()=>{
  const accounting=raw.qing.timeAccounting;
  for(const [stageId,factor] of [['qing-s1',0],['qing-s2',0],['qing-s3',.5],['qing-s4',.8],['qing-s5',.8],['qing-s6',.8],['qing-s7',.8]]){
    const modes=P.timeOptions(stageId,'reader',accounting),records={};
    assert.deepEqual(modes.map(mode=>mode.id),['reading','audio','excluded']);
    const payload={stageId,unitKey:P.MATERIAL+'qing:'+stageId+':resource-test:abc',unitLabel:'Buddy Reader · A',minutes:20};
    records[key('inline')]=P.inlineSessionRecord({...payload,mode:'audio'},modes,'2026-10-29');
    assert.equal(P.summarize(records).minutes,20);assert.equal(P.summarize(records).effectiveMinutes,20*factor);
    records[key('inline')]=P.inlineSessionRecord({...payload,mode:'reading'},modes,'2026-10-29');
    assert.equal(P.summarize(records).effectiveMinutes,20);
    records[key('inline')]=P.inlineSessionRecord({...payload,mode:'excluded'},modes,'2026-10-29');
    assert.equal(P.summarize(records).minutes,20);assert.equal(P.summarize(records).effectiveMinutes,0);
    assert.deepEqual(Sync.normalize('english',wrap(records)).records,records);
    records[key('inline')].status='not-started';assert.equal(P.summarize(records).minutes,0);
    for(const minutes of [0,-1,1.5,1441,NaN])assert.throws(()=>P.inlineSessionRecord({...payload,mode:'reading',minutes},modes,'2026-10-29'));
    assert.throws(()=>P.inlineSessionRecord({...payload,mode:'animation'},modes,'2026-10-29'));
  }
  assert.deepEqual(P.timeOptions('qing-s1','animation',accounting).map(mode=>mode.id),['animation','audio','excluded']);
  assert.deepEqual(P.timeOptions('qing-s1','app',accounting).map(mode=>mode.id),['app','audio','excluded']);
  assert.ok(P.timeOptions('qing-s1','book',accounting,true).some(mode=>mode.id==='animation'));
  assert.ok(!P.timeOptions('unknown','reader',accounting).some(mode=>mode.id==='audio'));
  const note=raw.qing.relatedSources.find(s=>s.id===accounting.verifiedNote.sourceId);
  assert.equal(note.author,'庆爸育儿');assert.equal(note.previews.length,11);
  for(const rule of accounting.verifiedNote.stageAudio)assert.ok(note.previews.some(p=>p.page===rule.page));
});

test('图鉴派生状态覆盖零数量、计时、部分完成、全部完成与重复领域，不改路线记录',()=>{
  const zero={key:'xu:a',status:'not-started',completed:0,minutes:0};
  assert.deepEqual(P.resourceProgress([]),{status:'not-started',done:0,total:0});
  assert.equal(P.resourceProgress([{...zero,text:'备注',scope:'选了版本'}]).status,'not-started');
  assert.equal(P.resourceProgress([{...zero,minutes:12}]).status,'using');
  assert.equal(P.resourceProgress([{...zero,effectiveMinutes:12}]).status,'using');
  const rows=[{...zero,status:'done',completed:32},{...zero,key:'qing:b'}];
  const before=structuredClone(rows);
  assert.deepEqual(P.resourceProgress(rows),{status:'using',done:1,total:2});
  assert.deepEqual(rows,before);
  assert.deepEqual(P.resourceProgress([rows[0],rows[0]]),{status:'done',done:1,total:1});
  assert.equal(P.resourceProgress([zero]).status,'not-started');
});

test('图鉴独立数量按版本回填，未知总数不伪造百分比，备份同步保留资料',()=>{
  const a={id:'edition-a',label:'全套',total:4,edition:'A',unit:'本',default:true};
  const b={...a,id:'edition-b',total:6,edition:'B'};
  let record=P.libraryQuantityUpdate(undefined,a,2,'本');
  assert.equal(P.libraryQuantity(record,[a,b],'本').percent,50);
  assert.equal(P.libraryQuantity(record,[],'本',b).completed,0);
  record=P.libraryQuantityUpdate(record,b,6,'本');
  assert.equal(P.libraryQuantity(record,[],'本').status,'done');
  assert.equal(P.libraryQuantity(record,[],'本',a).completed,2);
  assert.deepEqual(P.libraryScopes(record,[a],'本').map(scope=>scope.id),['edition-a','edition-b']);
  record=P.libraryQuantityUpdate(record,null,8,'本');
  assert.equal(P.libraryQuantity(record,[],'本').percent,null);
  assert.equal(P.libraryQuantity(record,[],'本').status,'using');
  const snapshot=Sync.normalize('english',wrap({
    [P.LIBRARY+'r']:record,
    r:{status:'done',note:'原图鉴手记'},
    'library.custom.v1:one':{status:'using',note:JSON.stringify({version:1,kind:'custom-resource',title:'个人绘本',type:'book'})}
  }));
  assert.equal(P.libraryQuantity(snapshot.records[P.LIBRARY+'r'],[],'本',b).completed,6);
  assert.equal(snapshot.records.r.note,'原图鉴手记');
  assert.match(snapshot.records['library.custom.v1:one'].note,/个人绘本/);
  assert.throws(()=>P.libraryQuantityUpdate(record,a,5,'本'));
  assert.throws(()=>P.libraryQuantityUpdate(record,null,-1,'本'));
  assert.throws(()=>P.libraryQuantityUpdate(record,null,0.5,'本'));
  record=P.libraryQuantityUpdate(record,a,0,'本');
  assert.equal(P.libraryQuantity(record,[],'本').status,'not-started');
});

test('图鉴数量不复制公共长目录，范围身份无版次时也能稳定回填',()=>{
  const scope={id:'plain',label:'本人全套',total:3,default:true,sources:[{evidence:'来源'.repeat(5000)}],parts:[{label:'1',count:3}]};
  const record=P.libraryQuantityUpdate(null,scope,2,'本');
  assert.ok(record.note.length<1000);
  assert.equal(P.libraryQuantity(record,[],'本',scope).completed,2);
  assert.equal(P.libraryQuantity(record,[scope],'本').completed,2);
  assert.equal(P.libraryQuantity(record,[],'本').total,3);
});

test('庆爸原文选本仅补对应阶段分母，不推广到其他路线或同套系',()=>{
  for(const [id,level,stage,total] of [['resource-hlfpbh','4册点读','qing-s4',4],['resource-1xt8nl','庆爸精选35册','qing-s7',35],['resource-13uj3q','红蓝盒20册','qing-s7',20]]){
    const scopes=P.bookScopes(id,[level],volumes,stage);
    assert.equal(scopes.length,1);assert.equal(scopes[0].total,total);assert.equal(scopes[0].default,true);
    assert.ok(P.bookScopes(id,[level],volumes,'xu-current-500').every(scope=>!scope.default));
    assert.ok(P.bookScopes(id,[],volumes).every(scope=>!scope.default));
    const old=P.unitQuantityProgressUpdate(2,null,P.unitUpdate('using','原手记','2026-10-01'),'本');
    assert.equal(P.quantityRecord(old,scopes[0],'本').completed,2);
    assert.equal(P.quantityRecord(old,scopes[0],'本').percent,Math.round(2/total*100));
  }
  assert.ok(P.bookScopes('resource-13uj3q',[],volumes,'xu-panorama-reading-extensive').every(scope=>!scope.default));
});

test('GK采用本人确认70本，学乐仍不混用外研版与英文版分母',()=>{
  const gk=scopeFor('resource-9fvmjt',['GK']);
  assert.deepEqual(gk.map(s=>s.total),[70]);assert.equal(gk[0].default,true);
  const old=P.unitQuantityProgressUpdate(4,null,P.unitUpdate('using','保留手记','2026-09-15'),'本');
  assert.equal(P.quantityRecord(old,gk[0],'本').completed,4);
  const selected=P.unitBookProgressUpdate(4,gk[0],old);
  assert.equal(P.quantityRecord(selected,gk[0],'本').percent,6);
  for(const level of ['A','B','C','D']){
    const scopes=scopeFor('resource-1cn6i3m',[level]);assert.equal(scopes[0].total,25);assert.ok(scopes.every(s=>!s.default));
  }
  const e=scopeFor('resource-1cn6i3m',['E']);
  assert.equal(e[0].total,8);assert.ok(e.every(s=>!s.default));
  assert.equal(scopeFor('resource-1cn6i3m',['A–C'])[0].total,75);
});

test('为只记数量的条目补选分母保留数量，既有不同版次不串用',()=>{
  const scope=scopeFor('resource-9fvmjt',['GK'])[0];
  const previous=P.unitQuantityProgressUpdate(4,null,P.unitUpdate('using','保留手记','2026-09-15'),'本');
  const selected=P.unitBookScopeUpdate(scope,previous);
  assert.equal(P.quantityRecord(selected,scope,'本').completed,4);
  assert.equal(P.unitRecord({x:selected},'x').text,'保留手记');
  assert.equal(P.unitRecord({x:selected},'x').date,'2026-09-15');
  const snapshot=Sync.normalize('english',JSON.parse(JSON.stringify(wrap({x:selected}))));
  assert.equal(P.quantityRecord(snapshot.records.x,scope,'本').completed,4);
  const other={...scope,id:'different-edition',edition:'另一个版本',total:80};
  assert.equal(P.unitBooks(P.unitBookScopeUpdate(other,selected)).completed,null);
  assert.throws(()=>P.unitBookScopeUpdate({...scope,total:3},previous),/已记数量/);
});

test('补全套系展示名保留素材ID、原始引用及各级记录键',()=>{
  const named=M.normalize({...raw,xuCurrent:raw['xu-current'],xuSupplements:[raw['xu-panorama'],raw['xu-thousand']],routePlan:raw['route-plan'],resourceVolumes:volumes});
  const resource=named.resources.find(r=>r.id==='resource-1cn6i3m');
  assert.ok(resource.aliases.includes('学乐'));
  for(const stage of catalog.stages){
    const before=M.getStageMaterials(catalog,stage).find(i=>i.resource.id===resource.id);
    if(!before)continue;
    const nextStage=named.stages.find(s=>s.id===stage.id),after=M.getStageMaterials(named,nextStage).find(i=>i.resource.id===resource.id);
    assert.equal(P.unitKey(nextStage,after),P.unitKey(stage,before));
    assert.deepEqual(after.materials,before.materials);
    const parts=(st,item)=>P.expandBookUnits({key:P.unitKey(st,item),stageId:st.id,item,resourceId:resource.id,bookScopes:P.bookScopes(resource.id,M.getMaterialLevels(item).map(l=>l.label),volumes,st.id)},M.getMaterialLevels(item),volumes).map(p=>p.key);
    assert.deepEqual(parts(nextStage,after),parts(stage,before));
  }
});

test('Buddy单级分母补齐后保留原子键及父项数量，不拆分EF合包16本',()=>{
  const before={...volumes,series:volumes.series.filter(s=>s.resourceId!=='resource-zl69cf')};
  for(const [stageId,letters]of [['qing-s1',['A','B']],['qing-s2',['C','D']]]){
    const st=catalog.stages.find(s=>s.id===stageId),item=M.getStageMaterials(catalog,st).find(i=>i.resource.id==='resource-zl69cf');
    const unit={key:P.unitKey(st,item),stageId,item,resourceId:item.resource.id,bookScopes:[]};
    const oldParts=P.expandBookUnits(unit,M.getMaterialLevels(item),before);
    const parts=P.expandBookUnits(unit,M.getMaterialLevels(item),volumes);
    assert.deepEqual(parts.map(p=>p.key),oldParts.map(p=>p.key));
    assert.deepEqual(parts.map(p=>p.bookScopes[0].total),[20,20]);
    assert.deepEqual(parts.map(p=>p.partLevel.label),letters);
    const oldChildren=parts.map(p=>({key:p.key,scopeIdentity:'',unit:'本',total:null,completed:0}));
    const record=P.groupQuantityUpdate(9,oldChildren,P.unitUpdate('using','保留总项手记','2026-09-15'));
    const children=parts.map(p=>({key:p.key,scopeIdentity:p.bookScopes[0].id,unit:'本',total:20,completed:2,countOnlyCompatible:true}));
    assert.equal(P.groupQuantity(record,children).completed,9);
    assert.equal(P.groupQuantity(record,children).total,40);
    const saved=P.groupQuantityUpdate(0,children,record);
    assert.equal(P.groupQuantity(saved,children).completed,4); // 新范围的明确0优先于旧总项。
    assert.equal(P.groupQuantity(record,children.map(c=>({...c,countOnlyCompatible:false}))).completed,4);
    assert.match(saved.note,/保留总项手记/);
  }
  for(const level of ['E','F'])assert.deepEqual(P.bookScopes('resource-zl69cf',[level],volumes,'qing-s3'),[]);
  assert.equal(P.bookScopes('resource-zl69cf',['A'],volumes,'xu-current-500')[0].total,20);
  assert.equal(P.bookScopes('resource-zl69cf',['A'],volumes,'xu-current-500')[0].default,false);
});

test('大猫新增出版分辑只补资料，不将原级别进度改拆为分辑记录',()=>{
  for(const [stageId,suffixes]of [
    ['banana-4',['p170hsby','p15mjrv3','p15ck664']],
    ['xu-6',['p16giky0','p17ahe0x']]
  ]){
    const st=catalog.stages.find(s=>s.id===stageId),item=M.getStageMaterials(catalog,st).find(i=>i.resource.id==='resource-g7xvo5');
    const unit={key:P.unitKey(st,item),stageId,item,resourceId:item.resource.id};
    unit.bookScopes=P.bookScopes(unit.resourceId,item.materials.map(m=>M.formatLevel(m.level,item.resource)),volumes,stageId);
    const parts=P.expandBookUnits(unit,M.getMaterialLevels(item),volumes);
    assert.deepEqual(parts.map(p=>p.key),suffixes.map(s=>unit.key+':'+s));
    const saved=P.unitUpdate('using','原级别手记','2026-09-15');
    for(const part of parts)assert.equal(P.materialRecord({[part.key]:saved},part),saved);
  }
});

test('阶段完成独立保存及撤回，不改素材数量、书目、时间或其他路线和领域',()=>{
  const records={material:{status:'using',note:'保留12/48'},'reading.book.v1:one':{status:'done',note:'单册已读'},[P.SESSION+'sample']:P.sessionRecord(entry())};
  const before=structuredClone(records),routeKey='xu:listening',stageId='xu-listening-300';
  const changes=P.stageCompletionUpdate(records,routeKey,stageId,true),marked={...records,...changes};
  assert.deepEqual(Object.keys(changes),[P.stageKey(routeKey,stageId)]);
  assert.equal(P.stageDone(marked,routeKey,stageId),true);
  assert.equal(P.stageDone(marked,'xu:speaking',stageId),false);
  assert.equal(P.stageDone(marked,'qing:listening',stageId),false);
  assert.deepEqual(records,before);
  for(const [key,value] of Object.entries(before))assert.deepEqual(marked[key],value);
  const restored=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(marked)))).records;
  assert.equal(P.stageDone(restored,routeKey,stageId),true);
  const reverted={...restored,...P.stageCompletionUpdate(restored,routeKey,stageId,false)};
  assert.equal(P.stageDone(reverted,routeKey,stageId),false);
  for(const [key,value] of Object.entries(before))assert.deepEqual(reverted[key],value);
});

test('默认阶段跳过已完成节点，优先后续进行中，无进行中选下一未完成，全完成仍可回看',()=>{
  const stages=['300','500','800','1000','2000'].map(id=>({id})),key='xu:listening',started=stage=>['300','800'].includes(stage.id);
  assert.equal(P.defaultStage(stages,{},key,started).id,'300');
  let records=P.stageCompletionUpdate({},key,'300',true);
  assert.equal(P.defaultStage(stages,records,key,started).id,'800');
  assert.equal(P.defaultStage(stages,records,key).id,'500');
  records={...records,...P.stageCompletionUpdate(records,key,'800',true)};
  assert.equal(P.defaultStage(stages,records,key,started,'300').id,'1000');
  for(const stage of stages)Object.assign(records,P.stageCompletionUpdate(records,key,stage.id,true));
  assert.equal(P.defaultStage(stages,records,key,started).id,'2000');
  assert.equal(P.defaultStage([],records,key),undefined);
  assert.equal(P.defaultStage(stages,records,'xu:speaking',started).id,'300');
});

test('手动阶段完成与素材单册记录三方合并不冲突；独立完成不依赖素材完成',()=>{
  const base=wrap({}),stage=P.stageCompletionUpdate({},'qing:listening','qing-s1',true);
  const single={'reading.book.v1:sample':{status:'done',note:'单册'}};
  const merged=Sync.merge(base,wrap(stage),wrap(single));
  assert.equal(merged.conflicts.length,0);
  assert.equal(P.stageDone(merged.snapshot.records,'qing:listening','qing-s1'),true);
  assert.deepEqual(merged.snapshot.records['reading.book.v1:sample'],single['reading.book.v1:sample']);
  assert.equal(P.defaultStage([{id:'qing-s1'},{id:'qing-s2'}],merged.snapshot.records,'qing:listening').id,'qing-s2');
});
