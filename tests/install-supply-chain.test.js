'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  InstallError,
  InstallOrchestrator,
  MIN_FREE_BYTES,
  RealDriver,
  normalizeManifest,
  parsePinnedRequirements,
  parsePythonVersion,
  supportedNode,
  supportedPython,
} = require('../tools/install-orchestrator');

const SOURCE_ROOT = path.resolve(__dirname, '..');
const FIXTURE_FILES = [
  'package.json',
  'package-lock.json',
  'backend/requirements-core.lock',
  'backend/constraints-install.lock',
  'backend/requirements-whisperx.lock',
  'backend/requirements-diarize.lock',
  'tools/install-orchestrator.js',
  'src/renderer/vendor/hls.min.js',
  'src/renderer/vendor/hls.js-LICENSE.txt',
];

class FakeDriver {
  constructor(root, options = {}) {
    this.root = root;
    this.options = options;
    this.installCount = 0;
    this.nodeInstallCount = 0;
    this.verifyCount = 0;
    this.logs = [];
  }

  log(message) { this.logs.push(message); }
  processAlive(pid) { return this.options.livePids ? this.options.livePids.has(pid) : pid === process.pid; }
  nodeVersion() { return this.options.nodeVersion || 'v22.13.0'; }
  systemPythonVersion() {
    if ((this.options.missing || new Set()).has('python')) throw new InstallError('PYTHON_MISSING', 'python yok');
    return this.options.pythonVersion || { major: 3, minor: 11, patch: 9 };
  }
  freeBytes() { return this.options.freeBytes ?? MIN_FREE_BYTES + 1; }
  localFfmpegExists() { return this.options.localFfmpeg !== false; }
  commandExists(name) { return !(this.options.missing || new Set()).has(name); }

  createVenv(target) {
    if (this.options.failCreateVenv) throw new InstallError('VENV_CREATE', 'enjekte edilen venv hatasi');
    fs.mkdirSync(path.join(target, 'Scripts'), { recursive: true });
    fs.writeFileSync(path.join(target, 'Scripts', 'python.exe'), 'fixture');
  }

  installIntoVenv(target, profiles) {
    this.installCount += 1;
    if (this.options.failPythonInstall) throw new InstallError(this.options.failPythonInstall, 'enjekte edilen pip hatasi');
    fs.writeFileSync(path.join(target, 'installed.json'), JSON.stringify(profiles));
  }

  repairVenvScripts(target) {
    this.scriptRepairCount = (this.scriptRepairCount || 0) + 1;
    this.scriptRepairTarget = target;
    if (this.options.failScriptRepair) throw new InstallError('SCRIPT_REPAIR', 'enjekte edilen script onarim hatasi');
  }

  verifyVenv(target, expectedPins) {
    this.verifyCount += 1;
    if (!fs.existsSync(path.join(target, 'Scripts', 'python.exe')) || this.options.failVerifyVenv) {
      throw new InstallError('PIP_CHECK', 'enjekte edilen dogrulama hatasi');
    }
    const packages = [...expectedPins].map(([name, version]) => ({ name, version })).concat([{ name: 'pip', version: '25.1.1' }]);
    if (path.resolve(target) === path.join(this.root, 'backend', 'venv') && this.options.existingExtraPackages) {
      packages.push(...this.options.existingExtraPackages);
    }
    return packages;
  }

  installNode() {
    this.nodeInstallCount += 1;
    if (this.options.failNodeInstall) throw new InstallError(this.options.failNodeInstall, 'enjekte edilen npm/ag hatasi');
    const electron = path.join(this.root, 'node_modules', 'electron');
    fs.mkdirSync(path.join(electron, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(electron, 'install.js'), 'fixture');
    fs.writeFileSync(path.join(electron, 'dist', 'electron.exe'), 'fixture');
  }

  verifyNode() {
    if (this.options.failVerifyNode || !fs.existsSync(path.join(this.root, 'node_modules', 'electron', 'dist', 'electron.exe'))) {
      throw new InstallError('NODE_VERIFY', 'enjekte edilen Node dogrulama hatasi');
    }
  }
}

function makeFixture(label = 'temiz') {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-install-test-'));
  const root = path.join(parent, `${label} yol ğışİ`);
  fs.mkdirSync(root, { recursive: true });
  for (const relative of FIXTURE_FILES) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(SOURCE_ROOT, relative), target);
  }
  return { root, cleanup: () => fs.rmSync(parent, { recursive: true, force: true }) };
}

