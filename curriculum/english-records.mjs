// 复用英语原存储适配器及同步回执链，不在全科库复制英语单册事实。
export function createEnglishBooks({profileClient,notify=()=>{}}) {
 const BP=window.EnglishBookProgress;
 let sync;
 const adapter=window.XiaoyaSyncAdapters.createAdapters({indexedDB:window.indexedDB,localStorage:window.localStorage,profileClient,notify:area=>{if(area==='english')notify();}}).english;
 const client=()=>sync||=(window.XiaoyaSync.createClient({siteRoot:'../',profileClient}));
 return {
  read:()=>adapter.read(),
  state:(snapshot,book,group)=>BP.bookState(snapshot?.records||{},book,group),
  async set(book,done,group){
   const base=await adapter.read(),current=base||{version:1,profile:{vocabulary:0,mode:'audio'},favorites:[],records:{}};
   const value=await adapter.apply({...current,records:{...current.records,...BP.manualUpdate(current.records,book,done,group)}},base);
   void client().changed('english').catch(error=>notify(error));
   return value;
  },
  subscribe(callback){
   const c=client();return c.subscribe(area=>{if(area==='english')callback();});
  }
 };
}
