// Conflict-marker ratchet: bir merge çözümü kazası (R145'te CHANGELOG.md'de
// `|||||||` işareti commit edilmişti) tekrar yaşanmasın diye tracked metin
// dosyalarında diff3/git marker kalıntısı arar.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TEXT_EXT = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.json', '.md', '.html', '.css', '.py',
  '.bat', '.yml', '.yaml', '.txt', '.toml', '.ini', '.sh',
]);
const MARKER = /^(<{7}|>{7}|\|{7})[ \t]|^={7}[ \t]*$/m;

function test(name, fn) {
  try { fn(); console.log(`  OK  ${name}`); }
  catch (err) { console.error(`  FAIL ${name}\n${err.stack}`); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

test('tracked metin dosyalarında çatışma işareti kalmaz', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter(file => TEXT_EXT.has(path.extname(file).toLowerCase()))
    .filter(file => file !== 'tests/conflict-markers.test.js');
  const offenders = [];
  for (const file of files) {
    const full = path.join(ROOT, file);
    let text;
    try { text = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }
    if (MARKER.test(text)) offenders.push(file);
  }
  assert(offenders.length === 0,
    `çatışma işareti kalan dosyalar: ${offenders.join(', ')}`);
});
