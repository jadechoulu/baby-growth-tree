import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const {coordinator,tuneSource}=createRequire(import.meta.url)('../english/audio-player.js');
test('播放新音频暂停旧音频，迟到pause不清除新状态',()=>{
 const seen=[],manager=coordinator(media=>seen.push(media));
 const first={pause(){manager.event('pause',this);}},second={pause(){manager.event('pause',this);}};
 manager.event('play',first);manager.event('play',second);
 assert.equal(manager.current,second);manager.event('pause',first);assert.equal(manager.current,second);
 first.paused=true;manager.event('play',first);assert.equal(manager.current,second);
 manager.event('ended',second);assert.equal(manager.current,null);assert.equal(seen.at(-1),null);
});
test('暂停、结束、错误和离开页面统一复位',()=>{
 const manager=coordinator();let paused=0;const media={pause(){paused++;}};
 for(const event of ['pause','ended','error']){manager.event('play',media);manager.event(event,media);assert.equal(manager.current,null);}
 manager.event('play',media);manager.stop();assert.equal(paused,1);assert.equal(manager.current,null);
});
test('曲调只关联显式曲调资源，不把同名童谣朗读作为曲调',()=>{
 const data={books:[{resources:[{kind:'audio',file:'rhyme.mp3',rhymeIds:['r1'],label:'Other'},{kind:'audio',file:'tune.mp3',tunes:['I’m a Little Teapot']}]}]};
 assert.equal(tuneSource("I'm a Little Teapot",data).file,'tune.mp3');assert.equal(tuneSource('Other',data),null);
 data.tuneAudio={tunes:[{name:'Other',file:'verified.mp3'}]};assert.equal(tuneSource('Other',data).file,'verified.mp3');
});
test('曲调资料覆盖完整索引，可播放文件与外部试听目标真实存在',()=>{
 const data=JSON.parse(readFileSync(new URL('../english/data/hello-reading.json',import.meta.url))),audio=JSON.parse(readFileSync(new URL('../english/data/hello-tune-audio.json',import.meta.url)));
 const names=new Set(data.rhymes.flatMap(r=>r.tunes.concat(r.extensions.map(e=>e.tune))));
 assert.deepEqual(new Set(audio.tunes.map(t=>t.name)),names);assert.equal(audio.tunes.length,names.size);
 for(const item of audio.tunes){
  if(item.status==='available'){assert.ok(item.file);assert.ok(existsSync(new URL('../english/'+item.file,import.meta.url)));assert.ok(tuneSource(item.name,{...data,tuneAudio:audio}));}
  else if(item.status==='preview'){assert.equal(new URL(item.previewUrl).protocol,'https:');assert.ok(tuneSource(item.name,{...data,tuneAudio:audio}));}
  else if(item.status==='external')assert.equal(new URL(item.sourceUrl).protocol,'https:');
  else{assert.equal(item.status,'missing');assert.equal(item.file,undefined);}
 }
});

test('NAS同SHA的改编演唱归入童谣，不能借原包曲调文件名冒充经典原曲',()=>{
 const data=JSON.parse(readFileSync(new URL('../english/data/hello-reading.json',import.meta.url))),audio=JSON.parse(readFileSync(new URL('../english/data/hello-tune-audio.json',import.meta.url)));
 const rain=data.books.find(book=>book.id==='hello-16').resources.find(resource=>resource.sha256==='948db88c48733be2d5107eb5701a4dc06235cc93a5252af2d501fd2f0176f4ff');
 assert.deepEqual(rain.rhymeIds,['hello-rhyme-36']);assert.deepEqual(rain.tunes,[]);assert.ok(rain.additionalSources.some(source=>source.provider==='极空间'&&source.fileName==='16 Rain and Sun.mp3'&&source.sha256===rain.sha256));
 const halloween=data.books.find(book=>book.id==='hello-22').resources.find(resource=>resource.sha256==='584575dd11c09330387079124513e01807e8e1c634adec1360bab1d488786552');
 assert.deepEqual(halloween.rhymeIds,['hello-rhyme-52']);assert.deepEqual(halloween.tunes,[]);assert.equal(data.rhymes.find(rhyme=>rhyme.id==='hello-rhyme-52').entryKind,'adapted-activity');
 const classic=tuneSource('This Old Man',{...data,tuneAudio:audio});assert.equal(classic.status,'preview');assert.equal(classic.previewTrackName,'This Old Man');assert.notEqual(classic.file,rain.file);
});

