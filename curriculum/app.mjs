import { grades, subjects, types, phases, goals, milestones, abilityMetrics, discrepancies, materials } from './plan.mjs?v=20261118-unified-tabs';
import { goalCurve } from './charts.mjs?v=20261118-unified-tabs';
import { statuses, materialKey, goalKey, statusOf, filterMaterials, summary, validateBackup } from './model.mjs?v=20261118-books';
import { createStore, empty } from './store.mjs?v=20261118-books';
import { loadCatalog, groupsFor, ownBookState, ownBookUpdate } from './catalog.mjs?v=20261118-books';
import { catalogIndex } from './catalog-index.mjs?v=20261118-poetry-cover';
import { createEnglishBooks } from './english-records.mjs?v=20261118-books';
const site=window.XiaoyaSite, store=createStore(window.indexedDB), profile=window.XiaoyaBabyProfile.createClient();
let data=empty(), ready=false, view='goals', grade='junior', subject='', phase='', type='', status='', search='', layout='cards';
let activeDialog=null, selection=new Set(), listGeneration=0;
let goalMode='chart';
const curveMetrics=new Map();
const compact=window.matchMedia('(max-width:1100px)');
let overviewOpen=!compact.matches, overviewTouched=false;
compact.addEventListener('change',()=>{if(!overviewTouched){overviewOpen=!compact.matches;if(view==='goals'&&!activeDialog)render();}});
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('xiaoya-curriculum'):null;
let englishBooks,englishSnapshot,englishSubscription;
const h=(tag,attrs={},...children)=>{
 const node=document.createElement(tag);
 for(const [key,value] of Object.entries(attrs)) {
  if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);
  else if(key==='class')node.className=value;
  else if(key==='value')node.value=value;
  else if(value!==false&&value!=null)node.setAttribute(key,value===true?'':String(value));
 }
 for(const child of children.flat(Infinity))if(child!=null)node.append(child instanceof Node?child:document.createTextNode(String(child)));
 return node;
};
const button=(text,action,attrs={})=>h('button',{type:'button',onClick:action,...attrs},text);
const small=text=>h('p',{class:'muted'},text);
const pill=text=>h('span',{class:'pill'},text);
const notice=h('div',{class:'curriculum-notice',role:'status','aria-live':'polite'});
function message(text,error=false){ notice.textContent=text;notice.classList.toggle('error',error); }
function chooser(label,entries,value,onChange,all){
 const select=h('select',{'aria-label':label,onChange:event=>onChange(event.target.value)});
 if(all)select.append(h('option',{value:''},all));
 for(const [id,title]of Object.entries(entries))select.append(h('option',{value:id},title));
 select.value=value;return select;
}
function choices(entries,value,action,label){
 return h('div',{class:'choice-row',role:'group','aria-label':label},Object.entries(entries).map(([id,title])=>button(title,()=>action(id),{'aria-pressed':String(id===value),class:id===value?'chosen':''})));
}
const navigation=[{title:'一起探索全科',items:[{id:'goals',label:'三年目标',icon:'route',shortcut:true},{id:'phases',label:'小班全年计划',icon:'source',shortcut:true},{id:'materials',label:'计划素材',icon:'book',shortcut:true},]}];
const viewIds=[...navigation.flatMap(group=>group.items.map(item=>item.id)),'sources'];
const shell=site.createShell({sectionId:'curriculum',siteRoot:'../',navigation,activeId:view,onNavigate:navigate});
document.querySelector('#app').replaceChildren(shell.element);
const settings=h('div',{class:'settings-actions'},button('宝宝资料',()=>editProfile(),{'aria-label':'编辑宝宝资料'}),button('导出全科备份',()=>backup()),button('导入全科备份',()=>importDialog()),button('已移除候选',()=>removedDialog()),small('全科状态、手记和补充书目保存在当前浏览器，可单独导入导出，尚未接入云同步。英语公共单册共用英语原记录、备份与同步。'));
shell.globalActions.append(site.createActionMenu(settings));
function navigate(next){
 if(activeDialog)return;
 view=next;selection.clear();if(next==='phases')grade='junior';
 location.hash=next;render();window.scrollTo({top:0,behavior:'instant'});
}
function allMaterials(){return [...materials,...data.custom.filter(x=>!x.deleted)];}
function currentItems(extra={}) {return filterMaterials(allMaterials(),data.records,{grade,subject,phase:view==='materials'?phase:'',type:view==='materials'?type:'',status:view==='materials'?status:'',search:view==='materials'?search:'',...extra});}
async function save(changes,expected=data){
 if(!ready)throw new Error('记录尚未读取成功，请重试后保存。');
 data=await store.save(changes,expected);channel?.postMessage('saved');message('已保存到当前浏览器');
}
function titleBlock(title,description){return h('header',{class:'intro'},h('span',{class:'eyebrow'},'一起探索，慢慢长大'),h('div',{class:'title-row'},h('h1',{},title),view!=='sources'?button('📄',()=>navigate('sources'),{class:'source-icon','aria-label':'查看原始计划文档',title:'原始文档'}):null),small(description));}
function filters(){
 return h('div',{class:'plan-filters'},choices(grades,grade,value=>{grade=value;phase='';selection.clear();render();},'选择班级'),choices({'':'全科',...subjects},subject,value=>{subject=value;selection.clear();render();},'选择学科'));
}
function render(){
 const focused=document.activeElement;
 const focusKey=focused?.getAttribute('data-site-item')||focused?.getAttribute('aria-label');
 const focusText=focused?.tagName==='BUTTON'?focused.textContent:null;
 shell.update({activeId:view,title:{goals:'三年目标',phases:'小班全年计划',materials:'计划素材',sources:'原始文档'}[view]});
 shell.content.replaceChildren(notice);
 if(!ready&&view!=='sources'){shell.content.append(titleBlock('全科启蒙','正在读取本机记录…'));return;}
 if(view==='sources')renderSources();else if(view==='materials')renderMaterials();else if(view==='phases')renderPhases();else renderGoals();
 if(focusKey){const candidates=[...shell.element.querySelectorAll('button,select,input,[data-chart-point]')];candidates.find(el=>(el.getAttribute('data-site-item')||el.getAttribute('aria-label'))===focusKey)?.focus({preventScroll:true});}else if(focusText){[...shell.content.querySelectorAll('button')].find(el=>el.textContent===focusText)?.focus({preventScroll:true});}
}
function renderGoals(){
 shell.content.append(titleBlock('三年有方向，每天一小步','语文慢速打底，英语持续输入，数学在游戏里理解。选择班级和学科，查看目标与对应素材。'),choices({chart:'目标曲线',details:'目标详情'},goalMode,value=>{goalMode=value;render();},'目标查看方式'),filters());
 if(goalMode==='chart'){renderGoalCurves();return;}
 const gradeIndex=Object.keys(grades).indexOf(grade);
 const lanes=h('section',{class:'milestones','aria-label':'三年目标刻度'});
 for(const milestone of milestones){
  if(subject&&milestone.subject!==subject)continue;
  lanes.append(h('article',{class:'milestone'},h('div',{class:'milestone-head'},h('strong',{},milestone.title),h('span',{},Number.isFinite(milestone.baseline)?`起始 ${milestone.baseline}${milestone.unit}`:milestone.basis)),h('div',{class:'milestone-stops'},milestone.values.map((value,i)=>h('div',{class:i===gradeIndex?'active':''},h('span',{},Object.values(grades)[i]),h('strong',{},value.toLocaleString()),h('span',{},milestone.unit),h('meter',{min:0,max:milestone.max,value,'aria-label':`${Object.values(grades)[i]}目标${value}${milestone.unit}`}))))));
 }
 if(lanes.childElementCount)shell.content.append(h('details',{class:'goal-landscape',open:overviewOpen},h('summary',{onClick:()=>{overviewOpen=!overviewOpen;overviewTouched=true;}},'三年量化目标对照'),lanes,small('以上刻度表示计划目标，起始数据来自家长提供的基础，不是已完成进度。')));
 const grid=h('section',{class:'subjects-grid'});
 for(const [subjectId,name]of Object.entries(subjects)){
  if(subject&&subject!==subjectId)continue;
  const targets=goals[grade][subjectId],done=targets.filter(g=>statusOf(data.records,goalKey(g.id,grade,subjectId))==='done').length;
  const items=currentItems({subject:subjectId,phase:'',type:'',status:'',search:''}),s=summary(items,data.records);
  const card=h('article',{class:`subject-card subject-${subjectId}`},h('header',{},h('h2',{},name),pill(`${done}/${targets.length}项目标已完成`)),h('progress',{max:targets.length,value:done,'aria-label':`${name}已确认完成${done}项目标，共${targets.length}项`}));
  card.append(h('h3',{class:'section-label'},'学习要求'));
  for(const target of targets){
   const key=goalKey(target.id,grade,subjectId),complete=statusOf(data.records,key)==='done';
   card.append(h('div',{class:'goal-row'},button(complete?'✓':'○',async event=>{try{await save({records:{[key]:{status:complete?'planned':'done'}}});render();}catch(error){message(error.message,true);}},{class:'goal-check','aria-label':`${complete?'撤回':'确认完成'}${name}：${target.title}`,'aria-pressed':String(complete)}),h('div',{},h('h3',{},target.title),h('strong',{class:'goal-summary'},target.summary),small(target.detail))));
  }
  card.append(h('section',{class:'goal-materials'},h('h3',{class:'section-label'},'配套素材'),small('点开书籍套系查看单本；学习要求单独确认。'),items.map(item=>materialDisclosure(item))));
  card.append(button(`进入${name}素材页 · ${s.total}项 →`,()=>{subject=subjectId;phase='';type='';status='';search='';navigate('materials');},{class:'material-link'}));grid.append(card);
 }
 shell.content.append(grid,small('目标由家长独立确认。素材完成与目标完成分别记录，不按素材数量判断孩子能力。'),sourceNotes());
}
function renderGoalCurves(){
 shell.content.append(small('从起始基础到小班、中班、大班，看清三年目标的变化。点选节点查看该班要求，突出节点对应当前班级。'));
 const grid=h('section',{class:'curves-grid','aria-label':'三年目标曲线'});
 for(const [subjectId,name]of Object.entries(subjects)){
  if(subject&&subject!==subjectId)continue;
  const metrics=[...milestones,...abilityMetrics].filter(metric=>metric.subject===subjectId);
  if(!metrics.length)continue;
  let chosen=metrics.find(metric=>metric.id===curveMetrics.get(subjectId))||metrics[0];
  const panelId='curve-panel-'+subjectId,panel=h('section',{id:panelId,role:'tabpanel'});
  const tabs=h('div',{class:'curve-tabs',role:'tablist','aria-label':name+'曲线指标'});
  const card=h('article',{class:`curve-card subject-${subjectId}`},h('header',{},h('h2',{},name+'目标曲线')),tabs,panel);
  const selectMetric=(index,focus=false)=>{
   chosen=metrics[index];curveMetrics.set(subjectId,chosen.id);
   for(const [i,tab]of [...tabs.children].entries()){tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;}
   if(focus){tabs.children[index].focus({preventScroll:true});tabs.children[index].scrollIntoView({block:'nearest',inline:'nearest'});}
   draw();
  };
  for(const [index,metric]of metrics.entries())tabs.append(button(metric.title,()=>selectMetric(index),{id:'curve-tab-'+metric.id,role:'tab','aria-controls':panelId,'aria-selected':String(metric===chosen),tabindex:metric===chosen?'0':'-1',onKeydown:event=>{
   let next;
   if(event.key==='ArrowRight')next=(index+1)%metrics.length;
   if(event.key==='ArrowLeft')next=(index+metrics.length-1)%metrics.length;
   if(event.key==='Home')next=0;
   if(event.key==='End')next=metrics.length-1;
   if(next!==undefined){event.preventDefault();selectMetric(next,true);}
  }}));
  function draw(){
   const metric=chosen,index=Object.keys(grades).indexOf(grade);
   const target=goals[grade][subjectId].find(goal=>goal.id===metric.goalId);
   const ability=metric.kind==='ability',value=ability?target.summary:metric.values[index],previous=ability?undefined:index?metric.values[index-1]:metric.baseline;
   const change=metric.basis==='累计目标'&&Number.isFinite(previous)?` · 本学年新增${value-previous}${metric.unit}`:'';
   panel.setAttribute('aria-labelledby','curve-tab-'+metric.id);
   panel.replaceChildren(h('div',{class:'curve-measure'},h('h3',{},metric.title),h('span',{class:'curve-basis'},metric.basis)),goalCurve(metric,{grade,onSelect:next=>{grade=next;render();}}),h('div',{class:'curve-detail'},h('strong',{},`${grades[grade]} · ${value.toLocaleString()}${metric.unit||''}${change}`),small(target.detail),button(`查看${grades[grade]}${name}要求与书目 →`,()=>{subject=subjectId;goalMode='details';render();},{class:'curve-details-link'})));
  }
  draw();
  grid.append(card);
  requestAnimationFrame(()=>{if(!tabs.isConnected)return;const active=tabs.querySelector('[aria-selected=true]');if(active.offsetLeft+active.offsetWidth>tabs.clientWidth)tabs.scrollLeft=active.offsetLeft+active.offsetWidth-tabs.clientWidth+2;});
 }
 shell.content.append(grid,small('各科目标在图内切换。数字曲线展示计划数量，能力节点展示小、中、大班要求；点选节点查看详情。'));
 shell.content.append(sourceNotes());
}
function sourceNotes(){
 return h('details',{class:'source-notes'},h('summary',{},'计划来源与原文口径说明'),small('来源：你提供的《幼儿园小班全科启蒙全年详细计划》。下列差异保留供核对，目标可随兴趣和实际理解调整。点击标题旁的 📄 可查看完整原文。'),h('ul',{},discrepancies.map(x=>h('li',{},x))));
}
function renderSources(){
 shell.content.append(titleBlock('原始文档','幼儿园小班全科启蒙全年详细计划'),small('原始 Excel 文件在线查看。原文中重复的内容、数字差异与素材安排均保留，可与三年目标、全年计划对照查看。'));
 const host=h('div',{class:'xlsx-viewer'},h('p',{class:'muted'},'正在加载 Excel…'));
 const downloadBar=h('div',{class:'xlsx-toolbar'},h('a',{href:'./plan.xlsx',download:'幼儿园小班全科启蒙全年详细计划.xlsx',class:'download-xlsx'},'下载 Excel 文件 ↓'));
 shell.content.append(downloadBar,host,sourceNotes());
 fetch('./plan.xlsx').then(r=>r.arrayBuffer()).then(buf=>{
  const wb=XLSX.read(buf,{type:'array'}),tabs=h('div',{class:'xlsx-tabs',role:'tablist'}),panels=h('div',{class:'xlsx-panels'});
  let active=0;
  const sheets=wb.SheetNames.map((name,i)=>{
   const ws=wb.Sheets[name];const html=XLSX.utils.sheet_to_html(ws,{editable:false});
   const panel=h('div',{class:'xlsx-panel',role:'tabpanel',hidden:i!==0});
   panel.innerHTML=html;
   const tab=h('button',{type:'button',role:'tab','aria-selected':String(i===0),tabindex:i===0?'0':'-1',onClick:()=>{
    active=i;[...tabs.children].forEach((t,j)=>{t.setAttribute('aria-selected',String(j===i));t.tabIndex=j===i?0:-1;});
    [...panels.children].forEach((p,j)=>p.hidden=j!==i);
   }},name);
   return{tab,panel};
  });
  tabs.append(...sheets.map(s=>s.tab));
  panels.append(...sheets.map(s=>s.panel));
  host.replaceChildren(tabs,panels);
 }).catch(err=>host.replaceChildren(h('p',{class:'error'},'Excel 加载失败：'+err.message)));
}
function renderPhases(){
 shell.content.append(titleBlock('小班全年计划','上学期 → 寒假 → 下学期 → 暑假。中班、大班的年度目标可在「三年目标」查看。'),choices({'':'全科',...subjects},subject,value=>{subject=value;render();},'选择学科'));
 const timeline=h('section',{class:'phase-timeline','aria-label':'小班四阶段时间线'},phases.map(p=>button([h('strong',{},p.title),h('span',{},p.months),h('span',{},`听力 ${p.hours}h`)],()=>document.getElementById(`phase-${p.id}`).scrollIntoView({behavior:'smooth',block:'start'}))));
 shell.content.append(timeline,small('全年英语听力计划：80 + 45 + 80 + 95 = 300 小时。听力输入包含共读、音频与动画。'));
 const grid=h('div',{class:'phases-grid'});
 for(const p of phases){
  const card=h('article',{class:'phase-card',id:`phase-${p.id}`},h('header',{},h('div',{},h('h2',{},p.title),small(p.months)),pill(p.focus)));
  for(const [subjectId,name]of Object.entries(subjects)){
   if(subject&&subject!==subjectId)continue;
   const items=filterMaterials(allMaterials(),data.records,{grade:'junior',subject:subjectId,phase:p.id});
   card.append(h('section',{},h('h3',{},name),h('ul',{},p[subjectId].map(x=>h('li',{},x))),h('div',{class:'material-chips'},items.map(x=>button(x.title,()=>detail(x),{'aria-label':`查看${p.title}${x.title}素材`}))),button(`筛选本阶段${name}素材 →`,()=>{grade='junior';subject=subjectId;phase=p.id;type='';status='';search='';navigate('materials');},{class:'text-link'})));
  }
  grid.append(card);
 }
 shell.content.append(grid,sourceNotes());
}
function renderMaterials(){
 shell.content.append(titleBlock('计划素材','点开书籍套系，按本勾选完成；动画、教具和选材方向另行标明。也可以添加候选、比较选用。'),filters());
 const toolbar=h('div',{class:'library-filters'},chooser('素材类型',types,type,v=>{type=v;selection.clear();updateResults();},'全部类型'),chooser('素材状态',statuses,status,v=>{status=v;selection.clear();updateResults();},'全部状态'),chooser('小班阶段',Object.fromEntries(phases.map(x=>[x.id,x.title])),phase,v=>{phase=v;grade='junior';render();},'全年阶段'),h('input',{type:'search',placeholder:'搜索名称、级别或说明','aria-label':'搜索全科素材',value:search,onInput:event=>{search=event.target.value;selection.clear();updateResults();}}),button('重置',()=>{subject='';phase='';type='';status='';search='';selection.clear();render();}),button('＋ 候选素材',()=>customDialog(),{class:'primary'}),button(layout==='cards'?'切换列表':'切换卡片',()=>{layout=layout==='cards'?'list':'cards';updateResults();},{'aria-label':'切换素材布局'}));
 shell.content.append(toolbar);
 const result=h('div',{id:'material-results'});shell.content.append(result);updateResults();
}
function updateResults(){
 const host=document.getElementById('material-results');if(!host)return;
 const focusLabel=host.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
 const generation=++listGeneration,items=currentItems(),s=summary(items,data.records);
 const validKeys=new Set(items.map(x=>x.key));selection=new Set([...selection].filter(k=>validKeys.has(k)));
 host.replaceChildren();
 const selectedLabel=h('span',{id:'selected-count'},`已选 ${selection.size} 项`);
 const batchStatus=chooser('批量设置素材状态',statuses,'planned',()=>{});
 host.append(h('div',{class:'library-summary'},h('span',{},`${grades[grade]} · ${items.length}项素材 · 进行中 ${s.using} · 已完成 ${s.done}`),h('label',{class:'select-all'},h('input',{type:'checkbox','aria-label':'选择当前筛选全部素材',checked:items.length>0&&selection.size===items.length,onChange:event=>{selection=event.target.checked?new Set(items.map(x=>x.key)):new Set();updateResults();}}),'全选筛选结果')),
 h('div',{class:'batch-bar'},selectedLabel,batchStatus,button('批量设置',async()=>{if(!selection.size){message('请先勾选素材');return;}try{await save({records:Object.fromEntries([...selection].map(key=>[key,{status:batchStatus.value}]))});selection.clear();updateResults();}catch(error){message(error.message,true);}})));
 if(!items.length){host.append(h('div',{class:'empty'},h('h2',{},'这次筛选还没有素材'),small('换个班级、学科或状态试试，也可以添加候选素材。')));return;}
 const grid=h('div',{class:'material-grid '+layout});host.append(grid);
 const append=(start,end)=>{if(generation===listGeneration)grid.append(...items.slice(start,end).map(materialCard));};append(0,18);
 host.append(window.EnglishAutomaticList.tail({total:items.length,limit:18,step:18,load:append}));
 if(focusLabel)[...host.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===focusLabel)?.focus({preventScroll:true});
}
function materialCard(item){
 const state=statusOf(data.records,item.key);
 const check=h('input',{type:'checkbox','aria-label':`选择${item.title} · ${grades[item.ref.grade]}`,checked:selection.has(item.key),onChange:event=>{event.target.checked?selection.add(item.key):selection.delete(item.key);document.getElementById('selected-count').textContent=`已选 ${selection.size} 项`;}});
 const choose=chooser(`${item.title} · ${grades[item.ref.grade]}的状态`,statuses,state,async next=>{try{await save({records:{[item.key]:{status:next}}});updateResults();}catch(error){choose.value=state;message(error.message,true);}});
 const cover=catalogIndex[item.id]?.cover;
 return h('article',{class:`material-card subject-${item.subject}`},h('header',{},check,pill(subjects[item.subject]),h('span',{class:'material-type'},materialKind(item))),button([cover?h('img',{class:'material-cover',src:cover,alt:item.title+'套系封面',loading:'lazy',onError:event=>event.target.remove()}):null,h('strong',{},item.title)],()=>detail(item),{class:'material-title','aria-label':`查看${item.title}的${isBook(item)?'书目与完成记录':'安排'}`}),small(item.ref.level||'按兴趣与理解选择内容'),h('div',{class:'material-meta'},pill(grades[item.ref.grade]),item.ref.phases.length?item.ref.phases.map(id=>h('span',{},phases.find(p=>p.id===id)?.title)):h('span',{},'年度安排')),button(isBook(item)?'展开书目 →':'查看安排 →',()=>detail(item),{class:'book-entry'}),h('label',{class:'execution-state'},'计划使用状态',h('div',{class:`material-state state-${state}`},choose)),data.records[item.key]?.note?small('手记：'+data.records[item.key].note):null);
}
function isBook(item){return ['reader','picture','poem','workbook'].includes(item.type)&&!['fiction-cn','nonfiction-cn'].includes(item.id);}
function materialKind(item){return ['fiction-cn','nonfiction-cn','phonics'].includes(item.id)?'选材方向':isBook(item)?'书籍套系':types[item.type];}
function materialDisclosure(item){
 const host=h('div',{class:'series-body'});let loaded=false;
 const fold=h('details',{class:'material-disclosure',open:seriesFolds.get(seriesKey(item))||false,onToggle:()=>{seriesFolds.set(seriesKey(item),fold.open);if(fold.open&&!loaded){loaded=true;if(isBook(item))void seriesBooks(host,item);else host.append(small(item.note||item.ref.level),button('查看安排与状态',()=>detail(item)));}}},h('summary',{},h('span',{},h('strong',{},item.title),h('small',{},item.ref.level)),h('span',{class:'disclosure-kind'},isBook(item)?'展开书目':materialKind(item))),host);
 return fold;
}
async function sharedEnglish(){
 if(!englishBooks)englishBooks=createEnglishBooks({profileClient:profile,notify:error=>{if(error)message('英语单册已保存在本机；'+error.message,true);}});
 if(!englishSubscription)englishSubscription=englishBooks.subscribe(()=>void englishBooks.read().then(snapshot=>{englishSnapshot=snapshot;refreshBookControls();}).catch(error=>message(error.message,true)));
 englishSnapshot=await englishBooks.read();
}
const bookControls=new WeakMap(),seriesViews=new Map(),seriesFolds=new Map();
const seriesKey=item=>item.id+':'+item.ref.grade;
function refreshBookControls(){for(const row of document.querySelectorAll('.book-row'))bookControls.get(row)?.();}
function personalCatalog(item){
 try {const value=JSON.parse(data.records['catalog:'+item.id+':'+item.ref.grade]?.note||'null');if(!value||typeof value.title!=='string'||!Array.isArray(value.books)||!value.books.every(b=>typeof b.id==='string'&&b.id.startsWith('personal-')&&typeof b.title==='string'))return null;return {id:'personal-'+item.id+':'+item.ref.grade,title:value.title,edition:value.title,note:'家长补充的手头书目',books:value.books.map(({id,title})=>({id,title}))};}catch{return null;}
}
async function seriesBooks(host,item){
 host.replaceChildren(small('正在读取书目…'));
 try{
  const result=await loadCatalog(item.id);if(!host.isConnected)return;
  const groups=groupsFor(result.groups,item,view==='materials'?phase:'');
  const personal=personalCatalog(item);if(personal)groups.push(personal);
  if(groups.some(group=>group.english))await sharedEnglish();if(!host.isConnected)return;
  const panel=h('div',{class:'book-catalog'}),list=h('div'),info=h('p',{class:'muted',role:'status'});
  if(item.id==='little-sheep'&&item.ref.grade==='senior')panel.append(small('当前公共目录已核对至第7级；原计划的第8—10级待补，可补充手头书目。'));
  const preference=seriesViews.get(seriesKey(item))||{};
  let chosen=groups.some(g=>g.id===preference.chosen)?preference.chosen:groups[0]?.id||'',query=preference.query||'',completion=preference.completion||'';
  const remember=()=>seriesViews.set(seriesKey(item),{chosen,query,completion});
  const picker=chooser(item.title+'的目录版本',Object.fromEntries(groups.map(group=>[group.id,group.title+' · '+group.books.length+'本'])),chosen,value=>{chosen=value;draw();},groups.length>1?'选择级别 / 版本':null);
  const searchBox=h('input',{type:'search',placeholder:'搜索本目录书名','aria-label':item.title+'的单册搜索',value:query,onInput:event=>{if(event.isComposing)return;query=event.target.value;draw();},onCompositionend:event=>{query=event.target.value;draw();}});
  const doneFilter=chooser('筛选单册完成状态',{'':'全部单本',open:'未完成',done:'已完成'},completion,value=>{completion=value;draw();});
  if(groups.length)panel.append(h('div',{class:'book-toolbar'},picker,doneFilter,searchBox),info,list);
  else panel.append(small('这项素材的逐册版本尚未核定，可以先补充手头书目，再按本记录。'));
  panel.append(button('＋ 补充手头书目',()=>manualBooks(host,item),{class:'text-link'}));
  host.replaceChildren(panel);
  let generation=0;
  function draw(){
   remember();
   const current=++generation,group=groups.find(g=>g.id===chosen);list.replaceChildren();
   if(!group){info.textContent='请选择要展开的级别或版本。';list.append(h('div',{class:'catalog-options'},groups.map(g=>button(g.title+' · '+g.books.length+'本',()=>{chosen=g.id;picker.value=chosen;draw();}))));return;}
   const state=book=>group.english?englishBooks.state(englishSnapshot,book,group):{done:ownBookState(data.records,book)};
   const books=group.books.filter(book=>(!query||book.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))&&(!completion||(completion==='done')===state(book).done));
   const progress=()=>{info.textContent=`本目录已完成 ${group.books.filter(book=>state(book).done).length} / ${group.books.length} 本 · 当前匹配 ${books.length} 本`;};progress();
   list.append(small(group.edition||group.title));
   if(group.note)list.append(small(group.note));
   if(group.english)list.append(small('与英语启蒙共用单册完成记录。'));
   const rows=h('div',{class:'book-rows'});list.append(rows);
   const append=(start,end)=>{if(current!==generation||!host.isConnected)return;rows.append(...books.slice(start,end).map(book=>{
    const check=h('input',{type:'checkbox','aria-label':'完成单本：'+book.title});
    const badge=h('span',{class:'book-completion'}),count=h('small');
    const row=h('div',{class:'book-row'},h('label',{},check,book.cover?h('img',{src:book.cover,alt:book.title+'封面',loading:'lazy',onError:event=>event.target.remove()}):null,h('span',{},h('strong',{},book.title),book.level?h('small',{},'级别 '+book.level):null,badge,count)));
    const refresh=()=>{const value=state(book);check.checked=value.done;check.disabled=!!value.external?.length;badge.textContent=value.external?.length?'小花生已读':value.done?'已完成':'';count.textContent=value.readCount>1?value.readCount+'次':'';progress();};
    bookControls.set(row,refresh);refresh();
    check.addEventListener('change',async()=>{const done=check.checked;check.disabled=true;try{if(group.english)englishSnapshot=await englishBooks.set(book,done,group);else await save({records:ownBookUpdate(book,done)});refreshBookControls();if(completion)draw();}catch(error){message(error.message,true);}finally{refresh();}});
    return row;
   }));};append(0,18);
   if(!books.length)list.append(small('没有匹配的单本。'));
   list.append(window.EnglishAutomaticList.tail({total:books.length,limit:18,step:18,load:append}));
   if(group.sourceUrl)list.append(h('a',{href:group.sourceUrl,target:'_blank',rel:'noopener',class:'catalog-source'},'查看目录来源 ↗'));
  }
  if(groups.length)draw();
 }catch(error){if(host.isConnected)host.replaceChildren(small(error.message),button('重试读取书目',()=>void seriesBooks(host,item)));}
}
function manualBooks(host,item){
 const base=structuredClone(data),original=personalCatalog(item),version=h('input',{'aria-label':'手头书目的版本名称',value:original?.title||item.ref.level||'我的书目'}),names=h('textarea',{rows:6,'aria-label':'逐本书名，一行一本',placeholder:'输入实际书名，一行一本'});names.value=original?.books.map(book=>book.title).join('\n')||'';
 const error=h('p',{class:'error',role:'alert'}),form=h('div',{class:'manual-books'},h('h4',{},'补充手头书目'),small('填写实际书名，每行一本；只保存在你的全科记录中。'),h('label',{},'版本名称',version),h('label',{},'逐本书名',names),error,button('保存书目',async()=>{const titles=[...new Set(names.value.split('\n').map(s=>s.trim()).filter(Boolean))];if(!version.value.trim()||!titles.length){error.textContent='请填写版本名称和至少一本书名。';return;}const group={id:'personal-'+item.id+':'+item.ref.grade,title:version.value.trim(),edition:version.value.trim(),note:'家长补充的手头书目',books:titles.map(title=>original?.books.find(book=>book.title===title)||{id:'personal-'+crypto.randomUUID(),title})};try{await save({records:{['catalog:'+item.id+':'+item.ref.grade]:{status:'planned',note:JSON.stringify(group)}}},base);const dialog=host.closest('dialog');if(dialog&&!dialog.querySelector('form[data-dirty=true]'))dialog.dataset.dirty='false';await seriesBooks(host,item);}catch(failure){error.textContent=failure.message;}},{class:'primary'}),button('取消补充',()=>void seriesBooks(host,item)));
 host.replaceChildren(form);
}
function modal(title,content){
 const opener=document.activeElement,dialog=h('dialog',{class:'curriculum-dialog','aria-label':title});
 const previousOverflow=document.documentElement.style.overflow;
 const close=()=>{if(dialog.dataset.dirty==='true'&&!window.confirm('还有未保存的修改，确定放弃吗？'))return;dialog.close();};
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 for(const eventName of ['input','change'])dialog.addEventListener(eventName,event=>{if(!event.target.closest('.book-toolbar,.book-row'))dialog.dataset.dirty='true';});
 dialog.append(h('div',{class:'dialog-heading'},h('h2',{},title),button('×',close,{'aria-label':'关闭'+title})),content);
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
 dialog.addEventListener('close',()=>{activeDialog=null;document.documentElement.style.overflow=previousOverflow;dialog.remove();const target=opener?.isConnected?opener:[...shell.element.querySelectorAll('button,input,select')].find(el=>opener?.getAttribute('aria-label')?el.getAttribute('aria-label')===opener.getAttribute('aria-label'):el.textContent===opener?.textContent);target?.focus({preventScroll:true});});
 document.body.append(dialog);activeDialog=dialog;document.documentElement.style.overflow='hidden';dialog.showModal();return dialog;
}
function detail(item){
 const base=structuredClone(data),state=chooser('当前素材状态',statuses,statusOf(data.records,item.key),()=>{}),note=h('textarea',{rows:4,'aria-label':'素材手记',placeholder:'记录选材想法、使用感受或下次安排…'});note.value=data.records[item.key]?.note||'';
 const error=h('p',{class:'error',role:'alert'});
 const form=h('form',{},small(`${subjects[item.subject]} · ${types[item.type]} · ${grades[item.ref.grade]}`),h('strong',{},item.ref.level||'未指定具体级别'),item.note?small(item.note):null,h('h3',{},'计划使用位置'),h('ul',{},item.refs.map(ref=>h('li',{},`${grades[ref.grade]} · ${ref.level||'年度安排'}${ref.phases.length?' · '+ref.phases.map(id=>phases.find(p=>p.id===id)?.title).join('、'):''}`))),h('label',{},'当前班级状态',state),h('label',{},'我的手记',note),small('这里记录这份全科计划的执行状态，英语原路线与逐册已读事实保持各自口径。'),small(item.source||'家长自选候选素材'),error,h('button',{type:'submit',class:'primary'},'保存状态与手记'));
 if(item.id.startsWith('custom-'))form.append(button('编辑候选资料',()=>{if(dialog.dataset.dirty==='true'&&!window.confirm('还有未保存的手记，确定放弃并编辑资料吗？'))return;dialog.addEventListener('close',()=>customDialog(item),{once:true});dialog.close();}),button('移出素材库',async()=>{try{await save({custom:[{...data.custom.find(m=>m.id===item.id),deleted:true}]},base);dialog.close();render();message('已移出候选，可在设置的“已移除候选”恢复。');}catch(failure){error.textContent=failure.message;}}));
 const bookHost=h('section',{class:'detail-books'});
 const content=h('div',{},isBook(item)?h('section',{},h('h3',{},'逐本书目与完成记录'),bookHost):null,h('details',{class:'execution-details',open:!isBook(item)},h('summary',{},'计划使用状态与手记'),form));
 const dialog=modal(item.title,content);
 for(const eventName of ['input','change'])form.addEventListener(eventName,()=>{form.dataset.dirty='true';});
 if(isBook(item))void seriesBooks(bookHost,item);
 form.addEventListener('submit',async event=>{event.preventDefault();try{await save({records:{[item.key]:{status:state.value,note:note.value}}},base);dialog.close();render();}catch(failure){error.textContent=failure.message;}});
}
function customDialog(existing){
 const name=h('input',{required:true,maxlength:160,'aria-label':'候选素材名称'}),level=h('input',{'aria-label':'级别或版本',maxlength:200}),note=h('textarea',{'aria-label':'选材说明',rows:3}),s=chooser('候选学科',subjects,subject||'chinese',()=>{}),g=chooser('候选班级',grades,grade,()=>{}),t=chooser('候选类型',types,'picture',()=>{}),error=h('p',{class:'error',role:'alert'});
 const base=structuredClone(data);
 if(existing){name.value=existing.title;level.value=existing.ref.level;note.value=existing.note||'';s.value=existing.subject;g.value=existing.ref.grade;g.disabled=true;t.value=existing.type;}
 const form=h('form',{},h('label',{},'名称',name),h('div',{class:'form-grid'},h('label',{},'学科',s),h('label',{},'班级',g),h('label',{},'类型',t)),h('label',{},'级别 / 版本（可不填）',level),h('label',{},'为什么想选它',note),small('候选保存在私人本机记录中。选定后可把状态从“待选”改为“计划中”。'),error,h('button',{type:'submit',class:'primary'},existing?'保存候选资料':'加入待选'));
 const dialog=modal(existing?'编辑候选素材':'增加候选素材',form);
 form.addEventListener('submit',async event=>{event.preventDefault();if(!name.value.trim()){error.textContent='请填写素材名称。';return;}const id=existing?.id||'custom-'+crypto.randomUUID();try{await save({custom:[{id,title:name.value.trim(),subject:s.value,type:t.value,refs:existing?existing.refs.map(ref=>ref.grade===g.value?{...ref,level:level.value.trim()}:ref):[{grade:g.value,level:level.value.trim(),phases:[]}],note:note.value,source:'家长自选候选素材'}],records:existing?{}:{[materialKey(id,g.value)]:{status:'candidate'}}},base);grade=g.value;subject=s.value;type='';phase='';status=existing?'':'candidate';search='';dialog.close();render();}catch(failure){error.textContent=failure.message;}});
}
function removedDialog(){
 const removed=data.custom.filter(x=>x.deleted),list=h('div',{},removed.length?small('移出的候选保留原状态和手记，可以恢复。'):small('还没有移除的候选素材。'));
 for(const item of removed)list.append(h('div',{class:'removed-row'},h('span',{},item.title),button('恢复',async()=>{try{await save({custom:[{...item,deleted:false}]});dialog.close();render();message('已恢复候选：'+item.title);}catch(error){message(error.message,true);}})));
 const dialog=modal('已移除候选',list);
}
async function editProfile(){
 try{await profile.init();const base=profile.get(),name=h('input',{required:true,maxlength:30,'aria-label':'宝宝昵称',value:base.name}),error=h('p',{class:'error',role:'alert'}),form=h('form',{},h('label',{},'宝宝昵称',name),small('出生日期：'+base.birthDate),error,h('button',{type:'submit',class:'primary'},'保存宝宝资料'));const dialog=modal('宝宝资料',form);form.addEventListener('submit',async event=>{event.preventDefault();try{await profile.save({...base,name:name.value},base);dialog.close();}catch(failure){error.textContent=failure.message;}});}catch(error){message(error.message,true);}
}
async function backup(){
 try{const latest=await store.read(),content=JSON.stringify({...latest,exportedAt:new Date().toISOString()},null,2),filename='小芽全科-启蒙记录备份.json';
  if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
   const response=await fetch('/__local-backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,content})});
   if(response.ok){const receipt=await response.json();message('备份已保存：'+receipt.path);return;}
  }
  const blob=new Blob([content],{type:'application/json'}),url=URL.createObjectURL(blob),a=h('a',{href:url,download:filename});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('已生成全科备份，请保存下载的JSON文件。');
 }catch(error){message('导出失败：'+error.message,true);}
}
function importDialog(){
 const input=h('input',{type:'file',accept:'.json,application/json','aria-label':'选择全科启蒙备份'}),info=h('p',{role:'status'}),confirm=button('导入缺少的记录',async()=>{try{if(!pending)return;const receipt=await store.import(pending);data=receipt.value;channel?.postMessage('saved');dialog.close();render();message(`导入完成；${receipt.conflicts}条已有差异保留本机值。`);}catch(error){info.textContent=error.message;}},{disabled:true,class:'primary'});
 let pending;
 const dialog=modal('导入全科备份',h('div',{},small('仅接受全科启蒙JSON。只补缺少的记录，有差异时保留本机值；成长和英语备份不导入。'),input,info,confirm));
 input.addEventListener('change',async()=>{pending=null;confirm.disabled=true;try{const file=input.files[0];if(!file)return;pending=validateBackup(JSON.parse(await file.text()));info.textContent=`待导入：${Object.keys(pending.records).length}条状态/手记，${pending.custom.length}项自选素材。`;confirm.disabled=false;}catch(error){info.textContent=error.message;}});
}
channel?.addEventListener('message',async()=>{try{data=await store.read();if(!activeDialog)render();else refreshBookControls();}catch(error){message(error.message,true);}});
window.addEventListener('beforeunload',event=>{if(activeDialog?.dataset.dirty==='true'){event.preventDefault();event.returnValue='';}});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(viewIds.includes(next)&&!activeDialog){view=next;render();}});
view=viewIds.includes(location.hash.slice(1))?location.hash.slice(1):'goals';
render();
try{data=await store.read();ready=true;render();}catch(error){if(view==='sources')message('本机记录未能读取，仍可查看原始文档。',true);else shell.content.replaceChildren(titleBlock('记录暂时未能读取',error.message),button('重新读取',()=>location.reload()));}
