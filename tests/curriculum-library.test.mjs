import test from 'node:test';
import assert from 'node:assert/strict';
import {bookEntries,filterBookEntries,defaultCatalogGroup} from '../curriculum/library-model.mjs';

test('同册多目录去重并保留版本引用，不按同名跨版合并',()=>{
 const item={id:'series',title:'套系',ref:{level:'起步'}};
 const group=(id,books)=>({id,title:id,books});
 const entries=bookEntries([{item,groups:[group('v1',[{id:'a',title:'小猫'}]),group('subset',[{id:'a',title:'小猫'}]),group('v2',[{id:'b',title:'小猫'}])]}]);
 assert.equal(entries.length,2);assert.equal(entries[0].refs.length,2);
 const filtered=filterBookEntries(entries,{catalog:'subset',search:'小猫',state:()=>({done:false})});
 assert.equal(filtered.length,1);assert.equal(filtered[0].refs[0].group.id,'subset');
 assert.equal(entries[0].refs.length,2);
});
test('单本题名、套系、版本和完成取交集，筛选不改原目录或完成分母',()=>{
 const item={id:'sheep',title:'小羊上山',ref:{level:'第一级'}};
 const group={id:'level1',title:'第一级',books:[{id:'1',title:'藏西瓜'},{id:'2',title:'我爱妈妈'}]};
 const entries=bookEntries([{item,groups:[group]}]),state=e=>({done:e.book.id==='1'});
 assert.equal(filterBookEntries(entries,{search:'西瓜',state}).length,1);
 assert.equal(filterBookEntries(entries,{completion:'done',series:'sheep',catalog:'level1',state}).length,1);
 assert.equal(filterBookEntries(entries,{search:'妈妈',completion:'done',state}).length,0);
 assert.equal(group.books.length,2);assert.equal(entries.length,2);
});
test('目录默认定位最高进行中级别，否则最低未完级别',()=>{
 const groups=[{id:'1',books:[{id:'a'},{id:'b'}]},{id:'2',books:[{id:'c'},{id:'d'}]}];
 assert.equal(defaultCatalogGroup(groups,()=>({done:false})),'1');
 assert.equal(defaultCatalogGroup(groups,book=>({done:['a','c'].includes(book.id)})),'2');
 assert.equal(defaultCatalogGroup(groups,book=>({done:['a','b'].includes(book.id)})),'2');
});
