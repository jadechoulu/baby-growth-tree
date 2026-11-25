import {source,tracks,ageRanges,rowsFor,visibleItems,itemAge,layoutItems} from './plan.mjs?v=20261125-controls3';
const site=window.XiaoyaSite;
const h=(tag,attrs={},...children)=>{const node=document.createElement(tag);for(const [key,value]of Object.entries(attrs)){if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);else if(value!==undefined)node.setAttribute(key,value);}for(const child of children.flat(Infinity))if(child!==null&&child!==undefined)node.append(child instanceof Node?child:String(child));return node;};
const button=(title,action,attrs={})=>h('button',{type:'button',onclick:action,...attrs},title);
const shell=site.createShell({sectionId:'education',siteRoot:'../',title:'成长时间线',activeId:'timeline',navigation:[{title:'全科规划',items:[{id:'timeline',label:'成长时间线',icon:'route',shortcut:true}]}],onNavigate:()=>{location.hash='timeline';}});
document.querySelector('#app').replaceChildren(shell.element);
shell.globalActions.append(site.createActionMenu(h('div',{},button('原始规划图',()=>openSource()))));
let subject='all',rangeId='all',variant='early',dialog=null,selectedAge=null;
let rowObserver;

function choices(values,value,action,label,showLabel=false){return h('div',{class:'timeline-choices',role:'group','aria-label':label},showLabel?h('span',{class:'timeline-filter-label'},label):null,values.map(item=>button(item.title,()=>action(item.id),{'aria-pressed':String(item.id===value),class:item.id===value?'selected':''})));}
function sourceButton(){return button('ⓘ',openSource,{class:'source-button',title:'查看原始规划图','aria-label':'查看原始规划图'});}
function openDialog(title,content){
 const previous=document.activeElement;
 const close=button('×',()=>dialog.close(),{class:'dialog-close','aria-label':'关闭'});
 dialog=h('dialog',{class:'education-dialog','aria-labelledby':'education-dialog-title'},h('header',{},h('h2',{id:'education-dialog-title'},title),close),content);
 dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{dialog.remove();dialog=null;if(previous?.isConnected)previous.focus({preventScroll:true});},{once:true});
 document.body.append(dialog);dialog.showModal();close.focus();
}
function openSource(){openDialog('原始规划图',h('div',{class:'source-content'},h('p',{},source.title+' · 第1页'),h('p',{class:'muted'},source.ageBasis+' 原PDF第2页为水印背景，未提取为规划。'),h('a',{href:source.pdf,target:'_blank',rel:'noopener'},'打开完整 PDF ↗'),h('a',{href:source.image,target:'_blank',rel:'noopener',class:'source-image-link','aria-label':'新页打开清晰原图'},h('img',{src:source.image,alt:source.title+'，语文、数学、英语、艺术、体育、科技的年龄规划原图',loading:'lazy'}))));}
function alignRows(chart){
 for(const body of chart.querySelectorAll('.row-track')){
  const nodes=[...body.querySelectorAll('.timeline-node')],heights=[];
  for(const node of nodes){const lane=Number(node.dataset.lane);heights[lane]=Math.max(heights[lane]||30,node.getBoundingClientRect().height);}
  const offsets=[];let offset=5;for(const height of heights){offsets.push(offset);offset+=(height||30)+6;}
  for(const node of nodes)node.style.top=offsets[Number(node.dataset.lane)]+'px';
  body.style.height=Math.max(44,offset+3)+'px';
 }
}
function ageGuide(chart,range){
 chart.querySelector('.age-guide')?.remove();
 for(const tick of chart.querySelectorAll('[data-age]'))tick.setAttribute('aria-pressed',String(Number(tick.dataset.age)===selectedAge));
 if(selectedAge===null||selectedAge<range.start||selectedAge>range.end)return;
 chart.append(h('div',{class:'age-guide','aria-hidden':'true',style:`--age-fraction:${(selectedAge-range.start)/(range.end-range.start)}`}));
}
function render(){
 const range=ageRanges.find(item=>item.id===rangeId),selected=subject==='all'?tracks:tracks.filter(track=>track.id===subject);
 const view=h('div',{class:'education-view'});
 view.append(h('header',{class:'intro'},h('div',{class:'title-line'},h('h1',{},'全科启蒙成长时间线'),sourceButton()),h('p',{class:'muted'},'从童年到青少年，看见每个方向怎样慢慢展开。')));
 const controls=h('div',{class:'timeline-controls'},choices([{id:'all',title:'全部学科'},...tracks],subject,value=>{subject=value;render();},'选择学科'),h('div',{class:'timeline-options'},choices(ageRanges,rangeId,value=>{rangeId=value;render();},'查看年龄',true)));
 view.append(controls,h('div',{class:'timeline-caption'},h('span',{},'点年龄显示定位线 · 再点取消'),h('span',{},'约龄参考，不是达标期限')));
 const scroll=h('div',{class:'timeline-scroll',tabindex:'0','aria-label':'全科规划时间线，可上下及左右滚动'}),chart=h('div',{class:'timeline-chart',style:`--years:${range.end-range.start};--chart-width:${(range.end-range.start)*62}px`});
 const axis=h('div',{class:'chart-axis'},h('div',{class:'axis-label'},'年龄 / 岁'));
 const ticks=h('div',{class:'age-axis'});
 for(let age=range.start;age<=range.end;age++){
  if(age===19)continue;
  const value=age;
  ticks.append(button(age===20?'18＋':age,()=>{selectedAge=selectedAge===value?null:value;ageGuide(chart,range);},{style:`left:${100*(age-range.start)/(range.end-range.start)}%`,class:age===range.end?'last-tick':age===range.start?'first-tick':'','data-age':age,'aria-label':age===20?'定位18岁以后':'定位'+age+'岁','aria-pressed':String(selectedAge===age)}));
 }
 axis.append(ticks);chart.append(axis);
 for(const track of selected){
  const rows=rowsFor(track,variant).filter(row=>visibleItems(row,range).length);
  const heading=h('div',{class:'track-heading',style:`--track-color:${track.color}`},h('h2',{},h('span',{class:'track-dot'}),track.title,track.id==='english'?h('small',{},track.variants.find(v=>v.id===variant).title):null),h('p',{},track.intro));
  if(track.id==='english')heading.append(choices(track.variants,variant,value=>{const top=scroll.scrollTop,left=scroll.scrollLeft;variant=value;render();const next=shell.content.querySelector('.timeline-scroll');next.scrollTop=top;next.scrollLeft=left;},'英语起步年龄',true));
  chart.append(heading);
  if(!rows.length)chart.append(h('p',{class:'empty-row'},'此年龄段原图未列安排。'));
  for(const row of rows){
   const items=layoutItems(visibleItems(row,range)),lanes=Math.max(1,...items.map(item=>item.lane+1));
   const label=h('div',{class:'row-title'},row.title);
   const body=h('div',{class:'row-track',style:`height:${lanes*38+8}px;--track-color:${track.color}`});
   for(const item of items){const start=Math.max(range.start,item.start),end=Math.min(range.end,item.end);
    const node=h('div',{class:'timeline-node','data-lane':item.lane,style:`left:${100*(start-range.start)/(range.end-range.start)}%;width:calc(${100*(end-start)/(range.end-range.start)}% - 4px);top:${item.lane*38+5}px`,title:item.title+' · '+itemAge(item),'aria-label':track.title+'，'+row.title+'，'+item.title+'，'+itemAge(item),},item.title,item.note?h('small',{class:'node-note'},item.note):null);body.append(node);
   }
   chart.append(h('div',{class:'chart-row'},label,body));
  }

 }
 scroll.append(chart);view.append(scroll,h('p',{class:'source-note'},'来源：阿留教育规划《规划总结横纵表》。年龄按原图刻度近似整理；原图不同路线及并行安排分别保留，不代表已选课程或个人完成进度。'));
 rowObserver?.disconnect();
 shell.content.replaceChildren(view);ageGuide(chart,range);alignRows(chart);
 if(window.ResizeObserver){rowObserver=new ResizeObserver(()=>alignRows(chart));rowObserver.observe(chart);}
}
render();
