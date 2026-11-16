import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

// 只模拟预览所需DOM与认证响应，保护关闭／切册后迟到响应不恢复媒体。
function harness(request){
  let document;
  class Element extends EventTarget{
    constructor(tag,attrs={},...children){super();this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.style={};this.isConnected=false;this.classList={add:()=>{}};for(const [key,value] of Object.entries(attrs)){if(key.startsWith('on'))this.addEventListener(key.slice(2),value);else this[key]=value;}this.append(...children);}
    append(...items){for(const item of items.flat(Infinity)){if(item&&typeof item==='object'){item.parent=this;item.isConnected=this.isConnected;}if(item!=null)this.children.push(item);}}
    replaceChildren(...items){this.children=[];this.append(...items);}
    querySelectorAll(tags){const names=tags.split(',').map(tag=>tag.toUpperCase()),found=[];for(const child of this.children)if(child instanceof Element){if(names.includes(child.tagName))found.push(child);found.push(...child.querySelectorAll(tags));}return found;}
    querySelector(tag){return this.querySelectorAll(tag)[0];}
    remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
    removeAttribute(key){delete this[key];}
    showModal(){this.isConnected=true;}
    close(){this.dispatchEvent(new Event('close'));}
    focus(){document.activeElement=this;}
  }
  document={baseURI:'https://example.test/english/index.html',body:new Element('body'),addEventListener:()=>{}};
  document.body.isConnected=true;
  const trigger=new Element('button');trigger.isConnected=true;document.activeElement=trigger;
  const window={addEventListener:()=>{},EnglishAudio:{stop:()=>{}},URL,AbortController};
  const context={window,document,URL,URLSearchParams,AbortController,fetch:request};
  vm.runInNewContext(fs.readFileSync(new URL('../english/file-preview.js',import.meta.url),'utf8'),context);
  const share='https://s.znas.cn/AppH5/share/?nid=device&code=share&mode=file';
  const preview=window.EnglishFilePreview.install({h:(...args)=>new Element(...args),asset:x=>x,externalUrls:[share]});
  return {preview,share,document,trigger};
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
