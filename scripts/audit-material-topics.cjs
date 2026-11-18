/* 全量公共主题覆盖审计；不读取私人记录、登录信息或书架。 */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),load=name=>JSON.parse(fs.readFileSync(path.join(root,'english/data',name+'.json'),'utf8'));
const M=require('../english/model.js'),BP=require('../english/book-progress.js'),LB=require('../english/library-books.js'),T=require('../english/topics.js'),H=require('../english/hello-reading.js');
const volumes=load('resource-volumes'),plans=load('reading-plans'),source=load('resource-books'),liao=load('liao-reading'),hello=load('hello-reading'),sss=load('sss-songs');
// 与构建共用的原卡内容合并语义一致，裸索引没有童谣主题。
const rhymeContent=new Map(load('hello-rhyme-content').map(item=>[item.id,item]));
hello.rhymes=hello.rhymes.map(item=>({...item,...rhymeContent.get(item.id)}));
const C=M.normalize({banana:load('banana'),qing:load('qing'),xu:load('xu'),xuCurrent:load('xu-current'),xuSupplements:[load('xu-thousand'),load('xu-panorama')],routePlan:load('route-plan'),resourceVolumes:volumes,resourceCovers:load('resource-covers'),liaoReading:liao});
const directory=BP.withReadingPlans(source,plans,volumes),entries=LB.materialEntries(directory,C.resources,M,volumes);
const content=ids=>ids.filter(id=>id!=='patterns'&&T.node(id)?.parentId!=='patterns');
const pattern=ids=>ids.filter(id=>T.node(id)?.parentId==='patterns');
const tally=values=>values.reduce((out,key)=>(out[key]=(out[key]||0)+1,out),{});
const series=C.resources.map(resource=>{
  const books=entries.filter(book=>book.entryKind!=='resource'&&book.resourceIds.includes(resource.id)),topics=T.entryTopics('resource',resource);
  const pending=books.filter(book=>!content(T.entryTopics('book',book)).length);
  return {id:resource.id,title:resource.title,books:books.length,classified:books.length-pending.length,pendingBookIds:pending.map(book=>book.id),
    bookStatus:tally(books.map(book=>T.entryEvidence('book',book).status||book.topicStatus||'unspecified')),
    resourceStatus:T.entryEvidence('resource',resource).status||'unspecified',resourceTopics:content(topics),
    unreachableResourceTopics:topics.filter(id=>{
      const parent=T.node(id)?.parentId;
      return !LB.filter(entries,directory,{topic:parent||id,subtopic:parent?id:'all'}).some(entry=>entry.resourceIds.includes(resource.id));
    })};
});
const missing=directory.books.filter(book=>!entries.some(entry=>entry.id===book.id)).map(book=>book.id);
const patternEntries=entries.filter(entry=>T.matches(LB.topicIds(entry,directory),{topic:'patterns'}));
const missingPatternEntries=entries.filter(entry=>!T.matches(LB.topicIds(entry,directory),{topic:'patterns'})).map(entry=>entry.id||entry.resource.id);
const parts=hello.books.flatMap(book=>book.parts.map(part=>({id:book.id+'-part-'+part.part,topics:H.partTopics(hello,book,part)})));
const countSongs=rows=>({total:rows.length,classified:rows.filter(song=>content(T.entryTopics('song',song)).length).length,pendingIds:rows.filter(song=>!content(T.entryTopics('song',song)).length).map(song=>song.id)});
const report={scope:'公共静态目录全量检查；册数按分版本条目计。不读取私人书架，不等于逐册已核正文或线上验收。',
  counts:{resources:C.resources.length,sourceBooks:source.books.length,projectedBooks:directory.books.length,classifiedBooks:directory.books.filter(book=>content(T.entryTopics('book',book)).length).length,pendingBooks:directory.books.filter(book=>!content(T.entryTopics('book',book)).length).length,patternBooks:directory.books.filter(book=>pattern(T.entryTopics('book',book)).length).length,titlePatternBooks:directory.books.filter(book=>T.entryEvidence('book',book).patternStatus==='title-fallback').length,verifiedPatternBooks:directory.books.filter(book=>T.entryEvidence('book',book).patternStatus==='classification-verified').length,patternResources:C.resources.filter(resource=>pattern(T.entryTopics('resource',resource)).length).length,titlePatternResources:C.resources.filter(resource=>T.entryEvidence('resource',resource).patternStatus==='title-fallback').length,patternEntries:entries.length,missingPatternEntries:missingPatternEntries,missingPublicBookIds:missing},
  collections:{liao:{total:liao.books.length+liao.supplementaryBooks.length,pendingIds:C.resources.filter(resource=>resource.liaoBookId&&!content(T.entryTopics('resource',resource)).length).map(resource=>resource.liaoBookId)},
    helloParts:{total:parts.length,classified:parts.filter(part=>content(part.topics).length).length,pendingIds:parts.filter(part=>!content(part.topics).length).map(part=>part.id)},
    helloRhymes:{total:hello.rhymes.length,classified:hello.rhymes.filter(rhyme=>content(T.entryTopics('hello-rhyme',rhyme)).length).length},sss:countSongs(sss.songs),soundBook:countSongs(sss.soundBook.songs)},series};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(missing.length||missingPatternEntries.length)process.exitCode=1;
