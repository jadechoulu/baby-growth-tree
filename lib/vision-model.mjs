// 个人检查事实与公共参考资料分开；全部视图只投影同一份检查记录。
export const emptyVision = () => ({ version: 1, kind: 'vision', records: {} });
export const EYES = [['right', '右眼 R'], ['left', '左眼 L']];
export const METHODS = { yes: '已散瞳', no: '未散瞳', unknown: '未注明' };
export const METRICS = {
  acuity: { label: '裸眼视力（看视力表）', unit: '小数', min: 0, max: 1.2 },
  se: { label: '远视储备／等效球镜 SE', unit: 'D', min: -1, max: 4 },
  sphere: { label: '近视／远视度数（球镜 S）', unit: '度', min: -100, max: 400 },
  axialLength: { label: '眼轴长度', unit: 'mm', min: 20, max: 26 },
  correctedAcuity: { label: '戴镜视力', unit: '小数', min: 0, max: 1.5 },
  tellerReference: { label: '婴幼儿视力参考（Teller卡）', unit: 'cycles/degree', min: 0, max: 30, referenceOnly: true },
};
export const NHC_URL = 'https://www.gov.cn/zhengce/zhengceku/202406/content_6957665.htm';
export const STANDARD_URL = 'https://www.cqcdc.org/index.php?a=shows&catid=15&id=5214';
export const TELLER_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12069961/';
export const RESEARCH_URL = 'https://www.myopiaprofile.com/articles/growth-curves-to-clinically-monitor-refractive-development-in-chinese-schoolchildren';
export const SOURCE_SITES = [
  { title: '儿童青少年裸眼视力和屈光状态评价规范', publisher: 'WS/T 10039—2025 · 重庆市疾控中心解读', note: '2026年3月实施，3～18岁裸眼视力界值及散瞳远视储备推荐下限；不是百分位。', url: STANDARD_URL },
  { title: '婴幼儿 Teller 视力卡年龄参考', publisher: 'Neijzen等 · Acta Ophthalmologica · 2025', note: '表A1：1～36月龄单眼TAC II视力95%预测区间，单位cycles/degree；不等同普通视力表。', url: TELLER_URL },
  { title: '近视防治指南（2024年版）', publisher: '国家卫生健康委 · 中国政府网', note: '查看指南全文、检查方法与年龄参考。', url: NHC_URL },
  { title: '中国儿童屈光与眼轴生长研究', publisher: 'Myopia Profile · 研究解读', note: '查看中国儿童眼轴参考数据及适用人群。', url: RESEARCH_URL },
  { title: '如何使用眼轴生长图', publisher: 'Myopia Profile · 使用说明', note: '了解如何阅读长期趋势和参考曲线。', url: 'https://www.myopiaprofile.com/articles/how-to-use-axial-length-growth-charts' },
];
export const KNOWLEDGE = [
  ['检查怎么记', '同次检查保留左右眼、检查日期、是否散瞳、视力表记录法和检查机构；球镜 S、柱镜 C、轴位 A 逐项照录。空白表示未测，不等于0。'],
  ['屈光度与视力是不同指标', '屈光度用 D 表示；等效球镜 SE = 球镜 S + 柱镜 C / 2。柱镜正负号按报告保留。裸眼／戴镜视力与近视度数不能直接换算，视力5.0不代表0度。'],
  ['远视储备的参考条件', '准确评估远视储备需要充分睫状肌麻痹后验光。2024年指南介绍：新生儿约+2.50～+3.00D，6岁学龄儿童平均+1.38D，15岁约+0.31D。这些是群体参考，不是每个孩子必须达到的目标；未散瞳结果单独展示。'],
  ['视力年龄参考与远视储备分开看', '普通裸眼视力看视力表；WS/T 10039—2025规定3岁≤4.7、4～6岁≤4.8、7～18岁≤4.9为异常界值，图中按小数记录法换算。远视储备看散瞳等效球镜，是另一指标。2024指南的参考下限保留在原文，主图采用较新标准界值，不把两套口径混为百分位。'],
  ['婴幼儿视力参考图', 'Neijzen等2025年研究表A1给出单眼Teller卡1～36月龄的95%预测上下限。它测条栅视力，使用cycles/degree，不是普通视力表小数值，也不是远视储备。图中只连接原表点并填充区间，不生成P50/P75。普通视力表个人记录不叠加到这张参考图。'],
  ['长期跟进', '从新生儿期定期接受眼保健及视力检查，24月龄开始屈光筛查。可长期记录视力、屈光度、眼轴及检查备注；指南对近视儿童建议至少每半年复查，随访安排以医生意见为准。'],
  ['日常用眼', '2024年指南提倡学龄前开始每天至少2小时户外活动；避免长时间持续近距离用眼，保持良好读写距离、姿势和照明。记录和群体参考用于复查沟通，不自动作诊断、预测或用药建议。'],
];
export const TEMPLATE_IMAGES = [
  { file: 'record-template.png', title: '检查记录表模板', note: '示例行仅展示字段和记录法，不导入个人档案。' },
  { file: 'acuity-chart.png', title: '视力表与记录法示意', note: '仅供了解小数与五分记录法；不能直接用于屏幕测视力。' },
  { file: 'refraction-centiles.png', title: '6～15岁屈光度百分位示意', note: '用户提供的参考原图；原研究、样本人群和精确数值未核定，不据图生成个人百分位。' },
  { file: 'reserve-reference.png', title: '年龄与生理屈光度示意', note: '保留原图知识；图片出处未注明，与指南平均值口径分开，不作为诊断阈值。' },
];
export function ageYears(birthDate, date) {
  const birth = Date.parse(birthDate + 'T00:00:00Z'), visit = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(birth) && Number.isFinite(visit) && visit >= birth ? (visit - birth) / (365.2425 * 86400000) : null;
}
export function equivalentSphere(eye) {
  return Number.isFinite(eye?.sphere) && Number.isFinite(eye?.cylinder) ? Math.round((eye.sphere + eye.cylinder / 2) * 1000) / 1000 : null;
}
export function acuityDecimal(value, notation) {
  return notation === 'logarithmic' ? Math.pow(10, value - 5) : value;
}
export function acuityLabel(value, notation = 'decimal') {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return notation === 'logarithmic' ? (5 + Math.log10(value)).toFixed(1) : Number(value.toFixed(3)).toString();
}
export function signed(value, digits = 2) { return Number.isFinite(value) ? (value > 0 ? '+' : '') + value.toFixed(digits) : '—'; }
export function visits(snapshot, deleted = false) {
  return Object.entries(snapshot?.records || {}).filter(([, visit]) => Boolean(visit.deleted) === deleted)
    .map(([id, visit]) => ({ ...visit, id })).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export function metricValue(eye, metric) {
  if (metric === 'se') return equivalentSphere(eye);
  if (metric === 'sphere') return Number.isFinite(eye?.sphere) ? eye.sphere * 100 : null;
  return eye?.[metric];
}
export function points(snapshot, birthDate, metric) {
  return visits(snapshot).reverse().flatMap(visit => {
    const age = ageYears(birthDate, visit.date);
    return EYES.flatMap(([eye]) => {
      const value = metricValue(visit[eye], metric);
      return age === null || !Number.isFinite(value) ? [] : [{ id: visit.id, date: visit.date, age, value, eye, method: visit.cycloplegia }];
    });
  });
}
// WS/T 10039—2025的年龄组为周岁，不在组间插值，也不外推到3岁以下。
// Teller表A1原始上下限为95%预测区间，不能标成百分位或普通视力表视力。
const TELLER_MONOCULAR = [
  [1,.353,1.351],[1.169,.414,1.587],[1.366,.485,1.864],[1.596,.568,2.191],
  [1.865,.666,2.576],[2.179,.781,3.032],[2.547,.917,3.572],[2.976,1.078,4.212],
  [3.478,1.269,4.973],[4.064,1.496,5.881],[4.750,1.767,6.967],[5.550,2.090,8.268],
  [6.486,2.473,9.812],[7.580,2.891,11.506],[8.858,3.292,13.144],[10.351,3.600,14.416],
  [12.096,3.749,15.061],[14.135,3.795,15.293],[16.519,3.839,15.516],[19.304,3.988,16.170],
  [22.558,4.347,17.679],[26.362,4.937,20.143],[30.806,5.765,23.592],[36,6.824,28.015],
];
export function references(metric, sex = 'none') {
  if (metric === 'tellerReference') return [1, 2].map((column, index) => ({
    label: `TAC II 单眼95%预测${index ? '上' : '下'}限`, kind: 'segment', band: 'teller',
    values: TELLER_MONOCULAR.map(row => [row[0] / 12, row[column]]), source: TELLER_URL,
  }));
  if (metric === 'se') {
    const limits = [[3,6,2.05],[6,7,1.72],[7,8,1.48],[8,9,1.19],[9,10,1.11],[10,11,.92],[11,12,.83],[12,13,.75],[13,14,.27],[14,15,.09]];
    return [
      ...limits.map(([from,to,value]) => ({ ageLabel: from === 3 ? '3～5周岁' : from + '周岁', label: '远视储备推荐下限（散瞳）', kind: 'segment', values: [[from,value],[to,value]], endExclusive: true, source: STANDARD_URL })),
      { label: '2024指南群体平均（散瞳）', kind: 'dots', values: [[6,1.38],[15,.31]], source: NHC_URL },
    ];
  }
  if (metric === 'acuity') return [[3,4,4.7],[4,7,4.8],[7,19,4.9]].map(([from,to,value]) => ({
    ageLabel: from === 3 ? '3周岁' : from === 4 ? '4～6周岁' : '7～18周岁', label: '裸眼视力异常界值', kind: 'segment', values: [[from,acuityDecimal(value,'logarithmic')],[to,acuityDecimal(value,'logarithmic')]],
    endExclusive: true, source: STANDARD_URL,
  }));
  if (metric !== 'axialLength' || !['female', 'male'].includes(sex)) return [];
  // Sanz Diez et al. 2019；Myopia Profile核读表中的中国儿童数值，只连接6/9/15岁已公布点。
  const data = sex === 'female' ? [[22.03, 23.16, 23.83], [22.54, 23.72, 24.37], [23.04, 24.31, 25.20]]
    : [[22.55, 23.70, 24.39], [22.99, 24.32, 25.01], [23.50, 24.89, 25.80]];
  return data.map((values, index) => ({ label: `中国${sex === 'female' ? '女孩' : '男孩'} P${[25, 50, 75][index]}`, kind: 'segment', values: [6, 9, 15].map((age, i) => [age, values[i]]), source: RESEARCH_URL }));
}
export function comparison(snapshot, eye, metric) {
  const history = visits(snapshot).filter(visit => Number.isFinite(metricValue(visit[eye], metric)));
  if (history.length < 2) return null;
  const current = history[0], previous = history.find(visit => visit.date < current.date && (!['se', 'sphere'].includes(metric) || (current.cycloplegia !== 'unknown' && visit.cycloplegia === current.cycloplegia)));
  if (!previous) return null;
  const value = visit => metricValue(visit[eye], metric);
  return { delta: value(current) - value(previous), days: Math.round((Date.parse(current.date) - Date.parse(previous.date)) / 86400000) };
}
// 仅裁剪已有参考线段到视口；不在原始年龄范围之外外推。
export function referenceWindow(reference, bounds) {
  if (reference.endExclusive && bounds[0] >= reference.values.at(-1)[0]) return [];
  if (reference.kind !== 'segment') return reference.values.filter(([age]) => age >= bounds[0] && age <= bounds[1]);
  const result = [];
  for (let i = 1; i < reference.values.length; i++) {
    const a = reference.values[i - 1], b = reference.values[i], lo = Math.max(a[0], bounds[0]), hi = Math.min(b[0], bounds[1]);
    if (lo > hi) continue;
    for (const age of [lo, hi]) if (result.at(-1)?.[0] !== age) result.push([age, a[1] + (b[1] - a[1]) * (age - a[0]) / (b[0] - a[0])]);
  }
  return result;
}

export function referenceNote(metric) {
  if (metric === 'se') return '分段线为WS/T 10039—2025散瞳远视储备推荐下限（3～14周岁），灰点为2024指南群体平均；两者口径不同，都不是百分位。1～2岁暂无本次核定的年龄标准，不用新生儿数值外推。';
  if (metric === 'acuity') return '分段线为WS/T 10039—2025裸眼视力异常界值：3岁≤4.7、4～6岁≤4.8、7～18岁≤4.9，按小数换算。不是平均值或百分位；3岁以下可切换“婴幼儿视力参考（Teller卡）”。';
  if (metric === 'tellerReference') return '阴影为Neijzen等（2025）表A1的单眼TAC II视力95%预测区间，1～36月龄，测试使用遮蔽台。仅连接原表点；不是P50/P75。只展示参考，不叠加普通视力表记录，不换算远视储备。';
  if (metric === 'sphere') return '球镜度数：近视100度记−1.00D（图上−100度），远视100度记+1.00D（图上+100度）。散光另填柱镜C；远视储备参考请切换等效球镜SE，不把SE界值套到球镜。';
  if (metric === 'correctedAcuity') return '戴镜视力与裸眼视力分别记录；本图不套用裸眼视力异常界值。';
  return '眼轴P25/P50/P75仅连接中国儿童研究公布的6、9、15岁数值，先选择参考人群；不外推至6岁以下，不推算个人百分位。';
}
