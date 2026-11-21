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
  const bookTopics=topics('book-a40941b5e8434eb5');assert.deepEqual(bookTopics.filter(id=>!T.node(id)?.parentId==='patterns'?false:false||!id.startsWith('patterns.group-')),['concepts.books']);assert.ok(bookTopics.includes('patterns.group-other'),'题名兜底保持句型可筛');
});

test('Hello家居和道路场景不推定交通、安全或自我认知教学，农场动物逐条取证',()=>{
  assert.deepEqual(T.entryTopics('hello-part',{scene:'车库'}),['home.rooms']);
  assert.deepEqual(T.entryTopics('hello-part',{scene:'马路'}),['transport.land']);
  assert.deepEqual(T.entryTopics('hello-part',{scene:'照镜子'}),['home.objects']);
  assert.deepEqual(T.entryTopics('hello-part',{scene:'农场'}),[]);
  const farm=hello.books.find(b=>b.number===13),hen=farm.parts.find(p=>p.part===2),findIt=farm.parts.find(p=>p.part===3);
  assert.equal(T.matches(T.entryTopics('hello-part',hen),{topic:'animals',subtopic:'animals.farm'}),true);
  assert.deepEqual(T.entryTopics('hello-part',findIt),['animals.farm','concepts.counting']);
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
  const modified={...gk,id:'test-unmapped-sentence',studyGuide:{...gk.studyGuide,patterns:[{text:'Invented sentence …'}]}};
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

test('小红书句型只绑定原版本或已核同ISBN单册，参考版次及系列内容不下传单册',()=>{
  const research=require('../english/data/material-topic-research.json');
  const canonical=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const hasSource=(book,sourceId)=>T.patterns('book',book).some(item=>item.sourceId===sourceId);
  for(const sourceId of ['xhs-raz-a-patterns-20261114','xhs-bigcat-pink-patterns-20261114']){
    const tables=research.tables.filter(table=>table.sourceId===sourceId),adopted=books.books.filter(book=>hasSource(book,sourceId));
    assert.ok(adopted.length,sourceId+'应有已核定的具名书目');
    for(const book of adopted){
      const relation=books.readingEquivalences.find(group=>group.kind==='same-isbn'&&group.bookIds.includes(book.id));
      const candidates=[book,...(relation?.bookIds||[]).filter(id=>id!==book.id).map(id=>books.books.find(b=>b.id===id))];
      assert.ok(candidates.some(candidate=>tables.some(table=>table.resourceId===candidate.resourceId&&table.levels.some(level=>level.toLowerCase()===candidate.level.toLowerCase())&&(!table.editionContains||candidate.edition.includes(table.editionContains))&&table.rows.some(row=>canonical(row.title)===canonical(candidate.title)))),book.id+'须有原版依据或同ISBN逐册证据');
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

test('同ISBN书目共用内容主题和句型，路线与阶段仍由当前目录精确取交集',()=>{
  const {inputs}=require('../scripts/audit-library-route-coverage.cjs'),{catalog,directory,volumes}=inputs();
  const before=JSON.stringify(directory),entries=LB.materialEntries(directory,catalog.resources,M,volumes);
  const bigcat=entries.filter(book=>book.resourceId==='resource-g7xvo5'&&book.entryKind!=='resource');
  const source=bigcat.find(book=>book.id==='book-ea98f823f5fc3955'),selected=bigcat.find(book=>book.id==='book-a30240076eba3f04');
  assert.ok(selected.appearances.length);assert.equal(source.appearances.length,0);
  const preparatory=LB.filter(bigcat,directory,{route:'xu',stageIds:['xu-node-300']});
  assert.equal(preparatory.length,18,'整级directoryMatch按版本与级别接通18册选本');
  assert.ok(preparatory.every(book=>book.edition==='外研社大猫 · 预备至4级（2023目录对应选本）'&&['预备级1','预备级2'].includes(book.level)));
  assert.ok(LB.filter(preparatory,directory,{topic:'patterns'}).some(book=>book.id===selected.id));
  for(const id of T.entryTopics('book',source))assert.ok(T.entryTopics('book',selected).includes(id),T.label(id));
  assert.ok(T.patterns('book',selected).length);
  for(const route of ['xu','qing','banana'])assert.ok(LB.filter(bigcat,directory,{route,topic:'patterns'}).length,route);
  assert.ok(LB.filter(bigcat,directory,{route:'xu',stageIds:M.libraryStageIds(catalog,'xu-node-500',false,{}),topic:'patterns'}).length);
  const fiction=LB.filter(bigcat,directory,{route:'qing',stageIds:['qing-s1'],topic:'patterns'});
  assert.ok(fiction.length);assert.ok(fiction.every(book=>book.genre==='fiction'));
  assert.equal(LB.filter(bigcat,directory,{route:'qing',stageIds:['xu-node-500'],topic:'patterns'}).length,0);
  assert.deepEqual(T.patterns('book',{...selected,id:'unconfirmed-edition',topics:[]}),[]);
  assert.ok(T.entryEvidence('book',selected).equivalentBooks.some(book=>book.id===source.id&&book.isbn==='9780007185399'));
  assert.equal(JSON.stringify(directory),before);
});

test('已有原表的RAZ结构与GK比较结构进入共同句型家族，词汇项不冒充句型',()=>{
  const BP=require('../english/book-progress.js'),directory=BP.withReadingPlans(books,require('../english/data/reading-plans.json'));
  for(const [id,group]of [['book-guide-raz-a-005','patterns.group-be'],['book-guide-raz-a-017','patterns.group-see'],['book-guide-raz-a-028','patterns.group-be'],['heinemann-gk70-15','patterns.group-other']]){
    const book=directory.books.find(book=>book.id===id);
    assert.ok(T.matches(T.entryTopics('book',book),{topic:'patterns',subtopic:group}),book.title);
  }
  const word=directory.books.find(book=>book.id==='book-guide-raz-a-006');
  assert.equal(T.patterns('book',word).some(item=>/^live$/i.test(item.text)),false,'live为原表词汇项，不显示为句型');
  assert.ok(T.matches(T.entryTopics('book',word),{topic:'patterns',subtopic:'patterns.group-questions'}),'题名What Lives Here?按疑问句兜底');
});

test('慢葫芦逐页主题与页码查询、对应筛选取交集，保留独立歌曲身份及原顺序',()=>{
  const before=JSON.stringify(songs),pages=filters=>M.filterSongs(songs,{category:'soundBook',...filters}).map(song=>song.page);
  assert.ok(pages({topic:'food',subtopic:'food.fruit'}).includes(3));
  assert.deepEqual(pages({topic:'food',subtopic:'food.fruit',query:'apples and bananas'}),[3]);
  assert.deepEqual(pages({topic:'food',subtopic:'food.fruit',overlap:'sss'}),[]);
  assert.deepEqual(pages({topic:'animals',subtopic:'animals.farm',overlap:'sss',query:'mary'}),[6]);
  assert.deepEqual(pages({topic:'animals',subtopic:'animals.farm',overlap:'liao',query:'mary'}),[]);
  const animalPages=pages({topic:'animals'});
  assert.ok(animalPages.length>1);
  assert.deepEqual(animalPages,[...animalPages].sort((a,b)=>a-b));
  assert.ok(M.filterSongs(songs,{category:'soundBook',topic:'animals'}).every(song=>song.id.startsWith('manhulu-')));
  assert.equal(JSON.stringify(songs),before);
});

test('慢葫芦同曲目只引用已保存主题，改编及同曲调不继承内容、活动方式或句型',()=>{
  const byPage=page=>songs.soundBook.songs.find(song=>song.page===page);
  for(const song of songs.soundBook.songs){
    const mapping=taxonomy.songMappings[song.id];
    assert.ok(mapping,song.id);
    assert.ok(mapping.basis&&mapping.evidence.length,song.id);
    assert.deepEqual(T.entryActivities('song',song),[]);
    assert.deepEqual(T.patterns('song',song),[]);
    if(song.sssSongId){
      assert.deepEqual(mapping.topics,taxonomy.songMappings[song.sssSongId].topics);
      assert.ok(mapping.evidence.some(item=>item.kind==='same-song-topic-reference'&&item.referencedSongId===song.sssSongId));
    }else{
      assert.ok(['title-fallback','pending'].includes(mapping.status));
      assert.ok(mapping.evidence.every(item=>item.kind!=='same-song-topic-reference'));
    }
  }
  assert.deepEqual(T.entryTopics('song',byPage(6)),['animals.farm']);
  assert.deepEqual(T.entryTopics('song',byPage(16)),['phonics.alphabet']);
  assert.deepEqual(T.entryTopics('song',byPage(17)),['home.objects']);
  assert.deepEqual(T.entryTopics('song',byPage(19)),['daily.sleep']);
  for(const page of [27,39,40,47,48]){
    assert.equal(taxonomy.songMappings[byPage(page).id].status,'pending');
    assert.deepEqual(T.entryTopics('song',byPage(page)),[]);
  }
  assert.equal(T.matches(T.entryTopics('song',byPage(48)),{topic:'science'}),false);
});

test('范围主题选项只保留有结果的路径，切换目录清除已失效的一级和二级',()=>{
  const UI=require('../english/topic-ui.js');
  function h(tag,attrs={},...children){
    const node={tag,...attrs,children:children.flat(),replaceChildren(...next){this.children=next.flat();this.value=this.children.find(item=>item.selected)?.value||this.children[0]?.value||'';}};
    if(tag==='select')node.replaceChildren(...node.children);
    return node;
  }
  const calls=[],picker=UI.create({h,topics:T}).picker({id:'scope',available:['home.rooms',T.children('patterns')[0].id],topic:'home',subtopic:'home.rooms',onchange:(...values)=>calls.push(values)});
  const primary=picker.element.children[0].children[1],secondary=picker.element.children[1].children[1];
  assert.deepEqual(primary.children.map(item=>item.value),['all','patterns','home']);
  assert.deepEqual(secondary.children.map(item=>item.value),['all','home.rooms']);
  assert.deepEqual(picker.sync('home','home.rooms',['animals.farm']),{topic:'all',subtopic:'all'});
  assert.deepEqual(primary.children.map(item=>item.value),['all','animals']);
  assert.equal(secondary.disabled,true);
  primary.value='animals';primary.onchange({currentTarget:primary});
  assert.deepEqual(calls,[['animals','all']]);assert.deepEqual(secondary.children.map(item=>item.value),['all','animals.farm']);
  picker.sync('all','all',[]);assert.equal(picker.element.hidden,true);
});


test('句型按GK原表顺序聚合，跨来源同类表达共用筛选且保留原文',()=>{
  const groups=T.children('patterns');
  assert.deepEqual(groups.slice(0,9).map(g=>g.label),['I / we can see','like / love','Here is / are','Look at','has / have','This / here / it is','Come and see','is / are doing','can do']);
  assert.equal(groups.at(-1).label,'其他');
  const members=groups.flatMap(g=>g.members);
  assert.equal(new Set(members).size,members.length);
  for(const item of taxonomy.nodes.filter(n=>n.parentId==='patterns'))assert.ok(members.includes(item.id),item.label);
  for(const text of ['I like…','We like to …','… likes …','I love …','I don’t like …']){
    const item=taxonomy.nodes.find(n=>n.parentId==='patterns'&&n.label===text);
    assert.ok(T.matches([item.id],{topic:'patterns',subtopic:'patterns.group-like'}),text);
    assert.equal(T.matches([item.id],{topic:'patterns',subtopic:'patterns.group-can'}),false);
    assert.equal(T.label(item.id),text);
    assert.deepEqual(T.options([item.id],'patterns').map(g=>g.id),['patterns.group-like']);
  }
});


test('书名兜底保留筛选归类但不冒充正文句型',()=>{
  const book=books.books.find(b=>b.aliases?.includes('奇妙的外套'));
  assert.ok(T.entryTopics('book',book).includes('patterns.group-other'));
  assert.deepEqual(T.patterns('book',book),[]);
  const titleOnly=books.books.find(b=>taxonomy.bookOverrides[b.id]?.patternStatus==='title-fallback'&&b.title==='What Lives Here?');
  assert.ok(titleOnly);
  assert.ok(T.entryTopics('book',titleOnly).includes('patterns.group-questions'));
  assert.deepEqual(T.patterns('book',titleOnly),[]);
});
