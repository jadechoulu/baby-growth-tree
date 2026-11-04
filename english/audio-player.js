(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.EnglishAudio=api;api.install();}})(typeof window==='object'?window:globalThis,function(){
'use strict';
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘']/g,'').replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ').trim();
function tuneSource(name,data){
  const key=normalize(name),extra=(data.tuneAudio?.tunes||[]).find(t=>normalize(t.name)===key);
  if(extra?.file)return extra;
  if(extra?.previewUrl)return {...extra,file:extra.previewUrl};
  for(const book of data.books||[])for(const resource of book.resources||[])if(resource.kind==='audio'&&(resource.tunes||[]).some(t=>normalize(t)===key))return {name,file:resource.file,sourceTitle:resource.label};
  return null;
}
// 只在真实 play 事件后确认当前播放器；迟到的旧 pause 不能清除新状态。
function coordinator(notify=()=>{}){
  let current=null;
  return {get current(){return current;},event(type,media){
    if((type==='play'||type==='playing')&&media.paused===true)return;
    if(type==='play'||type==='playing'){if(current&&current!==media)current.pause();current=media;}
    else if((type==='pause'||type==='ended'||type==='error')&&current===media)current=null;
    notify(current,type,media);
  },stop(){const previous=current;current=null;if(previous)previous.pause();notify(null,'pause',previous);}};
}
let installed=false,player=null,popover=null,playerTitle=null,lastTrigger=null,manager=null,requestId=0;
function source(media){return media?.currentSrc||media?.src||'';}
function update(){
  const current=manager?.current;
  for(const button of document.querySelectorAll('[data-tune-audio]')){
    const playing=!!current&&!current.paused&&!current.ended&&source(current)===button.dataset.tuneAudio;
    button.textContent=playing?'❚❚':'▶';button.setAttribute('aria-pressed',String(playing));
    button.setAttribute('aria-label',(playing?'暂停':'播放')+(button.dataset.audioKind||'曲调')+'：'+button.dataset.tuneName);
    button.title=(playing?'暂停：':'播放：')+button.dataset.tuneName;
  }
}
function install(){
  if(installed||typeof document!=='object')return;installed=true;manager=coordinator(update);
  for(const type of ['play','playing','pause','ended','error'])document.addEventListener(type,event=>{
    const media=event.target;if(!media||!['AUDIO','VIDEO'].includes(media.tagName))return;
    if((type==='play'||type==='playing')&&media.paused)return;
    manager.event(type,media);
    if(type==='play'||type==='playing')for(const other of document.querySelectorAll('audio,video'))if(other!==media&&!other.paused)other.pause();
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&popover&&!popover.hidden&&(popover.contains(event.target)||event.target===lastTrigger)){event.preventDefault();event.stopPropagation();closePlayer();}});
  window.addEventListener('pagehide',()=>closePlayer(false));
}
function closePlayer(restoreFocus=true){
  ++requestId;manager?.stop();if(player)player.pause();
  const focusInside=popover?.contains(document.activeElement);if(popover)popover.hidden=true;
  document.getElementById('hello-audio-error')?.remove();
  if(restoreFocus&&focusInside&&lastTrigger?.isConnected)lastTrigger.focus();
}
function ensurePlayer(){
  if(player)return;
  popover=document.createElement('section');popover.className='hello-audio-popover';popover.setAttribute('role','region');popover.setAttribute('aria-label','当前播放');
  const header=document.createElement('div');header.className='hello-audio-popover-head';
  playerTitle=document.createElement('span');playerTitle.className='hello-audio-title';playerTitle.setAttribute('aria-live','polite');
  const close=document.createElement('button');close.type='button';close.className='hello-audio-close';close.textContent='×';close.setAttribute('aria-label','关闭播放器');close.title='关闭播放器';close.onclick=()=>closePlayer();
  header.append(playerTitle,close);
  player=document.createElement('audio');player.preload='none';player.className='hello-tune-player';player.controls=true;
  popover.append(header,player);document.body.append(popover);
}
async function playSource(file,name,asset=value=>value){
  install();const url=asset(file),absolute=new URL(url,document.baseURI).href,current=manager.current;
  if(current&&source(current)===absolute&&!current.paused){current.pause();return;}
  manager.stop();const request=++requestId;ensurePlayer();
  if(!popover.contains(document.activeElement))lastTrigger=document.activeElement;
  popover.hidden=false;playerTitle.textContent=name;
  if(source(player)!==absolute)player.src=url;
  player.dataset.title=name;player.setAttribute('aria-label','音频：'+name);
  try{await player.play();if(request!==requestId)return;return true;}catch(error){if(request!==requestId)return;update();if(error.name==='AbortError')return;
    let status=document.getElementById('hello-audio-error');if(!status){status=document.createElement('p');status.id='hello-audio-error';status.className='hello-audio-error';status.setAttribute('role','status');document.body.append(status);}
    status.textContent='暂时无法播放「'+name+'」，请重新点击播放。';
    player.addEventListener('playing',()=>status.remove(),{once:true});return false;
  }
}
function tuneButton(name,data,{h,asset}){
  install();const resource=tuneSource(name,data);
  const external=!resource&&(data.tuneAudio?.tunes||[]).find(t=>normalize(t.name)===normalize(name)&&t.status==='external'&&t.sourceUrl);
  if(external)return h('a',{class:'hello-tune-play hello-tune-external',href:external.sourceUrl,target:'_blank',rel:'noopener noreferrer','aria-label':'官方试听（新页）：'+name,title:'官方试听（新页）：'+name,onclick:()=>manager.stop()},'▶↗');
  const button=h('button',{type:'button',class:'hello-tune-play','aria-label':'播放曲调：'+name,'aria-pressed':'false',title:resource?'播放：'+name:'尚未找到已核实的曲调音频：'+name,disabled:!resource,onclick:async event=>{
    event.stopPropagation();event.preventDefault();
    if(await playSource(resource.file,name,asset)===false){button.title='播放失败，点击重试：'+name;button.setAttribute('aria-label',button.title);}
  }},'▶');
  if(resource){button.dataset.tuneAudio=new URL(asset(resource.file),document.baseURI).href;button.dataset.tuneName=name;
    const playing=manager.current&&!manager.current.paused&&source(manager.current)===button.dataset.tuneAudio;
    if(playing){button.textContent='❚❚';button.setAttribute('aria-pressed','true');button.setAttribute('aria-label','暂停曲调：'+name);button.title='暂停：'+name;}}
  else button.setAttribute('aria-label','曲调音频暂缺：'+name);
  if(resource?.status==='preview'){button.dataset.audioKind='曲调片段';button.setAttribute('aria-label',(button.getAttribute('aria-pressed')==='true'?'暂停':'播放')+'曲调片段：'+name);button.title='试听片段：'+name;}
  return button;
}
function audioButton(file,name,{h,asset}){
  const button=tuneButton(name,{tuneAudio:{tunes:[{name,file}]}},{h,asset});button.classList.add('hello-audio-play');button.dataset.audioKind='音频';
  button.setAttribute('aria-label',(button.getAttribute('aria-pressed')==='true'?'暂停音频：':'播放音频：')+name);return button;
}
return {normalize,tuneSource,coordinator,install,playSource,tuneButton,audioButton};
});
