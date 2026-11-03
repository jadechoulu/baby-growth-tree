import { getSkillRelations, getBranchGraph } from './graph.mjs';
import { healthStage, stageHealthItems } from './health-model.mjs';

// 本站逐项比较 WS/T 580—2017 附录 B 的动作、支持条件及要求后整理。
// 这些边用于理解能力进阶，不是标准声明的必过前置条件，也不用于锁定或推断观察记录。
const id = number => `wst580-${String(number).padStart(3, '0')}`;
const chain = (label, numbers, reasons) => numbers.slice(1).map((number, index) => ({
  from: id(numbers[index]), to: id(number), label, reason: reasons[index],
  basis: 'WS/T 580—2017 附录B；本站整理',
}));

export const HEALTH_PROGRESSION = Object.freeze([
  ...chain('拉坐控头', [1, 11, 40], ['从扶双肩拉坐后头竖直2秒，到拉双腕坐起后头竖直5秒，减少近端支持并延长控头。', '同为拉腕坐起，由坐起后保持头竖直，进阶到主动用力、整个拉坐过程中无头后滞。']),
  ...chain('俯卧抬头', [2, 12, 22, 31], ['从头部翘动到自行抬离床面并保持2秒。', '从抬离床面到抬头45°并保持5秒。', '俯卧抬头角度从45°增加到90°，均要求保持5秒。']),
  ...chain('坐位平衡', [41, 60, 69], ['从头身前倾独坐5秒，到背直、无手支撑独坐1分钟。', '在无需手支撑独坐的基础上，增加转身取物及侧推后回正。']),
  ...chain('站立', [68, 94, 103], ['从双手扶物支撑，到不扶物独站2秒。', '独站保持时间由2秒增加到10秒。']),
  ...chain('行走', [77, 104, 112], ['由拉双手行走到只牵一手行走，减少外部支持。', '由牵一手行走到独立控制步速、平稳行走。']),
  ...chain('行走到上楼', [112, 129], ['由平地独走发展到扶扶手上三阶以上楼梯，增加高度变化及逐阶重心转移；毛老师版独走到双脚上下楼仅作辅助，本表这里只连接上楼，不包含下楼或并步要求。']),
  ...chain('上楼梯', [129, 146, 183], ['同为上三阶以上台阶，由扶扶手改为不扶扶手、稳定上楼。', '在不扶扶手上楼的基础上，增加双足交替、一步一台阶的要求。']),
  ...chain('站立到单脚平衡', [103, 156], ['同为不扶物保持站立平衡，由双足支撑发展到单足支撑；双足10秒与单足2秒不能直接按时长比较，也不把中间月龄的行走或下蹲规定为必经任务。']),
  ...chain('单脚站立', [156, 193, 203], ['不扶物单脚站立由2秒提高到5秒，并要求身体稳定。', '稳定单脚站立时间由5秒提高到10秒。']),
  ...chain('双足跳跃', [138, 165], ['从双足原地同时跳起、落地，增加向前跃过纸张且不踩纸的要求。']),
  ...chain('原地跳到台阶跳下', [138, 184], ['由双足同时离地、同时落地，发展到从楼梯末级并足跳下，增加落差及落地两脚间距小于10厘米的控制；毛老师版原地跳到跳下仅作辅助，不要求先通过立定跳远。']),
  ...chain('台阶跳下', [184, 194], ['同为并足从楼梯末级跳下，落地两脚间距由小于10厘米收紧到5厘米，并要求站稳。']),
  ...chain('单脚跳跃', [213, 232], ['同为单脚连续跳3次，后者增加抱肘、基本原地跳动的要求。']),
  ...chain('拍球', [233, 243], ['连续拍球数量由2个提高到5个。']),
  ...chain('踢带绳的球', [242, 252], ['同用足内踝踢带绳的球，由连续2个提高到3个，并规定踢一下落地一下。']),
  ...chain('踩踏板', [214, 253], ['由同一只脚完成3组，改为两脚交替完成3组。']),
  ...chain('留握花铃棒', [13, 23], ['留握由2秒提高到30秒，后者同时要求不借助床面支持。']),
  ...chain('花铃棒操作', [23, 32], ['同为手持花铃棒，由持续留握增加到在抱坐位注视并主动摇动；保留姿势和动作条件差异。']),
  ...chain('主动抓物', [33, 42], ['从抬臂或尝试抓取，到实际用一手或双手抓住近处玩具。']),
  ...chain('取积木', [52, 62, 71], ['由主动取一块积木，到一手保留第一块、另一手再取第二块。', '保持已取到的两块积木，再增加尝试取第三块的意图；后项不要求实际取到第三块。']),
  ...chain('全掌抓到小物耙取', [52, 61], ['同为抱坐桌前主动抓取，由伸手抓到积木发展到把较小的小丸耙入掌中；后项仍是所有手指弯曲后全掌抓到，不改写成四指捏或指尖捏。']),
  ...chain('笔道控制', [105, 113, 121, 148], ['由示范后留下笔道，到拿到纸笔后自行乱画。', '由自行乱画，到按示范画道并能控制起止，方向仍不限。', '在模仿画道并能控制起止的基础上，增加竖直方向、长度和角度的要求。']),
  ...chain('笔道到交叉线', [121, 175], ['由模仿单条笔道并控制起止，发展到模仿两条较连续的直线相交成角；不把要求特定方向及角度的模仿竖线排作必经中间项。']),
  ...chain('闭合圆', [121, 166], ['由模仿开放笔道，到模仿首尾相交且无明显角的闭合圆；毛老师版画线、弧线到闭合圆的关系仅作辅助参考。']),
  ...chain('圆形组合', [166, 235], ['后项组合图明确包含圆形，将模仿单一闭合圆扩展到看图临摹圆形与方形的组合；不是正式施测门槛。']),
  ...chain('方形组合', [195, 235], ['后项组合图明确包含正方形，将模仿单一方形扩展到看图临摹方形与圆形的组合；不是两项必须先勾选的门槛。']),
  ...chain('捏取小丸', [61, 70, 79, 88], ['由全掌耙抓到拇指与其他手指捏取。', '由拇指与其他手指捏取，到拇指、食指对捏。', '在拇食指对捏基础上，增加指端协调、熟练且迅速的要求。']),
  ...chain('穿扣眼', [130, 139, 157], ['由线穿过扣眼0.5厘米，增加穿过后把线拉出的步骤。', '由穿过一个扣眼并拉线，到较熟练连续穿扣并拉线3个以上。']),
  ...chain('拉锁组装', [149, 167], ['由锁头部分或全部插入锁孔，到全部插入并有拉动意识。']),
  ...chain('螺丝组装', [176, 196], ['由螺丝与螺母组装，增加看图、平垫及按顺序组装的要求。']),
  ...chain('剪纸', [186, 216, 225], ['由剪直线过渡到剪大致圆形，增加沿曲线控制剪刀的练习。', '由允许出角的大致圆形，收紧为无成角、无毛边的平滑圆形。']),
  ...chain('打活结', [245, 255], ['同为用活结捆筷子，由示范后完成改为无需示范完成。']),
  ...chain('追视红球', [6, 26], ['同一红球追视任务，由转过中线增加到眼和头跟随转动180°。']),
  ...chain('双手积木操作', [53, 81], ['由一手一块保留两块积木，到将双手合到中线互敲，增加双手协调动作；不要求必须先独立取得积木。']),
  ...chain('积木搭高', [122, 132, 168], ['同为积木搭高、三试一成，数量由4块提高到7～8块。', '同为积木搭高、三试一成，数量由7～8块提高到10块。']),
  ...chain('圆积木入型板', [123, 141], ['同为圆积木一次放入圆孔，后者增加型板倒转后的方位变化。']),
  ...chain('单形到多形匹配', [123, 151], ['同为不示范、正放型板的找家任务，由单一圆块扩大到包含圆、方和三角的三块；后项三角方向预先对齐且允许提示，不把倒放圆块规定为中间必经任务。']),
  ...chain('多形状型板', [151, 160], ['同为多形状积木一次放入相应孔内，后者增加型板翻转条件。']),
  ...chain('翻书', [115, 140], ['由翻书两次，到每次捻一页、连续三页以上。']),
  ...chain('颜色命名', [178, 188], ['同为四种颜色卡的口头命名，答对数量由至少两种提高到四种。']),
  ...chain('积木数量', [177, 187], ['同为回答眼前积木的准确数量，由3块增加到5块。']),
  ...chain('找不同', [197, 217, 236], ['同一类找不同任务，命中数由3处提高到5处。', '同一类找不同任务，命中数由5处提高到7处。']),
  ...chain('图画补缺', [198, 208, 218], ['同为六幅图，正确补缺由3幅提高到4幅。', '同为六幅图，正确补缺由4幅提高到5幅。']),
  ...chain('有意义字词', [99, 118, 125], ['由有意识、正确发出一个字音，到说3～5个字；后项不计爸妈，保留此口径差异。', '同不计爸妈，有意义字词数量由3～5个提高到10个以上。']),
  ...chain('铜铃声音反应', [8, 18], ['相同铜铃、位置及双侧操作，由任一种听声反应增加到表情和肢体动作的变化。']),
  ...chain('句子复述', [152, 199], ['由复述7字以上句子，增加复合句的结构要求；不把字数直接等同语法能力。']),
  ...chain('图片命名', [161, 179], ['使用同一图片命名清单，正确数量由10样提高到14样。']),
  ...chain('图画叙述', [238, 248], ['由分别描述各张图画的基本内容，增加理解并归纳故事主题的要求。']),
  ...chain('镜中互动', [38, 47], ['由注视镜中人像，发展到对镜像出现表情或肢体游戏反应。']),
  ...chain('独立穿衣', [110, 191], ['由穿衣时伸手伸腿配合，到无需帮助穿上衣并扣好扣子或拉好拉锁。']),
].map(edge => Object.freeze(edge)));

