import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{create}=require('../english/catalog-loader.js');

test('宝宝页不请求目录，并发请求共用一次读取且保留目标对象身份',async()=>{
  const target={books:[],sources:[]};let calls=0;
  const loader=create(target,'data/books.json?v=test',async url=>{calls++;assert.equal(url,'data/books.json?v=test');return {ok:true,json:async()=>({books:[{id:'one'}],sources:[]})};});
  assert.equal(calls,0);assert.equal(loader.ready,false);
  const [first,second]=await Promise.all([loader.load(),loader.load()]);
  assert.equal(calls,1);assert.equal(first,target);assert.equal(second,target);assert.equal(loader.ready,true);
  assert.equal((await loader.load()).books[0].id,'one');assert.equal(calls,1);
});
test('失败或不完整目录不污染现有数据，允许再次加载',async()=>{
  const target={books:[],sources:[]};let calls=0;
  const loader=create(target,'books.json',async()=>({ok:true,json:async()=>++calls===1?{books:[{id:'bad'}]}:{books:[{id:'ok'}],sources:[]}}));
  await assert.rejects(loader.load(),/不完整/);assert.equal(loader.ready,false);assert.deepEqual(target.books,[]);
  await loader.load();assert.equal(loader.ready,true);assert.equal(target.books[0].id,'ok');
});
test('离线内嵌目录直接可用，不请求网络',async()=>{
  const target={books:[{id:'offline'}]},loader=create(target,null,()=>{throw Error('不应请求');});
  assert.equal(loader.ready,true);assert.equal(await loader.load(),target);
});
