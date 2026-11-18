/* 素材图鉴的共享 DOM 模板；目录、筛选与个人事实由各分类提供。 */
(function (root) {
  'use strict';
  function create({h, icon=defaultIcon}) {
    function card({attrs={}, cover, title, meta, tools=[], footer}) {
      return h('article', {...attrs, class:'resource-card library-card '+(attrs.class||'')},
        h('div', {class:'resource-body'},
          h('div', {class:'library-card-head'}, cover,
            h('div', {class:'library-card-heading'}, title, meta)),
          h('div', {class:'library-card-tools'}, tools), footer));
    }
    function groupingToggle({value, onChange}) {
      const grouped=value==='series';
      const label=grouped?'按套系展示，切换为单本展示':'按单本展示，切换为套系展示';
      return h('button', {type:'button',class:'library-filter-button library-grouping-toggle',
        title:label,'aria-label':label,'aria-pressed':String(grouped),
        onclick:()=>onChange(grouped?'books':'series')}, icon(grouped?'layers':'book'));
    }
    function layoutControls({grouping, onGrouping, layout, onLayout, prefix='library'}) {
      return h('div', {class:'library-layout-toggle',role:'group','aria-label':'素材显示方式'},
        groupingToggle({value:grouping,onChange:onGrouping}),
        [['list','menu','列表视图'],['covers','grid','封面视图']].map(([value,name,label])=>
          h('button', {id:prefix+'-layout-'+value,type:'button',class:'icon-button',
            'data-library-layout':value,'aria-label':label,title:label,'aria-pressed':String(layout===value),
            onclick:event=>{
              onLayout(value);
              event.currentTarget.closest('.library-layout-toggle').querySelectorAll('[data-library-layout]')
                .forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.libraryLayout===value)));
            }},icon(name))));
    }
    function reset({id, onReset, label='重置全部筛选'}) {
      return h('button', {id,type:'button',class:'library-filter-button filter-reset',title:label,'aria-label':label,onclick:onReset},'↺');
    }
    function resultsHead(count, controls) {
      return h('div', {class:'library-results-head'},h('p', {class:'result-count',role:'status'},count),controls);
    }
    return {card,groupingToggle,layoutControls,reset,resultsHead};
  }
  function defaultIcon(name) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round',class:'icon','aria-hidden':'true'}))svg.setAttribute(key,value);
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d',({layers:'m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',book:'M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15',menu:'M4 6h16M4 12h16M4 18h16',grid:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z'})[name]||'M5 4h14v16H5Z');
    svg.append(path);return svg;
  }
  root.XiaoyaMaterialLibrary={create};
})(typeof window==='undefined'?globalThis:window);
