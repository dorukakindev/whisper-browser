const assert = require('assert');
const view = require('../src/watch-library-view');

let seed = 0x28c0ffee;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}

const examples = 5000;
for (let sample = 0; sample < examples; sample++) {
  const total = Math.floor(random() * 10001);
  const searching = random() > .7;
  const rowHeight = view.rowHeightForSearch(searching);
  const viewportHeight = 180 + random() * 1200;
  const extent = rowHeight + view.ROW_GAP;
  const scrollTop = random() * Math.max(0, total * extent - viewportHeight);
  const pinnedIndex = random() > .5 ? Math.floor(random() * Math.max(1, total)) : -1;
  const range = view.virtualRange({ total, scrollTop, viewportHeight, rowHeight, pinnedIndex });
  assert(range.start >= 0, `negatif başlangıç: ${sample}`);
  assert(range.end >= range.start && range.end <= total, `geçersiz son: ${sample}`);
  assert(range.topSpace >= 0 && range.bottomSpace >= 0, `negatif spacer: ${sample}`);
  const visibleRows = Math.ceil(viewportHeight / extent);
  assert(range.end - range.start <= visibleRows + view.DEFAULT_OVERSCAN * 3 + 2,
    `DOM bütçesi aşıldı: ${sample}, ${range.end - range.start}`);
}

const anchorItems = Array.from({ length: 1000 }, (_, index) => ({ key: `item:${index}` }));
for (let sample = 0; sample < 1000; sample++) {
  const scrollTop = random() * 100000;
  const anchor = view.anchorSnapshot(anchorItems, scrollTop, view.NORMAL_ROW_HEIGHT);
  const removeIndex = Math.floor(random() * anchorItems.length);
  const mutated = anchorItems.filter((_item, index) => index !== removeIndex);
  if (!mutated.some((item) => item.key === anchor.key)) continue;
  const restored = view.anchoredScrollTop(mutated, anchor, view.NORMAL_ROW_HEIGHT);
  assert.equal(view.anchorSnapshot(mutated, restored, view.NORMAL_ROW_HEIGHT).key, anchor.key);
}

console.log(`watch-library-fuzz: ${examples + 1000} örnek geçti, 0 başarısız · seed=0x28c0ffee`);

