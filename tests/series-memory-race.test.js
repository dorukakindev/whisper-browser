'use strict';

// series_memory birleştirme yarışı: paralel işçi/süreç kaybı simülasyonu.
// Ayrı Python süreçleri ve iş parçacıkları aynı hafıza dosyasına eşzamanlı
// yazar; kilit + disk-yeniden-okuma birleştirmesi hiçbir kararı kaybetmemeli
// ve erken bölüm kanonunu korumalı.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { findTestPython } = require('./python-runtime');

const WORKER = path.join(__dirname, 'fixtures', 'series_memory_race.py');
const MEM_REL = path.join('series-memory', 'show.en-tr.json');
const python = findTestPython();

let passed = 0;
let skipped = 0;
async function test(name, fn) {
  if (!python) { skipped += 1; console.log('  SKIP ', name, '(yorumlayıcı yok)'); return; }
  try { await fn(); passed += 1; console.log('  ✓', name); }
  catch (err) { console.error('  ✗', name, '\n', err); process.exitCode = 1; }
}

const run = (args, opts = {}) => {
  const res = spawnSync(python, [WORKER, ...args], {
    encoding: 'utf8', timeout: 60000, env: { ...process.env, ...(opts.env || {}) },
  });
  assert.equal(res.error, undefined, `worker çalışmadı: ${res.error && res.error.message}`);
  assert.equal(res.status, 0, `worker çıkış ${res.status}: ${res.stderr.slice(0, 400)}`);
  return JSON.parse(res.stdout.trim().split('\n').pop());
};

const runAsync = (args, opts = {}) => new Promise((resolve, reject) => {
  const child = spawn(python, [WORKER, ...args], {
    env: { ...process.env, ...(opts.env || {}) },
  });
  let out = ''; let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => {
    if (code !== 0) return reject(new Error(`worker çıkış ${code}: ${err.slice(0, 400)}`));
    const last = out.trim().split('\n').pop();
    try { resolve(JSON.parse(last)); } catch (e) { reject(new Error(`stdout ayrışmadı: ${out.slice(0, 300)}`)); }
    return undefined;
  });
  child.on('error', reject);
});

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sm-race-'));
let termsSeq = 0;
const writeTerms = (dir, raws) => {
  const f = path.join(dir, `terms-${process.pid}-${termsSeq++}.json`);
  fs.writeFileSync(f, JSON.stringify(raws));
  return f;
};
const readMem = (dir) => JSON.parse(fs.readFileSync(path.join(dir, MEM_REL), 'utf8'));

