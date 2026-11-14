import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),B=require('../english/library-books.js'),M=require('../english/model.js');
const read=id=>JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)));
const data=read('resource-books'),raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan')},catalog=M.normalize(raw);

test('主题检索覆盖无逐册目录素材并复用素材身份，有目录套系不重复混入整套',()=>{
  const taxonomy=require('../english/data/topic-taxonomy.json');
  const old=taxonomy.resourceMappings;
  taxonomy.resourceMappings={...old,'topic-animation':{topics:['concepts.colors']},'topic-liao':{topics:['animals']}};
  try{
    const resource={id:'topic-series',title:'已有目录',type:'reader',appearances:[]};
    const animation={id:'topic-animation',title:'动画',type:'animation',appearances:[{routeId:'qing',stageId:'qing-s1'}]};
    const liao={id:'topic-liao',title:'绘本作品',type:'book',liaoBookId:'existing-liao',appearances:[]};
    const directory={books:[{id:'topic-book',resourceId:resource.id,title:'单册',topics:['animals'],level:'',edition:'原版'}],sources:[]};
    const result=B.materialEntries(directory,[resource,animation,liao],M);
    assert.deepEqual(result.map(item=>item.id),['topic-book','topic-animation','topic-liao']);
    const [match]=B.filter(result,directory,{topic:'concepts',subtopic:'concepts.colors',route:'qing',stageIds:['qing-s1'],type:'animation'});
    assert.equal(match.resource,animation);assert.equal(match.entryKind,'resource');assert.equal(match.id,animation.id);
    assert.equal(B.filter(result,directory,{topic:'concepts',route:'qing',stageIds:['qing-s2']}).length,0);
    assert.equal(B.filter(result,directory,{topic:'animals'}).find(item=>item.id===liao.id).resource.liaoBookId,'existing-liao');
    assert.equal(B.seriesGroups(result,directory).reduce((n,group)=>n+group.count,0),3);
    assert.deepEqual(B.entries(directory,[resource,animation,liao],M).map(item=>item.id),['topic-book']);
  }finally{if(old===undefined)delete taxonomy.resourceMappings;else taxonomy.resourceMappings=old;}
});

test('单册关键词跨公共目录与原表计划检索到具体书名',()=>{
  const BP=require('../english/book-progress.js'),directory=BP.withReadingPlans(data,read('reading-plans'),read('resource-volumes'));
  const result=B.filter(B.entries(directory,catalog.resources,M,read('resource-volumes')),directory,{query:'show'});
  assert.ok(result.some(b=>/puppet show/i.test(b.title)));
  assert.ok(result.some(b=>/the show/i.test(b.title)));
});

test('书目身份、版本、主题和来源完整，目录变更不改变作者阶段参考',()=>{
  assert.equal(new Set(data.books.map(b=>b.id)).size,data.books.length);
  for(const b of data.books){
    assert.ok(catalog.resources.some(r=>r.id===b.resourceId),b.resourceId);
    assert.ok(b.title&&b.edition&&b.topicBasis,b.title);
    assert.ok(b.sourceIds.length,b.title);
    assert.ok(b.sourceIds.every(id=>data.sources.some(s=>s.id===id)),b.title);
    assert.ok(b.topics.every(id=>data.topics.some(t=>t.id===id)),b.title);
  }
  const changed=M.normalize({...raw,resourceBooks:{books:[]}});
  const references=c=>c.stages.map(st=>M.compareStages(c,st.id).map(r=>[r.routeId,r.stageReferences.map(ref=>ref.stageId)]));
  const expected=references(catalog);assert.ok(expected.some(rows=>rows.some(([,ids])=>ids.length)));
  assert.deepEqual(references(changed),expected);
});

test('级别范围先展开，主题与路线及阶段取同一原引用的交集',()=>{
  const resource={id:'test',title:'测试',type:'reader',appearances:[{routeId:'xu',stageId:'xu-one',level:'1–3'},{routeId:'qing',stageId:'qing-one',level:'2'}]};
  const book={id:'b',resourceId:'test',title:'A Boat',level:'2',edition:'版次',topics:['transport']};
  const [entry]=B.entries({books:[book]},[resource],M);
  assert.equal(entry.appearances.length,2);
  assert.equal(B.filter([entry],data,{route:'xu',stageIds:['xu-one'],topic:'transport'}).length,1);
  assert.equal(B.filter([entry],data,{route:'xu',stageIds:['qing-one'],topic:'transport'}).length,0);
  assert.equal(B.filter([entry],data,{route:'xu',stageIds:['xu-one'],topic:'animals'}).length,0);
  const selection={...resource,appearances:[{routeId:'qing',stageId:'fiction-only',level:'2（虚构部分）'}]};
  assert.deepEqual(B.bookAppearances(book,selection,M),[],'整级目录不冒充虚构选本');
  assert.equal(B.bookAppearances({...book,qualifier:'虚构'},selection,M).length,1,'逐本有据的限定选本仍可关联');
});

