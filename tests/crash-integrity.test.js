'use strict';

// T5 — Çökme/veri bütünlüğü gauntlet'i.
// Her kritik write/rename/close aşamasına deterministik hata enjeksiyonu:
// yazım sırasında "çöken" sahte fs ile üretim atomik-yazar sözleşmesini doğrular:
// (a) eski sağlam çıktı korunur, (b) yarım iş .tmp olarak doğru sınıflanır veya
// temizlenir, (c) yeniden açılış yeni nesille karışmaz.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { BrowserAssetStore } = require('../src/browser-asset-store');
const { PersistentTranslationCache } = require('../src/browser-translation-cache');
const { BrowserTranslationArchive } = require('../src/browser-translation-archive');
const { BrowserNoteStore } = require('../src/browser-note-store');
const { BrowserReadingList } = require('../src/browser-reading-list');
const { BrowserElementRules } = require('../src/browser-element-rules');
const { SafeSecretStore } = require('../src/secret-store');
const { createBrowserSeriesContext } = require('../src/browser-series-context');
const { saveCeaCheckpoint, loadCeaCheckpoint, checkpointId, checkpointPath } = require('../src/browser-cea-checkpoint');
const { writeJsonAtomic, writeMirroredJsonAtomic } = require('../src/atomic-json');
const { replaceBurninOutput } = require('../src/burnin-output');
const sessionStore = require('../src/browser-session-store');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-crash-integrity-'));

// ---- fs taklidi yardımcıları ------------------------------------------------

// Gerçek fs'i saran, belirlenen aşamada deterministik hata fırlatan katman.
// `failOn`: { method: predicate|null } — predicate yoksa ilk eşleşen çağrıda fırlatır.
function failingFs(failOn) {
  const calls = [];
  const wrapped = Object.create(fs);
  for (const [method, predicate] of Object.entries(failOn)) {
    wrapped[method] = (...args) => {
      calls.push(method);
      if (!predicate || predicate(calls, args)) {
        const error = new Error(`injected EIO at ${method}`);
        error.code = 'EIO';
        throw error;
      }
      return fs[method](...args);
    };
  }
  // Bazı depolar this.fs.promises kullanır — sync adı async karşılığına eşle:
  // writeFileSync→writeFile, renameSync→rename, mkdirSync→mkdir, unlinkSync→unlink,
  // copyFileSync→copyFile, existsSync→access.
  const ASYNC_MAP = { writeFileSync: 'writeFile', renameSync: 'rename', mkdirSync: 'mkdir',
    unlinkSync: 'unlink', copyFileSync: 'copyFile', utimesSync: 'utimes' };
  // (fs.promises prototype'ta yalnız getter'dır: doğrudan atama atmaz, defineProperty gerekli.)
  const wrappedPromises = Object.create(fs.promises);
  for (const [syncName, asyncName] of Object.entries(ASYNC_MAP)) {
    const predicate = failOn[syncName];
    if (predicate === undefined) continue;
    wrappedPromises[asyncName] = async (...args) => {
      calls.push(`${syncName}~async`);
      if (!predicate || predicate(calls, args)) {
        const error = new Error(`injected EIO at promises.${asyncName}`);
        error.code = 'EIO';
        throw error;
      }
      return fs.promises[asyncName](...args);
    };
  }
  Object.defineProperty(wrapped, 'promises', { value: wrappedPromises, configurable: true });
  wrapped.__calls = calls;
  return wrapped;
}

const subdir = (name) => { const d = path.join(ROOT, name); fs.mkdirSync(d, { recursive: true }); return d; };
const tmpFiles = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith('.tmp')) out.push(path.join(d, e.name));
    }
  };
  walk(dir);
  return out;
};

const cueList = (n = 3) => Array.from({ length: n }, (_, i) => ({
  start: i * 2, end: i * 2 + 1.5, text: `Reel cue ${i}`,
}));

