'use strict';

// R334 ölü-bölge kilidi — probeActiveBrowserTracks (src/main.js):
// kapsam haritasında hiç çağrılmayan HTML5 textTrack tarama yolu.
// Sözleşme:
//   - kapılar: sekme yok / requestedTab uyumsuz / capture kapalı /
//     compat / cloudflare / instrumentation-pending / busy / gizli /
//     görünüm yok / yıkık → false (tarama yok)
//   - her frame/track storeBrowserTrack'e taşınır + 'parsed' notu
//   - bayat context (stateGeneration değişmiş) → false, store yok
//   - ETIMEDOUT → 'error' notu + false
//   - busy bayrağı yalnız nesil eşleşiyorsa temizlenir

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, 'Bölüm bulunamadı: ' + start);
  return source.slice(from, to);
}

function makeCtx(over = {}) {
  const ctx = vm.createContext({
    String, Number, Array, Set, Map, JSON, Buffer, RegExp, Error, Promise,
    Math, Object, Date, console, process,
    BROWSER_SCRIPT_TIMEOUT: 5000,
    browserTrackBusy: false,
    browserStateGeneration: 7,
    browserCaptureEnabled: true,
    browserVisible: true,
    browserView: { webContents: { isDestroyed: () => false } },
    activeBrowserTab: () => ({ id: 1 }),
    browserEventContext: (tab) => ({ tabId: tab.id }),
    browserTrackProbeScript: () => 'probe()',
    withTimeout: async (p) => p,
    executeBrowserFrames: async () => [],
    isCurrentBrowserContext: (c) => c.stateGeneration === ctx.browserStateGeneration,
    storeBrowserTrack: () => null,
    noteBrowserCapture: () => {},
    browserTrackStreamKey: (url, lang) => `k:${url}:${lang}`,
    ...over,
  });
  return ctx;
}

function evalProbe(ctx) {
  vm.runInContext(
    section('async function probeActiveBrowserTracks(', 'function browserManifestResourceProbeScript('),
    ctx);
}

function run(ctx, code) { return vm.runInContext(code, ctx); }

async function t_gate_matrix() {
  const probed = [];
  const base = () => makeCtx({ executeBrowserFrames: async () => { probed.push(1); return []; } });
  const cases = [
    ['sekme yok', { activeBrowserTab: () => null }],
    ['requestedTab uyumsuz', {}, true],
    ['capture kapalı', { browserCaptureEnabled: false }],
    ['uyumluluk modu', { activeBrowserTab: () => ({ id: 1, compatibilityMode: true }) }],
    ['cloudflare', { activeBrowserTab: () => ({ id: 1, cloudflareChallengeActive: true }) }],
    ['instrumentation', { activeBrowserTab: () => ({ id: 1, browserInstrumentationPending: true }) }],
    ['busy', { browserTrackBusy: true }],
    ['gizli', { browserVisible: false }],
    ['görünüm yok', { browserView: null }],
    ['yıkık', { browserView: { webContents: { isDestroyed: () => true } } }],
  ];
  for (const [name, over, arg] of cases) {
    const c = makeCtx(over);
    evalProbe(c);
    c.__reqTab = arg ? { id: 9 } : null;
    const r = await run(c, `probeActiveBrowserTracks('event', __reqTab)`);
    assert.strictEqual(r, false, name);
  }
  assert.strictEqual(probed.length, 0, 'kapılarda tarama çalışmamalı');
}

async function t_tracks_stored() {
  const stored = [];
  const notes = [];
  const tracks = [
    { cues: [{ s: 1 }], language: 'tr', label: 'TR', kind: 'subtitles',
      trackId: 'a', sourceUrl: 'https://x/a.vtt' },
    { cues: [{ s: 2 }], language: 'en', label: '', kind: '', trackId: '',
      sourceUrl: '' },
  ];
  const ctx = makeCtx({
    executeBrowserFrames: async () => [tracks, null],
    storeBrowserTrack: (cues, meta) => { stored.push(meta); return 'asset:' + meta.trackId; },
    noteBrowserCapture: (ch, meta, st, msg) => notes.push([ch, st, msg]),
  });
  evalProbe(ctx);
  const r = await run(ctx, "probeActiveBrowserTracks('event')");
  assert.strictEqual(r, true);
  assert.strictEqual(stored.length, 2, 'iki iz saklanmadı');
  assert.strictEqual(stored[0].format, 'html5-track');
  assert.strictEqual(stored[0].streamKey, 'k:https://x/a.vtt:tr');
  // sourceUrl'suz iz: dom: fallback anahtarı
  assert.match(stored[1].streamKey, /^k:dom:en:::/);
  assert.strictEqual(notes.length, 2);
  assert.ok(notes.every(([ch, st]) => ch === 'textTrack' && st === 'parsed'));
  assert.match(notes[0][2], /sayfa olayı/);
  // busy temizlendi (nesil aynı)
  assert.strictEqual(ctx.browserTrackBusy, false);
}

async function t_stale_context() {
  const stored = [];
  const ctx = makeCtx({
    executeBrowserFrames: async () => {
      ctx.browserStateGeneration = 8; // tarama ortasında nesil değişti
      return [[{ cues: [{}], language: 'tr' }]];
    },
    storeBrowserTrack: () => { stored.push(1); return 'a'; },
  });
  evalProbe(ctx);
  const r = await run(ctx, "probeActiveBrowserTracks('fallback')");
  assert.strictEqual(r, false, 'bayat context devam etmemeli');
  assert.strictEqual(stored.length, 0, 'bayat iz saklanmamalı');
}

async function t_timeout_and_busy() {
  const notes = [];
  const ctx = makeCtx({
    executeBrowserFrames: async () => {
      const e = new Error('zaman aşımı'); e.code = 'ETIMEDOUT'; throw e;
    },
    noteBrowserCapture: (ch, meta, st, msg) => notes.push(st),
  });
  evalProbe(ctx);
  const r = await run(ctx, "probeActiveBrowserTracks('fallback')");
  assert.strictEqual(r, false);
  assert.deepStrictEqual(notes, ['error']);
  assert.strictEqual(ctx.browserTrackBusy, false, 'hata sonrası busy temizlenmeli');
}

async function t_busy_generation_guard() {
  const ctx = makeCtx({
    executeBrowserFrames: async () => {
      ctx.browserStateGeneration = 99; // başka sekme/nesil
      return [];
    },
    isCurrentBrowserContext: (c) => c.stateGeneration === ctx.browserStateGeneration,
  });
  evalProbe(ctx);
  await run(ctx, "probeActiveBrowserTracks('fallback')");
  // nesil değiştiği için finally busy'yi TEMİZLEMEZ (yeni sahibine ait)
  assert.strictEqual(ctx.browserTrackBusy, true);
}

async function main() {
  await t_gate_matrix();
  await t_tracks_stored();
  await t_stale_context();
  await t_timeout_and_busy();
  await t_busy_generation_guard();
  console.log('track-probe-deadzone: 5 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
