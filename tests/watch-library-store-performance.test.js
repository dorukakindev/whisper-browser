const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const { sortByLastWatched } = require('../src/watch-library-view');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const start = main.indexOf('const WATCH_LIBRARY_LIMIT');
const end = main.indexOf('// ---- Pencere boyutu hatırlama', start);
assert(start >= 0 && end > start, 'kütüphane kaynak bloğu bulunamadı');
const source = main.slice(start, end);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-store-perf-'));
const libraryPath = path.join(temp, 'watch-library.json');
const fixture = Array.from({ length: 10000 }, (_, index) => ({
  key: `video:${index}`,
  title: index % 19 === 0 ? `İstanbul Işık ${index}` : `Video ${index}`,
  sourceRef: `D:\\Medya\\video-${index}.mkv`,
  lastWatched: 2_000_000_000_000 - index,
  collections: [index % 2 ? 'Belgesel' : 'Felsefe'],
  subtitlePaths: [],
}));
fs.writeFileSync(libraryPath, JSON.stringify(fixture), 'utf8');

let libraryReads = 0;
const measuredFs = Object.create(fs);
measuredFs.readFileSync = (...args) => {
  if (path.resolve(String(args[0])) === path.resolve(libraryPath)) libraryReads += 1;
  return fs.readFileSync(...args);
};
const app = { getPath: () => temp };
const api = new Function('fs', 'path', 'app', 'decodeSubtitleBuffer', 'writeJsonAtomic', 'sortByLastWatched',
  `${source}\nreturn { loadWatchLibrary, searchWatchLibrary };`)(
  measuredFs, path, app, () => ({ text: '' }), () => {}, sortByLastWatched);

function p95(values) {
  const ordered = values.slice().sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * .95) - 1] || 0;
}

async function mainTest() {
  const loadStart = performance.now();
  const loaded = api.loadWatchLibrary();
  const firstLoadMs = performance.now() - loadStart;
  assert.equal(loaded.length, 10000);

  const cachedLoads = [];
  for (let index = 0; index < 100; index++) {
    const started = performance.now(); api.loadWatchLibrary(); cachedLoads.push(performance.now() - started);
  }
  const searches = [];
  for (let index = 0; index < 80; index++) {
    const started = performance.now();
    await api.searchWatchLibrary(index % 2 ? 'istanbul ışık' : 'video 99');
    searches.push(performance.now() - started);
  }

  const metrics = {
    environment: `${process.platform} ${process.arch} · Node ${process.version}`,
    records: loaded.length,
    fixtureMiB: Number((fs.statSync(libraryPath).size / 1048576).toFixed(3)),
    firstLoadMs: Number(firstLoadMs.toFixed(3)),
    cachedLoadP95Ms: Number(p95(cachedLoads).toFixed(3)),
    titleSearchP95Ms: Number(p95(searches).toFixed(3)),
    libraryDiskReads: libraryReads,
  };

  assert(metrics.firstLoadMs < 200, `ilk okuma ${metrics.firstLoadMs} ms`);
  assert(metrics.cachedLoadP95Ms < 1, `cache okuma p95 ${metrics.cachedLoadP95Ms} ms`);
  assert(metrics.titleSearchP95Ms < 80, `depo arama p95 ${metrics.titleSearchP95Ms} ms`);
  assert.equal(metrics.libraryDiskReads, 1, `disk okuma sayısı ${metrics.libraryDiskReads}`);
  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`watch-library-store-performance metrics ${JSON.stringify(metrics)}`);
  console.log('watch-library-store-performance: 4 geçti, 0 başarısız');
}

mainTest().catch((error) => {
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch (_) {}
  console.error(error.stack || error);
  process.exit(1);
});
