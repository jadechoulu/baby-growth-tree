import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../shared/site-shell.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export async function buildSiteConfig(sourceRoot = ROOT) {
  const sections = site.validateSections(JSON.parse(await readFile(path.join(sourceRoot, 'shared/site-sections.json'), 'utf8')));
  for (const item of sections) {
    if (!(await stat(path.join(sourceRoot, item.entry.split(/[?#]/)[0]))).isFile()) throw new Error('分类入口不存在：' + item.entry);
  }
  const script = '// 自动生成自 site-sections.json，请勿手改。\nwindow.XIAOYA_SITE_SECTIONS=' + JSON.stringify(sections).replaceAll('<', '\\u003c') + ';\n';
  const target = path.join(sourceRoot, 'shared/site-config.js');
  if (await readFile(target, 'utf8').catch(() => '') !== script) await writeFile(target, script);
  return sections;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildSiteConfig();
