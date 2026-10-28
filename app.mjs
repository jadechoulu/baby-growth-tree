import { STAGES, DOMAINS, DEFAULT_PROFILE, localDateString, getAge, getStageForAge, getStageSkills, getNextSkills, getSkillAgeStatus, getStats, toggleRecord, completeRecords, validateBackup } from './lib/model.mjs?v=20261028-training-paths';
import { getSkillRelations, getBranchGraph, getStageGraph, layoutGraph } from './lib/graph.mjs?v=20261028-compact-nodes';
import { STORAGE_KEY, VIEW_STORAGE_KEY, readGrowthSnapshot, createGrowthStore, createLocalSaveStore } from './lib/storage.mjs?v=20261028-local-import';
import { createCloudStore, mergeGrowthSnapshots } from './lib/cloud.mjs';
import { createSaveQueue, sameGrowth } from './lib/save-queue.mjs';
import { combineLocalImports, mergeImportedGrowth } from './lib/import.mjs';

const app = document.querySelector('#app');
const sharedProfile = window.XiaoyaBabyProfile.createClient();
let profileEditBase = null;
let catalog = [];
let resources = {};
let skillGuides = { sources: {}, categories: {}, skills: {} };
let toastTimer;
let pendingImport;
const state = { profile: { ...DEFAULT_PROFILE }, records: {}, view: 'baby', stage: 's5', domain: 'cognition', status: 'all', search: '', treeDomain: 'cognition', treeCategory: 'all', treeMode: 'lineage', treeFocus: null, stageFocus: null, graphZoom: .85, graphExpanded: false, storageError: '', lastUndo: null };
state.savedAt = null;
state.viewStorageError = '';
state.savePending = false;
state.hasUnsavedChanges = false;
let lastSavedView = null;
let viewRestored = false;
let saveRevision = 0;
let apiBase = '';
let sessionToken = '';
let cloudStore = null;
let localStore = null;
state.localMode = false;
state.localLoaded = false;
let saveController = null;
let cloudConflict = null;
let cloudRefreshing = false;
let authPopup = null;
let authRequest = null;
let authTimer = null;
const SESSION_KEY = 'xiaoya-cloud-session-v1';
const localMigrations = [];
state.auth = 'unconfigured';
state.user = null;
state.cloudLoaded = false;
state.cloudEmpty = true;
let currentGraph = null;
let graphViewportAction = null;
let lastCalendarDate = localDateString();
let lastCurrentStage = null;
const mobileGraphLayout = window.matchMedia('(max-width: 760px)');
let graphLegendOpen = null;
function syncGraphLegend() {
  const legend = document.querySelector('.graph-legend-disclosure');
  if (legend) legend.open = graphLegendOpen ?? !mobileGraphLayout.matches;
}
mobileGraphLayout.addEventListener('change', () => {
  syncGraphLegend();
});

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
  menu: ['M4 6h16M4 12h16M4 18h16'],
  chevron: ['m9 5 7 7-7 7'],
  locate: ['M12 2v4M12 18v4M2 12h4M18 12h4', 'M19 12a7 7 0 1 0-14 0 7 7 0 0 0 14 0Z', 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'],
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

function canEdit() { return (state.localMode ? state.localLoaded : state.auth === 'ready' && state.cloudLoaded) && !cloudConflict; }
function requireEditable(needsProfile = true) {
  if (cloudConflict) { openConflicts(); return false; }
  if (!canEdit()) { openBackup(); return false; }
  if (needsProfile && !state.profile.birthDate) { openProfile(); return false; }
  return true;
}
async function persist(options = {}) {
  if (!canEdit() || !state.profile.birthDate) return false;
  saveRevision += 1;
  try {
    if (!window.XiaoyaBabyProfile.same(state.profile, sharedProfile.get())) {
      state.profile = await sharedProfile.save(state.profile, sharedProfile.get());
    }
    return await saveController.request(options);
  } catch (error) {
    state.storageError = error.message; state.hasUnsavedChanges = true;
    updateSaveStatus(); return false;
  }
}
function saveProblem() { return state.storageError; }
function saveLabel() {
  if (state.localMode) {
    if (!state.localLoaded) return '本机记录未读取';
    if (cloudConflict) return '待处理本机冲突';
    if (saveProblem() || state.hasUnsavedChanges && !state.savePending) return '尚未保存到本机';
    if (state.savePending) return '正在保存到本机';
    return state.profile.birthDate ? '已保存到本机' : '本机尚无记录';
  }
  if (state.auth === 'unconfigured') return '云端待配置';
  if (state.auth === 'loading') return '读取云端中';
  if (state.auth === 'signed-out' || state.auth === 'expired') return state.hasUnsavedChanges ? '未同步 · 请登录' : '登录后同步';
  if (cloudConflict) return '待处理冲突';
  if (saveProblem()) return '未同步';
  if (state.savePending) return '正在同步';
  return state.hasUnsavedChanges ? '未同步' : state.savedAt || (state.cloudLoaded && !state.cloudEmpty) ? '已同步' : '云端尚无记录';
}
function saveTimeLabel() {
  if (state.localMode) return state.savedAt ? `最近本机保存：${new Date(state.savedAt).toLocaleString('zh-CN', { hour12: false })}` : state.profile.birthDate ? '已读取本机记录（暂无保存时间）' : '建立资料或导入备份后自动保存';
  return state.savedAt ? `最近云端确认：${new Date(state.savedAt).toLocaleString('zh-CN', { hour12: false })}` : state.cloudLoaded && !state.cloudEmpty ? '已读取云端记录（暂无保存时间）' : '尚无云端保存确认';
}
function updateSaveStatus() {
  const button = document.querySelector('[data-action="storage-status"]');
  if (button) {
    button.classList.toggle('has-error', Boolean(saveProblem()));
    button.classList.toggle('is-saving', state.savePending);
    button.setAttribute('aria-label', `保存状态：${saveLabel()}`);
    button.title = saveProblem() || saveTimeLabel();
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
    inlineStatus.textContent = state.localMode ? !canEdit() ? '请先重新读取本机记录' : state.storageError ? '本次修改尚未保存，请重试或导出。' : state.savePending ? '正在保存到本机…' : '手记与完成状态自动保存到本机' : !canEdit() ? '登录并读取云端后可编辑' : state.storageError ? '本次修改尚未同步，请重试或导出。' : state.savePending ? '正在同步到私有云端…' : '手记与完成状态自动同步到私有云端';
  }
  document.querySelectorAll('#skill-note, #skill-form [name="completedAt"], #skill-form [type="submit"]').forEach(input => { input.disabled = !canEdit() || !state.profile.birthDate; });
}

function persistView() {
  if (!viewRestored) return;
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
  if (['baby', 'tree', 'next'].includes(view.view)) state.view = view.view;
  if (view.view === 'age') state.view = 'baby';
  if (STAGES.some(stage => stage.id === view.stage)) state.stage = view.stage;
  if (state.view === 'baby' && view.followsCurrent) state.stage = currentStage()?.id || state.stage;
  if (DOMAINS.some(domain => domain.id === view.domain)) state.domain = view.domain;
  else if (DOMAINS.some(domain => domain.id === view.stageTreeDomain)) state.domain = view.stageTreeDomain;
  if (DOMAINS.some(domain => domain.id === view.treeDomain)) state.treeDomain = view.treeDomain;
  if (['lineage', 'overview'].includes(view.treeMode)) state.treeMode = view.treeMode;
  if (view.treeCategory === 'all' || catalog.some(skill => skill.domain === state.treeDomain && skill.category === view.treeCategory)) state.treeCategory = view.treeCategory;
  if (catalog.some(skill => skill.domain === state.treeDomain && skill.id === view.treeFocus)) state.treeFocus = view.treeFocus;
  graphViewportAction = 'focus';
}

function growthSnapshot(data) {
  return { version: 1, profile: { ...data.profile }, records: Object.fromEntries(Object.entries(data.records).map(([id, record]) => [id, { ...record }])) };
}
function applyGrowth(data, importing = false) {
  state.profile = importing ? { ...data.profile } : sharedProfile.get();
  state.records = structuredClone(data.records);
}
function setSessionToken(token) {
  sessionToken = token;
  try { if (token) sessionStorage.setItem(SESSION_KEY, token); else sessionStorage.removeItem(SESSION_KEY); }
  catch { /* 浏览器拒绝会话存储时，本页仍可使用内存会话。 */ }
}
async function findLocalMigrations() {
  // 发现来源时只读取；原始记录保留，可独立导出。
  localMigrations.length = 0;
  const migrationStore = createGrowthStore(window.indexedDB, catalog.map(skill => skill.id));
  try {
    const loaded = await migrationStore.load();
    if (loaded) localMigrations.push({ label: '此浏览器的 IndexedDB 记录', snapshot: growthSnapshot(loaded) });
  } catch { state.viewStorageError = '旧本机数据库暂时无法读取；原有数据没有改动。'; }
  finally { migrationStore.close(); }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const snapshot = readGrowthSnapshot(raw, catalog.map(skill => skill.id));
        if (!localMigrations.some(item => sameGrowth(item.snapshot, snapshot))) localMigrations.push({ label: '旧版浏览器记录', snapshot });
      } catch { localMigrations.push({ label: '旧版原始记录（待修复）', raw }); }
    }
  } catch { /* 不可读时不删除旧数据。 */ }
}
function configureSaveQueue(store = cloudStore) {
  saveController = createSaveQueue({
    store,
    getSnapshot: () => growthSnapshot(state),
    applySnapshot: snapshot => {
      const previousForm = document.querySelector('#skill-form');
      const skillId = previousForm?.dataset.id;
      const previousDone = skillId && isDone(skillId);
      const previousNote = previousForm?.querySelector('[name="note"]');
      const editingNote = previousNote === document.activeElement;
      const selection = editingNote ? [previousNote.selectionStart, previousNote.selectionEnd] : null;
      applyGrowth(snapshot);
      render();
      // 远端合入完成／回退时，详情也同步；一般保存保留正在输入的 textarea。
      if (skillId && previousDone !== isDone(skillId)) {
        openDetail(skillId);
        if (editingNote) {
          const note = document.querySelector('#skill-note');
          note.focus({ preventScroll: true }); note.setSelectionRange(...selection);
        }
      }
      const form = document.querySelector('#skill-form');
      if (form) {
        const record = state.records[form.dataset.id] || {};
        const note = form.querySelector('[name="note"]');
        if (note && note.value !== (record.note || '')) note.value = record.note || '';
        const date = form.querySelector('[name="completedAt"]');
        if (date && record.completedAt) date.value = record.completedAt;
      }
    },
    onStatus: status => {
      state.savePending = status.pending;
      state.hasUnsavedChanges = status.dirty;
      state.savedAt = status.savedAt;
      if (status.savedAt) state.cloudEmpty = false;
      state.storageError = status.error?.message || '';
      if (status.error?.code === 'AUTH_REQUIRED') { state.auth = 'expired'; setSessionToken(''); }
      updateSaveStatus();
    },
    onConflict: conflict => { cloudConflict = conflict; render(); openConflicts(); },
  });
}
async function connectLocal() {
  if (state.savePending || state.hasUnsavedChanges) return;
  try {
    const envelope = await localStore.load();
    state.localLoaded = true;
    state.storageError = '';
    if (!saveController) configureSaveQueue(localStore);
    if (!envelope.snapshot) { state.profile = sharedProfile.get(); state.records = {}; }
    saveController.adopt(envelope);
    state.stage = currentStage()?.id || state.stage;
    lastCurrentStage = currentStage()?.id;
  } catch (error) {
    state.localLoaded = false;
    state.storageError = error.message;
  }
  render();
}
async function connectCloud() {
  if (!cloudStore || !sessionToken || state.auth === 'loading') return;
  const dirty = state.hasUnsavedChanges && state.profile.birthDate;
  const local = dirty ? growthSnapshot(state) : null;
  const base = saveController?.getBase() || null;
  state.auth = 'loading';
  state.storageError = '';
  render();
  try {
    const { user } = await cloudStore.session();
    const envelope = await cloudStore.load();
    state.user = user;
    state.auth = 'ready';
    state.cloudLoaded = true;
    state.cloudEmpty = envelope.snapshot === null;
    cloudConflict = null;
    if (!saveController) configureSaveQueue();
    if (dirty) {
      const merged = mergeGrowthSnapshots(base, local, envelope.snapshot);
      if (merged.conflicts.length) {
        cloudConflict = { base, local, remote: envelope.snapshot, ...envelope, conflicts: merged.conflicts };
        // 冲突时保持当前编辑，等待本人决议。
        render(); openConflicts(); return;
      }
      saveController.adopt(envelope, merged.snapshot);
      if (!sameGrowth(merged.snapshot, envelope.snapshot)) void persist();
    } else {
      if (!envelope.snapshot) { state.profile = sharedProfile.get(); state.records = {}; }
      saveController.adopt(envelope);
    }
    state.stage = currentStage()?.id || state.stage;
    lastCurrentStage = currentStage()?.id;
    render();
  } catch (error) {
    state.storageError = error.message;
    state.auth = error.code === 'AUTH_REQUIRED' ? 'expired' : 'error';
    if (error.code === 'AUTH_REQUIRED' || error.code === 'ACCESS_DENIED') setSessionToken('');
    render();
  }
}
function loginCloud() {
  if (!apiBase) { openBackup(); return; }
  if (state.savePending || state.auth === 'loading') { notify('请等待当前云端请求结束'); return; }
  if (authPopup && !authPopup.closed) { authPopup.focus(); return; }
  authRequest = crypto.randomUUID();
  authPopup = window.open(`${apiBase}/auth/login?request=${encodeURIComponent(authRequest)}`, 'xiaoya-github-login', 'popup,width=560,height=720');
  if (!authPopup) { notify('请允许登录弹窗，然后重试'); return; }
  clearTimeout(authTimer);
  authTimer = setTimeout(() => { authPopup = null; authRequest = null; notify('登录等待已结束，请重新点击登录'); }, 600_000);
}
// @CfSecAICode 遵循消费金融安全编码 FE-CSRF-001 规范: 登录消息同时绑定固定来源、弹窗和一次性随机 request。
window.addEventListener('message', event => {
  if (!apiBase || event.origin !== new URL(apiBase).origin || event.source !== authPopup || !authRequest) return;
  const data = event.data;
  if (!data || data.type !== 'xiaoya-auth' || data.request !== authRequest) return;
  clearTimeout(authTimer);
  authRequest = null;
  authPopup?.close(); authPopup = null;
  if (data.error || typeof data.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token)) {
    notify(data.error === 'IDENTITY_NOT_ALLOWED' ? '只允许指定的本人 GitHub 账号登录' : '登录未完成，请重试'); return;
  }
  setSessionToken(data.token);
  document.querySelector('#app-dialog')?.close();
  void connectCloud();
});
async function logoutCloud() {
  if (cloudConflict) { openConflicts(); return; }
  if (state.hasUnsavedChanges || state.savePending) {
    if (!canEdit() || !await saveController.flush()) { notify('仍有未同步修改，请先重试或导出备份'); return; }
  }
  try { await cloudStore.logout(); }
  catch { notify('未能确认云端注销，请重试'); return; }
  setSessionToken('');
  state.auth = 'signed-out'; state.user = null; state.cloudLoaded = false;
  state.profile = sharedProfile.get(); state.records = {}; state.savedAt = null;
  state.lastUndo = null; saveController = null;
  document.querySelector('#app-dialog')?.close(); render();
}
function cloudBanner() {
  if (state.localMode && !cloudConflict) {
    if (state.localLoaded && state.profile.birthDate) return '';
    return html`<section class="cloud-banner"><span>${icon('info')}${state.localLoaded ? '本机模式：导入已有记录，或建立宝宝资料后开始记录。' : '本机记录未能读取，原记录保持不变，请重试。'}</span>${state.localLoaded ? html`<button class="primary-button" data-action="backup">本地导入</button><button class="secondary-button" data-action="profile">建立资料</button>` : html`<button class="primary-button" data-action="reload-local">重新读取本机</button>`}</section>`;
  }
  if (state.auth === 'ready' && state.profile.birthDate && !cloudConflict) return '';
  const message = cloudConflict ? `${state.localMode ? '其他页面' : '其他设备'}也修改了相同内容，请选择保留的版本。` : state.auth === 'unconfigured' ? '云端服务尚未配置。你可以浏览图谱；个人记录待配置并登录后使用。' : state.auth === 'loading' ? '正在校验身份并读取私有云端记录…' : state.auth === 'ready' ? '私有云端尚无宝宝资料。可建立资料，或迁入本机已有记录。' : '登录本人 GitHub 账号，读取并自动保存私有成长记录。';
  return html`<section class="cloud-banner"><span>${icon('info')}${message}</span>${cloudConflict ? html`<button class="primary-button" data-action="resolve-conflicts">处理冲突</button>` : state.auth === 'ready' ? html`<button class="primary-button" data-action="profile">建立资料</button><button class="secondary-button" data-action="backup">迁入或备份</button>` : state.auth !== 'unconfigured' && state.auth !== 'loading' ? html`<button class="primary-button" data-action="login">GitHub 登录</button>` : ''}</section>`;
}
function conflictLabel(conflict) {
  return conflict.skillId ? `${catalog.find(skill => skill.id === conflict.skillId)?.title || conflict.skillId} · ${conflict.field === 'note' ? '成长手记' : '完成日期'}` : conflict.field === 'name' ? '宝宝昵称' : '出生日期';
}
function openConflicts() {
  if (!cloudConflict) return;
  showDialog(html`${dialogHeader('双方内容均保留，等待你的选择', '处理同步冲突')}<form id="conflict-form">${cloudConflict.conflicts.map((item, index) => html`<fieldset class="conflict-field"><legend>${conflictLabel(item)}</legend><label><input type="radio" name="conflict-${index}" value="local" required /> 保留本页内容<pre>${item.local || '（清空／未完成）'}</pre></label><label><input type="radio" name="conflict-${index}" value="remote" required /> 保留${state.localMode ? '本机数据库' : '云端'}内容<pre>${item.remote || '（清空／未完成）'}</pre></label></fieldset>`)}<div class="form-actions"><button type="button" class="secondary-button" data-action="export">先导出本页</button><button class="primary-button" type="submit">确认选择并${state.localMode ? '保存' : '同步'}</button></div></form>`, 'conflict-dialog');
}

