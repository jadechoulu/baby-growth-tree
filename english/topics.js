(function(root,factory){const common=typeof module==='object'&&module.exports;const api=factory(common?require('./data/topic-taxonomy.json'):root.ROADMAP_RAW.topicTaxonomy,common?require('./data/resource-books.json'):root.ROADMAP_RAW.resourceBooks);if(common)module.exports=api;else root.EnglishTopics=api;})(typeof window==='object'?window:globalThis,function(data,directory){
'use strict';
const list=value=>Array.isArray(value)?value:[],unique=values=>[...new Set(values)];
let byId,byLabel,legacyLabels,patternGroups,patternGroupByMember;
function build(nextData){
  data=nextData;
  byId=new Map(list(data.nodes).map(item=>[item.id,item]));
  byLabel=new Map(list(data.nodes).map(item=>[item.label,item]));
  legacyLabels=Object.fromEntries(Object.entries(data.legacyBookLabels||{}).map(([label,id])=>[id,label]));
  patternGroups=list(data.patternGroups);
  patternGroupByMember=new Map(patternGroups.flatMap(group=>group.members.map(id=>[id,group])));
  for(const group of patternGroups){byId.set(group.id,group);byLabel.set(group.label,group);}
}
build(data);
function hydrate(nextData){if(nextData)build(nextData);}
function node(id){return byId.get(id)||byLabel.get(id);}
function roots(){return data.nodes.filter(item=>!item.parentId).sort((a,b)=>Number(b.id==='patterns')-Number(a.id==='patterns'));}
function children(parentId){return parentId==='patterns'&&patternGroups.length?patternGroups:data.nodes.filter(item=>item.parentId===parentId);}
function label(id){return node(id)?.label||id;}
function labels(ids){return unique(list(ids).map(label));}
function expand(ids){return unique(list(ids).flatMap(id=>{const item=node(id);const group=patternGroupByMember.get(item?.id)||(item?.parentId==='patterns'&&!patternGroups.includes(item)?patternGroups.find(group=>group.id==='patterns.group-other'):null);return item?.parentId?[item.id,...(group?[group.id]:[]),item.parentId]:[item?.id||id];}));}
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
// 只复用逐册ISBN已经核定的内容依据；不按同名、套系或级别传播分类。
let indexedBooks,indexedRelations,bookById,relationByBook;
function equivalentBooks(entry){
  if(entry.custom||entry.privateShelf||!directory)return [];
  if(indexedBooks!==directory.books||indexedRelations!==directory.readingEquivalences){
    indexedBooks=directory.books;indexedRelations=directory.readingEquivalences;
    bookById=new Map(list(indexedBooks).map(book=>[book.id,book]));
    relationByBook=new Map(list(indexedRelations).filter(group=>group.kind==='same-isbn'&&group.isbn&&group.sourceIds?.length).flatMap(group=>group.bookIds.map(id=>[id,group])));
  }
  const relation=relationByBook.get(entry.id);
  return relation?relation.bookIds.filter(id=>id!==entry.id&&bookById.has(id)).map(id=>({book:bookById.get(id),relation})):[];
}
function ownPatterns(domain,entry){
  const record=domain==='resource'?data.resourceMappings?.[entry.id]:data.bookOverrides[entry.id];
  const singleWordPattern=item=>!/…|\.\.\./.test(String(item.text||''))&&/^[A-Za-z]+[.!?]?$/.test(String(item.text||'').trim());
  // 题名兜底只参与分类检索；不能把中英文书名冒充正文提炼的句型。
  return [...list(entry.studyGuide?.patterns).map(item=>({...item,sourceId:entry.studyGuide.sourceId})),...list(record?.patterns)]
    .filter(item=>!singleWordPattern(item));
}
function patterns(domain,entry={}){
  if(domain==='book'&&entry.privateShelf)return list(entry.topicRecord?.patterns);
  const values=ownPatterns(domain,entry).concat(domain==='book'?equivalentBooks(entry).flatMap(({book})=>ownPatterns('book',book)):[]);
  const seen=new Set();
  return values.filter(item=>{const key=String(item.text||'').trim();if(!key||seen.has(key))return false;seen.add(key);return true;});
}
function ownBookTopics(entry){
  const override=entry.custom?null:data.bookOverrides[entry.id];
  const original=list(entry.topics).filter(id=>!list(override?.replaceLegacy).includes(data.legacyBookLabels[id]||id));
  return original.flatMap(value=>bookTopic(value,entry.custom)).concat(list(override?.topics),entry.custom?[]:patternTopics(entry));
}
function entryTopics(domain,entry={}){
  if(domain==='book'){
    if(entry.privateShelf)return list(entry.topicRecord?.topics);
    return unique(ownBookTopics(entry).concat(equivalentBooks(entry).flatMap(({book})=>ownBookTopics(book))));
  }
  if(domain==='resource')return list(data.resourceMappings?.[entry.id]?.topics);
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
    if(entry.privateShelf)return entry.topicRecord||{status:'pending',topics:[],patterns:[],basis:'本册主题待核对。'};
    const record=data.bookOverrides[entry.id]||{basis:'保留已有内容核对的一级主题；没有细分依据不补造二级。',evidence:list(entry.topicEvidence)};
    const equivalents=equivalentBooks(entry),related=equivalents.map(({book})=>data.bookOverrides[book.id]||{});
    return {...record,sourceIds:unique(list(record.sourceIds).concat(list(record.patternSourceIds),related.flatMap(item=>list(item.sourceIds).concat(list(item.patternSourceIds))),equivalents.flatMap(({relation})=>relation.sourceIds))),
      evidence:list(record.evidence).concat(equivalents.flatMap(({book})=>list(data.bookOverrides[book.id]?.evidence).concat(list(book.topicEvidence)))),
      equivalentBooks:equivalents.map(({book,relation})=>({id:book.id,title:book.title,isbn:relation.isbn,sourceIds:relation.sourceIds})),
      patternTopics:entryTopics('book',entry).filter(id=>node(id)?.parentId==='patterns'),patterns:patterns(domain,entry),patternSourceId:patternTopics(entry).length?entry.studyGuide.sourceId:null};
  }
  if(domain==='resource')return {...(data.resourceMappings?.[entry.id]||{status:'pending',basis:'本素材尚未取得可用主题依据。'}),patterns:patterns(domain,entry)};
  if(domain==='song')return data.songMappings[entry.id]||{status:'pending',basis:'尚无本曲具体版本的主题映射依据。'};
  const values=originalLabels(domain,entry);
  return {basis:'原场景／主题名称保留，按已确认的公共两级目录关联。',mappings:values.map(value=>({originalLabel:value,...data.helloScenes[value]})),override:helloOverride(domain,entry)};
}
return {hydrate,roots,children,node,label,labels,expand,matches,options,entryTopics,entryActivities,originalLabels,entryEvidence,patterns,get activities(){return data.activities;},get sources(){return data.sources;}};
});
