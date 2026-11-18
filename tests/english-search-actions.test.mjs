import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const searchCore=createRequire(import.meta.url)('../shared/search-core.js');
function renderContext(context){context.renderBatch=read=>read();context.renderValue=(_key,read)=>read();context.automaticListTail=options=>context.window.EnglishAutomaticList.tail(options);return context;}

const app = await readFile(new URL('../english/app.js', import.meta.url), 'utf8');
const actions = app.slice(app.indexOf('function focusEnglishSearch(){'), app.indexOf('function englishActions(){'));

test('关键词变化先按当前内容清理无效主题，再刷新结果，避免旧主题把新结果筛空',()=>{
  const state={libraryTopic:'animals'},shown=[];
  const context={S:state,document:{getElementById:()=>({closest:()=>({replaceWith(){}})}),querySelector:()=>({replaceWith:value=>shown.push(value)})},
    libraryTopicFilter(){state.libraryTopic='all';return {};},libraryResults:()=>state.libraryTopic};
  vm.runInNewContext(app.slice(app.indexOf('function refreshLibraryTopicResults(){'),app.indexOf('function bookTopicStatus(')),renderContext(context));
  context.refreshLibraryTopicResults();assert.deepEqual(shown,['all']);
});

test('顶栏关键词进入公共逐册结果，非书素材继续通过同一结果区匹配',()=>{
  const calls=[],context={libraryCollection:'all',libraryGrouping:()=> 'series',libraryQuery:()=> 'show',S:{libraryBookMode:false,libraryTopic:'all',search:'show'},libraryBookResults:options=>calls.push(options)};
  vm.runInNewContext(app.slice(app.indexOf('function libraryResults(){'),app.indexOf('let libraryCollection=')),renderContext(context));
  context.libraryResults();assert.equal(calls[0].search,true);
  const resources=[{id:'book-series'},{id:'animation'},{id:'song'}],cards=[];
  Object.assign(context,{S:{libraryLayout:'covers'},filteredResources:()=>resources,h:(tag,attrs,...children)=>({tag,attrs,children}),libraryCard:r=>{cards.push(r.id);return r;},window:{EnglishAutomaticList:{tail:()=>null}}});
  vm.runInNewContext(app.slice(app.indexOf('function librarySearchMaterials('),app.indexOf('function libraryResults(){')),renderContext(context));
  context.librarySearchMaterials([{resourceId:'book-series'}]);assert.deepEqual(cards,['animation','song']);
});

test('顶栏搜索本人书架的单册题名，退出后不读取或展示私人匹配',()=>{
  let reads=0;const cards=[],context={englishOwnerAuthenticated:true,S:{route:'all',age:'all',libraryTopic:'all',sharedOnly:false,type:'all',materialStatus:'all'},shelfGroups:()=>{reads++;return [{title:'Fixture Series',books:[{title:'What a Show'}]}];},shelfSeriesCard:g=>{cards.push(g);return g;},h:(tag,attrs,...children)=>({tag,attrs,children}),window:{EnglishAutomaticList:{tail:()=>null}}};
  vm.runInNewContext(app.slice(app.indexOf('function shelfSearchResults('),app.indexOf('function librarySearchMaterials(')),renderContext(context));
  assert.ok(context.shelfSearchResults('show'));assert.equal(cards.length,1);
  context.S.type='book';assert.ok(context.shelfSearchResults('fixture'));assert.equal(cards.length,2);
  context.englishOwnerAuthenticated=false;assert.equal(context.shelfSearchResults('show'),null);assert.equal(reads,2);
});

