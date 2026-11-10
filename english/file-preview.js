(function(root){
'use strict';
// 只路由本站 assets 内的媒体文件；站点页面和外部资料继续沿用原链接。
function fileInfo(href,base){
  let url;try{url=new URL(href,base);}catch{return null;}
  const home=new URL('assets/',base);
  if(url.origin!==home.origin||!url.pathname.startsWith(home.pathname))return null;
  const ext=url.pathname.split('.').at(-1).toLowerCase();
  const kind=ext==='pdf'?'pdf':/^(jpe?g|png|webp|gif|avif)$/.test(ext)?'image':/^(mp3|m4a|wav|ogg)$/.test(ext)?'audio':null;
  if(!kind)return null;
  let path;try{path=decodeURIComponent(url.pathname.slice(home.pathname.length));}catch{return null;}
  return {kind,url:url.href,path:'assets/'+path,page:Math.max(1,Math.trunc(Number(new URLSearchParams(url.hash.slice(1)).get('page')))||1)};
}
// 分享接口显式携带设备标识，不依赖第三方 iframe Cookie；临时令牌仅留在当前弹窗。
function nasShare(href){
  let url;try{url=new URL(href);}catch{return null;}
  // @CfSecAICode 遵循消费金融安全编码 BE-SSRF-002 规范: 分享仅解析固定官方来源及文件分享路径。
  if(url.origin!=='https://s.znas.cn'||url.username||url.password||url.pathname!=='/AppH5/share/'||url.searchParams.get('mode')!=='file')return null;
  return url.searchParams.get('nid')&&url.searchParams.get('code')?url:null;
}
function nasFileKind(item){
  if(String(item.is_dir)==='1')return 'directory';
  const ext=String(item.name||'').split('.').at(-1).toLowerCase();
  return /^(mp3|wav|m4a|ogg|aac|flac)$/.test(ext)?'audio':ext==='pdf'?'pdf':/^(mp4|m4v|webm|mov)$/.test(ext)?'video':/^(jpe?g|png|webp|gif|avif)$/.test(ext)?'image':'file';
}
function nasClient(href,request=fetch,signal){
  const share=nasShare(href);if(!share)return null;
  const nid=share.searchParams.get('nid'),code=share.searchParams.get('code');
  if(!nid||!code)return null;
  let session;
  async function api(path,params){
    const url=new URL(path,share.origin),options={method:'POST',credentials:'omit',signal};
    url.searchParams.set('nid',nid);options.body=new URLSearchParams(params);
    const response=await request(url.href,options);
    if(!response.ok)throw new Error('极空间请求失败，请重试。');
    const result=await response.json();
    if(String(result.code)!=='200')throw new Error(result.msg||'极空间分享暂时不可用。');
    return result.data;
  }
  const token=()=>session||(session=api('/share/v2/share/token',{code,num:1}).catch(error=>{session=null;throw error;}));
  return {
    async list(path='',start=0){
      const {dtoken}=await token();
      const result=await api('/share/v2/share/files',{dtoken,start,num:100,sortby:'mtime',order:'desc',show_hidden:0,pencrypt:1,...(path?{path}:{})});
      if(!Array.isArray(result?.list)||!Number.isSafeInteger(Number(result.total))||Number(result.total)<start+result.list.length||(!result.list.length&&Number(result.total)>start)||result.list.some(item=>typeof item.name!=='string'||typeof item.path!=='string'))throw new Error('极空间目录读取不完整，请重试。');
      return result;
    },
    async audio(path){
      const {dtoken}=await token(),url=new URL('/share/v2/share/dlfile',share.origin);
      // 直接流式读取原文件；原站转码地址接口不允许跨站读取。
      url.search=new URLSearchParams({remote_port:8050,request_purpose:5,device_type:'h5',path,nid,dtoken});
      return url.href;
    }
  };
}
function install({h,asset,originalPath=()=>null,externalUrls=[]}){
  let current=null,libraryPromise;
  const external=new Set(externalUrls.map(url=>new URL(url,document.baseURI).href));
  const describe=href=>{const file=fileInfo(originalPath(href)||href,document.baseURI);if(file)return file;let url;try{url=new URL(href,document.baseURI).href;}catch{return null;}return external.has(url)?{kind:'web',url}:null;};
  const library=()=>libraryPromise||(libraryPromise=import(new URL(asset('assets/vendor/pdfjs/pdf.min.mjs'),document.baseURI).href).then(pdf=>{pdf.GlobalWorkerOptions.workerSrc=new URL(asset('assets/vendor/pdfjs/pdf.worker.min.mjs'),document.baseURI).href;return pdf;}).catch(error=>{libraryPromise=null;throw error;}));
  function close(){if(current){const state=current;state.dialog.close();state.dispose();}}
  function open(href,title,trigger=document.activeElement){
    const info=describe(href);if(!info)return false;
    return openInfo(info,title,trigger);
  }
  function openInfo(info,title,trigger,parent=null){
    if(info.kind==='audio'){root.EnglishAudio.playSource(info.path,title,asset);return true;}
    if(!parent)close();
    const previousOverflow=document.body.style.overflow;
    const dialog=h('dialog',{class:'file-preview','aria-label':title||'资源预览'}),body=h('div',{class:'file-preview-body'}),status=h('p',{class:'file-preview-status',role:'status'},'正在加载…');
    const state={dialog,info,page:info.page||1,zoom:100,pdf:null,task:null,renderTasks:new Set(),slots:[],revision:0,parent};current=state;
    const button=(label,text,run)=>h('button',{type:'button','aria-label':label,title:label,onclick:run},text);
    const heading=h('h2',{},title||decodeURIComponent((info.path||info.url).split('/').at(-1)));
    const source=()=>info.remote?info.url:asset(info.path);
    const download=info.kind==='web'?h('a',{href:info.url,target:'_blank',rel:'noopener noreferrer',class:'file-preview-download','data-preview-original':'true',title:'在浏览器打开原站网页，不自动唤起 App'},'原站网页 ↗'):h('a',{href:source(),download:info.filename||decodeURIComponent(info.path.split('/').at(-1)),class:'file-preview-download','data-preview-original':'true'},'下载');
    const controls=h('div',{class:'file-preview-controls'}),footer=h('footer',{},status);
    dialog.append(h('header',{},heading,download,button('关闭资源预览','×',close)),controls,body,footer);
    if(parent)dialog.querySelector('header').prepend(button('返回极空间资料目录','‹ 返回',close));
    state.dispose=()=>{
      if(state.disposed)return;state.disposed=true;
      state.revision++;state.observer?.disconnect();for(const task of state.renderTasks)task.cancel();state.task?.destroy().catch(()=>{});dialog.remove();
      state.abort?.abort();if(state.nas)root.EnglishAudio?.stop(false);
      for(const media of dialog.querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}
      if(current===state){current=parent;document.body.style.overflow=previousOverflow;if(trigger?.isConnected)trigger.focus({preventScroll:true});}
    };
    dialog.addEventListener('close',state.dispose);
    dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    // 阻止 Escape 冒泡关闭资源下面仍在阅读的详情或原图预览。
    dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}else if(e.target.tagName!=='INPUT'&&['ArrowLeft','ArrowRight'].includes(e.key)&&state.pdf){e.preventDefault();turn(e.key==='ArrowRight'?1:-1);}});
    document.body.append(dialog);document.body.style.overflow='hidden';dialog.showModal();dialog.querySelector('button').focus({preventScroll:true});
    if(info.kind==='web'){
      root.EnglishAudio?.stop(false);controls.hidden=true;body.classList.add('file-preview-web');
      const shareFrame=()=>h('iframe',{src:info.url,title:title||'带读资料',allow:'autoplay; fullscreen; picture-in-picture',allowfullscreen:true,sandbox:'allow-scripts allow-same-origin allow-forms allow-downloads allow-presentation allow-popups',referrerpolicy:'no-referrer',onload:()=>{status.textContent='';}});
      const abort=new AbortController(),nas=nasClient(info.url,fetch,abort.signal);
      if(nas){
        state.abort=abort;state.nas=nas;controls.hidden=false;
        const pane=h('div',{class:'nas-audio-browser'}),trail=[{name:'分享',path:''}],pages=new Map(),audioUrls=new Map();
        let audioOnly=false,revision=0,playing=0;
        const fileTab=button('查看全部极空间资料','全部资料',()=>show(false)),audioTab=button('只看可播放音频','音频',()=>show(true));
        const copy=button('复制分享链接，在极空间 App 中粘贴打开','复制分享链接',async()=>{
          try{await navigator.clipboard.writeText(info.url);if(!state.disposed)status.textContent='分享链接已复制，可在极空间 App 中粘贴打开。';}
          catch{if(!state.disposed){const input=h('input',{type:'text',readonly:true,value:info.url,'aria-label':'极空间分享链接'});status.replaceChildren('可复制此分享链接：',input);input.select();}}
        });
        controls.append(fileTab,audioTab,copy);body.append(pane);
        function show(audio){
          audioOnly=audio;fileTab.setAttribute('aria-pressed',String(!audio));audioTab.setAttribute('aria-pressed',String(audio));
          load();
        }
        async function load(start=0){
          const version=++revision,currentDir=trail.at(-1),restoreFocus=!start&&pane.contains(document.activeElement);status.textContent='正在加载资料目录…';
          pane.querySelector('.nas-audio-retry')?.remove();
          if(!start){
            const nav=h('div',{class:'nas-audio-path'},trail.map((item,index)=>button('打开'+item.name,item.name,()=>{trail.splice(index+1);load();})));
            pane.replaceChildren(nav,h('ul',{class:'nas-audio-list'}));
          }
          try{
            const key=currentDir.path+'#'+start,result=pages.get(key)||await nas.list(currentDir.path,start);
            if(state.disposed||version!==revision)return;pages.set(key,result);
            // 单一外层包装目录直接进入，减少手机上重复点书名；真实多目录和分页仍完整保留。
            if(!start&&Number(result.total)===1&&nasFileKind(result.list[0])==='directory'&&!trail.some(item=>item.path===result.list[0].path)){
              trail.push({name:result.list[0].name,path:result.list[0].path});return load();
            }
            const list=pane.querySelector('ul');pane.querySelector('.nas-audio-more')?.remove();
            for(const item of result.list){
              const kind=nasFileKind(item),directory=kind==='directory',audio=kind==='audio';
              if(audioOnly&&!directory&&!audio)continue;
              const label=(directory?'打开目录：':audio?'播放音频：':kind==='video'?'播放视频：':kind==='file'?'下载文件：':'查看资料：')+item.name;
              const entry=button(label,[h('span',{'data-audio-state-icon':audio?'true':null,'aria-hidden':'true'},directory?'▸':audio||kind==='video'?'▶':kind==='file'?'↓':'▤'),h('span',{},item.name)],async()=>{
                if(directory){trail.push({name:item.name,path:item.path});load();return;}
                const request=++playing;status.textContent='正在加载：'+item.name;entry.setAttribute('aria-busy','true');
                try{
                  // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 带令牌地址仅在当前弹窗内存生成，不写记录或日志。
                  const url=audioUrls.get(item.path)||await nas.audio(item.path);if(state.disposed||request!==playing)return;
                  audioUrls.set(item.path,url);
                  if(audio){
                    entry.dataset.tuneAudio=url;entry.dataset.tuneName=item.name;entry.dataset.audioKind='音频';
                    const ok=await root.EnglishAudio.playSource(url,item.name,value=>value,dialog);
                    if(!state.disposed&&request===playing)status.textContent=ok===false?'音频加载失败，请重试；也可复制分享链接到极空间 App。':'';
                  }else{
                    root.EnglishAudio?.stop(false);status.textContent='';
                    if(kind==='file'){
                      const link=h('a',{href:url,download:item.name,'data-preview-original':'true'},'下载 '+item.name);status.replaceChildren(link);link.click();
                    }else openInfo({kind,url,remote:true,filename:item.name},item.name,entry,state);
                  }
                }catch(error){if(!state.disposed&&request===playing)status.textContent=error.message;}
                finally{entry.removeAttribute('aria-busy');}
              });
              if(audio){entry.setAttribute('aria-pressed','false');if(audioUrls.has(item.path)){entry.dataset.tuneAudio=audioUrls.get(item.path);entry.dataset.tuneName=item.name;entry.dataset.audioKind='音频';}}
              list.append(h('li',{},entry));
            }
            const next=start+result.list.length;
            if(next<Number(result.total)&&!result.list.length)throw new Error('极空间目录分页中断，请重试。');
            const more=root.EnglishAutomaticList.create({hasMore:next<Number(result.total),load:()=>load(next)});
            more.classList.add('nas-audio-more');pane.append(more);
            status.textContent=list.children.length?'':audioOnly?'此层没有可播放音频，可返回上层或切换“全部资料”。':'此目录为空。';
            root.EnglishAudio.refresh();
            if(restoreFocus)pane.querySelector('.nas-audio-path button:last-child')?.focus({preventScroll:true});
          }catch(error){if(!state.disposed&&version===revision){status.textContent=error.message;pane.querySelector('.nas-audio-more')?.remove();pane.querySelector('.nas-audio-retry')?.remove();const retry=button('重新加载资料目录','重试',()=>load(start));retry.className='nas-audio-retry';pane.append(retry);}}
        }
        show(false);return true;
      }
      // 极空间文档通过 window.open 打开二级预览；仅允许弹出窗口，继续保留沙箱与顶层导航限制。
      body.append(shareFrame());
      return true;
    }
    let pageInput,total,zoomOutput;
    function update(){if(pageInput&&state.pdf){pageInput.value=state.page;pageInput.max=state.pdf.numPages;total.textContent='/ '+state.pdf.numPages+' 页';status.textContent='第 '+state.page+' / '+state.pdf.numPages+' 页';}if(zoomOutput)zoomOutput.textContent=state.zoom+'%';}
    function locate(fraction=0){const slot=state.slots[state.page-1];if(slot)body.scrollTo(body.scrollLeft,slot.element.getBoundingClientRect().top-body.getBoundingClientRect().top+body.scrollTop+fraction*slot.element.clientHeight);}
    function turn(delta){state.page=Math.max(1,Math.min(state.pdf.numPages,state.page+delta));update();locate();}
    body.addEventListener('scroll',()=>{
      if(!state.slots.length)return;
      const top=body.getBoundingClientRect().top+Math.min(80,body.clientHeight/4);
      const atEnd=body.scrollTop>0&&body.scrollTop+body.clientHeight>=body.scrollHeight-2;
      const slot=atEnd?state.slots.at(-1):state.slots.find(slot=>slot.element.getBoundingClientRect().bottom>top)||state.slots.at(-1);
      if(state.page!==slot.number){state.page=slot.number;update();}
    },{passive:true});
    async function renderPage(slot,revision){
      if(slot.canvas||slot.task)return;
      const ratio=Math.min(window.devicePixelRatio||1,2),canvas=document.createElement('canvas');
      canvas.width=Math.ceil(slot.view.width*ratio);canvas.height=Math.ceil(slot.view.height*ratio);canvas.style.width=slot.view.width+'px';canvas.style.height=slot.view.height+'px';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',(title||'PDF')+' 第 '+slot.number+' 页');
      const task=slot.page.render({canvasContext:canvas.getContext('2d'),viewport:slot.view,transform:[ratio,0,0,ratio,0,0]});slot.task=task;state.renderTasks.add(task);let cancelled=false;
      try{
        await task.promise;
        if(current!==state||revision!==state.revision||!slot.wanted)return;
        slot.canvas=canvas;slot.element.replaceChildren(canvas);
      }catch(error){
        cancelled=error.name==='RenderingCancelledException';
        if(current!==state||revision!==state.revision||!slot.wanted||cancelled)return;
        slot.element.replaceChildren(button('重新加载第 '+slot.number+' 页','第 '+slot.number+' 页加载失败，点击重试',()=>renderPage(slot,revision)));
      }finally{state.renderTasks.delete(task);slot.task=null;if(slot.wanted&&current===state&&revision===state.revision&&!slot.canvas&&cancelled)renderPage(slot,revision);}
    }
    async function paint(){
      const old=state.slots[state.page-1],fraction=old?Math.max(0,(body.getBoundingClientRect().top-old.element.getBoundingClientRect().top)/old.element.clientHeight):0;
      const revision=++state.revision;state.observer?.disconnect();for(const task of state.renderTasks)task.cancel();state.slots=[];status.textContent='正在加载…';
      try{
        const pages=await Promise.all(Array.from({length:state.pdf.numPages},(_,i)=>state.pdf.getPage(i+1)));
        if(current!==state||revision!==state.revision)return;
        const width=Math.max(180,body.clientWidth-24)*state.zoom/100;
        state.slots=pages.map((page,i)=>{
          const view=page.getViewport({scale:width/page.getViewport({scale:1}).width});
          const element=h('div',{class:'file-preview-page','data-page':i+1});element.style.width=view.width+'px';element.style.height=view.height+'px';
          return {number:i+1,page,view,element,wanted:false,canvas:null,task:null};
        });
        body.replaceChildren(...state.slots.map(slot=>slot.element));locate(fraction);update();
        state.observer=new IntersectionObserver(entries=>{
          if(current!==state||revision!==state.revision)return;
          for(const entry of entries){
            const slot=state.slots[Number(entry.target.dataset.page)-1];slot.wanted=entry.isIntersecting;
            if(slot.wanted)renderPage(slot,revision);
            else{slot.task?.cancel();if(slot.canvas){slot.canvas.width=0;slot.canvas.height=0;slot.canvas=null;}slot.element.replaceChildren();}
          }
        },{root:body,rootMargin:'600px 0px'});
        for(const slot of state.slots)state.observer.observe(slot.element);
      }catch(error){if(current!==state||revision!==state.revision)return;status.textContent='PDF加载失败，请重试或下载原文件。';body.replaceChildren(button('重新加载PDF','重试',paint));}
    }
    function zoom(delta){state.zoom=Math.max(50,Math.min(250,state.zoom+delta));update();if(state.pdf)paint();else{const img=body.querySelector('img');if(img)img.style.width=state.zoom+'%';}}
    zoomOutput=h('output',{'aria-label':'资源缩放比例'},'100%');
    controls.append(button('缩小资源','−',()=>zoom(-25)),zoomOutput,button('放大资源','＋',()=>zoom(25)));
    if(info.kind==='video'){
      controls.hidden=true;
      const video=h('video',{src:source(),controls:true,playsinline:true,preload:'metadata','aria-label':'视频：'+title,onloadedmetadata:()=>{status.textContent='';},onerror:()=>{status.textContent='浏览器暂时无法播放此视频，可下载或返回目录复制分享链接到极空间 App。';}});body.append(video);return true;
    }
    if(info.kind==='image'){
      const img=h('img',{src:source(),alt:title||'原图',onload:()=>{status.textContent='';},onerror:()=>{status.textContent='图片加载失败，可下载原文件。';}});body.append(img);return true;
    }
    const goToPage=()=>{state.page=Math.max(1,Math.min(state.pdf.numPages,Math.trunc(Number(pageInput.value))||1));update();locate();};
    pageInput=h('input',{type:'number',min:1,value:state.page,'aria-label':'PDF页码',onchange:goToPage,onkeydown:e=>{if(e.key==='Enter'){e.preventDefault();goToPage();}}});
    total=h('span',{},'');
    const paging=h('div',{class:'file-preview-paging'},pageInput,total);paging.hidden=true;controls.prepend(paging);
    state.repaint=paint;
    (async()=>{try{
      const pdf=await library();if(current!==state)return;
      const bytes=async path=>{const response=await fetch(asset(path));if(!response.ok)throw new Error('PDF字体资源加载失败');return new Uint8Array(await response.arrayBuffer());};
      state.task=pdf.getDocument({url:source(),isEvalSupported:false,useWasm:false,useSystemFonts:true,useWorkerFetch:false,
        BinaryDataFactory:class{fetch({kind,filename}){return bytes('assets/vendor/pdfjs/'+({cMapUrl:'cmaps',standardFontDataUrl:'standard_fonts'}[kind])+'/'+filename);}}
      });state.pdf=await state.task.promise;if(current!==state)return;
      state.page=Math.min(state.page,state.pdf.numPages);paging.hidden=false;update();await paint();
    }catch(error){if(current===state){if(!info.remote)console.error('PDF预览加载失败',error);status.textContent='PDF加载失败，请重试或下载原文件。';body.replaceChildren(button('重新加载PDF','重试',()=>{close();openInfo(info,title,trigger,parent);}));}}})();
    return true;
  }
  document.addEventListener('click',e=>{
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const link=e.target.closest('a[href]');if(!link||link.hasAttribute('download')||link.dataset.action||link.dataset.previewOriginal)return;
    const info=describe(link.getAttribute('href'));if(!info)return;
    e.preventDefault();e.stopPropagation();open(link.getAttribute('href'),link.getAttribute('aria-label')||link.textContent.replace(/↗/g,'').trim(),link);
  },true);
  window.addEventListener('resize',()=>{if(current?.pdf)current.repaint();});
  return {open,close,describe};
}
const api={fileInfo,nasShare,nasFileKind,nasClient,install};root.EnglishFilePreview=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
