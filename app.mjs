import { STAGES, DOMAINS, DEFAULT_PROFILE, localDateString, getAge, getStageForAge, getStageSkills, getStats, toggleRecord, validateBackup } from './lib/model.mjs';
import { getSkillRelations, getBranchGraph, getLineagePaths, layoutGraph } from './lib/graph.mjs';
import { STORAGE_KEY, VIEW_STORAGE_KEY, readGrowthSnapshot, createGrowthStore } from './lib/storage.mjs';

const app = document.querySelector('#app');
let catalog = [];
let resources = {};
let toastTimer;
let pendingImport;
const state = { profile: { ...DEFAULT_PROFILE }, records: {}, view: 'baby', stage: 's5', domain: 'all', status: 'all', search: '', treeDomain: 'cognition', treeCategory: 'all', treeMode: 'lineage', treeFocus: null, graphZoom: .85, graphExpanded: false, storageError: '', recoveryRaw: null, lastUndo: null };
state.savedAt = null;
state.viewStorageError = '';
state.savePending = false;
state.hasUnsavedChanges = false;
state.storageReadFailed = false;
let lastSavedView = null;
let growthStore = null;
let lastCommittedGrowth = null;
let saveQueue = Promise.resolve();
let saveRevision = 0;
let pendingSaves = 0;
let syncChannel = null;
let currentGraph = null;
let graphViewportAction = null;
let lastCalendarDate = localDateString();
let lastCurrentStage = null;

// @CfSecAICode 遵循消费金融安全编码 FE-XSS-001 规范: 模板只解析静态结构，动态内容通过文本节点和属性 API 写入。
function html(strings, ...values) {
  const template = document.createElement('template');
  template.innerHTML = strings.reduce((result, part, index) => result + part + (index < values.length ? `__slot_${index}__` : ''), '');
  const fragment = template.content;
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const marker = /__slot_(\d+)__/g;
  const append = (parent, value) => {
    if (Array.isArray(value)) value.forEach(item => append(parent, item));
    else if (value instanceof Node) parent.append(value);
    else if (value !== null && value !== undefined && value !== false) parent.append(document.createTextNode(String(value)));
  };
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('__slot_')) {
      const content = document.createDocumentFragment();
      const text = node.textContent;
      let cursor = 0;
      for (const match of text.matchAll(marker)) {
        content.append(document.createTextNode(text.slice(cursor, match.index)));
        append(content, values[Number(match[1])]);
        cursor = match.index + match[0].length;
      }
      content.append(document.createTextNode(text.slice(cursor)));
      node.replaceWith(content);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (const attribute of [...node.attributes]) {
        if (!attribute.value.includes('__slot_')) continue;
        const exact = /^__slot_(\d+)__$/.exec(attribute.value);
        if (exact && ['disabled', 'checked', 'selected', 'hidden', 'required'].includes(attribute.name)) {
          if (values[Number(exact[1])]) node.setAttribute(attribute.name, '');
          else node.removeAttribute(attribute.name);
        } else {
          node.setAttribute(attribute.name, attribute.value.replace(marker, (_, index) => String(values[Number(index)] ?? '')));
        }
      }
    }
  }
  return fragment;
}

const paths = {
  sprout: ['M12 21v-9', 'M12 14C5 15 3 9 3 5c7-1 10 3 9 9Z', 'M12 10c0-6 4-8 9-7 0 6-3 9-9 7Z'],
  baby: ['M9 3a9 9 0 1 0 6 0', 'M9 3c0 4 6 4 6 0', 'M8 11h.01M16 11h.01', 'M9 16c2 2 4 2 6 0'],
  calendar: ['M8 2v4M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z', 'M8 14h2M14 14h2M8 18h2'],
  tree: ['M12 3v18M5 21v-5h14v5M5 10V7h14v3', 'M9 3h6v5H9zM2 10h6v5H2zM16 10h6v5h-6zM9 17h6v5H9z'],
  cognition: ['M9 18h6M9 21h6', 'M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z', 'M12 3V1M3 9H1M23 9h-2'],
  sensory: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  gross: ['M14 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M6 9l5-3 4 3 5 1M11 6l-2 7 5 3 1 6M9 13l-4 7'],
  fine: ['M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-3l2 3Z'],
  chevron: ['m9 5 7 7-7 7'],
  check: ['m5 12 4 4L19 6'],
  close: ['m6 6 12 12M6 18 18 6'],
  search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', 'm17 17 4 4'],
  download: ['M12 3v12m-5-5 5 5 5-5', 'M4 16v5h16v-5'],
  upload: ['M12 16V4m-5 5 5-5 5 5', 'M4 16v5h16v-5'],
  book: ['M12 6v15M12 6C8 3 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-3-1-6-1-10 2Z'],
  settings: ['M4 7h16M4 17h16', 'M8 4v6M16 14v6'],
  note: ['M14 3H4v18h16V9Z', 'M14 3v6h6M8 13h8M8 17h5'],
  arrow: ['M4 12h16m-6-6 6 6-6 6'],
  heart: ['M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-6 6 8 15 8 15S26 11 20 5Z'],
  info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 'M12 11v6M12 7h.01'],
  expand: ['M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5'],
};
function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.65', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: `icon ${className}` })) svg.setAttribute(key, value);
  for (const d of paths[name] || paths.sprout) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function babyAge() { return getAge(state.profile.birthDate); }
function currentStage() { const age = babyAge(); return age ? getStageForAge(age.totalMonths) : null; }
function selectedStage() { return STAGES.find(stage => stage.id === state.stage) || STAGES[0]; }
function isDone(id) { return Boolean(state.records[id]?.completedAt); }
function domainInfo(id) { return DOMAINS.find(domain => domain.id === id); }
function dateLabel(value) { return value.split('-').join('.'); }
function skillStageLabel(skill) {
  const start = STAGES.find(stage => stage.id === skill.stage);
  const end = skill.endStage && STAGES.find(stage => stage.id === skill.endStage);
  return end ? `${start.minMonths}–${end.id === 's7' ? 36 : end.maxMonths}个月` : start.label;
}

function persist() {
  if (state.recoveryRaw !== null) { updateSaveStatus(); return Promise.resolve(false); }
  const revision = ++saveRevision;
  const snapshot = growthSnapshot(state);
  pendingSaves += 1;
  state.savePending = true;
  state.hasUnsavedChanges = true;
  state.storageError = '';
  updateSaveStatus();
  const task = saveQueue.then(async () => {
    growthStore ||= createGrowthStore(window.indexedDB, catalog.map(skill => skill.id));
    if (state.storageReadFailed) {
      const existing = await growthStore.load();
      if (existing && growthFingerprint(existing) !== growthFingerprint(snapshot)) throw new Error('已有记录已可读取，请先导出当前修改，再刷新恢复已有记录。');
      lastCommittedGrowth = existing && growthSnapshot(existing);
      state.storageReadFailed = false;
    }
    const savedAt = await growthStore.save(snapshot, lastCommittedGrowth);
    lastCommittedGrowth = snapshot;
    return savedAt;
  });
  saveQueue = task.catch(() => {});
  return task.then(savedAt => {
    pendingSaves -= 1;
    state.savePending = pendingSaves > 0;
    if (revision === saveRevision) {
      state.savedAt = savedAt;
      state.storageError = '';
      state.hasUnsavedChanges = false;
      syncChannel?.postMessage('records-updated');
      void syncGrowth();
    }
    updateSaveStatus();
    return true;
  }, () => {
    pendingSaves -= 1;
    state.savePending = pendingSaves > 0;
    if (revision === saveRevision) state.storageError = '记录尚未保存到本机。请重试保存，或导出备份后再离开。浏览器或网页预览环境可能禁止了存储。';
    updateSaveStatus();
    return false;
  });
}

function saveProblem() { return state.storageError || state.viewStorageError; }
function saveLabel() { return saveProblem() ? '保存异常' : state.savePending ? '正在保存' : state.savedAt ? '已保存' : '本机保存'; }
function saveTimeLabel() {
  return state.savedAt ? new Date(state.savedAt).toLocaleString('zh-CN', { hour12: false }) : '已读取本机记录';
}

