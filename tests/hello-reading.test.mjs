import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
const require=createRequire(import.meta.url),H=require('../english/hello-reading.js');
const data=JSON.parse(readFileSync(new URL('../english/data/hello-reading.json',import.meta.url)));
test('原书入口只读取明确原书角色，不把资料包首个活动PDF当作原书',()=>{
 for(const book of data.books){
  assert.equal(book.resources.filter(resource=>resource.role==='original-book').length,1);
  assert.equal(H.bookPdf(book).kind,'pdf');
 }
 const book=data.books.find(book=>book.id==='hello-20');
 assert.equal(H.bookPdf(book).file,'assets/hello/files/511a796c4aadafae.pdf');
 assert.equal(H.bookPdf({...book,resources:[...book.resources].reverse()}).file,H.bookPdf(book).file);
 assert.equal(H.bookPdf({resources:[{kind:'pdf',label:'Activity sheet.pdf'}]}),null);
});
test('场景定位到具体书号与Part，不能只匹配整册所有Part',()=>{
 const rows=H.filter(data,{scene:'睡觉'});
 assert.deepEqual(rows.map(r=>[r.book.number,r.parts.map(p=>p.part)]),[[1,[1]],[5,[4]],[11,[5]],[12,[4]],[13,[4]],[17,[5]],[18,[3]],[24,[4,5]]]);
 assert.equal(H.filter(data,{book:'hello-01',scene:'洗澡'}).length,0);
});
test('曲调支持多对多和拓展曲，不把拓展写成主曲',()=>{
 const rows=H.filter(data,{tune:'The Farmer in the Dell'});
 assert.deepEqual(rows.map(r=>r.book.number),[18,21]);
 assert.deepEqual(rows[0].rhymes.map(r=>r.title),['My Toothbrush']);
 assert.deepEqual(rows[0].rhymes[0].tunes,['London Bridge Is Falling Down']);
 assert.equal(H.filter(data,{book:'hello-17',query:'Mama’s Monkey'})[0].rhymes.find(r=>r.title==='Mama’s Monkey').tunes.length,0);
 assert.equal(H.filter(data,{scene:'刷牙',tune:'The Farmer in the Dell'})[0].parts[0].part,2);
});
test('松果妈妈套唱建议按当前童谣关联判断，同名拓展不借其他童谣着色',()=>{
 const rockin=data.rhymes.find(r=>r.title==='Rockin’ Baby');
 for(const tune of ['This Old Man','London Bridge Is Falling Down','Rain Rain Go Away'])assert.equal(H.tuneIsSuggested(data,tune,[rockin.id]),true);
 const brush=data.rhymes.find(r=>r.title==='My Toothbrush'),bear=data.rhymes.find(r=>r.title==='Where’s Bear?');
 assert.ok(bear);
 assert.equal(H.tuneIsSuggested(data,'The Farmer in the Dell',[brush.id]),false);
 assert.equal(H.tuneIsSuggested(data,'The Farmer in the Dell',[bear.id]),true);
 assert.equal(H.tuneIsSuggested(data,'The Farmer in the Dell',[]),false);
 assert.equal(H.tuneIsSuggested(data,'The Farmer in the Dell'),true);
 for(const rhyme of data.rhymes)for(const tune of rhyme.tunes)assert.equal(H.tuneIsSuggested(data,tune,[rhyme.id]),true);
});
test('未关联年月索引退出活跃数据，旧版本查询不冒充编号册',()=>{
 const before=JSON.stringify(data);
 assert.equal(data.issues,undefined);
 assert.deepEqual(H.filter(data,{edition:'dated'}),[]);
 assert.deepEqual(H.filter(data,{book:'hello-2019-01'}),[]);
 assert.equal(H.filter(data,{book:'hello-01'}).length,1);
 H.filter(data,{query:'one star'});assert.equal(JSON.stringify(data),before);
});
test('导出图谱关系有完整节点，童谣不推造Part关系',()=>{
 const g=H.graph(data),ids=new Set(g.nodes.map(n=>n.id));
 assert.equal(ids.size,g.nodes.length);
 assert.equal(g.nodes.filter(n=>n.type==='part').length,120);
 assert.equal(g.nodes.filter(n=>n.type==='rhyme').length,56);
 for(const e of g.edges){assert.ok(ids.has(e.from));assert.ok(ids.has(e.to));if(e.relation==='童谣')assert.match(e.from,/^hello-\d{2}$/);}
 const extension=g.edges.find(e=>e.from==='hello-rhyme-41'&&e.relation==='拓展儿歌');assert.ok(extension);
 assert.ok(!g.edges.some(e=>e.from==='hello-rhyme-41'&&e.to==='tune:The Farmer in the Dell'));
 for(const s of data.sources)assert.ok(existsSync(new URL('../english/'+s.file,import.meta.url)));
});
test('全部来源MP3、M4A和PDF均归册，哈希去重后仍保留所有原名与文件',async()=>{
 const {createHash}=await import('node:crypto');
 const files=data.books.flatMap(b=>b.resources.filter(r=>r.file));
 const sourceNames=files.flatMap(r=>r.originalNames||[]);
 assert.equal(sourceNames.length,139);
 assert.equal(sourceNames.filter(n=>n.toLowerCase().endsWith('.mp3')).length,82);
 assert.equal(sourceNames.filter(n=>n.toLowerCase().endsWith('.pdf')).length,54);
 assert.equal(sourceNames.filter(n=>n.toLowerCase().endsWith('.m4a')).length,3);
 assert.equal(data.assetInventory.downloadedFiles,data.assetInventory.sourceFiles);
 const unique=new Map(files.map(r=>[r.sha256,r]));
 assert.equal(unique.size,data.assetInventory.uniqueFiles);
 assert.equal([...unique.values()].reduce((n,r)=>n+r.bytes,0),data.assetInventory.uniqueBytes);
 for(const [sha,r] of unique){const bytes=readFileSync(new URL('../english/'+r.file,import.meta.url));assert.equal(bytes.length,r.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);}
 for(const b of data.books){assert.equal(b.resources.filter(r=>r.kind==='notes').length,1);assert.equal(b.resources.filter(r=>r.kind==='erin').length,1);assert.equal(b.resources.filter(r=>r.kind==='official').length,1);}
});
test('同名音频只关联本册童谣，资源文件名也能被检索',()=>{
 for(const b of data.books)for(const r of b.resources)for(const id of r.rhymeIds||[])assert.equal(data.rhymes.find(x=>x.id===id).bookId,b.id);
 const r=data.books[0].resources.find(r=>r.kind==='audio');assert.deepEqual(r.rhymeIds,['hello-rhyme-02']);
 assert.equal(H.filter(data,{query:'Creep Crawly Calypso'})[0].book.number,5);
});
test('同文另一录音归Part，补充只去除本册套唱已有的相同文件入口',()=>{
 const book=data.books.find(b=>b.id==='hello-03'),other=book.resources.find(r=>r.label==='We_re-going-on-a-car-ride.mp3');
 assert.deepEqual(other.rhymeIds,['hello-rhyme-06']);assert.deepEqual(other.partIds,['hello-03-part-4']);
 assert.ok(H.audioResources(data,book,{rhymeId:'hello-rhyme-06'}).includes(other));
 assert.ok(!H.supplementalAudio(data,book).includes(other));
 const fixture={books:[{id:'book',resources:[{kind:'audio',file:'same.mp3'},{kind:'audio',file:'different.mp3'},{kind:'audio',file:'whole.mp3'},{kind:'audio',file:'unrelated.mp3'}]}],rhymes:[{id:'song',bookId:'book',tunes:['Tune'],extensions:[]}],tuneAudio:{tunes:[{name:'Tune',file:'same.mp3'},{name:'Other',file:'unrelated.mp3'}]}};
 assert.deepEqual(H.supplementalAudio(fixture,'book').map(r=>r.file),['different.mp3','whole.mp3','unrelated.mp3']);
 assert.deepEqual(H.supplementalAudio(fixture,'missing'),[]);
});

