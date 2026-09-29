'use strict';
// fix/browser-menu-ui-polish önerisi: vekil menü tıklaması, menü araması ve
// tarayıcıdan YouTube adresi öndoldurma davranışlarının jsdom kilidi.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');

function sliceBetween(source, start, end) {
  const i = source.indexOf(start);
  assert.ok(i >= 0, `dilim başı bulunamadı: ${start}`);
  const j = source.indexOf(end, i);
  assert.ok(j > i, `dilim sonu bulunamadı: ${end}`);
  return source.slice(i, j);
}
function sliceFunction(source, signature) {
  const i = source.indexOf(signature);
  assert.ok(i >= 0, signature);
  const j = source.indexOf('\nfunction ', i + signature.length);
  assert.ok(j > i, signature);
  return source.slice(i, j);
}

// ---- 1. prefillYoutubeUrlFromBrowser + currentBrowserYoutubeUrl -------------
{
  const block = sliceBetween(renderer,
    'function prefillYoutubeUrlFromBrowser() {',
    '\nfunction updateBrowserWhisperActions()');
  const ytIdSrc = sliceFunction(renderer, 'function youtubeVideoId(url) {');
  const factory = new Function('$', 'player', 'browserTabState', 'Event',
    `${ytIdSrc}\n${block}\nreturn { prefillYoutubeUrlFromBrowser, currentBrowserYoutubeUrl };`);
  const input = { value: '', events: 0, dispatchEvent() { this.events += 1; } };
  const $ = (id) => (id === 'playerYtUrl' ? input : null);
  const player = { workspaceMode: 'browser', browserPageUrl: 'https://www.youtube.com/watch?v=ABCDEFGHIJK', browserActiveTabId: 7 };
  const { prefillYoutubeUrlFromBrowser, currentBrowserYoutubeUrl } = factory($, player, () => null, function Event() {});

  assert.equal(currentBrowserYoutubeUrl(), 'https://www.youtube.com/watch?v=ABCDEFGHIJK',
    'açık YouTube sayfası kurallı watch adresine indirgenir');
  prefillYoutubeUrlFromBrowser();
  assert.equal(input.value, 'https://www.youtube.com/watch?v=ABCDEFGHIJK');
  assert.equal(input.events, 1, 'input olayı bir kez ateşlenir');

  const first = input.value; input.events = 0;
  prefillYoutubeUrlFromBrowser();
  assert.equal(input.events, 0, 'aynı adres ikinci kez yazılmaz (olay yok)');
  assert.equal(input.value, first);

  player.browserPageUrl = 'https://example.com/v';
  input.value = 'https://manuel.example/x';
  prefillYoutubeUrlFromBrowser();
  assert.equal(input.value, 'https://manuel.example/x',
    'YouTube dışı sayfada alan değişmez');

  player.browserPageUrl = 'https://www.youtube.com/watch?v=ABCDEFGHIJK';
  player.workspaceMode = 'player';
  input.value = '';
  prefillYoutubeUrlFromBrowser();
  assert.equal(input.value, '', 'oynatıcı modunda tarayıcı adresi doldurmaz');
}

// ---- 2. runBrowserProxyAction ----------------------------------------------
{
  const block = sliceBetween(renderer,
    'const browserProxyFallbacks = {',
    "\nfor (const id of ['browserMoreMenu', 'appModeMenu', 'appMenu', 'browserTranslateMenu'])");
  const factory = new Function('player', 'setBrowserSignal', 'uiText', 'toggleDrawerAt', '$$',
    `${block}\nreturn { runBrowserProxyAction, browserProxyTargetState };`);
  const signals = [];
  const drawerCalls = [];
  const player = { workspaceMode: 'browser' };
  const { runBrowserProxyAction } = factory(
    player,
    (text, detected, opts) => signals.push({ text, detected, opts }),
    (s) => s,
    (...args) => drawerCalls.push(args),
    () => []);

  const clicks = [];
  const btn = { dataset: { browserProxy: 'playerLayoutQuick' } };
  const summary = { tagName: 'SUMMARY', getClientRects: () => [], click() { clicks.push('summary'); } };
  const plainBtn = { tagName: 'BUTTON', getClientRects: () => [{}], click() { clicks.push('button'); } };

  runBrowserProxyAction(btn, { target: null, unavailable: false, reason: '' });
  assert.deepEqual(signals, [], 'hedef yokken sessiz döner');

  runBrowserProxyAction(btn, { target: plainBtn, unavailable: true, reason: 'Önce video aç' });
  assert.equal(signals.length, 1, 'devre dışı hedef sinyal verir');
  assert.match(signals[0].text, /Şu an kullanılamıyor: Önce video aç/);
  assert.equal(clicks.length, 0, 'devre dışı hedef tıklanmaz');

  signals.length = 0;
  player.workspaceMode = 'player';
  runBrowserProxyAction(btn, { target: plainBtn, unavailable: true, reason: 'x' });
  assert.equal(signals.length, 0, 'tarayıcı modu dışında sinyal yazılmaz');
  player.workspaceMode = 'browser';

  runBrowserProxyAction(btn, { target: summary, unavailable: false, reason: '' });
  assert.equal(drawerCalls.length, 1, 'görünmeyen <summary> fallback yoluna düşer');
  assert.deepEqual(drawerCalls[0], [null, '.player-layout-section .vm']);
  assert.equal(clicks.length, 0, 'görünmeyen summary tıklanmaz');

  runBrowserProxyAction(btn, { target: plainBtn, unavailable: false, reason: '' });
  assert.deepEqual(clicks, ['button'], 'normal hedef doğrudan tıklanır');
}

