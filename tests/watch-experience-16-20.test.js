const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 50-kuyruk batch 4 (madde 16–20): izleme deneyimi yardımcılarının davranış
// kilidi — altyazı karşılaştırma hizalaması, dil-tercihi eşleşmesi, dizi
// anahtarı türetimi, bölüm ikili araması ve klasör eşleştirme planı.
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

// alignSubtitlePair'den openFolderMatchDialog'un bittiği yere kadar tüm blok.
const watchSlice = slice('function alignSubtitlePair(', "if (typeof $ === 'function') {");

function makeCtx(over = {}) {
  const player = { cues: [], cues2: [], subPath: '', sub2Path: '', ytInfo: null, watchPrefs: null, browserSeriesKey: '', localPath: '', hls: null, browserTracks: [] };
  const els = {};
  const ctx = {
    player,
    $: (id) => els[id] || null,
    _els: els,
    uiText: (v) => v,
    interfaceChoice: (tr) => tr,
    pSecToTime: (s) => `T${s}`,
    browserTrackSourceLanguage: (t) => t.language || '',
    audioLanguagesMatch: (a, b) => String(a || '').toLowerCase().split('-')[0] === String(b || '').toLowerCase().split('-')[0],
    ...over,
  };
  vm.createContext(ctx);
  vm.runInContext(watchSlice + `
    this._f = { alignSubtitlePair, subtitleCompareStats, subLangFromPath, langLabel,
      findTrackByLang, applySavedLanguagePrefs, seriesKeyFromLocalPath,
      seriesLabelFromKey, seriesKeyForPlayer, seriesWatchSubset, chapterAtTime,
      folderMatchScore, folderMatchPlan, updateSubCompareButton, SERIES_PREF_KEYS };
  `, ctx);
  return ctx;
}

// --- Madde 16: altyazı karşılaştırma hizalaması ----------------------------
test('alignSubtitlePair: örtüşen cue çiftleri drift ile eşleşir', () => {
  const ctx = makeCtx();
  const a = [{ start: 0, end: 2, text: 'A1' }, { start: 5, end: 7, text: 'A2' }];
  const b = [{ start: 0.5, end: 2.5, text: 'B1' }, { start: 5.2, end: 7.3, text: 'B2' }];
  const rows = ctx._f.alignSubtitlePair(a, b);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.a && r.b));
  assert.equal(Math.round(rows[0].driftMs), 500);
  assert.equal(Math.round(rows[1].driftMs), 200);
});

test('alignSubtitlePair: tolerans dışı → sadece-A / sadece-B satırları', () => {
  const ctx = makeCtx();
  const a = [{ start: 0, end: 2, text: 'A' }];
  const b = [{ start: 10, end: 12, text: 'B' }];
  const rows = ctx._f.alignSubtitlePair(a, b);
  assert.equal(rows.length, 2);
  assert.ok(rows[0].a && !rows[0].b);
  assert.ok(rows[1].b && !rows[1].a);
});

test('alignSubtitlePair: tolerans içinde ama örtüşmesiz (yakın başlangıç) eşleşir', () => {
  const ctx = makeCtx();
  const rows = ctx._f.alignSubtitlePair([{ start: 0, end: 1, text: 'A' }],
    [{ start: 2.5, end: 4, text: 'B' }]);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].a && rows[0].b);
  assert.equal(Math.round(rows[0].driftMs), 2500);
});

test('subtitleCompareStats: sayılar ve ortalama kayma', () => {
  const ctx = makeCtx();
  const stats = ctx._f.subtitleCompareStats([
    { a: {}, b: {}, driftMs: 100 }, { a: {}, b: {}, driftMs: 300 }, { a: {}, b: null }, { a: null, b: {} },
  ]);
  // vm realm nesnesi: deepEqual yerine alan-alan
  assert.equal(stats.matched, 2);
  assert.equal(stats.onlyA, 1);
  assert.equal(stats.onlyB, 1);
  assert.equal(stats.meanDriftMs, 200);
});

// --- Madde 17: dil tercihleri ----------------------------------------------
test('subLangFromPath: dil sonekini okur, yoksa boş', () => {
  const ctx = makeCtx();
  assert.equal(ctx._f.subLangFromPath('/x/film.tr.srt'), 'tr');
  assert.equal(ctx._f.subLangFromPath('/x/film.en-US.vtt'), 'en-us');
  assert.equal(ctx._f.subLangFromPath('/x/film.srt'), '');
  assert.equal(ctx._f.subLangFromPath(''), '');
  assert.equal(ctx._f.subLangFromPath(null), '');
});