function updateSaveStatus() {
  const button = document.querySelector('[data-action="storage-status"]');
  if (button) {
    button.classList.toggle('has-error', Boolean(saveProblem()));
    button.classList.toggle('is-saving', state.savePending);
    button.setAttribute('aria-label', `本机保存状态：${saveLabel()}`);
    button.title = saveProblem() || `${saveTimeLabel()}，刷新后自动恢复`;
    button.querySelector('[data-save-label]').textContent = saveLabel();
  }
  const warning = document.querySelector('#storage-warning');
  if (warning) {
    warning.hidden = !saveProblem();
    warning.querySelector('[data-storage-error]').textContent = saveProblem();
  }
  const inlineStatus = document.querySelector('#skill-form .form-actions small');
  if (inlineStatus) {
    inlineStatus.classList.toggle('save-failed', Boolean(state.storageError));
    inlineStatus.textContent = state.storageError ? '本次修改尚未保存，请先导出备份。' : state.savePending ? '正在保存到本机…' : '手记和完成状态自动保存到当前浏览器';
  }
}

function persistView() {
  const raw = JSON.stringify({ version: 1, view: state.view, stage: state.stage, followsCurrent: state.view === 'baby' && state.stage === currentStage()?.id, domain: state.domain, treeDomain: state.treeDomain, treeCategory: state.treeCategory, treeMode: state.treeMode, treeFocus: state.treeFocus });
  if (raw === lastSavedView) return;
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, raw);
    if (localStorage.getItem(VIEW_STORAGE_KEY) !== raw) throw new Error('查看位置未能保存');
    lastSavedView = raw;
    state.viewStorageError = '';
  } catch {
    state.viewStorageError = '查看位置未能保存，刷新后可能返回宝宝当前年龄。请检查浏览器是否允许本机存储。';
  }
}

function restoreView() {
  let raw;
  try { raw = localStorage.getItem(VIEW_STORAGE_KEY); }
  catch { state.viewStorageError = '当前浏览器无法读取已保存的查看位置。'; return; }
  if (!raw) return;
  let view;
  try { view = JSON.parse(raw); } catch { return; }
  if (!view || view.version !== 1) return;
  if (['baby', 'age', 'tree'].includes(view.view)) state.view = view.view;
  if (STAGES.some(stage => stage.id === view.stage)) state.stage = view.stage;
  if (state.view === 'baby' && view.followsCurrent) state.stage = currentStage()?.id || state.stage;
  if (view.domain === 'all' || DOMAINS.some(domain => domain.id === view.domain)) state.domain = view.domain;
  if (DOMAINS.some(domain => domain.id === view.treeDomain)) state.treeDomain = view.treeDomain;
  if (['lineage', 'overview'].includes(view.treeMode)) state.treeMode = view.treeMode;
  if (view.treeCategory === 'all' || catalog.some(skill => skill.domain === state.treeDomain && skill.category === view.treeCategory)) state.treeCategory = view.treeCategory;
  if (catalog.some(skill => skill.domain === state.treeDomain && skill.id === view.treeFocus)) state.treeFocus = view.treeFocus;
  if (state.view === 'tree') graphViewportAction = 'focus';
}

function growthFingerprint(data) {
  return JSON.stringify([data.profile.name, data.profile.birthDate, Object.keys(data.records).sort().map(id => [id, { completedAt: data.records[id].completedAt, note: data.records[id].note }])]);
}

function growthSnapshot(data) {
  return { profile: { ...data.profile }, records: Object.fromEntries(Object.entries(data.records).map(([id, record]) => [id, { ...record }])) };
}

function applyGrowth(data) {
  state.profile = data.profile;
  state.records = data.records;
  state.savedAt = data.savedAt;
}

async function restoreGrowth() {
  let legacyRaw = null;
  try { legacyRaw = localStorage.getItem(STORAGE_KEY); } catch { /* IndexedDB 可用时，旧缓存不可读不阻止使用。 */ }
  try {
    growthStore = createGrowthStore(window.indexedDB, catalog.map(skill => skill.id));
    let loaded;
    try { loaded = await growthStore.load(); }
    catch (error) { state.storageReadFailed = true; throw error; }
    if (loaded) {
      applyGrowth(loaded);
    } else {
      let initial = growthSnapshot(state);
      if (legacyRaw) {
        try { initial = readGrowthSnapshot(legacyRaw, catalog.map(skill => skill.id)); }
        catch (error) { state.recoveryRaw = legacyRaw; throw error; }
        applyGrowth(initial);
      }
      let initialized = true;
      try { await growthStore.save(initial); }
      catch (error) {
        if (error.code !== 'INITIALIZATION_CONFLICT') throw error;
        initialized = false;
      }
      const verified = await growthStore.load();
      if (!verified || (initialized && growthFingerprint(initial) !== growthFingerprint(verified))) throw new Error('初始记录保存校验失败');
      applyGrowth(verified);
    }
    if (legacyRaw && state.recoveryRaw === null) {
      try {
        const legacy = readGrowthSnapshot(legacyRaw, catalog.map(skill => skill.id));
        if (growthFingerprint(legacy) === growthFingerprint(state)) localStorage.removeItem(STORAGE_KEY);
      } catch { /* 尚未确认一致的旧数据继续保留，不覆盖新库。 */ }
    }
    lastCommittedGrowth = growthSnapshot(state);
  } catch {
    if (!lastCommittedGrowth) state.storageReadFailed = true;
    if (legacyRaw && state.recoveryRaw === null && !state.savedAt) {
      try { applyGrowth(readGrowthSnapshot(legacyRaw, catalog.map(skill => skill.id))); }
      catch { state.recoveryRaw = legacyRaw; }
    }
    state.storageError = state.recoveryRaw !== null ? '已有记录未能读取，原始记录已保留。请先导出原始备份，再导入修复后的记录。' : '本机数据库暂时不可用，记录尚未确认保存。请重试保存，或导出备份后再离开。';
  }
}

function notify(message, undo = false) {
  clearTimeout(toastTimer);
  const toast = document.querySelector('#toast');
  toast.replaceChildren(html`${icon('check')}<span>${message}</span>${undo ? html`<button data-action="undo">撤销</button>` : ''}`);
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), undo ? 6500 : 3800);
}

function sidebar() {
  const current = currentStage();
  const overall = getStats(catalog, state.records);
  return html`<aside class="sidebar">
    <a class="brand" href="#" data-action="home" aria-label="小芽首页"><span class="brand-mark">${icon('sprout')}</span><span>小芽<small>宝宝成长技能树</small></span></a>
    <div class="sidebar-section-label">一起慢慢长大</div>
    <nav class="main-nav" aria-label="查看方式">
      ${[{ id: 'baby', label: '宝宝视角', icon: 'baby' }, { id: 'age', label: '按年龄看', icon: 'calendar' }, { id: 'tree', label: '技能全景', icon: 'tree' }].map(view => html`<button class="nav-item ${state.view === view.id ? 'active' : ''}" data-view="${view.id}" aria-current="${state.view === view.id ? 'page' : 'false'}">${icon(view.icon)}<span>${view.label}</span>${state.view === view.id ? html`<span class="nav-active-dot"></span>` : ''}</button>`)}
    </nav>
    <div class="sidebar-section-label stage-nav-label">成长的每一站 <span>0–6岁</span></div>
    <nav class="stage-nav" aria-label="年龄阶段">
      ${STAGES.map(stage => {
        const stats = getStats(getStageSkills(catalog, stage.id), state.records);
        return html`<button class="stage-nav-item ${state.stage === stage.id && state.view !== 'tree' ? 'selected' : ''}" data-stage="${stage.id}"><span class="stage-dot ${stats.total && stats.completed === stats.total ? 'filled' : ''}"></span><span>${stage.label}</span>${current?.id === stage.id ? html`<small>当前</small>` : html`<span class="stage-mini-count">${stats.completed}/${stats.total}</span>`}</button>`;
      })}
    </nav>
    <div class="sidebar-bottom"><div class="garden-note">${icon('sprout')}<p>成长有自己的节奏<br /><span>每一点进步，都值得珍藏。</span></p></div>
      <button class="profile-button" data-action="profile"><span class="avatar">${state.profile.name.slice(0, 1)}</span><span class="profile-text"><strong>${state.profile.name}的成长花园</strong><small>已收藏 ${overall.completed} 个成长瞬间</small></span>${icon('settings')}</button>
    </div>
  </aside>`;
}

