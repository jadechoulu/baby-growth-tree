(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./hello-reading.js'):root.EnglishHello);if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishHelloGraph=api;})(typeof window==='object'?window:globalThis,function(hello){
'use strict';
const LABELS={book:'书册',scene:'场景',part:'Part',rhyme:'Hello童谣',tune:'套唱曲调',extension:'拓展儿歌',resource:'资料'};
const nodeTypeLabel=node=>node.audioVariant?'音频 · '+node.audioVariant:node.type==='tune'?LABELS.tune+' · '+(node.repertoire?.label||'来源待核'):LABELS[node.type];
function buildGraph(data){
  const nodes=new Map(),edges=[],add=(node)=>{if(!nodes.has(node.id))nodes.set(node.id,node);return node.id;};
  const edge=(from,to,relation)=>{if(!edges.some(e=>e.from===from&&e.to===to&&e.relation===relation))edges.push({from,to,relation});};
  const scene=value=>add({id:'scene:'+value,type:'scene',label:value,value});
  const tune=value=>add({id:'tune:'+value,type:'tune',label:value,value,repertoire:(data.tuneAudio?.tunes||[]).find(t=>t.name===value)?.repertoire});
  for(const b of data.books){
    add({id:b.id,type:'book',label:b.title,cover:b.cover,bookId:b.id});
    for(const p of b.parts){const id=b.id+'-part-'+p.part;add({id,type:'part',label:'Part '+p.part+' · '+(p.title?p.title+' · ':'')+p.scene,bookId:b.id,part:p.part,title:p.title,note:p.note});edge(b.id,id,'包含');edge(id,scene(p.scene),'场景');edge('scene:'+p.scene,b.id,'见于本册');}
    for(const [i,r] of b.resources.entries()){
      const video=['package-video','video'].includes(r.kind),id=r.id||b.id+'-resource-'+i;add({id,type:'resource',label:r.label,url:r.url||r.file,kind:r.kind,bookId:b.id,sourceKind:r.sourceKind,audioVariant:r.kind==='audio'?hello.audioVariantLabel(r):undefined});edge(b.id,id,video?'资料包视频':r.kind==='audio'?'本册音频':r.kind==='pdf'?'本册PDF':r.kind==='notes'?'阅读指引':r.kind==='official'?'官方带读':'松果妈妈带读');
      if(video)for(const partId of r.partIds||[])if(b.parts.some(p=>partId===b.id+'-part-'+p.part))edge(partId,id,r.role==='tune-demo'?'曲调视频':r.role?.startsWith('extension')?'拓展视频':'配套视频');
      if(r.kind==='audio')for(const partId of r.partIds||[])if(b.parts.some(p=>partId===b.id+'-part-'+p.part))edge(partId,id,r.sourceKind==='reading-pen'?hello.audioVariantLabel(r):'Part音频');
      for(const rhymeId of r.rhymeIds||[])if(data.rhymes.some(rhyme=>rhyme.id===rhymeId&&rhyme.bookId===b.id))edge(rhymeId,id,video?'童谣配套视频':r.sourceKind==='reading-pen'?hello.audioVariantLabel(r):'同名音频');
      for(const name of r.sourceKind==='reading-pen'?[]:r.tunes||[])edge(tune(name),id,video?'曲调视频':'同名曲调音频');
    }
  }
  for(const r of data.rhymes){
    add({id:r.id,type:'rhyme',label:r.title,bookId:r.bookId});edge(r.bookId,r.id,'本册童谣');for(const id of r.partIds||[])if(nodes.get(id)?.bookId===r.bookId&&nodes.get(id)?.type==='part')edge(id,r.id,'对应童谣');
    for(const theme of r.themes||[])edge(scene(theme),r.id,'童谣主题');
    for(const name of hello.orderedTunes(data,r.tunes,[r.id]))edge(r.id,tune(name),'建议曲调');
    for(const [i,e] of r.extensions.entries()){const id=r.id+'-extension-'+i;add({id,type:'extension',label:e.title,bookId:r.bookId});edge(r.id,id,'拓展儿歌');edge(id,tune(e.tune),'拓展曲调');}
  }
  for(const item of data.materialCards?.items||[]){
    const relation=item.type==='rhyme-card'?(item.origin==='standalone-rhyme-card'?'独立童谣卡':item.origin==='book-pages'?'原书童谣页':'童谣素材'):({'vocabulary-card':'词汇图','reading-guide':'阅读指导',activity:'拓展活动',unclassified:'待分类素材'}[item.type]||'本册素材');
    add({id:item.id,type:'resource',kind:item.type,materialId:item.id,label:item.title,url:item.file,preview:item.preview,bookId:item.bookId,origin:item.origin});edge(item.bookId,item.id,relation);
    if(!['vocabulary-card','unclassified'].includes(item.type))for(const rhymeId of item.rhymeIds||[]){if(data.rhymes.find(r=>r.id===rhymeId)?.bookId===item.bookId)edge(rhymeId,item.id,relation);}
  }
  for(const reference of data.tuneAudio?.tunes||[]){
    const local=(reference.status==='available'&&reference.file)||(reference.status==='preview'&&reference.previewUrl),external=reference.status==='external'&&reference.sourceUrl;if(!local&&!external)continue;
    const url=reference.status==='preview'?reference.previewUrl:local?reference.file:reference.sourceUrl,kind=local?'audio':'tune-reference',existing=[...nodes.values()].find(node=>node.type==='resource'&&node.kind===kind&&node.url===url);
    const id=existing?.id||add({id:(local?'tune-audio:':'tune-reference:')+url,type:'resource',kind,label:reference.name+(reference.status==='preview'?' · 原曲试听片段':local?' · 曲调参考音频':' · 官方曲调试听'),url,sourceTitle:reference.sourceTitle,note:reference.note});
    edge(tune(reference.name),id,reference.status==='preview'?'原曲试听片段':local?'曲调参考音频':'官方曲调试听');
  }
  return {nodes:[...nodes.values()],edges};
}
function focusId(graph,filters={}){
  const ids=new Set(graph.nodes.map(n=>n.id)),f=filters.focus;
  const fromSelection=s=>s&&(s.type==='scene'?'scene:'+(s.value||s.id):s.type==='tune'?'tune:'+(s.value||s.id):s.id||s.value);
  const explicit=typeof f==='string'?f:fromSelection(f);
  const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘']/g,'').replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ').trim(),words=normalize(filters.query).split(' ').filter(Boolean);
  const books=Array.isArray(filters.book)?filters.book:filters.book&&filters.book!=='all'?[filters.book]:[];
  const matches=words.length?graph.nodes.filter(n=>(!books.length||books.includes(n.id)||books.includes(n.bookId))&&words.every(word=>normalize(n.label).includes(word))):[];
  const searchMatch=matches.find(n=>n.type==='rhyme')||matches.find(n=>n.type==='scene')||matches.find(n=>n.type==='tune')||matches[0];
  for(const id of [explicit,filters.part,filters.rhyme,searchMatch?.id,books[0],filters.scene&&filters.scene!=='all'?'scene:'+filters.scene:null,filters.tune&&filters.tune!=='all'?'tune:'+filters.tune:null,graph.nodes.find(n=>n.type==='book')?.id])if(ids.has(id))return id;
  return graph.nodes[0]?.id;
}
function neighbors(graph,id){
  const byId=new Map(graph.nodes.map(n=>[n.id,n])),items=new Map();
  for(const e of graph.edges){const other=e.from===id?e.to:e.to===id?e.from:null;if(!other||!byId.has(other))continue;if(!items.has(other))items.set(other,{node:byId.get(other),relations:[]});const row=items.get(other);if(!row.relations.includes(e.relation))row.relations.push(e.relation);}
  return [...items.values()];
}
function selection(node){if(node.type==='part')return {type:'part',id:node.id,bookId:node.bookId,part:node.part};return node.type==='scene'||node.type==='tune'?{type:node.type,value:node.value}:node.type==='book'?{type:'book',id:node.id}:node.type==='rhyme'?{type:'rhyme',id:node.id}:null;}
function render(data,{h,asset,onSelect=()=>{},filters={},onMaterialPreview}){
  const graph=buildGraph(data),byId=new Map(graph.nodes.map(n=>[n.id,n])),root=h('section',{class:'hello-graph','aria-label':'Hello可交互知识图谱'});
  let current=focusId(graph,filters),kind='all',width=360,boardHeight=420,worldWidth=360,worldHeight=420,focalCenter=180,zoom=1,pan={x:0,y:0},drag=null,history=[];
  const svgNS='http://www.w3.org/2000/svg',svg=(name,attrs={},children=[])=>{const el=document.createElementNS(svgNS,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));for(const child of children)el.append(typeof child==='string'?document.createTextNode(child):child);return el;};
  const title=h('strong',{}),status=h('span',{class:'hello-graph-status',role:'status'}),canvas=h('div',{class:'hello-graph-canvas'}),list=h('div',{class:'hello-graph-neighbors'});
  const button=(text,label,action)=>h('button',{type:'button',class:'hello-graph-tool','aria-label':label,title:label,onclick:action},text);
  const tuneButton=name=>typeof window==='object'&&window.EnglishAudio?.tuneButton?window.EnglishAudio.tuneButton(name,data,{h,asset}):null;
  const audioButton=node=>typeof window==='object'&&window.EnglishAudio?.audioButton?window.EnglishAudio.audioButton(node.url,node.label,{h,asset}):null;
  const relationSelect=h('select',{'aria-label':'查看哪类相邻节点',onchange:e=>{kind=e.currentTarget.value;draw();}},h('option',{value:'all'},'全部关系'),...Object.entries(LABELS).map(([key,label])=>h('option',{value:key},label)));
  const back=button('←','回到上个图谱节点',()=>{const id=history.pop();if(id){current=id;kind='all';relationSelect.value='all';draw();const selected=selection(byId.get(id));if(selected)onSelect(selected);}});
  const fit=()=>{zoom=Math.min(1,(width-16)/worldWidth,(boardHeight-16)/worldHeight);pan={x:(width-worldWidth*zoom)/2,y:(boardHeight-worldHeight*zoom)/2};applyTransform();};
  const locate=()=>{zoom=1;pan={x:width/2-focalCenter,y:8};applyTransform();};
  const readable=()=>{zoom=Math.min(1,(width-16)/worldWidth);pan={x:(width-worldWidth*zoom)/2,y:8};applyTransform();};
  function scale(factor,anchor={x:width/2,y:boardHeight/2}){const next=Math.max(.08,Math.min(3,zoom*factor)),ratio=next/zoom;pan={x:anchor.x-(anchor.x-pan.x)*ratio,y:anchor.y-(anchor.y-pan.y)*ratio};zoom=next;applyTransform();}
  let group;
  function applyTransform(){if(group)group.setAttribute('transform','translate('+pan.x+' '+pan.y+') scale('+zoom+')');}
  function activate(node){
    if(node.type==='resource'){if(node.kind==='audio')return;if(node.materialId&&node.kind!=='reading-guide'&&onMaterialPreview){onMaterialPreview(node.materialId);return;}if(window.EnglishFilePreview?.open(node.url,node.label))return;const a=document.createElement('a');a.href=asset(node.url);a.target='_blank';a.rel='noopener noreferrer';a.click();return;}
    if(node.id!==current)history.push(current);current=node.id;kind='all';relationSelect.value='all';draw();const selected=selection(node);if(selected)onSelect(selected);
  }
  const tools=h('div',{class:'hello-graph-tools'},back,relationSelect,button('−','缩小知识图谱',()=>scale(1/1.2)),button('＋','放大知识图谱',()=>scale(1.2)),button('⊞','一屏看全当前关联',fit),button('◎','回到当前焦点',locate));
  const hint=h('details',{class:'hello-graph-help'},h('summary',{},'关系说明'),h('p',{},'图中一次展示当前节点的全部直接关联，没有组间关系。点节点继续探索，音频在页内播放，PDF、图片与极空间带读在当前页弹窗查看。独立童谣卡与原书童谣页分别保留；词汇图只按册关联。场景与Part按来源关联，童谣依据逐册笔记Part标题及原书内容精确对应。建议曲调与拓展曲调分别保留，同名音频只表示文件名对应。拖动空白处平移，使用＋／−或双指缩放；⊞看全关联，◎恢复当前节点的可读比例。'));
  root.append(h('div',{class:'hello-graph-heading'},title,status),tools,canvas,h('details',{class:'hello-graph-list'},h('summary',{},'用列表查看全部直接关联'),list),hint);
  function nodeHeight(node,nodeWidth){
    const textWidth=nodeWidth-(node.cover?51:16),playable=node.type==='tune'||node.kind==='audio',line=h('div',{class:'hello-graph-node-title'},h('strong',{},node.label)),copy=h('div',{class:'hello-graph-node-copy'},h('small',{},nodeTypeLabel(node)),line);
    if(playable)line.append(h('span',{class:'hello-graph-play-measure'},'▶'));
    copy.style.cssText='position:absolute;visibility:hidden;width:'+textWidth+'px;pointer-events:none';root.append(copy);
    const measured=copy.offsetHeight;copy.remove();
    const units=[...node.label].reduce((n,char)=>n+(/\s/.test(char)?4:/[\u0000-\u007f]/.test(char)?7.8:13),0);
    return Math.max(64,Math.ceil(measured||(Math.max(Math.ceil(units/Math.max(30,textWidth-(playable?32:0)))*16.25,playable?28:0)+17))+12);
  }
  function draw(){
    const focus=byId.get(current);if(!focus)return;
    const rhymeIds=focus.type==='rhyme'?[focus.id]:focus.type==='extension'?[]:focus.type==='part'?data.rhymes.filter(r=>(r.partIds||[]).includes(focus.id)).map(r=>r.id):focus.type==='book'?data.rhymes.filter(r=>r.bookId===focus.id).map(r=>r.id):undefined;
    const suggested=node=>hello.tuneIsSuggested(data,node.value,rhymeIds),highlighted=node=>suggested(node)&&hello.tuneIsHighlighted(data,node.value,rhymeIds);
    const all=neighbors(graph,current),selected=kind==='all'?all:all.filter(r=>r.node.type===kind),visible=selected;
    title.textContent=nodeTypeLabel(focus)+' · '+focus.label;title.removeAttribute('data-tune-suggested');title.removeAttribute('data-tune-highlighted');if(focus.type==='tune'){title.dataset.tuneSuggested=String(suggested(focus));title.dataset.tuneHighlighted=String(highlighted(focus));const audio=tuneButton(focus.value);if(audio)title.append(audio);}status.textContent=selected.length+' 个直接关联';back.disabled=!history.length;
    const columns=Math.min(Math.max(1,visible.length),width<600?2:3),gap=10,cardWidth=Math.min(180,Math.max(148,(width-30)/2)),focalWidth=200,focalHeight=nodeHeight(focus,focalWidth),rowHeights=[];
    for(let i=0;i<visible.length;i++)rowHeights[Math.floor(i/columns)]=Math.max(rowHeights[Math.floor(i/columns)]||64,nodeHeight(visible[i].node,cardWidth));
    const rowTops=[];let height=focalHeight+48;for(const rowHeight of rowHeights){rowTops.push(height);height+=rowHeight+32;}height=Math.max(focalHeight+24,height-20);
    worldWidth=Math.max(focalWidth+20,columns*cardWidth+(columns-1)*gap+24);worldHeight=height;boardHeight=Math.max(280,Math.min(480,Math.round(window.innerHeight*.52)));
    const board=svg('svg',{viewBox:'0 0 '+width+' '+boardHeight,width:'100%',height:boardHeight,role:'group','aria-label':'以'+focus.label+'为中心的全部直接关联'});group=svg('g');board.append(group);
    focalCenter=worldWidth/2;const focal={x:focalCenter,y:8+focalHeight/2,w:focalWidth,h:focalHeight},gridWidth=columns*cardWidth+(columns-1)*gap,gridLeft=(worldWidth-gridWidth)/2;
    const positions=visible.map((row,i)=>{const r=Math.floor(i/columns);return {row,x:gridLeft+(i%columns)*(cardWidth+gap)+cardWidth/2,y:rowTops[r]+rowHeights[r]/2,w:cardWidth,h:rowHeights[r]};});
    for(const [i,item] of positions.entries()){const fromY=focal.y+focal.h/2,toY=item.y-item.h/2,lane=Math.max(6,gridLeft-6),path=i<columns?'M '+focal.x+' '+fromY+' C '+focal.x+' '+(fromY+20)+' '+item.x+' '+(toY-20)+' '+item.x+' '+toY:'M '+focal.x+' '+fromY+' V '+(fromY+20)+' H '+lane+' V '+(toY-22)+' H '+item.x+' V '+toY;group.append(svg('path',{d:path,class:'hello-graph-edge'}));const label=svg('text',{x:item.x,y:toY-7,'text-anchor':'middle',class:'hello-graph-relation'},[item.row.relations.join(' / ')]);group.append(label);}
    function nodeShape(node,pos,isFocus){
      const previewable=!!node.materialId&&node.kind!=='reading-guide';
      const g=svg('g',{'data-hello-node':node.id,class:'hello-graph-node '+(isFocus?'is-focus ':'')+(node.kind==='audio'?'is-audio ':'')+'type-'+node.type,transform:'translate('+(pos.x-pos.w/2)+' '+(pos.y-pos.h/2)+')',role:node.type==='resource'&&node.kind!=='audio'&&!previewable?'link':'button',tabindex:0,'aria-label':(node.type==='resource'?(node.kind==='audio'?'播放':previewable?'预览':'打开'):'探索')+LABELS[node.type]+'：'+node.label});
      if(previewable)g.setAttribute('aria-haspopup','dialog');
      if(node.type==='tune'){g.setAttribute('data-tune-suggested',String(suggested(node)));g.setAttribute('data-tune-highlighted',String(highlighted(node)));}
      g.append(svg('rect',{width:pos.w,height:pos.h,rx:8}));
      let left=8,textWidth=pos.w-16;
      if(node.cover){g.append(svg('image',{href:asset(node.cover),x:7,y:8,width:32,height:44,preserveAspectRatio:'xMidYMid meet'}));left=44;textWidth=pos.w-left-7;}
      const fo=svg('foreignObject',{x:left,y:8,width:textWidth,height:pos.h-12}),div=document.createElement('div');div.setAttribute('xmlns','http://www.w3.org/1999/xhtml');div.className='hello-graph-node-copy';const small=document.createElement('small');small.textContent=nodeTypeLabel(node)+(node.type==='resource'&&node.kind!=='audio'&&!previewable?' ↗':'');const strong=document.createElement('strong');strong.textContent=node.label;const line=h('div',{class:'hello-graph-node-title'},strong);div.append(small,line);fo.append(div);g.append(fo);g.append(svg('title',{},[node.label]));
      if(node.kind==='audio'){
        g.removeAttribute('tabindex');g.setAttribute('role','group');const audio=audioButton(node);if(audio)line.append(audio);
      }else if(node.type==='tune'){
        g.removeAttribute('tabindex');g.setAttribute('role','group');
        if(!isFocus){const explore=h('button',{type:'button',class:'hello-graph-tune-title',onclick:e=>{e.stopPropagation();activate(node);}},node.label);strong.replaceWith(explore);g.addEventListener('click',()=>activate(node));}
        const audio=tuneButton(node.value);if(audio){audio.addEventListener('click',e=>e.stopPropagation());audio.addEventListener('keydown',e=>e.stopPropagation());line.append(audio);}
      }else if(!isFocus||node.type==='resource'){g.addEventListener('click',()=>activate(node));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(node);}});}else{g.removeAttribute('tabindex');g.setAttribute('role','img');}
      group.append(g);
    }
    nodeShape(focus,focal,true);for(const item of positions)nodeShape(item.row.node,item,false);
    canvas.replaceChildren(board);readable();
    const pointers=new Map();let pinch=null;
    const gesture=()=>{const [a,b]=[...pointers.values()],rect=board.getBoundingClientRect();return {distance:Math.hypot(b.x-a.x,b.y-a.y),center:{x:(a.x+b.x)/2-rect.left,y:(a.y+b.y)/2-rect.top}};};
    board.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){pinch=gesture();drag=null;for(const id of pointers.keys())board.setPointerCapture(id);return;}if(e.target.closest('[data-hello-node]'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:{...pan}};board.setPointerCapture(e.pointerId);});
    board.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2&&pinch){const next=gesture();scale(next.distance/Math.max(1,pinch.distance),pinch.center);pan.x+=next.center.x-pinch.center.x;pan.y+=next.center.y-pinch.center.y;pinch=next;applyTransform();return;}if(!drag||e.pointerId!==drag.id)return;pan={x:drag.pan.x+e.clientX-drag.x,y:drag.pan.y+e.clientY-drag.y};applyTransform();});
    const end=e=>{pointers.delete(e.pointerId);pinch=null;if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId);if(drag?.id===e.pointerId||!pointers.size)drag=null;};board.addEventListener('pointerup',end);board.addEventListener('pointercancel',end);board.addEventListener('lostpointercapture',e=>{pointers.delete(e.pointerId);pinch=null;drag=null;});
    board.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();const rect=board.getBoundingClientRect();scale(Math.exp(-e.deltaY*.01),{x:e.clientX-rect.left,y:e.clientY-rect.top});},{passive:false});
    list.replaceChildren(...all.map(row=>h('div',{class:'hello-graph-neighbor-row',...(row.node.type==='tune'?{'data-tune-suggested':String(suggested(row.node)),'data-tune-highlighted':String(highlighted(row.node))}:{})},h('span',{},row.relations.join(' / ')),row.node.kind==='audio'?h('strong',{},row.node.label):row.node.type==='resource'&&(!row.node.materialId||row.node.kind==='reading-guide')?h('a',{href:asset(row.node.url),target:'_blank',rel:'noopener noreferrer'},row.node.label+' ↗'):h('button',{type:'button',onclick:()=>activate(row.node),'aria-label':(row.node.materialId?'预览':'探索')+row.node.label},row.node.label),row.node.kind==='audio'?audioButton(row.node):row.node.type==='tune'?tuneButton(row.node.value):null,h('small',{},nodeTypeLabel(row.node)))));
    if(!selected.length)canvas.append(h('p',{class:'small-note'},'当前节点没有这一类关联，可切回全部关系。'));
  }
  draw();
  if(typeof ResizeObserver==='function'){let measuredLayout=false;const observer=new ResizeObserver(entries=>{if(!root.isConnected){observer.disconnect();return;}const next=Math.floor(entries[0].contentRect.width);if(next>=260&&(!measuredLayout||Math.abs(next-width)>1)){measuredLayout=true;width=next;draw();}});observer.observe(canvas);}
  return root;
}
return {buildGraph,focusId,neighbors,selection,render};
});
