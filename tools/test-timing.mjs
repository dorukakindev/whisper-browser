#!/usr/bin/env node
/**
 * Test paketi hız profili — R327-5
 *
 * tests/*.test.js ve backend/test_*.py dosyalarını sırayla koşturur, her
 * dosyanın süresini ölçer ve en yavaş N dosyayı raporlar. run-all.js'den
 * farklı olarak ölçüm odaklıdır; CI'da koşulmaz, elle profil çıkarmak için:
 *
 *   node tools/test-timing.mjs            → sıralı tam tablo
 *   node tools/test-timing.mjs --top 10   → yalnız en yavaş 10 (varsayılan)
 *   node tools/test-timing.mjs --json out.json → ham ölçümü diske yazar
 *
 * Çıkış her dosya için: süre (ms), durum (pass/fail/timeout/run-error).
 * Sıralama yavaştan hızlıya; başarısız dosyalar da süreleriyle listelenir.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_FILE_TIMEOUT_MS = 10 * 60 * 1000; // run-all.js ile aynı tavan

const args = process.argv.slice(2);
const topIdx = args.indexOf('--top');
const TOP = topIdx >= 0 ? Number(args[topIdx + 1]) || 10 : 0; // 0 = hepsi
const jsonIdx = args.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const onlyIdx = args.indexOf('--only'); // dosya-adı süzgeci (yeniden-ölçüm)
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

function findTestPython() {
  const candidates = [
    path.join(ROOT, 'backend', 'venv', 'bin', 'python'),
    path.join(ROOT, 'backend', 'venv', 'Scripts', 'python.exe'),
    'python3', 'python',
  ];
  for (const c of candidates) {
    const r = spawnSync(c, ['-c', 'import sys;sys.exit(0)'], { timeout: 15000 });
    if (r.status === 0) return c;
  }
  return null;
}

function measure(title, cmd, cmdArgs) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'pipe', timeout: TEST_FILE_TIMEOUT_MS });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  let status = 'pass';
  if (r.error) status = `run-error:${r.error.code || r.error.message}`;
  else if (r.signal) status = `timeout(${r.signal})`;
  else if (r.status !== 0) status = 'fail';
  return { file: title, ms: Math.round(ms), status };
}

const nodeTests = fs.readdirSync(path.join(ROOT, 'tests'))
  .filter((x) => x.endsWith('.test.js')).sort()
  .filter((x) => !ONLY || x.includes(ONLY));
const backendDir = path.join(ROOT, 'backend');
const pyTests = fs.existsSync(backendDir)
  ? fs.readdirSync(backendDir).filter((x) => x.startsWith('test_') && x.endsWith('.py')).sort()
    .filter((x) => !ONLY || x.includes(ONLY))
  : [];
const python = findTestPython();

const results = [];
for (const f of nodeTests) {
  const r = measure(`tests/${f}`, process.execPath, [path.join(ROOT, 'tests', f)]);
  results.push(r);
  process.stderr.write(`\r${results.length} dosya ölçüldü — son: ${r.file} ${r.ms}ms ${r.status}   `);
}
if (python) {
  for (const f of pyTests) {
    const r = measure(`backend/${f}`, python, [path.join(backendDir, f)]);
    results.push(r);
    process.stderr.write(`\r${results.length} dosya ölçüldü — son: ${r.file} ${r.ms}ms ${r.status}   `);
  }
}
process.stderr.write('\n');

results.sort((a, b) => b.ms - a.ms);
const shown = TOP > 0 ? results.slice(0, TOP) : results;
const total = results.reduce((s, r) => s + r.ms, 0);
console.log(`\n${results.length} dosya, toplam ${(total / 1000).toFixed(1)}s — ${TOP ? `en yavaş ${shown.length}` : 'tam tablo'}:`);
for (const r of shown) {
  const pct = ((r.ms / total) * 100).toFixed(1);
  console.log(`${String(r.ms).padStart(8)}ms  ${pct.padStart(5)}%  ${r.status.padEnd(12)}  ${r.file}`);
}
const fails = results.filter((r) => r.status !== 'pass');
if (fails.length) {
  console.log(`\n${fails.length} dosya PASS dışında durumda:`);
  for (const r of fails) console.log(`  ${r.status.padEnd(12)}  ${r.file}`);
}
if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nHam ölçüm: ${JSON_OUT}`);
}
process.exit(fails.length ? 1 : 0);
