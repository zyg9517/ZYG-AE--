const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assets } = require('../fixtures/assets.js');
const { parseHostResponse } = require('../../cep/core/host-contract.js');

function rejectsProtocol(payload, operation = 'collect') {
  assert.throws(() => parseHostResponse(payload, operation), error =>
    error.code === 'PROTOCOL_ERROR' && typeof error.message === 'string');
}

test('parses collection records without losing missing source paths or stable item ids', () => {
  assert.deepEqual(parseHostResponse(JSON.stringify({ ok: true, assets }), 'collect'), { ok: true, assets });
  const missing = parseHostResponse(JSON.stringify({ ok: true, assets: [{
    ...assets[0], projectItemId: 901, absolutePath: 'D:\\Lost\\frame0001.exr', pathStatus: 'missing'
  }] }), 'collect').assets[0];
  assert.equal(missing.projectItemId, 901);
  assert.equal(missing.absolutePath, 'D:\\Lost\\frame0001.exr');
  assert.equal(missing.pathStatus, 'missing');
});

test('accepts structured host errors and operation-specific select success', () => {
  const error = { ok: false, code: 'NO_PROJECT', message: 'No project is open.' };
  assert.deepEqual(parseHostResponse(JSON.stringify(error), 'collect'), error);
  assert.deepEqual(parseHostResponse('{"ok":true}', 'select'), { ok: true });
  rejectsProtocol('{"ok":true}');
});

test('rejects malformed transport envelopes and incomplete errors', () => {
  for (const raw of [null, {}, 'EvalScript error.', 'null', '[]', '{}', '{"ok":1}', '{"ok":false,"code":"NO_PROJECT"}', '{"ok":false,"code":"","message":"bad"}']) {
    rejectsProtocol(raw);
  }
  rejectsProtocol('{"ok":true,"assets":[]}', 'unknown');
});

test('rejects invalid record fields, unstable ids, and duplicate ids', () => {
  for (const patch of [
    { projectItemId: '1' }, { projectItemId: 0 }, { projectItemId: 1.5 },
    { projectItemId: Infinity }, { itemName: null }, { sourceName: null },
    { absolutePath: 42 }, { absolutePath: null, pathStatus: 'missing' },
    { sourceType: '' }, { pathStatus: 'unknown' }
  ]) {
    rejectsProtocol(JSON.stringify({ ok: true, assets: [{ ...assets[0], ...patch }] }));
  }
  const incomplete = { ...assets[0] };
  delete incomplete.sourceName;
  rejectsProtocol(JSON.stringify({ ok: true, assets: [incomplete] }));
  rejectsProtocol(JSON.stringify({ ok: true, assets: [assets[0], assets[0]] }));
});

test('supports unreadable file paths and explicit non-applicable contract records', () => {
  const records = [
    { ...assets[0], absolutePath: null, pathStatus: 'unreadable' },
    { ...assets[0], projectItemId: 2, absolutePath: null, sourceType: 'solid', pathStatus: 'not_applicable' }
  ];
  assert.deepEqual(parseHostResponse(JSON.stringify({ ok: true, assets: records }), 'collect').assets, records);
});

test('exposes ZYGHostContract in a browser without CommonJS or DOM globals', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../cep/core/host-contract.js'), 'utf8'), context);
  assert.equal(context.ZYGHostContract.parseHostResponse('{"ok":true}', 'select').ok, true);
});