test('显式选本只关联列出的单册，参考标记可由有据成员补齐，整级及增补册不能混入',()=>{
  const resource={id:'subset',title:'选本',type:'reader',appearances:[{routeId:'qing',stageId:'stage',level:'A · 虚构部分'}]};
  const books=['fiction','nonfiction','extra'].map(id=>({id,resourceId:'subset',title:id,edition:'原目录',level:'A',topics:[],editionMatch:'reference-only'}));
  const volumes={series:[{resourceId:'subset',scopes:[{id:'fiction',level:'A（虚构部分）',levelAliases:['A · 虚构部分'],edition:'虚构选集',parts:[{label:'A（虚构部分）',count:1,directoryMatch:{edition:'原目录',level:'A',bookIds:['fiction']}}]}]}]};
  const entries=B.entries({books},[resource],M,volumes);
  assert.deepEqual(entries.filter(b=>b.appearances.length).map(b=>b.id),['fiction']);
  const selected=B.seriesCount({books},resource,M,volumes,{route:'qing',selections:[{routeId:'qing',stageId:'stage',parts:[{label:'A（虚构部分）',count:1,edition:'虚构选集',directoryMatch:{edition:'原目录',level:'A',bookIds:['fiction']}}]}]});
  assert.deepEqual(selected.books.map(book=>book.id),['fiction']);
  assert.equal(selected.total,1);
  const unknown={...resource,appearances:[{routeId:'qing',stageId:'unmatched',level:'A · 虚构部分'}]};
  assert.deepEqual(B.bookAppearances({...books[1],editionMatch:undefined},unknown,M),[]);
});

test('主题套系分组覆盖全部结果，RAZ级别分开且培生上下辑共用一个入口',()=>{
  const books=B.entries(data,catalog.resources,M),groups=B.seriesGroups(books,data);
  assert.equal(groups.reduce((sum,group)=>sum+group.count,0),books.length);
  const aa=groups.find(group=>group.label==='RAZ AA'),a=groups.find(group=>group.label==='RAZ A');
  assert.equal(aa.count,103);assert.equal(a.count,100);assert.notEqual(aa.id,a.id);
  const pearson=groups.find(group=>group.label==='培生幼儿英语基础词汇');
  assert.equal(pearson.count,96);
  const selected=B.filter(books,data,{series:pearson.id});
  assert.equal(new Set(selected.map(book=>book.edition)).size,2);
  assert.equal(new Set(selected.map(book=>book.id)).size,96);
});

test('阶段参考目录保留当前级别，既有单册身份不变且不冒充虚构子集',()=>{
  const resource=catalog.resources.find(r=>r.id==='resource-1qnd5uh');
  const before=structuredClone(data.books);
  const selected=B.referenceBooks(data.books,resource,M,[{level:'AA、A（虚构部分）'}]);
  assert.equal(selected.length,203);
  assert.deepEqual([...new Set(selected.map(b=>b.level))],['aa','A']);
  assert.ok(selected.every(b=>data.books.includes(b)),'复用公共单册与进度身份');
  assert.ok(selected.every(b=>B.bookAppearances(b,{...resource,appearances:[{routeId:'qing',stageId:'fiction-only',level:'AA、A（虚构部分）'}]},M).length===0));
  const later=B.referenceBooks(data.books,resource,M,[{level:'C、D（虚构）'}]);
  assert.equal(later.length,195);
  assert.ok(later.every(b=>['C','D'].includes(b.level)));
  const other={id:'another-series',title:'其他分级',appearances:[]};
  const books=[{id:'one',resourceId:other.id,level:'1'},{id:'two',resourceId:other.id,level:'2'},{id:'three',resourceId:other.id,level:'3'}];
  assert.deepEqual(B.referenceBooks(books,other,M,[{level:'1–2'}]).map(b=>b.id),['one','two']);
  assert.deepEqual(data.books,before);
});