function notify(message, undo = false) {
  clearTimeout(toastTimer);
  const toast = document.querySelector('#toast');
  toast.replaceChildren(html`${icon('check')}<span>${message}</span>${undo ? html`<button data-action="undo">撤销</button>` : ''}`);
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), undo ? 6500 : 3800);
}

let siteShell;
function growthNavigation() {
  return [
    { id: 'views', title: '一起慢慢长大', items: [
      { id: 'baby', label: '宝宝视角', icon: 'baby', shortcut: true },
      { id: 'tree', label: '技能全景', icon: 'tree', shortcut: true },
      { id: 'next', label: '下一步', icon: 'arrow', shortcut: true }
    ] },
    { id: 'stages', title: '成长的每一站 · 0–6岁', items: STAGES.map(stage => ({
      id: 'stage:' + stage.id, label: stage.label, icon: 'sprout',
      description: currentStage()?.id === stage.id ? '当前月龄' : (() => { const stats = getStats(getStageSkills(catalog, stage.id), state.records); return stats.completed + '/' + stats.total; })()
    })) },
    { id: 'profile', title: '我的成长花园', items: [{ id: 'profile', label: '宝宝资料', icon: 'settings' }, { id: 'backup', label: '记录与备份', icon: 'source' }] }
  ];
}
function navigateGrowth(id) {
  if (id.startsWith('stage:')) { state.view = 'baby'; state.graphExpanded = false; changeStage(id.slice(6)); }
  else if (id === 'profile') openProfile();
  else if (id === 'backup') openBackup();
  else {
    const previousView = state.view;
    state.view = id; state.search = ''; state.status = 'all'; state.stageFocus = null;
    if (id === 'baby') state.stage = currentStage()?.id || (babyAge() ? 's8' : 's0');
    if (id !== previousView) graphViewportAction = 'focus';
    if (id !== 'tree') state.graphExpanded = false;
    render();
  }
  window.scrollTo(0, 0);
}

