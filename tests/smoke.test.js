const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('asset record fixture exposes the required contract fields', () => {
  const { assets } = require('./fixtures/assets.js');
  const requiredKeys = [
    'projectItemId',
    'itemName',
    'sourceName',
    'absolutePath',
    'sourceType',
    'pathStatus'
  ];

  assert.ok(assets.length > 0, 'fixture contains at least one asset');
  for (const asset of assets) {
    for (const key of requiredKeys) {
      assert.ok(Object.hasOwn(asset, key), `asset is missing ${key}`);
    }
  }
});

test('CEP manifest resolves to a self-contained panel entry point', () => {
  const extensionRoot = path.resolve(__dirname, '../cep');
  const manifest = fs.readFileSync(path.join(extensionRoot, 'CSXS/manifest.xml'), 'utf8');
  const mainPath = manifest.match(/<MainPath>\s*([^<]+?)\s*<\/MainPath>/);
  assert.ok(mainPath, 'manifest declares a panel entry point');

  function resolveLocalResource(baseDirectory, reference) {
    const resource = path.resolve(baseDirectory, reference);
    const relativePath = path.relative(extensionRoot, resource);
    assert.ok(
      relativePath !== '..' && !relativePath.startsWith('..' + path.sep) && !path.isAbsolute(relativePath),
      `resource stays inside cep/: ${reference}`
    );
    assert.ok(fs.statSync(resource).isFile(), `resource exists: ${reference}`);
    return resource;
  }

  const entryPoint = resolveLocalResource(extensionRoot, mainPath[1]);
  const scriptPath = manifest.match(/<ScriptPath>\s*([^<]+?)\s*<\/ScriptPath>/);
  assert.ok(scriptPath, 'manifest loads the AE host entry point');
  resolveLocalResource(extensionRoot, scriptPath[1]);
  const html = fs.readFileSync(entryPoint, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const references = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)];
  assert.ok(references.length > 0, 'panel declares its local resources');
  for (const [, reference] of references) {
    resolveLocalResource(path.dirname(entryPoint), reference);
  }
});
