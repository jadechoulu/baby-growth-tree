(function(root){
'use strict';
// 阅读筛选和开合只留在内存，不参与路线、个人记录或同步。
const state={query:'',mode:'picture',limits:new Map()};
const folds=new Map();
function books(data){return data.books.concat(data.supplementaryBooks||[]);}
function findBook(data,id){return books(data).find(book=>book.id===id);}
function pictureEntry(data,id){return data.pictureBooklist.entries.find(entry=>entry.bookId===id);}
function filter(data,{stage='all',query='',order='plan'}={}){
  const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const ordered=order==='picture'?data.pictureBooklist.entries.map(entry=>findBook(data,entry.bookId)):data.books;
  return ordered.filter(book=>(stage==='all'||String(book.stage)===String(stage))&&words.every(word=>[book.title,...book.references.map(ref=>ref.original),...book.notes].join(' ').toLowerCase().includes(word)));
}
function reviewFor(data,book){return data.reviews.filter(review=>book.references.some(ref=>ref.week>=review.fromWeeks[0]&&ref.week<=review.fromWeeks[1]));}
function packageLabel(book){
  if(book.package.status==='unchecked')return '资料待核对';
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
  function bookButton(id){const book=findBook(data,id);return button(book.title,()=>onResource(book.id),{class:'text-link','aria-label':'查看'+book.title});}
  function fold(id,title,body){return h('details',{class:'reading-fold liao-fold',open:folds.get(id)||false,ontoggle:e=>{if(e.currentTarget.isConnected)folds.set(id,e.currentTarget.open);}},h('summary',{},title),h('div',{class:'reading-fold-body'},body));}
  function evidence(ref){return ref.page?sourceBtn(ref.sourceId,ref.page,ref.locator||'核对原页'):h('p',{class:'small-note'},ref.locator,ref.quote?' · '+ref.quote:null);}
  function info(){return h('div',{},h('p',{},data.scope),h('h3',{},'新旧版本与周计划'),data.pictureBooklist.differences.map(text=>h('p',{},text)),sourceBtn('liao-picture-source',1,'核对文章全部配图'),h('h3',{},'资料包核对'),h('p',{},'原100部中，极空间102个目录对应100部作品，'+data.packageSummary.nasContentWorkCount+'部目录有内容、'+data.packageSummary.nasEmptyWorkCount+'部为空。鹅妈妈三章按一部作品计。后续新增30本的实际文件接入情况见各书资料详情。'),h('p',{},data.packageSummary.note),h('h3',{},'阶段与等级'),h('p',{},data.levelNote),h('p',{},data.ageNote),sourceBtn('liao-book-source',37,'适读年龄说明 · 纸页72–73'),h('h3',{},'原资料与核对边界'),data.sources.map(source=>h('div',{},h('p',{},source.title),h('p',{class:'small-note'},source.note),h('a',{class:'text-link',href:asset(source.file),...(/^https?:/.test(source.file)?{target:'_blank',rel:'noopener noreferrer'}:{download:source.file.split('/').pop()})},/^https?:/.test(source.file)?'查看原文章 ↗':'下载原资料'))),h('p',{class:'small-note'},'核对：'+data.checkedAt));}
  function bookRow(book){
    const picture=state.mode==='picture',number=picture?pictureEntry(data,book.id).number:book.order;
    const subtitle=book.references.length?'第'+book.references[0].week+'周'+(book.references.length>1?'起，分3章':''): '新增';
    return h('li',{class:'library-book-row liao-book-card','data-liao-id':book.id},
      button([book.cover?h('span',{class:'library-book-cover'},h('img',{src:asset(book.cover),alt:'',loading:'lazy'})):null,h('span',{},ui.name(book.title))],()=>onResource(book.id),{class:'liao-book-link',id:'liao-open-'+book.id,'aria-label':'查看'+book.title+'的书单与资料核对','aria-haspopup':'dialog'}),
      h('div',{class:'liao-card-meta'},h('span',{class:'liao-order',title:picture?'文章配图编号':'参考表首次引入顺序'},String(number).padStart(2,'0')),h('small',{},subtitle+(book.package.status!=='unchecked'&&(book.package.shares||[]).every(share=>share.empty)?' · 暂无资料':''))),mediaLinks(book,{h,asset,compact:true}));
  }
  function groupBody(group,matched){
    const limit=state.limits.get(group.id)||18,visible=matched.slice(0,limit);
    const review=group.weeks?data.reviews.filter(review=>review.weeks[0]>=group.weeks[0]&&review.weeks[1]<=group.weeks[1]).map(review=>review.weeks.join('–')+'周复习'+review.fromWeeks.join('–')+'周').join('；'):'';
    const body=h('div',{class:'liao-stage-body'},review?h('p',{class:'small-note liao-review'},review):null,h('ol',{class:'liao-book-list library-book-list library-book-cover-grid'},visible.map(bookRow)));
    if(visible.length<matched.length)body.append(button('继续查看 · 余'+(matched.length-visible.length)+'本',()=>{state.limits.set(group.id,limit+18);const next=groupBody(group,matched);body.replaceWith(next);next.querySelectorAll('.liao-book-link')[visible.length]?.focus({preventScroll:true});},{class:'button liao-more'}));
    return body;
  }
  function results(){
    const picture=state.mode==='picture',matched=filter(data,{query:state.query,order:picture?'picture':'plan'}),groups=picture?data.pictureBooklist.groups:data.stages;
    return h('div',{class:'liao-results'},h('p',{class:'result-count',role:'status'},state.query?'找到'+matched.length+'本参考书目':picture?'按正文配图编号排列 · 主题编号沿用原图，不是难度等级':'按首次引入周次排列 · 四阶段只表示周次'),matched.length?groups.map((group,index)=>{
      const groupBooks=matched.filter(book=>picture?(pictureEntry(data,book.id).number>=group.range[0]&&pictureEntry(data,book.id).number<=group.range[1]):book.stage===group.number);if(!groupBooks.length)return null;
      const open=state.query?true:(folds.has(group.id)?folds.get(group.id):index===0);
      return h('details',{class:'liao-stage',open,ontoggle:e=>{if(e.currentTarget.isConnected&&!state.query)folds.set(group.id,e.currentTarget.open);}},h('summary',{},h('strong',{},group.title+' · '+(picture?group.range.join('–')+'号':group.weeks.join('–')+'周')),h('span',{},groupBooks.length+'本 · '+(groupBooks.every(book=>book.editionAddition)?groupBooks.length+'本新增':groupBooks.filter(book=>(book.package.shares||[]).some(share=>!share.empty)).length+'部有资料'))),groupBody(group,groupBooks));
    }):h('p',{class:'empty'},'没有匹配的书目，请调整关键词。'));
  }
  function refreshResults(){area.querySelector('.liao-results').replaceWith(results());}
  function method(){
    const m=data.method;
    const branches=m.branches.map(branch=>{
      const label='核对原书依据：'+branch.title,source=sourceBtn('liao-book-source',branch.page,label);
      source.replaceChildren(icon('source'));source.setAttribute('aria-label',label);source.title=label;
      return h('li',{},h('div',{class:'liao-map-heading'},h('strong',{},branch.title),source),h('p',{},branch.text));
    });
    return h('section',{class:'liao-method','aria-label':'廖彩杏理念与使用方法'},h('h3',{},'这些素材怎么用'),h('p',{},m.dailyBrief),h('p',{},m.rotationBrief),
      fold('liao-method-map','理念与使用路径 · 思维导图',h('div',{},h('p',{class:'small-note'},m.basis),h('div',{class:'liao-mindmap'},h('p',{class:'liao-map-root'},'优质有声书 + 规律重复 + 轻松吸收'),h('ol',{},branches)),h('p',{class:'small-note'},'这是本站整理的使用路径；轮换与复习反复循环，不是按能力考试逐级通关。'))),
      fold('liao-method-steps','每天的步骤、音频用法与换书判断',h('div',{},h('p',{class:'small-note'},m.basis),m.sections.map(section=>h('section',{class:'liao-method-section'},h('h4',{},section.title),h('ul',{},section.points.map(point=>h('li',{},point))),fold(section.id,'原话与页码',section.sources.map(ref=>h('div',{},h('p',{class:'small-note'},'“'+ref.quote+'”'),evidence(ref)))))),h('article',{class:'liao-method-example'},h('h4',{},m.example.title),h('p',{class:'small-note'},m.example.label),h('ol',{},m.example.steps.map(step=>h('li',{},step))),bookButton(m.example.bookId),m.example.sources.map(evidence)))));
  }
  function guidance(){return fold('liao-guidance','指导书五章：选书思路与具体建议',h('div',{},h('p',{class:'small-note'},'以下是指导PDF的章节思路，不是资料包分类，也不与参考表或图示主题逐项绑定。'),h('div',{class:'liao-groups'},data.guidanceTopics.map(group=>fold(group.id,group.title,h('div',{},h('p',{},group.summary),group.sources.map(evidence))))),data.recommendations.map(relation=>h('article',{class:'liao-recommendation'},h('h4',{},relation.title),h('p',{class:'small-note'},relation.note),h('div',{class:'liao-recommendation-books'},h('p',{},'从这两本入门'),relation.from.map(bookButton),h('p',{},'再接续'),relation.to.map(bookButton)),fold(relation.id,'原话与出处',relation.sources.map(ref=>h('div',{},h('p',{},ref.quote),evidence(ref))))))));}
  const search=h('input',{id:'liao-query',type:'search',value:state.query,placeholder:'书名、英文名或原表写法','aria-label':'搜索廖彩杏书目',oninput:e=>{if(e.isComposing)return;state.query=e.target.value;state.limits.clear();refreshResults();},oncompositionend:e=>{state.query=e.target.value;state.limits.clear();refreshResults();}});
  const modeButtons=['picture','plan'].map(mode=>button(mode==='picture'?'图示顺序 · 130本':'52周安排 · 100部',()=>{state.mode=mode;modeButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(['picture','plan'][i]===mode)));refreshResults();},{class:'liao-mode-button','aria-pressed':String(state.mode===mode)}));
  area.append(h('div',{class:'liao-heading'},h('p',{},'130本 · '+data.packageSummary.nasContentWorkCount+'部有资料 · 30本新增'),h('div',{class:'liao-controls'},popover('liao-search','搜索廖彩杏书目',icon('search'),h('div',{class:'library-search-box'},search),!!state.query),button(icon('close'),()=>{state.query='';state.limits.clear();search.value='';refreshResults();},{class:'library-filter-button','aria-label':'清除廖彩杏搜索',title:'清除搜索'}),popover('liao-info','廖彩杏资料与等级说明',icon('info'),info()))),
    h('div',{class:'liao-mode-switch',role:'group','aria-label':'书单排列方式'},modeButtons),method(),results(),guidance(),fold('liao-stage-basis','周次编排与复习出处',h('div',{},h('p',{},data.stages[0].basis),data.stages.map(stage=>h('p',{class:'small-note'},stage.title+' · '+stage.sources[0].locator)),data.reviews.map(review=>evidence(review.evidence)))));
  return area;
}
function detail(data,book,{h,sourceBtn,onResource,fold,asset}){
  const reviews=reviewFor(data,book),inventory=book.package,entry=pictureEntry(data,book.id),unchecked=inventory.status==='unchecked';
  function refLink(ref){return sourceBtn(ref.sourceId,ref.page,ref.locator);}
  return h('section',{class:'liao-detail'},h('h3',{},'图示顺序与52周安排'),h('p',{},'正文配图 '+entry.number+' / 130'),refLink(entry),
    book.references.length?h('div',{},h('p',{},'52周表首次引入顺序 '+book.order+' / 100 · 第'+book.stage+'阶段'),h('p',{},'首次引入：'+book.references.map(ref=>'第'+ref.week+'周'+(ref.chapter?' · Chapter '+ref.chapter:'')).join('；'))):h('p',{},'新增 · 出版社后续扩充书目，较早版本的100部52周计划表未包含本书。'),
    reviews.length?h('p',{class:'small-note'},'复习安排：'+reviews.map(review=>'第'+review.weeks.join('–')+'周复习第'+review.fromWeeks.join('–')+'周的书单').join('；')):null,
    h('h3',{},'阅读与收听'),mediaLinks(book,{h,asset}),h('p',{class:'small-note'},unchecked?'资料库存尚未核对，暂不提供未确认的文件或分享。':(inventory.shares||[]).every(share=>share.empty)?'极空间目录为空，暂未找到可用文件。':'大文件打开极空间原分享页；小文件直接阅读或播放。分享有效180天，最多1000次访问。'),
    fold('liao-use-'+book.id,'这本怎么听，何时换下一本',h('div',{},h('p',{},data.method.rotationSummary),h('p',{},'核对音频与绘本版本，先轻松听；熟悉后可邀请跟念，不强制边听边看或指字。JY的朗读、歌唱、回声跟念是录音形式，本站精选文件不保证三种俱全。'),sourceBtn('liao-book-source',27,'吸收、重复与跟念 · 纸页52–53'),sourceBtn('liao-book-source',28,'完整内化的表现 · 纸页54–55'))),
    fold('liao-inventory-'+book.id,'本地资料核对',h('div',{},h('p',{},unchecked?'本书为出版社后续新增，尚未核对本地与极空间文件。':inventory.status==='not-found'?'本次在四阶段资料包中未找到对应目录。':Object.entries(inventory.formats).map(([format,count])=>format.toUpperCase()+' '+count+'个').join(' · ')),inventory.directories.map(directory=>h('div',{class:'liao-evidence-row'},h('p',{class:'small-note'},directory.label),directory.note?h('p',{},directory.note):null)),unchecked?null:h('p',{class:'small-note'},data.packageSummary.note))),book.notes.map(note=>h('p',{class:'small-note'},note)),
    data.recommendations.filter(relation=>[...relation.from,...relation.to].includes(book.id)).map(relation=>fold('liao-advice-'+book.id,'指导书建议：'+relation.title,h('div',{},h('p',{},relation.note),[...relation.from,...relation.to].filter(id=>id!==book.id).map(id=>h('button',{type:'button',class:'text-link',id:'liao-related-'+id,onclick:()=>onResource(id)},findBook(data,id).title)),relation.sources.map(refLink)))),
    fold('liao-evidence-'+book.id,'逐项原文与出处',h('div',{},(inventory.shares||[]).map(share=>h('div',{},h('p',{class:'small-note'},share.folder+' · '+(share.empty?'空目录':'已核对分享目录首层内容')),(share.fileNames||[]).map(name=>h('p',{class:'small-note'},name)),share.note?h('p',{class:'small-note'},share.note):null)),book.media.filter(m=>m.kind==='audio').map(m=>h('p',{class:'small-note'},m.sourceName+' · '+m.selectionBasis)),h('p',{class:'small-note'},data.levelNote),book.references.map(ref=>h('div',{class:'liao-evidence-row'},h('p',{},ref.original),h('p',{class:'small-note'},'Excel括号内编号 '+ref.planNumber+' · '+ref.locator))),book.number?h('p',{class:'small-note'},'指导书书末编号 '+book.number+'；与图示编号分别保留，不代表资料包编号。'):null,entry.imageTitle?h('p',{class:'small-note'},'图示标题：'+entry.imageTitle):null,book.sources.map(refLink),reviews.map(review=>h('p',{class:'small-note'},review.evidence.quote+' · '+review.evidence.locator)),book.coverEvidence?h('p',{class:'small-note'},book.coverEvidence):null,h('a',{class:'text-link',href:asset('assets/liao/52-weeks.xls'),download:'52-weeks.xls'},'下载52周参考表'))));
}
const api={books,findBook,filter,reviewFor,packageLabel,render,detail};root.EnglishLiao=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
