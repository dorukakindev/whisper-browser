const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const { WatchIndex, databaseConstructor } = require('../src/watch-index');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

function hasFts5() {
  const Ctor = databaseConstructor();
  if (!Ctor) return false;
  const probe = new Ctor(':memory:');
  try {
    probe.exec('CREATE VIRTUAL TABLE fts_probe USING fts5(value)');
    return true;
  } catch (_) { return false; }
  finally { probe.close(); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-relink-'));
try {
  const fts5 = hasFts5();
  // ---- renameMediaId: gercek sqlite'de medya + iz + not tasinmasi ----
  test('renameMediaId medya satirini, izleri ve notlari yeni kimlige tasir', () => {
    if (!fts5) return;
    const index = new WatchIndex(path.join(dir, 'index.db'));
    index.upsertMedia({ id: 'file:/old/movie.mp4', service: 'local', title: 'Movie', url: '/old/movie.mp4', duration: 100, position: 42, completed: false, lastWatched: 1000, prefs: { collections: ['fav'] } });
    index.upsertTrack({ id: 'trk-1', mediaId: 'file:/old/movie.mp4', role: 'source', language: 'en', label: 'Main', source: 'file', hash: 'h1', assetPath: '' });
    index.upsertAnnotation({ id: 'ann-1', mediaId: 'file:/old/movie.mp4', type: 'note', start: 10, end: 12, source: 'line', translation: 'satır', note: 'not', status: 'new' });
    const moved = index.renameMediaId('file:/old/movie.mp4', 'file:/new/movie.mp4');
    assert(moved, 'renameMediaId yeni satir dondurmeli');
    assert.strictEqual(moved.id, 'file:/new/movie.mp4');
    assert.strictEqual(moved.position, 42);
    assert.deepStrictEqual(moved.prefs, { collections: ['fav'] });
    assert.strictEqual(index.getMedia('file:/old/movie.mp4'), null, 'eski medya satiri kalmamali');
    assert.deepStrictEqual(index.listTracks('file:/new/movie.mp4').map(t => t.id), ['trk-1']);
    assert.deepStrictEqual(index.listAnnotations('file:/new/movie.mp4').map(a => a.id), ['ann-1']);
    assert.strictEqual(index.listTracks('file:/old/movie.mp4').length, 0);
    index.close?.();
  });

  test('renameMediaId olmayan kaynakta null dondurur ve ayni-kimligi yoksayar', () => {
    if (!fts5) return;
    const index = new WatchIndex(path.join(dir, 'index2.db'));
    assert.strictEqual(index.renameMediaId('file:/x.mp4', 'file:/y.mp4'), null);
    index.upsertMedia({ id: 'file:/a.mp4', service: 'local', title: 'A', url: '/a.mp4' });
    assert.strictEqual(index.renameMediaId('file:/a.mp4', 'file:/a.mp4'), null);
    index.close?.();
  });

  // ---- library:relink handler kaynak degismezleri ----
  test("library:relink handler'i var, file: on-eki + inspect + cakisma kapilari korunur", () => {
    assert.match(mainSource, /ipcMain\.handle\('library:relink'/);
    assert.match(mainSource, /oldKey\.startsWith\('file:'\)/);
    assert.match(mainSource, /mediaFileAccess\.inspect\(newPath\)/);
    assert.match(mainSource, /zaten başka bir kütüphane kaydına bağlı/);
    assert.match(mainSource, /renameMediaId\(oldKey, newKey\)/);
  });

  test('preload relinkWatchItem kopusu library:relink kanalina bagli', () => {
    assert.match(preloadSource, /relinkWatchItem:\s*\(oldKey, newPath\)\s*=>\s*ipcRenderer\.invoke\('library:relink'/);
  });

  // ---- renderer relink akisi kaynak degismezleri ----
  test('video hata dinleyicisi yerel dosya icin offerMediaRelink cagirir (ABORTED haric)', () => {
    assert.match(rendererSource, /video\.addEventListener\('error', \(\) => \{[\s\S]*?offerMediaRelink\(\)/);
    assert.match(rendererSource, /player\.localPath && code !== MediaError\.MEDIA_ERR_ABORTED/);
  });

  test('offerMediaRelink file: anahtari disinda ve tekrar/in-flight durumda calismaz', () => {
    assert.match(rendererSource, /!staleKey\.startsWith\('file:'\)/);
    assert.match(rendererSource, /player\.mediaRelinkOffered === staleKey \|\| player\.mediaRelinkInFlight/);
    assert.match(rendererSource, /relinkWatchItem\(staleKey, replacement\)/);
    assert.match(rendererSource, /player\.mediaRelinkOffered = ''/);
  });

  // ---- migratePlayerMediaKeyState davranis kilidi (vm dilimi) ----
  test('migratePlayerMediaKeyState kaydedilmis cue/kelime/izleme konumunu tasirir', () => {
    const start = rendererSource.indexOf('function migratePlayerMediaKeyState');
    const end = rendererSource.indexOf('window.api.onEvent', start);
    assert(start > 0 && end > start, 'dilim sinirlari bulunmali');
    const storage = new Map();
    const sandbox = {
      player: { positions: {} },
      localStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
      },
      scheduleSave: () => {},
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(rendererSource.slice(start, end), sandbox);
    storage.set('whisper-player-saved:file:/old.mp4', '["cue-sig"]');
    storage.set('whisper-player-words:file:/old.mp4', '["word"]');
    sandbox.player.positions['file:/old.mp4'] = { t: 95, d: 200, at: 5 };
    vm.runInContext('migratePlayerMediaKeyState("file:/old.mp4", "file:/new.mp4")', sandbox);
    assert.strictEqual(storage.get('whisper-player-saved:file:/new.mp4'), '["cue-sig"]');
    assert.strictEqual(storage.get('whisper-player-words:file:/new.mp4'), '["word"]');
    assert.strictEqual(storage.has('whisper-player-saved:file:/old.mp4'), false);
    assert.strictEqual(storage.has('whisper-player-words:file:/old.mp4'), false);
    assert.deepStrictEqual(sandbox.player.positions['file:/new.mp4'], { t: 95, d: 200, at: 5 });
    assert.strictEqual(sandbox.player.positions['file:/old.mp4'], undefined);
  });

  test('migratePlayerMediaKeyState hedef doluysa ezmez ve ayni-kimligi yoksayar', () => {
    const start = rendererSource.indexOf('function migratePlayerMediaKeyState');
    const end = rendererSource.indexOf('window.api.onEvent', start);
    const storage = new Map();
    const sandbox = {
      player: { positions: {} },
      localStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
      },
      scheduleSave: () => {},
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(rendererSource.slice(start, end), sandbox);
    storage.set('whisper-player-saved:file:/new.mp4', '["existing"]');
    storage.set('whisper-player-saved:file:/old.mp4', '["stale"]');
    sandbox.player.positions['file:/new.mp4'] = { t: 10 };
    sandbox.player.positions['file:/old.mp4'] = { t: 95 };
    vm.runInContext('migratePlayerMediaKeyState("file:/old.mp4", "file:/new.mp4")', sandbox);
    assert.strictEqual(storage.get('whisper-player-saved:file:/new.mp4'), '["existing"]');
    assert.strictEqual(sandbox.player.positions['file:/new.mp4'].t, 10, 'yeni konum ezilmemeli');
    assert.strictEqual(sandbox.player.positions['file:/old.mp4'], undefined);
  });

  console.log(`PASS ${passed}/8${fts5 ? '' : ' (FTS5 yok — renameMediaId sqlite kilidi atlandi)'}`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
