import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const T=require('../english/topics.js');
const books=require('../english/data/resource-books.json');
const hello=require('../english/data/hello-reading.json');
const rhymes=require('../english/data/hello-rhyme-content.json');
const songs=require('../english/data/sss-songs.json');
const taxonomy=require('../english/data/topic-taxonomy.json');
const M=require('../english/model.js'),LB=require('../english/library-books.js');

test('图鉴二级与路线阶段、SSS二级与活动方式取同一条目交集',()=>{
  const room={id:'test-room',title:'房间',topics:['home.rooms'],resource:{type:'book'},appearances:[{routeId:'xu',stageId:'s1'}]};
  assert.equal(LB.filter([room],books,{topic:'home',subtopic:'home.rooms',route:'xu',stageIds:['s1']}).length,1);
  assert.equal(LB.filter([room],books,{topic:'home',subtopic:'home.objects',route:'xu',stageIds:['s1']}).length,0);
  assert.equal(LB.filter([room],books,{topic:'home',subtopic:'home.rooms',route:'xu',stageIds:['s2']}).length,0);
  assert.deepEqual(M.filterSongs(songs,{topic:'daily',subtopic:'daily.bath'}).map(s=>s.id),['sss-bath-song']);
  assert.deepEqual(M.filterSongs(songs,{topic:'daily',subtopic:'daily.bath',activity:'tpr'}),[]);
  const tpr=M.filterSongs(songs,{topic:'actions',activity:'tpr',category:'essential'});
  assert.ok(tpr.length);
  assert.ok(tpr.every(s=>songs.categories.find(c=>c.id==='essential').songIds.includes(s.id)&&T.entryActivities('song',s).includes('tpr')));
});

test('一级覆盖子级，二级精确且与所选一级保持同一路径',()=>{
  const ids=['animals.farm','concepts.counting'];
  assert.equal(T.matches(ids,{topic:'animals'}),true);
  assert.equal(T.matches(ids,{topic:'animals',subtopic:'animals.farm'}),true);
  assert.equal(T.matches(ids,{topic:'animals',subtopic:'animals.sea'}),false);
  assert.equal(T.matches(ids,{topic:'animals',subtopic:'concepts.counting'}),false);
  assert.equal(T.matches(['animals'],{topic:'animals',subtopic:'animals.farm'}),false);
  assert.deepEqual(T.options(ids,'animals').map(n=>n.id),['animals.farm']);
});

test('家居从生活场景拆出，空间位置归基础认知，不按题名追加主题',()=>{
  const home=books.books.find(b=>b.id==='book-952f345458a00781');
  // 新增用户原表逐册内容为chair/table/bath/bed/television/mirror。
  assert.deepEqual(T.entryTopics('book',home).filter(id=>T.node(id)?.parentId!=='patterns'),['home.furniture','home.objects']);
  assert.deepEqual(T.entryTopics('book',{topics:['places']}),['concepts.position']);
  assert.deepEqual(T.entryTopics('book',{title:'Baby Shark Goes To Bed',topics:[]}),[]);
  assert.deepEqual(T.entryTopics('book',{topics:['animals']}),['animals']);
});

test('旧朋友与情绪及学校混合类按该条内容拆分，不整类推定情绪或拼读',()=>{
  const football=books.books.find(b=>b.id==='book-520c9c211d0d058f');
  const sad=books.books.find(b=>b.id==='book-e7cd841c2f0eed1d');
  const nursery=books.books.find(b=>b.id==='book-904a02a7aa605845');
  const reading=books.books.find(b=>b.id==='book-a40941b5e8434eb5');
  assert.equal(T.matches(T.entryTopics('book',football),{topic:'social'}),true);
  assert.equal(T.matches(T.entryTopics('book',football),{topic:'emotions'}),false);
  assert.equal(T.matches(T.entryTopics('book',sad),{topic:'emotions',subtopic:'emotions.sad'}),true);
  assert.equal(T.matches(T.entryTopics('book',nursery),{topic:'daily',subtopic:'daily.childcare'}),true);
  assert.equal(T.matches(T.entryTopics('book',reading),{topic:'phonics'}),false);
});

