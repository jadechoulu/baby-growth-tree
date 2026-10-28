(function (root) {
  'use strict';
  const NARROW = '(max-width: 900px)';
  let activeDialog = null;
  const paths = {
    sprout: 'M12 21V11M12 16C5 17 2 12 3 7c6-1 10 3 9 9ZM12 12c-1-7 3-10 9-9 1 6-3 10-9 9Z',
    book: 'M12 6v15M12 6C8 3 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-3-1-6-1-10 2Z',
    route: 'M6 3v12a4 4 0 0 0 4 4h8M18 19l-3-3m3 3-3 3M18 4v6a4 4 0 0 1-4 4H6',
    tree: 'M12 3v18M5 11l7-8 7 8M4 17l8-9 8 9',
    baby: 'M5 8a8 8 0 1 0 14 0M5 8h14M12 2c-4 0-4 5 0 5M8 13h.1M16 13h.1M9 17q3 2 6 0',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    network: 'M12 8V4M8 16l-3 3M16 16l3 3M12 8l-4 8h8l-4-8ZM9 1h6v4H9ZM1 19h7v4H1ZM16 19h7v4h-7Z',
    source: 'M14 3H4v18h16V9ZM14 3v6h6M8 13h8M8 17h5',
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'm6 6 12 12M6 18 18 6',
    down: 'm6 9 6 6 6-6',
    home: 'm3 11 9-8 9 8M5 9v12h14V9M10 21v-7h4v7'
  };

  function resolveEntry(entry, siteRoot = './') {
    return siteRoot + entry.replace(/^\.\//, '');
  }

  function validateSections(sections) {
    const ids = new Set();
    for (const section of sections) {
      if (!section.id || !section.title || !section.entry || !section.theme || ids.has(section.id)) {
        throw new Error('分类注册需要唯一 ID、标题、入口与主题');
      }
      ids.add(section.id);
    }
    return sections;
  }

  function node(tag, cls, text) {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'site-icon' })) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[name] || paths.book);
    svg.append(path);
    return svg;
  }

  function createShell(options) {
    const sections = validateSections(options.sections || root.XIAOYA_SITE_SECTIONS || []);
    const section = sections.find(item => item.id === options.sectionId);
    if (!section && options.sectionId !== 'home') console.error('当前分类未注册：' + options.sectionId);
    const siteRoot = options.siteRoot || './';
    const narrow = root.matchMedia(NARROW);
    const home = options.sectionId === 'home';
    let snapshot = { navigation: [], activeId: '', title: '', ...options };
    let ownedDialog = null;
    let destroyed = false;
    const element = node('div', 'site-shell' + (home ? ' site-shell-home' : ''));
    const top = node('header', 'site-bar');
    const homeLink = node('a', 'site-brand');
    homeLink.href = resolveEntry('home.html', siteRoot);
    homeLink.append(icon('sprout'), node('span', '', '小芽'), node('small', '', '一起慢慢长大'));
    const menu = node('button', 'site-directory-button');
    menu.type = 'button';
    menu.append(icon('menu'), node('span', '', '目录'));
    menu.setAttribute('aria-label', '展开完整目录');
    menu.setAttribute('aria-haspopup', 'dialog');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-controls', 'site-navigation');
    menu.addEventListener('click', () => openNavigation('directory', menu));
    const switcher = createSectionSwitch();
    const title = node('span', 'site-location');
    const actions = node('div', 'site-actions');
    const body = node('div', 'site-body');
    const sidebar = node('aside', 'site-sidebar');
    const content = node('main', 'site-main');
    content.id = 'main-content';
    content.tabIndex = -1;
    const bottom = node('nav', 'site-shortcuts');
    bottom.setAttribute('aria-label', '当前分类快捷导航');
    const skip = node('a', 'site-skip', '跳到正文');
    skip.href = '#main-content';
    top.append(homeLink, switcher, menu, title, actions);
    body.append(sidebar, content);
    element.append(skip, top, body, bottom);
    document.body.dataset.siteSection = section?.theme || 'home';
    document.body.classList.add('site-enabled');

    function createSectionSwitch() {
      const button = node('button', 'site-section-switch');
      button.type = 'button';
      button.append(icon(section?.icon || 'home'), node('span', '', section?.title || '全部启蒙'), icon('down'));
      button.setAttribute('aria-label', '切换启蒙分类');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'site-navigation');
      button.addEventListener('click', () => openNavigation('sections', button));
      return button;
    }

    function sectionLinks() {
      const list = node('nav', 'site-section-list');
      list.setAttribute('aria-label', '全部启蒙分类');
      const entries = [{ id: 'home', title: '小芽首页', entry: 'home.html', icon: 'home', description: '选择今天一起探索的世界' }, ...sections];
      for (const item of entries) {
        const link = node('a', 'site-section-link');
        link.href = resolveEntry(item.entry, siteRoot);
        const copy = node('span');
        copy.append(node('strong', '', item.title), node('small', '', item.description));
        link.append(icon(item.icon), copy);
        if (item.id === options.sectionId) {
          link.setAttribute('aria-current', 'page');
          link.append(node('span', 'site-current-label', '当前'));
          link.addEventListener('click', event => { event.preventDefault(); closeNavigation(); });
        }
        list.append(link);
      }
      return list;
    }

    function navigation(shortcuts = false) {
      const fragment = document.createDocumentFragment();
      for (const group of snapshot.navigation) {
        const items = group.items.filter(item => !shortcuts || item.shortcut);
        if (!items.length) continue;
        const nav = node('nav', shortcuts ? 'site-shortcut-group' : 'site-nav-group');
        nav.setAttribute('aria-label', group.title);
        if (!shortcuts) nav.append(node('h2', 'site-nav-label', group.title));
        for (const item of items) {
          const button = node('button', 'site-nav-item');
          button.type = 'button';
          button.dataset.siteItem = item.id;
          button.append(icon(item.icon || 'arrow'), node('span', '', item.label));
          if (!shortcuts && item.description) button.append(node('small', '', item.description));
          if (snapshot.activeId === item.id) button.setAttribute('aria-current', 'page');
          button.addEventListener('click', () => {
            closeNavigation(false);
            options.onNavigate?.(item.id);
          });
          nav.append(button);
        }
        fragment.append(nav);
      }
      return fragment;
    }

    function closeNavigation(restoreFocus = true) {
      if (ownedDialog) {
        ownedDialog.restoreFocus = restoreFocus;
        ownedDialog.close();
      }
    }

    function openNavigation(mode, trigger) {
      if (destroyed) return;
      if (activeDialog) { activeDialog.querySelector('button')?.focus(); return; }
      const dialog = node('dialog', 'site-navigation-dialog' + (mode === 'directory' ? ' site-directory-dialog' : ''));
      dialog.id = 'site-navigation';
      dialog.setAttribute('aria-label', mode === 'directory' ? '浏览目录' : '切换启蒙分类');
      const head = node('header', 'site-navigation-head');
      const close = node('button', 'site-close');
      close.type = 'button';
      close.setAttribute('aria-label', '收起导航');
      close.append(icon('close'));
      close.addEventListener('click', () => closeNavigation());
      head.append(node('strong', '', mode === 'directory' ? '浏览目录' : '今天探索什么？'), close);
      const scroll = node('div', 'site-navigation-scroll');
      scroll.append(node('p', 'site-nav-label', '全站分类'), sectionLinks());
      if (mode === 'directory' && !home) scroll.append(node('p', 'site-directory-caption', section?.title || ''), navigation());
      dialog.append(head, scroll);
      let outside = false;
      dialog.addEventListener('pointerdown', event => { outside = event.target === dialog; });
      dialog.addEventListener('click', event => { if (outside && event.target === dialog) closeNavigation(); outside = false; });
      dialog.addEventListener('cancel', event => { event.preventDefault(); closeNavigation(); });
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (activeDialog === dialog) activeDialog = null;
        ownedDialog = null;
        document.body.classList.remove('site-navigation-open');
        trigger?.setAttribute('aria-expanded', 'false');
        if (dialog.restoreFocus !== false) (trigger?.isConnected ? trigger : menu).focus({ preventScroll: true });
      }, { once: true });
      ownedDialog = activeDialog = dialog;
      document.body.append(dialog);
      document.body.classList.add('site-navigation-open');
      trigger?.setAttribute('aria-expanded', 'true');
      dialog.showModal();
      close.focus({ preventScroll: true });
    }

    function update(next) {
      snapshot = { ...snapshot, ...next };
      if (snapshot.navigation.flatMap(group => group.items).filter(item => item.shortcut).length > 5) throw new Error('快捷导航最多五项');
      title.textContent = snapshot.title;
      sidebar.replaceChildren(navigation());
      bottom.replaceChildren(navigation(true));
      bottom.hidden = home || !bottom.childElementCount;
      menu.hidden = home;
      sidebar.hidden = home;
    }

    function onResize() { if (!narrow.matches) closeNavigation(); }
    function onKey(event) {
      if (ownedDialog && event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); closeNavigation();
      }
    }
    function onViewport() {
      // 键盘挤压可视区时收起底栏；正文保留原有底部空间。
      const keyboard = root.visualViewport && root.innerHeight - root.visualViewport.height > 150;
      element.classList.toggle('site-keyboard-open', Boolean(keyboard));
    }
    narrow.addEventListener('change', onResize);
    document.addEventListener('keydown', onKey, true);
    root.visualViewport?.addEventListener('resize', onViewport);
    update(snapshot);
    return {
      element, content, actions, update, createSectionSwitch,
      openDirectory: () => openNavigation('directory', menu), closeNavigation,
      createSectionCards() {
        const cards = node('section', 'site-cards');
        cards.setAttribute('aria-label', '选择启蒙分类');
        for (const item of sections) {
          const card = node('a', 'site-card');
          card.dataset.theme = item.theme;
          card.href = resolveEntry(item.entry, siteRoot);
          card.append(icon(item.icon), node('h2', '', item.title), node('p', '', item.description), node('span', 'site-card-action', '开始探索 →'));
          cards.append(card);
        }
        return cards;
      },
      destroy() {
        destroyed = true; closeNavigation(false);
        narrow.removeEventListener('change', onResize);
        document.removeEventListener('keydown', onKey, true);
        root.visualViewport?.removeEventListener('resize', onViewport);
        element.remove();
      }
    };
  }

  const api = { createShell, resolveEntry, validateSections, navigationOpen: () => Boolean(activeDialog), NARROW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XiaoyaSite = api;
})(typeof window !== 'undefined' ? window : globalThis);
