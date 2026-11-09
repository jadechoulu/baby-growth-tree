import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import site from '../shared/site-shell.js';
import { buildSiteConfig } from '../scripts/build-site-config.mjs';

test('内部分类链接在根、子目录和导出目录保留仓库前缀与片段', () => {
  for (const [page, root] of [['index.html', './'], ['english/index.html', '../'], ['output/web/英语启蒙路线导航.html', '../../']]) {
    for (const entry of ['home.html', 'index.html', 'english/index.html#routes', 'science/index.html?mode=age#topics']) {
      const url = new URL(site.resolveEntry(entry, root), 'https://example.github.io/family/' + page);
      assert.equal(url.href, 'https://example.github.io/family/' + entry);
    }
  }
});

test('新增第三分类只需注册即可进入同一生成配置，缺失入口与重复ID明确失败', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xiaoya-sections-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'shared'));
  const sections = [
    { id: 'growth', title: '成长技能树', entry: 'index.html', theme: 'growth' },
    { id: 'english', title: '英语启蒙', entry: 'english/index.html#routes', theme: 'english' },
    { id: 'science', title: '科学探索', entry: 'science/index.html#topics', theme: 'science' }
  ];
  for (const item of sections) {
    const file = path.join(directory, item.entry.split('#')[0]);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '<h1>' + item.title + '</h1>');
  }
  const config = path.join(directory, 'shared/site-sections.json');
  await writeFile(config, JSON.stringify(sections));
  await buildSiteConfig(directory);
  const context = { window: {} };
  vm.runInNewContext(await readFile(path.join(directory, 'shared/site-config.js'), 'utf8'), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.XIAOYA_SITE_SECTIONS)), sections);
  assert.equal(context.window.XIAOYA_SITE_SECTIONS[2].entry, 'science/index.html#topics');
  await writeFile(config, JSON.stringify([...sections, sections[0]]));
  await assert.rejects(buildSiteConfig(directory), /唯一 ID/);
  await writeFile(config, JSON.stringify([...sections, { id: 'missing', title: '未准备', entry: 'missing.html', theme: 'missing' }]));
  await assert.rejects(buildSiteConfig(directory), /ENOENT|入口不存在/);
});

// 最小DOM夹具只承载框架的导航状态、焦点与dialog生命周期，不模拟布局。
function navigationDOM() {
  const document = new EventTarget();
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag; this.children = []; this.attributes = new Map(); this.dataset = {}; this.style = {}; this.className = ''; this.hidden = false; }
    append(...children) {
      for (const child of children) {
        if (child.tagName === 'fragment') this.append(...child.children);
        else { child.parent = this; this.children.push(child); }
      }
    }
    replaceChildren(...children) { this.children.forEach(child => { child.parent = null; }); this.children = []; this.append(...children); }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    removeAttribute(key) { this.attributes.delete(key); }
    get classList() {
      const toggle = (name, force) => { const names = new Set(this.className.split(' ').filter(Boolean)); const add = force ?? !names.has(name); if (add) names.add(name); else names.delete(name); this.className = [...names].join(' '); return add; };
      return { add: name => toggle(name, true), remove: name => toggle(name, false), toggle, contains: name => this.className.split(' ').includes(name) };
    }
    focus() { document.activeElement = this; }
    click() { this.dispatchEvent(new Event('click')); }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    querySelector(selector) { return this.children.find(child => child.tagName === selector) || this.children.map(child => child.querySelector(selector)).find(Boolean) || null; }
    get childElementCount() { return this.children.length; }
  }
  document.createElement = tag => new Element(tag);
  document.createElementNS = (namespace, tag) => Object.assign(new Element(tag), { namespaceURI: namespace });
  document.createDocumentFragment = () => new Element('fragment');
  document.body = new Element('body');
  document.activeElement = document.body;
  const narrow = Object.assign(new EventTarget(), { matches: false });
  const window = Object.assign(new EventTarget(), { matchMedia: () => narrow });
  return { document, window, narrow };
}

test('成长及英语共用侧栏开合，重绘与宽窄往返保留选择，窄屏仍打开底部目录', async () => {
  const source = await readFile(new URL('../shared/site-shell.js', import.meta.url), 'utf8');
  for (const sectionId of ['growth', 'english']) {
    const { document, window, narrow } = navigationDOM();
    let searchOptions;
    const getSearchQuery = sectionId === 'english' ? () => '当前英语关键词' : undefined;
    window.XiaoyaSiteSearch = { create(options) { searchOptions = options; return document.createElement('button'); } };
    vm.runInNewContext(source, { window, document, console });
    const shell = window.XiaoyaSite.createShell({ sectionId, getSearchQuery, sections: [{ id: sectionId, title: sectionId, entry: 'index.html', theme: sectionId }], navigation: [{ title: '目录', items: [{ id: 'baby', label: '宝宝', shortcut: true }] }] });
    assert.equal(searchOptions.getQuery, getSearchQuery);
    document.body.append(shell.element);
    const find = (parent, className) => parent.classList.contains(className) ? parent : parent.children.map(child => find(child, className)).find(Boolean);
    const menu = find(shell.element, 'site-directory-button'), sidebar = find(shell.element, 'site-sidebar');
    assert.equal(sidebar.hidden, false);
    assert.equal(menu.getAttribute('aria-controls'), sidebar.id);
    assert.equal(menu.getAttribute('aria-expanded'), 'true');
    sidebar.querySelector('button').focus();
    menu.click();
    assert.equal(sidebar.hidden, true);
    assert.equal(menu.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, menu);
    shell.update({ title: '重绘' });
    assert.equal(sidebar.hidden, true);
    narrow.matches = true; narrow.dispatchEvent(new Event('change'));
    assert.equal(menu.getAttribute('aria-haspopup'), 'dialog');
    menu.click();
    assert.equal(window.XiaoyaSite.navigationOpen(), true);
    assert.equal(menu.getAttribute('aria-expanded'), 'true');
    shell.closeNavigation();
    assert.equal(window.XiaoyaSite.navigationOpen(), false);
    assert.equal(document.activeElement, menu);
    narrow.matches = false; narrow.dispatchEvent(new Event('change'));
    assert.equal(sidebar.hidden, true);
    assert.equal(menu.getAttribute('aria-controls'), sidebar.id);
    assert.equal(menu.getAttribute('aria-haspopup'), null);
    menu.click();
    assert.equal(sidebar.hidden, false);
    menu.click();
    shell.openDirectory();
    assert.equal(sidebar.hidden, false);
    assert.equal(menu.getAttribute('aria-expanded'), 'true');
    narrow.matches = true; narrow.dispatchEvent(new Event('change')); menu.click();
    narrow.matches = false; narrow.dispatchEvent(new Event('change'));
    assert.equal(window.XiaoyaSite.navigationOpen(), false);
    assert.equal(sidebar.hidden, false);
    assert.equal(menu.getAttribute('aria-expanded'), 'true');
    shell.destroy();
  }
});
