import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue, sameGrowth } from '../lib/save-queue.mjs';
import { mergeGrowthSnapshots } from '../lib/cloud.mjs';

const day = '2026-10-27';
const savedAt = '2026-10-27T08:00:00.000Z';
const clone = value => structuredClone(value);
const growth = records => ({ version: 1, profile: { name: '小芽', birthDate: '2025-01-01' }, records: records ?? {} });
const envelope = (snapshot, revision = 'r1') => ({ snapshot: clone(snapshot), revision, savedAt });
const microtasks = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };
const failure = (base, local, remote) => Object.assign(new Error('同一字段存在不同修改'), {
  code: 'MERGE_CONFLICT', base: clone(base), local: clone(local), remote: clone(remote), revision: 'r2', savedAt,
  conflicts: mergeGrowthSnapshots(base, local, remote).conflicts,
});

function harness(initial = growth(), debounceMs = 100) {
  let local = clone(initial);
  const calls = [];
  const statuses = [];
  const conflicts = [];
  const store = { save(snapshot, base) {
    const call = { snapshot: clone(snapshot), base: clone(base) };
    call.promise = new Promise((resolve, reject) => Object.assign(call, { resolve, reject }));
    calls.push(call);
    return call.promise;
  } };
  const queue = createSaveQueue({
    store, getSnapshot: () => local, applySnapshot: next => { local = clone(next); },
    onStatus: status => statuses.push(status), onConflict: conflict => conflicts.push(conflict), debounceMs,
  });
  queue.adopt(envelope(initial));
  return {
    queue, calls, statuses, conflicts,
    get local() { return local; },
    set local(value) { local = clone(value); },
    get status() { return statuses.at(-1); },
  };
}

test('状态比较按字段忽略顺序及没有内容的记录，但区分完成日期与手记', () => {
  assert.equal(sameGrowth(growth({ a: { note: '记录', completedAt: day }, b: { note: '' } }), growth({ a: { completedAt: day, note: '记录' } })), true);
  assert.equal(sameGrowth(growth({ a: { completedAt: day } }), growth()), false);
  assert.equal(sameGrowth(growth({ a: { note: '记录' } }), growth({ a: { note: '不同记录' } })), false);
  assert.equal(sameGrowth(null, null), true);
  assert.equal(sameGrowth(null, growth()), false);
});

test('请求期间编辑会重放到服务端规范版本，串行保存并保持两个设备的修改', { timeout: 1000 }, async () => {
  const h = harness();
  h.local = growth({ a: { completedAt: day } });
  const first = h.queue.request();
  assert.equal(h.calls.length, 1);
  h.local = growth({ a: { completedAt: day, note: '在请求期间补充' } });
  const second = h.queue.request();
  assert.equal(h.calls.length, 1);
  const canonical = growth({ a: { completedAt: day }, b: { note: '另一设备记录' } });
  h.calls[0].resolve(envelope(canonical, 'r2'));
  await microtasks();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].base, canonical);
  assert.deepEqual(h.calls[1].snapshot.records, { a: { completedAt: day, note: '在请求期间补充' }, b: { note: '另一设备记录' } });
  assert.equal(await first, true);
  assert.equal(h.status.pending, true);
  assert.equal(h.status.dirty, true);
  h.calls[1].resolve(envelope(h.calls[1].snapshot, 'r3'));
  assert.equal(await second, true);
  await microtasks();
  assert.deepEqual(h.local, h.calls[1].snapshot);
  assert.deepEqual(h.queue.getBase(), h.local);
  assert.deepEqual(h.status, { pending: false, dirty: false, error: null, savedAt });
});

test('在途期间请求多次但最终状态相同，所有等待者都结束且不额外保存', { timeout: 1000 }, async () => {
  const h = harness();
  const completed = growth({ a: { completedAt: day } });
  h.local = completed;
  const first = h.queue.request();
  h.local = growth();
  const second = h.queue.request();
  h.local = completed;
  const third = h.queue.request();
  const flushed = h.queue.flush();
  h.calls[0].resolve(envelope(completed));
  assert.deepEqual(await Promise.all([first, second, third, flushed]), [true, true, true, true]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.status.pending, false);
  assert.equal(h.status.dirty, false);
});