function plant() {
  return html`<div class="garden-art" aria-hidden="true"><span class="art-orbit orbit-one"></span><span class="art-orbit orbit-two"></span><span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✧</span>
    <svg class="plant" viewBox="0 0 300 245" fill="none"><ellipse cx="150" cy="222" rx="83" ry="10" fill="#cfdbbf" opacity=".55"/><path d="M150 178C154 148 145 122 151 88" stroke="#627e4c" stroke-width="5" stroke-linecap="round"/><path d="M150 139C107 145 86 115 93 90c38-6 64 17 57 49Z" fill="#9bb57c"/><path d="M151 114c-4-42 18-64 51-65 8 38-13 68-51 65Z" fill="#587b52"/><path d="m151 138-37-30m38 3 31-41" stroke="#edf1df" stroke-width="2" opacity=".7" stroke-linecap="round"/><path d="M150 94c-26-9-34-31-27-50 26 6 38 28 27 50Z" fill="#c1ce94"/><path d="M107 170h87l-9 44a13 13 0 0 1-13 10h-44a13 13 0 0 1-13-10Z" fill="#dfbda0"/><path d="M104 170a5 5 0 0 1 5-5h82a5 5 0 0 1 5 5v7h-92Z" fill="#edcfb5"/><path d="M138 191c6 6 18 6 24 0" stroke="#b78d70" stroke-width="2" stroke-linecap="round"/><circle cx="138" cy="186" r="1.5" fill="#b78d70"/><circle cx="162" cy="186" r="1.5" fill="#b78d70"/></svg>
    <span class="floating-badge badge-heart">${icon('heart')}<span>每一小步</span></span><span class="floating-badge badge-leaf">${icon('sprout')}<span>都是成长</span></span>
  </div>`;
}

function hero() {
  const overall = getStats(catalog, state.records);
  return html`<section class="hero"><div class="hero-copy"><div class="eyebrow"><span></span> 陪伴小小的你，探索大大的世界</div><h1><span class="hero-title-full">小小的进步，<br />慢慢长成大大的世界<span>。</span></span><span class="hero-title-mobile">每一小步，都是成长。</span></h1><p>陪${state.profile.name}探索，收藏每一个「我会啦」的瞬间。</p></div>${plant()}<div class="hero-counter"><strong>${overall.completed}<span> / ${overall.total}</span></strong><small>颗成长小芽已点亮</small><span class="counter-leaves">${icon('sprout')}</span></div></section>`;
}

function stageCompleteBadge(stageId) {
  const stats = getStats(getStageSkills(catalog, stageId), state.records);
  return stats.total && !stats.remaining ? html`<small class="stage-complete-badge" aria-label="${STAGES.find(stage => stage.id === stageId).label}全部技能已完成">${icon('check')} 本阶段已完成</small>` : '';
}
function stageCompleteButton(stageId) {
  const stage = STAGES.find(item => item.id === stageId);
  const stats = getStats(getStageSkills(catalog, stageId), state.records);
  return html`<button class="stage-complete-button" data-complete-stage="${stageId}" aria-label="${stage.label}全部完成" title="将${stage.label}四个领域的全部 ${stats.total} 项技能标记完成；已有完成日期和手记保留" disabled="${!stats.remaining}">${icon('check')}${stats.remaining ? '全部完成' : '全部已完成'}</button>`;
}
function graphStageHeading(stage) {
  return html`<div class="graph-stage-heading"><div class="graph-stage-title"><strong>${stage.label}</strong>${stageCompleteButton(stage.id)}</div><div class="graph-stage-badges">${currentStage()?.id === stage.id ? html`<small class="stage-current-badge">宝宝在这里</small>` : ''}${stageCompleteBadge(stage.id)}</div></div>`;
}

