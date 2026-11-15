const test=require('node:test'),assert=require('node:assert/strict');
const Rules=require('../title-topic-rules.js'),T=require('../topics.js'),config=require('../data/material-topic-rules.json');
const classifier=Rules.create(config,T);
test('私人书名只派生有依据的一级二级，不创造句型或猜含糊标题',()=>{
  const result=classifier.classify({title:'Wake Up!'});
  assert.ok(result.topics.includes('daily.wake'));assert.equal(result.status,'title-fallback');assert.deepEqual(result.patterns,[]);
  assert.ok(result.evidence.some(item=>item.matchedText.includes('Wake Up')));
  assert.deepEqual(classifier.classify({title:'Happy Little Readers',series:{title:'Happy Little Readers'}}).topics,[]);
});
test('剥离明确系列前缀，排除已配置的惯用语，不把角色或品牌当本册主题',()=>{
  assert.equal(classifier.titleText({title:'Pete the Cat: I Love My White Shoes'}),'I Love My White Shoes');
  assert.ok(classifier.classify({title:'Pete the Cat: I Love My White Shoes'}).topics.includes('clothing.shoes'));
  assert.ok(!classifier.classify({title:'The Cat in the Hat'}).topics.some(id=>id.startsWith('animals')));
  assert.deepEqual(classifier.classify({title:'Animal Series: Wake Up!',series:{title:'Animal Series'}}).topics,classifier.classify({title:'Wake Up!'}).topics);
});
test('不兼容Python正则显式跳过，仍保留同规则的有效明确词语',()=>{
  const local=Rules.create({rules:[{id:'test',topic:'daily.wake',terms:['wake up'],regex:'(?P<word>wake)'}]},T);
  assert.deepEqual(local.classify({title:'wake up'}).topics,['daily.wake']);
  assert.deepEqual(local.classify({title:'wake'}).topics,[]);
});
test('私人交通题名剥离出版社系列，不从品牌或消防车生成科普主题',()=>{
  for(const title of ['Police Cars (Blastoff! Readers: Mighty Machines) (Blastoff Readers. Level 1)','Busy Machines: Trucks','Trains (Machines with Power!)','Fire Truck (Wheelie Books)']){
    const result=classifier.classify({title});
    assert.ok(result.topics.includes('transport.land'),title);
    assert.ok(!result.topics.some(id=>id.startsWith('science.')),title);
  }
});
test('当前公共规则的JS解释与Python离线解释对相同标题一致',()=>{
  const titles=['Wake Up!','The Cat in the Hat','Pete the Cat: I Love My White Shoes','Red and Blue','One','I Love Fall','Fun with Paper','A Glass of Water','The Orange Outlaw','The Big Storm','We Recycle Plastic'];
  const {spawnSync}=require('node:child_process');
  const script="import json,importlib.util,sys;from pathlib import Path;spec=importlib.util.spec_from_file_location('classifier','scripts/classify-material-topics.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);c=json.load(open('english/data/material-topic-rules.json'));t=json.load(open('english/data/topic-taxonomy.json'));nodes={x['id'] for x in t['nodes']};c['rules']=[r for r in c['rules'] if r['topic'] in nodes];rules=m.compile_rules(c,nodes);print(json.dumps([([] if m.normal(m.title_text(v,c)) in {m.normal(x) for x in c.get('ambiguousTitles',[])} else [x['topic'] for x in m.match_topics(m.title_text(v,c),rules)]) for v in json.load(sys.stdin)]))";
  const result=spawnSync('python3',['-c',script],{cwd:require('node:path').join(__dirname,'../..'),input:JSON.stringify(titles),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(titles.map(title=>classifier.classify({title}).topics),JSON.parse(result.stdout));
});
