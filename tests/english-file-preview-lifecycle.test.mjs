import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

// 只模拟预览所需DOM与认证响应，保护关闭／切册后迟到响应不恢复媒体。
function harness(request,onMinimize){
  let document;
  class Element extends EventTarget{
    constructor(tag,attrs={},...children){super();this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.style={};this.isConnected=false;const classes=new Set();this.classList={add:name=>classes.add(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)};for(const [key,value] of Object.entries(attrs)){if(key.startsWith('on'))this.addEventListener(key.slice(2),value);else this[key]=value;}this.append(...children);}
    append(...items){for(const item of items.flat(Infinity)){if(item&&typeof item==='object'){item.parent=this;item.isConnected=this.isConnected;}if(item!=null)this.children.push(item);}}
    replaceChildren(...items){this.children=[];this.append(...items);}
    querySelectorAll(tags){const names=tags.split(',').map(tag=>tag.toUpperCase()),found=[];for(const child of this.children)if(child instanceof Element){if(names.includes(child.tagName))found.push(child);found.push(...child.querySelectorAll(tags));}return found;}
    querySelector(tag){return this.querySelectorAll(tag)[0];}
    remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
    removeAttribute(key){delete this[key];}
    setAttribute(key,value){this[key]=value;}
    getBoundingClientRect(){const parent=this.tagName==='DIALOG'?this:this.parent;const width=parseFloat(parent?.style.width)||200,height=parseFloat(parent?.style.height)||392;return {left:parseFloat(parent?.style.left)||20,top:parseFloat(parent?.style.top)||200,width:parseFloat(this.style.width)||(this.tagName==='DIV'?width-2:width),height:this.tagName==='HEADER'?(parent?.classList.contains('file-preview-listening')?54:38):parseFloat(this.style.height)||(this.tagName==='DIV'?height-40:height)};}
    setPointerCapture(){}
    closest(){return this.tagName==='BUTTON'||this.tagName==='A'?this:null;}
    showModal(){this.isConnected=true;this.open=true;this.modal=true;}
    show(){this.isConnected=true;this.open=true;this.modal=false;}
    close(){this.open=false;this.dispatchEvent(new Event('close'));}
    focus(){document.activeElement=this;}
  }
  document={baseURI:'https://example.test/english/index.html',body:new Element('body'),addEventListener:()=>{}};
  document.body.isConnected=true;
  const trigger=new Element('button');trigger.isConnected=true;document.activeElement=trigger;
  const window=Object.assign(new EventTarget(),{innerWidth:506,innerHeight:799,EnglishAudio:{stop:()=>{}},URL,AbortController});
  const context={window,document,URL,URLSearchParams,AbortController,fetch:request};
  vm.runInNewContext(fs.readFileSync(new URL('../english/file-preview.js',import.meta.url),'utf8'),context);
  const share='https://s.znas.cn/AppH5/share/?nid=device&code=share&mode=file';
  const preview=window.EnglishFilePreview.install({h:(...args)=>new Element(...args),asset:x=>x,externalUrls:[share],onMinimize});
  return {preview,share,document,trigger,window};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('打开单册后关闭：终止认证，迟到响应不重新创建播放器并恢复焦点',async()=>{
  let resolve,signal;
  const h=harness((url,options)=>{signal=options.signal;return new Promise(done=>{resolve=done;});});
  assert.ok(h.preview.openFile(h.share,{name:'完整版.mp4',path:'file'},'测试',h.trigger));
  const dialog=h.document.body.querySelector('dialog');
  h.preview.close();assert.ok(signal.aborted);assert.equal(h.document.activeElement,h.trigger);
  resolve({ok:true,json:async()=>({code:200,data:{dtoken:'late-test-only'}})});await settle();
  assert.equal(dialog.querySelectorAll('iframe').length,0);
  assert.equal(h.document.body.querySelectorAll('dialog').length,0);
});

test('认证失败后原弹窗可重试，关闭清除官方播放器地址',async()=>{
  let count=0;
  const h=harness(async()=>({ok:true,json:async()=>++count===1?{code:500,msg:'暂不可用'}:{code:200,data:{dtoken:'temporary-test-only'}}}));
  h.preview.openFile(h.share,{name:'完整版.mp4',path:'file',note:'版本差异'},'测试',h.trigger);await settle();
  const dialog=h.document.body.querySelector('dialog'),retry=dialog.querySelectorAll('button').find(button=>button.attrs['aria-label']==='重新加载视频');
  assert.ok(retry);retry.dispatchEvent(new Event('click'));await settle();
  const frame=dialog.querySelector('iframe');assert.ok(frame.src.includes('/AppH5/share/player?'));
  const original=dialog.querySelectorAll('a').find(link=>link.class==='file-preview-original');
  assert.equal(original.href,h.share,'原地址仍为官方分享页，不包含临时令牌');
  h.preview.close();assert.equal(frame.src,undefined);assert.equal(h.document.body.style.overflow,undefined);
});

test('小窗释放模态与页面滚动，恢复沿用同一播放器和认证，最终关闭才释放媒体',async()=>{
  let requests=0,releases=0,signal;
  const h=harness(async(_url,options)=>{requests++;signal=options.signal;return {ok:true,json:async()=>({code:200,data:{dtoken:'temporary-test-only'}})};},()=>{releases++;return '';});
  h.preview.openFile(h.share,{name:'完整版.mp4',path:'file',width:720,height:1280},'测试',h.trigger);await settle();
  const dialog=h.document.body.querySelector('dialog'),frame=dialog.querySelector('iframe'),url=frame.src;
  const mini=dialog.querySelectorAll('button').find(button=>button['aria-label']==='小窗播放（可继续操作页面）');
  mini.dispatchEvent(new Event('click'));
  assert.equal(releases,1);assert.equal(dialog.modal,false);assert.equal(dialog.open,true);
  const aspect=()=> (parseFloat(dialog.style.width)-2)/(parseFloat(dialog.style.height)-40);
  assert.ok(Math.abs(aspect()-9/16)<1e-6,'竖屏画面按原比例显示');
  assert.equal(h.document.body.style.overflow,'');assert.equal(signal.aborted,false);
  assert.equal(dialog.querySelector('iframe'),frame);assert.equal(frame.src,url);
  const pointer=(type,x,y)=>Object.assign(new Event(type),{button:0,clientX:x,clientY:y,pointerId:1});
  const header=dialog.querySelector('header');header.dispatchEvent(pointer('pointerdown',20,200));header.dispatchEvent(pointer('pointermove',80,260));header.dispatchEvent(pointer('pointerup',80,260));
  assert.equal(dialog.style.left,'80px');assert.equal(dialog.style.top,'260px');
  const resize=dialog.querySelectorAll('button').find(button=>button.className==='file-preview-resize'),before=parseFloat(dialog.style.width);
  resize.dispatchEvent(pointer('pointerdown',280,650));resize.dispatchEvent(pointer('pointermove',330,700));resize.dispatchEvent(pointer('pointerup',330,700));
  assert.ok(parseFloat(dialog.style.width)>before);assert.ok(Math.abs(aspect()-9/16)<1e-6,'拖拽缩放仍保持比例');
  // 模拟浏览器排队的close事件，切模式后不能销毁仍打开的播放器。
  dialog.dispatchEvent(new Event('close'));assert.equal(frame.src,url);
  mini.dispatchEvent(new Event('click'));
  assert.equal(dialog.modal,true);assert.equal(h.document.body.style.overflow,'hidden');
  assert.equal(dialog.querySelector('iframe'),frame);assert.equal(requests,1);
  mini.dispatchEvent(new Event('click'));h.preview.close();
  assert.equal(frame.src,undefined);assert.equal(signal.aborted,true);
  assert.equal(h.document.body.style.overflow,'');assert.equal(h.document.body.querySelectorAll('dialog').length,0);
});

test('页面拒绝收起未保存表单时，保持视频大窗和播放节点',async()=>{
  const h=harness(async()=>({ok:true,json:async()=>({code:200,data:{dtoken:'temporary-test-only'}})}),()=>false);
  h.preview.openFile(h.share,{name:'完整版.mp4',path:'file'},'测试',h.trigger);await settle();
  const dialog=h.document.body.querySelector('dialog'),frame=dialog.querySelector('iframe');
  dialog.querySelectorAll('button').find(button=>button['aria-label']==='小窗播放（可继续操作页面）').dispatchEvent(new Event('click'));
  assert.equal(dialog.modal,true);assert.equal(dialog.querySelector('iframe'),frame);
  assert.equal(h.document.body.style.overflow,'hidden');h.preview.close();
});

test('横屏首次进入小窗先限制尺寸再修正位置，标题栏与缩放角均留在屏幕内',async()=>{
  const h=harness(async()=>({ok:true,json:async()=>({code:200,data:{dtoken:'temporary-test-only'}})}));
  h.window.innerWidth=700;h.window.innerHeight=360;
  h.preview.openFile(h.share,{name:'完整版.mp4',path:'file',width:720,height:1280},'测试',h.trigger);await settle();
  const dialog=h.document.body.querySelector('dialog');
  dialog.querySelectorAll('button').find(button=>button['aria-label']==='小窗播放（可继续操作页面）').dispatchEvent(new Event('click'));
  assert.equal(parseFloat(dialog.style.top),8);
  assert.ok(parseFloat(dialog.style.top)+parseFloat(dialog.style.height)<=352);
  h.preview.close();
});

test('收听条复用同一播放器，拖动和视口收缩后可恢复等比小窗及大窗',async()=>{
  let requests=0,signal;
  const h=harness(async(_url,options)=>{requests++;signal=options.signal;return {ok:true,json:async()=>({code:200,data:{dtoken:'temporary-test-only'}})};});
  const initialOverflow=h.document.body.style.overflow;
  h.preview.openFile(h.share,{name:'完整版.mp4',path:'file',width:720,height:1280},'测试',h.trigger);await settle();
  const dialog=h.document.body.querySelector('dialog'),frame=dialog.querySelector('iframe'),url=frame.src;
  const buttons=dialog.querySelectorAll('button'),mini=buttons.find(button=>button['aria-label']==='小窗播放（可继续操作页面）'),listen=buttons.find(button=>button['aria-label']==='收起画面，只听声音');
  const resize=buttons.find(button=>button.className==='file-preview-resize'),move=buttons.find(button=>button.className==='file-preview-move'),body=frame.parent;
  assert.equal(listen.hidden,true);mini.dispatchEvent(new Event('click'));assert.equal(listen.hidden,false);
  const key=(target,key)=>target.dispatchEvent(Object.assign(new Event('keydown'),{key}));
  key(resize,'ArrowRight');const videoSize={width:dialog.style.width,height:dialog.style.height};
  listen.dispatchEvent(new Event('click'));
  assert.equal(dialog.style.width,'200px');assert.equal(dialog.style.height,'56px');assert.equal(dialog.modal,false);
  assert.equal(listen['aria-pressed'],'true');assert.equal(body.inert,true);assert.equal(body['aria-hidden'],'true');assert.equal(resize.hidden,true);
  assert.equal(frame.src,url);assert.equal(dialog.querySelector('iframe'),frame);assert.equal(signal.aborted,false);assert.equal(requests,1);
  const pointer=(type,x,y)=>Object.assign(new Event(type),{button:0,clientX:x,clientY:y,pointerId:1});
  const header=dialog.querySelector('header');header.dispatchEvent(pointer('pointerdown',20,200));header.dispatchEvent(pointer('pointermove',500,700));header.dispatchEvent(pointer('pointerup',500,700));
  assert.equal(dialog.style.left,'298px');key(move,'ArrowLeft');assert.equal(dialog.style.left,'274px');
  h.window.innerWidth=320;h.window.innerHeight=568;h.window.dispatchEvent(new Event('resize'));
  assert.equal(dialog.style.left,'112px');assert.equal(dialog.style.top,'504px');
  listen.dispatchEvent(new Event('click'));
  assert.equal(dialog.style.width,videoSize.width);assert.equal(dialog.style.height,videoSize.height);
  assert.equal(body.inert,false);assert.equal(body['aria-hidden'],undefined);assert.equal(body.style.width,'');assert.equal(resize.hidden,false);
  assert.ok(parseFloat(dialog.style.top)+parseFloat(dialog.style.height)<=560);
  assert.equal(frame.src,url);assert.equal(dialog.querySelector('iframe'),frame);
  listen.dispatchEvent(new Event('click'));mini.dispatchEvent(new Event('click'));
  assert.equal(dialog.modal,true);assert.equal(body.inert,false);assert.equal(listen.hidden,true);assert.equal(dialog.style.height,'');
  assert.equal(dialog.querySelector('iframe'),frame);assert.equal(frame.src,url);assert.equal(requests,1);
  mini.dispatchEvent(new Event('click'));listen.dispatchEvent(new Event('click'));
  buttons.find(button=>button['aria-label']==='关闭资源预览').dispatchEvent(new Event('click'));
  assert.equal(frame.src,undefined);assert.equal(signal.aborted,true);assert.equal(h.document.body.style.overflow,initialOverflow);assert.equal(h.document.activeElement,h.trigger);
});

test('视频仍在加载时收起画面，迟到播放器保留收听模式，关闭后迟到认证不恢复媒体',async()=>{
  let resolve;
  const h=harness(()=>new Promise(done=>{resolve=done;}));
  h.preview.openFile(h.share,{name:'完整版.mp4',path:'file'},'测试',h.trigger);
  const dialog=h.document.body.querySelector('dialog'),buttons=dialog.querySelectorAll('button');
  buttons.find(button=>button['aria-label']==='小窗播放（可继续操作页面）').dispatchEvent(new Event('click'));
  buttons.find(button=>button['aria-label']==='收起画面，只听声音').dispatchEvent(new Event('click'));
  resolve({ok:true,json:async()=>({code:200,data:{dtoken:'temporary-test-only'}})});await settle();
  assert.ok(dialog.querySelector('iframe'));assert.equal(dialog.style.height,'56px');
  assert.equal(dialog.querySelector('iframe').parent.inert,true);h.preview.close();
  h.preview.openFile(h.share,{name:'完整版.mp4',path:'other'},'另一册',h.trigger);
  const next=h.document.body.querySelector('dialog');h.preview.close();
  resolve({ok:true,json:async()=>({code:200,data:{dtoken:'late-test-only'}})});await settle();
  assert.equal(next.querySelector('iframe'),undefined);assert.equal(h.document.body.querySelectorAll('dialog').length,0);
});
