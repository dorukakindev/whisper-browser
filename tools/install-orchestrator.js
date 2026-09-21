'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const MIN_FREE_BYTES = 10 * 1024 ** 3;
const TORCH_INDEX = 'https://download.pytorch.org/whl/cu121';
const TORCH_PINS = ['torch==2.5.1+cu121', 'torchaudio==2.5.1+cu121'];
const ELECTRON_COMMIT = '8244344c33634d9323377c0d0fd1d9b7f9b69540';
const VALID_PROFILES = new Set(['core', 'whisperx', 'diarize']);
// Some old packages publish SPDX-compatible license data through the legacy
// `licenses` field. npm does not copy that field into lockfile v3. Keep the
// exception exact by lock path and version so a package update cannot inherit
// an unverified license decision.
const LEGACY_NPM_LICENSES = new Map([
  ['node_modules/dom-walk@0.1.2', 'MIT'],
]);

class InstallError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InstallError';
    this.code = code;
  }
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function canonicalPackageName(value) {
  return String(value).toLowerCase().replace(/[_.]+/g, '-');
}

function parsePinnedRequirements(text) {
  const result = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?==([^\s;]+)$/.exec(line);
    if (!match) {
      throw new InstallError('LOCK_NOT_EXACT', `Kilit satiri tam surume sabit degil: ${line}`);
    }
    result.set(canonicalPackageName(match[1]), match[2]);
  }
  return result;
}

