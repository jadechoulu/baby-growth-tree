import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),L=require('../english/library-custom.js'),Sync=require('../shared/sync-model.js');
const stages=[{id:'xu-current-300',routeId:'xu'},{id:'qing-s1',routeId:'qing'}];
const wrap=records=>({version:1,profile:{vocabulary:0,mode:'audio'},favorites:[],records});
test('自建素材独立保存并通过现有英语备份同步往返，不变成原路线引用',()=>{
  const changes=L.save({},'book-1',{title:'The Very Hungry Caterpillar',type:'book',topics:['食物','动物','食物'],stageRefs:[{routeId:stages[0].routeId,stageId:stages[0].id}],text:'亲子共读',status:'using'},stages);
  const records=Sync.normalize('english',JSON.parse(JSON.stringify(wrap(changes)))).records;
  assert.deepEqual(records,changes);
  const [r]=L.resources(records);assert.equal(r.id,L.key('book-1'));assert.equal(r.title,'The Very Hungry Caterpillar');assert.deepEqual(r.topics,['食物','动物']);assert.deepEqual(r.stageRefs,[{routeId:'xu',stageId:'xu-current-300'}]);assert.deepEqual(r.appearances,[]);assert.equal(r.custom,true);
  assert.ok(r.id.length<=160);
});
test('未开始也是有效个人素材，编辑保留状态、未知字段和稳定键，删除以墓碑保留数据',()=>{
  const records=L.save({},'book-2',{title:'My Book',topics:['日常生活']});
  assert.equal(L.resources(records).length,1);const recordKey=L.key('book-2'),note=JSON.parse(records[recordKey].note);note.future=7;records[recordKey].note=JSON.stringify(note);records[recordKey].status='done';
  Object.assign(records,L.save(records,'book-2',{title:'My Revised Book',topics:['自然'],stageRefs:[],text:'已读'}));
  assert.equal(records[recordKey].status,'done');assert.equal(JSON.parse(records[recordKey].note).future,7);assert.equal(Object.keys(records).length,1);
  Object.assign(records,L.remove(records,recordKey));assert.equal(L.resources(records).length,0);assert.equal(JSON.parse(records[recordKey].note).title,'My Revised Book');assert.equal(records[recordKey].status,'done');
  assert.deepEqual(Sync.normalize('english',wrap(records)).records,records);
});
test('无效阶段、超长内容与无效标识不写入，用户内容保持纯文本',()=>{
  const records={};assert.throws(()=>L.save(records,'../bad',{title:'x'}));assert.throws(()=>L.save(records,'ok',{title:'x',stageRefs:[{routeId:'qing',stageId:'xu-current-300'}]},stages),/阶段参考/);assert.throws(()=>L.save(records,'ok',{title:'x',text:'x'.repeat(4000)}),/过长/);assert.throws(()=>L.save(records,'ok',{title:' '}));assert.deepEqual(records,{});
  const title='<img src=x onerror=alert(1)>',r=L.resources(L.save({},'text',{title}))[0];assert.equal(r.title,title);
});
