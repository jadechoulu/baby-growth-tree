const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
function element(tag,attrs,...kids){return {tag,attrs,children:kids.flat(Infinity).filter(x=>x!=null),classList:{add(){}},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}};}

test('其他书架的套系封面不查单册次数，散本保留本人次数且集合可完成渲染',()=>{
  const calls=[],groups=[{id:'series',series:true,title:'English Series',cover:'series.jpg',total:2,completed:1,status:'using',books:[{id:'b1',title:'Book One',cover:'series.jpg'},{id:'b2',title:'Book Two'}]},
    {id:'single',series:false,title:'Single Book',cover:'single.jpg',total:1,completed:1,status:'done',books:[{id:'b3',title:'Single Book',cover:'single.jpg'}]}];
  const context={h:element,asset:x=>x,icon:()=>null,S:{records:{}},BOOKS:{},BP:{bookState:(_records,id)=>{assert.equal(typeof id,'string');calls.push(id);return {readCount:3};}},P:{STATUS:{using:'进行中',done:'已完成'}},
    otherShelfState:{query:'',status:'all',limit:18},shelfGroups:()=>groups,openModal(){},window:{EnglishAutomaticList:{tail:()=>element('div',{})}}};
  vm.createContext(context);vm.runInContext([section('function bookReadCountBadge(','function bookCompletionControl('),section('function libraryBookCover(','function bookRow('),section('function otherShelfResults(','function otherLibraryView(')].join('\n'),context);
  const rendered=context.otherShelfResults();assert.equal(rendered.attrs.id,'other-shelf-results');assert.deepEqual(calls,['b3']);
  assert.equal(rendered.children[1].children.length,2);
  // 没有封面的套系占位也不能把 null 身份交给单册模型。
  context.libraryBookCover({id:null,title:'No Cover Series'});assert.deepEqual(calls,['b3']);
});

test('素材投入排名自动追加保留各项定位键与全局序号',()=>{
  let paging;const state={rankLimit:6},groups=Array.from({length:20},(_,i)=>({id:'g'+i,label:'素材'+i,minutes:60,share:.05}));
  const context={h:element,practiceStatState:()=>state,P:{hours:n=>n/60},window:{EnglishAutomaticList:{tail:options=>(paging=options,element('div',{}))}}};
  vm.createContext(context);vm.runInContext(section('function practiceRanking(','function practiceTrend('),context);
  const tree=context.practiceRanking({groups},new Map()),list=tree.children[1],first=list.children[0];
  assert.equal(list.children.length,6);paging.load(6,18);assert.equal(state.rankLimit,18);assert.equal(list.children.length,18);
  paging.load(18,20);assert.equal(list.children.length,20);assert.equal(list.children[0],first);
  assert.deepEqual(list.children.map(row=>row.attrs.id),groups.map((_,i)=>'practice-rank-'+i));
  assert.deepEqual(list.children.map(row=>row.attrs['data-group']),groups.map(group=>group.id));
});
