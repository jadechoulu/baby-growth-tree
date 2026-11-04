(async function(){
'use strict';
const C=EnglishModel.normalize(window.ROADMAP_RAW);
const SSS=window.ROADMAP_RAW.sssSongs;
const LB=window.EnglishLibraryBooks,BOOKS=window.ROADMAP_RAW.resourceBooks;
const P=window.EnglishPractice;
const LC=window.EnglishLibraryCustom;
const materialUI=window.EnglishMaterialUI.create({h,roles:EnglishModel.materialRoles,levelNodes});
C.routes.forEach(r=>{r.color=({banana:'#bd943d',xu:'#8171ae',qing:'#478c91'})[r.id];});
const TYPES={book:'绘本 / 读物',reader:'分级',animation:'动画',song:'儿歌',flashcard:'闪卡',other:'其他'};
const NAV=[['baby','宝宝视角','sprout'],['qing-progress','庆爸进度','clock'],['xu-progress','许密杉进度','check'],['routes','路线全景','route'],['library','素材图鉴','book'],['relations','关系地图','network'],['sources','原始资料','source']];
const ICONS={grid:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',references:'M6 3H4v18h16V7h-4V3ZM16 3l4 4',menu:'M4 6h16M4 12h16M4 18h16',sprout:'M12 21V11M12 16C5 17 2 12 3 7c6-1 10 3 9 9ZM12 12c-1-7 3-10 9-9 1 6-3 10-9 9Z',route:'M6 3v12a4 4 0 0 0 4 4h8M6 3l-3 3m3-3 3 3M18 19l-3-3m3 3-3 3M18 4v6a4 4 0 0 1-4 4H6',book:'M12 6v15M12 6C8 3 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-3-1-6-1-10 2Z',network:'M12 8V5M8 16l-3 3M16 16l3 3M12 8l-4 8h8l-4-8ZM9 2h6v3H9ZM2 19h6v3H2ZM16 19h6v3h-6Z',source:'M14 3H4v18h16V9ZM14 3v6h6M8 13h8M8 17h5',search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5',arrow:'M4 12h16m-6-6 6 6-6 6',chevron:'m9 5 7 7-7 7',close:'m6 6 12 12M6 18 18 6',settings:'M4 7h16M4 17h16M8 4v6M16 14v6',heart:'M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-6 6 8 15 8 15S26 11 20 5Z',play:'m9 5 11 7-11 7Z',music:'M9 18V5l11-3v13M9 8l11-3M9 18a3 3 0 1 1-3-3h3M20 15a3 3 0 1 1-3-3h3',hand:'M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-3l2 3Z',headphones:'M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3ZM17 13h4v8h-4Z',info:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 11v6M12 7h.01',calendar:'M3 5h18v16H3ZM7 2v6M17 2v6M3 10h18M7 14h3M14 14h3',check:'m5 12 4 4L19 6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',collapse:'M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3',expand:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5',clock:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6v6l4 2'};
let saved={};try{saved=JSON.parse(localStorage.getItem('little-leaf-english-v1'))||{};}catch{}
const sharedProfile=window.XiaoyaBabyProfile.createClient();
let sharedProfileError='';let commonProfile={name:'宝宝',birthDate:''};
try{commonProfile=await sharedProfile.init();}catch(error){sharedProfileError=error.message;}
let profileEditBase=null;
let siteSync=null;
const S={view:'baby',route:'all',type:'all',search:'',age:'all',favoriteOnly:false,sharedOnly:false,roadmapMode:'compare',compareRoute:'xu',compareStage:null,routeDomain:'listening',relationMode:'resource',focus:null,relationPage:0,libraryLimit:18,libraryKey:'',libraryLayout:'list',profile:Object.assign({name:'宝宝',birthDate:'',vocabulary:0,mode:'audio'},saved.profile||{},commonProfile),favorites:saved.favorites||[],records:saved.records||{},modal:null,preview:null,songCategory:'all',songScene:'all',songSearch:''};
Object.assign(S,{libraryTopic:'all',libraryBookMode:false,materialStatus:'all',practiceStages:{},practiceDomain:'listening',practiceSearch:'',practiceLogLimit:12});
const songResources=EnglishModel.getSongResources(C,SSS);
const songResourceIds=new Set(songResources.map(r=>r.id));
const modalTrail=[];
const byId=new Map(C.resources.map(r=>[r.id,r]));const stages=new Map(C.stages.map(s=>[s.id,s]));const routes=new Map(C.routes.map(r=>[r.id,r]));
if(!S.profile.birthDate)S.view='routes';
// 兼容既有收藏与笔记：同书别名归并后仍沿用用户原记录。
for(const [oldId,newId] of Object.entries(C.legacyResourceIds||{})){
  if(S.favorites.includes(oldId))S.favorites=S.favorites.filter(id=>id!==oldId).concat(newId);
  if(S.records[oldId]){const old=S.records[oldId],current=S.records[newId];S.records[newId]=current?Object.assign({},old,current,{note:Array.from(new Set([current.note,old.note].filter(Boolean))).join('\n')}):old;delete S.records[oldId];}
}
S.favorites=Array.from(new Set(S.favorites));
const el=document.getElementById('app');const overlay=document.getElementById('overlay');const previewRoot=document.getElementById('preview');let lastFocus=null;let toastTimer=null;const blobs={};
function h(tag,attrs,...kids){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs||{})){if(v===null||v===undefined||v===false)continue;if(k==='class')n.className=v;else if(k==='style'&&typeof v==='object'){for(const [key,value] of Object.entries(v)){if(key.startsWith('--'))n.style.setProperty(key,value);else n.style[key]=value;}}else if(k.startsWith('on')&&typeof v==='function')n.addEventListener(k.slice(2),v);else if(k==='value')n.value=v;else if(k==='checked')n.checked=!!v;else if(k==='disabled')n.disabled=!!v;else n.setAttribute(k,v===true?'':v);}for(const x of kids.flat(Infinity)){if(x===null||x===undefined||x===false)continue;n.append(x instanceof Node?x:document.createTextNode(String(x)));}return n;}
function icon(name){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.6');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',ICONS[name]||ICONS.book);s.append(p);return s;}
function btn(label,action,attrs={},cls='button'){return h('button',Object.assign({type:'button',class:cls,'data-action':action},attrs),label);}
function routeChip(id){return h('span',{class:'chip '+id},routes.get(id)?.name||id);}
function src(id){return C.sources.find(x=>x.id===id);}
function asset(path){if(!path)return '';const item=window.ROADMAP_ASSETS?.[path];if(!item)return path;if(!item.startsWith('data:application/pdf'))return item;if(!blobs[path]){const data=atob(item.slice(item.indexOf(',')+1));const b=new Uint8Array(data.length);for(let i=0;i<data.length;i++)b[i]=data.charCodeAt(i);blobs[path]=URL.createObjectURL(new Blob([b],{type:'application/pdf'}));}return blobs[path];}
function sourcePage(id,page){const s=src(id);return s?.previews.find(p=>p.page===Number(page))||s?.previews[0];}
function sourceBtn(id,page,label){return btn([icon('source'),label||((src(id)?.title||'原文')+' · 第 '+page+' 页')],'preview',{'data-source':id,'data-page':page},'text-link');}
function stageSourceLinks(st){const refs=st.pages.map(page=>({id:st.sourceId||st.routeId,page}));for(const m of st.materials){const id=m.sourceId||st.sourceId||st.routeId,page=m.page||st.pages[0]||1;if(!refs.some(ref=>ref.id===id&&ref.page===page))refs.push({id,page});}for(const ref of st.raw.referenceSources||[]){if(!refs.some(item=>item.id===ref.sourceId&&item.page===ref.page))refs.push({id:ref.sourceId,page:ref.page,label:ref.label});}return refs.map(ref=>sourceBtn(ref.id,ref.page,ref.label));}
function persist({delay=0}={}){resourceProgressCache=null;practiceSessionCache=null;try{const {name,birthDate,...englishProfile}=S.profile;if(!sharedProfile.get().birthDate&&saved.profile){if(saved.profile.name)englishProfile.name=saved.profile.name;if(saved.profile.birthDate)englishProfile.birthDate=saved.profile.birthDate;}localStorage.setItem('little-leaf-english-v1',JSON.stringify({profile:englishProfile,favorites:S.favorites,records:S.records}));void siteSync?.changed('english',{delay}).catch(error=>toast('本机已保存，同步暂不可用：'+error.message));return true;}catch{toast('当前浏览器未能保存，请保持页面打开或导出备份。');return false;}}
function toast(text){clearTimeout(toastTimer);document.getElementById('toast')?.remove();const n=h('div',{id:'toast',class:'toast',role:'status'},text);document.body.append(n);toastTimer=setTimeout(()=>n.remove(),2800);}
function age(){return S.profile.birthDate?EnglishModel.getAge(S.profile.birthDate):null;}
function rec(){return EnglishModel.recommend({...S.profile,listeningWords:listeningWords()},C);}
function namePart(){return S.profile.name||'宝宝';}
function shortStage(s){return s.title.replace(/第[一二三四五六]阶段\s*[·：:]?\s*/,'').replace(/常规\s*(\d)\s*[·：:]?\s*/,'常规$1 · ');}
// 窄屏按任务展开；展开偏好只在本次浏览中保留，不写入宝宝档案。
const readingFolds=new Map();
function readingFold(key,title,children,initial=false,cls=''){
  const classes=cls.split(' '),routeStage=classes.includes('route-stage-fold'),scoped=classes.includes('series-evidence')||classes.includes('series-route-use'),wide=window.matchMedia('(min-width:901px)').matches;
  return h('details',{class:'reading-fold '+cls,'data-fold-key':key,open:scoped?(readingFolds.get(key)??initial):routeStage?(readingFolds.get(key)??(wide||initial)):wide||(readingFolds.get(key)??initial),ontoggle:e=>{if(e.target===e.currentTarget&&e.currentTarget.isConnected&&(routeStage||scoped||window.matchMedia('(max-width:900px)').matches))readingFolds.set(key,e.currentTarget.open);}},h('summary',{},title),h('div',{class:'reading-fold-body'},children));
}
function foldSection(section,key,initial=false){
  const title=section.querySelector(':scope > h3,:scope > h4,:scope > .panel-title');
  if(!title)return section;
  title.remove();
  const folded=readingFold(key,title,Array.from(section.childNodes),initial,section.className);
  section.replaceWith(folded);return folded;
}
function organizePage(content){
  if(S.view==='relations'){
    const positions=content.querySelector('.match-page-grid');if(positions)positions.previousElementSibling?.classList.add('relation-positions-heading');
    const preview=content.querySelector('.reference-preview')?.closest('button');if(preview){const parent=preview.parentElement,next=preview.nextSibling;parent.insertBefore(readingFold('reference-'+S.relationMode,'查看完整原图',preview),next);}
  }
  if(S.view==='routes'){
    const legend=content.querySelector('.comparison-legend');if(legend)content.querySelector('.route-help>div')?.append(legend.cloneNode(true));
    const controls=content.querySelector('.comparison-controls'),picker=content.querySelector('.mobile-stage-picker');
    if(controls&&picker){const selection=h('div',{class:'comparison-selection'});controls.before(selection);selection.append(controls,picker);const stageSelect=picker.querySelector('select');selection.append(h('p',{class:'comparison-current-stage'},stageSelect.selectedOptions[0].textContent));}
    const overview=content.querySelector('.alignment-overview');
    if(overview)overview.parentElement.classList.add('comparison-panel');
  }
  if(S.view==='baby'){
    const supplement=content.querySelector('.baby-supplement');
    if(supplement){const title=supplement.querySelector('h3');title.remove();supplement.replaceWith(readingFold('baby-supplement',title,Array.from(supplement.childNodes)));}
    content.querySelectorAll('.two-col > .panel').forEach((panel,i)=>foldSection(panel,'baby-panel-'+i));
    const hero=content.querySelector('.hero'),recommendation=content.querySelector('.recommend-strip');
    if(hero){const summary=h('span',{class:'baby-profile-summary'},h('strong',{},namePart()+' · 英语偏好'),h('small',{},'听力约 '+S.profile.vocabulary+' 词 · 资料与呈现偏好'));
      const overview=readingFold('baby-profile-overview',summary,[hero,recommendation],false,'baby-profile-overview');
      content.prepend(h('h1',{class:'mobile-baby-title'},'今天的启蒙小计划'),overview);}
    const supplementFold=content.querySelector('[data-fold-key="baby-supplement"]');
    if(supplementFold)content.querySelector('.chain')?.after(supplementFold);
  }
  if(S.view==='library')content.querySelector('.library-filters>.reading-fold-body')?.append(content.querySelector('.material-legend'));
  if(S.view==='sources')content.querySelectorAll('.source-card').forEach(card=>{const note=card.querySelector('.source-card-head p');if(note)card.querySelector('.source-pages>.reading-fold-body')?.prepend(note);});
  return content;
}
function organizeDetail(body,kind,id){
  if(!['stage','resource'].includes(kind))return body;
  const aliases=body.querySelector(':scope > [data-fold-key^="aliases-"]');if(aliases){const series=body.querySelector(':scope > .resource-version-details');series?.append(aliases);}
  body.querySelectorAll(':scope > .detail-section').forEach((section,i)=>{
    const title=section.querySelector(':scope > h3')?.textContent||'';
    if(kind==='stage'&&title.startsWith('全部素材'))section.querySelectorAll(':scope > .detail-section').forEach((group,j)=>foldSection(group,'stage-material-'+id+'-'+j));
    foldSection(section,kind+'-'+id+'-'+i,kind==='stage'?title.startsWith('全部素材'):section.classList.contains('series-progression'));
  });
  return body;
}
window.matchMedia('(min-width:901px)').addEventListener('change',e=>document.querySelectorAll('.reading-fold').forEach(fold=>{const saved=readingFolds.get(fold.dataset.foldKey),scoped=fold.classList.contains('series-route-use')||fold.classList.contains('series-evidence');fold.open=scoped?(saved??false):fold.classList.contains('route-stage-fold')?(saved??e.matches):e.matches||(saved??false);}));
function heading(kicker,title,sub,action){return h('div',{class:'page-heading'},h('div',{},h('div',{class:'eyebrow'},h('span',{class:'dot'}),kicker),h('h1',{},title),sub?h('p',{class:'sub'},sub):null),action);}
function section(title,sub,action,num){return h('div',{class:'section-head'},h('div',{},h('h2',{},num?h('span',{class:'num'},num):null,title),sub?h('p',{},sub):null),action);}
let siteShell;
function englishNavigation(){return [
  {id:'views',title:'一起探索语言',items:NAV.map(([id,label,ic],i)=>({id,label,icon:ic,shortcut:i<5}))},
  {id:'routes',title:'收录的启蒙路线',items:C.routes.map(r=>({id:'route:'+r.id,label:r.name,icon:'route'}))},
  {id:'profile',title:'我的启蒙手册',items:[{id:'profile',label:'宝宝资料与备份',icon:'settings'}]}
];}
function navigateEnglish(id){
  if(id==='profile'){openModal('profile');return;}
  if(id.startsWith('route:')){S.route=id.slice(6);mobileRouteTab=S.route;S.compareRoute=S.route;S.compareStage=null;S.view='routes';render();window.scrollTo(0,0);history.replaceState(null,'','#routes');return;}
  navigate(id);
}
function englishActions(){return h('div',{class:'top-actions'},btn([icon('search'),h('span',{},'搜索素材、套系、动画…')],'search',{'aria-label':'搜索素材、套系、动画'},'top-search'));}
function englishGlobalActions(){return window.XiaoyaSite.createActionMenu(h('div',{class:'top-actions'},siteSync?.createButton(),btn([icon('settings'),h('span',{},'宝宝资料')],'profile',{'aria-label':'编辑宝宝资料'},'icon-button'),btn([icon('download'),h('span',{},'备份')],'backup',{'aria-label':'备份英语启蒙记录'},'icon-button')));}
function footer(){return h('footer',{class:'page-foot'},h('span',{},'根据 '+C.sources.length+' 份来源资料整理 · '+C.stages.length+' 个阶段 / 节点 · '+C.resources.length+' 个素材系列'),h('span',{},'陪伴有节奏，成长不赶路。'));}
function render(){const active=document.activeElement;const id=active?.id;const pos=active?.selectionStart;const x=window.scrollX,y=window.scrollY;const content=({baby:babyView,'qing-progress':()=>practiceView('qing'),'xu-progress':()=>practiceView('xu'),routes:routesView,library:libraryView,relations:relationsView,sources:sourcesView})[S.view]();organizePage(content);
if(!siteShell){siteShell=window.XiaoyaSite.createShell({sectionId:'english',siteRoot:window.XIAOYA_SITE_ROOT,onNavigate:navigateEnglish});el.replaceChildren(siteShell.element);}
siteShell.update({navigation:englishNavigation(),activeId:S.view,title:NAV.find(x=>x[0]===S.view)?.[1]||''});
siteShell.globalActions.replaceChildren(englishGlobalActions());siteShell.actions.replaceChildren(englishActions());siteShell.content.replaceChildren(h('div',{class:'content'},content,footer()));syncRouteTabs();if(S.view==='baby')syncVocabularyFoldToggle();
if(lastFocus?.id&&!lastFocus.isConnected)lastFocus=document.getElementById(lastFocus.id)||lastFocus;
if(id){const target=document.getElementById(id);if(target){target.focus({preventScroll:true});if(typeof pos==='number'&&target.setSelectionRange)try{target.setSelectionRange(pos,pos);}catch{}}}window.scrollTo(x,y);}

function leafArt(){const w=h('div',{class:'hero-art','aria-hidden':'true'});w.innerHTML='<svg viewBox="0 0 270 180" fill="none"><circle cx="201" cy="48" r="28" fill="#dce5ba"/><path d="M12 154C65 135 89 169 141 141c43-23 77-7 121-15" stroke="#b6c8a3" stroke-width="1.5" stroke-dasharray="4 5"/><path d="M38 142h43v-23h43V96h43V72h43" stroke="#a3bb91" stroke-width="2" stroke-linecap="round"/><rect x="49" y="91" width="27" height="28" rx="3" transform="rotate(-9 49 91)" fill="#e0c28a"/><path d="M62 94l3 19M54 98l5-1M67 96l5-1" stroke="#b29966"/><rect x="125" y="69" width="29" height="25" rx="4" transform="rotate(7 125 69)" fill="#b6c5d4"/><path d="M139 73l-2 16m-9-13 6 1m8 0 6 1" stroke="#7b95aa"/><path d="M200 71V39m0 22c-20 0-24-13-20-22 14-1 23 7 20 22Zm0-15c-1-19 8-29 23-27 3 18-7 30-23 27Z" fill="#8fac7c"/><path d="M200 72v-29m0 16-13-12m13-5 14-15" stroke="#6a8c60" stroke-width="1.5"/><ellipse cx="200" cy="75" rx="22" ry="3" fill="#d6e2c9"/><path d="m231 96 2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1 2-5Z" fill="#cfb36f"/><circle cx="91" cy="67" r="2" fill="#b5c89d"/><path d="M27 67v8m-4-4h8M165 31v7m-3-3h6" stroke="#b7c7a5" stroke-width="1.5"/></svg>';w.append(h('span',{class:'hero-art-label'},'ONE LITTLE STEP AT A TIME'));return w;}
function findResource(names){for(const name of names){const n=String(name).toLowerCase().trim();const exact=C.resources.find(r=>[r.title,...(r.aliases||[])].some(t=>t.toLowerCase()===n));if(exact)return exact;const r=C.resources.find(r=>[r.title,...(r.aliases||[])].some(title=>r.levels.some(level=>(title+' '+level).toLowerCase().includes(n))));if(r)return r;const partial=C.resources.find(r=>[r.title,...(r.aliases||[])].some(t=>t.toLowerCase().includes(n)));if(partial)return partial;}return null;}
function roleLabel(value){return ({main:'主线',core:'核心素材',parallel:'平行拓展','animation-companion':'配套动画 / 儿歌',companion:'配套',optional:'可选素材',review:'复习材料',recommended:'推荐材料'})[value]||value||'原文材料';}
function defaultChain(){const e=window.ROADMAP_RAW.editorial?.recommendation;if(e?.steps?.length)return e.steps;return [{title:'把儿歌唱成游戏',description:'选一首熟悉的 SSS 儿歌，跟着唱、做动作。',minutes:'3 分钟',materialNames:['SSS'],routeId:'xu',stageId:'xu-current-300',actionTips:['先示范动作，再在熟悉的节奏中重复。']},{title:'在生活里听懂词',description:'指真实物品、做动作，让名词和动词有具体含义。',minutes:'3 分钟',materialNames:['名词卡','动词卡'],routeId:'xu',stageId:'xu-current-300',actionTips:['从熟悉的身体、食物、玩具和动作开始。']},{title:'一本很短的共读',description:'试读闪卡式绘本；读图、指物、读短句，兴趣优先。',minutes:'3–5 分钟',materialNames:['培生词汇妙趣屋'],routeId:'xu',stageId:'xu-current-300',actionTips:['这是可选试读，不要求先完成一套。']},{title:'把熟悉的声音再听一次',description:'重听刚唱过、读过的内容，能关联画面和动作就好。',minutes:'2–3 分钟',materialNames:['SSS'],routeId:'xu',stageId:'xu-current-300',actionTips:['从见过、玩过的内容开始，愿意听再继续。']}];}
function coverLabel(r){return r.coverSource?({program:'节目宣传图',reference:'素材参考图','series-example':'套系示例封面'}[r.coverSource.kind]||'素材图片'):'原资料封面';}
function thumb(r,cls='mini-thumb'){if(r.cover)return h('img',{class:cls,src:asset(r.cover),alt:r.title+'，'+coverLabel(r),loading:'lazy'});return h('span',{class:cls,style:{display:'grid',placeItems:'center',background:r.type==='reader'?'#ede9f5':'#edf1e5',color:r.type==='reader'?'#9b8fbb':'#86a277'}},icon(r.type==='song'?'music':r.type==='animation'?'play':'book'));}
// 词汇属于个人英语 records；公开页面只包含通用分类和交互。
const V=window.EnglishVocabulary;
const vocabState={channel:'listening',type:'word',category:'all',search:'',folds:new Map(),filteredFolds:new Map(),limits:new Map(),drafts:{}};
function listeningWords(){return V.initialized(S.records)?V.summary(S.records).listening.word.unique:Number(S.profile.vocabulary)||0;}
function vocabularyOptions(selected){selected=V.resolveCategory(S.records,selected);return V.categories(S.records).map(c=>h('option',{value:c.id,selected:c.id===selected},c.name));}
function vocabSave(changes,base){
  if(base&&Object.entries(base).some(([key,value])=>value!==JSON.stringify(S.records[key]||null)))throw new Error('相关记录已被其他页面更新，输入已保留，请关闭后重新核对。');
  if(!savePracticeRecords(changes))throw new Error('保存失败，输入已保留，请重试或导出备份。');
}
function vocabBase(keys){return Object.fromEntries(keys.map(key=>[key,JSON.stringify(S.records[key]||null)]));}
function vocabularyFolds(){return vocabState.search.trim()||vocabState.category!=='all'?vocabState.filteredFolds:vocabState.folds;}
function syncVocabularyFoldToggle(){
  const button=document.getElementById('vocabulary-fold-toggle');if(!button)return;
  const folds=[...document.querySelectorAll('#vocabulary-results .vocabulary-fold')],expand=folds.some(fold=>!fold.open),label=expand?'全部展开':'全部折叠';
  button.textContent=expand?'＋':'−';button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-expanded',String(folds.length>0&&!expand));button.disabled=!folds.length;
}
function vocabularyFold(key,label,content,kind){
  const folds=vocabularyFolds();
  return h('details',{class:'vocabulary-fold '+kind,'data-vocab-fold':key,open:folds.get(key)??true,ontoggle:e=>{if(e.currentTarget.isConnected){folds.set(key,e.currentTarget.open);syncVocabularyFoldToggle();}}},h('summary',{},label),content);
}
function vocabularyResults(){
  const groups=V.groupEntries(S.records,{channel:vocabState.channel,type:vocabState.type,categoryId:vocabState.category,search:vocabState.search});
  const total=groups.reduce((n,g)=>n+g.total,0);
  const categoryList=group=>group.categories.map(cat=>{
    const key=JSON.stringify([vocabState.channel,vocabState.type,group.id,cat.id]),limit=vocabState.limits.get(key)||30;
    const content=h('div',{},h('ul',{class:'vocabulary-list'+(vocabState.type==='word'?' vocabulary-word-list':'')},cat.entries.slice(0,limit).map(e=>h('li',{class:'vocabulary-row'},btn([h('span',{class:'vocabulary-text'},e.text),e.aliases.length?h('small',{},e.aliases.join(' / ')):null],'vocab-edit',{id:'vocabulary-entry-'+e.key,'data-key':e.key,'aria-label':'编辑词条 '+e.text},'vocabulary-name')))),cat.entries.length>limit?btn('继续查看 · 余 '+(cat.entries.length-limit)+' 条','vocab-more',{'data-group':key},'text-link'):null);
    if(vocabState.type==='word'&&group.id==='verb'&&group.categories.length===1&&cat.id==='actions')return content;
    return vocabularyFold(key,[h('strong',{},cat.name),h('small',{},cat.entries.length)],content,'vocabulary-category-fold');
  });
  return h('div',{id:'vocabulary-results'},vocabState.search||vocabState.category!=='all'?h('p',{class:'vocabulary-count',role:'status'},'筛选出 '+total+' 条'):null,
    groups.length?groups.map(group=>vocabState.type==='word'?vocabularyFold(JSON.stringify([vocabState.channel,vocabState.type,group.id]),[h('span',{class:'vocabulary-pos-label vocabulary-pos-'+group.id},group.label),h('small',{},group.total)],h('div',{class:'vocabulary-category-groups'},categoryList(group)),'vocabulary-pos-fold'):categoryList(group)):h('p',{class:'empty'},V.entries(S.records).length?'暂无匹配词条，可调整筛选或点击“新增”。':'点击“新增”，选择单词词性、短语或句型。'));
}
function vocabularyPopover(id,trigger,content){
  const panel=h('div',{id,class:'vocabulary-popover',popover:'auto',ontoggle:e=>{
    const open=e.newState==='open';trigger.setAttribute('aria-expanded',String(open));
    if(open){const rect=trigger.getBoundingClientRect(),width=panel.getBoundingClientRect().width;panel.style.left=Math.max(8,Math.min(rect.right-width,innerWidth-width-8))+'px';panel.style.top=Math.max(8,Math.min(rect.bottom+5,innerHeight-panel.getBoundingClientRect().height-8))+'px';panel.querySelector('input,button,select')?.focus({preventScroll:true});}
  },onkeydown:e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();panel.hidePopover();trigger.focus({preventScroll:true});}}},content);
  return panel;
}
function vocabularyToolbar(stats){
  const add=btn('＋新增','vocab-add-menu',{id:'vocabulary-add-toggle',popovertarget:'vocabulary-add-menu','aria-label':'新增单词、短语、句型或管理分类','aria-expanded':'false'},'vocabulary-add-toggle');
  const menu=vocabularyPopover('vocabulary-add-menu',add,Object.entries(V.TYPES).map(([type,label])=>btn('＋ '+label,'vocab-new',{'data-type':type},'vocabulary-new-choice')).concat(btn('＋ 分类 / 管理分类','vocab-categories',{},'vocabulary-new-choice')));
  const search=btn(icon('search'),'vocab-search-menu',{id:'vocabulary-search-toggle',popovertarget:'vocabulary-search-popover','aria-label':'搜索词条与筛选分类',title:'搜索 / 分类筛选','aria-expanded':'false'},'icon-button');
  const update=()=>{vocabState.filteredFolds.clear();document.getElementById('vocabulary-results')?.replaceWith(vocabularyResults());syncVocabularyFoldToggle();search.classList.toggle('active',!!vocabState.search||vocabState.category!=='all');};
  const input=h('input',{id:'vocabulary-search',type:'search',value:vocabState.search,placeholder:'搜索词条或分类','aria-label':'搜索词条',oninput:e=>{if(!e.isComposing){vocabState.search=e.target.value;update();}},oncompositionend:e=>{vocabState.search=e.target.value;update();}});
  const select=h('select',{id:'vocabulary-category-filter','aria-label':'按分类查看词条',onchange:e=>{vocabState.category=e.target.value;update();}},h('option',{value:'all',selected:vocabState.category==='all'},'全部分类'),vocabularyOptions(vocabState.category));
  const filters=vocabularyPopover('vocabulary-search-popover',search,h('div',{class:'vocabulary-search-fields'},input,select,h('button',{type:'button',class:'text-link',onclick:()=>{vocabState.search='';vocabState.category='all';input.value='';select.value='all';update();input.focus();}},'清除筛选')));
  search.classList.toggle('active',!!vocabState.search||vocabState.category!=='all');
  return h('div',{class:'vocabulary-toolbar'},h('div',{class:'vocabulary-type-tabs',role:'group','aria-label':'语言内容类型'},Object.entries(V.TYPES).map(([id,label])=>btn([label,h('small',{},stats[vocabState.channel][id].unique)],'vocab-type',{'data-type':id,id:'vocab-type-'+id,'aria-pressed':id===vocabState.type},id===vocabState.type?'active':''))),h('div',{class:'vocabulary-toolbar-actions'},btn('−','vocab-folds',{id:'vocabulary-fold-toggle','aria-label':'全部折叠',title:'全部折叠','aria-controls':'vocabulary-results'},'icon-button'),add,search),menu,filters);
}
function vocabularyPanel(){
  const stats=V.summary(S.records),ch=vocabState.channel;
  return h('section',{class:'vocabulary-panel','aria-labelledby':'vocabulary-title'},
    h('div',{class:'vocabulary-heading'},h('h1',{id:'vocabulary-title'},'宝宝的语言记录'),h('div',{class:'vocabulary-tools'},btn(icon('download'),'vocab-import',{'aria-label':'批量导入词汇',title:'批量导入'},'icon-button'))),
    h('div',{class:'vocabulary-channels',role:'group','aria-label':'记录能力'},Object.entries(V.CHANNELS).map(([id,label])=>btn([h('strong',{},label),h('span',{},stats[id].word.unique+'词 · '+stats[id].phrase.unique+'短语 · '+stats[id].pattern.unique+'句型')],'vocab-channel',{'data-channel':id,id:'vocab-channel-'+id,'aria-pressed':id===ch},'vocabulary-channel'+(id===ch?' active':'')))),
    vocabularyToolbar(stats),vocabularyResults(),
    h('details',{class:'vocabulary-notes'},h('summary',{},'计数规则与英语偏好'),h('p',{class:'small-note'},'同一能力、同一类型内去重，重复输入不增加数量。foot/feet、toe/toes、tooth/teeth视为同词。短语不拆入单词，听懂与会说独立。'),h('p',{class:'small-note'},V.initialized(S.records)?'浏览建议采用听懂单词明细 '+stats.listening.word.unique+' 词；历史估计 '+S.profile.vocabulary+' 词保留在资料中，不据词数自动晋级。':'明细尚未建立，浏览建议暂沿用历史听力估计 '+S.profile.vocabulary+' 词。'),h('div',{class:'profile-mode'},'素材呈现偏好',h('div',{class:'mode-switch'},btn('共读与音频','mode',{'data-mode':'audio','aria-pressed':S.profile.mode==='audio'},S.profile.mode==='audio'?'active':''),btn('也查看动画','mode',{'data-mode':'video','aria-pressed':S.profile.mode==='video'},S.profile.mode==='video'?'active':''))),btn('宝宝资料与备份','profile',{},'text-link')));
}
function vocabularyAddForm(){
  const m=S.modal,label=V.TYPES[m.type],draft=m.draft;
  draft.channels??=[draft.channel];
  draft.items??=[draft.text||''];
  const rows=h('div',{class:'vocabulary-entry-inputs'});
  const updateFeedback=()=>{
    const channels=Object.keys(V.CHANNELS),items=[...rows.children];
    items.forEach(row=>{row.querySelector('.vocabulary-entry-feedback').textContent='';});
    try{
      const data=V.parseImport(draft.items,{type:m.type,channels,categoryId:draft.categoryId,pos:draft.pos},''),plan=V.additionPlan(S.records,data);
      let offset=0;
      for(const row of items){
        if(!V.canonical(row.querySelector('input').value,m.type))continue;
        const results=plan.results.slice(offset,offset+channels.length);offset+=channels.length;
        const names=state=>results.filter(result=>result.state===state&&(state==='existing'||draft.channels.includes(result.entry.channel))).map(result=>V.CHANNELS[result.entry.channel]);
        const existing=names('existing'),repeated=names('repeated'),added=names('added');
        row.querySelector('.vocabulary-entry-feedback').textContent=[existing.length?'已记录：'+existing.join('、'):null,repeated.length?'本次重复：'+repeated.join('、')+'（只添加一次）':null,added.length?'将新增：'+added.join('、'):null].filter(Boolean).join('；');
      }
    }catch{/* 空行及未完成输入在提交时统一校验，不打断录入。 */}
  };
  const syncRows=()=>{draft.items=[...rows.querySelectorAll('input')].map(e=>e.value);[...rows.children].forEach((row,i)=>{const input=row.querySelector('input'),remove=row.querySelector('.vocabulary-entry-remove'),feedback=row.querySelector('.vocabulary-entry-feedback');input.id=i?'vocabulary-text-'+i:'vocabulary-text';input.setAttribute('aria-label','第'+(i+1)+'条'+label);feedback.id='vocabulary-feedback-'+i;input.setAttribute('aria-describedby',feedback.id);remove.disabled=rows.children.length===1;remove.setAttribute('aria-label','删除第'+(i+1)+'条'+label);});updateFeedback();};
  const addRow=(after)=>{const row=makeRow('');after.after(row);syncRows();rows.closest('form').dataset.dirty='true';row.querySelector('input').focus();};
  const makeRow=value=>h('div',{class:'vocabulary-entry-input-row'},h('input',{name:'text',type:'text',value,maxlength:100,placeholder:'输入'+label,onkeydown:e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();addRow(e.currentTarget.parentElement);}}}),h('button',{type:'button',class:'icon-button',title:'再加一条','aria-label':'再加一条'+label,onclick:e=>addRow(e.currentTarget.parentElement)},'＋'),h('button',{type:'button',class:'icon-button vocabulary-entry-remove',title:'删除这一条',onclick:e=>{const row=e.currentTarget.parentElement,target=row.nextElementSibling||row.previousElementSibling;row.remove();syncRows();rows.closest('form').dataset.dirty='true';target.querySelector('input').focus();}},'−'),h('small',{class:'vocabulary-entry-feedback','aria-live':'polite'}));
  rows.append(...draft.items.map(makeRow));syncRows();
  const updateDraft=e=>{e.currentTarget.dataset.dirty='true';if(e.target.name==='text')syncRows();else if(e.target.name==='channel'){draft.channels=new FormData(e.currentTarget).getAll('channel');updateFeedback();}else if(e.target.name)draft[e.target.name]=e.target.value;e.currentTarget.querySelector('.form-error').textContent='';};
  return h('form',{id:'vocabulary-add',class:'practice-form',oninput:updateDraft,onchange:updateDraft},h('h2',{},'新增'+label),
    h('input',{type:'hidden',name:'type',value:m.type}),
    h('fieldset',{class:'form-row vocabulary-entries'},h('legend',{},label+'内容'),rows),
    h('div',{class:'practice-form-grid'},h('fieldset',{class:'form-row vocabulary-channel-field'},h('legend',{},'能力（可多选）'),h('div',{class:'vocabulary-channel-tags'},Object.entries(V.CHANNELS).map(([id,label])=>h('label',{},h('input',{type:'checkbox',name:'channel',value:id,checked:draft.channels.includes(id)}),label)))),h('label',{class:'form-row'},'分类',h('select',{name:'categoryId'},vocabularyOptions(draft.categoryId))),m.type==='word'?h('label',{class:'form-row'},'词性',h('select',{name:'pos'},Object.entries(V.POS).map(([id,label])=>h('option',{value:id,selected:id===draft.pos},label)))):null),
    h('p',{class:'form-error',role:'alert'}),h('button',{type:'submit',class:'button primary'},'添加'+label));
}
function vocabularyShowAdded(entries){
  if(!entries.some(entry=>entry.channel===vocabState.channel))vocabState.channel=entries[0].channel;
  vocabState.type=entries[0].type;vocabState.category='all';vocabState.search='';
  const keys=new Set(entries.map(entry=>entry.key));
  for(const group of V.groupEntries(S.records,{channel:vocabState.channel,type:vocabState.type}))for(const category of group.categories){
    const index=category.entries.reduce((last,entry,i)=>keys.has(entry.key)?i:last,-1);if(index<0)continue;
    const groupKey=JSON.stringify([vocabState.channel,vocabState.type,group.id]),key=JSON.stringify([vocabState.channel,vocabState.type,group.id,category.id]);
    vocabState.folds.set(groupKey,true);vocabState.folds.set(key,true);
    vocabState.limits.set(key,Math.max(vocabState.limits.get(key)||30,Math.ceil((index+1)/30)*30));
  }
  render();
  const entry=entries.find(entry=>entry.channel===vocabState.channel),target=document.getElementById('vocabulary-entry-'+entry.key);
  target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});
}
function vocabularyEditForm(){
  const m=S.modal,e=V.entries(S.records).find(e=>e.key===m.id);if(!e)return h('p',{},'这条记录已被删除。');
  m.base??=vocabBase([e.key]);
  return h('form',{id:'vocabulary-edit',class:'practice-form',oninput:e=>e.currentTarget.dataset.dirty='true'},h('h2',{},'编辑'+V.CHANNELS[e.channel]+V.TYPES[e.type]),
    h('label',{class:'form-row'},'内容',h('input',{name:'text',value:e.text,required:true,maxlength:100})),
    h('label',{class:'form-row'},'分类',h('select',{name:'categoryId'},vocabularyOptions(e.categoryId))),
    e.type==='word'?h('label',{class:'form-row'},'词性',h('select',{name:'pos'},h('option',{value:'',selected:!e.pos},'不标注'),Object.entries(V.POS).map(([id,label])=>h('option',{value:id,selected:e.pos===id},label)))):null,
    h('p',{class:'form-error',role:'alert'}),h('div',{class:'form-actions'},btn('删除词条','vocab-delete',{'data-key':e.key},'button practice-delete'),h('button',{type:'submit',class:'button primary'},'保存修改')));
}
function vocabularyImportForm(){return h('form',{id:'vocabulary-import',class:'practice-form',oninput:e=>{e.currentTarget.dataset.dirty='true';S.modal.plan=null;e.currentTarget.querySelector('.vocabulary-import-preview')?.replaceChildren();e.currentTarget.querySelector('[data-action="vocab-import-save"]').hidden=true;},onchange:e=>{e.currentTarget.dataset.dirty='true';S.modal.plan=null;e.currentTarget.querySelector('.vocabulary-import-preview')?.replaceChildren();e.currentTarget.querySelector('[data-action="vocab-import-save"]').hidden=true;}},
  h('h2',{},'批量导入语言记录'),h('p',{class:'small-note'},'每条用换行、逗号或顿号分隔；短语内保留空格。下列选项用于普通文本，也可粘贴带分类的JSON。'),
  h('div',{class:'practice-form-grid'},h('label',{class:'form-row'},'能力',h('select',{name:'channel'},Object.entries(V.CHANNELS).map(([id,label])=>h('option',{value:id,selected:id===vocabState.channel},label)))),h('label',{class:'form-row'},'内容类型',h('select',{name:'type'},Object.entries(V.TYPES).map(([id,label])=>h('option',{value:id,selected:id===vocabState.type},label)))),h('label',{class:'form-row'},'分类',h('select',{name:'categoryId'},vocabularyOptions('uncategorized'))),h('label',{class:'form-row'},'词性（可选）',h('select',{name:'pos'},h('option',{value:''},'不标注'),Object.entries(V.POS).map(([id,label])=>h('option',{value:id},label))))),
  h('label',{class:'form-row'},'要导入的内容',h('textarea',{name:'text',rows:8,required:true,maxlength:300000,'aria-label':'批量导入内容',placeholder:'每行一条，或用逗号分隔'})),
  h('details',{},h('summary',{},'结构化JSON格式'),h('p',{class:'small-note'},'version为1，batchId为唯一批次编号，entries数组每项包含text、channel（listening/speaking）、type（word/phrase/pattern）、categoryId、pos。同一能力和类型内重复内容只算一条，历史count字段保留但不累计。分类编号可在管理分类中查看。')),
  h('div',{class:'vocabulary-import-preview','aria-live':'polite'}),h('p',{class:'form-error',role:'alert'}),h('div',{class:'form-actions'},h('button',{type:'submit',class:'button'},'预览导入'),btn('确认导入','vocab-import-save',{hidden:true},'button primary')));
}
function vocabularyCategoryForm(){return h('div',{class:'vocabulary-category-manager'},h('h2',{},'新增 / 管理分类'),h('p',{class:'small-note'},'分类只分一级；单词另外选择名词、动词、形容词、副词等词性。删除分类后，词条保留在未分类。'),
  h('form',{id:'vocabulary-category-add',class:'vocabulary-category-row practice-form',oninput:e=>e.currentTarget.dataset.dirty='true'},h('label',{},h('span',{class:'sr-only'},'新分类名称'),h('input',{name:'name',placeholder:'新分类名称',required:true,maxlength:30})),h('button',{type:'submit',class:'button primary'},'添加分类'),h('p',{class:'form-error',role:'alert'})),
  V.categories(S.records).filter(c=>c.id!=='uncategorized').map(c=>h('form',{class:'vocabulary-category-row practice-form','data-category-id':c.id,oninput:e=>e.currentTarget.dataset.dirty='true'},h('label',{},h('span',{class:'sr-only'},'分类名称 '+c.name),h('input',{name:'name',value:c.name,maxlength:30,required:true})),h('small',{},c.id),h('button',{type:'submit',class:'button'},'保存'),btn('删除','vocab-category-delete',{'data-id':c.id,'aria-label':'删除分类 '+c.name},'text-link'),h('p',{class:'form-error',role:'alert'}))));
}
function vocabularySubmit(form){try{
  const f=new FormData(form),m=S.modal;form.querySelector('.form-error').textContent='';
  if(form.id==='vocabulary-import'){
    const data=V.parseImport(f.get('text'),Object.fromEntries(f),crypto.randomUUID()),changes=V.importPlan(S.records,data),after=V.summary({...S.records,...changes}),before=V.summary(S.records);
    m.plan={changes,base:vocabBase(Object.keys(changes))};const area=form.querySelector('.vocabulary-import-preview');area.replaceChildren(h('h3',{},'导入预览'),h('p',{},Object.keys(V.CHANNELS).map(ch=>V.CHANNELS[ch]+'：'+Object.keys(V.TYPES).map(t=>V.TYPES[t]+' '+after[ch][t].unique+'（新增'+(after[ch][t].unique-before[ch][t].unique)+'）').join(' / ')).join('；')),h('p',{class:'small-note'},'本批包含 '+data.entries.length+' 条输入；重复词条去重，其他个人记录保留。'),h('p',{class:'small-note'},data.entries.slice(0,12).map(e=>e.text).join(' · ')+(data.entries.length>12?' …':'')));form.querySelector('[data-action="vocab-import-save"]').hidden=false;return;
  }
  if(form.id==='vocabulary-edit'){
    const e=V.entries(S.records).find(e=>e.key===m.id);if(!e)throw new Error('词条已被删除，请重新核对。');const input={...e,...Object.fromEntries(f)},newKey=V.entryKey(input.text,input.type,input.channel);if(newKey!==m.id&&S.records[newKey])throw new Error('该词条已有历史记录，请用新增记录恢复，避免覆盖。');vocabSave(V.edit(S.records,m.id,input),m.base);form.dataset.dirty='false';closeModal();render();toast('词条已更新');return;
  }
  if(form.id==='vocabulary-add'){
    const channels=f.getAll('channel'),data=V.parseImport(f.getAll('text'),{...Object.fromEntries(f),channels},''),plan=V.additionPlan(S.records,data);
    if(!plan.added.length)throw new Error('所选能力下均已记录，无需重复添加；可修改内容或切换听懂／会说。');
    vocabSave(plan.changes);m.draft.text='';m.draft.items=[''];form.dataset.dirty='false';closeModal();vocabularyShowAdded(plan.added);
    const counts=entries=>Object.keys(V.CHANNELS).map(channel=>{const count=entries.filter(entry=>entry.channel===channel).length;return count?V.CHANNELS[channel]+count+'条':null;}).filter(Boolean).join('、');
    toast('已新增：'+counts(plan.added)+(plan.existing.length?'；已存在：'+counts(plan.existing)+'（未重复添加）':'')+(plan.repeated.length?'；本次重复输入已合并':''));return;
  }
  const id=form.dataset.categoryId||crypto.randomUUID();
  if(form.dataset.categoryId&&S.modal.categoryBase?.[V.CATEGORY+id]!==JSON.stringify(S.records[V.CATEGORY+id]||null))throw new Error('分类已在其他页面更新，请重新打开核对。');
  vocabSave(V.categoryChange(S.records,id,f.get('name')));form.dataset.dirty='false';m.categoryBase[V.CATEGORY+id]=JSON.stringify(S.records[V.CATEGORY+id]);if(form.id==='vocabulary-category-add'){const newRow=vocabularyCategoryForm().querySelector('[data-category-id="'+id+'"]');form.after(newRow);form.reset();}render();toast('分类已保存');
}catch(error){form.querySelector('.form-error').textContent=error.message;}}
function vocabularyAction(button){const action=button.dataset.action,key=button.dataset.key;try{
  if(action==='vocab-folds'){const folds=[...document.querySelectorAll('#vocabulary-results .vocabulary-fold')],expand=folds.some(fold=>!fold.open),state=vocabularyFolds();for(const fold of folds){state.set(fold.dataset.vocabFold,expand);fold.open=expand;}syncVocabularyFoldToggle();return;}
  if(action==='vocab-channel'||action==='vocab-type'){vocabState[action==='vocab-channel'?'channel':'type']=button.dataset[action==='vocab-channel'?'channel':'type'];render();return;}
  if(action==='vocab-more'){vocabState.limits.set(button.dataset.group,(vocabState.limits.get(button.dataset.group)||30)+30);document.getElementById('vocabulary-results')?.replaceWith(vocabularyResults());return;}
  if(action==='vocab-edit'){openModal('vocab-edit',key);return;}
  if(action==='vocab-import'){openModal('vocab-import');return;}
  if(action==='vocab-new'||action==='vocab-categories'){document.getElementById('vocabulary-add-menu')?.hidePopover();document.getElementById('vocabulary-add-toggle')?.focus({preventScroll:true});}
  if(action==='vocab-new'){const type=button.dataset.type,channel=vocabState.channel,draftKey=channel+':'+type;const draft=vocabState.drafts[draftKey]??={text:'',channel,categoryId:vocabState.category!=='all'?vocabState.category:'uncategorized',pos:type==='word'?'noun':''};openModal('vocab-add',null,{type,draft});return;}
  if(action==='vocab-categories'){openModal('vocab-categories',null,{categoryBase:vocabBase(V.categories(S.records).map(c=>V.CATEGORY+c.id))});return;}
  if(action==='vocab-import-save'){const plan=S.modal.plan;if(!plan)throw new Error('请先预览当前内容。');vocabSave(plan.changes,plan.base);overlay.querySelector('form').dataset.dirty='false';closeModal();render();toast('导入完成；已保存到个人英语记录');return;}
  if(action==='vocab-delete'){if(!confirm('删除这个词条？可在本次操作后撤销。'))return;const old=S.records[key];vocabSave(V.remove(S.records,key),S.modal.base);overlay.querySelector('form').dataset.dirty='false';closeModal();render();toast('词条已删除');const tombstone=JSON.stringify(S.records[key]);document.getElementById('toast').append(h('button',{class:'text-link',type:'button',onclick:()=>{try{vocabSave({[key]:old},{[key]:tombstone});render();toast('已撤销删除');}catch(error){toast(error.message);}}},'撤销'));return;}
  if(action==='vocab-category-delete'){const id=button.dataset.id,form=button.closest('form');if(!confirm('删除该分类？词条将保留在未分类中。'))return;vocabSave(V.categoryChange(S.records,id,'',{deleted:true}),{[V.CATEGORY+id]:S.modal.categoryBase[V.CATEGORY+id]});form.remove();S.modal.categoryBase[V.CATEGORY+id]=JSON.stringify(S.records[V.CATEGORY+id]);if(vocabState.category===id)vocabState.category='all';render();toast('分类已删除，词条仍保留');}
}catch(error){const form=button.closest('form'),alert=form?.querySelector('.form-error');if(alert)alert.textContent=error.message;else toast(error.message);}}

