'use strict';
// R313 — disk-dolu matrisi: kullanıcı-seçimli dışa aktarımlar atomik yazıcı
// kullanır (disk dolu eski sağlam dosyayı yok etmez) ve iş günlüğü
// WriteStream'inin 'error' olayı dinleyicisiz kalmaz (ana süreci düşürürdü).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const MAIN = path.join(ROOT, 'src', 'main.js');
const SRC = fs.readFileSync(MAIN, 'utf8').replace(/\r\n/g, '\n');

test('kullanıcı-seçimli dışa aktarımlar atomik yazıcıdan geçer', () => {
  // Ham fs.writeFileSync yalnız iç/geçici dosyalarda kalmalı — kullanıcı
  // hedefi seçtiği tüm yazımlar writeBufferAtomic üzerinden gitmeli, yoksa
  // disk dolu anında hedefteki sağlam dosya kesilmiş olarak kalır.
  const whitelist = /0o600|cancelFilePath|pcm16Wav/;
  const offenders = [];
  SRC.split('\n').forEach((line, i) => {
    if (/fs\.writeFileSync\(/.test(line) && !whitelist.test(line)) {
      offenders.push(`${i + 1}: ${line.trim()}`);
    }
  });
  assert.deepStrictEqual(offenders, [], 'kalan ham yazımlar whitelist dışında: ' + offenders.join(' | '));
});

test('iş günlüğü akışının hata dinleyicisi var', () => {
  const idx = SRC.indexOf("createWriteStream(file, { flags: 'a'");
  assert.ok(idx > 0, 'job log stream kurulumu bulunamadı');
  const region = SRC.slice(idx, idx + 600);
  assert.match(region, /stream\.on\('error'/, "WriteStream 'error' dinleyicisi yok — disk dolu ana süreci düşürür");
  assert.match(region, /jobLog = null/, 'hata sonrası günlük bırakılmalı');
});

test('writeBufferAtomic ENOSPC altında hedefi ve geçici dosyayı temiz bırakır', () => {
  const start = SRC.indexOf('function writeBufferAtomic(');
  const end = SRC.indexOf('function queueStatePath(');
  assert.ok(start > 0 && end > start, 'writeBufferAtomic bulunamadı');
  const ctx = { process: { pid: 1 }, randomUUID: () => 'x', path };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${SRC.slice(start, end)}\nthis.__f = writeBufferAtomic;`, ctx);
  const existing = Buffer.from('saglam-icerik');
  const written = [];
  const io = {
    mkdirSync() {},
    existsSync: (p) => written.some((w) => w.path === p) || p === 'hedef',
    writeFileSync(p, data) {
      if (!p.endsWith('.tmp')) return;
      if (p.includes('doluyken')) { const e = new Error('no space left on device'); e.code = 'ENOSPC'; throw e; }
      written.push({ path: p, data });
    },
    renameSync(from, to) {
      const moved = written.find((w) => w.path === from);
      written.push({ path: to, data: moved ? moved.data : existing });
    },
    unlinkSync(p) { const i = written.findIndex((w) => w.path === p); if (i >= 0) written.splice(i, 1); },
  };
  // Normal yazım tmp→rename töreni yapar; hedef içeriği istenen baytları taşır.
  ctx.__f('hedef', Buffer.from('yeni'), io);
  assert.strictEqual(written.filter((w) => w.path === 'hedef').length, 1);
  assert.strictEqual(written.find((w) => w.path === 'hedef').data.toString(), 'yeni');
  // ENOSPC: hedef hiç değişmez, tmp silinir, hata çağırana yükselir.
  written.length = 0;
  assert.throws(() => ctx.__f('doluyken-hedef', Buffer.from('x'), io), /no space left/);
  assert.strictEqual(written.filter((w) => w.path.includes('.tmp') || w.path === 'doluyken-hedef').length, 0,
    'ENOSPC altında tmp artığı veya yarım hedef dosya kalmasın');
});