test('Hello逐Part和童谣分别映射，原场景保留且不传播至同册其他内容',()=>{
  const book=hello.books.find(b=>b.number===1);
  const sleep=book.parts.find(p=>p.scene==='睡觉');
  const actions=book.parts.find(p=>p.scene==='肢体动作');
  assert.equal(T.matches(T.entryTopics('hello-part',sleep),{topic:'daily',subtopic:'daily.sleep'}),true);
  assert.equal(T.matches(T.entryTopics('hello-part',actions),{topic:'daily',subtopic:'daily.sleep'}),false);
  assert.deepEqual(T.originalLabels('hello-part',sleep),['睡觉']);
  const rhyme=rhymes.find(r=>r.id==='hello-rhyme-02');
  assert.equal(T.matches(T.entryTopics('hello-rhyme',rhyme),{topic:'body'}),true);
  assert.equal(T.matches(T.entryTopics('hello-rhyme',rhyme),{topic:'daily',subtopic:'daily.sleep'}),false);
  const allScenes=new Set(hello.books.flatMap(b=>b.parts.map(p=>p.scene)).concat(rhymes.flatMap(r=>r.themes)));
  for(const scene of allScenes)assert.ok(taxonomy.helloScenes[scene],scene);
});

test('学校、职业与社交不按角色出现或旧标签自动继承',()=>{
  const topics=id=>T.entryTopics('book',books.books.find(b=>b.id===id));
  assert.equal(T.matches(topics('book-e3463944bdb89047'),{topic:'jobs'}),false);
  assert.equal(T.matches(topics('book-843d62bc516651e0'),{topic:'jobs'}),false);
  assert.equal(T.matches(topics('book-843d62bc516651e0'),{topic:'emotions'}),true);
  assert.equal(T.matches(topics('book-3b579d5e9eecae1f'),{topic:'social',subtopic:'social.sharing'}),false);
  assert.equal(T.matches(topics('book-3b579d5e9eecae1f'),{topic:'food',subtopic:'food.cooking'}),false);
  assert.equal(T.matches(topics('book-9e3a469a41019cb4'),{topic:'emotions',subtopic:'emotions.expression'}),false);
  assert.deepEqual(topics('book-a40941b5e8434eb5'),['concepts.books']);
});

test('Hello家居和道路场景不推定交通、安全或自我认知教学，农场动物逐条取证',()=>{
  assert.deepEqual(T.entryTopics('hello-part',{scene:'车库'}),['home.rooms']);
  assert.deepEqual(T.entryTopics('hello-part',{scene:'马路'}),['transport.land']);
  assert.deepEqual(T.entryTopics('hello-part',{scene:'照镜子'}),['home.objects']);
  assert.deepEqual(T.entryTopics('hello-part',{scene:'农场'}),[]);
  const farm=hello.books.find(b=>b.number===13),hen=farm.parts.find(p=>p.part===2),findIt=farm.parts.find(p=>p.part===3);
  assert.equal(T.matches(T.entryTopics('hello-part',hen),{topic:'animals',subtopic:'animals.farm'}),true);
  assert.deepEqual(T.entryTopics('hello-part',findIt),[]);
  const car=rhymes.find(r=>r.id==='hello-rhyme-06'),toothbrush=rhymes.find(r=>r.id==='hello-rhyme-41');
  assert.equal(T.matches(T.entryTopics('hello-rhyme',car),{topic:'animals',subtopic:'animals.farm'}),true);
  assert.equal(T.matches(T.entryTopics('hello-rhyme',toothbrush),{topic:'body',subtopic:'body.self'}),false);
  assert.equal(T.matches(T.entryTopics('hello-rhyme',toothbrush),{topic:'daily',subtopic:'daily.wash'}),true);
  assert.ok(T.entryEvidence('hello-part',hen).override.evidence.length);
});

test('SSS可同时按主题和场景查询，TPR与动作主题互不等同',()=>{
  const bath=songs.songs.find(s=>s.id==='sss-bath-song');
  const happy=songs.songs.find(s=>s.id==='sss-if-youre-happy-and-you-know-it-ft-super-simple-puppets');
  assert.equal(T.matches(T.entryTopics('song',bath),{topic:'daily',subtopic:'daily.bath'}),true);
  assert.equal(T.matches(T.entryTopics('song',bath),{topic:'body'}),true);
  assert.deepEqual(T.entryActivities('song',bath),[]);
  assert.deepEqual(T.entryActivities('song',happy),['tpr']);
  assert.deepEqual(T.entryActivities('hello-part',{scene:'肢体动作'}),[]);
  assert.ok(T.entryEvidence('song',bath).sourceIds.length);
});