async function main() {
// ---- Bölüm A: atomik yazarlar (atomic-json, burnin-output) -------------------

{
  const file = path.join(subdir('aj'), 'doc.json');

  // Yazım aşaması hatası: dosya doğmaz, tmp kalıntısı olmaz.
  assert.throws(() => writeJsonAtomic(failingFs({ writeFileSync: null }),
    path.join(ROOT, 'aj', 'x', 'y.json'), { a: 1 }), /injected EIO/);
  assert.equal(tmpFiles(path.join(ROOT, 'aj')).length, 0);

  // Sağlam mevcut dosya üstünde rename patlaması: içerik korunur, tmp temizlenir.
  writeJsonAtomic(fs, file, { v: 'good' });
  assert.throws(() => writeJsonAtomic(failingFs({ renameSync: null }), file, { v: 'evil' }),
    /injected EIO/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { v: 'good' });
  assert.equal(tmpFiles(path.dirname(file)).length, 0);

  // Mirrored: .bak rename patlarsa ana dosya el değmemiş kalır (bak önce yazılır).
  const mir = path.join(subdir('aj-mir'), 'mir.json');
  writeMirroredJsonAtomic(fs, mir, { v: 1 });
  const before = fs.readFileSync(mir, 'utf8');
  assert.throws(() => writeMirroredJsonAtomic(failingFs({ renameSync: null }), mir, { v: 2 }),
    /injected EIO/);
  // rename ilk çağrıda (tmp->bak) patladı: ana hâlâ {v:1}.
  assert.equal(fs.readFileSync(mir, 'utf8'), before);
}

{
  // burnin: outPath var + tmp rename patlaması → backup geri konur, out dosyası korunur.
  const dir = subdir('burnin');
  const out = path.join(dir, 'out.mp4');
  const temp = path.join(dir, 'part.mp4');
  fs.writeFileSync(out, 'GOOD', 'utf8');
  fs.writeFileSync(temp, 'HALF', 'utf8');
  assert.throws(() => replaceBurninOutput(temp, out, failingFs({
    renameSync: (calls, args) => args[0] === temp })), /injected EIO/);
  assert.equal(fs.readFileSync(out, 'utf8'), 'GOOD');
  // temp sahipliği çağıranda kalır — out'un içeriği korunması ve yedek dosyanın
  // geri konmuş olması sözleşmedir; yarım temp çağıran katmanın işidir.
  assert(fs.existsSync(temp));
  assert(!fs.readdirSync(dir).some((n) => n.includes('replace-backup')));
  // Yeniden deneme temiz çalışır (backup kalıntısı yok).
  fs.writeFileSync(temp, 'FULL', 'utf8');
  replaceBurninOutput(temp, out);
  assert.equal(fs.readFileSync(out, 'utf8'), 'FULL');
}

// ---- Bölüm B: oturum deposu --------------------------------------------------

{
  const dir = subdir('session');
  const file = path.join(dir, 'browser-session.json');
  const session = { version: 2, tabs: [{ id: 't1', url: 'https://a.example/', title: 'A' }], activeTabId: 't1' };

  // Sağlam yazım + okuma gidiş-gelişi.
  const written = sessionStore.writeBrowserSessionAtomic(file, session);
  assert.equal(written.ok, true);
  const goodRead = sessionStore.readBrowserSessionWithStatus(file);
  assert.equal(goodRead.warning, '');

  // writeFileSync enjeksiyonu: ok:false döner, önceki içerik korunur.
  const failWrite = sessionStore.writeBrowserSessionAtomic(file,
    { version: 2, tabs: [{ id: 'EVIL', url: 'https://b.example/' }], activeTabId: 'EVIL' },
    failingFs({ writeFileSync: null }));
  assert.equal(failWrite.ok, false);
  assert.match(failWrite.error, /EIO/);
  assert.equal(sessionStore.readBrowserSession(file).tabs[0].id, 't1');
  assert.equal(tmpFiles(dir).length, 0);

  // renameSync enjeksiyonu: aynı sözleşme — tmp temizlenir, ana dosya dokunulmaz.
  const failRename = sessionStore.writeBrowserSessionAtomic(file,
    { version: 2, tabs: [{ id: 'EVIL', url: 'https://b.example/' }], activeTabId: 'EVIL' },
    failingFs({ renameSync: null }));
  assert.equal(failRename.ok, false);
  assert.equal(sessionStore.readBrowserSession(file).tabs[0].id, 't1');
  assert.equal(tmpFiles(dir).length, 0);

  // Bozuk birincil + sağlam yedek: yeniden açılışta yedekten kurtarılır.
  fs.writeFileSync(file, '{corrupt!!!', 'utf8');
  const recovered = sessionStore.readBrowserSessionWithStatus(file);
  assert(recovered.session && recovered.session.tabs.length, 'bak yedeğinden oturum kurtarılmalı');
  assert(fs.existsSync(file + '.bak'), 'yedek dosyası yerinde kalmalı');

  // Hem birincil hem yedek bozuksa → session boş ama geçerli + hasar uyarısı set.
  fs.writeFileSync(file, '{bad', 'utf8');
  fs.writeFileSync(file + '.bak', '{bad', 'utf8');
  const dead = sessionStore.readBrowserSessionWithStatus(file);
  assert.equal(dead.session.tabs.length, 0);
  assert.match(dead.warning, /okunamadı|kurtarılamadı/);
}

// ---- Bölüm C: varlık deposu (altyazı yakalama) --------------------------------

{
  const dir = subdir('asset');
  const base = { mediaId: 'media-1', title: 'T', cues: cueList(4) };
  const storeOk = new BrowserAssetStore({ rootDir: dir });
  const ok = storeOk.putTrack({ ...base });
  assert.equal(ok.ok, true);
  const jsonKeep = fs.readFileSync(ok.jsonPath, 'utf8');
  const srtKeep = fs.readFileSync(ok.srtPath, 'utf8');

  // İlk writeFileSync patlaması: ok:false, hiçbir dosya doğmaz, tmp kalıntısı yok.
  const failEarly = new BrowserAssetStore({ rootDir: dir, fsModule: failingFs({ writeFileSync: null }) });
  const r1 = failEarly.putTrack({ ...base, mediaId: 'media-2' });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /EIO/);
  assert.equal(fs.readFileSync(ok.jsonPath, 'utf8'), jsonKeep);
  assert.equal(tmpFiles(dir).length, 0);

  // renameSync patlaması (json aşaması): tmp'ler temizlenir, eski çıktı korunur.
  const failRename = new BrowserAssetStore({ rootDir: dir, fsModule: failingFs({ renameSync: null }) });
  const r2 = failRename.putTrack({ ...base, mediaId: 'media-3' });
  assert.equal(r2.ok, false);
  assert.equal(fs.readFileSync(ok.jsonPath, 'utf8'), jsonKeep);
  assert.equal(fs.readFileSync(ok.srtPath, 'utf8'), srtKeep);
  assert.equal(tmpFiles(dir).length, 0);

  // Çökmüş işlem kalıntısı: .tmp yetim dosyaları sweep ile temizlenir —
  // yaşlı tmp kaldırılır, taze tmp (başka işlem yazıyor olabilir) korunur.
  const assetDir = path.join(dir, 'assets');
  fs.mkdirSync(assetDir, { recursive: true });
  const stale = path.join(assetDir, 'x.1.1.tmp');
  fs.writeFileSync(stale, 'half');
  const fresh = path.join(assetDir, 'y.1.2.tmp');
  fs.writeFileSync(fresh, 'live');
  const old = new Date(Date.now() - 48 * 3600 * 1000);
  fs.utimesSync(stale, old, old);
  const removed = storeOk.sweepTempFiles(24 * 3600 * 1000);
  assert.equal(removed, 1);
  assert(!fs.existsSync(stale));
  assert(fs.existsSync(fresh));
  fs.unlinkSync(fresh);
}

