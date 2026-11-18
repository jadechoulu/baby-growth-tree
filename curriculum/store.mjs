import { patchDocument, mergeBackup } from './model.mjs?v=20261118-baby-v4';
export const empty = () => ({ kind: 'curriculum', version: 1, records: {}, custom: [] });
export function createStore(indexedDB) {
 let opening;
 function open() {
  return opening ||= new Promise((resolve,reject) => {
   const request=indexedDB.open('xiaoya-curriculum',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('documents');
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(new Error('全科记录数据库被旧页面占用，请关闭旧页后重试。'));
   request.onsuccess=()=>{ const db=request.result; db.onversionchange=()=>{db.close();opening=null;};resolve(db); };
  }).catch(error=>{opening=null;throw error;});
 }
 async function transaction(change) {
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('documents',change?'readwrite':'readonly'),store=tx.objectStore('documents'),request=store.get('default');
   let result,error;
   request.onsuccess=()=>{ try { result=change?change(request.result||empty(),store):request.result||empty();if(change)store.put(result,'default'); }catch(e){error=e;tx.abort();} };
   tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(error||tx.error||new Error('全科记录未能保存。'));
  });
 }
 return { read:()=>transaction(), saveShelf:(changes,expected)=>transaction((current,documents)=>{const next=patchDocument(current,changes,expected);documents.add(current,'backup:chinese-shelf:'+crypto.randomUUID());return next;}), save:(changes,expected)=>transaction(current=>patchDocument(current,changes,expected)), import:incoming=>{let conflicts;return transaction(current=>{const result=mergeBackup(current,incoming);conflicts=result.conflicts;return result.value;}).then(value=>({value,conflicts}));} };
}
