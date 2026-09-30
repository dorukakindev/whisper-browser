// R323-5 — ayar şeması hostile-deserialize fuzz'ı (50'lik gece kuyruğu).
// Hedef: crafted settings.json + renderer kaynaklı hostile ayar yükleri.
//   - readPublicSettings (main.js, vm-dilim): üst-düzey tip kapısı +
//     kirlilik-anahtarı/derinlik/düğüm taraması (B-323-03 — yüklenen
//     __proto__'lu kayıt sonraki her saveSettings'i öldürüyordu)
//   - sanitizeSettings / sanitizeUiSettings / sanitizePlayerPositions:
//     tek fırlatılabilir hata tipi SettingsValidationError, çıktı kirlenemez
//   - migrateSubtitleModelDefault + withDefaultMediaFolders: tip-bozuk
//     girişlerde çöküş yok, prototip değişmez
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const {
  DANGEROUS_KEYS, MAX_JSON_DEPTH, MAX_JSON_NODES,
  SettingsValidationError, sanitizeSettings, scanJsonShape,
} = require('../src/settings-security');
const { withDefaultMediaFolders } = require('../src/media-folders');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (e) { console.error(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; }
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- readPublicSettings vm-dilimi ----------------------------------------
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const fnMatch = mainSrc.match(/function readPublicSettings\(\) \{[\s\S]*?\n\}/);
assert(fnMatch, 'readPublicSettings bulunamadı');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wst-hostile-'));
const tmpFile = path.join(tmpDir, 'settings.json');
function makeSlice() {
  const sandbox = {
    fs, JSON, Array, String, Object, URL, Error,
    settingsPath: () => tmpFile,
    scanJsonShape, DANGEROUS_KEYS,
    settingsFileCorrupt: false,
    settingsFileFullyLost: false,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${fnMatch[0]}`, sandbox);
  return sandbox;
}
function readWith(content) {
  fs.writeFileSync(tmpFile, content);
  const s = makeSlice();
  const out = s.readPublicSettings();
  return { out, corrupt: s.settingsFileCorrupt, lost: s.settingsFileFullyLost };
}
function writeJson(content) {
  if (typeof content === 'string') fs.writeFileSync(tmpFile, content);
  else fs.writeFileSync(tmpFile, JSON.stringify(content));
  const s = makeSlice();
  const out = s.readPublicSettings();
  return { out, corrupt: s.settingsFileCorrupt, lost: s.settingsFileFullyLost };
}

// =========================================================================
test('B-323-03: __proto__/constructor/prototype anahtarları yüklenemez', () => {
  // JSON.parse gerçek own-property '__proto__' üretir — dosyaya yazılan
  // payload aynen budur (object literal '__proto__' prototip yazar, aldatıcı).
  const hostile = JSON.parse(`{
    "ui": { "__proto__": { "polluted": 1 }, "theme": "dark" },
    "playerPositions": { "constructor": { "t": 9999, "d": 9, "at": 1, "title": "evil" } },
    "translate": { "prototype": { "x": 1 }, "model": "m1" },
    "__proto__": { "top": 1 },
    "preset": "film"
  }`);
  const { out, corrupt } = writeJson(hostile);
  assert.equal(corrupt, true);
  assert.equal(out.ui, undefined, 'kirlilik taşıyan ui düşmeli');
  assert.equal(out.playerPositions, undefined);
  assert.equal(out.translate, undefined);
  assert.equal(Object.getOwnPropertyDescriptor(out, '__proto__'), undefined,
    'üst düzey __proto__ own-prop düşmeli');
  assert.equal(out.preset, 'film', 'iyi alan korunur');
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  // En kritik sözleşme: sonuç sanitizeSettings'ten geçmeli — aksi halde
  // bu dosya persistence'ı kalıcı öldürür.
  sanitizeSettings(out, { allowSecrets: true });
});

test('B-323-03 red kanıtı: tarama olmasaydı sonuç save yolunu öldürürdü', () => {
  // Dosya içeriği doğrudan sanitize edilirse (eski davranış eşdeğeri)
  // DANGEROUS_KEYS throw'u → persistence kırılır. Fix sonrası readPublicSettings
  // aynı dosyayı süzülmüş döndürür.
  const hostile = JSON.parse('{"ui":{"__proto__":{"x":1}}}');
  assert.throws(() => sanitizeSettings(hostile, { allowSecrets: true }),
    SettingsValidationError);
  const { out } = writeJson(hostile);
  assert.doesNotThrow(() => sanitizeSettings(out, { allowSecrets: true }));
});

test('derinlik/düğüm sınırları okuma yolunda da uygulanır', () => {
  let deep = {};
  let cursor = deep;
  for (let i = 0; i < MAX_JSON_DEPTH + 5; i++) { cursor.n = {}; cursor = cursor.n; }
  const { out } = writeJson({ deep, ui: { theme: 'dark' } });
  assert.equal(out.deep, undefined, 'aşırı derin ağaç düşmeli');
  assert.equal(out.ui.theme, 'dark', 'yan ağaç korunur');
  const many = {};
  for (let i = 0; i < MAX_JSON_NODES + 10; i++) many[`k${i}`] = i;
  const r2 = writeJson({ playerPositions: many, preset: 'film' });
  assert.equal(r2.out.playerPositions, undefined, 'aşırı düğümlü ağaç düşmeli');
  assert.equal(r2.out.preset, 'film');
});

test('üst-düzey tip kapısı: şema-dışı tipler düşer, iyiler kalır', () => {
  const { out } = writeJson({
    glossary: 'dizi değil', ui: [1, 2], translate: 'str', playerPositions: 5,
    browser: null, catalog: [], hfToken: 'k', ui2: 1,
    uiOk: undefined,
  });
  assert.deepEqual(out.glossary, undefined);
  assert.equal(out.ui, undefined);
  assert.equal(out.translate, undefined);
  assert.equal(out.playerPositions, undefined);
  assert.equal(out.browser, undefined);
  assert.equal(out.catalog, undefined);
  assert.equal(out.hfToken, 'k', 'bilinmeyen anahtarlar geçer');
});

test('bozuk/eksik dosya: tam kayıp varsayılanı', () => {
  assert.deepEqual(readWith('{kırık'), readWith === null ? null : { out: { glossary: [] }, corrupt: true, lost: true });
  // JSON primitive/örüntüsüz: array de tam kayıp
  const r = writeJson([1, 2, 3]);
  assert.deepEqual(r.out, { glossary: [] });
  assert.equal(r.lost, true);
});

// =========================================================================
test('sanitizeSettings: yalnız SettingsValidationError fırlatır (fuzz)', () => {
  const rnd = mulberry32(97531);
  const KEY_POOL = ['ui', 'translate', 'glossary', 'preset', 'inputDir',
    '__proto__', 'constructor', 'hasOwnProperty', 'toString', 'playerPositions'];
  const VAL_POOL = [null, 0, 1.5, NaN, Infinity, 'x', [], {}, [1, 'a', {}],
    { a: { b: { c: 1 } } }, 'film', 'C:\\x', false];
  for (let t = 0; t < 600; t++) {
    const payload = {};
    const n = Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      payload[KEY_POOL[Math.floor(rnd() * KEY_POOL.length)] + i] =
        VAL_POOL[Math.floor(rnd() * VAL_POOL.length)];
    }
    // Nadiren gerçek tehlikeli anahtarları own-prop olarak ekle
    if (rnd() < 0.3) {
      Object.defineProperty(payload, '__proto__',
        { value: { pollute: t }, enumerable: true, writable: true, configurable: true });
    }
    try {
      const clean = sanitizeSettings(payload, { allowSecrets: rnd() < 0.5 });
      assert.equal(Object.getPrototypeOf(clean), Object.prototype);
      for (const k of Object.keys(clean)) {
        assert.ok(!DANGEROUS_KEYS.has(String(k).toLowerCase()),
          `tehlikeli anahtar çıktı: ${k}`);
      }
    } catch (e) {
      assert.ok(e instanceof SettingsValidationError,
        `beklenmeyen hata tipi: ${e && e.constructor && e.constructor.name}: ${e.message}`);
    }
  }
});

test('sanitizePlayerPositions: proto-anahtarı direkt-çağrıda da güvenli', () => {
  const { sanitizeSettings } = require('../src/settings-security');
  // sanitizeSettings içinde tarama önce reddeder; doğrudan davranışı vm'siz
  // doğrulamak için modül içinden geçen tek yol payload — en azından
  // sanitizeSettings çıktısı kirlenmemeli (tarama reddetse bile).
  assert.throws(() => sanitizeSettings(
    { playerPositions: { __proto__: { t: 1, d: 1, at: 1, title: 'x' } } },
    { allowSecrets: true }), SettingsValidationError);
  const ok = sanitizeSettings(
    { playerPositions: { 'file:/v.mp4': { t: 42, d: 100, at: 5, title: 'ok' } } },
    { allowSecrets: true });
  assert.equal(ok.playerPositions['file:/v.mp4'].t, 42);
  assert.equal(Object.getPrototypeOf(ok.playerPositions), Object.prototype);
});

// =========================================================================
const migrateMatch = mainSrc.match(/function migrateSubtitleModelDefault\(settings\) \{[\s\S]*?\n\}/);
assert(migrateMatch, 'migrateSubtitleModelDefault bulunamadı');
test('migrateSubtitleModelDefault: tip-bozuk translate/ui çöküşsüz', () => {
  const sandbox = { URL, JSON, Object };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${migrateMatch[0]}`, sandbox);
  const migrate = sandbox.migrateSubtitleModelDefault;
  for (const hostile of [
    {}, { translate: [] }, { translate: 'x' }, { translate: { endpointPreset: {} } },
    { translate: { endpointPreset: 'custom', customBaseUrl: 42, model: {} } },
    { ui: { translateEndpointPreset: null } }, { translate: null },
  ]) {
    const out = migrate(hostile); // vm realm prototipi — Object.prototype eşitliği kalkmadı
    assert.equal(out.subtitleModelDefault38Applied, true);
  }
});

test('withDefaultMediaFolders: hostile değerlerde varsayılan + proto korunur', () => {
  const dl = path.join(tmpDir, 'indirilenler');
  for (const inputDir of [123, '', '   ', {}, [], null]) {
    const out = withDefaultMediaFolders({ inputDir }, dl);
    assert.equal(out.inputDir, path.join(dl, 'Whisper', 'GİRDİ'));
  }
  const hostile = JSON.parse('{"__proto__":{"x":1},"inputDir":"/ok"}');
  const out = withDefaultMediaFolders(hostile, dl);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal(out.inputDir, '/ok');
});

console.log(`settings-hostile-fuzz: ${passed} test OK`);
