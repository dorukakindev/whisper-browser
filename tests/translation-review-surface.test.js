const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Kuyruk-50 batch-3 (madde 11–15): çeviri inceleme yüzeyi davranış kilitleri.
// Fonksiyonlar renderer.js'ten kesilip vm'de çalışır — metin kilidi değil
// davranış kanıtı: sözlük önceliği, aralık hesabı, maliyet tahmini, kalite
// gruplama ve A/B varyant bekçileri.
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
const glossarySlice = slice('let projectGlossaries = {};', 'function renderGlossary()')
  + slice('function glossaryCombined()', 'function renderGlossary()');
const qualitySlice = slice('const QUALITY_ISSUE_KINDS', 'function reviewItems()');
const rangeSlice = slice('function timelineRangeIndices(', 'async function startRangeRetranslate(');
const costSlice = slice('function translateCostEstimate(', 'function renderTranslateCost()');
const abSlice = slice('function abCompareLog(', 'async function runAbCompare(')
  + slice('function runAbVariant(', 'function abCompareLog(');

function makeNode() {
  const classes = new Set();
  return {
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    _classes: classes, disabled: false, textContent: '', value: '', title: '',
    setAttribute: () => {}, addEventListener: () => {},
  };
}

function baseCtx(extra = {}) {
  const nodes = {};
  const ctx = {
    console,
    player: {
      mediaKey: 'media-1',
      timeline: { range: null },
      cues: [
        { start: 1.0, end: 2.0, text: 'a' },
        { start: 2.0, end: 3.5, text: 'b' },
        { start: 4.0, end: 6.0, text: 'c' },
        { start: 7.0, end: 8.0, text: 'd' },
      ],
      cueQualitySource: [],
    },
    state: { running: false, queueRunning: false, lastQualityReport: null },
    glossary: ['Alpha', 'beta'],
    uiText: (s) => s,
    $: (id) => (nodes[id] ||= makeNode()),
    _nodes: nodes,
    localStorage: {
      _m: {},
      getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); },
    },
    pSecToTime: (s) => `${s.toFixed(3)}`,
    logLine: () => {},
    saveAppSettings: () => {},
    ...extra,
  };
  vm.createContext(ctx);
  return ctx;
}

// --- Sözlük (madde 12) -----------------------------------------------------

function glossaryCtx(extra = {}) {
  const ctx = baseCtx(extra);
  vm.runInContext(glossarySlice
    + '\nthis.combined = glossaryCombined; this.active = glossaryActiveList;'
    + 'this.setScope = (s) => { glossaryScope = s; };'
    + 'this.setProject = (m) => { projectGlossaries = m; };', ctx);
  return ctx;
}

test('glossaryCombined: proje terimi önce, küçük-harf dedupe sonrası genel', () => {
  const ctx = glossaryCtx();
  ctx.setProject({ 'media-1': ['Beta', 'Gamma'] });
  assert.deepEqual([...ctx.combined()], ['Beta', 'Gamma', 'Alpha']);
});

test('glossaryCombined: proje sözlüğü boşken yalnız genel döner', () => {
  const ctx = glossaryCtx();
  assert.deepEqual([...ctx.combined()], ['Alpha', 'beta']);
});

test('glossaryActiveList: proje sekmesinde mediaKey yoksa genel liste', () => {
  const ctx = glossaryCtx({ player: { mediaKey: '', timeline: { range: null } } });
  ctx.setScope('project');
  assert.deepEqual([...ctx.active()], ['Alpha', 'beta']);
});

test('glossaryActiveList: proje sekmesi + mediaKey → medya listesi oluşur', () => {
  const ctx = glossaryCtx();
  ctx.setScope('project');
  assert.deepEqual([...ctx.active()], []);
  ctx.setProject({ 'media-1': ['Term'] });
  assert.deepEqual([...ctx.active()], ['Term']);
});

// --- Kalite grupları (madde 15) ---------------------------------------------

test('qualityIssueGroups: yalnız dolu indeks dizileri, sayıya dökülmüş', () => {
  const ctx = baseCtx({
    state: {
      running: false, queueRunning: false,
      lastQualityReport: {
        translation_untranslated_indices: ['3', 7],
        translation_number_mismatch_indices: [1],
        translation_empty_indices: [],
      },
    },
  });
  vm.runInContext(qualitySlice + '\nthis.groups = qualityIssueGroups;', ctx);
  const groups = ctx.groups();
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, 'translation_untranslated_indices');
  assert.deepEqual([...groups[0].indices], [3, 7]);
  assert.equal(groups[1].label, 'sayı uyuşmazlığı');
});

test('qualityIssueGroups: rapor yoksa boş', () => {
  const ctx = baseCtx();
  vm.runInContext(qualitySlice + '\nthis.groups = qualityIssueGroups;', ctx);
  assert.deepEqual([...ctx.groups()], []);
});

// --- Aralık seçimi (madde 11) -------------------------------------------------