function plant() {
  return html`<div class="garden-art" aria-hidden="true"><span class="art-orbit orbit-one"></span><span class="art-orbit orbit-two"></span><span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✧</span>
    <svg class="plant" viewBox="0 0 300 245" fill="none"><ellipse cx="150" cy="222" rx="83" ry="10" fill="#cfdbbf" opacity=".55"/><path d="M150 178C154 148 145 122 151 88" stroke="#627e4c" stroke-width="5" stroke-linecap="round"/><path d="M150 139C107 145 86 115 93 90c38-6 64 17 57 49Z" fill="#9bb57c"/><path d="M151 114c-4-42 18-64 51-65 8 38-13 68-51 65Z" fill="#587b52"/><path d="m151 138-37-30m38 3 31-41" stroke="#edf1df" stroke-width="2" opacity=".7" stroke-linecap="round"/><path d="M150 94c-26-9-34-31-27-50 26 6 38 28 27 50Z" fill="#c1ce94"/><path d="M107 170h87l-9 44a13 13 0 0 1-13 10h-44a13 13 0 0 1-13-10Z" fill="#dfbda0"/><path d="M104 170a5 5 0 0 1 5-5h82a5 5 0 0 1 5 5v7h-92Z" fill="#edcfb5"/><path d="M138 191c6 6 18 6 24 0" stroke="#b78d70" stroke-width="2" stroke-linecap="round"/><circle cx="138" cy="186" r="1.5" fill="#b78d70"/><circle cx="162" cy="186" r="1.5" fill="#b78d70"/></svg>
    <span class="floating-badge badge-heart">${icon('heart')}<span>每一小步</span></span><span class="floating-badge badge-leaf">${icon('sprout')}<span>都是成长</span></span>
  </div>`;
}

function hero() {
  const age = babyAge();
  const current = currentStage();
  const overall = getStats(catalog, state.records);
  return html`<section class="hero"><div class="hero-copy"><div class="eyebrow"><span></span> 陪伴小小的你，探索大大的世界</div><h1>小小的进步，<br />慢慢长成大大的世界<span>。</span></h1><p>陪${state.profile.name}探索，收藏每一个「我会啦」的瞬间。</p><div class="baby-meta"><span class="age-pill">${icon('baby')}${age?.label || '等待宝宝到来'}</span><span class="birth-label">${dateLabel(state.profile.birthDate)} 出生</span><button class="text-button" data-action="profile" aria-label="编辑宝宝资料">${icon('settings')}</button></div></div>${plant()}<div class="hero-counter"><strong>${overall.completed}<span> / ${overall.total}</span></strong><small>颗成长小芽已点亮</small><span class="counter-leaves">${icon('sprout')}</span></div></section>`;
}

function stageNavigator() {
  const stage = selectedStage();
  const current = currentStage();
  const index = STAGES.indexOf(stage);
  const preview = state.view === 'baby' && current?.id !== stage.id;
  return html`<section class="stage-picker" aria-label="切换成长阶段">
    <div class="stage-picker-heading"><span class="section-kicker">${state.view === 'baby' ? '跟着宝宝的节奏' : '探索每个成长阶段'}</span><span class="swipe-hint">左右滑动，看看前后阶段 ${icon('arrow')}</span></div>
    <div class="stage-picker-controls"><button class="circle-button" data-action="prev-stage" aria-label="前一阶段" disabled="${index === 0}">${icon('chevron', 'rotate')}</button><div class="stage-track" id="stage-track">${STAGES.map(item => html`<button class="stage-pill ${item.id === stage.id ? 'active' : ''}" data-stage="${item.id}" aria-pressed="${item.id === stage.id}"><span>${item.shortLabel}</span>${item.id === current?.id ? html`<span class="current-stage-dot" title="宝宝当前阶段"></span>` : ''}</button>`)}</div><button class="circle-button" data-action="next-stage" aria-label="下一阶段" disabled="${index === STAGES.length - 1}">${icon('chevron')}</button></div>
    ${preview ? html`<div class="preview-caption">正在预览 ${stage.label}<button class="text-button" data-action="current-stage">回到宝宝当前阶段 ${icon('arrow')}</button></div>` : !current && state.view === 'baby' ? html`<div class="preview-caption">${babyAge() ? '宝宝已超出图谱年龄范围，可以继续回顾每个阶段。' : '宝宝还未出生，可以先预览各阶段。'}</div>` : ''}
  </section>`;
}

function domainCards() {
  const stageSkills = getStageSkills(catalog, state.stage);
  return html`<section class="domain-cards" aria-label="各领域进度">${DOMAINS.map(domain => {
    const stats = getStats(stageSkills.filter(skill => skill.domain === domain.id), state.records);
    return html`<button class="domain-card domain-${domain.id} ${state.domain === domain.id ? 'chosen' : ''}" data-domain="${domain.id}" aria-pressed="${state.domain === domain.id}"><span class="domain-card-top"><span class="domain-icon">${icon(domain.id)}</span><span class="domain-count"><strong>${stats.completed}</strong> / ${stats.total}</span></span><span class="domain-card-label">${domain.label}<span>${stats.percent}%</span></span><span class="progress-track"><span style="width: ${stats.percent}%"></span></span></button>`;
  })}</section>`;
}

function skillRow(skill, tree = false) {
  const record = state.records[skill.id];
  const done = isDone(skill.id);
  return html`<article class="skill-row ${done ? 'completed' : ''} ${tree ? 'tree-node' : ''}" data-node="${tree ? skill.id : ''}" data-skill-id="${skill.id}"><button class="skill-check ${done ? 'is-checked' : ''}" data-toggle="${skill.id}" aria-label="${done ? '撤销完成：' : '标记完成：'}${skill.title}" aria-pressed="${done}">${done ? icon('check') : ''}</button><button class="skill-open" data-detail="${skill.id}"><span class="skill-title">${skill.title}</span><span class="skill-category">${skill.category}${record?.note ? html`<span class="has-note">${icon('note')} 有手记</span>` : ''}</span></button><button class="lineage-entry" data-lineage="${skill.id}" aria-label="查看${skill.title}完整脉络">${icon('tree')}<span>脉络</span></button>${tree ? '' : html`<button class="detail-arrow" data-detail="${skill.id}" aria-label="查看${skill.title}详情">${icon('chevron')}</button>`}</article>`;
}

function resourceSection(config) {
  if (!config || (!config.guidance && !config.enrichment?.length && !config.toyIdeas?.length)) return '';
  return html`<section class="resource-section"><h3>${icon('book')} 陪伴与探索</h3>${config.guidance ? html`<p>${config.guidance}</p>` : ''}${config.enrichment?.length ? html`<h4>全科启蒙</h4><ul>${config.enrichment.map(item => html`<li>${item}</li>`)}</ul>` : ''}${config.toyIdeas?.length ? html`<h4>玩具候选</h4><ul>${config.toyIdeas.map(item => html`<li>${item}</li>`)}</ul>` : ''}</section>`;
}

