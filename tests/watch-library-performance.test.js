const assert = require('assert');
const { performance } = require('perf_hooks');
const view = require('../src/watch-library-view');

function fixture(count) {
  const collections = ['Felsefe', 'Belgesel', 'İstanbul', 'Çalışma'];
  return Array.from({ length: count }, (_, index) => ({
    key: `video:${index}`,
    title: index % 17 === 0 ? `İstanbul Işık ${index}` : `Video ${index}`,
    sourceRef: `D:\\Medya\\video-${index}.mkv`,
    duration: 3600,
    position: index % 5 === 0 ? 0 : index % 3 === 0 ? 3600 : 900,
    completed: index % 3 === 0,
    collections: [collections[index % collections.length]],
    lastWatched: 2_000_000_000_000 - index,
  }));
}

function p95(values) {
  const ordered = values.slice().sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * .95) - 1)] || 0;
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name}\n${error.stack}`); process.exitCode = 1; }
}

const sizes = [0, 1, 21, 100, 1000, 10000];
test('0/1/21/100/1.000/10.000 fixture eksiksiz modellenir', () => {
  for (const size of sizes) assert.equal(view.selectWatchItems(fixture(size), 'all').length, size);
});

const items = fixture(10000);
test('Türkçe karakterli başlık araması locale kurallarını korur', () => {
  const found = view.searchMetadata(items, 'istanbul ışık');
  assert.equal(found.length, Math.ceil(10000 / 17));
});

test('durum ve koleksiyon filtreleri doğru kümeyi döndürür', () => {
  const completed = view.selectWatchItems(items, 'completed');
  const continuing = view.selectWatchItems(items, 'continue');
  const collection = view.selectWatchItems(items, 'collection:Felsefe');
  assert(completed.every((item) => item.completed));
  assert(continuing.every((item) => !item.completed && view.watchProgress(item) > 0));
  assert.equal(collection.length, 2500);
});

test('10k sanal pencere DOM satır bütçesini aşmaz', () => {
  for (const scrollTop of [0, 120, 12000, 600000, 1199400]) {
    const range = view.virtualRange({ total: 10000, scrollTop, viewportHeight: 720, rowHeight: view.NORMAL_ROW_HEIGHT });
    assert(range.end - range.start <= 22, `pencere ${range.end - range.start} satır`);
    assert(range.start >= 0 && range.end <= 10000);
  }
});

test('klavye odağındaki satır overscan dışında olsa bile DOM sırasında tutulur', () => {
  const range = view.virtualRange({ total: 10000, scrollTop: 0, viewportHeight: 600,
    rowHeight: view.NORMAL_ROW_HEIGHT, pinnedIndex: 11 });
  assert(range.start <= 11 && range.end > 11);
});

test('uzaktaki eski odak büyük scroll sıçramasında binlerce satırı DOMa taşımaz', () => {
  const range = view.virtualRange({ total: 10000, scrollTop: 900000, viewportHeight: 600,
    rowHeight: view.NORMAL_ROW_HEIGHT, pinnedIndex: 2 });
  assert(range.end - range.start <= 22, `uzak odak ${range.end - range.start} satır üretti`);
});

test('silme ve filtre sonrası görünür anahtar scroll ankrajını korur', () => {
  const rowHeight = view.NORMAL_ROW_HEIGHT;
  const scrollTop = 4321;
  const anchor = view.anchorSnapshot(items, scrollTop, rowHeight);
  const withoutEarlierItem = items.filter((item) => item.key !== 'video:2');
  const restored = view.anchoredScrollTop(withoutEarlierItem, anchor, rowHeight);
  const restoredAnchor = view.anchorSnapshot(withoutEarlierItem, restored, rowHeight);
  assert.equal(restoredAnchor.key, anchor.key);
  assert.equal(restoredAnchor.offset, anchor.offset);
});

test('100–250% ölçek karşılığı görünüm yüksekliklerinde aralıklar geçerli kalır', () => {
  for (const scale of [1, 1.25, 1.5, 2, 2.5]) {
    for (const viewport of [320, 720, 1200]) {
      const range = view.virtualRange({ total: 10000, scrollTop: 500000,
        viewportHeight: viewport / scale, rowHeight: view.SEARCH_ROW_HEIGHT });
      assert(range.start >= 0 && range.end <= 10000 && range.end > range.start);
    }
  }
});

const searchDurations = [];
const filterDurations = [];
const resizeDurations = [];
const sortDurations = [];
for (let iteration = 0; iteration < 80; iteration++) {
  let started = performance.now();
  view.searchMetadata(items, iteration % 2 ? 'istanbul' : 'video 99');
  searchDurations.push(performance.now() - started);
  started = performance.now();
  view.selectWatchItems(items, iteration % 2 ? 'continue' : 'completed');
  filterDurations.push(performance.now() - started);
  started = performance.now();
  view.virtualRange({ total: 10000, scrollTop: iteration * 1703,
    viewportHeight: 320 + (iteration % 8) * 110, rowHeight: view.NORMAL_ROW_HEIGHT });
  resizeDurations.push(performance.now() - started);
  started = performance.now();
  view.sortByLastWatched(items, 10000);
  sortDurations.push(performance.now() - started);
}

const heapFixture = fixture(10000);
const heapUsedMiB = process.memoryUsage().heapUsed / (1024 * 1024);
const metrics = {
  environment: `${process.platform} ${process.arch} · Node ${process.version}`,
  samples: 80,
  records: heapFixture.length,
  searchP95Ms: Number(p95(searchDurations).toFixed(3)),
  filterP95Ms: Number(p95(filterDurations).toFixed(3)),
  resizeModelP95Ms: Number(p95(resizeDurations).toFixed(3)),
  sortP95Ms: Number(p95(sortDurations).toFixed(3)),
  heapUsedMiB: Number(heapUsedMiB.toFixed(3)),
};

test('önceden tanımlı 10k model bütçeleri aşılmaz', () => {
  assert(metrics.searchP95Ms < 30, `arama p95 ${metrics.searchP95Ms} ms`);
  assert(metrics.filterP95Ms < 15, `filtre p95 ${metrics.filterP95Ms} ms`);
  assert(metrics.resizeModelP95Ms < 2, `resize p95 ${metrics.resizeModelP95Ms} ms`);
  assert(metrics.sortP95Ms < 15, `sıralama p95 ${metrics.sortP95Ms} ms`);
  assert(metrics.heapUsedMiB < 100, `işlem heap ${metrics.heapUsedMiB} MiB`);
});

console.log(`watch-library-performance metrics ${JSON.stringify(metrics)}`);
console.log(`${passed} geçti, ${process.exitCode ? 1 : 0} başarısız (${passed + (process.exitCode ? 1 : 0)} test)`);
