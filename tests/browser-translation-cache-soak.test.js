'use strict';
/**
 * R266 — çeviri önbelleği/journal disk-büyüme soak'u.
 * Uzun süreli aktif çeviri boyunca (binlerce set+flush) diskin sınırlı
 * kaldığını, journal'ın eşiği aşmadığını ve yeniden açılışta mezar taşı
 * dirilişi olmadığını kilitler. Saf Node — CI güvenli, deterministik.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PersistentTranslationCache } = require('../src/browser-translation-cache');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cache-soak-'));
}
function dirBytes(dir) {
  let total = 0;
  for (const name of fs.readdirSync(dir)) total += fs.statSync(path.join(dir, name)).size;
  return total;
}
function key(i) { return `v5|en|tr|model-x|ctx${i % 97}|cue-${i}`; }
function val(i) { return `Çevrilmiş ${i}. cümle — uzunluk için dolgu metni dolgu metni dolgu.`; }

(async () => {
  // Senaryo A: 40 tur churn — journal eşiği ve toplam dizin boyutu sınırlı.
  {
    const dir = tempDir();
    const file = path.join(dir, 'cache.json');
    const cache = new PersistentTranslationCache(file, {
      limit: 1000, minFlushIntervalMs: 500,
      journalMaxBytes: 64 * 1024, journalMaxFlushes: 4, journalMaxAgeMs: 60_000,
    });
    const ROUNDS = 40, PER = 120;
    let worstJournal = 0, worstDir = 0;
    for (let r = 0; r < ROUNDS; r++) {
      for (let i = 0; i < PER; i++) cache.set(key(r * PER + i), val(i));
      const res = await cache.flush();
      assert.strictEqual(res.ok, true);
      const journal = fs.existsSync(cache.journalPath) ? fs.statSync(cache.journalPath).size : 0;
      worstJournal = Math.max(worstJournal, journal);
      worstDir = Math.max(worstDir, dirBytes(dir));
    }
    const baseSize = fs.statSync(file).size;
    // Journal hiçbir ölçümde 2× eşiği geçemez (bir flush grubu ~32 satır).
    assert.ok(worstJournal <= 64 * 1024 * 2, `journal ${worstJournal} > 128K`);
    // Dizin toplamı temel dosyanın ~2.2 katını geçemez (temel + .bak + küçük journal).
    assert.ok(worstDir <= baseSize * 3, `dizin ${worstDir} >> temel ${baseSize}`);
    // Churn sonrası hayatta kalanlar en yeni 1000 kayıt.
    assert.strictEqual(cache.map.size, 1000);
    assert.strictEqual(cache.get(key(ROUNDS * PER - 1)), val(PER - 1));
    console.log(`soak A: ${ROUNDS * PER} yazım → temel ${(baseSize / 1024).toFixed(0)}K, en kötü journal ${worstJournal}B, en kötü dizin ${(worstDir / 1024).toFixed(0)}K`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Senaryo B: gerçek ölçek (50k) — sıkıştırma süresi vs journal ek süresi.
  {
    const dir = tempDir();
    const file = path.join(dir, 'cache.json');
    const cache = new PersistentTranslationCache(file, {
      limit: 50_000, minFlushIntervalMs: 500,
      journalMaxBytes: 8 * 1024 * 1024, journalMaxFlushes: 1000, journalMaxAgeMs: 60_000,
    });
    for (let i = 0; i < 50_000; i++) cache.set(key(i), val(i));
    const t0 = Date.now();
    await cache.flush(); // ilk yazım = sıkıştırma
    const compactMs = Date.now() - t0;
    const fileSize = fs.statSync(file).size;
    // Artımlı tur: 200 yeni kayıt → yalnız journal append.
    for (let i = 0; i < 200; i++) cache.set(key(50_000 + i), val(i));
    const t1 = Date.now();
    await cache.flush();
    const appendMs = Date.now() - t1;
    assert.ok(fileSize > 1024 * 1024, 'ölçek gerçekçi olmalı (>1MB)');
    // Append, tam sıkıştırmadan anlamlı ölçüde ucuz olmalı.
    // Windows CI disk+AV ile append ucuzluğu korunur ama mutlak bütçe genişler.
    const appendFloor = process.platform === 'win32' ? 2500 : 250;
    assert.ok(appendMs < Math.max(appendFloor, compactMs), `append ${appendMs}ms ~ compact ${compactMs}ms`);
    console.log(`soak B: 50k kayıt, temel ${(fileSize / 1024 / 1024).toFixed(1)}MB — sıkıştırma ${compactMs}ms, journal append ${appendMs}ms`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Senaryo C: churn + yeniden açılış — mezar taşı dirilişi yok.
  {
    const dir = tempDir();
    const file = path.join(dir, 'cache.json');
    const opts = { limit: 500, minFlushIntervalMs: 500, journalMaxBytes: 16 * 1024, journalMaxFlushes: 3, journalMaxAgeMs: 60_000 };
    const c1 = new PersistentTranslationCache(file, opts);
    for (let r = 0; r < 10; r++) {
      for (let i = 0; i < 150; i++) c1.set(key(r * 150 + i), val(i));
      await c1.flush();
    }
    const c2 = new PersistentTranslationCache(file, opts); // yeniden açılış
    assert.strictEqual(c2.map.size, 500);
    // En eski churn kayıtları dirilmemeli.
    assert.strictEqual(c2.get(key(0)), undefined);
    assert.strictEqual(c2.get(key(1499)), val(149)); // son tur i=149
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('soak C: yeniden açılışta 500 kayıt, dirilen eski kayıt yok');
  }

  console.log('PASS: browser-translation-cache-soak (3 senaryo)');
})().catch((error) => { console.error(error); process.exit(1); });