// ---- Bölüm D: çeviri önbelleği ------------------------------------------------

{
  const dir = subdir('tcache');
  const file = path.join(dir, 'cache.json');

  // Sağlam flush.
  const ok = new PersistentTranslationCache(file, { fsModule: fs, minFlushIntervalMs: 0 });
  ok.set('k1', 'bir');
  const flushed = await ok.flush();
  assert.equal(flushed.ok, true);
  assert.equal(fs.existsSync(file), true);

  // writeFile patlaması → {ok:false, error}, önceki içerik korunur, tmp yok.
  const okBefore = fs.readFileSync(file, 'utf8');
  const fail = new PersistentTranslationCache(file, { fsModule: failingFs({ writeFileSync: null }), minFlushIntervalMs: 0 });
  fail.set('k2', 'iki');
  const r = await fail.flush();
  assert.equal(r.ok, false);
  assert.match(r.error, /EIO/);
  assert.equal(fs.readFileSync(file, 'utf8'), okBefore);
  assert.equal(tmpFiles(dir).length, 0);

  // rename patlaması → {ok:false}; tmp temizlenir, eski içerik korunur.
  const failRename = new PersistentTranslationCache(file, { fsModule: failingFs({ renameSync: null }), minFlushIntervalMs: 0 });
  failRename.set('k3', 'üç');
  const r2 = await failRename.flush();
  assert.equal(r2.ok, false);
  assert.equal(fs.readFileSync(file, 'utf8'), okBefore);
  assert.equal(tmpFiles(dir).length, 0);

  // Bozuk birincil + sağlam yedek → yedeğe düşer (veri korunur).
  const goodContent = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file + '.bak', goodContent, 'utf8');
  fs.writeFileSync(file, 'NOT-JSON', 'utf8');
  const fromBackup = new PersistentTranslationCache(file, { fsModule: fs, minFlushIntervalMs: 0 });
  assert.equal(fromBackup.get('k1'), 'bir');

  // İkisi de bozuksa → birincil .corrupt-* arşivlenir, depo boş açılır (sahte veri yok).
  fs.writeFileSync(file, 'NOT-JSON', 'utf8');
  fs.writeFileSync(file + '.bak', 'ALSO-BAD', 'utf8');
  const corrupted = new PersistentTranslationCache(file, { fsModule: fs, minFlushIntervalMs: 0 });
  assert.equal(corrupted.get('k1'), undefined);
  const leftovers = fs.readdirSync(dir).filter((n) => n.startsWith('cache.json.corrupt-'));
  assert(leftovers.length >= 1, 'bozuk dosyalar .corrupt-<pid>-<ts> arşivlenmeli');
  assert(!fs.existsSync(file), 'bozuk birincil yerinde bırakılmamalı');
}

