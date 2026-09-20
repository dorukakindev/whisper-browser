'use strict';
// B03 — OpenSubtitles moviehash: referans algoritmayla (Python portu) çapraz
// doğrulanmış vektörler.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { movieHash } = require('../src/opensubtitles-hash');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oshash-'));
  try {
    // büyük dosya: 200000 bayt, bytes[i] = (i*31+7)&255 → python ref: 5f9fe02060a3cd40
    const big = Buffer.alloc(200000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 255;
    const bigPath = path.join(dir, 'big.bin');
    fs.writeFileSync(bigPath, big);
    assert.equal(await movieHash(bigPath), '5f9fe02060a3cd40');

    // küçük dosya (<64K): 1000 bayt, bytes[i] = (i*17+3)&255 → ref: feb1681acd80358f
    const small = Buffer.alloc(1000);
    for (let i = 0; i < small.length; i++) small[i] = (i * 17 + 3) & 255;
    const smallPath = path.join(dir, 'small.bin');
    fs.writeFileSync(smallPath, small);
    assert.equal(await movieHash(smallPath), 'feb1681acd80358f');

    // orta dosya (64K < boyut < 128K): referans algoritma son 64 KiB'ı
    // tam blok okur → başla çakışan baytlar iki kez sayılır.
    // 100000 bayt, bytes[i] = (i*13+5)&255 → python ref: e09f6020dfa1c6a0
    const mid = Buffer.alloc(100000);
    for (let i = 0; i < mid.length; i++) mid[i] = (i * 13 + 5) & 255;
    const midPath = path.join(dir, 'mid.bin');
    fs.writeFileSync(midPath, mid);
    assert.equal(await movieHash(midPath), 'e09f6020dfa1c6a0');

    // sıfır dosya → hash = dosya boyutu (belgelenmiş dejenere vektör)
    const zeros = path.join(dir, 'zeros.bin');
    fs.writeFileSync(zeros, Buffer.alloc(200000));
    assert.equal(await movieHash(zeros), '0000000000030d40');

    console.log('opensubtitles-hash: moviehash vektörleri geçti');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
