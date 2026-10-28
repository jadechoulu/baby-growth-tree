import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { buildSite } from './build-site.mjs';

const run = promisify(execFile);
const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const target = targetIndex >= 0 ? args[targetIndex + 1] : '';
const unknown = args.filter((arg, index) => index !== targetIndex && index !== targetIndex + 1 && arg !== '--push');

try {
  if (!target || target.startsWith('--') || unknown.length) {
    throw new Error('用法：node scripts/publish-site.mjs --target <公开发布仓库目录> [--push]');
  }
  const cwd = path.resolve(target);
  const git = async (...params) => (await run('git', params, { cwd })).stdout.trim();
  const remote = await git('remote', 'get-url', 'origin');
  if (!/github\.com[:/]jadechoulu\/baby-growth-tree(?:\.git)?$/.test(remote)) {
    throw new Error('目标必须是 jadechoulu/baby-growth-tree 的发布副本');
  }
  if (await git('branch', '--show-current') !== 'codex/pages') throw new Error('发布副本必须位于 codex/pages 分支');
  if (await git('status', '--porcelain', '--untracked-files=all')) throw new Error('发布副本存在未提交文件，请先处理，未覆盖任何文件');
  const { outputDir, files } = await buildSite({ apiBase: process.env.XIAOYA_API_BASE });
  const published = new Set(files);
  const tracked = (await run('git', ['ls-files', '-z'], { cwd })).stdout.split('\0').filter(Boolean);
  // 只清理版本控制中的过期发布文件，不碰 .git、忽略文件或浏览器记录。
  for (const relative of tracked) if (!published.has(relative)) await rm(path.join(cwd, relative), { force: true });
  for (const relative of files) {
    const destination = path.join(cwd, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(outputDir, relative), destination);
  }
  // 暂存严格限定为旧跟踪文件与新发布清单，不能带入目标目录的忽略文件。
  await git('add', '--all', '--', ...new Set([...tracked, ...files]));
  await git('diff', '--cached', '--check');
  if (await git('diff', '--cached', '--name-only')) {
    await git('commit', '-m', '发布小芽成长与英语统一站点');
    console.log('已提交生成的统一站点发布包。');
  } else console.log('发布包没有变化。');
  if (args.includes('--push')) {
    await git('push', 'origin', 'codex/pages');
    console.log('已推送，GitHub Pages 将更新成长树和英语页面。');
  } else console.log('尚未推送；核对发布副本后运行 git push origin codex/pages。');
} catch (error) {
  console.error(`发布停止：${error.message}`);
  process.exitCode = 1;
}
