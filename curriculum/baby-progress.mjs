export function targetProgress(current,total){
 if(!Number.isFinite(current)||current<0||!Number.isFinite(total)||total<=0)return null;
 return {current,total,percent:Math.min(100,Math.round(current/total*1000)/10)};
}
export function englishListeningCount(snapshot,vocabulary,authenticated){
 if(!authenticated)return null;
 const records=snapshot?.records||{};
 return vocabulary.initialized(records)?vocabulary.summary(records).listening.word.unique:Number(snapshot?.profile?.vocabulary)||0;
}