function milestoneList() {
  const stage = selectedStage();
  const allStageSkills = getStageSkills(catalog, stage.id);
  const stats = getStats(allStageSkills, state.records);
  const needle = state.search.trim().toLocaleLowerCase();
  const skills = allStageSkills.filter(skill => (state.domain === 'all' || skill.domain === state.domain) && (state.status === 'all' || (state.status === 'done' ? isDone(skill.id) : !isDone(skill.id))) && (!needle || `${skill.title} ${skill.category}`.toLocaleLowerCase().includes(needle)));
  return html`<section class="milestones" id="milestones"><div class="section-title-row"><div><div class="section-kicker">属于这个阶段的小发现</div><h2>${stage.label}<span>的小小里程碑</span>${currentStage()?.id === stage.id ? html`<small class="current-badge">当前阶段</small>` : ''}</h2><p>年龄是一份参考，成长有自己的节奏。</p></div><div class="stage-summary"><strong>${stats.completed}<span> / ${stats.total}</span></strong><small>个技能已点亮</small></div></div>
    <div class="list-toolbar"><div class="status-tabs" role="group" aria-label="完成状态"><button data-status="all" class="${state.status === 'all' ? 'active' : ''}" aria-pressed="${state.status === 'all'}">全部 <small>${stats.total}</small></button><button data-status="pending" class="${state.status === 'pending' ? 'active' : ''}" aria-pressed="${state.status === 'pending'}">探索中 <small>${stats.remaining}</small></button><button data-status="done" class="${state.status === 'done' ? 'active' : ''}" aria-pressed="${state.status === 'done'}">已完成 <small>${stats.completed}</small></button></div><label class="search-box">${icon('search')}<input id="skill-search" type="search" value="${state.search}" placeholder="找一个小技能" aria-label="搜索本阶段技能" autocomplete="off" /></label></div>
    ${state.domain !== 'all' ? html`<div class="filter-caption">正在查看：${domainInfo(state.domain).label}<button class="text-button" data-domain="all">查看全部领域 ${icon('close')}</button></div>` : ''}
    ${skills.length ? html`<div class="skill-groups">${DOMAINS.filter(domain => skills.some(skill => skill.domain === domain.id)).map(domain => {
      const items = skills.filter(skill => skill.domain === domain.id);
      const domainStats = getStats(allStageSkills.filter(skill => skill.domain === domain.id), state.records);
      return html`<section class="skill-group domain-${domain.id}"><header class="group-heading"><span class="domain-icon">${icon(domain.id)}</span><div><h3>${domain.label}</h3><p>${domain.description}</p></div><span class="group-count">${domainStats.completed} / ${domainStats.total}</span></header><div class="skill-items">${items.map(skill => skillRow(skill))}</div><div class="group-footer">${icon('sprout')} ${domainStats.completed ? `已经发现 ${domainStats.completed} 份小小的成长` : '新的探索，从这里开始'}</div></section>`;
    })}</div>` : html`<div class="empty-state">${icon(state.status === 'done' ? 'sprout' : 'search')}<h3>${state.search ? '还没找到这个技能' : state.status === 'done' ? '第一颗小芽，等你来点亮' : '这里的小技能都探索过啦'}</h3><p>${state.search ? '换个词试试，或清除筛选看看。' : state.status === 'done' ? '点一下技能旁的圆圈，记下宝宝的成长。' : '可以回顾已完成的技能，或看看下一阶段。'}</p><button class="secondary-button" data-action="clear-filters">查看全部技能</button></div>`}
    ${resourceSection(resources[stage.id])}
    <div class="list-footnote">${icon('info')} 点圆圈记录完成，再点一次即可回退；点技能名称可以写下手记。</div>
  </section>`;
}

const BRANCH_COLORS = ['#f57b37', '#9360df', '#3285de', '#12a47d', '#e35092', '#d39e18'];

function focusSkill() {
  const candidates = catalog.filter(skill => skill.domain === state.treeDomain);
  let skill = candidates.find(item => item.id === state.treeFocus);
  if (!skill) {
    skill = getStageSkills(candidates, state.stage).find(item => item.parents?.length && catalog.some(child => child.parents?.includes(item.id)))
      || getStageSkills(candidates, state.stage)[0] || candidates[0];
    state.treeFocus = skill?.id;
  }
  return skill;
}

function graphNode(skill, position, relations, categories, contextIds) {
  const done = isDone(skill.id);
  const selected = skill.id === state.treeFocus;
  const role = selected ? 'focus' : relations.ancestors.some(item => item.id === skill.id) ? 'ancestor'
    : relations.descendants.some(item => item.id === skill.id) ? 'descendant'
    : relations.supporting.some(item => item.id === skill.id) || contextIds.includes(skill.id) ? 'supporting' : 'neutral';
  const children = catalog.filter(item => item.parents?.includes(skill.id));
  const branchColor = BRANCH_COLORS[Math.max(0, categories.indexOf(skill.category)) % BRANCH_COLORS.length];
  return html`<article class="graph-node role-${role} ${done ? 'node-completed' : ''}" data-graph-node="${skill.id}" style="left:${position.x}px;top:${position.y}px;width:${position.width}px;height:${position.height}px;--branch-color:${branchColor}" aria-label="${skill.title}，${skillStageLabel(skill)}">
    <button class="graph-select" data-focus-skill="${skill.id}" aria-label="追踪${skill.title}的前后脉络" aria-pressed="${selected}" title="${skill.title}"><span class="graph-node-meta"><span>${skill.category}</span><span>${skillStageLabel(skill)}</span></span><strong class="graph-node-title">${skill.title}</strong></button>
    <div class="graph-node-bottom"><span class="node-link-count">${skill.parents.length} 前序 <span>·</span> ${children.length} 后续</span>${selected ? html`<span class="node-focus-badge">正在看</span>` : done ? html`<span class="node-done-label">已完成</span>` : ''}<button class="skill-check ${done ? 'is-checked' : ''}" data-toggle="${skill.id}" aria-label="${done ? '撤销完成：' : '标记完成：'}${skill.title}" aria-pressed="${done}">${done ? icon('check') : ''}</button></div>
  </article>`;
}

function neighborList(skills, direction) {
  return html`<section class="neighbor-column neighbors-${direction}"><h3>${direction === 'before' ? html`${icon('arrow', 'rotate')} 直接前序` : html`直接后续 ${icon('arrow')}`}<span>${skills.length}</span></h3>${skills.length ? html`<div class="neighbor-items">${skills.map(skill => html`<button class="neighbor-skill ${isDone(skill.id) ? 'done' : ''}" data-focus-skill="${skill.id}"><span>${skill.title}</span><small>${skillStageLabel(skill)}${isDone(skill.id) ? ' · 已完成' : ''}</small>${icon('chevron')}</button>`)}</div>` : html`<p class="neighbor-empty">${direction === 'before' ? '这是原图中这条脉络的起点' : '这是原图中这条脉络的末端'}</p>`}</section>`;
}

function pathReader(skill) {
  const result = getLineagePaths(catalog, skill.id);
  const byId = new Map(catalog.map(item => [item.id, item]));
  return html`<details class="path-reader" open><summary><span>${icon('tree')} 逐条读完整脉络 <small>${result.total} 条路线</small></span>${icon('chevron')}</summary><p class="path-reader-hint">每条都从原图起点走到末端，经过当前技能；每一个箭头都对应原图中的关系。</p><div class="path-list">${result.paths.map((path, index) => html`<article class="path-route"><span class="path-number">路线 ${String(index + 1).padStart(2, '0')}</span><div class="path-steps">${path.ids.map((id, step) => {
    const item = byId.get(id);
    return html`${step ? icon('arrow', 'path-arrow') : ''}<button class="path-step ${id === skill.id ? 'selected' : ''} ${isDone(id) ? 'done' : ''}" data-focus-skill="${id}"><small>${skillStageLabel(item)}</small><span>${isDone(id) ? icon('check') : ''}${item.title}</span></button>`;
  })}</div></article>`)}</div>${result.truncated ? html`<p class="path-reader-hint">共 ${result.total} 条路线，当前显示前 ${result.paths.length} 条，可选择中间技能继续追踪。</p>` : ''}</details>`;
}

