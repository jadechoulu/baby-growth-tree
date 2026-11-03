// 两套成长内容共用同一个输入框；窄处只改变入口，不改变搜索范围或筛选状态。
export function mountGrowthSearch(toolbar, { box, input, filters, open = false }) {
  const wrap = document.createElement('div'); wrap.className = 'growth-search';
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'growth-search-trigger';
  trigger.setAttribute('aria-label', input.getAttribute('aria-label'));
  trigger.setAttribute('aria-expanded', 'false'); trigger.title = input.getAttribute('aria-label');
  trigger.append(window.XiaoyaSite.icon('search'));
  const panel = document.createElement('div'); panel.className = 'growth-search-panel';
  panel.id = input.id + '-panel'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', '技能搜索');
  trigger.setAttribute('aria-controls', panel.id);
  box.replaceWith(wrap); panel.append(box); wrap.append(trigger, panel);
  toolbar.classList.add('growth-search-toolbar');
  let compact = false, reopen = open;
  const isOpen = () => panel.matches(':popover-open');
  const position = () => {
    if (!isOpen()) return;
    const rect = trigger.getBoundingClientRect(), width = Math.min(320, window.innerWidth - 16);
    const height = panel.offsetHeight || 62;
    panel.style.width = width + 'px';
    panel.style.left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) + 'px';
    panel.style.top = Math.max(8, rect.bottom + height + 6 <= window.innerHeight - 8 ? rect.bottom + 6 : rect.top - height - 6) + 'px';
  };
  const show = () => { if (compact) { if (!isOpen()) panel.showPopover(); position(); } input.focus({ preventScroll: true }); };
  trigger.addEventListener('click', () => { if (isOpen()) panel.hidePopover(); else show(); });
  panel.addEventListener('beforetoggle', event => trigger.setAttribute('aria-expanded', String(event.newState === 'open')));
  panel.addEventListener('toggle', event => {
    if (event.newState === 'closed' && compact && trigger.isConnected && (panel.contains(document.activeElement) || document.activeElement === document.body)) trigger.focus({ preventScroll: true });
  });
  const markQuery = () => trigger.classList.toggle('has-query', Boolean(input.value.trim()));
  input.addEventListener('input', markQuery); markQuery();
  const refresh = () => {
    if (!toolbar.isConnected) return;
    const buttons = [...filters.children], gap = parseFloat(getComputedStyle(filters).columnGap) || 0;
    const filterWidth = buttons.reduce((width, button) => width + button.getBoundingClientRect().width, 0) + gap * Math.max(0, buttons.length - 1);
    const next = toolbar.clientWidth < filterWidth + 8 + 160;
    if (next !== compact) {
      const editing = panel.contains(document.activeElement), focusedTrigger = document.activeElement === trigger, wasOpen = isOpen();
      compact = next; toolbar.classList.toggle('is-compact-search', compact);
      if (compact) { panel.setAttribute('popover', 'auto'); if (editing) show(); }
      else {
        if (wasOpen) panel.hidePopover();
        panel.removeAttribute('popover'); panel.removeAttribute('style'); trigger.setAttribute('aria-expanded', 'false');
        if (editing || focusedTrigger) input.focus({ preventScroll: true });
      }
    }
    if (reopen && compact) show();
    reopen = false; position();
  };
  const observer = new ResizeObserver(refresh); observer.observe(toolbar); observer.observe(filters);
  for (const button of filters.children) observer.observe(button);
  window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
  refresh();
  return { isOpen, show, destroy() { observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); } };
}
