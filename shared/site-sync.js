/* 三个分类入口共用的同步状态、本人登录与首次迁入预览。 */
(function (root) {
  'use strict';
  const M = root.XiaoyaSyncModel;
  const names = { profile: '宝宝档案', growth: '成长记录 · 毛老师版', health: '卫健委观察记录', english: '英语记录' };
  let singleton;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function createClient({ siteRoot = './', profileClient }) {
    if (singleton) return singleton;
    let apiBase = '', token = '', user = null, configurationError = '', dialog, popup, nonce, authTimer, engine, sessionKey;
    let initialized = false;
    const applying = new Set();
    const buttons = new Set(), listeners = new Set();
    const renderedConflicts = new WeakMap();
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('xiaoya-data-changed') : null;
    const lock = (key, job) => root.navigator?.locks ? root.navigator.locks.request(key, job) : Promise.reject(new Error('此浏览器缺少安全同步所需的 Web Locks，请使用新版浏览器。'));
    const emit = area => { for (const callback of listeners) callback(area); };
    const adapters = root.XiaoyaSyncAdapters.createAdapters({
      indexedDB: root.indexedDB, localStorage: root.localStorage, profileClient,
      notify(area) { emit(area); channel?.postMessage({ area }); },
    });
    async function request(area, method, body) {
      if (!token) throw Object.assign(new Error('请登录本人 GitHub 账号后同步。'), { code: 'AUTH_REQUIRED' });
      let response;
      const path = ['session', 'logout'].includes(area) ? '/api/' + area : '/api/data/' + area;
      try {
        // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 只有短期会话令牌进入固定 API 授权头，GitHub 密钥不进入前端。
        response = await fetch(apiBase + path, { method, redirect: 'error', cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
      } catch { throw new Error('云端连接失败，记录已保存在本机，将自动重试。'); }
      if (response.status === 401) {
        token = ''; user = null; engine?.authenticate(false);
        try { sessionStorage.removeItem(sessionKey); } catch { /* 已清除内存会话；受限存储不影响本机记录。 */ }
        updateButtons();
        throw Object.assign(new Error('登录已过期，本机记录保留，重新登录后继续。'), { code: 'AUTH_REQUIRED' });
      }
      let value;
      try { value = await response.json(); } catch { throw new Error('同步服务响应无效，记录仍在本机。'); }
      if (!response.ok) throw Object.assign(new Error(value.message || '同步失败，记录仍在本机。'), { code: response.status === 409 ? 'VERSION_CONFLICT' : response.status === 403 ? 'ACCESS_DENIED' : value.code });
      return value;
    }
    function label() {
      if (!apiBase) return '仅本机';
      if (!user) return '登录同步';
      const states = Object.values(engine?.states() || {});
      if (states.some(state => state.conflict)) return '同步冲突';
      if (states.some(state => state.error)) return '同步待重试';
      if (states.some(state => state.syncing)) return '正在同步';
      if (states.some(state => state.enabled && state.pending)) return '待同步';
      if (states.some(state => !state.enabled)) return '待连接记录';
      return '已同步';
    }
    function updateButtons() {
      for (const button of buttons) {
        if (!button.isConnected) { buttons.delete(button); continue; }
        button.title = label(); button.setAttribute('aria-label', '记录同步：' + label());
        button.querySelector('span').textContent = label();
        button.dataset.status = label();
      }
      for (let card of dialog?.querySelectorAll('[data-sync-area]') || []) {
        const area = card.dataset.syncArea;
        const state = engine?.states()[area] || {};
        // 状态文字与选择表单必须展示同一份快照；普通轮询不重建未变化的表单。
        if (!sameConflict(renderedConflicts.get(card), state.conflict)) {
          const focused = card.contains(document.activeElement);
          const next = createCard(area);
          if (state.conflict) {
            const notice = element('p', '记录已更新，请核对以下差异后重新选择。');
            notice.setAttribute('role', 'status');
            next.querySelector('[data-sync-state]').after(notice);
          }
          card.replaceWith(next);
          card = next;
          if (focused) {
            const heading = card.querySelector('h3');
            heading.tabIndex = -1; heading.focus({ preventScroll: true });
          }
        }
        card.querySelector('[data-sync-state]').textContent = state.error || (state.conflict ? state.conflict.conflicts.length + ' 项冲突，选择后点击确认。' : state.enabled ? state.syncing ? '正在同步' : state.pending ? '本机已保存，等待同步' : '已与云端同步' : '尚未连接；先预览再确认。');
        const saved = card.querySelector('[data-sync-saved]');
        saved.hidden = !state.savedAt;
        saved.textContent = state.savedAt ? '最近云端确认：' + new Date(state.savedAt).toLocaleString('zh-CN') : '';
      }
    }
    async function init() {
      try {
        if (location.protocol !== 'file:') {
          const response = await fetch(siteRoot + 'cloud-config.json', { cache: 'no-store' });
          if (!response.ok) throw new Error('同步配置暂时无法读取；本机保存可继续。');
          const config = await response.json();
          if (config.apiBase) {
            const url = new URL(config.apiBase);
            const local = ['127.0.0.1', 'localhost'].includes(url.hostname) && ['127.0.0.1', 'localhost'].includes(location.hostname);
            if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.hash || url.search) throw new Error('同步服务地址无效；本机记录未改动。');
            apiBase = url.origin;
          }
        }
        const journal = root.XiaoyaSyncEngine.createJournal(root.indexedDB);
        const scope = apiBase || 'local-only';
        engine = root.XiaoyaSyncEngine.createEngine({
          journal: { get: area => journal.get(scope + '|' + area), update: (area, change) => journal.update(scope + '|' + area, change) },
          request, lock,
          onStatus() { updateButtons(); },
        });
        for (const [area, adapter] of Object.entries(adapters)) await engine.register(area, {
          read: adapter.read,
          async apply(next, base) { applying.add(area); try { return await adapter.apply(next, base); } finally { applying.delete(area); } },
        });
        sessionKey = 'xiaoya-cloud-session-v2:' + apiBase;
        try { token = sessionStorage.getItem(sessionKey) || ''; } catch { /* 会话存储不可用时保留内存会话。 */ }
        if (apiBase && token) await authenticate();
      } catch (error) { configurationError = error.message; }
      initialized = true; updateButtons();
    }
    async function authenticate() {
      const result = await request('session', 'GET');
      if (!Number.isSafeInteger(result.user?.id) || typeof result.user.login !== 'string') throw new Error('登录身份响应无效。');
      user = result.user; engine.authenticate(true); updateButtons();
    }
    function login() {
      if (!apiBase) return;
      if (popup && !popup.closed) { popup.focus(); return; }
      nonce = crypto.randomUUID();
      popup = root.open(apiBase + '/auth/login?' + new URLSearchParams({ request: nonce, origin: location.origin }), 'xiaoya-github-login', 'popup,width=560,height=720');
      if (!popup) { showError('请允许登录弹窗后重试。'); return; }
      clearTimeout(authTimer);
      authTimer = setTimeout(() => { nonce = null; popup?.close(); popup = null; showError('登录等待已结束，请重新登录。'); }, 600000);
    }
    root.addEventListener('message', async event => {
      // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 登录消息须同时来自固定后端、原弹窗及本次随机请求。
      if (!apiBase || event.origin !== apiBase || event.source !== popup || !nonce || event.data?.type !== 'xiaoya-auth' || event.data.request !== nonce) return;
      nonce = null; clearTimeout(authTimer); popup?.close(); popup = null;
      if (event.data.error || !/^[A-Za-z0-9_-]{43}$/.test(event.data.token || '')) { showError('登录未完成，请使用指定的本人 GitHub 账号重试。'); return; }
      token = event.data.token;
      try { sessionStorage.setItem(sessionKey, token); } catch { /* 保留内存会话。 */ }
      try { await authenticate(); await open(); } catch (error) { showError(error.message); }
    });
    function showError(message) {
      if (dialog?.open) dialog.querySelector('[data-sync-error]').textContent = message;
    }
    function action(text, callback) {
      const button = element('button', text, 'site-sync-action'); button.type = 'button';
      button.addEventListener('click', async () => {
        button.disabled = true; showError('');
        try { await callback(); } catch (error) { showError(error.message); }
        finally { button.disabled = false; }
      });
      return button;
    }
    function summary(area, data) {
      if (!data) return '暂无记录';
      if (area === 'profile') return data.name;
      if (area === 'growth') return Object.values(data.records).filter(r => r.completedAt).length + ' 项完成 · ' + Object.values(data.records).filter(r => r.note).length + ' 篇手记';
      if (area === 'health') return Object.values(data.records).filter(r => r.status === 'observed').length + ' 项已观察到 · ' + Object.values(data.records).filter(r => r.status === 'not-yet').length + ' 项暂未观察到 · ' + Object.values(data.records).filter(r => r.note).length + ' 篇手记';
      return data.profile.vocabulary + ' 听力词汇 · ' + data.favorites.length + ' 个收藏 · ' + Object.keys(data.records).length + ' 份素材记录';
    }
    function sameConflict(left, right) {
      if (!left || !right) return !left && !right;
      return M.equal(left.local, right.local) && M.equal(left.remote, right.remote) && M.equal(left.base, right.base) && Boolean(left.applying) === Boolean(right.applying);
    }
    function createCard(area) {
      const card = element('section', undefined, 'site-sync-card');
      card.dataset.syncArea = area;
      const state = engine.states()[area] || {};
      const status = element('p'); status.dataset.syncState = '';
      const saved = element('small'); saved.dataset.syncSaved = '';
      card.append(element('h3', names[area]), status, saved);
      if (state.conflict) {
        const form = element('form'); const choices = {};
        const selection = element('p'); selection.setAttribute('role', 'status');
        const updateSelection = () => { selection.textContent = '已选择 ' + Object.keys(choices).length + ' / ' + state.conflict.conflicts.length + ' 项；确认后生效'; };
        const bulk = element('div', undefined, 'site-sync-bulk');
        bulk.setAttribute('role', 'group'); bulk.setAttribute('aria-label', names[area] + '批量选择');
        for (const side of ['remote', 'local']) bulk.append(action(side === 'remote' ? '全部选云端' : '全部选本机', () => {
          for (const item of state.conflict.conflicts) choices[item.key] = side;
          for (const input of form.querySelectorAll('input[type="radio"]')) input.checked = input.value === side;
          updateSelection();
        }));
        updateSelection(); form.append(bulk, selection);
        state.conflict.conflicts.forEach((item, index) => {
          const field = element('fieldset'); field.append(element('legend', item.path.join(' / ')));
          for (const side of ['local', 'remote']) {
            const label = element('label'); const input = element('input');
            input.type = 'radio'; input.name = area + '-' + index; input.value = side; input.required = true;
            input.addEventListener('change', () => { choices[item.key] = side; updateSelection(); });
            label.append(input, element('span', (side === 'local' ? '本机：' : '云端：') + (item[side] === undefined ? '清空／未完成' : String(item[side])))); field.append(label);
          }
          form.append(field);
        });
        form.append(action('确认选择并继续同步', async () => { if (!form.reportValidity()) return; await engine.resolve(area, { ...choices }, state.conflict); await open(); }));
        form.addEventListener('submit', e => e.preventDefault()); card.append(form);
      } else if (!state.enabled) card.append(action('预览并连接', async () => {
        const preview = await engine.preview(area);
        const details = element('div', undefined, 'site-sync-preview');
        details.append(element('p', '本机：' + summary(area, preview.local)), element('p', '云端：' + summary(area, preview.remote.snapshot)), element('p', preview.conflicts.length ? '存在相同字段的差异，连接后须逐项选择，暂不覆盖。' : '不同记录会合并；空云端可接收本机记录。'));
        details.append(action('确认连接这类记录', async () => { await engine.enable(area, preview); await open(); }));
        card.querySelector('.site-sync-preview')?.remove(); card.append(details);
      }));
      else card.append(action('立即同步', async () => { await engine.sync(area); await open(); }), action('暂停同步', async () => { await engine.disable(area); await open(); }));
      renderedConflicts.set(card, state.conflict || null);
      return card;
    }
    async function open() {
      if (!initialized) await ready;
      if (dialog?.open) dialog.close();
      dialog?.remove();
      dialog = element('dialog', undefined, 'site-sync-dialog');
      const header = element('header');
      const title = element('h2', '记录同步与迁移'); title.id = 'site-sync-title'; dialog.setAttribute('aria-labelledby', title.id);
      const close = action('关闭', () => dialog.close()); close.setAttribute('aria-label', '关闭同步面板');
      header.append(title, action('刷新', open), close);
      const body = element('div', undefined, 'site-sync-body');
      const errorNode = element('p', configurationError, 'site-sync-error'); errorNode.dataset.syncError = ''; errorNode.setAttribute('role', 'alert');
      body.append(element('p', '修改先保存在本机。连接后自动同步到 GitHub 私有仓库；断网可继续记录。'), errorNode);
      if (!apiBase) body.append(element('p', '同步服务尚未配置，当前仅保存在此浏览器。请继续保留 JSON 备份。'));
      else if (!user) body.append(action('使用本人 GitHub 登录', login));
      else {
        body.append(element('p', '已登录：' + user.login));
        for (const area of Object.keys(names)) {
          body.append(createCard(area));
        }
        body.append(action('退出登录（保留本机记录）', async () => {
          await request('logout', 'POST'); token = ''; user = null; engine.authenticate(false);
          try { sessionStorage.removeItem(sessionKey); } catch { /* 受限存储不阻止退出内存会话。 */ }
          updateButtons(); await open();
        }));
      }
      dialog.append(header, body); document.body.append(dialog);
      const focus = document.activeElement;
      dialog.addEventListener('click', event => { const bounds = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close(); });
      dialog.addEventListener('close', () => { focus?.isConnected && focus.focus({ preventScroll: true }); });
      dialog.showModal();
      updateButtons();
    }
    async function changed(area, options) {
      await ready;
      await engine?.changed(area, options);
      channel?.postMessage({ area });
      updateButtons();
    }
    function resume() { if (engine && user) for (const area of Object.keys(names)) void engine.sync(area); }
    root.addEventListener('online', resume);
    root.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
    setInterval(() => { if (!document.hidden) resume(); }, 15000);
    if (channel) channel.onmessage = event => { if (names[event.data?.area]) { emit(event.data.area); void engine?.changed(event.data.area); } };
    root.addEventListener('storage', event => { if (event.key === 'little-leaf-english-v1') { emit('english'); void engine?.changed('english'); } });
    profileClient.subscribe((profile, error) => { if (!error && !applying.has('profile')) void changed('profile').catch(showError); });
    const ready = init();
    singleton = {
      ready, open, changed, subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
      createButton() {
        const button = element('button', undefined, 'site-sync-button'); button.type = 'button';
        button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 7h-6m6 0V1M4 17h6m-6 0v6M5 8a8 8 0 0 1 14-3l1 2M4 17l1 2a8 8 0 0 0 14-3"/></svg><span></span>';
        button.querySelector('span').textContent = label(); button.setAttribute('aria-label', '记录同步：' + label()); button.title = label();
        button.addEventListener('click', () => void open()); buttons.add(button); return button;
      },
    };
    return singleton;
  }
  root.XiaoyaSync = { createClient };
})(typeof window === 'object' ? window : globalThis);
