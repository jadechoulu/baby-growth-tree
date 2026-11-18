// 只按稳定单册身份去重；同册的全部目录引用保留，不猜测跨版关系。
export function bookEntries(catalogs) {
 const entries=new Map();
 for(const {item,groups} of catalogs)for(const group of groups)for(const book of group.books){
  const key=(group.english?'english:':'curriculum:')+book.id;
  if(!entries.has(key))entries.set(key,{key,book,refs:[]});
  entries.get(key).refs.push({item,group,book});
 }
 return [...entries.values()];
}
export function matchesQuery(query,...values){
 const text=values.flat(Infinity).filter(Boolean).join(' ').toLocaleLowerCase();
 return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(term=>text.includes(term));
}
export function defaultCatalogGroup(groups,state){
 const active=groups.filter(group=>{const done=group.books.filter(book=>state(book,group).done).length;return done>0&&done<group.books.length;});
 return active.at(-1)?.id||groups.find(group=>group.books.some(book=>!state(book,group).done))?.id||groups[0]?.id||'';
}
export function filterBookEntries(entries,{search='',series='',catalog='',completion='',state}={}){
 return entries.flatMap(entry=>{
  const refs=entry.refs.filter(({item,group,book})=>(!series||item.id===series)&&(!catalog||group.id===catalog)&&matchesQuery(search,item.title,item.ref.level,group.title,book.title,book.level));
  if(!refs.length)return [];
  const value={...entry,refs,book:refs[0].book};
  return !completion||(completion==='done')===state(value).done?[value]:[];
 });
}
