(function(root){
'use strict';
// 所有英语素材页面共用的展示组件；角色判定由 model.js 提供，不在视图重判。
function create({h,roles,levelNodes}){
  function name(value,shared,{tag='span',className='material-name'}={}){
    return h(tag,{class:className+(shared?' shared-material':'')},value);
  }
  function roleTag(role,extraClass=''){
    return h('span',{class:['material-role-key','material-role-'+role.kind,extraClass].filter(Boolean).join(' '),title:[roles[role.kind],role.usage&&'原文用途：'+role.usage,role.basis].filter(Boolean).join('；')},roles[role.kind]);
  }
  function selectionTag(selection){
    return selection?h('small',{class:'material-selection',title:'原文选材要求：'+selection.basis,'aria-label':'原文选材要求：'+selection.basis},selection.label):null;
  }
  function title({name:label,shared,levels=[],selection}){
    // 原级别已含“任选2部”等原文时不重复显示，完整要求仍在ⓘ保留。
    const repeated=selection&&levels.map(part=>part.text).join('').includes(selection.label);
    return [name(label,shared),levels.length?' · ':null,...levelNodes(levels),repeated?null:selectionTag(selection)];
  }
  function evidence(role,{sourceLink}={}){
    const record=role?.evidence;if(!record)return null;
    return h('div',{class:'material-role-evidence','data-evidence-status':record.status},
      h('p',{},roleTag(role),role.usage&&role.usage!==role.label?' '+role.usage:null),
      h('p',{class:'small-note'},role.basis),
      record.checkedAt?h('p',{class:'small-note'},'用途核对：'+record.checkedAt):null,
      (record.sources||[]).length?h('ul',{class:'series-evidence-list'},record.sources.map(source=>h('li',{},
        source.quote?h('p',{},'原文：“'+source.quote+'”'):null,
        source.note?h('p',{class:'small-note'},source.note):null,
        sourceLink?sourceLink(source):h('span',{class:'small-note'},source.sourceId+(source.page?' · 第 '+source.page+' 页':''))))):null);
  }
  function legend(){
    return h('div',{},h('div',{class:'material-legend','aria-label':'素材图例'},h('span',{},'图例'),Object.keys(roles).map(kind=>roleTag({kind}))),
      h('p',{class:'small-note'},'主线表示本阶段的主要材料，原文“平行拓展”统一称为辅线，两者同义，不等于可选；特色推荐仅限原文明确推荐。未标主辅表示本次引用尚未核定主辅，不代表作者整条路线没有划分。颜色只表示该路线、版本、阶段的用途，不表示完成状态。'),
      h('p',{class:'small-note'},'选读范围是另一项要求：按作者明确的任选、挑选或进阶条件执行，不由主辅线颜色推定每套、每册必须全部读完。选材标签保留原文要求，不表示完成。'),
      h('p',{class:'small-note'},h('b',{},'套系名称加粗'),'：当前比较范围的多路线共用；',h('b',{},'级别加粗'),'：该范围的实际重叠级别。加粗不表示主线或必读。'),
      h('p',{class:'small-note'},'进度状态按实际记录显示，与用途色分别表达。普通标签只说明含义；可操作入口使用按钮或链接，提供焦点、完整提示及无障碍名称。'));
  }
  return {name,roleTag,selectionTag,title,evidence,legend};
}
const api={create};root.EnglishMaterialUI=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
