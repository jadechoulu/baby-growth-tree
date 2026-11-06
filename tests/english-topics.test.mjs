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
  assert.deepEqual(T.entryTopics('book',home),['home.furniture','home.objects']);
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
  assert.equal(T.roots().length,20);
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
