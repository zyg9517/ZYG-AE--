const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHostApi } = require('../../cep/host-api.js');

const asset = { projectItemId: 19, itemName: '素材', sourceName: 'clip.mov', absolutePath: 'C:\\片段\\clip.mov', sourceType: 'file', pathStatus: 'exists' };

test('loads validated assets through the fixed namespaced host call', async () => {
  const scripts = [];
  const api = createHostApi({ csInterface: { evalScript(script, callback) {
    scripts.push(script);
    callback(JSON.stringify({ ok: true, assets: [asset] }));
  } } });
  assert.deepEqual(await api.loadAssets(), [asset]);
  assert.deepEqual(scripts, ['ZYGAssetWorkbench.collectAssetRecords()']);
});

test('selection validates ids before evaluation and returns structured outcomes', async () => {
  const scripts = [];
  const api = createHostApi({ csInterface: { evalScript(script, callback) { scripts.push(script); callback('{"ok":true}'); } } });
  for (const id of [0, -1, 1.5, Infinity, NaN, '19', '1);evil()', null, undefined]) {
    assert.equal((await api.selectItem(id)).code, 'INVALID_ITEM_ID');
  }
  assert.deepEqual(scripts, []);
  assert.deepEqual(await api.selectItem(19), { ok: true });
  assert.deepEqual(scripts, ['ZYGAssetWorkbench.selectProjectItem(19)']);
});

test('host errors reject collection and are returned by selection', async () => {
  const failure = { ok: false, code: 'STALE_PROJECT', message: 'Refresh the asset list.' };
  const api = createHostApi({ csInterface: { evalScript(script, callback) { callback(JSON.stringify(failure)); } } });
  await assert.rejects(api.loadAssets(), { code: failure.code, message: failure.message });
  assert.deepEqual(await api.selectItem(19), failure);
});

test('malformed envelopes are protocol errors for collection and selection', async () => {
  for (const raw of ['not json', '{"ok":true}', '{"ok":false}', '{"ok":true,"assets":[{}]}']) {
    const api = createHostApi({ csInterface: { evalScript(script, callback) { callback(raw); } } });
    await assert.rejects(api.loadAssets(), { code: 'PROTOCOL_ERROR' });
  }
  const api = createHostApi({ csInterface: { evalScript(script, callback) { callback('{"ok":false}'); } } });
  assert.equal((await api.selectItem(19)).code, 'PROTOCOL_ERROR');
});

test('native evaluation failure and unavailable CEP are structured errors', async () => {
  for (const csInterface of [
    { evalScript(script, callback) { callback('EvalScript error.'); } },
    { evalScript() { throw new Error('native unavailable'); } }
  ]) {
    const api = createHostApi({ csInterface });
    await assert.rejects(api.loadAssets(), { code: 'HOST_EVAL_ERROR' });
    assert.equal((await api.selectItem(19)).code, 'HOST_EVAL_ERROR');
  }
  await assert.rejects(createHostApi({}).loadAssets(), { code: 'HOST_UNAVAILABLE' });
});

test('evaluation has a bounded timeout and late callbacks cannot change the outcome', async () => {
  let callback;
  const api = createHostApi({ csInterface: { evalScript(script, cb) { callback = cb; } }, timeoutMs: 10 });
  await assert.rejects(api.loadAssets(), { code: 'HOST_TIMEOUT' });
  callback('{"ok":true,"assets":[]}');
  assert.equal((await api.selectItem(19)).code, 'HOST_TIMEOUT');
  assert.throws(() => createHostApi({ timeoutMs: 0 }), { code: 'INVALID_TIMEOUT' });
  assert.throws(() => createHostApi({ timeoutMs: Infinity }), { code: 'INVALID_TIMEOUT' });
});

test('browser UMD bridge uses CSInterface and host contract without Node globals', async () => {
  const scripts = [];
  const context = vm.createContext({ setTimeout, clearTimeout, CSInterface: function () {
    this.evalScript = function (script, callback) { scripts.push(script); callback('{"ok":true,"assets":[]}'); };
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../../cep/core/host-contract.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../../cep/host-api.js'), 'utf8'), context);
  assert.equal((await context.ZYGHostApi.loadAssets()).length, 0);
  assert.deepEqual(scripts, ['ZYGAssetWorkbench.collectAssetRecords()']);
});
