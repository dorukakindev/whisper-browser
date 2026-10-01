// Kuyruk-50 madde 19 — yerel oynatıcı takılma teşhisi.
// analyzeLocalStutter: ağ / video çözme / renderer sinyallerini tek karara
// indirger; localBufferedAhead: tamponlanan "ileride süre" hesabı.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const START = SRC.indexOf('// ---- Takılma teşhis paneli');
const END = SRC.indexOf('// ---- Altyazı listesi');
assert.ok(START > 0 && END > START, 'probe kodu bulunamadı');
const ctx = { Math, Number, isFinite, Number: Number };
vm.createContext(ctx);
vm.runInContext(SRC.slice(START, END), ctx);
const analyzeLocalStutter = ctx.analyzeLocalStutter;
const localBufferedAhead = ctx.localBufferedAhead;

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- analyzeLocalStutter verdict matrisi ---
const healthy = { seconds: 30, droppedRatio: 0.001, stalls: 0, bufferAvg: 8, renderAvg: 1.2, renderP95: 3, frameGapP95: 34 };
check('sağlıklı pencere → ok', analyzeLocalStutter(healthy).verdict === 'ok');
check('kısa pencere → insufficient', analyzeLocalStutter({ ...healthy, seconds: 2 }).verdict === 'insufficient');
check('saniye 0 → insufficient', analyzeLocalStutter({ seconds: 0 }).verdict === 'insufficient');
check('tanımsız giriş → insufficient', analyzeLocalStutter(null).verdict === 'insufficient');
check('kısa pencerede sinyal var bile insufficient + sinyal listesi boş',
  (() => { const r = analyzeLocalStutter({ seconds: 3, droppedRatio: 0.9 }); return r.verdict === 'insufficient' && r.signals.length === 0; })());

// Ağ: tamponlama + düşük ileride süre
check('stalled + düşük buffer → network', analyzeLocalStutter({ ...healthy, stalls: 3, bufferAvg: 0.8 }).verdict === 'network');
check('stall yok ama buffer <0.5s → network', analyzeLocalStutter({ ...healthy, stalls: 0, bufferAvg: 0.3 }).verdict === 'network');
check('stall var ama buffer sağlıklı → tek başına network değil',
  analyzeLocalStutter({ ...healthy, stalls: 2, bufferAvg: 6 }).signals.includes('network') === false);

// Çözme: kare düşüş oranı veya kare-aralığı jitter'ı
check('düşüş oranı %3+ → decode', analyzeLocalStutter({ ...healthy, droppedRatio: 0.05 }).verdict === 'decode');
check('kare-p95 80ms+ ve hafif düşüş → decode', analyzeLocalStutter({ ...healthy, frameGapP95: 90, droppedRatio: 0.006 }).verdict === 'decode');
check('jitter tek başına (düşüş 0) → decode değil',
  analyzeLocalStutter({ ...healthy, frameGapP95: 120, droppedRatio: 0 }).signals.includes('decode') === false);

// Renderer: altyazı çizim maliyeti
check('çizim ortalaması 8ms+ → renderer', analyzeLocalStutter({ ...healthy, renderAvg: 12 }).verdict === 'renderer');
check('çizim p95 16ms+ → renderer', analyzeLocalStutter({ ...healthy, renderP95: 20 }).verdict === 'renderer');

// Karışık
check('çözme + ağ birlikte → mixed', analyzeLocalStutter({ ...healthy, droppedRatio: 0.06, stalls: 4, bufferAvg: 0.4 }).verdict === 'mixed');
check('signals dizisi doldurulur',
  JSON.stringify(analyzeLocalStutter({ ...healthy, droppedRatio: 0.06, renderAvg: 20 }).signals) === '["renderer","decode"]');

// Sınır değerler
check('düşüş tam %3 eşiğinde → decode', analyzeLocalStutter({ ...healthy, droppedRatio: 0.03 }).verdict === 'decode');
check('düşüş %2.9 → ok', analyzeLocalStutter({ ...healthy, droppedRatio: 0.029 }).verdict === 'ok');
check('buffer tam 0.5 eşiğinde → network değil (strict <)',
  analyzeLocalStutter({ ...healthy, bufferAvg: 0.5 }).signals.includes('network') === false);
check('negatif/NaN girişler güvenle işlenir',
  analyzeLocalStutter({ seconds: NaN, droppedRatio: -1, stalls: -3 }).verdict === 'insufficient');

// --- localBufferedAhead ---
function fakeVideo(currentTime, ranges) {
  return { currentTime, buffered: { length: ranges.length, start: (i) => ranges[i][0], end: (i) => ranges[i][1] } };
}
check('imlecin içinde olduğu aralığın kalanı', localBufferedAhead(fakeVideo(10, [[0, 20]])) === 10);
check('gelecekteki aralık (seek sonrası boşluk)', localBufferedAhead(fakeVideo(5, [[0, 4], [10, 40]])) === 35);
check('tüm aralıklar geride kaldı → 0', localBufferedAhead(fakeVideo(50, [[0, 10], [20, 40]])) === 0);
check('boş buffered → 0', localBufferedAhead(fakeVideo(5, [])) === 0);
check('tanımsız video → 0', localBufferedAhead(null) === 0);
check('currentTime NaN güvenli', Number.isFinite(localBufferedAhead({ currentTime: NaN, buffered: { length: 1, start: () => 0, end: () => 9 } })));

console.log(`local-stutter-probe: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
