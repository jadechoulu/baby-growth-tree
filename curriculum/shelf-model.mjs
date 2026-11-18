// 私人中文书架只进入全科记录；公开目录仅用于精确身份排除。
export const shelfPrefix='shelf:v1:';
export const shelfReceipt='shelf-sync:v1:receipt';
const identity=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const chineseLanguages=['中文','汉语','简体中文','繁体中文'];
export function validShelfRecord(key,record){
 const book=parse(record?.note);
 if(key===shelfReceipt)return identity(book?.accountId)&&Number.isFinite(Date.parse(book.fetchedAt))&&Number.isSafeInteger(book.count)&&book.count>=0;
 if(!book||!identity(book.accountId)||!identity(book.bookId)||!/^\d{1,20}$/.test(book.appBookId)||key!==shelfPrefix+book.accountId+':'+book.bookId||typeof book.title!=='string'||!book.title.trim()||typeof book.read!=='boolean'||typeof book.isCollection!=='boolean'||!chineseLanguages.includes(book.language))return false;
 if(book.cover!==undefined&&(typeof book.cover!=='string'||!book.cover.startsWith('https://img.xiaohuasheng.cn/')))return false;
 return !book.series||(identity(book.series.id)&&typeof book.series.title==='string');
}
export function isChineseBook(book){return chineseLanguages.includes(book.language)&&!/双语|中英对照|中英文|英汉|汉英|英语(?:启蒙|教材|绘本|读物)|英文(?:启蒙|绘本|童谣|儿歌|读物)|bilingual/i.test(book.title+' '+(book.series?.title||''));}
export function shelfBooks(records){
 return Object.entries(records).flatMap(([key,value])=>{
  const book=key.startsWith(shelfPrefix)&&value.status==='using'?parse(value.note):null;
  return book&&validShelfRecord(key,value)&&isChineseBook(book)?[{...book,id:'private-xhs-'+book.accountId+'-'+book.bookId}]:[];
 });
}
export function plannedIdentities(catalogs){
 const books=new Set(),series=new Set();
 for(const catalog of catalogs)for(const group of catalog.groups||[]){
  const match=group.sourceUrl?.match(/^https:\/\/(?:www\.)?xiaohuasheng.cn\/(?:book|series)\/([a-zA-Z0-9_-]+)/);if(match)series.add(match[1]);
  for(const book of group.books||[]){const ids=book.externalIds?.xiaohuasheng;for(const id of Array.isArray(ids)?ids:ids?[ids]:[])books.add(id);}
 }
 return {books,series};
}
export function outsidePlan(book,planned){return !planned.books.has(book.bookId)&&!(book.series&&planned.series.has(book.series.id))&&!(book.isCollection&&planned.series.has(book.bookId));}
export function shelfGroups(books){
 const groups=new Map();
 for(const book of books){
  const id=book.series?'series-'+book.series.id:book.isCollection?'series-'+book.bookId:book.id;
  if(!groups.has(id))groups.set(id,{id,title:book.series?.title||book.title,books:[],container:null});
  const group=groups.get(id);if(book.isCollection)group.container=book;else group.books.push(book);
 }
 return [...groups.values()];
}
export function shelfState(records,book){return {done:book.read===true||records['book:'+book.id]?.status==='done',external:book.read===true,readCount:book.readCount||0};}
export function prepareChineseShelf(records,snapshot){
 const catalog=snapshot?.shelfCatalog,owner=String(snapshot?.accountId||'');
 if(snapshot?.complete!==true||snapshot.authenticated!==true||snapshot.transport!=='xiaohuasheng-app-api'||snapshot.predicate!=='readedFlag=1'||!identity(owner)||!Number.isFinite(Date.parse(snapshot.fetchedAt))||catalog?.complete!==true||catalog.version!==1||!Array.isArray(catalog.books)||catalog.total!==catalog.books.length||catalog.total!==snapshot.wholeBookcaseCount||!Array.isArray(snapshot.books))throw Error('未取得完整书架，原中文素材与进度保留。');
 const previous=parse(records[shelfReceipt]?.note);
 if(shelfBooks(records).some(book=>book.accountId!==owner))throw Error('小花生账号与已有中文书架不一致，未导入。');
 if(previous&&previous.accountId!==owner)throw Error('小花生账号与已有中文书架不一致，未导入。');
 if(previous&&Date.parse(previous.fetchedAt)>Date.parse(snapshot.fetchedAt))throw Error('本次快照较旧，未覆盖中文书架。');
 const seen=new Set(),appIds=new Set(),read=new Map(snapshot.books.map(book=>[book.bookId,book])),changes={},active=new Set();let count=0;
 if(read.size!==snapshot.books.length)throw Error('已读书目身份重复，未导入。');
 for(const book of catalog.books){
  if(!identity(book.bookId)||!/^\d{1,20}$/.test(book.appBookId)||typeof book.title!=='string'||!book.title.trim()||typeof book.language!=='string'||typeof book.read!=='boolean'||typeof book.isCollection!=='boolean'||seen.has(book.bookId)||appIds.has(book.appBookId)||book.read!==read.has(book.bookId)||read.has(book.bookId)&&String(read.get(book.bookId).appBookId)!==book.appBookId)throw Error('书架身份或已读字段冲突，未导入。');
  seen.add(book.bookId);appIds.add(book.appBookId);if(!isChineseBook(book))continue;
  const key=shelfPrefix+owner+':'+book.bookId,old=parse(records[key]?.note),reading=read.get(book.bookId);
  if(old&&old.appBookId!==book.appBookId)throw Error('中文书目身份发生变化，原记录保留。');
  const value={accountId:owner,bookId:book.bookId,appBookId:book.appBookId,title:book.title,language:book.language,read:book.read,isCollection:book.isCollection};
  for(const field of ['author','publisher','isbn'])if(typeof book[field]==='string')value[field]=book[field];
  if(book.cover?.startsWith('https://img.xiaohuasheng.cn/'))value.cover=book.cover;
  if(book.series&&identity(book.series.id)&&typeof book.series.title==='string')value.series={id:book.series.id,title:book.series.title};
  const readCount=reading?.readCount??old?.readCount;if(Number.isSafeInteger(readCount)&&readCount>=0)value.readCount=readCount;
  active.add(key);changes[key]={status:'using',note:JSON.stringify(value)};count++;
 }
 if([...read.keys()].some(id=>!seen.has(id)))throw Error('已读书目缺少目录身份，未导入。');
 for(const [key,record]of Object.entries(records))if(key.startsWith(shelfPrefix+owner+':')&&record.status==='using'&&!active.has(key))changes[key]={...record,status:'paused'};
 changes[shelfReceipt]={status:'done',note:JSON.stringify({accountId:owner,fetchedAt:snapshot.fetchedAt,count})};
 return {changes,count};
}
