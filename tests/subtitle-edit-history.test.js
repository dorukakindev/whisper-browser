const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Kuyruk-50/8: toplu düzenleme geçmişi × zamanlama paneli tutarlılığı.
// İki paralel geçmiş (bellek-içi timeline.undo ve dosya-yazan cueEditUndo)
// kronolojik karışamadığı için: dosya-yazan işlemler kirli paneli reddeder,
// toptan değişimler bekleyen zamanlama geçmişini görünür sıfırlar. Fonksiyonlar
// renderer.js'ten kesilip vm'de çalışır — metin kilidi değil davranış kanıtı.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed + failed} - ${name}`); }
  catch (error) { failed++; console.error(`not ok ${passed + failed} - ${name}\n  ${error.stack || error}`); }
}
function slice(from, to) {
  const start = renderer.indexOf(from);
  assert(start >= 0, 'başlangıç bulunamadı: ' + from);
  const end = renderer.indexOf(to, start);
  assert(end > start, 'bitiş bulunamadı: ' + to);
  return renderer.slice(start, end);
}

// --- Kesitler --------------------------------------------------------------
const historySlice = slice('function timelinePushUndo(', 'function drawTimeline(');
const bulkMemorySlice = slice('function applySubtitleBulkMemory(', 'function applyBrowserBulkMemory(');
const editedChannelSlice = slice('function refreshBrowserEditedChannel(', 'function stopReplacedBrowserTranslation(');
const undoListener = slice("if ($('timelineUndo')) $('timelineUndo').addEventListener", "$('timelineRedo')) $('timelineRedo').addEventListener");

function makeNode() {
  const classes = new Set();
  return {
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    _classes: classes, disabled: false, textContent: '', value: '',
  };
}

