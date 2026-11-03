(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishVocabulary=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const ENTRY='vocabulary.entry.v1:',CATEGORY='vocabulary.category.v1:',SETTINGS='vocabulary.settings.v1';
const TYPES={word:'单词',phrase:'短语',pattern:'句型'},CHANNELS={listening:'听懂',speaking:'会说'},POS={noun:'名词',verb:'动词',adjective:'形容词',adverb:'副词',other:'其他'};
const DEFAULT_CATEGORIES=[['body','身体与人物'],['objects','日常用品'],['nature','自然与动物'],['transport','交通与地点'],['actions','动作与生活'],['attributes','特征与概念'],['uncategorized','未分类']].map(([id,name])=>({id,name}));
const CATEGORY_ALIASES={clothing:'objects',food:'objects',animals:'nature',routines:'actions',people:'body',places:'transport'};
const PREVIOUS_CATEGORY_NAMES={body:'身体',objects:'日常物品',nature:'自然环境',transport:'交通出行',actions:'动作',attributes:'颜色与数量'};
function canonicalCategory(id){return Object.hasOwn(CATEGORY_ALIASES,id)?CATEGORY_ALIASES[id]:id;}
const own=(obj,key)=>Object.hasOwn(obj,key);
function text(value){return String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/^[\s.,!?;:，。！？；：]+|[\s.,!?;:，。！？；：]+$/g,'').replace(/\s+/g,' ');}
function canonical(value,type='word'){const t=text(value);const forms={feet:'foot',toes:'toe',teeth:'tooth'};return type==='word'&&own(forms,t)?forms[t]:t;}
function entryKey(value,type,channel){if(!own(TYPES,type)||!own(CHANNELS,channel))throw new Error('请选择单词、短语或句型，以及听懂或会说。');const t=canonical(value,type);if(!t||t.length>100)throw new Error('每条内容须为1–100个字符。');const key=ENTRY+type+':'+channel+':'+encodeURIComponent(t);if(key.length>160)throw new Error('这条内容过长，请缩短后再记录。');return key;}
function decode(record){try{const value=JSON.parse(record?.note);return value?.version===1&&typeof value==='object'?value:null;}catch{return null;}}
function pack(value,status='done'){const note=JSON.stringify({version:1,...value});if(note.length>4000)throw new Error('该条记录内容过长，请精简。');return {status,note};}
function categories(records){return [...DEFAULT_CATEGORIES.filter(c=>c.id!=='uncategorized').map(c=>({ ...c,record:records[CATEGORY+c.id]})),...Object.entries(records).filter(([k])=>k.startsWith(CATEGORY)&&!DEFAULT_CATEGORIES.some(c=>CATEGORY+c.id===k)&&!own(CATEGORY_ALIASES,k.slice(CATEGORY.length))).map(([k,record])=>({id:k.slice(CATEGORY.length),name:'',record}))].filter(c=>c.record?.status!=='not-started').map(c=>{const saved=decode(c.record)?.name;return {id:c.id,name:saved&&saved!==PREVIOUS_CATEGORY_NAMES[c.id]?saved:c.name};}).filter(c=>c.name).concat(DEFAULT_CATEGORIES.find(c=>c.id==='uncategorized'));}
function resolveCategory(records,id){const target=canonicalCategory(id);return categories(records).some(c=>c.id===target)?target:'uncategorized';}
function entries(records,{deleted=false}={}){return Object.entries(records).filter(([key,record])=>key.startsWith(ENTRY)&&(deleted||record.status==='done')).map(([key,record])=>{const value=decode(record);return {key,record,...value,aliases:Array.isArray(value?.aliases)?value.aliases.filter(a=>typeof a==='string'):[]};}).filter(e=>own(TYPES,e.type)&&own(CHANNELS,e.channel)&&typeof e.text==='string'&&Number.isSafeInteger(e.count)&&e.count>0);}
function initialized(records){return !!decode(records[SETTINGS])?.initialized||entries(records,{deleted:true}).length>0;}
function summary(records){const result={};for(const channel of Object.keys(CHANNELS)){result[channel]={};for(const type of Object.keys(TYPES)){const list=entries(records).filter(e=>e.channel===channel&&e.type===type);result[channel][type]={unique:list.length};}}return result;}
function groupEntries(records,{channel='listening',type='word',categoryId='all',search=''}={}){
  categoryId=canonicalCategory(categoryId);
  const cats=categories(records),catMap=new Map(cats.map(c=>[c.id,c])),query=text(search);
  const list=entries(records).filter(e=>e.channel===channel&&e.type===type).map(e=>({...e,categoryId:catMap.has(canonicalCategory(e.categoryId))?canonicalCategory(e.categoryId):'uncategorized'})).filter(e=>(categoryId==='all'||e.categoryId===categoryId)&&(!query||[e.text,...e.aliases,catMap.get(e.categoryId).name].join(' ').toLowerCase().includes(query)));
  const roles=type==='word'?Object.entries(POS).map(([id,label])=>[id,id==='other'?'其他单词':label]):[[type,TYPES[type]]];
  return roles.map(([id,label])=>{
    const selected=list.filter(e=>type!=='word'||(own(POS,e.pos)?e.pos:'other')===id);
    return {id,label,total:selected.length,categories:cats.map(c=>({...c,entries:selected.filter(e=>e.categoryId===c.id).sort((a,b)=>a.text.localeCompare(b.text))})).filter(c=>c.entries.length)};
  }).filter(g=>g.total);
}
function initChange(){return {[SETTINGS]:pack({initialized:true})};}
function validEntry(input){if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('每条记录须包含内容、类型与听说能力。');const type=String(input.type),channel=String(input.channel),value=canonical(input.text,type),key=entryKey(value,type,channel),count=Number(input.count??1);if(!Number.isSafeInteger(count)||count<1||count>1000000)throw new Error('记录次数须为1–1000000的整数。');return {key,type,channel,text:value,count,categoryId:canonicalCategory(String(input.categoryId||'uncategorized')),pos:own(POS,input.pos)?input.pos:'',aliases:[...new Set([...(Array.isArray(input.aliases)?input.aliases:[]),text(input.text)].filter(a=>typeof a==='string'&&a&&a!==value))].slice(0,12)};}
function add(records,input,{batchId=''}={}){const e=validEntry(input),old=decode(records[e.key]);if(batchId&&old?.imports?.includes(batchId))return {};const active=records[e.key]?.status==='done',count=active?old?.count||1:1;const value={...(active?old:{}),...e,count,categoryId:active?old.categoryId:e.categoryId,pos:active?old.pos:e.pos,aliases:[...new Set([...(old?.aliases||[]),...e.aliases])].slice(0,12),imports:[...new Set([...(old?.imports||[]),...(batchId?[batchId]:[])])]};delete value.key;return {...initChange(),[e.key]:pack(value)};}
function edit(records,key,input){const old=decode(records[key]);if(!old||!key.startsWith(ENTRY))throw new Error('这条记录已不存在。');const e=validEntry(input);if(e.key!==key&&records[e.key]?.status==='done')throw new Error('修改后的词条已存在，请直接编辑已有词条，避免覆盖。');const value={...old,...e};delete value.key;return {...initChange(),...(e.key!==key?{[key]:{...records[key],status:'not-started'}}:{}),[e.key]:pack(value)};}
function remove(records,key){if(!records[key])throw new Error('这条记录已不存在。');return {...initChange(),[key]:{...records[key],status:'not-started'}};}
function categoryChange(records,id,name,{deleted=false}={}){if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||id==='uncategorized')throw new Error('分类编号无效。');name=String(name||'').trim();if(!deleted&&(!name||name.length>30))throw new Error('分类名称须为1–30个字。');if(!deleted&&categories(records).some(c=>c.id!==id&&c.name===name))throw new Error('已有同名分类。');return {[CATEGORY+id]:pack({name},deleted?'not-started':'done')};}
function parseImport(value,defaults,batchId){const list=Array.isArray(value),raw=list?'':String(value).trim();if(!list&&!raw)throw new Error('请先填写内容。');let rows;
  if(list)rows=value.map(text).filter(Boolean).map(t=>({...defaults,text:t,count:1}));
  else if(raw.startsWith('{')){let data;try{data=JSON.parse(raw);}catch{throw new Error('JSON格式不正确。');}if(data.version!==1||!Array.isArray(data.entries)||typeof data.batchId!=='string'||!data.batchId||data.batchId.length>80)throw new Error('JSON须包含version:1、batchId和entries。');rows=data.entries;batchId=data.batchId;}
  else rows=raw.split(/[\n,，;；、]+/).map(text).filter(Boolean).map(t=>({...defaults,text:t,count:1}));
  if(!rows.length||rows.length>1000)throw new Error('每批请填写1–1000条记录。');
  if(defaults.channels!==undefined){
    if(!Array.isArray(defaults.channels)||!defaults.channels.length)throw new Error('请至少选择“听懂”或“会说”。');
    rows=rows.flatMap(row=>[...new Set(defaults.channels)].map(channel=>({...row,channel})));
  }
  return {batchId,entries:rows.map(validEntry)};
}
function importPlan(records,data){const changes={},catIds=new Set(categories(records).map(c=>c.id));for(const entry of data.entries){if(!catIds.has(canonicalCategory(entry.categoryId)))throw new Error('导入内容包含不存在的分类，请先管理分类。');const current={...records,...changes};
    // 同批重复词条合并别名，批次标记仅用于幂等；历史count保留但不再累计。
    const copy={...entry};delete copy.key;
    const key=entry.key,group=data.entries.filter(e=>e.key===key);if(own(changes,key))continue;
    copy.aliases=[...new Set(group.flatMap(e=>e.aliases))];
    Object.assign(changes,add(current,copy,{batchId:data.batchId}));
  }return changes;
}
return {ENTRY,CATEGORY,SETTINGS,TYPES,CHANNELS,POS,DEFAULT_CATEGORIES,canonical,entryKey,decode,pack,categories,resolveCategory,entries,initialized,summary,groupEntries,add,edit,remove,categoryChange,parseImport,importPlan};
});
