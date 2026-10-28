import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSiteConfig } from './build-site-config.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));

// 仅发布运行所需文件；个人记录、截图及工作目录不会随新文件自动进入发布包。
export const PUBLIC_FILES = Object.freeze([
  'index.html',
  'home.html',
  'site.css',
  'shared/site-config.js',
  'shared/site-shell.js',
  'shared/site-home.js',
  'app.mjs',
  'shared/baby-profile.js',
  'styles.css',
  'theme.css',
  'graph.css',
  'lib/model.mjs',
  'lib/graph.mjs',
  'lib/storage.mjs',
  'lib/import.mjs',
  'lib/cloud.mjs',
  'lib/save-queue.mjs',
  'data/catalog.json',
  'data/stage-resources.json',
  'data/skill-guides.json',
  'assets/favicon.svg',
  'assets/original.pdf',
]);

export function normalizeApiBase(value, { allowLocalApi = false } = {}) {
  if (typeof value !== 'string') throw new Error('apiBase 必须是字符串');
  const input = value.trim();
  if (!input) return '';
  let url;
  try { url = new URL(input); } catch { throw new Error('apiBase 必须是完整的 HTTPS 地址'); }
  if (url.username || url.password || input.includes('?') || input.includes('#') || url.pathname !== '/') {
    throw new Error('apiBase 必须是公开 API 来源，不得包含路径、身份信息、查询参数或片段');
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocalApi && local && url.protocol === 'http:')) {
    throw new Error('发布 API 必须使用 HTTPS；本地 HTTP 仅可显式用于开发');
  }
  if (local && !allowLocalApi) throw new Error('发布包不得指向本机 API');
  return url.origin;
}

async function checkPublicProfile(sourceRoot) {
  const source = await readFile(path.join(sourceRoot, 'lib/model.mjs'), 'utf8');
  const declaration = source.match(/\bDEFAULT_PROFILE\s*=\s*Object\.freeze\s*\(\s*\{([^}]*)\}/s);
  if (!declaration || !/\bbirthDate\s*:\s*(['"])\1\s*(?:,|$)/.test(declaration[1])) {
    throw new Error('公开发布前，DEFAULT_PROFILE.birthDate 必须为空，个人生日只可保存在私有记录中');
  }
}

export async function buildPages({ sourceRoot = PROJECT_ROOT, outputDir = path.join(PROJECT_ROOT, 'dist/pages'), apiBase, allowLocalApi = false } = {}) {
  const sourcePath = path.resolve(sourceRoot);
  const outputPath = path.resolve(outputDir);
  const relativeSource = path.relative(outputPath, sourcePath);
  if (!relativeSource || (!relativeSource.startsWith(`..${path.sep}`) && relativeSource !== '..' && !path.isAbsolute(relativeSource))) {
    throw new Error('发布目录不能是源码目录或其上级目录');
  }
  let configuredApi = apiBase;
  if (configuredApi === undefined) {
    const config = JSON.parse(await readFile(path.join(sourcePath, 'cloud-config.json'), 'utf8'));
    configuredApi = config.apiBase;
  }
  const publicApi = normalizeApiBase(configuredApi, { allowLocalApi });
  await checkPublicProfile(sourcePath);
  await buildSiteConfig(sourcePath);
  for (const relative of PUBLIC_FILES) {
    if (!(await stat(path.join(sourcePath, relative))).isFile()) throw new Error(`缺少网页运行文件：${relative}`);
  }

  await rm(outputPath, { recursive: true, force: true });
  await mkdir(outputPath, { recursive: true });
  for (const relative of PUBLIC_FILES) {
    const destination = path.join(outputPath, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(sourcePath, relative), destination);
  }
  // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 仅写公开 API 地址，不复制其他环境变量或配置字段。
  await writeFile(path.join(outputPath, 'cloud-config.json'), `${JSON.stringify({ apiBase: publicApi }, null, 2)}\n`);
  await writeFile(path.join(outputPath, '.nojekyll'), '');
  return { outputDir: outputPath, apiBase: publicApi, cloudConfigured: Boolean(publicApi), files: [...PUBLIC_FILES, 'cloud-config.json', '.nojekyll'] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const unknown = process.argv.slice(2).filter(arg => arg !== '--allow-local-api');
    if (unknown.length) throw new Error(`未知参数：${unknown.join(', ')}`);
    const result = await buildPages({
      apiBase: process.env.XIAOYA_API_BASE,
      allowLocalApi: process.argv.includes('--allow-local-api'),
    });
    console.log(`已生成公开网页发布包：${result.outputDir}`);
    console.log(result.cloudConfigured ? `云端 API：${result.apiBase}` : 'API 未配置：当前使用本机 IndexedDB 保存，可导入导出 JSON；云端同步未启用。');
  } catch (error) {
    console.error(`发布包构建失败：${error.message}`);
    process.exitCode = 1;
  }
}
