import test from 'node:test';
import assert from 'node:assert/strict';
import { materials, goals, grades, subjects, phases } from '../curriculum/plan.mjs';
import { materialKey, goalKey, filterMaterials, summary, statusOf, patchDocument, mergeBackup, validateBackup } from '../curriculum/model.mjs';
import { milestones, abilityMetrics } from '../curriculum/plan.mjs';
import { chartPoints } from '../curriculum/charts.mjs';
const empty=()=>({kind:'curriculum',version:1,records:{},custom:[]});
test('目标曲线保留起始基础与三个年度节点，不将年度投入累计或补造起始0',()=>{
 const literacy=milestones.find(m=>m.id==='literacy'),points=chartPoints(literacy);
 assert.deepEqual(points.map(p=>[p.grade,p.value]),[[null,20],['junior',180],['middle',490],['senior',1000]]);
 assert.equal(points.at(-1).y,54);
 assert.equal(points[1].y,154-180/1000*100);
 const hours=chartPoints(milestones.find(m=>m.id==='listening-hours'));
 assert.deepEqual(hours.map(p=>p.value),[300,360,480]);
 assert.deepEqual(hours.map(p=>p.grade),Object.keys(grades));
 assert.equal(hours.length,3);
 assert.deepEqual(chartPoints(milestones.find(m=>m.subject==='math')).map(p=>p.value),[10,20,100]);
 for(const m of milestones)for(const grade of Object.keys(grades))assert.ok(goals[grade][m.subject].some(g=>g.id===m.goalId));
});
test('同一图表的能力指标覆盖原三年要求，节点仅表示班级顺序，不生成能力分数',()=>{
 for(const metric of abilityMetrics){
  const points=chartPoints(metric);
  assert.deepEqual(points.map(p=>p.grade),Object.keys(grades));
  assert.deepEqual(points.map(p=>p.value),Object.keys(grades).map(grade=>goals[grade][metric.subject].find(g=>g.id===metric.goalId).summary));
  assert.equal(new Set(points.map(p=>p.y)).size,1);
  assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&typeof p.value==='string'));
 }
 for(const subject of Object.keys(subjects)){
  const covered=new Set([...milestones,...abilityMetrics].filter(m=>m.subject===subject).map(m=>m.goalId));
  for(const grade of Object.keys(grades))for(const goal of goals[grade][subject])assert.ok(covered.has(goal.id));
 }
});
test('素材状态按班级隔离，目标确认不传播到素材，筛选不改变汇总分母',()=>{
 const initial=empty(),key=materialKey('raz','junior');
 const current=patchDocument(initial,{records:{[key]:{status:'using',note:'继续听读'},[goalKey('listening','junior','english')]:{status:'done'}}});
 assert.equal(statusOf(current.records,materialKey('raz','middle')),'planned');
 assert.equal(statusOf(current.records,key),'using');
 const all=filterMaterials(materials,current.records,{grade:'junior',subject:'english'});
 const active=filterMaterials(materials,current.records,{grade:'junior',subject:'english',status:'using',search:'RAZ'});
 assert.equal(active.length,1);assert.equal(active[0].id,'raz');
 assert.deepEqual(summary(all,current.records),{total:all.length,using:1,done:0});
 assert.equal(filterMaterials(materials,current.records,{grade:'middle',phase:'autumn'}).length,0);
 const changed=patchDocument(current,{records:{[key]:{status:'done'}}});
 assert.equal(changed.records[key].note,'继续听读');
 assert.equal(summary(all,changed.records).done,1);
});
test('过期表单不能覆盖其他页面同条记录；不同记录可合并，保留未知字段',()=>{
 const base=empty(),a=materialKey('raz','junior'),b=materialKey('oxford','junior');
 const latest=patchDocument(base,{records:{[a]:{status:'using',extra:7}}});
 assert.throws(()=>patchDocument(latest,{records:{[a]:{status:'done'}}},base),/其他页面/);
 const merged=patchDocument(latest,{records:{[b]:{status:'done'}}},base);
 assert.equal(merged.records[a].extra,7);assert.equal(merged.records[b].status,'done');
 const original={...base,custom:[{id:'custom-one',title:'原名',extra:9}]};
 const updated=patchDocument(original,{custom:[{id:'custom-one',title:'新名'}]},original);
 assert.equal(updated.custom[0].extra,9);
 assert.throws(()=>patchDocument(updated,{custom:[{id:'custom-one',title:'旧页面'}]},original),/其他页面/);
});
test('全科导入只补缺失项，旧备份不覆盖新状态，拒绝其他分类和损坏字段',()=>{
 const current=empty(),incoming=empty();
 current.records[materialKey('raz','junior')]={status:'done'};
 incoming.records[materialKey('raz','junior')]={status:'planned'};
 incoming.records[materialKey('oxford','junior')]={status:'using'};
 incoming.custom=[{id:'custom-test',title:'候选书',subject:'chinese',type:'picture',refs:[{grade:'junior',level:'',phases:[]}]}];
 const result=mergeBackup(current,incoming);
 assert.equal(result.conflicts,1);assert.equal(result.value.records[materialKey('raz','junior')].status,'done');
 assert.equal(result.value.records[materialKey('oxford','junior')].status,'using');
 assert.equal(mergeBackup(result.value,incoming).value.custom.length,1);
 assert.throws(()=>validateBackup({version:1,records:{},profile:{}}),/全科启蒙备份/);
 for(const invalid of [{...incoming,custom:[{title:'坏数据'}]},{...incoming,records:{'material:bad:junior':{status:'invalid'}}},{...incoming,custom:[{...incoming.custom[0],refs:[{grade:'unknown'}]}]}])assert.throws(()=>validateBackup(invalid));
});
test('完整覆盖三班三科和四阶段，素材身份不重复，阶段引用有效',()=>{
 assert.equal(new Set(materials.map(x=>x.id)).size,materials.length);
 assert.equal(phases.reduce((sum,p)=>sum+p.hours,0),300);
 for(const grade of Object.keys(grades))for(const subject of Object.keys(subjects)){
  assert.ok(goals[grade][subject].length>0);
  assert.ok(filterMaterials(materials,{}, {grade,subject}).length>0);
 }
 for(const m of materials){
  assert.equal(new Set(m.refs.map(r=>r.grade)).size,m.refs.length);
  for(const ref of m.refs){assert.ok(grades[ref.grade]);for(const id of ref.phases)assert.ok(phases.some(p=>p.id===id));}
 }
});

