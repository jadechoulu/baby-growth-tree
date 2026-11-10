// 仅读取公共目录，以合成记录回放逐本入口；不读取账号、书架或浏览器记录。
const fs=require('node:fs');
const path=require('node:path');
const M=require('../english/model.js');
const P=require('../english/practice.js');
const BP=require('../english/book-progress.js');
const root=path.resolve(__dirname,'..');
const read=id=>JSON.parse(fs.readFileSync(path.join(root,'english/data',id+'.json'),'utf8'));
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const groupBy=(rows,key)=>{const map=new Map();for(const row of rows){const id=key(row);if(!map.has(id))map.set(id,[]);map.get(id).push(row);}return map;};

function loadInputs(){
  const volumes=read('resource-volumes'),directory=read('resource-books'),reading=read('reading-plans');
  const raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan'),resourceVolumes:volumes,liaoReading:read('liao-reading')};
  return {volumes,directory,reading,catalog:M.normalize(raw),routePlan:raw.routePlan};
}

function auditReadingReuse({volumes,directory,reading={plans:[]},catalog={resources:[],stages:[],routes:[]},routePlan={domains:[]}}){
  const sourceBooks=(directory.books||[]).length;
  directory=BP.withReadingPlans(directory,reading,volumes);
  const issues=[],ranges=[],references=[],aliases=[],series=new Map((volumes.series||[]).map(row=>[row.resourceId,row]));
  function canonical(id){
    const seen=new Set();let row=series.get(id);
    while(row?.catalogResourceId){
      if(seen.has(id)){issues.push({kind:'alias-cycle',resourceId:id});return null;}
      seen.add(id);id=row.catalogResourceId;row=series.get(id);
      if(!row){issues.push({kind:'missing-alias-target',resourceId:[...seen][0],target:id});return null;}
    }
    return id;
  }
  for(const row of series.values())if(row.catalogResourceId){const target=canonical(row.resourceId);if(target)aliases.push({resourceId:row.resourceId,target});}
  const books=directory.books||[],byBook=groupBy(books,b=>b.id);
  for(const [id,rows] of byBook)if(rows.length>1)issues.push({kind:'duplicate-public-id',bookId:id});
  const equivalences=directory.readingEquivalences||[],linkedIds=new Set(),sourceIds=new Set((directory.sources||[]).map(source=>source.id));
  for(const group of equivalences){
    if(group.kind!=='same-isbn'||!/^\d{13}$/.test(group.isbn)||group.bookIds?.length<2||!group.sourceIds?.length||group.sourceIds.some(id=>!sourceIds.has(id))){issues.push({kind:'invalid-equivalence-evidence',bookIds:group.bookIds});continue;}
    for(const id of group.bookIds){
      if(!byBook.has(id)||linkedIds.has(id))issues.push({kind:'invalid-equivalence-member',bookId:id});
      linkedIds.add(id);
    }
    if(group.bookIds.every(id=>byBook.has(id))){
      const marked=BP.manualUpdate({},group.bookIds[0],true,directory);
      const legacy={[BP.MANUAL+group.bookIds.at(-1)]:{status:'done'}},reverted={...legacy,...BP.manualUpdate(legacy,group.bookIds[0],false,directory)};
      const external={[BP.EXTERNAL+'audit:fixture']:{status:'done',note:JSON.stringify({version:1,sourceKind:'xiaohuasheng_bookcase_read',publicBookId:group.bookIds.at(-1),readCount:2})}};
      if(group.bookIds.some(id=>!BP.bookState(marked,id,directory).done||BP.bookState(reverted,id,directory).done||BP.bookState(external,id,directory).readCount!==2))issues.push({kind:'reading-equivalence-projection',bookIds:group.bookIds});
    }
  }
  // 在不可递归的目录上及时返回，避免把别名循环传给生产模型。
  if(issues.some(row=>['alias-cycle','missing-alias-target'].includes(row.kind)))return {summary:{books:books.length,aliases:aliases.length,issues:issues.length},issues,ranges,references,aliases,duplicateExternalIds:[],duplicateIsbns:[],editionMatchConflicts:[]};
  const candidates=new Set([...catalog.resources.filter(row=>['book','reader'].includes(row.type)).map(row=>row.id),...series.keys()]);
  for(const resourceId of candidates){
    for(const scope of M.publicationScopes(volumes,resourceId)){
      const bound=scope.parts?.length&&scope.parts.every(part=>part.directoryMatch);
      const plan=BP.planForResource(reading,resourceId,directory,volumes,scope),group=plan&&BP.scopeGroup(plan,scope);
      const selected=plan&&group!==null?BP.books(plan,group):[];
      const entry={resourceId,canonicalId:canonical(resourceId),scopeId:scope.id,edition:scope.edition,total:scope.total,selected:selected.length,status:selected.length?'逐本共用':bound?'完整映射未接通':'缺少完整逐册映射'};
      ranges.push(entry);
      if(!bound)continue;
      const expected=new Set(scope.parts.flatMap(part=>books.filter(book=>canonical(book.resourceId)===canonical(resourceId)&&['edition','level'].every(key=>part.directoryMatch[key]===undefined||book[key]===part.directoryMatch[key])&&(!part.directoryMatch.bookIds||part.directoryMatch.bookIds.includes(book.id))).map(book=>book.id)));
      if(expected.size!==scope.total||!same(expected,new Set(selected.map(book=>book.id)))){issues.push({kind:'scope-membership',...entry,expected:expected.size});continue;}
      // 同一合成单册在当前范围、套系计划与历史套系ID中须使用同一稳定键。
      const probe=selected[0];
      if(!probe)continue;
      const records=BP.manualUpdate({},probe,true,directory),again=BP.manualUpdate(records,probe,false,directory);
      const completed=BP.progress(records,plan,group).identifiedCompleted,reverted=BP.progress({...records,...again},plan,group).identifiedCompleted;
      const projected=BP.projectScopeQuantity(records,resourceId,scope,{completed:0},volumes,directory);
      if(completed!==1||reverted!==0||projected.completed!==1)issues.push({kind:'shared-progress-projection',...entry,completed,reverted,projected:projected.completed});
    }
  }
  const execution=new Set((catalog.routes||[]).flatMap(route=>(routePlan.domains||[]).flatMap(domain=>M.getRoutePlan(catalog,route.id,domain.id)?.stages.map(stage=>stage.id)||[])));
  for(const stage of catalog.stages||[])for(const item of M.getStageMaterials(catalog,stage)){
    if(!['book','reader'].includes(item.resource.type))continue;
    const unit={item,key:P.unitKey(stage,item),resourceId:item.resource.id,stageId:stage.id,recordStageId:item.material.recordStageId||stage.id,label:item.resource.title};
    unit.bookScopes=P.bookScopes(unit.resourceId,item.materials.map(m=>M.formatLevel(m.level,item.resource)),volumes,unit.recordStageId);
    if(!unit.bookScopes.length)unit.bookScopes=P.bookScopes(unit.resourceId,[item.levelSegments.map(row=>row.text).join('')],volumes,unit.recordStageId);
    for(const part of P.expandBookUnits(unit,M.getMaterialLevels(item),volumes)){
      const scope=part.partScope||P.bookScope(undefined,part.bookScopes),plan=BP.planForResource(reading,part.resourceId,directory,volumes,scope),group=plan&&BP.scopeGroup(plan,scope);
      const scopeCandidates=part.bookScopes.map(candidate=>({id:candidate.id,edition:candidate.edition,label:candidate.label,total:candidate.total}));
      references.push({route:stage.routeId,stageId:stage.id,stageTitle:stage.title,execution:execution.has(stage.id),resourceId:part.resourceId,title:item.resource.title,level:part.partScope?.label||part.partLevel?.label||item.materials.map(m=>m.level).join('、'),scopeId:scope?.id||null,scopeCandidates,status:plan&&group!==null?'逐本共用':scope?.total?'只有数量':scopeCandidates.some(candidate=>Number.isInteger(candidate.total)&&candidate.total>0)?'待选目录':'范围待核'});
    }
  }
  const guidRows=books.flatMap(book=>(book.externalIds?.xiaohuasheng||[]).map(guid=>({guid,book})));
  const duplicateExternalIds=[...groupBy(guidRows,row=>row.guid)].filter(([,rows])=>new Set(rows.map(row=>row.book.id)).size>1).map(([guid,rows])=>({guid,books:rows.map(row=>({id:row.book.id,resourceId:row.book.resourceId,edition:row.book.edition}))}));
  const isbnRows=books.flatMap(book=>[...new Set([book.isbn,book.isbn13,book.catalogMetadata?.isbn,book.catalogMetadata?.isbn13,...(directory.sources||[]).filter(source=>book.sourceIds?.includes(source.id)&&source.url?.startsWith('https://collins.co.uk/products/')).map(source=>source.url.match(/\d{13}/)?.[0])].filter(value=>typeof value==='string'&&/^\d{13}$/.test(value)))].map(isbn=>({isbn,book})));
  const duplicateIsbns=[...groupBy(isbnRows,row=>row.isbn)].filter(([,rows])=>new Set(rows.map(row=>row.book.id)).size>1).map(([isbn,rows])=>({isbn,books:rows.map(row=>({id:row.book.id,resourceId:row.book.resourceId,edition:row.book.edition}))}));
  // 公开身份直达结果和既有明确套系前缀兼容规则不能静默指向不同单册。
  const withoutIds={...directory,books:books.map(book=>{const row={...book};delete row.externalIds;return row;})},editionMatchConflicts=[];
  for(const book of books)for(const guid of book.externalIds?.xiaohuasheng||[])for(const title of new Set([book.catalogMetadata?.originalTitle,book.title,...book.aliases||[]].filter(Boolean))){
    const input={bookId:guid,title},direct=BP.matchEntry(reading,input,directory,volumes),compat=BP.matchEntry(reading,input,withoutIds,volumes);
    const overlap=new Set(direct.candidates.flatMap(row=>[row.publicBookId,...row.equivalentBookIds||[]]));
    if(compat.candidates.some(row=>!overlap.has(row.publicBookId)))editionMatchConflicts.push({guid,title,resourceId:book.resourceId,direct:direct.candidates.map(row=>row.publicBookId),compat:compat.candidates.map(row=>row.publicBookId)});
  }
  const statuses=rows=>Object.fromEntries(['逐本共用','只有数量','待选目录','范围待核'].map(status=>[status,rows.filter(row=>row.status===status).length]));
  const summary={books:books.length,sourceBooks,authoredDerivedBooks:books.length-sourceBooks,publicationEntries:series.size,aliases:aliases.length,readingEquivalences:equivalences.length,bookResources:catalog.resources.filter(row=>['book','reader'].includes(row.type)).length,ranges:ranges.length,perBookRanges:ranges.filter(row=>row.status==='逐本共用').length,references:references.length,executionReferences:references.filter(row=>row.execution).length,executionStatuses:statuses(references.filter(row=>row.execution)),duplicateExternalIds:duplicateExternalIds.length,duplicateIsbns:duplicateIsbns.length,editionMatchConflicts:editionMatchConflicts.length,issues:issues.length};
  return {summary,issues,ranges,references,aliases,duplicateExternalIds,duplicateIsbns,editionMatchConflicts};
}

