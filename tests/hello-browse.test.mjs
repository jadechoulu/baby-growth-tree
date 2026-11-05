import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const H=createRequire(import.meta.url)('../english/hello-reading.js');
const data=JSON.parse(readFileSync(new URL('../english/data/hello-reading.json',import.meta.url)));

test('参考排序按原资料包来源优先，外部音频转存本地仍不优先且不改原建议顺序',()=>{
 const fixture={tuneAudio:{tunes:[
  {name:'External A',file:'assets/a.mp3'},
  {name:'Package B',file:'assets/b.mp3',referenceOrigin:'hello-package'},
  {name:'External C',previewUrl:'https://example.com/c.mp3'},
  {name:'Package D',file:'assets/d.mp3',referenceOrigin:'hello-package'},
 ]}},names=['External A','Package B','External C','Package D'];
 assert.deepEqual(H.orderedTunes(fixture,names),['Package B','Package D','External A','External C']);
 assert.deepEqual(names,['External A','Package B','External C','Package D']);
 assert.equal(H.tuneIsPackage(fixture,'External A'),false);
 assert.equal(H.tuneIsPackage(fixture,'Package B'),true);
 assert.equal(H.tuneIsPackage(fixture,'Missing'),false);
});

test('逐音轨确认的实唱曲调优先于参考来源，不影响其他童谣或独立原曲映射',()=>{
 const tunes=JSON.parse(readFileSync(new URL('../english/data/hello-tune-audio.json',import.meta.url)));
 const fixture={...data,tuneAudio:tunes},rhyme=data.rhymes.find(r=>r.id==='hello-rhyme-08');
 const rain='Rain Rain Go Away',london='London Bridge Is Falling Down',before=[...rhyme.tunes];
 assert.equal(H.tuneIsPackage(fixture,london),true);
 assert.equal(H.orderedTunes(fixture,rhyme.tunes,[rhyme.id])[0],rain);
 assert.equal(H.tuneIsHighlighted(fixture,rain,[rhyme.id]),true);
 assert.equal(H.tuneIsHighlighted(fixture,london,[rhyme.id]),false);
 const other=data.rhymes.find(r=>r.id!==rhyme.id&&r.tunes.includes(london)&&r.tunes.includes(rain));
 assert.ok(other);
 assert.equal(H.orderedTunes(fixture,other.tunes,[other.id])[0],london);
 assert.equal(H.tuneIsHighlighted(fixture,rain,[other.id]),false);
 assert.equal(H.tuneIsHighlighted(fixture,london,[other.id]),true);
 const audio=data.books.find(b=>b.id===rhyme.bookId).resources.find(a=>a.performedTune===rain);
 assert.deepEqual(audio.tunes,[]);
 assert.deepEqual(rhyme.tunes,before);
 for(const graph of [H.graph(fixture),createRequire(import.meta.url)('../english/hello-graph.js').buildGraph(fixture)]){
  assert.equal(graph.edges.find(e=>e.from===rhyme.id&&e.relation==='建议曲调').to,'tune:'+rain);
 }
});

test('书号可多选，切回全部及取消最后一项均恢复24册',()=>{
 let book=H.toggleBook('all','hello-01');assert.equal(book,'hello-01');
 book=H.toggleBook(book,'hello-18');assert.deepEqual(book,['hello-01','hello-18']);
 const before=JSON.stringify(book),found=H.browse(data,{book});
 assert.deepEqual(found.books.map(row=>row.book.id),book);
 assert.deepEqual([...new Set(found.scenes.map(row=>row.book.id))],book);
 assert.ok(found.rhymes.length>1);assert.ok(found.rhymes.every(row=>book.includes(row.book.id)));
 assert.equal(JSON.stringify(book),before);
 assert.deepEqual(H.browse(data,{book,scene:'刷牙',tune:'The Farmer in the Dell'}).rhymes.map(row=>row.rhyme.title),['My Toothbrush']);
 assert.deepEqual(H.searchSuggestions(data,{book},'tooth').map(item=>item.label),['My Toothbrush']);
 assert.deepEqual(H.searchSuggestions(data,{book},'24'),[]);
 book=H.toggleBook(book,'hello-01');assert.equal(book,'hello-18');
 book=H.toggleBook(book,'hello-18');assert.equal(book,'all');
 assert.equal(H.browse(data,{book}).books.length,24);
 assert.equal(H.toggleBook(data.books.slice(0,23).map(b=>b.id),'hello-24'),'all');
});

