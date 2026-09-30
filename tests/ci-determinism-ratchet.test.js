'use strict';
// R295: CI determinizm ratchet'i — testlerde duvar-saat/rastgele bağımlılığı
// ancak AZALABİLİR. Sayaçların baseline'ı fixtures/ci-determinism-baseline.txt
// dosyasındadır (css-hardcoded-color-baseline ile aynı sözleşme).
//
// İzlenen desenler:
// - Math.random(    : testlerde sıfır olmalı — deterministik olmayan girdi yok.
//                     (fixture dosyaları dahil; tohum kullanımı istisna değildir.)
// - setTimeout(r,N) : "uyuyup umarım olur" bekleme deseni; koşul yoklaması
//                     kullanılmalı. Sayı yalnız azalabilir.
// - Date.now()/performance.now() üzerine assert: duvar-saatine bağlı performans
//                     iddiası — yavaş CI'da kırılgan. Sayı yalnız azalabilir.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const testsDir = __dirname;
const files = fs.readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.js') && f !== 'ci-determinism-ratchet.test.js')
  .map((f) => ({ rel: f, src: fs.readFileSync(path.join(testsDir, f), 'utf8') }));

const baseline = {};
for (const line of fs.readFileSync(path.join(testsDir, 'fixtures', 'ci-determinism-baseline.txt'), 'utf8').split('\n')) {
  const m = line.match(/^([a-z_]+)=(\d+)\s*$/);
  if (m) baseline[m[1]] = Number(m[2]);
}
assert.deepEqual(Object.keys(baseline).sort(),
  ['aux_math_random', 'math_random', 'sleep_waits', 'wallclock_asserts'],
  'baseline dosyası bozuk — beklenen 4 anahtar');

// Math.random: test dosyaları + fixtures'lar birlikte sayılır (hepsi deterministik olmalı).
const fixtureDir = path.join(testsDir, 'fixtures');
const fixtureFiles = fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir)
  .filter((f) => /\.(js|py)$/.test(f))
  .map((f) => ({ rel: `fixtures/${f}`, src: fs.readFileSync(path.join(fixtureDir, f), 'utf8') })) : [];

const allFiles = [...files, ...fixtureFiles].filter(({ rel }) => rel !== 'ci-determinism-ratchet.test.js');
let mathRandom = 0;
for (const { rel, src } of allFiles) {
  for (const m of src.matchAll(/Math\.random\s*\(/g)) { mathRandom += 1;
    assert.fail(`Math.random yasak: ${rel}`); }
}
assert.ok(mathRandom <= baseline.math_random,
  `Math.random sayısı ${mathRandom} > baseline ${baseline.math_random}`);

// Electron smoke'ları + yardımcı çalıştırıcılar (.test.js olmayan tests/*.js):
// rastgele port seçimi gibi meşru kullanımlar baseline'a kilitlidir — sayı
// yalnız azalabilir, .test.js dosyalarındaki katı yasak değişmez.
const auxFiles = fs.readdirSync(testsDir)
  .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
  .map((f) => ({ rel: f, src: fs.readFileSync(path.join(testsDir, f), 'utf8') }));
const auxMathRandom = auxFiles.reduce(
  (n, { src }) => n + (src.match(/Math\.random\s*\(/g) || []).length, 0);
assert.ok(auxMathRandom <= baseline.aux_math_random,
  `yardımcı dosyalarda Math.random sayısı ${auxMathRandom} > baseline ${baseline.aux_math_random}`);

const count = (re) => files.reduce((n, { src }) => n + (src.match(re) || []).length, 0);

const sleeps = count(/setTimeout\(\s*(?:resolve|r|res)\b/g);
assert.ok(sleeps <= baseline.sleep_waits,
  `uyku-bekleme sayısı ${sleeps} > baseline ${baseline.sleep_waits} — koşul yoklaması kullanın`);

// Doğrudan saat çağrısı + Date.now()'dan türetilen `elapsed` değişkenine
// yapılan süre-sınırı assert'leri (assert(elapsed < N) deseni — kaynak
// metni regex'i içindeki 'elapsed' eşleşmez: assert.match/regex'i kapsamaz).
const wallclock = count(/assert[^\n]*(?:Date\.now|performance\.now)/g)
  + count(/assert(?:\.ok|\.equal|\.strictEqual)?\(\s*elapsed\s*[<>]/g);
assert.ok(wallclock <= baseline.wallclock_asserts,
  `duvar-saati assert sayısı ${wallclock} > baseline ${baseline.wallclock_asserts}`);

console.log(`PASS: ci-determinism-ratchet (random=${mathRandom}/${baseline.math_random}, aux_random=${auxMathRandom}/${baseline.aux_math_random}, sleep=${sleeps}/${baseline.sleep_waits}, wallclock=${wallclock}/${baseline.wallclock_asserts})`);
