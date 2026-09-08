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
  assert.match(main, /ipcMain\.handle\('browser:tab:activate'/);
  assert.match(main, /ipcMain\.handle\('browser:tab:close'/);
  assert.match(main, /tabId[\s\S]{0,120}generation/);
  assert.match(preload, /createBrowserTab/);
  assert.match(preload, /activateBrowserTab/);
  assert.match(preload, /closeBrowserTab/);
  assert.match(renderer, /BrowserTabEventGate/);
  assert.match(renderer, /browserActiveTabId/);
  assert.match(html, /id="browserTabStrip"/);
  assert.match(html, /id="browserTabNew"/);
});

test('renderer her sekmenin medya altyazi ve izleme calisma alanini saklar', () => {
  const renderer = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
  const save = renderer.slice(renderer.indexOf('function saveActiveBrowserTabWorkspace'),
    renderer.indexOf('function restoreActiveBrowserTabWorkspace'));
  const restore = renderer.slice(renderer.indexOf('function restoreActiveBrowserTabWorkspace'),
    renderer.indexOf('function syncBrowserTabs'));
  for (const field of ['browserTracks', 'browserTime', 'browserDuration', 'browserPaused',
    'browserRate', 'browserVolume', 'browserMuted', 'watchSession', 'cues', 'cues2',
    'subtitles', 'subOrigins', 'subPath', 'sub2Path', 'offset']) {
    assert.match(save, new RegExp(`\\b${field}\\b`), `${field} sekme degisiminde saklanmiyor`);
    assert.match(restore, new RegExp(`\\b${field}\\b`), `${field} sekme degisiminde geri yuklenmiyor`);
  }
  assert.match(renderer, /await flushWatchState\(false, true\)[\s\S]*saveActiveBrowserTabWorkspace\(\)/,
    'sekme degisiminden once izleme konumu diske yazilmiyor');
});

test('ana surec gec ag ve komut sonuclarini sekme kusagiyla reddeder', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.match(main, /context: \{ \.\.\.browserEventContext\(tab\), stateGeneration: browserStateGeneration \}/);
  assert.match(main, /if \(context && !isCurrentBrowserContext\(context\)\) return CAPTURE_DISCARDED/);
  assert.match(main, /await processBrowserCapturedPayload[\s\S]*if \(!isCurrentBrowserContext\(context\)\) return/);
  assert.match(main, /activeRequestedBrowserTab\(payload && payload\.tabId\)/);
  assert.match(main, /Eski sekme istegi reddedildi\.|Eski sekme isteği reddedildi\./);
});

console.log(`browser-tabs: ${passed} test`);