test('书号输入仅接受1–24的整数，空值恢复全部，非法值不产生书册ID',()=>{
 assert.equal(H.numberedBookId(''),'all');assert.equal(H.numberedBookId(' '),'all');
 for(const number of [1,12,24]){
  const id=H.numberedBookId(String(number));
  assert.equal(id,'hello-'+String(number).padStart(2,'0'));
  assert.deepEqual(H.browse(data,{book:id}).books.map(row=>row.book.id),[id]);
 }
 for(const invalid of ['0','25','-1','1.5','1e1','abc','Infinity'])assert.equal(H.numberedBookId(invalid),null);
 assert.equal(H.browse(data,{book:H.numberedBookId('')}).books.length,24);
});

test('模糊匹配不区分大小写、标点、空格与全角字符，正文与候选一致',()=>{
 for(const query of ['MY toothbr','Ｍｙ Ｔｏｏｔｈ','mytoothbrush']){
  assert.deepEqual(H.browse(data,{query}).rhymes.map(row=>row.rhyme.title),['My Toothbrush']);
  assert.ok(H.searchSuggestions(data,{},query).some(item=>item.kind==='rhyme'&&item.label==='My Toothbrush'));
 }
 assert.deepEqual(H.searchSuggestions(data,{},''),[]);
 assert.deepEqual(H.searchSuggestions(data,{},'不存在的资料xyz'),[]);
});
test('搜索候选只来自现有资料，包含书号、场景、童谣、内容与主拓展曲调',()=>{
 assert.ok(H.searchSuggestions(data,{},'18').some(item=>item.kind==='book'&&item.value==='hello-18'));
 assert.ok(H.searchSuggestions(data,{},'刷').some(item=>item.kind==='scene'&&item.value==='刷牙'));
 const tunes=H.searchSuggestions(data,{},'farmer dell').filter(item=>item.kind==='tune');
 assert.deepEqual(tunes.map(item=>item.value),['The Farmer in the Dell']);
 const part=H.searchSuggestions(data,{},'Day Night').find(item=>item.kind==='part');
 assert.equal(part.value,'hello-12-part-1');
});
test('候选遵守已有书册、场景及曲调交集，不引入同册其他Part',()=>{
 const filters={book:'hello-12',scene:'雨天玩水',tune:'Five Little Monkeys'};
 assert.deepEqual(H.searchSuggestions(data,filters,'splash').map(item=>item.label),['Make a Splash!']);
 assert.deepEqual(H.searchSuggestions(data,filters,'Graham'),[]);
 assert.deepEqual(H.searchSuggestions(data,{book:'hello-01'},'tooth'),[]);
 assert.deepEqual(H.searchSuggestions(data,{...filters,scene:'白天晚上'},'splash'),[]);
 assert.equal(H.searchSuggestions(data,filters,'monkeys').filter(item=>item.kind==='tune').length,1);
});
test('未归册年月主题不会成为筛选、候选或导出关系，现有场景继续可查',()=>{
 const archived=JSON.parse(readFileSync(new URL('../docs/hello-dated-index-review-20261105.json',import.meta.url)));
 const withHistory={...data,issues:archived.issues};
 assert.equal(archived.issues.length,35);
 assert.equal(archived.issues.find(i=>i.id==='hello-2019-01').english,'dawn to dusk');
 assert.deepEqual(H.options(withHistory),H.options(data));
 assert.ok(!H.options(data).scenes.includes('飞起来的东西'));
 assert.deepEqual(H.searchSuggestions(withHistory,{},'2019'),[]);
 assert.deepEqual(H.searchSuggestions(withHistory,{edition:'dated'},'农场'),[]);
 assert.ok(H.searchSuggestions(data,{},'宝宝的一天').some(item=>item.kind==='scene'));
 assert.ok(!H.graph(withHistory).nodes.some(n=>n.type==='issue'||/^hello-20\d{2}-/.test(n.id)));
});