test('资料包视频沿用实际分享记录，同名文件不得跨册错配',()=>{
 const observed=JSON.parse(readFileSync(new URL('./fixtures/hello-package-video-shares.json',import.meta.url)));
 const videos=data.books.flatMap(book=>book.resources.filter(resource=>resource.kind==='package-video').map(resource=>({book,resource})));
 assert.equal(videos.length,observed.shares.length);
 assert.equal(new Set(videos.map(({resource})=>resource.shortUrl)).size,videos.length);
 for(const expected of observed.shares){
  const matches=videos.filter(({book,resource})=>book.id===expected.bookId&&resource.sourceFile===expected.sourceFile);
  assert.equal(matches.length,1,`${expected.bookId}: ${expected.sourceFile}`);
  const {book,resource}=matches[0];
  assert.equal(resource.shortUrl,expected.shortUrl);
  const shareUrl=new URL(resource.url);
  assert.equal(shareUrl.hostname,'s.znas.cn');
  assert.equal(shareUrl.pathname,'/AppH5/share/');
  assert.ok(shareUrl.searchParams.get('nid'));
  assert.ok(shareUrl.searchParams.get('code'));
  assert.equal(resource.expiresAfterDays,180);
  assert.equal(resource.password,false);
  assert.equal(resource.maxVisits,1000);
  assert.equal(resource.sourcePackagePath.split('/')[0],`${book.number}号书资料包`);
  assert.ok(!resource.sourceFile.includes('.downloading'));
  for(const partId of resource.partIds||[]){
   assert.ok(partId.startsWith(book.id+'-part-'));
   assert.ok(book.parts.some(part=>partId===`${book.id}-part-${part.part}`));
   assert.ok(resource.mappingEvidence.some(evidence=>evidence.part===Number(partId.split('-').at(-1))&&evidence.quote&&evidence.page>0));
  }
 }
});
test('套唱示范与推荐拓展视频保留不同关系，不凭同册文件推断曲调',()=>{
 const video=(bookId,file)=>data.books.find(book=>book.id===bookId).resources.find(resource=>resource.kind==='package-video'&&resource.sourceFile===file);
 const monkeys=video('hello-06','Five Little Monkeys.mp4');
 assert.deepEqual(monkeys.partIds,['hello-06-part-2']);
 assert.deepEqual(monkeys.rhymeIds,['hello-rhyme-12']);
 assert.deepEqual(monkeys.tunes,['Five Little Monkeys']);
 const animal=video('hello-07','The Animal Boogie.mp4');
 assert.equal(animal.role,'extension-song');
 assert.deepEqual(animal.partIds,['hello-07-part-5']);
 assert.equal(animal.tunes,undefined);
 const patACake=video('hello-23','pat a cake.mp4');
 assert.deepEqual(patACake.partIds,['hello-23-part-2']);
 assert.equal(patACake.role,'extension-song');
 assert.equal(patACake.tunes,undefined);
 const unresolved=video('hello-02','064. The Bath Song.mp4');
 assert.equal(unresolved.partIds,undefined);
 assert.equal(unresolved.tunes,undefined);
});

test('1册理发视频使用已校验完整原文件的新分享，不使用下载残片',()=>{
 const book=data.books.find(book=>book.id==='hello-01');
 const video=book.resources.find(resource=>resource.kind==='package-video'&&resource.sourceFile==='hair cut.mp4');
 assert.equal(video.shortUrl,'https://t3.znas.cn/dFGiuTuvsS');
 assert.equal(video.sourcePackagePath,'1号书资料包/hair cut.mp4');
 assert.equal(video.sourceBytes,58371059);
 assert.equal(video.sha256,'58156c9ea2ff76855f779b87ac38a53401039a2e369f36c88162b795919974b7');
 assert.equal(video.duration,249.94);
 assert.deepEqual(video.partIds,['hello-01-part-4']);
 assert.equal(video.role,'extension-video');
 assert.equal(video.mappingEvidence[0].kind,'user-requested-scene-extension');
 assert.deepEqual(H.packageVideos(data,book,{partId:'hello-01-part-4'}).map(r=>r.id),[video.id]);
 assert.ok(!H.packageVideos(data,book,{partId:'hello-01-part-3'}).includes(video));
 assert.ok(!JSON.stringify(book.resources).includes('nIDaS1o9X76'));
});
