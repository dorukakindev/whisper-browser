'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = process.cwd();
const out = process.env.R815_PACKAGING_OUT ? path.resolve(process.env.R815_PACKAGING_OUT) : path.join(root, '.tmp/unseen815-packaging');
const manifest = require(path.join(root, 'tools/package-manifest.js'));
const { InstallOrchestrator } = require(path.join(root, 'tools/install-orchestrator.js'));
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const sandbox = fs.mkdtempSync(path.join(out, 'fixture-'));
  const source = path.join(sandbox, 'source');
  const target = path.join(sandbox, 'output');
  const app = path.join(target, 'resources', 'app');
  fs.mkdirSync(source, { recursive: true });
  const write = (rel, content) => {
    const p = path.join(source, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  // A wholly synthetic package tree: public installer inputs, inert placeholders
  // for unrelated entry points, and fake private-data markers. No real profile.
  for (const rel of manifest.requiredPackageFiles(root)) write(rel, '/* synthetic placeholder */\n');
  const actualInputs = ['.gitignore', 'package.json', 'package-lock.json', 'install.bat', 'tools/install-orchestrator.js',
    'backend/requirements-core.lock', 'backend/constraints-install.lock',
    'backend/requirements-whisperx.lock', 'backend/requirements-diarize.lock'];
  for (const rel of actualInputs) write(rel, fs.readFileSync(path.join(root, rel)));
  const markers = {
    '.env': 'AUDIT_ONLY_SECRET=FAKE_NOT_A_CREDENTIAL',
    'tmp/synthetic-profile/settings.json': '{"personalMarker":"AUDIT_ONLY"}',
    '.tmp/synthetic-profile/settings.json': '{"personalMarker":"AUDIT_ONLY"}',
    'logs/synthetic-session.log': 'AUDIT_ONLY_LOG',
    'synthetic-media.wav': 'AUDIT_ONLY_MEDIA',
  };
  for (const [rel, content] of Object.entries(markers)) write(rel, content);
  write('tests/should-be-excluded.txt', 'negative control');
  const filterModule = 'node_modules/@electron/packager/dist/copy-filter.js';
  const { populateIgnoredPaths, userPathFilter } = await import(pathToFileURL(path.join(root, filterModule)).href);
  const options = { dir: source, out: target, name: 'AuditOnly', platform: 'win32', arch: 'x64',
    prune: true, ignore: manifest.PACKAGER_IGNORE };
  options.ignore = populateIgnoredPaths(options).ignore;
  const filter = userPathFilter(options);
  await fs.promises.cp(source, app, { recursive: true, filter });
  const leaked = Object.keys(markers).filter(rel => fs.existsSync(path.join(app, rel)));
  assert.deepEqual(leaked, Object.keys(markers));
  assert(!fs.existsSync(path.join(app, 'tests/should-be-excluded.txt')));
  assert(!fs.existsSync(path.join(app, 'package-lock.json')));
  const checkerMissing = manifest.missingInTarget(target, source);
  assert.deepEqual(checkerMissing, []);
  const driver = { log() {}, commandExists: () => true, nodeVersion: () => 'v22.13.0',
    systemPythonVersion: () => ({ major: 3, minor: 11, patch: 9 }),
    localFfmpegExists: () => true, freeBytes: () => 20 * 1024 ** 3 };
  new InstallOrchestrator(source, driver).preflight();
  let failure;
  try { new InstallOrchestrator(app, driver).preflight(); }
  catch (e) { failure = { code: e.code, file: path.basename(e.path || ''), syscall: e.syscall }; }
  assert.deepEqual(failure, { code: 'ENOENT', file: 'package-lock.json', syscall: 'open' });
  fs.copyFileSync(path.join(source, 'package-lock.json'), path.join(app, 'package-lock.json'));
  new InstallOrchestrator(app, driver).preflight();
  const sourceHashes = {};
  for (const rel of ['tools/package-manifest.js', 'tools/package-windows.js', 'tools/install-orchestrator.js', filterModule, 'package-lock.json'])
    sourceHashes[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
  const result = { checkedHead: 'db65f2e7f6e7b50649c440cb183cb88863ebf241', platform: process.platform,
    node: process.version, packagerVersion: require(path.join(root, 'node_modules/@electron/packager/package.json')).version,
    leakedSyntheticMarkers: leaked, testsExcluded: true, sourceGitIgnorePresent: true, copiedPackageLock: false,
    requiredCheckerMissing: checkerMissing, sourcePreflight: 'PASS', packagedPreflightFailure: failure,
    restoreLockCountercheck: 'PASS', sourceHashes,
    limits: 'Actual installed packager filter and production manifest/checker/preflight, synthetic copy tree only; no full EXE build, downloads, Python install or personal data.' };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  // Delete only the mkdtemp-created tree directly under this proof directory.
  assert(path.dirname(sandbox) === out && path.basename(sandbox).startsWith('fixture-'));
  fs.rmSync(sandbox, { recursive: true, force: true });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
