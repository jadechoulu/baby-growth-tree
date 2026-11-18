// 英语继续引用原公共书目；全科执行状态不代替单册完成事实。
export const englishResources = {
 raz:'resource-1qnd5uh', oxford:'resource-1n3ix1n', 'little-critter':'resource-1hwgnzy',
 'elephant-piggie':'resource-e87t8v', 'pete-cat':'resource-1hwirew', 'fly-guy':'resource-1ukyalh',
 'frog-toad':'resource-var8qr', mercy:'resource-cy521f', winnie:'resource-45qugp', owl:'resource-152pfrt',
 robot:'resource-1b0dlwg', 'press-start':'resource-sfumgq', 'magic-tree':'resource-1mnq6y8', 'dragon-masters':'resource-4meiec'
};
export const catalogIds = [...new Set([...Object.keys(englishResources),'little-sheep','mobi-reading','mobi-math','mobi-calculation','shichida','seven-skills'])];
export function groupsFor(groups, item, phase = '') {
 let selected=groups.filter(group=>group.grades.includes(item.ref.grade));
 if(item.id==='raz') {
  const levels={junior:['D','E','F'],middle:['G','H','I','J'],senior:['K','L']}[item.ref.grade];
  selected=selected.filter(group=>group.levels.some(level=>levels.includes(level)));
  if(phase==='autumn')selected=selected.filter(group=>group.levels.includes('D'));
  if(phase==='spring')selected=selected.filter(group=>group.levels.some(level=>['E','F'].includes(level)));
 }
 if(item.id==='oxford') {
  const levels={junior:['3','4','5'],middle:['6','7','8'],senior:['9']}[item.ref.grade];
  selected=selected.map(group=>({...group,books:group.books.filter(book=>levels.includes(book.level)&&(!phase||phase==='autumn'&&['3','4'].includes(book.level)||phase==='spring'&&book.level==='5'))})).filter(group=>group.books.length);
 }
 if(item.id==='little-sheep'&&item.ref.grade==='junior'&&phase)selected=selected.filter(group=>phase==='autumn'?group.title==='第1级':phase==='spring'?['第2级','第3级'].includes(group.title):true);
 return selected;
}
export const bookKey = book => 'book:'+book.id;
export function ownBookState(records, book) { return records[bookKey(book)]?.status==='done'; }
export function ownBookUpdate(book, done) { return {[bookKey(book)]:{status:done?'done':'planned'}}; }
const requests = new Map();
export function loadCatalog(id) {
 if(!catalogIds.includes(id))return Promise.resolve({groups:[]});
 if(!requests.has(id))requests.set(id,fetch(new URL('./catalogs/'+id+'.json',import.meta.url),{signal:AbortSignal.timeout(20000)}).then(response=>{if(!response.ok)throw new Error('目录读取失败，请重试。');return response.json();}).catch(error=>{requests.delete(id);throw error;}));
 return requests.get(id);
}
