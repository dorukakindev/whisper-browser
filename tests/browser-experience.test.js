const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  BrowserClosedTabHistory,
  isReplaceableBlankBrowserTab,
} = require('../src/browser-tab-history');
const {
  browserSiteZoomForUrl,
  normalizeBrowserSiteZooms,
  withBrowserSiteZoom,
} = require('../src/browser-site-zoom');

const ROOT = path.join(__dirname, '..');
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

test('kapatilan sekmeler LIFO sirayla ve kullanici durumuyla geri gelir', () => {
  const history = new BrowserClosedTabHistory(3);
  assert.equal(history.push({ url: '', title: 'bos' }), false);
  history.push({
    url: 'https://video.test/watch/1', title: 'Bir', pinned: true,
    position: 42, volume: 0.4, subtitleMode: 'translation',
    trackRefs: [{ id: 'track-1', role: 'translation' }],
  });
  history.push({ url: 'https://video.test/watch/2', title: 'Iki' });
  const second = history.pop();
  assert.equal(second.url, 'https://video.test/watch/2');
  const first = history.pop();
  assert.equal(first.pinned, true);
  assert.equal(first.position, 42);
  assert.equal(first.subtitleMode, 'translation');
  assert.deepEqual(first.trackRefs, [{ id: 'track-1', role: 'translation' }]);
});

test('kapatilan sekme gecmisi sinirli ve dis mutasyondan bagimsizdir', () => {
  const history = new BrowserClosedTabHistory(2);
  const source = { url: 'https://a.test', trackRefs: [{ id: 'a' }] };
  history.push(source);
  source.trackRefs[0].id = 'degisti';
  history.push({ url: 'https://b.test' });
  history.push({ url: 'https://c.test' });
  assert.equal(history.size, 2);
  assert.equal(history.pop().url, 'https://c.test');
  assert.equal(history.pop().url, 'https://b.test');
});

test('son sekmenin bos yuzeyi geri acilan sekmeyle guvenle degistirilebilir', () => {
  assert.equal(isReplaceableBlankBrowserTab({ url: '', title: '', loading: false }, 1), true);
  assert.equal(isReplaceableBlankBrowserTab({ url: '', title: '', pinned: true }, 1), false);
  assert.equal(isReplaceableBlankBrowserTab({ url: 'https://a.test', title: '' }, 1), false);
  assert.equal(isReplaceableBlankBrowserTab({ url: '', title: '' }, 2), false);
});

test('site zoom tercihi hosta ozeldir ve 100 yuzdeye donunce kayit silinir', () => {
  let zooms = {};
  const saved = withBrowserSiteZoom(zooms, 'https://video.example/path', 1.34);
  assert.equal(saved.ok, true);
  zooms = saved.siteZooms;
  assert.equal(browserSiteZoomForUrl('https://video.example/other', zooms), 1.3);
  assert.equal(browserSiteZoomForUrl('https://other.example/', zooms), 1);
  const reset = withBrowserSiteZoom(zooms, 'https://video.example/', 1);
  assert.equal(browserSiteZoomForUrl('https://video.example/', reset.siteZooms), 1);
  assert.equal(Object.hasOwn(reset.siteZooms, 'video.example'), false);
});

test('site zoom kaydi gecersiz host ve sinir disi degerleri kabul etmez', () => {
  assert.deepEqual(normalizeBrowserSiteZooms({ 'GOOD.example': 1.2, '../bad': 2, ok: 9 }), {
    'good.example': 1.2,
  });
  assert.equal(withBrowserSiteZoom({}, 'file:///tmp/a', 1.2).ok, false);
  assert.equal(withBrowserSiteZoom({}, 'https://a.test', Infinity).ok, false);
});

test('main preload ve renderer geri acma, cokme ve zoom sozlesmesini birlikte tasir', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(main, /ipcMain\.handle\('browser:tab:reopen'/);
  assert.match(main, /wc\.on\('render-process-gone'/);
  assert.match(main, /type: 'tab-crashed'/);
  assert.match(main, /type: 'permission-denied'/);
  assert.match(main, /\['zoom-in', 'zoom-out', 'zoom-reset', 'zoom-set'\]/);
  assert.match(preload, /reopenBrowserTab/);
  assert.match(renderer, /async function reopenClosedBrowserTab/);
  const shift = renderer.indexOf("if (key === 't' && e.shiftKey)");
  const plain = renderer.indexOf("if (key === 't')", shift);
  assert(shift >= 0 && plain > shift, 'Ctrl+Shift+T duz Ctrl+T dalindan once ele alinmiyor');
  assert.match(renderer, /event\.type === 'tab-crashed'/);
  assert.match(html, /id="browserZoomResetToolbar"/);
  assert.match(html, /id="browserReopenTab"/);
});

console.log(`browser-experience: ${passed} test`);
