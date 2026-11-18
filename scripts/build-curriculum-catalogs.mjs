import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { englishResources, catalogIds } from '../curriculum/catalog.mjs';
const require=createRequire(import.meta.url), BP=require('../english/book-progress.js');
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export async function buildCurriculumCatalogs() {
 const read=async name=>JSON.parse(await readFile(path.join(ROOT,'english/data',name+'.json'),'utf8'));
 const volumes=await read('resource-volumes'),directory=BP.withReadingPlans(await read('resource-books'),await read('reading-plans'),volumes);
 const chinese=JSON.parse(await readFile(path.join(ROOT,'curriculum/data/catalog-sources.json'),'utf8'));
 const index={};
 await mkdir(path.join(ROOT,'curriculum/catalogs'),{recursive:true});
 for(const id of catalogIds){
  let groups=chinese.groups.filter(group=>group.materialId===id);
  if(englishResources[id])groups=BP.catalogPlans(directory,volumes,englishResources[id]).map(plan=>({
   id:plan.id,title:plan.edition,edition:plan.edition,grades:['junior','middle','senior'],english:true,
   levels:[...new Set(plan.books.map(book=>book.level))],note:'公共参考目录，按手头版本选用；不是本计划指定版次或全套必读量。',
   books:BP.books(plan).map(book=>({id:book.id,title:book.title,level:book.level,cover:book.cover?(book.cover.startsWith('http')?book.cover:'../english/'+book.cover):'',readingIds:book.readingIds,sourceUrl:book.detailUrl||'',order:book.order})),
   // 同版等价关系保留原稳定ID，撤回亦沿公共bookState/manualUpdate处理。
   readingEquivalences:directory.readingEquivalences?.filter(group=>group.bookIds.some(bookId=>plan.books.some(book=>book.id===bookId)))||[]
  }));
  const value={version:1,groups};
  await writeFile(path.join(ROOT,'curriculum/catalogs',id+'.json'),JSON.stringify(value)+'\n');
  index[id]={cover:groups.find(g=>g.cover)?.cover||'',groups:groups.length,english:!!englishResources[id]};
 }
 await writeFile(path.join(ROOT,'curriculum/catalog-index.mjs'),'// 由 scripts/build-curriculum-catalogs.mjs 生成，不手工维护。\nexport const catalogIndex = '+JSON.stringify(index)+';\n');
 return index;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildCurriculumCatalogs();
