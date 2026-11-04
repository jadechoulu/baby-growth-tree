(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishHello=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘']/g,'').replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ').trim();
const tuneNames=r=>r.tunes.concat(r.extensions.map(e=>e.tune));
function options(data){return {scenes:[...new Set(data.books.flatMap(b=>b.parts.map(p=>p.scene)).concat(data.issues.filter(i=>i.available).map(i=>i.scene)))].sort((a,b)=>a.localeCompare(b,'zh')),tunes:[...new Set(data.rhymes.flatMap(tuneNames))].sort((a,b)=>a.localeCompare(b,'en'))};}
function filter(data,{edition='numbered',book='all',scene='all',tune='all',query=''}={}){
  const words=normalize(query).split(' ').filter(Boolean);
  if(edition==='dated')return data.issues.filter(i=>(book==='all'||i.id===book)&&(scene==='all'||i.scene===scene)&&tune==='all'&&words.every(w=>normalize([i.title,i.scene,i.english].join(' ')).includes(w))).map(issue=>({issue}));
  return data.books.filter(b=>book==='all'||b.id===book).map(b=>{
    const parts=b.parts.filter(p=>scene==='all'||p.scene===scene);
    const allRhymes=data.rhymes.filter(r=>r.bookId===b.id);
    const rhymes=allRhymes.filter(r=>tune==='all'||tuneNames(r).includes(tune));
    const text=normalize([b.title,...parts.flatMap(p=>[p.scene,p.note]),...rhymes.flatMap(r=>[r.title,...tuneNames(r)]),...b.resources.flatMap(r=>[r.label,...(r.originalNames||[])])].join(' '));
    return {book:b,parts,rhymes,allRhymes,matched:parts.length>0&&(tune==='all'||rhymes.length>0)&&words.every(w=>text.includes(w))};
  }).filter(r=>r.matched);
}
function graph(data){
  const nodes=[],edges=[],add=(id,label,type)=>nodes.push({id,label,type});
  for(const b of data.books){add(b.id,b.title,'book');for(const p of b.parts){const id=b.id+'-part-'+p.part;add(id,'Part '+p.part,'part');addScene(p.scene);edges.push({from:b.id,to:id,relation:'包含'},{from:id,to:'scene:'+p.scene,relation:'场景'});}for(const [index,r] of b.resources.entries()){const id=r.id||b.id+'-resource-'+index;nodes.push({id,label:r.label,type:'resource',url:r.url||r.file,sha256:r.sha256});edges.push({from:b.id,to:id,relation:r.kind});for(const rid of r.rhymeIds||[])edges.push({from:id,to:rid,relation:'同名童谣音频'});for(const t of r.tunes||[])edges.push({from:id,to:'tune:'+t,relation:'同名曲调音频'});}}
  function addScene(scene){const id='scene:'+scene;if(!nodes.some(n=>n.id===id))add(id,scene,'scene');}
  for(const r of data.rhymes){add(r.id,r.title,'rhyme');edges.push({from:r.bookId,to:r.id,relation:'童谣'});for(const t of r.tunes){const id='tune:'+t;if(!nodes.some(n=>n.id===id))add(id,t,'tune');edges.push({from:r.id,to:id,relation:'建议曲调'});}for(const [index,e] of r.extensions.entries()){const id=r.id+'-extension-'+index;add(id,e.title,'extension');edges.push({from:r.id,to:id,relation:'拓展儿歌'});const tid='tune:'+e.tune;if(!nodes.some(n=>n.id===tid))add(tid,e.tune,'tune');edges.push({from:id,to:tid,relation:'拓展曲调'});}}
  for(const i of data.issues){add(i.id,i.title,'issue');if(i.available){addScene(i.scene);edges.push({from:i.id,to:'scene:'+i.scene,relation:'年月刊主题'});}}
  return {nodes,edges};
}
const state={edition:'numbered',book:'all',scene:'all',tune:'all',query:'',limit:6,openBooks:new Map()};
function render(data,{h,asset}){
  const choices=options(data),root=h('section',{class:'hello-library','aria-label':'Hello杂志资源图谱'}),results=h('div',{class:'hello-results'}),active=h('p',{class:'small-note',role:'status'});
  const link=(label,path,page)=>h('a',{class:'text-link',href:asset(path)+(page?'#page='+page:''),target:'_blank',rel:'noopener noreferrer'},label+' ↗');
  const source=(id,page)=>{const s=data.sources.find(s=>s.id===id);return link('汇总第'+page+'页',s.file,page);};
  const change=(key,value)=>{state[key]=value;state.limit=6;refresh();};
  const chip=(label,key,value)=>h('button',{type:'button',class:'hello-chip','aria-label':'筛选'+label,onclick:()=>{change(key,value);controls[key].value=value;}},label);
  const controls={};
  const select=(key,label,entries)=>{const n=h('select',{'aria-label':label,onchange:e=>key==='edition'?switchEdition(e.currentTarget.value):change(key,e.currentTarget.value)},entries.map(([value,title])=>h('option',{value,selected:state[key]===value},title)));controls[key]=n;return h('label',{},h('span',{},label),n);};
  const bookEntries=()=>[['all','全部书号'],...(state.edition==='numbered'?data.books:data.issues).map(b=>[b.id,b.title])];
  const search=h('input',{type:'search',value:state.query,'aria-label':'搜索Hello童谣、场景或曲调',placeholder:'搜童谣、场景、曲调或文件',oninput:e=>{if(!e.isComposing)change('query',e.currentTarget.value);},oncompositionend:e=>change('query',e.currentTarget.value)});
  const edition=select('edition','资料版本',[['numbered','1–24号书'],['dated','2017–2020年月刊']]);
  function switchEdition(value){state.edition=value;state.book='all';state.tune='all';state.limit=6;controls.book.replaceChildren(...bookEntries().map(([value,label])=>h('option',{value},label)));controls.tune.value='all';controls.tune.disabled=state.edition==='dated';refresh();}
  const download=h('a',{class:'button soft',href:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({...data,graph:graph(data)},null,2)),download:'Hello杂志资源图谱.json'},'导出图谱');
  const reset=h('button',{type:'button',class:'text-link',onclick:()=>{Object.assign(state,{book:'all',scene:'all',tune:'all',query:'',limit:6});for(const key of ['book','scene','tune'])controls[key].value='all';search.value='';refresh();}},'清除筛选');
  function resourceLinks(b){
    return h('div',{class:'hello-resource-links'},b.resources.filter(r=>['notes','erin','official'].includes(r.kind)).map(r=>link(r.label,r.url||r.file)),
      !b.resources.some(r=>r.kind==='notes')?h('span',{class:'small-note'},'笔记 PDF 待补充'):null,
      !b.resources.some(r=>r.kind==='erin')?h('span',{class:'small-note'},'带读链接待补充'):null,
      !b.resources.some(r=>r.kind==='official')?h('span',{class:'small-note'},'官方视频链接待核对'):null);
  }
  function resourceFiles(b){
    const files=b.resources.filter(r=>r.kind==='audio'||r.kind==='pdf');
    if(!files.length)return null;
    return h('details',{class:'hello-files'},h('summary',{},'本册资料包 · '+files.filter(r=>r.kind==='audio').length+'个音频 / '+files.filter(r=>r.kind==='pdf').length+'份PDF'),
      h('p',{class:'small-note'},'按资料包归册；音频与童谣、曲调的同名对应仅依据文件名。'),
      h('ul',{},files.map(r=>h('li',{},h('div',{},link(r.label,r.file),h('small',{},' · '+(r.bytes/1048576).toFixed(1)+' MiB'+(r.pages?' · '+r.pages+'页':' · '+Math.round(r.duration)+'秒'))),
        (r.rhymeIds||[]).length?h('p',{class:'small-note'},'同名童谣：'+r.rhymeIds.map(id=>data.rhymes.find(x=>x.id===id).title).join('、')):null,
        (r.tunes||[]).map(t=>h('p',{class:'small-note'},'同名曲调：',chip(t,'tune',t))),
        r.kind==='audio'?h('audio',{controls:true,preload:'none',src:asset(r.file),'aria-label':'播放'+r.label}):null,
        r.originalNames?.length>1?h('p',{class:'small-note'},'相同内容合并：'+r.originalNames.join('、')):null))));
  }
  function bookCard(row){const {book:b,parts,rhymes,allRhymes}=row;
    const details=h('details',{class:'hello-book',open:state.openBooks.has(b.id)?state.openBooks.get(b.id):(state.book===b.id||state.scene!=='all'||state.tune!=='all'||!!state.query),ontoggle:e=>{if(e.currentTarget.isConnected)state.openBooks.set(b.id,e.currentTarget.open);}},
      h('summary',{},h('strong',{},b.title),h('span',{},parts.map(p=>'P'+p.part+' '+p.scene).join(' · ')),h('small',{},allRhymes.length+'篇童谣')),
      h('div',{class:'hello-book-body'},resourceLinks(b),resourceFiles(b),h('div',{class:'hello-branches'},
        h('section',{class:'hello-branch'},h('h4',{},'书中场景 → Part'),h('ul',{},parts.map(p=>h('li',{},h('strong',{},'Part '+p.part+' '),chip(p.scene,'scene',p.scene),p.note?h('span',{},' · '+p.note):null,source('scenes',p.sourcePage))))),
        h('section',{class:'hello-branch'},h('h4',{},'本册童谣 → 建议曲调'),h('p',{class:'small-note'},'童谣按整册关联；场景筛选不表示这些童谣都属于命中的 Part。'),h('ul',{},rhymes.map(r=>h('li',{class:'hello-rhyme'},h('div',{},h('strong',{},r.title),' ',source('rhymes',r.sourcePage)),h('div',{class:'hello-tunes'},r.tunes.length?r.tunes.map(t=>chip(t,'tune',t)):h('span',{},'打节拍朗读')),b.resources.filter(a=>(a.rhymeIds||[]).includes(r.id)).map(a=>h('div',{},link('同名音频：'+a.label,a.file))),r.note?h('p',{class:'small-note'},r.note):null,r.extensions.map(e=>h('p',{class:'hello-extension'},'拓展：'+e.title+' → ',chip(e.tune,'tune',e.tune))))))))));return details;
  }
  function refresh(){
    const rows=filter(data,state),numbered=state.edition==='numbered';
    active.textContent=[state.scene!=='all'?'场景：'+state.scene:'全部场景',state.tune!=='all'?'曲调：'+state.tune:'',rows.length+(numbered?'本书':'期年月刊'),numbered?'命中 '+rows.reduce((n,r)=>n+r.parts.length,0)+' 个 Part':'主题按原汇总保留'].filter(Boolean).join(' · ');
    const visible=rows.slice(0,state.limit);
    results.replaceChildren(...[...visible.map(row=>row.book?bookCard(row):h('article',{class:'hello-issue'},h('strong',{},row.issue.title),h('span',{},row.issue.scene+' '+row.issue.english),source('scenes',row.issue.sourcePage))),
      rows.length?null:h('p',{class:'empty'},'没有匹配项，可清除筛选后重新查找。'),
      visible.length<rows.length?h('button',{type:'button',class:'button soft',onclick:()=>{state.limit+=6;refresh();}},'再看6'+(numbered?'本':'期')+'（'+visible.length+'/'+rows.length+'）'):null].filter(Boolean));
  }
  root.append(h('div',{class:'hello-heading'},h('div',{},h('h2',{},'Hello 杂志资源图谱'),h('p',{class:'small-note'},'场景 → 书号与 Part；书号 → 童谣 → 建议曲调。')),download),
    h('div',{class:'hello-filters'},edition,select('book','书号 / 年月',bookEntries()),select('scene','场景',[['all','全部场景'],...choices.scenes.map(s=>[s,s])]),select('tune','曲调（含拓展）',[['all','全部曲调'],...choices.tunes.map(t=>[t,t])]),h('label',{class:'hello-search'},h('span',{},'搜索'),search),reset),active,results,
    h('details',{class:'hello-sources'},h('summary',{},'资料依据与版本说明'),h('p',{},data.attribution),h('p',{},data.tuneNote),h('p',{},data.editionNote),h('p',{},'收录24本、120个Part、56篇童谣／拓展条目，以及35期年月索引（2018年9月原表空缺）。'),data.sources.map(s=>h('p',{},link(s.title,s.file))),(data.supplements||[]).map(s=>h('p',{},link(s.label,s.url))),data.assetInventory?h('p',{},data.assetInventory.mappingNote):null,h('p',{class:'small-note'},'核对：'+data.checkedAt+'。极空间分享链接最长180天、最多1000次访问，过期或用尽后需重新分享。')));
  controls.tune.disabled=state.edition==='dated';refresh();return root;
}
return {normalize,options,filter,graph,render};
});
