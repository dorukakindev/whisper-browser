const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const {
  BrowserTabEventGate,
  normalizeBrowserTabId,
} = require('../src/browser-tabs');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

test('sekme kimligi yalniz sinirli guvenli degerleri kabul eder', () => {
  assert.equal(normalizeBrowserTabId('tab-42'), 'tab-42');
  assert.equal(normalizeBrowserTabId('../tab'), '');
  assert.equal(normalizeBrowserTabId(''), '');
});

test('gec gelen olay yeni kusaga ve baska sekmeye yazilmaz', () => {
  const gate = new BrowserTabEventGate();
  gate.open('tab-1', 3);
  gate.open('tab-2', 7);
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 3 }), true);
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 2 }), false);
  assert.equal(gate.accept({ tabId: 'tab-2', generation: 7 }), true);
  assert.equal(gate.accept({ tabId: 'tab-3', generation: 1 }), false);
  gate.close('tab-1');
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 4 }), false);
});

test('yeni gezinme kusagi onceki ag ve IPC olaylarini gecersiz kilar', () => {
  const gate = new BrowserTabEventGate();
  gate.open('tab-1', 1);
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 2 }), true);
  assert.equal(gate.generation('tab-1'), 2);
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 1 }), false);
});

test('ayni kusakta eski medya ve edinme olaylari reddedilir', () => {
  const gate = new BrowserTabEventGate();
  gate.open('tab-1', 4, { mediaId: 'youtube:new', acquisitionId: 'cap-new' });
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 4, mediaId: 'youtube:new', acquisitionId: 'cap-new' }), true);
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 4, mediaId: 'youtube:old', acquisitionId: 'cap-new' }), false);
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 4, mediaId: 'youtube:new', acquisitionId: 'cap-old' }), false);
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 5, mediaId: 'youtube:next', acquisitionId: 'cap-next' }), true);
});

test('aynı edinme kuşağında farklı işlem kimliği eski sonucu reddeder', () => {
  const gate = new BrowserTabEventGate();
  gate.open('tab-1', 1, { mediaId: 'youtube:new', acquisitionId: 'cap-1', operationId: 'op-1' });
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 1, mediaId: 'youtube:new', acquisitionId: 'cap-1', operationId: 'op-old' }), false);
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 1, mediaId: 'youtube:new', acquisitionId: 'cap-1', operationId: 'op-1' }), true);
  assert.equal(gate.accept({ tabId: 'tab-1', generation: 1, mediaId: 'youtube:next', acquisitionId: 'cap-2', operationId: 'op-2', type: 'navigation' }), true);
});

test('yeni edinme durumu kayitli altyazi olayindan once kapida tanitilir', () => {
  const gate = new BrowserTabEventGate();
  gate.open('tab-1', 4, { mediaId: 'discovery:episode', acquisitionId: 'cap-old' });
  const restored = {
    type: 'subtitle-found', tabId: 'tab-1', generation: 4,
    mediaId: 'discovery:episode', acquisitionId: 'cap-new',
  };
  assert.equal(gate.accept(restored), false, 'durum olayi gelmeden yeni iz kabul edilmemeli');
  assert.equal(gate.accept({
    type: 'capture-status', tabId: 'tab-1', generation: 4,
    mediaId: 'discovery:episode', acquisitionId: 'cap-new',
  }), true);
  assert.equal(gate.accept(restored), true, 'durum olayi sonrasinda kayitli iz kabul edilmeli');
});

test('Discovery yonlendirmesi ayni kusakta yeni medya baglamini kurabilir', () => {
  const gate = new BrowserTabEventGate();
  gate.open('tab-1', 7, { mediaId: 'discovery:topical', acquisitionId: 'cap-loading' });
  assert.equal(gate.accept({
    type: 'capture-status', tabId: 'tab-1', generation: 7,
    mediaId: 'discovery:watch', acquisitionId: 'cap-watch',
  }), true, 'yeni sayfanin durum olayi medya kimligini degistirebilmeli');
  assert.equal(gate.accept({
    type: 'subtitle-found', tabId: 'tab-1', generation: 7,
    mediaId: 'discovery:watch', acquisitionId: 'cap-watch',
  }), true, 'yeni medya icin yakalanan altyazi kabul edilmeli');
  assert.equal(gate.accept({
    type: 'subtitle-found', tabId: 'tab-1', generation: 7,
    mediaId: 'discovery:topical', acquisitionId: 'cap-loading',
  }), false, 'yonlendirme oncesinden gec gelen altyazi reddedilmeli');
});

