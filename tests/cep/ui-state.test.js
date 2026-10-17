const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { assets } = require('../fixtures/assets.js');
const { deriveViewState } = require('../../cep/core/ui-state.js');
const { createApp } = require('../../cep/app.js');

// Only the DOM boundary is substituted; production renders its own nodes and binds events.
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {};
    this.listeners = {}; this.value = ''; this.disabled = false; this.hidden = false;
    this._text = '';
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  dispatch(name) {
    if (this.disabled) return;
    for (const listener of this.listeners[name] || []) listener({ preventDefault() {} });
  }
}
function makeDocument() {
  const nodes = {};
  const html = fs.readFileSync(require.resolve('../../cep/index.html'), 'utf8');
  for (const [, tag, attributes, id] of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    const node = nodes[id] = new Element(tag);
    for (const [, name, value] of attributes.matchAll(/([a-z-]+)="([^"]*)"/gi)) node.setAttribute(name, value);
  }
  return { getElementById: id => nodes[id] || null, createElement: tag => new Element(tag) };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(overrides = {}) {
  const calls = { load: 0, select: [], copy: [], reveal: [] };
  const document = makeDocument();
  const host = {
    loadAssets() { calls.load++; return Promise.resolve(assets); },
    selectItem(id) { calls.select.push(id); return Promise.resolve({ ok: true }); },
    ...overrides.host
  };
  const paths = {
    copy(path) { calls.copy.push(path); return Promise.resolve(); },
    reveal(path, status) { calls.reveal.push([path, status]); },
    ...overrides.paths
  };
  const app = createApp(document, host, paths);
  return { app, calls, document, node: id => document.getElementById(id) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const buttons = row => row.children[5].children;

test('view state counts supported assets and empty query returns all supported records', () => {
  const ignored = { ...assets[0], projectItemId: 3, pathStatus: 'not_applicable', absolutePath: null };
  const view = deriveViewState([...assets, ignored], '');
  assert.equal(view.state, 'ready'); assert.equal(view.totalCount, 2); assert.equal(view.matchedCount, 2);
  assert.equal(view.query, ''); assert.deepEqual(view.rows.map(row => row.record), assets);
});
test('no match preserves original query and loaded count', () => {
  const view = deriveViewState(assets, '  absent  ');
  assert.equal(view.state, 'no_match'); assert.equal(view.query, '  absent  ');
  assert.equal(view.totalCount, 2); assert.equal(view.matchedCount, 0); assert.deepEqual(view.rows, []);
  assert.equal(deriveViewState([], 'absent').state, 'empty');
});
test('missing and unreadable paths remain copyable but never revealable', () => {
  const view = deriveViewState([...assets, { ...assets[0], absolutePath: null, pathStatus: 'unreadable' }], '');
  assert.deepEqual(view.rows.map(row => [row.canCopy, row.canReveal]), [[true, true], [true, false], [false, false]]);
});
test('init renders real field text, count, statuses and enabled actions', async () => {
  const f = fixture(); await f.app.init();
  assert.equal(f.calls.load, 1); assert.match(f.node('status').textContent, /2/);
  const rows = f.node('results').children;
  assert.equal(rows.length, 2); assert.match(rows[0].textContent, /Tree_01/);
  assert.equal(rows[0].children[2].textContent, 'C:\\Media\\tree.png');
  assert.match(rows[1].textContent, /序列素材/); assert.match(rows[1].textContent, /缺失/);
  assert.equal(buttons(rows[0])[2].disabled, false); assert.equal(buttons(rows[1])[2].disabled, true);
  buttons(rows[1])[2].dispatch('click'); assert.deepEqual(f.calls.reveal, []);
});
test('form submit searches input and clear resets the actual input and rows', async () => {
  const f = fixture(); await f.app.init(); f.node('query').value = 'SHOT';
  f.node('search-form').dispatch('submit');
  assert.equal(f.node('results').children.length, 1); assert.match(f.node('results').textContent, /Lost shot/);
  f.node('query').value = 'absent'; f.node('search-form').dispatch('submit');
  assert.match(f.node('status').textContent, /未找到匹配素材/); assert.equal(f.node('query').value, 'absent');
  f.node('clear').dispatch('click');
  assert.equal(f.node('query').value, ''); assert.equal(f.node('results').children.length, 2);
});
test('separate buttons adapt selection, exact full path copy, and reveal without row click interference', async () => {
  const f = fixture(); await f.app.init(); const row = f.node('results').children[0];
  row.children[2].dispatch('click'); assert.deepEqual(f.calls.select, []);
  buttons(row)[0].dispatch('click'); buttons(row)[1].dispatch('click'); buttons(row)[2].dispatch('click');
  assert.deepEqual(f.calls.select, [1]); assert.deepEqual(f.calls.copy, ['C:\\Media\\tree.png']);
  assert.deepEqual(f.calls.reveal, [['C:\\Media\\tree.png', 'exists']]); await settle();
  assert.match(f.node('action-message').textContent, /已/);
});
test('asset data is text and long paths are preserved with no HTML interpretation', async () => {
  const path = 'C:\\素材\\' + 'long folder\\'.repeat(70) + 'a.png';
  const f = fixture({ host: { loadAssets: () => Promise.resolve([{ ...assets[0], itemName: '<img src=x onerror=alert(1)>', absolutePath: path }]) } });
  await f.app.init(); const row = f.node('results').children[0];
  assert.equal(row.children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(row.children[0].children.length, 0); assert.equal(row.children[2].textContent, path);
  buttons(row)[1].dispatch('click'); assert.deepEqual(f.calls.copy, [path]); await settle();
});
test('refresh disables existing actions immediately and ignores stale load settlements', async () => {
  const older = deferred(), newer = deferred(); let count = 0;
  const f = fixture({ host: { loadAssets: () => ++count === 1 ? Promise.resolve(assets) : count === 2 ? older.promise : newer.promise } }); await f.app.init();
  const first = f.app.refresh();
  for (const button of buttons(f.node('results').children[0])) assert.equal(button.disabled, true);
  await f.app.select(assets[0]); await f.app.copy(assets[0]); await f.app.reveal(assets[0]);
  assert.deepEqual(f.calls.select, []); assert.deepEqual(f.calls.copy, []); assert.deepEqual(f.calls.reveal, []);
  const second = f.app.refresh(); newer.resolve([assets[1]]); await second;
  older.resolve([assets[0]]); await first;
  assert.equal(f.node('results').children.length, 1); assert.match(f.node('results').textContent, /Lost shot/);
});
test('load failure clears stale rows and explicit retry recovers without auto retry', async () => {
  const failed = deferred(); let calls = 0;
  const f = fixture({ host: { loadAssets() { calls++; return calls === 2 ? failed.promise : Promise.resolve(assets); } } });
  await f.app.init();
  const load = f.app.refresh(); failed.reject(Object.assign(Error('bridge missing'), { code: 'HOST_UNAVAILABLE' })); await load;
  assert.equal(f.node('results').children.length, 0); assert.match(f.node('status').textContent, /AE2020/);
  assert.equal(f.node('refresh').textContent, '重试'); await settle(); assert.equal(calls, 2);
  await f.app.search(); assert.equal(calls, 3); assert.equal(f.node('results').children.length, 2);
});
test('empty project and no project are explicit states; synchronous host errors are handled', async () => {
  const empty = fixture({ host: { loadAssets: () => Promise.resolve([]) } }); await empty.app.init();
  assert.match(empty.node('status').textContent, /没有可检索的文件素材/);
  const absent = fixture({ host: { loadAssets() { throw Object.assign(Error('none'), { code: 'NO_PROJECT' }); } } });
  await absent.app.init(); assert.match(absent.node('status').textContent, /打开.*项目/);
});
test('clipboard and reveal failures show recoverable messages without reloading', async () => {
  const f = fixture({ paths: { copy: () => Promise.reject(Error('clipboard')), reveal() { throw Error('explorer'); } } });
  await f.app.init(); buttons(f.node('results').children[0])[1].dispatch('click'); await settle();
  assert.match(f.node('action-message').textContent, /复制.*失败/);
  buttons(f.node('results').children[0])[2].dispatch('click'); await settle();
  assert.match(f.node('action-message').textContent, /打开.*失败/); assert.equal(f.calls.load, 1);
});
test('selection host failures are visible and refresh reloads current assets', async () => {
  const f = fixture({ host: { selectItem: () => Promise.resolve({ ok: false, code: 'ITEM_NOT_FOUND', message: 'gone' }) } });
  await f.app.init(); buttons(f.node('results').children[0])[0].dispatch('click'); await settle();
  assert.match(f.node('action-message').textContent, /选中.*失败/); assert.equal(f.calls.load, 1);
  f.node('refresh').dispatch('click'); await settle(); assert.equal(f.calls.load, 2);
});
test('older load failures and late action errors cannot replace newer results/status', async () => {
  const old = deferred(), latest = deferred(), action = deferred(); let count = 0;
  const f = fixture({ host: { loadAssets: () => ++count === 1 ? Promise.resolve(assets) : count === 2 ? old.promise : latest.promise, selectItem: () => action.promise } });
  await f.app.init(); const selecting = f.app.select(assets[0]);
  const first = f.app.refresh(), second = f.app.refresh(); latest.resolve([assets[1]]); await second;
  old.reject(Error('old load')); action.reject(Error('old action')); await Promise.all([first, selecting]);
  assert.match(f.node('results').textContent, /Lost shot/); assert.equal(f.node('action-message').textContent, '');
  assert.doesNotMatch(f.node('status').textContent, /失败/);
});
test('CommonJS import never bootstraps even if document exists', () => {
  const context = { module: { exports: {} }, require: ref => require('../../cep/' + ref), document: new Proxy({}, { get() { throw Error('unexpected DOM access'); } }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../cep/app.js'), 'utf8'), context);
  assert.equal(typeof context.module.exports.createApp, 'function');
});
test('browser globals bootstrap after DOM ready and render validated bridge data without Node globals', async () => {
  const document = makeDocument(); const scripts = []; let ready;
  document.readyState = 'loading';
  document.addEventListener = (name, handler) => { assert.equal(name, 'DOMContentLoaded'); ready = handler; };
  const context = vm.createContext({ document, setTimeout, clearTimeout, CSInterface: function () {
    this.evalScript = (script, callback) => { scripts.push(script); callback(JSON.stringify({ ok: true, assets })); };
  } });
  for (const file of ['core/host-contract.js', 'core/asset-search.js', 'core/ui-state.js', 'host-api.js', 'path-actions.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(require.resolve('../../cep/' + file), 'utf8'), context);
  }
  assert.deepEqual(scripts, []); ready(); await settle();
  assert.deepEqual(scripts, ['ZYGAssetWorkbench.collectAssetRecords()']);
  assert.equal(document.getElementById('results').children.length, 2);
  assert.match(document.getElementById('status').textContent, /2/);
});