test('英语普通书名回车继续素材筛选，问题与显式助手入口保留受保护检索', () => {
  const calls = [], input = { value: '许密杉和庆爸', focus() {} }, state = { search: '', view: 'library' };
  const context = {
    S: state, libraryCollection: 'all',
    document: { getElementById: id => id==='library-search'?input:null, querySelector: () => ({ replaceWith: () => calls.push('filter') }) },
    window: { XiaoyaSearchCore:searchCore, XiaoyaSiteSearch: { open: options => calls.push(options) } },
    libraryResults() {}, updateLibraryUsageToggle() {},
  };
  vm.runInNewContext(app.slice(app.indexOf('function refreshLibraryTopicResults(){'),app.indexOf('function bookTopicStatus(')),renderContext(context));
  vm.runInNewContext(actions, renderContext(context));
  context.applyEnglishSearch({ target: input }); assert.deepEqual(calls, ['filter']);
  assert.equal(state.search, input.value);
  context.askEnglishSearch({ key: 'Enter', isComposing: true });
  context.askEnglishSearch({ key: 'Enter', keyCode: 229 });
  context.askEnglishSearch({ key: 'a' }); assert.equal(calls.length, 1);
  let prevented = false;
  context.askEnglishSearch({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(calls[1].query, input.value); assert.equal(calls[1].submit, true); assert.equal(calls[1].focus, input);
  context.askEnglishSearch(); assert.equal(calls[2].query, input.value);
  for(const query of ['大猫','海尼曼','The Foot Book','Lovevery','']){
    calls.length=0;input.value=query;
    context.askEnglishSearch({key:'Enter',preventDefault(){}});
    assert.deepEqual(calls,['filter']);assert.equal(state.search,query);
  }
});

test('重置统一清除全部组合筛选，重新选择阶段默认包含更低阶段',()=>{
  const state={type:'reader',route:'qing',search:'cats',age:'stage:qing-s2',libraryStageScope:'lower',sharedOnly:true,materialStatus:'done',libraryTopic:'animals',librarySubtopic:'animals.pets',librarySeries:'chosen',librarySeriesScroll:30,libraryBookMode:true};
  let rendered=0,focused='';const context={S:state,libraryCollection:'all',C:{},EnglishModel:{libraryStageForRoute:()=> 'stage:xu-node-500'},render:()=>rendered++,document:{getElementById:id=>({focus:()=>{focused=id;}})}};
  vm.runInNewContext(app.slice(app.indexOf('function libraryFilterApply('),app.indexOf('function libraryLayoutToggle(')),renderContext(context));
  context.resetLibraryFilters();
  assert.equal(state.search,'');assert.equal(state.route,'all');assert.equal(state.age,'all');assert.equal(state.libraryStageScope,'lower');assert.equal(state.libraryTopic,'all');assert.equal(state.librarySubtopic,'all');assert.equal(state.librarySeries,'all');assert.equal(state.librarySeriesScroll,0);assert.equal(state.type,'all');assert.equal(state.materialStatus,'all');assert.equal(state.sharedOnly,false);assert.equal(state.libraryBookMode,false);assert.equal(focused,'library-reset');
  state.libraryStageScope='current';context.libraryFilterApply('age','stage:qing-s2','library-stage-toggle');assert.equal(state.libraryStageScope,'lower');assert.equal(rendered,2);
});


test('阶段范围使用单一图标按钮并在当前与更低阶段间切换',()=>{
  const state={age:'stage:qing-s2',libraryStageScope:'current'};const calls=[];
  const context={S:state,h:(tag,attrs,...children)=>({tag,attrs,children}),icon:name=>({name}),
    libraryFilterApply:(...args)=>calls.push(args)};
  vm.runInNewContext(app.slice(app.indexOf('function libraryStageScopeFilter(){'),app.indexOf('function libraryTopicSummary(')),renderContext(context));
  const current=context.libraryStageScopeFilter();
  assert.equal(current.tag,'button');assert.equal(current.attrs.id,'library-stage-scope');assert.equal(current.attrs['aria-pressed'],'false');assert.equal(current.attrs['aria-label'],'阶段范围：当前阶段');assert.equal(current.children[0].name,'layers');
  current.attrs.onclick();assert.deepEqual(calls.at(-1),['libraryStageScope','lower','library-stage-scope']);
  state.libraryStageScope='lower';const lower=context.libraryStageScopeFilter();
  assert.equal(lower.attrs['aria-pressed'],'true');assert.equal(lower.attrs['aria-label'],'阶段范围：包含更低');
  lower.attrs.onclick();assert.deepEqual(calls.at(-1),['libraryStageScope','current','library-stage-scope']);
});

test('顶栏跨集合搜索进入全部，局部集合重置不清除其他集合的关键词',()=>{
  let destination;const context={S:{view:'library',search:'old',libraryRouteSearch:'route only'},libraryCollection:'other',document:{getElementById:()=>null,querySelector:()=>null},navigate:(view,options)=>destination={view,...options},window:{}};
  vm.runInNewContext(actions,renderContext(context));context.applyEnglishSearch({target:{value:'系列名'}});
  assert.deepEqual(destination,{view:'library',collection:'all'});assert.equal(context.S.search,'系列名');
  Object.assign(context,{libraryCollection:'routes',render(){}});
  vm.runInNewContext(app.slice(app.indexOf('function resetLibraryFilters(){'),app.indexOf('const collectionGrouping=')),renderContext(context));
  context.resetLibraryFilters();assert.equal(context.S.libraryRouteSearch,'');assert.equal(context.S.search,'系列名');
});


test('全部搜索的公共候选包含绘本、分级、动画，私人书架仅在本人验证后参与',()=>{
  const resources=[{id:'graded',appearances:[{}]},{id:'picture',liaoBookId:'liao-one',appearances:[]},{id:'animation',appearances:[{}]}];
  let reads=0;const context={libraryCollection:'all',englishOwnerAuthenticated:true,S:{route:'all',age:'all',sharedOnly:false,records:{}},LB:{materialEntries:(_data,items)=>items},BOOKS:{},EnglishModel:{},window:{ROADMAP_RAW:{resourceVolumes:{}}},libraryResources:()=>resources,LC:{},shelfEntries:()=>{reads++;return [{id:'private'}];}};
  vm.runInNewContext(app.slice(app.indexOf('function libraryCollectionResources(){'),app.indexOf('function libraryResultRow(')),renderContext(context));
  assert.deepEqual(context.libraryTopicEntries().map(entry=>entry.id),['graded','picture','animation','private']);
  context.englishOwnerAuthenticated=false;
  assert.deepEqual(context.libraryTopicEntries().map(entry=>entry.id),['graded','picture','animation']);assert.equal(reads,1);
  context.libraryCollection='routes';assert.deepEqual(context.libraryTopicEntries().map(entry=>entry.id),['graded','animation']);
});
