const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const LB=require('../library-books.js');
const T=require('../topics.js');
const B=require('../book-progress.js');
const directory=require('../data/resource-books.json');
const volumes=require('../data/resource-volumes.json');
const guides=require('../data/reading-guide-map.json');

test('原件与元信息逐册对齐，重复主题行不产生重复书目，单词不进入展示数据',()=>{
  const expected={'guide-raz-aa':103,'guide-raz-a':100,'guide-pearson-basic':95};
  for(const source of guides.sources){
    const metadata=directory.sources.find(item=>item.id===source.id);
    assert.equal(metadata.sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',source.file))).digest('hex'));
    const books=directory.books.filter(book=>book.studyGuide?.sourceId===source.id);
    assert.equal(books.length,expected[source.id]);
    assert.equal(new Set(books.map(book=>book.id)).size,books.length);
    for(const book of books){
      assert.ok(book.studyGuide.themes.length);
      assert.ok(book.studyGuide.locator);
      assert.ok(T.entryTopics('book',book).length);
      assert.equal(Object.hasOwn(book.studyGuide,'words'),false);
      assert.ok(book.studyGuide.themes.every(theme=>theme.order>0&&theme.locator));
    }
  }
});

test('同一系列按版本与主题取交集，一级包含二级，二级不扩散其他子级',()=>{
  const books=directory.books.filter(book=>book.resourceId==='resource-1qnd5uh');
  const all=LB.seriesFilter(books),color=LB.seriesFilter(books,{topic:'concepts',subtopic:'concepts.colors'});
  assert.equal(all.length,1260); // AA–M各具名公开目录；新条目的待核主题不进入主题命中。
  assert.ok(color.length>0&&color.length<all.length);
  assert.ok(color.every(book=>T.entryTopics('book',book).includes('concepts.colors')));
  const edition=books.find(book=>book.studyGuide?.sourceId==='guide-raz-a').edition;
  assert.ok(LB.seriesFilter(books,{edition,topic:'concepts',subtopic:'concepts.colors'}).every(book=>book.edition===edition));
  assert.ok(LB.seriesFilter(books,{topic:'concepts'}).length>=color.length);
  assert.equal(LB.seriesFilter(books,{topic:'food',subtopic:'concepts.colors'}).length,0);
  assert.deepEqual(LB.seriesFilter(books),all);
});

test('主题筛选只改变可见书目，不改同版完整进度范围与已读事实',()=>{
  const plans=B.catalogPlans(directory,volumes,'resource-1nuqi5t');
  const plan=plans.find(item=>item.books.some(book=>book.studyGuide));
  assert.ok(plan);
  const book=plan.books.find(book=>T.entryTopics('book',book).includes('concepts.colors'));
  assert.ok(book);
  const records=B.manualUpdate({},book.id,true),before=JSON.stringify(records);
  const filtered=LB.seriesFilter(plan.books,{topic:'concepts',subtopic:'concepts.colors'});
  assert.ok(filtered.some(item=>item.id===book.id));
  assert.equal(B.bookState(records,book.id).done,true);
  assert.equal(B.progress(records,plan).total,96);
  assert.equal(B.progress(records,plan).identifiedCompleted,1);
  assert.equal(JSON.stringify(records),before);
});

test('原表题名冲突留在来源元信息，不替换同号公共书目或绑定其进度',()=>{
  const source=directory.sources.find(item=>item.id==='guide-pearson-basic');
  assert.equal(source.unmatched.length,1);
  assert.equal(source.unmatched[0].title,'The birds');
  const existing=directory.books.find(book=>book.id==='book-28fc04d5ca931c85');
  assert.equal(existing.title,'The Rides');
  assert.equal(existing.studyGuide,undefined);
});

test('RAZ逐册原题名仍可搜索，参考目录不推定路线纸质选本或虚构范围',()=>{
  const books=directory.books.filter(book=>book.studyGuide?.sourceId.startsWith('guide-raz-'));
  assert.ok(books.every(book=>book.editionMatch==='reference-only'));
  const book=books.find(book=>book.aliases?.length);
  assert.ok(book);
  const entries=books.map(book=>({...book,resource:{title:'RAZ',aliases:[]},appearances:[]}));
  assert.ok(LB.filter(entries,directory,{query:book.studyGuide.title}).some(item=>item.id===book.id));
});
