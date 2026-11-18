import { grades, goals } from './plan.mjs?v=20261118-unified-tabs';

// 每项指标独立使用从0到该指标最大目标的线性刻度，不插值生成学期或月度目标。
export function chartPoints(metric) {
 if(metric.kind==='ability')return Object.keys(grades).map((grade,index)=>({grade,value:goals[grade][metric.subject].find(goal=>goal.id===metric.goalId).summary,x:60+index*120,y:50}));
 const baseline=Number.isFinite(metric.baseline);
 const values=baseline?[metric.baseline,...metric.values]:metric.values;
 const gradeIds=Object.keys(grades);
 return values.map((value,index)=>({
  value, grade:baseline&&index===0?null:gradeIds[index-(baseline?1:0)],
  x:baseline?38+index*94:38+index*141,
  y:154-value/metric.max*100
 }));
}

export function goalCurve(metric,{grade,onSelect}) {
 const ns='http://www.w3.org/2000/svg';
 const svg=(tag,attrs={},...children)=>{
  const node=document.createElementNS(ns,tag);
  for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));
  node.append(...children);return node;
 };
 const text=(x,y,content,attrs={})=>{const node=svg('text',{x,y,...attrs});node.textContent=content;return node;};
 const ability=metric.kind==='ability',points=chartPoints(metric),name=metric.title+'：'+points.map(p=>(p.grade?grades[p.grade]:'起始基础')+p.value+(metric.unit||'')).join('，');
 const root=svg('svg',{viewBox:'0 0 360 204',class:'goal-curve',role:'group','aria-label':name});
 if(!ability)root.append(text(8,18,metric.unit,{class:'curve-unit'}));
 for(const value of ability?[]:[0,metric.max/2,metric.max]){
  const y=154-value/metric.max*100;
  root.append(svg('line',{x1:28,y1:y,x2:338,y2:y,class:'curve-grid'}));
 }
 if(!ability)root.append(text(8,158,'0',{class:'curve-unit'}));
 root.append(svg('polyline',{points:points.map(p=>p.x+','+p.y).join(' '),class:'curve-line'}));
 for(const p of points){
  const selected=p.grade===grade,label=p.grade?grades[p.grade]:'起始';
  const node=svg('g',{class:'curve-point'+(selected?' selected':'')+(!p.grade?' baseline':'')});
  if(p.grade){
   const aria=`查看${grades[p.grade]}${metric.title}目标：${p.value}${metric.unit||''}`;
   node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('aria-label',aria);
   node.setAttribute('aria-pressed',String(selected));node.setAttribute('data-chart-point','');
   node.addEventListener('click',()=>onSelect(p.grade));
   node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(p.grade);}});
   node.append(svg('rect',{x:p.x-(ability?53:32),y:25,width:ability?106:64,height:170,rx:8,class:'curve-hit'}));
  }
  node.append(svg('circle',{cx:p.x,cy:p.y,r:selected?8:5,class:'curve-dot'}));
  if(ability){
   node.append(text(p.x,82,label,{'text-anchor':'middle',class:'curve-grade'}));
   const lines=String(p.value).split(/[·、]/).flatMap(part=>{const chars=Array.from(part.trim()),rows=[];for(let i=0;i<chars.length;i+=6)rows.push(chars.slice(i,i+6).join(''));return rows;});
   const summary=text(p.x,112,'',{'text-anchor':'middle',class:'ability-value'});
   lines.forEach((line,index)=>{const span=svg('tspan',{x:p.x,y:112+index*22});span.textContent=line;summary.append(span);});
   node.append(summary);
  }else{
   node.append(text(p.x,p.y-18,p.value.toLocaleString(),{'text-anchor':'middle',class:'curve-value'}));
   node.append(text(p.x,185,label,{'text-anchor':'middle',class:'curve-grade'}));
  }
  root.append(node);
 }
 return root;
}
