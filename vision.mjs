import { emptyVision, EYES, METHODS, METRICS, KNOWLEDGE, TEMPLATE_IMAGES, SOURCE_SITES, NHC_URL, RESEARCH_URL, visits, points, references, referenceWindow, referenceNote, comparison, ageYears, equivalentSphere, acuityDecimal, acuityLabel, signed } from './lib/vision-model.mjs';
import { localDateString } from './lib/model.mjs';

const M = window.XiaoyaSyncModel;
const profile = window.XiaoyaBabyProfile.createClient();
const state = { view: new URLSearchParams(location.hash.slice(1)).get('view') === 'chart' ? 'chart' : 'table', metric: Number.isFinite(ageYears(profile.get().birthDate, localDateString())) && ageYears(profile.get().birthDate, localDateString()) < 3 ? 'tellerReference' : 'acuity', sex: 'none', range: 'young', eye: 'both', notation: 'decimal', reference: true, date: '' };
let store, sync, shell, snapshot = null, writing = false, dialog = null, errorMessage = '', notice = '';
const n = (tag, cls = '', text) => { const el = document.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el; };
const button = (label, action, cls = 'vision-button') => { const el = n('button', cls, label); el.type = 'button'; el.addEventListener('click', action); return el; };
const icon = (name, label, action) => { const el = button('', action, 'icon-button'); el.title = label; el.setAttribute('aria-label', label); el.append(window.XiaoyaSite.icon(name)); return el; };
const link = (title, href) => { const el = n('a', '', title); el.href = href; el.target = '_blank'; el.rel = 'noopener'; return el; };
function picker(label, options, value, change) {
  const el = n('select'); el.setAttribute('aria-label', label);
  for (const [key, text] of options) { const option = n('option', '', text); option.value = key; el.append(option); }
  el.value = value; el.addEventListener('change', () => change(el.value)); return el;
}
function navigate(id) {
  if (id === 'knowledge') { openKnowledge(); return; }
  if (id === 'backup') { openBackup(); return; }
  if (id === 'profile') { openProfile(); return; }
  state.view = id; render();
}
function render() {
  const focusLabel = document.activeElement?.getAttribute('aria-label');
  if (!shell) { shell = window.XiaoyaSite.createShell({ sectionId: 'growth', siteRoot: './', onNavigate: navigate }); document.querySelector('#app').replaceChildren(shell.element); }
  shell.update({ title: '视力档案', activeId: state.view, navigation: [
    { title: '视力 · 独立档案', items: [{ id: 'table', label: '检查记录', icon: 'source', shortcut: true }, { id: 'chart', label: '变化趋势', icon: 'tree', shortcut: true }, { id: 'knowledge', label: '参考资料', icon: 'book', shortcut: true }] },
    { title: '资料与保存', items: [{ id: 'profile', label: '宝宝资料', icon: 'baby' }, { id: 'backup', label: '视力记录与备份', icon: 'settings' }] },
  ] });
  shell.actions.replaceChildren(window.XiaoyaGrowthVersions.create('vision'), icon('source', '视力资料与网站入口', openKnowledge));
  const actions = n('div'); actions.append(sync.createButton(), button('宝宝资料', openProfile), button('视力记录与备份', openBackup));
  shell.globalActions.replaceChildren(window.XiaoyaSite.createActionMenu(actions));
  const main = n('div', 'vision-content');
  const heading = n('header', 'vision-heading'), copy = n('div'); copy.append(n('p', 'vision-eyebrow', '一双眼睛，慢慢长大'), n('h1', '', '视力档案'));
  const add = button('＋ 记一次检查', () => editVisit(), 'vision-primary'); add.disabled = writing; heading.append(copy, add); main.append(heading);
  const all = visits(snapshot), latest = all[0];
  const status = n('p', 'vision-notice', errorMessage || notice); status.setAttribute('role', 'status'); status.dataset.error = Boolean(errorMessage); status.hidden = !status.textContent; main.append(status);
  const summary = n('div', 'vision-summary'); summary.append(summaryItem('检查记录', `${all.length} 次`), summaryItem('最近检查', latest?.date || '尚未记录'));
  main.append(summary);
  const toolbar = n('div', 'vision-toolbar'), switcher = n('div', 'vision-view-switch'); switcher.setAttribute('role', 'group'); switcher.setAttribute('aria-label', '记录展示方式');
  for (const [key, label] of [['table', '记录表'], ['chart', '趋势图']]) { const b = button(label, () => { state.view = key; render(); }); b.setAttribute('aria-pressed', state.view === key); switcher.append(b); }
  toolbar.append(switcher);
  toolbar.append(icon('source', '导入导出与已删除记录', openBackup), icon('info', '视力指标与参考说明', openKnowledge));
  main.append(toolbar);
  if (state.view === 'table') main.append(recordTable()); else main.append(chartView());
  const footer = n('p', 'vision-help', '检查数据保存在独立视力档案中；设置内连接私人同步后可跨设备保存。参考资料可随时查看，不自动生成检查或诊断。'); main.append(footer);
  shell.content.replaceChildren(main);
  history.replaceState(null, '', '#view=' + state.view);
  if (focusLabel) [...main.querySelectorAll('[aria-label]')].find(el => el.getAttribute('aria-label') === focusLabel)?.focus({ preventScroll: true });
}
function summaryItem(label, value, extra = '') { const el = n('div'); el.append(n('span', '', label), n('strong', '', value)); if (extra) el.append(n('small', '', extra)); return el; }
function recordTable() {
  const section = n('section', 'vision-panel'); section.setAttribute('aria-label', '视力检查记录表');
  const bar = n('div', 'vision-panel-bar'); bar.append(n('h2', '', '每一次检查，都留在这里'), picker('视力显示记录法', [['decimal', '小数记录法'], ['logarithmic', '五分记录法']], state.notation, value => { state.notation = value; render(); })); section.append(bar);
  const dates = n('div', 'vision-date-filter'), date = n('input'); date.type = 'date'; date.max = localDateString(); date.value = state.date; date.setAttribute('aria-label', '按检查日期查询'); date.addEventListener('change', () => { state.date = date.value; render(); });
  const add = button('＋ 新增', () => editVisit()); add.setAttribute('aria-label', '新增视力检查'); add.disabled = writing;
  dates.append(date, icon('refresh', '显示全部日期', () => { state.date = ''; render(); }), add); section.append(dates);
  const items = visits(snapshot).filter(visit => !state.date || visit.date === state.date);
  if (!items.length) { section.append(emptyState(state.date ? '当天没有检查记录' : '还没有检查记录', state.date ? '记录当天检查，或清除日期查看全部记录。' : '按医院报告填写数值，开始记录每次检查。')); return section; }
  const scroll = n('div', 'vision-table-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', '检查明细，可横向滚动查看左右眼全部指标');
  const table = n('table', 'vision-table'); table.append(n('caption', 'vision-sr-only', '左右眼检查数据；屈光度单位D，眼轴单位mm，空白显示为未测。'));
  const head = n('thead'), header = n('tr');
  for (const text of ['检查日期／年龄', '眼别', '裸眼视力', '戴镜视力', '球镜 S / D', '柱镜 C / D', '轴位 / °', '等效球镜 / D', '眼轴 / mm', '检查信息']) { const th = n('th', '', text); th.scope = 'col'; header.append(th); } head.append(header); table.append(head);
  const body = n('tbody');
  for (const visit of items) for (const [index, [eye, label]] of EYES.entries()) {
    const row = n('tr'); row.dataset.eye = eye;
    if (!index) {
      const cell = n('td'); cell.rowSpan = 2;
      const age = ageYears(profile.get().birthDate, visit.date), actions = n('div', 'vision-record-actions');
      const edit = button('编辑', () => editVisit(visit.id), 'vision-date-link'); edit.setAttribute('aria-label', '编辑检查 ' + visit.date);
      const remove = button('删除', async () => {
        remove.disabled = true;
        await removeVisit(visit.id); render();
      }, 'vision-record-delete'); remove.setAttribute('aria-label', '删除检查 ' + visit.date); remove.disabled = writing;
      actions.append(edit, remove); cell.append(n('strong', 'vision-record-date', visit.date), n('small', '', age === null ? '年龄未设置' : `${age.toFixed(2)}岁`), actions); row.append(cell);
    }
    row.append(n('th', 'vision-eye', label));
    const data = visit[eye];
    for (const value of [acuityLabel(data.acuity, state.notation), acuityLabel(data.correctedAcuity, state.notation), signed(data.sphere), signed(data.cylinder), data.axis ?? '—', signed(equivalentSphere(data)), Number.isFinite(data.axialLength) ? data.axialLength.toFixed(2) : '—']) row.append(n('td', '', value));
    if (!index) { const cell = n('td', 'vision-table-meta'); cell.rowSpan = 2; cell.append(n('span', '', METHODS[visit.cycloplegia]), n('small', '', visit.institution || '机构未填')); if (visit.correction) cell.append(n('small', '', visit.correction)); if (visit.note) cell.append(n('small', '', visit.note)); row.append(cell); }
    body.append(row);
  }
  table.append(body); scroll.append(table); section.append(scroll, n('p', 'vision-help', '删除的检查可在“导入导出与已删除记录”中恢复。— 表示未测／未填；SE仅在球镜和柱镜均已填写时计算。')); return section;
}
function emptyState(title, text) {
  const el = n('div', 'vision-empty'), add = button('', () => editVisit(), 'vision-empty-add');
  add.setAttribute('aria-label', state.date ? '记录 ' + state.date + ' 的视力检查' : '记录第一次视力检查'); add.disabled = writing;
  const plus = n('span', 'vision-empty-plus', '＋'); plus.setAttribute('aria-hidden', 'true');
  add.append(plus, n('span', '', '新增检查')); el.append(add, n('h3', '', title), n('p', '', text)); return el;
}
function chartView() {
  const section = n('section', 'vision-panel'), controls = n('div', 'vision-chart-controls');
  controls.append(picker('趋势指标', Object.entries(METRICS).map(([key, item]) => [key, item.label + ' · ' + item.unit]), state.metric, value => { state.metric = value; render(); }),
    ...(!METRICS[state.metric].referenceOnly ? [picker('显示眼别', [['both', '双眼'], ...EYES], state.eye, value => { state.eye = value; render(); })] : []),
    picker('年龄范围', [['all', '全部年龄'], ['young', '0～6岁'], ['school', '6～15岁']], state.range, value => { state.range = value; render(); }));
  if (state.metric === 'axialLength') controls.append(picker('眼轴参考人群', [['none', '选择参考人群'], ['female', '中国女孩 · 6～15岁'], ['male', '中国男孩 · 6～15岁']], state.sex, value => { state.sex = value; render(); }));
  const refLabel = n('label', 'vision-check-label'), ref = n('input'); ref.type = 'checkbox'; ref.checked = state.reference; ref.addEventListener('change', () => { state.reference = ref.checked; render(); }); refLabel.append(ref, document.createTextNode('参考')); controls.append(refLabel); section.append(controls);
  const chartActions = n('div', 'vision-chart-actions'), add = button('＋ 新增检查', () => editVisit()); add.disabled = writing;
  chartActions.append(n('span', '', '点击点位查看数值'), add); section.append(chartActions);
  const metric = METRICS[state.metric], all = points(snapshot, profile.get().birthDate, state.metric).filter(p => state.eye === 'both' || state.eye === p.eye);
  const bounds = state.range === 'young' ? [0, 6] : state.range === 'school' ? [6, 15] : [Math.min(0, ...all.map(p => Math.floor(p.age))), Math.max(16, ...all.map(p => Math.ceil(p.age)))];
  const visible = all.filter(p => p.age >= bounds[0] && p.age <= bounds[1]);
  const refs = state.reference ? references(state.metric, state.sex) : [];
  const activeRefs = refs.filter(r => referenceWindow(r, bounds).length);
  const refValues = activeRefs.flatMap(r => referenceWindow(r, bounds).map(([, v]) => v));
  const min = Math.floor(Math.min(metric.min, ...visible.map(p => p.value), ...refValues) * 2) / 2, max = Math.ceil(Math.max(metric.max, ...visible.map(p => p.value), ...refValues) * 2) / 2;
  const graph = n('div', 'vision-chart-scroll'), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 840 380'); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', `${metric.label}随年龄变化；${metric.referenceOnly ? '阴影为研究95%预测区间，仅供参考。' : '右眼蓝色圆点，左眼橙色方点。'}点击点位查看详情。`);
  const detail = n('div', 'vision-point-detail'); detail.hidden = true; detail.setAttribute('aria-live', 'polite');
  let selectedPoint = null;
  const showDetail = (title, content, trigger) => {
    selectedPoint?.classList.remove('is-selected'); selectedPoint?.setAttribute('aria-pressed', 'false');
    selectedPoint = trigger; trigger?.classList.add('is-selected'); trigger?.setAttribute('aria-pressed', 'true');
    const close = icon('close', '关闭点位详情', () => { detail.hidden = true; trigger?.classList.remove('is-selected'); trigger?.setAttribute('aria-pressed', 'false'); trigger?.focus(); });
    const head = n('div', 'vision-point-heading'); head.append(n('strong', '', title), close); detail.replaceChildren(head, ...content); detail.hidden = false; detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const ageLabel = age => `${Number((age * (age < 3 ? 12 : 1)).toFixed(3))}${age < 3 ? '月龄' : '岁'}`;
  const showReference = (reference, age, value, trigger) => {
    const content = [n('p', '', `${reference.ageLabel || ageLabel(age)} · ${reference.label}：${Number(value.toFixed(3))} ${metric.unit}`)];
    if (reference.band) {
      const limits = activeRefs.filter(r => r.band === reference.band).map(r => ({ label: r.label, value: r.values.find(([a]) => a === age)?.[1] }));
      content.splice(0, 1, n('p', '', `${ageLabel(age)} · 单眼TAC II视力95%预测区间`));
      for (const limit of limits) if (Number.isFinite(limit.value)) content.push(n('p', '', `${limit.label}：${limit.value} ${metric.unit}`));
    }
    content.push(n('p', 'vision-help', referenceNote(state.metric)), link('查看参考来源 ↗', reference.source));
    showDetail('参考点 · 原始资料', content, trigger);
  };
  const activate = (el, label, action) => {
    el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); el.setAttribute('aria-label', label); el.setAttribute('aria-pressed', 'false');
    el.addEventListener('click', () => action(el)); el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(el); } });
  };
  const create = (tag, attrs, text) => { const el = document.createElementNS(svg.namespaceURI, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value); if (text !== undefined) el.textContent = text; svg.append(el); return el; };
  const x = age => 64 + (age - bounds[0]) / (bounds[1] - bounds[0]) * 710, y = value => 320 - (value - min) / (max - min) * 270;
  create('text', { x: 64, y: 24, class: 'vision-chart-unit' }, `${metric.label} / ${metric.unit}`);
  for (let i = 0; i <= 6; i++) { const value = min + (max - min) * i / 6; create('line', { x1: 64, x2: 774, y1: y(value), y2: y(value), class: 'vision-grid' }); create('text', { x: 53, y: y(value) + 4, 'text-anchor': 'end' }, value.toFixed(state.metric.includes('Acuity') || state.metric === 'acuity' ? 2 : 1)); }
  const step = Math.max(1, Math.ceil((bounds[1] - bounds[0]) / 10));
  for (let age = bounds[0]; age <= bounds[1]; age += step) { create('line', { x1: x(age), x2: x(age), y1: 50, y2: 320, class: 'vision-grid' }); create('text', { x: x(age), y: 347, 'text-anchor': 'middle' }, age + '岁'); }
  const band = activeRefs.filter(r => r.band === 'teller');
  if (band.length === 2) create('polygon', { points: [...referenceWindow(band[0], bounds), ...referenceWindow(band[1], bounds).reverse()].map(([a,v]) => `${x(a)},${y(v)}`).join(' '), class: 'vision-reference-band' });
  const referenceLabels = new Set();
  for (const [index, reference] of activeRefs.entries()) {
    const inside = referenceWindow(reference, bounds);
    if (reference.kind === 'segment' && inside.length >= 2) {
      const line = create('polyline', { points: inside.map(([a, v]) => `${x(a)},${y(v)}`).join(' '), class: 'vision-reference-line', 'data-reference': index });
      const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = `${reference.label} · ${reference.band ? '1～36月龄' : reference.ageLabel || `${reference.values[0][0]}～${reference.values.at(-1)[0]}岁`}`; line.append(title);
    }
    if (inside.length >= 2 && reference.kind === 'segment' && !referenceLabels.has(reference.label)) {
      referenceLabels.add(reference.label);
      const last = inside.at(-1); create('text', { x: x(last[0]) - 5, y: y(last[1]) - 7, 'text-anchor': 'end' }, reference.label);
    }
  }
  // 点击只查看原始参考值，裁剪出的线段端点不冒充新增标准点。
  for (const reference of activeRefs) for (const [age, value] of reference.values.filter(([a]) => a >= bounds[0] && a <= bounds[1])) {
    const group = create('g', { class: 'vision-reference-point' });
    const dot = document.createElementNS(svg.namespaceURI, 'circle'); dot.setAttribute('cx', x(age)); dot.setAttribute('cy', y(value)); dot.setAttribute('r', reference.kind === 'dots' ? 4 : 2.5); dot.setAttribute('class', 'vision-reference-dot');
    const hit = document.createElementNS(svg.namespaceURI, 'circle'); hit.setAttribute('cx', x(age)); hit.setAttribute('cy', y(value)); hit.setAttribute('r', 12); hit.setAttribute('class', 'vision-point-hit'); group.append(dot, hit);
    activate(group, `${reference.label}，${ageLabel(age)}，${value} ${metric.unit}，查看参考点`, trigger => showReference(reference, age, value, trigger));
  }
  for (const [eye] of EYES) for (const method of Object.keys(METHODS)) {
    const series = visible.filter(p => p.eye === eye && p.method === method);
    // 不连接不同散瞳条件；缺测点不补0，也不把参考年龄范围外推。
    if (method !== 'unknown' && series.length > 1) create('polyline', { points: series.map(p => `${x(p.age)},${y(p.value)}`).join(' '), class: `vision-data-line eye-${eye}`, 'stroke-dasharray': method === 'yes' ? '' : '5 5' });
    for (const p of series) {
      const attrs = eye === 'right' ? { cx: x(p.age), cy: y(p.value), r: 5.5 } : { x: x(p.age) - 5, y: y(p.value) - 5, width: 10, height: 10, rx: 1 };
      const group = create('g', { class: 'vision-personal-point' });
      const dot = create(eye === 'right' ? 'circle' : 'rect', { ...attrs, class: `vision-data-dot eye-${eye}` });
      const hit = create('circle', { cx: x(p.age), cy: y(p.value), r: 16, class: 'vision-point-hit' }); group.append(dot, hit);
      activate(group, `${p.date} ${eye === 'right' ? '右眼' : '左眼'} ${signed(p.value)} ${metric.unit} ${METHODS[method]}，查看检查点`, trigger => {
        const visit = visits(snapshot).find(v => v.id === p.id), content = [n('p', '', `${ageLabel(p.age)} · ${METHODS[method]}`)];
        for (const [key, label] of EYES) { const eye = visit[key]; content.push(n('p', '', `${label} · 裸眼 ${acuityLabel(eye.acuity)} · 戴镜 ${acuityLabel(eye.correctedAcuity)} · 球镜 ${signed(eye.sphere)} D · 柱镜 ${signed(eye.cylinder)} D · 轴位 ${eye.axis ?? '—'}° · 等效球镜 ${signed(equivalentSphere(eye))} D · 眼轴 ${Number.isFinite(eye.axialLength) ? eye.axialLength.toFixed(2) : '—'} mm`)); }
        if (visit.institution) content.push(n('p', '', visit.institution));
        if (visit.note) content.push(n('p', '', visit.note));
        content.push(button('编辑这次检查', () => editVisit(p.id)));
        showDetail(`${p.date} · ${eye === 'right' ? '右眼' : '左眼'} ${metric.label} ${signed(p.value)} ${metric.unit}`, content, trigger);
      });
    }
  }
  graph.append(svg); section.append(graph, detail);
  const legend = n('div', 'vision-chart-legend'); if (!metric.referenceOnly) legend.append(n('span', 'vision-right', '● 右眼 R'), n('span', 'vision-left', '■ 左眼 L'), n('span', '', '实线：散瞳 · 虚线：未散瞳 · 未注明仅显示点'));
  section.append(legend);
  if (!visible.length && !metric.referenceOnly) section.append(n('p', 'vision-help', visits(snapshot).length && !profile.get().birthDate ? '请在设置里填写宝宝生日，才能按检查日计算年龄。' : '当前范围暂无该指标的检查数值；添加检查后，双眼数据将显示在图中。'));
  const changes = n('div', 'vision-changes');
  for (const [eye, label] of EYES) { const delta = comparison(snapshot, eye, state.metric); if (delta) changes.append(n('span', '', `${label} · 较上次 ${signed(delta.delta)} ${metric.unit} / ${delta.days}天`)); }
  section.append(changes);
  section.append(n('p', 'vision-help', referenceNote(state.metric)));
  if (state.reference && !activeRefs.length) section.append(n('p', 'vision-help', state.metric === 'axialLength' && state.sex === 'none' ? '请选择眼轴参考人群；已核定的参考数据从6岁开始。' : '当前年龄范围没有适用的参考线，不向范围外延伸。'));
  const referenceList = n('div', 'vision-reference-summary');
  for (const reference of activeRefs) {
    const values = referenceWindow(reference, bounds);
    if (reference.band || !values.length) continue;
    const first = values[0], last = values.at(-1);
    const text = reference.ageLabel ? `${reference.ageLabel} · ${reference.label} ${state.metric === 'acuity' ? acuityLabel(first[1]) : signed(first[1])} ${metric.unit}`
      : values.map(([age,value]) => `${age}岁 · ${reference.label} ${signed(value)} ${metric.unit}`).join(' · ');
    referenceList.append(n('span', '', text));
  }
  if (referenceList.childNodes.length) section.append(referenceList);
  if (metric.referenceOnly) section.append(n('p', 'vision-help', '这是婴幼儿视力参考图；查看自己的裸眼视力、度数或眼轴，请切换上方“趋势指标”。'));
  const sources = [...new Set(activeRefs.map(r => r.source))];
  for (const url of sources) section.append(link('查看' + (url === NHC_URL ? '2024指南' : url.includes('PMC') ? 'Teller研究表A1' : url.includes('cqcdc') ? '2026实施标准解读' : '眼轴研究') + ' ↗', url));
  return section;
}
function modal(title) {
  if (dialog) return null;
  const previousFocus = document.activeElement, el = n('dialog', 'vision-dialog'), head = n('header'), body = n('div', 'vision-dialog-body'); el.setAttribute('aria-label', title);
  const close = () => { if (el.isDirty?.() && !confirm('内容尚未保存，放弃这次编辑吗？')) return; el.finish(); };
  head.append(n('h2', '', title), icon('close', '关闭弹窗', close)); el.append(head, body); document.body.append(el); dialog = el;
  const before = event => { if (el.isDirty?.()) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', before);
  el.finish = () => { el.close(); el.remove(); dialog = null; window.removeEventListener('beforeunload', before); document.body.classList.remove('vision-modal-open'); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); else shell.content.focus({ preventScroll: true }); void refresh(); };
  el.addEventListener('cancel', event => { event.preventDefault(); close(); });
  el.addEventListener('click', event => { const r = el.getBoundingClientRect(); if (event.target === el && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) close(); });
  document.body.classList.add('vision-modal-open'); el.showModal(); return { el, body };
}
async function persist(next, base) {
  if (writing) return false;
  writing = true;
  try { snapshot = await store.apply(M.normalize('vision', next), base); errorMessage = ''; notice = '已保存到本机；云端确认请查看设置内同步状态。'; void sync.changed('vision').catch(() => { notice = '已保存到本机，云端同步待重试。'; if (!dialog) render(); }); return true; }
  catch (error) { errorMessage = error.code === 'MERGE_CONFLICT' ? '另一页面修改了同一检查，尚未覆盖。请保留内容，重新打开核对后保存。' : error.message; return false; }
  finally { writing = false; }
}
async function removeVisit(id, base = structuredClone(snapshot)) {
  if (!base?.records[id] || writing) return false;
  const next = structuredClone(base); next.records[id].deleted = true;
  if (!await persist(next, base)) return false;
  notice = '检查已移入已删除，可在“导入导出与已删除记录”中恢复。'; return true;
}
function editVisit(id) {
  const opened = modal(id ? '编辑视力检查' : '记录一次视力检查'); if (!opened) return;
  const { el, body } = opened, base = structuredClone(snapshot), original = snapshot?.records[id] || { date: state.view === 'table' && state.date ? state.date : localDateString(), cycloplegia: 'unknown', chart: 'decimal', right: {}, left: {} }, fields = {};
  const form = n('form', 'vision-form');
  const addField = (parent, label, key, type = 'text', value = '', attrs = {}) => { const wrap = n('label', '', label), input = n('input'); input.type = type; input.name = key; input.setAttribute('aria-label', label); input.value = value; for (const [name, val] of Object.entries(attrs)) input.setAttribute(name, val); wrap.append(input); parent.append(wrap); fields[key] = input; return input; };
  const top = n('div', 'vision-form-grid');
  addField(top, '检查日期', 'date', 'date', original.date, { required: '', max: localDateString(), ...(profile.get().birthDate ? { min: profile.get().birthDate } : {}) });
  const methodLabel = n('label', '', '散瞳验光'), method = picker('散瞳验光', Object.entries(METHODS), original.cycloplegia, () => {}); method.name = 'cycloplegia'; methodLabel.append(method); top.append(methodLabel); fields.cycloplegia = method;
  const notationLabel = n('label', '', '报告视力记录法'), notation = picker('报告视力记录法', [['decimal', '小数（如0.8、1.0）'], ['logarithmic', '五分（如4.9、5.0）']], original.chart, () => {}); notation.name = 'chart'; notationLabel.append(notation); top.append(notationLabel); fields.chart = notation;
  addField(top, '检查机构（选填）', 'institution', 'text', original.institution || '', { maxlength: 120 }); form.append(top, n('p', 'vision-help', '按报告填写，空白保留未测；0需要明确输入。近视100度＝球镜−1.00D，近视150度＝−1.50D；远视用正号。左右眼分别填，散光另填柱镜C；裸眼视力0.5、1.0与度数不能换算。'));
  const eyes = n('div', 'vision-eye-fields');
  for (const [eye, label] of EYES) {
    const group = n('fieldset'); group.append(n('legend', '', label)); const grid = n('div', 'vision-form-grid');
    for (const [key, title, min, max, step] of [['acuity', '裸眼视力', .01, 3, 'any'], ['correctedAcuity', '戴镜视力', .01, 3, 'any'], ['sphere', '近视／远视 · 球镜 S / D', -40, 40, 'any'], ['cylinder', '散光 · 柱镜 C / D', -20, 20, 'any'], ['axis', '轴位 / °', 0, 180, 1], ['axialLength', '眼轴 / mm', 10, 40, 'any']]) {
      const raw = original[eye][key], value = ['acuity', 'correctedAcuity'].includes(key) && Number.isFinite(raw) && original.chart === 'logarithmic' ? 5 + Math.log10(raw) : raw ?? '';
      addField(grid, label + ' · ' + title, eye + '.' + key, 'number', value, { min, max, step });
    }
    const output = n('output', 'vision-se', '等效球镜 SE：—'); output.setAttribute('aria-live', 'polite');
    const recalc = () => { const sphere = fields[eye + '.sphere'].value, cylinder = fields[eye + '.cylinder'].value; output.textContent = '等效球镜 SE：' + signed(sphere !== '' && cylinder !== '' ? Number(sphere) + Number(cylinder) / 2 : null) + ' D'; };
    fields[eye + '.sphere'].addEventListener('input', recalc); fields[eye + '.cylinder'].addEventListener('input', recalc); recalc(); group.append(grid, output); eyes.append(group);
  }
  let previousNotation = original.chart;
  function setAcuityBounds() { for (const [eye] of EYES) for (const key of ['acuity', 'correctedAcuity']) { const field = fields[eye + '.' + key]; field.min = notation.value === 'decimal' ? .01 : 3; field.max = notation.value === 'decimal' ? 3 : 5 + Math.log10(3); } }
  notation.addEventListener('change', () => { for (const [eye] of EYES) for (const key of ['acuity', 'correctedAcuity']) { const input = fields[eye + '.' + key]; if (input.value !== '') { const decimal = acuityDecimal(Number(input.value), previousNotation); input.value = notation.value === 'logarithmic' ? 5 + Math.log10(decimal) : decimal; } } previousNotation = notation.value; setAcuityBounds(); }); setAcuityBounds();
  form.append(eyes);
  const bottom = n('div', 'vision-form-grid'); addField(bottom, '矫正方式／戴镜情况（选填）', 'correction', 'text', original.correction || '', { maxlength: 120 });
  form.append(bottom);
  const noteLabel = n('label', '', '检查备注（选填）'), note = n('textarea'); note.setAttribute('aria-label', '检查备注（选填）'); note.rows = 3; note.maxLength = 2000; note.value = original.note || ''; fields.note = note; noteLabel.append(note); form.append(noteLabel);
  const error = n('p', 'vision-form-error'); error.setAttribute('role', 'alert'); const actions = n('div', 'vision-form-actions'), save = n('button', 'vision-primary', '保存检查'); save.type = 'submit';
  if (id) actions.append(button('移入已删除', async () => { if (await removeVisit(id, base)) { el.finish(); render(); } else error.textContent = errorMessage; }, 'vision-delete'));
  actions.append(save); form.append(error, actions); body.append(form);
  const initialFields = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
  const serialized = () => JSON.stringify(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]))), initial = serialized(); el.isDirty = () => serialized() !== initial;
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!form.reportValidity() || writing) return;
    const visit = { date: fields.date.value, cycloplegia: method.value, chart: notation.value, right: {}, left: {} };
    for (const key of ['institution', 'correction', 'note']) if (fields[key].value.trim()) visit[key] = fields[key].value.trim();
    for (const [eye] of EYES) for (const key of ['acuity', 'correctedAcuity', 'sphere', 'cylinder', 'axis', 'axialLength']) {
      const field = eye + '.' + key, value = fields[field].value;
      if (value !== '') visit[eye][key] = ['acuity', 'correctedAcuity'].includes(key)
        ? notation.value === original.chart && value === initialFields[field] ? original[eye][key] : acuityDecimal(Number(value), notation.value)
        : Number(value);
    }
    const next = structuredClone(base || emptyVision()); next.records[id || 'vision-' + crypto.randomUUID()] = visit;
    save.disabled = true;
    if (await persist(next, base)) { el.finish(); render(); } else { error.textContent = errorMessage; save.disabled = false; }
  });
}
function openKnowledge() {
  const opened = modal('视力资料与网站入口'); if (!opened) return;
  const { body } = opened;
  const sites = n('section', 'vision-source-sites'); sites.append(n('h3', '', '原始资料与网站'));
  for (const source of SOURCE_SITES) { const entry = link('', source.url); entry.className = 'vision-source-entry'; entry.setAttribute('aria-label', source.title + '，新页面打开'); entry.append(window.XiaoyaSite.icon('source'), n('strong', '', source.title), n('small', '', source.publisher), n('span', '', source.note), n('span', 'vision-source-arrow', '↗')); sites.append(entry); }
  body.append(sites, n('h3', '', '指标与记录说明'), n('p', 'vision-help', '公共模板与参考资料。图片中的示例数值不是孩子的检查记录。'));
  for (const [title, text] of KNOWLEDGE) { const details = n('details', 'vision-knowledge'); details.append(n('summary', '', title), n('p', '', text)); body.append(details); }
  body.append(n('h3', '', '参考图片与模板'));
  for (const image of TEMPLATE_IMAGES) {
    const details = n('details', 'vision-knowledge'), summary = n('summary', '', image.title), caption = n('p', 'vision-help', image.note); details.append(summary, caption);
    details.addEventListener('toggle', () => { if (!details.open || details.querySelector('img')) return; const img = n('img', 'vision-reference-image'); img.src = './assets/vision/' + image.file; img.alt = image.title + '，参考模板，不是个人记录'; img.loading = 'lazy'; const open = link('新窗口查看原图 ↗', './assets/vision/' + image.file); details.append(img, open); });
    body.append(details);
  }
}
async function exportFile(content, filename, target) {
  try {
    if (location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname)) {
      const response = await fetch('/__local-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, filename }) });
      if (!response.ok) throw new Error('本机备份写入失败，请重试。'); const result = await response.json(); if (!result.saved || !result.path) throw new Error('未收到备份保存确认。'); target.textContent = '已保存备份：' + result.path;
    } else { const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })), a = n('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); target.textContent = '已发起备份下载，请保留文件。'; }
  } catch (error) { target.textContent = error.message; }
}
function openBackup() {
  const opened = modal('视力记录与备份'); if (!opened) return;
  const { el, body } = opened;
  body.append(n('p', '', `${visits(snapshot).length} 次检查 · ${visits(snapshot, true).length} 条可恢复记录。仅包含独立视力档案，不包含其他成长记录或登录令牌。`), button('查看私人云端同步状态', () => { el.finish(); void sync.open(); }));
  const result = n('p', 'vision-help'); result.setAttribute('role', 'status');
  body.append(button('导出视力 JSON 备份', () => exportFile(JSON.stringify(snapshot || emptyVision(), null, 2), '小芽视力记录_' + localDateString() + '.json', result)), result);
  const label = n('label', 'vision-import', '导入视力 JSON（先预览）'), input = n('input'); input.type = 'file'; input.accept = '.json,application/json'; label.append(input); body.append(label);
  const preview = n('div'); body.append(preview);
  input.addEventListener('change', async () => {
    preview.replaceChildren();
    try {
      const file = input.files[0]; if (!file) return; if (file.size > 1048576) throw new Error('备份不能超过1 MiB。');
      const imported = M.normalize('vision', JSON.parse(await file.text())), base = structuredClone(snapshot), merge = M.merge(null, base || emptyVision(), imported);
      if (merge.conflicts.length) throw new Error('备份与当前同一检查存在不同数值，请保留两份文件，通过编辑核对；未覆盖当前记录。');
      preview.append(n('p', '', `备份含 ${visits(imported).length} 次检查；合并后 ${visits(merge.snapshot).length} 次，保留当前其他检查。`));
      const apply = button('确认合并导入', async () => { apply.disabled = true; if (await persist(merge.snapshot, base)) { el.finish(); render(); } else { preview.append(n('p', 'vision-form-error', errorMessage)); apply.disabled = false; } }); preview.append(apply);
    } catch (error) { preview.append(n('p', 'vision-form-error', error.message)); }
  });
  const trash = visits(snapshot, true);
  if (trash.length) { const list = n('details', 'vision-knowledge'); list.append(n('summary', '', `已删除 · 可恢复 ${trash.length} 条`)); for (const visit of trash) list.append(button('恢复 ' + visit.date + (visit.institution ? ' · ' + visit.institution : ''), async () => { const base = structuredClone(snapshot), next = structuredClone(base); next.records[visit.id].deleted = false; if (await persist(next, base)) { el.finish(); render(); } else result.textContent = errorMessage; })); body.append(list); }
}
function openProfile() {
  const opened = modal('宝宝资料'); if (!opened) return;
  const { el, body } = opened, base = profile.get(), form = n('form', 'vision-form');
  const nameLabel = n('label', '', '宝宝称呼'), name = n('input'); name.value = base.name; name.required = true; name.maxLength = 30; name.setAttribute('aria-label', '宝宝称呼'); nameLabel.append(name);
  const birthday = n('p', '', base.birthDate ? '生日：' + base.birthDate : '请通过全站宝宝档案设置生日，用于按检查日计算年龄。');
  const save = n('button', 'vision-primary', '保存资料'); save.type = 'submit'; const error = n('p', 'vision-form-error'); form.append(nameLabel, birthday, error, save); body.append(form);
  el.isDirty = () => name.value !== base.name;
  form.addEventListener('submit', async event => { event.preventDefault(); try { await profile.save({ ...base, name: name.value.trim() }, base); void sync.changed('profile'); el.finish(); render(); } catch (failure) { error.textContent = failure.message; } });
}
async function refresh() { if (writing || dialog) return; try { const next = await store.read(); if (!M.equal(next, snapshot)) { snapshot = next; render(); } } catch (error) { errorMessage = error.message; render(); } }
async function start() {
  try {
    await profile.init(); store = window.XiaoyaSyncAdapters.createAdapters({ indexedDB, localStorage, profileClient: profile }).vision; snapshot = await store.read();
    sync = window.XiaoyaSync.createClient({ siteRoot: './', profileClient: profile }); sync.subscribe(area => { if (area === 'vision') void refresh(); }); profile.subscribe(() => { if (sync && !dialog) render(); });
    render(); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  } catch (error) { const box = n('main', 'vision-loading'); box.append(n('h1', '', '视力档案暂未打开'), n('p', '', error.message), button('重新打开', () => location.reload())); document.querySelector('#app').replaceChildren(box); }
}
void start();