// 用真实事件顺序验证浮层生命周期，不依赖浏览器的媒体网络和解码速度。
function playerHarness(){
 const events=new Map(),windowEvents=new Map();let document;
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs={};this.listeners=new Map();this.paused=true;this.ended=false;this.hidden=false;this.classList={add:name=>{this.className=(this.className||'')+' '+name;}};}
  append(...children){this.children.push(...children);for(const child of children)if(typeof child==='object')child.parent=this;}
  contains(element){return this===element||this.children.some(child=>typeof child==='object'&&child.contains(element));}
  get isConnected(){return document.body.contains(this);}
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name]??null;}
  addEventListener(type,handler){this.listeners.set(type,handler);}
  focus(){document.activeElement=this;}
  get currentSrc(){return this.src?new URL(this.src,document.baseURI).href:'';}
  play(){this.paused=false;events.get('play')?.({target:this});return this.playResult||Promise.resolve();}
  pause(){this.paused=true;events.get('pause')?.({target:this});}
  remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
 }
 const descendants=node=>[node,...node.children.filter(c=>typeof c==='object').flatMap(descendants)];
 document={baseURI:'https://example.com/english/',activeElement:null,createElement:tag=>new Element(tag),addEventListener:(type,handler)=>events.set(type,handler),getElementById:id=>descendants(document.body).find(node=>node.id===id),querySelectorAll:selector=>descendants(document.body).filter(node=>selector==='audio,video'?['AUDIO','VIDEO'].includes(node.tagName):selector==='[data-tune-audio]'&&node.dataset.tuneAudio)};
 document.body=new Element('body');
 const module={exports:{}};runInNewContext(readFileSync(new URL('../english/audio-player.js',import.meta.url),'utf8'),{module,URL,document,window:{addEventListener:(type,handler)=>windowEvents.set(type,handler)}});
 const h=(tag,attrs={},...children)=>{const node=new Element(tag);for(const [name,value] of Object.entries(attrs)){if(name.startsWith('aria-'))node.setAttribute(name,value);else node[name==='class'?'className':name]=value;}node.append(...children);return node;};
 return {api:module.exports,document,h,nodes:()=>descendants(document.body),events,windowEvents};
}

test('快捷按钮自动播放并显示浮层，关闭停止并恢复入口和同源状态',async()=>{
 const {api,document,h,nodes,events}=playerHarness(),options={h,asset:value=>value};
 const first=api.audioButton('first.mp3','第一首',options),duplicate=api.audioButton('first.mp3','第一首副入口',options);
 document.body.append(first,duplicate);first.focus();await first.onclick({stopPropagation(){},preventDefault(){}});
 const player=nodes().find(node=>node.tagName==='AUDIO'),popover=nodes().find(node=>node.className==='hello-audio-popover');
 assert.equal(player.paused,false);assert.equal(popover.hidden,false);assert.equal(document.activeElement,first);
 assert.equal(nodes().find(node=>node.className==='hello-audio-title').textContent,'第一首');
 assert.equal(first.getAttribute('aria-pressed'),'true');assert.equal(duplicate.getAttribute('aria-pressed'),'true');
 const close=nodes().find(node=>node.className==='hello-audio-close');close.focus();close.onclick();
 assert.equal(player.paused,true);assert.equal(popover.hidden,true);assert.equal(document.activeElement,first);
 assert.equal(first.getAttribute('aria-pressed'),'false');assert.equal(duplicate.getAttribute('aria-pressed'),'false');
 await first.onclick({stopPropagation(){},preventDefault(){}});assert.equal(nodes().filter(node=>node.tagName==='AUDIO').length,1);assert.equal(popover.hidden,false);
 player.focus();events.get('keydown')({target:player,key:'Escape',preventDefault(){},stopPropagation(){}});
 assert.equal(player.paused,true);assert.equal(popover.hidden,true);assert.equal(document.activeElement,first);
 await first.onclick({stopPropagation(){},preventDefault(){}});events.get('keydown')({target:first,key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(popover.hidden,true);assert.equal(player.paused,true);
});

test('切换音源复用浮层且旧失败不覆盖新音频，关闭后的迟到失败不显示错误',async()=>{
 const {api,document,h,nodes}=playerHarness(),options={h,asset:value=>value};
 const first=api.audioButton('first.mp3','第一首',options),second=api.audioButton('second.mp3','第二首',options);document.body.append(first,second);
 await api.playSource('first.mp3','第一首');const player=nodes().find(node=>node.tagName==='AUDIO');
 player.pause();let rejectOld;player.playResult=new Promise((resolve,reject)=>{rejectOld=reject;});const pending=api.playSource('first.mp3','第一首');
 player.playResult=Promise.resolve();await api.playSource('second.mp3','第二首');rejectOld(new Error('old request'));await pending;
 assert.equal(player.currentSrc,'https://example.com/english/second.mp3');assert.equal(player.paused,false);
 assert.equal(first.getAttribute('aria-pressed'),'false');assert.equal(second.getAttribute('aria-pressed'),'true');assert.equal(document.getElementById('hello-audio-error'),undefined);
 player.pause();let rejectClosed;player.playResult=new Promise((resolve,reject)=>{rejectClosed=reject;});const closing=api.playSource('first.mp3','第一首');nodes().find(node=>node.className==='hello-audio-close').onclick();rejectClosed(new Error('closed request'));await closing;
 assert.equal(document.getElementById('hello-audio-error'),undefined);assert.equal(player.paused,true);
});
