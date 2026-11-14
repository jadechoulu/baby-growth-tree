/* 本人英文书架：私人元信息随英语records往返，逐本状态仍由BookProgress维护。 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./book-progress.js'));
  else root.EnglishShelfLibrary=factory(root.EnglishBookProgress);
})(typeof globalThis!=='undefined'?globalThis:this,function(BP){
'use strict';
const PREFIX='reading.shelf.v1:';
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const identity=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const englishEdition=book=>book.language==='英文'&&!/双语|中英对照|中英文|bilingual/i.test(book.title+' '+(book.series?.title||''));
function validateBook(book){
  if(!book||!identity(book.bookId)||typeof book.appBookId!=='string'||!/^[1-9]\d{0,19}$/.test(book.appBookId)||!text(book.title,1000)||typeof book.language!=='string'||typeof book.read!=='boolean'||typeof book.isCollection!=='boolean')throw Error('小花生书架目录字段不完整，原书目保留。');
  if(book.cover!==undefined){
    let url;try{url=new URL(book.cover);}catch{throw Error('小花生封面地址无效。');}
    if(book.cover.length>1500||url.origin!=='https://img.xiaohuasheng.cn'||url.username||url.password)throw Error('小花生封面来源无效。');
  }
  if(book.series&&(!identity(book.series.id)||typeof book.series.appBookId!=='string'||!/^[1-9]\d{0,19}$/.test(book.series.appBookId)||!text(book.series.title,500)))throw Error('小花生套系身份不完整。');
  for(const [field,max] of [['author',300],['publisher',300],['isbn',300],['seriesTitle',500]])if(book[field]!==undefined&&(typeof book[field]!=='string'||book[field].length>max))throw Error('小花生书目说明字段无效。');
  if(book.catalogTags!==undefined&&(!Array.isArray(book.catalogTags)||book.catalogTags.length>100||book.catalogTags.some(tag=>!text(tag,2000))))throw Error('小花生书目标签无效。');
}
function metadata(records){
  return Object.entries(records||{}).flatMap(([key,record])=>{
    if(!key.startsWith(PREFIX)||record.status!=='using')return [];
    const book=parse(record.note);
    if(book?.version!==1||!englishEdition(book)||!/^[-a-zA-Z0-9_]{1,40}$/.test(book.accountId)||key!==PREFIX+book.accountId+':'+book.bookId)return [];
    try{validateBook(book);}catch{return [];}
    return [book];
  });
}
function exclusions(books,options){
  const publicIds=new Set(),seriesIds=new Set(),names=new Set((options.liao?.books||[]).concat(options.liao?.supplementaryBooks||[]).map(b=>BP.normalize(b.title)));
  for(const resource of options.resources||[])if(resource.appearances?.length||resource.liaoBookId){
    for(const title of [resource.title,...(resource.aliases||[])])if(typeof title==='string')names.add(BP.normalize(title));
  }
  const routeIds=new Set((options.resources||[]).filter(resource=>resource.appearances?.length).flatMap(resource=>[resource.id,...(resource.mergedResourceIds||[])]));
  for(const series of options.catalog?.series||[])if(routeIds.has(series.resourceId))for(const source of series.sources||[]){
    const match=source.url?.match(/^https:\/\/(?:www\.)?xiaohuasheng.cn\/(?:book|series)\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/);
    if(match)seriesIds.add(match[1]);
  }
  for(const book of books){
    const match=BP.matchEntry(options.plans,book,options.directory,options.catalog);
    if(match.candidates.length||match.conflicts.length||names.has(BP.normalize(book.title))){
      publicIds.add(book.bookId);
    }
  }
  return book=>publicIds.has(book.bookId)||book.series&&(seriesIds.has(book.series.id)||names.has(BP.normalize(book.series.title)));
}
function apply(records,snapshot,options={}){
  const {owner}=BP.validateSnapshot(snapshot),catalog=snapshot.shelfCatalog;
  if(catalog===undefined)return BP.applyReadSnapshot(records,options.plans,snapshot,options);
  if(catalog?.version!==1||catalog.complete!==true||!Array.isArray(catalog.books)||catalog.total!==catalog.books.length||catalog.total!==snapshot.wholeBookcaseCount)throw Error('小花生全书架目录不完整，未更新书目或进度。');
  const seen=new Set(),appIds=new Set(),readIds=new Set(snapshot.books.map(book=>book.bookId)),readEntries=new Map(snapshot.books.map(book=>[book.bookId,book]));
  const english=[];
  for(const book of catalog.books){
    validateBook(book);
    if(seen.has(book.bookId)||appIds.has(book.appBookId)||book.read!==readIds.has(book.bookId))throw Error('小花生目录身份或已读状态冲突，未更新。');
    if(readEntries.has(book.bookId)&&String(readEntries.get(book.bookId).appBookId)!==book.appBookId)throw Error('书架目录与已读快照的App身份不一致。');
    seen.add(book.bookId);appIds.add(book.appBookId);
    if(englishEdition(book))english.push(book);
  }
  if([...readIds].some(id=>!seen.has(id)))throw Error('已读书目缺少目录身份，未更新。');
  const byId=new Map(english.map(book=>[book.bookId,book]));
  for(const collection of catalog.collections||[]){
    const parent=catalog.books.find(book=>book.bookId===collection.parentId);
    if(!parent?.isCollection||parent.appBookId!==collection.appBookId||collection.complete!==true||!Array.isArray(collection.books)||!collection.books.length||collection.books.length!==collection.total)throw Error('套系目录不完整，原书目保留。');
    const children=new Set();
    for(const child of collection.books){
      validateBook(child);
      if(children.has(child.bookId)||child.isCollection||child.read!==readIds.has(child.bookId)||child.series?.id!==parent.bookId||child.series?.appBookId!==parent.appBookId)throw Error('套系单册身份或已读状态冲突。');
      children.add(child.bookId);
      const existing=catalog.books.find(book=>book.bookId===child.bookId);
      if(existing&&existing.appBookId!==child.appBookId)throw Error('套系单册与书架身份冲突。');
      if(englishEdition(parent)&&englishEdition(child))byId.set(child.bookId,child);
    }
  }
  for(const parent of english.filter(book=>book.isCollection))if(!(catalog.collections||[]).some(item=>item.parentId===parent.bookId))throw Error('英文套装缺少完整单册目录，未更新。');
  english.splice(0,english.length,...byId.values());
  const excluded=exclusions(english,options),shelfMatches=new Map();
  for(const book of english)if(!excluded(book)&&!book.isCollection)shelfMatches.set(book.bookId,{publicBookId:'shelf-book-'+owner+'-'+book.bookId,title:book.title});
  const result=BP.applyReadSnapshot(records,options.plans,snapshot,{...options,shelfMatches});
  // 公共目录补齐身份后，原站未读的手工勾选也要迁接；不等待该册出现于已读快照。
  for(const book of english){
    const privateId='shelf-book-'+owner+'-'+book.bookId,old=records?.[BP.MANUAL+privateId];
    const previous=parse(records?.[PREFIX+owner+':'+book.bookId]?.note);
    if(!old||previous?.appBookId!==book.appBookId)continue;
    const exact=(options.directory?.books||[]).some(item=>item.externalIds?.xiaohuasheng?.includes(book.bookId));
    if(!exact)continue;
    const match=BP.matchEntry(options.plans,book,options.directory,options.catalog);
    if(match.candidates.length!==1||match.conflicts.length)continue;
    const key=BP.MANUAL+match.candidates[0].publicBookId;
    if(!records?.[key]&&!result.changes[key])result.changes[key]={...old};
  }
  const active=new Set();
  for(const book of english){
    const key=PREFIX+owner+':'+book.bookId;
    // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-002 规范: 私人目录只保留固定书目字段，外站对象不能覆盖账号、版本或进度键。
    const previous=parse(records?.[key]?.note),fallback=previous?.appBookId===book.appBookId?previous:{};
    const descriptions=Object.fromEntries(['author','publisher','isbn','seriesTitle','catalogTags'].filter(field=>book[field]!==undefined||fallback[field]!==undefined).map(field=>[field,book[field]??fallback[field]]));
    const note=JSON.stringify({version:1,accountId:owner,bookId:book.bookId,appBookId:book.appBookId,title:book.title,language:book.language,read:book.read,isCollection:book.isCollection,...descriptions,...(book.cover?{cover:book.cover}:{}),...(book.series?{series:{id:book.series.id,appBookId:book.series.appBookId,title:book.series.title}}:{})});
    if(note.length>4000)throw Error('书架元信息超出保存容量，原记录保留。');
    active.add(key);
    if(records?.[key]?.status!=='using'||records[key].note!==note)result.changes[key]={status:'using',note};
    // 未读仅撤回同身份的私人导入事实，不删除手工勾选或公共书目事实。
    const externalKey=BP.EXTERNAL+owner+':'+book.bookId,old=records?.[externalKey],fact=parse(old?.note);
    if(!book.read&&old?.status==='done'&&fact?.publicBookId==='shelf-book-'+owner+'-'+book.bookId)result.changes[externalKey]={...old,status:'not-started'};
  }
  for(const [key,record] of Object.entries(records||{}))if(key.startsWith(PREFIX+owner+':')&&record.status==='using'&&!active.has(key))result.changes[key]={...record,status:'not-started'};
  result.shelf={english:english.length,books:english.filter(book=>!excluded(book)&&!book.isCollection).length};
  return result;
}
function groups(records,options={}){
  const all=metadata(records),excluded=exclusions(all,options),groups=new Map();
  for(const book of all){
    if(excluded(book))continue;
    const series=displaySeries(book),key=series?'shelf-series-'+series.id:'shelf-book-'+book.accountId+'-'+book.bookId;
    if(!groups.has(key))groups.set(key,{id:key,title:series?.title||book.title,series:!!series,books:[],cover:book.cover});
    const group=groups.get(key);
    if(!book.isCollection)group.books.push({...book,id:'shelf-book-'+book.accountId+'-'+book.bookId});
  }
  return [...groups.values()].filter(group=>group.books.length).map(group=>{
    const completed=group.books.filter(book=>BP.bookState(records,book.id).done).length,total=group.books.length;
    return {...group,completed,total,status:completed===total?'done':completed?'using':'not-started'};
  }).sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
}
// 本人明确要求的展示归组；不推定出版目录、跨版身份或完成事实。
function displaySeries(book){
  const labels=[book.series?.title,book.seriesTitle,book.author,book.publisher,...(book.catalogTags||[])];
  if(labels.some(label=>/^lovevery(?:\.com|绘本)?$/i.test(String(label||'').trim())))return {id:'curated-lovevery',title:'Lovevery'};
  if([book.title,book.series?.title].some(label=>/construction\s+site|晚安工地上的车/i.test(label||'')))return {id:'curated-construction-site',title:'Construction Site'};
  return book.series;
}
return {PREFIX,metadata,apply,groups,displaySeries};
});
