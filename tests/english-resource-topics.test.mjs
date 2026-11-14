import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),{resourceTopics}=require('../english/catalog-loader.js');
const app=fs.readFileSync(new URL('../english/app.js',import.meta.url),'utf8');
const deferred=app.slice(app.indexOf('const deferredLoads='),app.indexOf('let bookLoading='));
const evidence=app.slice(app.indexOf('function resourceTopicEvidence('),app.indexOf('function resourceTopicInfo('));
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function setup(fetcher){
  function connected(node,value){if(!node||typeof node!=='object')return;node.isConnected=value;node.childNodes.forEach(child=>connected(child,value));}
  function h(tag,attrs,...children){
    const node={tag,attrs,childNodes:children.flat(Infinity).filter(child=>child!==null&&child!==undefined),isConnected:false,
      replaceChildren(...next){this.childNodes.forEach(child=>connected(child,false));this.childNodes=next;next.forEach(child=>connected(child,this.isConnected));}};
    return node;
  }
  const taxonomy={resourceMappings:{a:{topics:['animals']},b:{topics:['daily']}}},loader=resourceTopics(taxonomy,'resource-topics.json',fetcher),state={modal:{id:'a'}};
  const context={S:state,resourceTopicLoader:loader,h,topicUI:{evidence(domain,resource){return h('details',{},h('summary',{},'依据'),h('p',{},taxonomy.resourceMappings[resource.id].basis));}}};
  vm.runInNewContext(deferred+evidence,context);
  function mount(id){const node=context.resourceTopicEvidence({id});connected(node,true);return node;}
  function open(node){node.open=true;node.attrs.ontoggle?.({target:node,currentTarget:node});}
  return {mount,open,state,connected,loader};
}

test('收起主题依据不请求，切换资源共用请求，旧详情的迟到回调不覆盖当前详情',async()=>{
  let finish,calls=0;
  const pending=new Promise(resolve=>{finish=resolve;}),s=setup(()=>{calls++;return pending;});
  const first=s.mount('a');assert.equal(calls,0);s.open(first);assert.equal(calls,1);
  s.connected(first,false);s.state.modal={id:'b'};
  const second=s.mount('b');s.open(second);assert.equal(calls,1);
  finish({ok:true,json:async()=>({a:{topics:['animals'],basis:'A的证据'},b:{topics:['daily'],basis:'B的证据'}})});
  await settle();
  assert.equal(second.childNodes[1].childNodes[0].childNodes[0],'B的证据');
  assert.notEqual(first.childNodes[1].childNodes[0].childNodes[0],'A的证据');
  assert.equal(s.loader.ready,true);
});

test('主题依据读取失败显示重试，重试成功恢复当前资源依据',async()=>{
  let calls=0;
  const s=setup(async()=>++calls===1?{ok:false}:{ok:true,json:async()=>({a:{topics:['animals'],basis:'A的证据'},b:{topics:['daily'],basis:'B的证据'}})});
  const detail=s.mount('a');s.open(detail);await settle();
  assert.equal(s.loader.ready,false);
  const loading=detail.childNodes[1].childNodes[0],retry=loading.childNodes.find(child=>child.tag==='button');
  assert.ok(retry);retry.attrs.onclick();await settle();
  assert.equal(calls,2);assert.equal(detail.childNodes[1].childNodes[0].childNodes[0],'A的证据');
});
