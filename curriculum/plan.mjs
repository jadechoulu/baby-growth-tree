// 来源：家长于2026-11-18提供的《幼儿园小班全科启蒙全年详细计划》。目标是家庭计划，不是能力测评标准。
export const grades = { junior: '小班', middle: '中班', senior: '大班' };
export const subjects = { chinese: '语文', english: '英语', math: '数学' };
export const types = { reader: '分级读物', picture: '绘本 / 桥梁书', poem: '古诗', workbook: '练习册', animation: '动画', tool: '教具 / 活动' };
export const phases = [
  { id: 'autumn', title: '上学期', months: '9月—1月', hours: 80, focus: '适应入园，养成习惯', chinese: ['累计识字60字，小羊上山第1级；每月8—10个生字，约2本分级。', '复习原有80首古诗，新增5首，累计85首；每月复习8—10首。', '每天15—30分钟亲子阅读，虚构与非虚构搭配，尝试跟读短句。'], english: ['听力累计约1000词，阶段80小时，日常约半小时。', '认识26个字母大小写，逐步建立常见字母音。', '尝试复述简单绘本短句。'], math: ['教具、桌游与实操优先，练习册辅助；原计划每月2—3本。', '10以内点数，理解5以内加减法。'] },
  { id: 'winter', title: '寒假', months: '2月', hours: 45, focus: '巩固体系，增加英语接触', chinese: ['巩固已学汉字，保持生活认读。', '复习古诗，继续每日亲子阅读。'], english: ['听力45小时，原计划每日约1.5小时；音频、共读和动画搭配。', '巩固26个字母的大小写、发音与辨析。', '尝试完整复述熟悉的短篇分级，练习日常情景表达。'], math: ['继续摩比爱数学萌芽篇与摩比爱计算萌芽篇，以教具游戏巩固。'] },
  { id: 'spring', title: '下学期', months: '3月—6月', hours: 80, focus: '生活复现，逐步增加输出', chinese: ['新增识字120字，累计180字；原计划每天1字、每周1本分级。', '新增古诗5首，累计90首，以复习为主。', '每天15—30分钟共读，尝试简单复述故事和知识点。'], english: ['听力达到约1200词，阶段80小时，日常约40分钟。', '接触常见发音，自然拼读按兴趣和实际准备度尝试。', '结合熟悉的绘本与动画输出简单句。'], math: ['七田真4—5岁思维练习配合实操，原计划每月1—2本。', '年度主线为10以内计算；100以内认数作为生活认知拓展。'] },
  { id: 'summer', title: '暑假', months: '7月—8月', hours: 95, focus: '巩固与复述，尝试桥梁内容', chinese: ['巩固180字与90首古诗；继续每日阅读，不额外安排新增量。'], english: ['听力95小时，原计划每日约1.5小时；按62天计算约92分钟/天。', '巩固26个字母及常见发音，尝试熟悉内容的简单对话和复述。', '尝试苍蝇小子与道奇，是否进入桥梁以实际理解和兴趣为准。'], math: ['七大能力练习册4—5岁结合游戏，继续10以内计算与分解组合。'] }
];
const goal = (id, title, summary, detail) => ({ id, title, summary, detail });
export const goals = {
 junior: {
  chinese: [goal('literacy', '生活识字', '累计180字', '以当前20字为基础，慢速打底；随文认读、生活复现，逐步支持自主阅读。'), goal('poetry', '古诗积累', '80首复习 + 新增10首', '累计90首，以消化、理解、复盘为主，复习与少量新增搭配。'), goal('reading', '每日亲子阅读', '跟读故事 · 复述尝试', '每天15—30分钟亲子阅读。虚构故事跟读、尝试简单复述；非虚构绘本补充常识，鼓励说出一个知识点。')],
  english: [goal('listening', '听力输入', '800 → 1200词 · 300小时', '新增400听力词；共读、音频与动画结合，熟悉内容反复听。计划读物难度参考蓝思值300，按理解尝试桥梁内容。'), goal('phonics', '字母与发音', '26个字母大小写', '认识并辨析大小写，接触常见字母音；下学期的自然拼读仅作尝试，不把认字母等同自主解码。'), goal('speaking', '熟悉内容输出', '复述台词 · 简单句', '跟随熟悉绘本、动画复述短句，在日常情景中尝试简单英文表达。')],
  math: [goal('thinking', '思维与空间', '实操、游戏先行', '通过观察、分类、空间搭建、逻辑游戏和专注力活动练习；教具实操优先，练习册辅助巩固。'), goal('calculation', '数感与计算', '10以内点数与计算', '理解数量、分解组合；上学期先做5以内加减。100以内认数为拓展，进退位与100以内计算保留到后续阶段。')]
 },
 middle: {
  chinese: [goal('literacy', '生活识字', '累计490字', '在小班基础上稳步增加高频字积累，在阅读和生活中认读、复现。'), goal('poetry', '课本古诗', '新增25首 · 累计115首', '完成课本核心115首，复习与新增并行，保持理解与复述。'), goal('reading', '看图与知识复述', '看图复述故事', '虚构类看图复述，非虚构类能复述接触过的知识点。')],
  english: [goal('listening', '听力输入', '1200 → 2000词 · 360小时', '新增800听力词，逐渐增加桥梁故事与情节理解，计划读物难度参考蓝思值500。'), goal('phonics', '自然拼读', '规则、高频词、尝试解码', '学习自然拼读规则和高频词，尝试自主解码简单读物。'), goal('speaking', '日常英文对话', '能够简单交流', '在熟悉情景开展简短英文对话，逐步提高表达流畅度。')],
  math: [goal('thinking', '思维与逻辑', '探索、实操、推理', '结合实物操作与游戏，练习观察分类、空间想象和逻辑推理，练习册用于辅助巩固。'), goal('calculation', '数感与计算', '20以内计算', '通过实物和游戏理解分解组合与加减关系。')]
 },
 senior: {
  chinese: [goal('literacy', '自主识字', '累计1000字', '积累1000个高频字，在真实阅读中运用，逐渐支持自主阅读。'), goal('poetry', '古诗拓展', '新增40首 · 累计155首', '在核心115首基础上新增40首，完成155首的计划积累。'), goal('reading', '自主复述与拓展', '脱稿表达', '虚构类自主复述并拓展，非虚构类脱稿介绍一个知识点。')],
  english: [goal('listening', '听力入章', '2000 → 3000词 · 480小时', '新增1000听力词，尝试初章故事，逐步理解更长的情节；计划读物难度参考蓝思值600。'), goal('phonics', '自主阅读', '简单分级与绘本', '结合自然拼读和高频词，自主阅读适合自己的简单读物。'), goal('speaking', '脱稿复述', '复述故事、介绍事物', '尝试脱稿复述熟悉的英文动画或绘本，用英文介绍一个事物。')],
  math: [goal('thinking', '思维与幼小衔接', '空间、逻辑、专注力', '保持实操与游戏，练习空间想象、逻辑推理和专注力，逐步衔接小学学习。'), goal('calculation', '数感与计算', '100以内计算', '理解数的分解组合及进退位逻辑，掌握100以内加减，联系生活使用。')]
 }
};
export const milestones = [
 { id:'literacy', subject:'chinese', goalId:'literacy', title: '汉字积累', unit: '字', baseline: 20, values: [180, 490, 1000], max: 1000, basis:'累计目标' },
 { id:'poetry', subject:'chinese', goalId:'poetry', title: '古诗积累', unit: '首', baseline: 80, values: [90, 115, 155], max: 155, basis:'累计目标' },
 { id:'vocabulary', subject:'english', goalId:'listening', title: '听力词汇', unit: '词', baseline: 800, values: [1200, 2000, 3000], max: 3000, basis:'累计目标' },
 { id:'listening-hours', subject:'english', goalId:'listening', title: '年度听力投入', unit: '小时', values: [300, 360, 480], max: 480, basis:'各学年投入，不累计' },
 { id:'reading-level', subject:'english', goalId:'listening', title:'读物难度参考', unit:'L', values:[300,500,600], max:600, basis:'计划读物蓝思值，不换算听力能力' },
 { id:'calculation', subject:'math', goalId:'calculation', title:'计算范围', unit:'以内', values:[10,20,100], max:100, basis:'加减法范围，不是完成题数' }
];
export const abilityMetrics = [
 { id:'reading',subject:'chinese',goalId:'reading',title:'阅读与复述',kind:'ability',basis:'三年能力目标' },
 { id:'phonics',subject:'english',goalId:'phonics',title:'拼读与阅读',kind:'ability',basis:'三年能力目标' },
 { id:'speaking',subject:'english',goalId:'speaking',title:'口语表达',kind:'ability',basis:'三年能力目标' },
 { id:'thinking',subject:'math',goalId:'thinking',title:'思维与空间',kind:'ability',basis:'三年能力目标' }
];
export const discrepancies = [
 '英语年度主目标为300小时；原汇总表标题写200h，但四阶段80+45+80+95=300小时，此处采用阶段合计。日均时间是约数，假期听力不等同全部观看动画。',
 '数学总体与下学期段落出现“小班100以内加减法”，与分年目标“小班10以内、中班20以内、大班100以内”冲突；页面按分年目标组织，原说法保留在此。',
 '小班识字原表“上学期60、下学期120”同时带有累计/新增表述。此处按上学期累计60、下学期新增120、年度累计180组织；当前20字作为家长提供的起始基础。',
 '下学期英语正文重复了上学期RAZ D、牛津树L3/L4、小毛人；按该阶段配套素材与汇总表采用RAZ E/F、牛津树L5、皮特猫、蓝色小考拉等，原重复列项不删除。',
 '下学期古诗“新增5首”与四个月“每月1首”不完全一致，保留阶段5首目标，月份不强行均摊。小班字母全年目标与下学期自拼尝试分别标注。',
 '中班/大班只提供年度目标与素材，未给出学期安排，页面不编造月度细表。蓝思值为计划中的读物难度参考，不换算孩子听力词数或能力达标。',
 '小班摩比爱数学全年列10本，上学期配套列5本；七田真与七大能力册数按家长原文保留，尚未核对版本与出版总量，不作为逐册完成分母。'
];
export const materials = [];
function add(id, title, subject, type, grade, level = '', phaseIds = [], note = '') {
 materials.push({ id, title, subject, type, refs: [{ grade, level, phases: phaseIds }], note, source: '家长全年启蒙计划 · 2026-11-18' });
}
function more(id, grade, level, phaseIds = []) { materials.find(x => x.id === id).refs.push({ grade, level, phases: phaseIds }); }
add('little-sheep','小羊上山','chinese','reader','junior','第1—3级',['autumn','spring'],'上学期第1级；下学期第2—3级。'); more('little-sheep','middle','至第7级'); more('little-sheep','senior','至第10级');
add('mobi-reading','摩比分级阅读','chinese','reader','junior','萌芽篇'); more('mobi-reading','middle','飞跃篇'); more('mobi-reading','senior','成长篇');
add('poetry-shelf','古诗小书架','chinese','poem','junior','五年级下、六年级上',['autumn','spring']); more('poetry-shelf','middle','完成课本核心115首');
add('poetry-155','小学生必备古诗词155首','chinese','poem','senior','拓展40首');
add('fiction-cn','适龄虚构故事绘本','chinese','picture','junior','跟读、简单复述',['autumn','winter','spring','summer']); more('fiction-cn','middle','看图复述'); more('fiction-cn','senior','自主复述与拓展');
add('nonfiction-cn','幼儿科普 / 非虚构绘本','chinese','picture','junior','常识积累',['autumn','winter','spring','summer']); more('nonfiction-cn','middle','复述知识点'); more('nonfiction-cn','senior','脱稿介绍知识点');
add('literacy-tools','字卡、磁力贴与生活认读','chinese','tool','junior','配合随文认读',['autumn','spring']);
add('raz','RAZ','english','reader','junior','D、E、F',['autumn','spring'],'上学期D，下学期E/F；分级范围是本计划引用，不表示整套必读。'); more('raz','middle','G、H、I、J'); more('raz','senior','K、L');
add('oxford','牛津树','english','reader','junior','L3、L4、L5',['autumn','spring'],'上学期L3/L4，下学期L5。'); more('oxford','middle','L6、L7、L8'); more('oxford','senior','L9');
add('pearson','培生基础级','english','reader','junior','寒假：基础级第三部分',['winter'],'原文未说明具体出版版本，不等同词汇妙趣屋或基础词汇。');
for (const [id,title,ps] of [['little-critter','小毛人',['autumn']],['elephant-piggie','小猪小象',['winter']],['pete-cat','皮特猫',['spring']],['fly-guy','苍蝇小子',['summer']]]) add(id,title,'english','picture','junior','',ps);
add('little-fox','Little Fox 小狐狸','english','animation','junior','L1—2',['autumn','winter','spring'],'上学期：蝙蝠和朋友、恐龙伙伴；寒假：小鸟和花栗鼠；下学期：彼得兔、太空巡逻队。');
add('duggee','道奇','english','animation','junior','',['summer'],'总目标曾列入绘本，阶段计划按动画使用。');
add('penelope','蓝色小考拉','english','animation','junior','',['spring']);
add('alphabet','26字母认知卡片','english','tool','junior','大小写与常见发音',['autumn','winter','spring','summer']);
add('phonics','自然拼读教材 / 高频词','english','tool','junior','下学期按准备度尝试',['spring','summer'],'原文未指定教材版本，候选由家长自行选择。'); more('phonics','middle','系统学习与解码尝试'); more('phonics','senior','支持简单自主阅读');
for (const [id,title] of [['frog-toad','青蛙和蟾蜍'],['mercy','小猪梅西'],['jones','小侦探琼斯'],['dogman','神探狗狗'],['winnie','女巫温妮'],['nate','大侦探内特'],['amelia','糊涂女佣'],['owl','猫头鹰日记']]) add(id,title,'english','picture','middle');
for (const [id,title] of [['peppa','小猪佩奇'],['rocket-girl','火箭女孩'],['numberblocks','数字积木'],['bluey','布鲁伊']]) add(id,title,'english','animation','middle');
for (const [id,title] of [['robot','威猛机器人'],['press-start','方块兔'],['magic-tree','神奇树屋'],['dragon-masters','驯龙大师']]) add(id,title,'english','picture','senior');
for (const [id,title] of [['journey-west','西游记'],['monster','怪兽学院'],['red-magic','红魔法'],['super-wings','超级飞侠'],['paw-patrol','汪汪队']]) add(id,title,'english','animation','senior');
add('zebra','斑马思维训练6+1','math','workbook','junior','S1 · 原计划7本',['autumn']);
add('mobi-math','摩比爱数学','math','workbook','junior','萌芽篇 · 全年原计划10本',['autumn','winter'],'上学期配套段落列5本，与全年安排分开保留。'); more('mobi-math','middle','探索篇 · 原计划10本'); more('mobi-math','senior','飞跃篇 · 原计划10本');
add('shichida','七田真全脑开发练习册','math','workbook','junior','4—5岁 · 原计划5本',['spring']); more('shichida','middle','5—6岁 · 原计划5本'); more('shichida','senior','幼小衔接 · 原计划5本');
add('seven-skills','七大能力练习册','math','workbook','junior','4—5岁 · 原计划6本',['summer']); more('seven-skills','middle','5—6岁 · 原计划6本');
add('mobi-calculation','摩比爱计算','math','workbook','junior','萌芽篇 · 原计划5本',['autumn','winter','spring','summer'],'下学期段落列3本，全年5本；不据该数量生成单册目录。'); more('mobi-calculation','senior','飞跃篇 · 原计划5本');
add('math-tools','摩比爱教具 / 数学桌游','math','tool','junior','点数、分类、空间、分解组合',['autumn','winter','spring','summer']); more('math-tools','middle','实操与逻辑游戏'); more('math-tools','senior','思维与生活应用');
