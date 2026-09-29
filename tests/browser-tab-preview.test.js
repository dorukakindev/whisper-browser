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

function makeHarness({ slotTop = 120, cardW = 300, cardH = 60 } = {}) {
  const appended = [];
  const mkEl = () => {
    const el = {
      children: [],
      style: {},
      textContent: '',
      className: '',
      offsetWidth: cardW,
      offsetHeight: cardH,
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
