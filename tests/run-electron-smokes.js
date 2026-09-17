/**
 * Electron smoke envanteri ve seçmeli koşturucu.
 *
 *   node tests/run-electron-smokes.js            -> mevcut smoke dosyalarını listeler
 *   node tests/run-electron-smokes.js --all      -> tümünü sırayla çalıştırır
 *   node tests/run-electron-smokes.js <ad...>    -> yalnız adı geçenleri çalıştırır
 *                                                   (uzantı/ön ek yazılabilir)
 *
 * npm test'in parçası değildir: smoke'lar gerçek Electron süreci, ekran ve
 * kimi zaman ağ erişimi ister. Ana kabul komutunda görünürlük için run-all.js
 * sonunda bu dosyaya işaret edilir.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TIMEOUT_MS = 15 * 60 * 1000;

const smokes = fs.readdirSync(__dirname)
  .filter((name) => name.startsWith('electron-') && name.endsWith('.smoke.js'))
  .sort();

const args = process.argv.slice(2);
const selected = args.length === 0 ? [] :
  args.includes('--all') ? smokes :
    smokes.filter((name) => args.some((arg) => name.includes(arg.replace(/\.js$/, ''))));

if (!selected.length) {
  console.log('Electron smoke dosyaları (npm test kapsamı dışında, ayrı koşulur):');
  for (const name of smokes) console.log(`  electron tests/${name}`);
  console.log('\nKoşturmak için: node tests/run-electron-smokes.js --all | <ad-parçası>');
  process.exit(0);
}

const electron = require('electron'); // devDependency: binary yolu
let failed = 0;
for (const name of selected) {
  console.log(`\n=== electron tests/${name} ===`);
  const env = { ...process.env };
  // Oturumdan sızan ELECTRON_RUN_AS_NODE binary'i saf Node olarak başlatır.
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [path.join(__dirname, name), '--disable-gpu'],
    { cwd: ROOT, stdio: 'inherit', timeout: TIMEOUT_MS, env });
  if (r.error) { console.log(`  (çalıştırılamadı: ${r.error.message})`); failed++; }
  else if (r.signal === 'SIGTERM') { console.log('  (zaman aşımı)'); failed++; }
  else if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} smoke BAŞARISIZ` : `\n${selected.length} smoke geçti`);
process.exit(failed ? 1 : 0);
