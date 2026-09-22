'use strict';

// 2026-09-22 tarayıcı / çeviri / kozmetik denetimi regresyonları.
// Her test, düzeltmeden önce BAŞARISIZ olan somut girdiyi kullanır.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function sliceBetween(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `kaynak sınırı bulunamadı: ${start} … ${end}`);
  return source.slice(a, b);
}

// ---------------------------------------------------------------- çeviri

test('sayfa çevirisi: kendi iki yazımımız orijinali ezmez, bloğu pasif yapmaz; gerçek SPA değişimi yine yakalanır', () => {
  const P = require('../src/browser-page-translate.js');
  const observers = [];
  class MO { constructor(cb) { this.cb = cb; this.q = []; observers.push(this); } observe() {} disconnect() { this.dead = true; } }
  const flush = () => { for (const o of observers) { if (o.dead || !o.q.length) continue; const q = o.q; o.q = []; o.cb(q); } };
  function textNode(v, parent) {
    let val = v;
    return {
      nodeType: 3, parentElement: parent, isConnected: true,
      get nodeValue() { return val; },
      set nodeValue(x) { val = String(x); for (const o of observers) if (!o.dead) o.q.push({ type: 'characterData', target: this, addedNodes: [] }); },
    };
  }
  let doc;
  const el = (tag, display) => ({
    tagName: tag, display, parentElement: null, offsetParent: {}, children: [], style: { setProperty() {} },
    matches: (s) => tag === 'P' && /(^|,)p(,|$)/.test(s), getAttribute: () => '', getRootNode() { return doc; },
    getClientRects: () => [{}], getBoundingClientRect: () => ({ top: 10, bottom: 40, left: 0, right: 100, width: 100, height: 30 }),
    appendChild(c) { this.children.push(c); }, previousElementSibling: null,
  });
  const body = el('BODY', 'block');
  const p = el('P', 'block'); p.parentElement = body;
  const nodes = [textNode('Hello world, this is a test.', p)];
  doc = {
    hidden: false, body, documentElement: body, head: { appendChild() {} }, querySelectorAll: () => [], getElementById: () => null,
    createTreeWalker: () => { let i = -1; return { nextNode: () => nodes[++i] || null }; },
    addEventListener() {}, removeEventListener() {},
    createElement: (t) => ({ tag: t, style: { setProperty() {} }, setAttribute() {}, remove() {}, append() {}, addEventListener() {}, dataset: {} }),
  };
  const timers = [];
  const ctx = vm.createContext({
    window: {}, document: doc, NodeFilter: { SHOW_TEXT: 4 }, innerHeight: 600, MutationObserver: MO,
    getComputedStyle: (e) => ({ display: e.display }), setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {},
    globalThis: { addEventListener() {} }, location: { origin: 'x', pathname: '/', search: '' },
  });
  const scan = vm.runInContext(P.pageBlockScanScript({}), ctx);
  const id = scan.blocks[0].id;
  vm.runInContext(P.pageApplyScript({ mode: 'replace', translations: [{ id, translation: 'Merhaba dünya, bu bir testtir.' }] }), ctx);
  flush();
  const st = ctx.window.__whisperPageTranslateState;
  assert.equal(st.originalValues.get(nodes[0]), 'Hello world, this is a test.');
  assert.equal(st.refs.get(id).active, true);
  vm.runInContext(P.pageViewScript('original'), ctx);
  assert.equal(nodes[0].nodeValue, 'Hello world, this is a test.', '"orijinali göster" çeviriyi göstermemeli');
  flush();
  // Sayfanın kendisi metni değiştirirse (SPA) blok yeniden taranmalı.
  nodes[0].nodeValue = 'Brand new server text.';
  flush();
  assert.equal(st.originalValues.get(nodes[0]), 'Brand new server text.');
  assert.equal(st.refs.get(id).active, false);
});

