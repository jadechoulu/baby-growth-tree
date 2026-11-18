/* 素材图鉴的共享 DOM 模板；目录、筛选与个人事实由各分类提供。 */
(function (root) {
  'use strict';
  function create({h, icon=defaultIcon}) {
    function card({attrs={}, cover, title, meta, tools=[], footer}) {
      return h('article', {...attrs, class:'resource-card library-card '+(attrs.class||'')},
        h('div', {class:'resource-body'},
          h('div', {class:'library-card-head'}, cover,
            h('div', {class:'library-card-heading'}, title, meta)),
          tools.some(Boolean)?h('div', {class:'library-card-tools'}, tools):null, footer));
    }
    function bookCard({attrs={},cover,title,actions=[],context,topics,evidence}) {
      return h('article',{...attrs,class:'library-book-row '+(attrs.class||'')},cover,
        h('div',{class:'library-book-body'},title,
          h('span',{class:'library-book-actions'},actions),
          context?h('div',{class:'library-book-context'},context):null,topics,evidence));
    }
    function shelfCard({attrs={},cover,title,onOpen,completed,total,status,note}) {
      return h('article',{...attrs,class:'library-card shelf-card '+(attrs.class||'')},
        h('button',{type:'button',class:'shelf-open',onclick:onOpen,
          'aria-label':'查看'+title+'全部书目与阅读状态','aria-haspopup':'dialog',title:'查看完整详情'},
          cover,h('span',{class:'shelf-card-heading'},h('strong',{},title),
            h('span',{class:'shelf-card-progress'},h('span',{},total?'书架 '+completed+'／'+total+'本':note),total?h('span',{},status):null),
            total?h('progress',{max:total,value:completed,'aria-label':title+'已阅读 '+completed+'／'+total+' 本'}):null)));
    }
    function completionControl({id,title,done,external,disabled=external,onChange}) {
      return h('input',{id,type:'checkbox',class:'book-completion'+(external?' is-imported':''),checked:done,disabled,
        'aria-label':(done?'已阅读：':'标记已阅读：')+title+(external?'（小花生同步已读）':''),
        title:external?'小花生已读已同步；原站修正后再核对来源记录':'标记／取消已读',onchange:onChange});
    }
    function readCountBadge(count,inline=false) {
      return count>1?h('span',{class:'book-read-count'+(inline?' book-read-count-inline':''),
        'aria-label':'小花生阅读 '+count+' 次',title:'小花生阅读 '+count+' 次'},count+'次'):null;
    }
    function bookCover({src,title,caption='单册封面',readCount,onOpen}) {
      const frame=h(onOpen?'button':'div',{class:'library-book-cover'+(onOpen?' card-view-btn':''),
        ...(onOpen?{type:'button',onclick:onOpen,'aria-label':'查看'+title+'完整详情','aria-haspopup':'dialog',title:'查看完整详情'}:{})});
      const badge=()=>{const node=readCountBadge(readCount);if(node)frame.append(node);};
      const fallback=()=>{
        frame.title=title+' · 单册图片待补';frame.classList.add('library-cover-fallback');
        frame.replaceChildren(h('span',{class:'library-book-placeholder','aria-label':title+'单册图片待补'},icon('book')));badge();
      };
      if(src){frame.append(h('img',{src,alt:title+' · '+caption,title:title+' · '+caption,loading:'lazy',onerror:fallback}));badge();}
      else fallback();
      return frame;
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
    return {card,bookCard,shelfCard,bookCover,completionControl,readCountBadge,groupingToggle,layoutControls,reset,resultsHead};
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
