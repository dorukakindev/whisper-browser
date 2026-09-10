'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {
  BrowserTranslationArchive,
  canonicalPageUrl,
  canonicalPageSite,
  buildPageTranslationExport,
  matchArchivedPage,
} = require('../src/browser-translation-archive');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-translation-archive-'));
(async () => { try {
  assert.equal(canonicalPageUrl('https://Example.com/yazi/?utm_source=x&b=2&a=1#yorum'),
    'https://example.com/yazi?a=1&b=2');
  assert.equal(canonicalPageUrl('https://user:pass@example.com/yazi?id=7&token=gizli&X-Amz-Signature=imza'),
    'https://example.com/yazi?id=7');
  assert.equal(canonicalPageUrl('file:///private.txt'), '');
  assert.equal(canonicalPageSite('https://example.com/yazi?id=7'), 'https://example.com');

  const archive = new BrowserTranslationArchive(root);
  const page = archive.savePage({
    url: 'https://example.com/yazi?utm_source=test', title: 'Örnek: Yazı',
    targetLanguage: 'tr', mode: 'bilingual', scope: 'article', complete: true,
    excludedSections: ['Yorumlar'],
    blocks: [
      { id: 'old-a', text: 'Hello world.', tag: 'p', role: '', section: 'Giriş', order: 0 },
      { id: 'old-b', text: 'Read more', tag: 'a', role: 'link', section: 'Giriş', order: 1 },
      { id: 'old-c', text: 'Read more', tag: 'a', role: 'link', section: 'Son', order: 2 },
    ],
    translations: new Map([
      ['old-a', 'Merhaba dünya.'], ['old-b', 'Devamını oku'], ['old-c', 'Daha fazlası'],
    ]),
  });
  assert.equal(page.ok, true);
  assert.equal(archive.hasPage('https://example.com/yazi#başlık', 'TR'), true);
  assert.equal(archive.hasPage('https://example.com/başka', 'tr'), false);
  assert(fs.existsSync(page.path));
  assert(fs.existsSync(path.join(root, 'index.json')));
  assert.match(fs.readFileSync(page.path, 'utf8'), /Merhaba dünya/);
  assert.equal(archive.listPages({ url: 'https://example.com/yazi#x' }).length, 1);
  assert.equal(archive.listPages({ url: 'https://example.com/başka' }).length, 0);

  const exportData = {
    title: '<Örnek>', url: 'https://example.com/yazi?token=gizli', targetLanguage: 'tr',
    blocks: [
      { id: 'a', text: 'Hello <world>.', section: 'Giriş', order: 2 },
      { id: 'b', text: 'Pending', section: 'Son', order: 3 },
      { id: 'first', text: 'First', section: 'Giriş', order: 1 },
    ], translations: new Map([['a', 'Merhaba & dünya.'], ['first', 'İlk']]),
    manualEditIds: new Set(['a']), failures: new Map([['b', { error: 'x' }]]), excludedIds: new Set(['first']),
  };
  const jsonExport = buildPageTranslationExport({ ...exportData, format: 'json' });
  const parsedExport = JSON.parse(jsonExport.text);
  assert.deepEqual(parsedExport.blocks.map((row) => row.id), ['first', 'a', 'b']);
  assert.equal(parsedExport.blocks.find((row) => row.id === 'a').manualEdit, true);
  assert.equal(parsedExport.blocks.find((row) => row.id === 'b').status, 'failed');
  assert.equal(parsedExport.blocks.find((row) => row.id === 'first').status, 'excluded');
  assert.equal(parsedExport.counts.translated, 1);
  assert.equal(parsedExport.complete, false);
  assert.match(buildPageTranslationExport({ ...exportData, format: 'txt' }).text, /KISMİ ÇEVİRİ/);
  const htmlExport = buildPageTranslationExport({ ...exportData, format: 'html' }).text;
  assert.match(htmlExport, /&lt;Örnek&gt;/); assert.match(htmlExport, /Merhaba &amp; dünya/);
  assert.doesNotMatch(htmlExport, /<world>/);

  const restored = archive.findPage({
    url: 'https://example.com/yazi/', targetLanguage: 'tr',
    blocks: [
      { id: 'new-a', text: 'Hello world.', tag: 'p', role: '' },
      { id: 'new-b', text: 'Read more', tag: 'a', role: 'link' },
      { id: 'new-c', text: 'Read more', tag: 'a', role: 'link' },
    ],
  });
  assert(restored);
  assert.deepEqual(restored.record.excludedSections, ['Yorumlar']);
  assert.equal(restored.exact, true);
  assert.deepEqual(restored.matches.map((row) => [row.id, row.translation]), [
    ['new-a', 'Merhaba dünya.'], ['new-b', 'Devamını oku'], ['new-c', 'Daha fazlası'],
  ]);
  assert.equal(archive.findPage({ url: 'https://example.com/yazi/', targetLanguage: 'de',
    blocks: [{ id: 'x', text: 'Hello world.', tag: 'p' }] }), null);
  assert.equal(matchArchivedPage(restored.record,
    [{ id: 'changed', text: 'Completely changed.', tag: 'p' }]).matches.length, 0);

  const subtitle = archive.saveSubtitle({
    mediaId: 'browser:youtube:abc', url: 'https://youtube.com/watch?v=abc',
    title: 'Örnek Video', targetLanguage: 'tr', sourceHash: 'a'.repeat(64), trackId: 'tr-one',
    cues: [{ id: '1', start: 1.2, end: 2.5, text: 'Merhaba dünya.' }],
  });
  assert.equal(subtitle.ok, true);
  assert(fs.existsSync(subtitle.path));
  assert(fs.readFileSync(subtitle.path, 'utf8').startsWith('\uFEFF1\r\n00:00:01,200'));
  assert(fs.existsSync(path.join(root, 'Altyazılar')));
  assert(fs.existsSync(path.join(root, 'Sayfalar')));

  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const restoreSource = main.slice(main.indexOf('async function restoreArchivedBrowserPageTranslation('),
    main.indexOf('function scheduleArchivedBrowserPageTranslationRestore('));
  assert.match(main, /persistBrowserPageTranslationArchive\(tab, session\)/);
  assert.match(main, /browserTranslationArchive\(\)\.saveSubtitle/);
  assert.match(main, /translationArchive,\s*\r?\n\s*};/);
  assert.match(restoreSource, /archive\.findPage/);
  assert.match(restoreSource, /pageApplyScript/);
  assert.doesNotMatch(restoreSource, /requestBrowserSentenceTranslation|fetch\(/,
    'arşiv geri yükleme yolu ağ çevirisi başlatmamalı');
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  assert.match(html, /id="browserTranslationArchiveOpen"/);
  assert.match(renderer, /browserTranslationArchiveOpen/);

  const liveBlocks = [
    { id: 'live-a', text: 'Hello world.', tag: 'p', role: '', section: 'Giriş', order: 0 },
    { id: 'live-b', text: 'Read more', tag: 'a', role: 'link', section: 'Giriş', order: 1 },
  ];
  const applied = [];
  const events = [];
  const integration = {
    loadSettings: () => ({ ui: { browserPageTarget: 'tr' } }),
    browserTranslationArchive: () => ({
      hasPage: () => true,
      findPage: () => ({ path: 'arşiv.md', record: {
        mode: 'bilingual', scope: 'article', excludedSections: ['Yorumlar'],
      },
        matches: [{ id: 'live-a', translation: 'Merhaba dünya.', source: 'Hello world.' },
          { id: 'live-b', translation: 'Devamını oku', source: 'Read more' }] }),
    }),
    prepareBrowserPageInstrumentation: async () => ({ stale: false, active: false, unknown: false, compatibilityMode: false }),
    executeBrowserTrustedMain: async (_view, script) => {
      if (script === 'scan') return [{ blocks: liveBlocks }];
      applied.push(script);
      return [{ ok: true, applied: script.translations.length }];
    },
    pageBlockScanScript: () => 'scan',
    pageApplyScript: (options) => options,
    normalizePageBlocks: (blocks) => blocks,
    browserPageTranslationConfig: (options) => ({ ...options, sourceLanguage: '', model: 'yerel-test' }),
    createTerminologyMap: () => ({}),
    terminologySuggestions: () => [],
    browserPageMemoryVersion: () => 'test-memory-v2',
    browserPageExcludedIds: () => new Set(),
    browserPageTerminologySuggestions: () => [],
    sendBrowserEvent: (_tab, event) => events.push(event),
    setTimeout, clearTimeout, Map, Set, Number, String, Math, Promise,
  };
  vm.createContext(integration);
  const helpers = main.slice(main.indexOf('function browserPageUrl('),
    main.indexOf('async function runBrowserPageTranslationBlocks('));
  vm.runInContext(helpers, integration);
  const tab = { generation: 4, restoredUrl: 'https://example.com/yazi', restoredTitle: 'Yazı',
    compatibilityMode: false, browserInstrumentationPending: false, pageTranslateJob: null,
    pageTranslateSession: null, view: { webContents: { isDestroyed: () => false, getURL: () => 'https://example.com/yazi' } } };
  const loaded = await integration.restoreArchivedBrowserPageTranslation(tab);
  assert.equal(loaded.restored, true);
  assert.equal(tab.pageTranslated, 2);
  assert.deepEqual(tab.pageTranslateSession.excludedSections, ['Yorumlar']);
  assert.equal(tab.pageTranslateSession.translations.get('live-b'), 'Devamını oku');
  assert.deepEqual(applied[0].translations.map((row) => row.id), ['live-a', 'live-b']);
  assert.equal(events.at(-1).message, 'Kayıtlı sayfa çevirisi arşivden yüklendi; yeniden çeviri yapılmadı.');

  console.log('browser-translation-archive: sayfa eşleştirme ve SRT arşivi geçti');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
} })().catch((error) => { console.error(error); process.exitCode = 1; });
