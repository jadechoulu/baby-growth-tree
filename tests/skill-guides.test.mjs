import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const guides = JSON.parse(await readFile(new URL('../data/skill-guides.json', import.meta.url), 'utf8'));

function checkSources(ids, label) {
  assert.ok(Array.isArray(ids) && ids.length, `${label} 缺少参考来源`);
  for (const id of ids) assert.ok(guides.sources[id], `${label} 引用了不存在的来源 ${id}`);
}

test('所有技能及能力分支均能找到独立解释和参考资料', () => {
  assert.deepEqual(Object.keys(guides.skills).sort(), catalog.map(skill => skill.id).sort());
  for (const skill of catalog) {
    const guide = guides.skills[skill.id];
    for (const key of ['meaning', 'example', 'play', 'observe']) {
      assert.equal(typeof guide[key], 'string', `${skill.id}.${key} 应是文字`);
      assert.ok(guide[key].trim(), `${skill.id}.${key} 不能为空`);
    }
    assert.notEqual(guide.meaning, skill.title, `${skill.id} 的解释不能只是重复技能名`);
    assert.ok(guide.note === undefined || typeof guide.note === 'string');
    checkSources(guide.sources, skill.id);
    const concept = guides.categories[skill.category];
    assert.ok(concept?.meaning?.trim() && concept?.example?.trim(), `${skill.category} 缺少概念解释`);
    checkSources(concept.sources, skill.category);
  }
});

test('语言特殊现象保留原图月龄，只作为资料而不生成可完成的技能', () => {
  assert.equal(guides.languageNotes.phenomena.length, 6);
  for (const item of guides.languageNotes.phenomena) {
    assert.ok(Number.isInteger(item.minMonths) && item.minMonths <= item.maxMonths);
    assert.equal(catalog.some(skill => skill.title === item.title), false);
  }
  assert.deepEqual(guides.languageNotes.phenomena.map(item => [item.minMonths, item.maxMonths]), [
    [13, 24], [13, 18], [19, 30], [19, 36], [25, 36], [31, 36],
  ]);
});

test('参考资料包含可追溯的机构、标题与可访问的原文链接或本地原始截图', async () => {
  assert.ok(Object.keys(guides.sources).length);
  for (const [id, source] of Object.entries(guides.sources)) {
    assert.ok(source.title?.trim() && source.publisher?.trim(), `${id} 缺少资料信息`);
    if (id.startsWith('mao-language-')) {
      assert.ok(source.url.startsWith('./assets/language/'));
      assert.ok((await readFile(new URL('../' + source.url.slice(2), import.meta.url))).length > 0);
      continue;
    }
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:', `${id} 应链接到 HTTPS 原文`);
    assert.equal(url.username, '');
    assert.equal(url.password, '');
  }
});