function babyView(){const a=age();const r=rec();const v=listeningWords();const low=v<300;const editorial=window.ROADMAP_RAW.editorial?.recommendation;const chain=defaultChain();const suggests=(r.suggested||[]).map(id=>byId.get(id)).filter(Boolean);let ready=suggests.length?suggests.slice(0,3):[findResource(['SSS']),findResource(['时光学名词卡']),findResource(['培生词汇妙趣屋'])].filter(Boolean);if(S.profile.mode==='video'){const animation=findResource(['Yakka Dee']);if(animation)ready=ready.slice(0,2).concat(animation);}return h('div',{},vocabularyPanel(),h('div',{class:'recommend-strip'},icon('sprout'),h('span',{},h('strong',{},low?'当前建议：先把词和生活连起来':'当前建议：先试读、试听，再确认下一步'),'　·　'+(a?.totalMonths<36?'低龄轻量起步；庆爸 3–4 岁路线先作未来参考。':'词数用于筛选候选，不能替代实际理解和 Phase 测试。'))),babySupplement(),section(low?'今天从这条小链路出发':'保留日常小循环，再试下一个节点','整理建议 · 每天约 10–15 分钟，可拆开完成，随兴趣调整',btn(['看完整路线 ',icon('arrow')],'view',{'data-view':'routes'},'text-link'),'01'),h('div',{class:'chain'},chain.map((item,i)=>{const resource=findResource(item.materialNames||[]);return h('article',{class:'chain-card'},h('div',{class:'step-number'},'0'+(i+1),h('span',{},item.minutes+(typeof item.minutes==='number'?' 分钟':''))),h('span',{class:'step-symbol'},icon(['music','hand','book','headphones'][i]||'book')),h('h3',{},item.title.replace(/^\d+\s*·\s*/,'')),h('p',{},['选一首熟悉儿歌，唱一小段，配上简单动作，让声音变得看得见。','用球、杯子、鞋子等熟悉实物，配合拿、放、开、关等动作。','闪卡与闪卡式绘本在第一阶段并行；从培生词汇妙趣屋或大猫预备级择一本短内容共读。','再听刚才唱过或读过的声音，关联熟悉的画面与动作。'][i]||item.description),btn(['活动与对应素材',icon('arrow')],'activity',{'data-id':i},'text-link'));})),h('div',{class:'two-col'},h('section',{class:'panel'},h('div',{class:'panel-title'},h('h3',{},'在三条路线里，找到此刻的位置'),h('span',{class:'chip edited'},'浏览建议')),h('div',{class:'route-match'},C.routes.map(route=>{const st=stages.get(r.routeStages?.[route.id])||route.stages[0];return btn([h('span',{class:'match-name'},h('i',{class:'dot',style:{'--route':route.color}}),route.name),h('span',{class:'match-body'},h('strong',{},shortStage(st)),h('p',{},route.id==='qing'&&routeAgeCase('qing').status!=='matched'?'原方案面向 3–4 岁，当前仅作资料参考':route.id==='banana'?ageCaseLabel('banana'):low?'闪卡与闪卡式绘本并行，向约300听力词积累':'目标词数用于浏览，需试读核验理解')),icon('chevron')],'stage',{'data-id':st.id},'match-row');})),h('p',{class:'small-note'},'三条路线保留各自的进阶标准；共用一本书，不表示整个阶段等价。')),h('section',{class:'panel'},h('div',{class:'panel-title'},h('h3',{},'先观察这些小信号'),icon('sprout')),h('div',{class:'practice-list'},[{n:'先做',title:'听到词，能在生活里找到它',text:'借助实物、图片、动作理解；不要求每次口头回答。'},{n:'再看',title:'重复的短句，越来越熟悉',text:'能跟随熟悉的指令或看图理解句子，愿意再次翻阅。'},{n:low?'并行':'下一站',title:low?'闪卡式绘本，现在就可以共读':'选择相邻阶段的一份素材',text:low?'培生词汇妙趣屋、大猫预备级等，先选一份感兴趣的试读。':'看图能理解、愿意听完，再决定是否逐步增加难度。'}].map(x=>h('div',{class:'practice-row'},h('span',{},x.n),h('div',{},h('strong',{},x.title),h('p',{},x.text))))),h('p',{class:'small-note'},r.reason||'词汇量来自家长估计；推荐是整理建议，不是测评结论。'))),section('先备好这几份，就可以开始','选孩子喜欢的一两份，不需要把整份书单全部备齐。',btn(['打开素材图鉴 ',icon('arrow')],'view',{'data-view':'library'},'text-link'),'02'),h('div',{class:'ready-materials'},ready.map(x=>btn([thumb(x),h('span',{class:'mini-title'},h('h4',{},x.title),h('p',{},TYPES[x.type]+' · '+Array.from(new Set(x.appearances.map(a=>routes.get(a.routeId)?.name))).filter(Boolean).join(' / '))),icon('chevron')],'resource',{'data-id':x.id},'material-mini'))),S.profile.mode==='video'?h('p',{class:'small-note'},'动画可从素材图鉴查看原表组合；是否使用屏幕由家长决定，儿歌和熟悉内容也可仅用音频与动作。'):null);}


function xuVariant(id='xu-current'){return routes.get('xu').variants?.find(v=>v.id===id)||{id:'xu-listening',label:'听力进阶',sourceId:'xu',stages:routes.get('xu').stages};}
function stageVariant(st){return st.routeId==='xu'?xuVariant(st.variantId||'xu-listening'):null;}
function versionLabel(st){return stageVariant(st)?.label||'';}
function stageName(st){if(!st)return '';return st.shortTitle||(st.routeId==='xu'?'第 '+st.order+' 阶段':st.routeId==='qing'?(st.order===7?'准桥梁':'常规 '+st.order):st.title.split(' · ')[0]);}
function stageLocation(st){return st?(versionLabel(st)?versionLabel(st)+' · ':'')+st.title:'';}
function viewedRoute(route){const plan=EnglishModel.getRoutePlan(C,route.id,S.routeDomain,S.profile);return plan?{...route,stages:plan.stages,summary:plan.summary,notes:[],sourceId:plan.sourceId,plan}:route;}
function comparisonCatalog(){return {...C,routes:C.routes.map(viewedRoute)};}
function xuVerification(){
  const evidence=window.ROADMAP_RAW.xuCurrent?.verification;if(!evidence)return null;
  return h('details',{class:'version-differences'},h('summary',{},'来源时间线 · 核对于 '+evidence.checkedAt),h('p',{},evidence.conclusion),h('ul',{},evidence.items.map(item=>h('li',{},h('strong',{},item.date+' · '+item.kind),h('p',{},h('a',{href:item.url,target:'_blank',rel:'noopener'},item.title)),h('p',{class:'small-note'},item.note)))),h('p',{class:'small-note'},evidence.limitation));
}
function routeDomainPanel(){
  const domains=window.ROADMAP_RAW.routePlan.domains,current=domains.find(d=>d.id===S.routeDomain),route=browseRoute();
  const fold=h('details',{class:'route-domain-panel domain-reference-fold',open:S.routeDomain!=='listening'||readingFolds.get('route-domain-reference'),ontoggle:e=>{if(e.target===e.currentTarget&&e.currentTarget.isConnected)readingFolds.set('route-domain-reference',e.currentTarget.open);}},
    h('summary',{},'按能力查资料',h('small',{},'当前：'+(S.routeDomain==='listening'?'听力主线':current.label))),
    h('p',{},'这些是能力领域，可交叉发展；具体先后与并行安排见阶段内容。'),
    h('div',{class:'route-domain-options'},domains.map(d=>{const plan=EnglishModel.getRoutePlan(C,route.id,d.id,S.profile);return btn([d.id==='listening'?'听力主线':d.label,h('small',{},plan.stages.length?(d.id==='listening'?'阶段推进':'能力分支'):'原文方法')],'route-domain',{'data-domain':d.id,'aria-pressed':String(d.id===S.routeDomain)},d.id===S.routeDomain?'active':'');})),h('p',{},current.description));
  return fold;
}
function browseRoute(){return viewedRoute(routes.get(S.roadmapMode==='compare'?S.compareRoute:S.route==='all'?S.compareRoute:S.route));}
function browseStage(route){return route.stages.find(st=>st.id===S.compareStage)||route.stages[0];}
function openBrowseStage(id){
  readingFolds.set('origin-'+id,true);readingFolds.set('stage-card-'+id,true);
  for(const routeId of ['xu','qing','banana'])readingFolds.set('target-'+id+'-'+routeId,true);
}
function authorPicker(){
  const selected=browseRoute(),comparison=S.roadmapMode==='compare'&&selected.stages.length;
  return h('section',{class:'route-author-picker'+(comparison?' comparison-author-picker':''),'aria-label':'选择路线作者'},h('div',{class:'route-author-options'},['xu','qing','banana'].map(id=>h('button',{type:'button',id:'browse-author-'+id,'data-browse-author':id,'aria-pressed':String(selected.id===id),style:{'--route':routes.get(id).color},onclick:()=>{
    S.compareRoute=id;S.route=id;S.compareStage=null;mobileRouteTab=id;render();document.getElementById('browse-author-'+id)?.focus({preventScroll:true});
  }},routes.get(id).name))),comparison?routeTabs(['xu','qing','banana'].map(id=>viewedRoute(routes.get(id))),selected.id,'comparison',true):null,h('p',{class:'route-reading-hint'},S.routeDomain==='listening'?'以'+selected.name+'的听力阶段为主线，其他能力按条件并行加入。':'正在查看'+selected.name+'的能力资料；各分支不表示听力阶段的后续步骤。'));
}
function routeJourney(route){
  if(!route.stages.length)return null;
  const selected=browseStage(route),sequential=S.routeDomain==='listening';
  return h('nav',{class:'route-journey'+(sequential?' sequential':''),'aria-label':sequential?'路线阶段推进':'能力分支资料'},
    h('div',{class:'journey-label'},h('strong',{},sequential?'阶段推进':'能力分支'),S.roadmapMode==='compare'?h('label',{class:'route-anchor-select'},'阶段主线',h('select',{id:'route-anchor','aria-label':'阶段对照的主线路线',onchange:e=>{S.compareRoute=e.target.value;S.route=e.target.value;S.compareStage=null;mobileRouteTab=e.target.value;render();document.getElementById('route-anchor')?.focus({preventScroll:true});}},['xu','qing','banana'].map(id=>h('option',{value:id,selected:id===route.id},routes.get(id).name)))):null,h('small',{},sequential?'按原文顺序浏览，加入条件见阶段内容':'分支可交叉发展，不按编号晋级')),
    h('ol',{},route.stages.map(st=>{const target=st.raw.listeningTargetWords,label=target?(route.stages[0].id===st.id?'0–':'')+target+'词':st.title.replace(/^常规\s*(\d+)\s*·\s*积累/,'常规$1 · ').replace(/^听力节点\s*·\s*/,'');return h('li',{},btn(label,'select-compare-stage',{id:'stage-step-'+st.id,'data-id':st.id,'data-journey':true,'aria-current':st.id===selected.id?'step':null,'aria-label':st.title},st.id===selected.id?'active':''));})));
}
function routeSourcesPanel(){
  return h('details',{class:'route-sources-panel'},h('summary',{},'资料来源与整理依据'),h('p',{},'每位作者一条路线。许密杉以全景图组织听、说、读、写，听力采用闪卡与绘本并行起步；执行表补充做法。各份原表的编号、词数和用量分别保留。'),
    h('div',{class:'links-inline'},sourceBtn('xu-panorama',1,'许密杉 · 听说读写全景图'),sourceBtn('xu-thousand',1,'许密杉 · 四阶段执行表'),sourceBtn('xu',1,'许密杉 · 原六阶段组合表'),sourceBtn('banana',routeAgeCase('banana').ageCase?.sourcePage||1,'香蕉妈妈 · 当前年龄参考'),sourceBtn('qing',1,'庆爸 · 听力专项表')),xuVerification(),crossScaleResearch());
}
function crossScaleResearch(){
  const research=window.ROADMAP_RAW.editorial?.stageComparisonResearch;if(!research)return null;
  return h('details',{class:'version-differences'},h('summary',{},'跨尺度对照依据 · '+research.checkedAt),h('p',{},research.conclusion),
    h('ul',{},research.findings.map(item=>h('li',{},h('strong',{},item.status+' · '+item.title),h('p',{},item.result),h('a',{href:item.url,target:'_blank',rel:'noopener'},item.sourceTitle)))),h('p',{class:'small-note'},research.nextStep));
}
function routeAgeCase(routeId){return EnglishModel.getRouteAgeCase(C,routeId,S.profile);}
function currentSchedules(st){return EnglishModel.getStageSchedules(C,st,S.profile).schedules;}
function ageCaseLabel(routeId){
  const context=routeAgeCase(routeId),label=context.ageCase?.label;
  return context.status==='matched'?'当前年龄方案 · '+label:context.status==='below'?'低龄参考 · '+label:context.status==='outside'?'原表年龄范围外 · 仅作资料参考':context.status==='unknown'?'完善宝宝生日后匹配年龄方案':'';
}
function ageCaseNotice(routeId){
  const context=routeAgeCase(routeId);
  return context.status==='below'?'当前尚未到原表最小年龄；以下仅作低龄参考，用量、输出与自拼不直接作为当前任务。':context.status==='outside'?'现有资料没有覆盖当前年龄的方案，保留原文参考，不套用其他年龄的任务。':context.status==='unknown'?'请先完善宝宝生日，再查看对应年龄的执行安排。':'';
}
function stageAgeLabel(st){return routeAgeCase(st.routeId).status==='general'?st.ageLabel:ageCaseLabel(st.routeId);}
function scheduleSummary(st){
  const sc=currentSchedules(st)[0];if(!sc)return null;
  return h('p',{class:'small-note stage-age-plan'},[sc.daily&&'每日 '+sc.daily,sc.gradedCount!=null&&'分级 '+sc.gradedCount+(sc.gradedCountQualifier||'册'),sc.storyCount!=null&&'故事 '+sc.storyCount+(sc.storyCountQualifier||'本')].filter(Boolean).join(' · '));
}
function domainMethod(route){return h('div',{class:'domain-method'},ageCaseLabel(route.id)?h('p',{class:'small-note'},ageCaseLabel(route.id)):null,ageCaseNotice(route.id)?h('p',{class:'small-note'},ageCaseNotice(route.id)):null,h('p',{},route.summary),sourceBtn(route.plan.sourceId,route.plan.page,'查看领域原文'));}
function domainMethodsPanel(){
  const plans=['xu','qing','banana'].map(id=>viewedRoute(routes.get(id))).filter(r=>r.plan.supportingStages.length);
  if(!plans.length)return null;
  return h('details',{class:'domain-methods-panel'},h('summary',{},'配套执行安排 · 当前年龄方案与方法'),plans.map(route=>h('section',{},h('h3',{},routeChip(route.id)),ageCaseLabel(route.id)?h('p',{class:'small-note'},ageCaseLabel(route.id)):null,ageCaseNotice(route.id)?h('p',{class:'small-note'},ageCaseNotice(route.id)):null,route.plan.supportingStages.map(st=>h('div',{class:'domain-method-item'},btn([st.variantId==='xu-thousand'?'执行表 · ':null,st.title,icon('chevron')],'stage',{'data-id':st.id},'text-link'),st.schedules.length?currentSchedules(st).filter(sc=>S.routeDomain==='speaking'?/跟读/.test(sc.output||''):/自拼|自主阅读/.test(sc.output||'')).map(sc=>h('p',{},sc.output)):h('p',{},st.goal),sourceBtn(st.sourceId,currentSchedules(st)[0]?.sourcePage||st.pages[0]||1,'对应原页'))))));
}
function babySupplement(){if(!(routes.get('xu').variants?.length>1))return null;const low=listeningWords()<300;return h('section',{class:'baby-supplement'},h('div',{},h('h3',{},'许密杉路线，当前怎么参考'),h('p',{},low?'当前记录'+listeningWords()+'个听力词，属于0–300词起步阶段。闪卡、实物动作与闪卡式绘本并行，不用先学满200词再共读。每天选少量孩子喜欢的内容，观察真实理解。':'按实际理解查看相邻听力节点。自然拼读、认读和书写留在相应执行方案中，不由听力词数自动安排。')),h('div',{class:'links-inline'},btn('查看并行起步与全部素材','stage',{'data-id':'xu-current-300'},'button'),btn('查看口语、阅读与写作','route-domain',{'data-domain':'speaking'},'text-link')));}
function levelText(value,resource){return EnglishModel.formatLevel(value,resource);}
function materialTitle(resource,level){return EnglishModel.materialTitle(resource,level);}
function materialLegend(){return materialUI.legend();}
function materialEvidence(role){return materialUI.evidence(role,{sourceLink:ref=>{
  const source=src(ref.sourceId);if(!source)return h('span',{class:'small-note'},ref.sourceId);
  if(source.previews.length)return sourceBtn(ref.sourceId,ref.page||1,source.title+' · 第 '+(ref.page||1)+' 页');
  return source.file?h('a',{class:'text-link',href:asset(source.file),target:'_blank',rel:'noopener noreferrer'},source.title+' ↗'):h('span',{class:'small-note'},source.title);
}});}
function materialEvidenceFold(id,role,label){
  const content=materialEvidence(role);if(!content)return null;
  const fold=readingFold(id,icon('info'),content,false,'series-evidence');
  fold.querySelector('summary').setAttribute('aria-label',label+'的用途依据');fold.querySelector('summary').title=label+'的用途依据';return fold;
}
const stageMaterialCache=new Map();
function stageMaterials(st,comparisonStages){if(comparisonStages)return EnglishModel.getStageMaterials(C,st,comparisonStages);if(!stageMaterialCache.has(st.id))stageMaterialCache.set(st.id,EnglishModel.getStageMaterials(C,st));return stageMaterialCache.get(st.id);}
function materialUse(resource,appearance){const st=stages.get(appearance.stageId);const item=st?stageMaterials(st).find(item=>item.resource.id===resource.id&&item.materials.some(material=>material.level===appearance.level&&(appearance.roles||[appearance.role]).includes(material.role))):null;return item?{...item,levelSegments:EnglishModel.levelSegments(appearance.level,resource.appearances.filter(peer=>peer.routeId!==st.routeId),resource,{expandRanges:true})}:null;}
function materialStageLink(r,a){const use=materialUse(r,a),role=use?.role;return btn([h('span',{},h('strong',{},stageLocation(stages.get(a.stageId))||a.stageId),h('small',{},[...new Set([levelText(a.level,r),role?.label,roleLabel(a.role)].filter(Boolean))].join(' · '))),icon('chevron')],'stage',{'data-id':a.stageId,'data-material-role':role?.kind||'reference',title:role?.basis||''},'detail-resource-row material-role-'+(role?.kind||'reference'));}
function levelNodes(parts){return parts.map(part=>h(part.shared?'b':'span',{class:'material-level-part'+(part.shared?' level-overlap':'')},part.text));}
function materialLevelParts(item){const parts=item.levelSegments.map(part=>({...part})),scale=item.resource.title.match(/\b(GK70|GK|G\d)\s*$/i);if(scale&&parts.length)parts[0].text=parts[0].text.replace(new RegExp('^'+scale[1]+'\\s+'),'');return parts;}
function materialLabel(item){return materialUI.title({name:item.resource.title,shared:item.shared,levels:materialLevelParts(item),selection:item.role.selection});}
function materialTag(item){const {material:m,resource:r,role,shared}=item,level=materialLevelParts(item).map(part=>part.text).join('');return btn(materialLabel(item),'resource',{'data-id':r.id,'data-material-role':role.kind,title:[...new Set([role.label,roleLabel(m.role)].filter(Boolean))].join(' · ')+'；'+role.basis+(shared?'；共用套系':'')+(item.overlap?'；加粗级别为重叠部分':''),'aria-label':r.title+(level?' · '+level:'')+'，'+role.label},'material-role-'+role.kind);}

