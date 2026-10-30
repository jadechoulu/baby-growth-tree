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
  for(const st of catalog.stages.filter(s=>['qing','xu'].includes(s.routeId)))for(const item of M.getStageMaterials(catalog,st))keys.push(P.unitKey(st,item));
  assert.equal(new Set(keys).size,keys.length);
  assert.ok(keys.every(k=>k.length<=160));
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
