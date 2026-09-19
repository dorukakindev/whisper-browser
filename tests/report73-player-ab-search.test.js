'use strict';

/**
 * Report 73 — oynatıcı derin denetim regresyonları (davranışsal).
 *
 * R73-01: Tarayıcı A-B döngüsü — kullanıcı/site seek'i B ötesine inerken
 *   "kesiş" sanılıp A'ya sarılmamalı; ayrıca sabit 4.5s eşiği 4x hızda doğal
 *   ilerlemeyi seek sanıp döngüyü kırabiliyordu (eşik artık hıza ölçekli).
 * R73-02: Native A-B döngüsü — seek tamamlanan timeupdate seeked'den ÖNCE
 *   gelir; video.seeking koruması olmadan B ötesi atlama yine A'ya sarılıyordu.
 * R73-03: player.lastT altyazı-zamanında saklanıp +offset ile geri çevriliyordu;
 *   offset değişince "önceki konum" delta kadar kayıyordu. Artık video-zamanında.
 * R73-04: stSelectSection uçuştaki arama isteğini düşürmüyordu; bölüm
 *   değişince geç dönen sonuç gizli arama grid'ine yazabiliyordu.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const RENDERER = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function sliceFunction(src, header, nextMarker) {
  const start = src.indexOf(header);
  const end = src.indexOf(nextMarker, start + header.length);
  assert.ok(start >= 0 && end > start, `dilim bulunamadı: ${header}`);
  return src.slice(start, end);
}

// ---------- R73-01: tarayıcı A-B seek kaçışı (davranışsal) ----------
const RBC_SRC = sliceFunction(RENDERER,
  'function renderBrowserCueAt(',
  '\nasync function showBrowserWorkspaceAttempt');

function makeBrowserCtx(player, calls) {
  const sandbox = {
    player,
    browserQuickEditor: null,
    quickEditorStillCurrent: () => false,
    browserCommand: (cmd, val) => { calls.push([cmd, val]); return { catch() {} }; },
    subtitleSourceTime: (t) => t,
    applyBrowserSponsorSkip: () => false,
    applyPlaybackLearningPolicy: () => {},
    findCueAt: () => -1,
    highlightCueRow: () => {},
    updateCueMeta: () => {},
    $: () => null,
    aiChatCtxLabel: () => {},
    Date,
    Number,
    isFinite,
  };
  vm.createContext(sandbox);
  return { fn: vm.runInContext(`${RBC_SRC}\nrenderBrowserCueAt;`, sandbox), sandbox };
}

function freshBrowserPlayer() {
  return {
    abA: 10, abB: 20, _ownSeekAt: 0, browserRate: 1, browserPaused: false,
    browserTime: 0, cues: [], cues2: [], activeIdx: -1, activeIdx2: -1,
  };
}

test('R73-01a: doğal oynatma B\'yi geçince A\'ya sarar', () => {
  const player = freshBrowserPlayer();
  const calls = [];
  const { fn } = makeBrowserCtx(player, calls);
  fn(20.1, 19.5, false);
  assert.deepStrictEqual(calls, [['seek', 10]], `beklenen A seek'i: ${JSON.stringify(calls)}`);
  assert.strictEqual(player.browserTime, 10);
});

test('R73-01b: kendi seek\'imiz B ötesine inerse döngülenmez (kaçış)', () => {
  const player = freshBrowserPlayer();
  player._ownSeekAt = Date.now(); // browserCommand seek az önce gönderildi
  const calls = [];
  const { fn } = makeBrowserCtx(player, calls);
  fn(25, 19, false);
  assert.deepStrictEqual(calls, [], `seek olmamalıydı: ${JSON.stringify(calls)}`);
  // Sonraki doğal adımda da geri dönmez — kullanıcı döngüden çıktı.
  fn(25.5, 25, false);
  assert.deepStrictEqual(calls, [], 'kaçış sonrası döngü yeniden tetiklenmemeli');
});

test('R73-01c: site-içi büyük ileri atlama seek sayılır, döngülenmez', () => {
  const player = freshBrowserPlayer();
  const calls = [];
  const { fn } = makeBrowserCtx(player, calls);
  fn(27, 19, false); // 8 sn sıçrama, rate=1 → doğal adım ~1 sn
  assert.deepStrictEqual(calls, [], `site seek'i döngülenmemeliydi: ${JSON.stringify(calls)}`);
});

test('R73-01d: 4x hızda doğal ilerleme seek sanılmaz — döngü korunur', () => {
  const player = freshBrowserPlayer();
  player.browserRate = 4;
  const calls = [];
  const { fn } = makeBrowserCtx(player, calls);
  // 4x'te ~1.25 sn'lik poll gecikmesi doğal 5 sn ilerleme üretir; sabit 4.5
  // eşiği bunu seek sayıp döngüyü kırardı. Ölçekli eşik (4x1.75=7) korur.
  fn(20.5, 15.5, false);
  assert.deepStrictEqual(calls, [['seek', 10]],
    `4x doğal ilerleme döngülemeliydi: ${JSON.stringify(calls)}`);
});

test('R73-01f: reklam sırasında A-B sarması yapılmaz', () => {
  const player = freshBrowserPlayer();
  player.browserAdPlaying = true; // reklam konumu içerik gibi raporlanabilir
  const calls = [];
  const { fn } = makeBrowserCtx(player, calls);
  fn(20.5, 19.5, false);
  assert.deepStrictEqual(calls, [], 'reklam sırasında içeriğe seek atılmamalı');
});

test('R73-01e: 4x hızda gerçekten büyük atlama yine seek sayılır', () => {
  const player = freshBrowserPlayer();
  player.browserRate = 4;
  const calls = [];
  const { fn } = makeBrowserCtx(player, calls);
  fn(30, 15, false); // 15 sn — 4x'te bile doğal değil
  assert.deepStrictEqual(calls, [], 'büyük atlama döngülenmemeli');
});

// ---------- R73-02: native A-B seek kaçışı (davranışsal) ----------
const AB_COMMENT = RENDERER.indexOf('// A-B dongusu: B\'ye gelince');
assert.ok(AB_COMMENT > 0, 'A-B döngü yorumu bulunamadı');
const AB_ARROW_START = RENDERER.indexOf('() => {', AB_COMMENT);
const AB_ARROW_END = RENDERER.indexOf('\n  });', AB_ARROW_START);
assert.ok(AB_ARROW_START > AB_COMMENT && AB_ARROW_END > AB_ARROW_START, 'A-B timeupdate handler dilimi yok');
const AB_ARROW = RENDERER.slice(AB_ARROW_START, AB_ARROW_END + '\n  });'.length - 2); // "});" öncesi kapanış parantezi dahil

function makeNativeCtx(player, video) {
  const renderCueCalls = [];
  const sandbox = {
    player, video,
    renderCue: () => renderCueCalls.push(1),
    Number,
  };
  vm.createContext(sandbox);
  const handler = vm.runInContext(`(${AB_ARROW})`, sandbox);
  return { handler, renderCueCalls };
}

test('R73-02a: seek inişi B ötesindeyse döngülenmez (video.seeking koruması)', () => {
  const player = { abA: 10, abB: 20, _abPrevT: 19 };
  const video = { currentTime: 25, seeking: true };
  const { handler } = makeNativeCtx(player, video);
  handler();
  assert.strictEqual(video.currentTime, 25, 'seeking sırasında A\'ya sarılmamalı');
  assert.strictEqual(player._abPrevT, 25, '_abPrevT iniş konumuna güncellenmeli');
});

test('R73-02b: seeked sonrası doğal adım döngüye geri dönmez', () => {
  const player = { abA: 10, abB: 20, _abPrevT: 25 }; // seeked: _abPrevT=25
  const video = { currentTime: 25.3, seeking: false };
  const { handler } = makeNativeCtx(player, video);
  handler();
  assert.strictEqual(video.currentTime, 25.3, 'kaçış sonrası sarılmamalı');
});

test('R73-02c: doğal kesiş A\'ya sarar', () => {
  const player = { abA: 10, abB: 20, _abPrevT: 19.8 };
  const video = { currentTime: 20.1, seeking: false };
  const { handler, renderCueCalls } = makeNativeCtx(player, video);
  handler();
  assert.strictEqual(video.currentTime, 10, 'B kesişi A\'ya sarmalı');
  assert.strictEqual(renderCueCalls.length, 1, 'renderCue çağrılmalı');
});

test('R73-02d: seeked handler\'ı _abPrevT\'yi günceller (kaynak)', () => {
  const seekedIdx = RENDERER.indexOf("video.addEventListener('seeked'", AB_COMMENT);
  assert.ok(seekedIdx > AB_COMMENT, 'seeked handler bulunamadı');
  const block = RENDERER.slice(seekedIdx, RENDERER.indexOf('});', seekedIdx));
  assert.match(block, /player\._abPrevT = video\.currentTime/,
    'seeked _abPrevT güncellemiyor — atlama sonrası bayat "önceki" döngüyü tetikler');
});

// ---------- R73-03: lastT video-zamanında ----------
test('R73-03: player.lastT video.currentTime tutar, offset geri-çevrimi yok', () => {
  const region = sliceFunction(RENDERER, 'function renderCue()', '\nfunction renderCueList');
  assert.match(region, /player\.lastT = video\.currentTime;/,
    'lastT video-zamanında saklanmalı');
  const policyCall = region.match(/applyPlaybackLearningPolicy\(([^)]*)\)/);
  assert.ok(policyCall, 'applyPlaybackLearningPolicy çağrısı yok');
  assert.ok(!/player\.offset/.test(policyCall[1]),
    `offset geri-çevrimi hâlâ var: ${policyCall[0]}`);
  assert.match(policyCall[1], /video\.currentTime/,
    'ilk argüman video-zamanı olmalı');
});

// ---------- R73-04: stSelectSection arama kuşağını düşürür ----------
const STS_SRC = sliceFunction(RENDERER,
  'function stSelectSection(',
  '\n// Bölüm render yarışı koruması');

test('R73-04: stSelectSection uçuştaki aramayı geçersiz kılar (davranışsal)', () => {
  const calls = [];
  const elStub = () => ({ classList: { add() {}, remove() {}, toggle() {} }, textContent: '' });
  const sandbox = {
    stCurrentSection: 'home',
    stSearchActive: true,
    stSearchSeq: 3,
    $: () => elStub(),
    document: { querySelectorAll: () => [] },
    renderSmartTubeSection: (s) => calls.push(s),
  };
  vm.createContext(sandbox);
  const fn = vm.runInContext(`${STS_SRC}\nstSelectSection;`, sandbox);
  fn('trending');
  assert.strictEqual(sandbox.stSearchSeq, 4, 'bölüm değişimi stSearchSeq artırmalı');
  assert.strictEqual(sandbox.stSearchActive, false, 'arama durumu temizlenmeli');
  assert.deepStrictEqual(calls, ['trending'], 'yeni bölüm render edilmeli');
});

// ---------- R73-05: dirty editörde undo/redo sessiz no-op değil ----------
test('R73-05: browserQuickHistory dirty durumda status geri bildirimi verir', () => {
  const region = sliceFunction(RENDERER,
    'async function browserQuickHistory(',
    "\n$('browserQuickEditSave')");
  assert.match(region, /quickEditorDirty\(\)/, 'dirty kontrolü yok');
  assert.match(region, /updateQuickEditorStatus\('Kaydedilmemiş/, 
    'dirty no-op hâlâ sessiz — kullanıcıya geri bildirim yok');
});

// ---------- R73-06: zoom-set geçersiz değer zoom-out gibi davranmaz ----------
const MAIN = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
test('R73-06: zoom-set NaN fallback\'i artık zoom hesaplamıyor', () => {
  const idx = MAIN.indexOf("['zoom-in', 'zoom-out', 'zoom-reset', 'zoom-set']");
  assert.ok(idx > 0, 'zoom komut bloğu bulunamadı');
  const block = MAIN.slice(idx, MAIN.indexOf('wc.setZoomFactor', idx));
  assert.match(block, /zoom-set' && !Number\.isFinite\(requested\)/,
    'zoom-set geçersiz değerde erken dönüş yok');
  assert.match(block, /Geçersiz yakınlaştırma değeri/,
    'hata mesajı yok — eski kod NaN\'i zoom-out\'a çeviriyordu');
});

// ---------- runner ----------
(async () => {
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok ${name}`); }
    catch (err) { console.error(`  FAIL ${name}: ${err.message}`); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} test geçti`);
})();
