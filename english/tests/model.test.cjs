const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../model.js');
const raw = Object.fromEntries(['banana', 'xu', 'qing'].map(id => [id, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', id + '.json'), 'utf8'))]));
const catalog = model.normalize(raw);
const xuSupplements = ['xu-thousand', 'xu-panorama'].map(id => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', id + '.json'), 'utf8')));
const extendedCatalog = model.normalize({ ...raw, xuSupplements });
const xuCurrent = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'xu-current.json'), 'utf8'));
const currentCatalog = model.normalize({ ...raw, xuSupplements, xuCurrent });
const sssSongs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sss-songs.json'), 'utf8'));

test('默认起步把闪卡与闪卡式绘本并行，保留原表节点与准确的来源级别', () => {
  const xu = currentCatalog.routes.find(route => route.id === 'xu');
  assert.equal(xu.defaultVariantId, 'xu-current');
  assert.equal(xu.stages[0].id, 'xu-current-300');
  assert.equal(xu.stages.length, 5);
  assert.ok(xu.stages.every(stage => stage.domain === 'listening'));
  const first = xu.stages[0];
  const materials = first.materials.map(material => ({ ...material, resource: currentCatalog.resources.find(resource => resource.id === material.resourceId) }));
  assert.ok(materials.some(material => material.resource.type === 'flashcard'));
  assert.ok(materials.some(material => material.resource.title === '培生词汇妙趣屋' && material.level === ''));
  assert.ok(materials.some(material => material.resource.title === '大猫分级' && material.level === '预备级'));
  assert.ok(materials.some(material => material.resource.title === 'SSS 指令式儿歌' && material.sourceId === 'xu'));
  assert.ok(materials.filter(material => material.resource.title !== 'SSS 指令式儿歌').every(material => material.sourceId === 'xu-panorama'));
  for (const stage of xu.stages) {
    const original = currentCatalog.stages.find(item => item.id === stage.raw.sourceStageId);
    assert.equal(original.sourceId, stage.sourceId);
    for (const material of original.materials) assert.ok(stage.materials.some(item => item.resourceId === material.resourceId && item.level === material.level && item.sourceId === material.sourceId));
  }
  for (const stage of catalog.stages) assert.deepEqual(currentCatalog.stages.find(item => item.id === stage.id), stage);
  for (const resource of catalog.resources) assert.ok(currentCatalog.resources.some(item => item.id === resource.id));
});

test('70至299词都可在同一起步节点共读，查看其他资料不改变听力推荐', () => {
  const xu = currentCatalog.routes.find(route => route.id === 'xu');
  for (const words of [0, 70, 199, 200, 299, 300, 500, 800, 1000, 8000]) {
    const profile = { birthDate: '2024-11-24', asOf: '2026-10-28', listeningWords: words };
    const recommendation = model.recommend(profile, currentCatalog);
    assert.equal(recommendation.automaticPromotion, false);
    if (words < 300) {
      assert.equal(recommendation.routeStages.xu, 'xu-current-300');
      assert.ok(recommendation.suggested.some(id => currentCatalog.resources.find(resource => resource.id === id).type === 'reader'));
      assert.ok(recommendation.suggested.every(id => currentCatalog.resources.find(resource => resource.id === id).type !== 'animation'));
    }
    assert.equal(currentCatalog.stages.find(stage => stage.id === recommendation.routeStages.xu).variantId, 'xu-current');
    for (const variant of xu.variants) {
      const viewingAnotherVersion = { ...currentCatalog, routes: currentCatalog.routes.map(route => route.id === 'xu' ? { ...route, stages: variant.stages } : route) };
      assert.deepEqual(model.recommend(profile, viewingAnotherVersion), recommendation);
    }
  }
  const first = currentCatalog.stages.find(stage => stage.id === 'xu-current-300');
  const matches = model.compareStages(currentCatalog, first.id);
  assert.ok(matches.some(route => route.routeId === 'qing' && route.matches.length));
  const song = model.getSongResources(currentCatalog, sssSongs).find(resource => resource.title === 'SSS 指令式儿歌');
  assert.ok(song.appearances.some(appearance => appearance.stageId === first.id && appearance.sourceId === 'xu'));
});

test('SSS 歌单保留多分类、独立版本与已有路线素材关联', () => {
  assert.equal(sssSongs.songs.length, 42);
  assert.equal(new Set(sssSongs.songs.map(song => song.id)).size, 42);
  assert.equal(catalog.resources.find(r => r.id === sssSongs.resourceId).title, 'SSS 指令式儿歌');
  assert.deepEqual(sssSongs.categories.map(c => c.songIds.length), [10, 30, 12, 8]);
  const [essential, recommended] = sssSongs.categories;
  assert.ok(essential.songIds.every(id => recommended.songIds.includes(id)));
  assert.equal(sssSongs.songs.filter(s => /^Rock Scissors Paper #/.test(s.title)).length, 4);
  assert.equal(sssSongs.songs.filter(s => /^Down By The Bay/.test(s.title)).length, 3);
  for (const c of sssSongs.categories) {
    assert.ok(c.songIds.every(id => sssSongs.songs.some(s => s.id === id && s.categories.includes(c.id))));
  }
});

test('SSS 分类与场景和关键词叠加筛选，生活歌单按原图顺序', () => {
  assert.deepEqual(model.filterSongs(sssSongs, { category: 'day' }).map(s => s.scene),
    ['起床', '刷牙', '穿衣服', '出门玩', '上午活动', '收拾玩具', '洗澡', '摇篮曲']);
  assert.deepEqual(model.filterSongs(sssSongs, { category: 'recommended', scene: '洗澡', query: 'bath' }).map(s => s.title), ['The Bath Song']);
  assert.equal(model.filterSongs(sssSongs, { category: 'essential', scene: '洗澡' }).length, 0);
  assert.equal(model.filterSongs(sssSongs, { category: 'older', query: 'paper #3' })[0].title, 'Rock Scissors Paper #3');
  assert.equal(model.filterSongs(sssSongs, { query: 'If you’re HAPPY' })[0].title, "If You're Happy And You Know It");
  assert.equal(model.filterSongs(sssSongs, { query: '不存在的歌' }).length, 0);
  assert.equal(model.filterSongs(sssSongs, {}).length, 42);
});

test('SSS 补充歌单同时关联许密杉和庆爸的独立素材与真实阶段', () => {
  const linked = model.getSongResources(extendedCatalog, sssSongs);
  assert.equal(linked.length, 2);
  assert.deepEqual(linked.map(r => r.id).sort(), [catalog.rawToCanonical['xu-sss'], catalog.rawToCanonical['qing-r043']].sort());
  const appearances = linked.flatMap(r => r.appearances);
  assert.ok(appearances.some(a => a.stageId === 'xu-1'));
  assert.ok(appearances.some(a => a.routeId === 'qing' && /L1/.test(a.level)));
  assert.ok(appearances.every(a => extendedCatalog.stages.some(st => st.id === a.stageId)));
  assert.notEqual(linked[0].id, linked[1].id);
  assert.equal(linked.flatMap(r => r.appearances).filter(a => a.routeId === 'banana').length, 0);
});

test('SSS 官方入口和原图在构建中可追溯且不扩大为作者路线阶段', () => {
  const withSongs = model.normalize({ ...raw, sssSongs });
  assert.equal(withSongs.stages.length, catalog.stages.length);
  assert.equal(withSongs.resources.length, catalog.resources.length);
  assert.equal(withSongs.sources.find(s => s.id === 'sss-playlists').previews.length, 6);
  for (const song of sssSongs.songs) {
    assert.match(song.url, /^https:\/\/supersimple\.com\/song\//);
    if (song.videoUrl) assert.match(song.videoUrl, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+$/);
    if (song.cover) assert.ok(fs.existsSync(path.join(__dirname, '..', song.cover)));
  }
});

test('按上海日期计算实际月龄，跨生日与月末不多算月份', () => {
  assert.deepEqual(model.getAge('2020-11-24', '2022-10-27'), {
    years: 1, months: 11, days: 3, totalMonths: 23, label: '1 岁 11 个月 3 天'
  });
  assert.equal(model.getAge('2020-11-24', '2022-11-23').totalMonths, 23);
  assert.deepEqual(model.getAge('2020-11-24', '2022-11-24'), {
    years: 2, months: 0, days: 0, totalMonths: 24, label: '2 岁 0 个月 0 天'
  });
  assert.equal(model.getAge('2020-11-24', new Date('2022-10-26T16:30:00Z')).days, 3);
  assert.equal(model.getAge('2024-01-31', '2024-02-29').totalMonths, 1);
  assert.equal(model.getAge('2024-02-29', '2025-02-28').years, 1);
  assert.throws(() => model.getAge('2024-02-30', '2026-10-27'), RangeError);
  assert.throws(() => model.getAge('2020-11-24', '2020-11-23'), RangeError);
});

test('确认同套系跨路线合并，同时保留每次级别、角色、版本原文和原始数据', () => {
  const oxford = catalog.resources.find(r => r.title === '牛津树');
  assert.ok(oxford);
  assert.deepEqual([...new Set(oxford.appearances.map(a => a.routeId))].sort(), ['banana', 'qing', 'xu']);
  assert.ok(oxford.appearances.some(a => a.routeId === 'banana' && a.level === '1+&2'));
  assert.ok(oxford.appearances.some(a => a.routeId === 'xu' && a.level === '3-5' && a.role === 'main'));
  assert.ok(oxford.appearances.some(a => a.routeId === 'qing' && a.level === '1–2' && a.role === '主线'));
  assert.ok(oxford.raw.some(r => r.title === '牛津树拓展阅读' && r.publisher === '奇奇学'));
  assert.ok(oxford.details.some(d => d.label === '引进版本/出版方' && d.text === '奇奇学'));
  const qiming = catalog.resources.find(r => r.title === '培生启明星');
  assert.deepEqual([...new Set(qiming.appearances.map(a => a.routeId))].sort(), ['banana', 'qing', 'xu']);
});

test('不同或未确认套系保持独立，不把媒介版本或拼写疑点强合并', () => {
  const id = rawId => catalog.rawToCanonical[rawId];
  assert.notEqual(id('xu-bookworm'), id('banana-bookworms-1&2'));
  assert.notEqual(id('xu-pearson-unspecified'), id('xu-pearson-star'));
  assert.notEqual(id('xu-animal-adventure'), id('qing-r014'));
  assert.notEqual(id('xu-heinemann-gk70'), id('banana-heinemann-0'));
  const media = model.normalize({ banana: {
    stages: [{ id: 'a' }], resources: [
      { id: 'book', title: '同名系列', category: '绘本', stageIds: ['a'] },
      { id: 'animation', title: '同名系列', category: '动画', stageIds: ['a'] }
    ]
  }});
  assert.equal(media.resources.length, 2);
});

test('核实的三本绘本跨路线归并，香蕉实体 ID 稳定且迁移旧庆爸记录', () => {
  const confirmed = [
    ['banana-dragon-blue', 'qing-r111', 'Dragon 胖龙蓝蓝', 'resource-1tlgrbe', 'resource-1r7rzt9'],
    ['banana-frog-toad', 'qing-r112', 'Frog and Toad 青蛙与蟾蜍', 'resource-var8qr', 'resource-18z2m1m'],
    ['banana-winnie', 'qing-r114', 'Winnie and Wilbur 女巫温妮', 'resource-45qugp', 'resource-1dsd7xf']
  ];
  for (const [bananaId, qingId, title, stableId, legacyId] of confirmed) {
    assert.equal(catalog.rawToCanonical[bananaId], stableId);
    assert.equal(catalog.rawToCanonical[qingId], stableId);
    assert.equal(catalog.legacyResourceIds[legacyId], stableId);
    const resource = catalog.resources.find(item => item.id === stableId);
    assert.equal(resource.title, title);
    assert.deepEqual([...new Set(resource.appearances.map(appearance => appearance.routeId))], ['banana', 'qing']);
    assert.ok(resource.appearances.some(appearance => appearance.stageId === 'banana-4' && appearance.page === 16));
    assert.ok(resource.appearances.some(appearance => appearance.stageId === 'qing-s7' && appearance.page === 6));
  }
  assert.equal(Object.keys(catalog.legacyResourceIds).length, 4);
  assert.notEqual(catalog.rawToCanonical['xu-sss'], catalog.rawToCanonical['qing-r043']);
  assert.notEqual(catalog.rawToCanonical['xu-scholastic'], catalog.rawToCanonical['banana-flr-A&B']);
});

test('全部原始素材和所有阶段引用均可追溯到有效规范实体', () => {
  const ids = new Set(catalog.resources.map(r => r.id));
  assert.equal(ids.size, catalog.resources.length);
  for (const [routeId, data] of Object.entries(raw)) {
    for (const resource of data.resources) {
      assert.ok(ids.has(catalog.rawToCanonical[routeId + ':' + resource.id]), routeId + ':' + resource.id);
    }
  }
  for (const route of catalog.routes) {
    assert.deepEqual(route.stages.map(s => s.order), route.stages.map((_, i) => i + 1));
    for (const stage of route.stages) {
      assert.equal(catalog.stages.find(s => s.id === stage.id), stage);
      assert.ok(stage.materials.length, stage.id + ' 没有素材');
      assert.ok(stage.preview, stage.id + ' 没有预览');
      for (const material of stage.materials) {
        assert.ok(ids.has(material.resourceId), stage.id + ':' + material.resourceId);
        assert.ok(catalog.resources.find(r => r.id === material.resourceId).appearances.some(a => a.stageId === stage.id && a.level === material.level && a.role === material.role));
      }
    }
  }
  assert.equal(catalog.routes.find(r => r.id === 'banana').stages[0].raw.order, 0);
  assert.deepEqual(catalog.sources.map(s => s.id), ['banana', 'xu', 'qing', 'age', 'reading']);
  assert.ok(catalog.sources.every(s => s.file && s.previews.length));
  for (const edge of catalog.relationships) {
    assert.ok(ids.has(edge.from)); assert.ok(ids.has(edge.to));
  }
  assert.ok(catalog.relationships.some(e => e.stageId === 'xu-1' && e.label.includes('非逐本逐集对应')));
  assert.ok(catalog.relationships.some(e => e.label.includes('内容重叠')));
  for (const resource of raw.banana.resources.filter(r => r.preview.includes('/banana-cover-'))) {
    assert.ok(catalog.resources.find(r => r.id === catalog.rawToCanonical[resource.id]).cover);
  }
  assert.equal(catalog.resources.find(r => r.id === catalog.rawToCanonical['xu-yakka-dee']).cover, null);
});

test('70词处于起点，目标词数不能作为准入线；高词量也只给浏览候选', () => {
  const recommendation = model.recommend({ birthDate: '2020-11-24', asOf: '2022-10-27', listeningWords: 70 }, catalog);
  assert.deepEqual(recommendation.routeStages, { banana: 'banana-pre', xu: 'xu-1', qing: 'qing-s1' });
  assert.equal(recommendation.underThree, true);
  assert.equal(recommendation.level, 'start');
  assert.equal(recommendation.automaticPromotion, false);
  assert.match(recommendation.reason, /积累目标.*不能当作入门门槛/);
  assert.match(recommendation.next, /3–4 岁/);
  const suggested = recommendation.suggested.map(id => catalog.resources.find(r => r.id === id));
  assert.deepEqual(suggested.slice(0, 3).map(r => r.title), ['SSS 指令式儿歌', '时光学名词卡', '阿布巴布动词卡']);
  assert.ok(suggested.some(r => r.type === 'flashcard'));
  assert.ok(suggested.every(r => r.type !== 'animation'));
  const higher = model.recommend({ words: 600 }, catalog);
  assert.equal(higher.level, 'browse');
  assert.equal(higher.automaticPromotion, false);
  assert.match(higher.reason, /不能据此判断已晋级/);
  assert.equal(catalog.stages.find(s => s.id === 'qing-s1').entry, '零基础');
});

test('浏览器普通script可用，且不依赖模块加载或网络', () => {
  const context = vm.createContext({ Intl, Date, Set, Array, Object, String, Number, Math, RangeError });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'model.js'), 'utf8'), context);
  assert.equal(typeof context.EnglishModel.normalize, 'function');
  assert.equal(context.EnglishModel.getAge('2020-11-24', '2022-10-27').totalMonths, 23);
});

function stageMatch(focusId, routeId, targetId) {
  return model.compareStages(catalog, focusId).find(route => route.routeId === routeId).matches.find(stage => stage.stageId === targetId);
}

function evidenceFor(focusId, routeId, targetId, title) {
  return stageMatch(focusId, routeId, targetId).evidence.filter(entry => entry.title === title);
}

test('阶段关联依据每次级别，未知级别不会变成同级，且不同级别的共同套系可识别', () => {
  const vocabulary = evidenceFor('xu-2', 'qing', 'qing-s1', '培生词汇妙趣屋');
  assert.equal(vocabulary.length, 1);
  assert.equal(vocabulary[0].focusLevel, '');
  assert.equal(vocabulary[0].targetLevel, '1–2');
  assert.equal(vocabulary[0].kind, 'unspecified');
  assert.match(vocabulary[0].label, /未标级.*不能确认/);
  assert.equal(evidenceFor('xu-2', 'qing', 'qing-s2', '培生词汇妙趣屋')[0].kind, 'unspecified');
  assert.equal(evidenceFor('xu-2', 'qing', 'qing-s1', '大猫分级')[0].kind, 'different');
  assert.equal(evidenceFor('xu-3', 'qing', 'qing-s1', '大猫分级')[0].kind, 'overlap');
  assert.equal(evidenceFor('xu-3', 'qing', 'qing-s2', '大猫分级')[0].kind, 'overlap');
  assert.equal(evidenceFor('xu-3', 'qing', 'qing-s5', '大猫分级')[0].kind, 'different');
});

test('牛津树一对多覆盖保留：许四/五对应庆二，许六横跨庆三到庆五', () => {
  assert.equal(evidenceFor('xu-4', 'qing', 'qing-s2', '牛津树')[0].kind, 'overlap');
  assert.equal(evidenceFor('xu-5', 'qing', 'qing-s2', '牛津树')[0].kind, 'overlap');
  for (const target of ['qing-s3', 'qing-s4', 'qing-s5']) {
    const evidence = evidenceFor('xu-6', 'qing', target, '牛津树')[0];
    assert.equal(evidence.kind, 'overlap');
    assert.equal(evidence.focusLevel, '3-5');
  }
  assert.equal(evidenceFor('xu-6', 'qing', 'qing-s2', '牛津树')[0].kind, 'different');
  assert.equal(evidenceFor('xu-6', 'qing', 'qing-s6', '牛津树')[0].kind, 'different');
});

test('级别规范化兼容范围和中文序数，同时保留加号、选材限定与不同标尺', () => {
  const compare = (left, right) => {
    const sample = model.normalize({
      banana: { resources: [{ id: 'a', title: '同一套系', category: '分级' }], stages: [{ id: 'a', materials: [{ resourceId: 'a', level: left }] }] },
      xu: { resources: [{ id: 'b', title: '同一套系', category: '分级' }], stages: [{ id: 'b', materials: [{ resourceId: 'b', level: right }] }] }
    });
    return model.compareStages(sample, 'a')[0].matches[0].evidence[0];
  };
  for (const [left, right] of [['1', '一级'], ['第1-2级', '1&2'], ['1–2', '1&2'], ['A&B', 'A-B'], ['GK70 A/B/C', 'GK70 A-C'], ['S1-3', 'S1&S2&S3'], ['预备级', '预备级']]) {
    assert.equal(compare(left, right).kind, 'exact', `${left} / ${right}`);
  }
  assert.equal(compare('1+', '1').kind, 'different');
  assert.match(compare('1+', '1').label, /带 \+.*未确认重叠/);
  assert.equal(compare('1+&2', '1').kind, 'different');
  assert.equal(compare('1+&2', '1&2').kind, 'overlap');
  assert.equal(compare('1+&2', '1+').kind, 'overlap');
  assert.equal(compare('1', '1（虚构部分）').kind, 'overlap');
  assert.equal(compare('1（虚构）', '1（非虚构）').kind, 'different');
  assert.equal(compare('1（外研版）', '1（必恩版）').kind, 'overlap');
  assert.equal(compare('GK1-2', 'G1-1&G1-2').kind, 'different');
  assert.equal(compare('S1-3', '1-3').kind, 'different');
  assert.equal(compare('', '').kind, 'unspecified');
});

test('加号相关不计为级别交集，但同阶段范围中真正的共同级别仍保留', () => {
  const different = evidenceFor('xu-4', 'banana', 'banana-1', '牛津树')[0];
  assert.equal(different.kind, 'different');
  assert.match(different.label, /带 \+.*未确认重叠/);
  assert.equal(evidenceFor('xu-5', 'banana', 'banana-1', '牛津树')[0].kind, 'overlap');
  const sample = model.normalize({
    banana: { resources: [{ id: 'a', title: '牛津树', category: '分级' }], stages: [{ id: 'a', materials: [{ resourceId: 'a', level: '1+&2' }] }] },
    xu: { resources: [{ id: 'b', title: '牛津树', category: '分级' }], stages: [{ id: 'b', materials: [{ resourceId: 'b', level: '1' }] }] }
  });
  const match = model.compareStages(sample, 'a')[0].matches[0];
  assert.equal(match.sharedCount, 1);
  assert.equal(match.overlapCount, 0);
  assert.match(match.basis, /未确认级别交集/);
});

test('Little Fox同平台集合归并并迁移旧记录，同级选材仍保留双方片单限定', () => {
  const fox = catalog.resources.find(resource => resource.title === '小狐狸动画');
  assert.equal(fox.id, 'resource-mxtrmb');
  assert.equal(catalog.rawToCanonical['xu-littlefox'], fox.id);
  for (const rawId of ['qing-r041', 'qing-r042', 'qing-r061', 'qing-r079', 'qing-r100', 'qing-r122']) {
    assert.equal(catalog.rawToCanonical[rawId], fox.id);
  }
  assert.equal(catalog.legacyResourceIds['resource-1qerac2'], fox.id);
  assert.ok(fox.details.some(detail => /指定片单/.test(detail.text)));
  assert.ok(fox.aliases.includes('Little Fox'));
  for (const [focus, target, focusLevel, targetLevel] of [
    ['xu-5', 'qing-s5', '二级别', 'L2 · 任选2部（Bird、彼得兔、马克笔）'],
    ['xu-6', 'qing-s6', '第三级别动画', 'L3 · 经典故事'],
    ['xu-6', 'qing-s7', '第三级别动画', 'L3 · 魔法师和猫｜柳林风声']
  ]) {
    const evidence = evidenceFor(focus, 'qing', target, '小狐狸动画')[0];
    assert.equal(evidence.kind, 'overlap');
    assert.equal(evidence.focusLevel, focusLevel);
    assert.equal(evidence.targetLevel, targetLevel);
    assert.match(evidence.label, /未确认指定片单相同/);
  }
  assert.equal(evidenceFor('xu-5', 'qing', 'qing-s6', '小狐狸动画')[0].kind, 'different');
  const progression = model.getSeriesProgression(catalog, fox.id);
  assert.deepEqual(progression.find(route => route.routeId === 'xu').stages.map(stage => stage.level), ['二级别', '第三级别动画']);
  assert.equal(progression.find(route => route.routeId === 'qing').stages.length, 6);
});

test('Little Fox级别只从明确的级别前缀提取，不把选片数量当级别', () => {
  const compare = (left, right) => {
    const sample = model.normalize({
      xu: { resources: [{ id: 'a', title: '小狐狸动画', type: 'animation' }], stages: [{ id: 'a', animations: [{ resourceId: 'a', level: left }] }] },
      qing: { resources: [{ id: 'b', series: 'Little Fox', category: '动画' }], stages: [{ id: 'b', resources: [{ resourceId: 'b', level: right }] }] }
    });
    return model.compareStages(sample, 'a')[0].matches[0].evidence[0];
  };
  assert.equal(compare('二级别', 'L2').kind, 'exact');
  assert.equal(compare('第三级别动画', 'L3（经典故事）').kind, 'overlap');
  assert.equal(compare('二级别', 'L1 · 选2–3部（Bat、DinoTire）').kind, 'different');
  assert.equal(compare('二级别', '任选2部（Bird、彼得兔）').kind, 'different');
  assert.equal(compare('二级别', '').kind, 'unspecified');
});

test('阶段交集计数按套系去重，排序优先级别交集，证据均能回到两端原文材料', () => {
  for (const focus of catalog.stages) {
    for (const route of model.compareStages(catalog, focus.id)) {
      assert.notEqual(route.routeId, focus.routeId);
      for (let index = 0; index < route.matches.length; index++) {
        const match = route.matches[index];
        const target = catalog.stages.find(stage => stage.id === match.stageId);
        assert.equal(target.routeId, route.routeId);
        assert.equal(match.sharedCount, new Set(match.evidence.map(entry => entry.resourceId)).size);
        assert.equal(match.overlapCount, new Set(match.evidence.filter(entry => ['exact', 'overlap'].includes(entry.kind)).map(entry => entry.resourceId)).size);
        assert.equal(match.exactCount, new Set(match.evidence.filter(entry => entry.kind === 'exact').map(entry => entry.resourceId)).size);
        assert.equal(match.unspecifiedCount, new Set(match.evidence.filter(entry => entry.kind === 'unspecified').map(entry => entry.resourceId)).size);
        for (const entry of match.evidence) {
          assert.ok(focus.materials.some(material => material.resourceId === entry.resourceId && material.level === entry.focusLevel && material.role === entry.focusRole && material.page === entry.focusPage));
          assert.ok(target.materials.some(material => material.resourceId === entry.resourceId && material.level === entry.targetLevel && material.role === entry.targetRole && material.page === entry.targetPage));
          assert.equal(catalog.resources.find(resource => resource.id === entry.resourceId).title, entry.title);
        }
        if (index) {
          const previous = route.matches[index - 1];
          assert.ok(previous.overlapCount > match.overlapCount || previous.overlapCount === match.overlapCount &&
            (previous.exactCount > match.exactCount || previous.exactCount === match.exactCount && previous.sharedCount >= match.sharedCount));
        }
      }
    }
  }
  assert.deepEqual(model.compareStages(catalog, 'xu-1').find(route => route.routeId === 'banana').matches, []);
  assert.deepEqual(model.compareStages(catalog, '不存在'), []);
});

test('套系进阶表保留全部路线中的每次阶段级别与角色，不用完整套系级别冒充阶段用法', () => {
  const vocabulary = catalog.resources.find(resource => resource.title === '培生词汇妙趣屋');
  const progression = model.getSeriesProgression(catalog, vocabulary.id);
  assert.deepEqual(progression.map(route => route.routeId), ['xu', 'qing']);
  assert.deepEqual(progression.find(route => route.routeId === 'xu').stages.map(stage => stage.level), ['']);
  assert.deepEqual(progression.find(route => route.routeId === 'qing').stages.map(stage => [stage.stageId, stage.level]), [['qing-s1', '1–2'], ['qing-s2', '3']]);
  for (const resource of catalog.resources) {
    const groups = model.getSeriesProgression(catalog, resource.id);
    const stages = groups.flatMap(group => group.stages.map(stage => ({ ...stage, routeId: group.routeId })));
    assert.equal(stages.length, resource.appearances.length, resource.title);
    for (const appearance of resource.appearances) {
      assert.ok(stages.some(stage => stage.stageId === appearance.stageId && stage.routeId === appearance.routeId && stage.level === appearance.level &&
        stage.role === appearance.role && stage.page === appearance.page && stage.original === appearance.original));
    }
  }
  assert.deepEqual(model.getSeriesProgression(catalog, '不存在'), []);
});

test('许密杉多版本独立保留节点与来源，不串接阶段编号且保留既有实体 ID', () => {
  const route = extendedCatalog.routes.find(route => route.id === 'xu');
  assert.deepEqual(route.stages.map(stage => stage.id), catalog.routes.find(route => route.id === 'xu').stages.map(stage => stage.id));
  assert.deepEqual(route.variants.map(variant => variant.id), ['xu-listening', 'xu-thousand', 'xu-panorama']);
  assert.deepEqual(route.variants.map(variant => variant.stages.length), [6, 4, 10]);
  assert.equal(extendedCatalog.stages.length, catalog.stages.length + 14);
  for (const resource of catalog.resources) assert.ok(extendedCatalog.resources.some(item => item.id === resource.id), resource.title + ' 既有 ID 发生变化');
  for (const variant of route.variants) {
    assert.deepEqual(variant.stages.map(stage => stage.order), variant.stages.map((_, index) => index + 1));
    assert.ok(extendedCatalog.sources.some(source => source.id === variant.sourceId && source.previews.length));
    for (const stage of variant.stages) {
      assert.equal(stage.sourceId, variant.sourceId);
      assert.equal(stage.variantId, variant.id);
      for (const material of stage.materials) {
        assert.equal(material.sourceId, variant.sourceId);
        assert.equal(material.variantId, variant.id);
        const resource = extendedCatalog.resources.find(resource => resource.id === material.resourceId);
        assert.ok(resource.appearances.some(item => item.stageId === stage.id && item.sourceId === variant.sourceId && item.variantId === variant.id));
        assert.ok(resource.raw.some(item => item.sourceId === variant.sourceId && item.variantId === variant.id));
      }
      for (const activity of stage.activities) assert.ok(activity.resourceIds.every(id => extendedCatalog.resources.some(resource => resource.id === id)));
    }
  }
  const literacy = extendedCatalog.stages.find(stage => stage.id === 'xu-panorama-reading-literacy');
  assert.equal(literacy.domain, 'reading');
  assert.equal(extendedCatalog.stages.find(stage => stage.id === 'xu-panorama-listening-1000').domain, 'listening');
  const thousand = extendedCatalog.stages.find(stage => stage.id === 'xu-thousand-1');
  assert.equal(thousand.duration, '3个月');
  assert.equal(thousand.activities.length, 6);
  assert.deepEqual(thousand.activities[0].materials, ['xu-thousand-noun-cards', 'xu-thousand-tpr-cards']);
});

test('同作者不同版本的级别和原页隔离，未标级不借用旧版本或套系完整级别', () => {
  const wow = extendedCatalog.resources.find(resource => resource.title === 'Wow English');
  const progression = model.getSeriesProgression(extendedCatalog, wow.id).find(group => group.routeId === 'xu').stages;
  assert.ok(progression.some(stage => stage.variantId === 'xu-listening' && stage.sourceId === 'xu' && stage.level === '1-3'));
  assert.ok(progression.some(stage => stage.variantId === 'xu-thousand' && stage.sourceId === 'xu-thousand' && stage.level === ''));
  assert.ok(progression.some(stage => stage.variantId === 'xu-panorama' && stage.sourceId === 'xu-panorama' && stage.level === ''));
  assert.ok(wow.details.some(detail => detail.sourceId === 'xu-thousand' && detail.variantId === 'xu-thousand'));
  const oxford = extendedCatalog.resources.find(resource => resource.title === '牛津树');
  assert.equal(oxford.id, catalog.resources.find(resource => resource.title === '牛津树').id);
  const evidence = model.compareStages(extendedCatalog, 'xu-thousand-1').find(route => route.routeId === 'qing').matches
    .find(stage => stage.stageId === 'qing-s2').evidence.find(entry => entry.title === '牛津树');
  assert.equal(evidence.focusLevel, '1');
  assert.equal(evidence.targetLevel, '1–2');
  assert.equal(evidence.focusSourceId, 'xu-thousand');
  assert.equal(evidence.targetSourceId, 'qing');
  assert.equal(evidence.focusPage, 1);
  assert.equal(evidence.targetPage, 4);
  assert.equal(evidence.kind, 'overlap');
  assert.notEqual(extendedCatalog.rawToCanonical['xu-thousand-heinemann-gk'], extendedCatalog.rawToCanonical['xu-heinemann-gk70']);
  assert.notEqual(extendedCatalog.rawToCanonical['xu-thousand-oxford-phonics'], oxford.id);
  assert.notEqual(extendedCatalog.rawToCanonical['xu-panorama-oxford-phonics'], oxford.id);
  assert.notEqual(extendedCatalog.rawToCanonical['xu-thousand-oxford-phonics'], extendedCatalog.rawToCanonical['xu-panorama-oxford-phonics']);
  assert.ok(extendedCatalog.resources.find(resource => resource.title === '牛津自拼').details.some(detail => /未注明英文名与版本/.test(detail.text)));
  assert.equal(extendedCatalog.rawToCanonical['xu-thousand-muzzy'], extendedCatalog.rawToCanonical['xu-muzzy']);
  assert.notEqual(extendedCatalog.rawToCanonical['xu-thousand-muzzy'], extendedCatalog.rawToCanonical['qing-r010']);
  assert.equal(extendedCatalog.rawToCanonical['xu-thousand-fly-guy'], extendedCatalog.rawToCanonical['banana-fly-guy']);
  assert.equal(extendedCatalog.rawToCanonical['xu-panorama-fly-guy'], extendedCatalog.rawToCanonical['banana-fly-guy']);
  assert.equal(extendedCatalog.rawToCanonical['xu-panorama-magic-tree-house'], extendedCatalog.rawToCanonical['banana-mth']);
  assert.equal(extendedCatalog.rawToCanonical['xu-panorama-my-weird-school'], extendedCatalog.rawToCanonical['banana-weird-school']);
  assert.equal(extendedCatalog.rawToCanonical['xu-panorama-geronimo-stilton'], extendedCatalog.rawToCanonical['banana-geronimo']);
  assert.equal(extendedCatalog.rawToCanonical['xu-panorama-scholastic-unspecified'], extendedCatalog.rawToCanonical['xu-scholastic']);
  assert.notEqual(extendedCatalog.rawToCanonical['xu-panorama-scholastic-unspecified'], extendedCatalog.rawToCanonical['banana-flr-A&B']);
});

test('版本切换不把自然拼读、阅读词数或执行表日程用于宝宝听力推荐', () => {
  const xu = extendedCatalog.routes.find(route => route.id === 'xu');
  for (const words of [70, 500, 1000, 2000, 8000]) {
    const profile = { birthDate: '2020-11-24', asOf: '2022-10-27', listeningWords: words };
    const expected = model.recommend(profile, catalog);
    assert.deepEqual(model.recommend(profile, extendedCatalog), expected);
    for (const variant of xu.variants) {
      const shadowCatalog = { ...extendedCatalog, routes: extendedCatalog.routes.map(route => route.id === 'xu' ? { ...route, stages: variant.stages } : route) };
      assert.deepEqual(model.recommend(profile, shadowCatalog), expected, variant.id + ' 改变了推荐');
    }
  }
});

test('同页同名资源保留版本专属详情，补充图片来源不生成重复阶段', () => {
  const sample = model.normalize({
    xu: { resources: [{ id: 'a', title: '示例套系', type: 'reader', levels: ['1', '2'], page: 1 }], stages: [{ id: 'main', materials: [{ resourceId: 'a', level: '1' }] }] },
    xuSupplements: [{
      id: 'xu-supplement', label: '补充版本', source: { file: 'supplement.pdf', previews: ['supplement.jpg'], extraSources: [{ id: 'diagram', title: '同内容图示', file: 'diagram.png', previews: ['diagram.jpg'] }] },
      resources: [{ id: 'a', title: '示例套系', type: 'reader', levels: ['1', '2'], page: 1 }],
      stages: [{ id: 'supplement', materials: [{ resourceId: 'a', level: null }] }]
    }]
  });
  assert.equal(sample.stages.length, 2);
  assert.ok(sample.sources.some(source => source.id === 'diagram' && source.previews[0].path === 'diagram.jpg'));
  const resource = sample.resources[0];
  assert.equal(resource.details.filter(detail => detail.label === '完整级别').length, 2);
  assert.deepEqual(resource.details.filter(detail => detail.label === '完整级别').map(detail => detail.sourceId), ['xu', 'xu-supplement']);
  assert.equal(sample.stages.find(stage => stage.id === 'supplement').materials[0].level, '');
  assert.equal(sample.rawToCanonical['xu:a'], sample.rawToCanonical['xu-supplement:a']);
});
