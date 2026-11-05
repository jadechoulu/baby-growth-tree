(function (root) {
  'use strict';
  var TOPICS = typeof module === 'object' && module.exports ? require('./topics.js') : root.EnglishTopics;

  var ROUTES = {
    banana: { name: '香蕉妈妈', color: '#e7ab43' },
    xu: { name: '许密杉', color: '#588c79' },
    qing: { name: '庆爸', color: '#7389bd' }
  };
  var TYPE_NAMES = {
    book: 'book', picturebook: 'book', pictureBook: 'book', 绘本: 'book', 科普: 'book', '故事/绘本': 'book', 初章: 'book',
    reader: 'reader', gradedreader: 'reader', gradedReader: 'reader', 分级: 'reader',
    animation: 'animation', cartoon: 'animation', 动画: 'animation', 动画片: 'animation',
    song: 'song', songs: 'song', 儿歌: 'song', 童谣: 'song',
    flashcard: 'flashcard', flashcards: 'flashcard', 闪卡: 'flashcard',
    other: 'other'
  };
  // 仅确认同系列的别名进入此表，媒介类型仍分别保留。
  var SERIES_ALIASES = [
    ['牛津树', '牛津树拓展阅读', '牛津阅读树', 'Oxford Reading Tree'],
    ['大猫分级', '大猫', 'Collins Big Cat'],
    ['培生启明星', '培生启明星分级', '启明星'],
    ['培生词汇妙趣屋', '词汇妙趣屋', '培生幼儿英语·基础词汇', '培生幼儿英语基础词汇', '培生幼儿基础词汇'],
    ['培生儿童英语', '培生儿童英语分级阅读'],
    ['培生亲子故事屋', '培生亲子故事屋分级'],
    ['Yakka Dee', 'Yakka dee'],
    ['Wow English', 'WOW English', 'WOW'],
    ['小 P 优优', '小P优优'],
    ['小猪佩奇', 'Peppa Pig'],
    ['Super Hammy', 'Super hammy'],
    ['Buddy Reader', 'Buddy reader', 'Buddy Readers'],
    ['QPlay奇问妙想国', 'Q-play'],
    ['WPlay词汇妙趣国', 'W-play'],
    ['I can read', 'I Can Read'],
    ['RAZ', 'Raz'],
    ['Dragon 胖龙蓝蓝', '胖龙蓝蓝'],
    ['Frog and Toad 青蛙与蟾蜍', '青蛙蟾蜍'],
    ['Winnie and Wilbur 女巫温妮', '女巫温妮'],
    ['小狐狸动画', 'Little Fox'],
    ['Fly Guy and Buzz 苍蝇小子', '苍蝇小子'],
    ['Magic Tree House 神奇树屋', '神奇树屋'],
    ['My Weird School 疯狂学校', '疯狂学校'],
    ['Geronimo Stilton 老鼠记者', '老鼠记者'],
    ['学乐', '学乐（未注明套系）'],
    ['海尼曼', '海尼曼GK'],
    ['大马泽', '大马泽（Big muzzy）']
  ];
  var LEGACY_QING_SERIES = ['胖龙蓝蓝', '青蛙蟾蜍', '女巫温妮', 'Little Fox'];

  function array(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }
  function unique(values) { return Array.from(new Set(values.filter(function (v) { return v !== '' && v != null; }))); }
  function text(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join('；');
    if (typeof value === 'object') {
      if (value.text != null) return text(value.text);
      if (value.original != null) return text(value.original);
      return Object.keys(value).map(function (key) { return key + '：' + text(value[key]); }).join('；');
    }
    return String(value);
  }
  function notes(value) {
    return array(value).map(function (item) {
      if (item && typeof item === 'object' && item.title) return item.title + '：' + text(item.text || item.description || item.note);
      return text(item);
    }).filter(Boolean);
  }
  function key(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s’'“”"·]+/g, ''); }
  function hash(value) {
    var result = 2166136261;
    for (var i = 0; i < value.length; i++) { result ^= value.charCodeAt(i); result = Math.imul(result, 16777619); }
    return (result >>> 0).toString(36);
  }
  var aliasMap = {};
  SERIES_ALIASES.forEach(function (group) { group.forEach(function (name) { aliasMap[key(name)] = group[0]; }); });
  function canonicalName(name) { return aliasMap[key(name)] || String(name || '未命名素材').trim(); }
  function mediaType(resource) {
    var candidate = resource.type || resource.category || resource.kind || '';
    return TYPE_NAMES[candidate] || TYPE_NAMES[String(candidate).toLowerCase()] || 'other';
  }
  function pagesOf(item) {
    return unique(array(item.pages).concat(array(item.page), array(item.sourcePage)).map(Number).filter(Number.isFinite));
  }
  function resourceTitle(resource) { return resource.series || resource.title || resource.name || resource.label || '未命名素材'; }
  function previewOf(item) { return item.preview || item.previewPath || (item.previews && item.previews[0] && (item.previews[0].path || item.previews[0].preview)) || ''; }
  function coverOf(item) {
    return item.cover || item.coverPath || (/^assets\/previews\/banana-cover-[^/]+\.(?:jpg|jpeg|png)$/i.test(previewOf(item)) ? previewOf(item) : null);
  }
  function hourLabel(stage) {
    if (stage.hours != null) return text(stage.hours);
    if (stage.hoursMin == null) return '';
    return stage.hoursMin + (stage.hoursMax != null && stage.hoursMax !== stage.hoursMin ? '–' + stage.hoursMax : '') + ' 小时';
  }

  function normalize(raw) {
    raw = raw || {};
    var resources = [], routes = [], stages = [], sources = [], relationships = [];
    var byIdentity = {}, byResource = {}, stageIndex = {}, rawToCanonical = {}, legacyResourceIds = {};

    function addResource(routeId, resource, sourceId, variantId) {
      sourceId = sourceId || resource.sourceId || routeId;
      variantId = variantId || resource.variantId || (routeId === 'xu' ? 'xu-listening' : routeId);
      var originalTitle = resourceTitle(resource);
      var title = canonicalName(originalTitle);
      var type = mediaType(resource);
      var identity = type + ':' + key(title);
      var target = byIdentity[identity];
      if (!target) {
        target = { id: 'resource-' + hash(identity), title: title, type: type, levels: [], appearances: [],
          preview: previewOf(resource), cover: coverOf(resource),
          aliases: [], details: [], raw: [] };
        byIdentity[identity] = target;
        byResource[target.id] = target;
        resources.push(target);
      }
      // 已核实的庆爸别名归并后，迁移既有收藏/记录使用的旧实体 ID。
      if (routeId === 'qing' && LEGACY_QING_SERIES.indexOf(originalTitle) !== -1) {
        legacyResourceIds['resource-' + hash(type + ':' + key(originalTitle))] = target.id;
      }
      target.raw.push(Object.assign({}, resource, { sourceId: sourceId, variantId: variantId }));
      target.aliases = unique(target.aliases.concat(array(resource.aliases), [resource.title, resource.name, resource.label, resource.series]).filter(function (v) { return v && v !== target.title; }));
      target.levels = unique(target.levels.concat(array(resource.levels), array(resource.level)));
      if (!target.preview) target.preview = previewOf(resource);
      if (!target.cover) target.cover = coverOf(resource);
      rawToCanonical[sourceId + ':' + resource.id] = target.id;
      rawToCanonical[variantId + ':' + resource.id] = target.id;
      if (rawToCanonical[routeId + ':' + resource.id] == null) rawToCanonical[routeId + ':' + resource.id] = target.id;
      if (resource.id && rawToCanonical[resource.id] == null) rawToCanonical[resource.id] = target.id;

      var labels = { title: '原文名称', name: '原文名称', label: '原文标注', description: '说明', notes: '资料备注', level: '原文级别', levels: '完整级别', category: '资料类别', type: '资料类别', series: '套系', role: '原文角色', books: '书目', contents: '内容', count: '数量', publisher: '引进版本/出版方', audio: '音频与点读', ar: '原文 AR', lexile: '原文 Lexile', mappings: '原文难度参考', suggestedAge: '补充图建议年龄', sourceStatus: '来源说明' };
      Object.keys(resource).forEach(function (field) {
        if (!labels[field] || resource[field] == null || resource[field] === '') return;
        var detailText = text(resource[field]);
        if (detailText) target.details.push({ label: labels[field], text: detailText, page: pagesOf(resource)[0] || null, routeId: routeId, sourceId: sourceId, variantId: variantId });
      });
      array(resource.details).forEach(function (detail) {
        target.details.push({ label: detail.label || detail.title || '资料说明', text: text(detail.text || detail.description || detail), page: detail.page || pagesOf(resource)[0] || null, routeId: routeId, sourceId: detail.sourceId || sourceId, variantId: variantId });
      });
      return target;
    }

    function canonicalId(routeId, rawId, sourceId) { return sourceId && rawToCanonical[sourceId + ':' + rawId] || rawToCanonical[routeId + ':' + rawId] || rawToCanonical[rawId]; }
    function appendMaterial(stage, rawResource, material) {
      material = material || {};
      var sourceId = material.sourceId || stage.sourceId;
      var resourceId = canonicalId(stage.routeId, material.resourceId || (rawResource && rawResource.id), sourceId);
      if (!resourceId) return;
      var page = material.page || material.sourcePage || (rawResource && pagesOf(rawResource)[0]) || stage.pages[0] || null;
      var level = Object.prototype.hasOwnProperty.call(material, 'level') ? text(material.level) : rawResource ? text(rawResource.level != null ? rawResource.level : rawResource.levels) : '';
      var role = material.role || (rawResource && rawResource.role) || '素材';
      var original = material.original || material.label || (rawResource && (rawResource.label || rawResource.title || rawResource.name)) || byResource[resourceId].title;
      var item = { resourceId: resourceId, level: level, role: role, page: page, original: original, sourceId: sourceId, variantId: stage.variantId };
      if (material.roleEvidence) item.roleEvidence = material.roleEvidence;
      // 同一素材在同一阶段的不同级别/角色都保留，重复的引用只展示一次。
      var signature = [resourceId, level, role, page, original, sourceId].join('|');
      if (stage.materials.some(function (entry) { return [entry.resourceId, entry.level, entry.role, entry.page, entry.original, entry.sourceId].join('|') === signature; })) return;
      stage.materials.push(item);
      var appearance = { routeId: stage.routeId, stageId: stage.id, level: level, role: role, page: page, original: original, sourceId: sourceId, variantId: stage.variantId,
        preview: material.preview || (rawResource && previewOf(rawResource)) || stage.preview };
      if (material.roleEvidence) appearance.roleEvidence = material.roleEvidence;
      byResource[resourceId].appearances.push(appearance);
      byResource[resourceId].levels = unique(byResource[resourceId].levels.concat(level));
    }

    function addSource(data, sourceId, fallbackTitle) {
      var source = data.source || data;
      var previews = array(source.previews || data.sourcePages || data.previews).map(function (p, i) {
        return typeof p === 'string' ? { page: i + 1, path: p, note: '' } : { page: p.page || i + 1, path: p.path || p.preview || '', note: p.note || '' };
      });
      if (!sources.some(function (entry) { return entry.id === sourceId; })) {
        sources.push({ id: sourceId, title: data.title || data.label || fallbackTitle, file: source.file || data.sourceFile || '', previews: previews,
          note: data.scope || text(source.note) || (sourceId === 'xu' ? '第 1 页为完整路线，第 2 页没有路线内容。' : ''), raw: source });
      }
    }

    function addVersion(route, data, variantId, sourceId, label) {
      var routeId = route.id;
      var variant = { id: variantId, label: label, sourceId: sourceId, description: data.description || data.summary || '',
        scope: data.scope || '', notes: notes(data.notes).concat(notes(data.uncertainties)), stages: [] };
      array(data.resources).forEach(function (resource) { addResource(routeId, resource, sourceId, variantId); });
      array(data.stages).forEach(function (original, index) {
        var stage = { id: original.id || variantId + '-' + (index + 1), routeId: routeId, order: index + 1,
          sourceId: sourceId, variantId: variantId, variantLabel: label,
          title: original.displayTitle || original.title || original.name || original.label || '阶段 ' + (index + 1),
          shortTitle: original.shortTitle || '', group: original.group || '', domain: original.domain || '', duration: text(original.duration),
          goal: text(original.goal || original.objective || original.target || original.vocabulary),
          entry: text(original.entry || original.entryCriteria || original.prerequisite),
          exit: text(original.exit || original.exitCriteria || original.advanceCriteria),
          hours: hourLabel(original),
          ageLabel: original.ageLabel || text(original.ageRange) || (original.ageMin != null ? original.ageMin + (original.ageMax !== original.ageMin ? '–' + original.ageMax : '') + ' 岁（原文整条路线适用年龄）' : original.schedules ? unique(original.schedules.map(function (s) { return s.ageGroup; })).join(' / ') : ''),
          pages: pagesOf(original), preview: previewOf(original), materials: [], notes: notes(original.notes),
          schedules: array(original.schedules || original.schedule || original.dailyPlan),
          activities: array(original.activities).map(function (activity) {
            return Object.assign({}, activity, { sourceId: sourceId, variantId: variantId,
              resourceIds: unique(array(activity.materials).map(function (item) { return canonicalId(routeId, typeof item === 'string' ? item : item.resourceId || item.id, sourceId); })) });
          }), raw: Object.assign({}, original, { sourceId: sourceId, variantId: variantId }) };
        if (!stage.goal && original.vocabularyMin != null) stage.goal = '积累 ' + original.vocabularyMin + (original.vocabularyMax != null ? '–' + original.vocabularyMax : '') + ' 听力词汇';
        if (routeId === 'xu' && variantId === 'xu-listening' && !stage.entry) stage.entry = '原文未列硬性准入；词数来自“目的”栏';
        if (routeId === 'banana' && !stage.entry) stage.entry = '原文未给听力词汇量门槛；按理解和实际读书状态调整';
        if (!stage.preview && data.source && Array.isArray(data.source.previews)) {
          var sourcePreview = data.source.previews.find(function (p) { return p && p.page === stage.pages[0]; }) || data.source.previews[stage.pages[0] - 1];
          stage.preview = typeof sourcePreview === 'string' ? sourcePreview : sourcePreview && (sourcePreview.path || sourcePreview.preview) || '';
        }
        variant.stages.push(stage); stages.push(stage); stageIndex[stage.id] = stage;
      });
      var rawResources = {};
      array(data.resources).forEach(function (resource) { rawResources[resource.id] = resource; });
      variant.stages.forEach(function (stage) {
        var original = stage.raw;
        array(original.materials).concat(array(original.animations), array(original.resources)).forEach(function (item) {
          if (typeof item === 'string') appendMaterial(stage, rawResources[item], { resourceId: item });
          else appendMaterial(stage, rawResources[item.resourceId || item.id], item);
        });
      });
      array(data.resources).forEach(function (resource) {
        var appearances = array(resource.appearances);
        if (appearances.length) appearances.forEach(function (appearance) {
          var stage = stageIndex[appearance.stageId];
          if (stage && stage.variantId === variantId) appendMaterial(stage, resource, Object.assign({ resourceId: resource.id }, appearance));
        });
        else unique(array(resource.stageIds).concat(array(resource.stageId))).forEach(function (stageId) {
          var stage = stageIndex[stageId];
          if (stage && stage.variantId === variantId) appendMaterial(stage, resource, { resourceId: resource.id });
        });
      });
      addSource(data, sourceId, ROUTES[routeId].name + '路线');
      array(data.source && data.source.extraSources).concat(array(data.relatedSources), array(data.sources)).forEach(function (related) {
        if (related && related.id) addSource(related, related.id, related.title || label + '补充来源');
      });
      array(data.relationships || data.relations || data.edges).forEach(function (edge) {
        var from = canonicalId(routeId, edge.from || edge.source, sourceId), to = canonicalId(routeId, edge.to || edge.target, sourceId);
        if (from && from === to) byResource[from].details.push({ label: '同套系版本关系', text: edge.label || '原文关联', routeId: routeId, page: pagesOf(edge)[0] || null, sourceId: sourceId, variantId: variantId });
        if (from && to && from !== to) relationships.push({ from: from, to: to,
          type: edge.type === 'sequence' || edge.type === 'sequential' || edge.type === 'next-stage' ? 'sequence' : edge.type === 'pair' || edge.type === 'parallel' ? 'pair' : 'reference',
          label: edge.label || '原文关联', routeId: routeId, page: pagesOf(edge)[0] || null, sourceId: sourceId, variantId: variantId });
      });
      return variant;
    }

    ['banana', 'xu', 'qing'].forEach(function (routeId) {
      var data = raw[routeId];
      if (!data) return;
      var route = { id: routeId, name: ROUTES[routeId].name, color: ROUTES[routeId].color,
        summary: data.description || data.summary || data.scope || data.title || '',
        ageCases: array(data.ageCases),
        notes: notes(data.notes).concat(notes(data.uncertainties)), stages: [] };
      if (!route.ageCases.length && data.ageRange && data.ageRange.unit === '岁') {
        route.ageCases = [{ id: routeId + '-age', label: data.ageRange.min + '–' + data.ageRange.max + '岁原文方案',
          ageMinMonths: data.ageRange.min * 12, ageMaxMonthsExclusive: (data.ageRange.max + 1) * 12, sourcePage: 1 }];
      }
      var mainVariant = addVersion(route, data, routeId === 'xu' ? 'xu-listening' : routeId, routeId,
        routeId === 'xu' ? '六阶段组合表' : ROUTES[routeId].name + '路线');
      route.stages = mainVariant.stages;
      if (routeId === 'xu') {
        route.variants = [mainVariant];
        array(raw.xuSupplements).forEach(function (supplement) {
          route.variants.push(addVersion(route, supplement, supplement.id, supplement.id, supplement.label || supplement.title || supplement.id));
        });
        if (raw.xuCurrent && route.variants.some(function (variant) { return variant.id === 'xu-panorama'; })) {
          var current = addVersion(route, raw.xuCurrent, 'xu-current', 'xu-panorama', raw.xuCurrent.label);
          route.variants.unshift(current);
          route.defaultVariantId = current.id;
          route.stages = current.stages;
          route.summary = current.description;
        }
      }
      routes.push(route);
    });

    function link(fromRaw, toRaw, type, label, routeId, page) {
      var from = canonicalId(routeId, fromRaw), to = canonicalId(routeId, toRaw);
      if (from && to && from !== to) relationships.push({ from: from, to: to, type: type, label: label, routeId: routeId, page: page, sourceId: routeId, variantId: routeId === 'xu' ? 'xu-listening' : routeId });
    }
    stages.forEach(function (stage) {
      var readings = stage.materials.filter(function (m) { return ['book', 'reader', 'flashcard'].indexOf(byResource[m.resourceId].type) !== -1; });
      var listening = stage.materials.filter(function (m) { return ['animation', 'song'].indexOf(byResource[m.resourceId].type) !== -1; });
      readings.forEach(function (reading) { listening.forEach(function (audio) {
        relationships.push({ from: reading.resourceId, to: audio.resourceId, type: 'pair',
          label: stage.title + '：同阶段读物与动画/儿歌组合（非逐本逐集对应）', routeId: stage.routeId,
          stageId: stage.id, page: audio.page || reading.page || stage.pages[0] || null, sourceId: stage.sourceId, variantId: stage.variantId });
      }); });
    });
    // 许密杉原表合并栏明确的“主线 + 平行拓展”，不画成难度等值。
    if (raw.xu) array(raw.xu.stages).forEach(function (stage) {
      var main = array(stage.materials).find(function (m) { return m.role === 'main'; });
      if (main) array(stage.materials).filter(function (m) { return m.role === 'parallel'; }).forEach(function (m) {
        link(main.resourceId, m.resourceId, 'pair', stage.title + '：主线与辅线（非等值）', 'xu', m.page || stage.page);
      });
    });
    var genericHeinemann = resources.find(function (r) { return r.title === '海尼曼'; });
    var gk70 = resources.find(function (r) { return r.title === '海尼曼 GK70'; });
    if (genericHeinemann && gk70) relationships.push({ from: genericHeinemann.id, to: gk70.id, type: 'reference', label: '同品牌不同分套与标级；GK70 A/B/C 不与 GK1/G1 直接换算', routeId: 'xu', page: 1, sourceId: 'xu', variantId: 'xu-listening' });
    var littleFox = resources.find(function (r) { return r.title === '小狐狸动画' && r.type === 'animation'; });
    if (littleFox) littleFox.details.push({ label: '关联边界', text: '小狐狸动画 / Little Fox 为同平台的分级动画集合；各路线选材、片单与集数分别保留，不能由同级推定指定片单相同。', routeId: '', page: null, sourceId: '', variantId: '' });
    if (raw.qing) {
      var qingByName = {};
      array(raw.qing.resources).forEach(function (r) { if (!qingByName[r.series]) qingByName[r.series] = r.id; });
      if (qingByName['牛津树'] && qingByName['培生启明星']) link(qingByName['牛津树'], qingByName['培生启明星'], 'pair', '原文建议搭配主线；每阶段具体级别分别保留', 'qing', 4);
      if (qingByName['古力小超人'] && qingByName['QPlay奇问妙想国']) link(qingByName['古力小超人'], qingByName['QPlay奇问妙想国'], 'sequence', '原文建议喜欢古力 1 后可接古力 2 与 QPlay', 'qing', 3);
    }

    var ageComparisonRaw = raw.banana && (raw.banana.ageComparison || raw.banana.ageMap || raw.banana.ageOverview) || null;
    var ageComparison = ageComparisonRaw && Object.assign({}, ageComparisonRaw, { rows: array(ageComparisonRaw.rows).map(function (row, i) {
      var resource = addResource('age', Object.assign({ id: 'age-row-' + i, category: '分级', page: 1 }, row));
      return Object.assign({}, row, { resourceIds: [resource.id] });
    }) });
    var readingComparison = raw.qing && raw.qing.supplement || null;
    if (ageComparison) sources.push({ id: 'age', title: ageComparison.title || '书籍年龄路线概览', file: ageComparison.sourceFile || ageComparison.file || ageComparison.source && ageComparison.source.file || '',
      previews: ageComparison.previews || [{ page: 1, path: ageComparison.preview || ageComparison.source && ageComparison.source.preview || '', note: '' }], note: ageComparison.attribution || text(ageComparison.notes || ageComparison.cautions), raw: ageComparisonRaw });
    if (readingComparison) sources.push({ id: 'reading', title: readingComparison.title || '阅读难度对照', file: readingComparison.sourceFile || '',
      previews: [{ page: 1, path: readingComparison.preview || '', note: '' }], note: readingComparison.attribution || '', raw: readingComparison });

    // 拼写接近而未能确认的实体保持独立，同时留下可见提示。
    var uncertainPairs = [['动物王国大冒险', '动物国王大冒险'], ['大马泽', 'Muzzy'], ['书虫', '小书虫'], ['牛津自然拼读', '牛津自拼']];
    uncertainPairs.forEach(function (pair) {
      var found = resources.filter(function (r) { return pair.some(function (name) { return key(r.title) === key(name); }); });
      if (found.length > 1) found.forEach(function (r) { r.details.push({ label: '关联边界', text: pair.join(' / ') + (pair[0] === '牛津自然拼读' ? ' 在两份来源中仅有中文名称或简称，未注明英文名与版本，尚无法确认同一套教材；保留独立条目。' : ' 在来源中名称或套系不同，保留独立条目，不自动判为同一素材。'), routeId: '', page: null, sourceId: '', variantId: '' }); });
    });
    resources.forEach(function (resource) {
      var publication = array(raw.resourceVolumes && raw.resourceVolumes.series).find(function (entry) { return entry.resourceId === resource.id; });
      if (publication) {
        // 展示名称在稳定身份生成后补充，保留原图简称及已有个人记录键。
        resource.aliases = unique(resource.aliases.concat(array(publication.aliases), publication.displayTitle ? [resource.title] : []));
        if (publication.displayTitle) resource.title = publication.displayTitle;
      }
      resource.referencePrices = array(raw.resourcePrices && raw.resourcePrices.quotes).filter(function (quote) { return quote.resourceId === resource.id; });
      var image = raw.resourceCovers && raw.resourceCovers[resource.id];
      if (!resource.cover && image) {
        resource.cover = image.path;
        resource.coverSource = image;
      }
      resource.details = resource.details.filter(function (entry, i, list) { return list.findIndex(function (other) { return other.label === entry.label && other.text === entry.text && other.routeId === entry.routeId && other.page === entry.page && other.sourceId === entry.sourceId && other.variantId === entry.variantId; }) === i; });
    });
    relationships = relationships.filter(function (entry, i, list) { return list.findIndex(function (other) { return other.from === entry.from && other.to === entry.to && other.label === entry.label && other.routeId === entry.routeId && other.sourceId === entry.sourceId && other.variantId === entry.variantId; }) === i; });
    if (raw.sssSongs && raw.sssSongs.source) sources.push(raw.sssSongs.source);
    if (raw.resourcePrices && raw.resourcePrices.source) addSource(raw.resourcePrices.source, raw.resourcePrices.source.id, '历史好价参考');
    return { routes: routes, stages: stages, resources: resources, sources: sources, relationships: relationships,
      ageComparison: ageComparison, readingComparison: readingComparison, rawToCanonical: rawToCanonical, legacyResourceIds: legacyResourceIds, raw: raw };
  }

  function dateParts(value, label) {
    if (value == null) value = new Date();
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw new RangeError(label + '无效');
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
      var fields = {}; parts.forEach(function (part) { fields[part.type] = part.value; });
      return [Number(fields.year), Number(fields.month), Number(fields.day)];
    }
    var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new RangeError(label + '须使用 YYYY-MM-DD');
    var y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
    var checked = new Date(Date.UTC(y, m - 1, d));
    if (checked.getUTCFullYear() !== y || checked.getUTCMonth() !== m - 1 || checked.getUTCDate() !== d) throw new RangeError(label + '无效');
    return [y, m, d];
  }
  function monthAnniversary(birth, totalMonths) {
    var monthStart = new Date(Date.UTC(birth[0], birth[1] - 1 + totalMonths, 1));
    var lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
    return Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(birth[2], lastDay));
  }
  function getAge(birthDate, asOf) {
    var birth = dateParts(birthDate, '出生日期'), current = dateParts(asOf, '参考日期');
    var currentTime = Date.UTC(current[0], current[1] - 1, current[2]);
    if (currentTime < Date.UTC(birth[0], birth[1] - 1, birth[2])) throw new RangeError('参考日期早于出生日期');
    var totalMonths = (current[0] - birth[0]) * 12 + current[1] - birth[1];
    if (monthAnniversary(birth, totalMonths) > currentTime) totalMonths--;
    var years = Math.floor(totalMonths / 12), months = totalMonths % 12;
    var days = Math.round((currentTime - monthAnniversary(birth, totalMonths)) / 86400000);
    return { years: years, months: months, days: days, totalMonths: totalMonths,
      label: (years ? years + ' 岁 ' : '') + months + ' 个月 ' + days + ' 天' };
  }

  function vocabularyFloor(stage) {
    var raw = stage.raw || {}, vocabulary = raw.vocabulary || {};
    if (raw.vocabularyBrowseMin != null) return Number(raw.vocabularyBrowseMin);
    if (raw.vocabularyMin != null) return Number(raw.vocabularyMin);
    return Number(vocabulary.min != null ? vocabulary.min : vocabulary.value != null ? vocabulary.value : vocabulary.approx != null ? vocabulary.approx : 0);
  }
  function recommend(profile, catalog) {
    profile = profile || {};
    var words = Number(profile.listeningWords != null ? profile.listeningWords : profile.vocabulary != null ? profile.vocabulary : profile.vocab != null ? profile.vocab : profile.words || 0);
    if (!Number.isFinite(words) || words < 0) words = 0;
    var birth = profile.birthDate || profile.birthday || profile.dob;
    var age = birth ? getAge(birth, profile.asOf) : null;
    var underThree = !!age && age.totalMonths < 36;
    var hasCurrent = array(catalog.routes).some(function (route) { return route.id === 'xu' && route.defaultVariantId === 'xu-current'; });
    var start = words < (hasCurrent ? 300 : 200), routeStages = {}, selected = [];
    array(catalog.routes).forEach(function (route) {
      var mainVariant = route.id === 'xu' && array(route.variants).find(function (variant) { return variant.id === (route.defaultVariantId || 'xu-listening'); });
      var recommendationStages = mainVariant ? mainVariant.stages : route.stages;
      var candidate = recommendationStages[0];
      if (!start) recommendationStages.forEach(function (stage) { if (vocabularyFloor(stage) > 0 && vocabularyFloor(stage) <= words) candidate = stage; });
      if (candidate) { routeStages[route.id] = candidate.id; selected.push(candidate); }
    });
    var resourceMap = {}; array(catalog.resources).forEach(function (r) { resourceMap[r.id] = r; });
    var suggested = [];
    selected.filter(function (stage) { return !(underThree && stage.routeId === 'qing'); }).sort(function (a, b) { return (a.routeId === 'xu' ? 0 : 1) - (b.routeId === 'xu' ? 0 : 1); }).forEach(function (stage) {
      stage.materials.forEach(function (material) {
        var resource = resourceMap[material.resourceId];
        if (resource && (!underThree || resource.type !== 'animation' && resource.type !== 'other')) suggested.push(resource.id);
      });
    });
    suggested = unique(suggested);
    if (start) suggested.sort(function (a, b) {
      var priority = { song: 0, flashcard: 1, book: 2, reader: 3, animation: 4, other: 5 };
      return priority[resourceMap[a].type] - priority[resourceMap[b].type];
    });
    return { routeStages: routeStages, reason: start
      ? '目前约 ' + words + ' 个听力词汇，先浏览名词、动作与生活短句的起点：香蕉妈妈起步段、许密杉0–300词起步节点、庆爸常规 1。各路线词数属于积累目标，不能当作入门门槛。'
      : '按约 ' + words + ' 个听力词汇提供浏览候选；词数属于阶段目标，不能据此判断已晋级，仍需核验实际理解、兴趣与原文准入条件。',
      underThree: underThree, level: start ? 'start' : 'browse', suggested: suggested.slice(0, 10),
      next: (hasCurrent && start ? '闪卡与闪卡式绘本属于同一阶段，可并行使用；300词是起步积累目标。' : '') + (underThree ? '庆爸原文面向 3–4 岁，当前仅供对照。' : '') + '先选孩子能理解且愿意重复的同级材料；升档前核验实际理解。庆爸还需核验投入时间与测试 Phase，成长计划 Phase 不能替代测试。',
      age: age, vocabulary: words, automaticPromotion: false };
  }

  function chineseNumber(value) {
    var digits = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    if (value.indexOf('十') !== -1) {
      var parts = value.split('十');
      return (parts[0] ? digits[parts[0]] : 1) * 10 + (parts[1] ? digits[parts[1]] : 0);
    }
    return value.split('').map(function (digit) { return digits[digit]; }).join('');
  }

  // 只在同一规范套系内比较级别；保留季、分册、GK/G1 等标尺及选材限定。
  function levelParts(value, resource) {
    var original = text(value).trim();
    var normalized = original.normalize('NFKC').replace(/[–—−~～至到]/g, '-')
      .replace(/[零一二两三四五六七八九十]+/g, chineseNumber).trim();
    if (!normalized || /未标|未注明|未知|不详|待核|未确定|未说明/.test(normalized)) return null;
    var qualifiers = [], quantities = [];
    // 仅此已确认平台按明确的 L2 / 二级别 / 第三级别动画前缀取级别；选片数量和片名保留为限定。
    if (resource && resource.title === '小狐狸动画') {
      var foxLevel = normalized.match(/^(?:L(\d+)|第?(\d+)级(?:别)?)(?:动画)?\s*(?=$|[·:：（(])/);
      if (foxLevel) {
        var foxSelection = normalized.slice(foxLevel[0].length).replace(/^[·:：]\s*/, '');
        if (foxSelection) qualifiers.push(foxSelection);
        normalized = foxLevel[1] || foxLevel[2];
      }
    }
    normalized = normalized.replace(/[（(]([^）)]*)[）)]/g, function (_, label) { qualifiers.push(label); return ''; });
    // 先保留“AA90、A90、B92册”等完整明细，不能抽走数字后打散级别与数量的对应。
    normalized = normalized.replace(/[：:](.*)$/, function (_, note) { qualifiers.push(note); return ''; });
    // 第几册是分册编号；“24本”“1级22+22册”中的数量不能参与级别比较。
    normalized = normalized.replace(/第\s*(\d+(?:[-、&/]\d+)*)\s*(?:册|本)/g, 'VOLUME$1')
      .replace(/(\d+(?:\+\d+)*)\s*(?:册|本)/g, function (_, count) { quantities.push(count + '册'); return ''; });
    normalized = normalized.replace(/\s+/g, '');
    var hierarchy = normalized.match(/^第?(\d+)级(?:别)?(?:·VOLUME)?(\d+(?:[-&/、,]\d+)*)$/);
    var inheritedScale = '';
    if (hierarchy && /^[\d&/、,-]/.test(hierarchy[2])) {
      inheritedScale = 'TIER' + hierarchy[1] + '-VOLUME';
      normalized = hierarchy[2];
    }
    normalized = normalized.replace(/^(.+版)(?=L\d)/i, function (_, version) { qualifiers.push(version); return ''; }).toUpperCase()
      .replace(/第/g, '').replace(/级别|级/g, '').replace(/^LEVEL(?=[\dA-Z])/, '')
      .replace(/LEVEL(?=\d)/g, '').replace(/[、,，;；·和及]/g, '&').replace(/\//g, '&')
      // 两个编号之间的 + 表示并列，编号末尾的 +（如牛津树1+）仍是独立级别。
      .replace(/([\dA-Z])\+(?=(?:L|S|SET|PART|PHASE)?[\dA-Z])/g, '$1&')
      .replace(/(\d+(?:[-&]\d+)*)季/g, 'S$1').replace(/(\d+(?:[-&]\d+)*)集/g, 'EPISODE$1');
    if (resource && resource.title === '红火箭') normalized = normalized.replace(/\+(?=流畅|[紫粉玫红黄蓝绿大])/g, '&');
    var tokens = [], inheritedPrefix = inheritedScale;
    function addToken(scale, grade, plus) {
      tokens.push({ scale: scale, grade: grade, plus: !!plus, id: scale + ':' + grade + (plus ? '+' : '') });
    }
    function atom(part) {
      var match = part.match(/^(GK70)([A-Z])([+]?)$/);
      if (match) return { scale: match[1], grade: match[2], plus: !!match[3], alphabet: true };
      match = part.match(/^(G\d)-(\d+)([+]?)$/);
      if (match) return { scale: match[1], grade: Number(match[2]), plus: !!match[3], alphabet: false };
      match = part.match(/^(GK|G\d|S|L|SET|PART|PHASE|COLLECTION|VOLUME|EPISODE|流畅)?(\d+)([+]?)$/);
      if (match) return { scale: match[1] === 'L' ? '' : match[1] || inheritedPrefix, grade: Number(match[2]), plus: !!match[3], alphabet: false };
      match = part.match(/^(SET)?([A-Z]{1,2})([+]?)$/);
      if (match) return { scale: match[1] || inheritedPrefix || (resource && /GK70/i.test(resource.title) ? 'GK70' : ''), grade: match[2], plus: !!match[3], alphabet: true };
      return null;
    }
    normalized.split('&').filter(Boolean).forEach(function (part) {
      if (resource && resource.title === '红火箭' && /^(?:紫|粉|玫红|玫粉|红|黄|蓝|绿|大红)色?$/.test(part)) {
        addToken('COLOR', part.replace(/色$/, ''), false); return;
      }
      var named = part.match(/^(预备|基础|进阶|提高)$/);
      if (named) { addToken('NAMED', named[1], false); return; }
      // G1-2 是 G1 分套的第 2 级，不能当作普通的 1–2。
      var whole = /^G\d-\d+[+]?$/.test(part) ? atom(part) : null;
      if (whole) { addToken(whole.scale, whole.grade, whole.plus); inheritedPrefix = whole.scale; return; }
      var range = part.match(/^(.*?)-(.*)$/);
      var start = range && atom(range[1]);
      var end;
      if (start) {
        var previousPrefix = inheritedPrefix;
        inheritedPrefix = start.scale;
        end = atom(range[2]);
        inheritedPrefix = previousPrefix;
      }
      if (start && end && start.scale === end.scale && start.alphabet === end.alphabet && !start.plus && !end.plus) {
        if (!start.alphabet && start.grade <= end.grade && end.grade - start.grade <= 100) {
          for (var number = start.grade; number <= end.grade; number++) addToken(start.scale, number, false);
        } else if (start.alphabet && start.grade.length === 1 && end.grade.length === 1 && start.grade <= end.grade) {
          for (var code = start.grade.charCodeAt(0); code <= end.grade.charCodeAt(0); code++) addToken(start.scale, String.fromCharCode(code), false);
        } else {
          // AA–A 是来源中的范围端点，不推测它采用的字母排序规则。
          addToken(start.scale, start.grade, false); addToken(end.scale, end.grade, false);
        }
        inheritedPrefix = start.scale;
        return;
      }
      var parsed = atom(part);
      if (parsed) { addToken(parsed.scale, parsed.grade, parsed.plus); inheritedPrefix = parsed.scale; }
      else qualifiers.push(part);
    });
    var qualifier = qualifiers.join('；');
    return { tokens: tokens.filter(function (token, index, list) { return list.findIndex(function (other) { return other.id === token.id; }) === index; }),
      qualifier: qualifier, quantities: quantities, normalized: normalized, fiction: /非虚构/.test(qualifier) ? 'nonfiction' : /虚构/.test(qualifier) ? 'fiction' : '' };
  }

  function formatLevelTokens(tokens, expandRanges) {
    var groups = [];
    tokens.forEach(function (token) {
      var group = groups.find(function (item) { return item.scale === token.scale; });
      if (!group) { group = { scale: token.scale, tokens: [] }; groups.push(group); }
      group.tokens.push(token);
    });
    return groups.map(function (group) {
      var values = group.tokens, labels = [];
      for (var i = 0; i < values.length; i++) {
        var end = i;
        while (end + 1 < values.length && !values[end].plus && !values[end + 1].plus &&
          (typeof values[end].grade === 'number' && values[end + 1].grade === values[end].grade + 1 ||
           typeof values[end].grade === 'string' && values[end].grade.length === 1 && typeof values[end + 1].grade === 'string' && values[end + 1].grade.length === 1 && values[end + 1].grade.charCodeAt(0) === values[end].grade.charCodeAt(0) + 1)) end++;
        if (!expandRanges && end - i >= 2) { labels.push(values[i].grade + '–' + values[end].grade); i = end; }
        else labels.push(values[i].grade + (values[i].plus ? '+' : ''));
      }
      var label = labels.join('、'), scale = group.scale;
      if (scale === 'NAMED') return labels.map(function (name) { return name + '级'; }).join('、');
      if (scale === 'COLOR') return labels.map(function (name) { return name + '色'; }).join('、');
      if (scale === '流畅') return '流畅' + label;
      if (scale === 'S') return '第' + label + '季';
      if (scale === 'EPISODE') return '第' + label + '集';
      if (scale === 'VOLUME') return '第' + label + '册';
      if (/^TIER\d+-VOLUME$/.test(scale)) return scale.match(/\d+/)[0] + '级 · 第' + label + '册';
      if (/^(SET|PART|PHASE|COLLECTION)$/.test(scale)) return { SET: 'Set', PART: 'Part', PHASE: 'Phase', COLLECTION: 'Collection' }[scale] + ' ' + label;
      if (/^G\d$/.test(scale)) return labels.map(function (part) { return scale + '-' + part; }).join('、');
      return scale ? scale + ' ' + label : label;
    }).join('；');
  }

  // 展示统一写法，来源原文、稳定 ID 与个人记录不改写。
  function formatLevel(value, resource) {
    var parts = levelParts(value, resource);
    if (!parts) return '';
    if (!parts.tokens.length) return text(value).replace(/[零一二两三四五六七八九十]+(?=\s*(?:册|本|词))/g, chineseNumber).replace(/(\d+)\s*本/g, '$1册').replace(/[&／/]/g, '、').trim();
    return [formatLevelTokens(parts.tokens), parts.quantities.join('；'), parts.qualifier.replace(/(\d+)本/g, '$1册')].filter(Boolean).join(' · ');
  }

  // 汇总先展开成单级再去重，范围和单级不能作为两份互相独立的级别。
  function getLevelSummary(levels, resource) {
    var groups = [], separate = [];
    array(levels).forEach(function (level) {
      var parts = levelParts(level, resource);
      if (!parts || !parts.tokens.length || parts.quantities.length) {
        var label = formatLevel(level, resource);
        if (label && separate.indexOf(label) === -1) separate.push(label);
        return;
      }
      parts.tokens.forEach(function (token) {
        var group = groups.find(function (candidate) { return candidate.scale === token.scale && candidate.qualifier === parts.qualifier; });
        if (!group) { group = { scale: token.scale, qualifier: parts.qualifier, tokens: [] }; groups.push(group); }
        if (!group.tokens.some(function (candidate) { return candidate.id === token.id; })) group.tokens.push(token);
      });
    });
    return groups.map(function (group) {
      // 数字级别自然排序；未确认顺序的命名及多字母标尺保留来源顺序。
      if (group.tokens.every(function (token) { return typeof token.grade === 'number'; })) group.tokens.sort(function (a, b) { return a.grade - b.grade || Number(a.plus) - Number(b.plus); });
      return [formatLevelTokens(group.tokens, true), group.qualifier].filter(Boolean).join(' · ');
    }).concat(separate);
  }

  function materialTitle(resource, level) {
    var label = formatLevel(level, resource);
    // 套系名称已包含标尺时不重复展示，如“海尼曼 GK70 · A”。
    var scale = resource.title.match(/\b(GK70|GK|G\d)\s*$/i);
    if (scale) label = label.replace(new RegExp('^' + scale[1] + '\\s+'), '');
    return resource.title + (label ? ' · ' + label : '');
  }

  // 进度按原文级别独立记录；路线阅读标签仍合并，复用同一标尺解析。
  function getMaterialLevels(item) {
    var tokens = [], qualifier = null, supported = true;
    array(item.materials).forEach(function (material) {
      var parts = levelParts(material.level, item.resource);
      if (!parts || parts.quantities.length || qualifier !== null && qualifier !== parts.qualifier) { supported = false; return; }
      qualifier = parts.qualifier;
      parts.tokens.forEach(function (token) { if (!tokens.some(function (other) { return other.id === token.id; })) tokens.push(token); });
    });
    return supported ? tokens.map(function (token) { return { id: token.id, label: [formatLevelTokens([token]), qualifier].filter(Boolean).join(' · ') }; }) : [];
  }

  // 按实际级别拆分展示；不把同套系或其他阶段的用法当作当前交集。
  function levelSegments(level, peers, resource, options) {
    var own = levelParts(level, resource), common = new Set();
    array(peers).forEach(function (peer) {
      var relation = compareLevels({ level: level }, peer, resource), other = levelParts(peer.level, resource);
      if (['exact', 'overlap'].indexOf(relation.kind) === -1 || !own || !other) return;
      own.tokens.forEach(function (token) {
        if (other.tokens.some(function (candidate) { return candidate.id === token.id; })) common.add(token.id);
      });
    });
    return levelSegmentsFromParts(own, common, level, resource, options && options.expandRanges);
  }

  function levelSegmentsFromParts(own, common, level, resource, expandRanges) {
    if (!own || !own.tokens.length) return formatLevel(level, resource) ? [{ text: formatLevel(level, resource), shared: false }] : [];
    var groups = [];
    own.tokens.forEach(function (token) {
      var shared = common.has(token.id), last = groups[groups.length - 1];
      if (!last || last.shared !== shared || last.scale !== token.scale) groups.push({ tokens: [token], shared: shared, scale: token.scale });
      else last.tokens.push(token);
    });
    var parts = [];
    groups.forEach(function (group, index) {
      if (index) parts.push({ text: groups[index - 1].scale === group.scale ? '、' : '；', shared: false });
      parts.push({ text: formatLevelTokens(group.tokens, expandRanges), shared: group.shared });
    });
    var suffix = [own.quantities.join('；'), own.qualifier.replace(/(\d+)本/g, '$1册')].filter(Boolean).join(' · ');
    if (suffix) parts.push({ text: ' · ' + suffix, shared: false });
    return parts;
  }

  var MATERIAL_ROLES = { main: '主线', featured: '特色推荐', auxiliary: '辅线', reference: '未标主辅' };
  function materialUsageLabel(value, role) {
    // 原文证据保持原样；所有页面只在展示层统一同义用途。
    if (value === '平行拓展') return MATERIAL_ROLES.auxiliary;
    // 历史 parallel 也包含整理出的并行安排，未核定时不能据字段名补造辅线。
    if (value === 'parallel') return role && role.kind === 'auxiliary' ? MATERIAL_ROLES.auxiliary : '并行材料';
    return ({ main: '主线', core: '核心素材', 'animation-companion': '配套动画 / 儿歌',
      companion: '配套', optional: '可选素材', review: '复习材料', recommended: '推荐材料' })[value] || value || '原文材料';
  }
  function materialRole(stage, material, resource) {
    // 角色属于本路线、本版本、本阶段的这次引用；套系归并只共享身份。
    // 保留 material.role，个人进度键仍使用原始用途，不因展示纠正换键。
    var role = material.role || '', kind = 'reference', label = role || '阶段材料';
    var basis = '按本阶段原文用途展示，不据活动分支推定主辅线';
    var labels = { core: '阶段材料', main: '阶段材料', parallel: '并行材料',
      'animation-companion': '配套动画／儿歌', companion: '配套材料', optional: '可选材料',
      review: '复习材料', recommended: '推荐材料', '素材': '阶段材料' };
    label = labels[role] || label;
    if (stage.routeId === 'qing') {
      if (/^主线/.test(role)) { kind = 'main'; label = '主线'; basis = '本阶段原文明确列为' + role; }
      else if (role === '辅线') { kind = 'auxiliary'; label = '辅线'; basis = '本阶段原文明确列为辅线'; }
      else basis = '沿用本阶段原文“' + role + '”分组，不替换为主辅线';
    } else if (stage.routeId === 'xu') {
      // 旧六阶段表只有后四阶段明确主线和平行拓展；其余版本的同名字段是整理标签。
      if (stage.variantId === 'xu-listening' && ['xu-3', 'xu-4', 'xu-5', 'xu-6'].indexOf(stage.id) !== -1) {
        if (role === 'main') { kind = 'main'; label = '主线'; basis = '本阶段六阶段原表明确标注主线'; }
        else if (role === 'parallel') { kind = 'auxiliary'; label = '辅线'; basis = '本阶段六阶段原表标注平行拓展'; }
      }
      if (stage.variantId === 'xu-thousand' && role === 'recommended') {
        kind = 'featured'; label = '特色推荐'; basis = '本阶段执行表原文明确推荐';
      }
    } else if (stage.routeId === 'banana') {
      label = '阶段材料'; basis = '本阶段原书单未划分主辅线，分级与故事按原方案使用';
    } else if (/^主线/.test(role)) {
      kind = 'main'; label = '主线'; basis = '本阶段原文明确标注主线';
    } else if (/^辅线/.test(role)) {
      kind = 'auxiliary'; label = '辅线'; basis = '本阶段原文明确标注辅线';
    }
    var evidence = material.roleEvidence || null;
    if (evidence && evidence.status === 'confirmed') {
      kind = evidence.kind;
      label = evidence.usage || MATERIAL_ROLES[kind];
      basis = evidence.basis;
    } else if (evidence && evidence.status === 'unresolved') {
      kind = 'reference';
      label = evidence.usage || label;
      basis = '本次引用尚未核定主辅' + (evidence.basis ? '；' + evidence.basis : '，不代表作者整条路线没有划分');
    }
    var selectionText = text(material.original || material.level);
    var selectionMatch = selectionText.match(/任选(?:\d+(?:[–—-]\d+)?(?:部|套|本|辑))?|挑选|选\d+(?:[–—-]\d+)?(?:部|套|本|辑)|二选一/);
    var selection = selectionMatch ? { label: selectionMatch[0], basis: selectionText } :
      role === 'optional' ? { label: '可选', basis: '原引用明确标为optional' } : null;
    return { kind: kind, label: MATERIAL_ROLES[kind], usage: materialUsageLabel(label), basis: basis, selection: selection, evidence: evidence };
  }

  function getStageMaterials(catalog, stageId, comparisonStages) {
    var stage = typeof stageId === 'string' ? array(catalog.stages).find(function (item) { return item.id === stageId; }) : stageId;
    if (!stage) return [];
    var resources = {};
    array(catalog.resources).forEach(function (resource) { resources[resource.id] = resource; });
    var groups = [];
    array(stage.materials).forEach(function (material, index) {
      var resource = resources[material.resourceId], role = materialRole(stage, material, resource);
      var parts = levelParts(material.level, resource);
      // 只合并同用途、同标尺且限定一致的级别；数量保留在原引用，避免丢失逐级册数。
      var mergeable = parts && parts.tokens.length && !parts.quantities.length;
      var scales = mergeable ? unique(parts.tokens.map(function (token) { return token.scale; })).sort().join('|') : '';
      var group = mergeable && groups.find(function (item) {
        return item.mergeable && item.resource.id === resource.id && item.material.role === material.role &&
          item.role.kind === role.kind && item.parts.qualifier === parts.qualifier && item.scales === scales;
      });
      if (group) {
        group.materials.push(material);
        parts.tokens.forEach(function (token) { if (!group.parts.tokens.some(function (other) { return other.id === token.id; })) group.parts.tokens.push(token); });
      } else groups.push({ material: material, materials: [material], resource: resource, role: role, originalIndex: index,
        parts: parts, mergeable: mergeable, scales: scales });
    });
    return groups.map(function (group) {
      var resource = group.resource;
      var other = comparisonStages ? array(comparisonStages).filter(function (peer) { return peer.routeId !== stage.routeId; }).flatMap(function (peer) {
        return array(peer.materials).filter(function (item) { return item.resourceId === resource.id; });
      }) : array(resource.appearances).filter(function (appearance) { return appearance.routeId !== stage.routeId; });
      var common = new Set(), overlap = false;
      group.materials.forEach(function (material) {
        other.forEach(function (appearance) {
          if (['exact', 'overlap'].indexOf(compareLevels(material, appearance, resource).kind) === -1) return;
          overlap = true;
          var parts = levelParts(appearance.level, resource);
          if (parts) parts.tokens.forEach(function (token) { common.add(token.id); });
        });
      });
      return { material: group.material, materials: group.materials, resource: resource, role: group.role, shared: other.length > 0, overlap: overlap,
        levelSegments: levelSegmentsFromParts(group.parts, common, group.material.level, resource), originalIndex: group.originalIndex };
    }).sort(function (a, b) {
      var ranks = { main: 0, featured: 1, auxiliary: 2, reference: 3 };
      return ranks[a.role.kind] - ranks[b.role.kind] || Number(b.overlap) - Number(a.overlap) || Number(b.shared) - Number(a.shared) || a.originalIndex - b.originalIndex;
    });
  }

  function compareLevels(focus, target, resource) {
    var left = levelParts(focus.level, resource), right = levelParts(target.level, resource);
    if (!left || !right) return { kind: 'unspecified', label: '同套系，' + (!left && !right ? '双方' : !left ? '当前路线' : '对照路线') + '原文未标级，不能确认阶段对应' };
    if ((!left.tokens.length && left.quantities.length) || (!right.tokens.length && right.quantities.length)) return { kind: 'unspecified', label: '同套系，册数不作为级别对应依据' };
    if (left.fiction && right.fiction && left.fiction !== right.fiction) return { kind: 'different', label: '同套系，虚构与非虚构选材不同，不能确认内容重叠' };
    var common = left.tokens.filter(function (token) { return right.tokens.some(function (other) { return token.id === other.id; }); });
    var plusDifference = left.tokens.some(function (token) { return right.tokens.some(function (other) { return token.scale === other.scale && token.grade === other.grade && token.plus !== other.plus; }); });
    var selectionNote = resource && resource.title === '小狐狸动画' ? '；未确认指定片单相同' : '';
    var sameTokens = left.tokens.length && left.tokens.length === right.tokens.length && left.tokens.every(function (token) { return right.tokens.some(function (other) { return other.id === token.id; }); });
    var commonLevels = formatLevelTokens(common);
    var quantityDifference = left.quantities.length && right.quantities.length && left.quantities.join() !== right.quantities.join();
    if ((sameTokens || !left.tokens.length && !right.tokens.length && left.normalized === right.normalized) && left.qualifier === right.qualifier && !quantityDifference) {
      return { kind: 'exact', commonLevels: commonLevels, label: '同套系，级别相同' + (commonLevels ? '；共用：' + commonLevels : '') + selectionNote };
    }
    if (common.length) {
      return { kind: 'overlap', commonLevels: commonLevels, label: '同套系，共用：' + commonLevels + (plusDifference ? '；带 + 与不带 + 的级别不计入交集' : '') +
        (left.qualifier !== right.qualifier ? '；原文选材或版本限定不同' : '') + (quantityDifference ? '；原文册数不同' : '') + selectionNote };
    }
    if (plusDifference) return { kind: 'different', label: '同套系，带 + 与不带 + 的级别不同，未确认重叠' };
    return { kind: 'different', label: '同套系，原文级别或标尺不同，未确认重叠' };
  }

  // 仅用于跨路线目标参考；不作为准入、晋级或素材级别的判断依据。
  function listeningComparisonBand(stage, catalog) {
    var raw = stage.raw || {};
    if (stage.domain && stage.domain !== 'listening') return null;
    if (stage.routeId === 'qing' && raw.vocabularyMin != null && raw.vocabularyMax != null) {
      return { min: raw.vocabularyMin, max: raw.vocabularyMax, label: raw.vocabularyMin + '–' + raw.vocabularyMax + '词' };
    }
    if (stage.routeId !== 'xu' || stage.domain !== 'listening' || raw.listeningTargetWords == null) return null;
    var target = raw.listeningTargetWords, previous = 0;
    array(catalog.stages).forEach(function (other) {
      var words = (other.raw || {}).listeningTargetWords;
      if (other.variantId === stage.variantId && other.domain === 'listening' && words < target && words > previous) previous = words;
    });
    return { min: previous, max: target, label: previous + '–' + target + '词（节点间参考）' };
  }

  // 年龄只选择执行方案，不参与能力阶段判定。低于原表范围时明确为低龄参考。
  function getRouteAgeCase(catalog, routeId, profile) {
    var route = array(catalog.routes).find(function (item) { return item.id === routeId; });
    var cases = array(route && route.ageCases).slice().sort(function (a,b) { return a.ageMinMonths - b.ageMinMonths; });
    if (!cases.length) return { status: 'general', ageCase: null, cases: cases };
    var birth = profile && (profile.birthDate || profile.birthday || profile.dob);
    if (!birth) return { status: 'unknown', ageCase: null, cases: cases };
    var months = getAge(birth, profile.asOf).totalMonths;
    var matching = cases.filter(function (item) { return months >= item.ageMinMonths && (item.ageMaxMonthsExclusive == null || months < item.ageMaxMonthsExclusive); });
    if (matching.length === 1) return { status: 'matched', ageCase: matching[0], cases: cases };
    if (!matching.length && months < cases[0].ageMinMonths) return { status: 'below', ageCase: cases[0], cases: cases };
    return { status: 'outside', ageCase: null, cases: cases };
  }

  function getStageSchedules(catalog, stageId, profile) {
    var stage = typeof stageId === 'string' ? array(catalog.stages).find(function (item) { return item.id === stageId; }) : stageId;
    var context = getRouteAgeCase(catalog, stage && stage.routeId, profile);
    return Object.assign({}, context, { schedules: array(stage && stage.schedules).filter(function (schedule) {
      return context.status === 'general' ? !schedule.ageCaseId : !!context.ageCase && schedule.ageCaseId === context.ageCase.id;
    }) });
  }

  // 同一作者只有一条路线；领域组织是本站导航，原资料阶段与来源独立保留。
  function getRoutePlan(catalog, routeId, domainId, profile) {
    var config = ((catalog.raw || {}).routePlan || {}), domain = array(config.domains).find(function (item) { return item.id === domainId; });
    var plan = ((config.routes || {})[routeId] || {})[domainId];
    if (!domain || !plan) return null;
    var stageMap = {}; array(catalog.stages).forEach(function (stage) { stageMap[stage.id] = stage; });
    var supporting = array(plan.supportingStageIds).map(function (id) { return stageMap[id]; }).filter(Boolean);
    var context = profile ? getRouteAgeCase(catalog, routeId, profile) : null;
    if (context && context.status !== 'general') supporting = supporting.filter(function (stage) {
      return !stage.schedules.length || getStageSchedules(catalog, stage, profile).schedules.some(function (schedule) {
        return domainId === 'speaking' ? /跟读/.test(schedule.output || '') : domainId === 'reading' ? /自拼|自主阅读/.test(schedule.output || '') : true;
      });
    });
    var ageSummary = context && context.ageCase && (context.ageCase.domainSummaries || {})[domainId];
    if (ageSummary && context.status === 'below') ageSummary = ageSummary.replace(/^当前年龄方案：/, '原表低龄参考：');
    return Object.assign({}, plan, { domain: domain, summary: ageSummary || plan.summary,
      page: ageSummary ? context.ageCase.sourcePage : plan.page, ageCase: context,
      stages: array(plan.stageIds).map(function (id) { return stageMap[id]; }).filter(Boolean), supportingStages: supporting });
  }

  // 执行关系只读取本阶段活动、所选年龄方案和显式来源说明，不从词数推导其他能力准入。
  function getStageFlow(catalog, stageId, profile) {
    var stage = typeof stageId === 'string' ? array(catalog.stages).find(function (item) { return item.id === stageId; }) : stageId;
    if (!stage) return null;
    var plan = getRoutePlan(catalog, stage.routeId, 'listening', profile);
    if (!plan || !plan.stageIds.includes(stage.id)) return null;
    var config = plan.flow || {}, context = getStageSchedules(catalog, stage, profile);
    var parallel = array(config.parallel).map(function (item) { return Object.assign({ sourceId: plan.sourceId, page: plan.page }, item); });
    if (stage.activities.length > 1) parallel = parallel.concat(stage.activities.map(function (activity) {
      return { text: activity.title, resourceIds: activity.resourceIds, sourceId: activity.sourceId, page: stage.pages[0] || 1 };
    }));
    var later = [], index = plan.stages.findIndex(function (item) { return item.id === stage.id; });
    context.schedules.forEach(function (schedule) {
      ['audio', 'parallel'].forEach(function (key) {
        if (schedule[key]) parallel.push({ text: schedule[key], sourceId: plan.sourceId, page: schedule.sourcePage });
      });
      if (/跟读|自拼|自主阅读/.test(schedule.output || '')) parallel.push({ text: schedule.output, sourceId: plan.sourceId, page: schedule.sourcePage });
    });
    // 后续输出仅展示当前年龄case中第一次加入的安排，不把浏览阶段变成当前任务。
    ['跟读', '自拼|自主阅读'].forEach(function (pattern) {
      var first = plan.stages.find(function (candidate) {
        return getStageSchedules(catalog, candidate, profile).schedules.some(function (schedule) { return new RegExp(pattern).test(schedule.output || ''); });
      });
      if (first && plan.stages.indexOf(first) > index) {
        var schedule = getStageSchedules(catalog, first, profile).schedules.find(function (item) { return new RegExp(pattern).test(item.output || ''); });
        if (!later.some(function (item) { return item.stageId === first.id; })) later.push({ stageId: first.id, text: schedule.output, sourceId: plan.sourceId, page: schedule.sourcePage });
      }
    });
    return { parallel: parallel, later: later, laterNote: config.laterNote || '', laterLabel: config.laterLabel || '后续能力何时加入', domains: array(config.domains),
      advance: stage.exit, advanceNote: config.advanceNote || '', nextStageId: plan.stages[index + 1] && plan.stages[index + 1].id,
      referenceOnly: context.status !== 'general' && context.status !== 'matched', sourceId: plan.sourceId, page: plan.page };
  }

  function materialComparisonEnabled(catalog, stage) {
    var plans = ((((catalog.raw || {}).routePlan || {}).routes || {})[stage.routeId] || {});
    return Object.keys(plans).some(function (domain) {
      var plan = plans[domain];
      return plan.stageComparison && plan.stageComparison.strategy === 'material-overlap' && array(plan.stageIds).indexOf(stage.id) !== -1;
    });
  }
  function materialOverlapScore(left, right, resources) {
    var leftIds = unique(array(left.materials).map(function (m) { return m.resourceId; }));
    var rightIds = unique(array(right.materials).map(function (m) { return m.resourceId; }));
    var union = unique(leftIds.concat(rightIds)).length, weight = 0;
    leftIds.forEach(function (id) {
      if (rightIds.indexOf(id) === -1 || !resources[id]) return;
      var best = 0;
      array(left.materials).filter(function (m) { return m.resourceId === id; }).forEach(function (a) {
        array(right.materials).filter(function (m) { return m.resourceId === id; }).forEach(function (b) {
          var kind = compareLevels(a, b, resources[id]).kind;
          best = Math.max(best, kind === 'exact' || kind === 'overlap' ? 2 : kind === 'unspecified' ? 1 : 0);
        });
      });
      weight += best;
    });
    return union ? weight / (2 * union) : 0;
  }
  function compareStages(catalog, focusStageId) {
    var focus = array(catalog.stages).find(function (stage) { return stage.id === focusStageId; });
    if (!focus) return [];
    var resourceMap = {}, focusBand = listeningComparisonBand(focus, catalog);
    array(catalog.resources).forEach(function (resource) { resourceMap[resource.id] = resource; });
    return array(catalog.routes).filter(function (route) { return route.id !== focus.routeId; }).map(function (route) {
      var materialComparable = materialComparisonEnabled(catalog, focus) || array(route.stages).some(function (target) { return materialComparisonEnabled(catalog, target); });
      var focusRoute = array(catalog.routes).find(function (item) { return item.id === focus.routeId; });
      var overlapPairs = materialComparable ? array(focusRoute && focusRoute.stages).flatMap(function (left) {
        return array(route.stages).map(function (right) { return { left: left.id, right: right.id, score: materialOverlapScore(left, right, resourceMap) }; });
      }) : [];
      var vocabularyComparable = !materialComparable && !!focusBand && array(route.stages).some(function (target) { return !!listeningComparisonBand(target, catalog); });
      var focusStart = (focus.raw || {}).startingReference;
      var startingComparable = !materialComparable && !vocabularyComparable && focusStart && focusStart.kind === 'route-start' && array(route.stages).some(function (target) {
        return ((target.raw || {}).startingReference || {}).kind === 'route-start';
      });
      var matches = array(route.stages).map(function (target) {
        var evidence = [], targetBand = listeningComparisonBand(target, catalog);
        var targetStart = (target.raw || {}).startingReference;
        var startingAlignment = startingComparable && targetStart && targetStart.kind === 'route-start' ?
          { focus: focusStart.basis, target: targetStart.basis, basis: '各自路线的起步方式参考；不表示词汇量、素材难度或整阶段等同。' } : null;
        var vocabularyAlignment = !materialComparable && focusBand && targetBand && Math.max(focusBand.min, targetBand.min) < Math.min(focusBand.max, targetBand.max) ?
          { focus: focusBand, target: targetBand, basis: '按听力词汇目标区间粗略对照；许密杉相邻节点之间的范围为本站整理，不代表两阶段执行要求相同。' } : null;
        array(focus.materials).forEach(function (left) {
          array(target.materials).filter(function (right) { return right.resourceId === left.resourceId; }).forEach(function (right) {
            var resource = resourceMap[left.resourceId];
            if (!resource) return;
            var relation = compareLevels(left, right, resource);
            evidence.push({ resourceId: resource.id, title: resource.title, focusLevel: left.level, targetLevel: right.level,
              focusRole: left.role, targetRole: right.role, kind: relation.kind, label: relation.label, commonLevels: relation.commonLevels || '',
              focusPage: left.page, targetPage: right.page,
              focusSourceId: left.sourceId || focus.sourceId || focus.routeId, targetSourceId: right.sourceId || target.sourceId || target.routeId,
              focusVariantId: focus.variantId, targetVariantId: target.variantId });
          });
        });
        function count(kinds) { return unique(evidence.filter(function (entry) { return !kinds || kinds.indexOf(entry.kind) !== -1; }).map(function (entry) { return entry.resourceId; })).length; }
        var overlapCount = count(['exact', 'overlap']), exactCount = count(['exact']), unspecifiedCount = count(['unspecified']);
        var pair = overlapPairs.find(function (item) { return item.left === focus.id && item.right === target.id; });
        var bestLeft = Math.max(0, ...overlapPairs.filter(function (item) { return item.left === focus.id; }).map(function (item) { return item.score; }));
        var bestRight = Math.max(0, ...overlapPairs.filter(function (item) { return item.right === target.id; }).map(function (item) { return item.score; }));
        var materialAlignment = pair && pair.score > 0 && (pair.score === bestLeft || pair.score === bestRight) ?
          { score: pair.score, basis: '按素材及级别重合度关联；同套系同级计完整权重，未标级计一半，级别不同不计；套系去重后除以双方套系并集，双向保留最佳及并列。仅为选材参考。' } : null;
        return { stageId: target.id, sourceId: target.sourceId || target.routeId, variantId: target.variantId, sharedCount: count(), overlapCount: overlapCount, exactCount: exactCount, unspecifiedCount: unspecifiedCount,
          vocabularyAlignment: vocabularyAlignment, startingAlignment: startingAlignment, materialAlignment: materialAlignment, evidence: evidence, basis: materialAlignment ? materialAlignment.basis : vocabularyAlignment ? vocabularyAlignment.basis : startingAlignment ? startingAlignment.basis : overlapCount ? '依据共同套系的原文级别交集；仅表示素材交集，不能据此判定两个阶段等价。' :
            unspecifiedCount ? '仅确认共同套系，存在原文未标级资料，不能确认两个阶段的级别对应。' : '仅确认共同套系，原文级别不同或标尺不同，未确认级别交集。' };
      }).filter(function (match) { return match.sharedCount > 0 || match.vocabularyAlignment || match.startingAlignment || match.materialAlignment; });
      matches.sort(function (a, b) { return Number(!!b.vocabularyAlignment) - Number(!!a.vocabularyAlignment) || Number(!!b.startingAlignment) - Number(!!a.startingAlignment) || b.overlapCount - a.overlapCount || b.exactCount - a.exactCount || b.sharedCount - a.sharedCount ||
        route.stages.findIndex(function (stage) { return stage.id === a.stageId; }) - route.stages.findIndex(function (stage) { return stage.id === b.stageId; }); });
      // 显式启用素材重合策略的路线使用统一素材关联；其他路线仍按词汇或起步依据。
      var stageReferences = matches.filter(function (match) { return match.materialAlignment || match.vocabularyAlignment || match.startingAlignment; });
      return { routeId: route.id, materialComparable: materialComparable, vocabularyComparable: vocabularyComparable, startingComparable: !!startingComparable, stageReferences: stageReferences, matches: matches };
    });
  }

  function getSeriesProgression(catalog, resourceId) {
    var resource = array(catalog.resources).find(function (item) { return item.id === resourceId; });
    if (!resource) return [];
    var stageMap = {};
    array(catalog.stages).forEach(function (stage) { stageMap[stage.id] = stage; });
    return array(catalog.routes).map(function (route) {
      var stages = array(resource.appearances).filter(function (appearance) { return appearance.routeId === route.id; }).map(function (appearance) {
        var stage = stageMap[appearance.stageId];
        return { stageId: appearance.stageId, stageTitle: stage ? stage.title : appearance.stageId, level: appearance.level,
          role: appearance.role, page: appearance.page, original: appearance.original,
          roleEvidence: appearance.roleEvidence,
          sourceId: appearance.sourceId || stage && stage.sourceId || appearance.routeId,
          variantId: appearance.variantId || stage && stage.variantId || appearance.routeId,
          variantLabel: stage && stage.variantLabel || route.name };
      });
      stages.sort(function (a, b) {
        var variants = array(route.variants);
        return variants.findIndex(function (variant) { return variant.id === a.variantId; }) - variants.findIndex(function (variant) { return variant.id === b.variantId; }) ||
          (stageMap[a.stageId] ? stageMap[a.stageId].order : 0) - (stageMap[b.stageId] ? stageMap[b.stageId].order : 0);
      });
      return { routeId: route.id, stages: stages };
    }).filter(function (group) { return group.stages.length; });
  }

  // 歌单关联到原路线的各个 SSS 版本，不归并媒介、级别或个人记录。
  function getSongResources(catalog, library) {
    var ids = unique([library.resourceId].concat(array(library.routeResourceIds).map(function (id) {
      return catalog.rawToCanonical[id];
    })));
    return catalog.resources.filter(function (resource) { return ids.includes(resource.id); });
  }

  function filterSongs(library, filters) {
    filters = filters || {};
    var category = array(library.categories).find(function (item) { return item.id === filters.category; });
    var songs = category ? category.songIds.map(function (id) { return library.songs.find(function (song) { return song.id === id; }); }).filter(Boolean) : array(library.songs);
    function searchKey(value) { return String(value || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\u4e00-\u9fff#]+/g, ' ').trim(); }
    var query = searchKey(filters.query);
    return songs.filter(function (song) {
      return (!filters.scene || filters.scene === 'all' || song.scene === filters.scene) &&
        TOPICS.matches(TOPICS.entryTopics('song', song), { topic: filters.topic || 'all', subtopic: filters.subtopic || 'all' }) &&
        (!filters.activity || filters.activity === 'all' || TOPICS.entryActivities('song', song).includes(filters.activity)) &&
        (!query || searchKey(song.title + ' ' + song.scene + ' ' + TOPICS.labels(TOPICS.expand(TOPICS.entryTopics('song', song))).join(' ')).includes(query));
    });
  }

  var api = { normalize: normalize, getRoutePlan: getRoutePlan, getStageFlow: getStageFlow, getRouteAgeCase: getRouteAgeCase, getStageSchedules: getStageSchedules, getAge: getAge, recommend: recommend, formatLevel: formatLevel, getLevelSummary: getLevelSummary, materialTitle: materialTitle, levelSegments: levelSegments, getStageMaterials: getStageMaterials, getMaterialLevels: getMaterialLevels, compareStages: compareStages, getSeriesProgression: getSeriesProgression, getSongResources: getSongResources, filterSongs: filterSongs };
  // 出版数量属于公共套系；路线只通过 scopeId 引用版本，不复制册数。
  function publicationEntry(catalog, resourceId) {
    var own = array(catalog && catalog.series).find(function (s) { return s.resourceId === resourceId; });
    if (!own || !own.catalogResourceId) return own;
    var shared = publicationEntry(catalog, own.catalogResourceId);
    return shared ? Object.assign({}, shared, own, { scopes: shared.scopes, sources: shared.sources, edition: shared.edition }) : own;
  }
  function publicationBindings(catalog, resourceId, scopeId) {
    var entry = publicationEntry(catalog, resourceId);
    return array(catalog && catalog.references).filter(function (ref) { return (ref.resourceId === resourceId || entry && ref.resourceId === entry.catalogResourceId) && ref.scopeId === scopeId; });
  }
  function publicationScopes(catalog, resourceId, stageId) {
    var entry = publicationEntry(catalog, resourceId);
    return array(entry && entry.scopes).map(function (scope) {
      var refs = publicationBindings(catalog, resourceId, scope.id);
      var selected = refs.some(function (ref) { return ref.stageId === stageId; });
      return Object.assign({}, scope, {
        total: scope.parts.reduce(function (sum, part) { return sum + part.count; }, 0),
        unit: scope.unit || entry.unit || '本', edition: scope.edition || entry.edition,
        sources: scope.sources || entry.sources, checkedAt: entry.checkedAt || catalog.checkedAt,
        default: selected || !!scope.default && !scope.referenceOnly
      });
    });
  }
  function publicationLevelScopes(catalog, resourceId, values, stageId) {
    var scopes = publicationScopes(catalog, resourceId, stageId);
    var selected = unique(array(values).filter(Boolean));
    if (!selected.length) return scopes;
    // 保留原文中的虚构、选读及版本限定，不能仅凭数字相同借用整级数量。
    var exactKeys = new Set();
    var exactMatches = scopes.filter(function (scope) { return selected.length === 1 && (scope.level === selected[0] || array(scope.levelAliases).indexOf(selected[0]) !== -1); });
    var exact = exactMatches.filter(function (scope) {
      if (array(scope.includedIn).some(function (id) { return exactMatches.some(function (s) { return s.id === id; }); })) return false;
      if (!(selected.length === 1 && (scope.level === selected[0] || array(scope.levelAliases).indexOf(selected[0]) !== -1))) return false;
      var key = JSON.stringify([scope.edition, scope.unit, scope.parts]);
      if (exactKeys.has(key)) return false;
      exactKeys.add(key); return true;
    });
    var entry = publicationEntry(catalog, resourceId);
    var resource = { title: entry && (entry.displayTitle || entry.title) || '' };
    var own = selected.map(function (level) { return levelParts(level, resource); });
    if (own.some(function (part) { return !part || part.qualifier || part.quantities.length; })) return exact;
    var ids = unique(own.flatMap(function (part) { return part.tokens.map(function (token) { return token.id; }); }));
    if (!ids.length) return exact;
    var result = exact.slice(), seen = new Set(), editions = new Map(), partDefaults = new Map();
    // 同一版的逐级scope共同组成可选范围，不能要求每条scope重复存全套册数。
    scopes.forEach(function (scope) {
      var editionKey = JSON.stringify([scope.edition, scope.unit]);
      if (!editions.has(editionKey)) editions.set(editionKey, Object.assign({}, scope, { parts: [], sources: [] }));
      var combined = editions.get(editionKey);
      scope.parts.forEach(function (part) {
        var normalized = Object.assign({}, part);
        if (!normalized.level && scope.parts.length === 1 && scope.level) normalized.level = scope.level;
        var previous = combined.parts.find(function (p) { return p.label === part.label; });
        if (!previous) combined.parts.push(normalized);
        else if (normalized.level) previous.level = normalized.level;
        var defaultKey = JSON.stringify([scope.edition, scope.unit, part.label]);
        partDefaults.set(defaultKey, partDefaults.get(defaultKey) || scope.default);
      });
      array(scope.sources).forEach(function (source) { if (!combined.sources.some(function (s) { return s.url === source.url && s.evidence === source.evidence; })) combined.sources.push(source); });
    });
    editions.forEach(function (scope) {
      if (exact.some(function (s) { return s.edition === scope.edition && s.unit === scope.unit; })) return;
      var parts = scope.parts.filter(function (part) {
        var parsed = levelParts(part.level || part.label, resource);
        return parsed && !parsed.qualifier && parsed.tokens.length && parsed.tokens.every(function (token) { return ids.indexOf(token.id) !== -1; });
      });
      var found = unique(parts.flatMap(function (part) { return levelParts(part.level || part.label, resource).tokens.map(function (token) { return token.id; }); }));
      if (!ids.every(function (id) { return found.indexOf(id) !== -1; })) return;
      var identity = JSON.stringify([scope.edition, parts.map(function (part) { return [part.label, part.count]; })]);
      if (seen.has(identity)) return;
      seen.add(identity);
      result.push(Object.assign({}, scope, {
        id: scope.id + '-levels-' + hash(ids.join('|')), level: selected.join('、'), label: selected.join('、'), parts: parts,
        default: parts.every(function (part) { return partDefaults.get(JSON.stringify([scope.edition, scope.unit, part.label])); }),
        total: parts.reduce(function (sum, part) { return sum + part.count; }, 0)
      }));
    });
    return result;
  }
  api.publicationEntry = publicationEntry;
  api.publicationBindings = publicationBindings;
  api.publicationScopes = publicationScopes;
  api.publicationLevelScopes = publicationLevelScopes;
  api.materialRoles = MATERIAL_ROLES;
  api.materialUsageLabel = materialUsageLabel;
  root.EnglishModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
