// 只统计家长明确记录的单字；识字、书目完成与年度目标确认各自独立。
const prefix='hanzi:v1:';
const han=/^\p{Script=Han}$/u;
export function characterKey(character,channel='recognition'){
 if(!han.test(character))throw new Error('请填写一个汉字。');
 return (channel==='writing'?'hanzi-writing:v1:':prefix)+character;
}
export function isCharacterKey(key){return /^(hanzi|hanzi-writing):v1:/u.test(key)&&han.test(key.split(':').at(-1));}
export function characterEntries(records,channel='recognition'){
 const selected=channel==='writing'?'hanzi-writing:v1:':prefix;
 return Object.entries(records).filter(([key,value])=>key.startsWith(selected)&&isCharacterKey(key)&&value.status==='done').map(([key,value])=>({key,character:key.slice(selected.length),...value}));
}
export function characterSummary(records){
 return {recognized:characterEntries(records).length,written:characterEntries(records,'writing').length};
}
export function characterDraft(text,records,channel='recognition'){
 if(!['recognition','writing','both'].includes(channel))throw new Error('请选择会认或会写。');
 const characters=[...new Set([...String(text).normalize('NFC')].filter(character=>han.test(character)))];
 const channels=channel==='both'?['recognition','writing']:[channel],keys=characters.flatMap(character=>channels.map(ability=>characterKey(character,ability)));
 return {characters,changes:Object.fromEntries(keys.filter(key=>records[key]?.status!=='done').map(key=>[key,{status:'done'}]))};
}
