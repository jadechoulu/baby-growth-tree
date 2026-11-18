// 两套成长内容共用同一个输入框；窄处只改变入口，不改变搜索范围或筛选状态。
export function mountGrowthSearch(toolbar, { box, input, filters, open = false, getSuggestions, onSelect, onQuery }) {
  const wrap = document.createElement('div'); wrap.className = 'growth-search';
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'growth-search-trigger';
  trigger.setAttribute('aria-label', input.getAttribute('aria-label'));
  trigger.setAttribute('aria-expanded', 'false'); trigger.title = input.getAttribute('aria-label');
  trigger.append(window.XiaoyaSite.icon('search'));
  const panel = document.createElement('div'); panel.className = 'growth-search-panel';
  panel.id = input.id + '-panel'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', '技能搜索');
  trigger.setAttribute('aria-controls', panel.id);
  box.replaceWith(wrap); panel.append(box); wrap.append(trigger, panel);
  const suggestions = document.createElement('div'); suggestions.className = 'growth-search-suggestions';
  suggestions.id = input.id + '-suggestions'; suggestions.setAttribute('popover', 'manual');
  const status = document.createElement('div'); status.className = 'growth-search-matches'; status.setAttribute('role', 'status');
  const list = document.createElement('div'); list.id = input.id + '-options'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', '匹配技能');
  suggestions.append(status, list); panel.append(suggestions);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', list.id); input.autocomplete = 'off';
  let matches = [], active = -1, composing = false;
  const closeSuggestions = () => {
    if (suggestions.matches(':popover-open')) suggestions.hidePopover();
    input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1;
  };
  const positionSuggestions = () => {
    if (!suggestions.matches(':popover-open')) return;
    const rect = box.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 280), window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 14, above = rect.top - 14;
    const down = below >= Math.min(240, suggestions.scrollHeight) || below >= above;
    suggestions.style.width = width + 'px'; suggestions.style.maxHeight = Math.max(64, Math.min(320, down ? below : above)) + 'px';
    suggestions.style.left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) + 'px';
    suggestions.style.top = (down ? rect.bottom + 4 : Math.max(8, rect.top - suggestions.offsetHeight - 4)) + 'px';
  };
  const choose = index => {
    const match = matches[index]; if (!match) return;
    closeSuggestions(); if (isOpen()) panel.hidePopover();
    onSelect?.(match);
  };
  const updateSuggestions = () => {
    if (!getSuggestions || composing) return;
    trigger.classList.toggle('has-query', Boolean(input.value.trim()));
    onQuery?.(input.value);
    matches = input.value.trim() ? getSuggestions(input.value) : []; active = -1;
    list.replaceChildren(); input.removeAttribute('aria-activedescendant');
    if (!input.value.trim()) { closeSuggestions(); return; }
    status.textContent = matches.length ? `${matches.length} 项匹配 · 请选择技能` : '没有匹配技能，换个词试试';
    matches.forEach((match, index) => {
      const option = document.createElement('div'); option.id = input.id + '-option-' + index; option.className = 'growth-search-option';
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      const title = document.createElement('span'); title.textContent = match.title;
      const meta = document.createElement('small'); meta.textContent = match.meta;
      option.append(title, meta); option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => choose(index)); list.append(option);
    });
    if (!suggestions.matches(':popover-open')) suggestions.showPopover();
    input.setAttribute('aria-expanded', 'true'); positionSuggestions();
  };
  input.addEventListener('input', event => { if (!event.isComposing) updateSuggestions(); });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; updateSuggestions(); });
  input.addEventListener('focus', updateSuggestions);
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing) return;
    if (event.key === 'Escape' && suggestions.matches(':popover-open')) { event.preventDefault(); event.stopPropagation(); closeSuggestions(); return; }
    if (event.key === 'Tab') { closeSuggestions(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    if (event.key === 'Enter') { if (suggestions.matches(':popover-open') && matches.length) { event.preventDefault(); choose(active < 0 ? 0 : active); } return; }
    event.preventDefault();
    if (!suggestions.matches(':popover-open')) updateSuggestions();
    if (!matches.length) return;
    active = active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
    [...list.children].forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
    input.setAttribute('aria-activedescendant', list.children[active].id); list.children[active].scrollIntoView({ block: 'nearest' });
  });
  const dismiss = event => { if (!wrap.contains(event.target)) closeSuggestions(); };
  document.addEventListener('pointerdown', dismiss); document.addEventListener('focusin', dismiss);
  toolbar.classList.add('growth-search-toolbar');
  let compact = false, reopen = open;
  const isOpen = () => panel.matches(':popover-open');
  const position = () => {
    if (isOpen()) {
      const rect = trigger.getBoundingClientRect(), width = Math.min(320, window.innerWidth - 16);
      const height = panel.offsetHeight || 62;
      panel.style.width = width + 'px';
      panel.style.left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) + 'px';
      panel.style.top = Math.max(8, rect.bottom + height + 6 <= window.innerHeight - 8 ? rect.bottom + 6 : rect.top - height - 6) + 'px';
    }
    positionSuggestions();
  };
  const show = () => { if (compact) { if (!isOpen()) panel.showPopover(); position(); } input.focus({ preventScroll: true }); };
  trigger.addEventListener('click', () => { if (isOpen()) panel.hidePopover(); else show(); });
  panel.addEventListener('beforetoggle', event => trigger.setAttribute('aria-expanded', String(event.newState === 'open')));
  panel.addEventListener('toggle', event => {
    if (event.newState === 'closed' && compact) {
      closeSuggestions();
      if (compact && trigger.isConnected && (panel.contains(document.activeElement) || document.activeElement === document.body)) trigger.focus({ preventScroll: true });
    }
  });
  const markQuery = () => trigger.classList.toggle('has-query', Boolean(input.value.trim()));
  input.addEventListener('input', markQuery); markQuery();
  const refresh = () => {
    if (!toolbar.isConnected) return;
    const buttons = [...(filters?.children || [])], gap = filters ? parseFloat(getComputedStyle(filters).columnGap) || 0 : 0;
    const filterWidth = buttons.reduce((width, button) => width + button.getBoundingClientRect().width, 0) + gap * Math.max(0, buttons.length - 1);
    const next = toolbar.clientWidth < filterWidth + (filters ? 8 : 0) + 160;
    if (next !== compact) {
      const editing = panel.contains(document.activeElement), focusedTrigger = document.activeElement === trigger, wasOpen = isOpen();
      compact = next; toolbar.classList.toggle('is-compact-search', compact);
      if (compact) { panel.setAttribute('popover', 'auto'); if (editing) show(); }
      else {
        if (wasOpen) panel.hidePopover();
        panel.removeAttribute('popover'); panel.removeAttribute('style'); trigger.setAttribute('aria-expanded', 'false');
        if (editing || focusedTrigger) input.focus({ preventScroll: true });
      }
      if (editing || focusedTrigger) updateSuggestions();
    }
    if (reopen && compact) show();
    reopen = false; position();
  };
  const observer = new ResizeObserver(refresh); observer.observe(toolbar);
  if (filters) { observer.observe(filters); for (const button of filters.children) observer.observe(button); }
  window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
  refresh();
  return { isOpen, show, update: updateSuggestions, destroy() { closeSuggestions(); observer.disconnect(); document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); } };
}
