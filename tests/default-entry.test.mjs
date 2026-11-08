import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../shared/default-entry.js',import.meta.url),'utf8');
const sections=JSON.parse(fs.readFileSync(new URL('../shared/site-sections.json',import.meta.url),'utf8'));
function resolve(href){let redirected;const url=new URL(href);vm.runInNewContext(script,{URL,window:{XIAOYA_SITE_SECTIONS:sections,location:{href,hash:url.hash,search:url.search,replace:value=>redirected=value}}});return redirected;}
test('根入口和home默认进入英语宝宝页，兼容任意仓库路径',()=>{
  for(const page of ['', 'index.html','home.html'])assert.equal(resolve('https://example.com/family/'+page),'https://example.com/family/english/index.html#baby');
});
test('成长分类、版本入口和旧技能深链接不重定向',()=>{
  for(const suffix of ['?area=growth','#skill=test','?mode=test#skill=test'])assert.equal(resolve('https://example.com/family/index.html'+suffix),undefined);
  assert.equal(sections.find(s=>s.id==='growth').entry,'index.html?area=growth');
});