function timelineCtx() {
  const nodes = {};
  const logs = [];
  const player = {
    timeline: { undo: [], redo: [], drag: null, selected: -1, annotationSnapshot: null },
    cues: [], cuesRaw: [],
  };
  const ctx = {
    player, logs,
    $: (id) => (nodes[id] ||= makeNode()),
    _nodes: nodes,
    logLine: (m) => logs.push(m),
    renderCueList: () => {}, renderCue: () => {}, drawTimeline: () => {},
    scheduleBrowserOverlaySync: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(historySlice
    + '\nthis.editsPending = timelineEditsPending; this.invalidate = invalidateTimelineEdits;'
    + 'this.blocks = timelineBlocksFileWrites; this.pushUndo = timelinePushUndo;', ctx);
  return ctx;
}

test('timelineEditsPending: boşta temiz; undo/redo/dirty her biri kirli sayar', () => {
  const ctx = timelineCtx();
  assert.equal(ctx.editsPending(), false);
  ctx.player.timeline.undo.push([{ start: 0 }]);
  assert.equal(ctx.editsPending(), true);
  ctx.player.timeline.undo = [];
  ctx.player.timeline.redo = [[{ start: 0 }]];
  assert.equal(ctx.editsPending(), true);
  ctx.player.timeline.redo = [];
  ctx._nodes.timelineDrawer.classList.add('dirty');
  assert.equal(ctx.editsPending(), true);
});

test('invalidateTimelineEdits: temizken dokunmaz; kirliyken yığın+dirty+mesaj', () => {
  const ctx = timelineCtx();
  assert.equal(ctx.invalidate('x'), false, 'temiz durumda mesaj yazmamalı');
  ctx.player.timeline.undo.push([{ start: 0 }]);
  ctx.player.timeline.redo = [[{ start: 1 }]];
  ctx.$('timelineUndo').disabled = false;
  ctx.$('timelineDrawer').classList.add('dirty');
  assert.equal(ctx.invalidate('dosya değişti'), true);
  assert.equal(ctx.player.timeline.undo.length, 0);
  assert.equal(ctx.player.timeline.redo.length, 0);
  assert.equal(ctx._nodes.timelineDrawer.classList.contains('dirty'), false);
  assert.equal(ctx._nodes.timelineUndo.disabled, true);
  assert.equal(ctx._nodes.timelineRedo.disabled, true);
  assert.equal(ctx._nodes.timelineStatus.textContent, 'dosya değişti');
  assert.equal(ctx.editsPending(), false, 'sıfırlama sonrası dosya işlemleri serbest');
});

test('timelineBlocksFileWrites: temizken izin; kirliyken uyarıyla reddeder', () => {
  const ctx = timelineCtx();
  assert.equal(ctx.blocks(), false);
  ctx.player.timeline.undo.push([{ start: 0 }]);
  assert.equal(ctx.blocks(), true);
  assert.ok(ctx.logs.some((m) => m.includes('kaydedilmemiş düzenlemeler')),
    'engel mesajı kullanıcıya yol göstermeli');
});

test('timelinePushUndo: snapshot + redo sıfırlama + 30 kapasitesi', () => {
  const ctx = timelineCtx();
  ctx.player.cues = [{ start: 0, end: 1, text: 'a' }];
  ctx.player.timeline.redo = [[{ start: 9 }]];
  ctx.pushUndo();
  assert.equal(ctx.player.timeline.undo.length, 1);
  assert.equal(ctx.player.timeline.redo.length, 0, 'yeni işlem redo yığınını boşaltır');
  assert.notEqual(ctx.player.timeline.undo[0][0], ctx.player.cues[0], 'kopya snapshot');
  for (let i = 0; i < 40; i++) ctx.pushUndo();
  assert.equal(ctx.player.timeline.undo.length, 30, 'yığın 30 ile sınırlı');
});

// --- applySubtitleBulkMemory: birincil kanal değişimi geçmişi sıfırlar ------
function bulkMemoryCtx(calls) {
  const player = {
    cues: [{ start: 0, end: 1, text: 'x' }], cuesRaw: [], cues2: [], cues2Raw: [],
    subRaw: '', sub2Raw: '', sub2Path: '', subPath: 'p.srt',
    activeIdx: 0, activeIdx2: -1, mergeCont: false,
    workspaceMode: 'player', cueQualitySource: '',
  };
  const ctx = {
    player,
    parseSubtitles: (raw) => JSON.parse(raw),
    attachBrowserCueIdentities: (t, cues) => cues,
    mergeCueContinuation: (c) => c,
    applyCueQuality: (c) => c,
    reviewSourceCues: (t, p, c) => c,
    browserLoadedTrack: () => null,
    migrateSavedCueAssociation: () => {},
    invalidateTimelineEdits: (m) => { calls.push(m); return true; },
  };
  vm.createContext(ctx);
  vm.runInContext(bulkMemorySlice + '\nthis.applyBulk = applySubtitleBulkMemory;', ctx);
  return ctx;
}

test('applySubtitleBulkMemory: birincil kanal geçmişi sıfırlar, ikincil dokunmaz', () => {
  const calls = [];
  const ctx = bulkMemoryCtx(calls);
  const primary = { path: 'p.srt', before: '[]', after: '[{"start":0,"end":1,"text":"y"}]',
    channels: ['primary'], changes: [] };
  ctx.applyBulk([primary], 'after');
  assert.equal(calls.length, 1, 'birincil toptan değişim kirli zamanlamayı sıfırlamalı');
  calls.length = 0;
  const secondary = { path: 'p2.srt', before: '[]', after: '[{"start":0,"end":1,"text":"z"}]',
    channels: ['secondary'], changes: [] };
  ctx.applyBulk([secondary], 'after');
  assert.equal(calls.length, 0, 'ikincil kanal değişimi zamanlama geçmişine dokunmaz');
  assert.equal(ctx.player.cues2.length, 1);
});

// --- refreshBrowserEditedChannel: yalnız birincil iz sıfırlar ----------------
test('refreshBrowserEditedChannel: birincil iz yenilenince zamanlama sıfırlanır', () => {
  const calls = [];
  const nodes = {};
  const player = {
    cues: [], cuesRaw: [], cues2: [], cues2Raw: [], mergeCont: false,
    browserLoadedTrackId: 'tr1', browserLoadedTrackId2: 'tr2',
    browserTime: 0, browserPaused: true,
  };
  const tracks = [{ id: 'tr1' }, { id: 'tr2' }];
  const ctx = {
    player,
    $: (id) => (nodes[id] ||= makeNode()),
    browserLoadedTrack: (secondary) => secondary ? tracks[1] : tracks[0],
    browserBaseCueMap: () => new Map([['k', { start: 0, end: 1, text: 'a' }]]),
    effectiveBrowserTranslationCues: (t, base) => base,
    mergeCueContinuation: (c) => c,
    browserTabState: () => null,
    renderCueList: () => {}, renderBrowserCueAt: () => {},
    scheduleBrowserOverlaySync: () => {}, scheduleSubtitleFindReplace: () => {},
    invalidateTimelineEdits: (m) => { calls.push(m); return true; },
  };
  vm.createContext(ctx);
  vm.runInContext(editedChannelSlice + '\nthis.refresh = refreshBrowserEditedChannel;', ctx);
  ctx.refresh('tr2');
  assert.equal(calls.length, 0, 'ikincil iz zamanlama geçmişine dokunmaz');
  ctx.refresh('tr1');
  assert.equal(calls.length, 1, 'birincil iz yenilemesi kirli zamanlamayı sıfırlar');
});

// --- Statik kilit: dosya-yazan giriş noktaları kirli paneli reddeder ---------
test('dosya-yazan geçmiş yolları kirli panelde reddedilir (statik kilit)', () => {
  for (const name of ['applyCueEditHistoryCore', 'applySubtitleFindReplacement', 'saveCueEdit']) {
    const at = renderer.indexOf(`function ${name}(`);
    assert(at >= 0, name + ' yok');
    assert.ok(renderer.slice(at, at + 500).includes('timelineBlocksFileWrites'),
      name + ' kirli zamanlama panelinde dosya yazmamalı');
  }
  const quickAt = renderer.indexOf('async function saveBrowserQuickEditor(');
  assert.ok(renderer.slice(quickAt, quickAt + 400).includes('timelineEditsPending'),
    'hızlı düzenleyici kaydı kirli panelde engellenmeli');
});

test('geri alma ilk snapshot\'a ulaşınca panel temiz sayılır (statik kilit)', () => {
  assert.ok(/undo\.length\) \{\s*\$\('timelineDrawer'\)\?\.classList\.remove\('dirty'\)/.test(undoListener),
    'tam geri alma dirty bayrağını kaldırıp dosya işlemlerini serbest bırakmalı');
});

test('loadSubtitle: birincil altyazı değişimi kirli zamanlamayı sıfırlar (statik kilit)', () => {
  const load = slice('async function loadSubtitle(', 'async function attachSiblingSubtitles(');
  assert.ok(/player\.cues = player\.mergeCont[^;]+;\s*\n\s*invalidateTimelineEdits\(/.test(load),
    'birincil cues yeniden yüklenince bekleyen zamanlama geçmişi sıfırlanmalı');
});

console.log(`\n${passed} geçti, ${failed} düştü`);
if (failed) process.exit(1);
