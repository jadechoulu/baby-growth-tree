(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./topics.js'):root.EnglishTopics);if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishHello=api;})(typeof window==='object'?window:globalThis,function(Topics){
'use strict';
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘']/g,'').replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ').trim();
function searchMatches(text,query){const target=normalize(text),needle=normalize(query);return needle.split(' ').every(word=>target.includes(word))||target.replace(/\s/g,'').includes(needle.replace(/\s/g,''));}
function numberedBookId(value){const text=String(value??'').trim();if(!text)return 'all';const number=Number(text);return /^\d+$/.test(text)&&Number.isInteger(number)&&number>=1&&number<=24?'hello-'+String(number).padStart(2,'0'):null;}
const selectedBooks=book=>Array.isArray(book)?book:book&&book!=='all'?[book]:[];
const matchesBook=(book,id)=>!selectedBooks(book).length||selectedBooks(book).includes(id);
function toggleBook(book,id){const ids=new Set(selectedBooks(book));if(ids.has(id))ids.delete(id);else ids.add(id);const values=[...ids].sort();return !values.length||values.length===24?'all':values.length===1?values[0]:values;}
function bookPdf(book){return book.resources.find(resource=>resource.kind==='pdf'&&resource.role==='original-book')||null;}
const tuneNames=r=>r.tunes.concat(r.extensions.map(e=>e.tune));
function tuneIsSuggested(data,name,rhymeIds){return data.rhymes.some(r=>(!rhymeIds||rhymeIds.includes(r.id))&&r.tunes.includes(name));}
function tuneIsPackage(data,name){return (data.tuneAudio?.tunes||[]).some(t=>normalize(t.name)===normalize(name)&&t.referenceOrigin==='hello-package');}
function tunePriority(data,name,rhymeIds){
  if(!rhymeIds)return Number(tuneIsPackage(data,name));
  let priority=0;
  for(const rhyme of (data.rhymes||[]).filter(r=>rhymeIds.includes(r.id)&&r.tunes.includes(name))){
    const performed=(data.books||[]).find(b=>b.id===rhyme.bookId)?.resources.filter(a=>a.kind==='audio'&&(a.rhymeIds||[]).includes(rhyme.id)&&a.performedTune&&a.performedTuneEvidence)||[];
    priority=Math.max(priority,performed.length?Number(performed.some(a=>normalize(a.performedTune)===normalize(name)))*2:Number(tuneIsPackage(data,name)));
  }
  return priority;
}
function tuneIsHighlighted(data,name,rhymeIds){return tunePriority(data,name,rhymeIds)>0;}
function orderedTunes(data,names,rhymeIds){return [...names].sort((a,b)=>tunePriority(data,b,rhymeIds)-tunePriority(data,a,rhymeIds));}
function tuneCategory(data,name){return (data.tuneAudio?.tunes||[]).find(t=>normalize(t.name)===normalize(name))?.repertoire||{kind:'unverified',label:'来源待核',basis:'尚未核实曲目来源，不认定为Hello特有曲调。'};}
function soundBookMatches(soundBook,name){return (soundBook?.songs||[]).flatMap(entry=>(entry.helloTunes||[]).filter(match=>match.name===name).map(match=>({entry,match})));}
function materials(data,{bookId,rhymeId}={}){if(rhymeId){const rhyme=data.rhymes.find(r=>r.id===rhymeId);if(!rhyme||(bookId&&bookId!==rhyme.bookId))return [];bookId=rhyme.bookId;}return (data.materialCards?.items||[]).filter(item=>(!bookId||item.bookId===bookId)&&(!rhymeId||(!['vocabulary-card','unclassified'].includes(item.type)&&(item.rhymeIds||[]).includes(rhymeId))));}
function materialLabel(item){if(item.type==='rhyme-card')return item.origin==='book-pages'?'原书童谣页':'童谣卡';return ({'vocabulary-card':'词汇卡','reading-guide':'阅读指引','supplementary-book':'拓展读物',activity:'活动资料',unclassified:'待分类资料'})[item.type]||'学习资料';}
function options(data){return {scenes:[...new Set(data.books.flatMap(b=>b.parts.map(p=>p.scene)).concat(data.rhymes.flatMap(r=>r.themes||[])))].sort((a,b)=>a.localeCompare(b,'zh')),tunes:orderedTunes(data,[...new Set(data.rhymes.flatMap(tuneNames).concat(data.books.flatMap(book=>packageVideos(data,book).flatMap(resource=>resource.tunes||[]))))].sort((a,b)=>a.localeCompare(b,'en')))};}
function partRhymes(data,book,part){
  const b=typeof book==='string'?data.books.find(b=>b.id===book):book,p=typeof part==='object'?part?.part:part;
  if(!b||!b.parts.some(item=>item.part===Number(p)))return [];
  const id=b.id+'-part-'+Number(p);
  return data.rhymes.filter(r=>r.bookId===b.id&&(r.partIds||[]).includes(id));
}
function packageVideos(data,book,{partId,rhymeId}={}){
  const b=typeof book==='string'?data.books.find(item=>item.id===book):book;if(!b)return [];
  if(partId&&!b.parts.some(part=>partId===b.id+'-part-'+part.part))return [];
  const rhyme=rhymeId?data.rhymes.find(item=>item.id===rhymeId&&item.bookId===b.id):null;
  if(rhymeId&&!rhyme)return [];
  return b.resources.filter(resource=>['package-video','video'].includes(resource.kind)&&
    (!partId||(resource.partIds||[]).includes(partId))&&
    (!rhyme||(resource.rhymeIds||[]).includes(rhyme.id)||(resource.tunes||[]).some(name=>tuneNames(rhyme).includes(name))));
}
function audioResources(data,book,{partId,rhymeId,wholeBook=false}={}){
  const b=typeof book==='string'?data.books.find(item=>item.id===book):book;if(!b)return [];
  if(partId&&!b.parts.some(part=>partId===b.id+'-part-'+part.part))return [];
  if(rhymeId&&!data.rhymes.some(rhyme=>rhyme.id===rhymeId&&rhyme.bookId===b.id))return [];
  return b.resources.filter(resource=>resource.kind==='audio'&&(!resource.bookId||resource.bookId===b.id)&&
    (!partId||(resource.partIds||[]).includes(partId))&&(!rhymeId||(resource.rhymeIds||[]).includes(rhymeId))&&
    (!wholeBook||!(resource.partIds||[]).length&&!(resource.rhymeIds||[]).length));
}
function audioVariantLabel(resource){return resource.variantLabel||(resource.sourceKind==='reading-pen'?'点读朗读':'原包演唱');}
function supplementalAudio(data,book){
  const b=typeof book==='string'?data.books.find(item=>item.id===book):book;if(!b)return [];
  const names=new Set(data.rhymes.filter(r=>r.bookId===b.id).flatMap(tuneNames));
  const represented=new Set((data.tuneAudio?.tunes||[]).filter(t=>names.has(t.name)).map(t=>t.file||t.previewUrl).filter(Boolean));
  return audioResources(data,b,{wholeBook:true}).filter(resource=>!represented.has(resource.file));
}
function audioVersions(resources){const counts=new Map(),seen=new Map();for(const resource of resources){const label=audioVariantLabel(resource);counts.set(label,(counts.get(label)||0)+1);}return resources.map(resource=>{const base=audioVariantLabel(resource),index=(seen.get(base)||0)+1;seen.set(base,index);return {resource,label:base+(counts.get(base)>1?' '+index:'')};});}
function rhymeMatchesTune(data,book,rhyme,tune){return tune==='all'||tuneNames(rhyme).includes(tune)||packageVideos(data,book,{rhymeId:rhyme.id}).some(resource=>(resource.tunes||[]).includes(tune));}
function partTopics(data,book,part){return [...new Set(Topics.entryTopics('hello-part',part).concat(partRhymes(data,book,part).flatMap(r=>Topics.entryTopics('hello-rhyme',r))))];}
function rhymeTopics(data,book,rhyme){return [...new Set(Topics.entryTopics('hello-rhyme',rhyme).concat(book.parts.filter(p=>(rhyme.partIds||[]).includes(book.id+'-part-'+p.part)).flatMap(p=>Topics.entryTopics('hello-part',p))))];}
function filter(data,{edition='numbered',book='all',scene='all',tune='all',query='',part='',topic='all',subtopic='all'}={}){
  const words=normalize(query).split(' ').filter(Boolean),matches=text=>searchMatches(text,query);
  if(edition!=='numbered')return [];
  return data.books.filter(b=>matchesBook(book,b.id)).map(b=>{
    const allRhymes=data.rhymes.filter(r=>r.bookId===b.id),byPart=new Map(b.parts.map(p=>[p.part,partRhymes(data,b,p)]));
    let parts=b.parts.filter(p=>(!part||part===b.id+'-part-'+p.part)&&(scene==='all'||p.scene===scene||byPart.get(p.part).some(r=>(r.themes||[]).includes(scene)))&&Topics.matches(partTopics(data,b,p),{topic,subtopic}));
    const tuned=allRhymes.filter(r=>rhymeMatchesTune(data,b,r,tune));
    if(tune!=='all')parts=parts.filter(p=>byPart.get(p.part).some(r=>tuned.includes(r))||packageVideos(data,b,{partId:b.id+'-part-'+p.part}).some(resource=>(resource.tunes||[]).includes(tune)));
    const resourceText=b.resources.flatMap(r=>[r.label,...(r.originalNames||[])]).join(' '),materialText=materials(data,{bookId:b.id}).flatMap(item=>[item.title,materialLabel(item),item.sourceName]).join(' ');
    if(words.length&&!matches(b.title)){
      const found=parts.filter(p=>matches([b.title,p.title,p.scene,p.note,...Topics.labels(Topics.expand(partTopics(data,b,p))),...packageVideos(data,b,{partId:b.id+'-part-'+p.part}).flatMap(resource=>[resource.label,...(resource.tunes||[])]),...audioResources(data,b,{partId:b.id+'-part-'+p.part}).map(resource=>resource.label),...byPart.get(p.part).flatMap(r=>[r.title,...tuneNames(r),...(r.themes||[]),...b.resources.filter(a=>(a.rhymeIds||[]).includes(r.id)).map(a=>a.label)])].join(' ')));
      if(found.length)parts=found;else if(!matches(resourceText+' '+materialText))parts=[];
    }
    const scoped=part||scene!=='all'||tune!=='all'||topic!=='all'||subtopic!=='all'||words.length;
    const rhymes=tuned.filter(r=>(!scoped||parts.some(p=>byPart.get(p.part).includes(r)))&&Topics.matches(rhymeTopics(data,b,r),{topic,subtopic}));
    return {book:b,parts,rhymes,allRhymes,matched:parts.length>0};
  }).filter(r=>r.matched);
}
function graph(data){
  const nodes=[],edges=[],add=(id,label,type)=>nodes.push({id,label,type});
  for(const b of data.books){
    add(b.id,b.title,'book');
    for(const p of b.parts){const id=b.id+'-part-'+p.part;nodes.push({id,label:'Part '+p.part+(p.title?' · '+p.title:''),type:'part',bookId:b.id,part:p.part,title:p.title,scene:p.scene});addScene(p.scene);edges.push({from:b.id,to:id,relation:'包含'},{from:id,to:'scene:'+p.scene,relation:'场景'});}
    for(const [index,r] of b.resources.entries()){
      const video=['package-video','video'].includes(r.kind),id=r.id||b.id+'-resource-'+index;
      nodes.push({id,label:r.label,type:'resource',url:r.url||r.file,sha256:r.sha256,kind:r.kind,bookId:b.id,sourceKind:r.sourceKind,audioVariant:r.kind==='audio'?audioVariantLabel(r):undefined});edges.push({from:b.id,to:id,relation:video?'资料包视频':r.kind});
      if(video)for(const partId of r.partIds||[])if(b.parts.some(p=>partId===b.id+'-part-'+p.part))edges.push({from:partId,to:id,relation:r.role==='tune-demo'?'曲调视频':r.role?.startsWith('extension')?'拓展视频':'配套视频'});
      if(r.kind==='audio')for(const partId of r.partIds||[])if(b.parts.some(p=>partId===b.id+'-part-'+p.part))edges.push({from:partId,to:id,relation:r.sourceKind==='reading-pen'?audioVariantLabel(r):'Part音频'});
      for(const rid of r.rhymeIds||[])if(data.rhymes.some(rhyme=>rhyme.id===rid&&rhyme.bookId===b.id))edges.push(video?{from:rid,to:id,relation:'童谣配套视频'}:r.sourceKind==='reading-pen'?{from:rid,to:id,relation:audioVariantLabel(r)}:{from:id,to:rid,relation:'同名童谣音频'});
      for(const t of r.sourceKind==='reading-pen'?[]:r.tunes||[]){const tid='tune:'+t;if(!nodes.some(n=>n.id===tid))add(tid,t,'tune');edges.push(video?{from:tid,to:id,relation:'曲调视频'}:{from:id,to:tid,relation:'同名曲调音频'});}
    }
  }
  function addScene(scene){const id='scene:'+scene;if(!nodes.some(n=>n.id===id))add(id,scene,'scene');}
  for(const r of data.rhymes){add(r.id,r.title,'rhyme');edges.push({from:r.bookId,to:r.id,relation:'童谣'});const book=data.books.find(b=>b.id===r.bookId);for(const part of book?.parts||[])if(partRhymes(data,book,part).includes(r))edges.push({from:book.id+'-part-'+part.part,to:r.id,relation:'对应童谣'});for(const theme of r.themes||[]){addScene(theme);edges.push({from:'scene:'+theme,to:r.id,relation:'童谣主题'});}for(const t of orderedTunes(data,r.tunes,[r.id])){const id='tune:'+t;if(!nodes.some(n=>n.id===id))add(id,t,'tune');edges.push({from:r.id,to:id,relation:'建议曲调'});}for(const [index,e] of r.extensions.entries()){const id=r.id+'-extension-'+index;add(id,e.title,'extension');edges.push({from:r.id,to:id,relation:'拓展儿歌'});const tid='tune:'+e.tune;if(!nodes.some(n=>n.id===tid))add(tid,e.tune,'tune');edges.push({from:id,to:tid,relation:'拓展曲调'});}}
  const rhymesById=new Map(data.rhymes.map(r=>[r.id,r]));
  for(const item of materials(data)){const relation=item.type==='rhyme-card'?(item.origin==='standalone-rhyme-card'?'独立童谣卡':item.origin==='book-pages'?'原书童谣页':'童谣素材'):({'vocabulary-card':'词汇图','reading-guide':'阅读指导',activity:'拓展活动',unclassified:'待分类素材'})[item.type]||'本册素材';nodes.push({id:item.id,type:'resource',kind:item.type,materialId:item.id,label:item.title,url:item.file,preview:item.preview,bookId:item.bookId,origin:item.origin});edges.push({from:item.bookId,to:item.id,relation});if(!['vocabulary-card','unclassified'].includes(item.type))for(const rid of item.rhymeIds||[])if(rhymesById.get(rid)?.bookId===item.bookId)edges.push({from:rid,to:item.id,relation});}
  for(const reference of data.tuneAudio?.tunes||[]){
    const local=(reference.status==='available'&&reference.file)||(reference.status==='preview'&&reference.previewUrl),external=reference.status==='external'&&reference.sourceUrl;if(!local&&!external)continue;
    const url=local||reference.sourceUrl,kind=local?'audio':'tune-reference',existing=nodes.find(node=>node.type==='resource'&&node.kind===kind&&node.url===url);
    const id=existing?.id||(local?'tune-audio:':'tune-reference:')+url;
    if(!existing)nodes.push({id,type:'resource',kind,label:reference.name+(reference.status==='preview'?' · 原曲试听片段':local?' · 曲调参考音频':' · 官方曲调试听'),url,sourceTitle:reference.sourceTitle,note:reference.note});
    const tid='tune:'+reference.name;if(!nodes.some(node=>node.id===tid))add(tid,reference.name,'tune');
    edges.push({from:tid,to:id,relation:reference.status==='preview'?'原曲试听片段':local?'曲调参考音频':'官方曲调试听'});
  }
  for(const node of nodes)if(node.type==='tune')node.repertoire=tuneCategory(data,node.label);
  return {nodes,edges};
}
const state={view:'books',book:'all',scene:'all',topic:'all',subtopic:'all',tune:'all',query:'',rhyme:'',part:'',focus:null,openBooks:new Map()};
function browse(data,filters={}){
  let rows=filter(data,filters);
  if(filters.rhyme){const rhyme=data.rhymes.find(r=>r.id===filters.rhyme);rows=rows.filter(row=>row.book?.id===rhyme?.bookId).map(row=>({...row,parts:row.parts.filter(p=>partRhymes(data,row.book,p).includes(rhyme)),rhymes:row.rhymes.filter(r=>r.id===filters.rhyme)})).filter(row=>row.parts.length);}
  const scenes=rows.flatMap(row=>row.book?row.parts.map(part=>({book:row.book,part})):[]);
  const scene=filters.scene||'all';
  const rhymes=(filters.edition&&filters.edition!=='numbered'?[]:data.rhymes).filter(r=>(!filters.rhyme||r.id===filters.rhyme)&&matchesBook(filters.book,r.bookId)&&(!filters.part||(r.partIds||[]).includes(filters.part))&&(!filters.tune||rhymeMatchesTune(data,r.bookId,r,filters.tune))).map(rhyme=>({book:data.books.find(b=>b.id===rhyme.bookId),rhyme})).filter(({book,rhyme:r})=>
    (scene==='all'||(r.themes||[]).includes(scene)||book.parts.some(p=>p.scene===scene&&partRhymes(data,book,p).includes(r)))&&
    Topics.matches(rhymeTopics(data,book,r),filters)&&
    searchMatches([r.title,...tuneNames(r),...(r.themes||[]),...Topics.labels(Topics.expand(rhymeTopics(data,book,r))),...book.parts.filter(p=>partRhymes(data,book,p).includes(r)).flatMap(p=>[p.title,p.scene,p.note]),...book.resources.filter(a=>(a.rhymeIds||[]).includes(r.id)).map(a=>a.label),...materials(data,{bookId:book.id,rhymeId:r.id}).flatMap(item=>[item.title,materialLabel(item)])].join(' '),filters.query));
  return {books:rows,scenes,rhymes};
}
function topicGraphData(data,filters={}){
  if((!filters.topic||filters.topic==='all')&&(!filters.subtopic||filters.subtopic==='all'))return data;
  const found=browse(data,{topic:filters.topic,subtopic:filters.subtopic}),ids=new Set(found.rhymes.map(row=>row.rhyme.id)),books=new Set(found.books.map(row=>row.book.id)),rhymes=found.rhymes.map(row=>row.rhyme),tunes=new Set(rhymes.flatMap(tuneNames));
  return {...data,books:found.books.map(row=>({...row.book,parts:row.parts,resources:row.book.resources.filter(r=>!(r.rhymeIds||[]).length||r.rhymeIds.some(id=>ids.has(id)))})),rhymes,materialCards:data.materialCards?{...data.materialCards,items:data.materialCards.items.filter(item=>books.has(item.bookId)&&(!(item.rhymeIds||[]).length||item.rhymeIds.some(id=>ids.has(id))))}:undefined,tuneAudio:data.tuneAudio?{...data.tuneAudio,tunes:data.tuneAudio.tunes.filter(item=>tunes.has(item.name))}:undefined};
}
function searchSuggestions(data,filters={},query=''){
  if(!normalize(query))return [];
  const found=browse(data,{...filters,query:''}),items=[],groups=new Map();
  const add=(kind,value,label,detail='',bookId)=>items.push({kind,value,label,detail,bookId});
  const group=(kind,label,bookId)=>{const key=kind+':'+label;if(!groups.has(key))groups.set(key,{kind,value:label,label,books:new Set()});groups.get(key).books.add(bookId);};
  const groupTopics=(ids,bookId)=>{for(const id of Topics.expand(ids)){const key='topic:'+id;if(!groups.has(key))groups.set(key,{kind:'topic',value:id,label:Topics.label(id),books:new Set()});groups.get(key).books.add(bookId);}};
  for(const {book,parts} of found.books)add('book',book.id,book.title,parts.map(p=>'P'+p.part+' '+p.scene).join(' · '));
  for(const {book,part} of found.scenes){group('scene',part.scene,book.id);groupTopics(partTopics(data,book,part),book.id);for(const resource of packageVideos(data,book,{partId:book.id+'-part-'+part.part}))for(const tune of resource.tunes||[])group('tune',tune,book.id);if(part.title&&!partRhymes(data,book,part).some(r=>normalize(r.title)===normalize(part.title)))add('part',book.id+'-part-'+part.part,part.title,book.title+' · Part '+part.part+' · '+part.scene,book.id);}
  for(const {book,rhyme} of found.rhymes){add('rhyme',rhyme.id,rhyme.title,book.title+' · '+rhyme.partIds.map(id=>'Part '+id.split('-').at(-1)).join(' / '));groupTopics(rhymeTopics(data,book,rhyme),book.id);for(const theme of rhyme.themes||[])group('scene',theme,book.id);for(const tune of tuneNames(rhyme))group('tune',tune,book.id);}
  for(const item of groups.values())add(item.kind,item.value,item.label,item.books.size+'本书');
  const rank={book:0,topic:1,scene:1,rhyme:2,tune:3,part:4},needle=normalize(query);
  return items.filter(item=>searchMatches(item.label,query)).sort((a,b)=>Number(normalize(b.label)===needle)-Number(normalize(a.label)===needle)||rank[a.kind]-rank[b.kind]||a.label.localeCompare(b.label,'zh'));
}
function render(data,{h,asset,onMaterialPreview=()=>{},soundBookBadges=()=>[],soundBookLegend=()=>null}){
  const root=h('section',{class:'hello-library','aria-label':'Hello杂志资源图谱'}),choices=options(data),controls={},tabs=new Map(),panels=new Map(),cards={books:new Map(),scenes:new Map(),rhymes:new Map()};
  let soundBookContext=0;
  const tunePages=name=>soundBookBadges(name,++soundBookContext);
  const topicUI=window.EnglishTopicUI.create({h,topics:Topics});
  const active=h('p',{class:'hello-count',role:'status'}),empty=h('p',{class:'empty'},'没有匹配项，试试清除筛选。');
  const link=(label,path)=>h('a',{class:'hello-resource-link',href:asset(path),target:'_blank',rel:'noopener noreferrer',onclick:e=>e.stopPropagation()},label+' ↗');
  const action=(label,run,attrs={})=>h('button',{type:'button',class:'hello-chip',onclick:run,...attrs},label);
  const cover=b=>b.cover?h('img',{class:'hello-book-cover',src:asset(b.cover),alt:b.title+'封面',width:56,height:72,loading:'lazy',decoding:'async'}):null;
  function bookTitle(b){const pdf=bookPdf(b);return pdf?h('a',{class:'hello-book-pdf',href:asset(pdf.file||pdf.url),target:'_blank',rel:'noopener noreferrer','aria-label':'查看'+b.title+'原书PDF',title:'查看'+b.title+'.pdf',onclick:e=>e.stopPropagation()},b.title+' ↗'):h('strong',{},b.title);}
  function syncControls(){closeSuggestions();for(const key of ['book','scene','tune'])controls[key].value=state[key];topicControl.sync(state.topic,state.subtopic);topicLabel.textContent=state.subtopic!=='all'?Topics.label(state.subtopic):state.topic!=='all'?Topics.label(state.topic):'主题';topicTrigger.title=[state.topic!=='all'?Topics.label(state.topic):'全部主题',state.subtopic!=='all'?Topics.label(state.subtopic):'',state.scene!=='all'?'原场景：'+state.scene:''].filter(Boolean).join(' · ');search.value=state.query;}
  function change(key,value,view){state.part='';state[key]=value;if(key!=='rhyme')state.rhyme='';state.focus=null;if(view)state.view=view;syncControls();refresh();if(key==='book'&&value!=='all'&&state.view==='books'){const card=cards.books.get(value);if(card)card.open=true;}}
  function showBook(b){state.part='';state.book=b.id;state.scene='all';state.topic='all';state.subtopic='all';state.tune='all';state.query='';state.rhyme='';state.view='books';state.focus={type:'book',id:b.id};syncControls();refresh();const card=cards.books.get(b.id);if(card)card.open=true;}
  const chip=(label,key,value,view)=>action(label,()=>change(key,value,view),{class:'hello-chip hello-chip-'+key,'aria-label':'筛选'+label});
  const tuneButton=name=>typeof window==='object'&&window.EnglishAudio?window.EnglishAudio.tuneButton(name,data,{h,asset}):null;
  const tuneBadge=name=>{const category=tuneCategory(data,name);return h('span',{class:'hello-tune-category','data-kind':category.kind,title:category.basis},category.label);};
  const tuneChip=(name,suggested=true,rhymeIds)=>h('span',{class:'hello-tune-choice','data-tune-suggested':String(suggested),'data-tune-highlighted':String(suggested&&tuneIsHighlighted(data,name,rhymeIds)),title:suggested?'松果妈妈建议套唱；可任选旋律，不表示原声采用此曲调':'拓展曲调'},action(h('span',{class:'hello-tune-chip-name'},tuneBadge(name),name),()=>change('tune',name,'rhymes'),{class:'hello-chip hello-chip-tune','aria-label':'筛选'+name}),tuneButton(name),tunePages(name));
  function select(key,label,entries){const n=h('select',{'aria-label':label,onchange:e=>change(key,e.currentTarget.value)},entries.map(([value,title])=>h('option',{value,selected:state[key]===value},title)));controls[key]=n;return n;}
  function tunePicker(){
    const label=h('span',{},'套唱曲调'),names=new Map();
    const trigger=h('summary',{'aria-label':'曲调（含拓展）',onkeydown:event=>{if(event.key==='ArrowDown'){event.preventDefault();picker.open=true;names.get(state.tune)?.focus();}}},label,h('span',{'aria-hidden':'true'},'⌄'));
    const search=h('input',{type:'search','aria-label':'搜索曲调',placeholder:'搜索曲调…',oninput:event=>{const query=normalize(event.currentTarget.value);for(const row of list.children)row.hidden=!normalize(row.dataset.name).includes(query);}});
    const list=h('ul',{'aria-label':'曲调列表'},[['all','全部曲调'],...choices.tunes.map(name=>[name,name])].map(([value,name])=>{
      const choose=h('button',{type:'button',class:'hello-tune-name','aria-pressed':'false','aria-label':value==='all'?name:tuneCategory(data,name).label+'：'+name,onclick:()=>{change('tune',value);picker.open=false;trigger.focus();}},value==='all'?name:h('span',{class:'hello-tune-menu-name'},tuneBadge(name),h('span',{},name)));names.set(value,choose);
      return h('li',{class:'hello-tune-option','data-name':name},choose,value!=='all'?h('span',{class:'hello-tune-option-actions'},tunePages(value),tuneButton(value)):null);
    }));
    const cleanup=()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);};
    const close=restore=>{picker.open=false;cleanup();if(restore&&trigger.isConnected)trigger.focus();};
    const outside=event=>{if(!picker.isConnected||!picker.contains(event.target))close(false);};
    const escape=event=>{if(event.key==='Escape'&&!event.target.closest('.library-popover')){event.preventDefault();event.stopPropagation();close(true);}};
    const picker=h('details',{class:'hello-tune-picker',ontoggle:()=>{cleanup();if(picker.open){search.value='';for(const row of list.children)row.hidden=false;document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);}}},trigger,h('div',{class:'hello-tune-menu','aria-label':'曲调试听与筛选'},h('p',{class:'hello-tune-menu-note'},'给 Hello 童谣套唱用的曲调'),search,list));
    const clear=h('button',{type:'button',class:'hello-tune-clear',hidden:true,'aria-label':'清除曲调筛选',title:'恢复全部曲调',onclick:()=>{close(false);change('tune','all');trigger.focus();}},'×');
    controls.tune={set value(value){label.textContent=value==='all'?'套唱曲调':value;clear.hidden=value==='all';trigger.title=value==='all'?'给Hello童谣套唱用的曲调':tuneCategory(data,value).label+' · '+value;const rhymeIds=browse(data,state).rhymes.map(row=>row.rhyme.id);for(const [name,button] of names){button.setAttribute('aria-pressed',String(name===value));if(name!=='all'){const suggested=tuneIsSuggested(data,name,rhymeIds);button.parentElement.dataset.tuneSuggested=String(suggested);button.parentElement.dataset.tuneHighlighted=String(suggested&&tuneIsHighlighted(data,name,rhymeIds));button.title=suggested?'松果妈妈建议套唱':'拓展曲调';}}for(const name of orderedTunes(data,[...names.keys()].filter(name=>name!=='all'),rhymeIds))list.append(names.get(name).parentElement);}};
    return h('div',{class:'hello-tune-filter'},picker,clear);
  }
  function bookPicker(){
    const label=h('span',{}),inputs=new Map();
    const trigger=h('summary',{'aria-label':'选择Hello书册（可多选）',onkeydown:event=>{if(event.key==='ArrowDown'){event.preventDefault();picker.open=true;all.focus();}}},label,h('span',{'aria-hidden':'true'},'⌄'));
    const all=h('button',{type:'button',class:'hello-book-all','aria-pressed':'false',onclick:()=>change('book','all')},'全部书册');
    const list=h('div',{class:'hello-book-options',role:'group','aria-label':'书号多选'},data.books.map(book=>{
      const input=h('input',{type:'checkbox','aria-label':book.title,onchange:()=>change('book',toggleBook(state.book,book.id))});inputs.set(book.id,input);
      return h('label',{},input,h('span',{},book.title));
    }));
    const cleanup=()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);};
    const close=restore=>{picker.open=false;cleanup();if(restore&&trigger.isConnected)trigger.focus();};
    const outside=event=>{if(!picker.isConnected||!picker.contains(event.target))close(false);};
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}};
    const picker=h('details',{class:'hello-book-filter',ontoggle:()=>{cleanup();if(picker.open){document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);}}},trigger,h('div',{class:'hello-book-menu'},all,list));
    controls.book={set value(value){const ids=selectedBooks(value);label.textContent=!ids.length?'全部书册':ids.length===1?data.books.find(b=>b.id===ids[0])?.title:'已选'+ids.length+'本';trigger.title=ids.length?ids.map(id=>data.books.find(b=>b.id===id)?.title).join('、'):'全部24本书';all.setAttribute('aria-pressed',String(!ids.length));for(const [id,input] of inputs)input.checked=ids.includes(id);}};
    return picker;
  }
  let composing=false,suggestionItems=[];
  const suggestionKinds={book:'书号',topic:'主题',scene:'原场景',rhyme:'Hello童谣',tune:'套唱曲调',part:'内容'};
  const suggestionList=h('div',{class:'hello-search-matches',id:'hello-search-matches',role:'region','aria-label':'Hello实时匹配项',hidden:true,onkeydown:event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSearch(true);}else if(['ArrowDown','ArrowUp'].includes(event.key)){const buttons=[...suggestionList.querySelectorAll('.hello-search-choice')],index=buttons.indexOf(document.activeElement);if(index>=0){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}}});
  const closeSuggestions=()=>{suggestionList.hidden=true;search.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',outsideSearch,true);};
  const outsideSearch=event=>{if(!searchField.isConnected||!searchField.contains(event.target))closeSuggestions();};
  function chooseSuggestion(item){state.query='';if(item.kind==='topic'){const node=Topics.node(item.value);state.topic=node.parentId||node.id;state.subtopic=node.parentId?node.id:'all';state.part='';state.rhyme='';state.focus=null;syncControls();refresh();}else change(item.kind,item.value,item.kind==='rhyme'?'rhymes':item.kind==='scene'||item.kind==='part'?'scenes':item.kind==='book'?'books':undefined);closeSearch(true);}
  function showSuggestions(){
    if(composing||!normalize(search.value)){closeSuggestions();return;}
    suggestionItems=searchSuggestions(data,state,search.value);
    suggestionList.replaceChildren(h('p',{class:'hello-search-match-count',role:'status'},suggestionItems.length?'匹配 '+suggestionItems.length+' 项': '当前筛选下无匹配项，试试其他关键词或清除筛选'),h('ul',{},suggestionItems.map(item=>h('li',{},h('button',{type:'button',class:'hello-search-choice',onclick:()=>chooseSuggestion(item)},h('span',{class:'hello-search-kind'},suggestionKinds[item.kind]),h('span',{class:'hello-search-match-title'},h('strong',{},item.label),h('small',{},item.kind==='tune'?tuneCategory(data,item.label).label+' · '+item.detail:item.detail))),item.kind==='tune'?tuneButton(item.label):null))));
    suggestionList.hidden=false;search.setAttribute('aria-expanded','true');document.addEventListener('pointerdown',outsideSearch,true);if(searchPopover.matches(':popover-open'))positionSearch();
  }
  function updateQuery(){if(composing)return;state.query=search.value;state.part='';state.rhyme='';state.focus=null;refresh();showSuggestions();}
  const search=h('input',{type:'search',value:state.query,autocomplete:'off','aria-label':'搜索Hello书号、场景、童谣、曲调或文件','aria-controls':'hello-search-matches','aria-expanded':'false',placeholder:'输入关键词，匹配书号、场景、童谣…',oninput:e=>{if(!e.isComposing)updateQuery();},oncompositionstart:()=>{composing=true;},oncompositionend:()=>{composing=false;updateQuery();},onfocus:showSuggestions,onkeydown:event=>{if(composing||event.isComposing||event.keyCode===229)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSearch(true);}else if(event.key==='ArrowDown'){showSuggestions();const first=suggestionList.querySelector('.hello-search-choice');if(first){event.preventDefault();first.focus();}}else if(event.key==='Enter'&&!suggestionList.hidden&&suggestionItems.length){event.preventDefault();chooseSuggestion(suggestionItems[0]);}}});
  const searchField=h('div',{class:'hello-search-field',onfocusout:event=>{if(!searchField.contains(event.relatedTarget))closeSuggestions();}},search,suggestionList);
  const searchTrigger=h('button',{type:'button',class:'hello-search-toggle',popovertarget:'hello-search-popover','aria-label':'查找Hello素材',title:'查找书号、场景、童谣或曲调','aria-expanded':'false','aria-controls':'hello-search-popover'},h('span',{class:'hello-search-icon','aria-hidden':'true'}));
  const positionSearch=()=>{const rect=searchTrigger.getBoundingClientRect(),width=searchPopover.getBoundingClientRect().width;searchPopover.style.left=Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12))+'px';searchPopover.style.top=Math.max(8,Math.min(rect.bottom+5,window.innerHeight-searchPopover.getBoundingClientRect().height-8))+'px';};
  function closeSearch(restore=false){closeSuggestions();if(searchPopover.matches(':popover-open'))searchPopover.hidePopover();if(restore&&searchTrigger.isConnected)searchTrigger.focus({preventScroll:true});}
  const searchPopover=h('div',{id:'hello-search-popover',class:'hello-search-popover',popover:'auto',role:'search','aria-label':'Hello素材查找',onkeydown:event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSearch(true);}},ontoggle:event=>{const open=event.newState==='open';searchTrigger.setAttribute('aria-expanded',String(open));window.removeEventListener('resize',positionSearch);if(open){positionSearch();window.addEventListener('resize',positionSearch);search.focus({preventScroll:true});showSuggestions();}else closeSuggestions();}},h('div',{class:'hello-search-popover-head'},h('span',{},'查找素材'),h('button',{type:'button',class:'hello-search-clear',onclick:()=>{search.value='';updateQuery();search.focus();}},'清空关键词'),h('button',{type:'button',class:'hello-search-close','aria-label':'关闭Hello查找',onclick:()=>closeSearch(true)},'×')),searchField);
  const reset=action('↺',()=>{Object.assign(state,{book:'all',scene:'all',topic:'all',subtopic:'all',tune:'all',query:'',rhyme:'',part:'',focus:null});syncControls();refresh();},{'aria-label':'清除Hello全部筛选',title:'清除全部筛选',class:'hello-reset'});
  const viewTabs=h('div',{class:'hello-view-tabs',role:'tablist','aria-label':'Hello查看方式'},[['books','书册'],['scenes','场景'],['rhymes','童谣'],['graph','关系图']].map(([id,label])=>{const tab=h('button',{type:'button',id:'hello-tab-'+id,role:'tab','aria-controls':'hello-panel-'+id,'aria-selected':state.view===id?'true':'false',tabindex:state.view===id?'0':'-1',onclick:()=>{state.view=id;refresh();},onkeydown:e=>{const ids=[...tabs.keys()],index=ids.indexOf(id);let next;if(e.key==='ArrowRight')next=ids[(index+1)%ids.length];if(e.key==='ArrowLeft')next=ids[(index+ids.length-1)%ids.length];if(e.key==='Home')next=ids[0];if(e.key==='End')next=ids.at(-1);if(next){e.preventDefault();state.view=next;refresh();tabs.get(next).focus();}}},label);tabs.set(id,tab);return tab;}));
  for(const id of tabs.keys()){const panel=h('div',{class:'hello-results hello-view-'+id,id:'hello-panel-'+id,role:'tabpanel','aria-labelledby':'hello-tab-'+id});panels.set(id,panel);}
  function lazyDetails(className,title,content,open=false){let loaded=false;const details=h('details',{class:className,open,ontoggle:()=>{if(details.open&&!loaded){loaded=true;details.append(content());}}},h('summary',{},title));return details;}
  function videoLinks(b,includePdf=false){return h('div',{class:'hello-resource-links'},b.resources.filter(r=>['erin','official','notes'].includes(r.kind)||(includePdf&&r.kind==='pdf')).map(r=>link(({notes:'阅读指引',erin:'松果妈妈带读',official:'官方带读'})[r.kind]||r.label,r.url||r.file)));}
  const audioButton=(r,name=r.label)=>typeof window==='object'&&window.EnglishAudio?window.EnglishAudio.audioButton(r.file,name,{h,asset}):null;
  function packageVideoList(items){return items.length?h('div',{class:'hello-package-videos'},items.map(resource=>{
    const label=resource.role==='tune-demo'?'曲调视频':resource.role?.startsWith('extension')?'拓展视频':'配套视频',path=resource.url||resource.file;
    return path?h('a',{class:'hello-package-video',href:asset(path),target:'_blank',rel:'noopener noreferrer','aria-label':'查看'+resource.label,'aria-haspopup':'dialog',title:resource.mappingBasis,onclick:event=>event.stopPropagation()},h('span',{class:'hello-video-kind'},label),h('span',{},resource.label),h('span',{'aria-hidden':'true'},'▷')):null;
  })):null;}
  function partVideoButtons(b,p){return packageVideos(data,b,{partId:b.id+'-part-'+p.part}).map(resource=>h('a',{class:'hello-video-play',href:asset(resource.url||resource.file),target:'_blank',rel:'noopener noreferrer','aria-label':'播放视频：'+resource.label,'data-video-id':resource.id,'aria-haspopup':'dialog',title:'Part '+p.part+' · '+(resource.role==='tune-demo'?'曲调视频':resource.role?.startsWith('extension')?'拓展视频':'配套视频')+' · '+resource.label,onclick:event=>event.stopPropagation()},h('span',{'aria-hidden':'true'},'▷')));}
  function bookVideos(b){const items=packageVideos(data,b).filter(resource=>!(resource.partIds||[]).some(id=>b.parts.some(p=>id===b.id+'-part-'+p.part)));return items.length?lazyDetails('hello-files hello-package-video-group','尚未定位的视频',()=>h('div',{},items.map(resource=>h('div',{class:'hello-unmapped-video'},packageVideoList([resource]),h('p',{class:'small-note'},resource.mappingReview?.reason||resource.mappingBasis))))):null;}
  function audio(r){return h('div',{class:'hello-audio'},audioButton(r),h('span',{class:'hello-audio-name'},r.label));}
  function extraAudio(b){const files=supplementalAudio(data,b);return files.length?lazyDetails('hello-files hello-extra-audio','补充音频',()=>h('div',{class:'hello-file-list'},files.map(audio)),true):null;}
  function materialButton(item){const label=materialLabel(item),title=item.title.endsWith(' · '+label)?item.title.slice(0,-label.length-3):item.title,preview=item.preview||(/\.(?:png|jpe?g|webp)$/i.test(item.file||'')?item.file:null);return h('button',{type:'button',class:'hello-material-preview','data-action':'hello-material-preview','data-id':item.id,'aria-label':'放大查看'+label+'：'+item.title,'aria-haspopup':'dialog',title:'点击查看'+label},preview?h('img',{src:asset(preview),alt:'',width:40,height:54,loading:'lazy',decoding:'async'}):null,h('span',{},h('strong',{},label),h('span',{},title)));}
  function materialList(items){return items.length?h('div',{class:'hello-material-list'},items.map(materialButton)):null;}
  function bookMaterials(b){const all=materials(data,{bookId:b.id}),guides=new Set(all.filter(item=>item.origin==='notes-pdf'&&b.resources.some(r=>r.kind==='notes'&&r.file===item.file)).map(item=>item.id)),items=all.filter(item=>!(item.rhymeIds||[]).length&&!guides.has(item.id)&&!guides.has(item.duplicateOf));return items.length?lazyDetails('hello-materials',items.some(item=>item.type!=='vocabulary-card')?'词汇卡与配套资料':'词汇卡',()=>materialList(items),true):null;}
  const tuneLabel=r=>h('span',{class:'hello-tune-label'},h('span',{class:'hello-meta'},r.tunes.length?'套唱曲调':'唱法'),r.tunes.length&&r.card?.file?h('a',{class:'hello-tune-source',href:asset(r.card.file),'aria-label':'查看'+r.title+'的松果妈妈套唱建议原图',title:'松果妈妈建议的可选唱法；查看原图','aria-haspopup':'dialog'},'ⓘ'):null);
  function rhymeBody(b,r,extrasOnly=false){return h('div',{class:'hello-rhyme-body'},h('div',{class:'chips'},topicUI.tags(rhymeTopics(data,b,r)),Topics.entryActivities('hello-rhyme',r).includes('tpr')?h('span',{class:'chip activity-tag',title:'活动方式：听指令做动作'},'TPR'):null),topicUI.evidence('hello-rhyme',r),!extrasOnly&&(r.themes||[]).length?h('div',{class:'hello-rhyme-themes'},h('span',{class:'hello-meta'},'童谣主题'),r.themes.map(t=>chip(t,'scene',t,'rhymes'))):null,!extrasOnly?h('div',{class:'hello-tunes'},tuneLabel(r),r.tunes.length?orderedTunes(data,r.tunes,[r.id]).map(name=>tuneChip(name,true,[r.id])):h('span',{},'打节拍朗读')):null,materialList(materials(data,{bookId:b.id,rhymeId:r.id})),!extrasOnly?packageVideoList(packageVideos(data,b,{rhymeId:r.id})):null,r.extensions.length?h('details',{class:'hello-extensions'},h('summary',{},'拓展儿歌 · '+r.extensions.length),r.extensions.map(e=>h('div',{class:'hello-extension'},h('strong',{},e.title),h('div',{class:'hello-tunes'},tuneChip(e.tune,false))))):null,r.note?h('p',{class:'small-note'},r.note):null);}
  const versionAudio=(resource,title=resource.label,label=audioVariantLabel(resource))=>h('span',{class:'hello-audio-version'},h('span',{},label),audioButton(resource,title+' · '+label+' · '+resource.label));
  const partAudio=(b,p)=>audioVersions(audioResources(data,b,{partId:b.id+'-part-'+p.part}).filter(resource=>!(resource.rhymeIds||[]).length)).map(({resource,label})=>versionAudio(resource,p.title||p.scene,label));
  function partRhyme(b,r){const same=audioResources(data,b,{rhymeId:r.id});return h('article',{class:'hello-part-rhyme','data-rhyme-id':r.id},h('div',{class:'hello-part-rhyme-title'},h('strong',{},r.title),h('span',{class:'hello-rhyme-kind'},r.entryKind==='adapted-activity'?'带读改编':'Hello童谣'),audioVersions(same).map(({resource,label})=>versionAudio(resource,r.title,label))),h('div',{class:'hello-tunes'},tuneLabel(r),r.tunes.length?orderedTunes(data,r.tunes,[r.id]).map(name=>tuneChip(name,true,[r.id])):h('span',{class:'hello-meta'},'打节拍朗读')),lazyDetails('hello-rhyme-more','歌词与拓展',()=>rhymeBody(b,r,true),true));}
  function partBlock(b,p){return h('section',{class:'hello-part','data-part':p.part},h('div',{class:'hello-part-heading'},h('strong',{},'Part '+p.part),chip(p.scene,'scene',p.scene,'scenes'),p.title&&!partRhymes(data,b,p).some(r=>normalize(r.title)===normalize(p.title))?h('span',{class:'hello-part-title'},p.title):null,partVideoButtons(b,p),partAudio(b,p),p.note?h('span',{class:'hello-meta'},p.note):null),partRhymes(data,b,p).map(r=>partRhyme(b,r)));}
  function bookCard(b){const partsText=h('p',{}),partNodes=b.parts.map(p=>partBlock(b,p)),unmapped=data.rhymes.filter(r=>r.bookId===b.id&&!(r.partIds||[]).length);const card=h('details',{class:'hello-book','data-book-id':b.id,open:state.openBooks.get(b.id)||false,ontoggle:e=>{if(e.currentTarget.isConnected)state.openBooks.set(b.id,e.currentTarget.open);}},h('summary',{},cover(b),h('div',{class:'hello-book-summary'},h('div',{class:'hello-book-title'},bookTitle(b),videoLinks(b)),partsText)),h('div',{class:'hello-book-body'},h('div',{class:'hello-parts'},partNodes),unmapped.length?lazyDetails('hello-unmapped-rhymes','本册其他童谣',()=>h('div',{},unmapped.map(r=>partRhyme(b,r)))):null,bookVideos(b),extraAudio(b),bookMaterials(b)));card.helloPartsText=partsText;card.helloPartNodes=partNodes;return card;}
  function sceneCard(b,p){return h('article',{class:'hello-scene-card','data-book-id':b.id,'data-part':p.part},h('div',{class:'hello-card-heading'},action(cover(b),()=>showBook(b),{class:'hello-cover-button','aria-label':'查看'+b.title+'全部资源'}),h('div',{},h('div',{class:'hello-part-heading'},h('h3',{},p.title||p.scene),partVideoButtons(b,p),partAudio(b,p)),h('div',{class:'hello-meta'},bookTitle(b),' · Part '+p.part+' · '+p.scene)),action('整册',()=>showBook(b),{'aria-label':'查看'+b.title+'全部资源'})),p.note?h('p',{},p.note):null,videoLinks(b),partRhymes(data,b,p).map(r=>partRhyme(b,r)));}
  function rhymeCard(b,r){return h('article',{class:'hello-rhyme-card','data-book-id':b.id,'data-rhyme-id':r.id},h('div',{class:'hello-card-heading'},action(cover(b),()=>showBook(b),{class:'hello-cover-button','aria-label':'查看'+b.title+'全部资源'}),h('div',{},h('div',{class:'hello-part-rhyme-title'},h('h3',{},r.title),h('span',{class:'hello-rhyme-kind'},r.entryKind==='adapted-activity'?'带读改编':'Hello童谣'),audioVersions(audioResources(data,b,{rhymeId:r.id})).map(({resource,label})=>versionAudio(resource,r.title,label))),h('p',{class:'hello-meta'},bookTitle(b))),action('整册',()=>showBook(b),{'aria-label':'查看'+b.title+'全部资源'})),rhymeBody(b,r),h('details',{class:'hello-rhyme-context'},h('summary',{},'书册场景与带读'),h('div',{class:'hello-context-scenes'},b.parts.filter(p=>(r.partIds||[]).includes(b.id+'-part-'+p.part)).map(p=>chip('Part '+p.part+' · '+p.scene,'scene',p.scene,'scenes'))),videoLinks(b)) );}
  for(const b of data.books){const card=bookCard(b);cards.books.set(b.id,card);panels.get('books').append(card);for(const p of b.parts){const key=b.id+':'+p.part,card=sceneCard(b,p);cards.scenes.set(key,card);panels.get('scenes').append(card);}for(const r of data.rhymes.filter(r=>r.bookId===b.id)){const card=rhymeCard(b,r);cards.rhymes.set(r.id,card);panels.get('rhymes').append(card);}}
  function graphSelect(selection){const {type,id,value}=selection||{};Object.assign(state,{book:'all',scene:'all',tune:'all',query:'',rhyme:'',part:'',focus:selection});if(type==='book'){state.book=id||value;}if(type==='part'){state.part=id;state.book=selection.bookId;}if(type==='scene'){state.scene=value||id?.replace(/^scene:/,'');}if(type==='tune'){state.tune=value||id?.replace(/^tune:/,'');}if(type==='rhyme'){state.rhyme=id||value;const r=data.rhymes.find(r=>r.id===state.rhyme);if(r)state.book=r.bookId;}syncControls();refresh(true);}
  function refresh(keepGraph=false){searchTrigger.classList.toggle('active',!!normalize(state.query));searchTrigger.title=state.query?'正在查找：'+state.query:'查找书号、场景、童谣或曲调';const found=browse(data,state),rows=found.books,bookIds=new Set(rows.map(row=>row.book?.id)),partIds=new Set(found.scenes.map(row=>row.book.id+':'+row.part.part)),rhymeIds=new Set(found.rhymes.map(row=>row.rhyme.id));
    for(const [id,card] of cards.books){card.hidden=!bookIds.has(id);if(!card.hidden){const row=rows.find(row=>row.book.id===id);card.helloPartsText.textContent=row.parts.map(p=>'P'+p.part+' '+p.scene).join(' · ');for(const part of card.helloPartNodes)part.hidden=!row.parts.some(p=>String(p.part)===part.dataset.part);}}
    for(const [id,card] of cards.scenes)card.hidden=!partIds.has(id);
    for(const [id,card] of cards.rhymes)card.hidden=!rhymeIds.has(id);
    for(const [id,tab] of tabs){const selected=state.view===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;panels.get(id).hidden=!selected;}
    const count=state.view==='books'?rows.length+'本书':state.view==='scenes'?found.scenes.length+'个Part · '+bookIds.size+'本书':state.view==='rhymes'?found.rhymes.length+'首童谣 · '+new Set(found.rhymes.map(row=>row.book.id)).size+'本书':rows.length+'本书的关联';
    active.replaceChildren(h('span',{},[count,state.topic!=='all'?Topics.label(state.topic):'',state.subtopic!=='all'?Topics.label(state.subtopic):'',state.scene!=='all'?(state.view==='rhymes'?'童谣主题：':'书册场景：')+state.scene:'',state.rhyme?data.rhymes.find(r=>r.id===state.rhyme)?.title:''].filter(Boolean).join(' · ')),...(state.tune!=='all'?[h('span',{class:'hello-tune-choice','data-tune-suggested':String(tuneIsSuggested(data,state.tune,found.rhymes.map(row=>row.rhyme.id))),'data-tune-highlighted':String(tuneIsHighlighted(data,state.tune,found.rhymes.map(row=>row.rhyme.id)))},' · 套唱：',tuneBadge(state.tune),state.tune,tuneButton(state.tune),tunePages(state.tune))]:[]));
    const panel=panels.get(state.view);if(state.view==='graph'&&!keepGraph){const module=typeof window==='object'&&window.EnglishHelloGraph;panel.replaceChildren(module?module.render(topicGraphData(data,state),{h,asset,onSelect:graphSelect,onMaterialPreview,filters:{...state}}):h('p',{class:'small-note'},'关系图正在加载，请先按书册、场景或童谣查找。'));}
    const total=state.view==='books'?rows.length:state.view==='scenes'?found.scenes.length:state.view==='rhymes'?found.rhymes.length:rows.length;if(total===0)panel.append(empty);else if(empty.isConnected)empty.remove();
  }
  const sceneSource=data.sources.find(source=>source.id==='scenes');
  const topicControl=topicUI.picker({id:'hello-topic',topic:state.topic,subtopic:state.subtopic,onchange:(topic,subtopic)=>{state.topic=topic;state.subtopic=subtopic;state.part='';state.rhyme='';state.focus=null;syncControls();refresh();}}),topicLabel=h('span',{},'主题');
  const topicTrigger=h('summary',{'aria-label':'筛选Hello一级主题与二级分类',onkeydown:event=>{if(event.key==='ArrowDown'){event.preventDefault();topicPicker.open=true;topicControl.element.querySelector('select')?.focus();}}},topicLabel,h('span',{'aria-hidden':'true'},'⌄'));
  const topicCleanup=()=>{document.removeEventListener('pointerdown',outsideTopic,true);document.removeEventListener('keydown',escapeTopic,true);};
  const closeTopic=restore=>{topicPicker.open=false;topicCleanup();if(restore&&topicTrigger.isConnected)topicTrigger.focus();};
  const outsideTopic=event=>{if(!topicPicker.isConnected||!topicPicker.contains(event.target))closeTopic(false);};
  const escapeTopic=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeTopic(true);}};
  const topicPicker=h('details',{class:'hello-topic-picker',ontoggle:()=>{topicCleanup();if(topicPicker.open){document.addEventListener('pointerdown',outsideTopic,true);document.addEventListener('keydown',escapeTopic,true);}}},topicTrigger,h('div',{class:'hello-topic-menu'},topicControl.element,h('label',{class:'hello-original-scene'},h('span',{},'原始场景'),select('scene','场景',[['all','全部原始场景'],...choices.scenes.map(s=>[s,s])])),h('p',{class:'hello-meta'},'一级包含全部二级；原始场景名称保持不变。')));
  const sceneFilter=h('div',{class:'hello-scene-filter'},topicPicker,sceneSource?h('a',{class:'hello-scene-source',href:asset(sceneSource.file||sceneSource.url),target:'_blank',rel:'noopener noreferrer','aria-label':'查看原始场景汇总PDF',title:'查看原始场景汇总PDF'},h('span',{'aria-hidden':'true'},'PDF')):null);
  root.append(viewTabs,h('div',{class:'hello-filter-row'},sceneFilter,bookPicker(),tunePicker(),searchTrigger,reset),searchPopover,active,...panels.values(),
    h('details',{class:'hello-sources'},h('summary',{},'资料依据'),h('p',{},data.attribution),h('p',{},data.tuneNote),h('p',{},data.tuneAudio?.repertoireNote),h('details',{},h('summary',{},'慢葫芦页码图例'),soundBookLegend()),h('p',{},'Part标题与童谣归属依据逐页带读笔记核对，原场景汇总存在冲突时保留原标注及更正依据。演唱音频按明确同名童谣关联；建议曲调与演唱分别保留，童谣主题不借整册其他场景推断。'),h('p',{},'文件名后的大小、页数与时长已从阅读界面省略；原始资源与来源依据仍保留。'),data.sources.map(s=>h('p',{},link(s.title,s.file))),(data.supplements||[]).map(s=>h('p',{},link(s.label,s.url))),data.assetInventory?h('p',{},data.assetInventory.mappingNote):null,data.materialCards?.mappingNote?h('p',{},data.materialCards.mappingNote):null,h('p',{class:'small-note'},'核对：'+data.checkedAt+'。极空间分享最长180天、最多1000次访问。')));
  syncControls();refresh();return root;
}
return {normalize,numberedBookId,toggleBook,bookPdf,searchMatches,searchSuggestions,orderedTunes,tuneIsPackage,tuneIsHighlighted,tuneCategory,tuneIsSuggested,soundBookMatches,materials,materialLabel,options,partRhymes,partTopics,rhymeTopics,topicGraphData,packageVideos,audioResources,supplementalAudio,audioVariantLabel,audioVersions,filter,graph,browse,render};
});
