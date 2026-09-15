const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const { sortByLastWatched } = require('../src/watch-library-view');
const { createWatchLibraryStore } = require('../src/watch-library-store');
const { SubtitleFileAccess } = require('../src/local-file-access');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const start = main.indexOf('const WATCH_LIBRARY_LIMIT');
const end = main.indexOf('// ---- Pencere boyutu hatırlama', start);
assert(start >= 0 && end > start, 'kütüphane kaynak bloğu bulunamadı');
const source = main.slice(start, end);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-subtitle-perf-'));
const libraryPath = path.join(temp, 'watch-library.json');
const records = 10000;

for (let index = 0; index < records; index++) {
  const text = `1\n00:00:01,000 --> 00:00:02,000\nFixture satırı ${index}.\n`;
  fs.writeFileSync(path.join(temp, `subtitle-${index}.srt`), text, 'utf8');
}
const fixture = Array.from({ length: records }, (_, index) => ({
  key: `video:${index}`,
  title: `Video ${index}`,
  lastWatched: records - index,
  subtitlePaths: [path.join(temp, `subtitle-${index}.srt`)],
}));
fs.writeFileSync(libraryPath, JSON.stringify(fixture), 'utf8');

let subtitleReads = 0;
const measuredFs = Object.create(fs);
measuredFs.readFileSync = (...args) => {
  if (String(args[0]).endsWith('.srt')) subtitleReads += 1;
  return fs.readFileSync(...args);
};
const measuredPromises = Object.create(fs.promises);
measuredPromises.readFile = async (...args) => {
  if (String(args[0]).endsWith('.srt')) subtitleReads += 1;
  return fs.promises.readFile(...args);
};
Object.defineProperty(measuredFs, 'promises', { value: measuredPromises });
const app = { getPath: () => temp };
const subtitleFileAccess = new SubtitleFileAccess();
for (let index = 0; index < records; index++) {
  subtitleFileAccess.grant(path.join(temp, `subtitle-${index}.srt`));
}
const api = new Function('fs', 'path', 'app', 'decodeSubtitleBuffer', 'writeJsonAtomic',
  'sortByLastWatched', 'createWatchLibraryStore', 'subtitleFileAccess',
  `${source}\nreturn {
    searchWatchLibrary,
    removeWatchItem: (key) => watchLibraryStore().remove(key),
  };`)(
  measuredFs, path, app, (buffer) => ({ text: buffer.toString('utf8') }), () => {},
  sortByLastWatched, createWatchLibraryStore, subtitleFileAccess);

async function mainTest() {
  const cacheSearchMs = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const startedAt = performance.now();
    const all = await api.searchWatchLibrary('');
    cacheSearchMs.push(performance.now() - startedAt);
    assert.equal(all.length, records, `boş arama ${attempt + 1}. çağrıda taşma kayıtlarını kaybetti`);
  }
  const warmCacheMaxMs = Math.max(...cacheSearchMs.slice(1));
  assert(warmCacheMaxMs < 100, `sıcak store yükü ${warmCacheMaxMs.toFixed(1)} ms`);
  assert(cacheSearchMs[0] > warmCacheMaxMs * 2,
    `ilk göç ${cacheSearchMs[0].toFixed(1)} ms, sıcak yük ${warmCacheMaxMs.toFixed(1)} ms; cache ayrışmıyor`);

  let timerFiredAt = 0;
  const timerScheduledAt = performance.now();
  setTimeout(() => { timerFiredAt = performance.now(); }, 0);
  const searchStartedAt = performance.now();
  const results = await api.searchWatchLibrary('fixture satırı 9999');
  const searchMs = performance.now() - searchStartedAt;
  const inputDelayMs = timerFiredAt ? timerFiredAt - timerScheduledAt : performance.now() - timerScheduledAt;
  assert.equal(results.length, 1);
  assert.equal(results[0].key, 'video:9999');
  assert.equal(results[0].matches[0].seconds, 1);
  assert(inputDelayMs < 100, `ana event-loop gecikmesi ${inputDelayMs.toFixed(1)} ms`);
  assert.equal(subtitleReads, records, `tam tarama okuması ${subtitleReads}`);

  assert(api.removeWatchItem('video:9999'), 'silme tombstone üretemedi');
  const afterRemoval = await api.searchWatchLibrary('');
  assert(!afterRemoval.some((item) => item.key === 'video:9999'),
    'tombstone ile silinen kayıt loadAll tabanlı aramada yeniden göründü');

  const readsBeforeCancel = subtitleReads;
  let cancelled = false;
  setTimeout(() => { cancelled = true; }, 0);
  const cancelledResults = await api.searchWatchLibrary('başka-bulunmayacak-terim', () => cancelled);
  const cancellationReads = subtitleReads - readsBeforeCancel;
  assert.equal(cancelledResults.length, 0);
  assert(cancellationReads <= 16, `iptalden sonra ${cancellationReads} dosya okundu`);

  const ipcStart = main.indexOf("ipcMain.handle('library:search'");
  const ipcEnd = main.indexOf("ipcMain.handle('backup:export'", ipcStart);
  const ipcSource = main.slice(ipcStart, ipcEnd);
  assert(/\+\+watchLibrarySearchGeneration/.test(ipcSource), 'IPC arama kuşağı artırılmıyor');
  assert(/generation !== watchLibrarySearchGeneration/.test(ipcSource), 'eski IPC taraması iptal edilmiyor');
  assert(/cancelWatchLibrarySearch:\s*\(\)\s*=>\s*ipcRenderer\.send\('library:search-cancel'\)/.test(preload),
    'renderer için dar kapsamlı arama iptal köprüsü yok');
  const inputStart = renderer.indexOf("$('playerLibrarySearch').addEventListener('input'");
  const inputEnd = renderer.indexOf('// --- arac cubugu gizle/goster', inputStart);
  assert(/cancelWatchLibrarySearch\(\)/.test(renderer.slice(inputStart, inputEnd)),
    'hızlı yazım eski ana-süreç aramasını debounce süresince çalıştırıyor');

  const metrics = {
    environment: `${process.platform} ${process.arch} · Node ${process.version}`,
    records,
    cacheSearchMs: cacheSearchMs.map((value) => Number(value.toFixed(3))),
    warmCacheMaxMs: Number(warmCacheMaxMs.toFixed(3)),
    searchMs: Number(searchMs.toFixed(3)),
    inputDelayMs: Number(inputDelayMs.toFixed(3)),
    subtitleReads: readsBeforeCancel,
    cancellationReads,
  };
  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`watch-library-subtitle-performance metrics ${JSON.stringify(metrics)}`);
  console.log('watch-library-subtitle-performance: 8 geçti, 0 başarısız');
}

mainTest().catch((error) => {
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch (_) {}
  console.error(error.stack || error);
  process.exit(1);
});
