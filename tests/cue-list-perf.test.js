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
  slice('const _cueIndexCache', 'function applyPlaybackLearningPolicy('),
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
    this.tfc = translationsForCues;
    this.findAt = findCueAt;
    this.linearFind = (cues, t) => {
      let best = -1;
      for (let j = 0; j < cues.length; j++) {
        const c = cues[j];
        if (c && c.start <= t && c.end > t) best = j;
      }
      return best;
    };`, ctx);
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

test('findCueAt sonucu dogrusal oracle ile birebir (10k, cakismali)', () => {
  const ctx = mkCtx();
  const cues = mkCues(10000);
  // Kasti cakisma/ortusme/Negatif zaman/bos aralik senaryolari
  cues[500].end = 999999;                    // devasa uzun cue — tum zamanlarda aday
  cues[1234].start = cues[1233].start - 1;   // onceden baslayan cakisma
  cues[7000] = { start: cues[6999].start, end: cues[6999].end, text: 'es-zamanli' };
  const times = [-1, 0, 2.5, 100.3, 2499.99, 2500, 49999, 1e9, -1e9, 35000.001];
  for (const t of times) {
    assert.equal(ctx.findAt(cues, t, -1), ctx.linearFind(cues, t), `t=${t}`);
    assert.equal(ctx.findAt(cues, t, 0), ctx.linearFind(cues, t), `t=${t} hint=0`);
  }
  // Tum indeks uzerinde tik yakinsi parity
  for (let t = 0; t < 50; t += 0.37) {
    const want = ctx.linearFind(cues.slice(0, 200), t);
    assert.equal(ctx.findAt(cues.slice(0, 200), t, -1), want, `t=${t}`);
  }
});

test('findCueAt 10k satirda seek+tick O(log n): isabet-missi pahali degil', () => {
  const ctx = mkCtx();
  const cues = mkCues(10000);
  // Isinma: indeks kurulur
  ctx.findAt(cues, 1, -1);
  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < 2000; i++) acc += ctx.findAt(cues, (i * 23.7) % 50000, -1);
  const dt = performance.now() - t0;
  assert.ok(dt < 250, `2000 rastgele seek ${dt.toFixed(1)}ms — indeks yerine tarama oluyor`);
  assert.ok(Number.isInteger(acc));
});

test('findCueAt yerinde mutasyondan sonra bayat indeks donmez (_cueIndexVersion)', () => {
  const ctx = mkCtx();
  const cues = mkCues(5000);
  assert.equal(ctx.findAt(cues, 100.0, -1), 20);   // 20*5=100
  cues[20].end = 95;                              // cue 20 artik t'den once bitiyor
  cues._cueIndexVersion = (cues._cueIndexVersion || 0) + 1;
  assert.equal(ctx.findAt(cues, 100.0, -1), ctx.linearFind(cues, 100.0));
});

console.log(`\ncue-list-perf: ${passed} gecti, ${failed} basarisiz`);
if (failed) process.exit(1);
