import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const app = await readFile(new URL('../english/app.js', import.meta.url), 'utf8');
const actions = app.slice(app.indexOf('function focusEnglishSearch(){'), app.indexOf('function englishActions(){'));

test('顶栏关键词进入公共逐册结果，非书素材继续通过同一结果区匹配',()=>{
  const calls=[],context={S:{libraryBookMode:false,libraryTopic:'all',search:'show'},libraryBookResults:options=>calls.push(options)};
  vm.runInNewContext(app.slice(app.indexOf('function libraryResults(){'),app.indexOf('let libraryCollection=')),context);
  context.libraryResults();assert.equal(calls[0].search,true);
  const resources=[{id:'book-series'},{id:'animation'},{id:'song'}],cards=[];
  Object.assign(context,{S:{libraryLayout:'covers'},filteredResources:()=>resources,h:(tag,attrs,...children)=>({tag,attrs,children}),libraryCard:r=>{cards.push(r.id);return r;},window:{EnglishAutomaticList:{tail:()=>null}}});
  vm.runInNewContext(app.slice(app.indexOf('function librarySearchMaterials('),app.indexOf('function libraryResults(){')),context);
  context.librarySearchMaterials([{resourceId:'book-series'}]);assert.deepEqual(cards,['animation','song']);
});

test('顶栏搜索本人书架的单册题名，退出后不读取或展示私人匹配',()=>{
  let reads=0;const cards=[],context={englishOwnerAuthenticated:true,S:{route:'all',age:'all',libraryTopic:'all',sharedOnly:false,type:'all',materialStatus:'all'},shelfGroups:()=>{reads++;return [{title:'Fixture Series',books:[{title:'What a Show'}]}];},shelfSeriesCard:g=>{cards.push(g);return g;},h:(tag,attrs,...children)=>({tag,attrs,children}),window:{EnglishAutomaticList:{tail:()=>null}}};
  vm.runInNewContext(app.slice(app.indexOf('function shelfSearchResults('),app.indexOf('function librarySearchMaterials(')),context);
  assert.ok(context.shelfSearchResults('show'));assert.equal(cards.length,1);
  context.englishOwnerAuthenticated=false;assert.equal(context.shelfSearchResults('show'),null);assert.equal(reads,1);
});

test('英语输入继续素材筛选；回车和空列表提问入口传入同一句话，输入法确认不提问', () => {
  const calls = [], input = { value: '许密杉和庆爸' }, state = { search: '', view: 'library' };
  const context = {
    S: state, libraryCollection: 'all',
    document: { getElementById: () => input, querySelector: () => ({ replaceWith: () => calls.push('filter') }) },
    window: { XiaoyaSiteSearch: { open: options => calls.push(options) } },
    libraryResults() {}, updateLibraryUsageToggle() {},
  };
  vm.runInNewContext(actions, context);
  context.applyEnglishSearch({ target: input }); assert.deepEqual(calls, ['filter']);
  assert.equal(state.search, input.value);
  context.askEnglishSearch({ key: 'Enter', isComposing: true });
  context.askEnglishSearch({ key: 'Enter', keyCode: 229 });
  context.askEnglishSearch({ key: 'a' }); assert.equal(calls.length, 1);
  let prevented = false;
  context.askEnglishSearch({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(calls[1].query, input.value); assert.equal(calls[1].submit, true); assert.equal(calls[1].focus, input);
  context.askEnglishSearch(); assert.equal(calls[2].query, input.value);
});

test('重置统一清除全部组合筛选，重新选择阶段恢复只看当前阶段',()=>{
  const state={type:'reader',route:'qing',search:'cats',age:'stage:qing-s2',libraryStageScope:'lower',sharedOnly:true,materialStatus:'done',libraryTopic:'animals',librarySubtopic:'animals.pets',librarySeries:'chosen',librarySeriesScroll:30,libraryBookMode:true};
  let rendered=0,focused='';const context={S:state,C:{},EnglishModel:{libraryStageForRoute:()=> 'stage:xu-node-500'},render:()=>rendered++,document:{getElementById:id=>({focus:()=>{focused=id;}})}};
  vm.runInNewContext(app.slice(app.indexOf('function libraryFilterApply('),app.indexOf('function libraryLayoutToggle(')),context);
  context.resetLibraryFilters();
  assert.equal(state.search,'');assert.equal(state.route,'all');assert.equal(state.age,'all');assert.equal(state.libraryStageScope,'current');assert.equal(state.libraryTopic,'all');assert.equal(state.librarySubtopic,'all');assert.equal(state.librarySeries,'all');assert.equal(state.librarySeriesScroll,0);assert.equal(state.type,'all');assert.equal(state.materialStatus,'all');assert.equal(state.sharedOnly,false);assert.equal(state.libraryBookMode,false);assert.equal(focused,'library-reset');
  state.libraryStageScope='lower';context.libraryFilterApply('age','stage:qing-s2','library-stage-toggle');assert.equal(state.libraryStageScope,'current');assert.equal(rendered,2);
});
