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
  assert.equal(cat.total,194);
  assert.equal(cat.allBooks.length,44);
  assert.equal(cat.parts.length,9);
  assert.equal(cat.partial,true);
  assert.ok(cat.unknown.includes('7-9'));
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
  assert.equal(bigcat.books.length,0); // 参考版Pink目录不冒充外研1–3级目录。
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
  assert.equal(frog.basis,'directory');
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
  assert.equal(old.books.length,0);
  assert.equal(count(id,{selections:selected('big-cat-pink-44')}).total,194); // 未筛选仍汇总全部版本。
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
  assert.equal(count('resource-jwq9vf',{route:'xu',stageIds:['xu-3']}).total,0);
  const partial=count('resource-jwq9vf',{route:'xu',stageIds:['xu-5']});
  assert.equal(partial.total,24);
  assert.equal(partial.partial,true);
  assert.deepEqual(partial.unknown,['3-4']);
});

test('已核出版候选可供全量浏览，路线版本未定时不自动当作阶段分母',()=>{
  assert.equal(count('resource-fkl6xf').total,41); // 英文B25、E&F合16，不拆成每级16。
  assert.equal(count('resource-1cn6i3m').total,100);
  for(const id of ['resource-fkl6xf','resource-nqvpg2','resource-19jrpig']){
    const resource=catalog.resources.find(r=>r.id===id);
    for(const a of resource.appearances){
      assert.equal(count(id,{route:a.routeId,stageIds:[a.stageId]}).total,0);
    }
  }
});
