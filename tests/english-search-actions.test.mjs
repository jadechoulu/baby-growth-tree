import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const app = await readFile(new URL('../english/app.js', import.meta.url), 'utf8');
const actions = app.slice(app.indexOf('function focusEnglishSearch(){'), app.indexOf('function englishActions(){'));

test('英语输入继续素材筛选；回车和空列表提问入口传入同一句话，输入法确认不提问', () => {
  const calls = [], input = { value: '许密杉和庆爸' }, state = { search: '', view: 'library' };
  const context = {
    S: state, libraryCollection: 'all',
    document: { getElementById: () => input, querySelector: () => ({ replaceWith: () => calls.push('filter') }) },
    window: { XiaoyaSiteSearch: { open: options => calls.push(options) } },
    libraryResults() {}, updateLibraryUsageToggle() {},
  };
  vm.runInNewContext(actions, context);
  context.applyEnglishSearch({ target: input }); assert.deepEqual(calls, ['filter']);
  assert.equal(state.search, input.value);
  context.askEnglishSearch({ key: 'Enter', isComposing: true });
  context.askEnglishSearch({ key: 'Enter', keyCode: 229 });
  context.askEnglishSearch({ key: 'a' }); assert.equal(calls.length, 1);
  let prevented = false;
  context.askEnglishSearch({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(calls[1].query, input.value); assert.equal(calls[1].submit, true); assert.equal(calls[1].focus, input);
  context.askEnglishSearch(); assert.equal(calls[2].query, input.value);
});
