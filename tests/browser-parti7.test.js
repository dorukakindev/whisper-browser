// Parti 7a — A23 Invidious arama önerileri bağlantı testleri.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const locale = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'ui-locale.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '..', 'backend', 'invidious.py'), 'utf8');

// Backend: resmî endpoint + emisyon sözleşmesi
assert.match(backend, /def suggest\(query, instance=None\):/, 'suggest komutu');
assert.match(backend, /\/api\/v1\/search\/suggestions\?q=/, 'resmî Invidious endpoint');
assert.match(backend, /emit\("suggestions", query=q, suggestions=out, instance=inst\)/, 'instance bilgisi emit edilir');
assert.match(backend, /"suggest"/, 'CLI komut kaydı');

// Main: IPC + auth + ayrı job key + sonuç tipi
assert.match(main, /ipcMain\.handle\('invidious:suggest'/, 'IPC kayıtlı');
assert.match(main, /'suggestions',/, 'sonuç tipi whitelist');
assert.match(main, /'invidious-suggest'/, 'ayrı job key — arama işiyle çakışmaz');
assert.match(main, /12_000/, 'kısa zaman sınırı');

// Preload + DOM
assert.match(preload, /invidious:suggest/, 'preload köprüsü');
assert.ok(indexHtml.includes('id="stSuggestBox"'), 'öneri kutusu');
assert.ok(indexHtml.includes('role="listbox"'), 'listbox rolü');

// Renderer: debounce, iptal (seq), görünür instance, klavye erişimi
assert.match(renderer, /stSuggestTimer = setTimeout/, 'debounce zamanlayıcısı');
assert.match(renderer, /seq !== stSuggestSeq/, 'eski yanıt düşürülür (iptal)');
assert.match(renderer, /window\.api\.invidiousSuggest/, 'köprü çağrısı');
assert.match(renderer, /st-suggest-src/, 'kaynak instance görünür');
assert.match(renderer, /role', 'option'/, 'option rolü');
assert.match(renderer, /e\.key === 'ArrowDown'/, 'ok tuşu gezinmesi');
assert.match(renderer, /blur'/, 'blur ile kapanır');
assert.match(renderer, /pointerdown/, 'mousedown blur yarışı engellenir');
assert.match(locale, /\['Öneriler', /, 'locale çifti');

// --- A17 — mpv/VLC devir ---
assert.match(main, /ipcMain\.handle\('player:external'/, 'external player IPC');
assert.match(main, /EXTERNAL_PLAYER_SPECS/, 'beyaz liste');
assert.match(main, /WHISPER_MPV_PATH/, 'mpv env yolu');
assert.match(main, /WHISPER_VLC_PATH/, 'vlc env yolu');
assert.match(main, /decideUrlPolicy\(String\(o\.url/, 'URL politikası');
assert.match(main, /authorizeMediaFile\(o\.file\)/, 'yerel dosya yetkisi');
assert.match(main, /basename\(p\)\.toLowerCase\(\)\.startsWith\(stem\)/, 'yol doğrulaması');
assert.match(preload, /player:external/, 'preload köprüsü');
assert.match(renderer, /openInExternalPlayer/, 'renderer çağrısı');
assert.match(renderer, /'mpv ile oynat'/, 'kart menüsü mpv');
assert.match(renderer, /'VLC ile oynat'/, 'kart menüsü vlc');
assert.ok(indexHtml.includes('id="browserPlayMpv"'), 'tarayıcı menüsü mpv');
assert.ok(indexHtml.includes('id="browserPlayVlc"'), 'tarayıcı menüsü vlc');
assert.match(renderer, /youtube\.com\/watch\?v=/, 'watch URL gönderilir (imzalı akış değil)');

console.log('browser-parti7.test.js OK');
