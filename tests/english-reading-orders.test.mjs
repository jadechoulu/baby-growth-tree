import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url),BP=require('../english/book-progress.js');
const plan=require('../english/data/reading-plans.json').plans[0];
const source=await readFile(new URL('../english/app.js',import.meta.url),'utf8');
const detail=source.slice(source.indexOf('function readingPlanDetail('),source.indexOf('function libraryQuantityContext('));

test('详情切换顺序保留级别、主题及完成事实，重置分页并继续复用播放入口',()=>{
  const records=BP.manualUpdate({},'heinemann-gk70-02',true),modal={readingGroup:'all',readingBrowser:{topic:'animals',subtopic:'all',limit:48}};
  let nodes=[],listed=[],focus;
  const context={S:{modal,records},BP,BOOKS:{},READING:{plans:[plan]},byId:new Map(),
    libraryReadingScope(){},readingPlanForResource:()=>plan,
    sharedReadingProgress:(_plan,group)=>BP.progress(records,plan,group),
    TOPICS:{patterns:()=>[]},profileReady:false,readingSync:{busy:false},syncXiaohuashengRead(){},
    resourceBookCatalog(){},resourceDetail(){},readingFold(){},
    libraryBookCover:book=>({cover:book.id}),bookReadCountBadge(){},
    bookCompletionControl:book=>({completion:book.id,done:BP.bookState(records,book).done}),
    bookVideoButton:book=>({video:book.id}),
    h(tag,props,...children){const node={tag,...props,children:children.flat(Infinity)};nodes.push(node);return node;},
    seriesTopicBrowser(_id,books,render){listed=books;return render(books);},
    refreshReadingPlan(id){focus=id;render();},
  };
  vm.runInNewContext(detail,context);
  const render=()=>{nodes=[];return context.readingPlanDetail(plan.resourceId);};
  render();
  assert.deepEqual(listed.slice(0,3).map(book=>book.number),[1,6,7]);
  const browser=modal.readingBrowser,unchanged=JSON.stringify(records);
  nodes.find(node=>node.id==='reading-order-book').onclick();
  assert.equal(focus,'reading-order-book');
  assert.equal(modal.readingBrowser,browser);
  assert.equal(browser.topic,'animals');
  assert.equal(browser.limit,24);
  assert.equal(listed.length,70);
  assert.equal(nodes.filter(node=>node.class==='reading-pattern-heading').length,0);
  nodes.find(node=>node.id==='reading-group-B').onclick();
  assert.equal(modal.readingOrder,'book');
  assert.equal(listed.length,15);
  assert.equal(modal.readingGroup,'B');
  assert.deepEqual(listed.map(book=>book.number),listed.map(book=>book.number).sort((a,b)=>a-b));
  assert.equal(nodes.filter(node=>node.class==='reading-pattern-heading').length,0);
  assert.equal(nodes.filter(node=>node.class?.startsWith('reading-book-item')).length,15);
  nodes.find(node=>node.id==='reading-order-pattern').onclick();
  assert.equal(modal.readingGroup,'B');
  assert.equal(modal.readingBrowser.topic,'animals');
  assert.equal(listed.length,15);
  assert.equal(JSON.stringify(records),unchanged);
  nodes.find(node=>node.id==='reading-group-A').onclick();
  assert.deepEqual(Array.from(modal.readingGroup),['A','B']);
  assert.equal(listed.length,58);
  assert.equal(new Set(listed.map(book=>book.id)).size,58);
  assert.equal(nodes.find(node=>node.id==='reading-group-A')['aria-pressed'],'true');
  assert.equal(nodes.find(node=>node.id==='reading-group-B')['aria-pressed'],'true');
  nodes.find(node=>node.id==='reading-order-book').onclick();
  assert.deepEqual(Array.from(modal.readingGroup),['A','B']);
  assert.equal(modal.readingBrowser.topic,'animals');
  assert.equal(listed.length,58);
  nodes.find(node=>node.id==='reading-group-B').onclick();
  assert.equal(modal.readingGroup,'A');
  assert.equal(listed.length,43);
  nodes.find(node=>node.id==='reading-group-all').onclick();
  assert.equal(modal.readingGroup,'all');
  assert.equal(listed.length,70);
  assert.equal(JSON.stringify(records),unchanged);
});
