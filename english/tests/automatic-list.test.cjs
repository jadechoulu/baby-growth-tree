const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createManager}=require('../automatic-list.js');

function harness(){
  const frames=[],targets=new Set(),listeners=new Set();let callback,mutation,disconnected=0;
  const node=()=>({isConnected:true,parentElement:null,children:[],attributes:{},blocked:false,
    closest(){return this.blocked?this:null;},getClientRects(){return [1];},
    setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},
    append(child){this.children.push(child);},
    replaceChildren(...children){for(const old of this.children)old.isConnected=false;this.children=children;}});
  const env={document:{documentElement:{},createElement:node,addEventListener:()=>listeners.add('scroll'),removeEventListener:()=>listeners.delete('scroll')},
    requestAnimationFrame:fn=>(frames.push(fn),frames.length),addEventListener:()=>listeners.add('resize'),removeEventListener:()=>listeners.delete('resize'),
    IntersectionObserver:class{constructor(fn){callback=fn;}observe(n){targets.add(n);}unobserve(n){targets.delete(n);}},
    MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){disconnected++;}}};
  const manager=createManager(env);
  return {manager,env,targets,listeners,get disconnected(){return disconnected;},
    flush(){while(frames.length)frames.shift()();},mutate(){mutation();},
    enter(n){callback([{target:n,isIntersecting:true}]);}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('可见尾标推进一次，异步加载期间重复进入不重入，结束解除监听',async()=>{
  const h=harness();let calls=0,resolve;
  const marker=h.manager.create({hasMore:true,load:()=>{calls++;return new Promise(r=>resolve=r);}});
  h.flush();h.enter(marker);h.enter(marker);await settle();assert.equal(calls,1);
  h.enter(marker);assert.equal(calls,1);resolve();await settle();h.flush();
  h.enter(marker);assert.equal(calls,1);assert.equal(h.targets.size,0);assert.equal(h.listeners.size,0);
});

test('折叠、背景inert和移除后的尾标不加载，重新展开后继续',async()=>{
  const h=harness();let calls=0;
  const marker=h.manager.create({hasMore:true,load:()=>calls++});
  marker.parentElement={tagName:'DETAILS',open:false,parentElement:null};h.flush();h.enter(marker);await settle();assert.equal(calls,0);
  marker.parentElement.open=true;marker.blocked=true;h.mutate();h.flush();h.enter(marker);await settle();assert.equal(calls,0);
  marker.blocked=false;h.mutate();h.flush();h.enter(marker);marker.isConnected=false;await settle();h.flush();assert.equal(calls,0);assert.equal(h.targets.size,0);
  const next=h.manager.create({hasMore:true,load:()=>calls++});h.flush();h.enter(next);await settle();assert.equal(calls,1);
});

test('筛选后旧回调失效，完成尾标不注册后续任务',async()=>{
  const h=harness();let calls=0;
  const old=h.manager.create({hasMore:true,load:()=>calls++});h.flush();old.isConnected=false;
  const done=h.manager.create({hasMore:false});h.mutate();h.flush();h.enter(old);h.enter(done);await settle();
  assert.equal(calls,0);assert.equal(h.targets.size,0);assert.ok(h.disconnected);
});

test('失败停止自动重试，仅明确重试才再次调用',async()=>{
  const h=harness();let calls=0;
  const marker=h.manager.create({hasMore:true,load:()=>{if(++calls===1)throw new Error('网络错误');}});
  h.flush();h.enter(marker);await settle();h.flush();h.enter(marker);await settle();assert.equal(calls,1);
  marker.children[0].onclick();await settle();assert.equal(calls,2);
});

test('尾标逐批追加直到总量，末批不重复、不越界、不改已有记录',async()=>{
  const h=harness(),context=vm.createContext(h.env);
  vm.runInContext(fs.readFileSync(require.resolve('../automatic-list.js'),'utf8'),context);
  const records={read:4},items=Array.from({length:53},(_,i)=>({id:i})),shown=items.slice(0,18),first=shown[0];
  const tail=h.env.EnglishAutomaticList.tail({total:53,limit:18,step:18,load:(from,to)=>shown.push(...items.slice(from,to))});
  h.flush();h.enter(tail.children[0]);h.enter(tail.children[0]);await settle();h.flush();assert.equal(shown.length,36);
  h.enter(tail.children[0]);await settle();h.flush();assert.equal(shown.length,53);
  h.enter(tail.children[0]);await settle();assert.equal(shown.length,53);assert.equal(h.targets.size,0);
  assert.equal(shown[0],first);assert.deepEqual(shown,items);assert.deepEqual(records,{read:4});
});
