'use strict';
// Plan maddesi 11: settings.json geriye-uyumluluk matrisi — eski sürüm
// dosya şekilleri bugünkü okuyucuda güvenli yüklenmeli:
//   - v2 dönemi ui.* alanları (translateEndpointPreset/BaseUrl/Model/To)
//     consumers'daki fallback zinciriyle okunur (silinmez).
//   - shuaiapi + gemini-3.7-flash → bir seferlik 3.8 migrasyonu; marker
//     kalıcı, çift migrasyon yok, shuai dışı uçlarda modele dokunulmaz.
//   - settingsVersion/özel alanlar korunur; tipi bozuk alanlar düşer.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const readSlice = src.slice(
  src.indexOf('var settingsFileCorrupt'), src.indexOf('function migrateSubtitleModelDefault'));
const migrateSlice = src.slice(
  src.indexOf('function migrateSubtitleModelDefault'), src.indexOf('let settingsLoadWarning'));
ok(readSlice.length > 100 && migrateSlice.length > 100, 'dilimler bulundu');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-backcompat-'));
const settingsFile = path.join(dir, 'settings.json');
const sandbox = { fs, path, URL, settingsPath: () => settingsFile };
vm.createContext(sandbox);
vm.runInContext(readSlice + migrateSlice, sandbox);
const load = () => {
  vm.runInContext('settingsFileCorrupt = false', sandbox);
  return sandbox.migrateSubtitleModelDefault(sandbox.readPublicSettings());
};
const write = (obj) => fs.writeFileSync(settingsFile, JSON.stringify(obj), 'utf8');

// v2 dönemi dosya: yalnız ui.* çeviri alanları, translate nesnesi yok.
write({ settingsVersion: 2, hfToken: 'k',
  ui: { uiTheme: 'dark', translateEndpointPreset: 'https://api.shuaiapi.com/v1',
        translateModel: 'gemini-3.7-flash', translateTo: 'tr' },
  playerSpeed: 1.25, glossary: ['kitap'] });
{
  const s = load();
  ok(s.settingsVersion === 2, 'v2 sürüm alanı korundu');
  ok(s.hfToken === 'k', 'v2 hfToken korundu (kasaya taşıma loadSettings işi)');
  ok(s.ui.translateEndpointPreset === 'https://api.shuaiapi.com/v1', 'v2 ui.preset korundu');
  ok(s.ui.translateModel === 'gemini-3.8-flash', 'v2 ui.model 3.8e taşındı');
  ok(s.ui.translateTo === 'tr', 'v2 ui.translateTo korundu');
  ok(s.playerSpeed === 1.25 && s.glossary[0] === 'kitap', 'v2 keyfi alanlar korundu');
  ok(s.subtitleModelDefault38Applied === true, 'migrasyon işareti');
}

// Aynı dosya ikinci yüklemede çift migrasyon yapmaz.
{
  const s = load();
  ok(s.ui.translateModel === 'gemini-3.8-flash', 'çift migrasyon yok');
  write({ ...s, ui: { ...s.ui, translateModel: 'gemini-3.7-flash' } });
  const s2 = load();
  ok(s2.ui.translateModel === 'gemini-3.7-flash',
    'işaret varken elle 3.7 seçimi ezilmez');
}

// custom preset + shuai customBaseUrl + translate.model 3.7 → 3.8.
write({ translate: { endpointPreset: 'custom',
        customBaseUrl: 'https://cdn.shuaiapi.com/x', model: 'gemini-3.7-flash' } });
{
  const s = load();
  ok(s.translate.model === 'gemini-3.8-flash', 'custom-shuai translate.model 3.8');
}

// shuai dışı uç + 3.7 → model korunur, işaret yine de kurulur.
write({ translate: { endpointPreset: 'custom',
        customBaseUrl: 'https://api.openai.com/v1', model: 'gemini-3.7-flash' } });
{
  const s = load();
  ok(s.translate.model === 'gemini-3.7-flash', 'shuai dışı modele dokunulmaz');
  ok(s.subtitleModelDefault38Applied === true, 'işaret yine kalıcılaşır');
}

// translate.* yok, ui.* da yok → varsayılan preset shuai sayılır ama model
// belirtilmemişse ezilmez.
write({ ui: { uiTheme: 'light' } });
{
  const s = load();
  ok(s.ui.uiTheme === 'light', 'eski minimal dosya korundu');
  ok(s.translate === undefined, 'translate nesnesi icat edilmez');
  ok(s.subtitleModelDefault38Applied === true, 'işaret minimal dosyada da kurulur');
}

// ui.translateBaseUrl fallback'i migrasyonda da okunur (translate.customBaseUrl yok).
write({ translate: { endpointPreset: 'custom', model: 'gemini-3.7-flash' },
        ui: { translateBaseUrl: 'https://oai.sb/v1' } });
{
  const s = load();
  ok(s.translate.model === 'gemini-3.8-flash', 'ui.translateBaseUrl fallback okundu');
}

// Tipi bozuk eski alanlar düşer, geçerliler kalır.
write({ settingsVersion: 2, translate: 'eski-dizgi', ui: 42,
        glossary: 'x', browser: ['y'], catalog: 'z', preset: 'film' });
{
  const s = load();
  ok(s.translate === undefined && s.ui === undefined, 'skaler ui/translate düştü');
  ok(s.glossary === undefined && s.browser === undefined && s.catalog === undefined,
    'yanlış-tiplik alanlar düştü');
  ok(s.preset === 'film' && s.settingsVersion === 2, 'geçerli alanlar korundu');
  ok(sandbox.settingsFileCorrupt === true, 'bozukluk işareti');
}

// Çok eski dosya: settingsVersion hiç yok.
write({ model: 'large-v3', hfToken: 't' });
{
  const s = load();
  ok(s.model === 'large-v3' && s.hfToken === 't', 'sürümsüz dosya korundu');
}

console.log(`PASS: settings-backcompat matrisi (${n} kontrol)`);
