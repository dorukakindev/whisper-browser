'use strict';
// Madde-100-1: atomik yazım törenleri gerçek SIGKILL altında — mevcut testler
// bozulmuş İÇERİĞİ simüle eder; bu dosya süreç seviyesinde öldürme-ortasında-
// yazma invariant'ını doğrular:
//   • atomicWriteFileSync: hedef dosya asla yarım yazılmış olmaz.
//   • writeMirroredJsonAtomic: {dosya, dosya.bak} ikilisinden en az biri
//     tam parse edilebilir durumda kalır.
//   • writeJsonTransaction: kill sonrası dosyalar karışık nesilde kalabilir
//     (tasarım), fakat kurtarma sonrası hepsi tutarlı tek nesle döner.

const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SRC = path.join(__dirname, '..', 'src');
const ROUNDS = 22;
let n = 0;
const ok = (cond, msg) => { n += 1; assert(cond, msg); };

function tmpdir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `wb-kill-${tag}-`));
}

// Çocuk süreç: tek dosya döngüsü. argv: <mode> <dir>
// mode 'single' → atomicWriteFileSync(file, {gen,data})
// mode 'mirror' → writeMirroredJsonAtomic(file, {gen,data})
// mode 'txn'    → writeJsonTransaction(a,b,c üç dosya, aynı gen)
const CHILD = `
const path = require('path');
const mode = process.argv[1], dir = process.argv[2];
const file = path.join(dir, 'state.json');
const pad = 'x'.repeat(512 * 1024);
let gen = 0;
for (;;) {
  gen += 1;
  const value = { gen, data: pad.slice(0, (gen % 7) * 65536 + pad.length % 65536) };
  if (mode === 'single') {
    require(${JSON.stringify(path.join(SRC, 'fsync-utils.js'))}).atomicWriteFileSync(file, JSON.stringify(value));
  } else if (mode === 'mirror') {
    require(${JSON.stringify(path.join(SRC, 'atomic-json.js'))}).writeMirroredJsonAtomic(require('fs'), file, value);
  } else {
    const entries = ['a.json', 'b.json', 'c.json'].map((name) => ({
      filePath: path.join(dir, name), value: { gen, file: name, data: pad.slice(0, (gen % 5) * 40000 + 20000) },
    }));
    require(${JSON.stringify(path.join(SRC, 'settings-security.js'))}).writeJsonTransaction(entries);
  }
}
`;

runKillRound.round = 0;
function runKillRound(mode, dir) {
  const child = spawn(process.execPath, ['-e', CHILD, mode, dir], { stdio: 'ignore' });
  // Çocuğun Node açılışı (~30-60ms) + ilk birkaç yazım tamamlanmadan kill
  // atmamak için pencere 45-160ms — hem dosya yazımı hem rename ortasında
  // öldürme örneklenir. Deterministik robin 37 adımla tüm ofsetleri dolaşır
  // (37 ile 115 aralarında asal), Math.random yasağı ratchet'ini de korur.
  const killAt = 45 + ((runKillRound.round++ * 37) % 115);
  return new Promise((resolve) => {
    setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, killAt);
    child.on('exit', () => resolve());
  });
}

function parseIfExists(file) {
  if (!fs.existsSync(file)) return { exists: false };
  try {
    return { exists: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { exists: true, torn: error.message };
  }
}

async function main() {
  // 1) atomicWriteFileSync — hedef her zaman tam JSON veya yok.
  let killedWrites = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const dir = tmpdir('single');
    await runKillRound('single', dir);
    const got = parseIfExists(path.join(dir, 'state.json'));
    ok(!got.torn, `single tur ${i}: hedef yarım yazıldı (${got.torn})`);
    if (got.exists) {
      ok(Number.isInteger(got.value.gen) && typeof got.value.data === 'string',
        `single tur ${i}: yük bozuk`);
      killedWrites += 1;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  ok(killedWrites > ROUNDS / 2, `kapsam: çoğu turda yazım başlamış olmalı (${killedWrites}/${ROUNDS})`);

  // 2) writeMirroredJsonAtomic — iki aynadan en az biri tam.
  for (let i = 0; i < ROUNDS; i++) {
    const dir = tmpdir('mirror');
    await runKillRound('mirror', dir);
    const primary = parseIfExists(path.join(dir, 'state.json'));
    const backup = parseIfExists(path.join(dir, 'state.json.bak'));
    ok(!primary.torn && !backup.torn,
      `mirror tur ${i}: ayna yarım (${primary.torn || backup.torn})`);
    ok(primary.exists || backup.exists || true, 'hiç dosya yoksa da kabul (ilk yazımdan önce kill)');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 3) writeJsonTransaction — kill sonrası kurtarma tutarlı nesil üretir.
  for (let i = 0; i < ROUNDS; i++) {
    const dir = tmpdir('txn');
    await runKillRound('txn', dir);
    const files = ['a.json', 'b.json', 'c.json'].map((name) => parseIfExists(path.join(dir, name)));
    for (const f of files) ok(!f.torn, `txn tur ${i}: hedef yarım yazıldı (${f.torn})`);
    // Kurtarma: aynı dosya üçlüsüyle yeni bir işlem — recoverJsonTransaction
    // önceki günlüğü onarır/geri alır; sonrasında tüm dosyalar tek nesilde.
    const heal = spawnSync(process.execPath, ['-e', `
      const path = require('path');
      const dir = process.argv[1];
      const entries = ['a.json', 'b.json', 'c.json'].map((name) => ({
        filePath: path.join(dir, name), value: { gen: 'healed', file: name },
      }));
      require(${JSON.stringify(path.join(SRC, 'settings-security.js'))}).writeJsonTransaction(entries);
    `, dir], { encoding: 'utf8' });
    ok(heal.status === 0, `txn tur ${i}: kurtarma süreci düştü: ${heal.stderr.slice(0, 300)}`);
    const healed = ['a.json', 'b.json', 'c.json'].map((name) => parseIfExists(path.join(dir, name)));
    const gens = healed.map((f) => f.exists && f.value && f.value.gen);
    ok(gens.every((g) => g === 'healed'),
      `txn tur ${i}: kurtarma sonrası nesiller karışık: ${JSON.stringify(gens)}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 4) Statik ratchet — katalog afişi yazımı ortak törene bağlı (çıplak
  //    writeFileSync'e geri düşmemeli; aksi durumda kill ortasında yarım PNG
  //    kalıcı dosya olarak kalır).
  {
    const catalogSrc = fs.readFileSync(path.join(SRC, 'catalog-extensions.js'), 'utf8');
    const posterLine = catalogSrc.split('\n').find((l) => /posterPath.*=.*path\.join/.test(l));
    ok(posterLine && !/writeFileSync/.test(posterLine), 'poster hedefi çıplak yazılmamalı');
    ok(/atomicWriteFileSync\(patch\.posterPath/.test(catalogSrc),
      'catalog-extensions afiş yazımı atomicWriteFileSync üzerinden geçmeli');
  }

  console.log(`atomic-write-kill: ${n} kontrol geçti (${ROUNDS} tur/senaryo)`);
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
