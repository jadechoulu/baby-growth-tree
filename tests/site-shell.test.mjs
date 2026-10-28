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