test('场景视图只返回命中Part，童谣按明确Part或自身主题命中',()=>{
 const found=H.browse(data,{scene:'睡觉'});
 assert.equal(found.books.length,8);
 const searched=H.browse(data,{query:'睡觉'});
 assert.ok(searched.scenes.length>0);
 assert.ok(searched.scenes.every(row=>row.part.scene==='睡觉'));
 assert.deepEqual(found.scenes.filter(row=>row.book.id==='hello-01').map(row=>row.part.part),[1]);
 assert.ok(found.rhymes.every(({book,rhyme})=>(rhyme.themes||[]).includes('睡觉')||book.parts.some(p=>p.scene==='睡觉'&&H.partRhymes(data,book,p).includes(rhyme))));
 const untagged=structuredClone(data);for(const r of untagged.rhymes)delete r.themes;
 assert.deepEqual(H.browse(untagged,{scene:'睡觉'}).rhymes.map(r=>r.rhyme.id),found.rhymes.map(r=>r.rhyme.id));
 assert.ok(found.rhymes.every(row=>!('part' in row)));
});
test('经典曲调与场景、书号可联动，拓展保留原所属童谣',()=>{
 const themed=structuredClone(data);themed.rhymes.find(r=>r.title==='My Toothbrush').themes=['刷牙'];
 const found=H.browse(themed,{book:'hello-18',scene:'刷牙',tune:'The Farmer in the Dell'});
 assert.equal(found.books.length,1);
 assert.deepEqual(found.scenes.map(row=>row.part.part),[2]);
 assert.deepEqual(found.rhymes.map(row=>row.rhyme.title),['My Toothbrush']);
 assert.deepEqual(found.rhymes[0].rhyme.tunes,['London Bridge Is Falling Down']);
 assert.equal(H.browse(data,{book:'hello-01',scene:'刷牙'}).books.length,0);
});
test('童谣名称搜索不带出同册其他童谣，图谱精确选择不改原数据',()=>{
 const before=JSON.stringify(data),target=data.rhymes.find(r=>r.title==='Bubble Bath');
 const found=H.browse(data,{query:'bubble bath'});
 assert.deepEqual(found.rhymes.map(row=>row.rhyme.id),[target.id]);
 const focused=H.browse(data,{rhyme:target.id});
 assert.deepEqual(focused.books.map(row=>row.book.id),[target.bookId]);
 assert.deepEqual(focused.rhymes.map(row=>row.rhyme.id),[target.id]);
 assert.equal(JSON.stringify(data),before);
});
test('退出的年月版本不再返回书册、Part或童谣，默认仍可查24册',()=>{
 const found=H.browse(data,{edition:'dated'});
 assert.deepEqual(found,{books:[],scenes:[],rhymes:[]});
 assert.equal(H.browse(data).books.length,24);
});

test('导出关系保留逐首主题，汇总截图只作来源而不再作为重复素材节点',()=>{
 const content=JSON.parse(readFileSync(new URL('../english/data/hello-rhyme-content.json',import.meta.url)));
 const enriched=structuredClone(data),entries=Array.isArray(content)?content:content.rhymes;
 for(const r of enriched.rhymes){const extra=entries.find(item=>item.id===r.id);if(extra)Object.assign(r,extra);}
 const {nodes,edges}=H.graph(enriched);
 for(const r of enriched.rhymes){
  for(const theme of r.themes||[])assert.ok(edges.some(e=>e.from==='scene:'+theme&&e.to===r.id&&e.relation==='童谣主题'));
  assert.ok(!nodes.some(n=>n.id===r.id+'-card'));
  assert.deepEqual(edges.filter(e=>e.to===r.id&&e.from.includes('-part-')).map(e=>e.from),r.partIds);
 }
 assert.equal(nodes.filter(n=>n.kind==='card').length,0);
});