test('节日曲按官网歌词的实际内容筛选，不从北极或恐怖题名推定科普、情绪或职业',()=>{
  const north=songs.songs.find(s=>s.id==='sss-at-the-north-pole');
  const spooky=songs.songs.find(s=>s.id==='sss-down-by-the-spooky-bay');
  assert.equal(T.matches(T.entryTopics('song',north),{topic:'festivals',subtopic:'festivals.christmas'}),true);
  assert.equal(T.matches(T.entryTopics('song',north),{topic:'science'}),false);
  assert.equal(T.matches(T.entryTopics('song',spooky),{topic:'festivals',subtopic:'festivals.halloween'}),true);
  assert.equal(T.matches(T.entryTopics('song',spooky),{topic:'fantasy',subtopic:'fantasy.characters'}),true);
  assert.equal(T.matches(T.entryTopics('song',spooky),{topic:'emotions'}),false);
  assert.equal(T.matches(T.entryTopics('song',spooky),{topic:'jobs'}),false);
  for(const song of [north,spooky]){
    const evidence=T.entryEvidence('song',song);
    assert.equal(evidence.status,'mapped');
    assert.ok(evidence.evidence.some(item=>item.locator.includes('Song Lyrics')&&item.quote));
    assert.deepEqual(T.entryActivities('song',song),[]);
  }
});

test('公共分类不改写来源、稳定ID或个人自由主题',()=>{
  const snapshot=JSON.stringify({books,hello,rhymes,songs});
  for(const book of books.books)T.entryTopics('book',book);
  for(const song of songs.songs)T.entryTopics('song',song);
  for(const rhyme of rhymes)T.entryTopics('hello-rhyme',rhyme);
  assert.equal(JSON.stringify({books,hello,rhymes,songs}),snapshot);
  assert.deepEqual(T.entryTopics('book',{custom:true,topics:['我家的零散书','动物','animals.sea']}),['我家的零散书','animals','animals.sea']);
  assert.equal(T.label('我家的零散书'),'我家的零散书');
});

test('映射目录的来源和节点引用完整，未核曲目保留明确范围',()=>{
  assert.equal(T.roots().length,21);
  const sourceIds=new Set(taxonomy.sources.map(s=>s.id));
  for(const mapping of Object.values(taxonomy.songMappings)){
    for(const id of mapping.topics)assert.ok(T.node(id),id);
    for(const id of mapping.sourceIds)assert.ok(sourceIds.has(id),id);
  }
  for(const mapping of Object.values(taxonomy.bookOverrides))for(const id of mapping.topics)assert.ok(T.node(id),id);
  for(const song of songs.songs)assert.ok(taxonomy.songMappings[song.id],song.id);
  for(const mapping of Object.values(taxonomy.songMappings).filter(m=>m.status==='pending')){
    assert.deepEqual(mapping.topics,[]);
    assert.ok(mapping.basis);
  }
});

test('句型与内容主题并存，按来源原文精确匹配，不跨版或按题名猜测',()=>{
  const BP=require('../english/book-progress.js'),plans=require('../english/data/reading-plans.json'),volumes=require('../english/data/resource-volumes.json');
  const directory=BP.withReadingPlans(books,plans,volumes);
  const pearson=directory.books.find(b=>b.resourceId==='resource-1nuqi5t'&&b.studyGuide?.patterns.some(p=>p.text==='I like...'));
  const ids=T.entryTopics('book',pearson),pattern=ids.find(id=>T.node(id)?.parentId==='patterns');
  assert.ok(pattern);assert.ok(ids.some(id=>T.node(id)?.parentId!=='patterns'));
  assert.equal(T.matches(ids,{topic:'patterns',subtopic:pattern}),true);
  assert.deepEqual(T.entryTopics('book',{title:pearson.title,topics:[],studyGuide:{...pearson.studyGuide,sourceId:'another-edition'}}),[]);
  assert.deepEqual(T.entryTopics('book',{title:'I like cats',topics:[]}),[]);
  const gk=directory.books.find(b=>b.id==='heinemann-gk70-01');
  assert.ok(T.entryTopics('book',gk).some(id=>T.node(id)?.parentId==='patterns'));
  const modified={...gk,studyGuide:{...gk.studyGuide,patterns:[{text:'Invented sentence …'}]}};
  assert.equal(T.matches(T.entryTopics('book',modified),{topic:'patterns'}),false);
});

