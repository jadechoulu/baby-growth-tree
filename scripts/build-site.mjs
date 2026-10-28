import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { buildPages } from './build-pages.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));

async function filesIn(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(directory, relative));
    else result.push(relative);
  }
  return result;
}

export async function buildSite({ apiBase, allowLocalApi = false } = {}) {
  // 两个组件各自验证、构建后再组装，不能把个人工作区复制到公开包。
  const growth = await buildPages({ apiBase, allowLocalApi });
  await run(process.env.PYTHON || 'python3', ['english/build.py', '--pages'], { cwd: ROOT });
  const outputDir = path.join(ROOT, 'dist/site');
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(growth.outputDir, outputDir, { recursive: true });
  await cp(path.join(ROOT, 'dist/english-pages'), path.join(outputDir, 'english'), { recursive: true });
  await cp(path.join(ROOT, 'deploy/site-README.md'), path.join(outputDir, 'README.md'));
  await cp(path.join(ROOT, '.gitignore'), path.join(outputDir, '.gitignore'));
  return { outputDir, files: await filesIn(outputDir), cloudConfigured: growth.cloudConfigured };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildSite({ apiBase: process.env.XIAOYA_API_BASE });
    console.log(`已生成小芽完整站点：${result.outputDir}`);
    console.log('首页 home.html · 成长技能树 index.html · 英语启蒙 english/index.html');
  } catch (error) {
    console.error(`完整站点构建失败：${error.message}`);
    process.exitCode = 1;
  }
}
