const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const renderer = read('src/renderer/renderer.js');
const indexHtml = read('src/renderer/index.html');
const styles = read('src/renderer/styles.css');
const { buildBrowserReaderScript } = require('../src/browser-reader');

// --- E01/E02: okuma görünümü TOC + 180 karakter mikro metni -------------------
const readerScript = buildBrowserReaderScript('open', { fontSize: 16, lineHeight: 1.5, width: 720 });
assert.match(readerScript, /180 karakter/, 'okuma görünümü hatası 180 karakter eşiğini kullanıcıya açıklamalı (E02)');
assert.match(readerScript, /aria-current/, 'TOC aktif başlığı aria-current ile işaretlenmeli (E01)');
assert.match(readerScript, /prefers-reduced-motion/, 'TOC tıklamaları reduced-motion tercihine saygı göstermeli');
assert.match(readerScript, /syncToc/, 'scrollspy fonksiyonu üretilmeli');
assert.match(readerScript, /toc a:focus-visible/, 'TOC bağlantıları klavye odağı göstermeli');
assert.match(readerScript, /addEventListener\('scroll'/, 'scrollspy sayfa kaydırmasını dinlemeli');

// --- A09: son kullanılan altyazı izleri üstte --------------------------------
assert.match(renderer, /whisper\.browserRecentTracks/, 'iz geçmişi anahtarı');
assert.match(renderer, /rememberBrowserTrackUse\(track\)/, 'başarılı yükleme geçmişe yazılmalı');
assert.match(renderer, /browserTrackRecencyKey/, 'iz için kararlı recency anahtarı');
assert.match(renderer, /orderedTracks/, 'seçenekler recency ile sıralanmalı');
assert.match(renderer, /'↺'/, 'son kullanılan izler görsel olarak işaretlenmeli');

// vm: gerçek fonksiyon gövdesini çıkarıp recency davranışını deterministik doğrula
const keyFn = renderer.match(/function browserTrackRecencyKey\(track\) \{[\s\S]*?\n\}/)[0];
const listFn = renderer.match(/function browserRecentTrackKeys\(\) \{[\s\S]*?\n\}/)[0];
const rememberFn = renderer.match(/function rememberBrowserTrackUse\(track\) \{[\s\S]*?\n\}/)[0];
const store = new Map();
const ctx = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
  JSON,
};
vm.createContext(ctx);
vm.runInContext(`const BROWSER_RECENT_TRACKS_KEY = 'whisper.browserRecentTracks';\n${keyFn}\n${listFn}\n${rememberFn}`, ctx);
vm.runInContext(`
  rememberBrowserTrackUse({ id: 't1', language: 'EN', label: 'English' });
  rememberBrowserTrackUse({ id: 't2', language: 'ja', label: 'Japanese' });
  rememberBrowserTrackUse({ id: 't3', language: 'en', label: 'English' });
`, ctx);
const keys = vm.runInContext('browserRecentTrackKeys()', ctx);
assert.deepEqual(keys, ['en|english', 'ja|japanese'],
  'aynı dil+etiket anahtarı tekilleşip en üste çıkmalı; iki dil kaydı kalmalı');
assert.equal(vm.runInContext('browserTrackRecencyKey({ language: "EN", label: "English" })', ctx), 'en|english');
store.set('whisper.browserRecentTracks', '{bozuk json');
assert.deepEqual(vm.runInContext('browserRecentTrackKeys()', ctx), [], 'bozuk JSON sessizce boş liste dönmeli');
store.set('whisper.browserRecentTracks', '["a","b","c","d","e","f","g","h","i","j"]');
assert.equal(vm.runInContext('browserRecentTrackKeys()', ctx).length, 8, 'geçmiş 8 kayıtla sınırlı');
vm.runInContext('rememberBrowserTrackUse({})', ctx);
assert.equal(vm.runInContext('browserRecentTrackKeys()', ctx)[0], 'a',
  'boş iz geçmişi değiştirmemeli');

// --- A10: SmartTube kart görünümü ayarları -----------------------------------
assert.match(indexHtml, /id="stDisplayToggle"/);
assert.match(indexHtml, /id="stDisplayPanel"/);
assert.match(indexHtml, /id="stCardScale"[^>]*min="60"[^>]*max="160"/, 'kart boyutu 60-160 sınırında');
assert.match(indexHtml, /id="stCardFontScale"[^>]*min="75"[^>]*max="150"/, 'yazı ölçeği 75-150 sınırında');
assert.match(styles, /--st-card-scale/, 'grid kart ölçeğini CSS değişkeninden okumalı');
assert.match(styles, /--st-card-font/, 'kart yazısı CSS değişkeninden okumalı');
assert.match(styles, /\.st-display-panel/, 'panel stili');
assert.match(renderer, /syncStCardDisplay/, 'değişkenleri DOM\'a uygulayan fonksiyon');
assert.match(renderer, /setStDisplayOpen/, 'panel aç/kapa');
assert.match(renderer, /'stCardScale', 'stCardFontScale'/, 'ayarlar kalıcı kontrol listesinde');
assert.match(renderer, /aria-expanded/, 'toggle düğmesi a11y durumunu taşımalı');

// ui-locale çiftleri
const locale = read('src/renderer/ui-locale.js');
assert.match(locale, /'Kart boyutu', 'Card size'/);
assert.match(locale, /'Kart yazısı', 'Card text'/);

console.log('browser-parti2.test.js OK');
