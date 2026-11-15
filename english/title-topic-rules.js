/* 只为已同步私人书目派生可解释的标题兜底；公共书目仍使用离线映射。 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EnglishTitleTopics=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const normal=value=>String(value||'').normalize('NFKC').replace(/’/g,"'").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ').trim();
const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function create(config,topics){
  let compiled;
  function regex(value,flags='i'){
    // 当前共用规则使用Python与JS共有语法；未来Python专属语法不静默改义。
    if(/\(\?P[<=]|\(\?\([^)]+\)|\\[AZ]/.test(value))return null;
    try{return new RegExp(value,flags);}catch{return null;}
  }
  function titleText(book){
    let title=String(book.title||'').normalize('NFKC').replace(/’/g,"'").trim();
    for(const value of [...(config.titlePrefixPatterns||[]),...(config.titleSuffixPatterns||[])]){const re=regex(value);if(re)title=title.replace(re,'');}
    const series=book.series?.title||book.seriesTitle;
    if(series){if(title.toLowerCase()===series.toLowerCase())return '';title=title.replace(new RegExp('^'+escape(series)+'\\s*[:：–—-]\\s*','i'),'');}
    return title.trim();
  }
  function classify(book){
    if(!compiled)compiled=(config.rules||[]).filter(rule=>topics.node(rule.topic)&&!rule.topic.startsWith('patterns')).map(rule=>{
      if(rule.exclude&&!regex(rule.exclude))return null;
      const terms=(rule.terms||[]).map(term=>escape(term).replace(/ /g,'\\s+'));
      const expressions=[terms.length?'(?:^|[^A-Za-z])('+terms.join('|')+')(?![A-Za-z])':null,...(rule.chineseTerms||[]).map(escape),rule.regex&&regex(rule.regex)?rule.regex:null].filter(Boolean);
      return {rule,excluded:rule.exclude?regex(rule.exclude):null,pattern:expressions.length?regex(expressions.join('|'),'ig'):null};
    }).filter(Boolean);
    const title=titleText(book),hits=[];
    if(!(config.ambiguousTitles||[]).some(value=>normal(value)===normal(title)))for(const {rule,excluded,pattern} of compiled){
      if(!pattern||excluded?.test(title))continue;
      const matched=[...new Set([...title.matchAll(pattern)].map(match=>match[1]||match[0]))].slice(0,4);
      if(matched.length)hits.push({topic:rule.topic,ruleId:rule.id,matchedText:matched});
    }
    const parents=new Set(hits.filter(hit=>hit.topic.includes('.')).map(hit=>hit.topic.split('.')[0])),selected=hits.filter(hit=>hit.topic.includes('.')||!parents.has(hit.topic));
    return {topics:[...new Set(selected.map(hit=>hit.topic))],status:selected.length?'title-fallback':'pending',patterns:[],basis:selected.length?'仅按本人已同步书目的题名与共用公开规则归类，尚未核正文；不按套系传播主题，不由标题生成句型。':'当前私人单册未取得可采用的主题依据。',evidence:selected.map(hit=>({kind:'title-fallback',ruleId:hit.ruleId,topics:[hit.topic],title:book.title,matchedText:hit.matchedText,summary:'书名“'+book.title+'”命中“'+hit.matchedText.join('、')+'”；采用'+topics.label(hit.topic)+'，仅标题兜底。'}))};
  }
  return {classify,titleText};
}
return {create};
});
