import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {fileInfo,nasShare,nasFileKind,nasClient}=createRequire(import.meta.url)('../english/file-preview.js');
test('共用分享识别不按套系白名单，拒绝伪造来源，格式决定播放或查看动作',()=>{
  assert.ok(nasShare('https://s.znas.cn/AppH5/share/?nid=example&code=example&mode=file'));
  for(const url of ['invalid','http://s.znas.cn/AppH5/share/?nid=a&code=b&mode=file','https://s.znas.cn.evil.test/AppH5/share/?nid=a&code=b&mode=file','https://user@s.znas.cn/AppH5/share/?nid=a&code=b&mode=file','https://s.znas.cn/AppH5/share/?nid=a&code=b&mode=album','https://s.znas.cn/AppH5/share/?nid=a&mode=file'])assert.equal(nasShare(url),null);
  for(const [name,kind] of [['a.MP3','audio'],['a.flac','audio'],['a.pdf','pdf'],['a.mp4','video'],['a.JPG','image'],['a.wma','file']])assert.equal(nasFileKind({name}),kind);
  assert.equal(nasFileKind({name:'directory.mp3',is_dir:1}),'directory');
});
test('分享令牌失败可重试，目录缺页与错误结果不冒充完整列表',async()=>{
  let tokens=0,badList=false;
  const client=nasClient('https://s.znas.cn/AppH5/share/?nid=example&code=example&mode=file',async url=>({ok:true,json:async()=>{
    if(url.includes('/token?'))return ++tokens===1?{code:401,msg:'分享暂不可用'}:{code:200,data:{dtoken:'test-only'}};
    return {code:200,data:badList?{total:1,list:[]}:{total:1,list:[{name:'a.mp3',path:'file'}]}};
  }}));
  await assert.rejects(client.list(),/分享暂不可用/);
  assert.equal((await client.list()).list.length,1);assert.equal(tokens,2);
  badList=true;await assert.rejects(client.list(),/目录读取不完整/);
});
test('分享音频使用临时令牌和显式设备标识，不依赖第三方Cookie，保留目录分页',async()=>{
  const {nasClient}=createRequire(import.meta.url)('../english/file-preview.js'),calls=[];
  const client=nasClient('https://s.znas.cn/AppH5/share/?nid=device&code=public-share&mode=file',async(url,options)=>{
    calls.push({url:new URL(url),options});
    const data=url.includes('/token?')?{dtoken:'temporary'}:{list:[{name:'音频.mp3',path:'encrypted-file'}],total:'201'};
    return {ok:true,json:async()=>({code:'200',data})};
  });
  assert.equal((await client.list('encrypted-folder',100)).total,'201');
  const url=new URL(await client.audio('encrypted-file'));
  assert.equal(url.origin,'https://s.znas.cn');assert.equal(url.pathname,'/share/v2/share/dlfile');assert.equal(url.searchParams.get('nid'),'device');
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.options.credentials==='omit'));
  assert.equal(calls[1].options.body.get('start'),'100');assert.equal(calls[1].options.body.get('path'),'encrypted-folder');
  assert.equal(url.searchParams.get('dtoken'),'temporary');assert.equal(url.searchParams.get('path'),'encrypted-file');
  assert.equal(nasClient('https://other.test/AppH5/share/?nid=a&code=b&mode=file'),null);
});
test('本站原文件路由保留部署前缀、资源路径和PDF页码',()=>{
  const base='https://example.com/baby-growth-tree/english/index.html';
  assert.deepEqual(fileInfo('assets/hello/notes/book-02.pdf#page=5',base),{kind:'pdf',path:'assets/hello/notes/book-02.pdf',url:'https://example.com/baby-growth-tree/english/assets/hello/notes/book-02.pdf#page=5',page:5});
  assert.equal(fileInfo('assets/hello/scenes.pdf#page=-1',base).page,1);
  assert.equal(fileInfo('assets/hello/scenes.pdf#page=2.5',base).page,2);
  assert.equal(fileInfo('assets/童谣卡.png',base).path,'assets/童谣卡.png');
  assert.equal(fileInfo('assets/a.JPG',base).kind,'image');
  assert.equal(fileInfo('assets/a.mp3',base).kind,'audio');
});
test('外部网页、站内导航与下载文件不误入媒体弹窗',()=>{
  const base='http://127.0.0.1:5321/english/index.html';
  for(const url of ['https://t3.znas.cn/a','https://other.test/english/assets/a.pdf','#library','../index.html','assets/a.json','/other/assets/a.pdf'])assert.equal(fileInfo(url,base),null);
});
test('离线单文件入口可以用原始资源路径恢复预览类型',()=>{
  assert.equal(fileInfo('assets/hello/notes/book-02.pdf','file:///tmp/英语启蒙路线导航.html').kind,'pdf');
});