test('findTrackByLang: tam ve taban-dil eşleşmesi', () => {
  const ctx = makeCtx();
  const tracks = [{ language: 'en-US' }, { language: 'tr' }];
  assert.equal(ctx._f.findTrackByLang(tracks, 'en', (t) => t.language).language, 'en-US');
  assert.equal(ctx._f.findTrackByLang(tracks, 'en-GB', (t) => t.language).language, 'en-US');
  assert.equal(ctx._f.findTrackByLang(tracks, 'fr', (t) => t.language), null);
  assert.equal(ctx._f.findTrackByLang(tracks, '', (t) => t.language), null);
});

test('applySavedLanguagePrefs: yt select tercihli dile kayar; yoksa ipucu', () => {
  const ctx = makeCtx();
  const ytSel = { options: [{ value: 'tr|0' }, { value: 'en|0' }], value: 'tr|0' };
  const hint = { textContent: '', classList: { toggle() { this._hidden = !arguments[0]; }, _hidden: true } };
  ctx._els.playerYtSubLang = ytSel;
  ctx._els.playerLangPrefHint = hint;
  ctx.player.watchPrefs = { subLang: 'en' };
  ctx._f.applySavedLanguagePrefs();
  assert.equal(ytSel.value, 'en|0');
  // yok olan dil → sessiz seçim yok, görünür uyarı
  ctx.player.watchPrefs = { subLang: 'fr' };
  ctx._f.applySavedLanguagePrefs();
  assert.equal(ytSel.value, 'en|0'); // önceki değer korunur
  assert.match(hint.textContent, /FR/);
});

test('applySavedLanguagePrefs: tarayıcı kaynak izi pref diline göre seçilir', () => {
  const ctx = makeCtx();
  const sel = { value: 'src-1' };
  ctx._els.browserTrackSelect = sel;
  ctx._els.playerLangPrefHint = { textContent: '', classList: { toggle() {} } };
  ctx.player.browserTracks = [
    { id: 'src-1', role: 'source', language: 'en' },
    { id: 'src-2', role: 'source', language: 'tr' },
    { id: 'tr-1', role: 'translation', language: 'tr' },
  ];
  ctx.player.watchPrefs = { subLang: 'tr' };
  ctx._f.applySavedLanguagePrefs();
  assert.equal(sel.value, 'src-2'); // çeviri izi değil, kaynak tr seçilir
});

// --- Madde 18: dizi anahtarı ------------------------------------------------
test('seriesKeyFromLocalPath: SxxEyy / NxNN / Bölüm / sondaki sayı', () => {
  const ctx = makeCtx();
  assert.equal(ctx._f.seriesKeyFromLocalPath('/tv/Show.Name.S01E02.1080p.mkv'), 'series:local:show-name');
  assert.equal(ctx._f.seriesKeyFromLocalPath('Show 1x02.mkv'), 'series:local:show');
  assert.equal(ctx._f.seriesKeyFromLocalPath('Dizi Bölüm 03.mkv'), 'series:local:dizi');
  assert.equal(ctx._f.seriesKeyFromLocalPath('Show - 12.mkv'), 'series:local:show');
  assert.equal(ctx._f.seriesKeyFromLocalPath('tek dosya.mkv'), null);
  assert.equal(ctx._f.seriesKeyFromLocalPath(''), null);
});

test('seriesLabelFromKey: local/youtube/browser biçimleri', () => {
  const ctx = makeCtx();
  assert.equal(ctx._f.seriesLabelFromKey('series:local:show-name'), 'show name');
  ctx.player.ytInfo = { author: 'Kanal X' };
  assert.equal(ctx._f.seriesLabelFromKey('series:youtube:UC123'), 'Kanal X');
  assert.equal(ctx._f.seriesLabelFromKey('site.com|Dizi Adı'), 'Dizi Adı');
  assert.equal(ctx._f.seriesLabelFromKey(''), '');
});

test('seriesWatchSubset: yalnız izinli anahtarlar kopyalanır', () => {
  const ctx = makeCtx();
  const sub = ctx._f.seriesWatchSubset({ speed: 1.25, subLang: 'en', rastgele: 'x', playlist: [] });
  assert.equal(Object.keys(sub).length, 2);
  assert.equal(sub.speed, 1.25);
  assert.equal(sub.subLang, 'en');
  // null/girdi olmaması çökmemeli — boş nesne döner
  assert.equal(Object.keys(ctx._f.seriesWatchSubset(null)).length, 0);
});

