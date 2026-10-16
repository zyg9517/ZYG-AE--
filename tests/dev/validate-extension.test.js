const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateExtension } = require('../../scripts/validate-extension.js');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zyg-validation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'cep');
  fs.cpSync(path.resolve(__dirname, '../../cep'), root, { recursive: true });
  return {
    root,
    edit(file, from, to) {
      const target = path.join(root, file);
      fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(from, to));
    },
    write(file, value) { fs.writeFileSync(path.join(root, file), value); }
  };
}

test('validates the deployable extension without generating output', t => {
  const f = fixture(t);
  const before = fs.readdirSync(f.root);
  assert.ok(validateExtension(f.root).files >= 10);
  assert.deepEqual(fs.readdirSync(f.root), before);
});

for (const [name, from, to] of [
  ['other AE versions', '[17.0,17.9]', '[18.0,18.9]'],
  ['other CEP runtime', 'Name="CSXS" Version="9.0"', 'Name="CSXS" Version="10.0"'],
  ['missing bundle identity', 'ExtensionBundleId="com.zyg.asset-workbench"', ''],
  ['non-panel UI', '<Type>Panel</Type>', '<Type>ModalDialog</Type>'],
  ['missing host entrypoint', '<ScriptPath>./host/asset-workbench.jsx</ScriptPath>', ''],
  ['mismatched extension dispatch', '<Extension Id="com.zyg.asset-workbench.panel">', '<Extension Id="other.panel">']
]) {
  test('rejects ' + name, t => {
    const f = fixture(t);
    f.edit('CSXS/manifest.xml', from, to);
    assert.throws(() => validateExtension(f.root));
  });
}

test('rejects missing active scripts but ignores commented references', t => {
  const f = fixture(t);
  f.edit('index.html', '</body>', '<!-- <script src="absent.js"></script> --></body>');
  assert.doesNotThrow(() => validateExtension(f.root));
  fs.unlinkSync(path.join(f.root, 'app.js'));
  assert.throws(() => validateExtension(f.root), /app\.js/);
});

test('resolves CSS imports and assets transitively', t => {
  const f = fixture(t);
  f.write('nested.css', '@import "absent.css";');
  f.edit('styles.css', /^/, '@import "nested.css";\n');
  assert.throws(() => validateExtension(f.root), /absent\.css/);
  f.write('absent.css', 'body { background: url("absent.png"); }');
  assert.throws(() => validateExtension(f.root), /absent\.png/);
  f.write('absent.png', 'test image');
  assert.doesNotThrow(() => validateExtension(f.root));
});

test('resolves host includes relative to each including JSX file', t => {
  const f = fixture(t);
  f.write('host/nested.jsx', '#include "missing.jsx"\n');
  f.edit('host/asset-workbench.jsx', /^/, '#include "nested.jsx"\n');
  assert.throws(() => validateExtension(f.root), /missing\.jsx/);
  f.write('host/missing.jsx', 'var included = true;');
  assert.doesNotThrow(() => validateExtension(f.root));
});

for (const reference of ['../outside.js', '%2e%2e/outside.js', 'https://example.test/a.js', 'C:/external.js']) {
  test('rejects runtime reference outside cep: ' + reference, t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, '../outside.js'), '');
    f.edit('index.html', 'app.js', reference);
    assert.throws(() => validateExtension(f.root), /inside cep/);
  });
}

test('rejects symlink escapes even when the referenced file exists', t => {
  const f = fixture(t);
  const outside = path.resolve(f.root, '../outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'app.js'), '');
  fs.symlinkSync(outside, path.join(f.root, 'linked'), 'junction');
  f.edit('index.html', 'app.js', 'linked/app.js');
  assert.throws(() => validateExtension(f.root), /inside cep/);
});

test('rejects module/build dependencies instead of promising a newer CEP runtime', t => {
  const f = fixture(t);
  f.edit('index.html', '<script src="app.js">', '<script type="module" src="app.js">');
  assert.throws(() => validateExtension(f.root), /module/);
  f.edit('index.html', 'type="module" ', '');
  fs.mkdirSync(path.join(f.root, 'dist'));
  assert.throws(() => validateExtension(f.root), /dist/);
});

test('CLI returns nonzero with an actionable failure', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.root, 'styles.css'));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/validate-extension.js'), f.root], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL.*styles\.css/);
});
