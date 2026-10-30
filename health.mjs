import { localDateString } from './lib/model.mjs';
import { HEALTH_DOMAINS, HEALTH_MONTHS, HEALTH_STAGES, healthStage, stageHealthItems, completeHealthStage, nextHealthItems, OBSERVATION_LABELS, emptyHealth, referenceMonth, filterHealth, observationStats, validateHealthBackup } from './lib/health-model.mjs';

const M = window.XiaoyaSyncModel;
const profile = window.XiaoyaBabyProfile.createClient();
const state = { view: 'month', month: 1, domain: 'all', status: 'all', search: '', limit: 8, focus: null };
let source, shell, sync, store, snapshot = null, writing = false, notice = '', detail;
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
  button.append(window.XiaoyaSite.icon(icon)); button.title = label; button.setAttribute('aria-label', label);
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
  if (state.focus) params.set('focus', state.focus);
  const item = new URLSearchParams(location.hash.slice(1)).get('item');
  if (item) params.set('item', item);
  history.replaceState(null, '', '#' + params);
}
function navigate(id) {
  if (id === 'mao') { location.href = './index.html'; return; }
  if (id === 'source') { openSource(); return; }
  if (id === 'backup') { openBackup(); return; }
  if (id === 'profile') { openProfile(); return; }
  state.view = id; state.limit = 8;
  if (id === 'next') { state.status = 'all'; state.search = ''; }
  if (id === 'overview' && state.domain === 'all') state.domain = 'gross';
  render(); window.scrollTo(0, 0);
}
function navigation() {
  return [
    { title: '卫健委版 · 成长观察', items: [
      { id: 'month', label: '宝宝视角', icon: 'baby', shortcut: true },
      { id: 'overview', label: '能力脉络', icon: 'tree', shortcut: true },
      { id: 'next', label: '下一步', icon: 'arrow', shortcut: true },
    ] },
    { title: '我的成长花园', items: [
      { id: 'mao', label: '切换毛老师版', icon: 'sprout' },
      { id: 'profile', label: '宝宝资料', icon: 'settings' },
      { id: 'backup', label: '本版记录与备份', icon: 'source' },
    ] },
  ];
}
function message(text, error = false) {
  notice = text;
  const target = document.querySelector('#health-notice');
  if (target) { target.textContent = text; target.dataset.error = error; target.hidden = !text; }
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
  strip.append(node('span', '', '全量项目'), node('strong', '', `${stats.observed} / ${stats.total}`), node('span', '', '已观察到'), node('small', '', `${stats.notYet} 项暂未观察到`));
  return strip;
}
function domainPicker() {
  const section = node('section', 'health-domains'); section.setAttribute('aria-label', '五能区筛选与观察数量');
  for (const domain of HEALTH_DOMAINS) {
    const pool = state.view === 'next' ? nextHealthItems(source.items, records(), currentStage()) : state.view === 'overview' ? source.items : stageHealthItems(source.items, selectedStage());
    const items = pool.filter(item => item.domain === domain.id);
    const stats = observationStats(items, records());
    const button = btn('', () => { state.domain = state.domain === domain.id ? 'all' : domain.id; render(); }, 'health-domain');
    button.dataset.domain = domain.id; button.setAttribute('aria-pressed', state.domain === domain.id);
    const fraction = node('span', 'health-domain-count', state.view === 'next' ? `${stats.total} 项` : `${stats.observed} / ${stats.total}`);
    button.append(node('strong', '', domain.label), fraction, node('small', '', state.view === 'next' ? '待探索' : '已观察到'));
    section.append(button);
  }
  return section;
}
function monthPicker() {
  const row = node('div', 'health-month-picker');
  const stage = selectedStage(), index = HEALTH_STAGES.indexOf(stage);
  const change = next => { state.month = HEALTH_MONTHS.find(month => month >= next.min); state.focus = null; state.limit = 8; render(); };
  const prev = iconButton('arrow', '上一个成长阶段', () => change(HEALTH_STAGES[index - 1])); prev.classList.add('health-prev'); prev.disabled = index === 0;
  const next = iconButton('arrow', '下一个成长阶段', () => change(HEALTH_STAGES[index + 1])); next.disabled = index === HEALTH_STAGES.length - 1;
  const select = optionsSelect('选择成长阶段', HEALTH_STAGES.map(stage => [stage.id, stage.label]), stage.id, id => change(HEALTH_STAGES.find(stage => stage.id === id)));
  const current = iconButton('baby', '回到宝宝当前阶段', () => { state.month = referenceMonth(profile.get().birthDate); state.focus = null; render(); });
  row.append(prev, select, next, current);
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
    if (await persist(completeHealthStage(base, source.items, stage, localDateString(), domain?.id), base)) {
      message(`${stage.label}${scope}全部标记为已观察到，新增 ${remaining} 项；云端确认状态见同步按钮。`);
    } else button.disabled = false;
  }, domain ? 'health-button health-domain-complete' : 'health-button health-stage-complete');
  if (domain) { button.dataset.completeDomain = domain.id; button.dataset.groupStage = stage.id; }
  else button.dataset.completeStage = stage.id;
  button.disabled = writing || !remaining;
  button.setAttribute('aria-label', `${stage.label}${scope}${remaining ? '全部完成' : '全部已完成'}`);
  button.title = `将${stage.label}${scope}全部 ${items.length} 项标记为已观察到，不受${domain ? '状态' : '能区和状态'}筛选影响；保留已有观察日期和手记`;
  return button;
}
function itemRow(item, { showStage = false, trail = true, timing = false } = {}) {
  const record = records()[item.id] || {};
  const row = node('article', 'health-item'); row.dataset.item = item.id; row.dataset.observed = record.status === 'observed';
  row.classList.toggle('is-focus', state.focus === item.id);
  const toggle = btn(record.status === 'observed' ? '✓' : '', async () => {
    if (writing) return;
    const base = structuredClone(snapshot || emptyHealth()), next = structuredClone(base);
    const value = { ...next.records[item.id] };
    if (value.status === 'observed') { delete value.status; delete value.observedAt; }
    else { value.status = 'observed'; value.observedAt = localDateString(); }
    if (Object.keys(value).length) next.records[item.id] = value; else delete next.records[item.id];
    await persist(next, snapshot === null ? null : base);
  }, 'health-check');
  toggle.setAttribute('aria-label', (record.status === 'observed' ? '撤回已观察到：' : '标记已观察到：') + item.title);
  toggle.setAttribute('aria-pressed', record.status === 'observed'); toggle.disabled = writing;
  const open = btn('', () => openItem(item.id), 'health-item-open');
  const title = node('span', 'health-item-title', item.title);
  const flags = node('span', 'health-flags');
  if (item.parentReport) flags.append(node('abbr', '', 'R'));
  if (item.attention) flags.append(node('abbr', '', '*'));
  for (const flag of flags.children) flag.title = flag.textContent === 'R' ? '原文：可询问家长' : '原文：未通过需引起注意';
  title.append(flags);
  const stage = healthStage(item.month), actual = currentStage();
  const ageLabel = stage.id === actual.id ? '当前阶段' : stage.max < actual.min ? '此前阶段' : HEALTH_STAGES.indexOf(stage) === HEALTH_STAGES.indexOf(actual) + 1 ? '下一阶段' : '更后阶段';
  const meta = node('span', 'health-item-meta', `${timing ? ageLabel + ' · ' : ''}${showStage ? stage.label + ' · ' : ''}标准 ${item.month} 月龄${record.status ? ' · ' + OBSERVATION_LABELS[record.status] : ''}${record.note ? ' · 有手记' : ''}`);
  open.append(title, meta); row.append(toggle, open);
  if (trail) row.append(iconButton('tree', `查看${item.title}的能力脉络`, () => {
    state.focus = item.id; state.month = item.month; state.domain = item.domain; state.view = 'overview'; state.search = ''; render();
    document.querySelector('.health-lineage')?.scrollIntoView({ block: 'start' });
  }));
  return row;
}
function render() {
  if (!source) return;
  const oldViewport = document.querySelector('.health-lineage-viewport');
  const oldScroll = oldViewport && { left: oldViewport.scrollLeft, top: oldViewport.scrollTop, key: oldViewport.dataset.key };
  if (!shell) {
    shell = window.XiaoyaSite.createShell({ sectionId: 'growth', siteRoot: './', onNavigate: navigate });
    document.querySelector('#app').replaceChildren(shell.element);
  }
  saveView();
  shell.update({ navigation: navigation(), activeId: state.view, title: '卫健委版 · ' + viewLabels[state.view] });
  shell.actions.replaceChildren(sync.createButton(), iconButton('settings', '本版记录与备份', openBackup));
  const main = node('div', 'health-content'); main.append(versions());
  const head = node('header', 'health-heading');
  const copy = node('div'); copy.append(node('h1', '', viewLabels[state.view]), node('p', '', 'WS/T 580—2017 · 五能区家庭观察'));
  head.append(copy, summaryStrip()); main.append(head);
  const noticeNode = node('p', 'health-notice', notice); noticeNode.id = 'health-notice'; noticeNode.setAttribute('role', 'status'); noticeNode.hidden = !notice;
  main.append(noticeNode);
  const mode = node('nav', 'health-modes'); mode.setAttribute('aria-label', '观察查看方式');
  for (const [id, label] of Object.entries(viewLabels)) {
    const button = btn(label, () => navigate(id)); button.setAttribute('aria-pressed', state.view === id); mode.append(button);
  }
  const stageControls = node('div', 'health-stage-controls');
  stageControls.append(state.view === 'next' ? node('p', 'health-next-context', `当前阶段 ${currentStage().label} · 按观察记录继续探索`) : monthPicker());
  main.append(mode, stageControls, domainPicker());
  const toolbar = node('div', 'health-toolbar');
  const statusOptions = state.view === 'next' ? [['all', '全部待探索'], ['unrecorded', '未记录'], ['not-yet', '暂未观察到']] : [['all', '全部状态'], ...Object.entries(OBSERVATION_LABELS)];
  const status = optionsSelect('按观察状态筛选', statusOptions, state.status, value => { state.status = value; render(); });
  toolbar.append(status);
  const search = node('input', 'health-search'); search.type = 'search'; search.placeholder = '搜索项目、方法或编号'; search.setAttribute('aria-label', state.view === 'next' ? '搜索下一步待探索项目' : '搜索本版本全部月龄项目'); search.value = state.search;
  search.addEventListener('input', () => { state.search = search.value; state.limit = 8; renderResults(); saveView(); });
  toolbar.append(search); main.append(toolbar);
  main.append(node('div', 'health-results'));
  const footer = node('footer', 'health-footer');
  footer.append(node('p', '', 'R 可询问家长 · * 原文注明未通过需引起注意。'), node('p', '', '家庭观察记录 · 原始月龄与测查条件见项目详情。'));
  main.append(footer); shell.content.replaceChildren(main); renderResults(oldScroll);
}
function renderResults(previousScroll) {
  const target = document.querySelector('.health-results');
  if (!target) return;
  const oldViewport = target.querySelector('.health-lineage-viewport');
  const oldScroll = previousScroll || oldViewport && { left: oldViewport.scrollLeft, top: oldViewport.scrollTop, key: oldViewport.dataset.key };
  const searchAll = Boolean(state.search.trim()), stage = state.view === 'next' ? currentStage() : selectedStage();
  target.replaceChildren();
  if (state.view === 'overview' && !searchAll) { renderLineage(target, oldScroll); return; }
  const pool = state.view === 'next' ? nextHealthItems(source.items, records(), stage)
    : state.view === 'month' && !searchAll ? stageHealthItems(source.items, stage) : source.items;
  const items = filterHealth(pool, records(), { ...state, month: undefined });
  const info = node('div', 'health-results-heading');
  const all = btn('全部能区', () => { state.domain = 'all'; render(); }); all.setAttribute('aria-pressed', state.domain === 'all');
  const heading = node('h2', '', state.view === 'next' ? '接着探索' : searchAll ? `全月龄搜索 · ${items.length} 项` : stage.label);
  if (!searchAll && state.view !== 'next') heading.append(node('span', 'health-results-label', ' · 观察清单'));
  info.append(heading, node('small', '', `${items.length} 项`), all);
  if (state.view === 'month' && !searchAll) info.append(stageCompleteButton(stage));
  target.append(info);
  if (state.view === 'next') target.append(node('p', 'health-next-hint', '保留当前及此前未观察项目，各能区从最新观察月龄继续下一组；同组其余项目也会保留。月龄顺序不是能力前置条件。'));
  if (!items.length) target.append(node('p', 'health-empty', '没有符合条件的项目。可以切换阶段、能区或观察状态。'));
  else {
    const list = node('div', 'health-groups');
    if (!searchAll || state.view === 'next') {
      for (const domain of HEALTH_DOMAINS) {
        const groupItems = items.filter(item => item.domain === domain.id); if (!groupItems.length) continue;
        const group = node(state.view === 'next' ? 'section' : 'details', 'health-group'); group.dataset.domain = domain.id;
        if (state.view !== 'next') {
          const key = `${state.view}:${stage.id}:${domain.id}`;
          group.open = expandedGroups.get(key) ?? false;
          group.addEventListener('toggle', () => expandedGroups.set(key, group.open));
        }
        const title = node(state.view === 'next' ? 'header' : 'summary', 'health-group-heading');
        title.append(node('strong', '', domain.label), node('span', '', state.view === 'next' ? `待探索 ${groupItems.length}` : `${observationStats(groupItems, records()).observed} / ${groupItems.length}`)); group.append(title);
        if (state.view === 'month' && !searchAll) {
          title.classList.add('health-group-with-actions');
          title.append(stageCompleteButton(stage, domain));
        }
        const rows = node('div', 'health-items');
        // 优先当前阶段及已推进的后续项目，此前记录也直接完整显示。
        const priority = item => healthStage(item.month).id === stage.id ? 0 : item.month > stage.max ? 1 : 2;
        const ordered = state.view === 'next' ? [...groupItems].sort((a, b) => priority(a) - priority(b) || a.month - b.month || a.number - b.number) : groupItems;
        rows.append(...ordered.map(item => itemRow(item, { showStage: state.view === 'next', timing: state.view === 'next' }))); group.append(rows);
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
    target.append(list);
  }
  if (state.view === 'month' && !searchAll) renderLineage(target, oldScroll);
}
function renderLineage(target, oldScroll) {
  const domain = HEALTH_DOMAINS.find(d => d.id === state.domain) || HEALTH_DOMAINS[0];
  const stage = selectedStage();
  const focused = source.items.find(item => item.id === state.focus && item.domain === domain.id);
  const section = node('section', 'health-lineage'); section.setAttribute('aria-label', domain.label + '能力脉络');
  const header = node('div', 'health-lineage-heading');
  header.append(node('h2', '', domain.label + ' · 能力脉络'));
  const locate = () => {
    const current = section.querySelector(focused ? `[data-item="${focused.id}"]` : `[data-stage="${stage.id}"]`);
    const viewport = section.querySelector('.health-lineage-viewport');
    if (!current || !viewport) return;
    const a = current.getBoundingClientRect(), b = viewport.getBoundingClientRect();
    viewport.scrollLeft += a.left - b.left - (viewport.clientWidth - a.width) / 2;
    if (focused) viewport.scrollTop += a.top - b.top - (viewport.clientHeight - a.height) / 2;
    else viewport.scrollTop = 0;
  };
  const locateButton = iconButton('baby', focused ? '定位当前项目' : '定位所选阶段', locate);
  if (state.view === 'overview') header.append(stageCompleteButton(stage));
  header.append(locateButton); section.append(header);
  section.append(node('p', 'health-lineage-note', focused ? `正在看：${focused.title} · 按月龄排列，可左右滑动` : '按标准月龄排列，可左右滑动；相邻项目不代表前置要求。'));
  const viewport = node('div', 'health-lineage-viewport'); viewport.tabIndex = 0; viewport.setAttribute('aria-label', domain.label + '月龄脉络，可左右滚动');
  viewport.dataset.key = `${domain.id}:${stage.id}:${focused?.id || ''}`;
  const board = node('div', 'health-lineage-board');
  for (const step of HEALTH_STAGES) {
    const column = node('section', 'health-lineage-stage'); column.dataset.stage = step.id;
    column.classList.toggle('is-current', stage.id === step.id);
    const heading = btn(step.label, () => { state.month = HEALTH_MONTHS.find(month => month >= step.min); state.focus = null; state.view = 'month'; render(); }, 'health-lineage-stage-title');
    if (stage.id === step.id) heading.setAttribute('aria-current', 'step');
    column.append(heading);
    const items = stageHealthItems(source.items, step).filter(item => item.domain === domain.id);
    column.append(...items.map(item => itemRow(item, { trail: false }))); board.append(column);
  }
  viewport.append(board); section.append(viewport); target.append(section);
  requestAnimationFrame(() => {
    if (!viewport.isConnected) return;
    const column = board.querySelector(`[data-stage="${focused ? healthStage(focused.month).id : stage.id}"]`);
    viewport.style.height = `${Math.min(570, column.offsetHeight + 26)}px`;
    if (oldScroll?.key === viewport.dataset.key) { viewport.scrollLeft = oldScroll.left; viewport.scrollTop = oldScroll.top; }
    else locate();
  });
}
async function persist(next, base) {
  writing = true; message('正在保存本机观察记录…');
  try {
    snapshot = await store.apply(M.normalize('health', next), base);
    writing = false; notice = '已保存本机；云端确认状态见右上同步按钮。'; render();
    void sync.changed('health').catch(error => message('本机已保存，同步待重试：' + error.message, true));
    return true;
  } catch (error) {
    message(error.code === 'MERGE_CONFLICT' ? '另一页面修改了同一项，尚未覆盖。请关闭详情后重新打开核对，再保存。' : error.message, true);
    return false;
  } finally { writing = false; }
}
function modal(title, { stack = false } = {}) {
  const previous = detail;
  if (!stack && detail?.open && !detail.requestClose()) return null;
  const focus = document.activeElement;
  const dialog = node('dialog', 'health-dialog'); dialog.setAttribute('aria-label', title);
  const header = node('header', 'health-dialog-head');
  dialog.requestClose = () => {
    if (dialog.isDirty?.() && !window.confirm('观察内容尚未保存，确认放弃这次编辑吗？')) return false;
    dialog.close(); return true;
  };
  header.append(node('h2', '', title), shell.createSectionSwitch(), iconButton('close', '关闭详情', () => dialog.requestClose()));
  const body = node('div', 'health-dialog-body');
  dialog.append(header, body); document.body.append(dialog);
  dialog.addEventListener('click', e => { const b = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)) dialog.requestClose(); });
  dialog.addEventListener('cancel', e => { e.preventDefault(); dialog.requestClose(); });
  dialog.addEventListener('close', () => {
    const wasCurrent = detail === dialog;
    dialog.remove(); if (wasCurrent) detail = stack && previous?.isConnected ? previous : null;
    document.body.classList.toggle('health-modal-open', Boolean(document.querySelector('.health-dialog[open]')));
    const params = new URLSearchParams(location.hash.slice(1)); if (!stack && wasCurrent && params.has('item')) { params.delete('item'); history.replaceState(null, '', '#' + params); }
    if (focus?.isConnected) focus.focus({ preventScroll: true }); else shell.content.focus({ preventScroll: true });
  });
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
  dialog.addEventListener('close', () => window.removeEventListener('beforeunload', beforeUnload), { once: true });
}
function openItem(id) {
  const item = source.items.find(item => item.id === id); if (!item) return;
  const opened = modal(item.title); if (!opened) return;
  const { dialog, body } = opened;
  state.focus = id;
  document.querySelectorAll('.health-lineage .health-item').forEach(row => row.classList.toggle('is-focus', row.dataset.item === id));
  const params = new URLSearchParams(location.hash.slice(1)); params.set('item', id); params.set('focus', id); history.replaceState(null, '', '#' + params);
  const base = structuredClone(snapshot), value = records()[id] || {};
  body.append(versions(item.id));
  body.append(node('p', 'health-detail-meta', `${healthStage(item.month).label} · 原标准 ${item.month} 月龄 · ${HEALTH_DOMAINS.find(d => d.id === item.domain).label} · #${item.number}`));
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
  const dateLabel = node('label', '', '观察日期'); const date = node('input'); date.type = 'date'; date.value = value.observedAt || localDateString(); date.setAttribute('aria-label', '观察日期'); dateLabel.append(date);
  const noteLabel = node('label', '', '观察手记'); const note = node('textarea'); note.maxLength = 2000; note.rows = 3; note.value = value.note || ''; note.setAttribute('aria-label', '观察手记'); noteLabel.append(note);
  const error = node('p', 'health-form-error'); error.setAttribute('role', 'alert');
  const save = node('button', 'health-primary', '保存观察'); save.type = 'submit';
  form.append(label, dateLabel, noteLabel, error, save);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (writing) return;
    const next = structuredClone(base || emptyHealth()), record = {};
    if (status.value !== 'unrecorded') { record.status = status.value; record.observedAt = date.value; }
    if (note.value) record.note = note.value;
    if (Object.keys(record).length) next.records[id] = record; else delete next.records[id];
    save.disabled = true;
    if (await persist(next, base)) dialog.close(); else { error.textContent = notice; save.disabled = false; }
  });
  body.append(form);
  protectForm(form, dialog);
  const adjacent = source.items.filter(other => other.domain === item.domain);
  const index = adjacent.findIndex(other => other.id === id);
  const nav = node('nav', 'health-adjacent'); nav.setAttribute('aria-label', '同能区前后项目，按标准月龄顺序');
  for (const [label, other] of [['上一项', adjacent[index - 1]], ['下一项', adjacent[index + 1]]]) if (other) nav.append(btn(`${label} · ${other.title}`, () => openItem(other.id)));
  body.append(nav);
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
        if (await persist(result.snapshot, base)) detail?.close(); else { error.textContent = notice; submit.disabled = false; }
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
  form.addEventListener('submit', async e => { e.preventDefault(); try { await profile.save({ ...base, name: input.value }, base); dialog.close(); } catch (failure) { error.textContent = failure.message; } });
  body.append(form);
  protectForm(form, dialog);
}
async function refresh() {
  if (!store || writing) return;
  try { const latest = await store.read(); if (!M.equal(latest, snapshot)) { snapshot = latest; render(); } } catch (error) { message(error.message, true); }
}
async function start() {
  try {
    const response = await fetch('./data/health-standard.json'); if (!response.ok) throw new Error('标准项目暂未加载成功。'); source = await response.json();
    await profile.init();
    const params = new URLSearchParams(location.hash.slice(1));
    state.month = HEALTH_MONTHS.includes(Number(params.get('month'))) ? Number(params.get('month')) : referenceMonth(profile.get().birthDate);
    if (['month', 'overview', 'next'].includes(params.get('view'))) state.view = params.get('view');
    if (HEALTH_DOMAINS.some(d => d.id === params.get('domain'))) state.domain = params.get('domain');
    if (Object.hasOwn(OBSERVATION_LABELS, params.get('status'))) state.status = params.get('status');
    if (state.view === 'next' && state.status === 'observed') state.status = 'all';
    state.search = params.get('q') || '';
    state.focus = source.items.some(item => item.id === params.get('focus')) ? params.get('focus') : null;
    store = window.XiaoyaSyncAdapters.createAdapters({ indexedDB, localStorage, profileClient: profile }).health;
    snapshot = await store.read();
    sync = window.XiaoyaSync.createClient({ siteRoot: './', profileClient: profile });
    sync.subscribe(area => { if (area === 'health') void refresh(); });
    profile.subscribe(() => { if (source && sync) render(); });
    render(); if (params.get('item')) openItem(params.get('item'));
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  } catch (error) {
    const box = node('main', 'health-loading'); box.append(node('h1', '', '卫健委版暂未加载'), node('p', '', error.message), btn('重新加载', () => location.reload())); document.querySelector('#app').replaceChildren(box);
  }
}
void start();
