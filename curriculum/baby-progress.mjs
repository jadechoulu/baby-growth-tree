import { ownBookState } from './catalog.mjs?v=20261118-books';

export function poetryCompletedCount(records,groups){
 const completed=new Set();
 for(const group of groups)if(!group.english)for(const book of group.books||[]){
  if(ownBookState(records,book))completed.add(book.id);
 }
 return completed.size;
}

export function targetProgress(current,total){
 if(!Number.isFinite(current)||current<0||!Number.isFinite(total)||total<=0)return null;
 return {current,total,percent:Math.min(100,Math.round(current/total*1000)/10)};
}
export function englishListeningCount(snapshot,vocabulary,authenticated){
 if(!authenticated)return null;
 const records=snapshot?.records||{};
 return vocabulary.initialized(records)?vocabulary.summary(records).listening.word.unique:Number(snapshot?.profile?.vocabulary)||0;
}