function mutateJson(root, relative, mutator) {
  const file = path.join(root, relative);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutator(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function expectCode(root, driver, code, fileSystem = fs, profile = 'core') {
  assert.throws(() => new InstallOrchestrator(root, driver, fileSystem).run(profile), (error) => error.code === code);
  assert.equal(fs.existsSync(path.join(root, '.whisper-install.lock')), false, 'kilit hata sonrasinda kalmadi');
}

let passed = 0;
function test(name, body) {
  const fixture = makeFixture(name.replace(/[^a-z0-9]+/gi, '-'));
  try {
    body(fixture.root);
    passed += 1;
  } finally {
    fixture.cleanup();
  }
}

test('python eksik', (root) => expectCode(root, new FakeDriver(root, { missing: new Set(['python']) }), 'PYTHON_MISSING'));
test('npm eksik', (root) => expectCode(root, new FakeDriver(root, { missing: new Set(['npm']) }), 'NPM_MISSING'));
test('git eksik', (root) => expectCode(root, new FakeDriver(root, { missing: new Set(['git']) }), 'GIT_MISSING'));
test('ffmpeg eksik', (root) => expectCode(root, new FakeDriver(root, { localFfmpeg: false, missing: new Set(['ffmpeg']) }), 'FFMPEG_MISSING'));
test('ffprobe eksik', (root) => expectCode(root, new FakeDriver(root, { localFfmpeg: false, missing: new Set(['ffprobe']) }), 'FFMPEG_MISSING'));
test('python 3.9 reddedilir', (root) => expectCode(root, new FakeDriver(root, { pythonVersion: { major: 3, minor: 9, patch: 9 } }), 'PYTHON_VERSION'));
test('python 3.12 reddedilir', (root) => expectCode(root, new FakeDriver(root, { pythonVersion: { major: 3, minor: 12, patch: 1 } }), 'PYTHON_VERSION'));
test('eski node reddedilir', (root) => expectCode(root, new FakeDriver(root, { nodeVersion: 'v22.12.0' }), 'NODE_VERSION'));
test('disk dolu', (root) => expectCode(root, new FakeDriver(root, { freeBytes: MIN_FREE_BYTES - 1 }), 'DISK_SPACE'));
test('npm lock surumu bozuk', (root) => {
  mutateJson(root, 'package-lock.json', (lock) => { lock.lockfileVersion = 2; });
  expectCode(root, new FakeDriver(root), 'NPM_LOCK_VERSION');
});
test('package ve lock drift', (root) => {
  mutateJson(root, 'package.json', (pkg) => { pkg.dependencies = { 'beklenmeyen-paket': '1.0.0' }; });
  expectCode(root, new FakeDriver(root), 'NPM_LOCK_DRIFT');
});
test('electron commit drift', (root) => {
  mutateJson(root, 'package-lock.json', (lock) => { lock.packages['node_modules/electron'].resolved = 'git+https://example.invalid/repo#bad'; });
  expectCode(root, new FakeDriver(root), 'ELECTRON_COMMIT');
});
test('npm integrity eksik', (root) => {
  mutateJson(root, 'package-lock.json', (lock) => { delete lock.packages['node_modules/@electron/get'].integrity; });
  expectCode(root, new FakeDriver(root), 'NPM_INTEGRITY');
});
test('transitive npm integrity eksik', (root) => {
  mutateJson(root, 'package-lock.json', (lock) => { delete lock.packages['node_modules/debug'].integrity; });
  expectCode(root, new FakeDriver(root), 'NPM_INTEGRITY');
});
test('npm lisans metadata eksik', (root) => {
  mutateJson(root, 'package-lock.json', (lock) => { delete lock.packages['node_modules/debug'].license; });
  expectCode(root, new FakeDriver(root), 'NPM_LICENSE');
});
test('eski npm lisans alani yalniz dogrulanmis tam surumde kabul edilir', (root) => {
  const orchestrator = new InstallOrchestrator(root, new FakeDriver(root));
  assert.doesNotThrow(() => orchestrator.preflight());
  mutateJson(root, 'package-lock.json', (lock) => {
    lock.packages['node_modules/dom-walk'].version = '0.1.3';
  });
  expectCode(root, new FakeDriver(root), 'NPM_LICENSE');
});
test('python aralik pini reddedilir', (root) => {
  const file = path.join(root, 'backend', 'requirements-core.lock');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('faster-whisper==', 'faster-whisper>='));
  expectCode(root, new FakeDriver(root), 'LOCK_NOT_EXACT');
});
test('es zamanli kurulum kilidi', (root) => {
  fs.writeFileSync(path.join(root, '.whisper-install.lock'), JSON.stringify({ pid: 4242 }));
  assert.throws(() => new InstallOrchestrator(root, new FakeDriver(root, { livePids: new Set([4242]) })).run('core'), (error) => error.code === 'CONCURRENT_INSTALL');
});
test('olmus pid kurulum kilidi retry ile kurtarilir', (root) => {
  fs.writeFileSync(path.join(root, '.whisper-install.lock'), JSON.stringify({ pid: 4242 }));
  const state = new InstallOrchestrator(root, new FakeDriver(root, { livePids: new Set() })).run('core');
  assert.equal(state.profiles.join(','), 'core');
  assert.equal(fs.existsSync(path.join(root, '.whisper-install.lock')), false);
});
test('yarim lock yazimi kilit birakmaz', (root) => {
  const facade = { ...fs, writeFileSync(target, ...args) {
    if (typeof target === 'number') { const error = new Error('lock diski dolu'); error.code = 'ENOSPC'; throw error; }
    return fs.writeFileSync(target, ...args);
  } };
  assert.throws(() => new InstallOrchestrator(root, new FakeDriver(root), facade).run('core'), (error) => error.code === 'ENOSPC');
  assert.equal(fs.existsSync(path.join(root, '.whisper-install.lock')), false);
});
test('basarili kurulum lock release hatasini gizlemez', (root) => {
  const facade = { ...fs, unlinkSync(target) {
    if (path.basename(String(target)) === '.whisper-install.lock') { const error = new Error('lock izin reddi'); error.code = 'EPERM'; throw error; }
    return fs.unlinkSync(target);
  } };
  assert.throws(() => new InstallOrchestrator(root, new FakeDriver(root), facade).run('core'), (error) => error.code === 'LOCK_RELEASE');
  assert.equal(fs.existsSync(path.join(root, 'backend', 'install-state.json')), true);
});
test('basarisiz kurulumda lock release asil hatayi maskelemez', (root) => {
  const facade = { ...fs, unlinkSync(target) {
    if (path.basename(String(target)) === '.whisper-install.lock') { const error = new Error('lock izin reddi'); error.code = 'EPERM'; throw error; }
    return fs.unlinkSync(target);
  } };
  const driver = new FakeDriver(root, { failCreateVenv: true });
  assert.throws(() => new InstallOrchestrator(root, driver, facade).run('core'), (error) => error.code === 'VENV_CREATE');
  assert(driver.logs.some((line) => line.startsWith('UYARI: Kurulum kilidi serbest birakilamadi')));
});
test('venv olusturma hatasi', (root) => expectCode(root, new FakeDriver(root, { failCreateVenv: true }), 'VENV_CREATE'));
test('pip bootstrap ag kesintisi', (root) => expectCode(root, new FakeDriver(root, { failPythonInstall: 'PIP_BOOTSTRAP' }), 'PIP_BOOTSTRAP'));
test('torch indirme kesintisi', (root) => expectCode(root, new FakeDriver(root, { failPythonInstall: 'TORCH_INSTALL' }), 'TORCH_INSTALL'));
test('cekirdek paket indirme kesintisi', (root) => expectCode(root, new FakeDriver(root, { failPythonInstall: 'CORE_INSTALL' }), 'CORE_INSTALL'));
test('pip check uyumsuzlugu', (root) => expectCode(root, new FakeDriver(root, { failVerifyVenv: true }), 'PIP_CHECK'));
test('artik staging dizini korumali hata', (root) => {
  const stage = path.join(root, 'backend', `.venv-installing-${process.pid}`);
  fs.mkdirSync(stage, { recursive: true });
  expectCode(root, new FakeDriver(root), 'STAGE_EXISTS');
  assert.equal(fs.existsSync(stage), true, 'baska denemeden kalan dizin silinmedi');
});
test('basarili kurulum sahne takasi sonrasi console script onarimi yapar', (root) => {
  const driver = new FakeDriver(root);
  new InstallOrchestrator(root, driver).run('core');
  assert.equal(driver.scriptRepairCount, 1, 'script onarimi tam bir kez calismali');
  assert.equal(driver.scriptRepairTarget, path.join(root, 'backend', 'venv'), 'onarim sahne degil son venv uzerinde olmali');
});
test('script onarim hatasi eski venvi geri getirir', (root) => {
  fs.mkdirSync(path.join(root, 'backend', 'venv', 'Scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'backend', 'venv', 'Scripts', 'python.exe'), 'eski');
  expectCode(root, new FakeDriver(root, { failScriptRepair: true }), 'SCRIPT_REPAIR');
  assert.equal(fs.readFileSync(path.join(root, 'backend', 'venv', 'Scripts', 'python.exe'), 'utf8'), 'eski');
});
test('venv atomik swap hatasi', (root) => {
  const facade = { ...fs, renameSync(source, target) {
    if (path.basename(source).startsWith('.venv-installing-') && path.basename(target) === 'venv') {
      const error = new Error('disk hatasi'); error.code = 'EIO'; throw error;
    }
    return fs.renameSync(source, target);
  } };
  expectCode(root, new FakeDriver(root), 'VENV_SWAP', facade);
});
test('npm ci ag kesintisi rollback', (root) => {
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'onceki.txt'), 'koru');
  expectCode(root, new FakeDriver(root, { failNodeInstall: 'NPM_CI' }), 'NPM_CI');
  assert.equal(fs.readFileSync(path.join(root, 'node_modules', 'onceki.txt'), 'utf8'), 'koru');
});
test('electron indirme kesintisi rollback', (root) => {
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'onceki.txt'), 'koru');
  expectCode(root, new FakeDriver(root, { failNodeInstall: 'ELECTRON_DOWNLOAD' }), 'ELECTRON_DOWNLOAD');
  assert.equal(fs.existsSync(path.join(root, 'node_modules', 'onceki.txt')), true);
});
test('node dogrulama hatasi rollback', (root) => {
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'onceki.txt'), 'koru');
  expectCode(root, new FakeDriver(root, { failVerifyNode: true }), 'NODE_VERIFY');
  assert.equal(fs.existsSync(path.join(root, 'node_modules', 'onceki.txt')), true);
});
test('manifest yazma hatasi tum rollback', (root) => {
  fs.mkdirSync(path.join(root, 'backend', 'venv', 'Scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'backend', 'venv', 'Scripts', 'python.exe'), 'eski');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'onceki.txt'), 'koru');
  const facade = { ...fs, writeFileSync(file, ...args) {
    if (String(file).endsWith('install-state.json.tmp')) { const error = new Error('disk dolu'); error.code = 'ENOSPC'; throw error; }
    return fs.writeFileSync(file, ...args);
  } };
  assert.throws(() => new InstallOrchestrator(root, new FakeDriver(root), facade).run('core'), /disk dolu/);
  assert.equal(fs.readFileSync(path.join(root, 'backend', 'venv', 'Scripts', 'python.exe'), 'utf8'), 'eski');
  assert.equal(fs.existsSync(path.join(root, 'node_modules', 'onceki.txt')), true);
});
test('commit sonrasi backup cleanup hatasi yeni ortami bozmaz', (root) => {
  fs.mkdirSync(path.join(root, 'backend', 'venv', 'Scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'backend', 'venv', 'Scripts', 'python.exe'), 'eski');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'onceki.txt'), 'eski');
  const facade = { ...fs, rmSync(target, options) {
    if (path.basename(target).startsWith('.venv-backup-')) { const error = new Error('izin reddedildi'); error.code = 'EPERM'; throw error; }
    return fs.rmSync(target, options);
  } };
  const driver = new FakeDriver(root);
  const state = new InstallOrchestrator(root, driver, facade).run('core');
  assert.equal(state.profiles.join(','), 'core');
  assert.equal(fs.readFileSync(path.join(root, 'backend', 'venv', 'Scripts', 'python.exe'), 'utf8'), 'fixture');
  assert(driver.logs.some((line) => line.startsWith('UYARI: Eski kurulum yedegi silinemedi')));
});
test('bozuk venv yeniden kurulur', (root) => {
  fs.mkdirSync(path.join(root, 'backend', 'venv'), { recursive: true });
  fs.writeFileSync(path.join(root, 'backend', 'venv', 'yarim.txt'), 'bozuk');
  const driver = new FakeDriver(root);
  new InstallOrchestrator(root, driver).run('core');
  assert.equal(driver.installCount, 1);
  assert.equal(fs.existsSync(path.join(root, 'backend', 'venv', 'Scripts', 'python.exe')), true);
});
test('hata sonrasi retry basarili', (root) => {
  const bad = new FakeDriver(root, { failNodeInstall: 'NPM_CI' });
  expectCode(root, bad, 'NPM_CI');
  const good = new FakeDriver(root);
  const state = new InstallOrchestrator(root, good).run('core');
  assert.equal(state.profiles.join(','), 'core');
});
test('ikinci calistirma idempotent', (root) => {
  const driver = new FakeDriver(root);
  const first = new InstallOrchestrator(root, driver).run('core');
  const installs = driver.installCount;
  const second = new InstallOrchestrator(root, driver).run('core');
  assert.equal(driver.installCount, installs);
  assert.equal(first.pythonManifestSha256, second.pythonManifestSha256);
});
test('transitif manifest drifti idempotent sayilmaz', (root) => {
  new InstallOrchestrator(root, new FakeDriver(root)).run('core');
  const driver = new FakeDriver(root, { existingExtraPackages: [{ name: 'transitif-paket', version: '9.9.9' }] });
  const state = new InstallOrchestrator(root, driver).run('core');
  assert.equal(driver.installCount, 1, 'drift yeni staging kurulumu tetikledi');
  assert.equal(state.packages.some((item) => item.startsWith('transitif-paket==')), false);
});
test('whisperx once ana kurulum ister', (root) => expectCode(root, new FakeDriver(root), 'CORE_REQUIRED', fs, 'whisperx'));
test('whisperx profil upgrade cekirdegi korur', (root) => {
  const driver = new FakeDriver(root);
  new InstallOrchestrator(root, driver).run('core');
  const state = new InstallOrchestrator(root, driver).run('whisperx');
  assert.deepEqual(state.profiles, ['core', 'whisperx']);
  assert(state.packages.includes('torch==2.5.1+cu121'));
  assert(state.packages.includes('whisperx==3.4.2'));
  assert(state.packages.includes('pyannote-audio==3.3.2'));
});
test('diarize profil upgrade birlesir', (root) => {
  const driver = new FakeDriver(root);
  new InstallOrchestrator(root, driver).run('core');
  new InstallOrchestrator(root, driver).run('whisperx');
  const state = new InstallOrchestrator(root, driver).run('diarize');
  assert.deepEqual(state.profiles, ['core', 'diarize', 'whisperx']);
});
test('unicode ve bosluklu yol', (root) => {
  const state = new InstallOrchestrator(root, new FakeDriver(root)).run('core');
  assert.equal(state.schemaVersion, 1);
  assert.match(root, /[ ğışİ]/);
});
test('sicak npm cache offline basarisi', (root) => {
  const driver = new FakeDriver(root, { offline: true, warmCache: true });
  new InstallOrchestrator(root, driver).run('core');
  assert.equal(driver.nodeInstallCount, 1);
});
test('bos npm cache offline rollback', (root) => {
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'onceki.txt'), 'koru');
  expectCode(root, new FakeDriver(root, { failNodeInstall: 'NPM_CI', offline: true }), 'NPM_CI');
  assert.equal(fs.existsSync(path.join(root, 'node_modules', 'onceki.txt')), true);
});
test('iki temiz kurulum ayni manifest ve hash', (rootA) => {
  const other = makeFixture('ikinci temiz');
  try {
    const stateA = new InstallOrchestrator(rootA, new FakeDriver(rootA)).run('core');
    const stateB = new InstallOrchestrator(other.root, new FakeDriver(other.root)).run('core');
    assert.deepEqual(stateA.packages, stateB.packages);
    assert.equal(stateA.pythonManifestSha256, stateB.pythonManifestSha256);
    assert.equal(stateA.packageLockSha256, stateB.packageLockSha256);
  } finally { other.cleanup(); }
});
test('batch girisleri unicode guvenli ve tek orchestrator yolu', (root) => {
  for (const [file, profile] of [['install.bat', 'core'], ['install-whisperx.bat', 'whisperx'], ['install-diarize.bat', 'diarize']]) {
    const source = fs.readFileSync(path.join(SOURCE_ROOT, file), 'utf8');
    assert(source.includes(`node "%~dp0tools\\install-orchestrator.js" ${profile}`));
    assert.doesNotMatch(source, /\bpip\s+install\b|\bnpm\s+install\b/i);
  }
  assert.match(root, /[ ğışİ]/);
});
test('start bat cudnn cublas urun sozlesmesi korunur', () => {
  const source = fs.readFileSync(path.join(SOURCE_ROOT, 'start.bat'), 'utf8');
  assert.match(source, /torch\\lib/);
  assert.match(source, /nvidia\\cudnn\\bin/);
  assert.match(source, /nvidia\\cublas\\bin/);
  assert.match(source, /call npm start/);
});
test('orchestrator electron uygulamasini baslatmaz', () => {
  const source = fs.readFileSync(path.join(SOURCE_ROOT, 'tools', 'install-orchestrator.js'), 'utf8');
  const processCalls = source.split(/\r?\n/).filter((line) => line.includes('this.run(')).join('\n');
  assert.doesNotMatch(processCalls, /electron\.exe|cli\.js|BrowserWindow|npm[^\n]*\bstart\b/);
  assert.match(source, /node_modules', 'electron', 'install\.js/);
});

assert.deepEqual(parsePythonVersion('Python 3.11.9'), { major: 3, minor: 11, patch: 9 });
assert.equal(supportedPython({ major: 3, minor: 10, patch: 0 }), true);
assert.equal(supportedPython({ major: 3, minor: 12, patch: 0 }), false);
assert.equal(supportedNode('v22.13.0'), true);
assert.equal(supportedNode('v22.12.9'), false);
const npmInvocation = new RealDriver(SOURCE_ROOT, { platform: 'win32' }).npmInvocation();
assert.equal(npmInvocation.command, process.execPath);
assert.match(npmInvocation.prefix[0], /npm-cli\.js$/);
assert.deepEqual(new RealDriver(SOURCE_ROOT, { platform: 'linux' }).npmInvocation(), { command: 'npm', prefix: [] });
assert.equal(parsePinnedRequirements('x[foo]==1.2.3\n').get('x'), '1.2.3');
assert.equal(normalizeManifest([{ name: 'B_b', version: '2' }, { name: 'a', version: '1' }]), 'a==1\nb-b==2\n');

console.log(`  OK  ${passed} izole kurulum/failure-injection senaryosu`);