test('套系与一级二级主题、路线条件取交集，全部套系恢复完整主题结果',()=>{
  const books=B.entries(data,catalog.resources,M),filters={topic:'animals',subtopic:'animals.birds'};
  const matching=B.filter(books,data,filters),groups=B.seriesGroups(matching,data),a=groups.find(group=>group.label==='RAZ A');
  assert.ok(a);
  const selected=B.filter(books,data,{...filters,series:a.id});
  assert.equal(selected.length,a.count);assert.equal(selected.length,3);
  assert.ok(selected.every(book=>book.level==='A'));
  assert.equal(B.filter(books,data,{...filters,series:a.id,route:'other'}).length,0);
  assert.deepEqual(B.filter(books,data,{...filters,series:'all'}),matching);
});

test('异版目录不能冒充阶段版本，未分简单难度的书目不替作者分级',()=>{
  const books=B.entries(data,catalog.resources,M),pink=books.filter(b=>b.resourceId==='resource-g7xvo5'&&b.editionMatch==='reference-only'),piggie=books.filter(b=>b.resourceId==='resource-e87t8v');
  assert.ok(pink.length&&piggie.length);
  assert.ok(pink.every(b=>b.editionMatch==='reference-only'&&b.appearances.length===0));
  assert.ok(piggie.every(b=>b.editionMatch==='reference-only'&&b.appearances.length===0));
  const basic=books.filter(b=>b.editionMatch==='unleveled-only');
  assert.equal(basic.length,96);
  assert.ok(basic.every(b=>b.appearances.every(a=>!a.level)));
  const resource={id:'edition-test',appearances:[{routeId:'xu',stageId:'open',level:''},{routeId:'qing',stageId:'old-edition',level:'1–3'}]};
  assert.deepEqual(B.bookAppearances({...basic[0],level:'上辑 · 第1册'},resource,M).map(a=>a.stageId),['open']);
});

test('个人绘本按主题和个人选用阶段筛选，其他不混入作者原书单',()=>{
  const custom={id:'library.custom.v1:mine',custom:true,title:'My Bear',type:'book',topics:['动物'],stageRefs:[{routeId:'xu',stageId:'xu-current-300'}]};
  const books=B.entries(data,[...catalog.resources,custom],M);
  assert.equal(B.filter(books,data,{route:'other',stageIds:['xu-current-300'],topic:'animals'}).length,1);
  assert.equal(B.filter(books,data,{route:'other',stageIds:['qing-s1'],topic:'animals'}).length,0);
  assert.ok(B.filter(books,data,{route:'other'}).every(b=>b.custom));
  assert.equal(B.filter(books,data,{query:'MY bear',route:'other'}).length,1);
  assert.equal(B.entries(data,[{...custom,type:'animation'}],M).length,0);
});