function seriesGroups(r){
  return EnglishModel.getSeriesProgression(C,r.id).map(group=>{const rows=[];for(const a of group.stages){const sourceId=a.sourceId||group.routeId;let row=rows.find(b=>a.stageId===b.stageId&&a.level===b.level&&b.sourceId===sourceId);if(!row){row={...a,sourceId,roles:[],pages:[]};rows.push(row);}if(!row.roles.includes(a.role))row.roles.push(a.role);if(!row.pages.includes(a.page||1))row.pages.push(a.page||1);}return {...group,stages:rows};});
}
function variantRows(rows){const groups=[];for(const row of rows){const id=row.variantId||'base';let g=groups.find(x=>x.id===id);if(!g){g={id,label:row.variantLabel||versionLabel(stages.get(row.stageId)),rows:[]};groups.push(g);}g.rows.push(row);}return groups;}
function sharedRoutes(r){return Array.from(new Set(r.appearances.map(a=>a.routeId)));}
function compareAction(st,label='对照其他路线'){if(!window.ROADMAP_RAW.routePlan.domains.some(d=>EnglishModel.getRoutePlan(C,st.routeId,d.id)?.stageIds.includes(st.id)))label='返回所属领域的路线';return btn([icon('network'),label],'compare-stage',{'data-id':st.id},'text-link');}
function stageSongLink(st){return st.materials.some(m=>songResourceIds.has(m.resourceId))?btn([icon('music'),'SSS 分类歌单 · '+SSS.songs.length+'首 →'],'sss-songs',{'data-stage':st.id},'text-link stage-song-link'):null;}
function stageGoal(st){
  const compact=value=>String(value||'').replace(/[\s\p{P}]/gu,'');
  const goal=compact(st.goal);
  return goal&&!compact(st.title).includes(goal)?h('p',{},st.goal):null;
}
function stageFlow(st){
  const flow=EnglishModel.getStageFlow(C,st,S.profile);if(!flow)return null;
  const source=(item)=>sourceBtn(item.sourceId||flow.sourceId,item.page||flow.page,'原文');
  const activities=flow.parallel.filter(item=>item.resourceIds),parallel=flow.parallel.filter(item=>!item.resourceIds);
  return h('div',{class:'stage-flow'},
    flow.parallel.length?h('section',{class:'stage-flow-parallel'},h('h4',{},'同时进行',flow.referenceOnly?h('small',{},'原表年龄方案参考'):null),h('ul',{},activities.length?h('li',{},activities.map(item=>item.text).join(' ＋ '),source(activities[0])):null,parallel.map(item=>h('li',{},h('span',{},item.text),source(item))))):null,
    flow.later.length||flow.laterNote?h('details',{class:'stage-flow-later',open:readingFolds.get('stage-flow-later-'+st.id),ontoggle:e=>{if(e.target===e.currentTarget&&e.currentTarget.isConnected)readingFolds.set('stage-flow-later-'+st.id,e.currentTarget.open);}},h('summary',{},flow.laterLabel,flow.referenceOnly?h('small',{},'原表参考'):null),flow.later.map(item=>h('p',{},compareAction(stages.get(item.stageId),stages.get(item.stageId).title),'：',item.text,source(item))),flow.laterNote?h('p',{},flow.laterNote,source(flow)):null,
      flow.domains.length?h('div',{class:'links-inline'},flow.domains.map(id=>btn(window.ROADMAP_RAW.routePlan.domains.find(d=>d.id===id).label+'参考','route-domain',{'data-domain':id,'data-route-context':st.routeId},'text-link'))):null):null,
    h('section',{class:'stage-flow-next'},h('h4',{},flow.advance?'进入下一阶段的条件':'往后怎么看'),h('p',{},flow.advance||flow.advanceNote,source(flow)),flow.nextStageId?btn(['下一阶段：',stages.get(flow.nextStageId).title,icon('chevron')],'compare-stage',{'data-id':flow.nextStageId},'text-link flow-next-link'):null));
}
function stageReference(st){return st.routeId==='xu'?({'xu-current':'并行起步整理','xu-listening':'六阶段原表','xu-thousand':'阶段执行原表','xu-panorama':'听说读写全景图'}[st.variantId||'xu-listening']):'';}
function stageCard(st,comparisonStages,embedded=false){
  const route=routes.get(st.routeId),recommendation=rec().routeStages?.[st.routeId]===st.id,materials=stageMaterials(st,comparisonStages);
  const reference=stageReference(st);
  return h('article',{class:'stage-card '+(recommendation?'recommended ':'')+(embedded?'embedded-stage':''),style:{'--route':route.color}},
    !embedded?h('div',{class:'stage-meta'},h('strong',{},[reference,stageName(st)].filter(Boolean).join(' · ')),recommendation?h('span',{class:'route-progress-tag'},'当前浏览起点'):h('span',{},materials.length+' 项资料')):null,
    !embedded?h('h3',{},st.title):null,stageAgeLabel(st)?h('div',{class:'age-band'},stageAgeLabel(st)):null,scheduleSummary(st),st.duration?h('p',{class:'stage-duration'},'原计划用时：'+st.duration):null,stageGoal(st),
    st.entry||st.hours||st.exit?readingFold('stage-criteria-'+st.id,'准入、投入与进阶条件',[st.entry?h('p',{},h('b',{},'准入：'),st.entry):null,st.hours?h('p',{},h('b',{},'投入：'),st.hours):null,st.exit?h('p',{},h('b',{},'进阶：'),st.exit):null],false,'stage-criteria'):null,
    EnglishModel.getStageFlow(C,st,S.profile)?h('h4',{class:'stage-main-label'},'当前主线',h('small',{},'听力理解')):null,
    h('div',{class:'stage-resource-tags'},materials.map(materialTag)),
    stageSongLink(st),stageFlow(st),h('div',{class:'stage-comparison-entry'},compareAction(st)),btn(['阶段详解与全部素材',icon('arrow')],'stage',{'data-id':st.id},'stage-open'));
}
function evidenceRows(focus,target,evidence){
  // 相同级别在不同年龄计划中重复引用时，原页均保留，主列表仅展示一次。
  const unique=evidence.filter((a,i,all)=>all.findIndex(b=>a.resourceId===b.resourceId&&a.focusLevel===b.focusLevel&&a.targetLevel===b.targetLevel&&a.kind===b.kind)===i);
  return unique.map(e=>{const resource=byId.get(e.resourceId),left=levelText(e.focusLevel,resource),right=levelText(e.targetLevel,resource);const levels=e.kind==='exact'?h('span',{},'共用级别：',h('b',{class:'level-overlap'},left)):h('div',{class:'evidence-levels'},left?h('div',{},routes.get(focus.routeId).name+'：',levelNodes(EnglishModel.levelSegments(e.focusLevel,[{level:e.targetLevel}],resource))):null,right?h('div',{},routes.get(target.routeId).name+'：',levelNodes(EnglishModel.levelSegments(e.targetLevel,[{level:e.focusLevel}],resource))):null);return h('div',{class:'match-evidence-detail'},
    btn([h('strong',{class:'shared-material'},e.title),levels,e.kind==='overlap'?h('small',{},e.label.replace('同套系，','')):e.kind==='different'?h('small',{},'同套系 · 级别不同'):null],'resource',{'data-id':e.resourceId},'match-evidence'),
    h('details',{class:'match-more'},h('summary',{},'双方原页'),Array.from(new Set(evidence.filter(x=>x.resourceId===e.resourceId&&x.focusLevel===e.focusLevel&&x.targetLevel===e.targetLevel&&x.kind===e.kind).map(x=>x.focusPage||1))).map(page=>sourceBtn(e.focusSourceId||focus.sourceId||focus.routeId,page,routes.get(focus.routeId).name+' · 第 '+page+' 页')),Array.from(new Set(evidence.filter(x=>x.resourceId===e.resourceId&&x.focusLevel===e.focusLevel&&x.targetLevel===e.targetLevel&&x.kind===e.kind).map(x=>x.targetPage||1))).map(page=>sourceBtn(e.targetSourceId||target.sourceId||target.routeId,page,routes.get(target.routeId).name+' · 第 '+page+' 页'))));});
}
function stageMatch(focus,match,mode='direct',complete=false,comparisonStages){
  const target=stages.get(match.stageId),ev=match.evidence.filter(e=>mode==='vocabulary'||mode==='starting'?true:mode==='direct'?e.kind==='exact'||e.kind==='overlap':mode==='uncertain'?e.kind==='unspecified':e.kind==='different');
  const rest=match.evidence.filter(e=>!ev.includes(e));
  const evidence=[mode==='vocabulary'||mode==='starting'?(ev.length?h('details',{class:'match-more'},h('summary',{},'共用素材与级别 · '+match.sharedCount+' 套'),evidenceRows(focus,target,ev)):null):evidenceRows(focus,target,ev),
    rest.length?h('details',{class:'match-more'},h('summary',{},'另有 '+new Set(rest.map(e=>e.resourceId)).size+' 套共用材料 · 查看级别差异'),evidenceRows(focus,target,rest)):null];
  if(complete){
    const card=stageCard(target,comparisonStages||[focus]);
    card.classList.add('match-card','complete-stage-match');if(mode!=='direct')card.classList.add(mode);card.dataset.targetStage=target.id;
    card.append(h('p',{class:'alignment-match-label match-basis-label',title:mode==='starting'?match.startingAlignment.focus+'；'+match.startingAlignment.target:match.basis},mode==='starting'?'起步方式参考 · 各自路线起点，任务与难度不等同':mode==='vocabulary'?'词汇目标参考：'+match.vocabularyAlignment.focus.label+' ↔ '+match.vocabularyAlignment.target.label:mode==='direct'?'素材关联 · '+match.overlapCount+' 套有级别交集，不代表整个阶段等同':'共用套系关联 · 不代表阶段等同'));
    evidence.flat().filter(Boolean).forEach(node=>card.append(node));return card;
  }
  return h('div',{class:'match-card '+(mode==='direct'?'':mode),'data-target-stage':target.id},
    h('div',{class:'match-head'},btn([stageName(target),icon('chevron')],'stage',{'data-id':target.id},'text-link'),h('span',{class:'match-count'},mode==='starting'?'起步方式参考':mode==='vocabulary'?'词汇目标参考':mode==='direct'?match.overlapCount+' 套级别有交集':mode==='uncertain'?'共用素材':'同套系 · 不同级别')),
    mode==='vocabulary'?h('p',{class:'alignment-match-label'},'词汇目标参考：'+match.vocabularyAlignment.focus.label+' ↔ '+match.vocabularyAlignment.target.label):null,evidence);
}
function primaryStageMatches(group){return group.stageReferences.slice().sort((a,b)=>stages.get(a.stageId).order-stages.get(b.stageId).order);}
function comparisonTarget(focus,group,complete=false,comparisonStages){
  const primary=primaryStageMatches(group),others=group.matches.filter(m=>!primary.includes(m)).sort((a,b)=>stages.get(a.stageId).order-stages.get(b.stageId).order);
  return h('div',{class:'comparison-target','data-target-route':group.routeId},h('div',{class:'comparison-route'},routeChip(group.routeId)),
    primary.length?primary.map(m=>stageMatch(focus,m,m.startingAlignment?'starting':'vocabulary',complete,comparisonStages)):h('p',{class:'comparison-empty'},group.vocabularyComparable?'暂无相近词汇目标阶段':'尚缺可核验的阶段换算依据'),
    others.length?h('details',{class:'comparison-secondary other-material-matches'},h('summary',{},'其他素材关联 · '+others.length+' 个阶段'),h('p',{class:'small-note'},'以下仅列素材交集，书目重叠不代表阶段对应。'),others.map(m=>stageMatch(focus,m,m.overlapCount?'direct':m.unspecifiedCount?'uncertain':'different'))):null);
}
function comparisonDomain(st,index,list){return st.group&&list.some(item=>item.group!==st.group)&&(index===0||list[index-1].group!==st.group)?h('div',{class:'comparison-domain'},h('strong',{},st.group),h('small',{},'独立领域；不与其他领域按阶段序号衔接')):null;}
function phaseOverview(route,targets){
  return h('section',{class:'phase-overview','aria-label':'跨路线阶段关联速览'},h('h2',{},'阶段关联速览'),h('p',{},'先核对阶段能力及判定规则；尺度不同时核验换算依据，再查看素材。'),
    h('div',{class:'phase-overview-row phase-overview-head'},h('strong',{},route.name),targets.map(r=>h('strong',{},r.name))),
    route.stages.map((st,index)=>{const groups=EnglishModel.compareStages(comparisonCatalog(),st.id);return [comparisonDomain(st,index,route.stages),h('div',{class:'phase-overview-row','data-overview-stage':st.id},compareAction(st,stageName(st)),targets.map(r=>{
      const group=groups.find(g=>g.routeId===r.id),confirmed=primaryStageMatches(group);
      return h('div',{class:'phase-overview-links'},h('small',{class:'overview-route'},r.name),group.startingComparable?h('small',{class:'alignment-basis'},'起步方式参考'):group.vocabularyComparable?h('small',{class:'alignment-basis'},'词汇目标参考'):null,
        confirmed.map(m=>btn(stageName(stages.get(m.stageId)),'stage',{'data-id':m.stageId},'overview-stage'+(group.vocabularyComparable?' vocabulary':''))),
        !confirmed.length?h('span',{class:'overview-none'},group.vocabularyComparable?'暂无相近词汇目标':'阶段对应待核验'):null);
    }))];}));
}
// 小屏先呈现对应阶段，展开后保留完整卡片和关联证据。
let mobileRouteTab=null;
function routeTabs(columns,fallback,key,global=false){
  const nav=h('div',{class:'route-tabs','data-global-tabs':global?'true':null,'data-fallback-route':fallback,'aria-label':'切换路线内容',onkeydown:e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    const tabs=Array.from(e.currentTarget.querySelectorAll('button')),index=tabs.indexOf(e.target);if(index<0)return;
    e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tabs[next].click();tabs[next].focus({preventScroll:true});
  }},columns.map(r=>h('button',{type:'button',id:'route-tab-'+key+'-'+r.id,'data-tab-route':r.id,'aria-controls':'route-panel-'+key+'-'+r.id,style:{'--route':r.color},onclick:()=>{mobileRouteTab=r.id;syncRouteTabs();}},r.name)));
  return nav;
}
function syncRouteTabs(){
  const narrow=window.matchMedia('(max-width:900px)').matches;
  document.querySelectorAll('.route-tabs').forEach(nav=>{
    const selected=mobileRouteTab||nav.dataset.fallbackRoute;
    if(narrow)nav.setAttribute('role','tablist');else nav.removeAttribute('role');
    nav.querySelectorAll('button').forEach(tab=>{
      const active=tab.dataset.tabRoute===selected,panels=nav.dataset.globalTabs?Array.from(document.querySelectorAll('.complete-comparison>.stage-comparison-row>[data-aligned-route="'+tab.dataset.tabRoute+'"]')):[document.getElementById(tab.getAttribute('aria-controls'))].filter(Boolean);
      if(nav.dataset.globalTabs)tab.setAttribute('aria-controls',panels.map(panel=>panel.id).join(' '));
      if(narrow){tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}else{tab.removeAttribute('role');tab.removeAttribute('aria-selected');tab.removeAttribute('tabindex');}
      for(const panel of panels){
      panel.classList.toggle('route-tab-inactive',!active);
      if(narrow){panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);if(active&&panel.tagName==='DETAILS'&&!readingFolds.has(panel.dataset.foldKey))panel.open=true;}else{panel.removeAttribute('role');panel.removeAttribute('aria-labelledby');}
      }
    });
  });
}
window.matchMedia('(max-width:900px)').addEventListener('change',()=>{if(S.view==='routes'&&S.roadmapMode==='complete')render();else syncRouteTabs();});
function alignedRouteCell(route,focus,group,peers){
  if(!route.stages.length){const cell=readingFold('method-'+route.id+'-'+S.routeDomain,h('span',{class:'origin-stage-title'},routeChip(route.id),h('strong',{},route.plan.domain.label+'安排')),domainMethod(route),false,'aligned-route-cell domain-method-cell route-stage-fold');cell.style.setProperty('--route',route.color);cell.dataset.alignedRoute=route.id;cell.id='route-panel-'+focus.id+'-'+route.id;return cell;}
  const origin=route.id===focus.routeId,linked=origin?[]:primaryStageMatches(group);
  const title=origin?focus.title:linked.length?linked.map(m=>stages.get(m.stageId).title).join('、'):'阶段对应待核验';
  const cell=readingFold((origin?'origin-':'target-')+focus.id+(origin?'':'-'+route.id),h('span',{class:'origin-stage-title'},routeChip(route.id),h('strong',{},title)),
    origin?stageCard(focus,peers):comparisonTarget(focus,group,true,[focus,...peers]),origin,
    'aligned-route-cell route-stage-fold '+(origin?'alignment-origin-cell origin-stage':'alignment-target-details'+(linked.length===1?' alignment-single-stage':'')));
  if(!origin)cell.querySelector(':scope > .reading-fold-body').classList.add('alignment-target-body');
  cell.style.setProperty('--route',route.color);cell.dataset.alignedRoute=route.id;cell.id='route-panel-'+focus.id+'-'+route.id;return cell;
}
function stageComparison(){
  const columns=['xu','qing','banana'].map(id=>viewedRoute(routes.get(id))),route=columns.find(r=>r.id===S.compareRoute&&r.stages.length)||columns.find(r=>r.stages.length),targets=columns.filter(r=>r.id!==route.id);
  const selected=route.stages.find(st=>st.id===S.compareStage)||route.stages[0];
  const rows=route.stages.map(st=>({stage:st,groups:EnglishModel.compareStages(comparisonCatalog(),st.id)}));
  const remaining=columns.map(r=>({route:r,stages:r.id===route.id?[]:r.stages.filter(st=>!rows.some(row=>primaryStageMatches(row.groups.find(g=>g.routeId===r.id)).some(m=>m.stageId===st.id)))}));
  return h('div',{class:'comparison-panel'},h('details',{class:'alignment-overview'},h('summary',{},'阶段关联速览 · 查看全部阶段对应'),phaseOverview(route,targets)),h('div',{class:'stage-comparison complete-comparison','aria-label':'三条完整路线的阶段对照'},h('div',{class:'comparison-head'},columns.map(r=>h('div',{style:{'--route':r.color}},routeChip(r.id),h('small',{},r.stages.length?r.stages.length+' 个'+(r.stages.some(st=>st.group)?'节点':'阶段')+(r.id===route.id?' · 按此顺序浏览':' · 显示关联内容'):'本领域原文方法')))),rows.map((row,index)=>{const st=row.stage;return [comparisonDomain(st,index,route.stages),h('article',{class:'stage-comparison-row '+(selected.id===st.id?'mobile-current ':'')+(S.compareStage===st.id?'comparison-focused':''),id:'compare-'+st.id,'data-stage-id':st.id,style:{'--route':route.color}},columns.map(r=>alignedRouteCell(r,st,row.groups.find(g=>g.routeId===r.id),row.groups.flatMap(g=>primaryStageMatches(g).map(m=>stages.get(m.stageId))))))];}),remaining.some(r=>r.stages.length)?h('details',{class:'alignment-remaining'},h('summary',{},'其他未关联阶段 · 展开查看'),h('p',{class:'small-note'},'以下阶段尚未建立有依据的阶段对应或起步参考，仍可按各自路线完整浏览；素材关联另行保留。'),h('div',{class:'alignment-remaining-grid'},remaining.map(({route:r,stages:list})=>h('div',{class:'aligned-route-cell','data-remaining-route':r.id},h('h3',{},routeChip(r.id)),list.length?list.map(st=>compactStage(st)):h('p',{class:'comparison-empty'},'这条路线的全部阶段已在上方展示'))))):null));
}
function routeExpansionKey(){return 'route-expand-all-'+S.roadmapMode+'-'+S.routeDomain+'-'+(S.roadmapMode==='compare'?S.compareRoute:S.route);}
function setRouteStagesOpen(open){
  const view=document.querySelector('.routes-view');if(!view)return;
  readingFolds.set(routeExpansionKey(),open);view.classList.toggle('routes-expanded',open);
  view.querySelectorAll('.route-stage-fold').forEach(fold=>{readingFolds.set(fold.dataset.foldKey,open);fold.open=open;});
  const toggle=view.querySelector('#routes-toggle-all');
  toggle.textContent=open?'折叠全部':'展开全部';toggle.setAttribute('aria-expanded',String(open));
}
function independentRouteView(route){
  return h('div',{class:'independent-routes'},h('div',{class:'lanes single'},h('section',{class:'route-lane',id:'route-panel-complete-'+route.id,style:{'--route':route.color}},
    route.stages.length?routeStageList(route):domainMethod(route))));
}
function routesView(){
  const comparison=S.roadmapMode==='compare',route=browseRoute();
  return h('div',{class:'routes-view'+(readingFolds.get(routeExpansionKey())?' routes-expanded':'')},
    heading('THE COMPLETE ROADMAP','三条完整路线',null,btn([icon('book'),'多路线共用书单'],'shared-library')),
    authorPicker(),routeJourney(route),
    h('div',{class:'toolbar roadmap-mode','aria-label':'完整路线查看模式'},h('div',{class:'segmented'},[['compare','阶段对照'],['complete','独立排列']].map(([id,label])=>btn(label,'roadmap-mode',{'data-mode':id,'aria-pressed':String(S.roadmapMode===id)},S.roadmapMode===id?'active':''))),
      h('div',{class:'route-fold-actions'},h('button',{id:'routes-toggle-all',type:'button',class:'button','aria-expanded':String(!!readingFolds.get(routeExpansionKey())),onclick:()=>setRouteStagesOpen(!readingFolds.get(routeExpansionKey()))},readingFolds.get(routeExpansionKey())?'折叠全部':'展开全部'))),
    routeDomainPanel(),comparison&&route.stages.length?stageComparison():independentRouteView(route),
    h('details',{class:'route-reference-panel'},h('summary',{},'执行方法、来源与对照说明'),domainMethodsPanel(),routeSourcesPanel(),
      h('details',{class:'route-help'},h('summary',{},'对照规则与共用素材图例'),h('div',{},h('p',{},'先核对原文阶段定义、准入与目标，再查看素材。许密杉与庆爸按听力词汇目标粗略参考；香蕉妈妈Pre仅参考起步方式，后续阶段的换算依据仍待核验。共用素材不参与阶段判定。听、说、读、写可以交叉发展，不按领域按钮的排列顺序晋级。'),materialLegend()))));
}

// 旋转设备或调整窗口时同步辅助内容折叠；阶段展开选择由 readingFolds 保留。
for(const [query,selector] of [['(min-width:901px)','.version-context']]){
  window.matchMedia(query).addEventListener('change',e=>{document.querySelectorAll(selector).forEach(detail=>{detail.open=e.matches;});syncRouteTabs();});
}

function compactStage(st){
  const selected=browseStage(browseRoute())?.id===st.id,fold=readingFold('stage-card-'+st.id,h('span',{class:'compact-stage-title'},h('strong',{},st.title),h('small',{},[stageMaterials(st).length+' 项素材',stageReference(st)].filter(Boolean).join(' · '))),stageCard(st,undefined,true),selected,'route-stage-fold compact-stage'+(selected?' selected-stage':''));
  fold.dataset.stageId=st.id;fold.style.setProperty('--route',routes.get(st.routeId).color);return fold;
}
function routeStageList(route){
  const grouped=route.stages.some(st=>st.group);if(!grouped)return h('div',{class:'stage-list'},route.stages.map(compactStage));
  const groups=Array.from(new Set(route.stages.map(st=>st.group||'其他')));
  return h('div',{class:'domain-groups'},groups.map(group=>h('section',{class:'domain-group'+(group==='阅读阶段'?' independent':'')},h('h3',{},group),h('p',{},group==='听力阶段'?'300 → 500 → 800 → 1000 → 2000词：原图听力分支':group==='阅读阶段'?'识字、泛读、精读分别查看；不换算成听力词数':'原图独立领域，未给与其他领域的固定启动年龄'),h('div',{class:'stage-list'},route.stages.filter(st=>(st.group||'其他')===group).map(compactStage)))));
}


const libraryUsageFolds=new Map(),libraryRouteFolds=new Map();
function usageSummary(r){
  const order={xu:0,qing:1,banana:2};
  const groups=seriesGroups(r).sort((a,b)=>(order[a.routeId]??3)-(order[b.routeId]??3));
  if(!groups.length)return h('p',{class:'all-levels'},EnglishModel.getLevelSummary(r.levels,r).join(' / ')||'仅见于补充图，未关联原路线阶段');
  return h('div',{class:'resource-usage'},groups.map(group=>{
    const key=r.id+'/'+group.routeId;
    return h('details',{class:'usage-route','data-usage-route':group.routeId,'data-usage-key':key,open:libraryRouteFolds.get(key)??true,ontoggle:e=>{
      if(e.target!==e.currentTarget||!e.currentTarget.isConnected)return;
      libraryRouteFolds.set(key,e.currentTarget.open);updateLibraryUsageToggle();
    }},h('summary',{'aria-label':r.title+' · '+routes.get(group.routeId).name+'路线使用明细'},routeChip(group.routeId)),
      variantRows(group.stages).map(v=>h('div',{class:'usage-version'},v.label?h('small',{},v.label):null,
        h('div',{class:'usage-stages'},v.rows.map(a=>{
          const use=materialUse(r,a);
          return btn([h('span',{},stageName(stages.get(a.stageId))),levelText(a.level,r)?h('span',{class:'usage-levels'},levelNodes(use?.levelSegments||EnglishModel.levelSegments(a.level,[],r,{expandRanges:true}))):null],'stage',{'data-id':a.stageId,title:use?use.role.label+'；'+use.role.basis:'','data-material-role':use?.role.kind||'reference'},'usage-stage material-role-'+(use?.role.kind||'reference'));
        })))));
  }));
}
function cardUsage(r){
  return h('details',{id:'library-usage-'+r.id,class:'card-usage','data-resource-id':r.id,open:libraryUsageFolds.get(r.id)??false,ontoggle:e=>{
    if(e.target===e.currentTarget&&e.currentTarget.isConnected){libraryUsageFolds.set(r.id,e.currentTarget.open);updateCardUsageToggle(e.currentTarget);updateLibraryUsageToggle();}
  }},h('summary',{},h('span',{},'路线阶段与级别')),usageSummary(r));
}
function updateCardUsageToggle(fold){
  const trigger=fold.closest('.library-card')?.querySelector('.library-card-usage-toggle');if(!trigger)return;
  const label=(fold.open?'收起':'展开')+trigger.dataset.usageLabel;
  trigger.textContent=fold.open?'−':'＋';trigger.title=label;trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-expanded',String(fold.open));
}
function cardUsageToggle(r,fold,label='路线阶段与级别'){
  const name=r.title+'的'+label;
  return h('button',{type:'button',class:'icon-button library-card-usage-toggle','data-usage-label':name,'aria-controls':fold.id,'aria-expanded':String(fold.open),'aria-label':(fold.open?'收起':'展开')+name,title:(fold.open?'收起':'展开')+name,onclick:()=>{
    fold.open=!fold.open;libraryUsageFolds.set(r.id,fold.open);updateCardUsageToggle(fold);updateLibraryUsageToggle();
  }},fold.open?'−':'＋');
}
function libraryUsageExpanded(rr=filteredResources()){
  if(S.libraryBookMode||S.libraryTopic!=='all'){const books=filteredLibraryBooks().filter(b=>b.appearances.length);return books.length>0&&books.every(b=>libraryUsageFolds.get(b.id)===true);}
  return rr.length>0&&rr.every(r=>libraryUsageFolds.get(r.id)===true&&sharedRoutes(r).every(routeId=>libraryRouteFolds.get(r.id+'/'+routeId)!==false));
}
function setLibraryUsageOpen(open){
  if(S.libraryBookMode||S.libraryTopic!=='all'){
    for(const book of filteredLibraryBooks())libraryUsageFolds.set(book.id,open);
    document.querySelectorAll('.library-results .library-book-stages').forEach(fold=>fold.open=open);
    updateLibraryUsageToggle();return;
  }
  for(const r of filteredResources()){
    libraryUsageFolds.set(r.id,open);
    for(const routeId of sharedRoutes(r))libraryRouteFolds.set(r.id+'/'+routeId,open);
  }
  document.querySelectorAll('.resource-grid .card-usage').forEach(fold=>{
    fold.open=open;fold.querySelectorAll('.usage-route').forEach(route=>{route.open=open;});
  });
  updateLibraryUsageToggle();
}
function updateLibraryUsageToggle(trigger=document.getElementById('library-usage-toggle')){
  if(!trigger)return;
  const rr=filteredResources(),expanded=libraryUsageExpanded(rr),label=expanded?'全部收起路线明细':'全部展开路线明细';
  trigger.disabled=S.libraryBookMode||S.libraryTopic!=='all'?!filteredLibraryBooks().some(b=>b.appearances.length):!rr.length;trigger.title=label;trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-expanded',String(expanded));
  trigger.replaceChildren(h('span',{'aria-hidden':'true',class:'library-usage-symbol'},expanded?'−':'＋'));
}
function seriesProgression(r){
  const groups=seriesGroups(r).sort((a,b)=>['xu','qing','banana'].indexOf(a.routeId)-['xu','qing','banana'].indexOf(b.routeId));
  return h('section',{class:'detail-section series-progression'},h('h3',{},'路线使用阶段'),
    groups.length?groups.map(group=>readingFold('series-'+r.id+'-'+group.routeId,routeChip(group.routeId),
      h('div',{class:'series-usage-list'},group.stages.map(a=>{
        const st=stages.get(a.stageId),use=materialUse(r,a),level=levelText(a.level,r);
        const methods=Array.from(new Set((st?.activities||[]).filter(activity=>activity.resourceIds.includes(r.id)&&a.roles.includes(activity.title)).map(activity=>activity.method).filter(Boolean)));
        const refs=r.appearances.filter(ref=>ref.routeId===group.routeId&&ref.stageId===a.stageId&&ref.level===a.level&&(ref.sourceId||st?.sourceId||ref.routeId)===a.sourceId);
        const evidence=refs.length?refs:[a];
        const detail=readingFold('series-evidence-'+r.id+'-'+a.stageId+'-'+group.stages.indexOf(a),icon('info'),
          h('div',{},materialEvidence(use?.role),methods.map(method=>h('p',{class:'series-usage-method'},method)),
            h('ul',{class:'series-evidence-list'},evidence.map(ref=>h('li',{'data-original-role':ref.role},
              h('span',{class:'small-note'},[ref.variantLabel||a.variantLabel,roleLabel(ref.role)].filter(Boolean).join(' · ')),
              ref.original?h('p',{},ref.original):null,
              sourceBtn(ref.sourceId||st?.sourceId||group.routeId,ref.page||1,(src(ref.sourceId||st?.sourceId||group.routeId)?.title||'原文')+' · 第 '+(ref.page||1)+' 页'))))),false,'series-evidence');
        const detailLabel=(st?.title||a.stageTitle||a.stageId)+'的用法与出处 · '+evidence.length+'处';
        detail.querySelector('summary').setAttribute('aria-label',detailLabel);detail.querySelector('summary').title=detailLabel;
        return h('article',{class:'series-usage-row'},
          h('div',{class:'series-usage-heading material-role-'+(use?.role.kind||'reference'),'data-material-role':use?.role.kind||'reference',title:[use?.role.label,use?.role.basis].filter(Boolean).join('；')},btn(st?.title||a.stageTitle||a.stageId,'stage',{'data-id':a.stageId,'aria-label':(st?.title||a.stageTitle||a.stageId)+'，'+(use?.role.label||EnglishModel.materialRoles.reference)+(level?'，'+level:'')},'text-link'),
            level&&level!==r.title?h('span',{class:'series-levels'},levelNodes(use?.levelSegments||EnglishModel.levelSegments(a.level,[],r,{expandRanges:true}))):null,
            a.variantLabel&&a.variantLabel!==routes.get(group.routeId).name+'路线'?h('small',{class:'version-tag'},a.variantLabel):null),detail);
      })),false,'series-route-use')):h('p',{class:'small-note'},'此素材仅见于补充图，三条原路线中未见明确阶段引用。'));
}