test('sayfa çevirisi: sağdan sola hedef dilde çeviri katmanına dir verilir', () => {
  const source = read('src/browser-page-translate.js');
  assert.match(source, /span\.dir = \/\^\(\?:ar\|fa\|he/);
});

test('çeviri zamanlayıcısı: devre kesici sonrası "yeniden dene" tüm izi değil pencereyi ister ve sayacı sıfırlar', async () => {
  const { BrowserTranslationScheduler } = require('../src/browser-translation-scheduler.js');
  const sentences = Array.from({ length: 200 }, (_, i) => ({
    id: `s${i}`, start: i * 10, end: i * 10 + 3, text: `Line number word${i} here.`,
    pieces: [{ cueId: `c${i}`, text: `Line number word${i} here.`, start: i * 10, end: i * 10 + 3 }],
  }));
  let calls = 0;
  let fail = true;
  const scheduler = new BrowserTranslationScheduler({
    maxConcurrent: 2, retryBaseMs: 5, retryMaxMs: 5, providerFailureThreshold: 3, maxAttempts: 5,
    context: { targetLanguage: 'tr' },
    translate: async (sentence) => {
      calls += 1;
      if (fail) { const error = new Error('HTTP 503'); error.httpStatus = 503; throw error; }
      return { text: `Satır ${sentence.id}.` };
    },
  });
  scheduler.setSentences(sentences);
  scheduler.updatePlayhead(0);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(scheduler.providerFailure, 'devre kesici açılmalıydı');
  fail = false; calls = 0;
  const queued = scheduler.retryFailed();
  assert.equal(scheduler.consecutiveProviderFailures, 0);
  await scheduler.whenIdle();
  assert.ok(queued < 40, `yeniden deneme ${queued} cümle kuyruğa aldı (tüm iz 200)`);
  assert.ok(calls < 40, `yeniden deneme ${calls} sağlayıcı çağrısı yaptı`);
  assert.equal(scheduler.completeTrack, false);
});

test('çeviri zamanlayıcısı: yeniden denemeden sonra tek geçici 503 devreyi yeniden açmaz', async () => {
  const { BrowserTranslationScheduler } = require('../src/browser-translation-scheduler.js');
  const sentences = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`, start: i * 2, end: i * 2 + 1, text: `Cue ${i}.`,
    pieces: [{ cueId: `c${i}`, text: `Cue ${i}.`, start: i * 2, end: i * 2 + 1 }],
  }));
  let mode = 'down';
  let flaky = 1;
  const scheduler = new BrowserTranslationScheduler({
    maxConcurrent: 1, retryBaseMs: 5, retryMaxMs: 5, providerFailureThreshold: 3, maxAttempts: 5,
    translate: async (sentence) => {
      if (mode === 'down' || (mode === 'flaky' && flaky-- > 0)) {
        const error = new Error('HTTP 503'); error.httpStatus = 503; throw error;
      }
      return { text: `TR ${sentence.text}` };
    },
  });
  scheduler.setSentences(sentences);
  scheduler.completeAll();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(scheduler.providerFailure);
  mode = 'flaky';
  scheduler.retryFailed();
  await scheduler.whenIdle();
  assert.equal(scheduler.providerFailure, '', 'tek 503 devreyi yeniden açtı');
  assert.equal(scheduler.results.size, 12);
});

test('PDF: sağdan sola satırlar okuma sırasıyla birleşir', () => {
  const { textItemsToLines } = require('../src/pdf-translate.js');
  const mk = (s, x) => ({ str: s, dir: 'rtl', width: 40, height: 10, transform: [10, 0, 0, 10, x, 700] });
  const lines = textItemsToLines([mk('مرحبا', 300), mk('بكم', 250), mk('جميعا', 200)], { pageWidth: 600, pageHeight: 800 });
  assert.deepEqual(lines.map((line) => line.text), ['مرحبا بكم جميعا']);
  const ltr = textItemsToLines([
    { str: 'Hello', width: 40, height: 10, transform: [10, 0, 0, 10, 100, 700] },
    { str: 'world', width: 40, height: 10, transform: [10, 0, 0, 10, 150, 700] },
  ], { pageWidth: 600, pageHeight: 800 });
  assert.deepEqual(ltr.map((line) => line.text), ['Hello world']);
});

// ---------------------------------------------------------------- tarayıcı

test('omnibox hesaplayıcı: tekli eksi üs almadan zayıf bağlanır', () => {
  const O = require('../src/browser-omnibox.js');
  assert.equal(O.evaluateArithmetic('-2^2'), -4);
  assert.equal(O.evaluateArithmetic('2^-1'), 0.5);
  assert.equal(O.evaluateArithmetic('2*-3'), -6);
  assert.equal(O.evaluateArithmetic('-2*3'), -6);
  assert.equal(O.evaluateArithmetic('2^3^2'), 512);
});

test('Markdown bağlantısı parantezleri kodlar', () => {
  const O = require('../src/browser-omnibox.js');
  assert.equal(O.markdownLink('Unbalanced', 'https://example.com/a)b'), '[Unbalanced](https://example.com/a%29b)');
  assert.equal(O.markdownLink('Wiki', 'https://en.wikipedia.org/wiki/Foo_(bar)'), '[Wiki](https://en.wikipedia.org/wiki/Foo_%28bar%29)');
});

test('arama katlaması I/İ/ı farkını yok sayar ve uzunluğu korur', () => {
  const { foldSearchText } = require('../src/browser-omnibox.js');
  assert.ok(foldSearchText('Interstellar (2014) - IMDb').includes(foldSearchText('interstellar')));
  assert.ok(foldSearchText('I think it is here.').includes(foldSearchText('i think')));
  assert.ok(foldSearchText('İstanbul').includes(foldSearchText('istanbul')));
  assert.ok(foldSearchText('ISPANAK').includes(foldSearchText('ıspanak')));
  for (const sample of ['İstanbul IŞIK', 'Interstellar', 'ığdır']) assert.equal(foldSearchText(sample).length, sample.length);
});

test('renderer arama filtreleri Türkçe yerel küçültme yerine foldSearch kullanır', () => {
  const renderer = read('src/renderer/renderer.js');
  assert.doesNotMatch(renderer, /toLocaleLowerCase\('tr'\)\.includes\(/);
  assert.match(renderer, /function foldSearch\(value\)/);
  for (const id of ['browserPlacesSearch', 'browserDownloadsSearch', 'historySearch', 'browserRemapSearch']) {
    assert.match(renderer, new RegExp(`foldSearch\\([^)]*${id}`), id);
  }
});

test('adres çubuğu: ilk satır yazılanın kendisidir; Enter bayat sonuçları kullanmaz', () => {
  const renderer = read('src/renderer/renderer.js');
  const fn = sliceBetween(renderer, 'async function refreshBrowserAddressResults()', 'async function useBrowserAddressResult(');
  const navigateAt = fn.indexOf("add({ action: 'navigate', value: query");
  for (const other of ["add({ action: 'calc'", "add({ action: 'tab'", "add({ action: 'url'"]) {
    assert.ok(navigateAt >= 0 && navigateAt < fn.indexOf(other), `${other} yazılan satırdan önce geliyor`);
  }
  assert.match(fn, /player\.browserAddressQuery = query/);
  assert.match(renderer, /const fresh = String\(\$\('browserAddress'\)\.value \|\| ''\)\.trim\(\) === player\.browserAddressQuery/);
});

test('sekme kısayolları ekrandaki (grup) sırasını izler', () => {
  const renderer = read('src/renderer/renderer.js');
  const fnSource = sliceBetween(renderer, 'function visibleBrowserTabsInDisplayOrder()', '\n}\n') + '\n}';
  const player = {
    browserTabs: [
      { id: 'A', group: { name: 'Work', color: 'blue' } },
      { id: 'B' },
      { id: 'C', group: { name: 'Work', color: 'blue' } },
    ],
  };
  const browserTabDisplayRows = () => [
    { kind: 'group' }, { kind: 'tab', tab: player.browserTabs[0] }, { kind: 'tab', tab: player.browserTabs[2] },
    { kind: 'tab', tab: player.browserTabs[1] },
  ];
  const visible = new Function('player', 'browserTabDisplayRows', `${fnSource}; return visibleBrowserTabsInDisplayOrder;`)(player, browserTabDisplayRows);
  assert.deepEqual(visible().map((tab) => tab.id), ['A', 'C', 'B']);
  const shortcut = sliceBetween(renderer, 'function runBrowserShortcut(', 'if (window.api.onBrowserEvent)');
  assert.equal((shortcut.match(/visibleBrowserTabsInDisplayOrder\(\)/g) || []).length, 2);
});

test('adres normalizasyonu: "kelime:" aramaları ve yerel ağ adresleri', () => {
  const main = read('src/main.js');
  const normalizeBrowserUrl = new Function(`${sliceBetween(main, 'function normalizeBrowserUrl(raw)', '\nfunction openExternalByPolicy')}; return normalizeBrowserUrl;`)();
  const search = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  assert.equal(normalizeBrowserUrl('Note: buy milk'), search('Note: buy milk'));
  assert.equal(normalizeBrowserUrl('Re: toplantı'), search('Re: toplantı'));
  assert.equal(normalizeBrowserUrl('192.168.1.1'), 'http://192.168.1.1/');
  assert.equal(normalizeBrowserUrl('10.0.0.1/admin'), 'http://10.0.0.1/admin');
  assert.equal(normalizeBrowserUrl('172.20.0.5:8080'), 'http://172.20.0.5:8080/');
  assert.equal(normalizeBrowserUrl('[fe80::1]'), 'http://[fe80::1]/');
  assert.equal(normalizeBrowserUrl('nas:5000'), 'http://nas:5000/');
  // Genel adresler https kalır; tehlikeli/dosya şemaları reddedilir.
  assert.equal(normalizeBrowserUrl('8.8.8.8'), 'https://8.8.8.8/');
  assert.equal(normalizeBrowserUrl('172.32.0.1'), 'https://172.32.0.1/');
  assert.equal(normalizeBrowserUrl('example.com:8080'), 'https://example.com:8080/');
  for (const blocked of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'C:\\Users\\a.mp4', 'about:blank', 'foo://bar']) {
    assert.equal(normalizeBrowserUrl(blocked), null, blocked);
  }
});

test('görsel kaydetme: uzantı sunucunun bildirdiği türden gelir', () => {
  const main = read('src/main.js');
  const fnSource = sliceBetween(main, "function browserImageFileName(rawUrl, contentType = '') {", 'async function saveBrowserContextImage(');
  const browserImageFileName = new Function('path', `${fnSource}; return browserImageFileName;`)(path);
  assert.equal(browserImageFileName('https://x/photo.jpg', 'image/webp'), 'photo.webp');
  assert.equal(browserImageFileName('https://x/i/abc', 'image/avif'), 'abc.avif');
  assert.equal(browserImageFileName('https://x/favicon', 'image/x-icon'), 'favicon.ico');
  assert.equal(browserImageFileName('https://x/a.jpeg', 'image/jpeg'), 'a.jpeg');
  assert.equal(browserImageFileName('https://x/a.png', ''), 'a.png');
});

test('sayfa ayarı sınırı: 201. sayfa "kaydedildi" diye dönüp sessizce atılmaz', () => {
  const { withBrowserPathProfileField, normalizeBrowserPathProfiles } = require('../src/browser-site-profiles.js');
  const profiles = {};
  for (let i = 0; i < 200; i += 1) profiles[`https://example.com/p${i}`] = { zoom: 1.1 };
  assert.equal(Object.keys(normalizeBrowserPathProfiles(profiles)).length, 200);
  const result = withBrowserPathProfileField(profiles, 'https://example.com/new-page', 'zoom', 1.2);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'limit');
  // Var olan sayfanın ayarı sınırda da güncellenebilir.
  assert.equal(withBrowserPathProfileField(profiles, 'https://example.com/p3', 'zoom', 1.3).ok, true);
});

