'use strict';
// R156: settings.json bozuk-değer doğrulaması — readPublicSettings'in tip
// kapısı + bozuk dosya işareti; gerçek fs ile tmp dizinde vm-harness.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const start = src.indexOf('var settingsFileCorrupt');
const end = src.indexOf('function migrateSubtitleModelDefault');
ok(start > 0 && end > start, 'dilim bulundu');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-settings-'));
const settingsFile = path.join(dir, 'settings.json');
const { scanJsonShape, DANGEROUS_KEYS } = require('../src/settings-security');
const sandbox = {
  fs, path, settingsPath: () => settingsFile, scanJsonShape, DANGEROUS_KEYS,
};
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox);
const read = () => sandbox.readPublicSettings();

function writeFile(content) {
  fs.writeFileSync(settingsFile, content, 'utf8');
  vm.runInContext('settingsFileCorrupt = false', sandbox);
}

{ fs.rmSync(settingsFile, { force: true });
  vm.runInContext('settingsFileCorrupt = false', sandbox);
  const s = read();
  ok(s.glossary && s.glossary.length === 0, 'eksik dosya → varsayılan');
  ok(sandbox.settingsFileCorrupt === false, 'eksik dosya bozukluk değil'); }

{ writeFile('{bozuk json');
  const s = read();
  ok(s.glossary.length === 0, 'bozuk JSON → varsayılan');
  ok(sandbox.settingsFileCorrupt === true, 'bozuk JSON işaretlendi'); }

{ writeFile('["a","b"]');
  const s = read();
  ok(sandbox.settingsFileCorrupt === true, 'dizi kök bozukluk'); }

{ writeFile('"düz metin"');
  read();
  ok(sandbox.settingsFileCorrupt === true, 'skaler kök bozukluk'); }

{ writeFile(JSON.stringify({ glossary: 'bozuk', ui: [1, 2], translate: 42,
      inputDir: '/tmp/in', preset: 'film', playerSpeed: 1.5 }));
  const s = read();
  ok(s.glossary === undefined, 'dizi olmayan glossary düştü');
  ok(s.ui === undefined && s.translate === undefined, 'nesne olmayan ui/translate düştü');
  ok(s.inputDir === '/tmp/in' && s.preset === 'film' && s.playerSpeed === 1.5,
    'geçerli alanlar korundu');
  ok(sandbox.settingsFileCorrupt === true, 'alan düşümü işaretlendi'); }

{ writeFile(JSON.stringify({ glossary: ['a'], ui: { uiTheme: 'dark' }, inputDir: '/x' }));
  const s = read();
  ok(s.glossary.length === 1 && s.ui.uiTheme === 'dark', 'sağlam dosya dokunulmaz');
  ok(sandbox.settingsFileCorrupt === false, 'sağlam dosya işaretlenmez'); }

// loadSettings tarafının ratchet'i: bozuk dosya forenzik yedeği + kullanıcı uyarısı.
{
  const i = src.indexOf('if (settingsFileCorrupt)');
  ok(i > 0, 'loadSettings bozukluk kolu');
  const body = src.slice(i, i + 1400);
  ok(body.includes('.corrupt-') && body.includes('renameSync'), 'forenzik yedek (silme değil)');
  ok(body.includes('settingsLoadWarning'), 'kullanıcı uyarısı');
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`settings-load-corruption: ${n} kontrol geçti`);
