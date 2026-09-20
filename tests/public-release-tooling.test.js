'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const bundle = fs.readFileSync(path.join(root, 'src', 'renderer', 'vendor', 'browser-ass', 'jassub.js'), 'utf8');
const licenses = fs.readFileSync(path.join(root, 'src', 'renderer', 'vendor', 'browser-ass', 'LICENSES.txt'), 'utf8');
const build = fs.readFileSync(path.join(root, 'tools', 'build-browser-ass.js'), 'utf8');

assert.equal(pkg.devDependencies.jassub, '2.5.16', 'JASSUB only belongs in the build dependency set');
assert.equal(pkg.dependencies?.jassub, undefined, 'JASSUB must not be copied into the packaged runtime tree');
assert.equal(pkg.devDependencies['@electron/packager'], '20.3.0');
assert.ok(pkg.scripts['package:win'] && pkg.scripts['smoke:package:win'] && pkg.scripts['audit:licenses']);
assert.match(build, /native-rvfc-only/);
assert.doesNotMatch(bundle, /_rvfcpolyfillmap|webkitDecodedFrameCount/,
  'GPL rvfc-polyfill implementation must not be embedded in the distributed JASSUB bundle');
assert.match(licenses, /rvfc-polyfill bağımlılığı bu dağıtım paketine dahil edilmez/);

console.log('public-release-tooling: packaging and ASS license boundary passed');