test('连续手记输入在防抖窗口结束后只保存最新内容，flush立即提交', { timeout: 1000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  h.local = growth({ a: { note: '第' } });
  const first = h.queue.request({ debounce: true });
  t.mock.timers.tick(60);
  h.local = growth({ a: { note: '第一次做到了' } });
  const second = h.queue.request({ debounce: true });
  t.mock.timers.tick(99);
  assert.equal(h.calls.length, 0);
  assert.equal(h.status.pending, true);
  const flushed = h.queue.flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].snapshot.records.a.note, '第一次做到了');
  h.calls[0].resolve(envelope(h.calls[0].snapshot));
  assert.deepEqual(await Promise.all([first, second, flushed]), [true, true, true]);
  t.mock.timers.tick(1000);
  assert.equal(h.calls.length, 1);
});

test('网络期间的新手记也等待最后一次输入的防抖窗口，不逐字符提交', { timeout: 1000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  h.local = growth({ a: { completedAt: day } });
  const first = h.queue.request();
  h.local = growth({ a: { completedAt: day, note: '新的手记' } });
  const second = h.queue.request({ debounce: true });
  t.mock.timers.tick(40);
  h.calls[0].resolve(envelope(growth({ a: { completedAt: day } })));
  await microtasks();
  assert.equal(await first, true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.status.pending, true);
  t.mock.timers.tick(59);
  assert.equal(h.calls.length, 1);
  t.mock.timers.tick(1);
  assert.equal(h.calls.length, 2);
  h.calls[1].resolve(envelope(h.calls[1].snapshot, 'r2'));
  assert.equal(await second, true);
});

test('防抖窗口在网络期间已结束时，请求返回后继续提交，不遗漏等待者', { timeout: 1000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  h.local = growth({ a: { completedAt: day } });
  const first = h.queue.request();
  h.local = growth({ a: { completedAt: day }, b: { note: '新编辑' } });
  const second = h.queue.request({ debounce: true });
  t.mock.timers.tick(100);
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve(envelope(growth({ a: { completedAt: day } })));
  await microtasks();
  assert.equal(h.calls.length, 2);
  h.calls[1].resolve(envelope(h.calls[1].snapshot, 'r2'));
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
});

test('保存失败保留最新编辑、停止旧计时器；明确重试按原基线提交最新状态', { timeout: 1000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const base = growth({ a: { completedAt: day } });
  const h = harness(base);
  h.local = growth();
  const first = h.queue.request();
  h.local = growth({ a: { note: '回退时补充说明' } });
  const second = h.queue.request({ debounce: true });
  const networkError = Object.assign(new Error('离线'), { code: 'NETWORK_ERROR' });
  h.calls[0].reject(networkError);
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.deepEqual(h.local, growth({ a: { note: '回退时补充说明' } }));
  assert.equal(h.status.pending, false);
  assert.equal(h.status.dirty, true);
  assert.equal(h.status.error, networkError);
  t.mock.timers.tick(1000);
  assert.equal(h.calls.length, 1);
  const retry = h.queue.flush();
  assert.deepEqual(h.calls[1].base, base);
  assert.deepEqual(h.calls[1].snapshot, h.local);
  h.calls[1].resolve(envelope(h.calls[1].snapshot, 'r2'));
  assert.equal(await retry, true);
  assert.equal(h.status.error, null);
  assert.equal(h.status.dirty, false);
});