function stageNavigator() {
  const stage = selectedStage();
  const current = currentStage();
  const index = STAGES.indexOf(stage);
  const preview = state.view === 'baby' && Boolean(current) && current.id !== stage.id;
  return html`<section class="stage-picker" aria-label="切换成长阶段">
    <div class="stage-picker-heading"><span class="section-kicker">跟着宝宝的节奏</span><span class="swipe-hint">左右滑动，看看前后阶段 ${icon('arrow')}</span></div>
    <div class="stage-picker-controls"><button class="circle-button" data-action="prev-stage" aria-label="前一阶段" disabled="${index === 0}">${icon('chevron', 'rotate')}</button><label class="stage-select-label"><span>当前阶段</span><select id="growth-stage-select" aria-label="选择成长阶段">${STAGES.map(item => html`<option value="${item.id}" selected="${item.id === stage.id}">${item.label}${item.id === current?.id ? ' · 宝宝当前阶段' : ''}</option>`)}</select></label><div class="stage-track" id="stage-track">${STAGES.map(item => html`<button class="stage-pill ${item.id === stage.id ? 'active' : ''}" data-stage="${item.id}" aria-pressed="${item.id === stage.id}"><span>${item.shortLabel}</span>${item.id === current?.id ? html`<span class="current-stage-dot" title="宝宝当前阶段"></span>` : ''}${getStats(getStageSkills(catalog, item.id), state.records).remaining === 0 ? icon('check', 'stage-pill-check') : ''}</button>`)}</div><button class="circle-button" data-action="next-stage" aria-label="下一阶段" disabled="${index === STAGES.length - 1}">${icon('chevron')}</button></div>
    ${preview ? html`<div class="preview-caption">正在预览 ${stage.label}<button class="text-button" data-action="current-stage">回到宝宝当前阶段 ${icon('arrow')}</button></div>` : !current && state.view === 'baby' ? html`<div class="preview-caption">${babyAge() ? '宝宝已超出图谱年龄范围，可以继续回顾每个阶段。' : state.profile.birthDate ? '宝宝还未出生，可以先预览各阶段。' : state.localMode ? '导入记录或建立宝宝资料后自动定位。' : '先浏览各个阶段，登录并建立宝宝资料后自动定位。'}</div>` : ''}
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
  return html`<article class="skill-row ${done ? 'completed' : ''} ${tree ? 'tree-node' : ''}" data-node="${tree ? skill.id : ''}" data-skill-id="${skill.id}"><button class="skill-check ${done ? 'is-checked' : ''}" data-toggle="${skill.id}" aria-label="${done ? '撤销完成：' : '标记完成：'}${skill.title}" aria-pressed="${done}">${done ? icon('check') : ''}</button><button class="skill-open" data-detail="${skill.id}" title="点击查看通俗解释、陪玩方法与手记"><span class="skill-title">${skill.title}</span><span class="skill-category">${skill.category}${record?.note ? html`<span class="has-note">${icon('note')} 有手记</span>` : ''}</span></button><button class="lineage-entry" data-lineage="${skill.id}" aria-label="查看${skill.title}完整脉络">${icon('tree')}<span>脉络</span></button>${tree ? '' : html`<button class="detail-arrow" data-detail="${skill.id}" aria-label="查看${skill.title}解释与手记">${icon('chevron')}</button>`}</article>`;
}

function resourceSection(config) {
  if (!config || (!config.guidance && !config.enrichment?.length && !config.toyIdeas?.length)) return '';
  return html`<section class="resource-section"><h3>${icon('book')} 陪伴与探索</h3>${config.guidance ? html`<p>${config.guidance}</p>` : ''}${config.enrichment?.length ? html`<h4>全科启蒙</h4><ul>${config.enrichment.map(item => html`<li>${item}</li>`)}</ul>` : ''}${config.toyIdeas?.length ? html`<h4>玩具候选</h4><ul>${config.toyIdeas.map(item => html`<li>${item}</li>`)}</ul>` : ''}</section>`;
}

function skillGuideSection(skill) {
  const guide = skillGuides.skills[skill.id];
  if (!guide) return html`<section class="skill-guide"><h3>${icon('book')} 看懂这个技能</h3><p>这项技能的解释暂未加载，请刷新后再试。</p></section>`;
  const concept = skillGuides.categories[skill.category];
  const sourceIds = [...new Set([...(guide.sources || []), ...(concept?.sources || [])])];
  return html`<section class="skill-guide" aria-label="${skill.title}的详细解释">
    <div class="guide-heading"><span>${icon('book')} 看懂这个技能</span><small>从日常小事理解成长</small></div>
    <h3>这是什么意思？</h3><p class="guide-meaning">${guide.meaning}</p>
    <div class="guide-example"><h4>生活里的样子</h4><p>${guide.example}</p></div>
    <details class="growth-reading-fold"><summary>陪玩方法与观察要点</summary><div class="guide-practice"><section><h4>${icon('sprout')} 可以这样陪玩</h4><p>${guide.play}</p></section><section><h4>${icon('check')} 可以观察什么</h4><p>${guide.observe}</p></section></div></details>
    ${guide.note ? html`<aside class="guide-note">${icon('info')}<p>${guide.note}</p></aside>` : ''}
    ${concept ? html`<details class="guide-concept"><summary>认识这个概念 · ${skill.category}${icon('chevron')}</summary><p>${concept.meaning}</p><p class="concept-example">比如：${concept.example}</p></details>` : ''}
    <details class="guide-sources"><summary>参考资料 · ${sourceIds.length} 项${icon('chevron')}</summary><p>以下资料用于解释相关能力与活动，原图的月龄、名称和进阶顺序不等于这些资料的统一标准。</p><ul>${sourceIds.map(id => {
      const source = skillGuides.sources[id];
      return source ? html`<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}${icon('arrow')}</a><span>${source.publisher}</span></li>` : '';
    })}</ul></details>
  </section>`;
}

function milestoneList() {
  const stage = selectedStage();
  const allStageSkills = getStageSkills(catalog, stage.id);
  const stats = getStats(allStageSkills, state.records);
  const domainSkills = allStageSkills.filter(skill => skill.domain === state.domain);
  const filterStats = getStats(domainSkills, state.records);
  const needle = state.search.trim().toLocaleLowerCase();
  const skills = domainSkills.filter(skill => (state.status === 'all' || (state.status === 'done' ? isDone(skill.id) : !isDone(skill.id))) && (!needle || `${skill.title} ${skill.category}`.toLocaleLowerCase().includes(needle)));
  return html`<section class="milestones" id="milestones"><div class="section-title-row"><div><div class="section-kicker">属于这个阶段的小发现</div><h2>${stage.label}<span>的小小里程碑</span>${currentStage()?.id === stage.id ? html`<small class="current-badge">当前阶段</small>` : ''}${stageCompleteBadge(stage.id)}</h2><p>年龄是一份参考，成长有自己的节奏。</p></div><div class="stage-summary-actions">${stageCompleteButton(stage.id)}<div class="stage-summary"><strong>${stats.completed}<span> / ${stats.total}</span></strong><small>个技能已点亮</small></div></div></div>
    <div class="list-toolbar"><div class="status-tabs" role="group" aria-label="完成状态"><button data-status="all" class="${state.status === 'all' ? 'active' : ''}" aria-pressed="${state.status === 'all'}">全部 <small>${filterStats.total}</small></button><button data-status="pending" class="${state.status === 'pending' ? 'active' : ''}" aria-pressed="${state.status === 'pending'}">探索中 <small>${filterStats.remaining}</small></button><button data-status="done" class="${state.status === 'done' ? 'active' : ''}" aria-pressed="${state.status === 'done'}">已完成 <small>${filterStats.completed}</small></button></div><label class="search-box">${icon('search')}<input id="skill-search" type="search" value="${state.search}" placeholder="找一个小技能" aria-label="搜索本阶段技能" autocomplete="off" /></label></div>
    <div class="filter-caption">正在查看：${domainInfo(state.domain).label} · 在上方进度卡片切换领域</div>
    ${skills.length ? html`<div class="skill-groups">${DOMAINS.filter(domain => skills.some(skill => skill.domain === domain.id)).map(domain => {
      const items = skills.filter(skill => skill.domain === domain.id);
      const domainStats = getStats(allStageSkills.filter(skill => skill.domain === domain.id), state.records);
      return html`<details class="skill-group domain-${domain.id}" open><summary class="group-heading" title="展开或收起技能清单"><span class="domain-icon">${icon(domain.id)}</span><span class="group-label"><strong>${domain.label}</strong><span>${domain.description}</span></span><span class="group-count">${domainStats.completed} / ${domainStats.total}</span>${icon('chevron', 'group-fold-icon')}</summary><div class="skill-items">${items.map(skill => skillRow(skill))}</div><div class="group-footer">${icon('sprout')} ${domainStats.completed ? `已经发现 ${domainStats.completed} 份小小的成长` : '新的探索，从这里开始'}</div></details>`;
    })}</div>` : html`<div class="empty-state">${icon(state.status === 'done' ? 'sprout' : 'search')}<h3>${state.search ? '还没找到这个技能' : state.status === 'done' ? '第一颗小芽，等你来点亮' : '这里的小技能都探索过啦'}</h3><p>${state.search ? '换个词试试，或清除筛选看看。' : state.status === 'done' ? '点一下技能旁的圆圈，记下宝宝的成长。' : '可以回顾已完成的技能，或看看下一阶段。'}</p><button class="secondary-button" data-action="clear-filters">清除筛选</button></div>`}
    ${resourceSection(resources[stage.id])}
    <div class="list-footnote">${icon('info')} 点圆圈记录完成，再点一次即可回退；点技能名称看解释、陪玩方法或写手记。</div>
  </section>`;
}

function nextTrainingCard(skill, timing) {
  const guide = skillGuides.skills[skill.id];
  const parents = catalog.filter(item => skill.parents.includes(item.id));
  return html`<article class="next-skill-card timing-${timing}" data-next-skill="${skill.id}">
    <div class="next-skill-meta"><span>${skill.category}</span><span>${skillStageLabel(skill)}</span></div>
    <h3>${skill.title}</h3>${guide?.meaning ? html`<p class="next-skill-meaning">${guide.meaning}</p>` : ''}
    <p class="next-prerequisites">${parents.length ? `接着练：${parents.map(item => item.title).join('、')} → ${skill.title}` : '本分支的起点 · 原图未列前置技能'}</p>
    ${guide?.observe || guide?.play ? html`<details class="next-practice"><summary>怎么观察、怎么陪玩 ${icon('chevron')}</summary><div class="next-skill-tips">${guide.observe ? html`<div><h4>怎么观察</h4><p>${guide.observe}</p></div>` : ''}${guide.play ? html`<div><h4>可以这样陪玩</h4><p>${guide.play}</p></div>` : ''}</div></details>` : ''}
    <div class="next-skill-actions"><button class="primary-button" data-toggle="${skill.id}" aria-label="标记完成：${skill.title}">${icon('check')} 标记完成</button><button class="secondary-button" data-detail="${skill.id}" aria-label="查看${skill.title}解释与手记">${icon('book')} 解释与手记</button><button class="text-button" data-lineage="${skill.id}" aria-label="查看${skill.title}完整脉络">${icon('tree')} 完整脉络</button></div>
  </article>`;
}

function nextStepView() {
  const domain = domainInfo(state.domain);
  const current = currentStage();
  const skills = getNextSkills(catalog, state.records, domain.id, current?.id);
  const pending = catalog.filter(skill => skill.domain === domain.id && !isDone(skill.id));
  const groups = [
    { id: 'current', label: '当前阶段 · 可以开始' },
    { id: 'earlier', label: '此前阶段 · 补充基础' },
    { id: 'next', label: '下一月龄阶段 · 顺着脉络继续' },
    { id: 'later', label: '更后阶段 · 已走到这一步' },
    { id: 'unknown', label: '可以开始的技能' },
  ];
  const undo = state.lastUndo;
  const canUndo = undo?.id && !undo.previous?.completedAt && isDone(undo.id);
  return html`<section class="next-step-view domain-${domain.id}" aria-label="下一步待完成技能">
    <header class="next-step-header"><div class="section-kicker">每条脉络，都有下一小步</div><h1>现在可以练这些。</h1><p>汇总各条脉络上前置已完成的首个未完成技能，跨月龄也会继续展示。完成一项后，列表自动推进。</p><span class="next-current-age">${current ? `当前 ${current.label}` : '训练建议'}<button class="text-button" data-action="profile">编辑资料</button></span></header>
    <div class="lineage-domains next-domains" role="group" aria-label="下一步技能领域">${DOMAINS.map(item => {
      const count = getNextSkills(catalog, state.records, item.id, current?.id).length;
      return html`<button class="lineage-domain domain-${item.id} ${item.id === domain.id ? 'active' : ''}" data-domain="${item.id}" aria-pressed="${item.id === domain.id}">${icon(item.id)}<strong>${item.label}</strong><span>可探索 ${count}</span></button>`;
    })}</div>
    <div class="next-age-legend" aria-label="月龄颜色图例"><span class="timing-current">蓝 · 当前阶段</span><span class="timing-next">橙 · 下一月龄</span><span class="timing-later">紫 · 更后阶段</span><span class="timing-earlier">灰 · 此前阶段</span><small>月龄仅作参考，可按宝宝的兴趣选择；同一技能只列一次。</small></div>
    ${canUndo ? html`<div class="next-undo"><span>刚刚完成：${catalog.find(item => item.id === undo.id)?.title}</span><button class="text-button" data-action="undo">撤销上次完成</button></div>` : ''}
    <div class="next-results-summary" role="status">${domain.label} · ${skills.length} 项可探索${pending.length > skills.length ? ` · 另有 ${pending.length - skills.length} 项等待前置完成或进入相应月龄` : ''}</div>
    ${skills.length ? groups.map(group => {
      const items = skills.filter(skill => getSkillAgeStatus(skill, current?.id) === group.id);
      return items.length ? html`<section class="next-training-group timing-${group.id}" aria-label="${group.label}"><h2><span class="next-timing-label">${group.label}</span><small>${items.length} 项</small></h2><div class="next-training-grid">${items.map(skill => nextTrainingCard(skill, group.id))}</div></section>` : '';
    }) : html`<div class="next-complete"><span>${icon(pending.length ? 'sprout' : 'check')}</span><h2>${pending.length ? '当前没有前置已完成的技能' : `${domain.label}的技能已全部点亮`}</h2><p>${pending.length ? '可以在其他领域补充前置技能，或在宝宝视角核对完成记录；新的独立分支会在相应月龄出现。' : '可以切换其他领域，或在技能全景回顾、回退完成状态。'}</p></div>`}
    <p class="next-step-rule">有多项前置时，全部标注完成后才列出后续技能；路径中的分叉可同时展示。这里与宝宝视角、技能全景共用完成记录，回退后也会重新计算。</p>
  </section>`;
}

const BRANCH_COLORS = ['#f57b37', '#9360df', '#3285de', '#12a47d', '#e35092', '#d39e18'];
function branchColor(category, categories) {
  return BRANCH_COLORS[Math.max(0, categories.indexOf(category)) % BRANCH_COLORS.length];
}

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
  const selected = skill.id === currentGraph.focusId;
  const role = selected ? 'focus' : relations.ancestors.some(item => item.id === skill.id) ? 'ancestor'
    : relations.descendants.some(item => item.id === skill.id) ? 'descendant'
    : relations.supporting.some(item => item.id === skill.id) || contextIds.includes(skill.id) ? 'supporting' : 'neutral';
  const children = catalog.filter(item => item.parents?.includes(skill.id));
  return html`<article class="graph-node role-${role} ${done ? 'node-completed' : ''} ${currentGraph.stageIds?.includes(skill.id) ? 'node-in-stage' : ''}" data-graph-node="${skill.id}" style="left:${position.x}px;top:${position.y}px;width:${position.width}px;height:${position.height}px;--branch-color:${branchColor(skill.category, categories)}" aria-label="${skill.title}，${skillStageLabel(skill)}">
    <button class="graph-select" data-focus-skill="${skill.id}" aria-label="追踪${skill.title}的前后脉络" aria-pressed="${selected}" title="${skill.title}"><span class="graph-node-meta"><span>${skill.category}</span><span>${skillStageLabel(skill)}</span></span><strong class="graph-node-title">${skill.title}</strong></button>
    <div class="graph-node-bottom"><span class="node-link-count">${skill.parents.length} 前序 <span>·</span> ${children.length} 后续</span>${selected ? html`<span class="node-focus-badge">${done ? '已完成' : '正在看'}</span>` : done ? html`<span class="node-done-label">已完成</span>` : ''}<button class="graph-explain" data-detail="${skill.id}" aria-label="查看${skill.title}解释" title="查看通俗解释与陪玩方法">解释</button><button class="skill-check ${done ? 'is-checked' : ''}" data-toggle="${skill.id}" aria-label="${done ? '撤销完成：' : '标记完成：'}${skill.title}" aria-pressed="${done}">${done ? icon('check') : ''}</button></div>
  </article>`;
}

function graphWorkspace(graph, layout, relations, categories) {
  categories = [...new Set([...categories, ...graph.nodes.map(skill => skill.category)])];
  return html`<div class="graph-workspace ${state.graphExpanded ? 'is-expanded' : ''}" id="graph-workspace"><div class="graph-toolbar"><div class="graph-tools"><button data-action="graph-zoom-out" aria-label="缩小技能树">−</button><output id="graph-zoom-label">${Math.round(state.graphZoom * 100)}%</output><button data-action="graph-zoom-in" aria-label="放大技能树">＋</button><button data-action="graph-fit">一屏看全</button><button data-action="graph-locate">定位当前技能</button>${state.view === 'tree' ? html`<button type="button" data-action="graph-current-age" aria-label="回到宝宝当前月龄" title="回到宝宝当前月龄${currentStage() ? `：${currentStage().label}` : ''}">${icon('locate')}</button>` : ''}<button data-action="graph-expand" aria-label="${state.graphExpanded ? '退出放大画布' : '放大画布'}">${icon(state.graphExpanded ? 'close' : 'expand')}</button></div></div>
      <div class="graph-legend-panel"><details class="graph-legend-disclosure"><summary><span>图例 · 连线与颜色</span><span class="legend-disclosure-hint">点击<span class="legend-expand-label">展开</span><span class="legend-collapse-label">收起</span>${icon('chevron')}</span></summary>
      <div class="graph-key" role="group" aria-label="技能卡片颜色图例">
        <div class="graph-legend" aria-label="关系连线图例"><strong>连线</strong><span><i class="legend-ancestor" aria-hidden="true"></i>前序脉络</span><span><i class="legend-descendant" aria-hidden="true"></i>后续发展</span><span><i class="legend-supporting" aria-hidden="true"></i>跨分支前置</span><span><i class="legend-neutral" aria-hidden="true"></i>其他关系</span></div>
        <div class="graph-legend"><strong>左侧色条 · 技能分支</strong>${categories.filter(category => graph.nodes.some(skill => skill.category === category)).map(category => html`<span><i class="legend-branch" style="background:${branchColor(category, categories)}" aria-hidden="true"></i>${category}</span>`)}</div>
        <div class="graph-legend"><strong>卡片底色</strong><span><i class="legend-card legend-card-plain" aria-hidden="true"></i>白色：待探索</span><span><i class="legend-card legend-card-supporting" aria-hidden="true"></i>淡黄：跨分支前置</span><span><i class="legend-card legend-card-done" aria-hidden="true">✓</i>淡绿：已完成</span><span><i class="legend-card legend-card-focus" aria-hidden="true"></i>紫色：正在追踪</span></div>
        <p>跨分支前置：后续发展还需要的其他分支技能。完成状态以右下角的 √ 为准。</p>
      </div></details></div>
      <div class="graph-viewport" id="graph-viewport" tabindex="0" aria-label="${domainInfo(relations.skill.domain).label}完整技能脉络，可拖动或滚动查看"><div class="graph-scale-space" id="graph-scale-space" style="width:${layout.width * state.graphZoom}px;height:${layout.height * state.graphZoom}px"><div class="graph-scene" id="graph-scene" style="width:${layout.width}px;height:${layout.height}px;transform:scale(${state.graphZoom})">${layout.stages.map((stage, index) => html`<div class="graph-age-band ${graph.stageIds && stage.id === state.stage ? 'selected-age-band' : ''} ${index % 2 ? 'alternate' : ''}" style="left:${stage.x}px;width:${stage.width}px;height:${layout.height}px">${graphStageHeading(stage)}${graph.stageIds && stage.id === state.stage ? html`<span class="selected-age-label">正在看这个阶段</span>` : ''}</div>`)}<svg id="graph-edges" width="${layout.width}" height="${layout.height}" aria-hidden="true"></svg>${layout.nodes.map(position => graphNode(catalog.find(item => item.id === position.id), position, relations, categories, graph.contextIds))}</div></div></div>
      <div class="graph-bottom-bar"><span>${icon('arrow')} 箭头指向下一项技能 · 拖动画布或横向滚动</span><span>${graph.nodes.length} 个技能 · ${graph.edges.length} 条关系${graph.stageIds ? ` · ${graph.stageIds.length} 项属于所选阶段` : graph.contextIds.length ? ` · 已保留 ${graph.contextIds.length} 项跨分支前序` : ''}</span></div>
    </div>`;
}

function stageTreeView() {
  const stage = selectedStage();
  const domain = domainInfo(state.domain);
  const graphKey = `stage:${stage.id}:${domain.id}`;
  if (currentGraph?.key !== graphKey) state.stageFocus = null;
  const graph = getStageGraph(catalog, stage.id, domain.id);
  if (state.stageFocus && !graph.nodes.some(item => item.id === state.stageFocus)) {
    const extra = getSkillRelations(catalog, state.stageFocus);
    if (extra) {
      const included = new Set([...graph.nodes, ...extra.nodes].map(item => item.id));
      graph.nodes = catalog.filter(item => included.has(item.id));
      graph.edges = graph.nodes.flatMap(item => item.parents.filter(id => included.has(id)).map(id => ({ from: id, to: item.id, kind: 'neutral' })));
    }
  }
  const stageSkills = graph.nodes.filter(skill => graph.stageIds.includes(skill.id));
  const skill = graph.nodes.find(item => item.id === state.stageFocus)
    || stageSkills.find(item => item.parents.length && catalog.some(child => child.parents.includes(item.id)))
    || stageSkills[0];

  if (!skill) {
    currentGraph = null;
    return html`<section class="stage-lineage"><h2>${stage.label}的成长脉络</h2>${domainCards()}<p class="neighbor-empty">原图在这个阶段未列出${domain.label}技能，可以切换领域或阶段查看。</p></section>`;
  }
  state.stageFocus = skill.id;
  const relations = getSkillRelations(catalog, skill.id);
  const relationEdges = new Map(relations.edges.map(edge => [`${edge.from}:${edge.to}`, edge.kind]));
  graph.edges = graph.edges.map(edge => ({ ...edge, kind: relationEdges.get(`${edge.from}:${edge.to}`) || 'neutral' }));
  const layout = layoutGraph(graph.nodes, graph.edges);
  if (currentGraph?.key !== graphKey && graphViewportAction !== 'current-age') graphViewportAction = 'focus';
  currentGraph = { ...graph, layout, relations, focusId: skill.id, key: graphKey };
  const categories = [...new Set(graph.nodes.map(item => item.category))];
  return html`<section class="stage-lineage domain-${domain.id}" aria-label="本阶段技能脉络">
    <div class="section-title-row lineage-title-row"><h2>${stage.label}<span>的成长脉络</span></h2><div class="section-tools" role="group" aria-label="成长脉络工具栏"><button data-action="stage-graph-current" aria-label="定位本阶段" title="定位本阶段">${icon('locate')}</button><button data-lineage="${skill.id}" aria-label="在技能全景展开" title="在技能全景展开">${icon('expand')}</button></div></div>
    ${domainCards()}
    <div class="stage-lineage-focus"><span>${icon('tree')} 正在追踪：<strong>${skill.title}</strong><small>${skillStageLabel(skill)}</small></span></div>
    ${graphWorkspace(graph, layout, relations, categories)}
    <p class="lineage-footnote">${icon('info')} 连线沿用原始图谱的发展关系，年龄与前后关系仅作参考；前序未标记，也可以记录后续技能。下方清单的筛选不会隐藏这里的依赖关系。</p>
  </section>`;
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
  currentGraph = { ...graph, layout, relations, focusId: skill.id, key: 'tree' };
  const stats = getStats(graph.nodes, state.records);
  return html`<section class="lineage-view domain-${domain.id}">
    <header class="lineage-header"><div><span class="lineage-eyebrow">小技能，大脉络</span><h1>成长的来龙去脉，一眼看懂<span>。</span></h1><p>从哪一步走来，再向哪里生长。点一个技能，顺着箭头一路看下去。</p></div><span class="lineage-header-icon">${icon('tree')}</span></header>
    <div class="lineage-domains" role="group" aria-label="技能树领域">${DOMAINS.map(item => html`<button class="lineage-domain domain-${item.id} ${item.id === domain.id ? 'active' : ''}" data-tree-domain="${item.id}" aria-pressed="${item.id === domain.id}">${icon(item.id)}<strong>${item.label}</strong><span>${catalog.filter(node => node.domain === item.id).length} 个技能</span></button>`)}</div>
    <div class="lineage-controls"><div class="graph-mode-tabs" role="group" aria-label="脉络查看范围"><button data-tree-mode="lineage" class="${state.treeMode === 'lineage' ? 'active' : ''}" aria-pressed="${state.treeMode === 'lineage'}">${icon('tree')} 这项技能的完整脉络</button><button data-tree-mode="overview" class="${state.treeMode === 'overview' ? 'active' : ''}" aria-pressed="${state.treeMode === 'overview'}">整个领域全景</button></div><label class="lineage-picker"><span>定位技能</span><select id="tree-focus" aria-label="定位技能">${STAGES.map(stage => {
      const items = catalog.filter(item => item.domain === domain.id && item.stage === stage.id);
      return items.length ? html`<optgroup label="${stage.label}">${items.map(item => html`<option value="${item.id}" selected="${item.id === skill.id}">${item.title}</option>`)}</optgroup>` : '';
    })}</select></label>${state.treeMode === 'overview' ? html`<label class="lineage-picker branch-picker"><span>能力分支</span><select id="tree-category" aria-label="选择技能分支"><option value="all" selected="${state.treeCategory === 'all'}">全部分支</option>${categories.map(category => html`<option value="${category}" selected="${state.treeCategory === category}">${category}</option>`)}</select></label>` : ''}</div>
    <div class="focus-strip"><span class="focus-strip-icon">${icon(domain.id)}</span><div><span class="focus-strip-kicker">正在追踪 · ${skillStageLabel(skill)}</span><h2>${skill.title}</h2></div><div class="trace-counts"><span><strong>${relations.ancestors.length}</strong> 项上游</span><span><strong>${relations.descendants.length}</strong> 项后续</span><span><strong>${stats.completed}/${stats.total}</strong> 已完成</span></div></div>
    ${graphWorkspace(graph, layout, relations, categories)}
    <p class="lineage-footnote">${icon('info')} 脉络来自原始图谱的发展关系，支持跨年龄、跨分支查看；前序尚未标注，也可以记录后续技能。</p>
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
  if (state.view !== 'tree') {
    state.stageFocus = id;
    graphViewportAction = 'focus';
    render();
    return;
  }
  state.treeFocus = id;
  state.treeDomain = skill.domain;
  if (state.treeMode === 'overview' && currentGraph && !currentGraph.nodes.some(item => item.id === id)) state.treeCategory = 'all';
  graphViewportAction = 'focus';
  render();
}

