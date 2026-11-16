// 图鉴按路线／阶段的可达性审计；不读取私人记录，不补造单册与阶段对应。
const fs=require('node:fs');
const path=require('node:path');
const M=require('../english/model.js'),LB=require('../english/library-books.js'),BP=require('../english/book-progress.js');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../english/data',name+'.json'),'utf8'));
function inputs(){
  const volumes=read('resource-volumes');
  const raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),
    xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan'),resourceVolumes:volumes,liaoReading:read('liao-reading')};
  return {catalog:M.normalize(raw),directory:BP.withReadingPlans(read('resource-books'),read('reading-plans'),volumes),volumes};
}
function audit({catalog,directory,volumes}=inputs()){
  const entries=LB.materialEntries(directory,catalog.resources,M,volumes),ranges=[],issues=[];
  const scopes=[{route:'all'},...catalog.routes.map(r=>({route:r.id})),...catalog.stages.map(s=>({route:s.routeId,stageIds:[s.id]}))];
  for(const filters of scopes){
    const applies=a=>(filters.route==='all'||a.routeId===filters.route)&&(!filters.stageIds||filters.stageIds.includes(a.stageId));
    const expected=catalog.resources.filter(r=>filters.route==='all'&&!filters.stageIds||r.appearances.some(applies));
    const result=LB.filter(entries,directory,filters),groups=LB.displayGroups(M.sortLibraryMaterials(catalog,result,{...filters,typeFirst:true}));
    const represented=new Set(groups.flatMap(g=>[g.id,...(g.resource.mergedResourceIds||[])]));
    const missing=expected.filter(r=>!represented.has(r.id)).map(r=>({id:r.id,title:r.title}));
    if(missing.length)issues.push({...filters,missing});
    ranges.push({...filters,expected:expected.length,shown:groups.length,missing:missing.length,
      seriesReferences:result.filter(e=>e.resourceCatalogFallback).map(e=>({id:e.resourceId,title:e.title}))});
  }
  return {resources:catalog.resources.length,books:directory.books.length,ranges:ranges.length,issues,routes:ranges.filter(r=>!r.stageIds),stages:ranges.filter(r=>r.stageIds)};
}
module.exports={inputs,audit};
if(require.main===module){const report=audit();process.stdout.write(JSON.stringify(report,null,2)+'\n');if(report.issues.length)process.exitCode=1;}