test('ayni video iki sekmede altyazi ve konumu ayri tutar', () => {
  const gate = new BrowserTabEventGate();
  const states = new Map([
    ['tab-a', { url: 'https://video.test/watch/1', tracks: [], time: 0 }],
    ['tab-b', { url: 'https://video.test/watch/1', tracks: [], time: 0 }],
  ]);
  gate.open('tab-a', 1); gate.open('tab-b', 1);
  const route = (event) => {
    if (!gate.accept(event)) return;
    const state = states.get(event.tabId);
    if (event.track) state.tracks.push(event.track);
    if (event.time !== undefined) state.time = event.time;
  };
  route({ tabId: 'tab-a', generation: 1, track: 'Türkçe', time: 41 });
  route({ tabId: 'tab-b', generation: 1, track: 'İngilizce', time: 9 });
  assert.deepEqual(states.get('tab-a'), { url: 'https://video.test/watch/1', tracks: ['Türkçe'], time: 41 });
  assert.deepEqual(states.get('tab-b'), { url: 'https://video.test/watch/1', tracks: ['İngilizce'], time: 9 });
});

test('arka plan sekmesi olayi aktif sekmenin URL ve hata durumuna karismaz', () => {
  const gate = new BrowserTabEventGate();
  const states = new Map([
    ['tab-a', { url: 'https://a.test/video', error: '' }],
    ['tab-b', { url: 'https://b.test/video', error: '' }],
  ]);
  gate.open('tab-a', 2); gate.open('tab-b', 4);
  const activeTabId = 'tab-b';
  const backgroundError = { tabId: 'tab-a', generation: 2, error: 'A yüklenemedi' };
  if (gate.accept(backgroundError)) states.get(backgroundError.tabId).error = backgroundError.error;
  assert.equal(states.get(activeTabId).url, 'https://b.test/video');
  assert.equal(states.get(activeTabId).error, '');
  assert.equal(states.get('tab-a').error, 'A yüklenemedi');
});

test('hizli kapat ac eski sekmenin gec olayini yeni sekmeye tasimaz', () => {
  const gate = new BrowserTabEventGate();
  gate.open('tab-old', 5);
  gate.close('tab-old');
  gate.open('tab-new', 0);
  assert.equal(gate.accept({ tabId: 'tab-old', generation: 6 }), false);
  assert.equal(gate.accept({ tabId: 'tab-new', generation: 0 }), true);
});

test('main preload renderer boyunca sekme sozlesmesi tasinir', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(main, /const browserTabs = new Map\(\)/);
  assert.match(main, /ipcMain\.handle\('browser:tab:create'/);
  assert.match(main, /browserTabs\.size >= MAX_SESSION_TABS/,
    'normal yeni sekme yolu kalıcı oturum sınırını uygulamıyor');
  assert.match(main, /ipcMain\.handle\('browser:tab:activate'/);
  assert.match(main, /ipcMain\.handle\('browser:tab:close'/);
  assert.match(main, /tabId[\s\S]{0,120}generation/);
  assert.match(main, /browserOverlay = \{ source: \[\], translation: \[\], mode: 'translation', offset: 0 \}/);
  assert.match(main, /browserLiveAsr\?\.tab === previous/);
  assert.match(main, /async function activateBrowserTab[\s\S]{0,2200}await withTimeout\(drainBrowserCaptureBeforeClose\(\)/);
  assert.match(main, /function queueBrowserTabTransition[\s\S]{0,240}browserTabTransitionPromise/);
  assert.match(main, /ipcMain\.handle\('browser:tab:activate'[\s\S]{0,220}await activateBrowserTab/);
  assert.match(main, /persistedTrack: true/);
  assert.match(main, /browserCaptureEnabled === nextEnabled[\s\S]{0,180}unchanged: true/);
  assert.match(main, /resetBrowserCaptureState\(\{ preserveDiagnostics: true \}\)/);
  const resetStart = main.indexOf('function resetBrowserCaptureState(');
  const resetEnd = main.indexOf('function browserCaptureToggleScript(', resetStart);
  const resetBody = main.slice(resetStart, resetEnd);
  assert(resetBody.indexOf('publishBrowserDiagnostics()') < resetBody.indexOf('restorePersistedBrowserTracks(tab)'),
    'yeni acquisition kimligi kayitli izlerden once renderer kapisina bildirilmelidir');
  assert.match(main, /ipcMain\.handle\('media:probeTracks'[\s\S]{0,180}authorizedBrowserSender\(event\)/);
  assert.match(main, /sweepBrowserLiveAsrTemp\(\)/);
  assert.match(preload, /createBrowserTab/);
  assert.match(preload, /activateBrowserTab/);
  assert.match(preload, /closeBrowserTab/);
  assert.match(renderer, /BrowserTabEventGate/);
  assert.match(renderer, /browserActiveTabId/);
  assert.match(html, /id="browserTabStrip" role="tablist" aria-label="Tarayıcı sekmeleri"/);
  assert.match(html, /id="browserTabNew"[\s\S]{0,500}<span>Yeni sekme<\/span>/);
  assert.match(renderer, /\$\('browserTabNew'\)\.addEventListener\('click', createBrowserTab\)/);
  assert.match(renderer, /syncBrowserTabs\(result\.tabs, result\.activeTabId\)/);
  assert.match(renderer, /restoreActiveBrowserTabWorkspace\(tab\)/);
  assert.match(renderer, /result\.captureEnabled !== player\.browserCaptureEnabled/);
});

console.log(`browser-tabs: ${passed} test`);
