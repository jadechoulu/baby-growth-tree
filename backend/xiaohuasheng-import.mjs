import Shelf from '../english/shelf-library.js';
import Sync from '../english/xiaohuasheng-sync.js';
import Model from '../shared/sync-model.js';
import { createWorker } from '../worker/index.mjs';
import catalog from '../shared/assistant-data.json' with { type: 'json' };

/** 与页面共用目录投影、逐本匹配、手工事实保护及导入回执，只改变保存位置。 */
export async function importXhsSnapshot(snapshot, { repository, backup, context = catalog } = {}) {
  const options = { plans: context.readingPlans, directory: context.resourceBooks, catalog: context.resourceVolumes, liao: context.liaoReading, resources: context.catalog.resources, collections: [context.helloReading], sourcePriority: true };
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await repository.read();
    if (!current.snapshot || !current.revision) throw new Error('XHS_CONNECTION_REQUIRED');
    const before = Model.normalize('english', current.snapshot);
    const prepared = Sync.prepareImport(before.records, snapshot, (records, value) => Shelf.apply(records, value, options));
    const next = Model.normalize('english', { ...before, records: { ...before.records, ...prepared.changes } });
    await backup(before);
    try {
      // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 使用刚读取的固定私人英语文件SHA条件写入；版本冲突后重读、备份并重新派生，不用旧快照覆盖其他设备修改。
      const saved = await repository.write(next, current.revision);
      if (!saved.revision || !Model.equal(next, saved.snapshot)) throw new Error('XHS_SAVE_NOT_CONFIRMED');
      return { saved: true, revision: saved.revision, fetchedAt: prepared.receipt.fetchedAt };
    } catch (error) {
      if (error.code !== 'VERSION_CONFLICT' || attempt === 3) throw error;
    }
  }
}

export function cloudXhsImporter({ env, network = fetch, now = Date.now }) {
  const repository = createWorker({ fetch: network, now }).englishRepository(env);
  return (snapshot, backup) => importXhsSnapshot(snapshot, { repository, backup });
}
