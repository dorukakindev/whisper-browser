const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const lock = fs.readFileSync(path.join(root, 'backend/requirements-core.lock'), 'utf8');

assert.match(lock, /^genanki==0\.13\.1$/m, 'genanki çekirdek kilidinde tam sürüme sabit değil');
assert.match(preload, /exportResearchAnnotationsAnki:[\s\S]*?browser:research:exportAnki/,
  'Anki dışa aktarım IPC köprüsü yok');
assert.match(main, /ipcMain\.handle\('browser:research:exportAnki'/, 'Anki IPC işleyicisi yok');
assert.match(main, /stdio: \['pipe', 'pipe', 'pipe'\]/, 'notlar yardımcı sürece stdin üzerinden gitmiyor');
assert.doesNotMatch(main, /export_anki\.py[^\n]+JSON\.stringify/,
  'not içeriği yanlışlıkla süreç argümanlarına taşındı');
assert.match(html, /id="researchExportAnki"[^>]*>Anki paketi dışa aktar</,
  'Anki dışa aktarım düğmesi yok');
assert.match(renderer, /exportResearchAnnotationsAnki\([\s\S]*?researchLibraryFilters\(\)/,
  'Anki dışa aktarımı araştırma filtrelerini kullanmıyor');

console.log('Anki dışa aktarım sözleşmesi: 7/7 OK');