test('timelineRangeSeconds: cue dizinine kelepçeler, kesişim ±1ms toleranslı', () => {
  const ctx = baseCtx();
  ctx.player.timeline.range = { a: 1, b: 2 };
  vm.runInContext(rangeSlice
    + '\nthis.rangeIdx = timelineRangeIndices; this.rangeSec = timelineRangeSeconds;', ctx);
  // cue[1] 2.0-3.5 ve cue[2] 4.0-6.0 → a=1,b=2 cue 1..2 kapsar
  const sec = ctx.rangeSec();
  assert.equal(sec.lo, 2.0);
  assert.equal(sec.hi, 6.0);
  assert.equal(sec.count, 2);
  assert.deepEqual([...sec.indices], [1, 2]);
});

test('timelineRangeSeconds: aralık yoksa null döner', () => {
  const ctx = baseCtx();
  vm.runInContext(rangeSlice + '\nthis.rangeSec = timelineRangeSeconds;', ctx);
  assert.equal(ctx.rangeSec(), null);
});

test('timelineRangeIndices: negatif uçlar 0..N-1 içine kelepçelenir', () => {
  const ctx = baseCtx();
  ctx.player.timeline.range = { a: -5, b: 99 };
  vm.runInContext(rangeSlice + '\nthis.rangeIdx = timelineRangeIndices;', ctx);
  assert.deepEqual([...ctx.rangeIdx()], [0, 1, 2, 3]);
});

// --- Maliyet görünümü (madde 14) ----------------------------------------------

test('translateCostEstimate: fiyat girilmediyse boş, girince ~$ tahmini', () => {
  const ctx = baseCtx();
  vm.runInContext(costSlice
    + '\nthis.est = translateCostEstimate; this.statsText = translateStatsText;', ctx);
  const stats = { promptChars: 4000, completionChars: 2000 };
  assert.equal(ctx.est(stats), '');
  ctx.$('translatePriceIn').value = '1.00';   // $1 / 1M tok
  ctx.$('translatePriceOut').value = '2.00';  // $2 / 1M tok
  // inTok=1000, outTok=500 → 0.001 + 0.001 = 0.002 → toFixed(4)
  assert.equal(ctx.est(stats), '~$0.0020');
});

test('translateStatsText: istek+önbellek+karakter+ücret+süre birleşimi', () => {
  const ctx = baseCtx();
  vm.runInContext(costSlice + '\nthis.statsText = translateStatsText;', ctx);
  ctx.$('translatePriceIn').value = '1.00';
  const text = ctx.statsText({
    requests: 5, cacheHits: 3, promptChars: 2000, completionChars: 0, elapsed: 12.4,
  });
  assert.equal(text, '5 istek · 3 önbellek · 2k karakter · ~$0.0005 · 12 sn');
});

test('translateStatsText: stats yoksa boş', () => {
  const ctx = baseCtx();
  vm.runInContext(costSlice + '\nthis.statsText = translateStatsText;', ctx);
  assert.equal(ctx.statsText(null), '');
});

// --- A/B varyant bekçileri (madde 13) ------------------------------------------

test('abCompareLog: localStorage\'a ekler, 50 kayıtta keser, bozuk veriye dayanıklı', () => {
  const ctx = baseCtx();
  vm.runInContext(abSlice + '\nthis.log = abCompareLog;', ctx);
  ctx.localStorage.setItem('whisper-ab-compare-log', '{bozuk');
  ctx.log({ a: 1 });
  const parsed = JSON.parse(ctx.localStorage.getItem('whisper-ab-compare-log'));
  assert.equal(parsed.length, 1);
  for (let i = 0; i < 60; i++) ctx.log({ i });
  assert.equal(JSON.parse(ctx.localStorage.getItem('whisper-ab-compare-log')).length, 50);
});

test('runAbVariant: çeviri düğmesi kapalıyken state kirletmeden null çözer', async () => {
  const ctx = baseCtx({ state: { running: true, queueRunning: false } });
  vm.runInContext(abSlice + '\nthis.variant = runAbVariant;', ctx);
  ctx._nodes.makeTransBtn.disabled = true;
  const result = await ctx.variant('model-b', { lo: 1, hi: 2 }, 'ab-b');
  assert.equal(result, null);
  assert.equal(ctx.state.abCollect, undefined);
  assert.equal(ctx.state.translateCueRange, undefined);
});

test('runAbVariant: düğme açıksa aralık+model+etiket state\'e yazılır ve tıklanır', async () => {
  const ctx = baseCtx();
  let clicked = false;
  ctx._nodes.makeTransBtn.click = () => {
    clicked = true;
    // İş hemen done'a uğramış gibi davran: abCollect çöz.
    ctx.state.abCollect.resolve({ cues: {}, file: 'film.tr.ab-a.srt' });
  };
  vm.runInContext(abSlice + '\nthis.variant = runAbVariant;', ctx);
  const result = await ctx.variant('model-a', { lo: 1.2345, hi: 2.3456 }, 'ab-a');
  assert.equal(clicked, true);
  assert.equal(result.file, 'film.tr.ab-a.srt');
  assert.equal(ctx.state.translateCueRange, '1.234:2.346');
  assert.equal(ctx.state.translateModelOverride, 'model-a');
  assert.equal(ctx.state.translateVariantLabel, 'ab-a');
});

console.log(`\n${passed} geçti, ${failed} kaldı`);
process.exit(failed ? 1 : 0);
