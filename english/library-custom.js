(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishLibraryCustom=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const KEY='library.custom.v1:',TYPES=['book','reader','animation','song','flashcard','other'];
function key(id){const value=String(id||'');if(!/^[a-zA-Z0-9-]{1,100}$/.test(value))throw new Error('自建素材编号无效。');return KEY+value;}
function decode(record){try{const value=JSON.parse(record?.note);return value&&value.version===1&&value.kind==='custom-resource'&&typeof value.title==='string'&&TYPES.includes(value.type)?value:null;}catch{return null;}}
function resources(records){return Object.entries(records).filter(([id])=>id.startsWith(KEY)).flatMap(([id,record])=>{
  const value=decode(record);if(!value||value.deleted)return [];
  return [{id,title:value.title,type:value.type,custom:true,topics:Array.isArray(value.topics)?value.topics.filter(t=>typeof t==='string'):[],stageRefs:Array.isArray(value.stageRefs)?value.stageRefs.filter(s=>s&&typeof s.routeId==='string'&&typeof s.stageId==='string'):[],text:typeof value.text==='string'?value.text:'',aliases:[],levels:[],appearances:[]}];
});}
function pack(value,status){const note=JSON.stringify(value);if(note.length>4000)throw new Error('素材资料过长，请精简标题、主题或备注。');return {status,note};}
function save(records,id,input,stages=[]){
  const recordKey=key(id),old=decode(records[recordKey]),title=String(input.title||'').trim(),type=String(input.type||'book');
  if(!title||title.length>160)throw new Error('请输入1–160字的素材名称。');
  if(!TYPES.includes(type))throw new Error('请选择有效的素材类型。');
  const topics=[...new Set((Array.isArray(input.topics)?input.topics:[]).map(t=>String(t).trim()).filter(Boolean))];
  if(topics.some(t=>t.length>30))throw new Error('每个主题请控制在30字以内。');
  const refs=Array.isArray(input.stageRefs)?input.stageRefs:[],stageRefs=[];
  for(const ref of refs){if(!stages.some(s=>s.id===ref.stageId&&s.routeId===ref.routeId))throw new Error('阶段参考已不存在，请重新选择。');if(!stageRefs.some(s=>s.stageId===ref.stageId&&s.routeId===ref.routeId))stageRefs.push({routeId:ref.routeId,stageId:ref.stageId});}
  const status=input.status||records[recordKey]?.status||'not-started';if(!['not-started','using','done'].includes(status))throw new Error('请选择有效的阅读状态。');
  return {[recordKey]:pack({...old,version:1,kind:'custom-resource',title,type,topics,stageRefs,text:String(input.text||'').trim(),deleted:false},status)};
}
function remove(records,recordKey){const value=decode(records[recordKey]);if(!recordKey.startsWith(KEY)||!value)throw new Error('这份自建素材已不存在。');return {[recordKey]:pack({...value,deleted:true},records[recordKey].status||'not-started')};}
return {KEY,TYPES,key,decode,resources,save,remove};
});
