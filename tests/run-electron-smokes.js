/**
 * Electron smoke envanteri ve seçmeli koşturucu.
 *
 *   node tests/run-electron-smokes.js            -> mevcut smoke dosyalarını listeler
 *   node tests/run-electron-smokes.js --all      -> ağ/API gerektirmeyenleri sırayla çalıştırır
 *   node tests/run-electron-smokes.js --network  -> dış ağ kullanan smoke'ları çalıştırır
 *   node tests/run-electron-smokes.js --live     -> gerçek sağlayıcı/API smoke'larını çalıştırır
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
const liveSmokes = smokes.filter((name) => /(?:page-translation-live|provider-live)/.test(name));
const networkSmokes = smokes.filter((name) => /browser-public-sites/.test(name));
const deterministicSmokes = smokes.filter((name) => !liveSmokes.includes(name) && !networkSmokes.includes(name));
const selected = args.length === 0 ? [] :
  args.includes('--live') ? liveSmokes :
    args.includes('--network') ? networkSmokes :
      args.includes('--all') ? deterministicSmokes :
    smokes.filter((name) => args.some((arg) => name.includes(arg.replace(/\.js$/, ''))));

if (!selected.length) {
  console.log('Electron smoke dosyaları (npm test kapsamı dışında, ayrı koşulur):');
  for (const name of smokes) console.log(`  electron tests/${name}`);
  console.log('\nKoşturmak için: node tests/run-electron-smokes.js --all | --network | --live | <ad-parçası>');
  console.log('Not: --all dış ağ ve gerçek sağlayıcı/API çağrısı yapan smoke\'ları içermez.');
  process.exit(0);
}

const electron = require('electron'); // devDependency: binary yolu
let failed = 0;
const failedNames = [];
for (const name of selected) {
  console.log(`\n=== electron tests/${name} ===`);
  const env = { ...process.env };
  // Oturumdan sızan ELECTRON_RUN_AS_NODE binary'i saf Node olarak başlatır.
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [path.join(__dirname, name), '--disable-gpu'],
    { cwd: ROOT, stdio: 'inherit', timeout: TIMEOUT_MS, env });
  if (r.error) { console.log(`  (çalıştırılamadı: ${r.error.message})`); failed++; failedNames.push(name); }
  else if (r.signal === 'SIGTERM') { console.log('  (zaman aşımı)'); failed++; failedNames.push(name); }
  else if (r.status !== 0) { failed++; failedNames.push(name); }
}
console.log(failed ? `\n${failed} smoke BAŞARISIZ: ${failedNames.join(', ')}` : `\n${selected.length} smoke geçti`);
process.exit(failed ? 1 : 0);
