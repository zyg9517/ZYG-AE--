/* Development-only packaging validation. No host, clipboard or Explorer calls. */
const fs = require('node:fs');
const path = require('node:path');

function validateExtension(extensionRoot) {
  const root = fs.realpathSync(extensionRoot);
  const visited = new Set();
  function requireValue(condition, message) {
    if (!condition) throw new Error(message);
  }
  function inside(file, reference) {
    const relative = path.relative(root, file);
    requireValue(relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative),
      'Reference must stay inside cep/: ' + reference);
    return file;
  }
  function resolve(base, reference) {
    let local;
    try { local = decodeURIComponent(reference.split(/[?#]/)[0]); }
    catch (_) { throw new Error('Invalid resource encoding: ' + reference); }
    requireValue(local && !/^[\\/]|:/.test(local), 'Reference must stay inside cep/: ' + reference);
    const file = inside(path.resolve(base, local), reference);
    requireValue(fs.existsSync(file) && fs.statSync(file).isFile(), 'Missing resource: ' + reference);
    return inside(fs.realpathSync(file), reference);
  }
  function attributes(tag) {
    const result = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      result[match[1]] = match[2] ?? match[3] ?? match[4];
    }
    return result;
  }
  function oneTag(xml, name) {
    const matches = [...xml.matchAll(new RegExp('<' + name + '\\b[^>]*>', 'g'))];
    requireValue(matches.length === 1, 'Manifest requires one ' + name);
    return attributes(matches[0][0]);
  }
  function text(xml, name) {
    const match = xml.match(new RegExp('<' + name + '>\\s*([^<]+?)\\s*</' + name + '>'));
    requireValue(match, 'Manifest requires ' + name);
    return match[1];
  }
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const type = path.extname(file).toLowerCase();
    if (!['.html', '.css', '.jsx', '.js'].includes(type)) return;
    const source = fs.readFileSync(file, 'utf8');
    const base = path.dirname(file);
    if (type === '.html') {
      const html = source.replace(/<!--[\s\S]*?-->/g, '');
      const refs = [];
      for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
        const attrs = attributes(match[0]);
        requireValue(attrs.type !== 'module', 'Native module scripts require a newer browser runtime');
        const reference = match[1].toLowerCase() === 'script' ? attrs.src : attrs.href;
        if (reference) { refs.push(reference); visit(resolve(base, reference)); }
      }
      for (const required of ['styles.css', 'vendor/CSInterface.js', 'core/host-contract.js',
        'core/asset-search.js', 'core/ui-state.js', 'host-api.js', 'path-actions.js', 'app.js']) {
        const expected = resolve(root, required);
        requireValue(refs.some(ref => resolve(base, ref) === expected), 'Panel must load ' + required);
      }
    } else if (type === '.css') {
      const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of css.matchAll(/@import\s+(["'])(.*?)\1|url\(\s*(["']?)(.*?)\3\s*\)/gi)) {
        visit(resolve(base, match[2] || match[4].trim()));
      }
    } else if (type === '.jsx') {
      const jsx = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '');
      for (const match of jsx.matchAll(/^\s*#include\s+["<]([^">]+)[">]/gm)) visit(resolve(base, match[1]));
    }
  }
  function checkDirectories(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      const stat = fs.lstatSync(child);
      requireValue(!stat.isSymbolicLink(), 'Directory symlink/junction is not allowed inside cep/: ' + entry.name);
      if (stat.isDirectory()) {
        requireValue(!['dist', 'build', 'node_modules', 'src'].includes(entry.name.toLowerCase()),
          'Unexpected build/runtime directory inside cep/: ' + entry.name);
        const realDirectory = fs.realpathSync(child);
        requireValue(path.relative(root, realDirectory) !== '..' &&
          !path.relative(root, realDirectory).startsWith('..' + path.sep) &&
          !path.isAbsolute(path.relative(root, realDirectory)),
          'Directory resolves outside cep/: ' + entry.name);
        checkDirectories(realDirectory);
      }
    }
  }
  checkDirectories(root);
  const manifestFile = resolve(root, 'CSXS/manifest.xml');
  visited.add(manifestFile);
  const manifest = fs.readFileSync(manifestFile, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const bundle = oneTag(manifest, 'ExtensionManifest');
  for (const key of ['Version', 'ExtensionBundleId', 'ExtensionBundleVersion', 'ExtensionBundleName']) {
    requireValue(bundle[key] && bundle[key].trim(), 'Manifest requires ' + key);
  }
  const extensions = [...manifest.matchAll(/<Extension\b[^>]*>/g)].map(match => attributes(match[0]));
  requireValue(extensions.length === 2 && extensions[0].Id && extensions[0].Version &&
    extensions[0].Id === extensions[1].Id, 'Manifest extension list and dispatch identities must match');
  const host = oneTag(manifest, 'Host');
  requireValue(host.Name === 'AEFT' && host.Version === '[17.0,17.9]', 'Manifest must target AEFT [17.0,17.9]');
  const runtime = oneTag(manifest, 'RequiredRuntime');
  requireValue(runtime.Name === 'CSXS' && runtime.Version === '9.0', 'Manifest must require CSXS 9.0');
  requireValue(text(manifest, 'Type') === 'Panel', 'Manifest UI must be Panel');
  text(manifest, 'Menu');
  const main = resolve(root, text(manifest, 'MainPath'));
  const hostScript = resolve(root, text(manifest, 'ScriptPath'));
  requireValue(path.extname(main) === '.html' && path.extname(hostScript) === '.jsx',
    'Manifest must resolve HTML MainPath and JSX ScriptPath');
  visit(main);
  visit(hostScript);
  return { files: visited.size };
}

if (require.main === module) {
  try {
    const result = validateExtension(process.argv[2] || path.resolve(__dirname, '../cep'));
    console.log('PASS: AEFT [17.0,17.9], CSXS 9.0; ' + result.files + ' local resources validated. Live AE/CEP acceptance remains separate.');
  } catch (error) {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  }
}
module.exports = { validateExtension };