const growthReadingState = new Map();
function organizeGrowthReading() {
  const narrow = window.matchMedia('(max-width:900px)').matches;
  siteShell.content.querySelectorAll('details.skill-group').forEach(fold => {
    fold.open = growthReadingState.get('skill-list') ?? true;
    fold.addEventListener('toggle', () => {
      if (fold.isConnected) growthReadingState.set('skill-list', fold.open);
    });
  });
  const wrap = (key, label, nodes) => {
    const items = nodes.filter(Boolean);
    if (!items.length) return;
    const fold = document.createElement('details');
    fold.className = 'growth-mobile-fold';
    fold.dataset.readingKey = key;
    fold.open = !narrow || (growthReadingState.get(key) ?? key === 'stage-graph');
    const summary = document.createElement('summary'); summary.textContent = label;
    items[0].before(fold); fold.append(summary, ...items);
    fold.addEventListener('toggle', () => {
      if (window.matchMedia('(max-width:900px)').matches) growthReadingState.set(key, fold.open);
      if (fold.open && fold.querySelector('#graph-viewport')) requestAnimationFrame(() => { drawTree(); locateGraphFocus(); });
    });
  };
  if (state.view === 'baby') {
    const lineage = siteShell.content.querySelector('.stage-lineage');
    if (lineage) wrap('stage-graph', '阶段图谱与完整脉络', [...lineage.children].filter(child => child.matches('.graph-workspace,.lineage-footnote')));
    const resource = siteShell.content.querySelector('.milestones>.resource-section');
    if (resource) wrap('stage-resources', '本阶段的陪伴与启蒙参考', [resource]);
    layoutGrowthStageReading();
  }
}
function layoutGrowthStageReading() {
  const content = siteShell?.content;
  const lineage = content?.querySelector('.stage-lineage');
  const fold = content?.querySelector('[data-reading-key="stage-graph"]');
  if (!lineage || !fold) return;
  const heading = content.querySelector('.stage-lineage>.section-title-row') || fold.querySelector('.section-title-row');
  const focus = content.querySelector('.stage-lineage-focus');
  const milestones = content.querySelector('.milestones');
  if (window.matchMedia('(max-width:900px)').matches) {
    // 先阶段、领域、技能；完整图谱放在技能清单之后，展开时仍使用原节点。
    fold.querySelector('summary').after(...[heading, focus].filter(Boolean));
    milestones?.after(fold);
  } else {
    if (heading) lineage.prepend(heading);
    lineage.querySelector('.domain-cards')?.after(...[focus, fold].filter(Boolean));
  }
}
window.matchMedia('(max-width:900px)').addEventListener('change', event => {
  layoutGrowthStageReading();
  document.querySelectorAll('.growth-mobile-fold').forEach(fold => { fold.open = !event.matches || (growthReadingState.get(fold.dataset.readingKey) ?? fold.dataset.readingKey === 'stage-graph'); });
});