function familyCover(r){const div=h('div',{class:'resource-cover cover-type-'+r.type});if(r.cover){div.append(h('img',{src:asset(r.cover),alt:r.title+'，'+coverLabel(r),loading:'lazy'}),h('span',{class:'cover-caption'},coverLabel(r)));}else{div.append(h('span',{class:'generated-cover','aria-hidden':'true'},icon(r.type==='animation'?'play':r.type==='song'?'music':'book'),h('b',{},r.title),h('small',{},'LITTLE LEAF LIBRARY')),h('span',{class:'cover-caption'},'图示 · 点开可看原页'));}return div;}
window.matchMedia('(min-width:901px)').addEventListener('change',()=>{if(S.view==='library')render();});
function savePracticeRecords(changes){
  const previous=S.records;S.records={...previous,...changes};
  if(!persist()){S.records=previous;return false;}return true;
}
let resourceProgressCache=null,practiceSessionCache=null;
function practiceSessions(){if(practiceSessionCache?.records!==S.records)practiceSessionCache={records:S.records,entries:P.sessions(S.records)};return practiceSessionCache.entries;}
function resourceRouteEntries(id){
  const profileKey=JSON.stringify(S.profile);
  if(!resourceProgressCache||resourceProgressCache.records!==S.records||resourceProgressCache.profileKey!==profileKey){
    const index=new Map(),seen=new Set(),sessions=practiceSessions();
    for(const routeId of ['xu','qing'])for(const domain of routeId==='xu'?window.ROADMAP_RAW.routePlan.domains.map(d=>d.id):['listening']){
      const plan=EnglishModel.getRoutePlan(C,routeId,domain,S.profile);
      for(const stage of plan?.stages||[])for(const unit of practiceGroups(stage)){
        if(seen.has(unit.key))continue;seen.add(unit.key);
        const progress=practiceUnitRecord(unit),time=routeId==='qing'?P.materialTime(S.records,unit.key,unit.children?.map(child=>child.key),sessions):null;
        const entry={key:unit.key,materialUnit:unit,stage,routeId,domain,...progress,...time};
        if(!index.has(unit.resourceId))index.set(unit.resourceId,[]);
        index.get(unit.resourceId).push(entry);
      }
    }
    resourceProgressCache={records:S.records,profileKey,index};
  }
  return resourceProgressCache.index.get(id)||[];
}
function libraryQuantityContext(resource){
  const unit=window.ROADMAP_RAW.resourceVolumes.series.find(series=>series.resourceId===resource.id)?.unit||P.quantityUnit(resource.type),key=P.LIBRARY+resource.id;
  const scopes=P.libraryScopes(S.records[key],P.bookScopes(resource.id,[],window.ROADMAP_RAW.resourceVolumes),unit);
  return {key,scopes,unit,...P.libraryQuantity(S.records[key],scopes,unit)};
}
function resourceProgress(resource){
  const entries=resourceRouteEntries(resource.id);
  return entries.length?{...P.resourceProgress(entries),automatic:true}:libraryQuantityContext(resource);
}
function resourceStatusControl(r,detail=false,compact=false){
  const progress=resourceProgress(r),label=P.STATUS[progress.status];
  const quantity=progress.automatic?null:progress.completed+(progress.total===null?'':'/'+progress.total)+progress.unit+(progress.percent===null?'':' · '+progress.percent+'%');
  return h('div',{class:'material-status-control'},h('span',{},progress.automatic?'路线汇总':'完成进度'),
    btn(compact?[h('span',{class:'library-status-label'},label),icon('chevron')]:quantity?[h('span',{},label),h('small',{},quantity)]:label,'resource-progress',{'data-id':r.id,id:'status-'+(detail?'detail-':'')+r.id,'aria-label':r.title+'的真实进度：'+label+(quantity?'，'+quantity:'')+'；'+(progress.automatic?'查看各路线阶段进展':'记录完成数量'),'aria-haspopup':'dialog',title:progress.automatic?'由许密杉、庆爸的路线记录自动汇总；点击查看各阶段':quantity+'；点击记录数量'},'material-status '+progress.status+(quantity?' material-quantity-status':'')+(compact?' library-status-action':'')));
}
function resourceProgressText(progress){
  const completed=progress.done??progress.completed;
  return completed+(progress.total===null?'':'/'+progress.total)+(progress.unit||(progress.done!==undefined?'首':'个'))+(progress.percent===null?'':' · '+progress.percent+'%');
}
function resourceProgressRows(resource){
  return resourceRouteEntries(resource.id).map(entry=>h('section',{class:'resource-progress-stage'},
    h('div',{class:'resource-progress-heading'},btn(routes.get(entry.routeId).name+' · '+entry.stage.title,'practice-jump',{'data-route':entry.routeId,'data-domain':entry.domain,'data-stage':entry.stage.id},'text-link'),h('span',{class:'progress-state '+(entry.status==='done'?'done':entry.status==='using'||entry.minutes>0||entry.effectiveMinutes>0?'using':'not-started')},P.STATUS[entry.status==='done'?'done':entry.status==='using'||entry.minutes>0||entry.effectiveMinutes>0?'using':'not-started'])),
    h('p',{},practiceBookLabel(entry.materialUnit)+' · '+resourceProgressText(entry)),
    entry.routeId==='qing'?h('p',{class:'small-note'},'实际 '+Number(entry.minutes.toFixed(1))+' 分钟 · 有效 '+Number(entry.effectiveMinutes.toFixed(1))+' 分钟'):null,
    entry.materialUnit.children?.map(child=>{const progress=practiceUnitRecord(child),time=entry.routeId==='qing'?P.materialTime(S.records,child.key):null;return h('div',{class:'resource-progress-child'},h('span',{},practiceBookLabel(child)),h('span',{},resourceProgressText(progress)),time?h('small',{},'实际 '+Number(time.minutes.toFixed(1))+' / 有效 '+Number(time.effectiveMinutes.toFixed(1))+' 分钟'):null);})));
}
function resourcePracticeSummary(resource){
  if(!resourceRouteEntries(resource.id).length)return null;
  return h('section',{class:'resource-practice-summary'},h('h3',{},'路线内的使用进度'),resourceProgressRows(resource));
}
function libraryQuantityForm(resource){
  const context=libraryQuantityContext(resource),m=S.modal;
  const base=JSON.stringify(S.records[context.key]||null);
  const current=context.scope,match=current&&context.scopes.findIndex(scope=>scope.id===current.id&&scope.edition===current.edition&&scope.total===current.total);
  const initial=current?(match>=0?String(match):'custom'):'count';
  let form;
  const chosenScope=()=>{
    const value=form.elements.scope.value;
    if(value==='count')return null;
    if(value!=='custom')return context.scopes[Number(value)];
    return {id:'personal',label:'本人版本',edition:'本人填写',origin:'personal',unit:context.unit,total:Number(form.elements.total.value)};
  };
  const preview=()=>{
    const scope=chosenScope(),total=scope?.total||null,completed=Number(form.elements.completed.value);
    form.elements.completed.max=total||1000000;
    form.querySelector('.library-scope-caption').textContent=form.elements.scope.selectedOptions[0].textContent;
    form.querySelector('output').textContent=Number.isSafeInteger(completed)&&completed>=0?completed+(total===null?'':'/'+total)+context.unit+(total&&completed<=total?' · '+(completed===total?100:Math.min(99,Math.round(completed/total*100)))+'%':''):'';
  };
  form=h('form',{class:'practice-form library-quantity-form',oninput:()=>{form.dataset.dirty='true';preview();},onsubmit:e=>{
    e.preventDefault();const error=form.querySelector('.form-error');
    try{
      if(base!==JSON.stringify(S.records[context.key]||null))throw new Error('此进度已在其他页面更新，输入已保留，请重新打开核对。');
      const updated=P.libraryQuantityUpdate(S.records[context.key],chosenScope(),Number(form.elements.completed.value),context.unit);
      if(!savePracticeRecords({[context.key]:updated}))return;
      form.dataset.dirty='false';render();renderModal();toast('完成数量已保存');
    }catch(reason){error.textContent=reason.message;}
  }},h('h2',{},resource.title),h('label',{class:'form-row'},'记录版本与范围',h('select',{name:'scope','aria-label':'记录版本与范围',onchange:()=>{
    const custom=form.elements.scope.value==='custom';form.querySelector('.library-total-row').hidden=!custom;form.elements.total.required=custom;
    const scope=chosenScope();form.elements.completed.value=P.libraryQuantity(S.records[context.key],[],context.unit,scope).completed;preview();form.dataset.dirty='true';
  }},h('option',{value:'count',selected:initial==='count'},'仅记数量（总数未核实）'),context.scopes.map((scope,index)=>h('option',{value:String(index),selected:initial===String(index)},[scope.edition,scope.label,scope.total+context.unit].filter(Boolean).join(' · '))),h('option',{value:'custom',selected:initial==='custom'},'本人版本 · 填写总数'))),
    h('label',{class:'form-row library-total-row',hidden:initial!=='custom'},'本人版本总数量',h('input',{name:'total',type:'number',min:1,max:10000,step:1,inputmode:'numeric',value:initial==='custom'?current.total:'',required:initial==='custom','aria-label':'本人版本总数量'})),
    h('label',{class:'form-row'},'已完成数量（'+context.unit+'）',h('input',{name:'completed',type:'number',min:0,max:context.total??1000000,step:1,inputmode:'numeric',value:context.completed,required:true,'aria-label':resource.title+'的已完成数量'})),
    h('p',{class:'small-note library-scope-caption'}),h('output',{class:'library-quantity-preview','aria-live':'polite'}),h('p',{class:'small-note'},'有总数时自动计算百分比；未知总数只记录数量。各版本分别保存，切换后回填。本人填写的总数只用于自己的记录。'),
    h('p',{class:'form-error',role:'alert'}),h('div',{class:'form-actions'},h('button',{type:'submit',class:'button primary'},'保存进度')));
  preview();return form;
}
function resourceProgressDetail(id){
  const resource=byId.get(id)||LC.resources(S.records).find(resource=>resource.id===id);
  if(!resource)return h('p',{},'未找到这份素材。');
  const progress=resourceProgress(resource);
  if(!progress.automatic)return libraryQuantityForm(resource);
  return h('div',{class:'resource-progress-detail'},h('h2',{},resource.title),
    h('div',{class:'resource-progress-heading'},h('p',{},h('strong',{},P.STATUS[progress.status]),' · 已完成 '+progress.done+'/'+progress.total+' 项路线范围'),
      libraryPopover('resource-progress-rules','进度汇总规则',icon('info'),h('div',{},h('p',{},'由当前年龄方案下许密杉、庆爸各阶段的真实记录自动汇总，不在图鉴手动修改。'),h('p',{},'任一范围有数量或计时即为进行中；全部列出范围完成才显示已完成，不表示必须读完整套，也不作为晋级条件。'),h('p',{},'各路线分别记录，同一本不跨路线累加；父项与子项取较大值。版本选择和备注不表示开始。')))),
    h('p',{class:'small-note'},'点击阶段名称前往记录，各阶段进展自动同步至此。'),resourceProgressRows(resource));
}
function refreshResourceProgressModal(){
  if(S.modal?.kind!=='resource-progress'||overlay.querySelector('.practice-form[data-dirty="true"]'))return;
  const active=overlay.contains(document.activeElement)?document.activeElement:null;
  const scroll=overlay.querySelector('.detail')?.scrollTop||0;
  const focus=active?{id:active.id,name:active.getAttribute('name'),action:active.dataset.action,stage:active.dataset.stage}:null;
  renderModal();overlay.querySelector('.detail')?.scrollTo(0,scroll);
  if(focus){const target=[...overlay.querySelectorAll('button,input,select')].find(node=>focus.id?node.id===focus.id:focus.name?node.getAttribute('name')===focus.name:focus.action&&node.dataset.action===focus.action&&node.dataset.stage===focus.stage);target?.focus({preventScroll:true});}
}
function practicePlan(routeId){return EnglishModel.getRoutePlan(C,routeId,routeId==='xu'?S.practiceDomain:'listening',S.profile);}
function practiceBaseUnits(st){return stageMaterials(st).map(item=>{
  const unit={item,key:P.unitKey(st,item),label:item.resource.title+(item.levelSegments.map(x=>x.text).join('')?' · '+item.levelSegments.map(x=>x.text).join(''):''),resourceId:item.resource.id,stageId:st.id};
  unit.bookScopes=P.bookScopes(unit.resourceId,item.materials.map(m=>EnglishModel.formatLevel(m.level,item.resource)),window.ROADMAP_RAW.resourceVolumes,st.id);
  unit.bookEligible=['book','reader'].includes(item.resource.type);
  return unit;
});}
function practiceUnits(st){return practiceBaseUnits(st).flatMap(unit=>{
  if(!unit.bookScopes.length)unit.bookScopes=P.bookScopes(unit.resourceId,[unit.item.levelSegments.map(x=>x.text).join('')],window.ROADMAP_RAW.resourceVolumes,st.id);
  return P.expandBookUnits(unit,EnglishModel.getMaterialLevels(unit.item),window.ROADMAP_RAW.resourceVolumes,S.records[unit.key]).map(u=>u.partScope?{...u,label:u.partTitle+' · '+EnglishModel.formatLevel(u.partScope.label,u.item.resource)}:u);
});}
function practiceGroups(st,units=practiceUnits(st)){return practiceBaseUnits(st).map(parent=>{
  const children=units.filter(u=>u.parentKey===parent.key);
  return children.length?{...parent,children}:units.find(u=>u.key===parent.key);
}).filter(Boolean);}
function practiceFindUnit(st,key){return practiceUnits(st).find(u=>u.key===key)||practiceGroups(st).find(u=>u.key===key);}
function practiceChildQuantities(unit){return unit.children.map(child=>{const scope=practiceBookScope(child);return {key:child.key,scopeIdentity:scope?JSON.stringify([scope.id,scope.label,scope.edition]):'',countOnlyCompatible:!!scope?.countOnlyCompatible,...P.quantityRecord(practiceRawRecord(child),scope,practiceQuantityUnit(child))};});}
function practiceQuantity(unit){return unit.children?P.groupQuantity(practiceRawRecord(unit),practiceChildQuantities(unit)):P.quantityRecord(practiceRawRecord(unit),practiceBookScope(unit),practiceQuantityUnit(unit));}
function practiceQuantityUnit(unit){return window.ROADMAP_RAW.resourceVolumes.series.find(s=>s.resourceId===unit.resourceId)?.unit||P.quantityUnit(unit.item.resource.type);}
function practiceRawRecord(unit){return P.materialRecord(S.records,unit);}
function isXuSongUnit(unit){return stages.get(unit.stageId)?.routeId==='xu'&&songResourceIds.has(unit.resourceId);}
function practiceUnitRecord(unit){
  const record=P.unitRecord({[unit.key]:practiceRawRecord(unit)},unit.key);
  const progress=isXuSongUnit(unit)?{...record,...P.songPlaylistProgress(S.records,SSS)}:{...record,...practiceQuantity(unit)};
  if(stages.get(unit.stageId)?.routeId==='qing'&&progress.status==='not-started'){
    const time=P.materialTime(S.records,unit.key,unit.children?.map(child=>child.key),practiceSessions());
    if(time.minutes>0||time.effectiveMinutes>0)return {...progress,status:'using'};
  }
  return progress;
}
function practiceBookScope(unit){
  if(unit.partScope)return unit.partScope;
  const books=P.unitBooks(practiceRawRecord(unit));
  if(books?.mode==='count'&&books.total!==null)return {...unit.bookScopes.find(s=>s.id===books.scopeId&&s.total===books.total&&s.label===books.label&&s.edition===books.edition),id:books.scopeId,label:books.label,total:books.total,edition:books.edition,origin:books.origin,unit:books.unit||practiceQuantityUnit(unit)};
  if(books?.mode==='count'&&books.total===null)return unit.bookScopes.find(s=>s.default&&s.countOnlyCompatible)||null;
  return unit.bookScopes.find(s=>s.default)||null;
}
function practiceBookLabel(unit){
  if(unit.children)return unit.label;
  if(unit.parentKey)return unit.label;
  const scope=practiceBookScope(unit),hasLevel=unit.item.levelSegments.some(x=>x.text);
  const chosen=scope&&unit.bookScopes.find(s=>s.id===scope.id&&s.total===scope.total&&s.edition===scope.edition);
  return scope&&!hasLevel&&!chosen?.default?(chosen?.title||unit.label)+' · '+scope.label+'（自选）':unit.label;
}
function practiceMaterialLabel(unit){
  const item=unit.item,label=practiceBookLabel(unit),title=unit.partTitle||item.resource.title;
  const peers=item.resource.appearances.filter(peer=>peer.routeId!==stages.get(unit.stageId)?.routeId);
  let parts=materialLevelParts(item);
  if(unit.partLevel)parts=EnglishModel.levelSegments(unit.partLevel.label,peers,item.resource);
  else if(unit.partScope){
    // 出版分装与替代版不构成路线级别交集；仅原文已给级别时核对同标尺。
    parts=item.materials.some(material=>material.level)&&title===item.resource.title?EnglishModel.levelSegments(unit.partScope.label,peers,item.resource):[{text:levelText(unit.partScope.label,item.resource),shared:false}];
  }else if(label!==unit.label)parts=[{text:label.slice(title.length).replace(/^ · /,''),shared:false}];
  return materialUI.title({name:title,shared:item.shared,levels:parts,selection:item.role.selection});
}
function practiceBookButton(unit,caption=''){
  if(isXuSongUnit(unit))return null;
  return btn([icon('info'),caption], 'practice-book-scope',{id:'book-scope-'+unit.key,'data-unit':unit.key,'data-stage':unit.stageId,'aria-label':unit.label+'的数量、计时规则与核对来源',title:unit.children?'查看汇总规则与原记录':unit.parentKey?'核对分项依据与版本':'核对数量或修改选用范围'},'practice-book-scope');
}
function practiceStage(routeId,plan){
  const nodes=plan?.stages||[],key=routeId+':'+(routeId==='xu'?S.practiceDomain:'listening');
  if(!nodes.some(s=>s.id===S.practiceStages[key])){
    const recent=routeId==='qing'?P.sessions(S.records)[0]?.stageId:null;
    S.practiceStages[key]=nodes.find(s=>s.id===recent)?.id||nodes.find(s=>practiceUnits(s).some(u=>practiceUnitRecord(u).status==='using'))?.id||nodes[0]?.id;
  }
  return nodes.find(s=>s.id===S.practiceStages[key]);
}
function practiceMeter(value,max,label){return h('div',{class:'practice-meter'},h('progress',{max:max||1,value:Math.min(value,max||1),'aria-label':label}),h('span',{},label));}
function practiceUnitPercent(unit){
  const record=practiceUnitRecord(unit);
  if(isXuSongUnit(unit))return btn([h('span',{class:'practice-song-count'},record.done+'/'+record.total+'首'),h('div',{class:'practice-count-meter'},h('progress',{max:100,value:record.percent,'aria-hidden':'true'}),h('span',{},record.percent+'%'))],'sss-songs',{'data-id':unit.resourceId,'data-stage':unit.stageId,'data-category':'essential',id:'song-progress-'+unit.key,'aria-label':'必备歌单已完成'+record.done+'/'+record.total+'首，'+record.percent+'%，点击勾选歌曲',title:'按必备歌单完成首数自动计算'},'practice-unit-progress practice-song-progress');
  const quantity=practiceQuantity(unit),hasTotal=quantity.total!==null,scope=unit.children?null:practiceBookScope(unit);
  const maximum=quantity.total??1000000;
  return h('div',{class:'practice-unit-progress practice-count-progress'},h('label',{class:'practice-percent-editor'},h('input',{id:'count-'+unit.key,type:'number',inputmode:'numeric',min:0,max:maximum,step:1,value:quantity.completed,'aria-label':unit.label+'的已完成数量（'+(hasTotal?'共'+quantity.total:'单位：')+quantity.unit+'）',title:unit.children?'汇总取父项记录与子项合计中的较大值；子项已记'+quantity.childCompleted+quantity.unit:'填写完成数量',oninput:e=>e.currentTarget.setCustomValidity(''),onkeydown:e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}},onchange:e=>{
    const input=e.currentTarget;
    if(!input.checkValidity()){input.setCustomValidity('请输入0–'+maximum+'之间的整数数量。');input.reportValidity();return;}
    const updated=unit.children?P.groupQuantityUpdate(Number(input.value),practiceChildQuantities(unit),practiceRawRecord(unit)):P.unitQuantityProgressUpdate(Number(input.value),scope,practiceRawRecord(unit),quantity.unit);
    if(savePracticeRecords({[unit.key]:updated}))render();else input.value=quantity.completed;
  }}),h('span',{},'/ '+(hasTotal?quantity.total:'—')+' '+quantity.unit)),hasTotal?h('div',{class:'practice-count-meter'},h('progress',{max:100,value:quantity.percent,'aria-label':unit.label+'的进度：'+quantity.percent+'%'}),h('span',{},quantity.percent+'%')):h('div',{class:'practice-count-meter practice-count-unknown'},practiceBookButton(unit,unit.bookScopes.length?'选版本':'总量未核')));

}
function practiceUnitDate(unit,record){
  if(!record.date)return null;
  return h('input',{class:'practice-unit-date',id:'unit-date-'+unit.key,type:'date',value:record.date,min:'0001-01-01',max:'9999-12-31','aria-label':unit.label+'的记录日期',title:'修改记录日期',oninput:e=>e.currentTarget.setCustomValidity(''),onchange:e=>{
    const input=e.currentTarget;
    if(!P.validDate(input.value)){input.setCustomValidity('请选择有效的记录日期。');input.reportValidity();return;}
    if(savePracticeRecords({[unit.key]:P.unitDateUpdate(input.value,practiceRawRecord(unit))}))render();else input.value=record.date;
  }});
}
function practiceCompletion(units){const known=units.map(practiceUnitRecord).filter(r=>r.percent!==null);return known.length?Math.round(known.reduce((total,r)=>total+r.percent,0)/known.length):null;}
function practiceEditionControls(units){
  const groups=new Map();
  for(const unit of units)if(unit.editionOptions?.length&&!groups.has(unit.parentKey))groups.set(unit.parentKey,unit);
  return [...groups.values()].map(unit=>{
    return h('div',{class:'practice-edition-choice'},h('div',{class:'practice-edition-switch',role:'group','aria-label':unit.item.resource.title+'的选读版本'},h('span',{},'选读版本'),unit.editionOptions.map(option=>h('button',{
      type:'button',id:'practice-edition-'+unit.parentKey+'-'+option.id,'aria-pressed':String(unit.editionId===option.id),title:option.label+'；切换后显示该版本各辑与本数',
      onclick:()=>{if(unit.editionId!==option.id&&savePracticeRecords({[unit.parentKey]:P.unitEditionUpdate(option.id,S.records[unit.parentKey])}))render();}
    },option.shortLabel||option.label))));
  });
}
function practiceMaterialSearch(st){
  const trigger=btn(icon('search'),'practice-search-toggle',{id:'practice-search-toggle',popovertarget:'practice-search-popover','aria-label':'搜索本阶段素材',title:'搜索本阶段素材','aria-expanded':'false'},'icon-button practice-search-toggle');
  const update=()=>{
    document.querySelector('.practice-material-results')?.replaceWith(practiceMaterialResults(st,practiceUnits(st)));
    trigger.classList.toggle('active',!!S.practiceSearch.trim());
    trigger.title=S.practiceSearch.trim()?'正在搜索：'+S.practiceSearch:'搜索本阶段素材';
  };
  const input=h('input',{id:'practice-search',type:'search',value:S.practiceSearch,placeholder:'素材名、别名或级别','aria-label':'搜索本阶段素材',oninput:e=>{if(e.isComposing)return;S.practiceSearch=e.target.value;update();},oncompositionend:e=>{S.practiceSearch=e.target.value;update();}});
  const popover=h('div',{id:'practice-search-popover',class:'practice-search-popover',popover:'auto',role:'search','aria-label':'搜索本阶段素材',onkeydown:e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();popover.hidePopover();trigger.focus({preventScroll:true});}
    if(e.key==='Enter'){e.preventDefault();popover.hidePopover();trigger.focus({preventScroll:true});}
  },ontoggle:e=>{
    const open=e.newState==='open';trigger.setAttribute('aria-expanded',String(open));
    if(open){const rect=trigger.getBoundingClientRect(),width=popover.getBoundingClientRect().width;popover.style.left=Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8))+'px';popover.style.top=Math.max(8,Math.min(rect.bottom+6,window.innerHeight-popover.getBoundingClientRect().height-8))+'px';input.focus({preventScroll:true});}
  }},input,h('button',{type:'button',class:'text-link',onclick:()=>{S.practiceSearch='';input.value='';update();input.focus();}},'清空'),h('button',{type:'button',class:'icon-button','aria-label':'关闭素材搜索',popovertarget:'practice-search-popover',popovertargetaction:'hide'},icon('close')),h('small',{class:'practice-search-hint'},'支持简称、别名和多个关键词，实时筛选'));
  trigger.classList.toggle('active',!!S.practiceSearch.trim());
  return h('div',{class:'practice-search-control'},trigger,popover);
}
function practiceRoleLabel(unit){return unit.item.role.label;}
function practiceRoleLegend(units){
  const uses=units.filter((u,i)=>units.findIndex(other=>other.item.role.kind===u.item.role.kind&&practiceRoleLabel(other)===practiceRoleLabel(u))===i);
  return h('div',{},materialLegend(),h('div',{class:'material-legend'},h('span',{},'本阶段用途'),uses.map(u=>materialUI.roleTag(u.item.role))),
    uses.some(u=>u.item.role.kind==='reference')?h('p',{},'灰色表示本次引用尚未核定主辅，不代表作者整条路线没有划分；原图的主节点、配套分支、闪卡或动画分类保留在各素材来源中，不据此增加主线、辅线或选读要求。'):null,
    units.some(u=>u.item.role.selection)?h('div',{},h('h3',{},'本阶段原文选材要求'),h('ul',{},[...new Set(units.filter(u=>u.item.role.selection).map(u=>u.item.role.selection.basis))].map(text=>h('li',{},text)))):null,
    h('p',{},'标题、用途标签与单项进度条使用同一用途色；上方阶段总进度使用路线主题色，不代表主辅线。'));
}
function practiceMaterialList(st){
  const units=practiceUnits(st),counts=Object.fromEntries(Object.keys(P.STATUS).map(s=>[s,units.filter(u=>practiceUnitRecord(u).status===s).length]));
  const percent=practiceCompletion(units);
  const summary=(percent===null?'仅记数量':'分项已知总量平均 '+percent+'%')+' · 完成 '+counts.done+'/'+units.length;
  return h('section',{class:'practice-materials','aria-label':'阶段素材进度'},
    h('div',{class:'practice-material-toolbar'},percent!==null?practiceMeter(percent,100,summary):h('span',{class:'small-note'},units.length?summary:'原文方法'),
      practiceMaterialSearch(st),libraryPopover('practice-legend','素材图例与记录说明',icon('info'),h('div',{},practiceRoleLegend(units),h('p',{},'有总量时按完成数量计算进度；未知总量只记数量。阶段摘要只计算分项，不重复计入父项。'),st.routeId==='qing'?h('p',{},'父项数量、实际时间和有效时间，分别取父项单独记录与子项合计中的较大值。投入统计去重，原始时间记录保留；排行中的父项差额只计超出子项合计的部分。跨日期的重叠从父项较早记录扣除，日期筛选与趋势图沿用该分配。'):null))),
    practiceEditionControls(units),
    practiceMaterialResults(st,units),
    h('p',{class:'small-note'},'按本阶段的选材与进阶条件执行；数量仅记录阅读进展，不代表路线达标。图鉴自动汇总，不改写其他路线的记录。'));
}
const practiceMaterialFolds=new Map(),practiceTimeDrafts=new Map();
function practiceTimeOptions(st,u){
  const type=u.item.resource.type,original=u.item.materials.map(m=>m.original||'').join(' ');
  const app=/融合App|融合app/.test(u.item.material.role);
  const hasAnimation=/WPlay|古力小超人/.test(u.item.resource.title);
  return P.timeOptions(st.id,app?'app':type,window.ROADMAP_RAW.qing.timeAccounting,hasAnimation||/动画儿歌/.test(original));
}
function practiceInlineTime(st,u,time){
  const options=practiceTimeOptions(st,u),draft=practiceTimeDrafts.get(u.key)||{mode:options[0].id,minutes:'0'};
  const selected=options.find(option=>option.id===draft.mode)||options[0];
  let form;
  const update=()=>{
    const mode=options.find(option=>option.id===form.elements.mode.value),minutes=Number(form.elements.minutes.value);
    practiceTimeDrafts.set(u.key,{mode:mode.id,minutes:form.elements.minutes.value});
    form.querySelector('button[type=submit]').disabled=!(minutes>0);
    form.querySelector('output').textContent=minutes>0?'本次有效 '+Number((minutes*(mode.qualified?mode.factor:0)).toFixed(1))+'分':'';
    form.elements.mode.title=P.KINDS[mode.kind]+(mode.qualified?' × '+mode.factor:'，本次不计入有效时间')+'；按当前记录阶段，详见标题旁ⓘ';
  };
  form=h('form',{class:'practice-time-inline','aria-label':u.label+'的行内计时',oninput:()=>{form.elements.minutes.setCustomValidity('');update();},onchange:update,onsubmit:e=>{
    e.preventDefault();
    const input=form.elements.minutes;
    try{
      const mode=options.find(option=>option.id===form.elements.mode.value),value=P.inlineSessionRecord({stageId:st.id,unitKey:u.key,unitLabel:u.label,mode:mode.id,minutes:Number(input.value),createdAt:new Date().toISOString()},options);
      const key=P.SESSION+'qing:'+crypto.randomUUID();
      if(!savePracticeRecords({[key]:value}))return;
      practiceTimeDrafts.set(u.key,{mode:mode.id,minutes:'0'});render();document.getElementById('time-'+u.key)?.focus({preventScroll:true});
      toast('已记实际 '+Number(input.value)+'分，有效 '+Number((Number(input.value)*(mode.qualified?mode.factor:0)).toFixed(1))+'分');
      const baseline=JSON.stringify(S.records[key]);document.getElementById('toast').append(h('button',{type:'button',class:'text-link',onclick:()=>{
        if(JSON.stringify(S.records[key])!==baseline){toast('该记录已更新，请在时间明细核对后修改。');return;}
        if(savePracticeRecords({[key]:{...S.records[key],status:'not-started'}})){render();toast('已撤销本次计时');}
      }},'撤销'));
    }catch(error){input.setCustomValidity(error.message);input.reportValidity();}
  }},
    h('div',{class:'practice-time-entry'},h('select',{id:'time-mode-'+u.key,name:'mode','aria-label':u.label+'本次计时方式'},options.map(option=>h('option',{value:option.id,selected:option.id===selected.id},option.label))),
      h('label',{class:'practice-time-minutes'},h('input',{id:'time-'+u.key,name:'minutes',type:'number',inputmode:'numeric',min:0,max:1440,step:1,value:draft.minutes,'aria-label':u.label+'本次实际分钟',title:'填本次实际分钟，回车或点勾保存；保存后归零，不是改累计时间'}),h('span',{},'分')),
      h('button',{type:'submit','aria-label':'保存'+u.label+'本次时间',title:'保存本次时间'},icon('check'))),
    h('div',{class:'practice-time-hint'},h('span',{title:'累计实际 '+Number(time.minutes.toFixed(1))+'分；累计有效 '+Number(time.effectiveMinutes.toFixed(1))+'分'+(u.children?'；父子分别取max':'')},'累计有效 '+Number(time.effectiveMinutes.toFixed(1))+'分'),h('output',{'aria-live':'polite'})));
  update();return form;
}
function practiceMaterialRow(st,u,toggle=null,entries){
  const record=practiceUnitRecord(u),time=st.routeId==='qing'?P.materialTime(S.records,u.key,u.children?.map(c=>c.key),entries):null;
  return h('article',{class:'practice-material-row practice-percent-row practice-books-row material-role-'+u.item.role.kind,'data-unit-key':u.key},
    h('div',{class:'practice-label-shell'},h('div',{class:'practice-material-label practice-inline-label'},btn(practiceMaterialLabel(u),isXuSongUnit(u)?'sss-songs':'resource',{id:'material-'+u.key,'data-id':u.resourceId,title:u.item.role.label+'；'+u.item.role.basis,...(isXuSongUnit(u)?{'data-stage':u.stageId,'data-category':'essential',id:'song-material-'+u.key}:{})},'practice-material-name'),h('div',{class:'practice-material-meta'},materialUI.roleTag(u.item.role,'practice-material-role'),record.total!==null?practiceBookButton(u):null,toggle))),
    practiceUnitPercent(u),time?practiceInlineTime(st,u,time):null,
    record.text?h('details',{class:'practice-material-note practice-legacy-note'},h('summary',{},'既有备注'),h('p',{},record.text)):null);
}
function practiceMaterialResults(st,units){
  const matches=u=>P.matchesMaterialSearch([u.label,practiceBookLabel(u)],S.practiceSearch,u.item.resource.aliases||[]);
  const ranks={using:0,'not-started':1,done:2},byStatus=(a,b)=>ranks[practiceUnitRecord(a).status]-ranks[practiceUnitRecord(b).status];
  const visible=units.filter(matches),groups=st.routeId==='qing'?practiceGroups(st,units):units,entries=st.routeId==='qing'?P.sessions(S.records):undefined;
  const rows=groups.slice().sort(byStatus).flatMap(u=>{
    if(!u.children)return matches(u)?[practiceMaterialRow(st,u,null,entries)]:[];
    const children=u.children.filter(matches),parentMatch=matches(u);
    if(!parentMatch&&!children.length)return [];
    const filtering=!!S.practiceSearch.trim(),shown=(filtering?children:u.children).slice().sort(byStatus);
    const open=practiceMaterialFolds.get((filtering?'filter:':'')+u.key)??!!filtering,id='practice-children-'+u.key;
    const content=h('div',{class:'practice-material-children',id,hidden:!open},shown.map(child=>practiceMaterialRow(st,child,null,entries)));
    const toggle=h('button',{id:'practice-group-'+u.key,type:'button',class:'practice-group-toggle','aria-expanded':String(open),'aria-controls':id,'aria-label':(open?'收起':'展开')+u.item.resource.title+'的'+u.children.length+'个分项',title:'分别记录各级数量与时间',onclick:e=>{
      const expanded=e.currentTarget.getAttribute('aria-expanded')!=='true';practiceMaterialFolds.set((filtering?'filter:':'')+u.key,expanded);content.hidden=!expanded;e.currentTarget.textContent=expanded?'−':'＋';e.currentTarget.setAttribute('aria-expanded',String(expanded));e.currentTarget.setAttribute('aria-label',(expanded?'收起':'展开')+u.item.resource.title+'的'+u.children.length+'个分项');
    }},open?'−':'＋');
    return [h('div',{class:'practice-material-group'},practiceMaterialRow(st,u,toggle,entries),content)];
  });
  return h('div',{class:'practice-material-results'},S.practiceSearch.trim()?h('p',{class:'practice-search-results',role:'status'},'“'+S.practiceSearch.trim()+'” · '+visible.length+' 个分项'):null,
    rows.length?h('div',{class:'practice-material-list'},rows):h('p',{class:'empty'},units.length?'没有符合筛选的素材。':'原图未单列素材，可从阶段详解查看原文方法与执行安排。'));
}
const PRACTICE_COLORS=['#ef6b4a','#e9a21c','#49a998','#639dd6','#aa83bd','#de8aa2','#82a94e','#b78a62','#648a8e','#bf6c78','#8c83d2','#ccab4d'];
function practiceStatState(){return S.practiceStats??={scope:'stage',period:'all',metric:'effective',anchor:P.today(),from:P.today().slice(0,7)+'-01',to:P.today(),view:'trend',grain:'day',trendAnchor:P.today(),month:P.today().slice(0,7),group:'',focusFrom:'',focusTo:'',rankLimit:6};}
function practiceStatsChange(values,clear=false){if(values.group||values.focusFrom)readingFolds.set('practice-stat-history',true);Object.assign(practiceStatState(),values);if(clear)Object.assign(S.practiceStats,{group:'',focusFrom:'',focusTo:''});S.practiceLogLimit=12;render();}
function practiceStatData(st){const state=practiceStatState();return P.statistics(S.records,{stageId:state.scope==='stage'?st.id:null,period:state.period,anchor:state.anchor,from:state.from,to:state.to,metric:state.metric});}
function practiceColors(){return new Map([...new Set(P.sessions(S.records).map(P.groupKey))].sort().map((key,i)=>[key,PRACTICE_COLORS[i%PRACTICE_COLORS.length]]));}
function practiceSegments(items,field,value,onchange,label){return h('div',{class:'practice-segments','aria-label':label},items.map(([id,text])=>h('button',{type:'button',id:'practice-'+field+'-'+id,'aria-pressed':String(value===id),onclick:()=>onchange(id)},text)));}
function practiceRangeControls(){
  const s=practiceStatState(),range=P.periodRange(s.period,s.anchor,s.from,s.to);
  const controls=h('div',{class:'practice-date-range'});
  if(s.period==='custom'){
    const setDate=(name,e)=>{const value=e.target.value;if(!P.validDate(value))return;const next={from:s.from,to:s.to,[name]:value};if(next.from>next.to)next[name==='from'?'to':'from']=value;practiceStatsChange({...next,trendAnchor:next.to,month:next.to.slice(0,7)},true);};
    controls.append(h('label',{},'从',h('input',{id:'practice-date-from',type:'date',value:s.from,max:P.today(),onchange:e=>setDate('from',e)})),h('label',{},'至',h('input',{id:'practice-date-to',type:'date',value:s.to,max:P.today(),onchange:e=>setDate('to',e)})));
  }else if(s.period!=='all'){
    const move=delta=>{const anchor=P.shiftDate(s.anchor,s.period==='week'?delta*7:0,s.period==='month'?delta:0,s.period==='year'?delta:0),end=P.periodRange(s.period,anchor).to;practiceStatsChange({anchor,trendAnchor:[end,P.today()].sort()[0],month:anchor.slice(0,7)},true);};
    controls.append(h('button',{type:'button',id:'practice-period-prev',class:'icon-button','aria-label':'上一个统计周期',onclick:()=>move(-1)},'‹'),h('span',{},s.period==='year'?s.anchor.slice(0,4)+'年':s.period==='month'?s.anchor.slice(0,7):range.from+' — '+range.to),h('button',{type:'button',id:'practice-period-next',class:'icon-button','aria-label':'下一个统计周期',disabled:range.to>=P.today(),onclick:()=>move(1)},'›'));
  }
  return controls;
}
function practiceDonut(data,colors){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 220 220');svg.setAttribute('class','practice-donut');svg.setAttribute('role','group');svg.setAttribute('aria-label','素材投入占比，点击扇区筛选记录');
  const make=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,value);return n;};
  svg.append(make('circle',{cx:110,cy:110,r:84,fill:'none',stroke:'var(--line)','stroke-width':30}));
  let offset=0;const total=2*Math.PI*84,s=practiceStatState();
  for(const g of data.groups.filter(g=>g.minutes>0)){
    const length=g.share*total,circle=make('circle',{id:'practice-sector-'+encodeURIComponent(g.id),cx:110,cy:110,r:84,fill:'none',stroke:colors.get(g.id),'stroke-width':s.group===g.id?36:30,'stroke-dasharray':Math.max(0.05,length-Math.min(2,length*.05))+' '+total,'stroke-dashoffset':-offset,transform:'rotate(-90 110 110)',role:'button',tabindex:0,'aria-pressed':String(s.group===g.id),'aria-label':g.label+'，'+P.hours(g.minutes)+'小时，'+(g.share*100).toFixed(1)+'%','data-action':'practice-stat-group','data-group':g.id});
    circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();circle.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});svg.append(circle);offset+=length;
  }
  return h('div',{class:'practice-ring'},svg,h('div',{class:'practice-ring-center'},h('span',{},s.metric==='actual'?'实际投入':'有效投入'),h('strong',{},P.hours(data.minutes)),h('small',{},'小时')));
}
function practiceRanking(data,colors){
  const s=practiceStatState();return h('div',{class:'practice-ranking'},h('div',{class:'practice-section-head'},h('h3',{},'素材投入'),h('span',{class:'small-note'},data.groups.length+' 项 · '+(s.focusFrom?'所选时段':'当前统计范围'))),
    data.groups.length?h('div',{class:'practice-rank-grid'},data.groups.slice(0,s.rankLimit).map((g,i)=>h('button',{type:'button',id:'practice-rank-'+i,class:'practice-rank-row','aria-pressed':String(s.group===g.id),'data-action':'practice-stat-group','data-group':g.id,style:{'--material-color':colors.get(g.id)}},h('span',{class:'practice-rank-dot','aria-hidden':true}),h('span',{class:'practice-rank-content'},h('span',{class:'practice-rank-name'},g.label,data.groups.some(other=>other.id!==g.id&&other.label===g.label)?h('small',{class:'practice-rank-stage'},stages.get(g.stageId)?.title):null),h('span',{class:'practice-rank-values'},h('b',{},P.hours(g.minutes)+'h'),h('small',{},(g.share*100).toFixed(1)+'%')),h('span',{class:'practice-rank-track'},h('span',{style:{width:(g.share*100)+'%'}})))))):h('p',{class:'small-note'},'记录后，在这里查看各素材的投入占比。'),
    data.groups.length>s.rankLimit?h('button',{type:'button',id:'practice-rank-more',class:'text-link',onclick:()=>practiceStatsChange({rankLimit:s.rankLimit+12})},'查看其余 '+(data.groups.length-s.rankLimit)+' 项'):null);
}
function practiceTrend(data,colors){
  const s=practiceStatState(),buckets=P.trendBuckets(data.entries,{grain:s.grain,anchor:s.trendAnchor,metric:s.metric,count:s.grain==='month'?6:s.grain==='week'?6:undefined}),max=Math.max(60,Math.ceil(Math.max(0,...buckets.map(b=>b.minutes))/60)*60);
  const step={day:7,week:42,month:6,year:5}[s.grain],move=delta=>practiceStatsChange({trendAnchor:P.shiftDate(s.trendAnchor,['day','week'].includes(s.grain)?step*delta:0,s.grain==='month'?step*delta:0,s.grain==='year'?step*delta:0),focusFrom:'',focusTo:''});
  const title=buckets[0].from+' — '+buckets.at(-1).to;
  return h('div',{class:'practice-trend'},practiceSegments([['day','每日'],['week','每周'],['month','每月'],['year','每年']],'grain',s.grain,id=>practiceStatsChange({grain:id,focusFrom:'',focusTo:''}),'投入趋势粒度'),
    h('div',{class:'practice-chart-navigation'},h('button',{type:'button',id:'practice-trend-prev',class:'icon-button','aria-label':'查看更早的投入趋势',disabled:!!data.range.from&&buckets[0].from<=data.range.from,onclick:()=>move(-1)},'‹'),h('span',{},title),h('button',{type:'button',id:'practice-trend-next',class:'icon-button','aria-label':'查看更晚的投入趋势',disabled:buckets.at(-1).to>=[data.range.to||P.today(),P.today()].sort()[0],onclick:()=>move(1)},'›'),h('button',{type:'button',id:'practice-trend-today',class:'text-link',onclick:()=>practiceStatsChange({trendAnchor:P.today()})},'今天')),
    h('div',{class:'practice-trend-plot'},h('div',{class:'practice-trend-axis','aria-hidden':true},[1,.5,0].map(r=>h('span',{},P.hours(max*r)+'h'))),h('div',{class:'practice-trend-bars',style:{'--bucket-count':buckets.length}},buckets.map((b,i)=>{
      const label=s.grain==='year'?b.from.slice(0,4):s.grain==='month'?b.from.slice(5,7)+'月':b.from.slice(5).replace('-','/');
      return h('button',{type:'button',id:'practice-bucket-'+i,class:'practice-trend-bucket','aria-pressed':String(s.focusFrom===b.from&&s.focusTo===b.to),'aria-label':b.from+(b.to!==b.from?'至'+b.to:'')+'，'+P.hours(b.minutes)+'小时，查看明细',disabled:!!((data.range.from&&b.to<data.range.from)||(data.range.to&&b.from>data.range.to)),'data-action':'practice-stat-range','data-from':b.from,'data-to':b.to},h('span',{class:'practice-trend-value'},b.minutes?P.hours(b.minutes):'·'),h('span',{class:'practice-stack-slot'},h('span',{class:'practice-stack',style:{height:b.minutes/max*100+'%'}},b.groups.filter(g=>g.minutes>0).map(g=>h('span',{style:{height:g.share*100+'%',background:colors.get(g.id),opacity:s.group&&s.group!==g.id?.25:1},title:g.label+' '+P.hours(g.minutes)+'h'})))),h('span',{class:'practice-bucket-label'},label));
    }))),h('p',{class:'small-note'},'本图时段 '+P.hours(buckets.reduce((n,b)=>n+b.minutes,0))+'h · 点击柱形查看该时段素材与明细'));
}
function practiceCalendar(data){
  const s=practiceStatState(),days=P.calendarDays(s.month),weekday=(new Date(days[0]+'T12:00:00Z').getUTCDay()+6)%7,entries=data.entries.filter(e=>!s.group||P.groupKey(e)===s.group),totals=days.map(date=>({...P.aggregate(entries.filter(e=>e.date===date),s.metric),date})),max=Math.max(1,...totals.map(d=>d.minutes));
  return h('div',{class:'practice-calendar'},h('div',{class:'practice-chart-navigation'},h('button',{type:'button',id:'practice-month-prev',class:'icon-button','aria-label':'上一个月',disabled:!!data.range.from&&days[0]<=data.range.from,onclick:()=>practiceStatsChange({month:P.shiftDate(days[0],0,-1).slice(0,7),focusFrom:'',focusTo:''})},'‹'),h('strong',{},s.month),h('button',{type:'button',id:'practice-month-next',class:'icon-button','aria-label':'下一个月',disabled:s.month>=[data.range.to||P.today(),P.today()].sort()[0].slice(0,7),onclick:()=>practiceStatsChange({month:P.shiftDate(days[0],0,1).slice(0,7),focusFrom:'',focusTo:''})},'›'),h('span',{class:'small-note'},'本月 '+P.hours(totals.reduce((n,d)=>n+d.minutes,0))+'h')),
    h('div',{class:'practice-calendar-grid'},['一','二','三','四','五','六','日'].map(d=>h('span',{class:'practice-calendar-weekday'},d)),Array.from({length:weekday},()=>h('span',{'aria-hidden':true})),totals.map(d=>h('button',{type:'button',id:'practice-day-'+d.date,class:'practice-calendar-day','aria-label':d.date+'，'+(d.entries.length?Number(d.minutes.toFixed(1))+'分钟，'+d.entries.length+'条记录':'无记录')+'，查看或补记','aria-pressed':String(s.focusFrom===d.date&&s.focusTo===d.date),disabled:d.date>P.today()||!!((data.range.from&&d.date<data.range.from)||(data.range.to&&d.date>data.range.to)),style:{'--day-intensity':d.minutes?0.1+d.minutes/max*.65:0},'data-action':'practice-stat-range','data-from':d.date,'data-to':d.date},h('b',{},Number(d.date.slice(8))),h('small',{},d.entries.length?(d.minutes?(d.minutes>=600?Number((d.minutes/60).toFixed(1)).toLocaleString('zh-CN',{notation:'compact',maximumFractionDigits:1})+'h':Number(d.minutes.toFixed(1))+'m'):'0m'):'·')))),h('p',{class:'small-note'},'颜色越深投入越多 · m 分钟 / h 小时 · 点击日期查看或补记'));
}
function practiceTimeSummary(st){
  const s=practiceStatState(),data=practiceStatData(st),colors=practiceColors(),total=P.summarize(S.records),current=P.summarize(S.records,st.id);
  const panel=h('section',{class:'practice-review','aria-label':'庆爸投入复盘'},h('div',{class:'practice-review-head'},h('h2',{},'投入复盘'),
    h('select',{id:'practice-stat-scope','aria-label':'投入统计范围',onchange:e=>practiceStatsChange({scope:e.target.value},true)},[['all','全路线'],['stage','当前阶段']].map(([id,text])=>h('option',{value:id,selected:s.scope===id},text))),
    h('select',{id:'practice-stat-metric','aria-label':'时长统计口径',onchange:e=>practiceStatsChange({metric:e.target.value},true)},[['effective','有效时长'],['actual','实际时长']].map(([id,text])=>h('option',{value:id,selected:s.metric===id},text)))),
    h('div',{class:'practice-total-strip'},h('div',{},h('small',{},'全路线有效'),h('strong',{},P.hours(total.effectiveMinutes),h('small',{},' h'))),h('div',{},h('small',{},'当前阶段有效'),h('strong',{},P.hours(current.effectiveMinutes),h('small',{},' h'))),h('div',{},h('small',{},'全路线记录'),h('strong',{},new Set(total.entries.map(e=>e.date)).size,h('small',{},' 天')))),
    practiceSegments([['all','全部'],['year','年'],['month','月'],['week','周'],['custom','自定义']],'period',s.period,id=>practiceStatsChange({period:id,trendAnchor:[P.periodRange(id,s.anchor,s.from,s.to).to||P.today(),P.today()].sort()[0],month:(id==='custom'?s.to:s.anchor).slice(0,7)},true),'统计时间范围'),practiceRangeControls(),
    h('div',{class:'practice-review-context','aria-live':'polite'},h('span',{},(s.scope==='all'?'全路线':'当前阶段')+' · '+(s.period==='all'?'全部时间':data.range.from+' — '+data.range.to)),h('b',{},P.hours(data.minutes)+'h'),h('span',{},data.days+'个记录日 · '+data.entries.length+'条')),
    practiceSegments([['trend','投入趋势'],['allocation','素材占比'],['calendar','投入日历']],'chart',s.view,id=>practiceStatsChange({view:id}),'复盘视图'));
  const selected=data.groups.find(g=>g.id===s.group);
  if(s.group||s.focusFrom)panel.append(h('div',{class:'practice-focus-summary','aria-live':'polite'},h('span',{},[selected?.label,s.focusFrom?(s.focusFrom===s.focusTo?s.focusFrom:s.focusFrom+' — '+s.focusTo):''].filter(Boolean).join(' · ')),h('button',{type:'button',id:'practice-clear-focus',class:'text-link',onclick:()=>practiceStatsChange({group:'',focusFrom:'',focusTo:''})},'清除定位')));
  const timeData=s.focusFrom?P.aggregate(data.entries.filter(e=>e.date>=s.focusFrom&&e.date<=s.focusTo),s.metric):data;
  const visual=s.view==='allocation'?practiceDonut(timeData,colors):s.view==='calendar'?practiceCalendar(data):practiceTrend(data,colors);
  panel.append(h('div',{class:'practice-visual-layout'},visual,practiceRanking(timeData,colors)));
  if(s.metric==='actual'&&data.historyMinutes)panel.append(h('p',{class:'small-note'},'历史补录 '+P.hours(data.historyMinutes)+'h 仅有已折算量，不计入本页实际时长。'));
  if(!data.entries.length)panel.append(h('div',{class:'practice-review-empty'},h('p',{},'这个范围还没有记录。'),btn('记一次时间','practice-add',{'data-stage':st.id},'text-link')));
  panel.append(practiceSessionList(st,data));return panel;
}
function practiceSessionList(st,data=practiceStatData(st)){
  const s=practiceStatState(),entries=data.entries.filter(e=>(!s.group||P.groupKey(e)===s.group)&&(!s.focusFrom||e.date>=s.focusFrom)&&(!s.focusTo||e.date<=s.focusTo)),visible=entries.slice(0,S.practiceLogLimit),group=data.groups.find(g=>g.id===s.group);
  const detail=h('details',{class:'practice-review-details practice-history',open:readingFolds.get('practice-stat-history')??false,ontoggle:e=>readingFolds.set('practice-stat-history',e.currentTarget.open)},h('summary',{},'时间明细 · '+entries.length+' 条'),
    h('div',{class:'practice-detail-filters'},group?h('span',{},group.label):null,s.focusFrom?h('span',{},s.focusFrom+(s.focusFrom!==s.focusTo?' — '+s.focusTo:'')):null,(s.group||s.focusFrom)?h('button',{type:'button',class:'text-link',onclick:()=>practiceStatsChange({group:'',focusFrom:'',focusTo:''})},'清除定位'):null,
      s.focusFrom&&s.focusFrom===s.focusTo?btn('记这一天','practice-add',{'data-stage':group?.stageId||st.id,'data-unit':group?.unitKey||'','data-date':s.focusFrom},'text-link'):null),
    visible.length?visible.map(e=>h('article',{class:'practice-log-row'},h('div',{},h('strong',{},e.date+' · '+P.KINDS[e.kind]),h('p',{},e.unitLabel||'未指定素材'),h('small',{},stages.get(e.stageId)?.title||e.stageId),e.content?h('p',{class:'small-note'},e.content):null,h('small',{},(e.kind==='history'?'历史已折算 '+e.minutes+'分钟':'实际 '+e.minutes+'分钟 · 有效 '+Number(e.effectiveMinutes.toFixed(1))+'分钟')+(e.kind==='audio'?'（×'+e.factor+'）':'')),e.rollupParent?h('small',{},'父子取较大值，汇总计入：实际 '+Number(e.countedMinutes.toFixed(1))+' / 有效 '+Number(e.countedEffectiveMinutes.toFixed(1))+' 分钟'):null),btn(icon('settings'),'practice-edit',{'data-id':e.id,'aria-label':'编辑'+e.date+'的'+P.KINDS[e.kind]+'记录'},'icon-button'))):h('p',{class:'small-note'},'当前选择没有时间记录。'),visible.length<entries.length?btn('继续查看12条','practice-more',{},'button'):null);
  return detail;
}
function practiceOverview(routeId,plan){
  const routeKey=routeId+':'+(routeId==='xu'?S.practiceDomain:'listening');
  return readingFold('practice-overview-'+routeKey,'各阶段进度 · '+plan.stages.length+' 个阶段',h('div',{class:'practice-overview'},plan.stages.map(st=>{
    const units=practiceUnits(st),done=units.filter(u=>practiceUnitRecord(u).status==='done').length,using=units.filter(u=>practiceUnitRecord(u).status==='using').length;
    const percent=practiceCompletion(units);
    return btn([h('span',{class:'practice-overview-title'},h('strong',{},st.title),percent!==null?h('span',{class:'practice-overview-percent',title:'分项已知总量平均进度'},percent+'%'):null),h('span',{},(units.length?'素材已完成 '+done+'/'+units.length+' · 进行中 '+using:'原文方法')+(routeId==='qing'?' · 有效 '+P.hours(P.summarize(S.records,st.id).effectiveMinutes)+'h':'')),percent!==null?h('progress',{class:'practice-overview-meter',max:100,value:percent,'aria-label':st.title+'：分项已知总量平均进度 '+percent+'%，已完成 '+done+' / '+units.length+' 项'}):null],'practice-stage',{'data-stage':st.id,'data-route-key':routeKey},'practice-overview-row');
  })),false,'practice-route-overview');
}
function practiceView(routeId){
  const plan=practicePlan(routeId),st=practiceStage(routeId,plan),key=routeId+':'+(routeId==='xu'?S.practiceDomain:'listening');
  const page=h('div',{class:'practice-page practice-'+routeId},heading('MY ROUTE PROGRESS',routeId==='qing'?'庆爸进度':'许密杉进度',routeId==='qing'?'按阶段记录时间与素材，回看自己的积累。':'按原路线的阶段和素材，记录进行到哪里。'));
  if(routeId==='xu')page.append(h('div',{class:'practice-domains','aria-label':'许密杉进度的能力领域'},window.ROADMAP_RAW.routePlan.domains.map(d=>btn(d.label||d.title||({listening:'听力',speaking:'口语',reading:'阅读',writing:'写作'})[d.id],'practice-domain',{'data-domain':d.id,'aria-pressed':S.practiceDomain===d.id},S.practiceDomain===d.id?'button soft':'button'))));
  if(!st){page.append(h('section',{class:'panel'},h('p',{},plan?.summary||'本领域没有独立阶段。'),btn('查看完整路线','view',{'data-view':'routes'},'text-link')));return page;}
  page.append(h('div',{class:'practice-stage-picker'},h('label',{},h('span',{},'记录阶段'),h('select',{'aria-label':'选择记录阶段',onchange:e=>{S.practiceStages[key]=e.target.value;if(routeId==='qing'&&practiceStatState().scope==='stage')Object.assign(S.practiceStats,{group:'',focusFrom:'',focusTo:''});S.practiceLogLimit=12;render();}},plan.stages.map(s=>h('option',{value:s.id,selected:s.id===st.id},s.title)))),routeId==='qing'?btn([icon('clock'),'记一次时间'],'practice-add',{'data-stage':st.id},'button primary'):btn(icon('info'),'stage',{'data-id':st.id,'aria-label':'阶段详解',title:'阶段详解'},'icon-button'),routeId==='qing'?btn(icon('source'),'practice-history',{'aria-label':'查看时间明细',title:'时间明细'},'icon-button'):null),
    ...(routeId==='qing'?[h('div',{class:'practice-stage-title'},h('h2',{},st.title),btn('阶段详解','stage',{'data-id':st.id},'text-link'))]:[]));
  if(routeId==='qing')page.append(practiceTimeSummary(st));
  page.append(practiceMaterialList(st),practiceOverview(routeId,plan));
  if(routeId==='qing')page.append(readingFold('practice-qing-rules','时长折算与原文进阶要求',h('div',{},h('p',{},'时长达标和素材完成均不代表自动晋级；还需核对Phase和实际理解。400h、480h是原文累计参考。'),accounting(),st.hours?h('p',{class:'small-note'},'本阶段原文3–4岁投入参考：'+st.hours+'；当前已记有效 '+P.hours(P.summarize(S.records,st.id).effectiveMinutes)+'h。低龄不直接套用该用量。'):null,h('p',{},'本阶段原文进阶：'+st.exit),h('p',{class:'small-note'},'记录页面参考小红书随手记中的共读、动画和分类型素材；有效时间按原PDF计算。'),sourceBtn('qing-xhs-20261030',2,'查看记录方式参考图'))));
  return page;
}
function practiceNoteForm(){
  const m=S.modal,st=stages.get(m.stageId),unit=practiceUnits(st).find(u=>u.key===m.unitKey),record=P.unitRecord(S.records,m.unitKey);
  m.base??=JSON.stringify(S.records[m.unitKey]||null);
  return h('form',{id:'practice-note-form',class:'practice-form',oninput:e=>{e.currentTarget.dataset.dirty='true';}},h('h2',{},unit?.label||'素材进度'),h('p',{class:'small-note'},routes.get(st.routeId).name+' · '+st.title),
    h('label',{class:'form-row'},'状态',h('select',{name:'status','aria-label':'本路线素材状态'},Object.entries(P.STATUS).map(([id,label])=>h('option',{value:id,selected:record.status===id},label)))),
    h('label',{class:'form-row'},'进度备注',h('textarea',{name:'text',maxlength:2000,rows:4,placeholder:'例如：第1级读到第8本，喜欢动物主题。'},record.text)),
    h('p',{class:'form-error',id:'practice-error',role:'alert'}),h('div',{class:'form-actions'},h('button',{type:'submit',class:'button primary'},'保存进度')));
}
function publicationReference(resourceId){
  const catalog=window.ROADMAP_RAW.resourceVolumes,entry=catalog.series.find(s=>s.resourceId===resourceId);
  if(!entry)return null;
  return h('details',{class:'practice-book-sources'},h('summary',{},'版本、数量与核对来源'),h('p',{class:'small-note'},entry.versionNote||entry.edition),entry.countOnlyReason?h('p',{class:'small-note'},entry.countOnlyReason):null,h('p',{class:'small-note'},'核对于 '+catalog.checkedAt),entry.sources.map(s=>h('p',{},h('a',{href:asset(s.url),target:'_blank',rel:'noopener noreferrer'},s.title+' ↗'),h('small',{},s.evidence))));
}
function practiceHistoricalProgress(unit){
  const raw=practiceRawRecord(unit),record=P.unitRecord({[unit.key]:raw},unit.key),books=P.unitBooks(raw);
  let meta;try{meta=JSON.parse(raw?.note);}catch{}
  return raw&&(books?.mode!=='count'||books.total===null&&Number.isInteger(meta?.percent))?h('p',{class:'small-note'},'原百分比记录：'+(record.percent===null?P.STATUS[record.status]:record.percent+'%')+'；未换算成数量。'):null;
}
function practiceGroupForm(unit){
  const quantity=practiceQuantity(unit),time=P.materialTime(S.records,unit.key,unit.children.map(c=>c.key));
  const old=P.unitRecord(S.records,unit.key),books=P.unitBooks(S.records[unit.key]);
  return h('div',{class:'practice-form'},h('h2',{},unit.label),h('p',{},'汇总取父项单独记录与子项合计中的较大值，不把父项拆摊给子级。'),
    h('p',{},'完成数量：父项 '+quantity.directCompleted+' / 子项合计 '+quantity.childCompleted+' → 汇总 '+quantity.completed+quantity.unit),
    h('p',{},'实际时间：父项 '+Number(time.direct.minutes.toFixed(1))+' / 子项合计 '+Number(time.children.minutes.toFixed(1))+' → 汇总 '+Number(time.minutes.toFixed(1))+'分钟'),
    h('p',{},'有效时间：父项 '+Number(time.direct.effectiveMinutes.toFixed(1))+' / 子项合计 '+Number(time.children.effectiveMinutes.toFixed(1))+' → 汇总 '+Number(time.effectiveMinutes.toFixed(1))+'分钟'),
    h('p',{class:'small-note'},'数量和本次时间可直接在列表填写，时间按所选方式折算。修改或撤回已有时间请使用“时间明细”。各子级分别记录，不跨阶段或路线传播。'),
    unit.children.map(child=>h('p',{class:'small-note'},child.label+' · '+practiceQuantity(child).completed+(practiceQuantity(child).total!==null?'/'+practiceQuantity(child).total:'')+practiceQuantity(child).unit)),
    S.records[unit.key]&&(books||old.text||old.percent)?h('details',{class:'practice-book-sources'},h('summary',{},'原合并记录（保留，未拆摊）'),h('p',{},P.STATUS[old.status]+(old.percent!==null?' · '+old.percent+'%':'')+(old.date?' · '+old.date:'')),books?.mode==='count'?h('p',{},(books.label||'原范围')+' · '+(books.completed??0)+(books.total!==null?'/'+books.total:'')+(books.unit||practiceQuantityUnit(unit))):null,old.text?h('p',{},old.text):null):null,
    publicationReference(unit.resourceId));
}
function practicePartForm(unit){
  const form=h('form',{class:'practice-form',oninput:e=>{e.currentTarget.dataset.dirty='true';},onsubmit:e=>{
    e.preventDefault();
    if(JSON.stringify(S.records[unit.parentKey]||null)!==base){form.querySelector('[role=alert]').textContent='这份记录刚刚发生变化，请重新打开后修改。';return;}
    if(savePracticeRecords({[unit.parentKey]:P.unitEditionUpdate(form.elements.edition.value,S.records[unit.parentKey])})){form.dataset.dirty='false';closeModal();render();const next=practiceUnits(stages.get(unit.stageId)).find(u=>u.parentKey===unit.parentKey);if(next)document.getElementById('book-scope-'+next.key)?.focus({preventScroll:true});}
  }},h('h2',{},unit.label),unit.partScope?h('p',{},unit.partScope.edition+' · '+unit.partScope.total+(unit.partScope.unit||'本')):h('p',{class:'small-note'},'按本级分别记录完成数量；版本或总量未确定时不计算百分比。'),unit.recordingNote?h('p',{class:'small-note'},unit.recordingNote):null,h('details',{class:'practice-book-sources'},h('summary',{},'本阶段原文范围'),unit.item.materials.map(m=>h('div',{},h('p',{},m.original||unit.item.resource.title),src(m.sourceId)?sourceBtn(m.sourceId,m.page||1,'核对路线原图'):null))));
  const base=JSON.stringify(S.records[unit.parentKey]||null);
  if(unit.editionOptions?.length)form.append(h('label',{class:'form-row'},'手头版本',h('select',{name:'edition','aria-label':'素材版本'},unit.editionOptions.map(e=>h('option',{value:e.id,selected:unit.editionId===e.id},e.label)))),h('p',{class:'small-note'},'所选版本的各辑同时平铺，分别记录。切换版本保留各自记录，不换算分辑进度。'),h('p',{role:'alert',class:'form-error'}),h('button',{type:'submit',class:'button primary'},'保存版本'));
  form.append(...[practiceHistoricalProgress(unit),publicationReference(unit.resourceId)].filter(Boolean));
  return form;
}
function practiceTimeRules(unit){
  const t=window.ROADMAP_RAW.qing.timeAccounting,n=t.verifiedNote,st=stages.get(unit.stageId),mode=practiceTimeOptions(st,unit).find(o=>o.id==='audio'),time=P.materialTime(S.records,unit.key,unit.children?.map(c=>c.key));
  return h('section',{class:'practice-time-rules'},h('h2',{},unit.label),h('h3',{},'时间怎么算'),
    h('p',{},'按本次使用方式记录，不是给同一本书固定一个系数。行内填写本次实际分钟，回车或点勾保存后输入归零；累计时间自动更新。'),
    h('p',{},'累计实际 '+Number(time.minutes.toFixed(1))+' 分钟 · 累计有效 '+Number(time.effectiveMinutes.toFixed(1))+' 分钟。'),
    h('ul',{},h('li',{},'共读 ×1：孩子看图并听家长读英文，或看图听完整点读故事。'),h('li',{},'动画 ×1：实际观看符合难度的动画，关注文字时遮字幕；不是所有绘本都有配套动画。'),h('li',{},'纯音频：常规1–2 ×0；常规3 ×0.5；常规4及以后 ×0.8。读同一本书但没看图，也按音频算。'),h('li',{},'不计 ×0：本次不符合有效条件，仍保留实际投入。')),
    mode?h('p',{},'当前记录阶段：'+st.title+'；纯音频 ×'+mode.factor+'。例如听20分钟，计有效'+20*mode.factor+'分钟。系数跟随记录阶段，不按书名里的1、2、A或B推算。'):null,
    h('h3',{},'有效条件与特殊情况'),h('ul',{},n.conditions.map(text=>h('li',{},text))),
    h('p',{},'孩子主动发起的互动可以回应；互动耗时粗略扣除。若用一句英文一句中文的汪培珽共读法，原帖给出“原有效时数加20小时”或“剔除中文部分”两种处理；行内请填扣除后的分钟，不自动给全部中文时段套×1。'),
    h('p',{},'同一时段的动画和声音只记一次；不同时间又听音频可另记。未确认手头有配套音频时，不选音频；选项本身不代表该版本已附带此资源。'),
    h('p',{},n.mediaNote),sourceBtn('qing',4,'核对WPlay／古力媒介说明（PDF第4页）'),
    h('p',{class:'small-note'},'原帖另含TPR、低难度复习上限、阶段共读比例及年龄时数；这些需要按实际情况核对，不由本站自动认定。'+n.versionNote),
    h('h3',{},'作者原帖与原图'),h('p',{class:'small-note'},'庆爸育儿《常规路径，有效时间判定2.0版》；核对于 '+n.checkedAt+'。页面显示“编辑于04-30”，未显示年份，不推定发布时间。'),
    h('a',{href:src(n.sourceId).file,target:'_blank',rel:'noopener noreferrer'},'打开庆爸本人小红书原帖 ↗'),
    h('div',{class:'practice-time-source-links'},[2,3,4,5,6,7,8,9,10,11].map(page=>sourceBtn(n.sourceId,page,page<=4?'规则 Page'+(page-1):page===11?'准桥梁原图':'常规'+(page-4)+'原图'))));
}
function practiceBookForm(){
  const unit=practiceFindUnit(stages.get(S.modal.stageId),S.modal.id),body=practiceBookQuantityForm();
  const evidence=materialEvidence(unit.item.role);
  return unit.stageId.startsWith('qing-')?h('div',{},practiceTimeRules(unit),evidence,h('details',{class:'practice-book-sources'},h('summary',{},'数量、版本与父子汇总'),body)):evidence?h('div',{},evidence,body):body;
}
function practiceBookQuantityForm(){
  const m=S.modal,st=stages.get(m.stageId),unit=practiceFindUnit(st,m.id);
  if(unit.children)return practiceGroupForm(unit);
  const scope=practiceBookScope(unit),books=P.unitBooks(practiceRawRecord(unit));
  if(unit.partScope)return practicePartForm(unit);
  const entry=window.ROADMAP_RAW.resourceVolumes.series.find(s=>s.resourceId===unit.resourceId);
  const matched=unit.bookScopes.find(s=>s.id===scope?.id&&s.total===scope.total),custom=!!scope&&!matched;
  const base=JSON.stringify(S.records[unit.key]||null);
  const form=h('form',{id:'practice-book-form',class:'practice-form',oninput:e=>{e.currentTarget.dataset.dirty='true';},onsubmit:e=>{
    e.preventDefault();
    const error=form.querySelector('[role=alert]');
    try{
      if(JSON.stringify(S.records[unit.key]||null)!==base)throw new Error('这份记录刚刚发生变化，请关闭后重新打开再修改。');
      const choice=form.elements.scope.value;
      const selected=choice==='quantity'?null:choice==='custom'?{id:'personal',label:form.elements.range.value.trim(),total:Number(form.elements.total.value),edition:'本人选用范围',origin:'personal'}:unit.bookScopes.find(s=>s.id===choice);
      const update=selected?P.unitBookScopeUpdate(selected,S.records[unit.key]):P.unitQuantityProgressUpdate(P.quantityRecord(practiceRawRecord(unit),null,practiceQuantityUnit(unit)).completed,null,practiceRawRecord(unit),practiceQuantityUnit(unit));
      if(savePracticeRecords({[unit.key]:update})){form.dataset.dirty='false';closeModal();render();document.getElementById('book-scope-'+unit.key)?.focus({preventScroll:true});}
    }catch(err){error.textContent=err.message;}
  }},h('h2',{},unit.label),h('p',{class:'small-note'},entry?.note||'按手头版本与本阶段实际选用范围填写。'),
    h('label',{class:'form-row'},'记录方式与范围',h('select',{name:'scope','aria-label':'记录方式与选用范围'},h('option',{value:'quantity',selected:!scope},'只记完成数量（总量未定）'),unit.bookScopes.map(s=>h('option',{value:s.id,selected:matched?.id===s.id},(s.title?s.title+' · ':'')+s.label+' · '+s.total+(s.unit||practiceQuantityUnit(unit)))),h('option',{value:'custom',selected:custom},'自选范围与总数量'))),
    h('p',{class:'small-note practice-book-selection'}),
    h('div',{class:'practice-custom-books',hidden:!custom},h('label',{class:'form-row'},'实际选用范围',h('input',{name:'range',value:custom?scope.label:'',maxlength:80,placeholder:'例如：1辑、手头版GK，或1级第1辑'})),h('label',{class:'form-row'},'总数量（'+practiceQuantityUnit(unit)+'）',h('input',{name:'total',type:'number',inputmode:'numeric',min:1,max:10000,step:1,value:custom?scope.total:'',placeholder:'不含家长指导册、卡片与光盘'}))),
    h('p',{class:'small-note'},'有总量时按完成数量计算百分比；总量未定只记数量。旧百分比保留，不反推数量。'),
    h('p',{class:'form-error',role:'alert'}),h('div',{class:'form-actions'},h('button',{type:'submit',class:'button primary'},'保存范围')));
  const select=form.elements.scope,update=()=>{
    const isCustom=select.value==='custom',selected=unit.bookScopes.find(s=>s.id===select.value);
    form.querySelector('.practice-custom-books').hidden=!isCustom;
    for(const name of ['range','total']){form.elements[name].disabled=!isCustom;form.elements[name].required=isCustom;}
    form.querySelector('.practice-book-selection').textContent=selected?selected.edition+' · '+selected.parts.map(p=>p.label+' '+p.count+(selected.unit||practiceQuantityUnit(unit))).join(' + ')+' = '+selected.total+(selected.unit||practiceQuantityUnit(unit)):isCustom?'按本人填写的范围核算。':'仅记录完成数量，不显示百分比或进度条。';
  };
  select.addEventListener('change',update);update();
  if(entry)form.append(...[practiceHistoricalProgress(unit),publicationReference(unit.resourceId)].filter(Boolean));
  if(books?.mode==='count'&&books.total!==null&&books.completed!==null)form.append(h('p',{class:'small-note'},'原记录：'+books.label+' · '+books.completed+' / '+books.total+(books.unit||practiceQuantityUnit(unit))+'。'));
  return form;
}
function practiceSessionUnits(st){return practiceGroups(st).flatMap(u=>u.children?[{...u,label:u.label+'（总项）'},...u.children]:[u]);}
function sessionUnitOptions(st,selected='',old=null){return [h('option',{value:'',selected:!selected},'本阶段 · 未指定素材'),...practiceSessionUnits(st).map(u=>h('option',{value:u.key,selected:u.key===selected},u.label)),...(selected&&!practiceSessionUnits(st).some(u=>u.key===selected)&&old?[h('option',{value:selected,selected:true},old.unitLabel+'（原记录素材）')]:[])];}
function updateSessionForm(form,changeStage=false){
  if(changeStage)form.elements.unitKey.replaceChildren(...sessionUnitOptions(stages.get(form.elements.stageId.value)));
  form.querySelector('.practice-audio-factor').hidden=form.elements.kind.value!=='audio';
  form.elements.minutes.max=form.elements.kind.value==='history'?600000:1440;
  form.querySelector('.practice-minutes-label').textContent=form.elements.kind.value==='history'?'已折算分钟':'实际分钟';
  form.querySelector('.practice-selected-material').textContent='记录到 '+form.elements.stageId.selectedOptions[0].textContent+' / '+(form.elements.unitKey.selectedOptions[0]?.textContent||'');
  const raw=Number(form.elements.minutes.value)||0,factor=form.elements.kind.value==='audio'?Number(form.elements.factor.value):1;
  form.querySelector('output').textContent='本次有效 '+Number((form.elements.qualified.checked?raw*factor:0).toFixed(1))+' 分钟';
}
function practiceSessionForm(){
  const m=S.modal,old=P.sessions(S.records).find(e=>e.id===m.id),stage=stages.get(old?.stageId||m.stageId),date=P.today();
  const materialType=practiceFindUnit(stage,m.unitKey)?.item.resource.type,initialKind=old?.kind||(materialType==='animation'?'animation':materialType==='song'?'audio':'reading');
  m.base??=JSON.stringify(S.records[m.id]||null);
  const form=h('form',{id:'practice-session-form',class:'practice-form',oninput:e=>{e.currentTarget.dataset.dirty='true';updateSessionForm(e.currentTarget);},onchange:e=>{e.currentTarget.dataset.dirty='true';updateSessionForm(e.currentTarget,e.target.name==='stageId');}},
    h('h2',{},old?'编辑时间记录':'记一次时间'),h('div',{class:'practice-form-grid'},
      h('label',{class:'form-row'},'日期',h('input',{name:'date',type:'date',value:old?.date||m.date||date,max:date,required:true})),
      h('label',{class:'form-row'},'阶段',h('select',{name:'stageId',required:true},routes.get('qing').stages.map(st=>h('option',{value:st.id,selected:stage.id===st.id},st.title)))),
      h('label',{class:'form-row'},'活动类型',h('select',{name:'kind'},Object.entries(P.KINDS).map(([id,label])=>h('option',{value:id,selected:initialKind===id},label)))),
      h('label',{class:'form-row'},h('span',{class:'practice-minutes-label'},'实际分钟'),h('input',{name:'minutes',type:'number',min:1,max:1440,step:1,value:old?.minutes??0,placeholder:'例如30',required:true}))),
    h('label',{class:'form-row'},'本次使用素材',h('select',{name:'unitKey'},sessionUnitOptions(stage,old?.unitKey||m.unitKey||'',old))),
    h('p',{class:'small-note practice-selected-material'}),
    h('label',{class:'form-row practice-audio-factor',hidden:old?.kind!=='audio'},'音频折算系数（按当前听力阶段确认）',h('select',{name:'factor'},window.ROADMAP_RAW.qing.timeAccounting.audioFactors.map(f=>h('option',{value:f.factor,selected:(old?.factor??0)===f.factor},f.level+' · ×'+f.factor)))),
    h('label',{class:'practice-qualified'},h('input',{name:'qualified',type:'checkbox',checked:old?.qualified??true}),'本次符合原文有效投入条件，计入有效时长'),
    h('p',{class:'small-note'},'同时听、看只记一次。难度超过能力2级及以上不计入；环境需相对安静。历史补录填已折算分钟，避免与明细重复。'),
    h('label',{class:'form-row'},'内容 / 读到哪里',h('textarea',{name:'content',maxlength:2000,rows:3,placeholder:'例如：读了第1–3本，或动画第5集。'},old?.content||'')),
    h('output',{class:'practice-effective','aria-live':'polite'}),h('p',{class:'form-error',id:'practice-error',role:'alert'}),
    h('div',{class:'form-actions'},old?btn('删除这条记录','practice-delete',{'data-id':m.id},'button practice-delete'):null,h('button',{type:'submit',class:'button primary'},'保存记录')));
  updateSessionForm(form);return form;
}
function savePracticeForm(form){
  try{
    const m=S.modal,f=new FormData(form);let key=m.id,value;
    if(m.base!==JSON.stringify(S.records[m.kind==='practice-note'?m.unitKey:key]||null))throw new Error('这条记录已在另一页面更新，请保留输入并重新核对。');
    if(m.kind==='practice-note'){key=m.unitKey;value=P.unitUpdate(String(f.get('status')),String(f.get('text')));}
    else {const stageId=String(f.get('stageId')),unitKey=String(f.get('unitKey')),unit=practiceFindUnit(stages.get(stageId),unitKey),old=P.sessions(S.records).find(e=>e.id===key);
      if(unitKey&&!unit&&!(old?.stageId===stageId&&old.unitKey===unitKey))throw new Error('请选择当前阶段的素材。');
      value=P.sessionRecord({version:1,routeId:'qing',stageId,date:String(f.get('date')),createdAt:old?.createdAt||new Date().toISOString(),kind:String(f.get('kind')),minutes:Number(f.get('minutes')),factor:Number(f.get('factor')),qualified:f.has('qualified'),unitKey,unitLabel:unitKey?(unit?.label||old?.unitLabel||''):'',content:String(f.get('content'))});
    }
    if(!savePracticeRecords({[key]:value}))return;
    if(m.kind==='practice-entry')S.practiceStages['qing:listening']=String(f.get('stageId'));
    form.dataset.dirty='false';closeModal();render();toast('已保存在本机，登录后沿用英语记录同步');
  }catch(error){form.querySelector('#practice-error').textContent=error.message;}
}
function libraryResources(){return C.resources.concat(LC.resources(S.records));}
function libraryStageIds(){
  if(S.age==='all')return null;
  if(S.age==='current')return [...new Set(Object.values(rec().routeStages||{}))];
  return S.age.startsWith('stage:')?[S.age.slice(6)]:[];
}
function libraryStageFilter(){
  const selected=S.age==='all'?'所有阶段':S.age==='current'?'宝宝当前浏览起点':stages.get(S.age.slice(6))?.title||'所有阶段';
  const choices=h('div',{class:'library-filter-choices'},[['all','所有阶段'],['current','宝宝当前浏览起点']].map(([value,label])=>h('button',{type:'button','aria-pressed':String(S.age===value),onclick:()=>libraryFilterApply('age',value,'library-stage-toggle')},label)),
    ['xu','qing','banana'].filter(id=>S.route==='all'||S.route==='other'||S.route===id).map(id=>{
      const primary=EnglishModel.getRoutePlan(C,id,'listening',S.profile).stages,other=C.stages.filter(st=>st.routeId===id&&!primary.some(p=>p.id===st.id));
      const choice=st=>h('button',{type:'button','aria-pressed':String(S.age==='stage:'+st.id),onclick:()=>libraryFilterApply('age','stage:'+st.id,'library-stage-toggle')},st.title);
      return h('div',{class:'library-stage-group'},h('strong',{},routes.get(id).name),primary.map(choice),other.length?h('details',{},h('summary',{},'其他资料阶段'),other.map(choice)):null);
    }));
  return libraryPopover('library-stage','按使用阶段筛选：'+selected,'阶段',choices,S.age!=='all');
}
function libraryTopicFilter(){
  const all=LB.topics(BOOKS,LC.resources(S.records)),label=all.find(t=>t.id===S.libraryTopic)?.label||'全部主题';
  return libraryPopover('library-topic','按主题筛选：'+label,'主题',h('div',{},h('div',{class:'library-topic-choices'},[{id:'all',label:'全部主题'},...all].map(t=>h('button',{type:'button','aria-pressed':String(S.libraryTopic===t.id),onclick:()=>{S.libraryBookMode=true;libraryFilterApply('libraryTopic',t.id,'library-topic-toggle');}},t.label))),
    h('div',{class:'library-topic-mode'},h('button',{type:'button',class:'text-link',onclick:()=>{S.libraryTopic='all';S.libraryBookMode=!S.libraryBookMode;render();document.getElementById('library-topic-toggle')?.focus({preventScroll:true});}},S.libraryBookMode?'返回套系浏览':'查看全部单本')),bookCoverage()),S.libraryTopic!=='all'||S.libraryBookMode);
}
function bookTopicLabel(book){
  return book.custom?'个人分类':({'content-verified':'内容简介已核对','classification-verified':'分类图已核对','title-fallback':'仅按书名兜底'})[book.topicStatus]||'内容主题待核对';
}
function bookSourceBlock(id){
  const source=BOOKS.sources.find(s=>s.id===id);if(!source)return null;
  return h('div',{class:'book-source'},source.url?h('a',{href:source.url,target:'_blank',rel:'noopener noreferrer'},source.title+' ↗'):h('span',{},source.title),
    h('p',{class:'small-note'},[source.author||source.provider,source.publishedAt,source.note||source.summary].filter(Boolean).join(' · ')),
    source.images?.length?h('div',{class:'links-inline'},source.images.map(image=>btn([icon('source'),image.caption||'原图 '+image.page],'preview',{'data-source':id,'data-page':image.page,'aria-label':source.title+' · '+(image.caption||'原图 '+image.page)},'text-link'))):null);
}
function bookCoverage(){
  const series=new Set(BOOKS.books.map(b=>b.resourceId)),content=BOOKS.books.filter(b=>b.topicStatus==='content-verified').length,classification=BOOKS.books.filter(b=>b.topicStatus==='classification-verified').length,pending=BOOKS.books.filter(b=>b.topicStatus==='pending').length;
  return h('details',{class:'book-coverage'},h('summary',{},'已收录 '+BOOKS.books.length+' 条分版本书目 · 核对范围'),h('p',{},'覆盖 '+series.size+' 个套系的部分版本。内容简介核对 '+content+' 条，分类图核对 '+classification+' 条，内容主题待核对 '+pending+' 条。目录收录数不等于套系总量，不同版本也不代表不同故事。'),
    h('p',{},'优先依据出版社内容、可读内页或明确版本分类图整理主题；已找到但读不到内容的保留待核对，不按书名冒充已确认。主题不用于推断作者阶段。'),
    h('details',{},h('summary',{},'尚待补充的书籍套系 · '+BOOKS.coverage.filter(c=>c.status==='pending').length),h('div',{class:'book-pending-list'},BOOKS.coverage.filter(c=>c.status==='pending').map(c=>btn(c.title,'resource',{'data-id':c.resourceId},'text-link')))));
}
function libraryBooks(){return LB.entries(BOOKS,libraryResources(),EnglishModel);}
function libraryBookCover(book){
  const resource=book.resource,frame=h('div',{class:'library-book-cover'});
  const fallback=()=>{
    frame.title=resource.title+' · 套系示例图，非本书封面';
    frame.replaceChildren(familyCover(resource));
    const img=frame.querySelector('img');
    if(img){img.alt=resource.title+'套系示例图，非'+book.title+'单本封面';img.addEventListener('error',()=>frame.replaceChildren(h('span',{class:'library-book-placeholder','aria-label':'暂无封面图'},icon('book'))),{once:true});}
  };
  if(book.cover)frame.append(h('img',{src:asset(book.cover),alt:book.title+' · 单本封面示例',title:book.title+' · 单本封面示例',loading:'lazy',onerror:fallback}));
  else fallback();
  return frame;
}
function bookRow(book){
  const resource=book.resource,labels=LB.topicIds(book,BOOKS).map(id=>BOOKS.topics.find(t=>t.id===id)?.label||id);
  const destinations=[...new Map(book.appearances.map(a=>[a.stageId,a])).values()];
  return h('article',{class:'library-book-row'},libraryBookCover(book),h('div',{class:'library-book-body'},h('div',{class:'library-book-title'},h('strong',{},book.title),btn(icon('info'),book.custom?'custom-book-edit':'library-book',{'data-id':book.custom?resource.id:book.id,title:'版本、目录与主题依据','aria-label':book.title+'的版本、目录与主题依据'},'icon-button')),
    h('div',{class:'library-book-context'},h('span',{},(book.seriesTitle||resource.title)+(book.level?' · '+book.level:'')),h('span',{},book.edition)),
    h('div',{class:'library-book-topics'},labels.length?labels.map(label=>h('span',{class:'chip'},label)):h('span',{class:'small-note'},'主题待核对'),book.topicStatus==='title-fallback'?h('span',{class:'small-note'},'书名兜底'):null),
    destinations.length?h('details',{class:'library-book-stages',open:libraryUsageFolds.get(book.id)??false,ontoggle:e=>{if(e.target===e.currentTarget&&e.currentTarget.isConnected){libraryUsageFolds.set(book.id,e.currentTarget.open);updateLibraryUsageToggle();}}},h('summary',{},book.custom?'个人阶段参考':book.unleveledSeries?'套系使用阶段参考 · '+destinations.length:'路线使用阶段 · '+destinations.length),destinations.map(a=>btn((routes.get(a.routeId)?.name||'')+' · '+(stages.get(a.stageId)?.title||a.stageId),'stage',{'data-id':a.stageId},'text-link')),book.custom?h('p',{class:'small-note'},'个人选用，不代表作者书单。'):null):null));
}
function filteredLibraryBooks(){return LB.filter(libraryBooks(),BOOKS,{route:S.route,stageIds:libraryStageIds(),topic:S.libraryTopic,query:S.search,type:S.type,favoriteIds:S.favoriteOnly?S.favorites:null,sharedOnly:S.sharedOnly}).filter(b=>S.materialStatus==='all'||resourceProgress(byId.get(b.resourceId)).status===S.materialStatus);}
function libraryBookResults(){
  const result=filteredLibraryBooks();
  const key=JSON.stringify(['books',S.libraryTopic,S.route,S.age,S.type,S.search,S.favoriteOnly,S.sharedOnly,S.materialStatus]);if(key!==S.libraryKey){S.libraryKey=key;S.libraryLimit=18;}
  const visible=result.slice(0,S.libraryLimit),topic=LB.topics(BOOKS,LC.resources(S.records)).find(t=>t.id===S.libraryTopic)?.label;
  const stage=S.age.startsWith('stage:')?stages.get(S.age.slice(6))?.title:S.age==='current'?'宝宝当前浏览起点':'';
  return h('div',{class:'library-results'},h('p',{class:'result-count',role:'status'},[topic,stage,'匹配 '+result.length+' 条书目'].filter(Boolean).join(' · ')),
    bookCoverage(),
    result.length?h('div',{class:'library-book-list'},visible.map(bookRow)):h('div',{class:'empty'},h('p',{},'当前收录且符合主题依据的书目中没有匹配结果；待核对书目不参与主题匹配。可清除条件或返回套系浏览。'),btn('清除筛选','clear-filters',{},'button soft')),
    visible.length<result.length?h('div',{class:'load-more'},h('p',{},'已显示 '+visible.length+' / '+result.length+' 本'),btn('再看18本','library-more')):null);
}
const bookCatalogViews=new Map();
function librarySeriesCount(resource){
  const volumes=window.ROADMAP_RAW.resourceVolumes,entry=volumes.series.find(s=>s.resourceId===resource.id);
  const selections=resourceRouteEntries(resource.id).flatMap(row=>{
    const units=row.materialUnit.children||[row.materialUnit];
    if(!units.some(u=>u.editionId||P.unitBooks(practiceRawRecord(u))?.mode==='count'&&P.unitBooks(practiceRawRecord(u)).total!==null))return [];
    const parts=units.flatMap(u=>{
      const scope=practiceBookScope(u);if(!scope)return [];
      const recording=entry?.recordingEditions?.find(e=>e.id===u.editionId),source=entry?.scopes.find(s=>s.id===recording?.scopeId)?.parts.find(p=>p.label===scope.label);
      return [{edition:scope.edition,label:scope.label,count:scope.total,unit:scope.unit||practiceQuantityUnit(u),directoryMatch:source?.directoryMatch}];
    });
    return parts.length?[{routeId:row.routeId,stageId:row.stage.id,parts}]:[];
  });
  return LB.seriesCount(BOOKS,resource,EnglishModel,volumes,{route:S.route,stageIds:libraryStageIds(),selections});
}
function librarySeriesCountSummary(resource,count){
  const stage=S.age.startsWith('stage:')?stages.get(S.age.slice(6))?.title:S.age==='current'?'宝宝当前浏览起点':'全部阶段';
  const route=S.route==='all'?'全部路线':routes.get(S.route)?.name||'其他';
  const editions=[...new Set(count.parts.map(p=>p.edition))],publication=publicationReference(resource.id);
  return h('section',{class:'library-count-summary'},h('p',{class:'small-note'},route+' · '+stage),
    h('p',{},count.total?(count.basis==='directory'?'当前目录已收录 ':count.basis==='selection'?'当前选用范围合计 ':'已核范围合计 ')+count.total+count.unit:'对应范围的总量尚待核对'),
    h('details',{},h('summary',{},'数量构成、版本与来源'),editions.map(edition=>h('p',{class:'small-note'},edition+'：'+count.parts.filter(p=>p.edition===edition).map(p=>p.label+' '+p.count+p.unit).join(' ＋ '))),
    count.unknown.length?h('p',{class:'small-note'},'未计入总量的待核范围：'+count.unknown.join('、')):null,
    count.parts.some(p=>p.source==='selection')?h('p',{class:'small-note'},'当前路线采用进度页实际选用版本，与该页选版同步；原文引用及不同版本的级别关系保持不变。'):null,
    h('p',{class:'small-note'},'相同版本与分项重复引用只计一次；各版本分别相加，不代表不同故事数或跨版本等价。逐册目录覆盖与总量来源分别核对。'),
    h('p',{class:'small-note'},'本套系全部版本目录已收录 '+count.allBooks.length+' 条，当前路线与阶段可对应 '+count.books.length+' 条。'),
    publication));
}
function resourceBookCatalog(resource,expanded=false){
  const quantity=librarySeriesCount(resource),allBooks=quantity.allBooks,books=quantity.narrowed?quantity.books:allBooks;
  const summary=librarySeriesCountSummary(resource,quantity);
  if(!books.length){const empty=h('div',{},summary,h('p',{},allBooks.length?'当前筛选对应的版本或级别尚未收录逐册目录。清除路线、阶段条件可查看本套系其他版本；不能将其他版本目录套用为当前范围。':'本套系尚未收录逐册目录。'));return expanded?h('div',{},h('h2',{},resource.title+' · 数量与目录'),empty):readingFold('resource-books-'+resource.id,'数量范围与逐册目录',empty);}
  const editions=[...new Set(books.map(b=>b.edition))],state=bookCatalogViews.get(resource.id)||{edition:'all',limit:18};
  if(state.edition!=='all'&&!editions.includes(state.edition))state.edition='all';
  bookCatalogViews.set(resource.id,state);
  const list=h('div',{class:'library-book-list'}),count=h('p',{class:'small-note',role:'status'}),editionLabel=h('p',{class:'small-note'});
  const more=h('button',{type:'button',class:'button soft',onclick:()=>{state.limit+=18;refresh();}},'再看18本');
  const refresh=()=>{
    const selected=books.filter(b=>state.edition==='all'||b.edition===state.edition);
    list.replaceChildren(...selected.slice(0,state.limit).map(bookRow));
    count.textContent='目录已收录 '+selected.length+' 条 · 已显示 '+Math.min(state.limit,selected.length)+' 条';
    more.disabled=state.limit>=selected.length;more.textContent=more.disabled?'已显示本版本全部书目':'再看18本';
    editionLabel.textContent=state.edition==='all'?'各版本分开列出，同名异版保留。':state.edition;
  };
  refresh();
  const research=(BOOKS.seriesResearch||[]).filter(r=>r.resourceId===resource.id),ids=[...new Set(books.flatMap(b=>b.sourceIds||[]))];
  const body=h('div',{},summary,editions.length>1?h('label',{class:'form-row'},'目录版本',h('select',{'aria-label':'目录版本',onchange:e=>{state.edition=e.currentTarget.value;state.limit=18;refresh();}},h('option',{value:'all',selected:state.edition==='all'},'全部版本'),editions.map(edition=>h('option',{value:edition,selected:state.edition===edition},edition))),editionLabel):null,count,list,more,
    h('details',{class:'book-directory-sources'},h('summary',{},'分类图、读法与核对范围'),h('p',{class:'small-note'},BOOKS.topicNote),research.map(r=>h('div',{},h('p',{},r.scope||''),(r.readingGuide||[]).map(guide=>h('div',{},h('p',{},guide.summary),guide.scope?h('p',{class:'small-note'},guide.scope):null,bookSourceBlock(guide.sourceId))),h('details',{},h('summary',{},'已查来源与检索记录'),(r.searchLog||[]).map(log=>h('p',{class:'small-note'},[log.source||log.channel,log.query,log.result||log.outcome].filter(Boolean).join(' · ')))))),h('details',{},h('summary',{},'目录及主题来源'),ids.map(bookSourceBlock))));
  return expanded?h('div',{},h('h2',{},resource.title+' · 逐册目录'),body):readingFold('resource-books-'+resource.id,'逐册目录与主题 · 已收录'+books.length+'条',body);
}
function libraryBookDetail(id){
  const book=libraryBooks().find(b=>b.id===id);if(!book)return h('p',{},'未找到这本书。');
  const row=bookRow(book);row.querySelector('.icon-button')?.remove();
  return h('div',{},row,h('p',{},bookTopicLabel(book)),h('p',{},book.topicBasis||BOOKS.topicNote),
    (book.topicEvidence||[]).map(evidence=>h('section',{class:'book-topic-evidence'},h('p',{},evidence.summary),evidence.originalTopic?h('p',{class:'small-note'},'原分类：'+evidence.originalTopic):null,h('p',{class:'small-note'},evidence.locator||''),bookSourceBlock(evidence.sourceId))),
    book.learningFocus?h('details',{},h('summary',{},'原表学习重点（与内容主题分开）'),h('p',{},book.learningFocus.originalTopic||''),h('p',{class:'small-note'},'原表句型：'+book.learningFocus.sentencePattern+'；仅供原图核对，不作为英语示范。')):null,
    book.chapters?.length?h('details',{},h('summary',{},'分篇内容'),book.chapters.map(chapter=>h('p',{},chapter.title+' · '+(chapter.topics||[]).map(id=>BOOKS.topics.find(t=>t.id===id)?.label||id).join('、')))):null,book.catalogNote?h('p',{class:'small-note'},book.catalogNote+(book.sourceTitle?' 目录原名：'+book.sourceTitle:'')):null,
    book.coverSource?h('p',{class:'small-note'},h('a',{href:book.coverSource.sourceUrl,target:'_blank',rel:'noopener noreferrer'},'单本封面出处 · '+book.coverSource.provider+' ↗'),'；同名读物示例，装帧与套装版本以手头资料为准。'):h('p',{class:'small-note'},'当前使用所属套系的示例图，非本书单独封面。'),
    book.unleveledSeries&&book.appearances.length?h('p',{class:'small-note'},'原路线按套系选用，未逐本指定难度；阶段筛选保留套系使用参考，不表示每本书难度完全相同。'):null,
    book.editionMatch==='reference-only'?h('p',{class:'small-note'},'这份目录的版本或选读范围未与作者原阶段逐本确认，暂不推定单本阶段。'):null,
    h('h3',{},'书目与主题来源'),(book.sourceIds||[]).filter(id=>!(book.topicEvidence||[]).some(e=>e.sourceId===id)).map(bookSourceBlock),
    h('p',{class:'small-note'},'目录核对：'+BOOKS.checkedAt),btn('查看本套逐册目录','resource-books',{'data-id':book.resourceId},'text-link'));
}
function filteredResources(){const applicable=r=>(r.custom?r.stageRefs:r.appearances).filter(a=>['all','other'].includes(S.route)||a.routeId===S.route);let rr=libraryResources().filter(r=>(S.type==='all'||r.type===S.type)&&(S.route==='all'||(S.route==='other'?r.custom:r.appearances.some(a=>a.routeId===S.route)))&&(!S.favoriteOnly||S.favorites.includes(r.id))&&(!S.sharedOnly||sharedRoutes(r).length>1)&&(S.materialStatus==='all'||resourceProgress(r).status===S.materialStatus));const q=S.search.trim().toLowerCase();if(q)rr=rr.filter(r=>(r.title+' '+(r.aliases||[]).join(' ')+' '+r.levels.join(' ')+' '+r.appearances.map(a=>a.original||'').join(' ')+' '+(r.topics||[]).join(' ')+' '+(r.text||'')+' '+(songResourceIds.has(r.id)?'SSS Super Simple Songs 3S '+SSS.songs.map(s=>s.title).join(' '):'')).toLowerCase().includes(q));if(S.age==='current'){const ids=new Set(Object.values(rec().routeStages||{}));rr=rr.filter(r=>applicable(r).some(a=>ids.has(a.stageId)));}else if(S.age.startsWith('stage:')){const id=S.age.slice(6);rr=rr.filter(r=>applicable(r).some(a=>a.stageId===id));}else if(S.age!=='all'){const route=routes.get('banana');const found=route?.stages.filter(st=>(st.schedules||[]).some(sc=>String(sc.ageGroup||'').includes(S.age)))||[];const ids=new Set(found.map(x=>x.id));rr=rr.filter(r=>applicable(r).some(a=>ids.has(a.stageId)));}return rr.sort((a,b)=>new Set(b.appearances.map(x=>x.routeId)).size-new Set(a.appearances.map(x=>x.routeId)).size);}
function priceAmount(quote){return '¥'+quote.min+(quote.max!==quote.min?'–'+quote.max:'')+quote.unit;}
function priceGroups(resource){
  const groups=new Map();
  for(const quote of resource.referencePrices){const key=JSON.stringify([quote.label,quote.min,quote.max,quote.unit,quote.edition]);if(!groups.has(key))groups.set(key,{quote,evidence:[]});groups.get(key).evidence.push(quote);}
  return [...groups.values()];
}
function priceCard(resource){
  if(!resource.referencePrices.length)return null;
  return btn(icon('info'),'resource-price',{'data-id':resource.id,'aria-label':resource.title+'历史好价参考，查看级别、版本和原图','aria-haspopup':'dialog',title:'历史好价参考'},'price-info');
}
function priceReference(resource){
  const groups=priceGroups(resource);if(!groups.length)return null;
  const source=window.ROADMAP_RAW.resourcePrices.source;
  return h('details',{class:'price-reference'},h('summary',{},'历史好价参考 · '+groups.length+'条'),
    h('p',{class:'small-note'},source.author+' · 笔记 '+source.publishedAt.slice(0,10)+' · 核对 '+source.checkedAt),
    h('p',{class:'small-note'},'历史价格供预算参考；按原图级别、每辑/每级和版本保留，不代表当前售价。'),
    h('ul',{class:'price-quotes'},groups.map(({quote,evidence})=>h('li',{},
      h('div',{class:'price-quote-heading'},h('strong',{},quote.label||resource.title),h('span',{class:'price-amount'},priceAmount(quote))),
      quote.edition?h('p',{class:'small-note'},quote.edition):null,quote.note?h('p',{class:'small-note'},quote.note):null,
      h('details',{class:'price-evidence'},h('summary',{},'原文与出处'+(evidence.length>1?' · '+evidence.length+'处':'')),evidence.map(item=>h('div',{},h('p',{class:'small-note'},item.originalText),item!==quote&&item.note?h('p',{class:'small-note'},item.note):null,sourceBtn(source.id,item.sourcePage,'核对第'+item.sourcePage+'张原图'))))))),
    h('a',{class:'text-link',href:source.file,target:'_blank',rel:'noopener noreferrer'},'打开原笔记 ↗'));
}
function libraryReferenceCount(count,personal=false){
  const label=count+(personal?' 处个人阶段参考':' 处阶段引用');
  return h('span',{class:'library-reference-count',role:'img','aria-label':label,title:label},icon('references'),h('span',{'aria-hidden':'true'},count));
}
function customLibraryCard(r){
  // @CfSecAICode 遵循消费金融安全编码 FE-XSS-001 规范: 个人标题、主题和备注只经h的文本节点输出。
  const editAttrs={'data-id':r.id},refs=r.stageRefs.filter(ref=>stages.has(ref.stageId));
  const usage=h('details',{id:'library-usage-'+r.id,class:'card-usage custom-book-usage','data-resource-id':r.id,open:libraryUsageFolds.get(r.id)??false,ontoggle:e=>{
    if(e.target===e.currentTarget&&e.currentTarget.isConnected){libraryUsageFolds.set(r.id,e.currentTarget.open);updateCardUsageToggle(e.currentTarget);updateLibraryUsageToggle();}
  }},h('summary',{},'主题与个人阶段参考'),h('div',{class:'custom-book-meta'},
    r.topics.length?h('div',{class:'chips'},r.topics.map(topic=>h('span',{class:'chip'},topic))):h('p',{class:'small-note'},'尚未添加主题'),
    refs.map(ref=>btn(routes.get(ref.routeId).name+' · '+stages.get(ref.stageId).title,'stage',{'data-id':ref.stageId},'text-link')),
    refs.length?h('p',{class:'small-note'},'个人选用阶段，不代表原作者书单推荐。'):null,r.text?h('p',{},r.text):null));
  return h('article',{class:'resource-card library-card custom-library-card'},h('div',{class:'resource-body'},
    h('div',{class:'library-card-head'},btn(familyCover(r),'custom-book-edit',{id:'library-cover-'+r.id,...editAttrs,'aria-label':'编辑'+r.title+'个人素材','aria-haspopup':'dialog',title:'编辑个人素材'},'card-view-btn library-card-cover'),h('div',{class:'library-card-heading'},h('div',{class:'resource-topline'},h('span',{},TYPES[r.type]),h('span',{},'个人'),libraryReferenceCount(refs.length,true)),
      h('div',{class:'resource-title'},btn(h('h3',{},r.title),'custom-book-edit',{id:'library-title-'+r.id,...editAttrs,'aria-label':'编辑'+r.title,'aria-haspopup':'dialog',title:'编辑个人素材'},'card-view-btn')))),
    h('div',{class:'library-card-tools'},resourceStatusControl(r,false,true),
      btn(icon('heart'),'favorite',{id:'library-favorite-'+r.id,...editAttrs,'aria-label':(S.favorites.includes(r.id)?'取消收藏':'收藏')+r.title,'aria-pressed':S.favorites.includes(r.id),style:{color:S.favorites.includes(r.id)?'#bc8664':''}},'icon-button'),cardUsageToggle(r,usage,'主题与个人阶段参考')),usage));
}
function customBookForm(){
  const m=S.modal,record=S.records[m.id],saved=LC.decode(record),isNew=!saved;
  m.base??=JSON.stringify(record||null);
  if(saved?.deleted)return h('p',{},'这份个人素材已删除。');
  const stageOptions=['xu','qing','banana'].flatMap(routeId=>C.stages.filter(st=>st.routeId===routeId));
  const selected=saved?.stageRefs?.[0]?.stageId||'';
  const stageLabel=h('p',{class:'small-note custom-book-stage-text'},selected&&stages.has(selected)?routes.get(stages.get(selected).routeId).name+' · '+stages.get(selected).title:'');
  const topicRows=h('div',{class:'custom-topic-rows'});
  const topicRow=value=>h('div',{class:'custom-topic-row'},h('input',{name:'topic',value,list:'custom-book-topic-options',maxlength:30,'aria-label':'素材主题',placeholder:'例如：身体、交通、动物'}),h('button',{type:'button',class:'icon-button','aria-label':'删除这个主题',onclick:e=>{e.currentTarget.parentElement.remove();form.dataset.dirty='true';}},'−'));
  topicRows.append(...(saved?.topics?.length?saved.topics:['']).map(topicRow));
  const error=()=>{if(m.base!==JSON.stringify(S.records[m.id]||null))throw new Error('这份素材已在其他页面更新，输入已保留，请关闭后重新核对。');};
  const finish=()=>{form.dataset.dirty='false';closeModal();render();(document.getElementById('library-title-'+m.id)||document.getElementById('library-add-book'))?.focus({preventScroll:true});};
  const form=h('form',{id:'custom-book-form',class:'practice-form custom-book-form',oninput:e=>e.currentTarget.dataset.dirty='true',onchange:e=>e.currentTarget.dataset.dirty='true',onsubmit:e=>{
    e.preventDefault();try{error();const data=new FormData(form),stage=stages.get(data.get('stage'));
      const changes=LC.save(S.records,m.id.slice(LC.KEY.length),{title:data.get('title'),type:data.get('type'),topics:data.getAll('topic'),text:data.get('text'),stageRefs:stage?[{routeId:stage.routeId,stageId:stage.id}]:[]},C.stages);
      if(!savePracticeRecords(changes))return;
      if(isNew){S.route='other';S.type='all';S.age='all';S.libraryTopic='all';S.libraryBookMode=false;S.search='';S.favoriteOnly=false;S.sharedOnly=false;S.materialStatus='all';}
      finish();toast(isNew?'已添加到其他素材':'个人素材已保存');
    }catch(error){form.querySelector('.form-error').textContent=error.message;}
  }},h('h2',{},isNew?'新增其他素材':'编辑个人素材'),
    h('label',{class:'form-row'},'素材名称',h('input',{name:'title',value:saved?.title||'',required:true,maxlength:160,placeholder:'绘本、分级或其他素材名称'})),
    h('div',{class:'practice-form-grid'},h('label',{class:'form-row'},'类型',h('select',{name:'type'},Object.entries(TYPES).map(([value,label])=>h('option',{value,selected:value===(saved?.type||'book')},label)))),
      h('p',{class:'small-note'},'完成数量通过素材卡片的进度标记录，状态自动计算。')),
    h('fieldset',{class:'form-row custom-book-topics'},h('legend',{},'主题（可选）'),h('datalist',{id:'custom-book-topic-options'},BOOKS.topics.map(t=>h('option',{value:t.label}))),topicRows,h('button',{type:'button',class:'text-link',onclick:()=>{topicRows.append(topicRow(''));form.dataset.dirty='true';topicRows.lastElementChild.querySelector('input').focus();}},'＋ 添加主题')),
    h('label',{class:'form-row'},'个人阶段参考（可选）',h('select',{name:'stage',onchange:e=>{const st=stages.get(e.currentTarget.value);stageLabel.textContent=st?routes.get(st.routeId).name+' · '+st.title:'';}},h('option',{value:'',selected:!selected},'不指定阶段'),stageOptions.map(st=>h('option',{value:st.id,selected:st.id===selected},routes.get(st.routeId).name+' · '+st.title))),stageLabel),
    h('label',{class:'form-row'},'备注（可选）',h('textarea',{name:'text',maxlength:2500,rows:2,placeholder:'例如：手头版本、孩子感兴趣的内容'},saved?.text||'')),
    h('p',{class:'form-error',role:'alert'}),h('div',{class:'form-actions'},!isNew?h('button',{type:'button',class:'button practice-delete',onclick:()=>{
      try{error();if(!window.confirm('删除这份个人素材？'))return;if(savePracticeRecords(LC.remove(S.records,m.id))){finish();toast('个人素材已删除');}}catch(error){form.querySelector('.form-error').textContent=error.message;}
    }},'删除素材'):null,h('button',{type:'submit',class:'button primary'},isNew?'添加素材':'保存修改')));
  return form;
}
function libraryCard(r){
  if(r.custom)return customLibraryCard(r);
  const bookCount=librarySeriesCount(r),countLabel=bookCount.total?(bookCount.basis==='directory'?'已收录':bookCount.partial?'已核':'')+bookCount.total+bookCount.unit:'册数待核';
  const usage=cardUsage(r);
  return h('article',{class:'resource-card library-card'+(sharedRoutes(r).length>1?' shared':'')},h('div',{class:'resource-body'},
    h('div',{class:'library-card-head'},btn(familyCover(r),'resource',{id:'library-cover-'+r.id,'data-id':r.id,'aria-label':'查看'+r.title,'aria-haspopup':'dialog',title:'查看完整详情'},'card-view-btn library-card-cover'),
      h('div',{class:'library-card-heading'},h('div',{class:'resource-topline'},h('span',{},TYPES[r.type]||'其他'),libraryReferenceCount(r.appearances.length)),
        h('div',{class:'resource-title'},btn(materialUI.name(r.title,sharedRoutes(r).length>1,{tag:'h3',className:'library-series-name'}),'resource',{id:'library-title-'+r.id,'data-id':r.id,'aria-label':r.title+'完整详情','aria-haspopup':'dialog',title:'查看完整详情'},'card-view-btn'),['book','reader'].includes(r.type)||bookCount.total?btn(countLabel,'resource-books',{'data-id':r.id,'aria-label':r.title+'当前筛选数量 · '+countLabel+'；查看范围、来源与逐册目录',title:'查看当前筛选的数量构成与目录覆盖'},'text-link library-book-link'):null,priceCard(r)))),
    h('div',{class:'library-card-tools'},resourceStatusControl(r,false,true),
      songResourceIds.has(r.id)?btn(icon('music'),'sss-songs',{id:'library-songs-'+r.id,'data-id':r.id,'aria-label':r.title+'分类歌单',title:'分类歌单'},'icon-button library-song-link'):null,
      btn(icon('heart'),'favorite',{id:'library-favorite-'+r.id,'data-id':r.id,'aria-label':(S.favorites.includes(r.id)?'取消收藏':'收藏')+r.title,title:S.favorites.includes(r.id)?'取消收藏':'收藏',style:{color:S.favorites.includes(r.id)?'#bc8664':''},'aria-pressed':S.favorites.includes(r.id)},'icon-button'),cardUsageToggle(r,usage)),usage));
}
function libraryPopover(id,label,content,body,active=false){
  const trigger=h('button',{type:'button',id:id+'-toggle',class:'library-filter-button'+(active?' active':''),popovertarget:id,'aria-label':label,title:label,'aria-expanded':'false'},content);
  const panel=h('div',{id,class:'library-popover',popover:'auto',role:'dialog','aria-label':label,onkeydown:e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();panel.hidePopover();trigger.focus({preventScroll:true});}
  },ontoggle:e=>{
    const open=e.newState==='open';trigger.setAttribute('aria-expanded',String(open));
    if(open){const rect=trigger.getBoundingClientRect(),width=panel.getBoundingClientRect().width;panel.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';panel.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-panel.getBoundingClientRect().height-8))+'px';panel.querySelector('input')?.focus({preventScroll:true});}
  }},h('div',{class:'library-popover-head'},h('strong',{},label),h('button',{type:'button',class:'icon-button','aria-label':'关闭'+label,popovertarget:id,popovertargetaction:'hide'},icon('close'))),body);
  return h('div',{class:'library-filter-control'},trigger,panel);
}
function libraryFilterApply(key,value,triggerId){S[key]=value;render();document.getElementById(triggerId)?.focus({preventScroll:true});}
function libraryLayoutToggle(){
  return h('div',{class:'library-layout-toggle',role:'group','aria-label':'套系显示方式'},[['list','menu','列表视图'],['covers','grid','封面视图']].map(([value,name,label])=>h('button',{id:'library-layout-'+value,type:'button',class:'icon-button','aria-label':label,title:label,'aria-pressed':String(S.libraryLayout===value),onclick:()=>{
    const anchor=[...document.querySelectorAll('.library-grid>.library-card')].find(card=>{const rect=card.getBoundingClientRect();return rect.bottom>200&&rect.top<innerHeight;}),top=anchor?.getBoundingClientRect().top;
    S.libraryLayout=value;
    document.querySelector('.library-grid')?.classList.toggle('library-cover-grid',value==='covers');
    document.querySelectorAll('.library-layout-toggle button').forEach(button=>button.setAttribute('aria-pressed',String(button.id==='library-layout-'+value)));
    if(anchor&&top!==undefined)window.scrollBy(0,anchor.getBoundingClientRect().top-top);
  }},icon(name))));
}
function libraryResults(){
  if(S.libraryBookMode||S.libraryTopic!=='all')return libraryBookResults();
  const rr=filteredResources(),key=JSON.stringify([S.type,S.route,S.age,S.search,S.favoriteOnly,S.sharedOnly,S.materialStatus]);
  if(key!==S.libraryKey){S.libraryKey=key;S.libraryLimit=18;}
  const visible=matchMedia('(max-width:900px)').matches?rr.slice(0,S.libraryLimit):rr;
  return h('div',{class:'library-results'},h('div',{class:'library-results-head'},h('p',{class:'result-count',role:'status'},rr.length+' 个素材 · '+rr.filter(r=>sharedRoutes(r).length>1).length+' 个多路线共用'+(rr.some(r=>r.custom)?' · '+rr.filter(r=>r.custom).length+' 个个人新增':'')),libraryLayoutToggle()),
    rr.length?h('div',{class:'resource-grid library-grid'+(S.libraryLayout==='covers'?' library-cover-grid':'')},visible.map(libraryCard)):h('div',{class:'empty'},h('p',{},S.route==='other'?'这里记录你额外选用的绘本。点击标题右侧＋新增，或调整现有筛选。':'没有匹配的素材，换个关键词或筛选条件试试。'),btn('清除筛选','clear-filters',{},'button soft')),
    visible.length<rr.length?h('div',{class:'load-more'},h('p',{role:'status'},'已显示 '+visible.length+' / '+rr.length+' 个素材'),btn('再看 18 个素材','library-more',{},'button')):null);
}
let libraryCollection='all';
function libraryCollectionTabs(){return h('div',{class:'toolbar hello-collection-tabs',role:'group','aria-label':'素材集合'},[['all','全部素材'],['hello','Hello 杂志']].map(([id,label])=>h('button',{type:'button',class:'button'+(libraryCollection===id?' primary':''),'aria-pressed':String(libraryCollection===id),onclick:()=>{libraryCollection=id;history.replaceState(null,'','#library'+(id==='hello'?'?collection=hello':''));render();document.querySelector('.hello-collection-tabs [aria-pressed="true"]')?.focus({preventScroll:true});}},label)));}
function libraryView(){
  if(libraryCollection==='hello')return h('div',{class:'library-view'},libraryCollectionTabs(),window.EnglishHello.render(window.ROADMAP_RAW.helloReading,{h,asset}));
  const options=(key,entries,id)=>h('div',{class:'library-filter-choices'},entries.map(([value,label])=>h('button',{type:'button','aria-pressed':String(S[key]===value),onclick:()=>libraryFilterApply(key,value,id+'-toggle')},label)));
  const types=[['all','全部类型'],...Object.entries(TYPES)];
  const refineLabel='类型与阅读状态'+(S.type!=='all'?' · '+TYPES[S.type]:'')+(S.materialStatus!=='all'?' · '+P.STATUS[S.materialStatus]:'');
  const searchInput=h('input',{id:'library-search',type:'search',value:S.search,placeholder:'搜索名称、级别、英文名','aria-label':'搜索素材',oninput:e=>{
    if(e.isComposing)return;S.search=e.target.value;document.querySelector('.library-results')?.replaceWith(libraryResults());updateLibraryUsageToggle();document.getElementById('library-search-panel-toggle')?.classList.toggle('active',!!S.search);
  },oncompositionend:e=>{S.search=e.target.value;document.querySelector('.library-results')?.replaceWith(libraryResults());updateLibraryUsageToggle();document.getElementById('library-search-panel-toggle')?.classList.toggle('active',!!S.search);}});
  const usage=h('button',{id:'library-usage-toggle',type:'button',class:'library-filter-button',onclick:()=>setLibraryUsageOpen(!libraryUsageExpanded())},h('span',{'aria-hidden':'true',class:'library-usage-symbol'},'＋'));
  const result=h('div',{class:'library-view'},libraryCollectionTabs(),heading('THE MATERIAL LIBRARY','每一份素材，都有来处','把绘本、分级、动画和儿歌分开看，也能追踪同一套资料在不同路线中的位置。',h('div',{class:'library-heading-actions'},btn('＋','custom-book-new',{id:'library-add-book','aria-label':'新增其他素材',title:'新增零散绘本等个人素材'},'icon-button'),btn([icon('heart'),S.favoriteOnly?'查看全部':'我的收藏'],'favorites',{},S.favoriteOnly?'button soft':'button'))),
    h('div',{class:'library-filterbar',role:'group','aria-label':'素材筛选与显示'},
      libraryPopover('library-route','按路线筛选：'+(S.route==='all'?'全部路线':(S.route==='other'?'其他':routes.get(S.route).name)),S.route==='all'?'路线':S.route==='other'?'其他':routes.get(S.route).name,options('route',[['all','全部路线'],...C.routes.map(r=>[r.id,r.name]),['other','其他']],'library-route'),S.route!=='all'),
      libraryStageFilter(),
      libraryTopicFilter(),
      btn([icon('network'),h('span',{class:'library-filter-text'},'多路线共用')],'shared-filter',{id:'library-shared-filter','aria-label':'仅看多路线共用','aria-pressed':String(S.sharedOnly),title:'仅看多路线共用'},'library-filter-button'+(S.sharedOnly?' active':'')),
      libraryPopover('library-kind',refineLabel,icon('settings'),h('div',{class:'library-refine'},
        h('label',{},'素材类型',h('select',{id:'library-type-filter','aria-label':'素材类型',onchange:e=>libraryFilterApply('type',e.target.value,'library-kind-toggle')},types.map(([value,label])=>h('option',{value,selected:S.type===value},label)))),
        h('label',{},'阅读状态',h('select',{id:'library-status-filter','aria-label':'按套系状态筛选',onchange:e=>libraryFilterApply('materialStatus',e.target.value,'library-kind-toggle')},[['all','全部状态'],...Object.entries(P.STATUS)].map(([value,label])=>h('option',{value,selected:S.materialStatus===value},label)))),
        btn('清除全部筛选','clear-filters',{},'text-link')),S.type!=='all'||S.materialStatus!=='all'),
      libraryPopover('library-search-panel','搜索素材',icon('search'),h('div',{class:'library-search-box'},searchInput),!!S.search),usage,
      libraryPopover('library-info','素材图例与说明',icon('info'),h('div',{},h('p',{},h('span',{class:'library-series-name shared-material'},'共用套系名称'),'加粗；单条路线独有的套系名称使用正常字重。图鉴按该套系全部路线判断，阶段对照只按当前同排关联阶段判断；单本标题的粗体仅表示标题层级。卡片边框不表示主辅线。'),materialLegend(),h('p',{},'以上颜色用于展开后的具体路线与阶段用途；同一套系在不同路线中可以有不同用途。路线名旁的色点只区分作者。'),h('p',{},libraryReferenceCount(22),' 表示原书单有22处阶段引用，非册数或已完成数；数字图标仅作信息。带边框及右箭头的状态按钮可点击查看进展，普通文字及数字标记不可点击。'),h('p',{},'许密杉、庆爸素材的状态由各路线阶段记录自动汇总，点击可查看明细；其他素材按记录的完成数量计算。状态色只表示未开始、进行中或已完成，与主辅线无关。列表与封面视图共用全部图例、筛选和记录。'),h('p',{},'路线、阶段和主题可组合筛选到具体书名；类型和套系阅读状态收在筛选图标中。主题依已读取的内容简介、内页或分类图核对，待核对书目不参与主题匹配；一本书可有多个主题，不改变原作者阶段要求。'),bookCoverage(),btn([icon('calendar'),'年龄关联索引'],'age-index',{},'text-link'),btn('清除全部筛选','clear-filters',{},'text-link')))),libraryResults());
  updateLibraryUsageToggle(usage);
  return result;
}
function relationNodes(r){const left=C.routes.map(route=>{const ap=r.appearances.filter(a=>a.routeId===route.id);return ap.length?{kind:'route',id:route.id,title:route.name,sub:ap.length+' 处引用 · '+ap.map(a=>shortStage(stages.get(a.stageId)||{title:a.stageId})).filter((x,i,a)=>a.indexOf(x)===i).join(' / '),color:route.color}:null;}).filter(Boolean);let rel=C.relationships.filter(e=>e.from===r.id||e.to===r.id);if(S.relationMode==='pair')rel=rel.filter(e=>e.type==='pair');const related=[];for(const e of rel){const id=e.from===r.id?e.to:e.from;if(id===r.id||!byId.has(id))continue;if(!related.some(x=>x.id===id))related.push({kind:'resource',id,title:byId.get(id).title,sub:e.label||'原文同阶段组合',type:e.type,edge:e});}return {left,related};}
function relationGraph(r){const {left,related}=relationNodes(r);const page=S.relationPage;const right=related.slice(page*4,page*4+4);const canvas=h('div',{class:'graph-canvas',style:{height:'490px'}});const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 490');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('class','relation-lines');const node=(x,y,item)=>{const b=btn([h('small',{},item.kind==='route'?'出现于这条路线':'与此素材的关系'),h('strong',{},item.kind==='route'?h('span',{class:'dot',style:{'--route':item.color}}):null,item.title),h('small',{class:'edge-label'},item.sub)],item.kind==='route'?'resource-route':'graph-focus',{'data-id':r.id,'data-route':item.id,'data-resource':item.id,style:{left:x+'%',top:y+'px'}},'graph-node');return b;};const path=(d,dashed=false)=>{const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);if(dashed)p.setAttribute('class','inferred');svg.append(p);};left.forEach((it,i)=>{const y=left.length===1?245:105+i*280/(left.length-1);path('M 215 '+y+' C 285 '+y+',285 245,320 245');canvas.append(node(15,y,it));});right.forEach((it,i)=>{const y=right.length===1?245:85+i*320/(right.length-1);path('M 480 245 C 530 245,515 '+y+',585 '+y,it.type==='reference');canvas.append(node(85,y,it));});canvas.prepend(svg);canvas.append(h('span',{class:'graph-label',style:{left:'5%'}},'路线中的位置'),h('span',{class:'graph-label',style:{right:'5%'}},S.relationMode==='pair'?'分级与动画原文组合':'配套 / 前后衔接'),btn([h('small',{},TYPES[r.type]+' · 中心素材'),h('strong',{},r.title),h('small',{},'点击查看完整套系与全部出处')],'resource',{'data-id':r.id,style:{left:'50%',top:'245px'}},'graph-node focus'));if(!right.length)canvas.append(h('span',{class:'graph-label',style:{right:'5%',top:'245px'}},'此来源未给出逐项配对'));return {canvas,left,related,right};}
function mobileRelations(r,g){
  return h('section',{class:'mobile-relations','aria-label':'素材关联列表'},h('div',{class:'relation-center'},h('small',{},'当前中心素材'),btn([h('strong',{},r.title),icon('chevron')],'resource',{'data-id':r.id},'detail-resource-row'),h('p',{},g.left.length+' 条路线 · '+g.related.length+' 个关联素材')),
    readingFold('relation-routes-'+r.id,'出现在哪些路线 · '+g.left.length,g.left.map(it=>btn([h('span',{},routeChip(it.id),h('small',{},r.appearances.filter(a=>a.routeId===it.id).length+' 处阶段引用 · 查看级别与用途')),icon('chevron')],'resource-route',{'data-id':r.id,'data-route':it.id},'detail-resource-row')),true),
    readingFold('relation-resources-'+r.id,'组合与前后衔接 · '+g.related.length,g.related.length?g.related.map(it=>btn([h('span',{},h('strong',{},it.title),h('small',{},it.sub)),icon('chevron')],'graph-focus',{'data-resource':it.id},'detail-resource-row')):h('p',{class:'small-note'},'当前资料未提供对应组合。')));
}
function relationsView(){if(S.relationMode==='age')return ageView();if(S.relationMode==='reading')return readingView();let candidates=C.resources.filter(r=>S.relationMode!=='pair'||r.type==='reader'||r.type==='book');let r=byId.get(S.focus)||findResource(['SSS'])||candidates[0];if(!candidates.some(x=>x.id===r.id))r=candidates[0];S.focus=r.id;const g=relationGraph(r);return h('div',{},heading('CONNECT THE DOTS','把路线和素材连起来','点一份素材，追踪它在哪些阶段出现、如何与分级或动画配合。'),h('div',{class:'relation-controls'},relationTabs(),h('label',{class:'relation-focus-select',for:'graph-select'},h('span',{class:'relation-filter-label'},'中心素材'),h('select',{id:'graph-select',class:'graph-select','aria-label':'选择关系中心素材',title:r.title+' · '+TYPES[r.type],onchange:e=>{S.focus=e.target.value;S.relationPage=0;render();}},candidates.map(x=>h('option',{value:x.id,selected:x.id===r.id},x.title+' · '+TYPES[x.type]))))),h('div',{class:'graph-legend'},h('span',{},h('i',{class:'line-sample'}),'原文同阶段组合 / 同素材出处'),h('span',{},h('i',{class:'line-sample dashed'}),'参考性关联（如有）')),mobileRelations(r,g),h('div',{class:'relationship-layout'},h('section',{class:'graph-panel','aria-label':r.title+'的关联图'},g.canvas),h('aside',{class:'relation-aside'},h('section',{class:'panel'},h('h3',{},r.title),h('p',{},g.left.length+' 条路线引用 · '+g.related.length+' 个关联素材'),h('p',{},'实线表示资料明确的同阶段组合或同素材引用，不表示相同听力难度。'),btn(['完整套系 ',icon('arrow')],'resource',{'data-id':r.id},'text-link'),g.related.length>4?h('div',{class:'toolbar',style:{marginTop:'14px'}},btn('上一组','graph-page',{'data-delta':-1,disabled:S.relationPage===0}),h('span',{class:'filter-label'},(S.relationPage+1)+' / '+Math.ceil(g.related.length/4)),btn('下一组','graph-page',{'data-delta':1,disabled:(S.relationPage+1)*4>=g.related.length})):null),h('section',{class:'panel'},h('h3',{},'沿着关系继续探索'),h('div',{class:'relation-summary'},g.right.map(it=>btn([it.title,h('br'),h('small',{},it.sub)],'graph-focus',{'data-resource':it.id},''))),h('p',{class:'small-note'},'同阶段是材料组合，原文未给每本书与动画单集的一对一匹配。')))),section('这份素材在各路线中的完整位置','每次出现保留原文级别与用途。'),h('div',{class:'match-page-grid'},C.routes.map(route=>{const ap=r.appearances.filter(a=>a.routeId===route.id);return readingFold('relation-position-'+r.id+'-'+route.id,routeChip(route.id),ap.length?ap.map(a=>materialStageLink(r,a)):h('p',{class:'small-note'},'这份资料中未见明确引用。'));})));}
function relationTabs(){const tabs=[['resource','路线 × 素材'],['pair','绘本 / 分级 × 动画'],['age','年龄关联'],['reading','分级难度参考']];return h('div',{class:'toolbar relation-tabs'},h('label',{class:'mobile-relation-select'},h('span',{class:'relation-filter-label'},'查看关系'),h('select',{'aria-label':'关系查看方式',title:tabs.find(([id])=>id===S.relationMode)?.[1],onchange:e=>{S.relationMode=e.target.value;S.relationPage=0;render();}},tabs.map(([id,label])=>h('option',{value:id,selected:S.relationMode===id},({resource:'路线 × 素材',pair:'绘本 × 动画',age:'年龄关联',reading:'分级难度'})[id])))),h('div',{class:'segmented'},[['resource','路线 × 素材'],['pair','绘本 / 分级 × 动画'],['age','年龄关联'],['reading','分级难度参考']].map(([id,label])=>btn(label,'relation-mode',{'data-mode':id,'aria-pressed':S.relationMode===id},S.relationMode===id?'active':''))));}
function ageView(){const banana=routes.get('banana');return h('div',{},heading('AGE IS A REFERENCE','按当前年龄选方案','用量、节奏、输出与自拼按当前年龄方案查看；能力阶段仍按实际理解判断。'),relationTabs(),h('div',{class:'notice'},icon('info'),'香蕉妈妈按开始启蒙的年龄提供时间表；许密杉未标年龄；庆爸这份版本面向 3–4 岁。三者不能直接按月龄强行对齐。'),h('div',{class:'age-grid'},C.routes.map(r=>h('section',{class:'age-card'},h('h3',{},routeChip(r.id)),h('p',{},r.id==='banana'?ageCaseLabel('banana')+'。'+ageCaseNotice('banana'):r.id==='xu'?'这三份许密杉资料均未标固定年龄。六阶段表词数为积累目标，全景图词数仅保留原节点标签；阶段执行表每阶段3个月是计划用时，均不换算成月龄门槛。':'整套常规路线适用 3–4 岁，阶段间用时间和新版 Phase 测试衔接。'),btn(['查看年龄与阶段 ',icon('arrow')],'stage',{'data-id':rec().routeStages[r.id]||r.stages[0].id},'text-link')))),section('香蕉妈妈 · 当前年龄方案的完整安排',ageCaseLabel('banana')+'；其他年龄计划在详情中作为参考收纳。'),h('div',{class:'age-grid'},banana.stages.map(st=>readingFold('age-stage-'+st.id,h('strong',{},st.title),h('div',{},h('p',{},st.goal),h('div',{class:'stage-resource-tags'},currentSchedules(st).map(sc=>btn(String(sc.ageGroup||'年龄安排')+' · '+String(sc.duration||''),'stage',{'data-id':st.id},''))),btn('看素材与时间表 →','stage',{'data-id':st.id},'text-link'))))),section('独立参考 · 书籍年龄路线概览','原图未能确认作者，保留独立出处，不作为必须达到的年龄进度。'),h('section',{class:'panel'},btn(h('img',{class:'reference-preview',src:asset(sourcePage('age',1)?.path),alt:'书籍年龄路线概览原图',loading:'lazy'}),'preview',{'data-source':'age','data-page':1},'card-view-btn'),sourceBtn('age',1,'放大原始年龄图'),ageIndexRows(),h('div',{class:'links-inline'},(C.ageComparison?.rows||[]).map(row=>{const name=row.title;const r=findResource([name]);return r?btn(name,'resource',{'data-id':r.id},'chip'):null;}))));}
function ageIndexRows(){const rows=C.ageComparison.rows;return h('div',{class:'age-grid',style:{marginTop:'20px'}},rows.map(row=>{const r=byId.get(row.resourceIds?.[0])||findResource([row.title]);return readingFold('age-resource-'+row.title,h('span',{class:'age-detail-heading'},h('strong',{},row.title),h('span',{class:'chip'},row.suggestedAge||'')),h('div',{},h('p',{},row.description),h('p',{class:'small-note'},EnglishModel.getLevelSummary(row.levels,r).join(' / ')),r?btn('查看对应套系与路线 →','resource',{'data-id':r.id},'text-link'):sourceBtn('age',1,'原图套系位置')));}));}
function readingView(){const cmp=window.ROADMAP_RAW.qing.supplement;const rows=cmp.rows;const current=rows.find(r=>r.raz===S.readingLevel)||rows[1];const idx=rows.findIndex(r=>r.raz===current.raz);const covers=Object.entries(cmp.mergedCellCoverage).map(([name,items])=>({name,levels:items.filter(it=>idx>=rows.findIndex(r=>r.raz===it.fromRAZ)&&idx<=rows.findIndex(r=>r.raz===it.toRAZ)).map(it=>it.level)})).filter(it=>it.levels.length);return h('div',{},heading('READING LEVEL REFERENCE','阅读难度，单独对照','RAZ、牛津树、海尼曼、大猫等映射来自补充原图；阅读分级与听力词汇分开查看。'),relationTabs(),h('div',{class:'notice'},icon('info'),'这是阅读难度参考表。AR、Lexile、年级与级别范围不能直接换算为听力词数，也不能据此给当前宝宝定级。'),h('div',{class:'toolbar'},h('label',{class:'filter-label',for:'reading-select'},'选择原图中的 RAZ 行'),h('select',{id:'reading-select',onchange:e=>{S.readingLevel=e.target.value;render();}},rows.map(row=>h('option',{value:row.raz,selected:row.raz===current.raz},'RAZ '+row.raz+' · '+row.grade)))),h('section',{class:'panel'},h('h3',{},'RAZ '+current.raz+' 所在行与原图合并范围'),h('div',{class:'fact-grid'},fact('原图年级（非宝宝年龄）',current.grade),fact('Lexile（按原图）',current.lexile),fact('AR',current.ar),fact('GRL',current.grl)),h('div',{class:'age-grid',style:{marginTop:'18px'}},covers.map(it=>{const r=findResource([it.name]);return h('div',{class:'age-card'},h('h4',{},it.name),h('p',{},EnglishModel.getLevelSummary(it.levels,r).join(' / ')),r?btn('追踪套系与路线 →','resource',{'data-id':r.id},'text-link'):sourceBtn('reading',1,'看原图位置'));})),h('p',{class:'small-note'},'按原图单元格的覆盖范围显示，可能同时覆盖多个级别；保留这种重叠，不作精确等号。')),section('回看整张难度对照表','放大查看原图，核对上下文与合并单元格。'),h('section',{class:'panel'},btn(h('img',{class:'reference-preview',src:asset(sourcePage('reading',1)?.path),alt:'常见英文分级读物难度对照表',loading:'lazy'}),'preview',{'data-source':'reading','data-page':1},'card-view-btn'),sourceBtn('reading',1,'放大完整阅读对照图')),h('p',{class:'small-note'},cmp.attribution));}
function sourceReview(s){
  const review=s.raw?.review;if(!review)return null;
  return readingFold('source-review-'+s.id,'逐项核对结果 · '+review.findings.length+' 项',h('div',{},
    h('p',{class:'small-note'},s.raw.author+' · 发布：'+s.raw.publishedAt.slice(0,10)+' · 核对：'+s.raw.checkedAt),
    h('p',{},s.raw.description),
    review.findings.map(item=>h('section',{class:'detail-section'},h('h4',{},item.title),h('p',{},item.text),
      item.pages.map(page=>sourceBtn(s.id,page,'笔记第'+page+'张')),
      item.primaryPages.map(page=>sourceBtn(review.primarySourceId,page,'PDF第'+page+'页'))))),false,'source-review');
}
function sourcesView(){return h('div',{},xuVerification(),heading('BACK TO THE ORIGINAL','每一步，都能回看原文',C.sources.length+' 份来源，逐页预览保存在本地；资料未提供的封面、分册清单和媒体文件不补造。'),
  h('div',{class:'sources-grid'},C.sources.map(s=>h('article',{class:'source-card'},
    h('div',{class:'source-card-head'},h('div',{class:'eyebrow'},s.raw?.kind==='community-note'?'第三方图文参考':s.id==='sss-playlists'?'补充歌单':s.id==='age'||s.id==='reading'?'独立补充参考':'原作者路线'),h('h3',{},s.title),h('p',{},s.note||'')),
    sourceReview(s),
    readingFold('source-pages-'+s.id,'来源说明与 '+s.previews.length+' 页预览',h('div',{class:'source-thumbs'},s.previews.map(p=>btn([h('img',{src:asset(p.path),alt:s.title+'第'+p.page+'页',loading:'lazy'}),h('span',{},s.previews.length>1?'第 '+p.page+' 页':'原图')],'preview',{'data-source':s.id,'data-page':p.page},''))),false,'source-pages'),
    h('div',{class:'source-card-actions'},sourceBtn(s.id,1,'逐页放大查看'),h('a',{class:'text-link',href:asset(s.file),target:'_blank',rel:'noopener'},icon('expand'),s.raw?.kind==='community-note'?'打开原笔记':'打开原始文件'))))),
  h('p',{class:'small-note'},'许密杉原六阶段组合表 PDF 第 2 页只有署名水印，无路线内容；许密杉阶段执行表 PDF 共 4 页，配套思维导图是同一计划的图解。香蕉妈妈 PDF 第 9、10 页重复。所有页面均保留，方便核对。'));
}
function openModal(kind,id,context={}){
  if(!S.modal){lastFocus=document.activeElement;modalTrail.length=0;}
  else if(S.modal.kind!==kind||S.modal.id!==id){const active=document.activeElement;modalTrail.push({modal:{...S.modal},scroll:overlay.querySelector('.detail')?.scrollTop||0,filters:[S.songCategory,S.songScene,S.songSearch],focus:active?.id?{id:active.id}:active?.dataset.action?{dataset:{...active.dataset}}:null});}
  S.modal={kind,id,...context};renderModal();document.body.style.overflow='hidden';overlay.querySelector('button,input,select')?.focus({preventScroll:true});
}
function backModal(){
  if(overlay.querySelector('.practice-form[data-dirty="true"]')&&!window.confirm('这条记录尚未保存，确定放弃本次输入？'))return;
  const previous=modalTrail.pop();if(!previous)return;
  S.modal=previous.modal;[S.songCategory,S.songScene,S.songSearch]=previous.filters;renderModal();
  const focus=previous.focus;const target=focus?.id?document.getElementById(focus.id):focus?.dataset?Array.from(overlay.querySelectorAll('[data-action]')).find(node=>Object.entries(focus.dataset).every(([key,value])=>node.dataset[key]===value)):null;
  (target||overlay.querySelector('button'))?.focus({preventScroll:true});overlay.querySelector('.detail')?.scrollTo(0,previous.scroll);
}
function closeModal(){if(overlay.querySelector('.practice-form[data-dirty="true"]')&&!window.confirm('这条记录尚未保存，确定放弃本次输入？'))return false;modalTrail.length=0;S.modal=null;overlay.replaceChildren();if(!S.preview)document.body.style.overflow='';(lastFocus?.isConnected?lastFocus:document.getElementById(lastFocus?.id)||document.getElementById(S.view==='baby'?'vocabulary-add-toggle':'practice-search'))?.focus({preventScroll:true});return true;}
function detailShell(label,content){return h('div',{class:'modal-backdrop','data-action':'backdrop'},h('section',{class:'detail',role:'dialog','aria-modal':'true','aria-label':label},h('header',{class:'detail-head'},modalTrail.length?btn('← 返回','modal-back',{'aria-label':'返回上一层'},'text-link modal-back'):null,h('span',{},label),btn(icon('close'),'close',{'aria-label':'关闭详情'},'icon-button')),h('div',{class:'detail-content'},content)));}
function fact(label,text){return text?h('div',{class:'fact'},h('small',{},label),text):null;}
function textValue(value){if(value===null||value===undefined)return '';if(Array.isArray(value))return value.map(textValue).join('；');if(typeof value==='object')return Object.values(value).map(textValue).join(' · ');return String(value);}
function scheduleBlocks(st){
  const labels={ageGroup:'原表年龄方案',startMonth:'开始时间',time:'从零起点经过的时间',fictionNonfictionRatio:'虚构 / 非虚构比例',nonfictionFlexibility:'非虚构安排',minimumAgeMonths:'原表最早月龄（仅参考）',duration:'本阶段用时',daily:'每日投入',gradedCount:'分级数量',storyCount:'故事数量',weekPlan:'周安排',audio:'音频安排',output:'输出安排',plan:'使用安排',method:'方法',notes:'原文说明',target:'目标'};
  const current=currentSchedules(st),others=st.schedules.filter(sc=>!current.includes(sc));
  const block=(sc,selected)=>h('details',{class:'series-block',open:selected,'data-age-case':sc.ageCaseId||'', 'data-current-age-case':String(selected)},h('summary',{},h('strong',{},String(sc.ageGroup||'原文计划')+' · '+String(sc.duration||'原文计划'))),h('div',{class:'fact-grid'},Object.entries(labels).filter(([k])=>sc[k]!==undefined&&sc[k]!==null&&sc[k]!=='').map(([k,label])=>fact(label,textValue((sc.caseText||{})[k]||sc[k])+(k==='gradedCount'?(sc.gradedCountQualifier||'册'):k==='storyCount'?(sc.storyCountQualifier||'本'):k==='minimumAgeMonths'?'个月':'')))),sourceBtn(st.sourceId||st.routeId,sc.sourcePage||st.pages[0]||1,'查看这组年龄计划原页'));
  return h('div',{},ageCaseLabel(st.routeId)?h('p',{class:'small-note'},ageCaseLabel(st.routeId)):null,ageCaseNotice(st.routeId)?h('p',{class:'small-note'},ageCaseNotice(st.routeId)):null,current.map(sc=>block(sc,true)),others.length?readingFold('other-age-cases-'+st.id,'其他年龄方案 · 仅供参考',others.map(sc=>block(sc,false)),false,'other-age-cases'):null);
}

function activityBlocks(st){
  if(!st.activities?.length)return null;
  return h('section',{class:'detail-section original-activities'},h('h3',{},st.variantId==='xu-current'?'同阶段素材与方法 · '+st.activities.length+' 项':st.variantId==='xu-thousand'?'原文执行安排 · '+st.activities.length+' 项':'原图分支与方法 · '+st.activities.length+' 项'),h('p',{class:'small-note'},st.variantId==='xu-current'?'依据全景图整理；闪卡和闪卡式绘本在起步阶段并行，具体频率随孩子兴趣调整。':'以下为对应资料的原文内容；未标频率、时长的项目保持空缺。'),st.activities.map((a,i)=>h('article',{class:'original-activity'},h('h4',{},h('span',{},String(i+1).padStart(2,'0')),a.title),h('div',{class:'activity-meta'},a.frequency?h('span',{},'频率：'+a.frequency):null,a.minutes?h('span',{},a.minutes):null),h('p',{class:'stage-detail-text'},a.method||a.description||''),h('div',{class:'stage-resource-tags'},stageMaterials(st).filter(item=>(a.resourceIds||a.materials||[]).some(id=>item.resource.id===id||item.resource.id===C.rawToCanonical['xu:'+id])).map(materialTag)),(a.notes||[]).map(n=>h('p',{class:'small-note'},n)))));
}
function stageDetail(st){
  if(!st)return h('p',{},'未找到这个阶段。');
  const route=routes.get(st.routeId),variant=stageVariant(st),plan=EnglishModel.getRoutePlan(C,st.routeId,S.routeDomain,S.profile),all=plan?.stages.some(s=>s.id===st.id)?plan.stages:variant?.stages||route.stages,sequence=st.group?all.filter(x=>x.group===st.group):all,index=sequence.findIndex(x=>x.id===st.id),prev=sequence[index-1],next=sequence[index+1],groups={};
  for(const item of stageMaterials(st)){const key=item.role.label;(groups[key]||(groups[key]=[])).push(item);}
  return h('div',{},h('div',{class:'chips'},routeChip(route.id),variant?h('span',{class:'chip version-tag'},variant.label):null,h('span',{class:'chip'},stageName(st))),h('h2',{style:{marginTop:'14px'}},st.title),stageGoal(st),
    h('div',{class:'stage-comparison-entry'},compareAction(st,'查看这个节点与其他路线的对应')),
    stageSongLink(st),
    h('div',{class:'fact-grid'},fact(st.variantId==='xu-current'?'起步／浏览建议':'原文准入',st.entry),fact('原文进阶标准',st.exit),fact('原计划用时',st.duration),fact('原文建议投入',st.hours),fact('年龄方案',stageAgeLabel(st))),
    st.routeId==='qing'?h('p',{class:'small-note'},'这里的词数为阶段积累目标；Phase 为小小优趣新版测试。素材里的成长计划 Phase 另算，不能相互替代。'):st.routeId==='xu'&&(!st.variantId||st.variantId==='xu-listening')?h('p',{class:'small-note'},'目标词数来自原表“目的”栏；原表没有给出刚性准入线或年龄门槛。'):null,
    st.variantId==='xu-thousand'?h('p',{class:'original-plan-note'},'这是许密杉路线的原阶段执行表，包含认读、书写等任务。每阶段3个月及每日用量保留原文，不自动作为'+namePart()+'当前的日程。'):null,
    st.notes.length?h('section',{class:'detail-section'},h('h3',{},st.variantId==='xu-current'?'素材与整理说明':'原文方法与补充说明'),h('ul',{},st.notes.map(n=>h('li',{},n)))):null,
    activityBlocks(st),
    st.schedules.length?h('section',{class:'detail-section'},h('h3',{},'当前年龄方案 · 原文执行安排'),scheduleBlocks(st)):null,
    h('section',{class:'detail-section stage-material-list'},h('h3',{},'全部素材 · '+stageMaterials(st).length+' 项'),materialLegend(),Object.entries(groups).map(([label,items])=>h('div',{class:'stage-material-group'},h('h4',{},label+' · '+items.length),items.map(item=>{const {material:m,resource:r,role}=item;return h('div',{},btn([h('span',{},h('span',{class:'material-label'},materialLabel(item)),h('small',{},[TYPES[r.type],roleLabel(m.role),'第 '+Array.from(new Set(item.materials.map(material=>material.page||st.pages[0]||1))).join('、')+' 页'].filter(Boolean).join(' · '))),icon('chevron')],'resource',{'data-id':r.id,'data-material-role':role.kind,title:role.basis},'detail-resource-row material-role-'+role.kind),materialEvidenceFold('stage-role-'+st.id+'-'+r.id+'-'+items.indexOf(item),role,r.title));})))),
    h('section',{class:'detail-section'},h('h3',{},'来源核对'),stageSourceLinks(st),st.variantId==='xu-thousand'?sourceBtn('xu-thousand-map',1,'同一计划的四阶段图解'):null,h('p',{class:'small-note'},st.variantId==='xu-current'?'本节点是网站整理视图；听力节点与级别来自全景图，SSS另引六阶段表，分别回看。':st.variantId&&st.variantId!=='xu-listening'?'本节点保留对应资料的原文目标、级别与执行安排。':'具体选材按本阶段原文要求执行，不由用途标签推定全套必读。')),
    h('section',{class:'detail-section'},h('h3',{},'对应资料的完整说明'),h('ul',{},(variant?.notes||route.notes).map(n=>h('li',{},n))),st.routeId==='qing'?accounting():null),
    h('nav',{class:'detail-nav','aria-label':st.group?'浏览同领域节点':'浏览前后阶段'},prev?btn(['← ',prev.title],'stage',{'data-id':prev.id}):h('span'),next?btn([next.title,' →'],'stage',{'data-id':next.id}):null));
}
function accounting(){const t=window.ROADMAP_RAW.qing.timeAccounting;return h('details',{class:'series-block'},h('summary',{},'有效听力时间如何折算（原文）'),h('div',{class:'small-note'},h('p',{},t.formula),t.audioFactors.map(x=>h('p',{},x.level+'：音频 × '+x.factor+(x.note?'，'+x.note:''))),h('p',{},t.invalidRule),h('p',{},t.environment),t.cumulativeThresholds.map(x=>h('p',{},x.at+'：累计至少 '+x.minHours+'H，且'+x.additional))),sourceBtn('qing',3,'核对时间折算原页'));}
function detailRows(r){
  const out=[];
  for(const raw of r.raw||[]){
    const routeId=raw.sourceId||(raw.preview==='assets/previews/banana-age.jpg'?'age':raw.id?.startsWith('banana-')?'banana':raw.id?.startsWith('qing-')?'qing':raw.id?.startsWith('xu-')?'xu':null);
    const level=levelText(raw.levels||raw.level,r),title=[level&&level!==r.title?level:'',raw.publisher].filter(Boolean).join(' · ')||'原文补充说明';
    const fields=[],values=[];
    for(const key of ['description','count','publisher','audio','ar','lexile','notes','bookTitles','books','titles','mappings','details']){
      const v=raw[key];if(v===undefined||v===null||v===''||Array.isArray(v)&&!v.length)continue;
      const labels={description:'介绍',publisher:'版本 / 出版社',audio:'音频 / 点读',ar:'AR',lexile:'Lexile',count:'原文数量',notes:'备注',bookTitles:'分册',books:'分册',titles:'分册',mappings:'原图对应',details:'补充'};
      const value=key==='count'?levelText(textValue(v),r):textValue(v);values.push(value);fields.push(labels[key]+'：'+value);
    }
    if(!fields.length)continue;
    const text=fields.join('；'),ref={routeId,page:raw.sourcePage||raw.pages?.[0]||raw.page||1};
    const existing=out.find(x=>x.title===title&&x.text===text);
    if(existing){if(!existing.refs.some(x=>x.routeId===ref.routeId&&x.page===ref.page))existing.refs.push(ref);}
    else out.push({title,text,values,refs:[ref]});
  }
  return out;
}
function resourceVersionDetails(r){
  const rows=detailRows(r),details=(r.details||[]).filter(d=>['同套系版本关系','关联边界','补充图建议年龄','原文难度参考','来源说明','资料备注'].includes(d.label));
  const extra=details.filter(d=>{const row=rows.find(row=>row.values.includes(d.text));if(!row)return true;const ref={routeId:d.sourceId||d.routeId,page:d.page||1};if(ref.routeId&&!row.refs.some(x=>x.routeId===ref.routeId&&x.page===ref.page))row.refs.push(ref);return false;});
  const levels=EnglishModel.getLevelSummary(r.levels.filter(level=>!r.appearances.some(a=>levelText(a.level,r)===levelText(level,r))),r);
  if(!rows.length&&!extra.length&&!levels.length)return null;
  return h('section',{class:'detail-section resource-version-details'},h('h3',{},'版本与资料说明'),
    levels.length?h('p',{class:'small-note'},'原资料补充级别：'+levels.join(' / ')):null,
    rows.map(x=>h('div',{class:'resource-version-row'},rows.length>1||x.title!=='原文补充说明'?h('h4',{},x.title):null,h('p',{},x.text),
      h('div',{class:'links-inline'},x.refs.filter(ref=>ref.routeId&&src(ref.routeId)).map(ref=>sourceBtn(ref.routeId,ref.page,'核对'+(src(ref.routeId)?.title||'原文')+' · 第 '+ref.page+' 页'))))),
    extra.map(d=>h('div',{class:'resource-version-row'},h('h4',{},d.label),h('p',{},d.text),(d.sourceId||d.routeId)&&src(d.sourceId||d.routeId)?sourceBtn(d.sourceId||d.routeId,d.page||1,'核对来源'):null)));
}

function songLibraryEntry(resourceId){return h('section',{class:'song-entry'},h('div',{},h('strong',{},'SSS 分类歌单 · 42首'),h('p',{},'必备10首 / 推荐30首 / 大童12首 / 一天8首')),btn([icon('music'),'打开歌单与资源'],'sss-songs',{'data-id':resourceId},'button primary'));}
function songDone(song){return S.records[P.SONG+song.id]?.status==='done';}
function songCount(songs){return '当前 '+songs.length+' 首 · 已完成 '+songs.filter(songDone).length+' 首 · 全部 '+SSS.songs.filter(songDone).length+'/'+SSS.songs.length+' 首';}
function songCompletionLabel(song){return (songDone(song)?'已完成，点击撤回：':'标记已完成：')+song.title;}
function songListSongs(){return P.sortSongsByCompletion(EnglishModel.filterSongs(SSS,{category:S.songCategory,scene:S.songScene,query:S.songSearch}),S.records);}
function songResults(){
  const songs=songListSongs();
  return h('div',{id:'song-results'},h('p',{class:'result-count',role:'status','aria-live':'polite'},songCount(songs)),songs.length?h('ol',{class:'song-list'},songs.map((song,i)=>h('li',{class:'song-row'+(songDone(song)?' is-done':''),'data-song-id':song.id},
    h('div',{class:'song-marker'},btn(h('span',{class:'song-check'},icon('check')),'song-toggle',{'data-id':song.id,'aria-label':songCompletionLabel(song),'aria-pressed':String(songDone(song)),title:songCompletionLabel(song)},'song-complete'),h('span',{class:'song-number'},String(i+1).padStart(2,'0'))),
    song.cover?h('a',{href:song.url,target:'_blank',rel:'noopener noreferrer','aria-label':song.title+' 官方歌曲页'},h('img',{class:'song-cover',src:asset(song.cover),alt:song.title+' 官方预览图',loading:'lazy'})):null,
    h('div',{class:'song-info'},h('h3',{},song.title),h('div',{class:'chips'},SSS.categories.filter(c=>song.categories.includes(c.id)).map(c=>h('span',{class:'chip'+(c.id==='essential'?' song-essential':'')},c.label)),song.scene?h('span',{class:'chip song-scene'},song.scene):null),song.parentTip?h('p',{class:'small-note'},song.parentTip):null),
    h('div',{class:'song-links'},song.videoUrl?h('a',{class:'song-link-icon',href:song.videoUrl,target:'_blank',rel:'noopener noreferrer','aria-label':song.title+' 官方视频',title:'官方视频'},icon('play')):null,h('a',{class:'song-link-icon',href:song.url,target:'_blank',rel:'noopener noreferrer','aria-label':song.title+' 歌曲、歌词与活动',title:'歌曲 / 歌词 / 活动'},icon('music')))))):h('div',{class:'empty'},h('p',{},'没有匹配的歌曲，试试其他分类、场景或歌名。'),btn('清除歌单筛选','song-clear',{},'button soft')));
}
function refreshSongResults(){document.getElementById('song-results')?.replaceWith(songResults());}
function refreshSongCompletion(){
  const results=document.getElementById('song-results');if(!results)return;
  const focused=document.activeElement,scroller=results.closest('.detail-content'),scrollTop=scroller?.scrollTop;
  // 移动原有歌曲行，保留筛选、焦点、滚动位置及其余交互节点。
  for(const button of results.querySelectorAll('[data-action="song-toggle"]')){
    const song=SSS.songs.find(song=>song.id===button.dataset.id);
    button.setAttribute('aria-pressed',String(songDone(song)));button.setAttribute('aria-label',songCompletionLabel(song));button.title=songCompletionLabel(song);
    button.closest('.song-row').classList.toggle('is-done',songDone(song));
  }
  const songs=songListSongs(),list=results.querySelector('.song-list');
  if(list){
    const rows=new Map([...list.children].map(row=>[row.dataset.songId,row]));
    list.append(...songs.map((song,i)=>{const row=rows.get(song.id);row.querySelector('.song-number').textContent=String(i+1).padStart(2,'0');return row;}));
    if(results.contains(focused))focused.focus({preventScroll:true});
    if(scroller)scroller.scrollTop=scrollTop;
  }
  results.querySelector('.result-count').textContent=songCount(songs);
}
function songRouteLinks(){
  return readingFold('song-route-links','关联路线与使用阶段',h('div',{},songResources.flatMap(r=>r.appearances.map(a=>h('div',{class:'song-route-row'},h('div',{},routeChip(a.routeId),h('strong',{},stageLocation(stages.get(a.stageId))),levelText(a.level,r)?h('small',{},r.title+' · '+levelText(a.level,r)):null),h('div',{class:'song-route-actions'},btn('阶段详情','stage',{'data-id':a.stageId},'text-link'),compareAction(stages.get(a.stageId),'定位路线'))))),h('p',{class:'small-note'},'路线引用的是 SSS 系列；以下42首是补充选曲歌单。庆爸保留小小优趣 L1–3 的限定，单曲不自动对应该级别。')),false,'song-route-links');
}
function songFilters(){
  const categories=[{id:'all',label:'全部',songIds:SSS.songs},...SSS.categories];
  const search=h('input',{id:'song-search',type:'search',value:S.songSearch,placeholder:'英文歌名或生活场景','aria-label':'搜索 SSS 歌曲',oninput:e=>{S.songSearch=e.target.value;refreshSongResults();document.getElementById('song-search-panel-toggle')?.classList.toggle('active',!!S.songSearch);}});
  return h('div',{class:'song-filters song-compact-filters'},
    h('div',{class:'song-tabs',role:'group','aria-label':'歌单分类'},categories.map(c=>{
      const name=c.label.replace(/\d+首/,'');
      return btn(c.id==='all'?'全部':name+c.songIds.length,'song-category',{'data-category':c.id,'aria-label':name+'，'+c.songIds.length+'首',title:name+'，'+c.songIds.length+'首','aria-pressed':String(S.songCategory===c.id)},S.songCategory===c.id?'button primary':'button');
    })),
    h('div',{class:'song-filter-row'},
      h('select',{id:'song-scene','aria-label':'按生活场景筛选歌曲',onchange:e=>{S.songScene=e.target.value;refreshSongResults();}},['all',...SSS.scenes].map(scene=>h('option',{value:scene,selected:S.songScene===scene},scene==='all'?'全部场景':scene))),
      libraryPopover('song-search-panel','搜索歌曲',icon('search'),h('div',{class:'library-search-box'},search),!!S.songSearch),
      btn(icon('close'),'song-clear',{'aria-label':'清除歌单筛选',title:'清除歌单筛选'},'icon-button'),
      libraryPopover('song-filter-info','歌单筛选说明',icon('info'),h('div',{},h('p',{},'按你提供的图片整理，分类可以交叉；同一首歌只收录一次。'),h('p',{},'未完成在前，已完成在后；同一状态内保留原歌单顺序。“一天”按起床到摇篮曲排列；“大童”沿用图片分类，不作年龄或路线阶段门槛。')))));
}
function songLibrary(){const context=S.modal.stageId?stages.get(S.modal.stageId):null;return h('div',{class:'song-library'},context?h('div',{class:'song-context'},h('span',{},'来自：'+routes.get(context.routeId).name+' · '+stageName(context)),btn('回到这个阶段','stage',{'data-id':context.id},'text-link')):null,songRouteLinks(),h('div',{class:'song-heading'},h('div',{class:'eyebrow'},'SING, PLAY & REPEAT'),h('h2',{},'跟着歌单，把儿歌唱进生活')),songFilters(),songResults(),h('details',{class:'song-source'},h('summary',{},'歌单出处 · 查看6张原图'),h('p',{class:'small-note'},SSS.attribution),h('div',{class:'source-thumbs'},SSS.source.previews.map(p=>btn([h('img',{src:asset(p.path),alt:'SSS 歌单截图 '+p.page,loading:'lazy'}),h('span',{},'截图 '+p.page)],'preview',{'data-source':SSS.source.id,'data-page':p.page},'')))),h('p',{class:'small-note'},'资源入口来自 Super Simple 官方网站与视频；打开后可查看视频、歌词及配套活动，需要联网。'));
}
function resourceDetail(r){if(!r)return h('p',{},'未找到这个素材。');const rel=C.relationships.filter(e=>e.from===r.id||e.to===r.id);const related=Array.from(new Set(rel.map(e=>e.from===r.id?e.to:e.from))).filter(id=>byId.has(id)&&id!==r.id);const record=S.records[r.id]||{};return h('div',{},h('div',{class:'chips'},h('span',{class:'chip'},TYPES[r.type]||'其他')),h('h2',{style:{marginTop:'14px'}},r.title),r.aliases?.length?readingFold('aliases-'+r.id,'其他名称与写法',h('p',{},r.aliases.join(' / '))):null,resourceBookCatalog(r),publicationReference(r.id),songResourceIds.has(r.id)?songLibraryEntry(r.id):null,priceReference(r),resourceStatusControl(r,true),resourcePracticeSummary(r),seriesProgression(r),r.cover?readingFold('cover-'+r.id,'封面与图片出处',h('div',{},btn(h('img',{class:'detail-preview',src:asset(r.cover),alt:r.title+'，'+coverLabel(r)}),'resource-preview',{id:'resource-preview-'+r.id,'data-id':r.id,'aria-label':'放大查看'+r.title+'的图片','aria-haspopup':'dialog',title:'点击放大查看'},'detail-preview-trigger'),r.coverSource?h('p',{class:'small-note cover-attribution'},h('a',{href:r.coverSource.sourceUrl,target:'_blank',rel:'noopener noreferrer'},'图片出处 ↗'),' · '+(r.coverSource.kind==='series-example'?'套系示例封面；各阶段使用级别见上表。':r.coverSource.kind==='program'?'节目宣传图。':'素材参考图；具体版本以手头资料为准。')):null)):null,h('div',{class:'toolbar',style:{marginTop:'18px'}},btn([icon('heart'),S.favorites.includes(r.id)?'已收藏':'收藏素材'],'favorite',{'data-id':r.id},S.favorites.includes(r.id)?'button soft':'button'),btn([icon('network'),'查看关联地图'],'resource-graph',{'data-id':r.id},'button primary')),resourceVersionDetails(r),related.length?h('section',{class:'detail-section'},h('h3',{},'相关素材 · '+related.length),h('p',{class:'small-note'},'来自原文同阶段组合或上下阶段衔接，不是逐本与逐集配对。'),related.map(id=>btn([h('span',{},h('strong',{},byId.get(id).title),h('small',{},rel.find(e=>e.from===id||e.to===id)?.label||'原文同阶段组合')),icon('chevron')],'resource',{'data-id':id},'detail-resource-row'))):null,h('section',{class:'detail-section'},h('h3',{},'这份素材的小记录'),h('div',{class:'form-row'},h('label',{for:'resource-note'},'兴趣、已经用到的级别、下次想看的内容'),h('textarea',{id:'resource-note',maxlength:4000,placeholder:'例如：喜欢动物主题，今天读了……',oninput:e=>{S.records[r.id]=Object.assign({},S.records[r.id],{note:e.target.value});persist({delay:800});}},record.note||'')),h('p',{class:'small-note'},'自动保存在当前浏览器；单文件版与本地预览的记录分别保存。可在宝宝资料中导出备份。')));}
function activityDetail(index){const item=defaultChain()[index];const names=item.materialNames||[];return h('div',{},h('div',{class:'chips'},h('span',{class:'chip edited'},'整理建议'),h('span',{class:'chip'},String(item.minutes)+(typeof item.minutes==='number'?' 分钟':''))),h('h2',{style:{marginTop:'14px'}},item.title.replace(/^\d+\s*·\s*/,'')),h('p',{},item.description),names.some(name=>songResourceIds.has(findResource([name])?.id))?btn([icon('music'),'选择 SSS 儿歌 →'],'sss-songs',{'data-stage':item.stageId},'button soft'):null,h('section',{class:'detail-section'},h('h3',{},'可以这样做'),h('ul',{},(item.actionTips||[]).map(x=>h('li',{},x)))),h('section',{class:'detail-section'},h('h3',{},'对应素材'),names.map(name=>{const r=findResource([name]);return r?btn([h('span',{},h('strong',{},name),h('small',{},'查看套系、级别、原文和所有关联')),icon('chevron')],'resource',{'data-id':r.id},'detail-resource-row'):h('p',{class:'small-note'},name+' · 在阶段节点核对原文');})),h('section',{class:'detail-section'},h('h3',{},'回到原路线节点'),btn([h('span',{},h('strong',{},routes.get(item.routeId)?.name+' · '+stages.get(item.stageId)?.title),h('small',{},index===2?'此处是提前少量试读，不表示整个阶段已经适合。':'原文材料入口与完整同阶段组合')),icon('chevron')],'stage',{'data-id':item.stageId},'detail-resource-row')),h('p',{class:'small-note'},'这条示例链共约12分钟，可分散到生活中；时长来自整理建议。宝宝状态和兴趣优先。'));}
function resourceRouteDetail(id,routeId){const r=byId.get(id),route=routes.get(routeId);return h('div',{},h('div',{class:'chips'},routeChip(routeId)),h('h2',{style:{marginTop:'14px'}},r.title),h('p',{},'这份素材在'+route.name+'中的全部引用'),r.appearances.filter(a=>a.routeId===routeId).map(a=>h('div',{class:'series-block'},materialStageLink(r,a),sourceBtn(a.sourceId||routeId,a.page||1))));}
function profileModal(){profileEditBase=sharedProfile.get();return h('div',{class:'modal-backdrop center-backdrop','data-action':'backdrop'},h('section',{class:'detail profile-modal',role:'dialog','aria-modal':'true','aria-labelledby':'profile-title'},h('form',{class:'profile-form',id:'profile-form'},h('div',{class:'profile-site-head'},btn(icon('close'),'close',{'aria-label':'关闭资料'},'icon-button')),h('h2',{id:'profile-title'},'宝宝资料 · 全站共用'),h('p',{},'全站共用宝宝资料；听力词汇仅用于英语启蒙。'),h('div',{class:'form-row'},h('label',{for:'baby-name'},'怎么称呼宝宝'),h('input',{id:'baby-name',name:'name',value:namePart(),maxlength:30,required:true})),h('input',{name:'birthDate',type:'hidden',value:S.profile.birthDate}),h('div',{class:'form-row'},h('label',{for:'vocabulary'},'历史听力估计（约）'),h('input',{id:'vocabulary',name:'vocabulary',type:'number',min:0,max:20000,step:1,value:S.profile.vocabulary,required:true}),h('small',{},'词条明细建立后，浏览建议改用明细中的听懂单词数；此估计仅保留参考。')),h('div',{id:'profile-error',class:'form-error',role:'alert'}),h('div',{class:'form-actions'},btn([icon('download'),'备份'],'backup'),btn('关闭','close'),h('button',{type:'submit',class:'button primary'},'保存档案')))));}
function renderModal(){if(!S.modal){overlay.replaceChildren();return;}const m=S.modal;if(m.kind==='profile'){overlay.replaceChildren(profileModal());return;}let body,label;if(m.kind==='resource-progress'){body=resourceProgressDetail(m.id);label='素材真实进度';}else if(m.kind==='custom-book'){body=customBookForm();label='其他 · 个人素材';}else if(m.kind==='vocab-add'){body=vocabularyAddForm();label='新增语言记录';}else if(m.kind==='vocab-edit'){body=vocabularyEditForm();label='词条记录';}else if(m.kind==='vocab-import'){body=vocabularyImportForm();label='批量导入';}else if(m.kind==='vocab-categories'){m.categoryBase=vocabBase(V.categories(S.records).map(c=>V.CATEGORY+c.id));body=vocabularyCategoryForm();label='词汇分类';}else if(m.kind==='library-book'){body=libraryBookDetail(m.id);label='单本目录与主题依据';}else if(m.kind==='resource-books'){body=resourceBookCatalog(byId.get(m.id),true);label='逐册目录与主题';}else if(m.kind==='practice-books'){body=practiceBookForm();label='数量、记录规则与来源';}else if(m.kind==='practice-entry'){body=practiceSessionForm();label='庆爸 · 时间与素材记录';}else if(m.kind==='practice-note'){body=practiceNoteForm();label='路线素材进度';}else if(m.kind==='sss-songs'){body=songLibrary();label='SSS 儿歌 · 分类歌单与官方资源';}else if(m.kind==='activity'){body=activityDetail(Number(m.id));label='今天的小链路 · 活动与对应节点';}else if(m.kind==='stage'){body=stageDetail(stages.get(m.id));label='阶段详情 · 完整素材与使用方法';}else if(m.kind==='resource-price'){const resource=byId.get(m.id),prices=priceReference(resource);prices.open=true;body=h('div',{},h('h2',{},resource.title),prices);label='历史好价参考';}else if(m.kind==='resource-route'){body=resourceRouteDetail(m.id,m.routeId);label='素材在路线中的位置';}else{body=resourceDetail(byId.get(m.id));label='素材详情 · 套系与关联';}const shell=detailShell(label,organizeDetail(body,m.kind,m.id));if(['resource-progress','library-book','resource-books','custom-book','resource-price','practice-books','vocab-add','vocab-edit','vocab-import','vocab-categories'].includes(m.kind)){shell.classList.add('center-backdrop');shell.querySelector('.detail').classList.add('price-modal');}overlay.replaceChildren(shell);}
let previewFocus=null;
function previewSource(preview){
  if(!preview.resourceId){
    const source=BOOKS.sources.find(s=>s.id===preview.sourceId);
    return source?.images?.length?{title:source.title,file:source.images[0].path,previews:source.images.map(image=>({...image,note:image.caption}))}:src(preview.sourceId);
  }
  const resource=byId.get(preview.resourceId);
  return resource?.cover?{title:resource.title,file:resource.cover,previews:[{page:1,path:resource.cover,alt:resource.title+'，'+coverLabel(resource)}]}:null;
}
function showPreview(sourceId,page,resourceId){
  const source=previewSource({sourceId,resourceId}),p=source?.previews.find(x=>x.page===Number(page))||source?.previews[0];if(!p)return;
  if(!S.preview){previewFocus=document.activeElement;el.inert=true;overlay.inert=true;}
  S.preview={sourceId,resourceId,page:p.page,zoom:100};document.body.style.overflow='hidden';renderPreview();
  previewRoot.querySelector('[data-action="close-preview"]')?.focus({preventScroll:true});
}
function closePreview(){
  S.preview=null;previewRoot.replaceChildren();el.inert=false;overlay.inert=false;
  if(!S.modal)document.body.style.overflow='';
  if(previewFocus?.isConnected)previewFocus.focus({preventScroll:true});previewFocus=null;
}
function renderPreview(){
  const p=S.preview;if(!p){previewRoot.replaceChildren();return;}
  const source=previewSource(p),index=source.previews.findIndex(x=>x.page===p.page),current=source.previews[index];
  const active=previewRoot.contains(document.activeElement)?document.activeElement:null;
  const focusAction=active?.dataset.action,focusSelect=active?.tagName==='SELECT';
  const previous=previewRoot.querySelector('.preview-scroll'),scroll=previous?{left:previous.scrollLeft,top:previous.scrollTop}:null;
  const width=Math.min(window.innerWidth-32,1100)*p.zoom/100;
  previewRoot.replaceChildren(h('section',{class:'modal-backdrop preview-backdrop',role:'dialog','aria-modal':'true','aria-label':'原始资料放大预览'},
    h('header',{class:'preview-top'},h('h3',{},source.title+' · '+(source.previews.length>1?'第 '+p.page+' 页':'原图')),
      btn(icon('close'),'close-preview',{'aria-label':'关闭预览'},'icon-button preview-close'),
      h('div',{class:'preview-controls'},
        source.previews.length>1?h('div',{class:'preview-control-group'},btn('←','preview-prev',{disabled:index===0,'aria-label':'上一页'}),
          h('select',{'aria-label':'选择原文页码',onchange:e=>{S.preview.page=Number(e.target.value);renderPreview();}},source.previews.map(x=>h('option',{value:x.page,selected:x.page===p.page},'第 '+x.page+' 页'))),
          btn('→','preview-next',{disabled:index===source.previews.length-1,'aria-label':'下一页'})):null,
        h('div',{class:'preview-control-group'},btn('−','zoom-out',{disabled:p.zoom===50,'aria-label':'缩小'}),h('output',{'aria-label':'缩放比例'},p.zoom+'%'),btn('+','zoom-in',{disabled:p.zoom===250,'aria-label':'放大'})),
        h('a',{class:'button',href:asset(source.file)+(source.file.endsWith('.pdf')?'#page='+p.page:''),target:'_blank',rel:'noopener'},'原文件'))),
    h('div',{class:'preview-scroll',onclick:e=>{if(e.target===e.currentTarget)closePreview();}},h('img',{src:asset(current.path),alt:current.alt||source.title+'第'+p.page+'页',style:{width:width+'px'}})),
    h('footer',{class:'preview-footer'},current.note||((source.previews.length>1?'左右键翻页，':'')+'＋ / － 缩放，Esc 或点击图片外空白关闭。'))));
  if(scroll)previewRoot.querySelector('.preview-scroll').scrollTo(scroll.left,scroll.top);
  const focus=focusAction?previewRoot.querySelector('[data-action="'+focusAction+'"]'):focusSelect?previewRoot.querySelector('select'):null;
  if(active)(focus&&!focus.disabled?focus:previewRoot.querySelector('[data-action="close-preview"]'))?.focus({preventScroll:true});
}
function navigate(view){S.view=view;S.route='all';if(view==='library'){libraryCollection='all';S.type='all';S.age='all';S.libraryTopic='all';S.libraryBookMode=false;}render();window.scrollTo(0,0);history.replaceState(null,'','#'+view);}
async function backup(){
  const payload={version:1,exportedAt:new Date().toISOString(),profile:S.profile,favorites:S.favorites,records:S.records};
  const content=JSON.stringify(payload,null,2),filename='小芽英语-启蒙记录备份.json';
  if(['127.0.0.1','localhost'].includes(location.hostname)&&location.protocol==='http:'){
    try{
      const response=await fetch('/__local-backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,content})});
      if(!response.ok)throw new Error('备份未能保存到育儿目录，请确认本地记录服务正在运行后重试。');
      const result=await response.json();if(!result.saved||!result.path)throw new Error('备份未收到保存确认，请重试。');
      toast('备份已保存：'+result.path);
    }catch(error){toast(error.message);}
    return;
  }
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=h('a',{href:url,download:filename});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出宝宝档案、收藏和素材小记录');
}
document.addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(!target)return;const action=target.dataset.action;if(target.tagName==='A')e.preventDefault();if(action==='backdrop'){if(e.target!==target)return;closeModal();return;}if(action.startsWith('vocab-')){vocabularyAction(target);return;}const id=target.dataset.id;if(action==='resource-progress'){openModal('resource-progress',id);return;}if(action==='library-book'){openModal('library-book',id);return;}if(action==='resource-books'){openModal('resource-books',id);return;}if(action==='custom-book-new'){openModal('custom-book',LC.key(crypto.randomUUID()));return;}if(action==='custom-book-edit'){openModal('custom-book',id);return;}switch(action){case 'select-compare-stage':S.compareStage=id;openBrowseStage(id);render();if(target.dataset.journey)document.getElementById('stage-step-'+id)?.focus({preventScroll:true});break;case 'library-more':S.libraryLimit+=18;render();break;case 'view':navigate(target.dataset.view);break;case 'route':S.route=target.dataset.route;mobileRouteTab=S.route==='all'?null:S.route;if(S.route!=='all')S.compareRoute=S.route;S.compareStage=null;S.view='routes';render();window.scrollTo(0,0);break;case 'route-domain':S.routeDomain=target.dataset.domain;if(target.dataset.routeContext){S.compareRoute=target.dataset.routeContext;S.route=target.dataset.routeContext;mobileRouteTab=target.dataset.routeContext;}S.compareStage=null;navigate('routes');requestAnimationFrame(()=>document.querySelector('.route-domain-options [data-domain="'+S.routeDomain+'"]')?.focus({preventScroll:true}));break;case 'roadmap-mode':{const routeId=browseRoute().id;S.route=routeId;S.compareRoute=routeId;S.roadmapMode=target.dataset.mode;render();break;}case 'compare-stage':{closeModal();const st=stages.get(id);mobileRouteTab=st.routeId;const domains=[...window.ROADMAP_RAW.routePlan.domains].sort((a,b)=>Number(b.id===S.routeDomain)-Number(a.id===S.routeDomain));const domain=domains.find(d=>EnglishModel.getRoutePlan(C,st.routeId,d.id)?.stageIds.includes(id))||domains.find(d=>EnglishModel.getRoutePlan(C,st.routeId,d.id)?.supportingStageIds.includes(id));S.routeDomain=domain?.id||st.domain||'listening';S.compareRoute=st.routeId;const plan=EnglishModel.getRoutePlan(C,st.routeId,S.routeDomain,S.profile);const node=plan.stages.find(s=>s.id===id||s.raw.sourceStageId===id);S.compareStage=node?.id||null;if(node)openBrowseStage(node.id);S.roadmapMode='compare';navigate('routes');requestAnimationFrame(()=>document.getElementById('compare-'+S.compareStage)?.scrollIntoView({block:'start',behavior:'smooth'}));break;}case 'shared-library':S.sharedOnly=true;S.search='';S.favoriteOnly=false;navigate('library');break;case 'shared-filter':S.sharedOnly=!S.sharedOnly;render();break;case 'profile':openModal('profile');break;case 'close':closeModal();break;case 'modal-back':backModal();break;case 'stage':openModal('stage',id);break;case 'resource':openModal('resource',id);break;case 'resource-price':openModal('resource-price',id);break;case 'sss-songs':{const parent=S.modal;const stageId=target.dataset.stage||(parent?.kind==='stage'?parent.id:null);if(target.dataset.category){S.songCategory=target.dataset.category;S.songScene='all';S.songSearch='';}openModal('sss-songs',id||SSS.resourceId,{stageId});break;}case 'song-category':S.songCategory=target.dataset.category;S.songScene='all';renderModal();overlay.querySelector('[data-category="'+S.songCategory+'"]')?.focus({preventScroll:true});break;case 'song-clear':S.songCategory='all';S.songScene='all';S.songSearch='';renderModal();overlay.querySelector('#song-search-panel-toggle')?.focus({preventScroll:true});break;case 'activity':openModal('activity',id);break;case 'resource-route':openModal('resource-route',id,{routeId:target.dataset.route});break;case 'favorite':S.favorites=S.favorites.includes(id)?S.favorites.filter(x=>x!==id):S.favorites.concat(id);persist();if(S.modal)renderModal();else render();break;case 'favorites':S.favoriteOnly=!S.favoriteOnly;render();break;case 'type':S.type=target.dataset.type;render();break;case 'clear-filters':S.type='all';S.route='all';S.search='';S.age='all';S.favoriteOnly=false;S.sharedOnly=false;S.materialStatus='all';S.libraryTopic='all';S.libraryBookMode=false;render();break;case 'search':S.search='';navigate('library');document.getElementById('library-search-panel')?.showPopover();document.getElementById('library-search')?.focus();break;case 'preview':showPreview(target.dataset.source,target.dataset.page);break;case 'resource-preview':showPreview(null,1,id);break;case 'close-preview':closePreview();break;case 'preview-prev':case 'preview-next':{const source=previewSource(S.preview);const i=source.previews.findIndex(p=>p.page===S.preview.page);const n=i+(action==='preview-prev'?-1:1);if(source.previews[n]){S.preview.page=source.previews[n].page;renderPreview();}break;}case 'zoom-in':case 'zoom-out':S.preview.zoom=Math.min(250,Math.max(50,S.preview.zoom+(action==='zoom-in'?25:-25)));renderPreview();break;case 'relation-mode':S.relationMode=target.dataset.mode;S.relationPage=0;render();break;case 'age-index':S.relationMode='age';S.view='relations';render();window.scrollTo(0,0);break;case 'resource-graph':closeModal();S.relationMode='resource';S.focus=id;S.relationPage=0;S.view='relations';render();window.scrollTo(0,0);break;case 'graph-focus':S.focus=target.dataset.resource;S.relationPage=0;render();break;case 'graph-page':S.relationPage=Math.max(0,S.relationPage+Number(target.dataset.delta));render();break;case 'mode':S.profile.mode=target.dataset.mode;persist();render();break;case 'backup':backup();break;}});
document.addEventListener('submit',async e=>{if(e.target.id.startsWith('vocabulary-')||e.target.classList.contains('vocabulary-category-row')){e.preventDefault();vocabularySubmit(e.target);return;}if(['practice-session-form','practice-note-form'].includes(e.target.id)){e.preventDefault();savePracticeForm(e.target);return;}if(e.target.id!=='profile-form')return;e.preventDefault();const f=new FormData(e.target),birth=String(f.get('birthDate')),v=Number(f.get('vocabulary'));let a=null;try{a=EnglishModel.getAge(birth);}catch{}if(!a||v<0||!Number.isFinite(v)||v>20000){document.getElementById('profile-error').textContent='请填写有效的出生日期和 0–20000 之间的词汇估计。';return;}try{await sharedProfile.save({name:String(f.get('name')).trim()||'宝宝',birthDate:birth},profileEditBase);S.profile=Object.assign({},S.profile,sharedProfile.get(),{vocabulary:Math.round(v)});if(!persist())return;closeModal();render();toast('已更新全站宝宝资料与英语浏览建议');}catch(error){document.getElementById('profile-error').textContent=error.message;}});
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(action==='song-toggle'){
    const song=SSS.songs.find(song=>song.id===button.dataset.id);if(!song)return;
    const key=P.SONG+song.id;
    if(savePracticeRecords({[key]:{...S.records[key],status:songDone(song)?'not-started':'done',note:S.records[key]?.note||''}})){if(S.view==='xu-progress')render();refreshSongCompletion();}
  }else if(action==='practice-add')openModal('practice-entry',P.SESSION+'qing:'+crypto.randomUUID(),{stageId:button.dataset.stage,unitKey:button.dataset.unit||'',date:button.dataset.date||''});
  else if(action==='practice-stat-group'){const s=practiceStatState();practiceStatsChange({group:s.group===button.dataset.group?'':button.dataset.group});}
  else if(action==='practice-stat-range'){const s=practiceStatState(),same=s.focusFrom===button.dataset.from&&s.focusTo===button.dataset.to;practiceStatsChange({focusFrom:same?'':button.dataset.from,focusTo:same?'':button.dataset.to});}
  else if(action==='practice-edit')openModal('practice-entry',button.dataset.id);
  else if(action==='practice-book-scope')openModal('practice-books',button.dataset.unit,{stageId:button.dataset.stage});
  else if(action==='practice-note')openModal('practice-note',button.dataset.unit,{stageId:button.dataset.stage,unitKey:button.dataset.unit});
  else if(action==='practice-domain'){S.practiceDomain=button.dataset.domain;render();}
  else if(action==='practice-stage'){S.practiceStages[button.dataset.routeKey]=button.dataset.stage;if(button.dataset.routeKey==='qing:listening'&&practiceStatState().scope==='stage')Object.assign(S.practiceStats,{group:'',focusFrom:'',focusTo:''});S.practiceLogLimit=12;render();document.querySelector('.practice-stage-picker')?.scrollIntoView({block:'start',behavior:'smooth'});}
  else if(action==='practice-jump'){if(!closeModal())return;const routeId=button.dataset.route,domain=button.dataset.domain;S.practiceDomain=domain;S.practiceStages[routeId+':'+domain]=button.dataset.stage;navigate(routeId+'-progress');}
  else if(action==='practice-more'){S.practiceLogLimit+=12;render();}
  else if(action==='practice-history'){const fold=document.querySelector('.practice-history');fold.open=true;readingFolds.set(fold.dataset.foldKey||'practice-stat-history',true);fold.scrollIntoView({block:'start',behavior:'smooth'});}
  else if(action==='practice-delete'){
    const id=button.dataset.id,old=S.records[id];
    if(S.modal.base!==JSON.stringify(old)){document.getElementById('practice-error').textContent='记录已在其他页面更新，请重新核对。';return;}
    if(!savePracticeRecords({[id]:{...old,status:'not-started'}}))return;
    overlay.querySelector('form').dataset.dirty='false';closeModal();render();toast('已删除这条记录');
    document.getElementById('toast')?.append(btn('撤销','practice-undo',{},'text-link'));
    practiceUndo={id,old};
  }else if(action==='practice-undo'&&practiceUndo){const {id,old}=practiceUndo;if(JSON.stringify(S.records[id])!==JSON.stringify({...old,status:'not-started'})){toast('记录已更新，请重新核对。');return;}if(savePracticeRecords({[id]:old})){practiceUndo=null;render();toast('已恢复记录');}}
});
let practiceUndo=null;
window.addEventListener('beforeunload',e=>{if(overlay.querySelector('.practice-form[data-dirty="true"]')){e.preventDefault();e.returnValue='';}});
document.addEventListener('keydown',e=>{if(window.XiaoyaSite.navigationOpen())return;if(e.key==='Escape'){if(S.preview)closePreview();else closeModal();return;}if(S.preview){if(e.key==='Tab'){const nodes=Array.from(previewRoot.querySelectorAll('button:not([disabled]),select,a[href]')).filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}if(e.target.tagName==='SELECT')return;const map={ArrowLeft:'preview-prev',ArrowRight:'preview-next','+':'zoom-in','=':'zoom-in','-':'zoom-out'};const act=map[e.key];if(act){e.preventDefault();previewRoot.querySelector('[data-action="'+act+'"]')?.click();}return;}if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();S.search='';navigate('library');document.getElementById('library-search')?.focus();}if(S.modal&&e.key==='Tab'){const nodes=Array.from(overlay.querySelectorAll('button:not([disabled]),input,select,textarea,a[href],summary')).filter(n=>n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
window.addEventListener('resize',()=>{if(S.preview)renderPreview();});
const [hash,hashQuery='']=location.hash.slice(1).split('?');if(NAV.some(x=>x[0]===hash))S.view=hash;if(hash==='library'&&new URLSearchParams(hashQuery).get('collection')==='hello')libraryCollection='hello';
const ageCaseKey=()=>JSON.stringify(C.routes.map(r=>{const context=routeAgeCase(r.id);return [r.id,context.status,context.ageCase?.id];}));
let visibleAgeCaseKey=ageCaseKey();
function refreshAgeCases(){const next=ageCaseKey();if(next!==visibleAgeCaseKey){visibleAgeCaseKey=next;resourceProgressCache=null;render();if(S.modal?.kind==='stage')renderModal();else refreshResourceProgressModal();}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAgeCases();});
window.addEventListener('focus',refreshAgeCases);
window.addEventListener('pageshow',refreshAgeCases);
sharedProfile.subscribe((profile,error)=>{if(error){toast(error.message);return;}Object.assign(S.profile,profile);visibleAgeCaseKey=ageCaseKey();render();if(S.modal?.kind==='stage')renderModal();else refreshResourceProgressModal();});
siteSync=window.XiaoyaSync.createClient({siteRoot:window.XIAOYA_SITE_ROOT,profileClient:sharedProfile});
siteSync.subscribe(area=>{
  if(area!=='english')return;
  try{
    const next=JSON.parse(localStorage.getItem('little-leaf-english-v1'));
    if(!next)return;
    Object.assign(S.profile,next.profile,sharedProfile.get());S.favorites=next.favorites||[];S.records=next.records||{};
    render();
    refreshSongCompletion();
    // 正在编辑的详情保留 DOM；输入框同步时保留光标。
    const id=S.modal?.kind==='resource'?S.modal.id:null;
    const note=id&&document.getElementById('resource-note');
    if(note&&document.activeElement!==note)note.value=S.records[id]?.note||'';
    const status=id&&document.getElementById('status-detail-'+id);
    if(status)status.closest('.material-status-control').replaceWith(resourceStatusControl(byId.get(id),true));
    if(id)overlay.querySelector('.resource-practice-summary')?.replaceWith(resourcePracticeSummary(byId.get(id)));
    refreshResourceProgressModal();
  }catch(error){toast('同步内容未能读取：'+error.message);}
});
window.EnglishApp={catalog:C,state:S,render,asset};render();if(sharedProfileError)toast(sharedProfileError);
})();
