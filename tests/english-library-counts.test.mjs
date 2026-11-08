import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),B=require('../english/library-books.js'),M=require('../english/model.js');
const read=id=>JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)));
const data=read('resource-books'),volumes=read('resource-volumes');
const catalog=M.normalize({banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan'),resourceVolumes:volumes});
const count=(id,filters={})=>B.seriesCount(data,catalog.resources.find(r=>r.id===id),M,volumes,filters);

test('套系数量按版本与分项去重，不能用部分逐册目录代替总范围',()=>{
  const cat=count('resource-g7xvo5');
  assert.equal(cat.total,409);
  assert.equal(cat.allBooks.length,254); // 新增5–9级有据的分辑目录；不改变出版总量。
  assert.equal(cat.parts.length,36);
  assert.equal(cat.partial,true);
  assert.ok(!cat.unknown.includes('7-9'));
  const bands=B.levelGroups(cat.parts).find(e=>e.edition==='Collins英版 Readers · 2019年44本套装资料');
  assert.equal(bands.groups.find(g=>g.label==='Pink 1A＋1B').count,44);
  assert.equal(bands.groups.find(g=>g.label==='Red 2A＋2B').count,44);
  const pearson=count('resource-1nuqi5t');
  assert.equal(pearson.total,192);
  assert.equal(pearson.parts.length,5); // 同一辑的单辑/组合/级别入口不重复相加。
});

test('同一路线与阶段限定先取交集，再按所用级别范围累加',()=>{
  assert.equal(count('resource-1nuqi5t',{route:'qing',stageIds:['qing-s1']}).total,64);
  assert.equal(count('resource-1nuqi5t',{route:'qing',stageIds:['qing-s2']}).total,32);
  assert.equal(count('resource-1nuqi5t',{route:'qing'}).total,96);
  assert.equal(count('resource-1nuqi5t',{route:'xu',stageIds:['qing-s1']}).total,0);
  const bigcat=count('resource-g7xvo5',{route:'xu',stageIds:['xu-current-500']});
  assert.equal(bigcat.total,86);
  assert.equal(bigcat.partial,false);
  assert.equal(bigcat.books.length,86); // 外研1–3级已核目录，参考版Pink仍不混入。
  const pre=count('resource-g7xvo5',{route:'xu',stageIds:['xu-current-300']});
  assert.equal(pre.total,18);
  assert.equal(pre.parts.length,2);
});

test('虚构子集未知时不借整级数量，无来源的范围不回退成其他版目录44本',()=>{
  const fiction=count('resource-g7xvo5',{route:'qing',stageIds:['qing-s1']});
  assert.equal(fiction.total,0);
  assert.deepEqual(fiction.unknown,['1（虚构部分）']);
  assert.equal(fiction.books.length,0);
  const partial=count('resource-1mx6gx6',{route:'qing'});
  assert.equal(partial.total,187);
  assert.equal(partial.partial,true);
  assert.ok(partial.unknown.includes('6'));
});

test('无出版数量表时按当前收录版本目录计数，筛选后保留逐册版本边界',()=>{
  const frog=count('resource-var8qr',{route:'qing',stageIds:['qing-s7']});
  assert.equal(frog.total,4);
  assert.equal(frog.books.length,4);
  assert.equal(frog.basis,'known-range'); // 经典四册已提升为公共出版范围。
  const piggie=count('resource-e87t8v');
  assert.equal(piggie.total,25);
  const selected=count('resource-e87t8v',{route:'qing',stageIds:['qing-s3']});
  assert.equal(selected.total,0);
  assert.equal(selected.partial,true); // “简单部分”没有明确逐册分配，不编造25本。
  assert.equal(selected.allBooks.length,25);
});

test('筛选时读取进度页实际选版，切换Pink与外研预备范围即刻更新且不改记录',()=>{
  const id='resource-g7xvo5',entry=volumes.series.find(s=>s.resourceId===id);
  const selected=scopeId=>{
    const scope=entry.scopes.find(s=>s.id===scopeId);
    return [{routeId:'xu',stageId:'xu-current-300',parts:scope.parts.map(p=>({...p,edition:scope.edition||entry.edition,unit:'本'}))}];
  };
  const before=JSON.stringify({data,volumes,catalog});
  const pink=count(id,{route:'xu',stageIds:['xu-current-300'],selections:selected('big-cat-pink-44')});
  assert.equal(pink.total,44);
  assert.equal(pink.books.length,44);
  assert.equal(pink.basis,'selection');
  assert.equal(pink.partial,false);
  const old=count(id,{route:'xu',stageIds:['xu-current-300'],selections:selected('big-cat-pre-2023')});
  assert.equal(old.total,18);
  assert.equal(old.books.length,18);
  assert.equal(count(id,{selections:selected('big-cat-pink-44')}).total,409); // 未筛选仍汇总各具名出版快照，不把版本合计称作故事去重总量。
  assert.equal(JSON.stringify({data,volumes,catalog}),before);
});

test('新版培生个人选版只关联显式目录，不把旧三辑一起计入当前阶段',()=>{
  const entry=volumes.series.find(s=>s.resourceId==='resource-1nuqi5t'),scope=entry.scopes.find(s=>s.id==='pearson-basic-vocab-all');
  const result=count(entry.resourceId,{route:'xu',stageIds:['xu-current-300'],selections:[{routeId:'xu',stageId:'xu-current-300',parts:scope.parts.map(p=>({...p,edition:scope.edition,unit:'本'}))}]});
  assert.equal(result.total,96);
  assert.equal(result.books.length,96);
  assert.ok(result.books.every(b=>b.editionMatch==='unleveled-only'));
});

test('原文封闭数量直接使用其单位，重复阶段引用只计一次',()=>{
  const resource={id:'test',title:'测试素材',type:'book',appearances:[{routeId:'qing',stageId:'one',sourceId:'qing',level:'24本'},{routeId:'qing',stageId:'two',sourceId:'qing',level:'24本'}]};
  const result=B.seriesCount({books:[],topics:[]},resource,M,{series:[]},{route:'qing'});
  assert.equal(result.total,24);
  assert.equal(result.partial,false);
  assert.equal(result.parts.length,1);
});

test('出版候选不冒充路线分母，阶段限定册数不流入其他路线',()=>{
  assert.equal(count('resource-1cn6i3m',{route:'xu',stageIds:['xu-current-500']}).total,0);
  assert.equal(count('resource-9fvmjt',{route:'xu',stageIds:['xu-current-500']}).total,70);
  assert.equal(count('resource-13uj3q',{route:'xu'}).total,0);
  assert.equal(count('resource-13uj3q',{route:'qing',stageIds:['qing-s7']}).total,20);
  assert.equal(count('resource-hlfpbh',{route:'qing',stageIds:['qing-s4']}).total,4);
  assert.equal(count('resource-1xt8nl',{route:'qing',stageIds:['qing-s7']}).total,35);
  assert.equal(count('resource-zl69cf',{route:'qing',stageIds:['qing-s1']}).total,40);
  assert.equal(count('resource-zl69cf',{route:'qing',stageIds:['qing-s2']}).total,40);
  assert.equal(count('resource-zl69cf',{route:'qing',stageIds:['qing-s3']}).total,0);
});

test('新核对范围排除指导册，背面级别不重复累加，部分级别不借全套数量',()=>{
  assert.equal(count('resource-mavhf5').total,56);
  assert.equal(count('resource-mavhf5',{route:'qing',stageIds:['qing-s5']}).total,24);
  assert.equal(count('resource-mavhf5',{route:'qing',stageIds:['qing-s6']}).total,8);
  assert.equal(count('resource-mavhf5',{route:'qing',stageIds:['qing-s7']}).total,24);
  assert.equal(count('resource-1nnr59r').total,52);
  assert.equal(count('resource-1qj90tg').total,12); // 不将12练习册与5游戏书算入故事进度。
  assert.equal(count('resource-jwq9vf',{route:'xu',stageIds:['xu-3']}).total,24);
  const partial=count('resource-jwq9vf',{route:'xu',stageIds:['xu-5']});
  assert.equal(partial.total,48);
  assert.equal(partial.partial,false);
  assert.deepEqual(partial.unknown,[]);
});

test('已核出版候选可供全量浏览，路线版本未定时不自动当作阶段分母',()=>{
  assert.equal(count('resource-fkl6xf').total,132); // 英文A–D各25、E&F16、G&H16；联合级不均分。
  assert.equal(count('resource-1cn6i3m').total,414); // 英文132与外研社2025A–J282为不同出版范围。
  for(const id of ['resource-fkl6xf','resource-nqvpg2','resource-19jrpig']){
    const resource=catalog.resources.find(r=>r.id===id);
    for(const a of resource.appearances){
      assert.equal(count(id,{route:a.routeId,stageIds:[a.stageId]}).total,0);
    }
  }
});


test('级别册数按具名组合汇总，重复分项去重且不同版本和单位独立',()=>{
  const parts=[
    {edition:'英文Readers套装',label:'Pink 1A',count:22,unit:'本',group:'Pink 1A＋1B'},
    {edition:'英文Readers套装',label:'Pink 1B',count:22,unit:'本',group:'Pink 1A＋1B'},
    {edition:'英文Readers套装',label:'Pink 1A',count:22,unit:'本',group:'Pink 1A＋1B'},
    {edition:'英文Readers套装',label:'Red 2A',count:22,unit:'本',group:'Red 2A＋2B'},
    {edition:'英文Readers套装',label:'Red 2B',count:22,unit:'本',group:'Red 2A＋2B'},
    {edition:'引进版',label:'预备级1',count:9,unit:'本'},
    {edition:'引进版',label:'预备级2',count:9,unit:'本'},
    {edition:'英文Readers套装',label:'随附词卡',count:10,unit:'张'}
  ];
  const snapshot=JSON.stringify(parts),groups=B.levelGroups(parts);
  assert.equal(groups.length,3);
  assert.equal(groups[0].total,88);
  assert.deepEqual(groups[0].groups.map(g=>[g.label,g.count]),[['Pink 1A＋1B',44],['Red 2A＋2B',44]]);
  assert.equal(groups[0].groups[0].parts.length,2);
  assert.equal(groups[1].total,18);
  assert.equal(groups[2].total,10);
  assert.equal(JSON.stringify(parts),snapshot);
});


test('补齐其它套系级别，数量使用具名出版范围且不均摊组合包',()=>{
  assert.equal(count('resource-nqvpg2').total,76); // A–D各16、E&F12。
  assert.equal(count('resource-zl69cf').total,96); // A–D各20、E&F16。
  assert.equal(count('resource-1mx6gx6').total,241); // 1–5合187、6–8各18。
  assert.equal(count('resource-1n3ix1n').total,564); // 6–9基础64已含在DD组合88内。
  const oxford=count('resource-1n3ix1n');
  assert.ok(!oxford.parts.some(p=>p.edition==='国内学校版6–9基础64册选本'));
  const school=oxford.parts.filter(p=>p.edition==='国内红标/无标选本');
  assert.deepEqual(school.filter(p=>/^([6-9])级（含DD）$/.test(p.label)).map(p=>p.count),[27,25,18,18]);
});