// 关系追踪使用毛老师版同一模型；只把已核对的显式边提供给模型。
export function healthGraphCatalog(items, edges = HEALTH_PROGRESSION) {
  return items.map(item => ({ ...item, stage: healthStage(item.month).id,
    parents: edges.filter(edge => edge.to === item.id).map(edge => edge.from) }));
}
export function healthProgressionContext(focus, edges = HEALTH_PROGRESSION) {
  const ids = [...new Set([focus, ...edges.flatMap(edge => [edge.from, edge.to])])];
  const catalog = ids.map(id => ({ id, parents: edges.filter(edge => edge.to === id).map(edge => edge.from) }));
  const relation = getSkillRelations(catalog, focus);
  const included = new Set(relation.nodes.map(item => item.id));
  return { before: new Set(relation.ancestors.map(item => item.id)), after: new Set(relation.descendants.map(item => item.id)),
    supporting: new Set(relation.supporting.map(item => item.id)), ids: included,
    edges: edges.filter(edge => included.has(edge.from) && included.has(edge.to)) };
}
export function healthGraph(items, { domain, stage, focus, mode = 'lineage' }) {
  const catalog = healthGraphCatalog(items);
  const relation = focus ? getSkillRelations(catalog, focus) : null;
  let graph;
  if (stage) {
    const seeds = stageHealthItems(catalog, stage).filter(item => item.domain === domain);
    // 宝宝视角保留本阶段、全部后续及它们的其他分支前序，与毛老师版一致。
    const included = new Set(seeds.flatMap(item => getSkillRelations(catalog, item.id).nodes.map(value => value.id)));
    if (relation) relation.nodes.forEach(item => included.add(item.id));
    const nodes = catalog.filter(item => included.has(item.id));
    graph = { nodes, edges: nodes.flatMap(item => item.parents.filter(id => included.has(id)).map(id => ({ from: id, to: item.id, kind: 'neutral' }))), stageIds: seeds.map(item => item.id) };
  } else if (relation && mode === 'lineage') graph = { nodes: relation.nodes, edges: relation.edges };
  else graph = getBranchGraph(catalog, domain);
  const kinds = new Map(relation?.edges.map(edge => [edge.from + ':' + edge.to, edge.kind]) || []);
  graph.edges = graph.edges.map(edge => ({ ...edge, kind: kinds.get(edge.from + ':' + edge.to) || 'neutral' }));
  return { ...graph, catalog, relation };
}
