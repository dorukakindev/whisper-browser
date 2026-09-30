'use strict';
// Tarayıcı arayüzü tur 1–2 düzeltmelerinin regresyon kilitleri. Fonksiyonlar
// kaynaktan süslü parantez eşlenerek kesilir ve vm içinde saplanmış bağımla çalışır.
// Özellikle 1. test master'da (f2ac573) KIRMIZIDIR: palet bağlam eşleşmesi ham
// sekme nesnesiyle yapıldığı için hiçbir komut çalışmıyordu. Eski birim testi
// eşleştiriciye hazır {tabId} nesnesi verdiği için bunu yakalamıyordu.

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const renderer = read('src/renderer/renderer.js');
const helpers = read('src/renderer/renderer-helpers.js');

function extractFunction(source, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = re.exec(source);
  assert.ok(match, `${name} kaynakta bulunamadı`);
  // Parametre listesindeki varsayılan nesneleri ({ scroll = true } = {}) atla.
  let paren = 1;
  let j = match.index + match[0].length;
  for (; j < source.length && paren; j++) {
    if (source[j] === '(') paren++;
    else if (source[j] === ')') paren--;
  }
  const i = source.indexOf('{', j);
  let depth = 0;
  let quote = '';
  for (let k = i; k < source.length; k++) {
    const ch = source[k];
    if (quote) {
      if (ch === '\\') { k++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    // Yorumlardaki kesme işaretleri ("sekme'nin") dize başlangıcı sanılmasın.
    if (ch === '/' && source[k + 1] === '/') { k = source.indexOf('\n', k); if (k < 0) break; continue; }
    if (ch === '/' && source[k + 1] === '*') { k = source.indexOf('*/', k + 2) + 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(match.index, k + 1);
  }
  throw new Error(`${name} kapanışı bulunamadı`);
}

let passed = 0;
async function test(title, fn) {
  try { await fn(); passed++; console.log(`  ok  ${title}`); }
  catch (error) { console.error(`  FAIL ${title}\n${error.stack}`); process.exitCode = 1; }
}

(async () => {
  // ---- 1. Komut paleti gerçek sekme nesnesiyle komut çalıştırır
  await test('komut paleti gerçek sekme nesnesiyle (tabId alanı yok) komutu çalıştırır', async () => {
    const palette = require('../src/browser-command-palette.js');
    let ran = 0;
    const signals = [];
    const tab = { id: 'tab-1', generation: 3, mediaId: '' }; // newBrowserTabState biçimi: `id`, `tabId` yok
    const ctx = vm.createContext({
      window: { BrowserCommandPalette: palette },
      browserCommandPaletteState: {
        selected: 0,
        context: { tabId: 'tab-1', generation: 3, mediaId: '' },
        results: [{ id: 'x', enabled: true, run: () => { ran++; } }],
      },
      browserTabState: () => tab,
      browserWorkflowStepForCommand: () => null,
      browserWorkflowRecorder: null,
      setBrowserSignal: (text) => signals.push(text),
      closeBrowserCommandPalette: () => {},
    });
    vm.runInContext(`${extractFunction(helpers, 'currentBrowserWorkflowContext')}
      ${extractFunction(helpers, 'executeBrowserCommandPalette')}
      this.exec = executeBrowserCommandPalette;`, ctx);
    await ctx.exec(0);
    assert.equal(ran, 1, `komut çalışmadı; sinyal: ${signals.join(' | ')}`);

    // Sekme değiştiyse (başka generation) çalışmamalı.
    tab.generation = 4;
    ran = 0;
    await ctx.exec(0);
    assert.equal(ran, 0, 'eski bağlamla komut çalıştı');
  });

  // ---- 2. "Sağdaki sekmeleri kapat" ekran sırasını izler
  await test('sağdaki sekmeler grup varken ekrandaki sırayla hesaplanır', () => {
    const group = { name: 'g', color: 'blue' };
    const player = { browserTabs: [
      { id: 'A' }, { id: 'B', group }, { id: 'C' }, { id: 'D', group }, { id: 'E', pinned: true },
    ] };
    const ctx = vm.createContext({
      player,
      window: { BrowserTabLayout: { normalizeTabGroup: (g) => (g && g.name ? g : null) } },
    });
    vm.runInContext(`${extractFunction(helpers, 'browserTabsInScreenOrder')}
      ${extractFunction(helpers, 'browserTabsRightOf')}
      this.order = browserTabsInScreenOrder; this.right = browserTabsRightOf;`, ctx);
    // vm realm'inden dönen diziler spread ile bu realm'e taşınır; aksi
    // halde deepStrictEqual, Array.prototype farkı yüzünden reddeder.
    assert.deepEqual([...ctx.order().map((t) => t.id)], ['A', 'B', 'D', 'C', 'E']);
    assert.deepEqual([...ctx.right('D').map((t) => t.id)], ['C'], 'D\'nin sağında yalnız C var (E sabit)');
    assert.deepEqual([...ctx.right('C').map((t) => t.id)], [], 'C\'nin sağında kapatılabilir sekme yok');
    assert.deepEqual([...ctx.right('A').map((t) => t.id)], ['B', 'D', 'C']);
  });

  // ---- 3. Bul çubuğu aynı belge içi gezinmede sıfırlanmaz
  await test('bul çubuğu SPA/hash gezinmesinde kapanmaz, tam gezinmede kapanır', () => {
    const { createBrowserPageFind } = require('../src/browser-page-find');
    class Contents extends EventEmitter {
      isDestroyed() { return false; } send() {} stopFindInPage() {} findInPage() { return 1; }
    }
    const wc = new Contents();
    const events = [];
    createBrowserPageFind(wc, (e) => events.push(e), () => true);
    wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    assert.equal(events.filter((e) => e.type === 'find-reset').length, 0, 'aynı belge gezinmesi bul çubuğunu kapattı');
    wc.emit('did-start-navigation', {}, 'https://x', true, true); // eski imza: inPlace=true
    assert.equal(events.filter((e) => e.type === 'find-reset').length, 0, 'eski imzada inPlace yok sayıldı');
    wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    assert.equal(events.filter((e) => e.type === 'find-reset').length, 1);
  });

  // ---- 4. Vekil menü öğeleri
  await test('vekil menü öğesi: devre dışı hedefte geri bildirim, gizli summary\'de yedek eylem', () => {
    const signals = [];
    const clicks = [];
    let fallbackCalls = 0;
    const els = {
      enabled: { tagName: 'BUTTON', disabled: false, getAttribute: () => null, click: () => clicks.push('enabled'), getClientRects: () => [1] },
      off: { tagName: 'BUTTON', disabled: true, title: 'Video yok', getAttribute: () => null, click: () => clicks.push('off'), getClientRects: () => [1] },
      playerLayoutQuick: { tagName: 'SUMMARY', disabled: false, getAttribute: () => null, click: () => clicks.push('summary'), getClientRects: () => [] },
    };
    const ctx = vm.createContext({
      $: (id) => els[id] || null,
      player: { workspaceMode: 'browser' },
      uiText: (s) => s,
      setBrowserSignal: (text) => signals.push(text),
      toggleDrawerAt: () => { fallbackCalls++; },
    });
    vm.runInContext(`const browserProxyFallbacks = { playerLayoutQuick: () => toggleDrawerAt(null, '.player-layout-section .vm') };
      ${extractFunction(renderer, 'browserProxyTargetState')}
      ${extractFunction(renderer, 'runBrowserProxyAction')}
      this.run = (id) => { const b = { dataset: { browserProxy: id } }; runBrowserProxyAction(b, browserProxyTargetState(b)); };`, ctx);
    ctx.run('enabled');
    assert.deepEqual(clicks, ['enabled']);
    ctx.run('off');
    assert.deepEqual(clicks, ['enabled'], 'devre dışı hedef tıklandı');
    assert.match(signals.at(-1) || '', /Video yok/, 'devre dışı hedef için neden söylenmedi');
    ctx.run('playerLayoutQuick');
    assert.equal(fallbackCalls, 1, 'görünmeyen summary için yedek eylem çalışmadı');
    assert.ok(!clicks.includes('summary'), 'görünmeyen summary tıklandı');
    ctx.run('missing');
    assert.equal(clicks.length, 1);
  });

  // ---- 5. Videoyu indir: açık YouTube adresi doldurulur, diğerleri dokunulmaz
  await test('videoyu indir yalnız YouTube sayfasında adres alanını doldurur', () => {
    const input = { value: '', events: 0, dispatchEvent() { this.events++; } };
    let current = 'https://www.youtube.com/watch?v=abc';
    const ctx = vm.createContext({
      $: (id) => (id === 'playerYtUrl' ? input : null),
      currentBrowserYoutubeUrl: () => current,
      Event: class { constructor(type) { this.type = type; } },
    });
    vm.runInContext(`${extractFunction(renderer, 'prefillYoutubeUrlFromBrowser')} this.fill = prefillYoutubeUrlFromBrowser;`, ctx);
    ctx.fill();
    assert.equal(input.value, current);
    assert.equal(input.events, 1);
    current = '';
    input.value = 'https://youtu.be/elle';
    ctx.fill();
    assert.equal(input.value, 'https://youtu.be/elle', 'YouTube dışı sayfada kullanıcının adresi silindi');
  });

  // ---- 6. Uygulama diyaloğu açıkken tarayıcı kısayolları arkada çalışmaz
  await test('uygulama diyaloğu açıkken runBrowserShortcut hiçbir şey yapmaz', () => {
    const calls = [];
    const record = (name) => () => calls.push(name);
    const ctx = vm.createContext({
      _activeModal: { id: 'appDialog' },
      document: { querySelector: () => null },
      closeBrowserTab: record('closeBrowserTab'), createBrowserTab: record('createBrowserTab'),
      reopenClosedBrowserTab: record('reopen'), openBrowserCommandPalette: record('palette'),
      player: { browserActiveTabId: 't1' },
    });
    vm.runInContext(`${extractFunction(renderer, 'runBrowserShortcut')} this.run = runBrowserShortcut;`, ctx);
    for (const key of ['w', 't', 'k']) assert.equal(ctx.run(key), true);
    assert.deepEqual(calls, [], `diyalog altında kısayol çalıştı: ${calls.join(', ')}`);
  });

  // ---- 7. Kaynak düzeyinde sözleşmeler (davranışı vm'de kurmak pahalı olanlar)
  await test('kaynak sözleşmeleri: Esc yayılımı, menü araması sıfırlama, okluzyon', () => {
    assert.match(renderer, /event\.key === 'Escape'\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); closeBrowserCommandPalette\(\); \}/,
      'palette Esc diğer panelleri de kapatıyor');
    assert.match(renderer, /const tabMenuOpen = [^\n]*browserTabMenuEl/, 'sekme sağ tık menüsü okluzyona katılmıyor');
    assert.match(renderer, /\$\('browserMoreMenu'\)\?\.addEventListener\('toggle'[\s\S]{0,200}moreSearch\.value = ''/,
      '⋯ menüsü kapanınca arama sıfırlanmıyor');
    assert.match(helpers, /function closeBrowserTransientPanels\(\)[\s\S]{0,300}setBrowserQrOpen\(false\)/,
      'mod değişiminde QR/Yer imleri/palet kapanmıyor');
    const css = read('src/renderer/browser-chrome.css');
    assert.match(css, /\.player-layer \.browser-nav-button > \.browser-stop-icon \{ display: none; \}/,
      'durdur ikonu boşta görünür (özgüllük kuralı eksik)');
  });

  // ---- 8. Yeni sekme sayfası sıralaması (saf modül)
  await test('NTP hızlı erişim: yer imleri önce, geçmiş frecency ile, tekil ve gizlenenler hariç', () => {
    const model = require('../src/browser-address-model.js');
    const now = Date.parse('2026-09-28T12:00:00Z');
    const day = 864e5;
    const places = {
      bookmarks: [{ url: 'https://github.com/', title: 'GitHub' }, { url: 'javascript:alert(1)', title: 'x' }],
      history: [
        { url: 'https://old.example/', visits: 50, visitedAt: now - 200 * day },
        { url: 'https://www.youtube.com/', visits: 40, visitedAt: now },
        { url: 'https://github.com', visits: 9, visitedAt: now }, // yer imiyle aynı adres
        { url: 'https://news.ycombinator.com/', visits: 3, visitedAt: now - day },
        { url: 'https://hidden.example/', visits: 99, visitedAt: now },
      ],
    };
    const tiles = model.ntpQuickTiles(places, { hidden: ['https://hidden.example'], limit: 8, now });
    assert.deepEqual(tiles.map((t) => t.url), [
      'https://github.com/', 'https://www.youtube.com/', 'https://news.ycombinator.com/', 'https://old.example/',
    ]);
    assert.equal(tiles[0].bookmark, true);
    assert.equal(model.ntpQuickTiles(places, { limit: 2, now }).length, 2);
  });

  await test('NTP izlemeye devam et: yarım web/YouTube kayıtları, en son izlenen önce', () => {
    const model = require('../src/browser-address-model.js');
    const items = model.ntpContinueItems([
      { key: 'a', type: 'youtube', sourceRef: 'https://youtu.be/a', position: 600, duration: 1200, lastWatched: 10 },
      { key: 'b', type: 'youtube', sourceRef: 'https://youtu.be/b', position: 900, duration: 900, completed: true, lastWatched: 30 },
      { key: 'c', type: 'local', sourceRef: 'C:/film.mp4', position: 500, duration: 5000, lastWatched: 40 },
      { key: 'd', type: 'browser', sourceRef: 'https://site/v', position: 5, duration: 100, lastWatched: 50 },
      { key: 'e', type: 'browser', sourceRef: 'https://site/w', position: 120, duration: 0, lastWatched: 20 },
    ]);
    assert.deepEqual(items.map((i) => i.key), ['e', 'a'], 'bitmiş, yerel ve baştaki birkaç saniye hariç tutulmalı');
    assert.equal(items[1].progress, 0.5);
    assert.equal(items[1].remaining, 600);
    assert.equal(items[0].progress, 0, 'süre bilinmiyorsa ilerleme 0');
  });

  // ---- 9. Oynatıcı/ayarlar turu
  await test('özel oynatma hızı (1.3×) yerel kayıtta düşürülmez, aralık dışı reddedilir', () => {
    const { sanitizeSettings } = require('../src/settings-security.js');
    // Yerel kayıt yolu (allowSecrets=true) hoşgörülüdür: geçersiz alan atlanır.
    const local = (ui) => sanitizeSettings({ ui }, { allowSecrets: true }).ui;
    assert.equal(local({ playerSpeed: '1.3' }).playerSpeed, '1.3', 'özel hız kayıttan düştü');
    assert.equal(local({ playerSpeed: '1' }).playerSpeed, '1');
    assert.equal(local({ playerSpeed: '9' }).playerSpeed, undefined, 'aralık dışı hız kaydedildi');
  });

  await test('iş sürerken yalnız iş seçenekleri kilitlenir', () => {
    const controls = {};
    const $ = (id) => (controls[id] ||= { id, disabled: false, setAttribute() {}, classList: { toggle() {} } });
    const ctx = vm.createContext({
      $, state: { running: true, queueRunning: false },
      PERSIST_VALUE_CONTROLS: ['model', 'playerVolume', 'uiLocale', 'subSize', 'browserOverlayScale', 'stCardScale', 'translateTo'],
      PERSIST_CHECKBOX_CONTROLS: ['diarize', 'playerAutoNext', 'browserAdblockEnabled'],
    });
    vm.runInContext(`${extractFunction(renderer, 'syncProcessingControlState')} syncProcessingControlState();`, ctx);
    for (const id of ['model', 'translateTo', 'diarize', 'pickVideosBtn']) assert.equal(controls[id].disabled, true, `${id} kilitlenmeli`);
    for (const id of ['playerVolume', 'uiLocale', 'subSize', 'browserOverlayScale', 'stCardScale', 'playerAutoNext', 'browserAdblockEnabled']) {
      // Kilitlenmeyen kontroller $'ye hiç sorgulanmadığından stub oluşmaz;
      // "dokunulmamış" ile "disabled=false" aynı doğru sonucu verir.
      assert.ok(!controls[id]?.disabled, `${id} iş sürerken kilitlenmemeli`);
    }
  });

  await test('kaynak sözleşmeleri: PDF okuyucu ve oynatıcı klavyesi', () => {
    assert.match(renderer, /if \(player\.pdfReader\) \{\s*if \(e\.key === 'Escape'/, 'PDF açıkken oynatıcı kısayolları çalışıyor');
    assert.match(renderer, /pagesRoot\.insertBefore\(article, after\)/, 'PDF sayfaları sıraya göre eklenmiyor');
    assert.match(renderer, /if \(reader\.translating\) return;/, 'PDF çevirisi iki kez başlatılabiliyor');
    assert.match(renderer, /\$\('browserWorkspace'\)\?\.classList\.toggle\('hidden', player\.workspaceMode !== 'browser'\)/,
      'PDF kapanınca tarayıcı alanı geri açılmıyor');
    assert.match(renderer, /if \(player\.holdingSpeed\) return;/, 'basılı tutma 2× hızı kayda yazılıyor');
    assert.match(renderer, /let _cueSaveBusy = false;/, 'K ile kaydetme yeniden girişe açık');
  });

  await test('kütüphane: aynı dalda üst üste iki tıklamada eski yetki bekleyişi yenisini ezmez', async () => {
    // openWatchLibraryItem else-dalı eskiden openIntent'i artırmadan yakalıyordu:
    // iki hızlı tıklama aynı intent'i paylaşıyor, önce çözülen değil son çözülen
    // kazanıyordu. Düzeltme ++ ile her tıklamayı eski bekleyişleri geçersiz kılar.
    const gates = new Map();
    const opened = [];
    const ctx = vm.createContext({
      player: { openIntent: 0 },
      window: { api: { authorizeWatchItem: (key) => new Promise((resolve) => gates.set(key, resolve)) } },
      openLocalMedia: (path) => opened.push(path),
      logLine: () => {},
    });
    vm.runInContext(`${extractFunction(renderer, 'openWatchLibraryItem')} globalThis.openItem = openWatchLibraryItem;`, ctx);
    const pA = ctx.openItem({ type: 'local', key: 'a', localPath: '/a.mp4', sourceRef: '/a.mp4' }, 0);
    const pB = ctx.openItem({ type: 'local', key: 'b', localPath: '/b.mp4', sourceRef: '/b.mp4' }, 0);
    await new Promise((resolve) => setImmediate(resolve));
    gates.get('b')({ ok: true, path: '/b.mp4' });
    await pB;
    gates.get('a')({ ok: true, path: '/a.mp4' });
    await pA;
    assert.deepEqual([...opened], ['/b.mp4'], 'eski tıklamanın geç dönen yetkisi yeni seçimi ezmemeli');
  });

  await test('PDF: çeviri bitince okuyucu değişmişse bile düğmeler geri açılır', async () => {
    // Eski finally yalnız player.pdfReader === reader iken düğmeleri açıyordu;
    // eski belgenin çevirisi sürerken yeni PDF açılınca düğmeler kilitli kalıyordu.
    const controls = {};
    const $ = (id) => (controls[id] ||= { disabled: false });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const reader = { pdf: {}, translating: false };
    const ctx = vm.createContext({
      $, player: { pdfReader: reader },
      translateVisiblePdfPagesNow: async () => { await gate; },
    });
    vm.runInContext(`${extractFunction(renderer, 'translateVisiblePdfPages')} globalThis.translatePages = translateVisiblePdfPages;`, ctx);
    const pending = ctx.translatePages(false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controls.pdfTranslateAll.disabled, true, 'çeviri sürerken düğmeler kilitli');
    ctx.player.pdfReader = { pdf: {}, translating: false };
    release();
    await pending;
    assert.equal(controls.pdfTranslateVisible.disabled, false, 'okuyucu değişse de düğmeler açık kalmalı');
    assert.equal(controls.pdfTranslateAll.disabled, false);

    // Yeni okuyucu kendi çevirisini yürütüyorsa eski finally onu ezmese de
    // kilidi kaldırmaz.
    const controls2 = {};
    const $2 = (id) => (controls2[id] ||= { disabled: false });
    let release2;
    const gate2 = new Promise((resolve) => { release2 = resolve; });
    const ctx2 = vm.createContext({
      $: $2, player: { pdfReader: { pdf: {}, translating: false } },
      translateVisiblePdfPagesNow: async () => { await gate2; },
    });
    vm.runInContext(`${extractFunction(renderer, 'translateVisiblePdfPages')} globalThis.translatePages = translateVisiblePdfPages;`, ctx2);
    const pending2 = ctx2.translatePages(true);
    await new Promise((resolve) => setImmediate(resolve));
    ctx2.player.pdfReader = { pdf: {}, translating: true };
    release2();
    await pending2;
    assert.equal(controls2.pdfTranslateVisible.disabled, true, 'yeni okuyucu çeviri yürütürken kilidi kalmalı');
  });

  await test('PDF: yerini alan okuyucunun durum satırı eski çeviriyle ezilmez', async () => {
    // Çeviri döngüsü pdfHash bekçisiyle durur ama son durum yazısı bekçisizdi:
    // kapatılan/değişen belgenin sonucu yeni belgenin satırına yazılıyordu.
    const statusLog = [];
    const buttons = {};
    const player = { pdfReader: { pdf: { numPages: 4 }, pdfHash: 'h1', pages: new Map(), currentPage: 1 } };
    const reader = player.pdfReader;
    const ctx = vm.createContext({
      $: (id) => (buttons[id] ||= { disabled: false, value: 'tr' }),
      PDF_TRANSLATE_ALL_CONFIRM_PAGES: 40,
      player,
      window: { api: { translatePdfPages: async () => { player.pdfReader = { pdf: { numPages: 4 }, pdfHash: 'h2', pages: new Map() }; return { ok: true }; } } },
      extractPdfReaderPage: async () => {},
      renderPdfReaderPage: async () => {},
      renderPdfTranslation: () => {},
      updatePdfReaderProgress: () => {},
      pdfReaderSetStatus: (text) => statusLog.push(text),
    });
    vm.runInContext(`${extractFunction(renderer, 'translateVisiblePdfPagesNow')} globalThis.translateNow = translateVisiblePdfPagesNow;`, ctx);
    await ctx.translateNow(reader, true);
    assert.deepEqual([...statusLog], ['Kitap çevriliyor… (0/4)'],
      'okuyucu değiştiyse eski çevirinin ilerleme/sonuç satırı yazılmamalı');
  });

  console.log(`browser-ui-regressions-r3: ${passed} test geçti`);
})();
