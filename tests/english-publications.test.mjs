import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../english/model.js'),P=require('../english/practice.js'),B=require('../english/library-books.js');

test('公共级别册数供多条路线和图鉴复用，修改一处同时生效',()=>{
  const catalog={series:[{resourceId:'shared',edition:'版次一',unit:'本',sources:[],scopes:[{id:'levels',level:'1–3',default:true,parts:[{label:'1级',count:12},{label:'2级',count:18},{label:'3级',count:24}]}]}]};
  const resource={id:'shared',title:'套系',type:'reader',appearances:[{routeId:'xu',stageId:'xu-one',level:'1–3'},{routeId:'qing',stageId:'qing-one',level:'2'}]};
  const count=()=>B.seriesCount({books:[],topics:[]},resource,M,catalog,{route:'qing'}).total;
  assert.equal(P.bookScopes('shared',['2'],catalog,'xu-one')[0].total,18);
  assert.equal(P.bookScopes('shared',['2'],catalog,'qing-one')[0].total,18);
  assert.equal(count(),18);
  catalog.series[0].scopes[0].parts[1].count=20;
  assert.equal(P.bookScopes('shared',['2'],catalog,'xu-one')[0].total,20);
  assert.equal(count(),20);
  assert.equal(P.bookScopes('shared',['1–3'],catalog)[0].total,56);
  assert.deepEqual(P.bookScopes('shared',['2（虚构部分）'],catalog),[]);
});

test('公共出版范围在所有路线可查，默认选版仅由无数量的引用关联决定',()=>{
  const catalog={series:[{resourceId:'one',edition:'明确选本',scopes:[{id:'A',level:'A',referenceOnly:true,parts:[{label:'A',count:20}]}]}],references:[{resourceId:'one',stageId:'qing-one',scopeId:'A'}]};
  const selected=P.bookScopes('one',['A'],catalog,'qing-one')[0],candidate=P.bookScopes('one',['A'],catalog,'xu-one')[0];
  assert.equal(selected.total,candidate.total);
  assert.equal(selected.default,true);
  assert.equal(candidate.default,false);
  assert.equal(M.publicationScopes(catalog,'one')[0].total,20);
  assert.deepEqual(Object.keys(catalog.references[0]).sort(),['resourceId','scopeId','stageId']);
});

test('同套系的历史素材ID可引用同一出版目录而不重建个人记录键',()=>{
  const catalog={series:[{resourceId:'primary',edition:'原版',sources:[],scopes:[{id:'one',level:'1',parts:[{label:'1',count:6}],default:true}]},{resourceId:'legacy',catalogResourceId:'primary',scopes:[]}]};
  assert.equal(P.bookScopes('legacy',['1'],catalog)[0].total,6);
  assert.equal(M.publicationEntry(catalog,'primary').scopes,M.publicationEntry(catalog,'legacy').scopes);
  assert.equal(catalog.series[1].resourceId,'legacy');
});

test('全站目录的数量不含阶段私有字段，阶段引用只指向真实公共范围',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../english/data/resource-volumes.json',import.meta.url)));
  const ids=new Set(catalog.series.map(s=>s.resourceId));
  for(const entry of catalog.series){
    if(entry.catalogResourceId)assert.ok(ids.has(entry.catalogResourceId));
    for(const scope of entry.scopes){
      assert.equal(scope.stageIds,undefined,scope.id);
      assert.ok(scope.parts.every(part=>Number.isInteger(part.count)&&part.count>0),scope.id);
    }
  }
  for(const ref of catalog.references){
    assert.ok(M.publicationEntry(catalog,ref.resourceId).scopes.some(s=>s.id===ref.scopeId),ref.scopeId);
    assert.equal(ref.count,undefined);
    assert.equal(ref.parts,undefined);
  }
});

test('牛津单级和组合范围由公共目录提供，组合包与已包含小包不重复计数',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../english/data/resource-volumes.json',import.meta.url)));
  const scopes=level=>P.bookScopes('resource-1n3ix1n',[level],catalog);
  assert.deepEqual(scopes('1').map(s=>s.total),[84,96]);
  assert.deepEqual(scopes('2').map(s=>s.total),[48,54]);
  assert.deepEqual(scopes('3').map(s=>s.total),[42]);
  assert.equal(scopes('3–5')[0].total,120);
  const count=id=>B.seriesCount({books:[],topics:[]},{id,title:'套系',type:'reader',appearances:[]},M,catalog).total;
  assert.equal(count('resource-10bn1i2'),108);
  assert.equal(count('resource-1mi9g2h'),126);
  assert.equal(count('resource-1y3ytv6'),49);
  assert.equal(P.bookScopes('resource-149sp5j',['1'],catalog)[0].total,33);
  assert.equal(P.bookScopes('resource-5434e',['2'],catalog)[0].total,5);
  assert.equal(P.bookScopes('resource-h4sa2o',['E&F'],catalog)[0].total,14);
  assert.deepEqual(P.bookScopes('resource-h4sa2o',['E'],catalog),[]); // 联合级不可平均拆分。
  assert.equal(count('resource-123ikqd'),10); // 10本Gyuri Asks活动书不混入故事读物。
  assert.equal(count('resource-gfdta7'),220); // 词卡使用张，不写成220本。
  const gk=P.bookScopes('resource-9fvmjt',['GK'],catalog)[0];
  assert.equal(gk.id,'heinemann-gk-70');
  assert.deepEqual(gk.parts,[{label:'GK',count:70}]); // 补分级资料不能拆散已有GK个人记录。
});
