import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
const require=createRequire(import.meta.url),H=require('../english/hello-reading.js');
const data=JSON.parse(readFileSync(new URL('../english/data/hello-reading.json',import.meta.url)));
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
test('全部来源MP3和PDF均归册，哈希去重后仍保留所有原名与文件',async()=>{
 const {createHash}=await import('node:crypto');
 const files=data.books.flatMap(b=>b.resources.filter(r=>r.file));
 const sourceNames=files.flatMap(r=>r.originalNames||[]);
 assert.equal(sourceNames.length,136);
 assert.equal(sourceNames.filter(n=>n.toLowerCase().endsWith('.mp3')).length,82);
 assert.equal(sourceNames.filter(n=>n.toLowerCase().endsWith('.pdf')).length,54);
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
