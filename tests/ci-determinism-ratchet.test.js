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
assert.deepEqual(Object.keys(baseline).sort(), ['math_random', 'sleep_waits', 'wallclock_asserts'],
  'baseline dosyası bozuk — beklenen 3 anahtar');

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

const count = (re) => files.reduce((n, { src }) => n + (src.match(re) || []).length, 0);

const sleeps = count(/setTimeout\(\s*(?:resolve|r|res)\b/g);
assert.ok(sleeps <= baseline.sleep_waits,
  `uyku-bekleme sayısı ${sleeps} > baseline ${baseline.sleep_waits} — koşul yoklaması kullanın`);

const wallclock = count(/assert[^\n]*(?:Date\.now|performance\.now)/g);
assert.ok(wallclock <= baseline.wallclock_asserts,
  `duvar-saati assert sayısı ${wallclock} > baseline ${baseline.wallclock_asserts}`);

console.log(`PASS: ci-determinism-ratchet (random=${mathRandom}/${baseline.math_random}, sleep=${sleeps}/${baseline.sleep_waits}, wallclock=${wallclock}/${baseline.wallclock_asserts})`);
