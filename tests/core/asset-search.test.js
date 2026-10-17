const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assets } = require('../fixtures/assets.js');
const { filterAssets } = require('../../cep/core/asset-search.js');

const records = Object.freeze([
  Object.freeze({ ...assets[0] }),
  Object.freeze({ ...assets[0], projectItemId: 2, itemName: 'Forest', sourceName: 'LEAF.png', pathStatus: 'missing' }),
  Object.freeze({ ...assets[0], projectItemId: 3, itemName: 'LEAF composition', sourceName: 'forest.png' }),
  Object.freeze({ ...assets[0], projectItemId: 4, itemName: 'Tree solid', sourceName: '', absolutePath: '', sourceType: 'solid', pathStatus: 'not_applicable' })
]);

test('trims query whitespace before matching asset names', () => {
  assert.deepEqual(filterAssets(records, '  tree  '), [records[0]]);
});

test('matches either item name or source name without case sensitivity', () => {
  assert.deepEqual(filterAssets(records, 'lEaF'), [records[1], records[2]]);
});

test('empty and whitespace-only queries preserve all supported records in input order', () => {
  for (const query of ['', ' \t\r\n ']) {
    assert.deepEqual(filterAssets(records, query), [records[0], records[1], records[2]]);
  }
});

test('returns an empty array when neither name matches', () => {
  assert.deepEqual(filterAssets(records, 'mountain'), []);
});

test('excludes not_applicable records even when their name matches', () => {
  assert.deepEqual(filterAssets(records, 'solid'), []);
});

test('returns original record objects without mutating the input', () => {
  const before = JSON.stringify(records);
  const result = filterAssets(records, 'leaf');
  assert.notStrictEqual(result, records);
  assert.strictEqual(result[0], records[1]);
  assert.strictEqual(result[1], records[2]);
  assert.equal(JSON.stringify(records), before);
});

test('exposes the same search behavior as ZYGAssetSearch in a browser script', () => {
  const context = vm.createContext({});
  const script = fs.readFileSync(path.join(__dirname, '../../cep/core/asset-search.js'), 'utf8');
  vm.runInContext(script, context);
  const result = context.ZYGAssetSearch.filterAssets(records, '  TREE ');
  assert.equal(result.length, 1);
  assert.strictEqual(result[0], records[0]);
});
