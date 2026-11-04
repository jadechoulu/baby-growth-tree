import { localDateString } from './lib/model.mjs';
import { mountGrowthSearch } from './lib/growth-search.mjs?v=20261104-search-popover';
import { HEALTH_PROGRESSION, healthGraph } from './lib/health-progression.mjs?v=20261104-browse-stages';
import { layoutGraph } from './lib/graph.mjs?v=20261104-separated-routes';
import { HEALTH_DOMAINS, HEALTH_MONTHS, HEALTH_STAGES, healthStage, stageHealthItems, completeHealthStage, undoHealthChange, nextHealthItems, OBSERVATION_LABELS, emptyHealth, referenceMonth, filterHealth, observationStats, validateHealthBackup } from './lib/health-model.mjs?v=20261103-status';

const M = window.XiaoyaSyncModel;
const profile = window.XiaoyaBabyProfile.createClient();
const state = { view: 'month', month: 1, domain: 'gross', status: 'all', search: '', limit: 8, focus: null, graphMode: 'lineage', zoom: window.matchMedia('(max-width:900px)').matches ? .7 : .85, expanded: false };
let source, shell, sync, store, snapshot = null, writing = false, notice = '', detail, lastUndo = null;
let saveError = false, graphLegendOpen = false;
let storageProblem = '';
let skillSearchControl;
let graphViewportAction = null;
const node = (tag, cls, text) => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
};
const records = () => snapshot?.records || {};
const selectedStage = () => healthStage(state.month);
const currentStage = () => healthStage(referenceMonth(profile.get().birthDate));
const expandedGroups = new Map();
const viewLabels = { month: '宝宝视角', overview: '能力脉络', next: '下一步' };
function versions(itemId = null) { return window.XiaoyaGrowthVersions.create('health', itemId, { onHelp: openSource }); }
const btn = (label, action, cls = 'health-button') => {
  const button = node('button', cls, label); button.type = 'button';
  button.addEventListener('click', action); return button;
};
function iconButton(icon, label, action) {
  const button = btn('', action, 'health-icon');
  const paths = {
    minus: 'M5 12h14', plus: 'M5 12h14M12 5v14',
    fit: 'M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6',
    locate: 'M12 2v4M12 18v4M2 12h4M18 12h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    expand: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6',
    info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  };
  const svg = window.XiaoyaSite.icon(icon);
  if (paths[icon]) svg.querySelector('path').setAttribute('d', paths[icon]);
  button.append(svg); button.title = label; button.setAttribute('aria-label', label);
  return button;
}
function pdfLink(label, page = 1) {
  const link = node('a', 'health-source-link', label);
  link.href = './assets/wst580-2017.pdf#page=' + page; link.target = '_blank'; link.rel = 'noopener';
  return link;
}
function saveView() {
  const params = new URLSearchParams({ view: state.view, month: state.month, domain: state.domain, status: state.status });
  if (state.search) params.set('q', state.search);
  if (state.focus !== null) params.set('focus', state.focus);
  if (state.graphMode === 'overview') params.set('mode', 'overview');
  const item = new URLSearchParams(location.hash.slice(1)).get('item');
  if (item) params.set('item', item);
  history.replaceState(null, '', '#' + params);
}
function navigate(id) {
  if (id === 'mao') { location.href = './index.html'; return; }
  if (id === 'source') { openSource(); return; }
  if (id === 'backup') { openBackup(); return; }
  if (id === 'profile') { openProfile(); return; }
  if (id.startsWith('stage:')) { state.view = 'month'; changeStage(HEALTH_STAGES.find(stage => stage.id === id.slice(6))); window.scrollTo(0, 0); return; }
  state.view = id; state.limit = 8;
  state.search = ''; state.expanded = false; state.status = 'all';
  if (id === 'month') { state.month = referenceMonth(profile.get().birthDate); state.focus = null; }
  if (id !== 'month' && state.domain === 'all') state.domain = 'gross';
  render(); window.scrollTo(0, 0);
}
function navigation() {
  return [
    { title: '内容版本', items: [{ id: 'mao', label: '毛老师版 · 成长技能树', icon: 'source' }] },
    { title: '一起慢慢长大', items: [
      { id: 'month', label: '宝宝视角', icon: 'baby', shortcut: true },
      { id: 'overview', label: '能力脉络', icon: 'tree', shortcut: true },
      { id: 'next', label: '下一步', icon: 'arrow', shortcut: true },
    ] },
    { title: '成长的每一站 · 标准月龄', items: HEALTH_STAGES.map(stage => {
      const stats = observationStats(stageHealthItems(source.items, stage), records());
      return { id: 'stage:' + stage.id, label: stage.label, icon: 'sprout', description: stage.id === currentStage().id ? '当前月龄' : `${stats.observed}/${stats.total}` };
    }) },
    { title: '我的成长花园', items: [
      { id: 'profile', label: '宝宝资料', icon: 'settings' },
      { id: 'backup', label: '本版记录与备份', icon: 'source' },
    ] },
  ];
}
function message(text, error = false) {
  notice = text; saveError = error;
  const target = document.querySelector('#health-notice');
  if (target) { target.textContent = text; target.dataset.error = error; target.hidden = !text; }
}
function updateSaveStatus() {
  const button = document.getElementById('health-save-status'); if (!button) return;
  const label = storageProblem ? '本机保存失败' : writing ? '正在保存' : '已保存到本机';
  button.setAttribute('aria-label', '保存状态：' + label); button.title = storageProblem || '观察状态、日期和手记保存在本机；云端确认请查看同步按钮';
  button.querySelector('[data-save-label]').textContent = label; button.classList.toggle('has-error', Boolean(storageProblem));
}
function optionsSelect(label, values, value, action) {
  const select = node('select'); select.setAttribute('aria-label', label);
  for (const [key, text] of values) { const option = node('option', '', text); option.value = key; select.append(option); }
  select.value = value;
  select.addEventListener('change', () => action(select.value)); return select;
}
function summaryStrip() {
  const strip = node('div', 'health-summary');
  const stats = observationStats(source.items, records());
  strip.setAttribute('aria-label', '本版累计观察进度');
  const percent = Math.round(stats.observed / stats.total * 100);
  const track = node('span', 'health-overall-track'), fill = node('i'); fill.style.width = percent + '%'; track.setAttribute('aria-hidden', 'true'); track.append(fill);
  strip.append(window.XiaoyaSite.icon('sprout'), node('span', '', '累计观察'), node('strong', '', `${stats.observed} / ${stats.total}`), track, node('span', 'health-summary-percent', `${percent}%`));
  return strip;
}
function domainPicker() {
  const section = node('section', 'health-domains' + (state.view === 'month' ? '' : ' health-domain-tabs')); section.setAttribute('aria-label', '五能区筛选与观察数量');
  for (const domain of HEALTH_DOMAINS) {
    const pool = state.view === 'next' ? nextHealthItems(source.items, records(), currentStage()) : state.view === 'overview' ? source.items : stageHealthItems(source.items, selectedStage());
    const items = pool.filter(item => item.domain === domain.id);
    const stats = observationStats(items, records());
    const button = btn('', () => { state.domain = domain.id; state.focus = null; render(); }, 'health-domain');
    button.dataset.domain = domain.id; button.setAttribute('aria-pressed', state.domain === domain.id);
    const fraction = node('span', 'health-domain-count', state.view === 'next' ? `可探索 ${stats.total}` : `${stats.observed} / ${stats.total}`);
    const percent = stats.total ? Math.round(stats.observed / stats.total * 100) : 0;
    if (state.view === 'overview') {
      fraction.classList.add('domain-progress-summary');
      fraction.setAttribute('aria-label', `已完成 ${stats.observed} / ${stats.total}，${percent}%`);
      fraction.append(node('span', '', `${percent}%`));
    }
    button.append(node('strong', '', domain.label), fraction);
    if (state.view === 'month') { button.append(node('small', 'health-domain-percent', `${percent}%`)); const track = node('span', 'health-progress-track'), fill = node('span'); fill.style.width = percent + '%'; track.append(fill); button.append(track); }
    section.append(button);
  }
  return section;
}
function changeStage(stage) {
  state.month = HEALTH_MONTHS.find(month => month >= stage.min); state.focus = null; state.search = ''; state.limit = 8; state.expanded = false; render();
}
function monthPicker() {
  const row = node('div', 'health-month-picker');
  const stage = selectedStage(), index = HEALTH_STAGES.indexOf(stage);
  const change = changeStage;
  const prev = iconButton('arrow', '上一个成长阶段', () => change(HEALTH_STAGES[index - 1])); prev.classList.add('health-prev'); prev.disabled = index === 0;
  const next = iconButton('arrow', '下一个成长阶段', () => change(HEALTH_STAGES[index + 1])); next.disabled = index === HEALTH_STAGES.length - 1;
  const select = optionsSelect('选择成长阶段', HEALTH_STAGES.map(stage => [stage.id, stage.label + (stage.id === currentStage().id ? ' · 当前' : '')]), stage.id, id => change(HEALTH_STAGES.find(stage => stage.id === id)));
  select.id = 'health-stage-select';
  const track = node('div', 'health-stage-track'); track.setAttribute('role', 'group'); track.setAttribute('aria-label', '成长阶段');
  for (const step of HEALTH_STAGES) {
    const pill = btn(step.label.replace('个月', '月'), () => change(step), 'health-stage-pill'); pill.setAttribute('aria-pressed', step.id === stage.id); pill.setAttribute('aria-label', step.label + (step.id === currentStage().id ? ' · 当前' : ''));
    if (step.id === currentStage().id) { const dot = node('i'); dot.title = '宝宝当前阶段'; pill.append(dot); }
    const items = stageHealthItems(source.items, step); if (items.length && observationStats(items, records()).observed === items.length) pill.append(node('span', '', ' ✓'));
    track.append(pill);
  }
  row.append(prev, select, track, next, stageCompleteButton(stage));
  if (stage.id !== currentStage().id) {
    const back = iconButton('baby', '回到宝宝当前阶段', () => {
      change(currentStage());
      const select = document.getElementById('health-stage-select');
      (select?.getClientRects().length ? select : document.querySelector('.health-stage-pill[aria-pressed="true"]'))?.focus({ preventScroll: true });
    });
    back.classList.add('stage-current-button');
    back.title = '回到宝宝当前阶段：' + currentStage().label;
    row.append(back);
  }
  return row;
}
function stageCompleteButton(stage, domain = null) {
  const items = stageHealthItems(source.items, stage).filter(item => !domain || item.domain === domain.id);
  const scope = domain ? domain.label : '五能区';
  const remaining = items.filter(item => records()[item.id]?.status !== 'observed').length;
  const button = btn(domain ? '✓' : remaining ? '✓ 全部完成' : '✓ 全部已完成', async event => {
    event.preventDefault(); event.stopPropagation();
    if (writing) return;
    button.disabled = true;
    const base = structuredClone(snapshot);
    if (!await persist(completeHealthStage(base, source.items, stage, localDateString(), domain?.id), base, { label: `${stage.label}${scope}新增 ${remaining} 项观察` })) button.disabled = false;
  }, domain ? 'health-button health-domain-complete' : 'health-button health-stage-complete');
  if (!domain) { button.replaceChildren(window.XiaoyaSite.icon('check'), node('span', '', remaining ? '全部完成' : '全部已完成')); button.querySelector('path').setAttribute('d', 'm5 12 4 4L19 6'); }
  if (domain) { button.dataset.completeDomain = domain.id; button.dataset.groupStage = stage.id; }
  else button.dataset.completeStage = stage.id;
  button.disabled = writing || !remaining;
  button.setAttribute('aria-label', `${stage.label}${scope}${remaining ? '全部完成' : '全部已完成'}`);
  button.title = `将${stage.label}${scope}全部 ${items.length} 项标记为已观察到，不受${domain ? '状态' : '能区和状态'}筛选影响；保留已有观察日期和手记`;
  return button;
}
function itemRow(item, { showStage = false, trail = true, timing = false } = {}) {
  const record = records()[item.id] || {};
  const row = node('article', 'health-item'); row.dataset.item = item.id; row.dataset.domain = item.domain; row.dataset.observed = record.status === 'observed';
  row.classList.toggle('is-focus', state.focus === item.id);
  const toggle = btn(record.status === 'observed' ? '✓' : '', async () => {
    if (writing) return;
    const base = structuredClone(snapshot || emptyHealth()), next = structuredClone(base);
    const value = { ...next.records[item.id] };
    if (value.status === 'observed') { delete value.status; delete value.observedAt; }
    else { value.status = 'observed'; value.observedAt = localDateString(); }
    if (Object.keys(value).length) next.records[item.id] = value; else delete next.records[item.id];
    await persist(next, snapshot === null ? null : base, { label: `${value.status === 'observed' ? '已观察到' : '撤回观察'}：${item.title}` });
  }, 'health-check');
  toggle.setAttribute('aria-label', (record.status === 'observed' ? '撤回已观察到：' : '标记已观察到：') + item.title);
  toggle.setAttribute('aria-pressed', record.status === 'observed'); toggle.disabled = writing;
  const label = node('div', 'health-item-label'), nameRow = node('div', 'health-item-name');
  const open = btn('', () => openItem(item.id), 'health-item-open'); open.title = '查看方法、要求与观察手记';
  const title = node('span', 'health-item-title', item.title);
  const flags = node('span', 'health-flags');
  if (item.parentReport) flags.append(node('abbr', '', 'R'));
  if (item.attention) flags.append(node('abbr', '', '*'));
  for (const flag of flags.children) flag.title = flag.textContent === 'R' ? '原文：可询问家长' : '原文：未通过需引起注意';
  title.append(flags);
  const stage = healthStage(item.month), actual = currentStage();
  const ageLabel = stage.id === actual.id ? '当前阶段' : stage.max < actual.min ? '此前阶段' : HEALTH_STAGES.indexOf(stage) === HEALTH_STAGES.indexOf(actual) + 1 ? '下一阶段' : '更后阶段';
  const meta = node('span', 'health-item-meta', `${timing ? ageLabel + ' · ' : ''}${showStage ? stage.label + ' · ' : ''}标准 ${item.month} 月龄${record.status ? ' · ' + OBSERVATION_LABELS[record.status] : ''}${record.note ? ' · 有手记' : ''}`);
  open.append(title); nameRow.append(open);
  if (trail) nameRow.append(iconButton('tree', `查看${item.title}的能力脉络`, () => showLineage(item)));
  label.append(nameRow, meta); row.append(toggle, label);
  if (timing) row.dataset.timing = stage.id === actual.id ? 'current' : stage.max < actual.min ? 'earlier' : HEALTH_STAGES.indexOf(stage) === HEALTH_STAGES.indexOf(actual) + 1 ? 'next' : 'later';
  return row;
}
function showLineage(item) {
  if (detail?.open && !detail.requestClose()) return;
  state.focus = item.id; state.graphMode = 'lineage'; state.month = item.month; state.domain = item.domain; state.view = 'overview'; state.search = ''; render();
  document.querySelector('.health-lineage')?.scrollIntoView({ block: 'start' });
}
function render() {
  if (!source) return;
  if (state.view === 'overview' && !source.items.some(item => item.id === state.focus && item.domain === state.domain)) state.graphMode = 'overview';
  const searchOpen = skillSearchControl?.isOpen();
  skillSearchControl?.destroy(); skillSearchControl = null;
  if (state.search.trim() || state.view === 'next') state.expanded = false;
  document.body.classList.toggle('health-graph-open', state.expanded);
  const oldViewport = document.querySelector('.health-lineage-viewport');
  const oldScroll = oldViewport && { left: oldViewport.scrollLeft, top: oldViewport.scrollTop, key: oldViewport.dataset.key, width: Number(oldViewport.dataset.layoutWidth) };
  if (!shell) {
    shell = window.XiaoyaSite.createShell({ sectionId: 'growth', siteRoot: './', onNavigate: navigate });
    document.querySelector('#app').replaceChildren(shell.element);
  }
  saveView();
  shell.update({ navigation: navigation(), activeId: state.view, title: '卫健委版 · ' + viewLabels[state.view] });
  const actions = node('div', 'topbar-actions');
  const saved = btn('', openBackup, 'save-status'); saved.id = 'health-save-status';
  const savedLabel = node('span'); savedLabel.dataset.saveLabel = ''; saved.append(node('span', 'save-status-dot'), savedLabel);
  const original = pdfLink(''); original.classList.add('icon-button', 'source-link'); original.setAttribute('aria-label', '卫健委版：查看原始标准 PDF'); original.title = '卫健委版原始标准'; original.append(window.XiaoyaSite.icon('book'), node('span', '', '原始标准'));
  const editProfile = iconButton('settings', '编辑宝宝资料', openProfile); editProfile.append(node('span', '', '宝宝资料'));
  actions.append(sync.createButton(), editProfile, saved, iconButton('source', '本版记录与备份', openBackup)); shell.actions.replaceChildren(versions(), original); shell.globalActions.replaceChildren(window.XiaoyaSite.createActionMenu(actions)); updateSaveStatus();
  const main = node('div', `health-content health-view-${state.view}`);
  main.append(summaryStrip());
  const head = node('header', 'health-heading');
  const copy = node('div'); copy.append(node('h1', '', state.view === 'next' ? '现在可以练这些。' : state.view === 'overview' ? '成长的来龙去脉，一眼看懂。' : '小小的进步，慢慢长成大大的世界。'), node('p', '', state.view === 'next' ? '按实际当前阶段和已观察记录，接着探索同能区的下一组项目。' : state.view === 'overview' ? '点一个项目，查看同能区的月龄脉络、原文方法和观察手记。' : '陪宝宝探索，收藏每一个「我会啦」的瞬间。'));
  head.append(copy); main.append(head);
  const noticeNode = node('p', 'health-notice', notice); noticeNode.id = 'health-notice'; noticeNode.dataset.error = saveError; noticeNode.setAttribute('role', 'status'); noticeNode.hidden = !notice;
  main.append(noticeNode);
  if (lastUndo) {
    const undo = node('div', 'health-undo'); undo.setAttribute('role', 'status');
    undo.append(node('span', '', lastUndo.label), btn('撤销', undoLastChange), iconButton('close', '收起操作提示', () => { lastUndo = null; undo.remove(); })); main.append(undo);
  }
  const stageControls = node('div', 'health-stage-controls');
  if (state.view === 'month') stageControls.append(monthPicker());
  main.append(stageControls, domainPicker());
  if (state.view === 'next') {
    const legend = node('div', 'health-age-legend'); legend.setAttribute('aria-label', '月龄颜色图例');
    for (const [timing, text] of [['current', `当前 ${currentStage().label}`], ['next', '下一阶段'], ['later', '更后阶段'], ['earlier', '此前阶段']]) {
      const item = node('span', '', text); item.dataset.timing = timing; legend.append(item);
    }
    main.append(legend);
    const undo = main.querySelector('.health-undo'); if (undo) main.append(undo);
  }
  const toolbar = node('div', 'health-toolbar' + (state.view === 'next' ? ' health-next-search' : ''));
  const statuses = node('div', 'health-status-tabs'); statuses.setAttribute('role', 'group'); statuses.setAttribute('aria-label', '观察状态筛选');
  const pool = state.view === 'next' ? nextHealthItems(source.items, records(), currentStage()) : state.search.trim() || state.view === 'overview' ? source.items : stageHealthItems(source.items, selectedStage());
  const domainItems = pool.filter(item => state.domain === 'all' || state.domain === item.domain);
  const statusOptions = [['all', '全部'], ['exploring', '探索中'], ['observed', '已完成']];
  for (const [id, label] of statusOptions) {
    const button = btn('', () => { state.status = id; render(); }); button.setAttribute('aria-pressed', state.status === id);
    button.dataset.status = id;
    button.append(node('span', '', label), node('small', '', filterHealth(domainItems, records(), { status: id }).length)); statuses.append(button);
  }
  if (state.view !== 'next') toolbar.append(statuses);
  const search = node('input', 'health-search'); search.type = 'search'; search.placeholder = '搜索技能'; search.title = '搜索项目、方法或编号'; search.setAttribute('aria-label', state.view === 'next' ? '搜索下一步待探索项目' : '搜索本版本全部月龄项目'); search.value = state.search;
  search.id = 'health-search';
  const updateSearch = () => {
    if (state.search === search.value) return;
    state.search = search.value; state.limit = 8; renderResults(); saveView();
  };
  search.addEventListener('input', event => { if (!event.isComposing) updateSearch(); });
  search.addEventListener('compositionend', updateSearch);
  const searchBox = node('div', 'health-search-box');
  const clear = iconButton('close', '清除搜索和状态筛选', () => { state.search = ''; state.status = 'all'; render(); document.getElementById('health-search')?.focus(); }); clear.id = 'health-clear-filters';
  searchBox.append(search, clear); toolbar.append(searchBox); main.append(toolbar);
  main.append(node('div', 'health-results'));
  const footer = node('footer', 'health-footer');
  footer.append(node('p', '', 'R 可询问家长 · * 原文注明未通过需引起注意。'), node('p', '', '家庭观察记录 · 原始月龄与测查条件见项目详情。'));
  main.append(footer); shell.content.replaceChildren(main); renderResults(oldScroll);
  if (state.view !== 'next') skillSearchControl = mountGrowthSearch(toolbar, { box: searchBox, input: search, filters: statuses, open: searchOpen });
}
function renderResults(previousScroll) {
  const target = document.querySelector('.health-results');
  if (!target) return;
  const oldViewport = target.querySelector('.health-lineage-viewport');
  const oldScroll = previousScroll || oldViewport && { left: oldViewport.scrollLeft, top: oldViewport.scrollTop, key: oldViewport.dataset.key, width: Number(oldViewport.dataset.layoutWidth) };
  const searchAll = Boolean(state.search.trim()), stage = state.view === 'next' ? currentStage() : selectedStage();
  const toolbar = document.querySelector('.health-toolbar');
  const complete = document.querySelector('.health-stage-controls .health-stage-complete'); if (complete) complete.hidden = searchAll;
  document.getElementById('health-clear-filters').disabled = !searchAll && state.status === 'all';
  const statusPool = state.view === 'next' ? nextHealthItems(source.items, records(), stage) : searchAll || state.view === 'overview' ? source.items : stageHealthItems(source.items, stage);
  for (const button of document.querySelectorAll('.health-status-tabs [data-status]')) button.querySelector('small').textContent = filterHealth(statusPool, records(), { domain: state.domain, status: button.dataset.status, search: state.search }).length;
  // 搜索栏及其祖先保持连接，避免打断输入法、光标或原生搜索气泡。
  let listSection = target.querySelector('.health-list-section');
  if (!listSection) {
    listSection = node('section', 'health-list-section');
    if (state.view === 'next') {
      const summary = node('div', 'health-next-summary'); summary.append(node('span'), toolbar); listSection.append(summary);
    } else listSection.append(toolbar);
    target.append(listSection);
  }
  for (const child of [...target.children]) if (child !== listSection) child.remove();
  const toolbarHost = state.view === 'next' ? listSection.querySelector('.health-next-summary') : toolbar;
  for (const child of [...listSection.children]) if (child !== toolbarHost) child.remove();
  window.XiaoyaSite.balanceSkillLists([]);
  if (state.view === 'overview' && !searchAll) { listSection.removeAttribute('aria-label'); renderLineage(target, oldScroll); return; }
  const pool = state.view === 'next' ? nextHealthItems(source.items, records(), stage)
    : state.view === 'month' && !searchAll ? stageHealthItems(source.items, stage) : source.items;
  const items = filterHealth(pool, records(), { ...state, month: undefined });
  listSection.setAttribute('aria-label', state.view === 'next' ? '下一步待探索项目' : stage.label + '技能清单');
  if (state.view === 'next') toolbarHost.querySelector('span').textContent = `${HEALTH_DOMAINS.find(domain => domain.id === state.domain)?.label || '全部能区'} · ${items.length} 项可探索`;
  if (searchAll && state.view !== 'next') listSection.append(node('h2', 'health-search-heading', `全月龄搜索 · ${items.length} 项`));
  // 宽屏与毛老师版相同：先图谱再清单；窄屏先读清单，完整图谱在后。
  const graphFirst = state.view === 'month' && !searchAll && !window.matchMedia('(max-width:900px)').matches;
  if (graphFirst) {
    renderLineage(target, oldScroll);
    target.insertBefore(target.querySelector('.health-lineage'), listSection);
  }
  if (!items.length) {
    const empty = node('div', 'health-empty'); empty.append(node('h3', '', state.view === 'next' ? '当前没有待探索项目' : state.status === 'observed' ? '第一颗小芽，等你来点亮' : '没有符合条件的项目'), node('p', '', state.view === 'next' ? '可以切换能区，或回到宝宝视角回顾观察记录。' : '可以切换阶段、能区或观察状态。'), btn('清除筛选', () => { state.search = ''; state.status = 'all'; render(); })); listSection.append(empty);
  } else if (state.view === 'next') {
    renderNext(listSection, items, stage);
  } else {
    const list = node('div', 'health-groups');
    if (!searchAll) {
      for (const domain of HEALTH_DOMAINS) {
        const groupItems = items.filter(item => item.domain === domain.id); if (!groupItems.length) continue;
        const group = node('details', 'health-group'); group.dataset.domain = domain.id;
        const key = `${state.view}:${stage.id}:${domain.id}`;
        group.open = expandedGroups.get(key) ?? false;
        group.addEventListener('toggle', () => { if (group.isConnected) expandedGroups.set(key, group.open); });
        const title = node('summary', 'health-group-heading');
        const fullGroup = stageHealthItems(source.items, stage).filter(item => item.domain === domain.id);
        title.append(node('strong', '', domain.label), node('span', '', `${observationStats(fullGroup, records()).observed} / ${fullGroup.length}`)); title.title = '展开或收起技能清单'; group.append(title);
        if (state.view === 'month' && !searchAll) {
          title.classList.add('health-group-with-actions');
          title.append(stageCompleteButton(stage, domain));
        }
        const rows = node('div', 'health-items');
        rows.append(...groupItems.map(item => itemRow(item))); group.append(rows);
        list.append(group);
      }
    } else {
      const stages = HEALTH_STAGES.filter(stage => stageHealthItems(items, stage).length);
      for (const stage of stages.slice(0, state.limit)) {
        const group = node('section', 'health-group'); group.append(node('h3', '', stage.label));
        const rows = node('div', 'health-items'); rows.append(...stageHealthItems(items, stage).map(item => itemRow(item, { showStage: true }))); group.append(rows); list.append(group);
      }
      if (stages.length > state.limit) list.append(btn(`继续查看 · 还有 ${stages.length - state.limit} 个阶段`, () => { state.limit += 8; renderResults(); }, 'health-button health-more'));
    }
    listSection.append(list);
  }
  if (state.view === 'month' && !searchAll) {
    if (!graphFirst) renderLineage(target, oldScroll);
  }
  if (state.view === 'next') listSection.append(node('p', 'health-next-hint', '保留当前及此前未观察项目，各能区从最新观察月龄继续下一组；同组其余项目也会保留。月龄顺序不是能力前置条件。'));
  window.XiaoyaSite.balanceSkillLists(target.querySelectorAll('.health-groups .health-items'));
}
function renderNext(target, items, stage) {
  const groups = [['current', '当前阶段 · 可以开始'], ['earlier', '此前阶段 · 补充观察'], ['next', '下一月龄阶段 · 顺着脉络继续'], ['later', '更后阶段 · 已走到这一步']];
  const list = node('div', 'health-next-groups');
  for (const [timing, title] of groups) {
    const matches = items.filter(item => {
      const own = healthStage(item.month);
      return (own.id === stage.id ? 'current' : own.max < stage.min ? 'earlier' : HEALTH_STAGES.indexOf(own) === HEALTH_STAGES.indexOf(stage) + 1 ? 'next' : 'later') === timing;
    });
    if (!matches.length) continue;
    const section = node('section', 'health-next-group'); section.dataset.timing = timing; section.setAttribute('aria-label', title);
    const heading = node('h3'); heading.append(node('span', '', title), node('small', '', `${matches.length} 项`));
    const rows = node('div', 'health-items');
    for (const item of matches) {
      const row = itemRow(item, { showStage: true, timing: true });
      row.querySelector('.health-item-meta').prepend(HEALTH_DOMAINS.find(domain => domain.id === item.domain).label + ' · '); rows.append(row);
    }
    section.append(heading, rows); list.append(section);
  }
  target.append(list);
}
function graphItem(item, position, graph, focused) {
  const relation = graph.relation;
  const role = focused?.id === item.id ? 'focus' : relation?.ancestors.some(value => value.id === item.id) ? 'ancestor'
    : relation?.descendants.some(value => value.id === item.id) ? 'descendant' : relation?.supporting.some(value => value.id === item.id) ? 'supporting' : 'neutral';
  const done = records()[item.id]?.status === 'observed';
  const card = node('article', `graph-node role-${role}${done ? ' node-completed' : ''}${graph.stageIds?.includes(item.id) ? ' node-in-stage' : ''}`);
  card.dataset.graphNode = item.id; card.dataset.item = item.id;
  Object.assign(card.style, { left: position.x + 'px', top: position.y + 'px', width: position.width + 'px', height: position.height + 'px' });
  card.setAttribute('aria-label', `${item.title}，标准 ${item.month} 月龄`);
  const select = btn('', () => {
    state.focus = item.id; graphViewportAction = 'focus'; render();
    document.querySelector(`[data-graph-node="${item.id}"] .graph-select`)?.focus({ preventScroll: true });
  }, 'graph-select');
  select.title = item.title; select.setAttribute('aria-label', `追踪${item.title}的前后脉络`); select.setAttribute('aria-pressed', role === 'focus');
  const meta = node('span', 'graph-node-meta'); meta.append(node('span', '', HEALTH_DOMAINS.find(d => d.id === item.domain).label), node('span', '', `标准 ${item.month} 月龄`));
  select.append(meta, node('strong', 'graph-node-title', item.title));
  const bottom = node('div', 'graph-node-bottom');
  bottom.append(node('span', 'node-link-count', `${item.parents.length} 前序 · ${graph.catalog.filter(value => value.parents.includes(item.id)).length} 后续`));
  if (role === 'focus' || done) bottom.append(node('span', role === 'focus' ? 'node-focus-badge' : 'node-done-label', done ? '已完成' : '正在看'));
  const explain = btn('解释', () => openItem(item.id), 'graph-explain'); explain.setAttribute('aria-label', `查看${item.title}解释`);
  // 复用清单相同的持久化、撤销与失败回退，避免图谱另写一套完成逻辑。
  const toggle = itemRow(item, { trail: false }).querySelector('.health-check'); toggle.classList.add('skill-check'); toggle.classList.toggle('is-checked', done);
  bottom.append(explain, toggle); card.append(select, bottom); return card;
}
function renderLineage(target, oldScroll) {
  const viewportAction = graphViewportAction; graphViewportAction = null;
  const domain = HEALTH_DOMAINS.find(d => d.id === state.domain) || HEALTH_DOMAINS[0], stage = selectedStage();
  let focused = source.items.find(item => item.id === state.focus && item.domain === domain.id);
  if (state.view === 'month' && !focused && state.focus !== '') focused = stageHealthItems(source.items, stage).find(item => item.domain === domain.id);
  const graph = healthGraph(source.items, { domain: domain.id, stage: state.view === 'month' ? stage : null, focus: focused?.id, mode: state.graphMode });
  const layout = layoutGraph(graph.nodes, graph.edges, HEALTH_STAGES);
  const section = node('section', 'health-lineage' + (state.view === 'month' && !state.expanded ? ' stage-lineage growth-stage-graph' : '')); section.dataset.domain = domain.id; section.setAttribute('aria-label', domain.label + '能力脉络');
  if (state.view === 'month' || state.expanded) {
    const header = node('div', 'health-lineage-heading' + (state.view === 'month' ? ' section-title-row lineage-title-row' : ''));
    header.append(node('h2', '', state.view === 'month' ? stage.label + '的成长脉络' : domain.label + ' · 能力脉络'));
    if (state.expanded) header.append(shell.createSectionSwitch()); section.append(header);
  }
  if (state.view === 'overview') {
    const controls = node('div', 'health-focus-controls graph-reading-controls'), modes = node('div', 'graph-mode-tabs'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', '脉络查看范围');
    for (const [mode, label] of [['lineage', '这项技能的完整脉络'], ['overview', '整个领域全景']]) {
      const button = btn(label, () => { state.graphMode = mode; graphViewportAction = mode === 'overview' ? 'fit' : 'focus'; render(); document.querySelector(`[data-graph-mode="${mode}"]`)?.focus(); }, state.graphMode === mode ? 'active' : '');
      const modeIcon = window.XiaoyaSite.icon(mode === 'overview' ? 'grid' : 'tree');
      button.replaceChildren(modeIcon, node('span', '', mode === 'lineage' ? '单项脉络' : '领域全景'));
      button.setAttribute('aria-label', label); button.title = mode === 'overview' ? '整个领域全景：显示本领域全部技能' : label;
      button.disabled = mode === 'lineage' && !focused;
      if (button.disabled) button.title = '请先选择一项技能，再查看单项脉络';
      button.dataset.graphMode = mode; button.setAttribute('aria-pressed', state.graphMode === mode); modes.append(button);
    }
    const picker = node('div', 'health-focus-picker'), label = node('label', '', '定位技能'); label.htmlFor = 'health-focus';
    const select = node('select'); select.id = 'health-focus'; select.setAttribute('aria-label', '定位技能');
    const all = node('option', '', '全部技能'); all.value = ''; select.append(all);
    for (const step of HEALTH_STAGES) {
      const group = node('optgroup'); group.label = step.label;
      for (const item of stageHealthItems(source.items, step).filter(item => item.domain === domain.id)) { const option = node('option', '', item.title); option.value = item.id; group.append(option); }
      if (group.children.length) select.append(group);
    }
    select.value = focused?.id || '';
    select.title = focused?.title || '全部技能';
    select.addEventListener('change', () => { const item = source.items.find(item => item.id === select.value); state.focus = item?.id || null; if (item) state.month = item.month; state.status = 'all'; graphViewportAction = item ? 'focus' : 'fit'; render(); document.getElementById('health-focus')?.focus(); });
    const clear = iconButton('close', '清除技能定位，查看整个领域', () => { state.focus = null; state.graphMode = 'overview'; graphViewportAction = 'fit'; render(); document.getElementById('health-focus')?.focus(); }); clear.disabled = !focused;
    picker.append(label, select, clear); controls.append(modes, picker); section.append(controls);
  }
  let clearStageFocus;
  if (state.view === 'month' && focused) {
    clearStageFocus = iconButton('close', '清除当前技能追踪', () => {
      state.focus = ''; render();
      document.querySelector('.health-lineage-viewport')?.focus({ preventScroll: true });
    });
    clearStageFocus.classList.add('stage-lineage-clear');
  }
  const workspace = node('div', 'graph-workspace'), toolbar = node('div', 'graph-toolbar'), tools = node('div', 'graph-tools'); tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', '图谱工具栏');
  const zoomTools = node('div', 'graph-zoom-tools'), viewTools = node('div', 'graph-view-tools');
  const zoomLabel = node('output', '', `${Math.round(state.zoom * 100)}%`); zoomLabel.setAttribute('aria-label', '画布缩放比例');
  const updateZoom = (zoom, keepCenter = true) => {
    const previous = state.zoom, x = (viewport.scrollLeft + viewport.clientWidth / 2) / previous, y = (viewport.scrollTop + viewport.clientHeight / 2) / previous;
    state.zoom = Math.max(.03, Math.min(1.5, zoom)); board.style.transform = `scale(${state.zoom})`;
    space.style.width = layout.width * state.zoom + 'px'; space.style.height = layout.height * state.zoom + 'px'; zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    if (keepCenter) { viewport.scrollLeft = x * state.zoom - viewport.clientWidth / 2; viewport.scrollTop = y * state.zoom - viewport.clientHeight / 2; }
  };
  const locate = () => {
    const current = board.querySelector(focused ? `[data-item="${focused.id}"]` : `[data-stage="${stage.id}"]`) || board.querySelector('.graph-node');
    if (!current) return;
    const a = current.getBoundingClientRect(), b = viewport.getBoundingClientRect();
    viewport.scrollLeft += a.left - b.left - (viewport.clientWidth - a.width) / 2;
    viewport.scrollTop += a.top - b.top - (viewport.clientHeight - a.height) / 2;
  };
  const locateButton = iconButton('locate', '定位当前技能', locate); locateButton.disabled = !focused;
  zoomTools.append(iconButton('minus', '缩小技能树', () => updateZoom(state.zoom - .15)), zoomLabel, iconButton('plus', '放大技能树', () => updateZoom(state.zoom + .15)));
  const fit = () => { updateZoom(Math.min((viewport.clientWidth - 12) / layout.width, (viewport.clientHeight - 12) / layout.height, 1), false); viewport.scrollLeft = 0; viewport.scrollTop = 0; };
  const fitButton = iconButton('fit', '一屏看全', fit);
  fitButton.title = '一屏看全：缩放当前图谱，不切换技能范围';
  viewTools.append(fitButton, locateButton);
  if (state.view === 'overview') viewTools.append(iconButton('baby', '回到宝宝当前月龄', () => { state.month = referenceMonth(profile.get().birthDate); state.focus = null; state.graphMode = 'overview'; render(); }));
  viewTools.append(iconButton(state.expanded ? 'close' : 'expand', state.expanded ? '退出放大画布' : '放大画布', () => expandGraph(!state.expanded)));
  const legendButton = iconButton('info', '查看图例', openLegend); legendButton.classList.add('graph-legend-button'); viewTools.append(legendButton);
  if (clearStageFocus) viewTools.append(clearStageFocus);
  tools.append(zoomTools, viewTools);
  if (state.view === 'month') {
    const stats = observationStats(graph.nodes, records());
    const counts = node('span', 'stage-lineage-counts', `${stats.observed}/${stats.total} 已完成`);
    counts.title = '当前图中全部技能的完成进度（含其他月龄）';
    section.querySelector('.lineage-title-row')?.append(counts);
  }
  toolbar.append(tools); workspace.append(toolbar);
  const panel = node('div', 'graph-legend-panel'), disclosure = node('details', 'graph-legend-disclosure'); disclosure.open = graphLegendOpen;
  const summary = node('summary'); summary.append(node('span', '', '图例 · 连线与颜色'), node('span', 'legend-disclosure-hint', '点击展开／收起')); disclosure.append(summary, legendContent());
  disclosure.addEventListener('toggle', () => { if (disclosure.isConnected) graphLegendOpen = disclosure.open; }); panel.append(disclosure); workspace.append(panel);
  const viewport = node('div', 'health-lineage-viewport graph-viewport'); viewport.tabIndex = 0; viewport.setAttribute('aria-label', domain.label + '完整技能脉络，可拖动或滚动查看');
  viewport.dataset.key = `${state.view}:${domain.id}:${stage.id}:${focused?.id || ''}:${state.graphMode}`;
  const space = node('div', 'graph-scale-space'), board = node('div', 'graph-scene'); board.style.width = layout.width + 'px'; board.style.height = layout.height + 'px';
  for (const step of layout.stages) {
    const band = node('div', 'graph-age-band' + (step.id === stage.id ? ' selected-age-band' : '')); band.dataset.stage = step.id;
    Object.assign(band.style, { left: step.x + 'px', width: step.width + 'px', height: layout.height + 'px' });
    const heading = node('div', 'graph-stage-heading'), title = node('div', 'graph-stage-title'), label = node('span', 'graph-stage-label'); label.append(node('strong', '', step.label));
    if (step.id === currentStage().id) label.append(node('small', 'stage-current-badge', '宝宝在这里'));
    title.append(label); heading.append(title); band.append(heading); board.append(band);
  }
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.id = 'graph-edges'; svg.setAttribute('width', layout.width); svg.setAttribute('height', layout.height); svg.setAttribute('aria-hidden', 'true');
  const colors = { ancestor: '#347bea', descendant: '#eb4b95', supporting: '#bf941d', neutral: '#cbbdd6' }, defs = document.createElementNS(ns, 'defs');
  for (const [kind, color] of Object.entries(colors)) {
    const marker = document.createElementNS(ns, 'marker');
    for (const [key, value] of Object.entries({ id: `graph-arrow-${kind}`, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto', markerUnits: 'userSpaceOnUse' })) marker.setAttribute(key, value);
    const arrow = document.createElementNS(ns, 'path'); arrow.setAttribute('d', 'M0 0L10 5L0 10Z'); arrow.setAttribute('fill', color); marker.append(arrow); defs.append(marker);
  }
  svg.append(defs);
  for (const edge of [...layout.edges].sort((a, b) => Number(a.kind !== 'neutral') - Number(b.kind !== 'neutral'))) {
    const group = document.createElementNS(ns, 'g'); group.setAttribute('class', `graph-edge-group edge-${edge.kind}`); group.dataset.from = edge.from; group.dataset.to = edge.to;
    const path = document.createElementNS(ns, 'path'); path.setAttribute('class', 'graph-edge'); path.setAttribute('d', edge.path); path.setAttribute('stroke', colors[edge.kind]); path.setAttribute('marker-end', `url(#graph-arrow-${edge.kind})`);
    const title = document.createElementNS(ns, 'title'), evidence = HEALTH_PROGRESSION.find(value => value.from === edge.from && value.to === edge.to); title.textContent = evidence.reason;
    const halo = document.createElementNS(ns, 'path');
    halo.setAttribute('class', 'graph-edge-halo'); halo.setAttribute('d', edge.path);
    group.append(title, halo, path); svg.append(group);
  }
  board.append(svg, ...layout.nodes.map(position => graphItem(graph.catalog.find(item => item.id === position.id), position, graph, focused)));
  space.append(board); viewport.append(space); workspace.append(viewport);
  const foot = node('div', 'graph-bottom-bar'); foot.append(node('span', '', '箭头指向下一项技能 · 拖动画布或横向滚动'), node('span', '', `${graph.nodes.length} 个技能 · ${graph.edges.length} 条关系`)); workspace.append(foot); section.append(workspace);
  section.append(node('p', 'health-graph-footnote lineage-footnote', '连线按原文动作与要求整理，仅作发展参考；无明确依据的项目不连箭头。前序未标记，也可以记录后续技能。'));
  if (state.expanded) {
    const dialog = node('dialog', 'health-graph-dialog'); dialog.setAttribute('aria-label', domain.label + '完整技能脉络'); dialog.append(section); target.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); expandGraph(false); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) expandGraph(false); } }); dialog.showModal();
  } else target.append(section);
  viewport.addEventListener('keydown', event => { if (event.target !== viewport || !['+', '=', '-'].includes(event.key)) return; event.preventDefault(); updateZoom(state.zoom + (event.key === '-' ? -.15 : .15)); });
  viewport.addEventListener('wheel', event => { if (event.ctrlKey) { event.preventDefault(); updateZoom(state.zoom + (event.deltaY < 0 ? .1 : -.1)); } }, { passive: false });
  let drag;
  viewport.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button,select')) return; drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }; viewport.setPointerCapture(event.pointerId); viewport.classList.add('is-dragging'); });
  viewport.addEventListener('pointermove', event => { if (drag) { viewport.scrollLeft = drag.left - event.clientX + drag.x; viewport.scrollTop = drag.top - event.clientY + drag.y; } });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, () => { drag = null; viewport.classList.remove('is-dragging'); });
  requestAnimationFrame(() => {
    if (!viewport.isConnected) return;
    updateZoom(viewportAction === 'focus' && state.zoom < .6 ? (window.matchMedia('(max-width:900px)').matches ? .7 : .85) : state.zoom, false);
    if (viewportAction === 'fit') fit();
    else if (viewportAction === 'focus') locate();
    else if (oldScroll?.key === viewport.dataset.key && oldScroll.width === viewport.clientWidth) { viewport.scrollLeft = oldScroll.left; viewport.scrollTop = oldScroll.top; }
    else locate();
    viewport.dataset.layoutWidth = viewport.clientWidth;
  });
}
function legendContent() {
  const legend = node('div', 'graph-key');
  const lines = node('div', 'graph-legend'); lines.append(node('strong', '', '连线'));
  for (const [kind, label] of [['ancestor', '前序脉络'], ['descendant', '后续发展'], ['supporting', '跨分支前序'], ['neutral', '其他关系']]) { const entry = node('span'); entry.append(node('i', 'legend-' + kind), document.createTextNode(label)); lines.append(entry); }
  const cards = node('div', 'graph-legend'); cards.append(node('strong', '', '卡片底色'));
  for (const [kind, label] of [['plain', '待探索'], ['done', '已完成'], ['focus', '正在追踪']]) { const entry = node('span'); entry.append(node('i', 'legend-card legend-card-' + kind), document.createTextNode(label)); cards.append(entry); }
  legend.append(lines, cards, node('p', '', '完成状态以右下角的 √ 为准。R：可询问家长；*：原文注明未通过需注意。')); return legend;
}
function openLegend() {
  const opened = modal('图例 · 连线与颜色', { stack: true }); if (!opened) return;
  opened.dialog.classList.add('graph-legend-dialog'); opened.dialog.dataset.domain = state.domain;
  opened.body.append(legendContent());
}
function progressionDetails(item) {
  const related = HEALTH_PROGRESSION.filter(edge => edge.from === item.id || edge.to === item.id);
  const section = node('section', 'health-direct-relations'); section.setAttribute('aria-label', '直接前序与后续');
  for (const [direction, label] of [['to', '直接前序'], ['from', '直接后续']]) {
    const edges = related.filter(edge => edge[direction] === item.id), group = node('div'); group.append(node('h3', '', label));
    if (!edges.length) group.append(node('p', 'health-help', '暂无明确关系'));
    for (const edge of edges) { const other = source.items.find(value => value.id === edge[direction === 'to' ? 'from' : 'to']); group.append(btn(other.title, () => openItem(other.id))); }
    section.append(group);
  }
  if (related.length) {
    const fold = node('details', 'health-relation-source'); fold.append(node('summary', '', '查看关系依据与原文'));
    fold.append(node('p', 'health-help', '本站整理的发展参考，不是原标准规定的必过前置，不锁定项目，也不补记完成。'));
    for (const edge of related) {
      const group = node('section', 'health-progression-source');
      const from = source.items.find(value => value.id === edge.from), to = source.items.find(value => value.id === edge.to);
      group.append(node('h3', '', `${from.title} → ${to.title}`), node('p', '', edge.reason));
      for (const value of [from, to]) group.append(node('strong', '', `${value.month}月龄 · ${value.title}`), node('p', 'health-original', '操作方法：' + value.method), node('p', 'health-original', '通过要求：' + value.requirement), pdfLink('核对附录 B 原文', value.methodPage));
      fold.append(group);
    }
    section.append(fold);
  }
  return section;
}
function expandGraph(expanded) {
  state.expanded = expanded; render();
  document.querySelector(`[aria-label="${expanded ? '退出放大画布' : '放大画布'}"]`)?.focus({ preventScroll: true });
}
async function undoLastChange() {
  if (writing || !lastUndo) return;
  writing = true;
  try {
    const change = lastUndo, base = await store.read();
    const result = undoHealthChange(base, change.before, change.after);
    if (!result.restored) { writing = false; lastUndo = null; render(); message('这些字段已有后续修改，未覆盖新记录。'); return; }
    if (await persist(result.snapshot, base, { remember: false })) { lastUndo = null; render(); message('已撤销上次操作，后续手记与其他观察保留。'); }
  } catch (error) { message('未能撤销：' + error.message, true); }
  finally { writing = false; }
}
async function persist(next, base, { label = '刚刚保存的观察', remember = true } = {}) {
  const active = document.activeElement, focusId = active?.closest('[data-item]')?.dataset.item;
  const focusSelector = active?.classList.contains('health-check') ? '.health-check' : null;
  writing = true; storageProblem = ''; updateSaveStatus(); message('正在保存本机观察记录…');
  try {
    snapshot = await store.apply(M.normalize('health', next), base);
    if (remember) lastUndo = { before: structuredClone(base), after: structuredClone(next), label };
    writing = false; notice = ''; saveError = false; render();
    if (focusId && focusSelector) document.querySelector(`[data-item="${focusId}"] ${focusSelector}`)?.focus({ preventScroll: true });
    void sync.changed('health').catch(error => message('本机已保存，同步待重试：' + error.message, true));
    return true;
  } catch (error) {
    storageProblem = error.message;
    message(error.code === 'MERGE_CONFLICT' ? '另一页面修改了同一项，尚未覆盖。请关闭详情后重新打开核对，再保存。' : error.message, true);
    return false;
  } finally { writing = false; updateSaveStatus(); }
}
function modal(title, { stack = false } = {}) {
  const previous = detail;
  if (!stack && detail?.open && !detail.requestClose()) return null;
  const focus = document.activeElement;
  const dialog = node('dialog', 'health-dialog'); dialog.setAttribute('aria-label', title);
  const header = node('header', 'health-dialog-head');
  dialog.requestClose = () => {
    if (dialog.isDirty?.() && !window.confirm('观察内容尚未保存，确认放弃这次编辑吗？')) return false;
    dialog.finishClose(); return true;
  };
  header.append(node('h2', '', title), shell.createSectionSwitch(), iconButton('close', '关闭详情', () => dialog.requestClose()));
  const body = node('div', 'health-dialog-body');
  dialog.append(header, body); document.body.append(dialog);
  dialog.addEventListener('click', e => { const b = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)) dialog.requestClose(); });
  dialog.addEventListener('cancel', e => { e.preventDefault(); dialog.requestClose(); });
  let disposed = false;
  const cleanup = () => {
    if (disposed) return; disposed = true;
    const wasCurrent = detail === dialog;
    dialog.cleanupForm?.();
    dialog.remove(); if (wasCurrent) detail = stack && previous?.isConnected ? previous : null;
    document.body.classList.toggle('health-modal-open', Boolean(document.querySelector('.health-dialog[open]')));
    const params = new URLSearchParams(location.hash.slice(1)); if (!stack && wasCurrent && params.has('item')) { params.delete('item'); history.replaceState(null, '', '#' + params); }
    if (focus?.isConnected) focus.focus({ preventScroll: true });
    else if (dialog.dataset.item) document.querySelector(`[data-item="${dialog.dataset.item}"] :is(.health-item-open,.graph-explain)`)?.focus({ preventScroll: true });
    else shell.content.focus({ preventScroll: true });
    if (!detail?.open) void refresh();
  };
  // 后台页的原生 close 事件可能延迟到下一帧；主动关闭须同步清理深链接和弹层引用。
  dialog.finishClose = () => { dialog.close(); cleanup(); };
  dialog.addEventListener('close', cleanup, { once: true });
  detail = dialog;
  document.body.classList.add('health-modal-open');
  dialog.showModal(); return { dialog, body };
}
function protectForm(form, dialog) {
  const value = () => [...form.querySelectorAll('input,select,textarea')].map(input => [input.type, input.value, input.checked]);
  const initial = JSON.stringify(value());
  dialog.isDirty = () => JSON.stringify(value()) !== initial;
  const beforeUnload = event => { if (dialog.open && dialog.isDirty()) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  dialog.cleanupForm = () => window.removeEventListener('beforeunload', beforeUnload);
}
function openItem(id) {
  const item = source.items.find(item => item.id === id); if (!item) return;
  const opened = modal(item.title); if (!opened) return;
  const { dialog, body } = opened;
  dialog.dataset.item = id; dialog.dataset.domain = item.domain;
  // 与毛老师版一致：解释只打开详情，点击技能名称才改变图谱追踪焦点。
  const params = new URLSearchParams(location.hash.slice(1)); params.set('item', id); history.replaceState(null, '', '#' + params);
  const base = structuredClone(snapshot), value = records()[id] || {};
  body.append(versions(item.id));
  body.append(node('p', 'health-detail-meta', `${healthStage(item.month).label} · 原标准 ${item.month} 月龄 · ${HEALTH_DOMAINS.find(d => d.id === item.domain).label} · #${item.number}`));
  body.append(btn('查看这项的完整脉络', () => showLineage(item), 'health-button health-detail-lineage'));
  if (item.parentReport || item.attention) body.append(node('p', 'health-flag-note', [item.parentReport ? 'R：本项表现可询问家长。' : '', item.attention ? '*：原文注明未通过需引起注意，建议向专业人员咨询。' : ''].filter(Boolean).join(' ')));
  body.append(node('h3', '', '操作方法 · 原文'), node('p', 'health-original', item.method), node('h3', '', '测查通过要求 · 原文'), node('p', 'health-original', item.requirement));
  if (item.methodTitle.replace(/[R*]/g, '') !== item.title) body.append(node('small', '', '附录 B 项目原名：' + item.methodTitle));
  const links = node('div', 'health-evidence');
  links.append(pdfLink(`表 A.1 · PDF 第 ${item.tablePage} 页`, item.tablePage), pdfLink(`表 B.1 · PDF 第 ${item.methodPage} 页`, item.methodPage));
  body.append(links);
  if (/图A\.[12]/.test(item.method + item.requirement)) body.append(pdfLink('查看配套测查图 A.1 / A.2', /图A\.1/.test(item.method + item.requirement) ? 9 : 10));
  const form = node('form', 'health-observation-form');
  form.append(node('h3', '', '我的家庭观察'), node('p', 'health-help', '家庭观察与正式测查通过／不通过分开，不计算发育商。'));
  const label = node('label', '', '观察状态');
  const status = optionsSelect('观察状态', Object.entries(OBSERVATION_LABELS), value.status || 'unrecorded', () => {}); label.append(status);
  const dateLabel = node('label', '', '观察日期'); const date = node('input'); date.type = 'date'; date.max = localDateString(); date.value = value.observedAt || localDateString(); date.setAttribute('aria-label', '观察日期'); dateLabel.append(date);
  const noteLabel = node('label', '', '观察手记'); const note = node('textarea'); note.maxLength = 2000; note.rows = 3; note.value = value.note || ''; note.setAttribute('aria-label', '观察手记'); noteLabel.append(note);
  const error = node('p', 'health-form-error'); error.setAttribute('role', 'alert');
  const save = node('button', 'health-primary', '保存观察'); save.type = 'submit';
  const quickStatus = node('div', 'health-detail-status');
  const statusText = node('strong'), toggle = btn('', () => {
    status.value = status.value === 'observed' ? 'unrecorded' : 'observed';
    if (status.value === 'observed' && !date.value) date.value = localDateString();
    updateStatus(); void saveObservation(false);
  }, 'health-primary'); toggle.id = 'health-detail-toggle';
  quickStatus.append(statusText, toggle);
  const extra = node('details', 'health-observation-options'); extra.append(node('summary', '', '更多观察状态'), label);
  const updateStatus = () => {
    statusText.textContent = status.value === 'observed' ? '这颗成长小芽，已观察到' : '正在慢慢探索';
    toggle.textContent = status.value === 'observed' ? '回退为探索中' : '标记已完成';
    toggle.setAttribute('aria-pressed', status.value === 'observed'); dateLabel.hidden = status.value === 'unrecorded';
  };
  status.addEventListener('change', updateStatus); updateStatus();
  const formActions = node('div', 'health-form-actions'); formActions.append(node('small', '', '观察状态、日期和手记保存在本机；登录连接后自动同步。'), save);
  form.append(quickStatus, dateLabel, noteLabel, extra, error, formActions);
  async function saveObservation(close = true) {
    if (writing || !form.reportValidity()) return;
    const next = structuredClone(base || emptyHealth()), record = {};
    if (status.value !== 'unrecorded') { record.status = status.value; record.observedAt = date.value; }
    if (note.value) record.note = note.value;
    if (Object.keys(record).length) next.records[id] = record; else delete next.records[id];
    save.disabled = toggle.disabled = true;
    if (await persist(next, base, { label: `已保存观察：${item.title}` })) {
      dialog.finishClose(); if (!close) { openItem(id); document.getElementById('health-detail-toggle')?.focus({ preventScroll: true }); }
    } else { error.textContent = notice; save.disabled = toggle.disabled = false; }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void saveObservation(); });
  body.append(form);
  protectForm(form, dialog);
  const adjacent = source.items.filter(other => other.domain === item.domain);
  const index = adjacent.findIndex(other => other.id === id);
  const nav = node('nav', 'health-adjacent'); nav.setAttribute('aria-label', '同能区前后项目，按标准月龄顺序');
  for (const [label, other] of [['上一项', adjacent[index - 1]], ['下一项', adjacent[index + 1]]]) if (other) nav.append(btn(`${label} · ${other.title}`, () => openItem(other.id)));
  body.append(progressionDetails(item), nav);
}
function openSource() {
  const opened = modal('标准与使用方法', { stack: true }); if (!opened) return;
  const { body } = opened;
  body.append(node('h3', '', source.title), node('p', '', `${source.standard} · ${source.publisher}发布`), node('p', '', `${source.published} 发布 · ${source.effective} 实施`), pdfLink('阅读完整标准 PDF'));
  const sections = [
    ['阶段、脉络与下一步', '阶段区间是本站阅读分组，项目详情保留标准原始月龄。能力脉络按同能区的标准月龄排列，相邻项目不表示技能前置依赖。下一步按宝宝实际当前阶段及观察记录推荐，与浏览过的阶段无关：保留当前及此前尚未观察项目；某能区已有更后月龄观察时，也保留进度以内的未观察项目，并继续最新观察之后首个未观察月龄组，无须整组完成。尚无观察的能区不提前开放未来月龄。各能区独立推进，空白记录不等于能力不足，不据此套用正式施测起止规则。'],
    ['本版如何使用', '按月龄和五能区查看项目，阅读方法与要求，再记录家庭观察。R 表示可以询问家长获得表现；* 表示原文注明该项未通过需要引起注意。两版记录独立，不根据毛老师版完成项推断本版结果。'],
    ['适用范围与资格 · 正文 1、6', '原文适用于0岁～6岁（未满7周岁），是诊断量表。表中保留78与84月龄组。主试者应经过专业培训获得相关资质才能施测；结果应由受过专业培训的主试者结合儿童综合情况解释判断。此处家庭观察不生成诊断或DQ。'],
    ['工具与环境 · 正文 4.1、6.1', '正式施测使用配套标准化测查工具箱及诊查床、小桌、小椅、楼梯等。环境安静、光线明亮，严格遵照方法和通过要求，避免家长暗示、启发、诱导。'],
    ['主测月龄 · 正文 4.2.1～4.2.2', '原文按测查日与生日计算岁、月、日，30天为1个月、1岁为12个月，月龄保留1位小数。与实际月龄最接近的月龄段为主测月龄；介于两个月龄段之间时视较小月龄为主测月龄。早产儿也按实际月龄，不矫正。页面的月龄选择仅用于阅读定位。'],
    ['测查启动和结束 · 正文 4.2.3', '从主测月龄开始，无论结果如何先向前、向后各测2个月龄组。每个能区向前连续两组均通过才停止，否则继续向前；向后连续两组均不能通过才停止，否则继续向后。各能区分别遵守此程序。正式记录通过为○、不通过为×。'],
    ['计分方法 · 正文 4.4', '1～12月龄每能区每组1分（两项各0.5）；15～36月龄每组3分（两项各1.5）；42～84月龄每组6分（两项各3）。智龄还涉及连续通过和默认基础项目，五能区智龄平均为总智龄，DQ=智龄/实际年龄×100。不能用家庭勾选比例代替正式测评分数，具体计算和参考范围请见原文第3页。'],
  ];
  for (const [title, text] of sections) body.append(node('h3', '', title), node('p', 'health-original', text));
  body.append(pdfLink('打开正文使用说明 · PDF 第 5 页', 5), pdfLink('打开配套测查图 · PDF 第 9 页', 9));
}
async function download(status) {
  try {
    const content = JSON.stringify(snapshot || emptyHealth(), null, 2), filename = `小芽卫健委观察_${localDateString()}.json`;
    if (location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname)) {
      const response = await fetch('/__local-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, content }) });
      if (!response.ok) throw new Error('备份未写入育儿目录，请确认本地记录服务后重试。');
      const result = await response.json(); if (!result.saved || !result.path) throw new Error('未收到备份保存确认，请重试。');
      status.textContent = '已保存备份：' + result.path;
    } else {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = '已发起下载，请在设备上保留 JSON 备份。';
    }
  } catch (error) { status.textContent = error.message; }
}
function openBackup() {
  const opened = modal('卫健委版记录与备份'); if (!opened) return;
  const { body } = opened;
  const stats = observationStats(source.items, records()), notes = Object.values(records()).filter(record => record.note).length;
  const summary = node('div', 'health-backup-summary'); summary.append(node('strong', '', `${stats.observed} 个已完成项目 · ${notes} 篇观察手记`), node('span', '', storageProblem ? '本机保存失败，请重试或导出备份。' : '已保存到本机；云端确认请查看同步面板。'));
  body.append(summary, btn('全站记录同步', () => { detail?.finishClose(); void sync.open(); }));
  const exportStatus = node('p', 'health-help'); exportStatus.setAttribute('role', 'status');
  body.append(node('p', '', '仅导出本版观察状态、日期与手记；不包含毛老师版记录、宝宝档案或登录身份。'), btn('导出本版 JSON', () => download(exportStatus)), exportStatus);
  const label = node('label', 'health-import-label', '导入本版 JSON（先预览，不直接覆盖）');
  const input = node('input'); input.type = 'file'; input.accept = '.json,application/json'; label.append(input); body.append(label);
  const preview = node('div'); body.append(preview);
  input.addEventListener('change', async () => {
    preview.replaceChildren();
    try {
      const file = input.files[0]; if (!file) return;
      if (file.size > 1048576) throw new Error('备份不能超过 1 MiB。');
      const incoming = validateHealthBackup(JSON.parse(await file.text()), M.normalize);
      if (!incoming) throw new Error('请选择有效的本版备份。');
      const stats = observationStats(source.items, incoming.records);
      preview.append(node('p', '', `备份：${stats.observed} 项已观察到，${stats.notYet} 项暂未观察到。`));
      const base = structuredClone(snapshot), current = base || emptyHealth();
      const merged = M.merge(null, current, incoming);
      const choices = {}, form = node('form');
      for (const item of merged.conflicts) {
        const field = node('fieldset'); field.append(node('legend', '', item.path.join(' / ')));
        for (const side of ['local', 'remote']) {
          const choiceLabel = node('label'), radio = node('input'); radio.type = 'radio'; radio.name = item.key; radio.value = side; radio.required = true;
          radio.addEventListener('change', () => { choices[item.key] = side; });
          choiceLabel.append(radio, document.createTextNode((side === 'local' ? '本机：' : '备份：') + String(item[side] ?? '未记录'))); field.append(choiceLabel);
        }
        form.append(field);
      }
      const submit = node('button', 'health-primary', '确认合并本版记录'); submit.type = 'submit'; form.append(submit);
      const error = node('p', 'health-form-error'); error.setAttribute('role', 'alert');
      form.addEventListener('submit', async e => {
        e.preventDefault(); if (writing) return;
        const result = M.merge(null, current, incoming, choices);
        if (result.conflicts.length) { error.textContent = '请先选择所有差异。'; return; }
        submit.disabled = true;
        if (await persist(result.snapshot, base)) detail?.finishClose(); else { error.textContent = notice; submit.disabled = false; }
      });
      preview.append(form, error);
    } catch (error) { preview.append(node('p', 'health-form-error', error.message)); }
  });
}
function openProfile() {
  const opened = modal('宝宝资料'); if (!opened) return;
  const { dialog, body } = opened;
  const base = profile.get(), form = node('form'), label = node('label', '', '宝宝昵称'), input = node('input'); input.value = base.name; input.required = true; input.maxLength = 30; label.append(input);
  const save = node('button', 'health-primary', '保存资料'); save.type = 'submit';
  const error = node('p', 'health-form-error'); error.setAttribute('role', 'alert');
  form.append(label, node('p', '', '资料由全站共用；生日为 ' + base.birthDate), error, save);
  form.addEventListener('submit', async e => { e.preventDefault(); try { await profile.save({ ...base, name: input.value }, base); dialog.finishClose(); } catch (failure) { error.textContent = failure.message; } });
  body.append(form);
  protectForm(form, dialog);
}
async function refresh() {
  if (!store || writing || detail?.open) return;
  try { const latest = await store.read(); if (!writing && !detail?.open && !M.equal(latest, snapshot)) { snapshot = latest; render(); } } catch (error) { message(error.message, true); }
}
async function start() {
  try {
    const response = await fetch('./data/health-standard.json'); if (!response.ok) throw new Error('标准项目暂未加载成功。'); source = await response.json();
    await profile.init();
    const params = new URLSearchParams(location.hash.slice(1));
    state.month = HEALTH_MONTHS.includes(Number(params.get('month'))) ? Number(params.get('month')) : referenceMonth(profile.get().birthDate);
    if (['month', 'overview', 'next'].includes(params.get('view'))) state.view = params.get('view');
    if (HEALTH_DOMAINS.some(d => d.id === params.get('domain'))) state.domain = params.get('domain');
    if (['all', 'exploring', 'observed'].includes(params.get('status'))) state.status = params.get('status');
    else if (['unrecorded', 'not-yet'].includes(params.get('status'))) state.status = 'exploring';
    state.graphMode = params.get('mode') === 'overview' ? 'overview' : 'lineage';
    state.search = params.get('q') || '';
    if (state.view === 'next') state.status = 'all';
    state.focus = params.has('focus') && params.get('focus') === '' ? '' : source.items.some(item => item.id === params.get('focus')) ? params.get('focus') : null;
    if (state.view !== 'month' && state.domain === 'all') state.domain = 'gross';
    store = window.XiaoyaSyncAdapters.createAdapters({ indexedDB, localStorage, profileClient: profile }).health;
    snapshot = await store.read();
    sync = window.XiaoyaSync.createClient({ siteRoot: './', profileClient: profile });
    sync.subscribe(area => { if (area === 'health') void refresh(); });
    profile.subscribe(() => { if (source && sync) render(); });
    render(); if (params.get('item')) openItem(params.get('item'));
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    window.matchMedia('(max-width:900px)').addEventListener('change', () => { if (!detail?.open) render(); });
  } catch (error) {
    const box = node('main', 'health-loading'); box.append(node('h1', '', '卫健委版暂未加载'), node('p', '', error.message), btn('重新加载', () => location.reload())); document.querySelector('#app').replaceChildren(box);
  }
}
void start();
