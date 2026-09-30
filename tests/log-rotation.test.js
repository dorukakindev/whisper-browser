'use strict';
// R314 — günlük rotasyon/büyüme sınırı: tek iş günlüğü dosyası LOG_MAX_BYTES'ı
// aşamaz; aşma anında tek kesim işareti yazılır ve sonraki olaylar düşürülür.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

function loadJobLogSlice(over = {}) {
  const start = SRC.indexOf('const LOG_MAX_BYTES');
  const end = SRC.indexOf('function endJobLog');
  assert.ok(start > 0 && end > start, 'günlük bölgesi bulunamadı');
  const ctx = {
    Date, Buffer, Set, Math, JSON,
    process: { on: () => {}, env: {} },
    console: { error: () => {} },
    writeJobLogToFile: null,
    ...over,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${SRC.slice(start, end)}\nthis.__write = writeJobLog; this.__setLog = (v) => { jobLog = v; }; this.__getLog = () => jobLog;`, ctx);
  return ctx;
}

test('LOG_MAX_BYTES sabiti tanımlı ve günlük nesnesi bayt/kesim alanları taşır', () => {
  assert.match(SRC, /const LOG_MAX_BYTES = \d+ \* 1024 \* 1024/);
  // Sayacın ekleme kipinde mevcut dosya boyutundan + başlıktan başlaması
  // şart — 0'dan başlasaydı aynı-adlı dosya 4 MB sınırını sessizce aşardı.
  assert.match(SRC, /jobLog = \{ file, stream, bytes: initialBytes \+ Buffer\.byteLength\(header\), truncated: false \}/);
  assert.match(SRC, /GÜNLÜK SINIRI/, 'kesim işareti metni eksik');
});

test('boyut sınırı aşılınca yazım durur, tek kesim işareti basılır', () => {
  const written = [];
  const stream = { write: (s) => written.push(s), destroy() {}, end() {} };
  const ctx = loadJobLogSlice();
  ctx.__setLog({ file: 'x.log', stream, bytes: 0, truncated: false });
  // 4MB'ı ~4200 satırla aş (her biri ~1KB).
  const big = 'x'.repeat(1024);
  for (let i = 0; i < 4200; i++) ctx.__write({ type: 'log', level: 'info', message: big });
  const total = written.reduce((n, s) => n + Buffer.byteLength(s), 0);
  assert.ok(total < 4.5 * 1024 * 1024, `dosya sınırsız büyüdü: ${total} bayt`);
  const markers = written.filter((s) => s.includes('GÜNLÜK SINIRI'));
  assert.strictEqual(markers.length, 1, 'kesim işareti tam bir kez yazılmalı');
  assert.strictEqual(ctx.__getLog().truncated, true);
  // Kesimden sonra hiçbir olay yazılmaz.
  written.length = 0;
  ctx.__write({ type: 'log', level: 'info', message: 'yine' });
  ctx.__write({ type: 'error', message: 'hata' });
  assert.strictEqual(written.length, 0, 'kesilmiş dosyaya yazım devam etti');
});

test('sınır içinde olaylar normal yazılır ve LOG_SKIP türleri elenir', () => {
  const written = [];
  const stream = { write: (s) => written.push(s), destroy() {}, end() {} };
  const ctx = loadJobLogSlice();
  ctx.__setLog({ file: 'x.log', stream, bytes: 0, truncated: false });
  ctx.__write({ type: 'log', level: 'info', message: 'ilk' });
  ctx.__write({ type: 'progress', message: 'gürültü' });
  ctx.__write({ type: 'segment', message: 'gürültü' });
  assert.strictEqual(written.length, 1, 'LOG_SKIP türleri dosyaya düşmemeli');
  assert.ok(ctx.__getLog().bytes > 0, 'bayt sayacı ilerlemeli');
});
