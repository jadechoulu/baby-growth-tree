import { grades, subjects, types, phases, goals, milestones, abilityMetrics, discrepancies, materials } from './plan.mjs?v=20261118-unified-tabs';
import { goalCurve } from './charts.mjs?v=20261118-unified-tabs';
import { statuses, materialKey, goalKey, statusOf, filterMaterials, summary, validateBackup } from './model.mjs?v=20261118-baby-v4';
import { createStore, empty } from './store.mjs?v=20261118-baby-v4';
import { loadCatalog, groupsFor, ownBookState, ownBookUpdate } from './catalog.mjs?v=20261118-books';
import { catalogIndex } from './catalog-index.mjs?v=20261118-poetry-cover';
import { createEnglishBooks } from './english-records.mjs?v=20261118-books';
import { bookEntries, filterBookEntries, matchesQuery, defaultCatalogGroup } from './library-model.mjs';
import { shelfBooks, shelfGroups, shelfState, plannedIdentities, outsidePlan, prepareChineseShelf, shelfReceipt } from './shelf-model.mjs?v=20261118-baby-v4';
import { targetProgress, englishListeningCount, poetryCompletedCount } from './baby-progress.mjs?v=20261119-poetry';
import { babyStage } from './baby-model.mjs?v=20261118-baby-v4';
import { characterEntries, characterSummary, characterDraft, characterKey } from './literacy-model.mjs?v=20261118-baby-v4';
const site=window.XiaoyaSite, store=createStore(window.indexedDB), profile=window.XiaoyaBabyProfile.createClient();
let data=empty(), ready=false, view='baby', grade='junior', subject='', phase='', type='', status='', search='', layout='list', grouping='series', series='', catalog='', completion='';
let activeDialog=null, listGeneration=0;
let goalMode='chart';
let babyGrade='',babyMaterials='using',babyEnglishWords=null,babyEnglishVersion=0;
let literacySearch='',literacyChannel='recognition',literacyOpen=true;
let materialCollection='plan',shelfSearch='',shelfFilter='',shelfAuthenticated=false,shelfAuthVersion=0,shelfBusy=false,shelfClient;
const collectionViews={plan:{grouping:'series',layout:'list'},other:{grouping:'series',layout:'list'}};
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
const materialLibrary=window.XiaoyaMaterialLibrary.create({h});
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
const navigation=[{title:'一起探索全科',items:[{id:'baby',label:'宝宝视角',icon:'baby',shortcut:true},{id:'goals',label:'三年目标',icon:'route',shortcut:true},{id:'phases',label:'小班全年计划',icon:'source',shortcut:true},{id:'materials',label:'计划素材',icon:'book',shortcut:true},]}];
const viewIds=[...navigation.flatMap(group=>group.items.map(item=>item.id)),'sources'];
const shell=site.createShell({sectionId:'curriculum',siteRoot:'../',navigation,activeId:view,onNavigate:navigate});
document.querySelector('#app').replaceChildren(shell.element);
const settings=h('div',{class:'settings-actions'},button('宝宝资料',()=>editProfile(),{'aria-label':'编辑宝宝资料'}),button('导出全科备份',()=>backup()),button('导入全科备份',()=>importDialog()),button('已移除候选',()=>removedDialog()),small('全科状态、手记和补充书目保存在当前浏览器，可单独导入导出，尚未接入云同步。英语公共单册共用英语原记录、备份与同步。'));
shell.globalActions.append(site.createActionMenu(settings));
function navigate(next){
 if(activeDialog)return;
 view=next;if(next==='phases')grade='junior';
 location.hash=next;render();window.scrollTo({top:0,behavior:'instant'});
}
function allMaterials(){return [...materials,...data.custom.filter(x=>!x.deleted)];}
function currentItems(extra={}) {return filterMaterials(allMaterials(),data.records,{grade,subject,phase:view==='materials'?phase:'',type:view==='materials'?type:'',status:view==='materials'?status:'',search:view==='materials'?search:'',...extra});}
async function save(changes,expected=data){
 if(!ready)throw new Error('记录尚未读取成功，请重试后保存。');
 data=await store.save(changes,expected);refreshPoetryProgress();channel?.postMessage('saved');message('已保存到当前浏览器');
}
function titleBlock(title,description){return h('header',{class:'intro'},h('span',{class:'eyebrow'},'一起探索，慢慢长大'),h('div',{class:'title-row'},h('h1',{},title),view!=='sources'?button('📄',()=>navigate('sources'),{class:'source-icon','aria-label':'查看原始计划文档',title:'原始文档'}):null),description?small(description):null);}
function filters(){
 return h('div',{class:'plan-filters'},choices(grades,grade,value=>{grade=value;phase='';render();},'选择班级'),choices({'':'全科',...subjects},subject,value=>{subject=value;render();},'选择学科'));
}
function render(){
 const focused=document.activeElement;
 const focusKey=focused?.getAttribute('data-site-item')||focused?.getAttribute('aria-label');
 const focusText=focused?.tagName==='BUTTON'?focused.textContent:null;
 shell.update({activeId:view,title:{baby:'宝宝视角',goals:'三年目标',phases:'小班全年计划',materials:'计划素材',sources:'原始文档'}[view]});
 shell.content.replaceChildren(notice);
 if(!ready&&view!=='sources'){shell.content.append(titleBlock('全科启蒙','正在读取本机记录…'));return;}
 if(view==='sources')renderSources();else if(view==='materials')renderMaterials();else if(view==='phases')renderPhases();else if(view==='baby')renderBaby();else renderGoals();
 if(focusKey){const candidates=[...shell.element.querySelectorAll('button,select,input,[data-chart-point]')];candidates.find(el=>(el.getAttribute('data-site-item')||el.getAttribute('aria-label'))===focusKey)?.focus({preventScroll:true});}else if(focusText){[...shell.content.querySelectorAll('button')].find(el=>el.textContent===focusText)?.focus({preventScroll:true});}
}
function goalRow(target,subjectId,currentGrade,showDetail=true){
 const key=goalKey(target.id,currentGrade,subjectId),complete=statusOf(data.records,key)==='done';
 return h('div',{class:'goal-row'},button(complete?'✓':'○',async()=>{try{await save({records:{[key]:{status:complete?'planned':'done'}}});render();}catch(error){message(error.message,true);}},{class:'goal-check','aria-label':`${complete?'撤回':'确认完成'}${subjects[subjectId]}：${target.title}`,'aria-pressed':String(complete)}),h('div',{},h('h3',{},target.title),h('strong',{class:'goal-summary'},target.summary),!showDetail&&subjectId==='chinese'&&target.id==='literacy'?countProgress(characterSummary(data.records).recognized,milestones.find(item=>item.id==='literacy').values[Object.keys(grades).indexOf(currentGrade)],'字'):null,!showDetail&&subjectId==='chinese'&&target.id==='poetry'?babyPoetryProgress(currentGrade):null,!showDetail&&subjectId==='english'&&target.id==='listening'?(babyEnglishWords===null?small('本人登录后显示英语听力现状'):countProgress(babyEnglishWords,milestones.find(item=>item.id==='vocabulary').values[Object.keys(grades).indexOf(currentGrade)],'词')):null,showDetail?small(target.detail):null));
}
function renderBaby(){
 const child=profile.get(),suggested=babyStage(child.birthDate),currentGrade=babyGrade||suggested.grade;
 const currentPhase=currentGrade==='junior'&&(babyGrade||!suggested.before)?suggested.phase:'';
 const phasePlan=phases.find(item=>item.id===currentPhase);
 const stageLabel=babyGrade?grades[currentGrade]:suggested.before?'入园前 · 小班作参考':suggested.after?'幼儿园计划回顾':grades[currentGrade]+' · 按生日估算';
 shell.content.append(titleBlock(child.name+'的全科启蒙',''),h('div',{class:'baby-stage-bar'},pill(stageLabel),chooser('宝宝视角班级',{'':'跟随年龄',...grades},babyGrade,value=>{babyGrade=value;render();}),phasePlan?pill(phasePlan.title):null));
 if(!babyGrade&&suggested.before)shell.content.append(small('先从共读、听故事和游戏开始；小班年度目标供后续参考。'));
 const grid=h('section',{class:'subjects-grid baby-subjects','aria-label':'当前阶段各科目标'});
 for(const [subjectId,name]of Object.entries(subjects)){
  const targets=goals[currentGrade][subjectId],done=targets.filter(target=>statusOf(data.records,goalKey(target.id,currentGrade,subjectId))==='done').length;
  const card=h('article',{class:'subject-card subject-'+subjectId},h('header',{},h('h2',{},name),pill(`已确认 ${done}/${targets.length}`)),phasePlan?h('details',{class:'baby-phase-focus'},h('summary',{},phasePlan.title+'安排'),h('ul',{},phasePlan[subjectId].map(text=>h('li',{},text)))):null,targets.map(target=>goalRow(target,subjectId,currentGrade,false)),button('查看'+name+'素材 →',()=>{grade=currentGrade;subject=subjectId;phase=currentPhase;type='';status='';search='';series='';catalog='';navigate('materials');},{class:'material-link'}));
  grid.append(card);
 }
 shell.content.append(literacyPanel(currentGrade),grid);
 const items=filterMaterials(allMaterials(),data.records,{grade:currentGrade}),active=items.filter(item=>statusOf(data.records,item.key)==='using');
 const heading=h('header',{class:'baby-materials-head'},h('h2',{},'正在用什么'),choices({using:`进行中 ${active.length}`,stage:'本阶段素材'},babyMaterials,value=>{babyMaterials=value;render();},'宝宝素材范围'));
 const list=h('section',{class:'library-view baby-materials'},heading),shown=babyMaterials==='using'?active:items.filter(item=>!currentPhase||item.ref.phases.includes(currentPhase));
 if(!shown.length)list.append(small('还没有进行中的素材。'),button('挑选本阶段素材',()=>{babyMaterials='stage';render();},{class:'text-link'}));
 else{
  const cards=h('div',{class:'resource-grid library-grid'},shown.slice(0,6).map(materialCard));list.append(cards,window.EnglishAutomaticList.tail({total:shown.length,limit:6,step:6,load:(start,end)=>{if(cards.isConnected)cards.append(...shown.slice(start,end).map(materialCard));}}));
 }
 shell.content.append(list,button('查看幼儿园三年全面规划 →',()=>{grade=currentGrade;subject='';navigate('goals');},{class:'text-link'}));
}
function countProgress(current,total,unit){
 const progress=targetProgress(current,total);return h('div',{class:'baby-count-progress'},h('span',{},current+' / '+total+' '+unit),h('span',{},progress.percent+'%'),h('progress',{value:Math.min(current,total),max:total,'aria-label':'当前完成 '+current+'，目标 '+total+' '+unit}));
}
const poetryControls=new Map();
function babyPoetryProgress(currentGrade){
 for(const host of poetryControls.keys())if(!host.isConnected)poetryControls.delete(host);
 const host=h('div'),total=milestones.find(item=>item.id==='poetry').values[Object.keys(grades).indexOf(currentGrade)];
 const draw=async()=>{
  host.replaceChildren(small('正在读取古诗进度…'));
  try{
   const items=allMaterials().filter(item=>item.subject==='chinese'&&item.type==='poem');
   const catalogs=await Promise.all(items.map(item=>loadCatalog(item.id)));
   if(!host.isConnected)return;
   const personal=items.flatMap(item=>item.refs.map(ref=>personalCatalog({...item,ref}))).filter(Boolean);
   const groups=[...catalogs.flatMap(catalog=>catalog.groups),...personal];
   host.replaceChildren(countProgress(poetryCompletedCount(data.records,groups),total,'首'));
   poetryControls.set(host,()=>host.replaceChildren(countProgress(poetryCompletedCount(data.records,groups),total,'首')));
  }catch{
   if(host.isConnected)host.replaceChildren(small('古诗进度未能读取'),button('重试',()=>void draw(),{class:'text-link'}));
  }
 };
 void draw();return host;
}
function refreshPoetryProgress(){
 for(const [host,refresh]of poetryControls)if(host.isConnected)refresh();else poetryControls.delete(host);
}
async function refreshBabyEnglish(){
 const version=++babyEnglishVersion;let count=null;try{const authenticated=(await chineseShelfClient().getState('english')).authenticated===true;if(authenticated){await sharedEnglish();count=englishListeningCount(englishSnapshot,window.EnglishVocabulary,true);}}catch{}
 if(version!==babyEnglishVersion)return;const changed=babyEnglishWords!==count;babyEnglishWords=count;if(changed&&ready&&view==='baby'&&!activeDialog)render();
}
function literacyPanel(currentGrade){
 const stats=characterSummary(data.records),results=h('div'),searchBox=h('input',{type:'search',value:literacySearch,placeholder:'查找汉字','aria-label':'搜索已记录汉字',onInput:event=>{if(!event.isComposing){literacySearch=event.target.value;draw();}},onCompositionend:event=>{literacySearch=event.target.value;draw();}});
 const panel=h('details',{class:'literacy-panel subject-chinese',open:literacyOpen,onToggle:()=>{literacyOpen=panel.open;if(panel.open&&!results.childElementCount)draw();}},h('summary',{class:'literacy-heading'},h('h2',{},'中文认字'),h('span',{class:'muted'},'会认 '+stats.recognized+' · 会写 '+stats.written)),h('div',{class:'literacy-toolbar'},choices({recognition:'会认 '+stats.recognized,writing:'会写 '+stats.written},literacyChannel,value=>{literacyChannel=value;render();},'汉字能力'),h('div',{class:'literacy-actions'},searchBox,button('＋',()=>addCharacters(),{'aria-label':'新增认识的汉字',title:'新增 / 批量录入汉字'}))),results,h('details',{class:'literacy-notes'},h('summary',{},'计数说明'),small('会认、会写分别按单字去重，可独立标记和移除；不自动完成年度目标。原计划20字仅为起始参考。记录随全科备份保存在当前浏览器。')));
 function draw(){
  const entries=characterEntries(data.records,literacyChannel).filter(entry=>!literacySearch.trim()||literacySearch.includes(entry.character));
  const tiles=h('div',{class:'character-grid'}),row=entry=>button(entry.character,()=>editCharacter(entry),{class:'character-tile','aria-label':entry.character+' · '+(literacyChannel==='writing'?'会写':'会认')+'，点击编辑',title:entry.note||''});
  tiles.append(...entries.slice(0,48).map(row));results.replaceChildren(tiles);
  if(!entries.length)results.append(small(characterEntries(data.records,literacyChannel).length?'没有匹配的汉字。':'还没有该能力的汉字明细，点＋录入。'));
  else results.append(window.EnglishAutomaticList.tail({total:entries.length,limit:48,step:48,load:(start,end)=>{if(tiles.isConnected)tiles.append(...entries.slice(start,end).map(row));}}));
 }
 if(literacyOpen)draw();return panel;
}
function addCharacters(){
 const base=data,input=h('textarea',{rows:4,maxlength:5000,placeholder:'例如：大小多少，日月水火','aria-label':'输入一个或多个汉字'}),feedback=h('p',{class:'muted',role:'status'}),error=h('p',{class:'error',role:'alert'});
 const ability=chooser('录入汉字的能力',{recognition:'会认',writing:'会写',both:'会认和会写'},literacyChannel,()=>preview());
 const submit=button('保存',async()=>{submit.disabled=true;try{const draft=characterDraft(input.value,base.records,ability.value);if(!draft.characters.length)throw new Error('请至少输入一个汉字。');await save({records:draft.changes},base);dialog.close();render();message('汉字已保存；同一能力内重复字未重复添加。');}catch(failure){error.textContent=failure.message;submit.disabled=false;}},{class:'primary'});
 function preview(){const draft=characterDraft(input.value,base.records,ability.value);feedback.textContent='识别 '+draft.characters.length+' 个不同汉字，将新增 '+Object.keys(draft.changes).length+' 条能力记录。标点、数字和字母会忽略。';submit.disabled=!Object.keys(draft.changes).length;}
 const form=h('form',{},h('label',{},'汉字（可一次粘贴多个）',input),ability,feedback,error,submit);
 const dialog=modal('新增中文认字',form);form.addEventListener('submit',event=>{event.preventDefault();submit.click();});form.addEventListener('input',()=>{dialog.dataset.dirty='true';preview();});ability.addEventListener('change',()=>{dialog.dataset.dirty='true';});preview();input.focus();
}
function editCharacter(entry){
 const base=data,recognitionKey=characterKey(entry.character),writingKey=characterKey(entry.character,'writing'),recognized=h('input',{type:'checkbox',checked:base.records[recognitionKey]?.status==='done','aria-label':'会认这个字'}),written=h('input',{type:'checkbox',checked:base.records[writingKey]?.status==='done','aria-label':'会写这个字'}),note=h('textarea',{rows:2,maxlength:500,'aria-label':'汉字备注',value:entry.note||''}),error=h('p',{class:'error',role:'alert'});
 async function commit(remove=false){try{const records=remove?{[entry.key]:{status:'paused'}}:{[recognitionKey]:{status:recognized.checked?'done':'paused'},[writingKey]:{status:written.checked?'done':'paused'}};records[entry.key]={...records[entry.key],note:note.value};await save({records},base);dialog.close();render();}catch(failure){error.textContent=failure.message;}}
 const form=h('form',{},h('div',{class:'literacy-actions'},h('label',{},recognized,'会认'),h('label',{},written,'会写')),h('label',{},'备注',note),error,h('div',{class:'literacy-actions'},button('保存',()=>commit(),{class:'primary'}),button('移除当前能力记录',()=>commit(true))));
 const dialog=modal('汉字 · '+entry.character,form);form.addEventListener('submit',event=>event.preventDefault());form.addEventListener('input',()=>{dialog.dataset.dirty='true';});
}
function renderGoals(){
 shell.content.append(titleBlock('幼儿园三年全面规划','语文慢速打底，英语持续输入，数学在游戏里理解。选择班级和学科，查看目标与对应素材。'),choices({chart:'目标曲线',details:'目标详情'},goalMode,value=>{goalMode=value;render();},'目标查看方式'),filters());
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
  card.append(...targets.map(target=>goalRow(target,subjectId,grade)));
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
 const title=titleBlock('计划素材','');shell.content.append(title,choices({plan:'计划内',other:'其他'},materialCollection,value=>{collectionViews[materialCollection]={grouping,layout};materialCollection=value;({grouping,layout}=collectionViews[value]);render();},'全科素材集合'));
 if(materialCollection==='other'){renderOtherMaterials();return;}
 const runSearch=event=>{if(event.isComposing)return;search=event.target.value;void updateResults();};
 const toolbar=h('div',{class:'library-filters'},chooser('素材类型',types,type,v=>{type=v;void updateResults();},'全部类型'),chooser('素材状态',statuses,status,v=>{status=v;void updateResults();},'全部状态'),chooser('小班阶段',Object.fromEntries(phases.map(x=>[x.id,x.title])),phase,v=>{phase=v;grade='junior';render();},'全年阶段'),h('input',{type:'search',placeholder:'搜索套系或书名','aria-label':'搜索全科素材',value:search,onInput:runSearch,onCompositionend:runSearch}),materialLibrary.reset({id:'curriculum-reset',onReset:()=>{subject='';phase='';type='';status='';search='';series='';catalog='';completion='';render();}}),button('＋',()=>customDialog(),{class:'primary','aria-label':'添加候选素材',title:'添加候选素材'}));
 shell.content.append(h('div',{class:'catalog-toolbar'},filters(),toolbar));
 const result=h('section',{id:'material-results',class:'library-view library-results'});shell.content.append(result);void updateResults();
}
function chineseShelfClient(){
 if(!shelfClient){shelfClient=window.XiaoyaSync.createClient({siteRoot:'../',profileClient:profile});shelfClient.subscribe(()=>{void refreshShelfAuth();void refreshBabyEnglish();});}
 return shelfClient;
}
async function refreshShelfAuth(){
 const version=++shelfAuthVersion;let authenticated=false;
 try{authenticated=(await chineseShelfClient().getState('english')).authenticated===true;}catch{/* 会话未确认时不展示私人书架。 */}
 if(version!==shelfAuthVersion)return;
 const changed=shelfAuthenticated!==authenticated;shelfAuthenticated=authenticated;
 if(changed&&view==='materials'&&materialCollection==='other'&&!activeDialog)render();
 if(!authenticated&&activeDialog?.dataset.privateShelf==='true')activeDialog.close();
}
function renderOtherMaterials(){
 const toolbar=h('div',{class:'library-filters'},h('input',{type:'search',value:shelfSearch,placeholder:'搜索中文套系或书名','aria-label':'搜索其他中文素材',onInput:event=>{if(!event.isComposing){shelfSearch=event.target.value;void updateResults();}},onCompositionend:event=>{shelfSearch=event.target.value;void updateResults();}}),chooser('其他中文素材状态',{'':'全部单本',done:'已完成',open:'未完成'},shelfFilter,value=>{shelfFilter=value;void updateResults();}),materialLibrary.reset({id:'shelf-reset',onReset:()=>{shelfSearch='';shelfFilter='';render();}}),button(shelfBusy?'同步中…':'同步小花生',()=>void syncChineseShelf(),{disabled:shelfBusy,'aria-label':'同步小花生中文素材和进度'}));
 shell.content.append(h('div',{class:'catalog-toolbar'},toolbar),h('section',{id:'material-results',class:'library-view library-results'}));void updateResults();void refreshShelfAuth();
}
let plannedCatalogs;
async function chinesePlannedCatalogs(){
 return plannedCatalogs||=(Promise.all(materials.filter(item=>item.subject!=='english'&&isBook(item)).map(item=>loadCatalog(item.id))).then(plannedIdentities).catch(error=>{plannedCatalogs=null;throw error;}));
}
async function updateOtherResults(host){
 const generation=++listGeneration,valid=()=>host.isConnected&&generation===listGeneration&&materialCollection==='other';host.replaceChildren();
 if(!shelfAuthenticated){host.append(small('使用本人 GitHub 登录后查看和同步中文书架。'),button('登录 / 连接',()=>chineseShelfClient().open()));return;}
 try{
  const planned=await chinesePlannedCatalogs();if(!valid()||!shelfAuthenticated)return;
  const all=shelfBooks(data.records).filter(book=>outsidePlan(book,planned));
  const books=all.filter(book=>(!shelfFilter||shelfState(data.records,book).done===(shelfFilter==='done'))&&matchesQuery(shelfSearch,book.title,book.series?.title));
  const fullGroups=new Map(shelfGroups(all).map(group=>[group.id,group]));
  const groups=shelfGroups(books),rows=grouping==='series'?groups:books,grid=h('div',{class:grouping==='series'?'resource-grid library-grid other-shelf-grid'+(layout==='covers'?' library-cover-grid library-book-cover-grid':''):'library-book-list'+(layout==='covers'?' library-book-cover-grid':'')});
  host.append(materialLibrary.resultsHead(grouping==='series'?groups.length+' 组':books.length+' 本',libraryControls()));
  const receipt=data.records[shelfReceipt];if(receipt){const meta=JSON.parse(receipt.note);host.append(small('小花生抓取：'+new Date(meta.fetchedAt).toLocaleString('zh-CN')));}
  host.append(grid);
  const append=(start,end)=>{if(valid()&&shelfAuthenticated)grid.append(...rows.slice(start,end).map(item=>grouping==='series'?shelfSeriesCard(item,fullGroups.get(item.id)):shelfBookCard(item)));};append(0,18);
  if(!rows.length)host.append(small(all.length?'没有匹配的中文素材。':'还没有计划外中文素材，点击“同步小花生”读取。'));
  host.append(window.EnglishAutomaticList.tail({total:rows.length,limit:18,step:18,load:append}));
 }catch(error){if(valid())host.append(small('中文书架未能显示：'+error.message),button('重试',()=>void updateResults()));}
}
function shelfBookControl(book){
 const state=shelfState(data.records,book),check=materialLibrary.completionControl({title:book.title,done:state.done,external:state.external,disabled:state.external||book.isCollection,onChange:async()=>{
  check.disabled=true;try{if(!shelfAuthenticated)throw Error('请重新登录后编辑。');await save({records:ownBookUpdate(book,check.checked)});void updateResults();}catch(error){check.checked=state.done;message(error.message,true);}finally{check.disabled=state.external||book.isCollection;}
 }});
 return check;
}
function shelfCover(book,open){return materialLibrary.bookCover({src:book.cover,title:book.title,readCount:book.readCount,onOpen:open});}
function shelfBookCard(book,{detail=false}={}){
 const state=shelfState(data.records,book),open=()=>shelfDetail({id:book.id,title:book.title,books:book.isCollection?[]:[book],container:book.isCollection?book:null});
 return materialLibrary.bookCard({attrs:{class:'subject-chinese'},cover:shelfCover({...book,readCount:state.readCount},detail?null:open),title:detail?h('strong',{class:'library-book-name'},book.title):button(book.title,open,{class:'text-link library-book-name','aria-haspopup':'dialog',title:'查看完整详情'}),context:book.series?.title,topics:book.isCollection?small('套装条目 · 逐册目录待补'):null,actions:[shelfBookControl(book)]});
}
function shelfSeriesCard(group,fullGroup=group){
 if(group.books.length===1&&!group.container&&!group.books[0].series)return shelfBookCard(group.books[0]);
 const done=fullGroup.books.filter(book=>shelfState(data.records,book).done).length;
 return materialLibrary.shelfCard({attrs:{class:'subject-chinese'},cover:shelfCover({cover:group.container?.cover||group.books[0]?.cover,title:group.title}),title:group.title,onOpen:()=>shelfDetail(fullGroup),completed:done,total:fullGroup.books.length,status:done===fullGroup.books.length?'已完成':done?'进行中':'未开始',note:'套装条目 · 逐册目录待补'});
}
function shelfDetail(group){
 if(!shelfAuthenticated)return;
 const list=h('div',{class:'library-book-list library-book-cover-grid'}),row=book=>shelfBookCard(book,{detail:true});list.append(...group.books.slice(0,24).map(row));
 const dialog=modal(group.title,h('section',{class:'shelf-series-detail'},small(group.books.length?'仅统计小花生书架内的单册，不代表整套出版总量。':'原站仅有套装条目，未将套装已读扩散到每一册。'),list,window.EnglishAutomaticList.tail({total:group.books.length,limit:24,step:24,load:(start,end)=>{if(list.isConnected)list.append(...group.books.slice(start,end).map(row));}})));dialog.dataset.privateShelf='true';
}
async function syncChineseShelf(){
 if(shelfBusy)return;
 const client=chineseShelfClient();await refreshShelfAuth();if(!shelfAuthenticated){client.open();return;}
 shelfBusy=true;render();
 try{
  const state=await client.getState('english'),local=window.EnglishXiaohuashengSync.localEntry(location);
  const snapshot=local&&!state.enabled?await window.EnglishXiaohuashengSync.read():await client.readXiaohuasheng({onProgress:()=>message('正在读取小花生中文书架…')});
  if(!(await client.getState('english')).authenticated)throw Error('登录状态已失效，未导入私人书架。');
  const base=await store.read(),result=prepareChineseShelf(base.records,snapshot);
  data=await store.saveShelf({records:result.changes},base);channel?.postMessage('saved');message('中文书架已同步到当前浏览器；英文素材未导入。');
 }catch(error){message('同步失败：'+error.message,true);}finally{shelfBusy=false;if(view==='materials'&&!activeDialog)render();}
}
function setLibraryLayout(value){
 const host=document.getElementById('material-results'),anchor=[...host.querySelectorAll('.library-card,.library-book-row')].find(card=>card.getBoundingClientRect().bottom>200),top=anchor?.getBoundingClientRect().top;
 layout=value;host.querySelectorAll('.library-grid').forEach(grid=>grid.classList.toggle('library-cover-grid',value==='covers'));
 host.querySelectorAll('.library-book-list,.other-shelf-grid').forEach(grid=>grid.classList.toggle('library-book-cover-grid',value==='covers'));
 if(anchor)window.scrollBy(0,anchor.getBoundingClientRect().top-top);
}
function libraryControls(){return materialLibrary.layoutControls({prefix:'curriculum',grouping,onGrouping:value=>{grouping=value;void updateResults().then(()=>document.querySelector('.library-grouping-toggle')?.focus({preventScroll:true}));},layout,onLayout:setLibraryLayout});}
const entryState=entry=>{const {group,book}=entry.refs[0];return group.english?englishBooks.state(englishSnapshot,book,group):{done:ownBookState(data.records,book)};};
async function updateResults(){
 const host=document.getElementById('material-results');if(!host)return;
 if(materialCollection==='other'){await updateOtherResults(host);return;}
 const focusLabel=host.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
 const generation=++listGeneration,items=currentItems({search:''}),valid=()=>generation===listGeneration&&host.isConnected&&view==='materials';
 const head=materialLibrary.resultsHead('正在读取素材…',libraryControls());host.replaceChildren(head);
 let catalogs=[],failures=[];
 if(grouping==='books'||search.trim()){
  const results=await Promise.allSettled(items.map(async item=>{const result=await loadCatalog(item.id);const groups=groupsFor(result.groups,item,phase);const personal=personalCatalog(item);if(personal)groups.push(personal);return {item,groups};}));
  if(!valid())return;
  results.forEach((result,index)=>{if(result.status==='fulfilled')catalogs.push(result.value);else failures.push(items[index]);});
  if(catalogs.some(({groups})=>groups.some(group=>group.english))){try{await sharedEnglish();}catch(error){if(valid())host.append(small('英语完成记录未能读取：'+error.message),button('重试',()=>void updateResults()));return;}}
  if(!valid())return;
 }
 let entries=bookEntries(catalogs),visibleItems=items.filter(item=>matchesQuery(search,item.title,item.ref.level,item.note)||entries.some(entry=>entry.refs.some(ref=>ref.item.key===item.key&&matchesQuery(search,ref.book.title,ref.group.title))));
 if(grouping==='books'){
  const options=[...new Map(catalogs.filter(x=>x.groups.length).map(({item})=>[item.id,item.title])).entries()];
  if(series&&!options.some(([id])=>id===series)){series='';catalog='';}
  const groups=[...new Map(catalogs.filter(x=>!series||x.item.id===series).flatMap(x=>x.groups.map(group=>[group.id,group.title]))).entries()];
  if(catalog&&!groups.some(([id])=>id===catalog))catalog='';
  host.append(h('div',{class:'library-book-filters'},chooser('单本所属套系',Object.fromEntries(options),series,value=>{series=value;catalog='';void updateResults();},'全部套系'),chooser('单本目录版本',Object.fromEntries(groups),catalog,value=>{catalog=value;void updateResults();},'全部级别 / 版本'),chooser('单本完成状态',{'':'全部单本',open:'未完成',done:'已完成'},completion,value=>{completion=value;void updateResults();})));
  entries=filterBookEntries(entries,{search,series,catalog,completion,state:entryState});
  visibleItems=visibleItems.filter(item=>(!series||item.id===series)&&!catalogs.some(x=>x.item.key===item.key&&x.groups.some(g=>g.books.length)));
 }
 head.querySelector('.result-count').textContent=grouping==='books'?`${entries.length}本书${visibleItems.length?' · '+visibleItems.length+'项套系资料':''}`:`${visibleItems.length}项素材`;
 const rows=grouping==='books'?[...entries.map(entry=>({entry})),...visibleItems.map(item=>({item}))]:visibleItems.map(item=>({item}));
 if(failures.length)host.append(h('div',{class:'catalog-load-error',role:'alert'},small(failures.map(x=>x.title).join('、')+'的目录未能读取。'),button('重试读取目录',()=>void updateResults())));
 if(!rows.length)host.append(h('div',{class:'empty'},h('h2',{},'没有匹配的素材'),small('试试其他筛选条件。')));
 const grid=h('div',{class:'resource-grid library-grid'+(layout==='covers'?' library-cover-grid':'')});host.append(grid);
 const append=(start,end)=>{if(valid())grid.append(...rows.slice(start,end).map(row=>row.entry?bookCard(row.entry):materialCard(row.item)));};append(0,18);
 host.append(window.EnglishAutomaticList.tail({total:rows.length,limit:18,step:18,load:append}));
 if(focusLabel)[...host.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===focusLabel)?.focus({preventScroll:true});
}
function materialCard(item){
 const state=statusOf(data.records,item.key);
 const choose=chooser(`${item.title} · ${grades[item.ref.grade]}的状态`,statuses,state,async next=>{try{await save({records:{[item.key]:{status:next}}});if(view==='baby')render();else void updateResults();}catch(error){choose.value=state;message(error.message,true);}});
 const cover=catalogIndex[item.id]?.cover;
 return materialLibrary.card({attrs:{class:`subject-${item.subject}`},cover:coverButton(cover,item.title,()=>detail(item)),title:h('div',{class:'resource-title'},h('h3',{},button(item.title,()=>detail(item),{class:'card-view-btn','aria-label':`查看${item.title}的书目与安排`,'aria-haspopup':'dialog'}))),meta:h('div',{class:'library-card-meta'},h('span',{},subjects[item.subject]),h('span',{},materialKind(item)),h('div',{},item.ref.level)),tools:[choose],footer:data.records[item.key]?.note?h('p',{class:'library-card-footer'},data.records[item.key].note):null});
}
function coverButton(cover,title,open){return button(h('div',{class:'resource-cover'},cover?h('img',{src:cover,alt:title+'封面',loading:'lazy',onError:event=>event.target.remove()}):h('span',{class:'library-no-cover','aria-hidden':'true'},'▤')),open,{class:'card-view-btn library-card-cover','aria-label':'打开'+title,'aria-haspopup':'dialog'});}
function bookCard(entry){
 const {item,group,book}=entry.refs[0],open=()=>{seriesViews.set(seriesKey(item),{chosen:group.id,query:book.title});detail(item);};
 const control=bookCompletion(book,group,()=>{if(completion)void updateResults();});
 return materialLibrary.card({attrs:{class:'library-book-card subject-'+item.subject},cover:coverButton(book.cover,book.title,open),title:h('div',{class:'resource-title'},h('h3',{},button(book.title,open,{class:'card-view-btn','aria-label':'查看单本：'+book.title}))),meta:h('div',{class:'library-card-meta'},item.title+' · '+group.title,control.badge,control.count),tools:[control.check]});
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
 if(!englishSubscription)englishSubscription=englishBooks.subscribe(()=>void englishBooks.read().then(snapshot=>{englishSnapshot=snapshot;refreshBookControls();void refreshBabyEnglish();}).catch(error=>message(error.message,true)));
 englishSnapshot=await englishBooks.read();
}
const bookControls=new WeakMap(),seriesViews=new Map(),seriesFolds=new Map();
const seriesKey=item=>item.id+':'+item.ref.grade;
function refreshBookControls(){for(const control of document.querySelectorAll('[data-book-control]'))bookControls.get(control)?.();}
function bookCompletion(book,group,onChange=()=>{}){
 const check=h('input',{type:'checkbox','data-book-control':book.id,'aria-label':'完成单本：'+book.title});
 const badge=h('span',{class:'book-completion'}),count=h('small');let busy=false;
 const state=()=>group.english?englishBooks.state(englishSnapshot,book,group):{done:ownBookState(data.records,book)};
 const refresh=()=>{const value=state();check.checked=value.done;check.disabled=busy||!!value.external?.length;badge.textContent=value.external?.length?'小花生已读':value.done?'已完成':'';count.textContent=value.readCount>1?value.readCount+'次':'';};
 bookControls.set(check,refresh);refresh();
 check.addEventListener('change',async()=>{const done=check.checked;busy=true;refresh();try{if(group.english)englishSnapshot=await englishBooks.set(book,done,group);else await save({records:ownBookUpdate(book,done)});refreshBookControls();onChange();}catch(error){message(error.message,true);}finally{busy=false;refresh();}});
 return {check,badge,count,refresh,state};
}
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
  const panel=h('div',{class:'book-catalog'}),list=h('div'),info=h('p',{class:'muted catalog-progress-line',role:'status'});
  if(item.id==='little-sheep'&&item.ref.grade==='senior')panel.append(small('当前公共目录已核对至第7级；原计划的第8—10级待补，可补充手头书目。'));
  const preference=seriesViews.get(seriesKey(item))||{};
  let chosen=groups.some(g=>g.id===preference.chosen)?preference.chosen:defaultCatalogGroup(groups,(book,group)=>group.english?englishBooks.state(englishSnapshot,book,group):{done:ownBookState(data.records,book)}),query=preference.query||'',completion=preference.completion||'';
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
   const progress=()=>{info.replaceChildren(h('span',{},`本目录已完成 ${group.books.filter(book=>state(book).done).length} / ${group.books.length} 本`),h('span',{},group.edition||group.title));};progress();
   if(group.note&&!/^已核对本级\d+册[。.]?$/.test(group.note))list.append(small(group.note));
   if(group.english)list.append(small('与英语启蒙共用单册完成记录。'));
   const rows=h('div',{class:'book-rows'});list.append(rows);
   const append=(start,end)=>{if(current!==generation||!host.isConnected)return;rows.append(...books.slice(start,end).map(book=>{
    const {check,badge,count}=bookCompletion(book,group,()=>{progress();if(completion)draw();});
    const row=h('div',{class:'book-row'},h('label',{},check,book.cover?h('img',{src:book.cover,alt:book.title+'封面',loading:'lazy',onError:event=>event.target.remove()}):null,h('span',{},h('strong',{},book.title),book.level?h('small',{},'级别 '+book.level):null,badge,count)));
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
channel?.addEventListener('message',async()=>{try{data=await store.read();if(!activeDialog)render();else {refreshBookControls();refreshPoetryProgress();}}catch(error){message(error.message,true);}});
window.addEventListener('beforeunload',event=>{if(activeDialog?.dataset.dirty==='true'){event.preventDefault();event.returnValue='';}});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(viewIds.includes(next)&&!activeDialog){view=next;render();}});
view=viewIds.includes(location.hash.slice(1))?location.hash.slice(1):'baby';
profile.subscribe((value,error)=>{if(error)message('宝宝资料未能读取：'+error.message,true);else if(ready&&view==='baby'&&!activeDialog)render();});
void refreshBabyEnglish();
void profile.init().catch(error=>message('宝宝资料未能读取：'+error.message,true));
render();
try{data=await store.read();ready=true;render();}catch(error){if(view==='sources')message('本机记录未能读取，仍可查看原始文档。',true);else shell.content.replaceChildren(titleBlock('记录暂时未能读取',error.message),button('重新读取',()=>location.reload()));}