test('启明星同版分类图映射公共主题，文体与难度栏不补造内容二级',()=>{
  const ids=id=>T.entryTopics('book',books.books.find(b=>b.id===id));
  assert.ok(ids('book-3a75a5949264fbe3').includes('concepts.counting'));
  assert.ok(ids('book-a402574242afe74d').includes('sports.roleplay'));
  assert.ok(ids('book-32c9f8c4f63da4b3').includes('animals.insects'));
  assert.ok(ids('book-baa51018e3bb2947').includes('animals'));
  assert.equal(ids('book-c876e74a845b4f05').includes('animals.reptiles'),false);
  for(const mappings of Object.values(taxonomy.patternMappings))for(const id of Object.values(mappings))assert.equal(T.node(id)?.parentId,'patterns');
});

test('补充句型与原表共存，标题兜底只读取离线显式映射，不在运行时猜测',()=>{
  const runtime=require('../english/data/topic-taxonomy.json'),id='test-topic-explicit';
  const old=runtime.bookOverrides[id];
  runtime.bookOverrides[id]={topics:['daily.sleep'],status:'title-fallback',patterns:[{text:'Can I …?',sourceId:'source-explicit',note:'仅适用于已核定本册'}]};
  try{
    const entry={id,title:'Bedtime',topics:[],studyGuide:{sourceId:'source-original',patterns:[{text:'This is …'}]}};
    assert.deepEqual(T.patterns('book',entry).map(p=>[p.text,p.sourceId]),[['This is …','source-original'],['Can I …?','source-explicit']]);
    assert.equal(T.matches(T.entryTopics('book',entry),{topic:'daily',subtopic:'daily.sleep'}),true);
    assert.equal(T.entryEvidence('book',entry).status,'title-fallback');
    assert.deepEqual(T.entryTopics('book',{title:'Bedtime',topics:[]}),[]);
    assert.deepEqual(T.patterns('book',{title:'Can I have it?'}),[]);
  }finally{if(old===undefined)delete runtime.bookOverrides[id];else runtime.bookOverrides[id]=old;}
});

test('小红书句型只绑定同套同级同版本，参考版次及系列内容不下传单册',()=>{
  const research=require('../english/data/material-topic-research.json');
  const canonical=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const hasSource=(book,sourceId)=>T.patterns('book',book).some(item=>item.sourceId===sourceId);
  for(const sourceId of ['xhs-raz-a-patterns-20261114','xhs-bigcat-pink-patterns-20261114']){
    const tables=research.tables.filter(table=>table.sourceId===sourceId),adopted=books.books.filter(book=>hasSource(book,sourceId));
    assert.ok(adopted.length,sourceId+'应有已核定的具名书目');
    for(const book of adopted){
      assert.ok(tables.some(table=>table.resourceId===book.resourceId&&table.levels.some(level=>level.toLowerCase()===book.level.toLowerCase())&&(!table.editionContains||book.edition.includes(table.editionContains))&&table.rows.some(row=>canonical(row.title)===canonical(book.title))),book.id+'不能跨套、跨级或跨版本借句型');
      assert.ok(T.entryTopics('book',book).some(id=>T.node(id)?.parentId==='patterns'),book.id+'须进入共用句型筛选');
    }
  }
  const howMany=books.books.find(book=>book.id==='book-9086a608330bf535');
  assert.ok(hasSource(howMany,'xhs-bigcat-pink-patterns-20261114'));
  const forest=books.books.find(book=>book.id==='book-guide-raz-a-004');
  assert.ok(hasSource(forest,'xhs-raz-a-patterns-20261114'));
  const reference=research.tables.find(table=>table.sourceId==='xhs-ort-1plus-patterns-20261114');
  assert.equal(reference.status,'reference-only');assert.deepEqual(reference.levels,['1+']);
  assert.equal(books.books.some(book=>hasSource(book,reference.sourceId)),false,'红标1级合包不冒充已确认的1+版本');
  const wow={id:'resource-ij95m4'},wowSource='xhs-wow-season2-patterns-20261114';
  assert.ok(T.patterns('resource',wow).some(item=>item.sourceId===wowSource&&item.note.includes('第二季')));
  assert.ok(T.matches(T.entryTopics('resource',wow),{topic:'patterns'}));
  assert.equal(books.books.some(book=>hasSource(book,wowSource)),false,'第二季系列整理不下传各册／集');
  assert.deepEqual(T.entryTopics('resource',{id:'unmapped-wow-episode',title:'Wow English 第二季第1集'}),[]);
  assert.deepEqual(T.entryTopics('book',{title:'The Forest',level:'A',topics:[]}),[]);
  assert.deepEqual(T.patterns('book',{title:'How Many Animals',level:'Pink 1A'}),[]);
});