// ---- Bölüm E: çeviri arşivi ----------------------------------------------------

{
  const dir = subdir('tarchive');
  const arcOk = new BrowserTranslationArchive(dir);
  const saved = arcOk.savePage({ url: 'https://ex.example/p', title: 'X',
    blocks: [{ id: 'b1', text: 'Hello' }], translations: { b1: 'Merhaba' }, targetLanguage: 'tr' });
  assert.equal(saved.ok, true);
  const idxBefore = fs.readFileSync(path.join(dir, 'index.json'), 'utf8');

  // _saveIndex'in rename'i patlarsa indeks eski nesilde kalır; yeni sayfa dosyaları
  // yazılmış olabilir ama indekse işlenmez → yetim dosyalar olur, YANLIŞ nesil
  // indeks değil. İndeks tutarlılığı öncelikli sözleşmedir.
  const failIdx = new BrowserTranslationArchive(dir, { fsModule: failingFs({
    writeFileSync: (calls, args) => String(args[0]).includes('index.json.') }) });
  assert.throws(() => failIdx.savePage({ url: 'https://ex.example/q', title: 'Y',
    blocks: [{ id: 'c1', text: 'Other' }], translations: { c1: 'Diğer' }, targetLanguage: 'tr' }), /injected EIO/);
  assert.equal(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'), idxBefore);
  assert.equal(tmpFiles(dir).length, 0);
  // Yeniden açılış: indeks tutarlı, yeni sayfa indekse girmedi (yarım iş sınıflı).
  const reopened = new BrowserTranslationArchive(dir);
  assert(!reopened.listPages({ url: 'https://ex.example/q' }).length);
}

// ---- Bölüm F: not deposu -------------------------------------------------------

{
  const dir = subdir('notes');
  const file = path.join(dir, 'notes.json');
  const store = new BrowserNoteStore(file, { io: fs });
  store.upsert({ mediaId: 'm1', note: 'ilk' });
  const good = fs.readFileSync(file, 'utf8');

  // writeFileSync enjeksiyonu: upsert hata fırlatır, bellek içi map geri alınır.
  const badStore = new BrowserNoteStore(file, { io: failingFs({ writeFileSync: null }) });
  assert.throws(() => badStore.upsert({ mediaId: 'm1', note: 'ikinci' }), /injected EIO/);
  assert.equal(fs.readFileSync(file, 'utf8'), good);
  assert.equal(tmpFiles(dir).length, 0);

  // copyFileSync (.bak ayna) enjeksiyonu: ana dosya el değmemiş kalır (R86-03).
  const mirrorFail = new BrowserNoteStore(file, { io: failingFs({ copyFileSync: null }) });
  assert.throws(() => mirrorFail.upsert({ mediaId: 'm1', note: 'uc' }), /injected EIO/);
  assert.equal(fs.readFileSync(file, 'utf8'), good);

  // Bozuk birincil + sağlam yedek → yedekten kurtarma + recovery bayrağı.
  fs.writeFileSync(file, '{[corrupt', 'utf8');
  const backup = JSON.parse(fs.readFileSync(file + '.bak', 'utf8'));
  assert(backup.annotations.length >= 1);
  const revived = new BrowserNoteStore(file, { io: fs });
  assert.equal(revived.recoveredFromBackup, true);
  assert.equal(revived.list('m1').length >= 1, true);
  // Kurtarma yazımı primary'i onardı.
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).annotations.length >= 1, true);

  // İkisi de bozuk → loadError set, yazma tamamen durur (veri korunur).
  fs.writeFileSync(file, '{bad', 'utf8');
  fs.writeFileSync(file + '.bak', '{bad', 'utf8');
  const dead = new BrowserNoteStore(file, { io: fs });
  assert(dead.loadError);
  assert.throws(() => dead.upsert({ mediaId: 'm', note: 'x' }));
}

