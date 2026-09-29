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
  const dirFsyncSupported = (() => {
    try { const d = fs.openSync(dir, 'r'); fs.closeSync(d); return true; } catch { return false; }
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
  }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-durability-'));

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
  assertCommitOrder('asset-store', calls, out.jsonPath);
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

await test('store dayanıklılık matrisi — temp fsync → rename → dizin fsync', () => {});
}

main().then(() => {
  console.log(`\n${passed} kontrol geçti`);
  process.exit(process.exitCode || 0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
