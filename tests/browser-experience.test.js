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
const { isNewTabLinkGesture } = require('../src/browser-link-intent');

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
    offset: 3600,
    subtitleSyncRecords: [{ id: 'sync-1', offset: 3600 }],
    subtitleEdits: [{ id: 'edit-1', text: 'Düzeltme' }],
  });
  history.push({ url: 'https://video.test/watch/2', title: 'Iki' });
  const second = history.pop();
  assert.equal(second.url, 'https://video.test/watch/2');
  const first = history.pop();
  assert.equal(first.pinned, true);
  assert.equal(first.position, 42);
  assert.equal(first.subtitleMode, 'translation');
  assert.deepEqual(first.trackRefs, [{ id: 'track-1', role: 'translation' }]);
  assert.equal(first.offset, 3600);
  assert.equal(first.subtitleSyncRecords[0].id, 'sync-1');
  assert.equal(first.subtitleEdits[0].id, 'edit-1');
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

test('orta tik ve Ctrl/Cmd tik yeni sekme jesti, normal tik degil', () => {
  assert.equal(isNewTabLinkGesture({ button: 1 }), true);
  assert.equal(isNewTabLinkGesture({ button: 0, ctrlKey: true }), true);
  assert.equal(isNewTabLinkGesture({ button: 0, metaKey: true }), true);
  assert.equal(isNewTabLinkGesture({ button: 0 }), false);
  assert.equal(isNewTabLinkGesture({ button: 2, ctrlKey: true }), false);
});

test('main preload ve renderer geri acma, cokme ve zoom sozlesmesini birlikte tasir', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
  const browserPreload = fs.readFileSync(path.join(ROOT, 'src', 'browser-preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(main, /ipcMain\.handle\('browser:tab:reopen'/);
  assert.match(main, /wc\.on\('render-process-gone'/);
  assert.match(main, /wc\.on\('enter-html-full-screen'/);
  assert.match(main, /wc\.on\('leave-html-full-screen'/);
  assert.match(main, /applyBrowserViewBounds\(tab, view\)/);
  assert.match(main, /wc\.on\('media-started-playing'/);
  assert.match(main, /wc\.on\('media-paused'/);
  assert.match(main, /setPermissionCheckHandler/);
  assert.match(main, /wc\.on\('unresponsive'/);
  assert.match(main, /wc\.on\('responsive'/);
  assert.match(main, /type: 'tab-crashed'/);
  assert.match(main, /type: 'permission-denied'/);
  assert.match(main, /\['zoom-in', 'zoom-out', 'zoom-reset', 'zoom-set'\]/);
  assert.match(preload, /reopenBrowserTab/);
  assert.match(renderer, /async function reopenClosedBrowserTab/);
  const shortcut = renderer.slice(renderer.indexOf('function runBrowserShortcut('),
    renderer.indexOf('if (window.api.onBrowserEvent)'));
  const shift = shortcut.indexOf("normalized === 't' && shift");
  const plain = shortcut.indexOf("normalized === 't'", shift + 1);
  assert(shift >= 0 && plain > shift, 'Ctrl+Shift+T duz Ctrl+T dalindan once ele alinmiyor');
  assert.match(renderer, /event\.type === 'tab-crashed'/);
  assert.match(renderer, /event\.type === 'page-responsiveness'/);
  assert.match(html, /id="browserDiagnosticsPageStatus"/);
  assert.match(html, /id="browserZoomResetToolbar"/);
  assert.match(html, /id="browserReopenTab"/);
  assert.match(main, /ipcMain\.on\('browser:open-link'/);
  assert.match(main, /executeBrowserViewFrames\(previous\.view/);
  assert.match(browserPreload, /function handleNewTabLink/);
  assert.match(browserPreload, /ipcRenderer\.send\('browser:open-link'/);
  assert.match(browserPreload, /browser:find-state/);
  assert.match(browserPreload, /browser:page-mutated/);
  assert.match(main, /ipcMain\.on\('browser:page-mutated'/);
  assert.match(main, /pageFind\.refresh\(\)/);
  assert.match(html, /id="browserQuickPlaces"/);
  assert.match(renderer, /function renderBrowserQuickPlaces/);
  assert.match(renderer, /data-browser-quick-place/);
});

console.log(`browser-experience: ${passed} test`);
