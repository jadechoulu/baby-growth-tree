(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./data/topic-taxonomy.json'):root.ROADMAP_RAW.topicTaxonomy);if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishTopics=api;})(typeof window==='object'?window:globalThis,function(data){
'use strict';
const list=value=>Array.isArray(value)?value:[],unique=values=>[...new Set(values)];
const byId=new Map(data.nodes.map(item=>[item.id,item]));
const byLabel=new Map(data.nodes.map(item=>[item.label,item]));
const legacyLabels=Object.fromEntries(Object.entries(data.legacyBookLabels).map(([label,id])=>[id,label]));
function node(id){return byId.get(id)||byLabel.get(id);}
function roots(){return data.nodes.filter(item=>!item.parentId);}
function children(parentId){return data.nodes.filter(item=>item.parentId===parentId);}
function label(id){return node(id)?.label||id;}
function labels(ids){return unique(list(ids).map(label));}
function expand(ids){return unique(list(ids).flatMap(id=>{const item=node(id);return item?.parentId?[item.id,item.parentId]:[item?.id||id];}));}
function matches(ids,{topic='all',subtopic='all'}={}){
  const values=expand(ids),parent=topic&&topic!=='all'?node(topic)?.id||topic:null,child=subtopic&&subtopic!=='all'?node(subtopic)?.id||subtopic:null;
  if(parent&&!values.includes(parent))return false;
  if(child&&(!values.includes(child)||(parent&&node(child)?.parentId!==parent)))return false;
  return true;
}
function options(ids,parentId){const available=new Set(expand(ids));return (parentId&&parentId!=='all'?children(parentId):roots()).filter(item=>available.has(item.id));}
function bookTopic(value,custom){
  const legacyId=data.legacyBookLabels[value]||value;
  if(Object.hasOwn(data.legacyBookTopics,legacyId)){
    const mapped=data.legacyBookTopics[legacyId];
    return mapped.length?mapped:custom?[value]:[];
  }
  return node(value)?[node(value).id]:custom?[value]:[];
}
function helloOverride(domain,entry){
  if(domain==='hello-part')return data.helloPartOverrides?.[entry.titleSource?.file+'#'+entry.part];
  if(domain==='hello-rhyme')return data.helloRhymeOverrides?.[entry.id];
}
function patternTopics(entry){
  const guide=entry.studyGuide,mapping=data.patternMappings?.[guide?.sourceId];
  if(!mapping)return [];
  return unique(list(guide.patterns).map(pattern=>{
    const key=String(pattern.text||'').trim().replace(/\.\.\./g,'…').replace(/’/g,"'").replace(/\s+/g,' ').replace(/ …/g,'…').replace(/… /g,'…').toLowerCase();
    return mapping[key];
  }).filter(Boolean));
}
function entryTopics(domain,entry={}){
  if(domain==='book'){
    const override=entry.custom?null:data.bookOverrides[entry.id];
    const original=list(entry.topics).filter(id=>!list(override?.replaceLegacy).includes(data.legacyBookLabels[id]||id));
    const ids=original.flatMap(value=>bookTopic(value,entry.custom)).concat(list(override?.topics),entry.custom?[]:patternTopics(entry));
    return unique(ids);
  }
  if(domain==='hello-part')return unique(list(data.helloScenes[entry.scene]?.topics).concat(list(helloOverride(domain,entry)?.topics)));
  if(domain==='hello-rhyme')return unique(list(entry.themes).flatMap(theme=>list(data.helloScenes[theme]?.topics)).concat(list(helloOverride(domain,entry)?.topics)));
  if(domain==='song')return list(data.songMappings[entry.id]?.topics);
  return [];
}
function entryActivities(domain,entry={}){
  if(domain==='song')return list(data.songMappings[entry.id]?.activities);
  if(domain==='hello-rhyme')return list(data.helloActivities[entry.id]?.activities);
  return [];
}
function originalLabels(domain,entry={}){
  if(domain==='book')return list(entry.topics).map(id=>legacyLabels[id]||id);
  if(domain==='hello-part')return entry.scene?[entry.scene]:[];
  if(domain==='hello-rhyme')return list(entry.themes);
  if(domain==='song')return entry.scene?[entry.scene]:[];
  return [];
}
function entryEvidence(domain,entry={}){
  if(domain==='book'){
    const record=data.bookOverrides[entry.id]||{basis:'保留已有内容核对的一级主题；没有细分依据不补造二级。',evidence:list(entry.topicEvidence)};
    return {...record,patternTopics:patternTopics(entry),patternSourceId:patternTopics(entry).length?entry.studyGuide.sourceId:null};
  }
  if(domain==='song')return data.songMappings[entry.id]||{status:'pending',basis:'尚无本曲具体版本的主题映射依据。'};
  const values=originalLabels(domain,entry);
  return {basis:'原场景／主题名称保留，按已确认的公共两级目录关联。',mappings:values.map(value=>({originalLabel:value,...data.helloScenes[value]})),override:helloOverride(domain,entry)};
}
return {roots,children,node,label,labels,expand,matches,options,entryTopics,entryActivities,originalLabels,entryEvidence,activities:data.activities,sources:data.sources};
});
