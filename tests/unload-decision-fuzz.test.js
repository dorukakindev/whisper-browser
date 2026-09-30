'use strict';
// R324-1 — sekme×görünüm yarış matrisi: bellekten-boşaltma kapısının (unload
// kararı + kaynak metrik özetleri) rastgele-durum dayanıklılığı. Karar vericisi
// `browserTabUnloadDecision` unloadBrowserTab akışında iki kez çağrılır —
// koşul boşluğu (TOCTOU) pencerelerinde sayfa durumu değişir; kapı her çağrıda
// aynı deterministik sözleşmeyi tutmalı: allowed ⇒ hiçbir koruma nedeni yok.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  browserProtectionMessage,
  browserTabProtectionReasons,
  browserTabUnloadDecision,
  groupBrowserProcessMetrics,
  normalizeBrowserPageResourceMetrics,
  summarizeBrowserResourceBudgets,
  translationSchedulerBusy,
} = require('../src/browser-tab-resources');

function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

const REASON_FLAGS = {
  active: (tab, ctx) => ({ tab: { ...tab }, ctx: { ...ctx, activeTabId: tab.id } }),
  pinned: (tab) => ({ tab: { ...tab, pinned: true } }),
  keep_awake: (tab) => ({ tab: { ...tab, keepAwake: true } }),
  media_playing: (tab) => ({ tab: { ...tab, audible: true } }),
  fullscreen_or_pip: (tab) => ({ tab: { ...tab, pictureInPicture: true } }),
  navigation: (tab) => ({ tab: { ...tab, loading: true } }),
  active_job: (tab) => ({ tab: { ...tab, mangaJob: 'j1' } }),
  unsaved_draft: (tab) => ({ tab: { ...tab, dirtyDraft: true } }),
  form_or_login: (tab) => ({ tab: { ...tab, formOrLogin: true } }),
  unknown_state: (tab) => ({ tab: { ...tab, stateKnown: false } }),
};

describe('browserTabProtectionReasons — flag kapsama', () => {
  it('her koruma bayrağı tek başına kendi nedenini üretir', () => {
    const expected = ['active', 'pinned', 'keep_awake', 'media_playing', 'fullscreen_or_pip',
      'navigation', 'active_job', 'unsaved_draft', 'form_or_login', 'unknown_state'];
    for (const reason of expected) {
      const { tab, ctx } = REASON_FLAGS[reason]({ id: 't1' }, {});
      const reasons = browserTabProtectionReasons(tab, ctx);
      assert.ok(reasons.includes(reason), `${reason} için üretilmedi: ${reasons}`);
      assert.equal(reasons.length, 1, `tek bayrak tek neden vermeli: ${reasons}`);
    }
  });

  it('temiz sekme hiçbir neden üretmez ve boşaltılabilir', () => {
    const d = browserTabUnloadDecision({ id: 't1', lifecycle: 'background' });
    assert.equal(d.allowed, true);
    assert.deepEqual(d.reasons, []);
  });
});

describe('browserTabUnloadDecision — 2000 tohumlu hostile matris', () => {
  it('allowed ⇒ neden yok; neden var ⇒ allowed değil (çift yönlü invariant)', () => {
    const fields = ['pinned', 'keepAwake', 'audible', 'mediaPlaying', 'fullscreen', 'pictureInPicture',
      'loading', 'restoringPage', 'mangaJob', 'pageTranslateJob', 'dirtyDraft', 'formOrLogin'];
    for (let seed = 0; seed < 2000; seed++) {
      const rand = rng(seed);
      const tab = { id: rand() < 0.05 ? '' : `t${seed}` };
      if (rand() < 0.3) tab.lifecycle = pick(rand, ['unloaded', 'background', 'active', 'restoring', 'unloading']);
      for (const f of fields) if (rand() < 0.25) tab[f] = pick(rand, [true, true, true, 1, 'x']);
      if (rand() < 0.3) tab.stateKnown = pick(rand, [false, true, undefined]);
      if (rand() < 0.2) {
        // snapshot() deterministik olmalı: karar fonksiyonu ve oracle ayrı
        // ayrı çağırıyor; rastgelelik burada değil üretimde.
        const busy = rand() < 0.5;
        tab.translationScheduler = rand() < 0.5
          ? { snapshot: () => ({ pending: busy ? ['j'] : [], queued: [] }) }
          : { snapshot() { throw new Error('scheduler gone'); } };
      }
      const ctx = { activeTabId: rand() < 0.1 ? tab.id : `other-${seed}` };
      const d = browserTabUnloadDecision(tab, ctx);

      if (!tab.id) { assert.equal(d.allowed, false); assert.equal(d.reason, 'missing'); continue; }
      if (tab.lifecycle === 'unloaded') { assert.equal(d.allowed, false); assert.equal(d.reason, 'already_unloaded'); continue; }

      const reasons = browserTabProtectionReasons(tab, ctx);
      assert.deepEqual(d.reasons, reasons);
      if (reasons.length) {
        assert.equal(d.allowed, false, `seed ${seed}: nedenler varken izin`);
        assert.equal(d.reason, reasons[0]);
        assert.ok(d.message && typeof d.message === 'string');
      } else {
        assert.equal(d.allowed, true, `seed ${seed}: nedenler yokken ret`);
      }
      // neden listesi tekilli kalmalı
      assert.equal(new Set(reasons).size, reasons.length, `seed ${seed}: tekrarlı neden`);
    }
  });

  it('allowed ⇒ hiçbir koruma alanı geçerli değil (doğrudan alan doğrulaması)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const rand = rng(seed + 99999);
      const tab = { id: 't', lifecycle: 'background', pinned: rand() < 0.5, loading: rand() < 0.5,
        formOrLogin: rand() < 0.5, mediaPlaying: rand() < 0.5 };
      const d = browserTabUnloadDecision(tab, { activeTabId: 'other' });
      if (d.allowed) {
        assert.ok(!tab.pinned && !tab.loading && !tab.formOrLogin && !tab.mediaPlaying
          && tab.stateKnown !== false && !tab.mangaJob && !tab.pageTranslateJob);
      }
    }
  });
});

