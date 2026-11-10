import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{auditReadingReuse}=require('../scripts/audit-reading-reuse.cjs');

const sample=()=>({directory:{books:[{id:'book',resourceId:'canonical',title:'Example',edition:'edition',level:'A',externalIds:{xiaohuasheng:['exact']}}]},volumes:{series:[{resourceId:'canonical',unit:'本',scopes:[{id:'one',edition:'edition',parts:[{label:'A',count:1,directoryMatch:{edition:'edition',level:'A'}}]}]},{resourceId:'old',catalogResourceId:'canonical'}]}});

test('共用审计回放已绑定单册的勾选、撤回和旧套系别名投影',()=>{
  const result=auditReadingReuse(sample());
  assert.deepEqual(result.issues,[]);
  assert.equal(result.summary.aliases,1);
  assert.ok(result.ranges.some(row=>row.resourceId==='old'&&row.selected===1));
  assert.equal(result.summary.duplicateExternalIds,0);
});

test('共用审计区分未补目录和错误完整范围，不将参考总量冒充书目',()=>{
  const missing=sample();delete missing.volumes.series[0].scopes[0].parts[0].directoryMatch;
  assert.deepEqual(auditReadingReuse(missing).issues,[]);
  assert.equal(auditReadingReuse(missing).ranges[0].status,'缺少完整逐册映射');
  const invalid=sample();invalid.volumes.series[0].scopes[0].parts[0].count=2;
  assert.ok(auditReadingReuse(invalid).issues.some(row=>row.kind==='scope-membership'));
});

test('共用审计提前报告别名循环与不存在的目标，避免递归生产模型',()=>{
  const cycle=sample();cycle.volumes.series[0].catalogResourceId='old';
  assert.ok(auditReadingReuse(cycle).issues.some(row=>row.kind==='alias-cycle'));
  const missing=sample();missing.volumes.series[1].catalogResourceId='absent';
  assert.ok(auditReadingReuse(missing).issues.some(row=>row.kind==='missing-alias-target'));
});

test('共用审计只报告重复精确身份，不按同名猜跨版完成关联',()=>{
  const input=sample();input.directory.books.push({...input.directory.books[0],id:'different',edition:'other'});
  const result=auditReadingReuse(input);
  assert.equal(result.summary.duplicateExternalIds,1);
  assert.equal(result.summary.duplicateIsbns,0);
  assert.equal(result.summary.editionMatchConflicts,0);
});

test('共用审计读取公共同ISBN关系并回放旧手工撤回与外部阅读次数',()=>{
  const input=sample();
  input.directory.books.push({...input.directory.books[0],id:'other-book',edition:'other'});
  input.volumes.series[0].scopes.push({id:'other',edition:'other',parts:[{label:'A',count:1,directoryMatch:{edition:'other',level:'A'}}]});
  input.directory.sources=[{id:'evidence'}];
  input.directory.readingEquivalences=[{kind:'same-isbn',isbn:'9780000000002',bookIds:['book','other-book'],sourceIds:['evidence']}];
  const result=auditReadingReuse(input);
  assert.equal(result.summary.readingEquivalences,1);
  assert.deepEqual(result.issues,[]);
  input.directory.readingEquivalences[0].sourceIds=['missing'];
  assert.ok(auditReadingReuse(input).issues.some(row=>row.kind==='invalid-equivalence-evidence'));
});

test('共用审计在同一运行目录派生原表单册，原表内容不另建身份',()=>{
  const input=sample();input.reading={plans:[{id:'authored',resourceId:'canonical',edition:'authored',source:{title:'原表'},groups:[{id:'A'}],books:[{id:'authored-book',title:'From authored plan',group:'A',order:1,patterns:['I see …']}]}]};
  const result=auditReadingReuse(input);
  assert.equal(result.summary.sourceBooks,1);
  assert.equal(result.summary.authoredDerivedBooks,1);
  assert.equal(result.summary.books,2);
  assert.equal(input.directory.books.length,1,'审计不修改原始公共目录');
});
