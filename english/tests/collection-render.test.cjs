const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
function renderContext(context){context.renderBatch=read=>read();context.automaticListTail=options=>context.window.EnglishAutomaticList.tail(options);return context;}
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
function element(tag,attrs,...kids){return {tag,attrs,children:kids.flat(Infinity).filter(x=>x!=null),classList:{add(){}},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}};}

test('其他书架的套系封面不查单册次数，散本保留本人次数且集合可完成渲染',()=>{
  const calls=[],groups=[{id:'series',series:true,title:'English Series',cover:'series.jpg',total:2,completed:1,status:'using',books:[{id:'b1',title:'Book One',cover:'series.jpg'},{id:'b2',title:'Book Two'}]},
    {id:'single',series:false,title:'Single Book',cover:'single.jpg',total:1,completed:1,status:'done',books:[{id:'b3',title:'Single Book',cover:'single.jpg'}]}];
  const context={h:element,asset:x=>x,icon:()=>null,S:{records:{}},BOOKS:{sources:[],topics:[]},BP:{bookState:(_records,id)=>{assert.equal(typeof id,'string');calls.push(id);return {readCount:3};}},P:{STATUS:{using:'进行中',done:'已完成'}},
    LB:require('../library-books.js'),libraryGrouping:()=> 'series',shelfEntries:()=>groups.flatMap(group=>group.books.map(book=>({...book,privateShelf:true,shelfGroupId:group.id,resource:{id:group.id,title:group.title,type:'book',appearances:[]},seriesTitle:group.title,appearances:[]}))),otherShelfState:{query:'',status:'all',limit:18,libraryTopic:'all',librarySubtopic:'all'},shelfGroups:()=>groups,shelfBookStatus:book=>book.id==='b1'?'not-started':'done',openModal(){},window:{ROADMAP_RAW:{resourceVolumes:{series:[]}},EnglishAutomaticList:{tail:()=>element('div',{})}}};
  vm.createContext(renderContext(context));vm.runInContext(fs.readFileSync(require.resolve('../../shared/material-library.js'),'utf8'),context);context.materialLibrary=context.window.XiaoyaMaterialLibrary.create({h:element,icon:()=>null});vm.runInContext([section('function bookReadCountBadge(','function bookCompletionControl('),section('function libraryBookCover(','function bookRow('),section('function shelfSeriesCard(','function otherLibraryView(')].join('\n'),context);
  const rendered=context.otherShelfResults();assert.equal(rendered.attrs.id,'other-shelf-results');assert.ok(calls.includes('b3'));assert.ok(calls.every(id=>['b1','b2','b3'].includes(id)));
  const cards=rendered.children[1].children[0].children;assert.equal(cards.length,2);
  // 没有封面的套系占位也不能把 null 身份交给单册模型。
  const before=calls.length;context.libraryBookCover({id:null,title:'No Cover Series'});assert.equal(calls.length,before);
});

test('素材投入排名自动追加保留各项定位键与全局序号',()=>{
  let paging;const state={rankLimit:6},groups=Array.from({length:20},(_,i)=>({id:'g'+i,label:'素材'+i,minutes:60,share:.05}));
  const context={h:element,practiceStatState:()=>state,P:{hours:n=>n/60},window:{EnglishAutomaticList:{tail:options=>(paging=options,element('div',{}))}}};
  vm.createContext(renderContext(context));vm.runInContext(section('function practiceRanking(','function practiceTrend('),context);
  const tree=context.practiceRanking({groups},new Map()),list=tree.children[1],first=list.children[0];
  assert.equal(list.children.length,6);paging.load(6,18);assert.equal(state.rankLimit,18);assert.equal(list.children.length,18);
  paging.load(18,20);assert.equal(list.children.length,20);assert.equal(list.children[0],first);
  assert.deepEqual(list.children.map(row=>row.attrs.id),groups.map((_,i)=>'practice-rank-'+i));
  assert.deepEqual(list.children.map(row=>row.attrs['data-group']),groups.map(group=>group.id));
});


test('单本搜索不恢复已建目录的整套兜底，也不重复已匹配的动画素材',()=>{
  const seen=[],resources=[{id:'catalog-series'},{id:'matched-animation'},{id:'unlisted-animation'}];
  const context={h:element,S:{libraryLayout:'covers'},libraryGrouping:()=> 'books',libraryTopicEntries:()=>[{id:'one',resourceId:'catalog-series'}],filteredResources:()=>resources,libraryCard:r=>{seen.push(r.id);return element('article',{});},window:{EnglishAutomaticList:{tail:()=>null}}};
  vm.createContext(renderContext(context));vm.runInContext(section('function librarySearchMaterials(','function libraryResults('),context);
  context.librarySearchMaterials([{id:'matched-animation',resourceId:'matched-animation',entryKind:'resource'}]);
  assert.deepEqual(seen,['unlisted-animation']);
});
