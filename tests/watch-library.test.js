/** İzleme kütüphanesi deposu ve altyazı araması testleri. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createWatchLibraryStore } = require('../src/watch-library-store');
const { decodeSubtitleBuffer } = require('../src/browser-textutil');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
const start = main.indexOf('const WATCH_LIBRARY_LIMIT');
const end = main.indexOf('// ---- Pencere boyutu hatırlama', start);
if (start < 0 || end < 0) throw new Error('İzleme kütüphanesi kaynak bloğu bulunamadı');
const source = main.slice(start, end);
const jsonStart = main.indexOf('function writeJsonAtomic(filePath, value)');
const jsonEnd = main.indexOf("ipcMain.handle('media:writeSubtitle'", jsonStart);
if (jsonStart < 0 || jsonEnd < 0) throw new Error('Atomik JSON yazıcı kaynak bloğu bulunamadı');
const jsonSource = main.slice(jsonStart, jsonEnd);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-watch-'));
const app = { getPath: () => tmp };
const api = new Function('fs', 'path', 'app', 'createWatchLibraryStore', 'decodeSubtitleBuffer',
  `${jsonSource}\n${source}\nreturn {
     loadWatchLibrary, upsertWatchItem, searchWatchLibrary, watchLibraryPath,
   };`)(fs, path, app, createWatchLibraryStore, decodeSubtitleBuffer);

let pass = 0;
const failures = [];
// searchWatchLibrary ana surecini bloklamamak icin async oldu; testler sirayla
// ve await ile kosulmali (ortak durumu ust uste yazdiklari icin paralel degil).
const queue = [];
function test(name, fn) { queue.push([name, fn]); }
function assert(value, message) { if (!value) throw new Error(message || 'assert'); }

test('aynı video tek kayıtta güncellenir ve tercihler birleşir', () => {
  api.upsertWatchItem({ key: 'file:a', title: 'A', prefs: { speed: 1.25 }, collections: ['Ders'] });
  api.upsertWatchItem({ key: 'file:a', position: 90, prefs: { volume: .7 } });
  const list = api.loadWatchLibrary();
  assert(list.length === 1, `kayıt sayısı ${list.length}`);
  assert(list[0].prefs.speed === 1.25 && list[0].prefs.volume === .7, 'tercihler birleşmedi');
  assert(list[0].collections[0] === 'Ders', 'koleksiyon kayboldu');
});

test('aynı oturum ikinci kayıtta iki kez sayılmaz', () => {
  const session = { id: 's1', watchSeconds: 12 };
  api.upsertWatchItem({ key: 'file:a', session });
  api.upsertWatchItem({ key: 'file:a', session: { ...session, watchSeconds: 18 } });
  const item = api.loadWatchLibrary().find((x) => x.key === 'file:a');
  assert(item.sessions.length === 1, 'oturum çoğaldı');
  assert(item.totalWatchSeconds === 18, `toplam ${item.totalWatchSeconds}`);
});

test('başlık ve koleksiyon içinde arar', async () => {
  api.upsertWatchItem({ key: 'file:b', title: 'Mitoloji Dersi', collections: ['Felsefe'] });
  assert((await api.searchWatchLibrary('mitoloji')).some((x) => x.key === 'file:b'), 'başlık bulunmadı');
  assert((await api.searchWatchLibrary('felsefe')).some((x) => x.key === 'file:b'), 'koleksiyon bulunmadı');
});

test('altyazı metnini bulur ve zamanını döndürür', async () => {
  const subtitle = path.join(tmp, 'ornek.srt');
  fs.writeFileSync(subtitle, '1\n00:01:23,400 --> 00:01:25,000\nAradığımız nadir cümle burada.\n', 'utf-8');
  api.upsertWatchItem({ key: 'file:c', title: 'C', subtitlePaths: [subtitle] });
  const item = (await api.searchWatchLibrary('nadir'))[0];
  assert(item && item.matches.length === 1, 'altyazı eşleşmesi yok');
  assert(Math.abs(item.matches[0].seconds - 83.4) < .001, `zaman ${item.matches[0].seconds}`);
});

test('ASS altyazısında metni ve Dialogue zamanını bulur', async () => {
  const subtitle = path.join(tmp, 'ornek.ass');
  fs.writeFileSync(subtitle, '[Events]\nDialogue: 0,0:02:03.50,0:02:05.00,Default,,0,0,0,,{\\i1}Özel ifade{\\i0} burada\n', 'utf-8');
  api.upsertWatchItem({ key: 'file:d', title: 'D', subtitlePaths: [subtitle] });
  const item = (await api.searchWatchLibrary('özel ifade')).find((x) => x.key === 'file:d');
  assert(item && item.matches.length === 1, 'ASS eşleşmesi yok');
  assert(Math.abs(item.matches[0].seconds - 123.5) < .001, `ASS zamanı ${item.matches[0].seconds}`);
});

test('saat alani olmayan VTT eslesmesinin zamanini döndürür', async () => {
  const subtitle = path.join(tmp, 'kisa.vtt');
  fs.writeFileSync(subtitle, 'WEBVTT\n\n01:23.400 --> 01:25.000\nKisa zamanli nadir ifade.\n', 'utf-8');
  api.upsertWatchItem({ key: 'file:vtt', title: 'VTT', subtitlePaths: [subtitle] });
  const item = (await api.searchWatchLibrary('kisa zamanli')).find((x) => x.key === 'file:vtt');
  assert(item && item.matches.length === 1, 'VTT eslesmesi yok');
  assert(Math.abs(item.matches[0].seconds - 83.4) < .001, `VTT zamani ${item.matches[0].seconds}`);
});

test('standart dışı tek haneli VTT dakikasını toleranslı okur', async () => {
  const subtitle = path.join(tmp, 'tek-dakika.vtt');
  fs.writeFileSync(subtitle, 'WEBVTT\n\n5:23.456 --> 5:25.000\nTek haneli dakika.\n', 'utf-8');
  api.upsertWatchItem({ key: 'file:vtt-short', title: 'VTT kısa', subtitlePaths: [subtitle] });
  const item = (await api.searchWatchLibrary('tek haneli')).find((x) => x.key === 'file:vtt-short');
  assert(item && item.matches.length === 1, 'tek haneli VTT eşleşmesi yok');
  assert(Math.abs(item.matches[0].seconds - 323.456) < .001, `VTT zamanı ${item.matches[0].seconds}`);
});

test('cp1254 altyazi oynaticiyla ayni sekilde aranir', async () => {
  const subtitle = path.join(tmp, 'turkce-cp1254.srt');
  const latin = Buffer.from('1\n00:00:03,000 --> 00:00:04,000\nI\u00fe\u00fdk G\u00fcne\u00fei aramas\u00fd.\n', 'latin1');
  fs.writeFileSync(subtitle, latin);
  api.upsertWatchItem({ key: 'file:cp1254', title: 'Kodlama', subtitlePaths: [subtitle] });
  const item = (await api.searchWatchLibrary('ışık güneşi')).find((x) => x.key === 'file:cp1254');
  assert(item && item.matches.length === 1, 'cp1254 Turkce metin bulunamadi');
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); pass++; console.log(`  PASS  ${name}`); }
    catch (error) { failures.push(`${name}: ${error.message}`); console.log(`  FAIL  ${name} — ${error.message}`); }
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
  if (failures.length) {
    failures.forEach((failure) => console.error('  - ' + failure));
    process.exit(1);
  }
})();