function treeView() {
  const domain = domainInfo(state.treeDomain);
  const skill = focusSkill();
  const relations = getSkillRelations(catalog, skill.id);
  const categories = [...new Set(catalog.filter(item => item.domain === domain.id).map(item => item.category))];
  const branch = getBranchGraph(catalog, domain.id, state.treeCategory);
  const graph = state.treeMode === 'lineage' ? { nodes: relations.nodes, edges: relations.edges, contextIds: [] } : branch;
  const relationEdges = new Map(relations.edges.map(edge => [`${edge.from}:${edge.to}`, edge.kind]));
  if (state.treeMode === 'overview') graph.edges = graph.edges.map(edge => ({ ...edge, kind: relationEdges.get(`${edge.from}:${edge.to}`) || (edge.kind === 'supporting' ? 'supporting' : 'neutral') }));
  const layout = layoutGraph(graph.nodes, graph.edges);
  currentGraph = { ...graph, layout, relations };
  const stats = getStats(graph.nodes, state.records);
  return html`<section class="lineage-view domain-${domain.id}">
    <header class="lineage-header"><div><span class="lineage-eyebrow">小技能，大脉络</span><h1>成长的来龙去脉，一眼看懂<span>。</span></h1><p>从哪一步走来，再向哪里生长。点一个技能，顺着箭头一路看下去。</p></div><span class="lineage-header-icon">${icon('tree')}</span></header>
    <div class="lineage-domains" role="group" aria-label="技能树领域">${DOMAINS.map(item => html`<button class="lineage-domain domain-${item.id} ${item.id === domain.id ? 'active' : ''}" data-tree-domain="${item.id}" aria-pressed="${item.id === domain.id}">${icon(item.id)}<strong>${item.label}</strong><span>${catalog.filter(node => node.domain === item.id).length} 个技能</span></button>`)}</div>
    <div class="lineage-controls"><div class="graph-mode-tabs" role="group" aria-label="脉络查看范围"><button data-tree-mode="lineage" class="${state.treeMode === 'lineage' ? 'active' : ''}" aria-pressed="${state.treeMode === 'lineage'}">${icon('tree')} 这项技能的完整脉络</button><button data-tree-mode="overview" class="${state.treeMode === 'overview' ? 'active' : ''}" aria-pressed="${state.treeMode === 'overview'}">整个领域全景</button></div><label class="lineage-picker"><span>定位技能</span><select id="tree-focus" aria-label="定位技能">${STAGES.map(stage => {
      const items = catalog.filter(item => item.domain === domain.id && item.stage === stage.id);
      return items.length ? html`<optgroup label="${stage.label}">${items.map(item => html`<option value="${item.id}" selected="${item.id === skill.id}">${item.title}</option>`)}</optgroup>` : '';
    })}</select></label>${state.treeMode === 'overview' ? html`<label class="lineage-picker branch-picker"><span>能力分支</span><select id="tree-category" aria-label="选择技能分支"><option value="all" selected="${state.treeCategory === 'all'}">全部分支</option>${categories.map(category => html`<option value="${category}" selected="${state.treeCategory === category}">${category}</option>`)}</select></label>` : ''}</div>
    <div class="focus-strip"><span class="focus-strip-icon">${icon(domain.id)}</span><div><span class="focus-strip-kicker">正在追踪 · ${skillStageLabel(skill)}</span><h2>${skill.title}</h2></div><div class="trace-counts"><span><strong>${relations.ancestors.length}</strong> 项上游</span><span><strong>${relations.descendants.length}</strong> 项后续</span><span><strong>${stats.completed}/${stats.total}</strong> 已完成</span></div></div>
    <div class="graph-workspace ${state.graphExpanded ? 'is-expanded' : ''}" id="graph-workspace"><div class="graph-toolbar"><div class="graph-legend"><span><i class="legend-ancestor"></i>前序脉络</span><span><i class="legend-focus"></i>当前技能</span><span><i class="legend-descendant"></i>后续发展</span><span><i class="legend-supporting"></i>跨分支前序</span></div><div class="graph-tools"><button data-action="graph-zoom-out" aria-label="缩小技能树">−</button><output id="graph-zoom-label">${Math.round(state.graphZoom * 100)}%</output><button data-action="graph-zoom-in" aria-label="放大技能树">＋</button><button data-action="graph-fit">一屏看全</button><button data-action="graph-locate">定位当前技能</button><button data-action="graph-expand" aria-label="${state.graphExpanded ? '退出放大画布' : '放大画布'}">${icon(state.graphExpanded ? 'close' : 'expand')}</button></div></div>
      <div class="graph-viewport" id="graph-viewport" tabindex="0" aria-label="${domain.label}完整技能脉络，可拖动或滚动查看"><div class="graph-scale-space" id="graph-scale-space" style="width:${layout.width * state.graphZoom}px;height:${layout.height * state.graphZoom}px"><div class="graph-scene" id="graph-scene" style="width:${layout.width}px;height:${layout.height}px;transform:scale(${state.graphZoom})">${layout.stages.map((stage, index) => html`<div class="graph-age-band ${index % 2 ? 'alternate' : ''}" style="left:${stage.x}px;width:${stage.width}px;height:${layout.height}px"><span>${stage.label}${currentStage()?.id === stage.id ? html`<small>宝宝在这里</small>` : ''}</span></div>`)}<svg id="graph-edges" width="${layout.width}" height="${layout.height}" aria-hidden="true"></svg>${layout.nodes.map(position => graphNode(catalog.find(item => item.id === position.id), position, relations, categories, graph.contextIds))}</div></div></div>
      <div class="graph-bottom-bar"><span>${icon('arrow')} 箭头指向下一项技能 · 拖动画布或横向滚动</span><span>${graph.nodes.length} 个技能 · ${graph.edges.length} 条关系${state.treeMode === 'overview' && graph.contextIds.length ? ` · 已保留 ${graph.contextIds.length} 项跨分支前序` : relations.supporting.length && state.treeMode === 'lineage' ? ` · 含 ${relations.supporting.length} 项补充前序` : ''}</span></div>
    </div>
    <section class="direct-relations" aria-label="当前技能的直接前序与后续">${neighborList(relations.parents, 'before')}<div class="relation-focus-card"><span>当前技能 · ${skillStageLabel(skill)}</span><h3>${skill.title}</h3><div><button class="primary-button" data-detail="${skill.id}">${icon('note')} 详情与手记</button><button class="secondary-button" data-toggle="${skill.id}">${isDone(skill.id) ? '回退完成' : '标记完成'}</button></div></div>${neighborList(relations.children, 'after')}</section>
    ${pathReader(skill)}<p class="lineage-footnote">${icon('info')} 脉络来自原始图谱的发展关系，支持跨年龄、跨分支查看；前序尚未标注，也可以记录后续技能。</p>
  </section>`;
}

