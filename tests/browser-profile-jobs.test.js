const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const profiles = require('../src/browser-site-profiles');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
let passed = 0;
function extract(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }

(async () => {
  for (const kind of ['manga', 'page']) {
    for (const change of ['settings', 'tab', 'generation', 'late-result']) {
      let finishSave, finishJob;
      const calls = [], updates = [];
      const tab = { generation: 1 };
      const values = { mangaTargetLanguage: 'tr', mangaFontScale: 1.2, pageTargetLanguage: 'tr', pageMode: 'bilingual' };
      const player = { browserActiveTabId: 'a', browserPageUrl: 'https://example.test' };
      const startJob = (id, opts) => { calls.push({ id, opts }); return new Promise(resolve => { finishJob = resolve; }); };
      const context = {
        player, browserTabState: () => tab, effectiveBrowserProfile: () => ({ values }), $: () => null,
        saveAppSettings: () => new Promise(resolve => { finishSave = resolve; }),
        applyBrowserMangaState: value => updates.push(value), applyBrowserPageTranslationState: value => updates.push(value),
        setBrowserSignal: () => {}, logLine: () => {},
        window: { api: { startBrowserManga: startJob, startBrowserPageTranslation: startJob } },
      };
      const name = kind === 'manga' ? 'handleBrowserMangaAction' : 'handleBrowserPageTranslationAction';
      const end = kind === 'manga' ? 'function setBrowserSignalVisible(' : "$('browserPageTranslate')?.addEventListener";
      vm.runInNewContext(extract(`async function ${name}(`, end), context);
      const pending = context[name]();
      values.mangaTargetLanguage = 'de'; values.pageTargetLanguage = 'de'; values.mangaFontScale = 1.7;
      if (change === 'tab') player.browserActiveTabId = 'b';
      if (change === 'generation') tab.generation++;
      finishSave(true); await new Promise(resolve => setImmediate(resolve));
      if (change === 'tab' || change === 'generation') {
        assert.equal(calls.length, 0); assert.equal(updates.length, 0);
      } else {
        assert.equal(calls.length, 1); assert.equal(calls[0].opts.targetLanguage, 'tr');
        if (kind === 'manga') assert.equal(calls[0].opts.fontScale, 1.2);
        if (change === 'late-result') player.browserActiveTabId = 'b';
        finishJob({ ok: false, error: 'test' });
      }
      await pending;
      if (change === 'late-result') assert.equal(updates.length, 1, 'Eski sonuç yeni sekmeye yazıldı');
      passed++; console.log(`  PASS  ${kind}: ${change}`);
    }
  }
  for (const kind of ['manga', 'page']) {
    let startCalls = 0;
    const context = {
      player: { browserActiveTabId: 'a', browserPageUrl: 'https://example.test',
        browserMangaTranslated: 0, browserMangaBusy: false,
        browserPageTranslated: 0, browserPageTranslateBusy: false },
      browserTabState: () => ({ generation: 1 }),
      effectiveBrowserProfile: () => ({ values: { mangaTargetLanguage: 'tr', mangaFontScale: 1,
        pageTargetLanguage: 'tr', pageMode: 'bilingual' } }),
      $: () => null,
      saveAppSettings: async () => false,
      applyBrowserMangaState: () => { throw new Error('kayıt hatasında manga durumu çalışan yapılmamalı'); },
      applyBrowserPageTranslationState: () => { throw new Error('kayıt hatasında sayfa durumu çalışan yapılmamalı'); },
      setBrowserSignal: () => {}, logLine: () => {},
      window: { api: {
        startBrowserManga: async () => { startCalls++; return { ok: true }; },
        startBrowserPageTranslation: async () => { startCalls++; return { ok: true }; },
      } },
    };
    const name = kind === 'manga' ? 'handleBrowserMangaAction' : 'handleBrowserPageTranslationAction';
    const end = kind === 'manga' ? 'function setBrowserSignalVisible('
      : "$('browserPageTranslate')?.addEventListener";
    vm.runInNewContext(extract(`async function ${name}(`, end), context);
    await context[name]();
    assert.equal(startCalls, 0, `ayar kaydı başarısızken ${kind} çevirisi eski anahtarla başladı`);
    passed++; console.log(`  PASS  ${kind}: settings-save-failure`);
  }
  {
    let timerCallback = null;
    let starts = 0;
    const control = { checked: true };
    const player = {
      browserActiveTabId: 'a', browserPageUrl: 'https://example.test/page',
      browserPageTranslated: 0, browserPageTranslateBusy: false, browserPageAutoTimer: null,
    };
    const tab = { generation: 3 };
    const context = {
      URL, Set, Number, Math, player,
      localStorage: { getItem: () => '[]', setItem() {} },
      $: id => id === 'browserPageAuto' ? control : null,
      browserTabState: id => id === 'a' ? tab : null,
      clearTimeout() {},
      setTimeout: callback => { timerCallback = callback; return 7; },
      handleBrowserPageTranslationAction: async () => { starts++; },
    };
    vm.runInNewContext(extract('function browserPageAutoHosts(', 'function updateBrowserNavigation('), context);
    assert.equal(context.scheduleBrowserPageAutoTranslation(250), true);
    tab.generation = 4;
    timerCallback();
    assert.equal(starts, 0, 'eski neslin otomatik çevirisi yeni sayfada başladı');
    assert.equal(context.scheduleBrowserPageAutoTranslation(250), true);
    timerCallback();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts, 1);
    passed++; console.log('  PASS  page: güvenlik sonrası otomatik tekrar');
  }
  {
    let clickHandler = null;
    let saveOk = false;
    let exports = 0;
    const button = { addEventListener: (_name, callback) => { clickHandler = callback; } };
    const start = source.indexOf("$('exportSettings').addEventListener");
    const end = source.indexOf("$('importSettings').addEventListener", start);
    vm.runInNewContext(source.slice(start, end), {
      $: () => button,
      saveAppSettings: async () => saveOk,
      window: { api: { exportSettings: async () => { exports++; return { ok: true, path: 'test' }; } } },
      logLine() {},
    });
    await clickHandler();
    assert.equal(exports, 0, 'kaydedilemeyen güncel ayarlar yerine eski yedek dışa aktarıldı');
    saveOk = true;
    await clickHandler();
    assert.equal(exports, 1);
    passed++; console.log('  PASS  settings export: kayıt kapısı');
  }
  const tab = { siteOverrideOrigin: 'https://a.test', siteOverrides: { overlayOpacity: 0, hideSiteCaptions: false } };
  const context = { window: { BrowserSiteProfiles: profiles }, browserTabState: () => tab,
    player: { browserPageUrl: 'https://a.test/watch', browserPlaces: { siteProfiles: { 'https://a.test': { hideSiteCaptions: true } } } }, $: () => null };
  vm.runInNewContext(extract('function browserProfileControls(', 'function renderBrowserSiteProfile('), context);
  assert.equal(context.effectiveBrowserProfile().values.overlayOpacity, 0);
  assert.equal(context.effectiveBrowserProfile().values.hideSiteCaptions, false);
  context.player.browserPageUrl = 'https://b.test';
  assert.equal(context.effectiveBrowserProfile().values.overlayOpacity, 1);
  passed++; console.log('  PASS  Geçici sekme profili başka siteye taşınmaz; false ve sıfır korunur');
  console.log(`browser-profile-jobs: ${passed} test`);
})().catch(error => { console.error(error); process.exitCode = 1; });
