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
    timeline: { undo: [], redo: [], drag: null, selected: -1, annotationSnapshot: null, recovery: null, recoveryTimer: null },
    cues: [], cuesRaw: [],
  };
  const ctx = {
    player, logs,
    $: (id) => (nodes[id] ||= makeNode()),
    _nodes: nodes,
    logLine: (m) => logs.push(m),
    renderCueList: () => {}, renderCue: () => {}, drawTimeline: () => {},
    scheduleBrowserOverlaySync: () => {},
    clearTimeout: () => {},
    timelineClearRecovery: () => {},
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

// --- Dışarıdan-değişim birleştirme (kuyruk-50/10) ----------------------------
const formatSlice = slice('function parseAss(', 'function setPlayerSource(');
const mergeSlice = slice('async function mergeCueEditOntoExternal(', 'async function saveCueEdit(');

function mergeCtx(freshText, writeResult) {
  const calls = [];
  const ctx = {
    window: {
      addEventListener: () => {},
      api: {
        readSubtitle: async () => freshText,
        writeSubtitle: async (p, payload, change, expect) => {
          calls.push({ p, payload, change, expect });
          return typeof writeResult === 'function' ? writeResult() : writeResult;
        },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(formatSlice + '\n' + mergeSlice
    + '\nthis.merge = mergeCueEditOntoExternal;', ctx);
  return { ctx, calls };
}

const MERGE_SRT = '1\n00:00:01,000 --> 00:00:03,000\nBir\n\n'
  + '2\n00:00:04,000 --> 00:00:06,000\nHedef\n\n'
  + '3\n00:00:07,000 --> 00:00:09,000\nUc';

async function mergeTests() {
  await test_async('birleştirme: dış değişim korunur, yalnız hedef cue değişir', async () => {
    const fresh = MERGE_SRT.replace('Uc', 'Dışarıdan değişen');
    const { ctx, calls } = mergeCtx({ ok: true, text: fresh, mtimeMs: 99, size: 7 }, { ok: true, mtimeMs: 100, size: 9 });
    const source = { subtitleSourceIndex: 1, start: 4, end: 6, text: 'Hedef' };
    const base = [{ text: 'Bir' }, { text: 'Hedef' }, { text: 'Uc' }];
    const out = await ctx.merge('p.srt', 'srt', source, 'Benim metnim', base);
    assert.equal(out.ok, true);
    assert.equal(out.matchIndex, 1);
    assert.equal(out.diffCount, 1, 'yalnız bir satır dışarıdan değişmiş sayılmalı');
    assert.equal(out.externalDiffers, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].expect.mtimeMs, 99, 'güncel mtime bekçisi');
    assert.equal(calls[0].change.action, 'edit-merge', 'günlükte birleştirme ayırt edilir');
    assert.ok(calls[0].payload.includes('Dışarıdan değişen'), 'dış değişiklik korunmadı');
    assert.ok(calls[0].payload.includes('Benim metnim'), 'kullanıcı metni uygulanmadı');
    assert.ok(!calls[0].payload.includes('Hedef\n'), 'eski hedef metin kaldı');
  });

  await test_async('birleştirme: aynı satır dışarıdan da değiştiyse metniniz uygulanır', async () => {
    const fresh = MERGE_SRT.replace('Hedef', 'Diskte de değişti');
    const { ctx } = mergeCtx({ ok: true, text: fresh, mtimeMs: 5, size: 1 }, { ok: true });
    const source = { subtitleSourceIndex: 1, start: 4, end: 6, text: 'Hedef' };
    const out = await ctx.merge('p.srt', 'srt', source, 'Benim metnim', []);
    assert.equal(out.ok, true);
    assert.equal(out.externalDiffers, true, 'aynı-satır çakışması önizlenmeli');
  });

  await test_async('birleştirme: hedef cue artık eşleşmiyorsa yazılmaz', async () => {
    const fresh = MERGE_SRT.replace('Hedef', 'Farklı').replace('00:00:04,000 --> 00:00:06,000',
      '00:00:44,000 --> 00:00:46,000');
    const { ctx, calls } = mergeCtx({ ok: true, text: fresh, mtimeMs: 5, size: 1 }, { ok: true });
    const source = { subtitleSourceIndex: 9, start: 4, end: 6, text: 'Hedef' };
    const out = await ctx.merge('p.srt', 'srt', source, 'Benim metnim', []);
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'nomatch');
    assert.equal(calls.length, 0, 'eşleşme yoksa dosyaya yazılmamalı');
  });

  await test_async('birleştirme: ikinci yazma da reddedilirse başarısız döner', async () => {
    const { ctx } = mergeCtx({ ok: true, text: MERGE_SRT, mtimeMs: 5, size: 1 },
      { ok: false, error: 'dışarıdan değiştirildi' });
    const source = { subtitleSourceIndex: 1, start: 4, end: 6, text: 'Hedef' };
    const out = await ctx.merge('p.srt', 'srt', source, 'x', []);
    assert.equal(out.ok, false);
  });

  await test_async('birleştirme: VTT cue kimliği ve ASS stili güncel sürümde korunur', async () => {
    const vtt = 'WEBVTT\n\ncue-a\n00:00:01.000 --> 00:00:03.000\nBir\n\ncue-b\n00:00:04.000 --> 00:00:06.000\nHedef';
    const { ctx, calls } = mergeCtx({ ok: true, text: vtt, mtimeMs: 5, size: 1 }, { ok: true });
    const source = { subtitleSourceIndex: 1, start: 4, end: 6, text: 'Hedef' };
    const out = await ctx.merge('p.vtt', 'vtt', source, 'Yeni', []);
    assert.equal(out.ok, true);
    assert.ok(calls[0].payload.includes('cue-a') && calls[0].payload.includes('cue-b'),
      'VTT cue kimlikleri kayboldu');
    const ass = '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
      + 'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Bir\n'
      + 'Dialogue: 0,0:00:04.00,0:00:06.00,Ust,K,0,0,0,,Hedef';
    const r2 = mergeCtx({ ok: true, text: ass, mtimeMs: 5, size: 1 }, { ok: true });
    const out2 = await r2.ctx.merge('p.ass', 'ass', { subtitleSourceIndex: 1, start: 4, end: 6, text: 'Hedef' }, 'Yeni', []);
    assert.equal(out2.ok, true);
    assert.ok(r2.calls[0].payload.includes(',Ust,K,'), 'ASS stil/ad alanları bozuldu');
  });

  test('saveCueEdit: dışarıdan-değişim hatası birleştirme yoluna bağlanır (statik kilit)', () => {
    const save = slice('async function saveCueEdit()', 'function youtubeCookieBrowser');
    assert.ok(save.includes('mergeCueEditOntoExternal(targetPath'), 'birleştirme çağrısı eksik');
    assert.ok(/dışarıdan değiştirildi/.test(save), 'dışarıdan-değişim yakalaması eksik');
    assert.ok(save.includes('closeCueEditor()'), 'başarılı birleştirme düzenleyiciyi kapatmalı');
  });

  test('mergeCueEditOntoExternal: birleştirme günlük eylemi ayırt edilir (statik kilit)', () => {
    assert.ok(mergeSlice.includes("action: 'edit-merge'"),
      'birleştirme yazıları günlükte edit-merge olarak ayırt edilmeli');
    assert.ok(/findIndex\([\s\S]*subtitleSourceIndex/.test(mergeSlice)
      && mergeSlice.includes('<= tol'), 'hedef cue kaynak-indeksi veya ±2ms ile eşleşmeli');
  });
}

function test_async(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    passed++; console.log(`ok ${passed + failed} - ${name}`);
  }).catch((error) => {
    failed++; console.error(`not ok ${passed + failed} - ${name}\n  ${error.stack || error}`);
  });
}

mergeTests().then(() => {
  console.log(`\n${passed} geçti, ${failed} düştü`);
  if (failed) process.exit(1);
});
