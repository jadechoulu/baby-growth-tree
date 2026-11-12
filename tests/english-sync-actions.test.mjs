import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const app = await readFile(new URL('../english/app.js', import.meta.url), 'utf8');
// 执行真实入口函数，验证点击后业务流程，不复制页面布局或导入算法。
const action = app.slice(app.indexOf('async function syncXiaohuashengRead('), app.indexOf('function readingSyncDetail(){'));
test('小花生点击被登录、连接或冲突阻断时打开原同步面板，成功及普通失败保留获取结果', async () => {
  for (const status of ['auth-required', 'connection-required', 'conflict', 'error', 'synced']) {
    const calls = [], state = { modal: null };
    const result = { mode: status === 'synced' ? 'cloud-live' : 'cloud', cloud: { status, ok: status === 'synced' } };
    const context = {
      readingSync: { busy: false }, S: state, location: {},
      render() {}, renderModal() {}, openModal(kind) { state.modal = { kind }; },
      bookLoader: { async load() { calls.push('catalog'); } },
      window: { EnglishXiaohuashengSync: { async synchronize() { calls.push('synchronize'); return result; } } },
      siteSync: { async open() { calls.push('open-sync'); } },
      backupEnglishBeforeSync() {}, savePracticeRecords() {},
    };
    vm.runInNewContext(action, context);
    await context.syncXiaohuashengRead();
    assert.deepEqual(calls, ['catalog', 'synchronize', ...(['auth-required', 'connection-required', 'conflict'].includes(status) ? ['open-sync'] : [])]);
    assert.equal(context.readingSync.result, result); assert.equal(context.readingSync.busy, false);
  }
});

test('自动抓取成功或失败均不强制打开弹窗，手动入口保留结果和重试', async () => {
  for (const failed of [false, true]) {
    const calls = [], state = { modal: null };
    const context = {
      readingSync: { busy: false }, S: state, location: {},
      render() {}, renderModal() {}, openModal() { calls.push('modal'); }, toast() { calls.push('toast'); },
      bookLoader: { async load() {} },
      window: { EnglishXiaohuashengSync: { async synchronize() { if (failed) throw Error('unavailable'); return { mode: 'cloud-live', cloud: { ok: true } }; } } },
      siteSync: { async open() { calls.push('settings'); } }, backupEnglishBeforeSync() {}, savePracticeRecords() {},
    };
    vm.runInNewContext(action, context);
    await context.syncXiaohuashengRead({ automatic: true });
    assert.deepEqual(calls, failed ? ['toast'] : []);
    assert.equal(context.readingSync.busy, false);
  }
});
