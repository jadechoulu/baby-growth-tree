import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
const H=createRequire(import.meta.url)('../english/hello-reading.js');
const base=JSON.parse(readFileSync(new URL('../english/data/hello-reading.json',import.meta.url)));
const rhyme=base.rhymes.find(r=>r.bookId==='hello-01');
function fixture(){const data=structuredClone(base);data.materialCards={items:[
 {id:'exact-card',type:'rhyme-card',bookId:'hello-01',rhymeIds:[rhyme.id],title:'精确匹配童谣卡',origin:'source-pack'},
 {id:'book-page',type:'rhyme-card',bookId:'hello-01',rhymeIds:[rhyme.id],title:'原书提取页',origin:'book-pages'},
 {id:'vocab',type:'vocabulary-card',bookId:'hello-01',rhymeIds:[rhyme.id],title:'本册词汇卡'},
 {id:'unknown',type:'unclassified',bookId:'hello-01',rhymeIds:[rhyme.id],title:'未分类资料'},
 {id:'whole-book',type:'reading-guide',bookId:'hello-01',rhymeIds:[],title:'整册阅读指引'},
 {id:'another-book',type:'rhyme-card',bookId:'hello-02',rhymeIds:[rhyme.id],title:'其他册资源'}
]};return data;}
test('素材卡按书册保留，词汇卡和未分类不强配童谣，跨册不串联',()=>{
 const data=fixture();
 assert.equal(H.materials(data,{bookId:'hello-01'}).length,5);
 assert.deepEqual(H.materials(data,{rhymeId:rhyme.id}).map(i=>i.id),['exact-card','book-page']);
 assert.equal(H.materials(data,{bookId:'hello-02',rhymeId:rhyme.id}).length,0);
 assert.equal(H.materials(data,{rhymeId:'missing'}).length,0);
});
test('独立童谣卡和原书童谣页分别标注，搜索只关联明确目标',()=>{
 const data=fixture();
 assert.equal(H.materialLabel(data.materialCards.items[0]),'童谣卡');
 assert.equal(H.materialLabel(data.materialCards.items[1]),'原书童谣页');
 assert.equal(H.materialLabel(data.materialCards.items[2]),'词汇卡');
 assert.deepEqual(H.browse(data,{query:'精确匹配童谣卡'}).rhymes.map(row=>row.rhyme.id),[rhyme.id]);
 assert.equal(H.browse(data,{query:'本册词汇卡'}).rhymes.length,0);
 assert.deepEqual(H.filter(data,{query:'本册词汇卡'}).map(row=>row.book.id),['hello-01']);
});

test('真实素材预览与原件存在，所有童谣关联留在本册，词汇卡只属书册',()=>{
 const data=structuredClone(base);data.materialCards=JSON.parse(readFileSync(new URL('../english/data/hello-material-cards.json',import.meta.url)));
 const items=H.materials(data),ids=new Set(items.map(i=>i.id));
 assert.equal(ids.size,items.length);assert.ok(items.length>0);
 const books=new Set(data.books.map(b=>b.id)),rhymes=new Map(data.rhymes.map(r=>[r.id,r]));
 for(const item of items){
  assert.ok(books.has(item.bookId),item.id);
  assert.ok(existsSync(new URL('../english/'+item.file,import.meta.url)),item.file);
  assert.ok(existsSync(new URL('../english/'+item.preview,import.meta.url)),item.preview);
  for(const rid of item.rhymeIds)assert.equal(rhymes.get(rid)?.bookId,item.bookId,item.id);
  if(item.type==='vocabulary-card')assert.deepEqual(item.rhymeIds,[]);
  if(item.origin==='book-pages')assert.equal(H.materialLabel(item),'原书童谣页');
 }
});
