/* 成长分类内的普通版本导航与详情相关项目；不改变记录。 */
(function (root) {
  const levels = { 'same-action': '同类动作', partial: '部分相关' };
  function references(current, itemId) {
    return root.XiaoyaGrowthReferences.filter(item => item[current] === itemId);
  }
  function itemHref(version, item) {
    return version === 'mao' ? './index.html#' + new URLSearchParams({ skill: item.mao })
      : './health.html#' + new URLSearchParams({ view: 'month', month: item.month, domain: item.domain, status: 'all', item: item.health });
  }
  function helpButton(onHelp) {
    const help = document.createElement('button');
    help.type = 'button'; help.className = 'growth-version-help'; help.textContent = '?';
    help.setAttribute('aria-label', '卫健委版：标准与使用方法');
    help.setAttribute('aria-haspopup', 'dialog'); help.title = '标准与使用方法';
    help.addEventListener('click', onHelp);
    return help;
  }
  function createReferences(current, itemId, onHelp) {
    const related = references(current, itemId);
    // 无明确关联时不提供另一版首页链接，避免误认为对应项目。
    if (!related.length) {
      const fragment = document.createDocumentFragment();
      if (onHelp) fragment.append(helpButton(onHelp));
      return fragment;
    }
    const target = current === 'mao' ? 'health' : 'mao';
    const section = document.createElement('section'); section.className = 'growth-references';
    section.setAttribute('aria-label', '跨版本相关项目');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.textContent = `${target === 'mao' ? '毛老师版' : '卫健委版'}相关项目 · ${related.length}`;
    summary.append(title);
    for (const [kind, label] of Object.entries(levels)) {
      const count = related.filter(item => item.kind === kind).length;
      if (!count) continue;
      const badge = document.createElement('span'); badge.className = 'growth-reference-kind ' + kind;
      badge.textContent = `${label} ${count}`; summary.append(badge);
    }
    details.append(summary);
    const note = document.createElement('p'); note.className = 'growth-reference-note';
    note.textContent = '同类动作：动作接近，尚未确认测查等价；部分相关：任务或范围有差异。当前无已确认完全一致的项目，两版分别记录。';
    details.append(note);
    const list = document.createElement('ul');
    for (const item of related) {
      const row = document.createElement('li');
      const link = document.createElement('a'); link.href = itemHref(target, item);
      link.textContent = target === 'mao' ? item.maoTitle : `${item.healthTitle} · ${item.month}月龄 · #${Number(item.health.slice(7))}`;
      const badge = document.createElement('span'); badge.className = 'growth-reference-kind ' + item.kind;
      badge.textContent = levels[item.kind];
      const reason = document.createElement('p'); reason.textContent = item.note;
      row.append(link, badge, reason); list.append(row);
    }
    details.append(list); section.append(details);
    if (onHelp) section.append(helpButton(onHelp));
    return section;
  }
  root.XiaoyaGrowthVersions = {
    references,
    itemHref,
    create(current, itemId = null, { onHelp } = {}) {
      if (itemId) return createReferences(current, itemId, onHelp);
      const nav = document.createElement('nav');
      nav.className = 'growth-versions';
      nav.setAttribute('aria-label', '成长内容版本');
      for (const [id, label, entry] of [['mao', '毛老师版', './index.html'], ['health', '卫健委版', './health.html']]) {
        const link = document.createElement('a'); link.href = entry; link.textContent = label;
        if (current === id) link.setAttribute('aria-current', 'page');
        nav.append(link);
        if (id === 'health' && onHelp) nav.append(helpButton(onHelp));
      }
      return nav;
    },
  };
})(window);
