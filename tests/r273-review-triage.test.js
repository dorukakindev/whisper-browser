'use strict';

// R273 — Devin Review toplu triage regresyon kilitleri.
// - nextCueBoundaryAt in-place mutasyon probları (head/mid/tail) bayat indeksi
//   yeniden kurmaya zorlar.
// - Bozuk "geçmiş end" gelecekteki geçerli sınırları gizleyemez.
// - transcribe NDJSON tüketicisi JSON olmayan stdout satırlarını log olarak
//   iletir (R271 regresyonu — sessiz düşürme geri alındı).
// - libass eksik-glif taraması parça-sınırına dayanıklı (yuvarlanan errTail).
// - Kurtarma kaydı missingGlyphs taşır; recover sonucu sayıyı döndürür.
// - systemError disk-dolu hatasını dosya-kaybından ayırır.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { nextCueBoundaryAt } = require('../src/browser-overlay-controller');
const { normalizeBurninRecovery } = require('../src/burnin-output');
const copy = require('../src/renderer/status-copy');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ✓', name); };

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

// ---------- overlay indeks tazeliği ----------
test('in-place head end mutasyonu bayat indeksle kaçırılmaz', () => {
  const cues = [{ start: 0, end: 2 }, { start: 5, end: 8 }, { start: 10, end: 12 }];
  assert.equal(nextCueBoundaryAt(cues, 6), 8);
  cues[0].end = 9; // head end yukarı mutasyon — prefixMax[0] bayat kalırdı
  assert.equal(nextCueBoundaryAt(cues, 8), 9);
});

test('in-place mid end mutasyonu bayat indeksle kaçırılmaz', () => {
  const cues = [{ start: 0, end: 2 }, { start: 5, end: 8 }, { start: 10, end: 12 }];
  nextCueBoundaryAt(cues, 6);
  cues[1].end = 20; // mid end yukarı — bayat prefixMax taramayı erken keserdi
  assert.equal(nextCueBoundaryAt(cues, 13), 20);
});

test('in-place tail start mutasyonu + append stale genişlemeyi reddeder', () => {
  const cues = [{ start: 0, end: 2 }, { start: 5, end: 8 }, { start: 10, end: 12 }];
  nextCueBoundaryAt(cues, 6);
  cues[0].end = 9;      // head end yukarı
  cues.push({ start: 15, end: 17 }); // uzatma — probes olmadan extendable açılırdı
  assert.equal(nextCueBoundaryAt(cues, 8), 9);
});

test('bozuk geçmiş-end gelecekteki geçerli sınırları gizlemez', () => {
  // Orta cue'nun end'i geçmişte bozulmuş: gerçek en erken gelecek sınır 20.
  const cues = [
    { start: 0, end: 2 },
    { start: 6, end: 1 },   // bozuk end (< start, < t)
    { start: 10, end: 20 },
  ];
  assert.equal(nextCueBoundaryAt(cues, 3), 6);
  assert.equal(nextCueBoundaryAt(cues, 7), 10);
});

test('uzatılan listenin yeni end değerleri sınır olarak döner', () => {
  const cues = [{ start: 0, end: 2 }, { start: 5, end: 8 }, { start: 10, end: 12 }];
  nextCueBoundaryAt(cues, 3);
  cues.push({ start: 15, end: 22 }); // uzatma — suffixMin yeni end'i de içermeli
  // t=13 için kalan end'ler {22} — bozuk suffixMin undefined döndürür, sınır 15'te kalırdı.
  assert.equal(nextCueBoundaryAt(cues, 13), 15);
  assert.equal(nextCueBoundaryAt(cues, 16), 22);
});

test('uzatma sonrası daha küçük yeni end eski minimumu geçersiz kılar', () => {
  const cues = [{ start: 0, end: 2 }, { start: 5, end: 30 }];
  nextCueBoundaryAt(cues, 3);
  cues.push({ start: 10, end: 12 });
  // t=11 → kalan end'ler {30,12}: en küçük 12 yeni cue'dan; eski suffixMin 30 tutardı.
  assert.equal(nextCueBoundaryAt(cues, 4), 5);
  assert.equal(nextCueBoundaryAt(cues, 11), 12);
});

// ---------- main.js sözleşme kilitleri ----------
test('ndjson: JSON olmayan stdout satırı log olarak iletilir', () => {
  const nullBranch = /parseNdjsonLine\(line\);\s*\n\s*if \(!_parsed\) \{\s*\n(?:.*\n)*?\s*writeJobLog\(\{ type: 'log', level: 'info', message: line, jobId \}\);\s*\n\s*sendJobEvent\(\{ type: 'log', level: 'info', message: line \}\);/;
  assert.match(mainSource, nullBranch);
});

test('burnin: eksik-glif taraması yuvarlanan errTail üzerinde yapılır', () => {
  assert.match(mainSource, /errTail = \(errTail \+ d\)\.slice\(-1500\);\s*\n(?:.*\n)*?\s*for \(const m of errTail\.matchAll\(/);
});

test('burnin recovery: missingGlyphs kayıt ve recover sonucuna taşınır', () => {
  assert.match(mainSource, /missingGlyphs: job\.missingGlyphs\.size/);
  assert.match(mainSource, /missingGlyphs: recovery\.missingGlyphs \|\| 0/g);
  const rec = normalizeBurninRecovery({
    videoPath: 'v.mp4', subPath: 's.srt', tempPath: 't.mkv', outPath: 'o.mp4',
    missingGlyphs: 4, missingGlyphList: ['0x1f600', '0x20ac'],
  });
  assert.equal(rec.missingGlyphs, 4);
  assert.deepEqual(rec.missingGlyphList, ['0x1f600', '0x20ac']);
  // Liste yoksa sayı yine normalize edilir; çift-sayım yerine birleşim kurulur.
  const bare = normalizeBurninRecovery({ videoPath: 'v', subPath: 's', tempPath: 't', outPath: 'o' });
  assert.equal(bare.missingGlyphs, 0);
  assert.deepEqual(bare.missingGlyphList, []);
});

test('burnin: yeni glif bulgusu kurtarma kaydına ara yazılır', () => {
  assert.match(mainSource,
    /job\.missingGlyphs\.size !== glyphCountBefore[\s\S]{0,500}writeBurninRecoveryState\(job\.previousRecovery\)/);
});

test('status-copy: disk dolu hatası dosya-kaybı olarak sınıflandırılmaz', () => {
  assert.match(copy.systemError('tr', 'ffmpeg err_disk_full while writing'), /^Diskte yer kalmadı/);
  assert.match(copy.systemError('en', 'Error: ENOSPC: no space left on device'), /^No space left/);
  assert.match(copy.systemError('tr', 'err_file_not_found'), /^Dosyaya erişilemedi/);
});

console.log(`\nPASS: r273-review-triage (${passed} kontrol)`);
