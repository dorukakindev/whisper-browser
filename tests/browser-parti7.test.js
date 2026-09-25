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

// R116 — ⋯ menüsünden oynatıcıya devir (seek sürdürme + tarayıcıda duraklatma)
assert.ok(indexHtml.includes('id="browserWatchInPlayer"'), 'tarayıcı menüsü oynatıcıda izle');
assert.match(renderer, /function watchBrowserVideoInPlayer\(\)/, 'devir işleyicisi');
assert.match(renderer, /if \(\$\('browserWatchInPlayer'\)\)/, 'devir düğmesi sorgusu');
assert.match(renderer, /browserWatchInPlayer'\)\.addEventListener\('click', watchBrowserVideoInPlayer\)/, 'tıklama bağlandı');
assert.match(renderer, /mediaKeyFor\('youtube', url\)/, 'kararlı medya anahtarı');
assert.match(renderer, /pendingLibrarySeek = \{ key: ytKey, generation: null, seconds \}/, 'konum sürdürme');
assert.match(renderer, /pendingAutoOpen = \{ key: ytKey, intent \}/, 'otomatik açma niyeti');
assert.match(renderer, /openYoutubePanelAndProbe\(url\)/, 'probe + panel akışı');
assert.match(renderer, /browserCommand\('pause'\)/, 'tarayıcıda duraklatma');
assert.match(locale, /\['Oynatıcıda izle', 'Watch in player'\]/, 'locale çifti');
assert.match(locale, /\['Video oynatıcıda açılıyor…', 'Opening the video in the player…'\]/, 'durum locale çifti');

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

// --- C03 — site otomatik kuralı: readerAuto ---
{
  const readRel = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const profiles = readRel('src/browser-site-profiles.js');
  const html = readRel('src/renderer/index.html');
  const sec = readRel('src/settings-security.js');
  assert.match(profiles, /readerAuto:\s*\{ type: 'boolean' \}/, 'profil alanı');
  assert.match(html, /id="browserReaderAuto"/, 'ayar kutusu');
  assert.match(renderer, /'browserReaderAuto'/, 'kalıcı kontrol');
  assert.ok(sec.includes("'browserReaderAuto'"), 'settings-security listesi');
  assert.match(renderer, /browserReaderAutoTimer/, 'gecikmeli uygulama');
  assert.match(renderer, /setBrowserReader\(expectedTabId, 'open'/, 'reader açma çağrısı');
  assert.match(renderer, /generation !== expectedGeneration/, 'döngü/eski gezinme koruması');
  assert.match(locale, /\['Bu sitede okuma görünümünü otomatik aç', /, 'locale');
}

// --- A20 + B01 — seekbar kare önizlemesi ---
{
  const readRel = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const html = readRel('src/renderer/index.html');
  const css = readRel('src/renderer/styles.css') + readRel('src/renderer/browser-chrome.css');
  assert.ok(backend.includes('storyboards'), 'backend storyboard alanı');
  assert.match(backend, /templateUrl.*url/, 'template fallback');
  assert.match(backend, /intervalMs/, 'interval normalize');
  assert.match(main, /media:seekPreview/, 'IPC kanalı');
  assert.match(main, /authorizeLocalMediaPath\(filePath\)/, 'dosya yetkisi');
  assert.match(main, /mediaJobs\.seekPreview/, 'iş serileştirme');
  assert.match(main, /terminateProcessTree\(proc/, 'zaman aşımı iptali');
  assert.match(main, /seek-previews/, 'disk önbelleği');
  assert.match(main, /data:image\/jpeg;base64/, 'CSP-uyumlu data URL');
  assert.match(preload, /getSeekPreview/, 'preload köprüsü');
  assert.match(html, /id="seekThumb"/, 'önizleme kutusu');
  assert.match(css, /\.seek-thumb/, 'stil');
  assert.match(renderer, /function updateSeekThumb/, 'hover render');
  assert.match(renderer, /function pickSeekStoryboard/, 'seviye seçimi');
  assert.match(renderer, /ensureSeekPreviewSheet/, 'yerel sprite yükleyici');
  assert.match(renderer, /replace\('\$L'/, 'template $L değişimi');
  assert.match(renderer, /replace\('\$N', `M\$\{page\}`/, 'template $N değişimi');
  assert.match(renderer, /player\.ytInfo\.videoKey === player\.mediaKey/, 'yanlış videoya sprite sızmaz');
}

// --- B03 — OpenSubtitles moviehash wiring ---
{
  const readRel = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const search = readRel('src/browser-subtitle-search.js');
  const features = readRel('src/browser-feature-services.js');
  const bf = readRel('src/renderer/browser-features.js');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'src', 'opensubtitles-hash.js')), 'hash modülü');
  assert.match(search, /moviehash/, 'sorgu parametresi');
  assert.match(search, /moviehash_match === true/, 'sağlayıcı eşleşme bayrağı');
  assert.match(features, /authorizeMedia\(payload\.mediaPath\)/, 'medya yetkisi');
  assert.match(features, /movieHash\(mediaPath\)/, 'hash hesaplama');
  assert.match(features, /delete target\.mediaPath/, 'iç yol sağlayıcıya sızmaz');
  assert.match(bf, /mediaPath: player\.localPath/, 'yerel dosya yolu gönderimi');
  assert.match(bf, /hashMatch/, 'parmak izi rozeti');
  assert.match(readRel('src/main.js'), /authorizeMedia: file => authorizeLocalMediaPath/, 'dep enjeksiyonu');
}

// --- F17 — aynı klipte A/B ASR benchmark'ı ---
{
  const readRel = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const py = readRel('backend/model_benchmark.py');
  const html = readRel('src/renderer/index.html');
  assert.match(py, /--compare-model/, 'ikinci ayar argümanı');
  assert.match(py, /clip_hash = hashlib\.sha256/, 'klip hash (wav sha256)');
  assert.match(py, /cueStartDriftAvgMs/, 'cue zaman sapması');
  assert.match(py, /primaryUnmatchedCueCount/, 'farklı segmentasyonda eşleşmeyen A cue sayısı');
  assert.match(py, /compareUnmatchedCueCount/, 'farklı segmentasyonda eşleşmeyen B cue sayısı');
  assert.match(py, /textDeviation/, 'referans metin sapması');
  assert.match(py, /vramMb/, 'VRAM metriği');
  assert.match(py, /nvidia-smi/, 'CTranslate2 için süreç VRAM ölçümü');
  assert.doesNotMatch(py, /torch\.cuda\.max_memory_allocated/, 'PyTorch dışı motor için yanıltıcı VRAM sayacı yok');
  assert.match(py, /max\(30\.0, min\(120\.0/, '30–120 sn klip sınırı');
  assert.match(main, /--compare-model/, 'IPC argüman geçişi');
  assert.match(main, /'--seconds', String\(seconds\)/, 'seçilen klip süresi backend\'e gider');
  assert.match(main, /'--start', String\(start\)/, 'seçilen klip başlangıcı backend\'e gider');
  assert.match(main, /recordModelBenchmark/, 'klip-hash kaydı');
  assert.match(main, /models:benchmark:history/, 'geçmiş kanalı');
  assert.match(preload, /modelBenchmarkHistory/, 'preload köprüsü');
  assert.match(html, /id="modelBenchmarkCompare"/, 'A/B seçici');
  assert.match(html, /id="modelBenchmarkStart"/, 'klip başlangıç seçici');
  assert.match(html, /id="modelBenchmarkSeconds"/, '30–120 sn süre seçici');
  assert.match(renderer, /compareModel/, 'renderer karşılaştırma gönderimi');
  assert.match(renderer, /clipStartSeconds/, 'başlangıç geçmiş ve sonuç görünümünde korunur');
}

// --- F18 — model önbelleği temizliği + capability registry ---
{
  const readRel = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const mm = readRel('src/model-manager.js');
  const html = readRel('src/renderer/index.html');
  assert.match(mm, /MODEL_CATALOG/, 'kapasite kaydı');
  assert.match(mm, /deleteCachedModel/, 'güvenli silme');
  assert.match(mm, /realpathSync\(found\.repo\.path\)/, 'junction ve symlink sonrası gerçek yol doğrulaması');
  assert.match(mm, /statfsSync/, 'boş disk raporu');
  assert.match(mm, /sizeBytes/, 'kurulu boyut raporu');
  assert.match(main, /models:delete/, 'silme kanalı');
  assert.match(main, /dialog\.showMessageBox/, 'açık kullanıcı onayı');
  assert.match(main, /modelBenchmarkJob \|\| modelProcesses\.size/, 'iş çalışırken reddetme');
  assert.match(preload, /deleteModel/, 'preload köprüsü');
  assert.match(html, /id="modelCacheDelete"/, 'silme düğmesi');
  assert.match(renderer, /modelCacheDelete/, 'renderer silme akışı');
  assert.match(html, /id="runtimeMaintenance"/, 'bağımlılık ve bakım panosu');
  assert.match(html, /id="runtimePython"[\s\S]*id="runtimeFfmpeg"[\s\S]*id="runtimeYtdlp"[\s\S]*id="runtimeGpu"[\s\S]*id="runtimeDisk"/, 'çalışma ortamı durum satırları');
  assert.match(main, /pythonVersion:[\s\S]*ffmpegVersion:[\s\S]*ytDlpVersion:/, 'ortam sürümleri IPC yanıtı');
  assert.match(main, /ytDlpManaged:/, 'doğrulanmış yönetilen yt-dlp kaynağı');
  assert.match(renderer, /element\.dataset\.state = status/, 'durumlar renk dışında simge ve metin taşır');
  assert.match(renderer, /verified managed runtime/, 'yönetilen runtime açıklaması');
}

// --- E05/E06 — boş durum ayrımı + burn-in aşama/iptal görünürlüğü ---
{
  const readRel = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const bf = readRel('src/renderer/browser-features.js');
  const statusCopy = readRel('src/renderer/status-copy.js');
  assert.match(bf, /subtitleSearchCopy\(\{ failed: true \}\)/, 'API hatası davranış kopyasına gider');
  assert.match(bf, /totalCount/, 'kısmi liste göstergesi');
  assert.match(statusCopy, /Search failed/, 'İngilizce altyazı arama hata durumu');
  assert.match(statusCopy, /No matching subtitles found/, 'İngilizce boş sonuç durumu');
  assert.match(renderer, /type: 'cancel'/, 'burn-in iptal durumu');
  assert.match(statusCopy, /Preparing subtitle embed/, 'İngilizce burn-in başlangıç aşaması');
  assert.match(statusCopy, /clock\(event\.total\)/, 'burn-in süre göstergesi');
}

// R117 — "Altyazı işlemleri ▾": 4 üretim eylemi tek details menüsünde
{
  assert.ok(indexHtml.includes('id="subtitleActionsMenu"'), 'altyazı işlemleri menüsü yok');
  assert.ok(indexHtml.includes('Altyazı işlemleri'), 'menü etiketi yok');
  assert.match(indexHtml, /class="subtitle-actions-pop" role="menu"/, 'popover rolü eksik');
  for (const id of ['makeSubsBtn', 'makeTransBtn', 'retranslateAllBtn', 'exportTranslationBtn']) {
    const re = new RegExp(`id="${id}"[^>]*role="menuitem"|role="menuitem"[^>]*id="${id}"`);
    assert.match(indexHtml, re, `${id} menuitem rolü eksik`);
  }
  assert.match(renderer, /playerDetailsMenuIds = \[[^\]]*'subtitleActionsMenu'/, 'menü details-menu listesinde değil');
  assert.match(renderer, /#subtitleActionsMenu/, 'dış tık ile kapanış seçicisinde değil');
  assert.match(renderer, /\.subtitle-actions-pop button/, 'öğe tıklaması menüyü kapatmıyor');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'browser-chrome.css'), 'utf8');
  assert.match(css, /\.subtitle-actions-pop\s*\{/, 'popover stili yok');
  assert.match(css, /bottom:\s*calc\(100% \+ 8px\)/, 'menü yukarı açılmıyor');
  assert.match(locale, /\['Altyazı işlemleri', /, 'locale çifti eksik');
}

// R117 — otomatik sıradaki: 5 sn geri sayım kartı + iptal/şimdi oynat
{
  assert.ok(indexHtml.includes('id="stUpNextCount"'), 'geri sayım kartı yok');
  assert.ok(indexHtml.includes('id="stUpNextCountSecs"'), 'saniye göstergesi yok');
  assert.ok(indexHtml.includes('id="stUpNextCountPlay"'), 'şimdi oynat düğmesi yok');
  assert.ok(indexHtml.includes('id="stUpNextCountCancel"'), 'iptal düğmesi yok');
  assert.match(renderer, /function stUpNextCountdownStart\(/, 'geri sayım başlatıcı yok');
  assert.match(renderer, /function cancelStUpNextCountdown\(\)/, 'iptal işleyicisi yok');
  assert.match(renderer, /secs -= 1;/, 'saniye azaltımı yok');
  assert.match(renderer, /stAutoRelatedPlay\(v\)/, 'sayım sonu geçişi bağlı değil');
  assert.match(renderer, /stUpNextCountdownStart\(next\)/, 'otomatik sıradaki sayıma bağlı değil');
  assert.match(renderer, /cancelStUpNextCountdown\(\);\s*\n\s*showControls\(\)/, 'oynatma iptal noktası eksik');
  assert.match(renderer, /cancelStUpNextCountdown\(\);\s*\n\s*closeBrowserFind/, 'closePlayer iptal noktası eksik');
  assert.match(locale, /\['Şimdi oynat', /, 'locale çifti eksik');
}


// R117 — adres aynası (domain-bold) + hız popup'ı
{
  const css2 = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'browser-chrome.css'), 'utf8');
  assert.ok(indexHtml.includes('id="browserAddressMirror"'), 'adres aynası DOM eksik');
  assert.ok(indexHtml.includes('browser-address-field'), 'adres alanı sarmalayıcı eksik');
  assert.match(renderer, /function updateBrowserAddressMirror\(\)/, 'ayna senkron fonksiyonu yok');
  assert.match(renderer, /new URL\(input\.value\)/, 'URL ayrıştırma yok');
  assert.match(renderer, /browserAddressMirrorHost/, 'host span yazılmıyor');
  assert.match(renderer, /document\.activeElement === input/, 'odak kontrolü yok');
  assert.match(css2, /\.browser-address-mirror/, 'ayna stili yok');
  assert.match(css2, /input\.mir-mode[^\n]*color:\s*transparent/, 'gizli metin kuralı yok');
  assert.ok(indexHtml.includes('id="playerSpeedMenu"'), 'hız menüsü eksik');
  assert.ok(indexHtml.includes('player-speed-pop'), 'hız popup kabı eksik');
  assert.match(indexHtml, /id="playerSpeed"[^>]*aria-hidden="true"/, 'select gizli işaretlenmedi');
  assert.match(renderer, /function playerSpeedPopupSync\(\)/, 'hız popup senkronu yok');
  assert.match(renderer, /data-speed-value/, 'hız öğesi value taşımıyor');
  assert.match(renderer, /dispatchEvent\(new Event\('change'/, 'hız seçimi select change fırlatmıyor');
  assert.match(renderer, /'playerSpeedMenu'/, 'menü kayıtlarında playerSpeedMenu yok');
  assert.match(css2, /\.player-speed-pop/, 'hız popup stili yok');
  assert.match(css2, /\.player-speed-wrap > \.player-speed[^\n]*opacity:\s*0/, 'gizli select kuralı yok');
  // R117 test-turu bulguları: F1 — mir-mode kuralı .workspace-browser...input (0,2,1)
  // ile tie'a girip kaybediyordu; kural artık daha spesifik (workspace-browser zinciri).
  assert.match(css2, /\.workspace-browser\s+\.browser-address-wrap\s+input\.mir-mode[^\n]*color:\s*transparent/, 'mir-mode spesifitesi yetersiz (F1)');
  // F2 — .action-button-outline sabit koyu-palet renkleri; açık temada ~1.6:1 idi.
  assert.match(css2, /html\[data-theme="light"\]\s+\.action-button-outline/, 'açık tema outline geçersiz kılma yok (F2)');
  // F3 — .tool-row-main .btn-primary { order:-1 } görsel sırayı DOM'dan ayırıyordu.
  assert.ok(!/\.tool-row-main\s+\.btn-primary\s*\{[^}]*order:\s*-1/.test(css2), 'tool-row order:-1 hâlâ var (F3)');
}

console.log('browser-parti7.test.js OK');
