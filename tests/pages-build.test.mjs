import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES, buildPages, normalizeApiBase } from '../scripts/build-pages.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

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

test('真实发布包没有个人默认生日，运行时引用均包含在发布目录', async t => {
  const directory = await temporary(t);
  const outputDir = path.join(directory, 'pages');
  const result = await buildPages({ sourceRoot: projectRoot, outputDir, apiBase: '' });
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
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
      assert.ok(files.has(target), `${relative} 引用的 ${target} 不在发布包中`);
    }
  }
  assert.deepEqual(await filesIn(outputDir), [...files].sort());
});
