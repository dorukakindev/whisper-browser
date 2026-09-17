/**
 * Tüm testleri tek komutla çalıştırır:  npm test
 *
 * Node testleri (tests/*.test.js) + Python testleri (backend/test_transcribe.py).
 * Python yoksa test paketi eksik doğrulama bildirerek başarısız olur.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;

// Tek bir test dosyasının asılı kalması CI'yı sonsuza kilitlemesin.
const TEST_FILE_TIMEOUT_MS = 10 * 60 * 1000;

function run(title, cmd, args) {
  console.log(`\n=== ${title} ===`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', timeout: TEST_FILE_TIMEOUT_MS });
  if (r.error) { console.log(`  (çalıştırılamadı: ${r.error.message})`); failed++; return; }
  if (r.signal === 'SIGTERM') { console.log('  (zaman aşımı — test dosyası sonlandırıldı)'); failed++; return; }
  if (r.status !== 0) failed++;
}

// ---- Node testleri
for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.test.js')).sort()) {
  run(`node tests/${f}`, process.execPath, [path.join(__dirname, f)]);
}

// ---- Python testleri
const python = require('./python-runtime').findTestPython();
const py = python ? { cmd: python, prefix: [] } : null;

if (py) {
  // backend/ altındaki TÜM test_*.py dosyaları otomatik keşfedilir — yeni bir Python
  // testi eklendiğinde burayı güncellemek gerekmesin (eskiden yalnız test_transcribe.py
  // koşuyordu ve eklenen testler sessizce atlanıyordu).
  const backendDir = path.join(ROOT, 'backend');
  const pyTests = fs.readdirSync(backendDir)
    .filter((x) => x.startsWith('test_') && x.endsWith('.py'))
    .sort();
  if (!pyTests.length) {
    console.log('\n=== Python testleri ===');
    console.log('  (backend/ altında test_*.py bulunamadı)');
  }
  for (const f of pyTests) {
    run(`python backend/${f}`, py.cmd, [...py.prefix, path.join(backendDir, f)]);
  }
} else {
  console.log('\n=== python backend/test_transcribe.py ===');
  console.log('  (Python bulunamadı — Python testleri çalıştırılamadı)');
  failed++;
}

console.log(failed ? `\n${failed} test dosyası BAŞARISIZ` : '\nTüm testler geçti');
// Electron smoke/soak dosyaları bu paketin parçası değil; envanter ve koşturucu:
console.log('Not: Electron smoke/soak testleri ayrı koşulur — envanter için: node tests/run-electron-smokes.js');
process.exit(failed ? 1 : 0);