test('主题分类保留内容核对、简介归类及标题兜底的证据层次，运行时不猜测新标题',()=>{
  const taxonomy=require('../english/data/topic-taxonomy.json'),T=require('../english/topics.js');
  const sourceIds=new Set([...data.sources,...taxonomy.sources].map(s=>s.id));
  for(const book of data.books){
    const mapping=taxonomy.bookOverrides[book.id],status=mapping?.status&&mapping.status!=='pending'?mapping.status:book.topicStatus;
    assert.ok(['content-verified','classification-verified','description-derived','pending','title-fallback'].includes(status),book.title);
    if(status==='pending')assert.deepEqual(book.topics,[],book.title);
    else {
      const evidenceRecords=[...(book.topicEvidence||[]),...(mapping?.evidence||[])];
      assert.ok(evidenceRecords.length,book.title);
      for(const evidence of evidenceRecords){
        assert.ok(sourceIds.has(evidence.sourceId),book.title);
        assert.ok(evidence.locator&&evidence.summary,book.title);
      }
      if(status==='title-fallback')assert.ok(evidenceRecords.some(item=>item.kind==='title-fallback'&&item.originalTitle===book.title),book.title);
      if(status==='description-derived')assert.ok(evidenceRecords.some(item=>item.kind==='content-description'&&/^https:\/\/www\.xiaohuasheng\.cn\/book\//.test(item.url)),book.title);
    }
  }
  const books=B.entries(data,catalog.resources,M),pending=books.filter(b=>!(T.entryTopics('book',b).length));
  for(const topic of data.topics)assert.equal(B.filter(pending,data,{topic:topic.id}).length,0);
  assert.deepEqual(T.entryTopics('book',{title:'The Birthday',topics:[]}),[]);
});

test('内容核对纠正同名误判，分版本分类及句型不混用',()=>{
  const pearson=data.books.filter(b=>b.resourceId==='resource-1nuqi5t');
  assert.ok(pearson.find(b=>b.title==='A Garden').topics.includes('food'));
  assert.ok(pearson.find(b=>b.title==='I Like Birds').topics.includes('concepts'));
  assert.ok(pearson.find(b=>b.title==='The Snake').topics.includes('clothing'));
  const birthday=pearson.find(b=>b.title==='The birthday'&&b.level==='3'),T=require('../english/topics.js');
  assert.equal(birthday.learningFocus.originalTopic,'现在进行时');
  assert.equal(T.patterns('book',birthday).some(item=>item.sourceId==='pearson-xhs-old-themes'),false,'错位原表不转为本册句型');
  const scary=data.books.find(b=>b.title==='Pip and Posy: The Scary Monster');
  assert.ok(scary.topics.includes('friendship'));
  assert.ok(!scary.topics.includes('fantasy'));
  const yum=data.books.find(b=>b.resourceId==='resource-g7xvo5'&&b.title==='Yum');
  assert.ok(yum.topics.includes('animals'));
  assert.ok(!yum.topics.includes('food'));
});

test('每套查证记录可直接呈现，分类配图存在且不公开浏览器会话',()=>{
  assert.equal(data.seriesResearch.length,new Set(data.books.map(b=>b.resourceId)).size);
  for(const research of data.seriesResearch){
    assert.ok(Array.isArray(research.readingGuide));
    assert.ok(Array.isArray(research.searchLog));
  }
  for(const source of data.sources){
    assert.ok(!source.url?.includes('xsec_token'),source.id);
    for(const image of source.images||[]){
      assert.ok(Number.isInteger(image.page),source.id);
      assert.ok(fs.existsSync(new URL('../english/'+image.path,import.meta.url)),image.path);
    }
  }
  for(const book of data.books)if(book.cover){
    if(/^https:\/\//.test(book.cover)){
      const cover=new URL(book.cover);
      assert.equal(book.coverSource?.imageUrl,book.cover);
      if(cover.hostname==='img.xiaohuasheng.cn'){
        const publicId=book.externalIds?.xiaohuasheng?.[0]||book.catalogMetadata?.sourcePublicGuid;
        assert.ok(publicId,book.title);
        assert.equal(book.coverSource.sourceUrl,'https://www.xiaohuasheng.cn/book/'+publicId);
        if(!book.externalIds?.xiaohuasheng?.length){
          assert.ok(book.catalogIdentityNote,book.title);
          assert.ok(data.books.some(other=>other.id!==book.id&&other.externalIds?.xiaohuasheng?.includes(publicId)),book.title);
        }
      }else{
        assert.equal(cover.hostname,'public.lovereadingbooks.com');
        assert.ok(book.externalIds?.piyo?.length,book.title);
        assert.ok(book.coverSource.sourceUrl.startsWith('https://piyopen.lovereadingbooks.com/content/'));
      }
    }else assert.ok(fs.existsSync(new URL('../english/'+book.cover,import.meta.url)),book.cover);
  }
});

test('阶段范围默认仅当前，包含更低只取同路线主表及其原始引用',()=>{
  assert.deepEqual(M.libraryStageIds(catalog,'qing-s2',false),['qing-s2']);
  assert.deepEqual(M.libraryStageIds(catalog,'qing-s2',true),['qing-s1','qing-s2']);
  assert.deepEqual(M.libraryStageIds(catalog,'xu-node-500',true),['xu-node-300','xu-1','xu-2','xu-node-500','xu-3','xu-4']);
  assert.deepEqual(M.libraryStageIds(catalog,'banana-1',true),['banana-pre','banana-1']);
  const supplementary=catalog.stages.find(st=>st.routeId==='xu'&&st.id.startsWith('xu-panorama-'));
  const lower=M.libraryStageIds(catalog,supplementary.id,true);
  assert.ok(lower.length);assert.ok(lower.every(id=>catalog.stages.find(s=>s.id===id).variantId===supplementary.variantId));
  const entries=B.entries(data,catalog.resources,M,read('resource-volumes'));
  const current=B.filter(entries,data,{stageIds:M.libraryStageIds(catalog,'qing-s2',false)});
  const expanded=B.filter(entries,data,{stageIds:M.libraryStageIds(catalog,'qing-s2',true)});
  assert.ok(current.length&&expanded.length>=current.length);
  assert.ok(current.every(book=>expanded.some(b=>b.id===book.id)));
});
