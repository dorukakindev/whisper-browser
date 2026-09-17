'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BrowserTranslationScheduler } = require('../src/browser-translation-scheduler');
const { browserPermissionDecision, withBrowserPermission } = require('../src/browser-site-permissions');
const { BrowserNoteStore } = require('../src/browser-note-store');
const { BrowserTranslationArchive } = require('../src/browser-translation-archive');
const { browserTabProtectionReasons } = require('../src/browser-tab-resources');
const { BrowserTabEventGate } = require('../src/browser-tabs');
const { pageApplyScript } = require('../src/browser-page-translate');

const sentence = (id, start) => ({
  id, start, end: start + 1, text: id,
  pieces: [{ cueId: id, start, end: start + 1, text: id }],
});

(async () => {
  // B1: terminal retry yalniz hatali kimligi kuyruga almali.
  let fail = true;
  const calls = [];
  const scheduler = new BrowserTranslationScheduler({
    maxAttempts: 1, lookAhead: 5, lookBehind: 0,
    translate: async (item) => {
      calls.push(item.id);
      if (fail) throw new Error('kontrollü hata');
      return 'TR:' + item.text;
    },
  });
  scheduler.setSentences([sentence('near', 0), sentence('far', 600)]);
  scheduler.updatePlayhead(0);
  await scheduler.whenIdle();
  assert.deepEqual(calls, ['near']);
  assert.equal(scheduler.snapshot().completeTrack, false);
  fail = false;
  assert.equal(scheduler.retryFailed(), 1);
  await scheduler.whenIdle();
  assert.deepEqual(calls, ['near', 'near']);
  assert.equal(scheduler.snapshot().completeTrack, false);
  assert.equal(scheduler.snapshot().results.some((row) => row.sentenceId === 'far'), false);

  // B7: UI'daki Sor ile motorun varsayimi ayni olmali.
  assert.equal(browserPermissionDecision({}, 'https://example.test', 'fullscreen'), 'ask');
  assert.equal(browserPermissionDecision({}, 'https://example.test', 'clipboard-sanitized-write'), 'ask');
  const asked = withBrowserPermission({}, 'https://example.test', 'fullscreen', 'ask', 1);
  assert.equal(asked.sitePermissions['https://example.test'].permissions.fullscreen, 'ask');
  assert.equal(browserPermissionDecision(asked.sitePermissions, 'https://example.test', 'fullscreen'), 'ask');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-report-25-28-'));
  try {
    // B8: yedek okunurken ana dosya rename'i kilitlenirse konstruktor ve
    // okumalar hayatta kalmali.
    const notePath = path.join(root, 'notes.json');
    const seed = new BrowserNoteStore(notePath);
    seed.upsert({ id: 'note:a', mediaId: 'media:a', note: 'Korunan not' });
    seed.upsert({ id: 'note:b', mediaId: 'media:a', note: 'Yeni not' });
    fs.writeFileSync(notePath, '{bozuk', 'utf8');
    const originalRename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (path.resolve(to) === path.resolve(notePath)) {
        throw Object.assign(new Error('kilitli'), { code: 'EPERM' });
      }
      return originalRename(from, to);
    };
    let recovered;
    try { recovered = new BrowserNoteStore(notePath); }
    finally { fs.renameSync = originalRename; }
    assert.equal(recovered.get('note:a').note, 'Korunan not');
    assert.match(recovered.recoveryWriteError, /yenilenemedi/);
    recovered.upsert({ id: 'note:c', mediaId: 'media:a', note: 'Sonraki yazım' });
    assert.equal(recovered.recoveryWriteError, '');

    // B9: ayni mantiksal arsivin yeni revizyonu eski dosya ciftini biriktirmemeli.
    const archiveRoot = path.join(root, 'archive');
    const archive = new BrowserTranslationArchive(archiveRoot);
    for (const translation of ['Bir', 'İki', 'Üç']) {
      archive.savePage({
        url: 'https://example.test/article', targetLanguage: 'tr', scope: 'article',
        blocks: [{ id: 'p1', text: 'One', tag: 'p' }],
        translations: new Map([['p1', translation]]),
      });
    }
    assert.equal(fs.readdirSync(path.join(archiveRoot, 'Sayfalar')).length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  // B10: session-kapsamli indirme kaynak sekmenin bosaltilmasini engellemez.
  assert.deepEqual(browserTabProtectionReasons({ downloadActive: true }), []);

  // B12: reddedilen olay kapinin saklanan baglamini degistirmemeli.
  const gate = new BrowserTabEventGate();
  gate.open('tab-a', 1, { mediaId: 'm1', acquisitionId: 'a1', operationId: 'op1' });
  assert.equal(gate.accept({ type: 'cue', tabId: 'tab-a', generation: 1,
    mediaId: 'm2', acquisitionId: 'a2', operationId: 'op2' }), false);
  assert.equal(gate.accept({ type: 'cue', tabId: 'tab-a', generation: 1,
    mediaId: 'm1', acquisitionId: 'a1', operationId: 'op1' }), true);

  // Entegrasyon baglantilarinin sonraki refactorlarda kaybolmamasini sabitle.
  const preload = fs.readFileSync(path.join(__dirname, '../src/browser-preload.js'), 'utf8');
  const ass = fs.readFileSync(path.join(__dirname, '../src/browser-ass-renderer.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  const features = fs.readFileSync(path.join(__dirname, '../src/renderer/browser-features.js'), 'utf8');
  const subtitles = fs.readFileSync(path.join(__dirname, '../src/browser-subtitles.js'), 'utf8');
  assert.match(preload, /pagehide', \(event\)[\s\S]{0,180}if \(event\.persisted\) return/);
  assert.match(ass, /state\.pageHide = \(event\)[\s\S]{0,100}if \(!event\.persisted\) state\.detach/);
  assert.match(main, /const fullscreen = active\?\.htmlFullscreen[\s\S]{0,500}tab\.id === fullscreen\.id/);
  assert.match(main, /enter-html-full-screen'[\s\S]{0,260}applyBrowserViewsLayout\(\)/);
  assert.match(renderer, /event\.type === 'load-retry'[\s\S]{0,500}event\.type === 'html-full-screen'/);
  assert.match(features, /event\.key !== 'Enter' \|\| event\.isComposing \|\| busy/);
  assert.match(main, /browser:page:exclusions'[\s\S]{0,700}if \(tab\.pageTranslateJob\) return/);
  assert.match(pageApplyScript({ sessionId: 's', mode: 'bilingual' }),
    /const hideTools = \(\) => \{[\s\S]{0,180}restoreView\(state\.hoveredRef\)/);
  assert.match(subtitles, /tailEnd: Number\(list\[list\.length - 1\]\?\.end\)/);

  // R51-24: anlamsal arama sonucu kaynak (altyazı) zamanıdır; seek'e gönderilmeden
  // video zamanına dönüştürülür — ofsetli/ölçekli senkronda yanlış konuma atlardı.
  assert.match(features, /subtitleVideoTime\(hit\.start, false\)/,
    'anlamsal arama tıklaması kaynak zamanı video zamanına çevirmiyor');

  console.log('report-25-28-regressions: B1-B15 kapanış senaryoları geçti');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
