'use strict';

// T1 zaman-orak katmanı: browser overlay kontrolörünün seek/ratechange
// sonrası cue sınır zamanlayıcısını yeni zaman çizgisine göre yeniden
// hesapladığını kanıtlar. Gerçek DOM'a çıkmadan üretim script'ini vm'de
// sürer; timeupdate emniyet ağı yalnız rVFC YOKKEN bağlanır, bu yüzden
// sahte medya requestVideoFrameCallback SUNAR (Chromium yolu).

const assert = require('assert');
const vm = require('vm');
const { buildBrowserOverlayScript } = require('../src/browser-overlay-controller');

function makeHarness() {
  const timers = new Map();
  let timerSeq = 0;
  const rafQueue = [];
  const vfcQueue = [];
  const mutations = [];

  const makeEl = (tag) => {
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      style: {},
      dataset: {},
      attributes: {},
      textContent: '',
      dir: '',
      id: '',
      listeners: {},
      parentNode: null,
      isConnected: true,
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      append(...items) { items.forEach((i) => this.appendChild(i)); },
      insertBefore(node, ref) {
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
        node.parentNode = this; return node;
      },
      moveBefore(node, ref) { this.insertBefore(node, ref); },
      remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; } this.isConnected = false; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
      removeAttribute(k) { delete this.attributes[k]; },
      matches(sel) { return sel === ':popover-open' ? false : false; },
      contains(node) { return this.children.includes(node); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }; },
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      removeEventListener(type, fn) { const list = this.listeners[type] || []; const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); },
      dispatch(type) { for (const fn of [...(this.listeners[type] || [])]) fn({ isTrusted: true, type }); },
      querySelector(sel) {
        const kind = /data-kind="([^"]+)"/.exec(sel)?.[1];
        const walk = (n) => {
          for (const c of n.children || []) { if (kind && c.dataset?.kind === kind) return c; const hit = walk(c); if (hit) return hit; }
          return null;
        };
        return walk(this);
      },
      querySelectorAll() { return []; },
      showPopover() {}, hidePopover() {},
      setPointerCapture() {}, releasePointerCapture() {},
    };
    return el;
  };

  const video = makeEl('video');
  video.paused = false;
  video.currentTime = 0;
  video.duration = 60;
  video.playbackRate = 1;
  video.requestVideoFrameCallback = (cb) => { vfcQueue.push(cb); return vfcQueue.length; };
  video.cancelVideoFrameCallback = (id) => { vfcQueue[id - 1] = null; };

  const documentEl = makeEl('html');
  documentEl.appendChild(video);
  const head = makeEl('head');
  documentEl.appendChild(head);
  const walkAll = (node, pred, out = []) => {
    for (const c of node.children || []) { if (pred(c)) out.push(c); walkAll(c, pred, out); }
    return out;
  };
  const documentStub = {
    hidden: false,
    fullscreenElement: null,
    documentElement: documentEl,
    head,
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    dispatch(type) { for (const fn of [...(this.listeners[type] || [])]) fn({ type }); },
    getElementById(id) { return walkAll(documentEl, (n) => n.id === id)[0] || null; },
    createElement(tag) { return makeEl(tag); },
    querySelectorAll(sel) {
      if (sel === 'video,audio') return [video];
      if (sel === '[data-whisper-browser-overlay="true"]') return walkAll(documentEl, (n) => n.dataset?.whisperBrowserOverlay === 'true');
      return [];
    },
  };

  const windowStub = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame(cb) { rafQueue.push(cb); return rafQueue.length; },
    cancelAnimationFrame(id) { rafQueue[id - 1] = null; },
  };

  const sandbox = {
    window: windowStub,
    document: documentStub,
    globalThis: windowStub,
    innerWidth: 1280,
    innerHeight: 720,
    performance: { now: () => Date.now() },
    requestAnimationFrame: windowStub.requestAnimationFrame,
    cancelAnimationFrame: windowStub.cancelAnimationFrame,
    setTimeout(cb, delay) { const id = ++timerSeq; timers.set(id, { cb, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; mutations.push(this); }
      observe() {} disconnect() {}
      fire(nodes = []) { this.cb(nodes.map((node) => ({ addedNodes: [node] }))); }
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    console,
  };
  windowStub.document = documentStub;
  const overlayRoots = () => walkAll(documentEl, (n) => n.dataset?.whisperBrowserOverlay === 'true');
  return { sandbox, video, timers, rafQueue, vfcQueue, overlayRoots, makeEl, documentStub, documentEl };
}

const overlayText = (h) => {
  const root = h.overlayRoots()[0];
  const source = root?.querySelector('[data-kind="source"]');
  return source?.textContent || '';
};
const fireTimers = (h) => { const fns = [...h.timers.values()].map((t) => t.cb); h.timers.clear(); fns.forEach((f) => f()); };
const fireVfc = (h) => { const fns = h.vfcQueue.splice(0).filter(Boolean); fns.forEach((f) => f()); };
const fireRaf = (h) => { const fns = h.rafQueue.splice(0).filter(Boolean); fns.forEach((f) => f()); };

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ✓', name); };

// Cue dizisi: seyrek son cue (40-44) uzak bir sınır zamanlayıcısı üretir.
const cues = [
  { start: 0, end: 4, text: 'cue-A' },
  { start: 4, end: 8, text: 'cue-B' },
  { start: 8, end: 12, text: 'cue-C' },
  { start: 12, end: 16, text: 'cue-D' },
  { start: 40, end: 44, text: 'cue-Z' },
];
const build = () => buildBrowserOverlayScript(
  { mode: 'source', source: cues, translation: [], offset: 0, style: {} },
  '(cues, t) => (cues || []).filter((c) => c.start <= t && t < c.end)');

test('geriye seek: bayat sınır zamanlayıcısı yeni cue sınırını kaçırmaz', () => {
  const h = makeHarness();
  vm.runInNewContext(build(), h.sandbox);
  // t=13: görünür cue-D; bekleyen sınır = 16 (~3 sn sonra).
  h.video.currentTime = 13;
  h.video.dispatch('durationchange');
  fireRaf(h);
  assert.equal(overlayText(h), 'cue-D', 'başlangıçta doğru cue görünmeli');
  assert(h.timers.size >= 1, 'uzak sınır için zamanlayıcı kurulmuş olmalı');
  const staleTimerCount = h.timers.size;
  // Geriye seek → t=7.5: render B gösterir. Yeni çizgide sonraki sınır 8
  // (~0.5 sn); eski kodda bayat timer (~3 sn, eski sınır 16) bloklardı.
  h.video.currentTime = 7.5;
  h.video.dispatch('seeked');
  assert.equal(overlayText(h), 'cue-B', 'seek anında doğru cue');
  const delayAfterSeek = [...h.timers.values()][0]?.delay;
  assert(delayAfterSeek < 1000,
    `seek sonrası sınır zamanlayıcısı yeni çizgiye göre yeniden planlanmalı (gecikme ${delayAfterSeek}ms, ~500ms olmalı)`);
  // Oynatma devam ediyor: t=8.5 (C sınırı geçildi). Eski kodda bekleyen
  // bayat timer (≈16) rescheduling'i blokladığı için timers boştu ve
  // 8 sınırında hiçbir çerçeve çizilmezdi → B'de takılı kalırdı.
  h.video.currentTime = 8.5;
  fireTimers(h);
  fireVfc(h);
  assert.equal(overlayText(h), 'cue-C',
    'seek sonrası bekleyen eski sınır zamanlayıcısı yeni cue sınırını bloklamamalı');
  // t=13.5: tekrar D — 12 sınırı yeni çizgiye göre ateşlenip çizilmeli.
  h.video.currentTime = 13.5;
  fireTimers(h);
  fireVfc(h);
  assert.equal(overlayText(h), 'cue-D', 'geri seek sonrası ilerideki sınırlar da çalışmalı');
  // Eski timer ateşlense bile artık zararsız olmalı (yeniden planlanmış).
  if (staleTimerCount) fireTimers(h);
  fireVfc(h);
  assert.equal(overlayText(h), 'cue-D');
});

test('ileri seek: bekleyen sınır zamanlayıcısı seek öncesi çizgiye göre ateşlenmez', () => {
  const h = makeHarness();
  vm.runInNewContext(build(), h.sandbox);
  h.video.currentTime = 3;
  h.video.dispatch('play');
  assert.equal(overlayText(h), 'cue-A');
  // İleri seek: t=41 → Z; 44'te bitmeli.
  h.video.currentTime = 41;
  h.video.dispatch('seeked');
  assert.equal(overlayText(h), 'cue-Z');
  h.video.currentTime = 44.5;
  fireTimers(h);
  fireVfc(h);
  assert.equal(overlayText(h), '', 'cue sonunda metin temizlenmeli (ileri seek sonrası da)');
});

test('ratechange: oynatma hızı değişince sınır gecikmesi yeni hıza göre hesaplanır', () => {
  const h = makeHarness();
  vm.runInNewContext(build(), h.sandbox);
  h.video.currentTime = 12.5;
  h.video.dispatch('durationchange');
  assert.equal(overlayText(h), 'cue-D');
  assert(h.timers.size === 1);
  const slowDelay = [...h.timers.values()][0].delay;
  // Hız 1→4: 16 sınırına kalan 3.5 sn video, duvar saatinde ~875 ms olmalı.
  h.video.playbackRate = 4;
  h.video.dispatch('ratechange');
  assert.equal(h.timers.size, 1, 'ratechange sonrası tek sınır zamanlayıcısı olmalı');
  const fastDelay = [...h.timers.values()][0].delay;
  assert(fastDelay < slowDelay / 2,
    `ratechange sonrası sınır gecikmesi yeni hızla ölçeklenmeli (eski ${slowDelay}ms, yeni ${fastDelay}ms)`);
});

test('pause: bekleyen sınır devam eden oynatmada yeniden planlanır', () => {
  const h = makeHarness();
  vm.runInNewContext(build(), h.sandbox);
  h.video.currentTime = 14;
  h.video.dispatch('play');
  assert.equal(overlayText(h), 'cue-D');
  h.video.paused = true;
  h.video.dispatch('pause');
  fireTimers(h); // duraklatma sırasında eski timer düşer
  h.video.paused = false;
  h.video.dispatch('play');
  assert(h.timers.size === 1, 'resume sonrası yeni sınır zamanlayıcısı kurulmalı');
});

// Gerçek Electron koşularında gözlendi: sınır zamanlayıcısı sınırdan ~12 ms
// önce ateşlenir, vfc çizimi sınırın hemen öncesine (ör. 11.998) düşerse
// epsilon (videoTime+3ms) sınırı "geçmiş" sayar → sonraki sınır 4 sn sonraya
// kurulur → tüm [12,16) aralığında eski cue ekranda kalır.
test('sınırdan hemen önce çizim: epsilon penceresi sınırı atlatmamalı', () => {
  const h = makeHarness();
  vm.runInNewContext(build(), h.sandbox);
  h.video.currentTime = 11.997; // 12 sınırından 3 ms önce — çizim bu anda
  h.video.dispatch('durationchange');
  assert.equal(overlayText(h), 'cue-C', '11.997 anında C hâlâ doğru');
  const delay = [...h.timers.values()][0]?.delay;
  assert(delay !== undefined && delay < 500,
    `sınırdan hemen önce çizimde sınır 12 yeniden planlanmalı (delay=${delay}ms; eski kod 16'ya ~3988ms kuruyor)`);
  h.video.currentTime = 12.01;
  fireTimers(h);
  fireVfc(h);
  assert.equal(overlayText(h), 'cue-D', 'sınır geçildikten sonra yeni cue görünmeli');
});

console.log(`browser-overlay-timing: ${passed} test`);

// ─── Görünür-metin zaman orakı: sapma dağılımı ölçümü ──────────────────────
// Sanal saat: video her adımda 50 ms ilerler; duvar saati video/playbackRate
// kadar ilerler. Zamanlayıcılar vadesi dolunca ateşlenir, rVFC/raf sonra
// çizilir — gerçek Chromium sıralamasının birebir modeli.
// Orak = video zamanını transform'dan geçirip cue aralığını bulan aynı
// sourceToVideo/videoToSource çifti; sapma "görünen satır ≠ beklenen satır"
// olarak SAYILIR, cue dizisi karşılaştırması değil.

const STEP_MS = 50; // örnekleme çözünürlüğü — ölçümün alt sınırı

test('sapma dağılımı: seek+ratechange+reklam boşluğu+discontinuity karışık çizgide', () => {
  const h = makeHarness();
  // Sahne: 0-16 konuşma, 16-26 reklam boşluğu (cue yok), 26-44 konuşma.
  // Sıfır-olmayan PTS: kaynak cue zamanları video zamanından 30 sn kayık.
  const src = [
    { start: 30, end: 32, text: 'src-1' },   // video 0-2
    { start: 34, end: 36, text: 'src-2' },   // video 4-6
    { start: 38, end: 46, text: 'src-3' },   // video 8-16
    { start: 56, end: 58, text: 'src-4' },   // video 26-28
    { start: 60, end: 74, text: 'src-5' },   // video 30-44
  ];
  const tr = src.map((c) => ({ ...c, text: 'tr-' + c.text.slice(4) }));
  const code = buildBrowserOverlayScript(
    { mode: 'both', source: src, translation: tr, offset: 0,
      sourceTransform: { scale: 1, offsetSeconds: 30 },
      translationTransform: { scale: 1, offsetSeconds: 30 }, style: {} },
    '(cues, t) => (cues || []).filter((c) => c.start <= t && t < c.end)');
  // Sanal saat: sandbox.setTimeout'u "due" damgalı olacak şekilde sar;
  // duvar saati her örnek adımında STEP_MS ilerler, vadesi gelen timer
  // ateşlenir ve ardından kuyruktaki rVFC/raf çerçeveleri çizilir.
  let wall = 0;
  let videoTime = 0;
  h._seq = 10000;
  h.sandbox.setTimeout = (cb, delay) => {
    const id = ++h._seq;
    h.timers.set(id, { cb, delay, due: wall + delay });
    return id;
  };
  vm.runInNewContext(code, h.sandbox);

  const fireDue = () => {
    const dueIds = [...h.timers.entries()].filter(([, t]) => t.due <= wall + 1e-9).map(([id]) => id);
    const cbs = dueIds.map((id) => { const c = h.timers.get(id).cb; h.timers.delete(id); return c; });
    cbs.forEach((f) => f());
    fireVfc(h); fireRaf(h);
  };

  const expectedAt = (vt) => {
    const t = vt - 30; // videoToSource, scale=1, offset=30
    const c = src.find((x) => x.start <= t && t < x.end);
    return c ? c.text + '|tr-' + c.text.slice(4) : '';
  };
  const visibleBoth = () => {
    const root = h.overlayRoots()[0];
    if (!root) return '';
    const s = root.querySelector('[data-kind="source"]')?.textContent || '';
    const t = root.querySelector('[data-kind="translation"]')?.textContent || '';
    return s || t ? s + '|' + t : '';
  };

  // Olay programı (video zamanında tetiklenir)
  const events = [
    { at: 9.5, run: () => { videoTime = 2.5; h.video.currentTime = 2.5; h.video.dispatch('seeked'); } },
    { at: 14.0, run: () => { h.video.playbackRate = 2; h.video.dispatch('ratechange'); } },
    { at: 27.5, run: () => { videoTime = 40.0; h.video.currentTime = 40.0; h.video.dispatch('seeked'); } },
    { at: 42.0, run: () => { h.video.playbackRate = 0.5; h.video.dispatch('ratechange'); } },
  ];
  let evIdx = 0;

  const latencies = [];   // her beklenen-metin geçişinde görünene dek geçen video-ms
  let wrongCueMs = 0;     // yanlış/bayat metin görünen video-ms
  let missingMs = 0;      // metin beklenirken boş görünen video-ms
  let lastExpected = expectedAt(0);
  let transitionAt = null; // beklenen metin son değiştiği video anı

  h.video.currentTime = 0;
  h.video.dispatch('durationchange');
  fireDue();

  const TOTAL = 46; // video saniyesi
  while (videoTime < TOTAL) {
    videoTime += STEP_MS / 1000 * h.video.playbackRate;
    wall += STEP_MS;
    h.video.currentTime = videoTime;
    while (evIdx < events.length && videoTime >= events[evIdx].at) {
      events[evIdx++].run();
      // olay videoTime'ı sıçratabilir; ölçüm sıçrama sonrası konumdan devam eder
    }
    fireDue();
    const vis = visibleBoth();
    const exp = expectedAt(videoTime);
    const stepVideoMs = STEP_MS * h.video.playbackRate;
    if (exp !== lastExpected) { transitionAt = videoTime; lastExpected = exp; }
    if (vis !== exp) {
      if (vis === '') missingMs += stepVideoMs; else wrongCueMs += stepVideoMs;
    } else if (transitionAt !== null) {
      latencies.push(Math.max(0, (videoTime - transitionAt) * 1000));
      transitionAt = null;
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  const report = {
    samplesVideoSeconds: TOTAL,
    wrongCueMs, missingMs,
    correctionLatencyMs: { p50: pct(.5), p95: pct(.95), max: sorted[sorted.length - 1] || 0, n: sorted.length },
  };
  console.log('  sapma raporu:', JSON.stringify(report));
  // Kabul eşiği: 50 ms örnekleme altında düzeltme en geç 2 örnekte gelmeli
  // (sınır ateşleme + rVFC/raf çizimi); yanlış cue gösterilen süre sıfır
  // olmalı — eski kodda geri seek ~10 sn'lik bayat gösterim üretirdi.
  assert.equal(wrongCueMs, 0, `yanlış cue görüntülenme süresi ${wrongCueMs}ms`);
  assert.equal(missingMs, 0, `eksik gösterim süresi ${missingMs}ms`);
  assert(report.correctionLatencyMs.p95 <= 150,
    `p95 düzeltme gecikmesi ${report.correctionLatencyMs.p95}ms (eşik 150ms: örnekleme 50ms + ~12ms sınır önceli)`);
});
