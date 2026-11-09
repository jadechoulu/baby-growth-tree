/* 仅从既有记录派生摘要；不保存档案、不上传原始手记。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./assistant-workflow.js'), require('../english/model.js'), require('../english/practice.js'), require('../english/book-progress.js'), require('../english/vocabulary.js'), require('../english/shelf-library.js'), require('../english/library-custom.js'));
  else root.XiaoyaAssistantContext = factory(root.XiaoyaAssistantWorkflow, root.EnglishModel, root.EnglishPractice, root.EnglishBookProgress, root.EnglishVocabulary, root.EnglishShelfLibrary, root.EnglishLibraryCustom);
})(typeof window === 'object' ? window : globalThis, function (Workflow, Model, P, BP, V, Shelf, Custom) {
  'use strict';
  function summarize({ snapshots, data, profile, index }) {
    const snapshot = snapshots.english, records = snapshot?.records || {}, lines = [];
    const vocabulary = V.summary(records);
    const songIds = new Set(Model.getSongResources(data.catalog, data.sssSongs).map(item => item.id));
    lines.push(snapshot ? '英语记录已读取；以下是家长记录，不是能力测评。' : '本机暂无英语记录，不能判断不会；请先确认同步。');
    if (['audio', 'video'].includes(snapshot?.profile?.mode)) lines.push('当前素材呈现设置：' + (snapshot.profile.mode === 'audio' ? '共读与音频' : '也查看动画') + '；页面设置不等于孩子的实际喜好。');
    lines.push(V.initialized(records) ? '去重词汇：' + ['listening', 'speaking'].map((channel, i) => (i ? '会说' : '听懂') + '单词' + vocabulary[channel].word.unique + '、短语' + vocabulary[channel].phrase.unique + '、句型' + vocabulary[channel].pattern.unique).join('；') : '尚未建立逐词记录；历史听力估计' + (snapshot?.profile?.vocabulary ? snapshot.profile.vocabulary + '词（估计，非逐词核定）' : '未填写或为0，不表示没有听懂词') + '；口语词量未知。');
    for (const routeId of ['xu', 'qing']) {
      const route = data.catalog.routes.find(item => item.id === routeId), age = Model.getRouteAgeCase(data.catalog, routeId, profile);
      lines.push((route?.name || routeId) + '年龄方案：' + ({ below: '低于原表年龄，仅作参考', outside: '原表年龄未覆盖', matched: '匹配', general: '通用资料', unknown: '年龄未知' }[age.status]) + (age.ageCase ? ' · ' + age.ageCase.label : ''));
      for (const domain of routeId === 'xu' ? ['listening', 'speaking', 'reading', 'writing'] : ['listening']) {
        const plan = Model.getRoutePlan(data.catalog, routeId, domain, profile); if (!plan) continue;
        const descriptions = plan.stages.map(stage => {
          const done = P.stageDone(records, routeId + ':' + domain, stage.id), progress = [];
          for (const item of Model.getStageMaterials(data.catalog, stage)) {
            if (routeId === 'xu' && songIds.has(item.resource.id)) { const songs = P.songPlaylistProgress(records, data.sssSongs); if (songs.done) progress.push(item.resource.title + ':' + songs.done + '/' + songs.total + '首'); continue; }
            const base = { item, key: P.unitKey(stage, item), resourceId: item.resource.id, stageId: stage.id, recordStageId: item.material.recordStageId || stage.id };
            base.bookScopes = P.bookScopes(base.resourceId, item.materials.map(material => Model.formatLevel(material.level, item.resource)), data.resourceVolumes, base.recordStageId);
            const children = [];
            for (const unit of P.expandBookUnits(base, Model.getMaterialLevels(item), data.resourceVolumes, P.sharedEditionRecord(records, base, data.resourceVolumes))) {
              const raw = P.sharedEditionRecord(records, unit, data.resourceVolumes), unitName = Model.publicationEntry(data.resourceVolumes, unit.resourceId)?.unit || P.quantityUnit(item.resource.type);
              const scope = unit.partScope || P.bookScope(raw, unit.bookScopes, unitName);
              const legacy = P.sharedQuantity(records, unit.resourceId, scope, unitName, raw, item.resource.mergedResourceIds);
              const plan = BP.planForResource(data.readingPlans, unit.resourceId, data.resourceBooks, data.resourceVolumes, scope);
              const quantity = plan ? BP.projectQuantity(records, plan, scope, legacy) : BP.projectScopeQuantity(records, unit.resourceId, scope, legacy, data.resourceVolumes, data.resourceBooks);
              if (unit.parentKey === base.key) children.push({ key: unit.key, scopeIdentity: scope ? JSON.stringify([scope.id, scope.label, scope.edition]) : '', countOnlyCompatible: !!(scope?.countOnlyCompatible || scope?.automaticDefault), ...quantity });
              if (quantity.completed > 0 || quantity.status === 'done') progress.push(item.resource.title + (scope?.label ? '/' + scope.label : '') + ':' + quantity.completed + (quantity.total == null ? '/总数未核' : '/' + quantity.total) + unitName);
            }
            if (children.length) { const group = P.groupQuantity(P.sharedEditionRecord(records, base, data.resourceVolumes), children); if (group.directCompleted > group.childCompleted) progress.push(item.resource.title + '父项与子项取max:' + group.completed + (group.total == null ? '/总数未核' : '/' + group.total) + group.unit); }
          }
          const time = routeId === 'qing' ? P.summarize(records, stage.id) : null;
          return stage.title + (done ? '〔家长标阶段完成〕' : '〔未标阶段完成〕') + (progress.length ? '素材已记录' + progress.length + '项：' + [...new Set(progress)].slice(0, 3).join('、') : '暂无可核数量') + (time?.entries.length ? '；去重有效' + P.hours(time.effectiveMinutes) + 'h' : '');
        });
        lines.push(plan.domain.label + '：' + descriptions.join('；'));
      }
    }
    const groups = Shelf.groups(records, { plans: data.readingPlans, directory: data.resourceBooks, catalog: data.resourceVolumes, liao: data.liaoReading, resources: data.catalog.resources, collections: [data.helloReading] });
    const total = groups.reduce((sum, group) => sum + group.total, 0), read = groups.reduce((sum, group) => sum + group.completed, 0);
    lines.push('路线外英文书架：已识别' + total + '本、已读' + read + '本；书架子集不是出版社全套。' + groups.filter(group => group.completed).slice(0, 5).map(group => group.title + ' ' + group.completed + '/' + group.total).join('；'));
    const manual = Custom.resources(records);
    lines.push('个人补充选材' + manual.length + '项：' + manual.slice(0, 4).map(item => item.title + '（' + P.STATUS[records[item.id]?.status] + '）').join('、'));
    const publicRead = new Set(data.resourceBooks.books.filter(book => BP.bookState(records, book.id).done).map(book => book.id));
    lines.push('公共逐册目录已读' + publicRead.size + '本（手工与小花生按同一身份去重）；已读不等于掌握。');
    for (const area of ['growth', 'health']) {
      const snapshot = snapshots[area], entries = Object.entries(snapshot?.records || {}).filter(([, record]) => record.completedAt || record.status === 'observed');
      lines.push((area === 'growth' ? '毛老师成长' : '卫健委观察') + (snapshot ? '已记录' + entries.length + '项：' + entries.slice(-5).map(([id]) => index.entries.find(item => item.id === 'growth:' + (area === 'growth' ? 'skill:' : 'health:') + id)?.title).filter(Boolean).join('、') : '本机暂无记录'));
    }
    return lines.join('\n');
  }
  function collect(input) {
    const context = { sex: Workflow.context.defaultSex, records: summarize(input) };
    if (input.profile.birthDate) {
      const birth = new Date(input.profile.birthDate + 'T00:00:00'), today = input.now || new Date();
      context.ageMonths = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth() - Number(today.getDate() < birth.getDate());
    }
    return context;
  }
  return { summarize, collect };
});
