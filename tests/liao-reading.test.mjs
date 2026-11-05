import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,statSync} from 'node:fs';
const require=createRequire(import.meta.url),L=require('../english/liao-reading.js'),M=require('../english/model.js');
const read=name=>JSON.parse(readFileSync(new URL('../english/data/'+name+'.json',import.meta.url)));
const data=read('liao-reading');
test('100部作品保留102条章节引入，书号与计划序号不可混用',()=>{
 assert.equal(data.books.length,100);
 assert.deepEqual(data.books.map(b=>b.order),Array.from({length:100},(_,i)=>i+1));
 assert.equal(data.introductions.length,102);
 const goose=data.books.find(b=>b.number===1);
 assert.deepEqual(goose.references.map(r=>[r.week,r.chapter]),[[1,1],[2,2],[3,3]]);
 assert.deepEqual(data.stages.map(s=>s.bookIds.length),[22,24,24,30]);
 assert.equal(new Set(data.stages.flatMap(s=>s.bookIds)).size,100);
 const monster=data.books.find(b=>b.number===83);
 assert.match(monster.title,/Monster/);assert.equal(monster.references[0].planNumber,84);
 const christmas=data.books.find(b=>b.number===84);
 assert.match(christmas.title,/Christmas/);assert.equal(christmas.references[0].planNumber,83);
});
test('阶段和多词搜索取交集，复习指向原周段而不造新书',()=>{
 assert.equal(L.filter(data,{stage:'1'}).length,22);
 assert.equal(L.filter(data,{stage:'4',query:'Earth'}).length,2);
 assert.deepEqual(L.filter(data,{query:'green HAM'}).map(b=>b.number),[4]);
 const goose=data.books.find(b=>b.number===1);
 assert.deepEqual(L.reviewFor(data,goose).map(r=>r.weeks),[[5,6]]);
 assert.equal(data.reviews.length,8);
 const before=JSON.stringify(data);L.filter(data,{query:'anything'});L.reviewFor(data,goose);assert.equal(JSON.stringify(data),before);
});
test('加入书单只补素材与来源，不产生路线、阶段、能力对应或旧素材ID漂移',()=>{
 const raw=Object.fromEntries(['banana','xu','qing','route-plan'].map(n=>[n==='route-plan'?'routePlan':n,read(n)]));
 const before=M.normalize(raw),after=M.normalize({...raw,liaoReading:data});
 assert.deepEqual(after.routes,before.routes);assert.deepEqual(after.stages,before.stages);assert.deepEqual(after.relationships,before.relationships);
 for(const r of before.resources)assert.deepEqual(after.resources.find(x=>x.id===r.id),r);
 const added=after.resources.filter(r=>r.liaoBookId);assert.equal(added.length,100);
 for(const r of added){assert.equal(r.appearances.length,0);assert.deepEqual(r.levels,[]);assert.ok(r.cover);}
});
test('每本保留独立出处，指导书不强绑素材包分类',()=>{
 const ids=new Set(data.books.map(b=>b.id));
 for(const book of data.books){
  assert.ok(book.references.length);assert.ok(book.sources.length);assert.ok(book.notes);
  for(const ref of book.references){assert.match(ref.locator,/52周计划!A\d+:B\d+/);assert.ok(ref.original);}
  for(const ref of book.sources)assert.ok(data.sources.find(s=>s.id===ref.sourceId)?.previews.some(p=>p.page===ref.page));
  assert.ok(existsSync(new URL('../english/'+book.cover,import.meta.url)));
 }
 for(const book of data.books)assert.equal(book.groupId,undefined);
 for(const group of data.guidanceTopics)assert.ok(group.sources.length);
 for(const relation of data.recommendations){for(const id of [...relation.from,...relation.to])assert.ok(ids.has(id));assert.ok(relation.sources[0].quote);}
 assert.equal(data.recommendations.length,1);
});

test('参考表与实物目录分开：缺项不冒充齐全，错号按标题和周次核对',()=>{
 const found=data.books.filter(book=>book.package.status==='directory-found');
 assert.equal(found.length,86);
 assert.equal(found.reduce((n,b)=>n+b.package.directories.length,0),88);
 assert.deepEqual(data.stages.map(s=>s.packageCount),[22,23,22,19]);
 assert.deepEqual(data.books.filter(b=>b.package.status==='not-found').map(b=>b.order),[33,54,55,76,77,79,80,81,83,86,89,96,99,100]);
 const teddy=data.books.find(b=>b.order===82),earth=data.books.find(b=>b.order===79);
 assert.match(teddy.title,/Teddy/);assert.equal(teddy.package.directories[0].markedSequence,79);
 assert.match(teddy.package.directories[0].note,/顺序82/);assert.equal(earth.package.status,'not-found');
 const sums=Object.fromEntries(['pdf','mp3','wma','wav'].map(ext=>[ext,found.reduce((n,b)=>n+(b.package.formats[ext]||0),0)]));
 assert.deepEqual(sums,{pdf:98,mp3:162,wma:69,wav:3});
});

test('极空间分享按作品核对，空目录不当可用素材，鹅妈妈只用三章分享',()=>{
 const shares=data.books.flatMap(b=>b.package.shares);
 assert.equal(shares.length,102);assert.equal(new Set(shares.map(s=>s.url)).size,102);
 assert.deepEqual(data.books.filter(b=>b.package.shares.every(s=>s.empty)).map(b=>b.order),[76,77,79,80,83,86,99]);
 assert.equal(data.packageSummary.nasContentWorkCount,93);
 const goose=data.books.find(b=>b.order===1);assert.equal(goose.package.shares.length,3);assert.deepEqual(goose.media,[]);
 for(const s of shares){assert.equal(new URL(s.url).hostname,'s.znas.cn');assert.equal(s.expiresAfterDays,180);assert.equal(s.passwordRequired,false);assert.equal(s.maxVisits,1000);assert.ok(s.contentCheckedAt);assert.equal(s.empty,s.fileNames.length===0);}
 for(const [order,title] of [[79,'Earth'],[80,'The Moon'],[81,"Tomorrow's Alphabet"],[82,"Where's My Teddy?"]]){const book=data.books.find(b=>b.order===order);assert.equal(book.title,title);assert.match(book.package.shares[0].note,/编号/);}
});

test('精选小文件可用且不重复接入纯音乐或含糊编号音轨',()=>{
 const media=data.books.flatMap(b=>b.media),audio=media.filter(m=>m.kind==='audio');
 assert.equal(media.length,37);assert.equal(audio.length,27);
 assert.equal(media.reduce((n,m)=>n+m.bytes,0),data.packageSummary.localMediaBytes);
 for(const b of data.books)assert.ok(b.media.filter(m=>m.kind==='audio').length<=1);
 for(const m of media){assert.equal(statSync(new URL('../english/'+m.file,import.meta.url)).size,m.bytes);assert.ok(m.sha256);}
 for(const m of audio){assert.doesNotMatch(m.sourceName,/instrumental|karaoke|\(music\)|纯音乐|伴奏|中文|track|曲目/i);assert.ok(m.sourceBytes<=5000000);assert.ok(m.durationSeconds>0);assert.match(m.selectionBasis,/标题/);}
});
