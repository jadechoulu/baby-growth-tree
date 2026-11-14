import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../english/app.js',import.meta.url),'utf8');
const auth=app.slice(app.indexOf('let englishOwnerAuthenticated='),app.indexOf('function vocabularyOptions('));
const action=app.slice(app.indexOf('function vocabularyAction('),app.indexOf('\nfunction babyView('));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('退出即时清除语言记录弹窗和草稿，迟到的旧本人验证不能恢复私人展示',async()=>{
  const first=deferred(),second=deferred(),pending=[first,second],messages=[];
  let clears=0,renders=0;
  const context={S:{view:'baby',modal:{kind:'vocab-add',draft:{text:'private draft'}},profile:{},records:{}},vocabState:{drafts:{test:'private draft'}},modalTrail:[{modal:{kind:'vocab-edit'}},{modal:{kind:'resource'}}],overlay:{replaceChildren(){clears++;}},document:{body:{style:{overflow:'hidden'}}},render(){renders++;},siteSync:{getState:()=>pending.shift().promise},toast:message=>messages.push(message)};
  vm.createContext(context);vm.runInContext(auth+action,context);
  vm.runInContext('englishOwnerAuthenticated=true',context);
  const earlier=context.refreshEnglishOwnerAuth();
  assert.equal(context.S.modal,null);assert.equal(clears,1);assert.equal(context.document.body.style.overflow,'');assert.equal(context.modalTrail.length,1);assert.equal(Object.keys(context.vocabState.drafts).length,0);
  assert.throws(()=>context.requireVocabularyAuth(),/本人 GitHub/);
  const later=context.refreshEnglishOwnerAuth();second.resolve({authenticated:false});await later;
  first.resolve({authenticated:true});await earlier;
  assert.throws(()=>context.requireVocabularyAuth(),/本人 GitHub/);assert.equal(context.listeningWords(),0);assert.ok(renders>=2);
  context.vocabularyAction({dataset:{action:'vocab-new',type:'word'},closest(){return null;}});
  assert.match(messages[0],/本人 GitHub/);assert.equal(context.S.modal,null);
});

test('分类快捷添加保留能力、词性与分类，不复用另一分类的输入草稿',()=>{
  const calls=[],context={S:{records:{}},vocabState:{channel:'speaking',category:'all',drafts:{}},requireVocabularyAuth(){},document:{getElementById(){return null;}},openModal:(...args)=>calls.push(args)};
  vm.runInNewContext(action,context);
  context.vocabularyAction({dataset:{action:'vocab-new',type:'word',category:'actions',pos:'verb'}});
  const one=calls[0][2].draft;assert.equal(one.channel,'speaking');assert.equal(one.categoryId,'actions');assert.equal(one.pos,'verb');one.text='draft';
  context.vocabularyAction({dataset:{action:'vocab-new',type:'word',category:'uncategorized',pos:'other'}});
  assert.equal(calls[1][2].draft.text,'');assert.equal(calls[1][2].draft.categoryId,'uncategorized');assert.equal(calls[1][2].draft.pos,'other');
});
