const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// R394: 4k-10k satirlik transkriptte olculen darbogazlarin kilitlenmesi.
// Oncesi: renderCue ~36ms/kare (updateCueMeta'nin tum-cue taramalari),
// arama tus basina ~88ms (her tus vurusunda 2x8k foldIndex). Simdi:
// foldIndexCached icerik-adresli katlama + cueMetaStats memoizasyonu.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed + failed} - ${name}`); }
  catch (error) { failed++; console.error(`not ok ${passed + failed} - ${name}\n  ${error.stack || error}`); }
}
function slice(from, to) {
  const start = renderer.indexOf(from);
  assert(start >= 0, 'baslangic bulunamadi: ' + from);
  const end = renderer.indexOf(to, start);
  assert(end > start, 'bitis bulunamadi: ' + to);
  return renderer.slice(start, end);
}

const slices = [
  slice('const cueSignatureCache', 'function subtitleStatFor'),
  slice('function translationsForCues(', 'function appendHighlighted'),
  slice('function foldSearch(value)', 'function updateSubtitleChips'),
  slice('let _cueMetaStats = null;', 'function updateCueMeta()'),
  slice('function cueLooksUntranslated(', 'function untranslatedCueBanner('),
].join('\n');

function mkCtx() {
  const player = { cues: [], cues2: [], savedCues: [] };
  const ctx = { player, console };
  vm.createContext(ctx);
  vm.runInContext(slices + `
    this.sig = cueSignature;
    this.stats = cueMetaStats;
    this.foldC = foldIndexCached;
    this.foldRaw = foldIndex;
    this.untr = cueLooksUntranslated;
    this.tfc = translationsForCues;`, ctx);
  return ctx;
}

const mkCues = (n) => Array.from({ length: n }, (_, i) => ({
  start: i * 5, end: i * 5 + 4.5, text: `Satir ${i} ornek icerik`,
}));

test('foldIndexCached ayni metin icin ayni nesneyi dondurur (icerik-adresli)', () => {
  const ctx = mkCtx();
  const a = ctx.foldC('Ayni metin');
  const b = ctx.foldC('Ayni metin');
  const c = ctx.foldC('Farkli metin');
  assert.equal(a, b, 'ayni metin yeniden katlanmamali');
  assert.notEqual(a, c, 'farkli metin farkli indeks uretmeli');
  assert.equal(a.dense, ctx.foldRaw('Ayni metin').dense, 'sonuc foldIndex ile birebir ayni olmali');
});

test('cueMetaStats girdi degismedikce yeniden hesaplamaz (referans esitligi)', () => {
  const ctx = mkCtx();
  ctx.player.cues = mkCues(8000);
  ctx.player.cues2 = mkCues(8000).map((c) => ({ ...c, text: 'Ceviri ' + c.text }));
  const s1 = ctx.stats();
  const s2 = ctx.stats();
  assert.equal(s1, s2, 'degismeyen girdi icin onbellege alinmis sonuc donmeli');
  assert.equal(typeof s1.savedCount, 'number');
  assert.equal(typeof s1.lowCount, 'number');
  assert.equal(typeof s1.missing, 'number');
});

test('cueMetaStats cues/savedCues degisince yeniden hesaplar', () => {
  const ctx = mkCtx();
  ctx.player.cues = mkCues(100);
  const s1 = ctx.stats();
  ctx.player.cues = ctx.player.cues.slice();         // yeni dizi → yeni hesap
  const s2 = ctx.stats();
  assert.notEqual(s1, s2);
  ctx.player.savedCues.push(ctx.sig(ctx.player.cues[0])); // boyut degisimi → yeni hesap
  const s3 = ctx.stats();
  assert.notEqual(s2, s3);
  assert.equal(s3.savedCount, 1, 'kayitli sayimi dogru olmali');
});

test('cueMetaStats 8000 satirda tarama dogru sonuc uretir', () => {
  const ctx = mkCtx();
  ctx.player.cues = mkCues(8000);
  ctx.player.cues[10].confidence = 0.3;
  ctx.player.cues[20].lowConfidenceWords = 2;
  ctx.player.cues2 = mkCues(8000).map((c, i) => ({ ...c, text: i === 30 ? ctx.player.cues[30].text : 'ceviri ' + i }));
  const s = ctx.stats();
  assert.equal(s.lowCount, 2);
  assert.equal(s.missing, 1, 'yalniz kaynakla birebir ayni satir cevrilmemis sayilmali');
});

test('ikinci stats cagrisi 8000 satirda O(1) (yeniden hesaplama yok)', () => {
  const ctx = mkCtx();
  ctx.player.cues = mkCues(8000);
  ctx.player.cues2 = mkCues(8000);
  ctx.stats();
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) ctx.stats();
  const dt = performance.now() - t0;
  assert.ok(dt < 50, `1000 onbellekli cagri ${dt.toFixed(1)}ms — yeniden tarama oluyor`);
});

console.log(`\ncue-list-perf: ${passed} gecti, ${failed} basarisiz`);
if (failed) process.exit(1);