function navigateToLineage(id) {
  const skill = catalog.find(item => item.id === id);
  if (!skill) return;
  document.querySelector('#app-dialog')?.remove();
  state.view = 'tree';
  state.treeDomain = skill.domain;
  state.treeFocus = id;
  state.treeMode = 'lineage';
  state.treeCategory = 'all';
  state.graphZoom = .85;
  graphViewportAction = 'focus';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectGraphSkill(id) {
  const skill = catalog.find(item => item.id === id);
  if (!skill) return;
  state.treeFocus = id;
  state.treeDomain = skill.domain;
  if (state.treeMode === 'overview' && currentGraph && !currentGraph.nodes.some(item => item.id === id)) state.treeCategory = 'all';
  graphViewportAction = 'focus';
  render();
}

function render() {
  const active = document.activeElement;
  const focusId = active?.id === 'skill-search' ? active.id : null;
  const selection = focusId ? active.selectionStart : 0;
  const graphViewport = document.querySelector('#graph-viewport');
  const graphScroll = { top: graphViewport?.scrollTop || 0, left: graphViewport?.scrollLeft || 0 };
  const pathReaderOpen = document.querySelector('.path-reader')?.open ?? true;
  document.body.classList.toggle('graph-is-expanded', state.graphExpanded && state.view === 'tree');
  app.replaceChildren(html`${sidebar()}<main class="main ${state.view === 'tree' ? 'graph-main' : ''}"><header class="topbar"><div class="breadcrumb">成长花园 <span>/</span> ${state.view === 'baby' ? '宝宝视角' : state.view === 'age' ? '按年龄看' : '技能全景'}</div><div class="topbar-actions"><button class="save-status ${saveProblem() ? 'has-error' : ''}" data-action="storage-status" aria-label="本机保存状态：${saveLabel()}" title="${saveProblem() || `${saveTimeLabel()}，刷新后自动恢复`}"><span class="save-status-dot"></span><span data-save-label aria-live="polite">${saveLabel()}</span></button><span class="today-label">${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</span><a class="icon-button source-link" href="./assets/original.pdf" target="_blank" rel="noopener" aria-label="查看原始 PDF">${icon('book')}<span>原始图谱</span></a><button class="icon-button" data-action="backup" aria-label="管理备份">${icon('download')}<span>备份</span></button></div></header><div id="storage-warning" class="storage-warning" role="alert" hidden="${!saveProblem()}"><span data-storage-error>${saveProblem()}</span><button data-action="retry-save">重试保存</button><button data-action="export">导出备份</button></div>${state.view === 'tree' ? treeView() : html`${hero()}${stageNavigator()}${domainCards()}${milestoneList()}`}<footer class="page-footer"><span>${icon('sprout')} 陪伴，比进度更重要。</span><span>内容源于 MAMAHAHA 宝宝发展技能树 · 记录保存在当前浏览器</span></footer></main>`);
  persistView();
  updateSaveStatus();
  if (focusId) {
    const input = document.getElementById(focusId);
    input?.focus({ preventScroll: true });
    if (selection !== null && input) input.setSelectionRange(selection, selection);
  }
  requestAnimationFrame(() => {
    drawTree();
    const viewport = document.querySelector('#graph-viewport');
    if (viewport) {
      if (graphViewportAction === 'fit') fitGraph();
      else if (graphViewportAction === 'focus') locateGraphFocus();
      else { viewport.scrollTop = graphScroll.top; viewport.scrollLeft = graphScroll.left; }
      graphViewportAction = null;
    }
    const reader = document.querySelector('.path-reader');
    if (reader) reader.open = pathReaderOpen;
    const track = document.querySelector('#stage-track');
    const selected = track?.querySelector('.active');
    if (track && selected) track.scrollLeft = Math.max(0, selected.offsetLeft - track.offsetLeft - track.clientWidth / 2 + selected.offsetWidth / 2);
  });
}

function drawTree() {
  const svg = document.querySelector('#graph-edges');
  if (!svg || !currentGraph) return;
  svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const colors = { ancestor: '#347bea', descendant: '#eb4b95', supporting: '#bf941d', neutral: '#cbbdd6' };
  const defs = document.createElementNS(ns, 'defs');
  for (const [kind, color] of Object.entries(colors)) {
    const marker = document.createElementNS(ns, 'marker');
    for (const [key, value] of Object.entries({ id: `graph-arrow-${kind}`, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto', markerUnits: 'userSpaceOnUse' })) marker.setAttribute(key, value);
    const arrow = document.createElementNS(ns, 'path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 Z');
    arrow.setAttribute('fill', color);
    marker.append(arrow);
    defs.append(marker);
  }
  svg.append(defs);
  for (const edge of [...currentGraph.layout.edges].sort((a, b) => Number(a.kind !== 'neutral') - Number(b.kind !== 'neutral'))) {
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', `graph-edge-group edge-${edge.kind}`);
    group.dataset.from = edge.from;
    group.dataset.to = edge.to;
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', edge.path);
    path.setAttribute('class', 'graph-edge');
    path.setAttribute('stroke', colors[edge.kind] || colors.neutral);
    path.setAttribute('marker-end', `url(#graph-arrow-${edge.kind})`);
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${catalog.find(item => item.id === edge.from).title} → ${catalog.find(item => item.id === edge.to).title}`;
    group.append(title, path);
    svg.append(group);
  }
}

function setGraphZoom(value, keepCenter = true) {
  const viewport = document.querySelector('#graph-viewport');
  const scene = document.querySelector('#graph-scene');
  const space = document.querySelector('#graph-scale-space');
  if (!viewport || !scene || !space || !currentGraph) return;
  const previous = state.graphZoom;
  const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / previous;
  const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / previous;
  state.graphZoom = Math.max(.03, Math.min(1.5, value));
  scene.style.transform = `scale(${state.graphZoom})`;
  space.style.width = `${currentGraph.layout.width * state.graphZoom}px`;
  space.style.height = `${currentGraph.layout.height * state.graphZoom}px`;
  document.querySelector('#graph-zoom-label').textContent = `${Math.round(state.graphZoom * 100)}%`;
  if (keepCenter) {
    viewport.scrollLeft = centerX * state.graphZoom - viewport.clientWidth / 2;
    viewport.scrollTop = centerY * state.graphZoom - viewport.clientHeight / 2;
  }
}

function fitGraph() {
  const viewport = document.querySelector('#graph-viewport');
  if (!viewport || !currentGraph) return;
  setGraphZoom(Math.min((viewport.clientWidth - 24) / currentGraph.layout.width, (viewport.clientHeight - 24) / currentGraph.layout.height, 1), false);
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;
}

function locateGraphFocus() {
  const viewport = document.querySelector('#graph-viewport');
  const position = currentGraph?.layout.nodes.find(node => node.id === state.treeFocus);
  if (!viewport || !position) return;
  if (state.graphZoom < .6) setGraphZoom(.85, false);
  viewport.scrollLeft = (position.x + position.width / 2) * state.graphZoom - viewport.clientWidth / 2;
  viewport.scrollTop = (position.y + position.height / 2) * state.graphZoom - viewport.clientHeight / 2;
}

function showDialog(content, kind = '') {
  document.querySelector('#app-dialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'app-dialog';
  dialog.className = `app-dialog ${kind}`;
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.append(content);
  document.body.append(dialog);
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => { dialog.remove(); render(); });
  dialog.showModal();
  return dialog;
}
function dialogHeader(kicker, title) { return html`<header class="dialog-header"><div><span class="section-kicker">${kicker}</span><h2 id="dialog-title">${title}</h2></div><button class="circle-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></header>`; }

function openDetail(id) {
  const skill = catalog.find(item => item.id === id);
  if (!skill) return;
  const record = state.records[id] || {};
  const parents = (skill.parents || []).map(parent => catalog.find(item => item.id === parent)).filter(Boolean);
  const children = catalog.filter(item => item.parents?.includes(id));
  const done = isDone(id);
  const dialog = showDialog(html`${dialogHeader('每一个「我会啦」，都很珍贵', skill.title)}<div class="detail-tags domain-${skill.domain}"><span>${icon(skill.domain)}${domainInfo(skill.domain).label}</span><span>${skill.category}</span><span>${skillStageLabel(skill)}</span></div><form id="skill-form" data-id="${id}"><div class="detail-status ${done ? 'done' : ''}"><span>${icon(done ? 'check' : 'sprout')}<strong>${done ? '这颗成长小芽，已点亮' : '正在慢慢探索'}</strong></span><button type="button" class="${done ? 'secondary-button' : 'primary-button'}" data-toggle="${id}">${done ? '回退为探索中' : '标记已完成'}</button></div>${done ? html`<label class="form-field">学会的日子<input type="date" name="completedAt" value="${record.completedAt}" max="${localDateString()}" min="${state.profile.birthDate}" required /></label>` : ''}<label class="form-field">成长手记 <span>可选 · 留住这一刻</span><textarea id="skill-note" name="note" rows="4" maxlength="2000" placeholder="今天宝宝有了什么新发现？">${record.note || ''}</textarea></label><div class="form-actions"><small>手记和完成状态会自动保存到当前浏览器</small><button class="primary-button" type="submit">保存手记 ${icon('check')}</button></div></form>${parents.length || children.length ? html`<div class="skill-relations"><h3>一路长大的足迹</h3><button class="detail-lineage-button" data-lineage="${id}">${icon('tree')} 查看这项技能的完整脉络 ${icon('arrow')}</button>${parents.length ? html`<p>直接前序</p><div>${parents.map(item => html`<button class="relation-chip ${isDone(item.id) ? 'done' : ''}" data-detail="${item.id}">${isDone(item.id) ? icon('check') : icon('sprout')}${item.title}${icon('chevron')}</button>`)}</div>` : ''}${children.length ? html`<p>直接后续</p><div>${children.map(item => html`<button class="relation-chip ${isDone(item.id) ? 'done' : ''}" data-detail="${item.id}">${isDone(item.id) ? icon('check') : icon('sprout')}${item.title}${icon('chevron')}</button>`)}</div>` : ''}</div>` : ''}${resourceSection(skill)}<div class="detail-source">原始图谱第 ${skill.sourcePage} 页 · 年龄与进阶关系仅作陪伴参考</div>`, 'detail-dialog');
  dialog.dataset.skillId = id;
  updateSaveStatus();
}

function openProfile() {
  showDialog(html`${dialogHeader('小小主角', '宝宝的成长资料')}<form id="profile-form"><label class="form-field">宝宝昵称<input name="name" value="${state.profile.name}" required maxlength="30" autocomplete="off" /></label><label class="form-field">出生日期<input type="date" name="birthDate" value="${state.profile.birthDate}" required /></label><p class="form-help">月龄会随日期自动更新，并定位到宝宝当前的成长阶段。</p><div id="form-error" class="form-error" role="alert"></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-dialog">取消</button><button class="primary-button" type="submit">保存资料</button></div></form>`);
}

function openBackup() {
  const stats = getStats(catalog, state.records);
  const notes = Object.values(state.records).filter(record => record.note?.trim()).length;
  const origin = window.origin || location.origin;
  showDialog(html`${dialogHeader('把成长好好收藏', '本机保存与备份')}<div class="backup-summary">${icon('sprout')}<p><strong>${stats.completed} 个已完成技能 · ${notes} 篇成长手记</strong><span>完成、回退、手记和宝宝资料会自动保存，刷新后恢复。</span></p></div><section class="storage-details ${saveProblem() ? 'has-error' : ''}"><h3>${icon(saveProblem() ? 'info' : 'check')}${saveProblem() ? '本机保存需要处理' : '本机保存已启用'}</h3><p>${saveProblem() || '已保存在当前浏览器，也会记住上次查看的年龄和技能脉络。'}</p><dl><dt>保存方式</dt><dd>本机数据库（IndexedDB）</dd><dt>存储地址</dt><dd>${origin === 'null' ? '当前预览环境（独立或受限）' : origin}</dd><dt>成长记录</dt><dd>${saveTimeLabel()}</dd></dl><p>同一浏览器、同一地址可持续使用。换设备、换域名或清理网站数据前，请先导出；到新地址后再导入。</p></section>${state.storageError ? html`<button class="secondary-button storage-retry" data-action="retry-save">重试保存到本机</button>` : ''}<button class="backup-option" data-action="export">${icon('download')}<span><strong>导出成长记录</strong><small>下载含宝宝资料、完成日期和手记的备份文件</small></span>${icon('chevron')}</button><label class="backup-option" tabindex="0" role="button" id="import-label">${icon('upload')}<span><strong>导入已有记录</strong><small>选择小芽备份文件，校验后再确认合并</small></span>${icon('chevron')}<input type="file" id="import-file" accept=".json,application/json" hidden /></label><p class="backup-footnote">记录保存在这台设备的浏览器中，不会自动同步到语雀账号或其他设备。</p>`);
}

function exportBackup() {
  const data = { version: 1, profile: state.profile, records: state.records };
  const url = URL.createObjectURL(new Blob([state.recoveryRaw ?? JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `小芽${state.recoveryRaw !== null ? '原始记录_待恢复' : '成长记录'}_${localDateString()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(state.recoveryRaw !== null ? '已导出原始记录，请修复后重新导入' : '成长记录已导出');
}

async function importBackup(file) {
  if (!file) return;
  try {
    const imported = validateBackup(JSON.parse(await file.text()), catalog.map(skill => skill.id));
    pendingImport = imported;
    const stats = getStats(catalog, imported.records);
    const overlap = Object.keys(imported.records).filter(id => Object.hasOwn(state.records, id)).length;
    showDialog(html`${dialogHeader('备份校验通过', '合并这份成长记录？')}<p class="import-description">来自「${imported.profile.name}」的备份，包含 ${stats.completed} 个完成标注、${Object.values(imported.records).filter(record => record.note).length} 篇手记。</p><div class="import-details"><p>宝宝资料将更新为 ${imported.profile.name} · ${dateLabel(imported.profile.birthDate)} 出生。</p><p>相同技能的 ${overlap} 条已有记录将采用备份内容；其余已有记录会保留。</p></div><div class="form-actions"><button class="secondary-button" data-action="close-dialog">取消</button><button class="primary-button" data-action="confirm-import">确认合并</button></div>`);
  } catch (error) { notify(error instanceof SyntaxError ? '文件不是有效的 JSON 备份' : error.message); }
}

function changeStage(id) {
  if (!STAGES.some(stage => stage.id === id)) return;
  state.stage = id;
  state.search = '';
  state.status = 'all';
  if (state.view === 'tree') { state.view = 'age'; state.graphExpanded = false; }
  render();
}

async function toggleSkill(id) {
  if (!catalog.some(skill => skill.id === id)) return;
  const dialog = document.querySelector('#app-dialog');
  const note = dialog?.dataset.skillId === id ? dialog.querySelector('[name="note"]')?.value : undefined;
  if (note !== undefined) state.records = { ...state.records, [id]: { ...state.records[id], note } };
  state.lastUndo = { id, previous: state.records[id] ? { ...state.records[id] } : null };
  state.records = toggleRecord(state.records, id, localDateString());
  const saving = persist();
  const revision = saveRevision;
  render();
  if (dialog?.dataset.skillId === id) openDetail(id);
  const saved = await saving;
  if (revision === saveRevision) notify(saved ? isDone(id) ? '又点亮一颗成长小芽' : '已回退为探索中' : state.storageError, saved);
}

document.addEventListener('click', async event => {
  const element = event.target.closest('button, a[data-action], [data-view], [data-stage]');
  if (!element) return;
  if (element.dataset.view) {
    const previousView = state.view;
    state.view = element.dataset.view;
    state.search = '';
    state.status = 'all';
    state.domain = 'all';
    if (state.view === 'baby') state.stage = currentStage()?.id || (babyAge() ? 's8' : 's0');
    if (state.view === 'tree' && previousView !== 'tree') graphViewportAction = 'focus';
    if (state.view !== 'tree') state.graphExpanded = false;
    render();
  } else if (element.dataset.stage) changeStage(element.dataset.stage);
  else if (element.dataset.domain) { state.domain = state.domain === element.dataset.domain ? 'all' : element.dataset.domain; render(); }
  else if (element.dataset.status) { state.status = element.dataset.status; render(); }
  else if (element.dataset.toggle) void toggleSkill(element.dataset.toggle);
  else if (element.dataset.lineage) navigateToLineage(element.dataset.lineage);
  else if (element.dataset.focusSkill) selectGraphSkill(element.dataset.focusSkill);
  else if (element.dataset.detail) openDetail(element.dataset.detail);
  else if (element.dataset.treeDomain) { state.treeDomain = element.dataset.treeDomain; state.treeCategory = 'all'; state.treeFocus = null; graphViewportAction = state.treeMode === 'overview' ? 'fit' : 'focus'; render(); }
  else if (element.dataset.treeMode) { state.treeMode = element.dataset.treeMode; graphViewportAction = state.treeMode === 'overview' ? 'fit' : 'focus'; render(); }
  else if (element.dataset.action) {
    const index = STAGES.findIndex(stage => stage.id === state.stage);
    switch (element.dataset.action) {
      case 'home': event.preventDefault(); state.view = 'baby'; state.graphExpanded = false; state.stage = currentStage()?.id || (babyAge() ? 's8' : 's0'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'prev-stage': if (index > 0) changeStage(STAGES[index - 1].id); break;
      case 'next-stage': if (index < STAGES.length - 1) changeStage(STAGES[index + 1].id); break;
      case 'current-stage': if (currentStage()) changeStage(currentStage().id); break;
      case 'clear-filters': state.domain = 'all'; state.search = ''; state.status = 'all'; render(); break;
      case 'graph-zoom-in': setGraphZoom(state.graphZoom + .15); break;
      case 'graph-zoom-out': setGraphZoom(state.graphZoom - .15); break;
      case 'graph-fit': fitGraph(); break;
      case 'graph-locate': locateGraphFocus(); break;
      case 'graph-expand': state.graphExpanded = !state.graphExpanded; graphViewportAction = 'focus'; render(); break;
      case 'profile': openProfile(); break;
      case 'backup': case 'storage-status': openBackup(); break;
      case 'export': exportBackup(); break;
      case 'retry-save': {
        const saved = await persist();
        render();
        if (document.querySelector('#app-dialog')?.querySelector('.storage-details')) openBackup();
        notify(saved ? '成长记录已保存到本机' : state.storageError);
        break;
      }
      case 'close-dialog': document.querySelector('#app-dialog')?.close(); break;
      case 'confirm-import': {
        if (!pendingImport) break;
        state.profile = pendingImport.profile;
        state.records = { ...state.records, ...pendingImport.records };
        state.recoveryRaw = null;
        pendingImport = null;
        state.lastUndo = null;
        state.stage = currentStage()?.id || (babyAge() ? 's8' : 's0');
        lastCurrentStage = currentStage()?.id;
        const saving = persist();
        document.querySelector('#app-dialog')?.close();
        render();
        const saved = await saving;
        notify(saved ? '成长记录已合并' : state.storageError);
        break;
      }
      case 'undo': {
        const undo = state.lastUndo;
        if (!undo) break;
        if (undo.previous) state.records = { ...state.records, [undo.id]: undo.previous };
        else { state.records = { ...state.records }; delete state.records[undo.id]; }
        state.lastUndo = null;
        const saving = persist();
        render();
        if (document.querySelector('#app-dialog')?.dataset.skillId === undo.id) openDetail(undo.id);
        const saved = await saving;
        notify(saved ? '已撤销刚才的操作' : state.storageError);
        break;
      }
    }
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'skill-search') { state.search = event.target.value; render(); }
  if (event.target.id === 'skill-note') {
    const id = event.target.form.dataset.id;
    state.records = { ...state.records, [id]: { ...state.records[id], note: event.target.value } };
    if (!event.target.value && !state.records[id].completedAt) delete state.records[id];
    void persist();
  }
  if (event.target.name === 'completedAt' && event.target.validity.valid && event.target.value) {
    const id = event.target.form.dataset.id;
    state.records = { ...state.records, [id]: { ...state.records[id], completedAt: event.target.value } };
    void persist();
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'tree-category') {
    state.treeCategory = event.target.value;
    const graph = getBranchGraph(catalog, state.treeDomain, state.treeCategory);
    if (!graph.nodes.some(skill => skill.id === state.treeFocus)) state.treeFocus = graph.nodes.find(skill => skill.category === state.treeCategory)?.id || graph.nodes[0]?.id;
    graphViewportAction = 'fit';
    render();
  }
  if (event.target.id === 'tree-focus') selectGraphSkill(event.target.value);
  if (event.target.id === 'import-file') void importBackup(event.target.files[0]);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.graphExpanded && !document.querySelector('#app-dialog')) { state.graphExpanded = false; render(); }
  if (event.target.closest('#graph-viewport') && ['+', '=', '-'].includes(event.key)) { event.preventDefault(); setGraphZoom(state.graphZoom + (event.key === '-' ? -.15 : .15)); }
  if (event.target.id === 'import-label' && ['Enter', ' '].includes(event.key)) { event.preventDefault(); document.querySelector('#import-file')?.click(); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['profile-form', 'skill-form'].includes(form.id)) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.id === 'profile-form') {
    try {
      const validated = validateBackup({ version: 1, profile: { name: data.get('name'), birthDate: data.get('birthDate') }, records: state.records }, catalog.map(skill => skill.id));
      state.profile = validated.profile;
      state.stage = currentStage()?.id || (babyAge() ? 's8' : 's0');
      lastCurrentStage = currentStage()?.id;
      state.view = 'baby';
      const saving = persist();
      document.querySelector('#app-dialog')?.close();
      render();
      const saved = await saving;
      notify(saved ? '宝宝资料已保存' : state.storageError);
    } catch (error) { document.querySelector('#form-error').textContent = error.message; }
  } else {
    const id = form.dataset.id;
    const next = { note: data.get('note').trim() };
    if (isDone(id)) next.completedAt = data.get('completedAt') || state.records[id].completedAt;
    state.records = { ...state.records, [id]: next };
    if (!next.note && !next.completedAt) delete state.records[id];
    const saving = persist();
    document.querySelector('#app-dialog')?.close();
    render();
    const saved = await saving;
    notify(saved ? '这一刻，已经好好收藏' : state.storageError);
  }
});

let touchStart = null;
document.addEventListener('touchstart', event => {
  if (event.target.closest('.stage-picker, .milestones, .domain-cards') && !event.target.closest('input, textarea, a, select')) {
    touchStart = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  } else touchStart = null;
}, { passive: true });
document.addEventListener('touchend', event => {
  if (!touchStart) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6 && state.view === 'baby') {
    const index = STAGES.findIndex(stage => stage.id === state.stage) + (dx < 0 ? 1 : -1);
    if (STAGES[index]) changeStage(STAGES[index].id);
  }
}, { passive: true });
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawTree();
    if (state.view === 'tree') {
      if (state.graphZoom < .6) fitGraph();
      else locateGraphFocus();
    }
  }, 120);
});
let graphDrag = null;
document.addEventListener('pointerdown', event => {
  const viewport = event.target.closest('#graph-viewport');
  if (!viewport || event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button')) return;
  graphDrag = { viewport, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add('is-dragging');
});
document.addEventListener('pointermove', event => {
  if (!graphDrag) return;
  graphDrag.viewport.scrollLeft = graphDrag.left - (event.clientX - graphDrag.x);
  graphDrag.viewport.scrollTop = graphDrag.top - (event.clientY - graphDrag.y);
});
function endGraphDrag() {
  if (!graphDrag) return;
  if (graphDrag.viewport.hasPointerCapture(graphDrag.pointerId)) graphDrag.viewport.releasePointerCapture(graphDrag.pointerId);
  graphDrag.viewport.classList.remove('is-dragging');
  graphDrag = null;
}
document.addEventListener('pointerup', endGraphDrag);
document.addEventListener('pointercancel', endGraphDrag);
document.addEventListener('wheel', event => {
  if (!event.ctrlKey || !event.target.closest('#graph-viewport')) return;
  event.preventDefault();
  setGraphZoom(state.graphZoom * Math.exp(-event.deltaY * .002));
}, { passive: false });
async function syncGrowth() {
  if (!growthStore || state.savePending || state.hasUnsavedChanges || !catalog.length) return;
  try {
    const loaded = await growthStore.load();
    if (!loaded || state.savePending || state.hasUnsavedChanges) return;
    const changed = growthFingerprint(loaded) !== growthFingerprint(state);
    if (changed) applyGrowth(loaded);
    else state.savedAt = loaded.savedAt;
    lastCommittedGrowth = growthSnapshot(loaded);
    state.recoveryRaw = null;
    state.storageError = '';
    state.storageReadFailed = false;
    if (!changed) { updateSaveStatus(); return; }
    lastCurrentStage = currentStage()?.id;
    render();
    const openSkillId = document.querySelector('#app-dialog')?.dataset.skillId;
    if (openSkillId) openDetail(openSkillId);
    notify('已同步另一个标签页的成长记录');
  } catch { /* 同步失败不覆盖当前页面记录。 */ }
}
try {
  syncChannel = new BroadcastChannel('xiaoya-growth-updates-v1');
  syncChannel.addEventListener('message', () => { void syncGrowth(); });
} catch { /* 不支持消息通道时，重新聚焦仍会读取本机记录。 */ }
window.addEventListener('beforeunload', event => {
  if (!state.savePending && !state.hasUnsavedChanges) return;
  event.preventDefault();
  event.returnValue = '';
});

async function start() {
  try {
    const [catalogResponse, resourcesResponse] = await Promise.all([fetch('./data/catalog.json'), fetch('./data/stage-resources.json')]);
    if (!catalogResponse.ok || !resourcesResponse.ok) throw new Error('成长图谱暂时没有加载成功，请刷新重试。');
    catalog = await catalogResponse.json();
    resources = await resourcesResponse.json();
    await restoreGrowth();
    state.stage = currentStage()?.id || (babyAge() ? 's8' : 's0');
    lastCurrentStage = currentStage()?.id;
    restoreView();
    render();
  } catch (error) {
    app.replaceChildren(html`<main class="load-error">${icon('sprout')}<h1>小芽还没准备好</h1><p>${error.message}</p><p>请通过本地服务打开网页，避免直接双击 HTML 文件。</p><button class="primary-button" id="retry-button">重新加载</button></main>`);
    document.querySelector('#retry-button').addEventListener('click', () => location.reload());
  }
}
function refreshCalendar() {
  const today = localDateString();
  if (today === lastCalendarDate || !catalog.length) return;
  const followedCurrentStage = state.view === 'baby' && state.stage === lastCurrentStage;
  lastCalendarDate = today;
  lastCurrentStage = currentStage()?.id;
  if (followedCurrentStage) state.stage = lastCurrentStage || (babyAge() ? 's8' : 's0');
  render();
}
window.addEventListener('focus', () => { refreshCalendar(); void syncGrowth(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshCalendar(); void syncGrowth(); } });
setInterval(refreshCalendar, 30_000);
void start();
