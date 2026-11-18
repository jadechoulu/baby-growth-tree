/* 低幼建议只派生当前记录；浏览建议不写入完成事实。 */
(function(root){
'use strict';
const model=typeof module==='object'&&module.exports?require('./model.js'):root.EnglishModel;
const practice=typeof module==='object'&&module.exports?require('./practice.js'):root.EnglishPractice;
function recommend(catalog,profile={},records={},isStarted){
  const route=catalog.routes.find(route=>route.id==='low-age');
  if(!route)return null;
  const nodes=route.stages,words=Math.max(0,Number(profile.listeningWords??profile.vocabulary)||0);
  const age=profile.birthDate?model.getAge(profile.birthDate,profile.asOf):null;
  const started=isStarted||((stage)=>model.getStageMaterials(catalog,stage.id).some(item=>['using','done'].includes(records[practice.unitKey(stage,item)]?.status)));
  const current=practice.defaultStage(nodes,records,'low-age:listening',started);
  const hasProgress=nodes.some(stage=>started(stage)||practice.stageDone(records,'low-age:listening',stage.id));
  // 词数只改变试用候选；当前阶段只沿用手工完成及实际练习记录。
  const trialIndex=words>=500?4:words>=300?3:words>=100?2:words>=50?1:0;
  const trial=hasProgress?current:nodes[trialIndex];
  const complete=nodes.every(stage=>practice.stageDone(records,'low-age:listening',stage.id));
  const reason=(age?'当前'+age.label+'，':'')+(profile.wordsKnown===false?'尚未记录听力词汇，空白不表示零基础。':'已记录约'+words+'个听力词。')+
    (hasProgress?'继续当前阶段。':'先从熟悉的实物和动作试起，有基础可试相邻内容。')+
    (complete?'六阶段已完成，可复习或按兴趣拓展。':'阶段由家长确认。');
  const suggested=model.getStageMaterials(catalog,trial.id).filter(item=>!['animation','other'].includes(item.resource.type));
  const chosen=[];
  for(const type of ['song','flashcard','book','reader']){
    const items=suggested.filter(item=>item.resource.type===type);
    const item=items.find(item=>!['done'].includes(records[practice.unitKey(trial,item)]?.status))||items[0];
    if(item)chosen.push(item.resource.id);
  }
  const book=suggested.find(item=>item.resource.type==='book'||item.resource.type==='reader');
  const song=suggested.find(item=>item.resource.type==='song');
  const titles=(type)=>suggested.filter(item=>item.resource.type===type).slice(0,2).map(item=>item.resource.title);
  const common={routeId:'low-age',stageId:trial.id};
  const steps=[
    {...common,title:'先在生活里一起玩',minutes:'1–3 分钟',description:trial.raw.method,materialNames:titles('flashcard'),actionTips:['用宝宝正在玩的物品，示范一个短句。','等待看、指、拿或动作回应；没有回应也不追问。']},
    {...common,title:'把一小段儿歌唱成动作',minutes:'1–3 分钟',description:'选已经玩过的主题，唱一小段、做一个动作；愿意时再重复。',materialNames:song?[song.resource.title]:[],actionTips:['按兴趣选一首熟悉的儿歌。','优先家长唱、音频与动作；动画保留为家庭自选。']},
    {...common,title:trial.order<4?'翻一本短书，指给我看':'跟着画面看一小段故事',minutes:'3–5 分钟',description:trial.order<4?'选清楚的实物图或机关短书，指物、翻页、说短句；不用读完整本。':'围绕宝宝喜欢的角色或主题共读一小段，把熟悉句型用到玩耍里。',materialNames:book?[book.resource.title]:[],actionTips:['同一类先选一份，兴趣比整套进度更重要。','看不懂就缩短句子、换清楚的画面或回到实物。']},
    {...common,title:'把刚才的声音带回生活',minutes:'1–2 分钟',description:'吃饭、洗手或收玩具时再用刚才的词句，观察换个场景后是否仍能理解。',materialNames:[],actionTips:['只复用见过、玩过的内容，不开全天背景音任务。','宝宝转头、推开或离开时就停。']}
  ];
  return {currentStageId:current.id,trialStageId:trial.id,hasProgress,complete,reason,suggested:chosen,steps,signals:trial.raw.signals||[],automaticPromotion:false};
}
const api={recommend};root.EnglishLowAge=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
