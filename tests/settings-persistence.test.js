const assert = require('assert');
const fs = require('fs');
const path = require('path');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

assert.match(main,
  /ipcMain\.handle\('settings:save',[\s\S]*?saveSettings\(\{ \.\.\.loadSettings\(\), \.\.\.s \}\);[\s\S]*?\}\);/,
  'renderer ayar kaydı ana süreç alanlarını birleştirerek korumuyor');
assert.match(main, /parseImportText\(readImportFile[\s\S]*writeJsonTransaction\(entries\)/,
  'ayar içe aktarma doğrulanmış veriyi transaction ile uygulamıyor');

console.log('settings-persistence: 2 test');
