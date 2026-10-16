const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHostResponse } = require('../../cep/core/host-contract.js');

// These objects replace only AE's unavailable host boundary. All normalization,
// JSON serialization and selection behavior comes from the deployed JSX.
class FileSource {
  constructor(file, isStill = true, missingFootagePath = '') {
    this.file = file;
    this.isStill = isStill;
    this.missingFootagePath = missingFootagePath;
  }
}
class FootageItem {
  constructor(id, name, mainSource, file = mainSource.file) {
    this.id = id;
    this.name = name;
    this.mainSource = mainSource;
    this.file = file;
    this.selected = false;
    this.footageMissing = !file;
  }
}
function file(fsName, exists = true) { return { fsName, exists }; }
function project(...items) { return { numItems: items.length, items: [null, ...items] }; }
function host(currentProject) {
  const context = vm.createContext({ app: { project: currentProject }, FootageItem, FileSource, JSON: undefined });
  const source = fs.readFileSync(path.join(__dirname, '../../cep/host/asset-workbench.jsx'), 'utf8');
  new vm.Script(source, { filename: 'asset-workbench.jsx' }).runInContext(context);
  return {
    context,
    collect: () => parseHostResponse(context.ZYGAssetWorkbench.collectAssetRecords(), 'collect'),
    select: id => parseHostResponse(context.ZYGAssetWorkbench.selectProjectItem(id), 'select')
  };
}

test('collects stable AE ids and source names while filtering non-file sources', () => {
  const image = new FootageItem(510, 'Renamed tree', new FileSource(file('C:\\素材\\tree.png')));
  const placeholder = new FootageItem(2, 'Missing placeholder', { isStill: true }, null);
  const solid = new FootageItem(3, 'Solid', { color: [1, 0, 0] }, null);
  const runtime = host(project({ id: 1, name: 'Comp' }, image, placeholder, solid));
  assert.deepEqual(runtime.collect(), { ok: true, assets: [{
    projectItemId: 510, itemName: 'Renamed tree', sourceName: 'tree.png',
    absolutePath: 'C:\\素材\\tree.png', sourceType: 'file', pathStatus: 'exists'
  }] });
  assert.equal(runtime.context.collectAssetRecords, undefined);
  assert.equal(runtime.context.selectProjectItem, undefined);
});

test('retains FileSource missingFootagePath when AE exposes no file object', () => {
  const missing = new FootageItem(44, 'Lost sequence', new FileSource(null, false, 'D:\\Lost\\shot_0001.exr'));
  missing.missingFootagePath = 'D:\\wrong-property.mov';
  const record = host(project(missing)).collect().assets[0];
  assert.deepEqual(record, {
    projectItemId: 44, itemName: 'Lost sequence', sourceName: 'shot_0001.exr',
    absolutePath: 'D:\\Lost\\shot_0001.exr', sourceType: 'sequence', pathStatus: 'missing'
  });
});

test('labels image sequences heuristically without labeling movies or audio as sequences', () => {
  const runtime = host(project(
    new FootageItem(10, 'Sequence', new FileSource(file('D:\\Seq\\frame0001.PNG'), false)),
    new FootageItem(20, 'Movie', new FileSource(file('D:\\Clip.mov'), false)),
    new FootageItem(30, 'Audio', new FileSource(file('D:\\Audio.wav'), false)),
    new FootageItem(40, 'Still', new FileSource(file('D:\\Still.exr'), true))
  ));
  assert.deepEqual(runtime.collect().assets.map(record => [record.sourceType, record.absolutePath]), [
    ['sequence', 'D:\\Seq\\frame0001.PNG'], ['file', 'D:\\Clip.mov'],
    ['file', 'D:\\Audio.wav'], ['file', 'D:\\Still.exr']
  ]);
});

test('contains path access errors per item and continues collecting later assets', () => {
  const inaccessible = file('D:\\Restricted.png');
  Object.defineProperty(inaccessible, 'exists', { get() { throw new Error('Access denied'); } });
  const noPath = {};
  Object.defineProperty(noPath, 'fsName', { get() { throw new Error('Cannot read path'); } });
  const records = host(project(
    new FootageItem(1, 'Restricted', new FileSource(inaccessible)),
    new FootageItem(2, 'Unknown path', new FileSource(noPath)),
    new FootageItem(3, 'Deleted', new FileSource(file('D:\\Deleted.png', false))),
    new FootageItem(4, 'Valid', new FileSource(file('D:\\Valid.png')))
  )).collect().assets;
  assert.deepEqual(records.map(record => [record.projectItemId, record.absolutePath, record.pathStatus]), [
    [1, 'D:\\Restricted.png', 'unreadable'], [2, null, 'unreadable'],
    [3, 'D:\\Deleted.png', 'missing'], [4, 'D:\\Valid.png', 'exists']
  ]);
});

test('serializes quotes, slashes, control characters and unicode without global JSON', () => {
  const name = '引号"\\\n\r\t\b\f\u0000\u001f';
  assert.equal(host(project(new FootageItem(1, name, new FileSource(file('D:\\图.png'))))).collect().assets[0].itemName, name);
});

test('returns structured errors for no project and host enumeration failure', () => {
  const runtime = host(null);
  assert.equal(runtime.collect().code, 'NO_PROJECT');
  assert.equal(runtime.select(1).code, 'NO_PROJECT');
  runtime.context.app.project = { get numItems() { throw new Error('Host unavailable'); } };
  assert.equal(runtime.collect().code, 'HOST_ERROR');
});

test('selects by collected stable id and changes only selection state', () => {
  const first = new FootageItem(72, 'First', new FileSource(file('D:\\first.png')));
  const target = new FootageItem(800, 'Target', new FileSource(file('D:\\target.png')));
  const comp = { id: 99, selected: true };
  first.selected = true;
  const currentProject = project(comp, first, target);
  const runtime = host(currentProject);
  runtime.collect();
  const before = JSON.stringify(currentProject);
  assert.deepEqual(runtime.select(800), { ok: true });
  assert.deepEqual([comp.selected, first.selected, target.selected], [false, false, true]);
  const beforeSelection = JSON.parse(before);
  beforeSelection.items[1].selected = false;
  beforeSelection.items[2].selected = false;
  beforeSelection.items[3].selected = true;
  assert.deepEqual(JSON.parse(JSON.stringify(currentProject)), beforeSelection);
});

test('rejects invalid ids, uncollected ids, deleted items and switched projects before selection', () => {
  const target = new FootageItem(8, 'Target', new FileSource(file('D:\\target.png')));
  const runtime = host(project(target));
  for (const id of ['8', 0, -1, 1.5, NaN, Infinity]) {
    assert.equal(runtime.select(id).code, 'INVALID_ITEM_ID');
  }
  assert.equal(runtime.select(8).code, 'STALE_PROJECT');
  runtime.collect();
  assert.equal(runtime.select(404).code, 'ITEM_NOT_FOUND');
  runtime.context.app.project.items[1] = { id: 8, selected: false };
  assert.equal(runtime.select(8).code, 'STALE_PROJECT');
  assert.equal(runtime.context.app.project.items[1].selected, false);
  runtime.context.app.project = project(new FootageItem(8, 'Other project', new FileSource(file('E:\\other.png'))));
  assert.equal(runtime.select(8).code, 'STALE_PROJECT');
  assert.equal(runtime.context.app.project.items[1].selected, false);
  runtime.collect();
  runtime.context.app.project.items.pop();
  runtime.context.app.project.numItems = 0;
  assert.equal(runtime.select(8).code, 'ITEM_NOT_FOUND');
});