function render() {
  const active = document.activeElement;
  const focusId = active?.id === 'skill-search' ? active.id : null;
  const selection = focusId ? active.selectionStart : 0;
  const graphViewport = document.querySelector('#graph-viewport');
  const graphScroll = { top: graphViewport?.scrollTop || 0, left: graphViewport?.scrollLeft || 0 };
  document.body.classList.toggle('graph-is-expanded', state.graphExpanded);
  if (!siteShell) {
    siteShell = window.XiaoyaSite.createShell({ sectionId: 'growth', siteRoot: './', onNavigate: navigateGrowth });
    app.replaceChildren(siteShell.element);
  }
  const viewLabel = state.view === 'baby' ? '宝宝视角' : state.view === 'next' ? '下一步' : '技能全景';
  siteShell.update({ navigation: growthNavigation(), activeId: state.view, title: viewLabel });
  siteShell.actions.replaceChildren(html`<div class="topbar-actions"><button class="save-status ${saveProblem() ? 'has-error' : ''}" data-action="storage-status" aria-label="保存状态：${saveLabel()}" title="${saveProblem() || saveTimeLabel()}"><span class="save-status-dot"></span><span data-save-label aria-live="polite">${saveLabel()}</span></button><span class="today-label">${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</span><a class="icon-button source-link" href="./assets/original.pdf" target="_blank" rel="noopener" aria-label="查看原始 PDF">${icon('book')}<span>原始图谱</span></a><button class="icon-button" data-action="backup" aria-label="管理备份">${icon('download')}<span>备份</span></button></div>`);
  siteShell.content.replaceChildren(html`<div class="growth-content ${state.view === 'tree' ? 'graph-main' : state.view === 'next' ? 'next-main' : ''}"><div id="storage-warning" class="storage-warning" role="alert" hidden="${!saveProblem()}"><span data-storage-error>${saveProblem()}</span><button data-action="retry-save">重试保存</button><button data-action="export">导出备份</button></div>${cloudBanner()}${state.view === 'tree' ? treeView() : state.view === 'next' ? nextStepView() : html`${hero()}${stageNavigator()}${stageTreeView()}${milestoneList()}`}<footer class="page-footer"><span>${icon('sprout')} 陪伴，比进度更重要。</span><span>内容源于 MAMAHAHA 宝宝发展技能树 · ${state.localMode ? '个人记录保存在此浏览器' : '个人记录登录后同步到私有云端'}</span></footer></div>`);

  organizeGrowthReading();
  if (state.graphExpanded) document.querySelector('.graph-toolbar')?.append(siteShell.createSectionSwitch());
  syncGraphLegend();
  document.querySelector('.graph-legend-disclosure > summary')?.addEventListener('click', event => {
    graphLegendOpen = !event.currentTarget.parentElement.open;
  });
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
      else if (graphViewportAction === 'current-age') locateCurrentAgeStage(false);
      else { viewport.scrollTop = graphScroll.top; viewport.scrollLeft = graphScroll.left; }
      graphViewportAction = null;
    }
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
  const position = currentGraph?.layout.nodes.find(node => node.id === currentGraph.focusId);
  if (!viewport || !position) return;
  if (state.graphZoom < .6) setGraphZoom(.85, false);
  viewport.scrollLeft = (position.x + position.width / 2) * state.graphZoom - viewport.clientWidth / 2;
  viewport.scrollTop = (position.y + position.height / 2) * state.graphZoom - viewport.clientHeight / 2;
}

