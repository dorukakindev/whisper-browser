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

// --- A28 — playlist detay sayfası + arama sonucu rayı ---
assert.ok(backend.includes('"video", "playlist", "all"'), 'playlist arama tipi whitelist');
assert.match(backend, /type=\{st\}/, 'arama tipi URL parametresi');
assert.match(backend, /_parse_playlist_item/, 'playlist şema ayrıştırıcı');
assert.match(backend, /playlists=playlists/, 'playlists alanı emit edilir');
assert.match(backend, /--search-type/, 'CLI search-type');
assert.match(backend, /--features/, 'CLI features');
assert.match(backend, /&features=\{ft\}/, 'features URL parametresi');
assert.match(main, /--search-type', searchType/, 'main searchType geçişi');
assert.match(main, /--features'/, 'main features geçişi');
assert.match(main, /'invidious:playlist'/, 'playlist IPC var');
assert.match(preload, /invidiousPlaylist/, 'preload playlist köprüsü');
assert.match(renderer, /searchInvidiousPlaylists/, 'renderer playlist araması');
assert.match(renderer, /renderStPlaylistRail/, 'arama üstü playlist rayı');
assert.match(renderer, /openInvidiousPlaylistPage/, 'detay sayfası');
assert.match(renderer, /loadInvidiousPlaylist\(playlistId, \+\+page\)/, 'sayfalama');
assert.match(locale, /\['Oynatma listesi', /, 'locale çifti');

// --- A04 — gerçek bölüm/sekme düzeni ---
for (const s of ['music', 'gaming', 'news', 'live', 'history', 'myplaylists']) {
  assert.ok(indexHtml.includes(`data-st-section="${s}"`), `yan çubuk sekmesi: ${s}`);
}
assert.match(renderer, /section === 'history'/, 'geçmiş bölümü');
assert.match(renderer, /section === 'myplaylists'/, 'listelerim bölümü');
assert.match(renderer, /section === 'live'/, 'canlı bölümü');
assert.match(renderer, /features: 'live'/, 'canlı süzgeci');
assert.match(renderer, /renderStMyPlaylists/, 'liste paneli');
assert.match(renderer, /localStorage\.setItem\('stSection'/, 'bölüm seçimi kaydedilir');
assert.match(renderer, /localStorage\.getItem\('stSection'/, 'bölüm geri yüklenir');
assert.match(renderer, /type === 'youtube'/, 'geçmiş yalnız youtube kayıtları — çift kayıt yok');
assert.match(locale, /\['Canlı', /, 'locale Canlı');
assert.match(locale, /\['Listelerim', /, 'locale Listelerim');

// --- A27 — kanal sekmeleri ---
assert.ok(backend.includes('CHANNEL_TABS'), 'backend sekme whitelist');
assert.match(backend, /channel_tab/, 'channel_tab fonksiyonu');
assert.match(backend, /"channel-tab"/, 'CLI komutu');
assert.match(backend, /\/search\?q=/, 'kanal içi arama ucu');
assert.ok(backend.includes('"channel-tab"'), 'choices listesi');
assert.ok(main.includes("'channel_tab'"), 'sonuç tipi kayıtlı');
assert.match(main, /invidious:channelTab/, 'IPC handler');
assert.match(main, /INV_CHANNEL_TABS/, 'sekme whitelist');
assert.match(preload, /invidiousChannelTab/, 'preload köprüsü');
assert.match(renderer, /ST_CH_TABS/, 'sekme tanımları');
assert.match(renderer, /renderStChannelTab/, 'sekme render');
assert.match(renderer, /loadInvidiousChannelTab/, 'sekme yükleyici');
assert.match(renderer, /Kanalda ara/, 'kanal-içi arama alanı');
assert.match(locale, /\['Topluluk', /, 'locale Topluluk');
assert.match(locale, /\['Oynatma listeleri', /, 'locale listeleri');

console.log('browser-parti7.test.js OK');
