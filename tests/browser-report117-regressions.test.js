'use strict';
// BROWSER_BUG_REPORT_117 düzeltmelerinin regresyon testleri. Her bölüm rapordaki
// bulgu kimliğiyle işaretlidir. Electron'a bağlı olmayan mantık kaynaktan kesilip
// çalıştırılır; stil/sözlük sözleşmeleri kaynak metin üzerinden doğrulanır.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const mainSource = read('src/main.js');
const rendererSource = read('src/renderer/renderer.js');
const stylesSource = read('src/renderer/styles.css');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (error) {
    console.error(`FAIL ${name}\n  ${error.stack}`);
    process.exitCode = 1;
  }
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} tanımı bulunamadı`);
  const end = source.indexOf('\n}\n', start);
  assert.ok(end > start, `${name} gövdesi kapanmıyor`);
  return source.slice(start, end + 2);
}

// ---- BUG-117-01: araştırma defteri dışa aktarımı tanımsız yazıcı çağırıyordu
test('BUG-117-01 browser:research:export çağırdığı writeTextAtomic tanımlı', () => {
  const handler = mainSource.slice(mainSource.indexOf("ipcMain.handle('browser:research:export'"));
  assert.match(handler.slice(0, 1500), /writeTextAtomic\(/);
  assert.match(mainSource, /\nfunction writeTextAtomic\(filePath, text, io = fs\)/);
});

test('BUG-117-01 writeTextAtomic klasör oluşturur, BOM yazmaz, .tmp bırakmaz', () => {
  // eslint-disable-next-line no-new-func
  const writeTextAtomic = new Function('fs', 'path',
    `${extractFunction(mainSource, 'writeTextAtomic')}\nreturn writeTextAtomic;`)(fs, path);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r111-'));
  try {
    const target = path.join(dir, 'nested', 'defter.md');
    writeTextAtomic(target, '\uFEFF# Başlık\n\n- not');
    assert.equal(fs.readFileSync(target, 'utf8'), '# Başlık\n\n- not');
    assert.equal(fs.existsSync(target + '.tmp'), false);

    // rename başarısızsa geçici dosya temizlenir ve hata yükselir.
    const failingIo = { ...fs, renameSync() { throw new Error('rename failed'); } };
    const other = path.join(dir, 'fail.md');
    assert.throws(() => writeTextAtomic(other, 'x', failingIo), /rename failed/);
    assert.equal(fs.existsSync(other + '.tmp'), false);
    assert.equal(fs.existsSync(other), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- BUG-117-02: model önbelleği silme akışı tanımsız addLog çağırıyordu
test('BUG-117-02 renderer tanımsız addLog çağırmaz', () => {
  const defined = /\bfunction addLog\(|\b(?:const|let|var)\s+addLog\s*=/.test(rendererSource);
  if (!defined) assert.doesNotMatch(rendererSource, /\baddLog\(/);
  const handler = rendererSource.slice(rendererSource.indexOf("$('modelCacheDelete').addEventListener"));
  assert.match(handler.slice(0, 1600), /logLine\(interfaceChoice\(/);
});

test('BUG-117-02 sözlük ekle düğmesi DOM id globaline dayanmaz', () => {
  assert.doesNotMatch(rendererSource, /^glossaryAdd\.addEventListener/m);
  assert.match(rendererSource, /\$\('glossaryAdd'\)\.addEventListener\('click', addGlossaryTerm\)/);
});

// ---- BUG-117-03: omnibox hesaplayıcısında tekli eksi önceliği
test('BUG-117-03 tekli eksi üs almadan düşük önceliklidir', () => {
  const { evaluateArithmetic } = require('../src/browser-omnibox');
  const cases = [
    ['-2^2', -4], ['-(2+3)^2', -25], ['-2^-2', -0.25], ['2^-2', 0.25],
    ['(-2)^2', 4], ['-3*2', -6], ['2*-3', -6], ['2*-3^2', -18],
    ['3--2', 5], ['--2', 2], ['2^3^2', 512], ['10-2-3', 5],
  ];
  for (const [input, expected] of cases) {
    assert.equal(evaluateArithmetic(input), expected, input);
  }
});

// ---- BUG-117-04: açık tema kontrastı (oynatıcı kontrolleri + yan panel)
function lightRuleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesSource.match(new RegExp(`html\\[data-theme="light"\\] ${escaped} \\{([^}]*)\\}`));
  assert.ok(match, `Açık tema kuralı yok: ${selector}`);
  return match[1];
}

test('BUG-117-04 kontrol çubuğu açık temada koyu yüzey token\'larını korur', () => {
  const body = lightRuleBody('.player-controls');
  assert.match(body, /color-scheme:\s*dark/);
  assert.match(body, /--text:\s*#f0f0f2/);
  assert.match(body, /--bg-3:\s*rgba\(30, 30, 33, \.82\)/);
  assert.match(body, /--player-text:\s*#f0f0f2/);
});

test('BUG-117-04 oynatıcı katmanı token\'ları açık temaya bağlanır', () => {
  const body = lightRuleBody('.player-layer');
  assert.match(body, /--player-text:\s*var\(--text\)/);
  assert.match(body, /--player-amber:\s*var\(--accent\)/);
  for (const selector of [
    '.player-layer .cue-card.active .cue-card-src',
    '.player-layer .side-heading-title',
    '.player-layer .action-button-outline',
  ]) lightRuleBody(selector);
});

test('BUG-117-04 parite bloğu dosyanın sonunda (kaskadı kazanır)', () => {
  const index = stylesSource.indexOf('BROWSER_BUG_REPORT_117 — tema eşitliği');
  assert.ok(index > 0);
  assert.ok(index > stylesSource.length * 0.9, 'Blok önceki kuralların ardından gelmeli');
});

test('BUG-117-04 koyu tema meta metinleri AA eşiğini geçer', () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const block = stylesSource.slice(stylesSource.indexOf('BROWSER_BUG_REPORT_117 — tema eşitliği'));
  const time = block.match(/\.cue-position \{ color: (#[0-9a-f]{6}); \}/)[1];
  const origin = block.match(/\.sub-origin \{ color: (#[0-9a-f]{6}); \}/)[1];
  assert.ok(ratio(time, '#0a0c0f') >= 4.5);
  assert.ok(ratio(origin, '#0a0c0f') >= 4.5);
});

// ---- BUG-117-05: İngilizce arayüzde Türkçe kalan metinler
test('BUG-117-05 oynatıcı/browser arayüz metinleri sözlükte', () => {
  const { translate, entries } = require('../src/renderer/ui-locale');
  for (const key of [
    'Sayfa hazır; altyazı yakalama kullanılabilir.', 'Sayfada altyazı aranıyor…',
    'Notlar', 'Tekrar', 'Devam et', 'Koleksiyonlar', 'Sayfada bul', 'Videoyu oynat',
    'Ses kapalı — aç', 'Güvenli HTTPS bağlantısı', 'Birinci kanal: Seçilmedi',
  ]) assert.notEqual(translate(key, 'en'), key, `Çeviri eksik: ${key}`);
  const keys = entries.map(([tr]) => tr);
  assert.equal(new Set(keys).size, keys.length);
});

test('BUG-117-05 transkript boş durum metni etkin dilde yazılır', () => {
  assert.doesNotMatch(rendererSource, /<div class="cue-list-empty">Altyazı yüklenince/);
  // Boşta durum R115'te zenginleştirildi ve UiLocale.t ile çevriliyor.
  assert.match(rendererSource, /cue-empty-rich/);
  assert.doesNotMatch(rendererSource, /<div class="cue-list-empty">Eşleşen satır yok/);
  assert.match(rendererSource, /data-empty-kind="search">\$\{escapeHtml\(interfaceChoice\('Eşleşen satır yok\.', 'No matching cues\.'\)\)\}/);
  // setLocale arama boş durumunu "yüklenince akar" metnine çevirmemeli.
  assert.match(read('src/renderer/ui-locale.js'), /cueEmpty\.dataset\.emptyKind === 'search'/);
});

// ---- BUG-117-06: yeni sekme düğmesi sekmelerin hemen yanında
test('BUG-117-06 sekme şeridi içeriği kadar genişler, kalkan sağa yaslanır', () => {
  assert.match(stylesSource, /\.player-layer\.workspace-browser \.browser-tab-strip \{ flex: 0 1 auto; \}/);
  assert.match(stylesSource, /\.player-layer\.workspace-browser \.browser-tabbar > \.browser-adblock-quick \{ margin-left: auto; \}/);
  const html = read('src/renderer/index.html');
  const strip = html.indexOf('id="browserTabStrip"');
  const newTab = html.indexOf('id="browserTabNew"');
  const shield = html.indexOf('id="browserAdblockQuick"');
  assert.ok(strip < newTab && newTab < shield, 'DOM sırası: şerit → yeni sekme → kalkan');
});

// ---- BUG-117-07: boşluksuz dillerde çeviri dağıtımı grapheme'i bölmez
test('BUG-117-07 ZWJ emoji ve ayrık aksanlı hece tek cue içinde kalır', () => {
  const { distributeTranslation } = require('../src/browser-translation-scheduler');
  const pieces = [0, 1, 2, 3, 4, 5].map((i) => ({ start: i, end: i + 1, text: 'x' }));
  const texts = distributeTranslation({ pieces }, '👨‍👩‍👧日本').map((cue) => cue.text);
  assert.deepEqual(texts, ['👨‍👩‍👧', '日', '本']);
  for (const text of texts) assert.doesNotMatch(text, /^[\u200d\p{M}]+$/u);
  const kana = distributeTranslation({ pieces: pieces.slice(0, 2) }, '\u304b\u3099\u304d\u3099')
    .map((cue) => cue.text.normalize());
  assert.deepEqual(kana, ['が', 'ぎ']);
});

// ---- P-01 / P-02: oynatıcı iyileştirmeleri
test('P-01 kare adımı ölçülmüş kare süresini kullanır', () => {
  assert.match(rendererSource, /video\.requestVideoFrameCallback\(onFrame\)/);
  assert.match(rendererSource, /const frame = player\.frameDuration > 0 \? player\.frameDuration : 1 \/ 25;/);
  assert.doesNotMatch(rendererSource, /video\.currentTime \+= \(e\.key === '\.' \? 1 : -1\) \/ 25/);
});

test('P-02 0–9 kısayolu yerelde ve browserda tanımlı, yardımda listeli', () => {
  assert.match(rendererSource, /video\.currentTime = video\.duration \* Number\(e\.key\) \/ 10;/);
  assert.match(rendererSource, /browserCommand\('seek-relative', target - \(Number\(player\.browserTime\) \|\| 0\)\)/);
  assert.match(read('src/renderer/index.html'), /<kbd>0–9<\/kbd><span>Videonun %0–90 noktası<\/span>/);
});

if (!process.exitCode) console.log(`browser-report117-regressions: ${passed} test geçti`);