// ---------------------------------------------------------------- kozmetik

test('CSS: geri dönüşsüz her var(--x) başvurusu tanımlı bir token\'a gider', () => {
  const css = ['src/renderer/styles.css', 'src/renderer/browser-features.css']
    .filter((rel) => fs.existsSync(path.join(ROOT, rel))).map(read).join('\n');
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const renderer = read('src/renderer/renderer.js') + read('src/renderer/index.html');
  for (const m of renderer.matchAll(/setProperty\(\s*['"](--[\w-]+)/g)) defined.add(m[1]);
  for (const m of renderer.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  const missing = new Set();
  for (const m of css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) if (!defined.has(m[1])) missing.add(m[1]);
  assert.deepEqual([...missing].sort(), [], `tanımsız token: ${[...missing].join(', ')}`);
});

test('CSS: açık tema kontrast düzeltmeleri yerinde', () => {
  const css = read('src/renderer/styles.css');
  assert.doesNotMatch(css, /\.browser-address-results \{[^}]*background: #11161b/);
  assert.match(css, /\.btn\.action-button-outline \{ color: var\(--text\); border: 1px solid var\(--border-strong\); \}/);
  assert.match(css, /html\[data-theme="light"\] \.player-layer \{\s*--player-text: var\(--text\);/);
  assert.match(css, /\.browser-find input \{[^}]*border: 1px solid var\(--border-strong\)/);
  const light = sliceBetween(css, 'html[data-theme="light"] {', '\n}');
  const token = (name) => light.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1].toLowerCase();
  assert.notEqual(token('--accent-hover'), token('--accent'), 'hover tonu vurguyla aynı');
});

test('EN arayüz: tarayıcı kabuğu metinleri çevrilir; sekme şeridi etiketi de', () => {
  const { entries } = require('../src/renderer/ui-locale.js');
  const en = new Map(entries);
  for (const key of ['WHISPER TARAYICI', "Adres yaz veya web'de ara", 'Adres gir', 'Web adresi veya arama', 'Bu kez engelle', 'Kapat (Esc)']) {
    assert.ok(en.has(key), key);
  }
  const locale = read('src/renderer/ui-locale.js');
  assert.match(locale, /element\.matches\(uiListContainers\)\s*\?\s*element\.parentElement\?\.closest\(ignored\)/);
});

test('dil rozeti yalnız bilinen dil kodlarını gösterir', () => {
  const renderer = read('src/renderer/renderer.js');
  const source = sliceBetween(renderer, 'const SUBTITLE_PATH_LANGUAGE_CODES', 'function updateSubtitleChips()');
  const langFromPath = new Function(`${source}; return langFromPath;`)();
  assert.equal(langFromPath('C:/x/film.tr.srt'), 'TR');
  assert.equal(langFromPath('C:/x/film.en.forced.srt'), 'EN');
  assert.equal(langFromPath('C:/x/film.pt-BR.srt'), 'PT');
  assert.equal(langFromPath('C:/x/Dune.Part.Two.srt'), '');
  assert.equal(langFromPath('C:/x/Movie.2019.HDR.srt'), '');
});

(async () => {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS  ${name}`);
    } catch (error) {
      console.log(`  FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }
  console.log(`audit-2026-09-22-browser-translate: ${passed}/${tests.length} test geçti`);
})();
