'use strict';
// R123 — sayfa arka planı, boş HTTP hata sayfası, sayfa bağlamlı hata mesajları,
// sekme avatarı ve sayfada bul sıralaması regresyonları.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const main = read('src/main.js');
const renderer = read('src/renderer/renderer.js');
const css = read('src/renderer/styles.css');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; } };

test('B1 sekme görünümünün temel rengi beyaz (arka plansız sayfalar okunur)', () => {
  assert.match(main, /view\.setBackgroundColor\('#ffffff'\);/);
  assert.doesNotMatch(main, /view\.setBackgroundColor\('#08090a'\)/);
});

test('B2 yalnız TAMAMEN boş gövdeli HTTP ≥ 400 ana belge hata ekranına döner', () => {
  assert.match(main, /wc\.on\('did-navigate', \(_navEvent, _navUrl, httpResponseCode\) => \{\s*tab\.mainHttpStatus = Number\(httpResponseCode\) \|\| 0;/);
  assert.match(main, /wc\.on\('did-stop-loading'[\s\S]{0,1500}if \(typeof maybeFlagEmptyHttpErrorPage === 'function'\) maybeFlagEmptyHttpErrorPage\(tab, view, wc\);/);
  const fn = main.slice(main.indexOf('function maybeFlagEmptyHttpErrorPage'));
  assert.match(fn, /if \(Number\(weight\) > 0 \|\| tab\.closing/);
  assert.match(fn, /tab\.generation !== generation/);
  assert.match(fn, /errorKind: 'http'/);
  assert.match(renderer, /event\.errorKind === 'http' \? 'http' : 'connection'/);
  assert.match(renderer, /httpEmpty \? 'Bu sayfa çalışmıyor' : 'Sayfa açılamadı'/);
});

test('B3 ana belge ağ hatası oynatma teşhis metnini değil sayfa mesajını gösterir', () => {
  assert.match(main, /const message = browserLoadErrorMessage\(code, description\);/);
  for (const code of ['-105', '-106', '-118']) assert.match(main, new RegExp(`Number\\(code\\) === ${code}`));
  const { translate } = require('../src/renderer/ui-locale');
  for (const key of ['Bu sayfa çalışmıyor', 'Sunucu yanıtı boş', 'Altyazı hedef dili',
    'İnternet bağlantısı yok. Bağlantınızı kontrol edip tekrar deneyin.']) {
    assert.notEqual(translate(key, 'en'), key, key);
  }
});

test('B4 sayfada bul: sayfa gözlemcisi ilk kesin sonuçtan sonra açılır', () => {
  const src = read('src/browser-page-find.js');
  assert.match(src, /if \(result\.finalUpdate && !observerOn\) setObserverEnabled\(true\);/);
  const findBody = src.slice(src.indexOf('find(value = {})'));
  assert.ok(findBody.indexOf('setObserverEnabled(true)') === -1 || findBody.indexOf('setObserverEnabled(true)') > findBody.indexOf('found-in-page'));
  assert.match(src, /if \(!continuing\) requestId = null;/);
  const { createBrowserPageFind } = require('../src/browser-page-find');
  const handlers = {}; const sent = []; let nextId = 0;
  const wc = { on: (n, f) => { handlers[n] = f; }, send: (c, p) => sent.push([c, p]), isDestroyed: () => false,
    findInPage: () => ++nextId, stopFindInPage: () => {} };
  const events = [];
  const pf = createBrowserPageFind(wc, (e) => events.push(e));
  const res = pf.find({ text: 'fox', token: 1 });
  assert.equal(res.ok, true);
  assert.equal(sent.filter(([c, p]) => c === 'browser:find-state' && p.active).length, 0, 'aramadan önce sayfaya IPC gitmemeli');
  handlers['found-in-page']({}, { requestId: res.requestId, matches: 3, activeMatchOrdinal: 1, finalUpdate: true });
  assert.equal(events[0].matches, 3);
  assert.equal(sent.filter(([c, p]) => c === 'browser:find-state' && p.active).length, 1);
});

test('D1–D4 sekme avatarı, soluklaşan başlık, × davranışı, hap adres alanı', () => {
  assert.match(renderer, /function browserTabAvatar\(tab\)/);
  assert.match(renderer, /favicon\.replaceWith\(avatar\)/);
  assert.match(css, /\.browser-tab-avatar \{/);
  assert.match(css, /mask-image: linear-gradient\(to right, currentColor calc\(100% - 18px\), transparent\);/);
  assert.match(css, /\.browser-tab:not\(\.active\):not\(:hover\):not\(:focus-within\) \.browser-tab-close \{ opacity: 0; \}/);
  assert.match(css, /\.browser-address-wrap \{ border-radius: 999px; \}/);
});

test('B5 başlık güncellemesi favicon/avatarı silmez', () => {
  assert.doesNotMatch(renderer, /if \(open\.textContent !== label\) open\.textContent = label;/);
  assert.match(renderer, /if \(labelEl\.textContent !== label\) labelEl\.textContent = label;/);
  assert.match(renderer, /avatar\.dataset\.faviconFailed = tab\.favicon;/);
});

if (!process.exitCode) console.log(`browser-report123-regressions: ${passed} test geçti`);
