(function(root){
'use strict';
// 阅读筛选和开合只留在内存，不参与路线、个人记录或同步。
const state={query:'',limits:new Map()};
const folds=new Map();
function filter(data,{stage='all',query=''}={}){
  const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return data.books.filter(book=>(stage==='all'||String(book.stage)===String(stage))&&words.every(word=>[book.title,...book.references.map(ref=>ref.original),...book.notes].join(' ').toLowerCase().includes(word)));
}
function reviewFor(data,book){return data.reviews.filter(review=>book.references.some(ref=>ref.week>=review.fromWeeks[0]&&ref.week<=review.fromWeeks[1]));}
function packageLabel(book){
  const nas=book.package.shares||[];
  if(nas.length)return nas.every(share=>share.empty)?'极空间空目录':(book.media.some(m=>m.kind==='audio')?'可播放音频 · 极空间资料':'极空间资料');
  return book.package.status==='not-found'?'本地未找到目录':'本地目录已找到';
}
function mediaLinks(book,{h,asset,compact=false}){
  const audio=book.media.find(media=>media.kind==='audio'),pdf=book.media.find(media=>media.kind==='pdf');
  const shares=(book.package.shares||[]).filter(share=>!share.empty);
  const link=(href,label,text)=>h('a',{href,class:compact?'liao-media-button':'text-link','aria-label':label,title:label},text);
  return h('div',{class:compact?'liao-row-actions':'liao-media-links'},
    audio?root.EnglishAudio.audioButton(audio.file,book.title+' · 英文音频',{h,asset}):null,
    compact?(pdf?link(asset(pdf.file),'阅读'+book.title+'的PDF','▤'):null):book.media.filter(media=>media.kind!=='audio').map(media=>h('a',{href:asset(media.file),class:'text-link',download:media.kind==='document'?media.label:null},media.label)),
    shares.map((share,index)=>link(share.url,'在当前页查看'+book.title+(shares.length>1?'第'+(index+1)+'章':'')+'的极空间资料',shares.length>1?(index+1)+'章':'资料 ↗')));
}
function render(data,ui){
  const {h,icon,popover,asset,onResource,sourceBtn}=ui;
  const area=h('section',{class:'liao-reading','aria-label':'廖彩杏书单'});
  function button(label,action,attrs={}){return h('button',{type:'button',class:'button',...attrs,onclick:action},label);}
  function bookButton(id){const book=data.books.find(book=>book.id===id);return button(book.title,()=>onResource(book.id),{class:'text-link','aria-label':'查看'+book.title});}
  function fold(id,title,body){return h('details',{class:'reading-fold liao-fold',open:folds.get(id)||false,ontoggle:e=>{if(e.currentTarget.isConnected)folds.set(id,e.currentTarget.open);}},h('summary',{},title),h('div',{class:'reading-fold-body'},body));}
  function evidence(ref){return ref.page?sourceBtn(ref.sourceId,ref.page,ref.locator||'核对原页'):h('p',{class:'small-note'},ref.locator,ref.quote?' · '+ref.quote:null);}
  function info(){return h('div',{},h('p',{},data.scope),h('h3',{},'资料包核对'),h('p',{},'极空间102个目录对应100部作品，其中'+data.packageSummary.nasContentWorkCount+'部目录有内容、'+data.packageSummary.nasEmptyWorkCount+'部为空。鹅妈妈三章按一部作品计。本地另找到88个目录，对应86部作品。'),h('p',{},data.packageSummary.note),h('h3',{},'阶段与等级'),h('p',{},data.levelNote),h('p',{},data.ageNote),sourceBtn('liao-book-source',37,'适读年龄说明 · 纸页72–73'),h('h3',{},'原资料与核对边界'),data.sources.map(source=>h('div',{},h('p',{},source.title),h('p',{class:'small-note'},source.note),h('a',{class:'text-link',href:asset(source.file),download:source.file.split('/').pop()},'下载原资料'))),h('p',{class:'small-note'},'核对：'+data.checkedAt));}
  function bookRow(book){return h('li',{'data-liao-id':book.id},h('span',{class:'liao-order',title:'参考表首次引入顺序'},String(book.order).padStart(2,'0')),button([book.cover?h('img',{src:asset(book.cover),alt:'',loading:'lazy'}):null,h('span',{},ui.name(book.title),h('small',{},'第'+book.references[0].week+'周'+(book.references.length>1?'起，分3章':'')+((book.package.shares||[]).every(share=>share.empty)?' · 暂无资料':'')))],()=>onResource(book.id),{class:'liao-book-link',id:'liao-open-'+book.id,'aria-label':'查看'+book.title+'的书单与资料核对'}),mediaLinks(book,{h,asset,compact:true}));}
  function stageBody(stage,books){
    const limit=state.limits.get(stage.id)||18,visible=books.slice(0,limit);
    const body=h('div',{class:'liao-stage-body'},h('p',{class:'small-note liao-review'},data.reviews.filter(review=>review.weeks[0]>=stage.weeks[0]&&review.weeks[1]<=stage.weeks[1]).map(review=>review.weeks.join('–')+'周复习'+review.fromWeeks.join('–')+'周').join('；')),h('ol',{class:'liao-book-list'},visible.map(bookRow)));
    if(visible.length<books.length)body.append(button('再看'+(books.length-visible.length)+'本',()=>{state.limits.set(stage.id,limit+18);const next=stageBody(stage,books);body.replaceWith(next);next.querySelectorAll('.liao-book-link')[visible.length]?.focus({preventScroll:true});},{class:'button liao-more'}));
    return body;
  }
  function results(){
    const books=filter(data,state);
    return h('div',{class:'liao-results'},h('p',{class:'result-count',role:'status'},state.query?'找到'+books.length+'本参考书目':'按阶段展开书单 · 阶段只表示周次'),books.length?data.stages.map(stage=>{
      const matched=books.filter(book=>book.stage===stage.number);if(!matched.length)return null;
      const open=state.query?true:(folds.has(stage.id)?folds.get(stage.id):stage.number===1);
      return h('details',{class:'liao-stage',open,ontoggle:e=>{if(e.currentTarget.isConnected&&!state.query)folds.set(stage.id,e.currentTarget.open);}},h('summary',{},h('strong',{},stage.title+' · '+stage.weeks.join('–')+'周'),h('span',{},matched.length+'本 · '+matched.filter(book=>(book.package.shares||[]).some(share=>!share.empty)).length+'部有资料')),stageBody(stage,matched));
    }):h('p',{class:'empty'},'没有匹配的书目，请调整关键词。'));
  }
  function refreshResults(){area.querySelector('.liao-results').replaceWith(results());}
  function guidance(){return fold('liao-guidance','指导书：选书与聆听思路',h('div',{},h('p',{class:'small-note'},'以下是指导PDF的建议，不是资料包分类，也不与参考表逐项绑定。'),sourceBtn('liao-book-source',14,'循环聆听与弹性安排 · 纸页26–27'),h('div',{class:'liao-groups'},data.guidanceTopics.map(group=>fold(group.id,group.title,h('div',{},h('p',{},group.summary),group.sources.map(evidence))))),data.recommendations.map(relation=>h('article',{class:'liao-recommendation'},h('h4',{},relation.title),h('p',{class:'small-note'},relation.note),h('div',{class:'liao-recommendation-books'},h('p',{},'从这两本入门'),relation.from.map(bookButton),h('p',{},'再接续'),relation.to.map(bookButton)),fold(relation.id,'原话与出处',relation.sources.map(ref=>h('div',{},h('p',{},ref.quote),evidence(ref))))))));}
  const search=h('input',{id:'liao-query',type:'search',value:state.query,placeholder:'书名、英文名或原表写法','aria-label':'搜索廖彩杏书目',oninput:e=>{if(e.isComposing)return;state.query=e.target.value;state.limits.clear();refreshResults();},oncompositionend:e=>{state.query=e.target.value;state.limits.clear();refreshResults();}});
  area.append(h('div',{class:'liao-heading'},h('p',{},'100本 · '+data.packageSummary.nasContentWorkCount+'部有资料'),h('div',{class:'liao-controls'},popover('liao-search','搜索廖彩杏书目',icon('search'),h('div',{class:'library-search-box'},search),!!state.query),button(icon('close'),()=>{state.query='';state.limits.clear();search.value='';refreshResults();},{class:'library-filter-button','aria-label':'清除廖彩杏搜索',title:'清除搜索'}),popover('liao-info','廖彩杏资料与等级说明',icon('info'),info()))),results(),guidance(),fold('liao-stage-basis','周次编排与复习出处',h('div',{},h('p',{},data.stages[0].basis),data.stages.map(stage=>h('p',{class:'small-note'},stage.title+' · '+stage.sources[0].locator)),data.reviews.map(review=>evidence(review.evidence)))));
  return area;
}
function detail(data,book,{h,sourceBtn,onResource,fold,asset}){
  const reviews=reviewFor(data,book),inventory=book.package;
  function refLink(ref){return sourceBtn(ref.sourceId,ref.page,ref.locator);}
  return h('section',{class:'liao-detail'},h('h3',{},'52周参考书单'),h('p',{},'首次引入顺序 '+book.order+' / 100 · 第'+book.stage+'阶段'),h('p',{},'首次引入：'+book.references.map(ref=>'第'+ref.week+'周'+(ref.chapter?' · Chapter '+ref.chapter:'')).join('；')),reviews.length?h('p',{class:'small-note'},'复习安排：'+reviews.map(review=>'第'+review.weeks.join('–')+'周复习第'+review.fromWeeks.join('–')+'周的书单').join('；')):null,
    h('h3',{},'阅读与收听'),mediaLinks(book,{h,asset}),h('p',{class:'small-note'},(inventory.shares||[]).every(share=>share.empty)?'极空间目录为空，暂未找到可用文件。':'大文件打开极空间原分享页；小文件直接阅读或播放。分享有效180天，最多1000次访问。'),fold('liao-inventory-'+book.id,'本地资料核对',h('div',{},h('p',{},inventory.status==='not-found'?'本次在四阶段资料包中未找到对应目录。':Object.entries(inventory.formats).map(([format,count])=>format.toUpperCase()+' '+count+'个').join(' · ')),inventory.directories.map(directory=>h('div',{class:'liao-evidence-row'},h('p',{class:'small-note'},directory.label),directory.note?h('p',{},directory.note):null)),h('p',{class:'small-note'},data.packageSummary.note))),book.notes.map(note=>h('p',{class:'small-note'},note)),
    data.recommendations.filter(relation=>[...relation.from,...relation.to].includes(book.id)).map(relation=>fold('liao-advice-'+book.id,'指导书建议：'+relation.title,h('div',{},h('p',{},relation.note),[...relation.from,...relation.to].filter(id=>id!==book.id).map(id=>h('button',{type:'button',class:'text-link',id:'liao-related-'+id,onclick:()=>onResource(id)},data.books.find(item=>item.id===id).title)),relation.sources.map(refLink)))),
    fold('liao-evidence-'+book.id,'逐项原文与出处',h('div',{},(inventory.shares||[]).map(share=>h('div',{},h('p',{class:'small-note'},share.folder+' · '+(share.empty?'空目录':'已核对分享目录首层内容')),(share.fileNames||[]).map(name=>h('p',{class:'small-note'},name)),share.note?h('p',{class:'small-note'},share.note):null)),book.media.filter(m=>m.kind==='audio').map(m=>h('p',{class:'small-note'},m.sourceName+' · '+m.selectionBasis)),h('p',{class:'small-note'},data.levelNote),book.references.map(ref=>h('div',{class:'liao-evidence-row'},h('p',{},ref.original),h('p',{class:'small-note'},'Excel括号内编号 '+ref.planNumber+' · '+ref.locator))),h('p',{class:'small-note'},'指导书书末编号 '+book.number+'；仅用于书名与封面出处，不代表资料包编号。'),book.sources.map(refLink),reviews.map(review=>h('p',{class:'small-note'},review.evidence.quote+' · '+review.evidence.locator)),book.coverEvidence?h('p',{class:'small-note'},book.coverEvidence):null,h('a',{class:'text-link',href:asset('assets/liao/52-weeks.xls'),download:'52-weeks.xls'},'下载52周参考表'))));
}
const api={filter,reviewFor,packageLabel,render,detail};root.EnglishLiao=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
