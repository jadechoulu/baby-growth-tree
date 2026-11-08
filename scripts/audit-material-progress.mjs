// 全量公共素材审计：仅读取源码，不读取或修改私人记录。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../english/model.js'),P=require('../english/practice.js'),BP=require('../english/book-progress.js');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=id=>JSON.parse(fs.readFileSync(path.join(root,'english/data',id+'.json'),'utf8'));
const volumes=read('resource-volumes'),directory=read('resource-books'),reading=read('reading-plans');
const raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan'),resourceVolumes:volumes,liaoReading:read('liao-reading')};
const catalog=M.normalize(raw),references=[],errors=[];
const executionStages=new Set(catalog.routes.flatMap(route=>raw.routePlan.domains.flatMap(domain=>M.getRoutePlan(catalog,route.id,domain.id)?.stages.map(stage=>stage.id)||[])));
for(const stage of catalog.stages)for(const item of M.getStageMaterials(catalog,stage)){
  const unit={item,key:P.unitKey(stage,item),resourceId:item.resource.id,stageId:stage.id,recordStageId:item.material.recordStageId||stage.id,label:item.resource.title};
  unit.bookScopes=P.bookScopes(unit.resourceId,item.materials.map(m=>M.formatLevel(m.level,item.resource)),volumes,unit.recordStageId);
  if(!unit.bookScopes.length)unit.bookScopes=P.bookScopes(unit.resourceId,[item.levelSegments.map(x=>x.text).join('')],volumes,unit.recordStageId);
  for(const part of P.expandBookUnits(unit,M.getMaterialLevels(item),volumes)){
    const scope=part.partScope||P.bookScope(undefined,part.bookScopes),plan=BP.planForResource(reading,part.resourceId,directory,volumes,scope),group=plan&&BP.scopeGroup(plan,scope);
    const perBook=!!plan&&group!==null,total=scope?.total??null;
    references.push({route:stage.routeId,stage:stage.id,stageTitle:stage.title,execution:executionStages.has(stage.id),type:item.resource.type,title:item.resource.title,resourceId:part.resourceId,unitKey:part.key,
      level:part.partScope?.label||part.partLevel?.label||item.materials.map(m=>m.level).join('、'),scopeId:scope?.id||null,edition:scope?.edition||'',total,unit:scope?.unit||P.quantityUnit(item.resource.type),
      status:perBook?'逐本进度':total?'数量进度':part.bookScopes.length?'待选目录':'范围待核',candidates:part.bookScopes.map(s=>({id:s.id,edition:s.edition,total:s.total})),
      directoryBooks:perBook?BP.books(plan,group).length:0});
  }
}
const resources=catalog.resources.map(resource=>{
  const scopes=M.publicationScopes(volumes,resource.id),plans=BP.catalogPlans(directory,volumes,resource.id),authored=reading.plans.find(p=>p.resourceId===resource.id||p.resourceIds?.includes(resource.id));
  for(const scope of scopes){
    const matched=scope.parts?.length&&scope.parts.every(part=>part.directoryMatch);
    if(!matched)continue;
    const ids=scope.parts.flatMap(part=>directory.books.filter(book=>(M.publicationEntry(volumes,book.resourceId)?.catalogResourceId||book.resourceId)===resource.id&&['edition','level'].every(key=>part.directoryMatch[key]===undefined||book[key]===part.directoryMatch[key])&&(!part.directoryMatch.bookIds||part.directoryMatch.bookIds.includes(book.id))).map(book=>book.id));
    if(ids.length!==scope.total||new Set(ids).size!==ids.length){errors.push({resourceId:resource.id,scopeId:scope.id,reason:'目录数量或重叠不符合分母',expected:scope.total,actual:ids.length});continue;}
    const plan=BP.planForResource(reading,resource.id,directory,volumes,scope);
    if(!plan||BP.scopeGroup(plan,scope)===null)errors.push({resourceId:resource.id,scopeId:scope.id,reason:'完整范围未接通逐本进度'});
  }
  return {id:resource.id,title:resource.title,type:resource.type,scopeCount:scopes.length,completeDirectoryScopes:scopes.filter(scope=>{const p=BP.planForResource(reading,resource.id,directory,volumes,scope);return p&&BP.scopeGroup(p,scope)!==null;}).map(scope=>({id:scope.id,edition:scope.edition,total:scope.total})),directoryBooks:new Set(plans.flatMap(plan=>plan.books.map(book=>book.id)).concat(authored?.books.map(book=>book.id)||[])).size};
});
const statusCounts=rows=>Object.fromEntries(['逐本进度','数量进度','待选目录','范围待核'].map(status=>[status,rows.filter(r=>r.status===status).length]));
const summary={resources:resources.length,stages:catalog.stages.length,references:references.length,statuses:statusCounts(references),executionStatuses:statusCounts(references.filter(r=>r.execution)),executionBookStatuses:statusCounts(references.filter(r=>r.execution&&['book','reader'].includes(r.type))),byRoute:Object.fromEntries(catalog.routes.map(route=>[route.id,statusCounts(references.filter(r=>r.route===route.id))])),integrityErrors:errors.length};
const out=path.resolve(process.argv[2]||path.join(root,'docs/audits/material-progress-20261109.json'));
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({summary,errors,resources,references},null,2)+'\n');
const lines=['# 全量素材进度核查','', '本地核查日期：2026-11-09。仅读取公共源码，无本人记录写入；尚未发布。', '',`覆盖${summary.resources}个公共素材、${summary.stages}个来源／执行阶段、${summary.references}个展开后的素材分项。同一素材跨来源引用重复出现，分项数不是去重套系数。`,'', '## 当前执行阶段', '', '| 范围 | 逐本进度 | 数量进度 | 待选目录 | 范围待核 |','| --- | ---: | ---: | ---: | ---: |'];
for(const [label,counts]of [['全部类型',summary.executionStatuses],['绘本与分级',summary.executionBookStatuses]])lines.push(`| ${label} | ${Object.values(counts).join(' | ')} |`);
lines.push('', '逐本进度表示完整公共目录可打开并勾选；数量进度已有核实分母和进度条，但不代表逐册书目完整。待选目录存在多个有效候选；范围待核缺确切版本、级别或选本。统计未读取本人选版，已有私人选择不会被清除。动画、App、闪卡与书籍分开判断，不把季数当集数，不把目录条数当出版总量。','',`显式完整目录映射的数量、重复成员和逐本入口错误：${errors.length}项。`, '', '## 当前执行阶段待补书目／范围', '', '| 素材 | 路线／阶段 | 级别或选材 | 现状 |','| --- | --- | --- | --- |');
const missing=references.filter(r=>r.execution&&['book','reader'].includes(r.type)&&r.status!=='逐本进度');
for(const r of missing)lines.push(`| ${r.title} | ${r.route}／${r.stageTitle} | ${r.level||'未限定'} | ${r.status}${r.total?'：'+r.total+r.unit:''} |`);
lines.push('', '## 复查方式', '', '`node scripts/audit-material-progress.mjs`；详细逐项结果与稳定记录键见同名JSON。新增具名范围须先维护公共目录和映射，再运行此检查；不能在路线页补写独立总量或把参考文字替换当作已接通进度。','');
fs.writeFileSync(out.replace(/\.json$/,'.md'),lines.join('\n'));
console.log(JSON.stringify(summary));
if(errors.length){console.error(JSON.stringify(errors));process.exitCode=1;}
