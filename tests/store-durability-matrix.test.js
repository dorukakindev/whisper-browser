'use strict';
// Store dayanıklılık matrisi — R281.
//
// Temp-write + rename yalnız ATOMİKLİK sağlar; güç kesintisinde diske gerçekten
// ulaşma garantisini fsync verir. Bu matris her deposun commit yolunda aynı
// töreni kilitler:
//   1) temp dosya fsync'si rename'den ÖNCE,
//   2) .bak kopyası fsync'lenir (varsa),
//   3) rename'den SONRA dizin fsync'i.
// Sıra kayması = fsync'in yanlış dosyaya/dizine uygulanması kadar kötüdür.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

const { createWatchLibraryStore } = require('../src/watch-library-store');
const { writeBrowserSessionAtomic } = require('../src/browser-session-store');
const { BrowserNoteStore } = require('../src/browser-note-store');
const { BrowserAssetStore } = require('../src/browser-asset-store');
const { createMediaCatalogStore } = require('../src/media-catalog-store');
const { atomicWriteFileSync } = require('../src/fsync-utils');
const { BrowserReadingList } = require('../src/browser-reading-list');
const { createBrowserSeriesContext } = require('../src/browser-series-context');

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); passed += 1; console.log(`  PASS ${name}`); }

async function main() {

// Çağrı kayıtlı fs sarmalayıcı — openSync fd→yol eşlemesiyle fsyncSync'i
// dosya bazında izler (fsyncSync yol değil tanıtıcı alır).
function recordingFs() {
  const calls = [];
  const fds = new Map();
  const wrap = (name) => (...a) => {
    const rec = { op: name, arg: String(a[0]), arg2: a[1] === undefined ? '' : String(a[1]) };
    // Çağrı önce kaydedilir — Windows'ta openSync(dir) fırlatır ve deneme
    // kanıtı (aşağıdaki platform koşullu dizin-fsync kuralı) ancak böyle görünür.
    calls.push(rec);
    const out = fs[name](...a);
    if (name === 'openSync') fds.set(out, String(a[0]));
    if (name === 'fsyncSync') calls.push({ op: 'fsync', arg: fds.get(a[0]) || `fd:${a[0]}`, arg2: '' });
    return out;
  };
  return {
    calls,
    io: new Proxy({}, {
      get: (_t, p) => {
        if (typeof fs[p] === 'function') return wrap(p);
        return fs[p];
      },
    }),
  };
}

// Matris kuralı: temp fsync → rename → dizin fsync sırası.
// renameSync/copyFileSync arg0=kaynak, arg2=hedef olarak kaydedilir.
function assertCommitOrder(name, calls, filePath) {
  const dir = path.dirname(filePath);
  const mainRename = calls.findIndex((c) => c.op === 'renameSync' && c.arg2 === filePath);
  ok(`${name}: ana rename var`, mainRename >= 0);
  const tempPath = mainRename >= 0 ? calls[mainRename].arg : '';
  const tempFsync = calls.findIndex((c) => c.op === 'fsync' && c.arg === tempPath);
  ok(`${name}: temp fsync rename'den önce`, tempFsync >= 0 && tempFsync < mainRename);
  // fsyncDirectory ile aynı deneme: aç + fsync. Windows'ta openSync(dir) bazı
  // Node/sistemde döner ama fsyncSync EPERM fırlatır — kapı ikisine birden bakmalı.
  const dirFsyncSupported = (() => {
    let d;
    try { d = fs.openSync(dir, 'r'); fs.fsyncSync(d); fs.closeSync(d); return true; }
    catch { try { if (d !== undefined) fs.closeSync(d); } catch {} return false; }
  })();
  if (dirFsyncSupported) {
    const dirFsync = calls.findIndex((c, i) => i > mainRename && c.op === 'fsync' && c.arg === dir);
    ok(`${name}: dizin fsync rename'den sonra`, dirFsync > mainRename);
  } else {
    // Windows: dizin fsync API'si yok — törenin denemesi rename sonrasına kilitlenir.
    const dirAttempt = calls.findIndex((c, i) => i > mainRename && c.op === 'openSync' && c.arg === dir);
    ok(`${name}: dizin fsync denemesi rename'den sonra`, dirAttempt > mainRename);
  }

  // Yedek (.bak) hedefi: copyFileSync dest, writeFileSync arg veya renameSync dest
  // kalıbıyla gelir — hangi biçimde yazıldıysa fsync kanıtı olmalı.
  const bakWrites = calls.filter((c) =>
    (c.op === 'copyFileSync' && c.arg2.endsWith('.bak'))
    || (c.op === 'writeFileSync' && c.arg.endsWith('.bak'))
    || (c.op === 'renameSync' && c.arg2.endsWith('.bak')));
  if (bakWrites.length) {
    const hasFsync = bakWrites.every((w) => {
      const target = w.op === 'renameSync' ? w.arg : w.arg2;
      const source = w.op === 'renameSync' ? w.arg : w.arg;
      return calls.some((c) => c.op === 'fsync' && (c.arg === target || c.arg === source));
    });
    ok(`${name}: yedek fsync'lenir`, hasFsync);
    // Sıra kilidi: yedek fsync'i yedek yazımı ile ana rename ARASINDA olmalı —
    // önceki bir fsync yanlış sıralamayı gizler, rename'den sonraki ise
    // yedeğin commit'ten önce kalıcı olmadığı anlamına gelir.
    const ordered = bakWrites.every((w) => {
      const target = w.op === 'renameSync' ? w.arg : w.arg2;
      const source = w.op === 'renameSync' ? w.arg : w.arg;
      const writeIdx = calls.indexOf(w);
      return calls.some((c, i) => i > writeIdx && i < mainRename && c.op === 'fsync' && (c.arg === target || c.arg === source));
    });
    ok(`${name}: yedek fsync'i yazım-rename arasında`, ordered);
  }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-durability-'));

try {

// --- 1) watch-library-store ---
{
  const filePath = path.join(tmpRoot, 'watch', 'watch-library.json');
  const { calls, io } = recordingFs();
  const store = createWatchLibraryStore({ filePath, fsImpl: io });
  store.upsert({ key: 'local:x', title: 'x', mediaId: 'm1' });
  assertCommitOrder('watch-library-store', calls, filePath);
}

// --- 2) browser-session-store ---
{
  const filePath = path.join(tmpRoot, 'session', 'browser-session.json');
  writeBrowserSessionAtomic(filePath, { tabs: [{ id: 't1', url: 'https://example.com', title: 'x' }], activeTabId: 't1' }, fs);
  const { calls, io } = recordingFs();
  const out = writeBrowserSessionAtomic(filePath, { tabs: [{ id: 't1', url: 'https://example.com', title: 'y' }], activeTabId: 't1' }, io, { mirrorBackup: true });
  ok('session-store: yazım başarılı', out.ok === true);
  assertCommitOrder('session-store', calls, filePath);
}

// --- 3) browser-note-store ---
{
  const filePath = path.join(tmpRoot, 'notes', 'notes.json');
  const { calls, io } = recordingFs();
  const store = new BrowserNoteStore(filePath, { io });
  store.upsert({ mediaId: 'm1', note: 'not' });
  assertCommitOrder('note-store', calls, filePath);
}

// --- 4) browser-asset-store ---
{
  const rootDir = path.join(tmpRoot, 'assets');
  const { calls, io } = recordingFs();
  const store = new BrowserAssetStore({ rootDir, fsModule: io });
  const out = store.putTrack({
    mediaId: 'a'.repeat(24),
    cues: [{ start: 0, end: 1.5, text: 'satır' }],
  });
  ok('asset-store: putTrack başarılı', out.ok === true);
  assertCommitOrder('asset-store: json', calls, out.jsonPath);
  // SRT yan dosyası da aynı törenle yazılır — JSON dayanıklı ama SRT
  // senkronsuz olsaydı matris bunu görmezden gelirdi.
  assertCommitOrder('asset-store: srt', calls, out.srtPath);
}

// --- 4b) asset-store SRT yeniden-kurulum yolu (getTrack) ---
{
  const rootDir = path.join(tmpRoot, 'assets-rebuild');
  const store = new BrowserAssetStore({ rootDir, fsModule: fs });
  const out = store.putTrack({ mediaId: 'b'.repeat(24), cues: [{ start: 0, end: 1, text: 'x' }] });
  fs.unlinkSync(out.srtPath);
  const { calls, io } = recordingFs();
  const store2 = new BrowserAssetStore({ rootDir, fsModule: io });
  const got = store2.getTrack(out.assetId);
  ok('asset-store: eksik SRT yeniden kuruldu', got.ok === true);
  assertCommitOrder('asset-store: srt-rebuild', calls, out.srtPath);
}

// --- 5) media-catalog-store ---
{
  const filePath = path.join(tmpRoot, 'catalog', 'media-catalog.json');
  const { calls, io } = recordingFs();
  const store = createMediaCatalogStore({ filePath, fsImpl: io });
  store.upsert({ id: 'm1', kind: 'film', title: 'örnek', source: { type: 'local', value: '/tmp/x.mp4' } });
  assertCommitOrder('media-catalog-store', calls, filePath);
}

// --- 6) atomicWriteFileSync yardımcısı (afiş PNG yolu dahil herkes) ---
{
  const filePath = path.join(tmpRoot, 'poster', 'poster.png');
  const { calls, io } = recordingFs();
  atomicWriteFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]), { io });
  assertCommitOrder('atomicWriteFileSync', calls, filePath);
  ok('atomicWriteFileSync: ikili içerik birebir yazıldı',
    fs.readFileSync(filePath).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
}

// --- 3b) note-store: rename sonrası dizin-fsync hatası belleği geri almaz ---
// Rename geçtiğinde birincil dosya yeni payload'u taşır; dizin fsync'inin
// hatası yalnız dayanıklılık kanıtını etkiler. Bellek geri alınırsa bir
// sonraki flush bayat durumu diske yazıp kaydı siler.
{
  const filePath = path.join(tmpRoot, 'notes-committed', 'notes.json');
  // Dizin fd'sine gelen fsyncSync'i bozan sarmalayıcı. Her proxy kendi
  // kümesini tutar — paylaşılan kümede yeniden kullanılan fd numarası
  // dosya fsync'ini dizin sanıp erken (uncommitted) hata üretir.
  const state = { fail: true };
  const dirFsyncBomber = () => {
    const dirFds = new Set();
    return new Proxy({}, {
      get: (_t, p) => {
        const fn = fs[p];
        if (p === 'openSync') return (a, b) => {
          const fd = fs.openSync(a, b);
          try { if (fs.fstatSync(fd).isDirectory()) dirFds.add(fd); } catch {}
          return fd;
        };
        if (p === 'fsyncSync') return (fd) => {
          if (state.fail && dirFds.has(fd)) { const e = new Error('dir fsync'); e.code = 'EIO'; throw e; }
          return fs.fsyncSync(fd);
        };
        return typeof fn === 'function' ? fn.bind(fs) : fn;
      },
    });
  };
  const io = dirFsyncBomber();
  const store = new BrowserNoteStore(filePath, { io });
  let failed = null;
  try { store.upsert({ mediaId: 'm1', note: 'bir', id: 'n1' }); } catch (e) { failed = e; }
  ok('note-store: rename sonrası fsync hatası yüzeye çıkar', failed && failed.code === 'EIO');
  ok('note-store: committed hata belleği geri almadı', store.list('m1').length === 1);
  // Disk de yeni durumda — temiz okuyucuyla doğrulanır.
  const fresh = new BrowserNoteStore(filePath, {});
  ok('note-store: disk dosyası yeni kaydı taşır', fresh.list('m1').length === 1);
  // io iyileşince sonraki flush aynı durumu korur — kayıp yok.
  state.fail = false;
  store.upsert({ mediaId: 'm1', note: 'iki', id: 'n2' });
  ok('note-store: sonraki flush her iki notu korur', store.list('m1').length === 2);
  // remove aynı yolu izler: committed hata silmeyi geri almaz.
  const io2 = dirFsyncBomber();
  const store3 = new BrowserNoteStore(filePath, { io: io2 });
  const id = store3.list('m1')[0].id;
  state.fail = true;
  let removeErr = null;
  try { store3.remove(id); } catch (e) { removeErr = e; }
  ok('note-store: remove committed hata belleği geri almadı',
    removeErr && removeErr.code === 'EIO' && store3.list('m1').length === 1);
  // importMissing aynı kuralı izler: committed hata eklenen notları geri
  // almaz — alınırsa sonraki flush onları diskten siler.
  state.fail = false;
  const filePath4 = path.join(tmpRoot, 'notes-import', 'notes.json');
  const io4 = dirFsyncBomber();
  const store4 = new BrowserNoteStore(filePath4, { io: io4 });
  state.fail = true;
  let importErr = null;
  try { store4.importMissing([{ mediaId: 'm2', note: 'aktar', id: 'nx' }]); }
  catch (e) { importErr = e; }
  ok('note-store: importMissing committed hata eklenen notu korur',
    importErr && importErr.code === 'EIO' && store4.list('m2').length === 1);
}

// --- 5b) media-catalog-store: birincil bozulunca .bak yedeği okunur ---
{
  const filePath = path.join(tmpRoot, 'catalog-bak', 'media-catalog.json');
  const store = createMediaCatalogStore({ filePath, fsImpl: fs });
  store.upsert({ id: 'm1', kind: 'film', title: 'yedek', source: { type: 'local', value: '/tmp/y.mp4' } });
  // İkinci commit birincil'in geçerli içeriğini .bak'a taşır.
  store.upsert({ id: 'm2', kind: 'film', title: 'yeni', source: { type: 'local', value: '/tmp/z.mp4' } });
  fs.writeFileSync(filePath, '{bozuk json');
  const recovered = createMediaCatalogStore({ filePath, fsImpl: fs });
  const items = recovered.list();
  ok('media-catalog: bozuk birincil .bak yedeğine düşer',
    items.length === 1 && items[0].id === 'm1');
}

// --- 6b) atomicWriteFileSync: çok düzeyli eksik zincir her düzeyi fsync'ler ---
{
  const filePath = path.join(tmpRoot, 'deep', 'a', 'b', 'poster.png');
  const { calls, io } = recordingFs();
  atomicWriteFileSync(filePath, Buffer.from([1, 2, 3]), { io });
  assertCommitOrder('atomic: deep', calls, filePath);
  const dirFsyncSupported = (() => {
    let d;
    try { d = fs.openSync(tmpRoot, 'r'); fs.fsyncSync(d); fs.closeSync(d); return true; }
    catch { try { if (d !== undefined) fs.closeSync(d); } catch {} return false; }
  })();
  const ancestors = [
    path.join(tmpRoot, 'deep', 'a', 'b'),
    path.join(tmpRoot, 'deep', 'a'),
    path.join(tmpRoot, 'deep'),
    tmpRoot,
  ];
  if (dirFsyncSupported) {
    const fsynced = new Set(calls.filter((c) => c.op === 'fsync').map((c) => c.arg));
    for (const d of ancestors) {
      ok(`atomic: zincir fsync ${path.relative(tmpRoot, d) || '.'}`, fsynced.has(d));
    }
  } else {
    // Windows: dizin fsync yok — her düzey için açma denemesi kilitlenir.
    const opened = new Set(calls.filter((c) => c.op === 'openSync').map((c) => c.arg));
    for (const d of ancestors) {
      ok(`atomic: zincir denemesi ${path.relative(tmpRoot, d) || '.'}`, opened.has(d));
    }
  }
}

// --- 7) browser-reading-list: _writeIndex — B-381-01 ---
{
  const { calls, io } = recordingFs();
  const root = path.join(tmpRoot, 'reading-list');
  const list = new BrowserReadingList(root, io);
  const plan = list.prepare({ url: 'https://ornek.test/makale', title: 'Örnek Makale' });
  ok('reading-list: hazırlık ok', plan.ok === true);
  // .mhtml dosyası hazırda (savePage çağıran tarafta) — indeksi commit'le.
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(plan.filePath, 'mhtml-bytes');
  const committed = list.commit(plan.entry);
  ok('reading-list: commit ok', committed.ok === true);
  assertCommitOrder('reading-list: index yazımı', calls, list.indexPath);
}

// --- 8) browser-series-context: commit() — B-382-01 ---
{
  const { calls, io } = recordingFs();
  const file = path.join(tmpRoot, 'series-context', 'series.json');
  const store = createBrowserSeriesContext({ filePath: file, fsImpl: io });
  const bound = store.bindAndSave('https://ornek.test|video-1', 'Dizi', 'https://ornek.test/v/1',
    { synopsis: 'kısa', terms: [{ source: 'captain', target: 'kaptan' }] });
  ok('series-context: bağlama ok', bound?.seriesName === 'Dizi');
  assertCommitOrder('series-context: commit', calls, file);
}

await test('store dayanıklılık matrisi — temp fsync → rename → dizin fsync', () => {});

} finally {
  // Başarısız senaryoda bile kalıntı birikmemesi için temizlik finally'de.
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
}
}

main().then(() => {
  console.log(`\n${passed} kontrol geçti`);
  process.exit(process.exitCode || 0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
