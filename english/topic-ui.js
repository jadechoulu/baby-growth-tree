(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishTopicUI=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
function create({h,topics}){
  function picker({id,topic='all',subtopic='all',onchange,custom=[],compact=false,available=null}){
    const primary=h('select',{id:id+'-primary','aria-label':'一级主题',onchange:e=>{sync(e.currentTarget.value,'all');onchange(e.currentTarget.value,'all');}});
    const secondary=h('select',{id:id+'-secondary','aria-label':'二级主题',onchange:e=>{const child=e.currentTarget.value;sync(primary.value,child);onchange(primary.value,child);}});
    const selectedLabel=h('span',{class:'topic-selected-label'});
    const element=h('div',{class:'topic-picker'+(compact?' topic-picker-compact':'')},h('label',{for:primary.id},h('span',{class:'topic-picker-label'},'一级主题'),primary),h('label',{for:secondary.id},h('span',{class:'topic-picker-label'},'二级主题'),secondary),selectedLabel);
    const option=(value,label,selected)=>h('option',{value,selected},label);
    function sync(parent,child,scope=available){
      available=scope;
      const roots=scope===null?topics.roots():topics.options(scope);
      if(parent!=='all'&&!roots.concat(custom).some(n=>n.id===parent))parent='all';
      const children=scope===null?topics.children(parent):topics.options(scope,parent).filter(n=>n.parentId===parent);
      if(child!=='all'&&!children.some(n=>n.id===child))child='all';
      primary.replaceChildren(option('all','全部主题',parent==='all'),...roots.map(n=>option(n.id,n.label,parent===n.id)),...custom.map(n=>option(n.id,n.label,parent===n.id)));
      secondary.replaceChildren(option('all','全部二级',child==='all'),...children.map(n=>option(n.id,n.label,child===n.id)));
      secondary.disabled=parent==='all'||!children.length;
      selectedLabel.textContent=parent==='all'?'':topics.label(parent)+(child!=='all'?' / '+topics.label(child):'');
      selectedLabel.hidden=compact||parent==='all';
      primary.title='一级主题：'+(parent==='all'?'全部主题':topics.label(parent));
      secondary.title='二级主题：'+(child==='all'?'全部二级':topics.label(child));
      element.hidden=scope!==null&&!roots.length&&!custom.length;
      return {topic:parent,subtopic:child};
    }
    sync(topic,subtopic);return {element,sync};
  }
  function tags(ids){
    // 句型用于同一分类树检索，原文仍由书单句型列展示，避免在内容主题列重复。
    const values=[...new Set(ids||[])].filter(id=>id!=='patterns'&&topics.node(id)?.parentId!=='patterns'),parents=new Set(values.map(id=>topics.node(id)?.parentId).filter(Boolean));
    return values.filter(id=>!parents.has(id)).map(id=>h('span',{class:'chip topic-tag',title:topics.node(id)?.parentId?topics.label(topics.node(id).parentId)+' / '+topics.label(id):topics.label(id)},topics.label(id)));
  }
  function legend(){return h('div',{class:'topic-legend'},h('p',{},'主题共用一级与二级分类。选择一级包含其全部二级；一份内容可有多个主题。优先采用分类表或内容简介，缺少内容时按标题兜底并标明依据。'),h('p',{},'句型仅采用已查到的原表或正文。Hello原场景、原童谣主题和歌单分类继续保留。TPR表示听指令做动作的活动方式；难度按各资料来源保留，均不属于主题层级。'));}
  function evidence(domain,entry){
    const record=topics.entryEvidence(domain,entry),mappings=record.mappings||[];
    const ids=[...new Set([...(record.sourceIds||[]),...(record.override?.sourceIds||[]),...(record.evidence||[]).map(e=>e.sourceId),...(record.patterns||[]).map(p=>p.sourceId),record.patternSourceId,...mappings.flatMap(m=>m.sourceIds||[])].filter(Boolean))];
    return h('details',{class:'topic-evidence'},h('summary',{},'主题与句型依据'),record.patternStatus==='title-fallback'?h('p',{class:'small-note'},'句型按题名兜底：保留原题名和匹配规则，尚未核到逐字正文。'):record.status==='title-fallback'?h('p',{class:'small-note'},'仅按标题归类，尚未核实正文。'):null,h('p',{},record.basis||'按本条内容关联公共主题。'),(record.equivalentBooks||[]).map(book=>h('p',{class:'small-note'},'同册依据：'+book.title+' · ISBN '+book.isbn+'；复用已核主题与句型，不改变当前目录的版本、级别或阶段。')),record.subtopicBasis?h('p',{},'二级补充：'+record.subtopicBasis):null,record.patternTopics?.length?h('p',{},'句型：'+topics.labels(record.patternTopics).join('、')+'；来自已维护的原表、已核资料或题名兜底，来源层级在每条依据中保留。'):null,(record.evidence||[]).map(e=>h('p',{},typeof e==='string'?e:e.summary||e.quote||e.note||'',e.locator?' · '+e.locator:null,e.url?h('a',{href:e.url,target:'_blank',rel:'noopener noreferrer'},' 来源 ↗'):null)),(record.patterns||[]).filter(p=>p.note).map(p=>h('p',{class:'small-note'},p.text+'：'+p.note)),record.override?h('p',{},'本条内容：'+topics.labels(record.override.topics).join('、')+'。'+record.override.basis):null,mappings.map(m=>h('p',{},m.originalLabel+' → '+(m.topics?.length?topics.labels(m.topics).join('、'):'尚无细分依据'))),ids.map(id=>{
      const source=topics.sources.find(s=>s.id===id);if(!source)return null;
      return h('p',{},source.url?h('a',{href:source.url,target:'_blank',rel:'noopener noreferrer'},source.title):h('span',{},source.title),source.locator?' · '+source.locator:null);
    }));
  }
  return {picker,tags,legend,evidence};
}
return {create};
});
