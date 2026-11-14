(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishTopicUI=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
function create({h,topics}){
  function picker({id,topic='all',subtopic='all',onchange,custom=[]}){
    const primary=h('select',{id:id+'-primary','aria-label':'一级主题',onchange:e=>{sync(e.currentTarget.value,'all');onchange(e.currentTarget.value,'all');}});
    const secondary=h('select',{id:id+'-secondary','aria-label':'二级主题',onchange:e=>{const child=e.currentTarget.value;sync(primary.value,child);onchange(primary.value,child);}});
    const selectedLabel=h('span',{class:'topic-selected-label'});
    const element=h('div',{class:'topic-picker'},h('label',{for:primary.id},'一级主题',primary),h('label',{for:secondary.id},'二级主题',secondary),selectedLabel);
    const option=(value,label,selected)=>h('option',{value,selected},label);
    function sync(parent,child){
      primary.replaceChildren(option('all','全部主题',parent==='all'),...topics.roots().map(n=>option(n.id,n.label,parent===n.id)),...custom.map(n=>option(n.id,n.label,parent===n.id)));
      const children=topics.children(parent);
      secondary.replaceChildren(option('all','全部二级',child==='all'),...children.map(n=>option(n.id,n.label,child===n.id)));
      secondary.disabled=parent==='all'||!children.length;
      selectedLabel.textContent=parent==='all'?'':topics.label(parent)+(child!=='all'?' / '+topics.label(child):'');
      selectedLabel.hidden=parent==='all';
    }
    sync(topic,subtopic);return {element,sync};
  }
  function tags(ids){
    // 句型用于同一分类树检索，原文仍由书单句型列展示，避免在内容主题列重复。
    const values=[...new Set(ids||[])].filter(id=>id!=='patterns'&&topics.node(id)?.parentId!=='patterns'),parents=new Set(values.map(id=>topics.node(id)?.parentId).filter(Boolean));
    return values.filter(id=>!parents.has(id)).map(id=>h('span',{class:'chip topic-tag',title:topics.node(id)?.parentId?topics.label(topics.node(id).parentId)+' / '+topics.label(id):topics.label(id)},topics.label(id)));
  }
  function legend(){return h('div',{class:'topic-legend'},h('p',{},'主题共用一级与二级分类。选择一级包含其全部二级；二级只匹配有内容依据的细分类，一份内容可有多个主题。'),h('p',{},'Hello原场景、原童谣主题和歌单分类继续保留。TPR表示听指令做动作的活动方式；难度按各资料来源保留，均不属于主题层级。'));}
  function evidence(domain,entry){
    const record=topics.entryEvidence(domain,entry),mappings=record.mappings||[];
    const ids=[...new Set([...(record.sourceIds||[]),...(record.override?.sourceIds||[]),...(record.evidence||[]).map(e=>e.sourceId),record.patternSourceId,...mappings.flatMap(m=>m.sourceIds||[])].filter(Boolean))];
    return h('details',{class:'topic-evidence'},h('summary',{},'主题依据'),h('p',{},record.basis||'按本条内容关联公共主题。'),record.patternTopics?.length?h('p',{},'句型：'+topics.labels(record.patternTopics).join('、')+'；来自本册已维护的原表，不由书名推断。'):null,record.override?h('p',{},'本条内容：'+topics.labels(record.override.topics).join('、')+'。'+record.override.basis):null,mappings.map(m=>h('p',{},m.originalLabel+' → '+(m.topics?.length?topics.labels(m.topics).join('、'):'尚无细分依据'))),ids.map(id=>{
      const source=topics.sources.find(s=>s.id===id);if(!source)return null;
      return h('p',{},source.url?h('a',{href:source.url,target:'_blank',rel:'noopener noreferrer'},source.title):h('span',{},source.title),source.locator?' · '+source.locator:null);
    }));
  }
  return {picker,tags,legend,evidence};
}
return {create};
});