describe('translationSchedulerBusy — fail-closed sözleşmesi', () => {
  it('fırlatan snapshot ⇒ busy (kapalı tarafa düş)', () => {
    assert.equal(translationSchedulerBusy({ snapshot() { throw new Error('x'); } }), true);
  });
  it('pending/queued boş-olmayan ⇒ busy', () => {
    assert.equal(translationSchedulerBusy({ snapshot: () => ({ pending: ['a'], queued: [] }) }), true);
    assert.equal(translationSchedulerBusy({ snapshot: () => ({ pending: [], queued: ['b'] }) }), true);
    assert.equal(translationSchedulerBusy({ snapshot: () => ({ pending: [], queued: [] }) }), false);
    assert.equal(translationSchedulerBusy(null), false);
    assert.equal(translationSchedulerBusy({ snapshot: () => null }), false);
  });
});

describe('groupBrowserProcessMetrics / budget özetleri — hostile girdi', () => {
  it('NaN/negatif pid ve workingSet kırpılır; sharedTabIds tutarlı', () => {
    for (let seed = 0; seed < 800; seed++) {
      const rand = rng(seed);
      const tabs = Array.from({ length: Math.floor(rand() * 6) }, (_, i) => ({
        id: `t${i}`, processId: pick(rand, [0, 1, 2, NaN, 'x', -3, rand() * 10 | 0, null]),
      }));
      const metrics = Array.from({ length: Math.floor(rand() * 4) }, (_, i) => ({
        pid: i, memory: { workingSetSize: pick(rand, [-100, 0, 4096, NaN, Infinity, 'bad']) },
        cpu: { percentCPUUsage: pick(rand, [0, 12.5, NaN, 'x', -1]) },
      }));
      const out = groupBrowserProcessMetrics(tabs, metrics);
      assert.equal(out.length, tabs.length);
      for (const row of out) {
        if (row.memoryKiB !== null) assert.ok(Number.isFinite(row.memoryKiB) && row.memoryKiB >= 0);
        if (row.cpuPercent !== null) assert.ok(Number.isFinite(row.cpuPercent));
        assert.equal(row.processShared, Array.isArray(row.sharedTabIds) && row.sharedTabIds.length > 1);
        // paylaşım grubu yalnız gerçekten aynı pid'i taşıyan sekmeleri içermeli
        for (const sid of row.sharedTabIds) {
          const other = tabs.find((t) => t.id === sid);
          assert.ok(other && other.processId === row.processId);
        }
      }
    }
  });

  it('normalizeBrowserPageResourceMetrics: measured:false ⇒ null alanlar; değerler negatif olamaz', () => {
    const unmeasured = normalizeBrowserPageResourceMetrics({ measured: false, activeTimers: 9, overlayNodes: 3 });
    assert.equal(unmeasured.activeTimers, null);
    assert.equal(unmeasured.overlayNodes, null);
    assert.equal(unmeasured.measured, false);
    for (let seed = 0; seed < 500; seed++) {
      const rand = rng(seed);
      const raw = {};
      for (const k of ['activeTimers', 'observerCount', 'mutationObservers', 'resizeObservers',
        'mediaListeners', 'overlayNodes', 'pendingFrames', 'ipcPerMinute']) {
        raw[k] = pick(rand, [0, 5, -2, NaN, Infinity, 'abc', 3.9, null, undefined]);
      }
      const out = normalizeBrowserPageResourceMetrics(raw);
      for (const [k, v] of Object.entries(out)) {
        if (k === 'measured') continue;
        if (v !== null) { assert.ok(Number.isFinite(v) && v >= 0 && Number.isInteger(v), `${k}=${v}`); }
      }
    }
  });

  it('summarizeBrowserResourceBudgets: çıktı her zaman sonlu ve ≥0', () => {
    for (let seed = 0; seed < 500; seed++) {
      const rand = rng(seed);
      const tabs = Array.from({ length: Math.floor(rand() * 5) }, () => ({
        resources: Object.fromEntries(['activeTimers', 'observerCount', 'overlayNodes', 'ipcPerMinute']
          .map((k) => [k, pick(rand, [0, 7, -3, NaN, 'x', null])])),
      }));
      const globals = { activeTimers: pick(rand, [4, NaN, 'x']), networkSubscriptions: -1,
        pendingResponses: 'bad', bufferedCues: 8.7, networkCaptureActive: rand() < 0.5 };
      const s = summarizeBrowserResourceBudgets(tabs, globals);
      for (const [k, v] of Object.entries(s)) {
        if (k === 'networkCaptureActive') assert.equal(typeof v, 'boolean');
        else assert.ok(Number.isFinite(v) && v >= 0 && Number.isInteger(v), `${k}=${v}`);
      }
      // sıfır tab ⇒ alanlar yalnız global katkı
      const onlyGlobals = summarizeBrowserResourceBudgets([], { activeTimers: 2 });
      assert.equal(onlyGlobals.observerCount, 0);
    }
  });
});
