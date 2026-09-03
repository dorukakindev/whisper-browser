/**
 * Tüm testleri tek komutla çalıştırır:  npm test
 *
 * Node testleri (tests/*.test.js) + Python testleri (backend/test_transcribe.py).
 * Python testleri venv yoksa atlanır (kurulum yapılmamış makinede npm test yine çalışsın).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;

function run(title, cmd, args) {
  console.log(`\n=== ${title} ===`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.error) { console.log(`  (çalıştırılamadı: ${r.error.message})`); failed++; return; }
  if (r.status !== 0) failed++;
}

// ---- Node testleri
for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.test.js')).sort()) {
  run(`node tests/${f}`, process.execPath, [path.join(__dirname, f)]);
}

// ---- Python testleri (venv varsa)
const localPy = ['backend/venv/Scripts/python.exe', 'backend/venv/bin/python', 'backend/.venv/Scripts/python.exe']
  .map((p) => path.join(ROOT, p))
  .find((p) => fs.existsSync(p));
let py = localPy ? { cmd: localPy, prefix: [] } : null;
if (!py) {
  const candidates = process.platform === 'win32'
    ? [{ cmd: 'python', prefix: [] }, { cmd: 'py', prefix: ['-3'] }]
    : [{ cmd: 'python3', prefix: [] }, { cmd: 'python', prefix: [] }];
  py = candidates.find((candidate) => {
    const probe = spawnSync(candidate.cmd, [...candidate.prefix, '--version'], { cwd: ROOT, stdio: 'ignore' });
    return !probe.error && probe.status === 0;
  }) || null;
}

if (py) {
  run('python backend/test_transcribe.py', py.cmd,
    [...py.prefix, path.join(ROOT, 'backend', 'test_transcribe.py')]);
} else {
  console.log('\n=== python backend/test_transcribe.py ===');
  console.log('  (Python bulunamadı — Python testleri atlandı)');
}

console.log(failed ? `\n${failed} test dosyası BAŞARISIZ` : '\nTüm testler geçti');
process.exit(failed ? 1 : 0);
