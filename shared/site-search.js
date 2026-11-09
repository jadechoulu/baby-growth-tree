(function (root) {
  'use strict';
  let instance;
  // @CfSecAICode 遵循消费金融安全编码 FE-XSS-001 规范: 问题、私人标题与模型回答一律按纯文本显示，不解释HTML。
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const button = (label, action, cls) => { const n = node('button', label, cls); n.type = 'button'; n.addEventListener('click', action); return n; };
  const labels = { personal: '本机书架／个人素材', book: '单册', resource: '素材', route: '路线依据', stage: '路线阶段', method: '使用方法', song: '儿歌', hello: 'Hello', rhyme: '童谣', skill: '成长技能', health: '卫健委观察' };
  function create({ siteRoot = './', profileClient, getQuery }) {
    if (!instance) instance = build({ siteRoot, profileClient });
    const trigger = button('', () => { const query = getQuery?.(); instance.open(trigger, { query, submit: Boolean(query?.trim()) }); }, 'site-search-trigger');
    trigger.append(root.XiaoyaSite.icon('search'));
    trigger.title = '全站搜索与智能对话'; trigger.setAttribute('aria-label', trigger.title);
    return trigger;
  }
  function build({ siteRoot, profileClient }) {
    const sync = () => root.XiaoyaSync.createClient({ siteRoot, profileClient });
    let index, loading, contextLoading, busy = false, history = [], returnFocus, accessEpoch = 0, searchRequest = 0, memoryRequest = 0;
    const conversationKey = 'xiaoya-assistant-conversation-v1';
    const pendingKey = 'xiaoya-assistant-pending-v1';
    let conversationId;
    try { conversationId = localStorage.getItem(conversationKey); } catch { /* 存储受限时本轮仍可用。 */ }
    if (!/^[a-f0-9-]{36}$/i.test(conversationId || '')) conversationId = crypto.randomUUID();
    function selectConversation(id) { conversationId = id; history = []; try { localStorage.setItem(conversationKey, id); } catch { /* 不在本地保存对话内容。 */ } }
    selectConversation(conversationId);
    const dialog = node('dialog', undefined, 'site-search-dialog'); dialog.setAttribute('aria-labelledby', 'site-search-heading');
    const heading = node('h2', '搜索与小芽助手'); heading.id = 'site-search-heading';
    const close = button('×', () => dialog.close(), 'site-search-close'); close.setAttribute('aria-label', '关闭全站搜索');
    const header = node('header'); header.append(heading, close);
    const form = node('form', undefined, 'site-search-form');
    const query = node('input'); query.type = 'search'; query.maxLength = 500; query.placeholder = '找素材，或问问怎么陪孩子学…'; query.setAttribute('aria-label', '搜索全站或提问');
    const submit = node('button', undefined, 'site-search-action'); submit.type = 'submit'; submit.title = '搜索'; submit.setAttribute('aria-label', '搜索'); submit.append(root.XiaoyaSite.icon('search'));
    const chat = button('AI', () => void run('chat'), 'site-search-action site-search-ai'); chat.title = '智能对话'; chat.setAttribute('aria-label', '智能对话');
    form.append(query, submit, chat);
    const filters = node('div', undefined, 'site-search-filters');
    const section = node('select'); section.setAttribute('aria-label', '搜索范围');
    for (const [value, label] of [['all', '全站内容'], ['english', '英语启蒙'], ['growth', '成长技能']]) { const option = node('option', label); option.value = value; section.append(option); }
    const activity = node('strong', '站内检索 · 未调用AI', 'site-search-mode'); activity.setAttribute('role', 'status');
    function showMode(state, text) { activity.setAttribute('data-state', state); activity.textContent = text; }
    const hint = node('span', '输入时只查站内；点击搜索按需使用AI'); filters.append(section, activity, hint);
    const online = node('input'); online.type = 'checkbox';
    const onlineLabel = node('label'); onlineLabel.append(online, node('span', '联网补充：优先小红书等国内网站'));
    const status = node('p', '输入书名、主题或技能名开始查找。', 'site-search-status'); status.setAttribute('role', 'status');
    const answer = node('div', undefined, 'site-search-answer'); answer.hidden = true; answer.setAttribute('aria-live', 'polite');
    const results = node('div', undefined, 'site-search-results');
    const usage = node('small', undefined, 'site-search-usage');
    const allowance = root.XiaoyaAssistantWorkflow.officialAllowances;
    function showUsage(stats, message = '本站用量尚未读取', platforms = {}, model) {
      usage.replaceChildren(node('span', stats ? '本站发起 · AI：今日' + stats.model.daily + '次／本月' + stats.model.monthly + '次；联网：今日' + stats.web.daily + '次／本月' + stats.web.monthly + '次（UTC，含失败）' : message));
      if (model?.label) {
        const line = node('span', model.label + '：' + model.quotaNote);
        const source = node('a', '官方账户用量'); source.href = model.quotaUrl; source.target = '_blank'; source.rel = 'noopener noreferrer'; line.append(' ', source); usage.append(line);
      }
      for (const [key, label, item] of [['tavily', 'Tavily', allowance.tavily]]) {
        const current = platforms[key], known = current?.status === 'ok' ? current : current?.lastKnown;
        const text = known ? label + ' ' + known.plan + '：' + known.used + '/' + known.limit + '积分 · 本计费周期（全账户）' + (current.status === 'ok' ? '' : ' · 上次读取，当前更新失败') : label + ' ' + item.plan + '：官方' + item.monthlyCredits + '积分／月；' + (current?.reason || '登录后读取已用积分') + '。';
        const line = node('span', text);
        if (known) { const checked = node('span', '读取于 ' + new Date(known.checkedAt).toLocaleTimeString()); line.append(' · ', checked); }
        const source = node('a', '官方额度'); source.href = item.source; source.target = '_blank'; source.rel = 'noopener noreferrer'; line.append(' ', source); usage.append(line);
        if (key === 'tavily' && typeof known?.keyUsage === 'number' && typeof known?.keyLimit === 'number') usage.append(node('span', '当前搜索密钥：' + known.keyUsage + '/' + known.keyLimit + '积分 · 本计费周期'));
      }
    }
    showUsage();
    let usageRequest = 0;
    async function refreshUsage() {
      const request = ++usageRequest, epoch = accessEpoch;
      try {
        const state = await sync().getState('english');
        if (epoch !== accessEpoch) return;
        if (!state.authenticated) { if (request === usageRequest) showUsage(null, '全站搜索与智能对话仅限本人 GitHub 账号。'); return; }
        const response = await sync().assistantStatus();
        if (request === usageRequest) {
          showUsage(response.usage, response.enabled ? '用量暂不可读取' : 'AI尚未启用；暂无用量统计。', response.platformUsage, response.model);
          if (!response.enabled && !query.value.trim() && !busy && answer.hidden) showMode('unavailable', 'AI未启用 · 可检索站内');
        }
      } catch { if (request === usageRequest) showUsage(null, '用量暂不可读取，请确认本人登录状态。'); }
    }
    const footer = node('footer'); footer.append(usage, button('新对话', () => { if (busy) return; selectConversation(crypto.randomUUID()); answer.hidden = true; answer.replaceChildren(); external.replaceChildren(); showMode('search', '站内检索 · 未调用AI'); status.textContent = '已开始新对话，保留长期记忆。'; }));
    const external = node('div', undefined, 'site-search-external');
    const memoryPanel = node('details', undefined, 'site-search-memory');
    memoryPanel.append(node('summary', '对话与记忆'));
    const memoryBody = node('div'); memoryPanel.append(memoryBody);
    memoryPanel.addEventListener('toggle', () => { if (memoryPanel.open) void restoreMemory(true); });
    dialog.append(header, form, filters, onlineLabel, status, answer, external, results, memoryPanel, footer); document.body.append(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
    dialog.addEventListener('close', () => { returnFocus?.isConnected && returnFocus.focus({ preventScroll: true }); });
    // 原生modal负责焦点约束；捕获Escape和快捷键，避免同时触发底层领域弹窗。
    document.addEventListener('keydown', event => {
      if (dialog.open && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dialog.close(); }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (!dialog.open && document.getElementById('library-search')) return; // 英语沿用分类素材检索快捷键。
        event.preventDefault(); event.stopImmediatePropagation(); open(document.activeElement);
      }
    }, true);
    async function load() {
      if (index) return index;
      if (!loading) loading = (async () => {
        if (root.XIAOYA_SEARCH_INDEX) return root.XIAOYA_SEARCH_INDEX;
        const response = await fetch(siteRoot + 'shared/search-index.json');
        if (!response.ok) throw new Error('站内目录加载失败，请重试。');
        return response.json();
      })().then(value => { if (!Array.isArray(value.entries)) throw new Error('站内目录格式无效。'); index = value; return value; }).finally(() => { loading = null; });
      return loading;
    }
    function showResults(items) {
      results.replaceChildren();
      for (const item of items) {
        const link = node('a', undefined, 'site-search-result'); link.href = siteRoot + item.href;
        link.append(node('strong', item.title), node('small', (item.section === 'english' ? '英语启蒙' : '成长技能') + ' · ' + (labels[item.kind] || item.kind)));
        link.addEventListener('click', event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
          const target = new URL(link.href, location.href);
          if (target.pathname === location.pathname && root.EnglishApp?.openSearchResult && item.section === 'english') { event.preventDefault(); dialog.close(); void root.EnglishApp.openSearchResult(item).catch(error => { status.textContent = error.message; open(returnFocus); }); }
          else if (target.pathname === location.pathname && item.section === 'growth') {
            event.preventDefault(); dialog.close(); root.dispatchEvent(new CustomEvent('xiaoya:search-result', { detail: item }));
          }
        });
        results.append(link);
      }
    }
    function requireLogin() {
      results.replaceChildren(); answer.hidden = true; answer.replaceChildren(); external.replaceChildren(); memoryBody.replaceChildren(); history = [];
      status.textContent = '全站搜索与智能对话仅限本人 GitHub 账号。';
      showMode('unavailable', '请先登录 · 未调用AI');
      status.append(' ', button('登录本人 GitHub', () => { dialog.close(); void sync().open(); }));
    }
    async function localSearch(force = false) {
      if (busy && !force) return null;
      if (!force) { answer.hidden = true; external.replaceChildren(); showMode('search', '站内检索 · 未调用AI'); }
      const epoch = accessEpoch, request = ++searchRequest, q = query.value.trim(), scope = section.value;
      const current = () => epoch === accessEpoch && request === searchRequest && q === query.value.trim() && scope === section.value;
      try {
        const state = await sync().getState('english');
        if (!current()) return null;
        if (!state.authenticated) { requireLogin(); return null; }
        if (!q) { results.replaceChildren(); status.textContent = '输入书名、主题或技能名开始查找。'; return []; }
        // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 先由服务端验证本人会话，再检索本机私人素材；不提供匿名本机检索兜底。
        const response = await sync().searchAssistant({ query: q, section: scope });
        if (!current()) return null;
        let personal = [];
        try { personal = root.XiaoyaSearchCore.personalEntries((await sync().readAssistantRecords('english')).english?.records); } catch { /* 已鉴权的公共结果可独立显示，私有记录读取失败不改写数据。 */ }
        if (!current()) return null;
        const matches = root.XiaoyaSearchCore.search([...response.sources, ...personal], q, { section: scope }); showResults(matches);
        status.textContent = matches.length ? '显示' + matches.length + '条相关内容 · 站内检索' : '暂未找到匹配内容，可换关键词或点击智能对话。';
        return matches;
      } catch (error) { if (current()) { if (error.code === 'AUTH_REQUIRED') requireLogin(); else { results.replaceChildren(); status.textContent = error.message; } } return null; }
    }
    async function context() {
      const snapshots = await sync().readAssistantRecords(), profile = profileClient.get();
      if (!contextLoading) contextLoading = (async () => {
        if (!root.XiaoyaAssistantContext) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = siteRoot + 'shared/assistant-runtime.js'; script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('孩子进展摘要组件加载失败，请重试。')); }; document.head.append(script); });
        if (root.XIAOYA_ASSISTANT_DATA) return root.XIAOYA_ASSISTANT_DATA;
        const response = await fetch(siteRoot + 'shared/assistant-data.json'); if (!response.ok) throw new Error('路线依据加载失败，请重试。'); return response.json();
      })().catch(error => { contextLoading = null; throw error; });
      const data = await contextLoading; await load();
      return root.XiaoyaAssistantContext.collect({ snapshots, index, profile, data });
    }
    async function run(mode) {
      if (busy || !query.value.trim()) return;
      const q = query.value.trim(), epoch = accessEpoch, wantAI = root.XiaoyaSearchCore.intent(q, mode) === 'answer';
      if (!wantAI) { answer.hidden = true; await localSearch(); return; }
      busy = true; submit.disabled = chat.disabled = true; query.readOnly = true;
      showMode('preparing', 'AI准备中 · 先检索站内');
      answer.hidden = true; external.replaceChildren();
      try {
        if (await localSearch(true) === null || epoch !== accessEpoch) return;
        status.textContent = '正在参考相关资料与孩子记录…';
        const payload = { query: q, mode, online: online.checked, context: await context(), conversationId };
        if (epoch !== accessEpoch) return;
        const signature = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)))), value => value.toString(16).padStart(2, '0')).join('');
        let pending;
        try { pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch { /* 不保存原问题和孩子资料。 */ }
        const requestId = pending?.signature === signature ? pending.requestId : crypto.randomUUID();
        if (epoch !== accessEpoch) return;
        try { sessionStorage.setItem(pendingKey, JSON.stringify({ signature, requestId })); } catch { /* 受限存储仍可提问。 */ }
        showMode('answering', 'AI回答中…');
        const result = await sync().askAssistant({ ...payload, requestId });
        if (epoch !== accessEpoch) return;
        try { sessionStorage.removeItem(pendingKey); } catch { /* 对话正文仅保存在私人仓。 */ }
        if (result.sources.length) showResults(result.sources);
        if (result.mode === 'answer') {
          showMode('answer', result.cached ? 'AI历史回答 · 本次未调用模型' : 'AI已回答');
          answer.hidden = false; answer.replaceChildren(node('small', result.cached ? '小芽助手 · 复用本轮回答' : '小芽助手'), node('p', result.answer));
          history = [...history, { role: 'user', content: q }, { role: 'assistant', content: result.answer }].slice(-4);
        } else {
          answer.hidden = true;
          showMode('search', result.cached ? 'AI历史判断 · 展示站内内容' : result.usage?.modelCalls ? 'AI已判断 · 展示站内内容' : '站内检索 · 未调用AI');
        }
        if (result.webNotice) external.append(node('p', result.webNotice));
        for (const source of result.webSources || []) {
          const link = node('a', source.title); link.href = source.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; external.append(link);
        }
        if (result.memory?.saved === false) answer.append(node('small', result.memory.notice));
        status.textContent = result.mode === 'results' ? '已找到相关站内内容，可直接打开查看。' : '回答基于本次检索资料与记录摘要，请结合孩子反应调整。';
      } catch (error) { if (epoch === accessEpoch) { if (error.code === 'AUTH_REQUIRED') requireLogin(); else {
        showMode('unavailable', error.code === 'AI_NOT_CONFIGURED' ? 'AI未启用 · 展示站内结果' : 'AI未完成 · 展示站内结果');
        status.textContent = '本次未生成AI回答。' + error.message;
      } } }
      finally { if (epoch === accessEpoch) { busy = false; submit.disabled = chat.disabled = false; query.readOnly = false; void refreshUsage(); } }
    }
    form.addEventListener('submit', event => { event.preventDefault(); void run('auto'); });
    let timer;
    query.addEventListener('input', event => { if (event.isComposing) return; clearTimeout(timer); timer = setTimeout(() => void localSearch(), 180); });
    query.addEventListener('compositionend', () => void localSearch()); section.addEventListener('change', () => void localSearch());
    async function restoreMemory(showList = false) {
      const requested = conversationId, epoch = accessEpoch, request = ++memoryRequest;
      const current = () => epoch === accessEpoch && request === memoryRequest && conversationId === requested;
      try {
        const state = await sync().getState('english');
        if (!current()) return;
        if (!state.authenticated) { if (showList) memoryBody.replaceChildren(node('p', '登录本人账号后查看私人对话与记忆。')); return; }
        const saved = await sync().assistantMemory(requested);
        if (!current() || busy) return;
        if (!history.length && saved.messages?.length) {
          history = saved.messages;
          const last = history.filter(item => item.role === 'assistant').at(-1);
          if (last && !query.value.trim()) { showMode('answer', 'AI历史回答 · 本次未调用模型'); answer.hidden = false; answer.replaceChildren(node('small', '小芽助手 · 上次对话'), node('p', last.content)); }
        }
        if (!showList) return;
        memoryBody.replaceChildren(node('p', '记忆只保存在私人记录仓。忘记会清空近期对话摘要，Git 历史仍可恢复。'));
        for (const item of saved.facts || []) {
          const row = node('p', item.quote);
          row.append(' ', button('忘记', () => void forget({ factId: item.id }))); memoryBody.append(row);
        }
        if (!saved.facts?.length) memoryBody.append(node('p', '暂无跨对话记忆。'));
        for (const item of (saved.conversations || []).slice(0, 12)) memoryBody.append(button('继续 ' + new Date(item.updatedAt).toLocaleString(), () => { if (busy) return; selectConversation(item.id); query.value = ''; results.replaceChildren(); external.replaceChildren(); answer.hidden = true; void restoreMemory(true); }));
        memoryBody.append(button('清空全部对话与记忆', () => void forget({ all: true })));
      } catch { if (current() && showList) memoryBody.replaceChildren(node('p', '私人记忆暂不可读取，未覆盖已有内容。')); }
    }
    async function forget(change) {
      if (busy) return;
      const epoch = accessEpoch;
      try {
        await sync().forgetAssistantMemory(change);
        if (epoch !== accessEpoch) return;
        selectConversation(crypto.randomUUID());
        answer.hidden = true; answer.replaceChildren(); status.textContent = '已从当前记忆中移除。'; void restoreMemory(true);
      } catch (error) { if (epoch === accessEpoch) status.textContent = error.message; }
    }
    sync().subscribe(async area => {
      if (area !== 'auth') return;
      // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 退出或会话失效立即清除私人展示，拒绝迟到的搜索、记忆及模型结果。
      accessEpoch++; searchRequest++; memoryRequest++; usageRequest++; clearTimeout(timer);
      busy = false; submit.disabled = chat.disabled = false; query.readOnly = false;
      query.value = ''; online.checked = false; requireLogin(); showUsage(null, '请确认本人登录状态。');
      const epoch = accessEpoch, state = await sync().getState('english');
      if (epoch !== accessEpoch) return;
      if (state.authenticated) status.textContent = '已登录本人账号，输入书名、主题或技能名开始查找。';
      if (dialog.open) { void refreshUsage(); void restoreMemory(memoryPanel.open); }
    });
    function open(focus, { query: initialQuery, submit: shouldSubmit = false } = {}) {
      returnFocus = focus;
      if (!busy && typeof initialQuery === 'string') {
        clearTimeout(timer); searchRequest++;
        query.value = initialQuery.slice(0, query.maxLength);
        answer.hidden = true; external.replaceChildren(); results.replaceChildren();
        showMode('search', '站内检索 · 未调用AI');
        status.textContent = '输入书名、主题或技能名开始查找。';
      }
      if (!dialog.open) dialog.showModal(); query.focus();
      void refreshUsage(); if (!history.length) void restoreMemory();
      if (shouldSubmit && !busy) void run('auto');
    }
    void refreshUsage(); // 页面刷新也更新统计；未登录时不请求平台。
    return { open };
  }
  root.XiaoyaSiteSearch = { create, open: options => instance?.open(options?.focus || document.activeElement, options) };
})(typeof window === 'object' ? window : globalThis);
