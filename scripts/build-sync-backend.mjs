import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const BACKEND_FILES = Object.freeze([
  ['backend/package.json', 'package.json'],
  ['backend/package-lock.json', 'package-lock.json'],
  ['backend/vercel.json', 'vercel.json'],
  ['backend/api/[...path].mjs', 'api/[...path].mjs'],
  ['backend/handler.mjs', 'backend/handler.mjs'],
  ['backend/blob-auth.mjs', 'backend/blob-auth.mjs'],
  ['worker/index.mjs', 'worker/index.mjs'],
  ['shared/sync-model.js', 'shared/sync-model.js'],
  ['lib/model.mjs', 'lib/model.mjs'],
  ['data/catalog.json', 'data/catalog.json'],
]);
export const NETLIFY_BACKEND_FILES = Object.freeze([
  ['backend/netlify/package.json', 'package.json'],
  ['backend/netlify/package-lock.json', 'package-lock.json'],
  ['backend/netlify/netlify.toml', 'netlify.toml'],
  ['backend/netlify/functions/sync.mjs', 'functions/sync.mjs'],
  ['backend/netlify/functions/auth-cleanup.mjs', 'functions/auth-cleanup.mjs'],
  ['backend/netlify-handler.mjs', 'backend/netlify-handler.mjs'],
  ['backend/netlify-auth.mjs', 'backend/netlify-auth.mjs'],
  ...BACKEND_FILES.filter(([source]) => /^(worker|shared|lib|data)\//.test(source)),
]);
export async function buildSyncBackend(outputDir = path.join(ROOT, 'dist/sync-backend'), { provider = 'vercel' } = {}) {
  if (!['vercel', 'netlify'].includes(provider)) throw new Error('未知同步平台');
  await rm(outputDir, { recursive: true, force: true });
  for (const [source, target] of provider === 'netlify' ? NETLIFY_BACKEND_FILES : BACKEND_FILES) {
    const destination = path.join(outputDir, target);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(ROOT, source), destination);
  }
  await mkdir(path.join(outputDir, 'public'), { recursive: true });
  await writeFile(path.join(outputDir, 'public/index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>小芽同步服务</title><p>小芽私人记录同步接口。请从小芽网站使用 GitHub 登录。</p></html>\n');
  return outputDir;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const provider = process.argv.includes('--netlify') ? 'netlify' : 'vercel';
  console.log('已生成同步后端：' + await buildSyncBackend(path.join(ROOT, provider === 'netlify' ? 'dist/sync-netlify' : 'dist/sync-backend'), { provider }));
}
