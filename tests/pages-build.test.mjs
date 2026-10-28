import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { PUBLIC_FILES, buildPages, normalizeApiBase } from '../scripts/build-pages.mjs';
import { buildSite } from '../scripts/build-site.mjs';

const run = promisify(execFile);

async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xiaoya-pages-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(t) {
  const directory = await temporary(t);
  const sourceRoot = path.join(directory, 'source');
  const outputDir = path.join(directory, 'pages');
  for (const relative of PUBLIC_FILES) {
    const destination = path.join(sourceRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, relative === 'lib/model.mjs'
      ? "export const DEFAULT_PROFILE = Object.freeze({ name: '宝宝', birthDate: '' });\n"
      : '公开运行内容\n');
  }
  await writeFile(path.join(sourceRoot, 'shared/site-sections.json'), JSON.stringify([{id:'growth',title:'成长',entry:'index.html',theme:'growth'}]));
  await writeFile(path.join(sourceRoot, 'cloud-config.json'), JSON.stringify({ apiBase: '', privateSecret: 'must-not-be-published' }));
  return { directory, sourceRoot, outputDir };
}

async function filesIn(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(root, relative));
    else files.push(relative);
  }
  return files.sort();
}

test('公开 API 配置要求 HTTPS 来源且拒绝路径、凭据、查询、片段和正式包本机地址', () => {
  assert.equal(normalizeApiBase(' https://api.example.com/ '), 'https://api.example.com');
  assert.equal(normalizeApiBase(''), '');
  for (const value of [null, 'invalid', '//example.com', 'http://api.example.com', 'https://api.example.com/v1/', 'https://name:secret@api.example.com', 'https://api.example.com/?token=private', 'https://api.example.com/#private', 'https://api.example.com/?', 'https://api.example.com/#', 'https://localhost', 'http://127.0.0.1:8787']) {
    assert.throws(() => normalizeApiBase(value));
  }
  assert.equal(normalizeApiBase('http://localhost:8787/', { allowLocalApi: true }), 'http://localhost:8787');
  assert.equal(normalizeApiBase('http://127.0.0.1:8787', { allowLocalApi: true }), 'http://127.0.0.1:8787');
  assert.throws(() => normalizeApiBase('http://remote.example.com', { allowLocalApi: true }));
});

test('发布包仅包含运行白名单，并清除旧产物中的个人文件', async t => {
  const { sourceRoot, outputDir } = await fixture(t);
  for (const relative of ['MEMORY.md', 'backup.json', 'assets/private-photo.jpg', 'tmp/private.json', 'worker/secrets.env']) {
    const target = path.join(sourceRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'private-data-must-not-be-published');
  }
  await mkdir(outputDir);
  await writeFile(path.join(outputDir, 'old-personal-backup.json'), 'private');
  const result = await buildPages({ sourceRoot, outputDir });
  assert.equal(result.cloudConfigured, false);
  assert.deepEqual(await filesIn(outputDir), [...PUBLIC_FILES, '.nojekyll', 'cloud-config.json'].sort());
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'cloud-config.json'), 'utf8')), { apiBase: '' });
  for (const relative of await filesIn(outputDir)) {
    assert.equal((await readFile(path.join(outputDir, relative), 'utf8')).includes('must-not-be-published'), false);
  }
});

test('构建覆盖配置时仅发布公开 API 字段，拒绝个人默认生日及危险输出路径', async t => {
  const options = await fixture(t);
  await buildPages({ ...options, apiBase: 'https://api.example.com' });
  assert.deepEqual(JSON.parse(await readFile(path.join(options.outputDir, 'cloud-config.json'), 'utf8')), { apiBase: 'https://api.example.com' });
  await assert.rejects(buildPages({ ...options, outputDir: options.sourceRoot }), /源码目录/);
  await assert.rejects(buildPages({ ...options, outputDir: options.directory }), /源码目录/);
  await writeFile(path.join(options.sourceRoot, 'lib/model.mjs'), "export const DEFAULT_PROFILE = Object.freeze({ name: '宝宝', birthDate: '2099-12-31' });\n");
  await assert.rejects(buildPages(options), /birthDate 必须为空/);
  assert.ok((await filesIn(options.outputDir)).includes('index.html'), '校验失败不会破坏前一次成功产物');
});