test('seriesKeyForPlayer: browserSeriesKey > localPath > ytInfo', () => {
  const ctx = makeCtx();
  ctx.player.browserSeriesKey = 'yt|Dizi';
  ctx.player.localPath = '/x/Show.S01E01.mkv';
  ctx.player.ytInfo = { authorId: 'UC9' };
  assert.equal(ctx._f.seriesKeyForPlayer(), 'yt|Dizi');
  ctx.player.browserSeriesKey = '';
  assert.equal(ctx._f.seriesKeyForPlayer(), 'series:local:show');
  ctx.player.localPath = '';
  assert.equal(ctx._f.seriesKeyForPlayer(), 'series:youtube:UC9');
  ctx.player.ytInfo = null;
  assert.equal(ctx._f.seriesKeyForPlayer(), null);
});

// --- Madde 19: bölüm ikili araması ------------------------------------------
test('chapterAtTime: sınırlar ve boş liste', () => {
  const ctx = makeCtx();
  ctx.player.chapters = [{ start: 0, title: 'A' }, { start: 60, title: 'B' }, { start: 120, title: 'C' }];
  assert.equal(ctx._f.chapterAtTime(30).title, 'A');
  assert.equal(ctx._f.chapterAtTime(60).title, 'B');
  assert.equal(ctx._f.chapterAtTime(119.9).title, 'B');
  assert.equal(ctx._f.chapterAtTime(9999).title, 'C');
  assert.equal(ctx._f.chapterAtTime(-1), null);
  ctx.player.chapters = [];
  assert.equal(ctx._f.chapterAtTime(5), null);
});

// --- Madde 20: klasör eşleştirme --------------------------------------------
test('folderMatchScore: kök/dil/episode jetonu', () => {
  const ctx = makeCtx();
  const f = ctx._f.folderMatchScore;
  assert.equal(f('film.mkv', 'film.tr.srt'), 100);
  assert.equal(f('Show.S01E02.mkv', 'Show.S01E02.eng.srt'), 100);
  assert.equal(f('Show.S01E02.mkv', 'Show.S01E02.srt'), 100);
  assert.equal(f('Show.S01E02.mkv', 'Show.S01E02.forced.srt'), 80);   // 'forced' 3+ harf, dil soneki sayılmaz → önek 80
  assert.equal(f('Show.S01E02.mkv', 'Show.S01E03.srt'), 0);
  assert.equal(f('Show.S01E02.mkv', 'Show.1x02.srt'), 60);   // farklı biçim, aynı bölüm
  assert.equal(f('film.mkv', 'film2.srt'), 0);
  assert.equal(f('a.mkv', 'unrelated.srt'), 0);
});

test('folderMatchPlan: sıralı adaylar + belirsizlik boş seçim', () => {
  const ctx = makeCtx();
  const bundle = {
    videos: [{ path: '/v/e1.mkv', name: 'e1.mkv' }, { path: '/v/e2.mkv', name: 'e2.mkv' }],
    subtitles: [
      { path: '/v/e1.tr.srt', name: 'e1.tr.srt' },
      { path: '/v/e1.en.srt', name: 'e1.en.srt' },
      { path: '/v/e2.srt', name: 'e2.srt' },
    ],
  };
  const plan = ctx._f.folderMatchPlan(bundle);
  assert.equal(plan.length, 2);
  const row1 = plan.find((r) => r.video.name === 'e1.mkv');
  // e1.tr ve e1.en ikisi de kök-eşit (100/100) → belirsiz, kullanıcıya bırakılır
  assert.equal(row1.ambiguous, true);
  assert.equal(row1.picked, null);
  const row2 = plan.find((r) => r.video.name === 'e2.mkv');
  assert.equal(row2.ambiguous, false);
  assert.equal(row2.picked, '/v/e2.srt');
});

test('updateSubCompareButton: iki kanal dolunca açılır', () => {
  const btn = { disabled: true };
  const ctx = makeCtx({ });
  ctx._els.subCompareBtn = btn;
  ctx._f.updateSubCompareButton();
  assert.equal(btn.disabled, true);
  ctx.player.cues = [{}];
  ctx._f.updateSubCompareButton();
  assert.equal(btn.disabled, true);
  ctx.player.cues2 = [{}];
  ctx._f.updateSubCompareButton();
  assert.equal(btn.disabled, false);
});

console.log(`\n${passed} geçti, ${failed} kaldı`);
process.exit(failed ? 1 : 0);
