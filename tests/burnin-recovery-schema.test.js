'use strict';

// burnin-recovery.json şema migrasyon sözlüğü: normalizeBurninRecovery'nin
// sürüm alanı davranışı ve v1 alan sözleşmesi kilitlenir. Sözlük:
//   eksik/bozuk sürüm   → v1 sayılır (eski yazıcılar alan yazmıyordu)
//   sürüm ≤ 1           → v1 parse
//   sürüm > 1           → null (alan anlamları değişmiş olabilir; yanlış
//                         yolla kurtarma yapmaktansa kurtarma yok sayılır)
// Ayrıca v1 alan toleransları (bilinmeyen anahtar düşürülür, tip-bozuk
// alanlar kelepçelenir) ve idempotans kilitlenir.

const assert = require('assert');
const {
  BURNIN_RECOVERY_SCHEMA_VERSION,
  normalizeBurninRecovery,
} = require('../src/burnin-output');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ✓', name); };

const ok = {
  videoPath: 'D:\\v\\film.mp4',
  subPath: 'D:\\v\\film.srt',
  tempPath: 'D:\\v\\film.altyazili.tok.tmp.mp4',
  outPath: 'D:\\v\\film.altyazili.mp4',
  pid: 4321,
  totalSec: 95,
  startedAt: 1720000000000,
};

test('v1 kanonik alanlar korunur', () => {
  const got = normalizeBurninRecovery({ version: 1, ...ok });
  assert(got && got.version === BURNIN_RECOVERY_SCHEMA_VERSION);
  assert.equal(got.videoPath, ok.videoPath);
  assert.equal(got.pid, 4321);
  assert.equal(got.totalSec, 95);
  assert.equal(got.startedAt, ok.startedAt);
  assert(Array.isArray(got.missingGlyphList));
});

test('sözlük: eksik/bozuk sürüm v1 sayılır', () => {
  for (const version of [undefined, null, 'abc', NaN, 0, -3, '1', 1, true]) {
    const got = normalizeBurninRecovery({ version, ...ok });
    assert(got && got.version === 1, `version=${String(version)} reddedildi`);
  }
});

test('sözlük: sürüm > mevcut → reddedilir (ileri-uyumsuz güvenli)', () => {
  for (const version of [2, 3, 99, '2', 1.5]) {
    assert.equal(normalizeBurninRecovery({ version, ...ok }), null,
      `version=${String(version)} yanlışlıkla kabul edildi`);
  }
});

test('idempotans: normalize iki kez uygulanınca aynı nesne', () => {
  const once = normalizeBurninRecovery({ version: 1, id: 'abc', ...ok });
  const twice = normalizeBurninRecovery(once);
  assert.deepEqual(twice, once);
});

test('bilinmeyen anahtarlar sessizce düşürülür (ileri-alan toleransı)', () => {
  const got = normalizeBurninRecovery({
    version: 1, ...ok, futureFlag: 'x', newField: { a: 1 }, extra: [1, 2],
  });
  assert(got);
  assert(!('futureFlag' in got) && !('newField' in got) && !('extra' in got));
});

test('tip-bozuk alanlar kelepçe/varsayılana çekilir', () => {
  const got = normalizeBurninRecovery({
    version: 1, ...ok,
    pid: '123',             // dizgi → sayı
    totalSec: -5,           // negatif → 0
    startedAt: 'x',         // bozuk → 0
    missingGlyphs: '7',     // dizgi → sayı
    missingGlyphList: 'n',  // dizi değil → []
  });
  assert.equal(got.pid, 123);
  assert.equal(got.totalSec, 0);
  assert.equal(got.startedAt, 0);
  assert.equal(got.missingGlyphs, 7);
  assert.deepEqual(got.missingGlyphList, []);
  assert.equal(normalizeBurninRecovery({ version: 1, ...ok, pid: -1 }).pid, null);
  assert.equal(normalizeBurninRecovery({ version: 1, ...ok, pid: NaN }).pid, null);
});

test('zorunlu yollar eksik/boş ise null', () => {
  for (const key of ['videoPath', 'subPath', 'tempPath', 'outPath']) {
    const bad = { version: 1, ...ok, [key]: '  ' };
    assert.equal(normalizeBurninRecovery(bad), null, `${key} boş kabul edildi`);
    const missing = { version: 1, ...ok };
    delete missing[key];
    assert.equal(normalizeBurninRecovery(missing), null, `${key} eksik kabul edildi`);
  }
});

test('primitive/array/null girdiler null', () => {
  for (const raw of [null, undefined, 5, 'x', [], [ok], true]) {
    assert.equal(normalizeBurninRecovery(raw), null);
  }
});

test('aşırı uzun alanlar budanır, id üretilir', () => {
  const long = 'a'.repeat(9000);
  const got = normalizeBurninRecovery({ version: 1, ...ok, videoPath: long });
  assert.equal(got.videoPath.length, 8000);
  const noId = normalizeBurninRecovery({ version: 1, ...ok, id: '' });
  assert(noId.id.length > 10);
});

console.log(`PASS: burnin-recovery-schema (${passed} kontrol)`);