test('统一发布包保留两边入口，子路径互跳和运行时引用完整且无个人默认资料', async () => {
  const result = await buildSite({ apiBase: '' });
  const outputDir = result.outputDir;
  const files = new Set(result.files);
  const model = await import('../lib/model.mjs');
  assert.equal(model.DEFAULT_PROFILE.birthDate, '');
  for (const relative of result.files.filter(file => /\.(html|mjs|css)$/.test(file))) {
    const source = await readFile(path.join(outputDir, relative), 'utf8');
    const references = [
      ...source.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g),
      ...source.matchAll(/\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g),
      ...source.matchAll(/\bfetch\s*\(\s*['"](\.[^'"]+)['"]/g),
      ...source.matchAll(/\b(?:src|href)=['"](\.[^'"]+)['"]/g),
      ...source.matchAll(/\burl\(\s*['"]?(\.[^'"\s)]+)['"]?\s*\)/g),
    ];
    for (const match of references) {
      const target = new URL(match[1], `https://pages.example/${relative}`).pathname.slice(1);
      assert.ok(files.has(target), `${relative} 引用的 ${target} 不在发布包中`);
    }
  }
  assert.deepEqual(await filesIn(outputDir), [...files].sort());
  for (const relative of ['home.html', 'index.html', 'english/index.html']) assert.ok(files.has(relative));
  const english = await readFile(path.join(outputDir, 'english/index.html'), 'utf8');
  assert.equal(english.includes('2020-11-24'), false);
  assert.equal(english.includes('/Users/'), false);
  const links = JSON.parse(english.match(/window\.ROADMAP_SITE=(.*?);window\.ROADMAP_RAW=/)[1]);
  for (const [name, relative] of Object.entries(links)) {
    const url = new URL(relative, 'https://example.github.io/baby-growth-tree/english/index.html');
    assert.equal(url.pathname.startsWith('/baby-growth-tree/'), true, `${name} 不能跳出项目路径`);
    assert.ok(files.has(url.pathname.replace('/baby-growth-tree/', '')));
  }
  const config = await readFile(path.join(outputDir, 'shared/site-config.js'), 'utf8');
  assert.ok(config.includes('english/index.html#routes'));
  assert.ok(config.includes('成长技能树'));
  assert.ok(english.includes('XiaoyaSite.createShell'));
  assert.ok((await readFile(path.join(outputDir, 'app.mjs'), 'utf8')).includes('XiaoyaSite.createShell'));
  const storage = await readFile(path.join(outputDir, 'lib/storage.mjs'), 'utf8');
  assert.ok(storage.includes('xiaoya-growth-view-v1'));
  assert.ok(english.includes('little-leaf-english-v1'));
  for (const relative of files) assert.equal(/^(?:backups|output|tmp|worker)\//.test(relative), false);
});

test('发布只暂存显式产物，保留旧忽略截图；未提交工作会在复制前阻止发布', async t => {
  const directory = await temporary(t);
  const git = async (...args) => (await run('git', args, { cwd: directory })).stdout;
  await git('init', '-b', 'codex/pages');
  await git('config', 'user.name', '发布测试');
  await git('config', 'user.email', 'publish-test@example.invalid');
  await git('remote', 'add', 'origin', 'https://github.com/jadechoulu/baby-growth-tree.git');
  await writeFile(path.join(directory, '.gitignore'), 'output/\n');
  await writeFile(path.join(directory, 'obsolete.html'), '旧发布文件');
  await git('add', '.gitignore', 'obsolete.html');
  await git('commit', '-m', '初始化测试发布副本');
  await mkdir(path.join(directory, 'output'));
  await writeFile(path.join(directory, 'output/private-screenshot.png'), 'private-ignored-image');
  const result = await run(process.execPath, ['scripts/publish-site.mjs', '--target', directory]);
  assert.ok(result.stdout.includes('尚未推送'));
  const files = (await git('ls-files', '-z')).split('\0').filter(Boolean);
  assert.ok(files.includes('english/index.html'));
  assert.equal(files.includes('obsolete.html'), false);
  assert.equal(files.some(file => file.startsWith('output/')), false);
  assert.equal(await readFile(path.join(directory, 'output/private-screenshot.png'), 'utf8'), 'private-ignored-image');
  assert.equal((await git('status', '--porcelain')).trim(), '');
  await writeFile(path.join(directory, 'unfinished.txt'), '不可覆盖的工作');
  const before = await git('rev-parse', 'HEAD');
  await assert.rejects(run(process.execPath, ['scripts/publish-site.mjs', '--target', directory]), /未提交文件/);
  assert.equal(await git('rev-parse', 'HEAD'), before);
  assert.equal(await readFile(path.join(directory, 'unfinished.txt'), 'utf8'), '不可覆盖的工作');
});
