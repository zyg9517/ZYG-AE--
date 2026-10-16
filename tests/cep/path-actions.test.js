const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createPathActions, toFileUrl } = require('../../cep/path-actions.js');

// The boundary double replaces only the browser clipboard side effect.
function clipboardDocument(result, thrown) {
  const state = { nodes: [], restored: false, copied: null };
  const document = {
    activeElement: { focus() { state.restored = true; } },
    body: {
      appendChild(node) { state.nodes.push(node); node.parentNode = this; },
      removeChild(node) { state.nodes.splice(state.nodes.indexOf(node), 1); node.parentNode = null; }
    },
    createElement(tag) {
      assert.equal(tag, 'textarea');
      return { style: {}, setAttribute() {}, select() { state.selected = this; } };
    },
    execCommand(command) {
      assert.equal(command, 'copy');
      state.copied = state.selected.value;
      if (thrown) throw thrown;
      return result;
    }
  };
  return { document, state };
}

test('copy preserves long Unicode, whitespace and quotes and cleans up synchronously', async () => {
  const { document, state } = clipboardDocument(true);
  const actions = createPathActions({ document });
  const original = '  C:\\中文 & "素材"\\' + 'very long\\'.repeat(40) + '镜头.mov  ';
  const completion = actions.copy(original);
  assert.equal(state.copied, original, 'execCommand runs within the initiating click stack');
  assert.deepEqual(state.nodes, []);
  assert.equal(state.restored, true);
  assert.equal(await completion, undefined);
});

test('copy rejects empty paths before touching the clipboard', async () => {
  const { document, state } = clipboardDocument(true);
  const actions = createPathActions({ document });
  for (const input of ['', '  ', null, undefined]) {
    await assert.rejects(actions.copy(input), { code: 'INVALID_PATH' });
  }
  assert.equal(state.copied, null);
});

test('copy exposes clipboard failures and always removes its textarea and restores focus', async () => {
  const domError = Object.assign(new Error('browser denied clipboard access'), { code: 18 });
  for (const failure of [false, new Error('denied'), domError]) {
    const { document, state } = clipboardDocument(false, failure instanceof Error ? failure : null);
    await assert.rejects(createPathActions({ document }).copy('C:\\asset.mov'), { code: 'CLIPBOARD_ERROR' });
    assert.deepEqual(state.nodes, []);
    assert.equal(state.restored, true);
  }
  await assert.rejects(createPathActions({}).copy('C:\\asset.mov'), { code: 'CLIPBOARD_UNAVAILABLE' });
});

test('file URLs encode Windows folder content without trimming valid whitespace', () => {
  assert.equal(toFileUrl('C:\\素材 & "取景"\\100% #1'), 'file:///C:/%E7%B4%A0%E6%9D%90%20%26%20%22%E5%8F%96%E6%99%AF%22/100%25%20%231');
  assert.equal(toFileUrl('d:\\trailing space '), 'file:///d:/trailing%20space%20');
  assert.equal(toFileUrl('E:\\'), 'file:///E:/');
  assert.equal(toFileUrl("C:/a?b/'x'"), 'file:///C:/a%3Fb/%27x%27');
});

test('file URLs reject empty, relative, UNC, device and control-character paths', () => {
  for (const input of ['', '  ', null, 'media\\asset', 'C:asset', '\\\\server\\share', '\\\\?\\C:\\asset', 'https://example.test', ' C:\\folder', 'C:\\a\n']) {
    assert.throws(() => toFileUrl(input), { code: 'INVALID_PATH' });
  }
});

test('reveal trims only the containing-folder calculation and passes a separate native argument', () => {
  const calls = [];
  const actions = createPathActions({ cep: { process: { createProcess(...args) { calls.push(args); return { err: 0, data: 42 }; } } } });
  assert.equal(actions.reveal('  C:\\素材 & "取景"\\片段.mov  ', 'exists'), undefined);
  actions.reveal('C:\\clip.mov', 'exists');
  assert.deepEqual(calls, [
    ['C:\\Windows\\explorer.exe', 'C:\\素材 & "取景"'],
    ['C:\\Windows\\explorer.exe', 'C:\\']
  ]);
});

test('reveal blocks unavailable statuses and unsupported paths before native execution', () => {
  let calls = 0;
  const actions = createPathActions({ cep: { process: { createProcess() { calls += 1; } } } });
  for (const status of ['missing', 'unreadable', 'not_applicable', undefined]) {
    assert.throws(() => actions.reveal('C:\\clip.mov', status), { code: 'PATH_UNAVAILABLE' });
  }
  for (const input of ['', 'C:clip.mov', '\\\\server\\share\\clip.mov', '\\\\?\\C:\\clip.mov']) {
    assert.throws(() => actions.reveal(input, 'exists'), { code: 'INVALID_PATH' });
  }
  assert.equal(calls, 0);
});

test('reveal reports unavailable native API, native errors and invalid process results', () => {
  assert.throws(() => createPathActions({}).reveal('C:\\clip.mov', 'exists'), { code: 'REVEAL_UNAVAILABLE' });
  for (const result of [{ err: 3, data: -1 }, { err: 0, data: -1 }, { err: 0, data: NaN }, { err: 0, data: Infinity }, null, {}]) {
    const actions = createPathActions({ cep: { process: { createProcess() { return result; } } } });
    assert.throws(() => actions.reveal('C:\\clip.mov', 'exists'), { code: 'REVEAL_ERROR' });
  }
  const actions = createPathActions({ cep: { process: { createProcess() { throw new Error('native failure'); } } } });
  assert.throws(() => actions.reveal('C:\\clip.mov', 'exists'), { code: 'REVEAL_ERROR' });
});

test('browser UMD path actions run without Node or modern clipboard APIs', async () => {
  const boundary = clipboardDocument(true);
  const context = vm.createContext({ document: boundary.document });
  vm.runInContext(fs.readFileSync(require.resolve('../../cep/path-actions.js'), 'utf8'), context);
  assert.equal(context.ZYGPathActions.toFileUrl('C:\\a b'), 'file:///C:/a%20b');
  await context.ZYGPathActions.copy(' exact text ');
  assert.equal(boundary.state.copied, ' exact text ');
});
