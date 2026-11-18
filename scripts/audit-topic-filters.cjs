// 全公共素材、三条路线及全部阶段的主题交集；不读取或修改私人记录。
const {inputs}=require('./audit-library-route-coverage.cjs');
const B=require('../english/library-books.js'),M=require('../english/model.js'),T=require('../english/topics.js');
function audit({catalog,directory,volumes}=inputs()){
  const entries=B.materialEntries(directory,catalog.resources,M,volumes),issues=[],ranges=[];
  const scopes=[{route:'all'},...catalog.routes.map(route=>({route:route.id})),...catalog.stages.flatMap(stage=>{
    const lower=M.libraryStageIds(catalog,stage.id,true,{});
    return [{route:stage.routeId,stageIds:[stage.id]},...(lower.length>1?[{route:stage.routeId,stageIds:lower,stageScope:'lower'}]:[])];
  })];
  let combinations=0;
  for(const filters of scopes){
    const candidates=B.filter(entries,directory,{...filters,includeTopicReferences:true});
    const available=candidates.flatMap(entry=>B.topicIds(entry,directory));
    const parents=T.options(available),options=parents.flatMap(parent=>[{topic:parent.id},...T.options(available,parent.id).map(child=>({topic:parent.id,subtopic:child.id}))]);
    for(const option of options){
      combinations++;
      const result=B.filter(candidates,directory,{...filters,...option});
      if(!result.length)issues.push({...filters,...option,reason:'可选主题没有结果'});
      if(result.some(entry=>!T.matches(B.topicIds(entry,directory),option)))issues.push({...filters,...option,reason:'结果不符合主题交集'});
    }
    const patterns=B.filter(candidates,directory,{...filters,topic:'patterns'}),series=new Map();
    for(const entry of patterns){const id=entry.resource.id;if(!series.has(id))series.set(id,{id,title:entry.resource.title,entries:0});series.get(id).entries++;}
    ranges.push({...filters,entries:candidates.length,primaryTopics:parents.length,topicCombinations:options.length,patternEntries:patterns.length,patternSeries:[...series.values()]});
  }
  return {resources:catalog.resources.length,books:directory.books.length,ranges:ranges.length,combinations,issues,scopes:ranges};
}
module.exports={audit};
if(require.main===module){const report=audit();process.stdout.write(JSON.stringify(report,null,2)+'\n');if(report.issues.length)process.exitCode=1;}
