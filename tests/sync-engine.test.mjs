import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../shared/sync-model.js');
const { createEngine } = require('../shared/sync-engine.js');
const growth = records => ({ version: 1, records });
const english = (vocabulary = 70, favorites = [], records = {}) => ({ version: 1, profile: { vocabulary, mode: 'audio' }, favorites, records });
const copy = value => structuredClone(value);
function harness(initial, cloud = null, area = 'growth') {
  let disk = copy(initial), remote = copy(cloud), rev = remote ? 1 : 0, offline = false;
  const entries = new Map(), requests = [];
  const empty = () => ({ enabled: false, base: null, incoming: null, conflict: null });
  const journal = {
    get: async key => copy(entries.get(key) || empty()),
    update: async (key, fn) => { const value = fn(copy(entries.get(key) || empty())); entries.set(key, copy(value)); return copy(value); },
  };
  const envelope = () => ({ snapshot: copy(remote), revision: remote ? String(rev) : null, savedAt: remote ? '2026-10-29T01:00:00Z' : null });
  let onPut = async () => {}, applyFailure = false;
  const adapter = {
    read: async () => copy(disk),
    apply: async (snapshot, base) => {
      if (applyFailure) throw new Error('模拟回执后页面关闭');
      const merged = M.merge(base, disk, snapshot);
      if (merged.conflicts.length) throw Object.assign(new Error('冲突'), { code: 'MERGE_CONFLICT', conflicts: merged.conflicts });
      disk = copy(merged.snapshot); return copy(disk);
    },
  };
  const request = async (_, method, body) => {
    requests.push({ method, body: copy(body) });
    if (offline) throw new Error('离线');
    if (method === 'GET') return envelope();
    await onPut(body);
    if (body.revision !== (remote ? String(rev) : null)) throw Object.assign(new Error('并发'), { code: 'VERSION_CONFLICT' });
    remote = copy(body.snapshot); rev++;
    return envelope();
  };
  const make = async () => {
    const engine = createEngine({ journal, request, debounceMs: 60000, retryMs: 60000 });
    await engine.register(area, adapter); return engine;
  };
  return {
    area, make, entries, journal, requests, adapter,
    remote: () => copy(remote), disk: () => copy(disk), edit: value => { disk = copy(value); },
    offline: value => { offline = value; }, remoteEdit: value => { remote = copy(value); rev++; },
    onPut: fn => { onPut = fn; }, failApply: value => { applyFailure = value; },
  };
}
async function connect(h, engine) {
  engine.authenticate(true); await engine.enable(h.area, await engine.preview(h.area));
}

test('三方合并分离完成日期、手记与删除，不丢掉另一端新增字段', () => {
  const base = growth({ a: { completedAt: '2026-10-28', note: '原文' } });
  const local = growth({ a: { note: '原文' } });
  const remote = growth({ a: { completedAt: '2026-10-28', note: '新手记' }, b: { note: '另一项' } });
  assert.deepEqual(M.merge(base, local, remote), { snapshot: growth({ a: { note: '新手记' }, b: { note: '另一项' } }), conflicts: [] });
});

test('英语收藏按成员合并，取消收藏与另一设备新增收藏同时保留', () => {
  const merged = M.merge(english(70, ['a']), english(70, ['b']), english(80, ['a', 'c'], { book: { note: '手记' } }));
  assert.deepEqual(merged, { snapshot: english(80, ['b', 'c'], { book: { note: '手记' } }), conflicts: [] });
});

test('两端分别删除最后两条记录时保留合法空记录表', () => {
  const base = growth({ a: { note: '甲' }, b: { note: '乙' } });
  const merged = M.merge(base, growth({ b: { note: '乙' } }), growth({ a: { note: '甲' } }));
  assert.deepEqual(merged, { snapshot: growth({}), conflicts: [] });
  assert.deepEqual(M.normalize('growth', merged.snapshot), growth({}));
});

test('预览只读，首次连接需要确认；空库不自动写默认资料', async t => {
  const h = harness(growth({ a: { note: '本机' } })); const e = await h.make(); t.after(() => e.destroy());
  e.authenticate(true); await e.sync('growth'); await e.preview('growth');
  assert.equal(h.requests.filter(r => r.method === 'PUT').length, 0);
  await e.enable('growth', await e.preview('growth'));
  assert.deepEqual(h.remote(), h.disk()); assert.equal(e.states().growth.pending, false);
});

test('预览后本机或云端变化必须重新预览，不能连接旧快照', async t => {
  const h = harness(growth({})); const e = await h.make(); t.after(() => e.destroy());
  const preview = await e.preview('growth'); h.edit(growth({ a: { note: '新内容' } }));
  await assert.rejects(e.enable('growth', preview), /记录已变化/);
  assert.equal(h.remote(), null);
});

test('断网编辑已存领域库，关闭重开后从持久基线恢复并重试', async t => {
  const h = harness(growth({})); let e = await h.make();
  await connect(h, e); h.offline(true); h.edit(growth({ a: { note: '离线保存' } }));
  await e.changed('growth'); await e.sync('growth'); assert.equal(e.states().growth.pending, true);
  assert.deepEqual(h.remote(), growth({})); e.destroy();
  e = await h.make(); t.after(() => e.destroy()); assert.equal(e.states().growth.pending, true);
  h.offline(false); e.authenticate(true); await e.sync('growth');
  assert.deepEqual(h.remote(), h.disk()); assert.equal(e.states().growth.pending, false);
});