function locateCurrentAgeStage(rebuild = true) {
  const current = currentStage();
  if (!current) { notify('当前月龄不在图谱范围内'); return; }
  const stage = currentGraph?.layout.stages.find(item => item.id === current.id);
  if (!stage && rebuild) {
    const domain = state.view === 'tree' ? state.treeDomain : state.domain;
    if (!getStageSkills(catalog, current.id).some(skill => skill.domain === domain)) {
      notify('当前领域在这个月龄暂无技能，可切换领域查看');
      return;
    }
    if (state.view === 'tree') {
      state.treeMode = 'overview';
      state.treeCategory = 'all';
    } else {
      state.stage = current.id;
      state.stageFocus = null;
    }
    graphViewportAction = 'current-age';
    render();
    return;
  }
  const viewport = document.querySelector('#graph-viewport');
  if (!viewport || !stage) return;
  if (state.graphZoom < .6) setGraphZoom(.85, false);
  viewport.scrollLeft = stage.x * state.graphZoom - Math.max(12, (viewport.clientWidth - stage.width * state.graphZoom) / 2);
  viewport.scrollTop = 0;
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
function dialogHeader(kicker, title) { return html`<header class="dialog-header"><div><span class="section-kicker">${kicker}</span><h2 id="dialog-title">${title}</h2></div>${siteShell.createSectionSwitch()}<button class="circle-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></header>`; }

function openDetail(id) {
  const skill = catalog.find(item => item.id === id);
  if (!skill) return;
  const record = state.records[id] || {};
  const parents = (skill.parents || []).map(parent => catalog.find(item => item.id === parent)).filter(Boolean);
  const children = catalog.filter(item => item.parents?.includes(id));
  const done = isDone(id);
  const dialog = showDialog(html`${dialogHeader('每一个「我会啦」，都很珍贵', skill.title)}<div class="detail-tags domain-${skill.domain}"><span>${icon(skill.domain)}${domainInfo(skill.domain).label}</span><span>${skill.category}</span><span>${skillStageLabel(skill)}</span></div>${skillGuideSection(skill)}<form id="skill-form" data-id="${id}"><div class="detail-status ${done ? 'done' : ''}"><span>${icon(done ? 'check' : 'sprout')}<strong>${done ? '这颗成长小芽，已点亮' : '正在慢慢探索'}</strong></span><button type="button" class="${done ? 'secondary-button' : 'primary-button'}" data-toggle="${id}">${done ? '回退为探索中' : '标记已完成'}</button></div>${done ? html`<label class="form-field">学会的日子<input type="date" name="completedAt" value="${record.completedAt}" max="${localDateString()}" min="${state.profile.birthDate}" required /></label>` : ''}<label class="form-field">成长手记 <span>可选 · 留住这一刻</span><textarea id="skill-note" name="note" rows="4" maxlength="2000" placeholder="今天宝宝有了什么新发现？">${record.note || ''}</textarea></label><div class="form-actions"><small>${state.localMode ? '手记与完成状态自动保存到本机' : '手记与完成状态自动同步到私有云端'}</small><button class="primary-button" type="submit">保存手记 ${icon('check')}</button></div></form>${parents.length || children.length ? html`<div class="skill-relations"><h3>一路长大的足迹</h3><button class="detail-lineage-button" data-lineage="${id}">${icon('tree')} 查看这项技能的完整脉络 ${icon('arrow')}</button>${parents.length ? html`<p>直接前序</p><div>${parents.map(item => html`<button class="relation-chip ${isDone(item.id) ? 'done' : ''}" data-detail="${item.id}">${isDone(item.id) ? icon('check') : icon('sprout')}${item.title}${icon('chevron')}</button>`)}</div>` : ''}${children.length ? html`<p>直接后续</p><div>${children.map(item => html`<button class="relation-chip ${isDone(item.id) ? 'done' : ''}" data-detail="${item.id}">${isDone(item.id) ? icon('check') : icon('sprout')}${item.title}${icon('chevron')}</button>`)}</div>` : ''}</div>` : ''}${resourceSection(skill)}<div class="detail-source">原始图谱第 ${skill.sourcePage} 页 · 年龄与进阶关系仅作陪伴参考</div>`, 'detail-dialog');
  dialog.dataset.skillId = id;
  updateSaveStatus();
}

function openProfile() {
  if (!requireEditable(false)) return;
  profileEditBase = sharedProfile.get();
  showDialog(html`${dialogHeader('小小主角', '宝宝的成长资料')}<form id="profile-form"><label class="form-field">宝宝昵称<input name="name" value="${state.profile.name}" required maxlength="30" autocomplete="off" /></label><input type="hidden" name="birthDate" value="${state.profile.birthDate}" /><p class="form-help">全站使用同一份宝宝资料；修改昵称会同步到其他分类。</p><div id="form-error" class="form-error" role="alert"></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-dialog">取消</button><button class="primary-button" type="submit">保存资料</button></div></form>`);
}

async function openBackup() {
  await findLocalMigrations();
  const stats = getStats(catalog, state.records);
  const notes = Object.values(state.records).filter(record => record.note?.trim()).length;
  const local = state.localMode;
  const validSources = localMigrations.filter(item => item.snapshot);
  showDialog(html`${dialogHeader(local ? '本机保存与数据恢复' : '登录、同步与迁移', local ? '本地记录与备份' : '云端同步与备份')}
    <div class="backup-summary">${icon('sprout')}<p><strong>${stats.completed} 个已完成技能 · ${notes} 篇成长手记</strong><span>${local ? '保存在当前浏览器' : state.user ? `已登录 ${state.user.login}` : '尚未登录本人 GitHub 账号'} · ${saveLabel()}</span></p></div>
    <section class="storage-details ${saveProblem() ? 'has-error' : ''}">
      <h3>${icon(saveProblem() ? 'info' : 'check')}${saveLabel()}</h3>
      <p>${saveProblem() || (local ? '完成标记、日期、手记和宝宝资料自动保存在本机，刷新后会恢复。' : apiBase ? '个人记录以 GitHub 私有仓库为主存储。重新登录后可跨设备恢复。' : '云端配置未能加载，请重试。')}</p>
      <p>${saveTimeLabel()}</p>
      <p>${local ? '本机记录只在此浏览器、此网页地址下可用。换设备或地址时，请使用 JSON 备份迁移。' : '仅云端确认后显示“已同步”。未同步内容暂留本页，请重试或导出后再离开。'}</p>
      ${state.viewStorageError ? html`<p>${state.viewStorageError}</p>` : ''}
    </section>
    <div class="cloud-actions">${local ? !state.localLoaded ? html`<button class="primary-button" data-action="reload-local">重新读取本机</button>` : state.storageError ? html`<button class="secondary-button" data-action="retry-save">重试保存到本机</button>` : '' : state.auth === 'ready' ? html`<button class="secondary-button" data-action="logout">退出登录</button>` : apiBase ? html`<button class="primary-button" data-action="login">使用本人 GitHub 登录</button>` : ''}
      ${cloudConflict ? html`<button class="primary-button" data-action="resolve-conflicts">处理保存冲突</button>` : !local && state.storageError && state.auth === 'ready' ? html`<button class="secondary-button" data-action="retry-save">重试同步</button>` : !local && state.auth === 'error' && sessionToken ? html`<button class="secondary-button" data-action="reload-cloud">重新读取云端</button>` : ''}
    </div>
    ${state.profile.birthDate ? html`<button class="backup-option" data-action="export">${icon('download')}<span><strong>导出本页成长记录</strong><small>含当前宝宝资料、完成日期和手记，包括尚未保存的修改</small></span>${icon('chevron')}</button>` : ''}
    <button class="backup-option" data-action="migrate-all-local" disabled="${!validSources.length}">${icon('upload')}<span><strong>本地全部导入</strong><small>${validSources.length ? `汇总此浏览器的 ${validSources.length} 份有效记录，去重预览后一次导入` : '此浏览器暂无可导入记录，可从下面选择 JSON 备份'}</small></span>${icon('chevron')}</button>
    <label class="backup-option" tabindex="0" role="button" id="import-label">${icon('upload')}<span><strong>导入 JSON 备份</strong><small>${local ? '从电脑选择备份，支持多选；校验和预览后保存到本机' : '支持多选；登录并读取云端后，校验、预览并确认合并'}</small></span>${icon('chevron')}<input type="file" id="import-file" accept=".json,application/json" multiple hidden /></label>
    <p class="form-error" data-import-error role="alert" hidden></p>
    ${localMigrations.length ? html`<section class="local-migration"><h3>可导入的本机记录</h3><p>可逐份预览，也可全部导入。重复技能只计算一次；原始备份文件和旧版记录保持原样。</p>${localMigrations.map((item, index) => html`<div class="migration-item"><strong>${item.label}</strong>${item.snapshot ? html`<span>${getStats(catalog, item.snapshot.records).completed} 项已完成</span>` : ''}<div><button class="secondary-button" data-action="export-local" data-index="${index}">导出原记录</button>${item.snapshot ? html`<button class="primary-button" data-action="migrate-local" data-index="${index}">预览迁入</button>` : ''}</div></div>`)}</section>` : ''}
    <p class="backup-footnote">${local ? '当前使用本机保存。清理此网站的浏览器数据会移除记录，请定期导出备份。云端同步尚未启用。' : '网页和技能目录公开；个人记录由本人身份保护。旧本机数据仅作为迁移来源。'}</p>`);
}
async function downloadBackup(raw, label) {
  const filename = `小芽${label}_${localDateString()}.json`;
  if (['127.0.0.1', 'localhost'].includes(location.hostname) && location.protocol === 'http:') {
    const response = await fetch('/__local-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content: raw }),
    });
    if (!response.ok) throw new Error('备份未能保存到育儿目录，请确认本地记录服务正在运行后重试。');
    const result = await response.json();
    if (!result.saved || !result.path) throw new Error('备份未收到保存确认，请重试。');
    return result.path;
  }
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return '';
}
async function exportBackup() {
  if (!state.profile.birthDate) { openBackup(); return; }
  try {
    const path = await downloadBackup(JSON.stringify(growthSnapshot(state), null, 2), '成长记录');
    notify(path ? `备份已保存：${path}` : '已导出本页记录，请保留备份文件');
  } catch (error) { notify(error.message); }
}
function previewImport(imported, batch = null) {
  if (!requireEditable(false)) return;
  pendingImport = imported;
  const stats = getStats(catalog, imported.records);
  const merged = mergeImportedGrowth(state, imported);
  const overlap = Object.keys(imported.records).filter(id => Object.hasOwn(state.records, id)).length;
  showDialog(html`${dialogHeader('先预览，确认后才写入', batch ? '本地全部导入预览' : '合并这份成长记录？')}
    <p class="import-description">来自「${imported.profile.name}」的记录，包含 ${stats.completed} 个完成标注、${Object.values(imported.records).filter(record => record.note?.trim()).length} 篇手记。</p>
    <div class="import-details">
      ${batch ? html`<p>汇总来源：${batch.sources.join('、')}。重复技能已去重。</p>` : ''}
      <p>宝宝资料将更新为 ${imported.profile.name} · ${dateLabel(imported.profile.birthDate)} 出生。</p>
      <p>相同技能的 ${overlap} 条记录采用导入状态；导入中未提供的手记和其他已有技能保留。</p>
      <p>合并后共 ${getStats(catalog, merged.records).completed} 项已完成、${Object.values(merged.records).filter(record => record.note?.trim()).length} 篇手记。</p>
      ${batch?.conflicts.length ? html`<details><summary>${batch.conflicts.length} 处来源差异：优先保留前列来源的值（展开核对）</summary>${batch.conflicts.map(item => html`<p>${catalog.find(skill => skill.id === item.skillId)?.title} · ${item.field === 'note' ? '手记' : '完成日期'}：保留「${item.keptSource}」的 ${item.kept}；「${item.ignoredSource}」的 ${item.ignored} 仍在原记录中。</p>`)}</details>` : ''}
      <p>${state.localMode ? '确认后保存到此浏览器，刷新后仍会保留。旧版来源不删除；当前本机数据库会更新为合并结果。' : '确认后写入私有云端；若其他设备同时修改相同字段，将再次请你选择。'}</p>
    </div>
    <div class="form-actions"><button class="secondary-button" data-action="close-dialog">取消</button><button class="primary-button" data-action="confirm-import">${state.localMode ? '确认导入到本机' : '确认合并并同步'}</button></div>`);
}
function showImportProblem(message) {
  const error = document.querySelector('[data-import-error]');
  if (error) { error.textContent = message; error.hidden = false; }
  else notify(message);
}
async function importBackup(files) {
  if (!files?.length || !requireEditable(false)) return;
  try {
    // @CfSecAICode 遵循消费金融安全编码 SEC-MAINSITE-DESERIALIZE-001 规范: JSON 文件先校验宝宝资料与技能字段，再参与合并和显示。
    const sources = await Promise.all([...files].map(async file => ({ label: file.name, snapshot: validateBackup(JSON.parse(await file.text()), catalog.map(skill => skill.id)) })));
    if (sources.length === 1) previewImport(sources[0].snapshot);
    else { const batch = combineLocalImports(sources, catalog.map(skill => skill.id)); previewImport(batch.snapshot, batch); }
  } catch (error) { showImportProblem(error instanceof SyntaxError ? '文件不是有效的 JSON 备份' : error.message); }
}

function changeStage(id) {
  if (!STAGES.some(stage => stage.id === id)) return;
  state.stage = id;
  state.stageFocus = null;
  graphViewportAction = 'focus';
  state.search = '';
  state.status = 'all';
  if (state.view !== 'baby') { state.view = 'baby'; state.graphExpanded = false; }
  render();
}