test('逐册书目按当前班级和阶段取范围，级别与版本保持独立',async()=>{
 const {groupsFor,ownBookUpdate,ownBookState,bookKey}=await import('../curriculum/catalog.mjs');
 const rz=filterMaterials(materials,{}, {grade:'junior',search:'RAZ'})[0];
 const gs=['C','D','E','F','G'].map(level=>({id:level,grades:['junior','middle','senior'],levels:[level],books:[]}));
 assert.deepEqual(groupsFor(gs,rz).map(g=>g.id),['D','E','F']);
 assert.deepEqual(groupsFor(gs,rz,'autumn').map(g=>g.id),['D']);
 assert.deepEqual(groupsFor(gs,rz,'spring').map(g=>g.id),['E','F']);
 const ox=filterMaterials(materials,{}, {grade:'middle',search:'牛津树'})[0];
 assert.deepEqual(groupsFor([{id:'same-edition',grades:['middle'],books:['5','6','7','8','9'].map(level=>({id:level,level}))}],ox)[0].books.map(b=>b.level),['6','7','8']);
 const book={id:'xhs-verified-one'},document=patchDocument(empty(),{records:ownBookUpdate(book,true)});
 assert.equal(ownBookState(document.records,book),true);
 assert.equal(statusOf(document.records,materialKey('little-sheep','junior')),'planned');
 const backup=mergeBackup(empty(),document).value;
 assert.equal(backup.records[bookKey(book)].status,'done');
 assert.equal(ownBookState(patchDocument(backup,{records:ownBookUpdate(book,false)}).records,book),false);
});

test('生成目录复用英语稳定ID与等价关系，中文目录均来自核实的具名套装',async()=>{
 const fs=await import('node:fs/promises'),{englishResources}=await import('../curriculum/catalog.mjs');
 const publicBooks=JSON.parse(await fs.readFile(new URL('../english/data/resource-books.json',import.meta.url),'utf8'));
 for(const [id,resourceId] of Object.entries(englishResources)){
  const generated=JSON.parse(await fs.readFile(new URL('../curriculum/catalogs/'+id+'.json',import.meta.url),'utf8'));
  for(const group of generated.groups)for(const book of group.books){
   assert.ok(publicBooks.books.some(b=>b.id===book.id&&b.resourceId===resourceId));
   assert.ok(group.english);assert.ok(book.title);
  }
 }
 const cn=JSON.parse(await fs.readFile(new URL('../curriculum/data/catalog-sources.json',import.meta.url),'utf8'));
 for(const group of cn.groups){
  assert.equal(new Set(group.books.map(b=>b.id)).size,group.books.length);
  assert.ok(!group.sourceUrl||group.sourceUrl.startsWith('https://www.xiaohuasheng.cn/')||group.sourceUrl.startsWith('https://www.jd.com/')||group.sourceUrl.startsWith('https://m.douban.com/'));
  for(const book of group.books)assert.deepEqual(Object.keys(book).filter(k=>/readCount|myStar|user|Child|Record/.test(k)),[]);
 }
});

test('英语单册从全科操作沿原存储保存，保留原档案和其他事实，外部已读不被撤回',async()=>{
 const fs=await import('node:fs/promises'),vm=await import('node:vm');
 const values=new Map(),notified=[];
 const context=vm.createContext({structuredClone,localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}});
 context.window=context;
 for(const file of ['shared/sync-model.js','shared/sync-adapters.js','english/book-progress.js'])vm.runInContext(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'),context);
 context.XiaoyaSync={createClient:()=>({changed:async area=>notified.push(area),subscribe:()=>()=>{}})};
 const previousWindow=globalThis.window;globalThis.window=context;
 try{
  const {createEnglishBooks}=await import('../curriculum/english-records.mjs'),client=createEnglishBooks({profileClient:{}});
  const book={id:'book-test'};
  await client.set(book,true,{});
  assert.equal(JSON.parse(values.get('little-leaf-english-v1')).records['reading.book.v1:book-test'].status,'done');
  const value=JSON.parse(values.get('little-leaf-english-v1'));
  value.profile={vocabulary:800,mode:'audio'};value.favorites=['favorite'];value.records.other={status:'using',note:'保留'};
  value.records['reading.external.v1:source']={status:'done',note:JSON.stringify({version:1,sourceKind:'xiaohuasheng_bookcase_read',publicBookId:book.id,readCount:3})};
  values.set('little-leaf-english-v1',JSON.stringify(value));
  const result=await client.set(book,false,{});
  assert.equal(result.profile.vocabulary,800);assert.equal(result.records.other.note,'保留');
  assert.equal(client.state(result,book,{}).done,true);assert.equal(client.state(result,book,{}).readCount,3);
  assert.ok(notified.every(area=>area==='english'));
 }finally{globalThis.window=previousWindow;}
});
