'use strict';
// R325-4 — session restore kombinasyon matrisi: normalizeBrowserSession
// hostile alan kombinasyonlarında invariant'ları korumalı.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBrowserSession, MAX_SESSION_TABS, BROWSER_SESSION_VERSION } = require('../src/browser-session-store');

function rnd(seed) { let s = seed >>> 0; return () => (s = (s * 1103515245 + 12345) >>> 0) / 0xffffffff; }
const HOSTILE_SCALAR = [undefined, null, '', 0, -1, NaN, Infinity, 'x', {}, [], 1e20];
const HOSTILE_ID = [undefined, null, '', 'a', 'dup', 'x'.repeat(500), 42, {}, []];

function hostileTab(r) {
  const id = HOSTILE_ID[(r() * HOSTILE_ID.length) | 0];
  return {
    id,
    url: HOSTILE_SCALAR[(r() * HOSTILE_SCALAR.length) | 0],
    title: HOSTILE_SCALAR[(r() * HOSTILE_SCALAR.length) | 0],
    kind: HOSTILE_SCALAR[(r() * HOSTILE_SCALAR.length) | 0],
  };
}

function invariants(s, label) {
  assert.equal(s.version, BROWSER_SESSION_VERSION, `${label}: version`);
  assert.ok(Array.isArray(s.tabs) && s.tabs.length <= MAX_SESSION_TABS, `${label}: tab sınırı`);
  const ids = s.tabs.map((t) => t.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, `${label}: tekil kimlikler`);
  if (s.activeTabId) assert.ok(s.tabs.some((t) => t.id === s.activeTabId), `${label}: activeTabId ∈ tabs`);
  if (s.splitSecondaryTabId) {
    assert.ok(s.tabs.some((t) => t.id === s.splitSecondaryTabId), `${label}: split ∈ tabs`);
    assert.notEqual(s.splitSecondaryTabId, s.activeTabId, `${label}: split ≠ active`);
  }
  assert.ok(s.splitRatio >= 0.25 && s.splitRatio <= 0.75, `${label}: splitRatio sınırı`);
}

describe('R325-4: session restore kombinasyon matrisi', () => {
  it('1000 tohumlu hostile oturumda invariant\'lar korunur', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const r = rnd(seed);
      const tabCount = (r() * (MAX_SESSION_TABS + 5)) | 0;
      const tabs = Array.from({ length: tabCount }, () => hostileTab(r));
      // Ara sıra bilinçli çakışma/bozuk referans üret
      if (tabs.length > 2 && r() < 0.4) tabs[1] = { ...tabs[1], id: tabs[0].id };
      const raw = {
        version: HOSTILE_SCALAR[(r() * HOSTILE_SCALAR.length) | 0],
        tabs,
        activeTabId: HOSTILE_ID[(r() * HOSTILE_ID.length) | 0],
        splitSecondaryTabId: HOSTILE_ID[(r() * HOSTILE_ID.length) | 0],
        splitRatio: HOSTILE_SCALAR[(r() * HOSTILE_SCALAR.length) | 0],
        savedAt: HOSTILE_SCALAR[(r() * HOSTILE_SCALAR.length) | 0],
        cleanExit: HOSTILE_SCALAR[(r() * HOSTILE_SCALAR.length) | 0],
        restoreEnabled: HOSTILE_SCALAR[(r() * HOSTILE_SCALAR.length) | 0],
        futureField: { nested: ['sürpriz'] },
      };
      invariants(normalizeBrowserSession(raw), `seed ${seed}`);
    }
  });

  it('aktif sekme sınır dışındayken kurtarılır (sıra korunur)', () => {
    const tabs = Array.from({ length: MAX_SESSION_TABS + 3 }, (_, i) => ({ id: `t${i}`, url: `https://x/${i}` }));
    tabs[MAX_SESSION_TABS + 2].id = 'active';
    const s = normalizeBrowserSession({ tabs, activeTabId: 'active' });
    assert.equal(s.tabs[0].id, 'active');
    assert.equal(s.activeTabId, 'active');
  });

  it('çakışan split referansları elenir', () => {
    const s = normalizeBrowserSession({
      tabs: [{ id: 'a', url: 'https://a/' }, { id: 'b', url: 'https://b/' }],
      activeTabId: 'a', splitSecondaryTabId: 'a',
    });
    assert.equal(s.splitSecondaryTabId, '');
    const s2 = normalizeBrowserSession({
      tabs: [{ id: 'a', url: 'https://a/' }],
      activeTabId: 'a', splitSecondaryTabId: 'ghost',
    });
    assert.equal(s2.splitSecondaryTabId, '');
  });
});