async function toggleSkill(id) {
  if (!requireEditable()) return;
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

async function completeStage(stageId) {
  const stage = STAGES.find(item => item.id === stageId);
  if (!stage || !requireEditable()) return;
  const skills = getStageSkills(catalog, stageId);
  const newlyCompleted = skills.filter(skill => !isDone(skill.id));
  if (!newlyCompleted.length) return;
  const today = localDateString();
  state.lastUndo = { type: 'stage', ids: newlyCompleted.map(skill => skill.id), completedAt: today };
  state.records = completeRecords(state.records, skills, today);
  const saving = persist();
  const revision = saveRevision;
  render();
  const saved = await saving;
  if (revision === saveRevision) notify(saved ? `${stage.label}全部技能已完成，新增 ${newlyCompleted.length} 项` : state.storageError, saved);
}

document.addEventListener('click', async event => {
  const element = event.target.closest('button, a[data-action], [data-view], [data-stage]');
  if (!element) return;
  if (element.dataset.view) {
    const previousView = state.view;
    state.view = element.dataset.view;
    state.search = '';
    state.status = 'all';
    state.stageFocus = null;
    if (state.view === 'baby') state.stage = currentStage()?.id || (babyAge() ? 's8' : 's0');
    if (state.view !== previousView) graphViewportAction = 'focus';
    if (state.view !== 'tree') state.graphExpanded = false;
    render();
  } else if (element.dataset.stage) changeStage(element.dataset.stage);
  else if (element.dataset.completeStage) void completeStage(element.dataset.completeStage);
  else if (element.dataset.domain) { state.domain = element.dataset.domain; state.stageFocus = null; graphViewportAction = 'focus'; render(); }
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
      case 'navigation': siteShell.openDirectory(); break;
      case 'home': event.preventDefault(); state.view = 'baby'; state.graphExpanded = false; state.stage = currentStage()?.id || (babyAge() ? 's8' : 's0'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'prev-stage': if (index > 0) changeStage(STAGES[index - 1].id); break;
      case 'next-stage': if (index < STAGES.length - 1) changeStage(STAGES[index + 1].id); break;
      case 'current-stage': if (currentStage()) changeStage(currentStage().id); break;
      case 'clear-filters': state.search = ''; state.status = 'all'; render(); break;
      case 'graph-zoom-in': setGraphZoom(state.graphZoom + .15); break;
      case 'graph-zoom-out': setGraphZoom(state.graphZoom - .15); break;
      case 'graph-fit': fitGraph(); break;
      case 'stage-graph-current': state.stageFocus = null; graphViewportAction = 'focus'; render(); break;
      case 'graph-locate': locateGraphFocus(); break;
      case 'graph-current-age': locateCurrentAgeStage(); break;
      case 'graph-expand': state.graphExpanded = !state.graphExpanded; graphViewportAction = 'focus'; render(); break;
      case 'profile': openProfile(); break;
      case 'backup': case 'storage-status': openBackup(); break;
      case 'export': await exportBackup(); break;
      case 'login': loginCloud(); break;
      case 'logout': await logoutCloud(); break;
      case 'reload-cloud': await connectCloud(); break;
      case 'reload-local': await connectLocal(); if (document.querySelector('#app-dialog')) openBackup(); break;
      case 'resolve-conflicts': openConflicts(); break;
      case 'export-local': {
        const item = localMigrations[Number(element.dataset.index)];
        if (item) {
          try {
            const path = await downloadBackup(item.raw || JSON.stringify(item.snapshot, null, 2), '旧本机记录');
            notify(path ? `备份已保存：${path}` : '旧本机记录已导出');
          } catch (error) { notify(error.message); }
        }
        break;
      }
      case 'migrate-all-local': {
        if (!requireEditable(false)) break;
        try {
          await findLocalMigrations();
          const batch = combineLocalImports(localMigrations.filter(item => item.snapshot), catalog.map(skill => skill.id));
          previewImport(batch.snapshot, batch);
        } catch (error) { showImportProblem(error.message); }
        break;
      }
      case 'migrate-local': {
        const item = localMigrations[Number(element.dataset.index)];
        if (item?.snapshot) previewImport(item.snapshot);
        break;
      }
      case 'retry-save': {
        if (!requireEditable(false)) break;
        const saved = state.hasUnsavedChanges ? await persist() : (await syncGrowth(true), !state.storageError);
        render();
        if (document.querySelector('#app-dialog')?.querySelector('.storage-details')) openBackup();
        notify(saved ? state.localMode ? '成长记录已保存到本机' : '成长记录已同步到云端' : state.storageError);
        break;
      }
      case 'close-dialog': document.querySelector('#app-dialog')?.close(); break;
      case 'confirm-import': {
        if (!pendingImport || !requireEditable(false)) break;
        applyGrowth(mergeImportedGrowth(state, pendingImport), true);
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
        if (!undo || !requireEditable()) break;
        if (undo.type === 'stage') {
          state.records = { ...state.records };
          for (const id of undo.ids) {
            if (state.records[id]?.completedAt !== undo.completedAt) continue;
            const record = { ...state.records[id] };
            delete record.completedAt;
            if (Object.keys(record).length) state.records[id] = record;
            else delete state.records[id];
          }
        } else if (undo.previous) state.records = { ...state.records, [undo.id]: undo.previous };
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
    if (!requireEditable()) return;
    const id = event.target.form.dataset.id;
    state.records = { ...state.records, [id]: { ...state.records[id], note: event.target.value } };
    if (!event.target.value && !state.records[id].completedAt) delete state.records[id];
    void persist({ debounce: true });
  }
  if (event.target.name === 'completedAt' && event.target.validity.valid && event.target.value) {
    if (!requireEditable()) return;
    const id = event.target.form.dataset.id;
    state.records = { ...state.records, [id]: { ...state.records[id], completedAt: event.target.value } };
    void persist();
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'growth-stage-select') changeStage(event.target.value);
  if (event.target.id === 'tree-category') {
    state.treeCategory = event.target.value;
    const graph = getBranchGraph(catalog, state.treeDomain, state.treeCategory);
    if (!graph.nodes.some(skill => skill.id === state.treeFocus)) state.treeFocus = graph.nodes.find(skill => skill.category === state.treeCategory)?.id || graph.nodes[0]?.id;
    graphViewportAction = 'fit';
    render();
  }
  if (event.target.id === 'tree-focus') selectGraphSkill(event.target.value);
  if (event.target.id === 'import-file') void importBackup(event.target.files);
});
document.addEventListener('keydown', event => {
  if (window.XiaoyaSite.navigationOpen()) return;
  if (event.key === 'Escape' && state.graphExpanded && !document.querySelector('#app-dialog')) { state.graphExpanded = false; render(); }
  if (event.target.closest('#graph-viewport') && ['+', '=', '-'].includes(event.key)) { event.preventDefault(); setGraphZoom(state.graphZoom + (event.key === '-' ? -.15 : .15)); }
  if (event.target.id === 'import-label' && ['Enter', ' '].includes(event.key)) { event.preventDefault(); document.querySelector('#import-file')?.click(); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['profile-form', 'skill-form', 'conflict-form'].includes(form.id)) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.id === 'conflict-form') {
    if (!cloudConflict || state.savePending) return;
    const conflict = cloudConflict;
    const choices = Object.fromEntries(conflict.conflicts.map((item, index) => [item.key, data.get(`conflict-${index}`)]));
    const merged = mergeGrowthSnapshots(conflict.base, conflict.local, conflict.remote, choices);
    if (merged.conflicts.length) return;
    cloudConflict = null;
    saveController.adopt({ snapshot: conflict.remote, revision: conflict.revision, savedAt: conflict.savedAt }, merged.snapshot);
    document.querySelector('#app-dialog')?.close();
    const saved = await persist();
    notify(saved ? state.localMode ? '冲突已处理，本机已保存' : '冲突已处理，云端已同步' : state.storageError);
    return;
  }
  if (!requireEditable(form.id !== 'profile-form')) return;
  if (form.id === 'profile-form') {
    try {
      const validated = validateBackup({ version: 1, profile: { name: data.get('name'), birthDate: data.get('birthDate') }, records: state.records }, catalog.map(skill => skill.id));
      state.profile = await sharedProfile.save(validated.profile, profileEditBase);
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
  if (event.target.closest('.stage-picker, .milestones') && !event.target.closest('input, textarea, a, select, .domain-cards')) {
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
    if (document.querySelector('#graph-viewport')) {
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
async function syncGrowth(force = false) {
  const store = state.localMode ? localStore : cloudStore;
  if (!store || !canEdit() || cloudRefreshing || state.savePending || state.hasUnsavedChanges || (!force && document.querySelector('#app-dialog'))) return;
  cloudRefreshing = true;
  const editRevision = saveRevision;
  try {
    const loaded = await store.load();
    if (!canEdit() || state.savePending || state.hasUnsavedChanges || editRevision !== saveRevision) return;
    if (!loaded.snapshot) { state.profile = sharedProfile.get(); state.records = {}; }
    saveController.adopt(loaded);
    state.storageError = '';
    state.cloudEmpty = loaded.snapshot === null;
    render();
  } catch (error) {
    state.storageError = error.message;
    if (error.code === 'AUTH_REQUIRED') { state.auth = 'expired'; setSessionToken(''); }
    updateSaveStatus();
  } finally { cloudRefreshing = false; }
}
window.addEventListener('beforeunload', event => {
  if (!state.savePending && !state.hasUnsavedChanges) return;
  event.preventDefault();
  event.returnValue = '';
});

async function start() {
  try {
    const [catalogResponse, resourcesResponse, guidesResponse] = await Promise.all([fetch('./data/catalog.json'), fetch('./data/stage-resources.json'), fetch('./data/skill-guides.json')]);
    if (!catalogResponse.ok || !resourcesResponse.ok || !guidesResponse.ok) throw new Error('成长图谱暂时没有加载成功，请刷新重试。');
    catalog = await catalogResponse.json();
    resources = await resourcesResponse.json();
    skillGuides = await guidesResponse.json();
    state.profile = await sharedProfile.init();
    sharedProfile.subscribe((profile, error) => {
      if (error) { state.storageError = error.message; updateSaveStatus(); return; }
      const followsCurrent = state.stage === lastCurrentStage;
      state.profile = profile;
      if (followsCurrent) state.stage = currentStage()?.id || state.stage;
      lastCurrentStage = currentStage()?.id;
      render();
    });
    await findLocalMigrations();
    try {
      const response = await fetch('./cloud-config.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('云端配置读取失败');
      const config = await response.json();
      if (!config.apiBase) {
        state.localMode = true;
        localStore = createLocalSaveStore(window.indexedDB, catalog.map(skill => skill.id));
        await connectLocal();
      } else {
        const url = new URL(config.apiBase);
        const local = ['localhost', '127.0.0.1'].includes(url.hostname) && ['localhost', '127.0.0.1'].includes(location.hostname);
        if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('云端地址配置无效');
        apiBase = url.origin;
        cloudStore = createCloudStore({ apiBase, validIds: catalog.map(skill => skill.id), getToken: () => sessionToken });
        state.auth = 'signed-out';
        try { sessionToken = sessionStorage.getItem(SESSION_KEY) || ''; } catch { /* 仅内存会话。 */ }
      }
    } catch (error) { state.storageError = error.message; }
    state.stage = currentStage()?.id || (babyAge() ? 's8' : 's0');
    lastCurrentStage = currentStage()?.id;
    restoreView();
    viewRestored = true;
    render();
    if (sessionToken) await connectCloud();
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