(async () => {
  await test('paralel süreçler: 2 işçi × 40 ayrı terim → birleşim korunur', async () => {
    const dir = tmpdir();
    // Tek karar kümesi ≤20 terim taşır (model başına kota): 40'ı iki raw'a böl.
    const mk = (p, n) => [0, 1].map((k) => ({ terms: Object.fromEntries(
      Array.from({ length: n }, (_, j) => [`${p}-term-${k * n + j}`, `${p}-hedef-${k * n + j}`])) }));
    // Bariyer: iki işçi de örneğini kurup READY basana dek merge bekletilir —
    // biri diğerinden önce bitiremez, bayat-kopya uzlaşması gerçekten sınanır.
    const barrier = path.join(dir, 'go.marker');
    const startWorker = (ep, raws) => {
      const child = spawn(python, [WORKER, '--dir', dir, '--mode', 'merge',
        '--ep', ...ep.split(' '), '--terms-json', raws, '--wait-file', barrier]);
      let out = ''; let err = ''; let ready = false;
      const readyPromise = new Promise((resolve) => {
        child.stdout.on('data', (d) => {
          out += d;
          if (!ready && String(d).includes('READY')) { ready = true; resolve(); }
        });
      });
      child.stderr.on('data', (d) => { err += d; });
      const done = new Promise((resolve, reject) => {
        child.on('close', (code) => {
          if (code !== 0) return reject(new Error(`worker çıkış ${code}: ${err.slice(0, 400)}`));
          try { resolve(JSON.parse(out.trim().split('\n').pop())); }
          catch (e) { reject(e); }
          return undefined;
        });
      });
      return { readyPromise, done };
    };
    const w1 = startWorker('1 5', writeTerms(dir, mk('a', 20)));
    const w2 = startWorker('1 6', writeTerms(dir, mk('b', 20)));
    await Promise.all([w1.readyPromise, w2.readyPromise]);
    fs.writeFileSync(barrier, 'go');
    const [r1, r2] = await Promise.all([w1.done, w2.done]);
    assert.equal(r1.merged, 2, `işçi-1: ${JSON.stringify(r1)}`); // 2 raw da değişiklik üretti
    assert.equal(r2.merged, 2, `işçi-2: ${JSON.stringify(r2)}`);
    const data = readMem(dir);
    for (const p of ['a', 'b']) {
      for (let j = 0; j < 40; j += 1) { // 2 raw × 20 terim
        assert.equal(data.terms[`${p}-term-${j}`]?.target, `${p}-hedef-${j}`,
          `${p}-term-${j} kayıp — son yazan ezdi`);
      }
    }
  });

  await test('aynı kimlik, farklı bölüm: erken bölüm kanonu iki süreçte de kazanır', async () => {
    const dir = tmpdir();
    const late = writeTerms(dir, [{ terms: { Alpha: 'geç-kanon' } }]);
    const early = writeTerms(dir, [{ terms: { Alpha: 'erken-kanon' } }]);
    // Geç bölüm önce yazılır; erken bölüm sonra gelip yine de kazanmalı.
    run(['--dir', dir, '--mode', 'merge', '--ep', '5', '9', '--terms-json', late]);
    run(['--dir', dir, '--mode', 'merge', '--ep', '1', '3', '--terms-json', early]);
    assert.equal(readMem(dir).terms.Alpha.target, 'erken-kanon');
    // Ters yazım sırası da aynı sonucu vermeli.
    const dir2 = tmpdir();
    const early2 = writeTerms(dir2, [{ terms: { Alpha: 'erken-kanon' } }]);
    const late2 = writeTerms(dir2, [{ terms: { Alpha: 'geç-kanon' } }]);
    run(['--dir', dir2, '--mode', 'merge', '--ep', '1', '3', '--terms-json', early2]);
    run(['--dir', dir2, '--mode', 'merge', '--ep', '5', '9', '--terms-json', late2]);
    assert.equal(readMem(dir2).terms.Alpha.target, 'erken-kanon');
  });

  await test('aynı süreçte paralel iş parçacıkları: kayıp güncelleme yok', async () => {
    const dir = tmpdir();
    const out = run(['--dir', dir, '--mode', 'threads', '--workers', '4',
      '--per-worker', '15', '--ep', '2', '2']);
    assert.deepEqual(out.errors, [], `iş parçacığı hatası: ${out.errors.join('; ')}`);
    assert.equal(out.missing, 0,
      `${out.missing} terim kayboldu (örnek: ${out.missing_sample.join(', ')})`);
    assert.equal(out.terms, 60);
  });

  await test('yazımda kilit zaman aşımı: bekleyen işçi sessiz ezme yapmaz', async () => {
    const dir = tmpdir();
    const holder = spawn(python, [WORKER, '--dir', dir, '--mode', 'hold', '--hold-ms', '2500']);
    let held = false;
    holder.stdout.on('data', (d) => { if (String(d).includes('HELD')) held = true; });
    await new Promise((resolve) => {
      const t = setInterval(() => { if (held) { clearInterval(t); resolve(); } }, 15);
      setTimeout(() => { clearInterval(t); resolve(); }, 5000);
    });
    assert.equal(held, true, 'kilit tutucu HELD basmadı');
    const raws = writeTerms(dir, [{ terms: { A: 'bekleyen' } }]);
    const out = await runAsync(
      ['--dir', dir, '--mode', 'merge', '--ep', '1', '1', '--terms-json', raws],
      { env: { SM_LOCK_TIMEOUT: '0.4' } });
    assert.equal(out.timeout, true, `zaman aşımı beklenirdi: ${JSON.stringify(out)}`);
    // Kilit bırakılınca tekrar deneme başarılı olmalı (önceki ezilmedi).
    const retry = await runAsync(
      ['--dir', dir, '--mode', 'merge', '--ep', '1', '1', '--terms-json', raws]);
    assert.equal(retry.merged, 1, `yeniden deneme başarısız: ${JSON.stringify(retry)}`);
    // Tutucu bu noktada çoktan çıkmış olabilir; beklemeksizin kapatmayı dene.
    if (holder.exitCode === null) holder.kill();
  });

  await test('yazımda kilit çarpışması: kurulan örnek _save yolunda zaman aşımı', async () => {
    // Örnek önce kurulur (READY), kilit sonra tutulur — zaman aşımı init'te
    // değil _save sınırında yaşanır; işçi sessiz ezme yapmaz.
    const dir = tmpdir();
    const raws = writeTerms(dir, [{ terms: { A: 'geciken' } }]);
    const barrier = path.join(dir, 'go.marker');
    let ready = false;
    const worker = spawn(python, [WORKER, '--dir', dir, '--mode', 'merge-late',
      '--ep', '1', '1', '--terms-json', raws, '--wait-file', barrier],
      { env: { ...process.env, SM_LOCK_TIMEOUT: '0.4' } });
    let out = ''; let err = '';
    worker.stdout.on('data', (d) => { out += d; if (String(d).includes('READY')) ready = true; });
    worker.stderr.on('data', (d) => { err += d; });
    await new Promise((resolve) => {
      const t = setInterval(() => { if (ready) { clearInterval(t); resolve(); } }, 15);
      setTimeout(() => { clearInterval(t); resolve(); }, 8000);
    });
    assert.equal(ready, true, 'işçi örnek kurmadan READY basmadı');
    const holder = spawn(python, [WORKER, '--dir', dir, '--mode', 'hold', '--hold-ms', '2500']);
    let held = false;
    holder.stdout.on('data', (d) => { if (String(d).includes('HELD')) held = true; });
    await new Promise((resolve) => {
      const t = setInterval(() => { if (held) { clearInterval(t); resolve(); } }, 15);
      setTimeout(() => { clearInterval(t); resolve(); }, 5000);
    });
    assert.equal(held, true, 'kilit tutucu HELD basmadı');
    fs.writeFileSync(barrier, 'go');
    const code = await new Promise((resolve) => worker.on('close', resolve));
    assert.equal(code, 0, `işçi çıkış ${code}: ${err.slice(0, 300)}`);
    const res = JSON.parse(out.trim().split('\n').pop());
    assert.equal(res.timeout, true, `_save çarpışması zaman aşımı beklenirdi: ${JSON.stringify(res)}`);
    if (holder.exitCode === null) holder.kill();
  });

  await test('yazım anında disk bozulursa dosya korunur (ezilmez)', async () => {
    const dir = tmpdir();
    const seed = writeTerms(dir, [{ terms: { Z: 'kayıt' } }]);
    run(['--dir', dir, '--mode', 'merge', '--ep', '1', '1', '--terms-json', seed]);
    const out = run(['--dir', dir, '--mode', 'corrupt-mid', '--ep', '1', '2']);
    assert.equal(out.merged, 0, `bozuk diske yazdı: ${JSON.stringify(out)}`);
    assert.equal(out.body, '{bozuk json', 'bozuk dosya ezilmiş');
  });

  await test('budama sınırı yarışta da tutulur (≤ MAX_TERMS)', async () => {
    const dir = tmpdir();
    const out = run(['--dir', dir, '--mode', 'threads', '--workers', '5',
      '--per-worker', '30', '--ep', '3', '1']);
    assert.deepEqual(out.errors, [], `iş parçacığı hatası: ${out.errors.join('; ')}`);
    const data = readMem(dir);
    assert.equal(Object.keys(data.terms).length, 80,
      `MAX_TERMS aşıldı veya kayıp var: ${Object.keys(data.terms).length}`);
    for (const [source, row] of Object.entries(data.terms)) {
      assert.ok(row && typeof row.target === 'string' && row.target.startsWith('çeviri-'),
        `${source}: bozuk satır ${JSON.stringify(row)}`);
      assert.ok(Array.isArray(row.episode) && row.episode.length === 2,
        `${source}: episode alanı bozuk`);
    }
  });

  console.log(`PASS: series-memory-race (${passed} kontrol${skipped ? `, ${skipped} atlandı` : ''})`);
})();
