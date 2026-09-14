'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const page = require('../src/browser-page-translate');
const archive = require('../src/browser-translation-archive');
const terminology = require('../src/browser-terminology');
const siteTerminology = require('../src/browser-site-terminology');

class FakeScheduler {
  constructor(options) { this.options = options; this.sentences = []; this.failures = []; this.ran = false; }
  setSentences(sentences) { this.sentences = sentences; }
  completeAll() {}
  setContext() {}
  cancelAll() {}
  snapshot() { return { failures: this.failures }; }
  async whenIdle() {
    if (this.ran) return;
    this.ran = true;
    for (const sentence of this.sentences) {
      if (this.options.testFailure) this.options.onResult({ error: 'Sağlayıcı hatası', cues: [] }, sentence);
      else this.options.onResult({ cached: false, cues: sentence.pieces.map((piece) => ({
        cueId: piece.cueId, text: `Yeni: ${piece.text}`,
      })) }, sentence);
    }
  }
}

(async () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  assert.match(main, /excludedSelectors: session\.config\.excludedSelectors \|\| \[\],[\s\S]{0,120}excludedSections: session\.excludedSections \|\| \[\]/,
    'normal sayfa taraması bölüm dışlamalarını DOM katmanına taşımalı');
  assert.match(main, /excludedSelectors: request\?\.excludedSelectors,[\s\S]{0,120}excludedSections: request\?\.excludedSections/,
    'önizleme taraması bölüm dışlamalarını DOM katmanına taşımalı');
  assert.match(main, /const \[scanPayload\] = await executeBrowserTrustedMain\(tab\.view, pageBlockScanScript\([\s\S]{0,500}excludedSections: nextSections/,
    'çalışma sırasında değişen dışlamalar tarama durumuna yeniden uygulanmalı');
  const pageActionSource = main.slice(main.indexOf('async function handleBrowserPageAction('),
    main.indexOf('function invalidateBrowserCloudflareProbe('));
  const pageViewHandler = main.slice(main.indexOf("ipcMain.handle('browser:page:view'"),
    main.indexOf("ipcMain.handle('browser:page:autoContinue'"));
  assert.ok(pageViewHandler.includes('const session = tab?.pageTranslateSession;') && pageViewHandler.includes('const generation = tab.generation;'),
    'görünüm işleyicisi oturum ve kuşak kimliğini await öncesinde sabitlemeli');
  assert.ok(pageViewHandler.includes('if (tab.generation !== generation || tab.pageTranslateSession !== session) return { ok: false, stale: true, error: \'Sekme değişti.\' };'),
    'görünüm sonucu await sonrasında sahiplik kapısından geçmeli');
  assert.ok(pageViewHandler.includes('session.view = view; tab.pageTranslateView = view'),
    'görünüm değişikliği aktif oturumu da güncellemeli; dinamik çeviri eski görünümü geri getirmemeli');
  const source = main.slice(main.indexOf('function browserPageMemoryVersion('),
    main.indexOf('const pdfDocuments = new Map();'));
  const events = [];
  const context = {
    AbortController, Map, Set, Number, String, Math, Promise, setTimeout, clearTimeout,
    createHash: crypto.createHash,
    canonicalPageUrl: archive.canonicalPageUrl,
    canonicalPageSite: archive.canonicalPageSite,
    pageTranslationMemoryKey: page.pageTranslationMemoryKey,
    normalizePageBlocks: page.normalizePageBlocks,
    planPageTranslationBatches: page.planPageTranslationBatches,
    buildPageTranslationUnits: page.buildPageTranslationUnits,
    pageBlockCacheKey: page.pageBlockCacheKey,
    terminologyPrompt: terminology.terminologyPrompt,
    terminologySuggestions: terminology.terminologySuggestions,
    createTerminologyMap: terminology.createTerminologyMap,
    seedTerminology: terminology.seedTerminology,
    learnTerminology: terminology.learnTerminology,
    siteTerminologyScope: siteTerminology.siteTerminologyScope,
    seedSiteTerminology: siteTerminology.seedSiteTerminology,
    readBrowserPlaces: () => ({ siteTerminology: {} }),
    setBrowserPlaces: () => true,
    BrowserTranslationScheduler: FakeScheduler,
    browserNetworkOnline: true,
    browserTranslationCache: () => ({ get: () => undefined, set() {} }),
    requestBrowserSentenceTranslation: async () => ({}),
    executeBrowserTrustedMain: async () => [{ ok: true, applied: 1, layoutWarnings: [] }],
    pageApplyScript: (value) => value,
    pageRestoreScript: () => ({}),
    pageBlockScanScript: () => ({}),
    pageExcludeScript: () => ({}),
    browserTranslationArchive: () => ({ savePage: () => ({ ok: false }), hasPage: () => false }),
    sendBrowserEvent: (_tab, event) => events.push(event),
    prepareBrowserPageInstrumentation: async () => ({}),
    loadSettings: () => ({ ui: {} }),
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.runBlocks = runBrowserPageTranslationBlocks;\nthis.completion = pageTranslationCompletion;\nthis.pageUrl = browserPageUrl;`, context);
  vm.runInContext(pageActionSource, context);

  assert.equal(context.pageUrl({ restoredUrl: 'https://example.com/old', view: { webContents: {
    isDestroyed: () => false, getURL: () => 'https://example.com/new',
  } } }), 'https://example.com/new', 'canlı SPA adresi arşiv ve cache kimliğinde eski oturum URL’sinden üstün olmalı');
  assert.equal(context.pageUrl({ restoredUrl: 'https://example.com/fallback', view: { webContents: {
    isDestroyed: () => false, getURL: () => 'about:blank',
  } } }), 'https://example.com/fallback', 'boşaltılmış sekme kalıcı URL’ye geri düşmeli');

  const block = { id: 'a', text: 'Original text.', tag: 'p', role: '', section: 'Giriş', order: 0 };
  const memoryTab = { restoredUrl: 'https://example.com/article' };
  const memoryConfig = { targetLanguage: 'tr', model: 'test', glossary: [], lockedTerms: [] };
  const memoryKeys = context.browserPageMemoryKeys(memoryTab, block, memoryConfig);
  for (const change of [{ glossary: [{ source: 'Captain', target: 'Komutan' }] }, { lockedTerms: ['Captain'] },
    { register: 'formal' }, { profanity: 'soften' }, { endpoint: 'https://provider.example/v1' }]) {
    const changed = context.browserPageMemoryKeys(memoryTab, block, { ...memoryConfig, ...change });
    assert.notEqual(memoryKeys.exact, changed.exact);
    assert.notEqual(memoryKeys.site, changed.site);
  }
  const makeSession = () => ({ generation: 7,
    config: { targetLanguage: 'tr', sourceLanguage: 'en', model: 'test', workers: 1,
      register: 'natural', profanity: 'preserve', glossary: [], pageCharacterBudget: 1000 },
    mode: 'bilingual', view: 'both', scope: 'article', autoContinue: true,
    blocks: new Map([[block.id, block]]), translations: new Map([[block.id, 'Eski çeviri.']]),
    failures: new Map(), translatedCharacters: block.text.length, apiCharacters: 0,
    terminologyMap: terminology.createTerminologyMap(), excludedSections: [], lockedTerms: [],
    excludedBlockIds: new Set(), sectionExcludedBlockIds: new Set(), deferredBlockIds: new Set(),
    layoutWarnings: new Map(), manualEditIds: new Set(), userPaused: false,
    memoryVersion: 'v2', budgetReached: false });
  const makeTab = (session) => ({ generation: 7, pageTranslateSession: session, pageTranslateJob: null,
    pageTranslated: 1, pageTranslateFailed: 0, pageTranslateVisible: true,
    restoredUrl: 'https://example.com/article', restoredTitle: 'Test',
    view: { webContents: { isDestroyed: () => false, getURL: () => 'https://example.com/article' } } });

  const successSession = makeSession();
  const success = await context.runBlocks(makeTab(successSession), [block], successSession,
    { retry: true, retryIds: ['a'] });
  assert.equal(successSession.translations.get('a'), 'Yeni: Original text.');
  assert.equal(successSession.translatedCharacters, block.text.length,
    'yeniden çeviri toplam çevrilmiş karakteri iki kez saymamalı');
  assert.equal(successSession.apiCharacters, block.text.length,
    'yeniden çeviri gerçek API kaynak karakterini saymalı');
  assert.equal(success.retryFailures.length, 0);

  // User edits made while a provider request is outstanding survive both its
  // successful result and its failure bookkeeping, including queued DOM work.
  const applied = [];
  context.executeBrowserTrustedMain = async (_view, payload) => { applied.push(...(payload.translations || [])); return [{ ok: true }]; };
  for (const providerFails of [false, true]) {
    const editedSession = makeSession(), editedTab = makeTab(editedSession);
    editedTab.bridgeToken = 'test';
    context.BrowserTranslationScheduler = class extends FakeScheduler {
      async whenIdle() {
        await context.handleBrowserPageAction(editedTab, { action: 'edit', id: 'a', bridgeToken: 'test', pre: 'Eski çeviri.', translation: 'Kullanıcı düzeltmesi.' });
        this.options.testFailure = providerFails;
        if (providerFails) this.failures = this.sentences.map(s => ({ sentenceId: s.id, error: 'Hata' }));
        await super.whenIdle();
      }
    };
    const outcome = await context.runBlocks(editedTab, [block], editedSession, { retry: true, retryIds: ['a'] });
    assert.equal(editedSession.translations.get('a'), 'Kullanıcı düzeltmesi.');
    assert.equal(editedSession.manualEditVersions.get('a'), 1);
    assert.equal(outcome.retryFailures.length, 0);
    assert.equal(editedSession.failures.size, 0);
  }
  const queuedSession = makeSession(), queuedTab = makeTab(queuedSession);
  const queuedJob = { session: queuedSession, generation: 7, controller: new AbortController(), applyQueue: [{ id: 'a', translation: 'Eski çeviri.' }], applyChain: Promise.resolve() };
  queuedTab.pageTranslateJob = queuedJob;
  const beforeApply = applied.length;
  const flush = context.flushBrowserPageApply(queuedTab, queuedJob);
  queuedSession.translations.set('a', 'Son kullanıcı metni.');
  await flush;
  assert.equal(applied.length, beforeApply, 'Kuyrukta bekleyen eski metin düzenlemeyi geri almamalı');
  queuedJob.applyQueue.push({ id: 'a', translation: 'Son kullanıcı metni.' });
  queuedSession.sectionExcludedBlockIds.add('a');
  await context.flushBrowserPageApply(queuedTab, queuedJob);
  assert.equal(applied.length, beforeApply, 'Dışlanan bölümün bekleyen sonucu ekrana gönderilmemeli');
  context.BrowserTranslationScheduler = FakeScheduler;

  const failedSession = makeSession();
  const failedTab = makeTab(failedSession);
  const OriginalScheduler = context.BrowserTranslationScheduler;
  context.BrowserTranslationScheduler = class extends OriginalScheduler {
    constructor(options) { super(options); this.options.testFailure = true; }
  };
  const failed = await context.runBlocks(failedTab, [block], failedSession,
    { retry: true, retryIds: ['a'] });
  assert.equal(failedSession.translations.get('a'), 'Eski çeviri.',
    'başarısız bölüm yenilemesi önceki çeviriyi korumalı');
  assert.equal(failedSession.failures.size, 0);
  assert.equal(failed.retryFailures.length, 1);
  assert.match(failed.message, /önceki çeviriler korundu/);
  assert.match(pageActionSource, /try \{[\s\S]*runBrowserPageTranslationBlocks\(tab, \[block\][\s\S]*finally \{[\s\S]*pageActionResultScript/,
    'blok retry beklenmeyen hatada da düğme kilidini bırakmalı');
  assert.match(pageActionSource, /tab\.generation === generation && tab\.pageTranslateSession === session[\s\S]*pageActionResultScript/,
    'retry sonucu gezinme sırasında yeni sayfanın aynı blok kimliğine uygulanmamalı');
  assert.match(pageActionSource, /if \(!session \|\| session\.generation !== tab\.generation\) \{ await settleRejectedRetry\(\); return; \}/,
    'geçerli köprüden gelen retry oturumu kaybolduğunda rozet beklemede bırakılmamalı');
  assert.match(pageActionSource, /if \(!block \|\| session\.excludedBlockIds\?\.has\(id\)\) \{ await settleRejectedRetry\(\); return; \}/,
    'retry bloğu yenileme sırasında kaybolduğunda rozet beklemede bırakılmamalı');
  assert.match(pageActionSource, /if \(tab\.generation !== generation \|\| tab\.pageTranslateSession !== session\) return;[\s\S]*tab\.pageTranslated/,
    'eski düzenleme veya dışlama sonucu yeni sayfanın sekme durumuna yazılmamalı');

  failedSession.sectionExcludedBlockIds.add('a');
  assert.deepEqual(context.completion(failedSession), {
    total: 1, translated: 0, failed: 0, excluded: 1, pending: 0, budgetReached: false,
    characters: block.text.length, apiCharacters: 0, budget: 1000, layoutWarnings: 0,
  });
  console.log('browser-page-translation-main: kayıpsız bölüm yenileme, API bütçesi ve dışlama sayımı geçti');
})().catch((error) => { console.error(error); process.exitCode = 1; });