// ---- Bölüm G: okuma listesi + öğe kuralları -------------------------------------

{
  const dir = subdir('rl');
  const rl = new BrowserReadingList(dir);
  const planned = rl.prepare({ url: 'https://www.example.com/a?x=1', title: 'Doc' });
  assert.equal(planned.ok, true);
  fs.writeFileSync(planned.filePath, 'MHTML-DATA', 'utf8');
  assert.equal(rl.commit(planned.entry).ok, true);
  const idxBefore = fs.readFileSync(path.join(dir, 'index.json'), 'utf8');

  // commit'te indeks rename patlaması → hata yayılır, indeks eski nesilde kalır.
  const rlFail = new BrowserReadingList(dir, failingFs({ renameSync: null }));
  const p2 = rlFail.prepare({ url: 'https://www.example.com/b', title: 'Doc2' });
  fs.writeFileSync(p2.filePath, 'D2', 'utf8');
  assert.throws(() => rlFail.commit(p2.entry), /injected EIO/);
  assert.equal(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'), idxBefore);
  assert.equal(tmpFiles(dir).length, 0);

  // element-rules: add → _write rename patlaması → hata yayılır, önceki kurallar korunur.
  const rulesFile = path.join(subdir('rules'), 'rules.json');
  const rules = new BrowserElementRules(rulesFile);
  assert.equal(rules.add('https://a.example/x', '.ad').ok, true);
  const rulesBefore = fs.readFileSync(rulesFile, 'utf8');
  const rulesFail = new BrowserElementRules(rulesFile, failingFs({ writeFileSync: null }));
  assert.throws(() => rulesFail.add('https://b.example/y', '.popup'), /injected EIO/);
  assert.equal(fs.readFileSync(rulesFile, 'utf8'), rulesBefore);
  assert.equal(tmpFiles(path.dirname(rulesFile)).length, 0);
}

// ---- Bölüm H: dizi bağlamı + CEA checkpoint + secret store ---------------------

{
  const dir = subdir('misc');
  // series-context: commit rename patlaması → önceki nesil korunur.
  const scFile = path.join(dir, 'series.json');
  const sc = createBrowserSeriesContext({ filePath: scFile });
  sc.bind('https://o.example|video-1', 'Dizi Adı', 'https://o.example');
  const scBefore = fs.readFileSync(scFile, 'utf8');
  const scFail = createBrowserSeriesContext({ filePath: scFile, fsImpl: failingFs({ writeFileSync: null }) });
  assert.throws(() => scFail.bind('https://o.example|video-2', 'Başka', 'https://o.example'), /injected EIO/);
  assert.equal(fs.readFileSync(scFile, 'utf8'), scBefore);
  assert.equal(tmpFiles(dir).length, 0);
  // Bozuk dosya: read fail yerine koruma — açılış throw (veri korunur).
  fs.writeFileSync(scFile, '{corrupt', 'utf8');
  assert.throws(() => createBrowserSeriesContext({ filePath: scFile })
    .bind('https://o.example|v', 'x', 'https://o.example'), /veri korunuyor|okunamadı/);

  // cea-checkpoint: saveCeaCheckpoint writeFileSync patlaması → throw + tmp temiz.
  const ceaDir = subdir('cea');
  const ceaTracks = [{ instreamId: 'CC1', cues: cueList(2) }];
  const ceaId = checkpointId('https://media.example/v/master.m3u8', 'media-1', ceaTracks);
  assert.throws(() => saveCeaCheckpoint(ceaDir, ceaId, ceaTracks, 3, 100,
    failingFs({ writeFileSync: null })), /injected EIO/);
  assert.equal(tmpFiles(ceaDir).length, 0);
  // Bozuk checkpoint → null (yarım iş sahte başarı sınıflanmaz).
  fs.writeFileSync(checkpointPath(ceaDir, ceaId), '{broken', 'utf8');
  assert.equal(loadCeaCheckpoint(ceaDir, ceaId), null);

  // secret-store: writeFileSync patlaması → {ok:false, error}, tmp kalıntısı yok.
  const secFile = path.join(dir, 'secrets.json');
  const fakeSafeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`enc:${s}`),
    decryptString: (b) => String(b).replace(/^enc:/, ''),
  };
  const sec = new SafeSecretStore({
    filePath: secFile, safeStorage: fakeSafeStorage, fields: ['apiKey'],
    fsModule: failingFs({ writeFileSync: null }),
  });
  const r = sec.save({ apiKey: 'TEST-KEY-NOT-REAL' });
  assert.equal(r.ok, false);
  assert.match(r.error, /EIO/);
  assert(!fs.existsSync(secFile));
  assert.equal(tmpFiles(dir).length, 0);
}

// ---- Bölüm I: yanlış nesil karışması --------------------------------------------
// Aynı hedefe iki "işlem nesli" yazar: pid bazlı tmp adları ile çakışma olmaz,
// rename atomik olduğu için son geçerli tam yazım kazanır, yarım nesil kalıntısı yok.

{
  const dir = subdir('gen');
  const file = path.join(dir, 'shared.json');
  writeJsonAtomic(fs, file, { gen: 1, data: 'first' });
  // İkinci nesil yazımı yarıda kesilir (rename patlaması) → birinci nesil sağlam kalır.
  assert.throws(() => writeJsonAtomic(failingFs({ renameSync: null }), file, { gen: 2, data: 'second' }),
    /injected EIO/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { gen: 1, data: 'first' });
  // Üçüncü nesil tamamlanır → dosya {gen:3}, gen-2 kalıntısı karışmamış.
  writeJsonAtomic(fs, file, { gen: 3, data: 'third' });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { gen: 3, data: 'third' });
  assert.equal(tmpFiles(dir).length, 0);
}

console.log('crash-integrity: tüm aşama-enjeksiyonu ve kurtarma denetimleri geçti');
}

main().catch((error) => { console.error(error); process.exit(1); });
