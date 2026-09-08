/**
 * İzleme kütüphanesi tombstone davranışını gerçek Electron ana süreçleri ve
 * geçici userData profiliyle doğrular. BrowserWindow oluşturmaz.
 *
 * Çalıştırma:
 *   WHISPER_ELECTRON_BIN=<electron.exe> node tests/watch-library-electron.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KEY = 'file:electron-tombstone';

function createStore(app) {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf-8');
  const start = main.indexOf('const WATCH_LIBRARY_LIMIT');
  const end = main.indexOf('// ---- Pencere boyutu hatırlama', start);
  const jsonStart = main.indexOf('function writeJsonAtomic(filePath, value)');
  const jsonEnd = main.indexOf("ipcMain.handle('media:writeSubtitle'", jsonStart);
  const decodeStart = main.indexOf('const CP1254_FIXUP');
  const decodeEnd = main.indexOf("ipcMain.handle('media:readSubtitle'", decodeStart);
  if ([start, end, jsonStart, jsonEnd, decodeStart, decodeEnd].some((index) => index < 0)) {
    throw new Error('İzleme kütüphanesi kaynak blokları bulunamadı.');
  }
  const source = [
    main.slice(decodeStart, decodeEnd),
    main.slice(jsonStart, jsonEnd),
    main.slice(start, end),
  ].join('\n');
  return new Function('fs', 'path', 'app', `${source}\nreturn { loadWatchLibrary, upsertWatchItem, removeWatchItem, isWatchItemRemoved };`)(fs, path, app);
}

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : '';
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function runElectronPhase() {
  const { app } = require('electron');
  const profile = arg('profile');
  const phase = arg('phase');
  if (!profile || !phase) throw new Error('Electron test profili veya aşaması eksik.');
  app.setPath('userData', profile);
  await app.whenReady();
  const store = createStore(app);
  if (phase === 'remove') {
    assert(store.upsertWatchItem({ key: KEY, title: 'Electron fixture', duration: 120, position: 10 }),
      'başlangıç kaydı oluşturulamadı');
    assert(store.removeWatchItem(KEY), 'kayıt silinemedi');
    assert(store.upsertWatchItem({ key: KEY, duration: 120, position: 11 }) === null,
      'silmeden sonra ulaşan geç upsert tombstoneu aştı');
  } else if (phase === 'restart') {
    assert(store.isWatchItemRemoved(KEY), 'restart sonrası tombstone okunamadı');
    const events = [
      ['play/progress', 20],
      ['seek', 55],
      ['pause', 56],
      ['navigation', 80],
    ];
    for (const [event, position] of events) {
      assert(store.upsertWatchItem({ key: KEY, duration: 120, position }) === null,
        `${event} otomatik kaydı silinen videoyu yeniden oluşturdu`);
    }
    assert(!store.loadWatchLibrary().some((item) => item.key === KEY),
      'restart sürecinde silinen kayıt yeniden görünür oldu');
  } else if (phase === 'restore') {
    const restored = store.upsertWatchItem({
      key: KEY, title: 'Electron fixture', duration: 120, position: 80,
    }, { restoreRemoved: true });
    assert(restored && restored.key === KEY, 'açık geri ekleme niyeti kaydı geri getirmedi');
    assert(!store.isWatchItemRemoved(KEY), 'açık geri eklemeden sonra tombstone kaldı');
  } else {
    throw new Error(`Bilinmeyen Electron test aşaması: ${phase}`);
  }
  app.quit();
}

function electronBinary() {
  const candidates = [
    process.env.WHISPER_ELECTRON_BIN,
    path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
  ].filter(Boolean);
  try { candidates.push(require('electron')); } catch (_) {}
  return candidates.find((candidate) => typeof candidate === 'string' && fs.existsSync(candidate));
}

function runNodeOrchestrator() {
  const electron = electronBinary();
  if (!electron) {
    console.log('  SKIP  Electron bulunamadı; WHISPER_ELECTRON_BIN ile yol verilebilir.');
    return;
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-watch-electron-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    for (const phase of ['remove', 'restart', 'restore']) {
      const result = spawnSync(electron, [__filename, `--profile=${profile}`, `--phase=${phase}`], {
        cwd: ROOT,
        env,
        encoding: 'utf-8',
        timeout: 30000,
      });
      if (result.status !== 0) {
        throw new Error(`${phase} aşaması başarısız:\n${result.stderr || result.stdout || result.error || ''}`);
      }
    }
    console.log('  PASS  geçici userData ile Electron silme → olaylar → restart → açık geri ekleme');
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.versions.electron) {
  runElectronPhase().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
    try { require('electron').app.quit(); } catch (_) {}
  });
} else {
  runNodeOrchestrator();
}