// ---- 3. browserMoreSearch: filtre, boş durum, Enter, kapanışta sıfırlama ----
{
  const dom = new JSDOM(`<!doctype html><details id="browserMoreMenu"><div class="browser-more-popover">
    <input id="browserMoreSearch" type="search">
    <div class="browser-more-quick" role="group"><button id="q1">Hızlı eylem</button></div>
    <div class="browser-menu-separator"></div>
    <details class="browser-more-sub"><summary>Sayfa</summary>
      <button role="menuitem" id="mQr">Sayfa QR kodunu göster</button>
      <button role="menuitem" id="mHide">Sayfada öğe gizle…</button>
    </details>
    <details class="browser-more-sub"><summary>Video</summary>
      <button role="menuitem" id="mDl">Videoyu indir</button>
    </details>
  </div></details>`);
  const doc = dom.window.document;
  const block = sliceBetween(renderer,
    "const moreSearch = $('browserMoreSearch');",
    "\nif ($('browserReadLater'))");
  const foldSrc = sliceFunction(renderer, 'function foldSearch(value) {');
  // Blok üst-düzey bağlama kodudur: `const moreSearch = $(...)` + dinleyiciler.
  // foldSearch fonksiyonu blok içinde kullanıldığı için gövdenin başına eklenir.
  new Function('$', 'uiText', 'document',
    `${foldSrc}\n${block}`)(
    (id) => doc.getElementById(id),
    (s) => s,
    doc);

  const input = doc.getElementById('browserMoreSearch');
  const menu = doc.getElementById('browserMoreMenu');
  const popover = input.closest('.browser-more-popover');
  const subs = [...popover.querySelectorAll('.browser-more-sub')];
  const visibleItems = () => [...popover.querySelectorAll('[role^="menuitem"]')]
    .filter((el) => !el.classList.contains('hidden'));

  // 'zzz' → eşleşme yok: boş durum satırı, hızlı eylem ve tüm gruplar gizli.
  input.value = 'zzz';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(visibleItems().length, 0);
  const emptyRow = popover.querySelector('.browser-more-empty');
  assert.ok(emptyRow && !emptyRow.classList.contains('hidden'), 'eşleşme yok satırı görünür');
  assert.match(emptyRow.textContent, /Menüde eşleşen komut yok/);
  assert.ok(popover.querySelector('.browser-more-quick').classList.contains('hidden'),
    'arama sırasında hızlı eylem gizlenir');
  assert.ok(subs.every((s) => s.classList.contains('hidden')), 'tüm gruplar gizlenir');

  // 'qr' → title/aria dahil aramayla QR öğesi bulunur; Enter ilk sonucu çalıştırır.
  input.value = 'qr';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.deepEqual(visibleItems().map((el) => el.id), ['mQr'], 'yalnız QR öğesi kalır');
  let clicked = null;
  doc.getElementById('mQr').addEventListener('click', () => { clicked = 'mQr'; });
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.equal(clicked, 'mQr', 'Enter ilk eşleşeni çalıştırır');
  assert.ok(emptyRow.classList.contains('hidden'), 'sonuç varken boş durum gizli');

  // Menü kapanınca arama sıfırlanır ve tüm öğeler geri gelir.
  menu.open = false;
  menu.dispatchEvent(new dom.window.Event('toggle'));
  assert.equal(input.value, '', 'kapanışta arama kutusu sıfırlanır');
  assert.equal(visibleItems().length, 3, 'tüm öğeler tekrar görünür');
  assert.ok(subs.every((s) => !s.classList.contains('hidden')), 'gruplar geri döner');
  assert.ok(subs.every((s) => s.open === false), 'gruplar kapalı duruma döner');
}

console.log('browser-menu-proxy: YouTube öndoldurma, vekil tıklama ve menü araması kilitlendi.');