function reportMarkdown(result){
  const {summary:s,issues,references}=result;
  const routeNames={xu:'许密杉',qing:'庆爸',banana:'香蕉妈妈'};
  const statuses=['逐本共用','只有数量','待选目录','范围待核'];
  const cell=value=>String(value??'').replace(/\|/g,'／').replace(/\n/g,' ');
  const lines=['# 全量书目与进度共用核查','', '核查日期：2026-11-11。审计脚本仅读取公共源码与合成记录，不读取本人选版或改写私人进度；不代表已发布或手机实机验收。','',
    `覆盖公共目录${s.books}册、${s.publicationEntries}份出版条目、${s.ranges}个具名范围。检查三条路线全景的全部${s.references}条书籍引用，并区分当前执行阶段的${s.executionReferences}条引用；包含同套系在不同阶段的重复引用，不是去重图书总量。`,
    '', '## 这些状态是什么意思','',
    '- 阶段、系列和目录是三层信息。三条路线的阶段与素材引用均已纳入；下列状态只检查该阶段的引用是否已对应到可逐本勾选的书目，不表示路线没有阶段或没有指定系列。',
    '- **逐本共用**：当前范围已有完整逐册成员，路线与图鉴读取同一单册记录。',
    '- **只有数量**：有明确范围及总册数，但公共库尚缺能完整对应的逐册成员。',
    '- **待选目录**：审计没有读取本人选版，阶段引用在公共数据中仍有多个版本／目录候选，尚未采用唯一范围；不表示要求用户重新选系列。已具备明确默认或唯一有效范围的，会沿公共函数自动采用。候选也可能是历史目录的重复描述，仍须核查归并，不能一律认定为真实出版版本差异。',
    '- **范围待核**：阶段素材已记录，但其级别、具名选本或“虚构部分／简单部分”等要求尚未对应到可用的公共逐册范围；也可能缺少该级别目录。不是阶段本身待确认。',
    '- 例如牛津树1级已指定系列和级别，公共库却同时有红标84本、橙标96本，需要核定版次；小猪小象“简单部分”则需要核定具体成员。不能用另一版或整套目录冒充该范围。',
    '', '## 当前执行阶段覆盖','', '| 路线 | 逐本共用 | 只有数量 | 待选目录 | 范围待核 |','| --- | ---: | ---: | ---: | ---: |'];
  for(const [route,name] of Object.entries(routeNames)){
    const rows=references.filter(row=>row.execution&&row.route===route);
    lines.push(`| ${name} | ${statuses.map(status=>rows.filter(row=>row.status===status).length).join(' | ')} |`);
  }
  lines.push('','## 身份与映射','',
    `- 历史套系映射、完整目录成员、同册证据及进度投影错误：${issues.length}项。`,
    `- 已核定同ISBN的书目引用${s.readingEquivalences}组，读取同一已有事实；没有逐册证据的不同版本继续隔离。`,
    `- 重复外站GUID：${s.duplicateExternalIds}组；待结合逐册证据核定的重复ISBN：${s.duplicateIsbns}组；精确GUID与旧匹配规则冲突：${s.editionMatchConflicts}条。`,'');
  for(const issue of issues)lines.push('- '+JSON.stringify(issue));
  for(const [route,name] of Object.entries(routeNames)){
    lines.push('## '+name+'：尚未接通完整逐册目录的引用','', '| 具体阶段 | 素材 | 原文级别／选材要求 | 审计状态与缺口 |','| --- | --- | --- | --- |');
    const seen=new Set();
    for(const row of references.filter(row=>row.execution&&row.route===route&&row.status!=='逐本共用')){
      const key=JSON.stringify([row.stageId,row.resourceId,row.level,row.status,row.scopeId]);if(seen.has(key))continue;seen.add(key);
      const candidates=[...new Set(row.scopeCandidates.map(candidate=>[candidate.edition,candidate.label,candidate.total?candidate.total+'本':'总量未核'].filter(Boolean).join(' · ')))];
      const reason=row.status==='待选目录'?'公共候选：'+candidates.join('；'):row.status==='只有数量'?'已有范围与总量，缺完整逐册成员':'缺少与本阶段要求对应的可用公共范围／逐册成员';
      lines.push(`| ${cell(row.stageTitle||row.stageId)} | ${cell(row.title)} | ${cell(row.level||'原文未限定级别')} | ${row.status}：${cell(reason)} |`);
    }
  }
  lines.push('','## 重跑','', '`node scripts/audit-reading-reuse.cjs`输出摘要；`--json`输出全部公共范围、来源及执行引用；`--write-report`重建本文。脚本不联网、不读取凭据或本人选版。','');
  return lines.join('\n');
}

if(require.main===module){
  const result=auditReadingReuse(loadInputs());
  if(process.argv.includes('--write-report'))fs.writeFileSync(path.join(root,'docs/audits/reading-reuse-20261111.md'),reportMarkdown(result));
  console.log(JSON.stringify(process.argv.includes('--json')?result:result.summary,null,2));
  if(result.issues.length)process.exitCode=1;
}
module.exports={auditReadingReuse,loadInputs,reportMarkdown};
