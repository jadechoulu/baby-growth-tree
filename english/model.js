(function (root) {
  'use strict';

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
    ['培生词汇妙趣屋', '词汇妙趣屋'],
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
      // 同一素材在同一阶段的不同级别/角色都保留，重复的引用只展示一次。
      var signature = [resourceId, level, role, page, original, sourceId].join('|');
      if (stage.materials.some(function (entry) { return [entry.resourceId, entry.level, entry.role, entry.page, entry.original, entry.sourceId].join('|') === signature; })) return;
      stage.materials.push(item);
      var appearance = { routeId: stage.routeId, stageId: stage.id, level: level, role: role, page: page, original: original, sourceId: sourceId, variantId: stage.variantId,
        preview: material.preview || (rawResource && previewOf(rawResource)) || stage.preview };
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
          title: original.title || original.name || original.label || '阶段 ' + (index + 1),
          shortTitle: original.shortTitle || '', group: original.group || '', domain: original.domain || '', duration: text(original.duration),
          goal: text(original.goal || original.objective || original.target || original.vocabulary),
          entry: text(original.entry || original.entryCriteria || original.prerequisite),
          exit: text(original.exit || original.exitCriteria || original.advanceCriteria),
          hours: hourLabel(original),
          ageLabel: original.ageLabel || text(original.ageRange) || (original.ageMin != null ? original.ageMin + (original.ageMax !== original.ageMin ? '–' + original.ageMax : '') + ' 岁（原文整条路线适用年龄）' : original.schedules ? unique(original.schedules.map(function (s) { return s.ageGroup; })).join(' / ') : '原文未按年龄划段'),
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
        notes: notes(data.notes).concat(notes(data.uncertainties)), stages: [] };
      var mainVariant = addVersion(route, data, routeId === 'xu' ? 'xu-listening' : routeId, routeId,
        routeId === 'xu' ? '听力进阶' : ROUTES[routeId].name + '路线');
      route.stages = mainVariant.stages;
      if (routeId === 'xu') {
        route.variants = [mainVariant];
        array(raw.xuSupplements).forEach(function (supplement) {
          route.variants.push(addVersion(route, supplement, supplement.id, supplement.id, supplement.label || supplement.title || supplement.id));
        });
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
        link(main.resourceId, m.resourceId, 'pair', stage.title + '：主线与平行拓展（非等值）', 'xu', m.page || stage.page);
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
      var image = raw.resourceCovers && raw.resourceCovers[resource.id];
      if (!resource.cover && image) {
        resource.cover = image.path;
        resource.coverSource = image;
      }
      resource.details = resource.details.filter(function (entry, i, list) { return list.findIndex(function (other) { return other.label === entry.label && other.text === entry.text && other.routeId === entry.routeId && other.page === entry.page && other.sourceId === entry.sourceId && other.variantId === entry.variantId; }) === i; });
    });
    relationships = relationships.filter(function (entry, i, list) { return list.findIndex(function (other) { return other.from === entry.from && other.to === entry.to && other.label === entry.label && other.routeId === entry.routeId && other.sourceId === entry.sourceId && other.variantId === entry.variantId; }) === i; });
    if (raw.sssSongs && raw.sssSongs.source) sources.push(raw.sssSongs.source);
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
    var start = words < 200, routeStages = {}, selected = [];
    array(catalog.routes).forEach(function (route) {
      var mainVariant = route.id === 'xu' && array(route.variants).find(function (variant) { return variant.id === 'xu-listening'; });
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
      ? '目前约 ' + words + ' 个听力词汇，先浏览名词、动作与生活短句的起点：香蕉妈妈起步段、许密杉第一阶段、庆爸常规 1。各路线词数属于积累目标，不能当作入门门槛。'
      : '按约 ' + words + ' 个听力词汇提供浏览候选；词数属于阶段目标，不能据此判断已晋级，仍需核验实际理解、兴趣与原文准入条件。',
      underThree: underThree, level: start ? 'start' : 'browse', suggested: suggested.slice(0, 10),
      next: (underThree ? '庆爸原文面向 3–4 岁，当前仅供对照。' : '') + '先选孩子能理解且愿意重复的同级材料；升档前核验实际理解。庆爸还需核验投入时间与测试 Phase，成长计划 Phase 不能替代测试。',
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
    var normalized = original.normalize('NFKC').toUpperCase().replace(/[–—−~～至到]/g, '-')
      .replace(/[零一二两三四五六七八九十]+/g, chineseNumber).replace(/\s+/g, '');
    if (!normalized || /未标|未注明|未知|不详|待核|未确定|未说明/.test(normalized)) return null;
    var qualifiers = [];
    // 仅此已确认平台按明确的 L2 / 二级别 / 第三级别动画前缀取级别；选片数量和片名保留为限定。
    if (resource && resource.title === '小狐狸动画') {
      var foxLevel = normalized.match(/^(?:L(\d+)|第?(\d+)级(?:别)?)(?:动画)?(?=$|[·:：（(])/);
      if (foxLevel) {
        var foxSelection = normalized.slice(foxLevel[0].length).replace(/^[·:：]/, '');
        if (foxSelection) qualifiers.push(foxSelection);
        normalized = foxLevel[1] || foxLevel[2];
      }
    }
    normalized = normalized.replace(/[（(]([^）)]*)[）)]/g, function (_, label) { qualifiers.push(label); return ''; });
    var hierarchy = normalized.match(/^第?(\d+)级(?:别)?(.+)$/);
    var inheritedScale = '';
    if (hierarchy && /^[\d&/、,-]/.test(hierarchy[2])) {
      inheritedScale = 'TIER' + hierarchy[1] + '-VOLUME';
      normalized = hierarchy[2];
    }
    normalized = normalized.replace(/第/g, '').replace(/级别|级/g, '').replace(/^LEVEL(?=[\dA-Z])/, '')
      .replace(/LEVEL(?=\d)/g, '').replace(/[、,，;；和及]/g, '&').replace(/\//g, '&');
    var tokens = [], inheritedPrefix = inheritedScale;
    function addToken(scale, grade, plus) {
      tokens.push({ scale: scale, grade: grade, plus: !!plus, id: scale + ':' + grade + (plus ? '+' : '') });
    }
    function atom(part) {
      var match = part.match(/^(GK70)([A-Z])([+]?)$/);
      if (match) return { scale: match[1], grade: match[2], plus: !!match[3], alphabet: true };
      match = part.match(/^(G\d)-(\d+)([+]?)$/);
      if (match) return { scale: match[1], grade: Number(match[2]), plus: !!match[3], alphabet: false };
      match = part.match(/^(GK|G\d|S|L|SET|PART|PHASE)?(\d+)([+]?)$/);
      if (match) return { scale: match[1] === 'L' ? '' : match[1] || inheritedPrefix, grade: Number(match[2]), plus: !!match[3], alphabet: false };
      match = part.match(/^([A-Z]{1,2})([+]?)$/);
      if (match) return { scale: inheritedPrefix || (resource && /GK70/i.test(resource.title) ? 'GK70' : ''), grade: match[1], plus: !!match[2], alphabet: true };
      return null;
    }
    normalized.split('&').filter(Boolean).forEach(function (part) {
      var named = part.match(/^(预备|基础|进阶)$/);
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
      qualifier: qualifier, normalized: normalized, fiction: /非虚构/.test(qualifier) ? 'nonfiction' : /虚构/.test(qualifier) ? 'fiction' : '' };
  }

  function compareLevels(focus, target, resource) {
    var left = levelParts(focus.level, resource), right = levelParts(target.level, resource);
    if (!left || !right) return { kind: 'unspecified', label: '同套系，' + (!left && !right ? '双方' : !left ? '当前路线' : '对照路线') + '原文未标级，不能确认阶段对应' };
    if (left.fiction && right.fiction && left.fiction !== right.fiction) return { kind: 'different', label: '同套系，虚构与非虚构选材不同，不能确认内容重叠' };
    var common = left.tokens.filter(function (token) { return right.tokens.some(function (other) { return token.id === other.id; }); });
    var plusDifference = left.tokens.some(function (token) { return right.tokens.some(function (other) { return token.scale === other.scale && token.grade === other.grade && token.plus !== other.plus; }); });
    var selectionNote = resource && resource.title === '小狐狸动画' ? '；未确认指定片单相同' : '';
    var sameTokens = left.tokens.length && left.tokens.length === right.tokens.length && left.tokens.every(function (token) { return right.tokens.some(function (other) { return other.id === token.id; }); });
    if ((sameTokens || !left.tokens.length && !right.tokens.length && left.normalized === right.normalized) && left.qualifier === right.qualifier) {
      return { kind: 'exact', label: '同套系，原文级别相同' + selectionNote };
    }
    if (common.length) {
      return { kind: 'overlap', label: '同套系，部分级别重叠' + (plusDifference ? '；带 + 与不带 + 的级别不计入交集' : '') +
        (left.qualifier !== right.qualifier ? '；原文选材或版本限定不同' : '') + selectionNote };
    }
    if (plusDifference) return { kind: 'different', label: '同套系，带 + 与不带 + 的级别不同，未确认重叠' };
    return { kind: 'different', label: '同套系，原文级别或标尺不同，未确认重叠' };
  }

  function compareStages(catalog, focusStageId) {
    var focus = array(catalog.stages).find(function (stage) { return stage.id === focusStageId; });
    if (!focus) return [];
    var resourceMap = {};
    array(catalog.resources).forEach(function (resource) { resourceMap[resource.id] = resource; });
    return array(catalog.routes).filter(function (route) { return route.id !== focus.routeId; }).map(function (route) {
      var matches = array(route.stages).map(function (target) {
        var evidence = [];
        array(focus.materials).forEach(function (left) {
          array(target.materials).filter(function (right) { return right.resourceId === left.resourceId; }).forEach(function (right) {
            var resource = resourceMap[left.resourceId];
            if (!resource) return;
            var relation = compareLevels(left, right, resource);
            evidence.push({ resourceId: resource.id, title: resource.title, focusLevel: left.level, targetLevel: right.level,
              focusRole: left.role, targetRole: right.role, kind: relation.kind, label: relation.label,
              focusPage: left.page, targetPage: right.page,
              focusSourceId: left.sourceId || focus.sourceId || focus.routeId, targetSourceId: right.sourceId || target.sourceId || target.routeId,
              focusVariantId: focus.variantId, targetVariantId: target.variantId });
          });
        });
        function count(kinds) { return unique(evidence.filter(function (entry) { return !kinds || kinds.indexOf(entry.kind) !== -1; }).map(function (entry) { return entry.resourceId; })).length; }
        var overlapCount = count(['exact', 'overlap']), exactCount = count(['exact']), unspecifiedCount = count(['unspecified']);
        return { stageId: target.id, sourceId: target.sourceId || target.routeId, variantId: target.variantId, sharedCount: count(), overlapCount: overlapCount, exactCount: exactCount, unspecifiedCount: unspecifiedCount,
          evidence: evidence, basis: overlapCount ? '依据共同套系的原文级别交集；仅表示素材交集，不能据此判定两个阶段等价。' :
            unspecifiedCount ? '仅确认共同套系，存在原文未标级资料，不能确认两个阶段的级别对应。' : '仅确认共同套系，原文级别不同或标尺不同，未确认级别交集。' };
      }).filter(function (match) { return match.sharedCount > 0; });
      matches.sort(function (a, b) { return b.overlapCount - a.overlapCount || b.exactCount - a.exactCount || b.sharedCount - a.sharedCount ||
        route.stages.findIndex(function (stage) { return stage.id === a.stageId; }) - route.stages.findIndex(function (stage) { return stage.id === b.stageId; }); });
      return { routeId: route.id, matches: matches };
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
        (!query || searchKey(song.title + ' ' + song.scene).includes(query));
    });
  }

  var api = { normalize: normalize, getAge: getAge, recommend: recommend, compareStages: compareStages, getSeriesProgression: getSeriesProgression, getSongResources: getSongResources, filterSongs: filterSongs };
  root.EnglishModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
