// 学年仅为浏览起点，按满3周岁后的首个9月估算；实际班级可手动切换。
export function babyStage(birthDate,now=new Date()){
 const month=now.getMonth()+1,phase=month===2?'winter':month>=3&&month<=6?'spring':month>=7&&month<=8?'summer':'autumn';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate||''))return {grade:'junior',phase,before:false,after:false,estimated:false};
 const [year,birthMonth,day]=birthDate.split('-').map(Number);
 const birth=new Date(Date.UTC(year,birthMonth-1,day));
 if(birth.toISOString().slice(0,10)!==birthDate)return {grade:'junior',phase,before:false,after:false,estimated:false};
 const entryYear=year+3+(birthMonth>8?1:0);
 const schoolYear=now.getFullYear()-(month<9?1:0),offset=schoolYear-entryYear;
 return {grade:offset<1?'junior':offset===1?'middle':'senior',phase,before:offset<0,after:offset>2,estimated:true};
}