test('双设备修改不同技能可合并；409重新读版本后再提交', async t => {
  const h = harness(growth({})); const e = await h.make(); t.after(() => e.destroy()); await connect(h, e);
  h.edit(growth({ a: { note: '本机新增' } }));
  let once = true; h.onPut(async () => { if (once) { once = false; h.remoteEdit(growth({ b: { note: '另一设备' } })); } });
  await e.sync('growth');
  assert.deepEqual(h.disk(), growth({ a: { note: '本机新增' }, b: { note: '另一设备' } }));
  assert.deepEqual(h.remote(), h.disk());
});

test('同字段冲突保持双方，选云端后保留其他本机字段', async t => {
  const h = harness(growth({ a: { note: '原文' } })); const e = await h.make(); t.after(() => e.destroy()); await connect(h, e);
  h.edit(growth({ a: { note: '本机' }, b: { note: '本机新增' } })); h.remoteEdit(growth({ a: { note: '云端' } }));
  await e.sync('growth'); const conflict = e.states().growth.conflict;
  assert.equal(conflict.conflicts.length, 1); assert.equal(h.disk().records.a.note, '本机'); assert.equal(h.remote().records.a.note, '云端');
  await e.resolve('growth', { [conflict.conflicts[0].key]: 'remote' });
  assert.deepEqual(h.disk(), growth({ a: { note: '云端' }, b: { note: '本机新增' } }));
  assert.equal(e.states().growth.conflict, null);
});

test('选择冲突后远端再变，过期选择不会覆盖新手记', async t => {
  const h = harness(growth({ a: { note: '原文' } })); const e = await h.make(); t.after(() => e.destroy()); await connect(h, e);
  h.edit(growth({ a: { note: '本机' } })); h.remoteEdit(growth({ a: { note: '云端一' } })); await e.sync('growth');
  const key = e.states().growth.conflict.conflicts[0].key;
  h.remoteEdit(growth({ a: { note: '云端二' } })); await e.resolve('growth', { [key]: 'local' });
  assert.equal(e.states().growth.conflict.conflicts[0].remote, '云端二'); assert.equal(h.remote().records.a.note, '云端二');
});

test('请求期间继续编辑，在回执合入时保留新输入并再次排队', async t => {
  const h = harness(growth({ a: { note: '原文' } })); const e = await h.make(); t.after(() => e.destroy()); await connect(h, e);
  h.edit(growth({ a: { note: '第一版' } })); h.onPut(async () => { h.edit(growth({ a: { note: '继续输入' } })); });
  await e.sync('growth');
  assert.equal(h.disk().records.a.note, '继续输入'); assert.equal(h.remote().records.a.note, '第一版'); assert.equal(e.states().growth.pending, true);
  h.onPut(async () => {}); await e.sync('growth'); assert.deepEqual(h.disk(), h.remote());
});

test('云端确认后本机应用失败，重开从回执恢复，不将旧本机当成删除', async t => {
  const h = harness(growth({})); let e = await h.make(); await connect(h, e);
  h.remoteEdit(growth({ b: { note: '云端新增' } })); h.failApply(true); await e.sync('growth');
  assert.ok((await h.journal.get('growth')).incoming); assert.deepEqual(h.disk(), growth({})); e.destroy();
  h.failApply(false); e = await h.make(); t.after(() => e.destroy()); e.authenticate(true); await e.sync('growth');
  assert.equal((await h.journal.get('growth')).incoming, null); assert.deepEqual(h.disk(), h.remote());
});

test('注销与暂停后本机编辑继续保留，不发起云端写入', async t => {
  const h = harness(growth({})); const e = await h.make(); t.after(() => e.destroy()); await connect(h, e);
  e.authenticate(false); h.edit(growth({ a: { note: '未登录' } })); await e.changed('growth'); await e.sync('growth');
  assert.deepEqual(h.remote(), growth({})); e.authenticate(true); await e.disable('growth'); await e.sync('growth'); assert.deepEqual(h.remote(), growth({}));
});

test('档案与英语沿用同一机制，领域文件不会混写', async t => {
  for (const [area, value] of [['english', english(80, ['sss'], { sss: { status: 'using', note: '喜欢' } })], ['profile', { version: 1, name: '测试宝宝', birthDate: '2024-11-24' }]]) {
    const h = harness(value, null, area); const e = await h.make(); t.after(() => e.destroy()); await connect(h, e); assert.deepEqual(h.remote(), value);
  }
});

test('跨边界格式校验拒绝错误生日、未知技能、非法日期及凭据字段', () => {
  assert.throws(() => M.normalize('profile', { version: 1, name: '宝宝', birthDate: '2025-01-01' }));
  assert.throws(() => M.normalize('growth', growth({ unknown: {} }), new Set(['a'])));
  assert.throws(() => M.normalize('growth', growth({ a: { completedAt: '2026-02-30' } })));
  assert.throws(() => M.normalize('english', { ...english(), token: 'fake-NOT-A-CREDENTIAL' }));
  assert.throws(() => M.normalize('english', english(-1)));
});