function parsePythonVersion(output) {
  const match = /Python\s+(\d+)\.(\d+)\.(\d+)/i.exec(output || '');
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function supportedPython(version) {
  return Boolean(version && version.major === 3 && (version.minor === 10 || version.minor === 11));
}

function supportedNode(versionText) {
  const parts = String(versionText).replace(/^v/, '').split('.').map(Number);
  return parts[0] > 22 || (parts[0] === 22 && parts[1] >= 13);
}

function normalizeManifest(packages) {
  return packages
    .map((item) => `${canonicalPackageName(item.name)}==${item.version}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n') + '\n';
}

class RealDriver {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.out = options.out || process.stdout;
    this.err = options.err || process.stderr;
    this.platform = options.platform || process.platform;
  }

  log(message) {
    this.out.write(`${message}\n`);
  }

  run(command, args, options = {}) {
    const result = spawnSync(command, args, {
      cwd: options.cwd || this.root,
      env: { ...process.env, PYTHONUTF8: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1', ...options.env },
      encoding: 'utf8',
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
      shell: false,
    });
    if (result.error) {
      if (options.allowFailure) return { ...result, status: -1 };
      throw new InstallError('PROCESS_START', `${command} baslatilamadi: ${result.error.message}`);
    }
    if (result.status !== 0 && !options.allowFailure) {
      const detail = options.capture ? `\n${String(result.stderr || result.stdout || '').trim()}` : '';
      throw new InstallError(options.code || 'COMMAND_FAILED', `${command} komutu ${result.status} koduyla bitti.${detail}`);
    }
    return result;
  }

  commandExists(name) {
    const command = this.platform === 'win32' ? 'where.exe' : 'which';
    return this.run(command, [name], { capture: true, allowFailure: true }).status === 0;
  }

  localFfmpegExists() {
    return fs.existsSync(path.join(this.root, 'backend', 'bin', 'ffmpeg.exe')) &&
      fs.existsSync(path.join(this.root, 'backend', 'bin', 'ffprobe.exe'));
  }

  freeBytes() {
    if (!fs.statfsSync) return Number.POSITIVE_INFINITY;
    const stats = fs.statfsSync(this.root);
    return Number(stats.bavail) * Number(stats.bsize);
  }

  nodeVersion() {
    return process.version;
  }

  npmInvocation() {
    if (this.platform !== 'win32') return { command: 'npm', prefix: [] };
    const configured = String(process.env.npm_execpath || '').trim();
    const candidates = [configured,
      path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')]
      .filter(Boolean);
    const cli = candidates.find(candidate => fs.existsSync(candidate));
    if (!fs.existsSync(cli)) throw new InstallError('NPM_MISSING', `npm CLI bulunamadi: ${cli}`);
    return { command: process.execPath, prefix: [cli] };
  }

  processAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error && error.code !== 'ESRCH';
    }
  }

  systemPythonVersion() {
    const candidates = this.platform === 'win32'
      ? [['python', []], ['py', ['-3.11']], ['py', ['-3.10']]]
      : [['python3', []], ['python', []]];
    let firstDetected = null;
    for (const [command, prefix] of candidates) {
      const result = this.run(command, [...prefix, '--version'], { capture: true, allowFailure: true });
      if (result.status !== 0) continue;
      const version = parsePythonVersion(`${result.stdout || ''}\n${result.stderr || ''}`);
      if (!version) continue;
      if (!firstDetected) firstDetected = version;
      if (supportedPython(version)) {
        this.systemPython = { command, prefix };
        return version;
      }
    }
    if (firstDetected) return firstDetected;
    throw new InstallError('PYTHON_MISSING', 'Python bulunamadi. CPython 3.10 veya 3.11 kurun.');
  }

  createVenv(target) {
    if (!this.systemPython) this.systemPythonVersion();
    this.run(this.systemPython.command, [...this.systemPython.prefix, '-m', 'venv', target], { code: 'VENV_CREATE' });
  }

  venvPython(venv) {
    return path.join(venv, this.platform === 'win32' ? 'Scripts' : 'bin', this.platform === 'win32' ? 'python.exe' : 'python');
  }

  installIntoVenv(venv, profiles) {
    const python = this.venvPython(venv);
    const constraints = path.join(this.root, 'backend', 'constraints-install.lock');
    this.run(python, ['-m', 'pip', 'install', '--only-binary=:all:', 'pip==25.1.1'], { code: 'PIP_BOOTSTRAP' });
    this.run(python, ['-m', 'pip', 'install', '--only-binary=:all:', '--index-url', TORCH_INDEX, ...TORCH_PINS], { code: 'TORCH_INSTALL' });
    this.run(python, ['-m', 'pip', 'install', '--only-binary=:all:', '--constraint', constraints, '--requirement', path.join(this.root, 'backend', 'requirements-core.lock')], { code: 'CORE_INSTALL' });
    if (profiles.includes('whisperx')) {
      this.run(python, ['-m', 'pip', 'install', '--only-binary=:all:', '--constraint', constraints, '--requirement', path.join(this.root, 'backend', 'requirements-whisperx.lock')], { code: 'WHISPERX_INSTALL' });
    }
    if (profiles.includes('diarize') && !profiles.includes('whisperx')) {
      this.run(python, ['-m', 'pip', 'install', '--only-binary=:all:', '--constraint', constraints, '--requirement', path.join(this.root, 'backend', 'requirements-diarize.lock')], { code: 'DIARIZE_INSTALL' });
    }
  }

  pythonPackages(venv) {
    const result = this.run(this.venvPython(venv), ['-m', 'pip', 'list', '--format=json'], { capture: true, code: 'PIP_LIST' });
    return JSON.parse(result.stdout);
  }

  verifyVenv(venv, expectedPins) {
    const python = this.venvPython(venv);
    if (!fs.existsSync(python)) throw new InstallError('VENV_BROKEN', 'Sanal ortam Python calistiricisi eksik.');
    const versionResult = this.run(python, ['--version'], { capture: true, code: 'VENV_BROKEN' });
    if (!supportedPython(parsePythonVersion(`${versionResult.stdout}\n${versionResult.stderr}`))) {
      throw new InstallError('VENV_PYTHON_VERSION', 'Sanal ortam Python surumu 3.10 veya 3.11 degil.');
    }
    this.run(python, ['-m', 'pip', 'check'], { capture: true, code: 'PIP_CHECK' });
    const installed = new Map(this.pythonPackages(venv).map((item) => [canonicalPackageName(item.name), item.version]));
    for (const [name, version] of expectedPins) {
      if (installed.get(name) !== version) {
        throw new InstallError('PIN_MISMATCH', `${name}: beklenen ${version}, bulunan ${installed.get(name) || 'yok'}`);
      }
    }
    return this.pythonPackages(venv);
  }

  installNode() {
    const npm = this.npmInvocation();
    this.run(npm.command, [...npm.prefix, 'ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], { code: 'NPM_CI' });
    const installer = path.join(this.root, 'node_modules', 'electron', 'install.js');
    if (!fs.existsSync(installer)) throw new InstallError('ELECTRON_INSTALLER_MISSING', 'Kilitli Electron kurucu dosyasi eksik.');
    // Bu script yalniz ikili paketi indirip checksum dogrular; Electron/BrowserWindow baslatmaz.
    this.run(process.execPath, [installer, '--no'], { code: 'ELECTRON_DOWNLOAD' });
  }

  verifyNode() {
    const required = [
      path.join(this.root, 'node_modules', 'electron', 'install.js'),
      path.join(this.root, 'node_modules', 'electron', 'dist', this.platform === 'win32' ? 'electron.exe' : 'electron'),
      path.join(this.root, 'src', 'renderer', 'vendor', 'hls.min.js'),
      path.join(this.root, 'src', 'renderer', 'vendor', 'hls.js-LICENSE.txt'),
    ];
    for (const file of required) {
      if (!fs.existsSync(file)) throw new InstallError('NODE_VERIFY', `Node kurulumu eksik: ${file}`);
    }
  }
}

class InstallOrchestrator {
  constructor(root, driver = new RealDriver(root), fileSystem = fs) {
    this.root = path.resolve(root);
    this.driver = driver;
    this.fs = fileSystem;
    this.trace = [];
    this.lockPath = path.join(this.root, '.whisper-install.lock');
    this.statePath = path.join(this.root, 'backend', 'install-state.json');
    this.venvPath = path.join(this.root, 'backend', 'venv');
    this.stagePath = path.join(this.root, 'backend', `.venv-installing-${process.pid}`);
    this.venvBackup = path.join(this.root, 'backend', `.venv-backup-${process.pid}`);
    this.nodePath = path.join(this.root, 'node_modules');
    this.nodeBackup = path.join(this.root, `.node_modules-backup-${process.pid}`);
  }

  transition(state) {
    this.trace.push(state);
    this.driver.log(`[${this.trace.length}] ${state}`);
  }

  readUtf8(relative) {
    return this.fs.readFileSync(path.join(this.root, relative), 'utf8');
  }

  desiredFingerprint() {
    const files = [
      'package.json', 'package-lock.json', 'backend/requirements-core.lock',
      'backend/constraints-install.lock', 'backend/requirements-whisperx.lock',
      'backend/requirements-diarize.lock', 'tools/install-orchestrator.js',
    ];
    return sha256(files.map((file) => `${file}\0${this.readUtf8(file)}\0`).join(''));
  }

  readState() {
    try {
      const parsed = JSON.parse(this.fs.readFileSync(this.statePath, 'utf8'));
      return parsed.schemaVersion === SCHEMA_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }

  validatePolicy() {
    const packageJson = JSON.parse(this.readUtf8('package.json'));
    const packageLock = JSON.parse(this.readUtf8('package-lock.json'));
    if (packageLock.lockfileVersion !== 3) throw new InstallError('NPM_LOCK_VERSION', 'package-lock.json lockfileVersion 3 degil.');
    const rootLock = packageLock.packages && packageLock.packages[''];
    if (!rootLock) throw new InstallError('NPM_LOCK_ROOT', 'package-lock.json kok paketi eksik.');
    if (JSON.stringify(rootLock.dependencies || {}) !== JSON.stringify(packageJson.dependencies || {}) ||
        JSON.stringify(rootLock.devDependencies || {}) !== JSON.stringify(packageJson.devDependencies || {})) {
      throw new InstallError('NPM_LOCK_DRIFT', 'package.json ile package-lock.json uyusmuyor; npm ci bunu kabul etmez.');
    }
    const electron = packageLock.packages['node_modules/electron'];
    if (!electron || !String(electron.resolved || '').endsWith(`#${ELECTRON_COMMIT}`)) {
      throw new InstallError('ELECTRON_COMMIT', 'Castlabs Electron Git bagimliligi izin verilen committe degil.');
    }
    for (const [name, metadata] of Object.entries(packageLock.packages)) {
      if (!name) continue;
      const legacyLicense = LEGACY_NPM_LICENSES.get(`${name}@${metadata.version}`);
      if (!metadata.license && !legacyLicense) {
        throw new InstallError('NPM_LICENSE', `${name} icin lisans metadata'si eksik.`);
      }
      if (String(metadata.resolved || '').includes('registry.npmjs.org') && !metadata.integrity) {
        throw new InstallError('NPM_INTEGRITY', `${name} icin registry integrity degeri eksik.`);
      }
    }
    for (const file of ['backend/requirements-core.lock', 'backend/constraints-install.lock', 'backend/requirements-whisperx.lock', 'backend/requirements-diarize.lock']) {
      parsePinnedRequirements(this.readUtf8(file));
    }
  }

  preflight() {
    this.transition('PREFLIGHT');
    for (const tool of ['npm', 'git']) {
      if (!this.driver.commandExists(tool)) throw new InstallError(`${tool.toUpperCase()}_MISSING`, `${tool} bulunamadi veya PATH uzerinde degil.`);
    }
    const nodeVersion = this.driver.nodeVersion();
    if (!supportedNode(nodeVersion)) throw new InstallError('NODE_VERSION', `Node.js 22.13+ gerekir; bulunan ${nodeVersion}.`);
    const python = this.driver.systemPythonVersion();
    if (!supportedPython(python)) throw new InstallError('PYTHON_VERSION', 'CPython 3.10 veya 3.11 gerekir.');
    if (!this.driver.localFfmpegExists() && !(this.driver.commandExists('ffmpeg') && this.driver.commandExists('ffprobe'))) {
      throw new InstallError('FFMPEG_MISSING', 'ffmpeg ve ffprobe bulunamadi. Ikisini backend\\bin altina koyun veya PATH ekleyin.');
    }
    if (this.driver.freeBytes() < MIN_FREE_BYTES) throw new InstallError('DISK_SPACE', 'Kurulum icin en az 10 GiB bos alan gerekir.');
    this.validatePolicy();
  }

  acquireLock(allowDeadPidRecovery = true) {
    this.transition('LOCK');
    let fd = null;
    let created = false;
    try {
      fd = this.fs.openSync(this.lockPath, 'wx');
      created = true;
      this.fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      this.fs.closeSync(fd);
      fd = null;
    } catch (error) {
      if (fd !== null) {
        try { this.fs.closeSync(fd); } catch {}
      }
      if (created) {
        try { this.fs.unlinkSync(this.lockPath); } catch {}
      }
      if (error && error.code === 'EEXIST') {
        let owner = null;
        try { owner = JSON.parse(this.fs.readFileSync(this.lockPath, 'utf8')); } catch {}
        if (allowDeadPidRecovery && Number.isInteger(owner && owner.pid) && !this.driver.processAlive(owner.pid)) {
          try {
            this.fs.unlinkSync(this.lockPath);
          } catch (unlinkError) {
            throw new InstallError('CONCURRENT_INSTALL', `Olmus kurulum kilidi kaldirilamadi: ${unlinkError.message}`);
          }
          return this.acquireLock(false);
        }
        throw new InstallError('CONCURRENT_INSTALL', 'Baska bir kurulum calisiyor veya sahibi dogrulanamayan bir kurulum kilidi var.');
      }
      throw error;
    }
  }

  releaseLock() {
    try { this.fs.unlinkSync(this.lockPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }

  assertSafeTemporary(target) {
    const relative = path.relative(this.root, path.resolve(target));
    const base = path.basename(target);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !/^\.(venv|node_modules)-(installing|backup)-\d+$/.test(base)) {
      throw new InstallError('UNSAFE_PATH', `Gecici yol guvenlik siniri disinda: ${target}`);
    }
  }

  removeTemporary(target) {
    this.assertSafeTemporary(target);
    this.fs.rmSync(target, { recursive: true, force: true });
  }

  expectedPins(profiles) {
    const pins = parsePinnedRequirements(this.readUtf8('backend/requirements-core.lock'));
    for (const spec of TORCH_PINS) {
      const [name, version] = spec.split('==');
      pins.set(name, version);
    }
    if (profiles.includes('whisperx')) pins.set('whisperx', '3.4.2');
    if (profiles.includes('whisperx') || profiles.includes('diarize')) pins.set('pyannote-audio', '3.3.2');
    return pins;
  }

  currentProfiles(requested) {
    const state = this.readState();
    const profiles = new Set(state && Array.isArray(state.profiles) ? state.profiles : []);
    profiles.add('core');
    if (requested !== 'core') profiles.add(requested);
    return [...profiles].filter((item) => VALID_PROFILES.has(item)).sort();
  }

  existingHealthy(fingerprint, profiles) {
    const state = this.readState();
    if (!state || state.fingerprint !== fingerprint || JSON.stringify(state.profiles) !== JSON.stringify(profiles)) return null;
    try {
      const packages = this.driver.verifyVenv(this.venvPath, this.expectedPins(profiles));
      const currentManifest = normalizeManifest(packages);
      const currentPackageLockHash = sha256(this.readUtf8('package-lock.json'));
      if (state.pythonManifestSha256 !== sha256(currentManifest) ||
          state.packageLockSha256 !== currentPackageLockHash ||
          JSON.stringify(state.packages) !== JSON.stringify(currentManifest.trim().split('\n'))) {
        return null;
      }
      if (profiles.includes('core')) this.driver.verifyNode();
      return packages;
    } catch {
      return null;
    }
  }

  swapVenvIn() {
    this.transition('PYTHON_COMMIT');
    if (this.fs.existsSync(this.venvBackup)) throw new InstallError('BACKUP_EXISTS', `Gecici yedek zaten var: ${this.venvBackup}`);
    if (this.fs.existsSync(this.venvPath)) this.fs.renameSync(this.venvPath, this.venvBackup);
    try {
      this.fs.renameSync(this.stagePath, this.venvPath);
    } catch (error) {
      if (this.fs.existsSync(this.venvBackup)) this.fs.renameSync(this.venvBackup, this.venvPath);
      throw new InstallError('VENV_SWAP', `Yeni sanal ortam devreye alinamadi: ${error.message}`);
    }
  }

  rollbackVenv() {
    this.transition('PYTHON_ROLLBACK');
    if (this.fs.existsSync(this.venvPath)) {
      const failed = path.join(this.root, 'backend', `.venv-installing-${process.pid}`);
      if (this.fs.existsSync(failed)) this.removeTemporary(failed);
      this.fs.renameSync(this.venvPath, failed);
      this.removeTemporary(failed);
    }
    if (this.fs.existsSync(this.venvBackup)) this.fs.renameSync(this.venvBackup, this.venvPath);
  }

  installNodeTransaction() {
    this.transition('NODE_INSTALL');
    if (this.fs.existsSync(this.nodeBackup)) throw new InstallError('NODE_BACKUP_EXISTS', `Gecici Node yedegi zaten var: ${this.nodeBackup}`);
    if (this.fs.existsSync(this.nodePath)) this.fs.renameSync(this.nodePath, this.nodeBackup);
    try {
      this.driver.installNode();
      this.driver.verifyNode();
    } catch (error) {
      if (this.fs.existsSync(this.nodePath)) this.fs.rmSync(this.nodePath, { recursive: true, force: true });
      if (this.fs.existsSync(this.nodeBackup)) this.fs.renameSync(this.nodeBackup, this.nodePath);
      throw error;
    }
  }

  rollbackNode() {
    this.transition('NODE_ROLLBACK');
    if (this.fs.existsSync(this.nodePath)) this.fs.rmSync(this.nodePath, { recursive: true, force: true });
    if (this.fs.existsSync(this.nodeBackup)) this.fs.renameSync(this.nodeBackup, this.nodePath);
  }

  finalizeBackups() {
    for (const target of [this.venvBackup, this.nodeBackup]) {
      if (!this.fs.existsSync(target)) continue;
      try {
        this.removeTemporary(target);
      } catch (error) {
        this.driver.log(`UYARI: Eski kurulum yedegi silinemedi; yeni kurulum gecerlidir: ${target} (${error.message})`);
      }
    }
  }

  writeState(fingerprint, profiles, packages) {
    const manifest = normalizeManifest(packages);
    const packageLockHash = sha256(this.readUtf8('package-lock.json'));
    const state = {
      schemaVersion: SCHEMA_VERSION,
      fingerprint,
      profiles,
      pythonManifestSha256: sha256(manifest),
      packageLockSha256: packageLockHash,
      packages: manifest.trim().split('\n'),
    };
    const temporary = path.join(this.root, 'backend', 'install-state.json.tmp');
    this.fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    this.fs.renameSync(temporary, this.statePath);
    return state;
  }

  run(requested = 'core') {
    if (!VALID_PROFILES.has(requested)) throw new InstallError('PROFILE', `Bilinmeyen kurulum profili: ${requested}`);
    this.preflight();
    this.acquireLock();
    let swapped = false;
    let nodeChanged = false;
    let stageCreated = false;
    let primaryFailure = null;
    try {
      const fingerprint = this.desiredFingerprint();
      const profiles = this.currentProfiles(requested);
      if (requested !== 'core') {
        const baseState = this.readState();
        if (!baseState || !Array.isArray(baseState.profiles) || !baseState.profiles.includes('core')) {
          throw new InstallError('CORE_REQUIRED', 'Opsiyonel eklentiden once install.bat ile ana kurulumu tamamlayin.');
        }
        this.driver.verifyVenv(this.venvPath, this.expectedPins(baseState.profiles));
        this.driver.verifyNode();
      }
      const healthy = this.existingHealthy(fingerprint, profiles);
      if (healthy) {
        this.transition('IDEMPOTENT_SKIP');
        return this.readState();
      }
      this.transition('PYTHON_STAGE');
      if (this.fs.existsSync(this.stagePath)) throw new InstallError('STAGE_EXISTS', `Gecici kurulum dizini zaten var: ${this.stagePath}`);
      this.driver.createVenv(this.stagePath);
      stageCreated = true;
      this.driver.installIntoVenv(this.stagePath, profiles);
      const packages = this.driver.verifyVenv(this.stagePath, this.expectedPins(profiles));
      this.swapVenvIn();
      swapped = true;
      if (requested === 'core') {
        this.installNodeTransaction();
        nodeChanged = true;
      }
      const state = this.writeState(fingerprint, profiles, packages);
      this.finalizeBackups();
      this.transition('DONE');
      return state;
    } catch (error) {
      primaryFailure = error;
      this.transition('FAILED');
      try {
        if (nodeChanged) this.rollbackNode();
        if (swapped) this.rollbackVenv();
        else if (stageCreated && this.fs.existsSync(this.stagePath)) this.removeTemporary(this.stagePath);
      } catch (rollbackError) {
        this.driver.log(`UYARI: Kurulum geri alma tamamlanamadi: ${rollbackError.message}`);
      }
      throw error;
    } finally {
      try {
        this.releaseLock();
      } catch (lockError) {
        if (primaryFailure) {
          this.driver.log(`UYARI: Kurulum kilidi serbest birakilamadi: ${lockError.message}`);
        } else {
          throw new InstallError('LOCK_RELEASE', `Kurulum tamamlandi ancak kilit serbest birakilamadi: ${lockError.message}`);
        }
      }
    }
  }
}

function main(argv = process.argv.slice(2)) {
  const profile = argv[0] || 'core';
  const root = path.resolve(__dirname, '..');
  try {
    const orchestrator = new InstallOrchestrator(root);
    if (profile === 'preflight') {
      orchestrator.preflight();
      process.stdout.write('\nOn kosullar ve tedarik zinciri politikasi dogrulandi.\n');
      return 0;
    }
    const state = orchestrator.run(profile);
    process.stdout.write(`\nKurulum dogrulandi. Manifest SHA-256: ${state.pythonManifestSha256}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof InstallError ? error.code : 'UNEXPECTED';
    process.stderr.write(`\nHATA [${code}]: ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  ELECTRON_COMMIT,
  LEGACY_NPM_LICENSES,
  InstallError,
  InstallOrchestrator,
  MIN_FREE_BYTES,
  RealDriver,
  TORCH_PINS,
  canonicalPackageName,
  normalizeManifest,
  parsePinnedRequirements,
  parsePythonVersion,
  sha256,
  supportedNode,
  supportedPython,
};
