'use strict';
// R239: sekme önizleme kartı native WebContentsView'in altına kayıp kırpılmamalı —
// alt kenarı #browserViewSlot üst çizgisini aşamaz.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HELPERS = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer-helpers.js'), 'utf8');
const FN_SRC = HELPERS.slice(
  HELPERS.indexOf('function showBrowserTabPreview'),
  HELPERS.indexOf('// --- R153 dilim-3'),
);

function makeHarness({ slotTop = 120, cardW = 300, cardH = 60, compactW = 180, compactH = 26 } = {}) {
  const appended = [];
  const mkEl = () => {
    const el = {
      children: [],
      style: {},
      textContent: '',
      className: '',
      // Sınıf değişince ölçüler güncellenir — kompakt varyant url/rozet
      // satırlarını gizlediği için kart hem daralır hem kısalır.
      get offsetWidth() { return /\bis-compact\b/.test(el.className) ? compactW : cardW; },
      get offsetHeight() { return /\bis-compact\b/.test(el.className) ? compactH : cardH; },
      setAttribute() {},
      append(...nodes) { el.children.push(...nodes); },
      appendChild(node) { el.children.push(node); },
    };
    return el;
  };
  const slot = slotTop === null ? null : { getBoundingClientRect: () => ({ top: slotTop }) };
  const ctx = vm.createContext({
    document: {
      createElement: () => mkEl(),
      body: { appendChild: (el) => appended.push(el) },
    },
    window: { innerWidth: 1024, innerHeight: 768, UiLocale: null },
    $: (id) => (id === 'browserViewSlot' ? slot : null),
    browserTabState: () => ({ id: 't1', title: 'Sayfa', url: 'https://x.dev' }),
    hideBrowserTabPreview: () => {},
    Number, String, Math, setTimeout: () => 0, clearTimeout: () => {},
  });
  vm.runInContext(`${FN_SRC}; globalThis.__show = showBrowserTabPreview;`, ctx);
  return { ctx, appended };
}

const anchor = { getBoundingClientRect: () => ({ left: 40, bottom: 42 }) };

test('önizleme kartı alt kenarı slot üst çizgisini aşmaz (normal yerleşim)', () => {
  const { ctx, appended } = makeHarness({ slotTop: 120, cardH: 60 });
  ctx.__show('t1', anchor);
  const card = appended[0];
  const top = parseFloat(card.style.top);
  assert.equal(top, 48); // rect.bottom + 6 — alt kenar 108 < 120
  assert.ok(top + card.offsetHeight <= 120, `bottom=${top + card.offsetHeight} slotTop=120 aşıldı`);
});

test('önizleme kartı sığmayınca şeridin içine çekilir, sayfa yüzeyine girmez', () => {
  const { ctx, appended } = makeHarness({ slotTop: 100, cardH: 60 });
  ctx.__show('t1', anchor);
  const card = appended[0];
  const top = parseFloat(card.style.top);
  // Eski formül innerHeight'a göreydi → 48; kart altı 108 > 100 → kırpılırdı.
  assert.equal(top, 36);
  assert.ok(top + card.offsetHeight <= 100, `bottom=${top + card.offsetHeight} slotTop=100 aşıldı`);
});

test('slot yoksa pencere yüksekliğine göre yerleşir (eskisi gibi)', () => {
  const { ctx, appended } = makeHarness({ slotTop: null, cardH: 60 });
  ctx.__show('t1', anchor);
  const top = parseFloat(appended[0].style.top);
  assert.equal(top, 48);
});

// #178 review + R244: kart krom alanından uzunsa önce tek-satır kompakt
// varyanta düşer (kompakt şeride sığar → native yüzeye taşamaz); maxHeight
// yine güvenlik kelepçesi olarak topLimit-8 altında kalır.
test('kart slot alanından uzunsa kompakta düşer, maxHeight kelepçesi kalır', () => {
  const { ctx, appended } = makeHarness({ slotTop: 100, cardH: 400 });
  ctx.__show('t1', anchor);
  const card = appended[0];
  const top = parseFloat(card.style.top);
  const cap = parseFloat(card.style.maxHeight);
  assert.match(card.className, /\bis-compact\b/);
  // Kompakt 26px → top = min(48, 100-26-4)=48; kart altı 74 ≤ 100.
  assert.equal(top, 48);
  assert.ok(top + card.offsetHeight <= 100, `bottom=${top + card.offsetHeight} slotTop=100 aşıldı`);
  assert.equal(cap, 92);
});

// R244: kart doğal haliyle krom şeridine sığmıyorsa tek satırlık kompakt
// varyanta düşer; sığabildiği durumda normal varyant korunur.
test('kart şeride sığmayınca is-compact sınıfı eklenir', () => {
  // slotTop=50 → kullanılabilir 42px; cardH=60 > 42 → kompakt (26px).
  const { ctx, appended } = makeHarness({ slotTop: 50, cardH: 60 });
  ctx.__show('t1', anchor);
  const card = appended[0];
  assert.match(card.className, /\bis-compact\b/);
  // Kompakt ölçülerle yeniden konumlandırma: ch=26 → min(48, 50-26-4)=20.
  // Bayat cw/ch ile hizalansa top 4'e çakılır ve kart hizası kayardı.
  assert.equal(parseFloat(card.style.top), 20);
  // Daralmış genişlikle sağ sınır: min(40, 1024-180-4)=40 — sağda kalır.
  assert.equal(parseFloat(card.style.left), 40);
});

test('kart şeride sığıyorsa normal varyant korunur', () => {
  const { ctx, appended } = makeHarness({ slotTop: 200, cardH: 60 });
  ctx.__show('t1', anchor);
  assert.doesNotMatch(appended[0].className, /is-compact/);
});