test('场景与曲调必须在同一个已核实Part相交，不能以同册冒充命中',()=>{
 assert.equal(H.filter(data,{scene:'白天晚上',tune:'Five Little Monkeys'}).some(row=>row.book.id==='hello-12'),false);
 const splash=H.filter(data,{book:'hello-12',scene:'雨天玩水',tune:'Five Little Monkeys'});
 assert.deepEqual(splash.map(row=>row.parts.map(p=>p.part)),[[2]]);
 assert.deepEqual(splash[0].rhymes.map(r=>r.title),['Make a Splash!']);
 assert.equal(H.filter(data,{book:'hello-12',scene:'洗澡'}).length,0);
 const target=H.browse(data,{part:'hello-12-part-5'});
 assert.deepEqual(target.scenes.map(row=>[row.book.id,row.part.part]),[['hello-12',5]]);
 assert.deepEqual(target.rhymes.map(row=>row.rhyme.title),['Graham’s New Toy']);
 assert.equal(H.browse(data,{part:'hello-12-part-5',tune:'Five Little Monkeys'}).rhymes.length,0);
});

test('童谣和内容标题检索只定位相应Part，按书号仍完整返回五个Part',()=>{
 assert.deepEqual(H.browse(data,{query:'My Toothbrush'}).scenes.map(row=>[row.book.id,row.part.part]),[['hello-18',2]]);
 assert.deepEqual(H.browse(data,{query:'Day and Night'}).scenes.map(row=>[row.book.id,row.part.part]),[['hello-12',1]]);
 assert.equal(H.filter(data,{book:'hello-12'})[0].parts.length,5);
 assert.equal(H.filter(data,{query:'12号书'})[0].parts.length,5);
});

test('全部童谣Part定位有本册原书或笔记出处，错册及未核实关系不会生成',()=>{
 for(const b of data.books)for(const p of b.parts){
  assert.ok(p.title);assert.ok(p.titleSource.basis);
  const source=b.resources.find(r=>r.file===p.titleSource.file&&(['notes'].includes(r.kind)||r.role==='original-book'));
  assert.ok(source,'标题来源必须属于本册');
  assert.ok(p.titleSource.page>=1&&p.titleSource.page<=source.pages);
  if(source.role==='original-book')assert.ok(p.titleSource.quote.includes(p.title));
  else assert.ok(p.titleSource.heading.includes('Part'+p.part));
 }
 for(const r of data.rhymes){
  assert.equal(r.partIds.length,1);assert.ok(r.partSource.basis);
  const b=data.books.find(b=>b.id===r.bookId),part=b.parts.find(p=>r.partIds.includes(b.id+'-part-'+p.part));
  assert.ok(part);assert.ok(H.partRhymes(data,b,part).includes(r));
  if(r.id==='hello-rhyme-52')assert.equal(r.entryKind,'adapted-activity');else assert.equal(H.normalize(part.title),H.normalize(r.title));
 }
 assert.deepEqual(H.partRhymes(data,'hello-01',2).map(r=>r.title),['Can You?']);
 assert.equal(H.partRhymes(data,'hello-01',1).length,0);
 const isolated=structuredClone(data);isolated.rhymes[0].partIds=['hello-02-part-2'];
 assert.equal(H.partRhymes(isolated,'hello-01',2).length,0);
 assert.equal(H.partRhymes(isolated,'hello-02',2).some(r=>r.id===isolated.rhymes[0].id),false);
 assert.equal(H.graph(isolated).edges.some(e=>e.to===isolated.rhymes[0].id&&e.relation==='对应童谣'),false);
});
