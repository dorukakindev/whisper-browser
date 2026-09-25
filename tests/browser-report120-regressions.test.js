'use strict';
// R120 — premium tarayıcı hissi ve bağlam hataları regresyonları.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const renderer = read('src/renderer/renderer.js');
const main = read('src/main.js');
const css = read('src/renderer/styles.css');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; } };

test('B2 sayfa belgesi 5xx oynatma/DRM hatası sayılmaz', () => {
  const diag = require('../src/browser-playback-diagnostics');
  const classify = diag.classifyPlaybackEvidence;
  assert.equal(classify({ kind: 'http', status: 502, resourceKind: 'document' }).code || classify({ kind: 'http', status: 502, resourceKind: 'document' }).id, 'page-server-error');
  assert.equal(classify({ kind: 'http', status: 403, resourceKind: 'document' }).code, 'http-access-denied');
  const media = classify({ kind: 'http', status: 503, resourceKind: 'media' });
  assert.equal(media.code || media.id, 'service-unavailable');
  const license = classify({ kind: 'http', status: 403, resourceKind: 'license' });
  assert.equal(license.code || license.id, 'license-access-denied');
  assert.doesNotMatch(JSON.stringify(classify({ kind: 'http', status: 502, resourceKind: 'document' })), /lisans/);
});

test('P1 menü açılırken sayfa donmuş kareyle kalır', () => {
  assert.match(main, /ipcMain\.handle\('browser:snapshotActive'/);
  assert.match(main, /image\.toJPEG\(82\)/);
  assert.match(read('src/preload.js'), /snapshotBrowserPage: \(\) => ipcRenderer\.invoke\('browser:snapshotActive'\)/);
  assert.match(renderer, /if \(window\.api\.setBrowserOccluded\) return applyBrowserOcclusion\(occluded\);/);
  // Görüntü, gizlemeden ÖNCE boyanır; açılınca temizlenir.
  const body = renderer.slice(renderer.indexOf('async function applyBrowserOcclusion'));
  assert.ok(body.indexOf("classList.add('browser-frozen')") < body.indexOf('window.api.setBrowserOccluded(occluded)'));
  assert.match(body, /if \(!occluded && seq === browserOcclusionSeq\) clearBrowserFreezeFrame\(\);/);
  assert.match(css, /\.browser-view-slot\.browser-frozen \{[^}]*background-image: var\(--browser-freeze-image\)/);
});

test('P2 videosuz sayfada altyazı şeridi sessize alınır, önemli mesajda geri gelir', () => {
  assert.match(renderer, /function updateBrowserSignalQuiet\(\)/);
  assert.match(renderer, /Number\(state\.priority\) >= 25 && Date\.now\(\) - Number\(state\.setAt \|\| 0\) < 20000/);
  assert.match(renderer, /player\.browserMediaSeen = true;/);
  assert.match(renderer, /player\.browserMediaSeen = !!tab\.browserMediaSeen \|\| player\.browserDuration > 0;/);
  assert.match(css, /\.browser-workspace\.signal-quiet \.browser-signal \{ display: none; \}/);
});

test('B1 boş transkript sayfa bağlamını doğru söyler', () => {
  assert.match(renderer, /const emptyKind = trackCount \? 'tracks' : \(browserMode && !player\.browserMediaSeen \? 'no-media' : 'none'\);/);
  assert.match(renderer, /data-empty-action="tracks"/);
  const { translate } = require('../src/renderer/ui-locale');
  for (const key of ['Sayfada altyazı izi bulundu', 'Altyazı izini seç', 'Bu sayfada video yok']) {
    assert.notEqual(translate(key, 'en'), key);
  }
});

test('P3 Daha fazla menüsü pencerede taşmaz', () => {
  assert.match(css, /\.browser-more-popover \{\s*max-height: min\(680px, calc\(100vh - 150px\)\);\s*overflow-y: auto;/);
});

test('i18n yeni sekme adı ve çeviri öneri metni etkin dilde', () => {
  assert.doesNotMatch(renderer, /label = 'Yeni sekme';/);
  assert.match(renderer, /globalThis\.UiLocale\?\.get\?\.\(\) === 'en' \? 'Translate and show' : 'Çevir ve göster'/);
});

if (!process.exitCode) console.log(`browser-report120-regressions: ${passed} test geçti`);
