// Kuyruk-50 madde 20 — oynatma saati tutarlılığı doğrulama katmanı.
// analyzeClockDrift: {w, m, r} örnek halkasından video saati ↔ duvar saati
// sürüklenmesini ayıklar; atlama/duraklatma/hız değişimi aralıklarını eler.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const START = SRC.indexOf('// ---- Oynatma saati tutarlılığı');
const END = SRC.indexOf('function startLocalStutterProbe');
assert.ok(START > 0 && END > START, 'drift kodu bulunamadı');
const ctx = { Math, Number, isFinite, console };
vm.createContext(ctx);
vm.runInContext(SRC.slice(START, END), ctx);
const analyzeClockDrift = ctx.analyzeClockDrift;

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// 0.25 sn aralıklarla <n> örnek üret; medya saati `rate`×duvar hızında ilerler.
function mkSamples(n, mediaRate, expectedRate = 1, startW = 0, startM = 0) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push({ w: startW + i * 250, m: startM + i * 0.25 * mediaRate, r: expectedRate });
  return arr;
}

// --- sağlıklı: medya saati = playbackRate × duvar ---
check('senkron ilerleme → stable', analyzeClockDrift(mkSamples(80, 1, 1), 1).verdict === 'stable');
check('2x hızda senkron → stable', analyzeClockDrift(mkSamples(80, 2, 2), 2).verdict === 'stable');
check('küçük sapma (%1.5) → stable', analyzeClockDrift(mkSamples(80, 1.015, 1), 1).verdict === 'stable');

// --- drift: medya saati playbackRate'ten farklı koşar ---
const fast = analyzeClockDrift(mkSamples(80, 1.05, 1), 1);
check('medya %5 hızlı → drift', fast.verdict === 'drift');
check('driftPct ~5', Math.abs(fast.driftPct - 5) < 0.2);
check('observedRate ~1.05', Math.abs(fast.observedRate - 1.05) < 0.005);
const slow = analyzeClockDrift(mkSamples(80, 0.96, 1), 1);
check('medya %4 yavaş → drift', slow.verdict === 'drift' && slow.drift < 0);
check('tam %2 eşiğinde → drift', analyzeClockDrift(mkSamples(80, 1.02, 1), 1).verdict === 'drift');
check('%1.9 → stable', analyzeClockDrift(mkSamples(80, 1.019, 1), 1).verdict === 'stable');

// --- kesintiler elenir ---
// Atlamadan sonra medya 30 sn ileri fırlar — o aralık sayılmaz.
let s = mkSamples(40, 1, 1);
s.push({ w: 40 * 250, m: 40 * 0.25 + 30, r: 1 });
s = s.concat(mkSamples(40, 1, 1, 41 * 250, 40 * 0.25 + 30));
check('seek atlaması drift\'i şişirmez', analyzeClockDrift(s, 1).verdict === 'stable');
// Duraklatma: 10 sn duvar boşluğu.
let s2 = mkSamples(40, 1, 1);
s2 = s2.concat(mkSamples(40, 1, 1, 40 * 250 + 10000, 40 * 0.25));
check('duraklatma boşluğu elenir', analyzeClockDrift(s2, 1).verdict === 'stable');
// Hız değişimi aralığı r farkıyla kesilir.
let s3 = mkSamples(40, 1, 1);
s3 = s3.concat(mkSamples(40, 1.02, 2, 40 * 250, 40 * 0.25));
s3.forEach((x, i) => { if (i >= 40) x.r = 2; });
const r3 = analyzeClockDrift(s3, 1);
check('hız değişimi kesintisi — iki taraf da temiz sayılır', r3.verdict === 'stable');

// --- yetersiz örnek ---
check('3 örnek → insufficient', analyzeClockDrift(mkSamples(3, 1.5, 1), 1).verdict === 'insufficient');
check('14 sn kısa pencere → insufficient', analyzeClockDrift(mkSamples(55, 1.2, 1), 1).verdict === 'insufficient');
check('boş/eksik giriş → insufficient', analyzeClockDrift([], 1).verdict === 'insufficient'
  && analyzeClockDrift(null, 0).verdict === 'insufficient');
check('kısa pencerede drift işaretlenmez', analyzeClockDrift(mkSamples(55, 1.2, 1), 1).drift === 0);
check('NaN/eksik örnek alanları güvenli elenir', (() => {
  const arr = mkSamples(80, 1, 1);
  arr[10] = { w: NaN, m: undefined, r: 1 };
  return analyzeClockDrift(arr, 1).verdict === 'stable';
})());

console.log(`local-clock-drift: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