test('云端冲突使用请求期间的最新编辑，保留错误消息并等待明确解决', { timeout: 1000 }, async () => {
  const base = growth({ a: { note: '原手记' } });
  const h = harness(base);
  const sent = growth({ a: { note: '第一版本地手记' } });
  h.local = sent;
  const first = h.queue.request();
  const latest = growth({ a: { note: '最终本地手记' }, b: { completedAt: day } });
  h.local = latest;
  const second = h.queue.request();
  const remote = growth({ a: { note: '云端手记' } });
  h.calls[0].reject(failure(base, sent, remote));
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.deepEqual(h.local, latest);
  assert.equal(h.calls.length, 1);
  assert.equal(h.conflicts.length, 1);
  assert.ok(h.conflicts[0] instanceof Error);
  assert.equal(h.conflicts[0].message, '同一字段存在不同修改');
  assert.deepEqual(h.conflicts[0].local, latest);
  assert.equal(h.conflicts[0].conflicts[0].local, '最终本地手记');
  const resolved = mergeGrowthSnapshots(base, latest, remote, { 'records.a.note': 'remote' }).snapshot;
  h.queue.adopt(envelope(remote, 'r2'), resolved);
  const retry = h.queue.request();
  assert.deepEqual(h.calls[1].base, remote);
  assert.deepEqual(h.calls[1].snapshot.records, { a: { note: '云端手记' }, b: { completedAt: day } });
  h.calls[1].resolve(envelope(h.calls[1].snapshot, 'r3'));
  assert.equal(await retry, true);
});

test('旧请求报告冲突时最新编辑已与云端一致，自动接受确认并结束所有等待者', { timeout: 1000 }, async () => {
  const base = growth({ a: { note: '原手记' } });
  const h = harness(base);
  const sent = growth({ a: { note: '旧本地手记' } });
  h.local = sent;
  const first = h.queue.request();
  const remote = growth({ a: { note: '已知云端手记' } });
  h.local = remote;
  const second = h.queue.request();
  h.calls[0].reject(failure(base, sent, remote));
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(h.conflicts.length, 0);
  assert.equal(h.calls.length, 1);
  assert.equal(h.status.dirty, false);
  assert.deepEqual(h.queue.getBase(), remote);
});

test('旧冲突已被最新编辑解决时，继续保存尚未确认的其他编辑', { timeout: 1000 }, async () => {
  const base = growth({ a: { note: '原手记' } });
  const h = harness(base);
  const sent = growth({ a: { note: '旧本地手记' } });
  h.local = sent;
  const first = h.queue.request();
  const remote = growth({ a: { note: '云端手记' } });
  h.local = growth({ a: { note: '云端手记' }, b: { completedAt: day } });
  const second = h.queue.request();
  h.calls[0].reject(failure(base, sent, remote));
  await microtasks();
  assert.equal(h.conflicts.length, 0);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].base, remote);
  assert.deepEqual(h.calls[1].snapshot, h.local);
  h.calls[1].resolve(envelope(h.local, 'r3'));
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
});

test('成功确认期间的新编辑与云端新增值冲突时，不覆盖本地且基线保持真实确认版', { timeout: 1000 }, async () => {
  const h = harness();
  const sent = growth({ a: { completedAt: day } });
  h.local = sent;
  const first = h.queue.request();
  const latest = growth({ a: { completedAt: day }, b: { note: '新的本地手记' } });
  h.local = latest;
  const second = h.queue.request();
  const canonical = growth({ a: { completedAt: day }, b: { note: '另一个设备的新手记' } });
  h.calls[0].resolve(envelope(canonical, 'r2'));
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.deepEqual(h.local, latest);
  assert.deepEqual(h.queue.getBase(), canonical);
  assert.equal(h.conflicts.length, 1);
  assert.equal(h.conflicts[0].conflicts[0].key, 'records.b.note');
  assert.equal(h.status.dirty, true);
  assert.equal(h.status.pending, false);
});

test('adopt取消尚未发出的请求，不触发写入且getBase不泄漏可变引用', { timeout: 1000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  h.local = growth({ a: { note: '尚未发出的手记' } });
  const pending = h.queue.request({ debounce: true });
  const remote = growth({ b: { completedAt: day } });
  h.queue.adopt(envelope(remote, 'r2'));
  assert.equal(await pending, false);
  assert.deepEqual(h.local, remote);
  assert.equal(h.status.dirty, false);
  t.mock.timers.tick(1000);
  assert.equal(h.calls.length, 0);
  const leaked = h.queue.getBase();
  leaked.records.b.completedAt = '2026-01-01';
  assert.deepEqual(h.queue.getBase(), remote);
  h.local = growth({ b: { completedAt: day }, c: { note: '新手记' } });
  const next = h.queue.request();
  assert.throws(() => h.queue.adopt(envelope(growth())), /等待当前云端请求/);
  h.calls[0].resolve(envelope(h.local));
  assert.equal(await next, true);
});
