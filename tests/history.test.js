/**
 * İş geçmişi deposu testleri.
 *
 * Neden var: geçmiş kaydı main.js içinde, Electron'a bağlı bir dosyada duruyor.
 * Başlık çıkarma bir kez sessizce bozuldu — Windows yol ayracı (ters bölü)
 * regex'ten düşünce `D:\Filmler\X.srt` bölünmedi ve başlık tüm yol oldu.
 * Sözdizimi kontrolü bunu yakalayamaz.
 *
 * Çalıştırma:  node tests/history.test.js
 *
 * main.js import edilemediği için depo bloğu KAYNAKTAN kesilip çalıştırılır;
 * sınırlar değişirse test yüksek sesle kırılır.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAIN = path.join(__dirname, '..', 'src', 'main.js');
const src = fs.readFileSync(MAIN, 'utf-8');

function cut(startMark, endMark) {
  const i = src.indexOf(startMark);
  const j = src.indexOf(endMark);
  if (i < 0 || j < 0 || j < i) {
    console.error('main.js icinde blok bulunamadi (sinir isaretleri degismis olabilir).');
    console.error(`  baslangic: ${JSON.stringify(startMark)} -> ${i}`);
    console.error(`  bitis    : ${JSON.stringify(endMark)} -> ${j}`);
    process.exit(1);
  }
  return src.slice(i, j);
}

const store = cut('const HISTORY_LIMIT', '// ---- Pencere boyutu hatırlama');
const recorder = cut('function recordJob(meta, event)', "ipcMain.handle('transcribe:start'");
const jsonWriter = cut('function writeJsonAtomic(', "ipcMain.handle('media:writeSubtitle'");

// Geçici bir userData klasörü: gerçek ayarlara dokunma
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-hist-'));
const fakeApp = { getPath: () => tmp };

const api = new Function('fs', 'path', 'app', `
  ${jsonWriter}
  ${store}
  ${recorder}
  return { loadHistory, addHistory, recordJob, historyPath };
`)(fs, path, fakeApp);

// ---- minik test cercevesi ----
let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { failures.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name} — ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert'); }
// R51-56: bozuk ana dosyada .bak'a düşülür — reset ikisini de silmeli.
function reset() {
  for (const target of [api.historyPath(), `${api.historyPath()}.bak`]) {
    try { fs.unlinkSync(target); } catch (_) {}
  }
}

const meta = (over) => ({
  startedAt: 1, input: 'D:\\Filmler\\Film.mkv', source: 'local',
  video: 'D:\\Filmler\\Film.mkv', model: 'large-v3', engine: 'faster', ...over,
});
const done = (over) => ({
  type: 'done', files: ['D:\\Filmler\\Film.srt'], segments: 42, language: 'en', ...over,
});

test('boş depo boş dizi döner (dosya yokken patlamaz)', () => {
  reset();
  const list = api.loadHistory();
  assert(Array.isArray(list) && list.length === 0, 'bos dizi bekleniyordu');
});

test('başlık Windows yolundan çıkarılır (ters bölü ayracı)', () => {
  reset();
  api.recordJob(meta(), done());
  assert(api.loadHistory()[0].title === 'Film', 'baslik: ' + api.loadHistory()[0].title);
});

test('başlık POSIX yolundan da çıkarılır', () => {
  reset();
  api.recordJob(meta(), done({ files: ['/home/k/Videolar/Ders 1.srt'] }));
  assert(api.loadHistory()[0].title === 'Ders 1', 'baslik: ' + api.loadHistory()[0].title);
});

test('çıktı yoksa başlık girdiden gelir', () => {
  reset();
  api.recordJob(meta({ input: 'D:\\Filmler\\Sadece Girdi.mkv' }), done({ files: [] }));
  assert(api.loadHistory()[0].title === 'Sadece Girdi', 'baslik: ' + api.loadHistory()[0].title);
});

test('aynı medya tekrar işlenirse tek kayıt kalır (en yenisi)', () => {
  reset();
  api.recordJob(meta(), done({ segments: 10 }));
  api.recordJob(meta(), done({ segments: 99 }));
  const list = api.loadHistory();
  assert(list.length === 1, 'kayit sayisi: ' + list.length);
  assert(list[0].segments === 99, 'en yeni kayit ustte olmali');
});

test('farklı medyalar ayrı kayıt olur, en yeni başta', () => {
  reset();
  api.recordJob(meta({ input: 'D:\\A.mkv' }), done({ files: ['D:\\A.srt'] }));
  api.recordJob(meta({ input: 'D:\\B.mkv' }), done({ files: ['D:\\B.srt'] }));
  const list = api.loadHistory();
  assert(list.length === 2, 'kayit sayisi: ' + list.length);
  assert(list[0].title === 'B', 'en yeni basta olmali, bulunan: ' + list[0].title);
});

test('hata işleri ok=false ve mesajıyla kaydedilir', () => {
  reset();
  api.recordJob(meta(), { type: 'error', message: 'CUDA yok' });
  const h = api.loadHistory()[0];
  assert(h.ok === false, 'ok=false bekleniyordu');
  assert(h.error === 'CUDA yok', 'mesaj: ' + h.error);
});

test('perf özeti kayda geçer', () => {
  reset();
  api.recordJob(meta(), done({ perf: { rtf: 13.15, mediaSeconds: 150, model: 'large-v3-turbo' } }));
  assert(api.loadHistory()[0].perf.rtf === 13.15, 'perf kaydedilmedi');
});

test('kalite raporu iş geçmişine kaydedilir', () => {
  reset();
  api.recordJob(meta({ quality: { blocks: 42, cps_violations: 3 } }), done());
  const quality = api.loadHistory()[0].quality;
  assert(quality && quality.blocks === 42 && quality.cps_violations === 3,
    'kalite raporu kaydedilmedi');
});

test('YouTube işi kaynak etiketiyle kaydedilir, yerel video boş kalır', () => {
  reset();
  api.recordJob(
    meta({ source: 'youtube', input: 'https://youtu.be/abc123', video: '' }),
    done({ files: ['D:\\Indirilenler\\Harika Video.srt'] }),
  );
  const h = api.loadHistory()[0];
  assert(h.source === 'youtube', 'kaynak: ' + h.source);
  assert(h.video === '', 'YouTube isinde yerel video yolu olmamali');
  assert(h.title === 'Harika Video', 'baslik cikti dosyasindan gelmeli: ' + h.title);
});

test('liste sınırı aşılmaz (eski kayıtlar düşer)', () => {
  reset();
  const limit = parseInt(store.match(/HISTORY_LIMIT = (\d+)/)[1], 10);
  for (let i = 0; i < limit + 5; i++) {
    api.recordJob(meta({ input: `D:\\F${i}.mkv` }), done({ files: [`D:\\F${i}.srt`] }));
  }
  const list = api.loadHistory();
  assert(list.length === limit, `sinir ${limit} olmali, bulunan ${list.length}`);
  assert(list[0].title === `F${limit + 4}`, 'en yeni basta kalmali: ' + list[0].title);
});

test('bozuk history.json çökme yerine boş liste verir', () => {
  reset();
  fs.writeFileSync(api.historyPath(), '{bu json degil', 'utf-8');
  fs.writeFileSync(`${api.historyPath()}.bak`, '{bu da bozuk', 'utf-8');
  assert(api.loadHistory().length === 0, 'iki dosya da bozuksa bos liste bekleniyordu');
});

test('bozuk ana dosyada .bak yedeğinden geri yüklenir (R51-56)', () => {
  reset();
  api.recordJob(meta(), done());
  const saved = api.loadHistory();
  assert(saved.length === 1);
  // Bir sonraki kayıt önceki sağlam dosyayı .bak'a taşır; sonra ana dosyayı boz.
  api.recordJob(meta({ input: 'D:\\B.mkv', video: 'D:\\B.mkv' }), done({ files: ['D:\\B.srt'] }));
  fs.writeFileSync(api.historyPath(), '{bozuldu', 'utf-8');
  const restored = api.loadHistory();
  assert(restored.length === 1 && restored[0].title === 'Film',
    'bozuk ana dosyada .bak içeriği bekleniyordu: ' + JSON.stringify(restored));
});

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
if (failures.length) {
  console.error('\nBaşarısız:');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
