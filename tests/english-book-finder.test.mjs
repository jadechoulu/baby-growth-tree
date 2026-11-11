import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const app = await readFile(new URL('../english/app.js', import.meta.url), 'utf8');
const actions = app.slice(app.indexOf('const BOOK_FINDERS='), app.indexOf('function englishActions(){'));
function setup({ authenticated = true, accounts = async () => ({ accounts: { epic: 'fake-account@example.test' } }) } = {}) {
  const writes = [], notices = [], state = { modal: { kind: 'book-finder' } };
  let reads = 0;
  const context = { S: state, document: {}, overlay: { contains: () => false }, window: {}, navigator: { clipboard: { async writeText(value) { writes.push(value); } } },
    renderModal() {}, toast(value) { notices.push(value); },
    siteSync: { async getState() { return { authenticated }; }, async bookFinderAccounts() { reads++; return accounts(); } },
  };
  vm.runInNewContext(actions, context);
  return { context, state, writes, notices, reads: () => reads };
}
const button = () => ({ disabled: false, isConnected: true, setAttribute() {}, removeAttribute() {} });

test('匿名找书不读取私人账号；本人只保留入口可用性，不把账号写入页面状态', async () => {
  const anonymous = setup({ authenticated: false });
  await anonymous.context.loadBookFinder(anonymous.state.modal);
  assert.equal(anonymous.reads(), 0);
  const owner = setup(); await owner.context.loadBookFinder(owner.state.modal);
  assert.deepEqual(Array.from(owner.state.modal.available), ['epic']);
  assert.doesNotMatch(JSON.stringify(owner.state), /fake-account/);
});

test('关闭后以及退出导致的新请求之后，旧找书响应不再启用复制', async () => {
  let finish;
  const h = setup({ accounts: () => new Promise(resolve => { finish = resolve; }) });
  const modal = h.state.modal;
  const load = h.context.loadBookFinder(modal); await new Promise(resolve => setImmediate(resolve));
  h.state.modal = null;
  finish({ accounts: { epic: 'fake-late' } }); await load;
  assert.equal(modal.available.length, 0);
  h.state.modal = modal;
  const old = h.context.loadBookFinder(modal); await new Promise(resolve => setImmediate(resolve));
  const oldFinish = finish;
  const fresh = h.context.loadBookFinder(modal); await new Promise(resolve => setImmediate(resolve));
  finish({ accounts: {} }); await fresh;
  oldFinish({ accounts: { epic: 'fake-late' } }); await old;
  assert.equal(modal.available.length, 0);
});

test('点击复制重新实时读取，关闭期间不复制；读取失败不使用旧账号', async () => {
  let current = 'fake-first';
  const h = setup({ accounts: async () => ({ accounts: { epic: current } }) });
  await h.context.loadBookFinder(h.state.modal); current = 'fake-updated';
  await h.context.copyBookFinderAccount('epic', { currentTarget: button() });
  assert.deepEqual(h.writes, ['fake-updated']); assert.equal(h.reads(), 2);
  let finish;
  const pending = setup({ accounts: () => new Promise(resolve => { finish = resolve; }) });
  pending.state.modal.available = ['epic'];
  const copy = pending.context.copyBookFinderAccount('epic', { currentTarget: button() });
  pending.state.modal = null; finish({ accounts: { epic: 'fake-late' } }); await copy;
  assert.deepEqual(pending.writes, []);
  const failed = setup({ accounts: async () => { throw Object.assign(new Error('expired'), { code: 'AUTH_REQUIRED' }); } });
  failed.state.modal.available = ['epic'];
  await failed.context.copyBookFinderAccount('epic', { currentTarget: button() });
  assert.deepEqual(failed.writes, []);
});
