'use strict';

/**
 * Report 67 — SmartTube/Invidious entegrasyon düzeltmeleri regresyon testi.
 *
 * R67-01 (P0): initPlayerSource() çağrısı `let playerSource`/`const INV_KEY`'den
 *   ÖNCE çalışıyordu → TDZ ReferenceError ile ~1200 satır ölüyordu.
 * R67-02: runInvidiousCommand yalnız probe/subs yakalıyordu → feed/search/login
 *   başarıda bile {ok:false}.
 * R67-03: Login modalı <script>'ten sonra → butonlar hiç bağlanamazdı.
 * R67-04: CSP instance hostlarını/thumbnail'leri blokluyordu.
 * R67-05: Paralel feed çağrıları tek mediaJobs.invidious slot'unda çakışıyordu.
 * R67-07: downloadStream yanlış script'e (invidious.py) gidiyordu.
 * R67-12: opts.instance doğrulanmadan argv'ye geçiyordu.
 * R67-13: cancel sahiplik ihlali (mediaJobs[kind]=null yakın-kayıp yarışı).
 * R67-15: SID renderer'a dönüyordu.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RENDERER = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
const LOCALE = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'ui-locale.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
const INV_PY = fs.readFileSync(path.join(ROOT, 'backend', 'invidious.py'), 'utf8');
const MEDIA_PY = fs.readFileSync(path.join(ROOT, 'backend', 'media.py'), 'utf8');

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------- R67-01: TDZ sıralaması ----------
test('R67-01: INV_KEY/playerSource bildirimleri initPlayerSource() çağrısından önce', () => {
  const declConst = RENDERER.indexOf("const INV_KEY = 'player:source'");
  const declLet = RENDERER.indexOf("let playerSource = 'ytdlp'");
  const callSite = RENDERER.indexOf('initPlayerSource();');
  assert.ok(declConst > 0, 'INV_KEY bildirimi bulunamadı');
  assert.ok(declLet > 0, 'playerSource bildirimi bulunamadı');
  assert.ok(callSite > 0, 'initPlayerSource() çağrısı bulunamadı');
  assert.ok(declConst < callSite, `TDZ: INV_KEY (${declConst}) çağrıdan (${callSite}) sonra`);
  assert.ok(declLet < callSite, `TDZ: playerSource (${declLet}) çağrıdan (${callSite}) sonra`);
  // Bildirim tek olmalı — kopya tanım SyntaxError verir
  assert.strictEqual(RENDERER.split("const INV_KEY = 'player:source'").length - 1, 1,
    'INV_KEY birden fazla kez bildirilmiş');
  assert.strictEqual(RENDERER.split("let playerSource = 'ytdlp'").length - 1, 1,
    'playerSource birden fazla kez bildirilmiş');
});

// ---------- R67-02: sonuç tipleri ----------
test('R67-02: runInvidiousCommand tüm sonuç tiplerini yakalar', () => {
  const whitelist = MAIN.match(/INVIDIOUS_RESULT_TYPES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(whitelist, 'INVIDIOUS_RESULT_TYPES bulunamadı');
  for (const t of ['probe', 'subs', 'feed', 'search', 'channel', 'login', 'logout', 'downloaded']) {
    assert.ok(whitelist[1].includes(`'${t}'`), `sonuç tipi eksik: ${t}`);
  }
  assert.match(MAIN, /INVIDIOUS_RESULT_TYPES\.has\(ev\.type\)/);
});

// ---------- R67-03: modal konumu ----------
test('R67-03: login modalı renderer.js script etiketinden ÖNCE', () => {
  const modalPos = HTML.indexOf('id="invidiousLoginModal"');
  const scriptPos = HTML.indexOf('<script src="renderer.js">');
  assert.ok(modalPos > 0, 'modal markup yok');
  assert.ok(scriptPos > 0, 'renderer.js script etiketi yok');
  assert.ok(modalPos < scriptPos, 'modal script\'ten sonra — butonlar bağlanamaz');
});

// ---------- R67-04: CSP ----------
test('R67-04: CSP img-src/media-src/connect-src https: içerir', () => {
  const csp = HTML.match(/Content-Security-Policy[^>]+content="([^"]+)"/);
  assert.ok(csp, 'CSP meta yok');
  assert.match(csp[1], /img-src[^;]*https:/, 'img-src https: eksik (thumbnail\'lar bloklanır)');
  assert.match(csp[1], /media-src[^;]*https:/, 'media-src https: eksik (akış bloklanır)');
  assert.match(csp[1], /connect-src[^;]*https:/, 'connect-src https: eksik (HLS manifest bloklanır)');
  assert.match(csp[1], /script-src 'self'/, 'script-src gevşememeli');
});

// ---------- R67-05: renderer çağrı kuyruğu ----------
test('R67-05: renderer Invidious çağrılarını invCall zinciriyle sıraya koyar', () => {
  assert.match(RENDERER, /let invCallChain = Promise\.resolve\(\)/);
  assert.match(RENDERER, /function invCall\(fn\)/);
  // feed/search/channel/probe/subs/login hepsi invCall üzerinden
  for (const call of ['invidiousFeed', 'invidiousSearch', 'invidiousChannel',
                      'probeInvidious', 'downloadInvidiousSubs', 'invidiousLogin']) {
    assert.match(RENDERER, new RegExp(`invCall\\(\\(\\) => window\\.api\\.${call}`),
      `${call} invCall zincirine bağlı değil`);
  }
});

// ---------- R67-07: downloadStream media.py'ye ----------
test('R67-07: invidious:downloadStream media.py üzerinden çalışır', () => {
  const handler = MAIN.match(/ipcMain\.handle\('invidious:downloadStream'[\s\S]*?\n\}\);/);
  assert.ok(handler, 'downloadStream handler bulunamadı');
  assert.match(handler[0], /runMediaCommand\(/, 'downloadStream hâlâ runInvidiousCommand kullanıyor');
  assert.doesNotMatch(handler[0], /runInvidiousCommand\(/, 'downloadStream invidious.py\'ye gitmemeli');
  assert.match(handler[0], /'download'[,\)]/, "'download' slot'u kullanılmalı");
  // R68-K1: iş 'invidious-stream' etiketi taşır — invidious:cancel tanır
  assert.match(handler[0], /'invidious-stream'/, 'jobTag eksik — invidious:cancel işi öldüremez');
});

// ---------- R67-12: instance doğrulama ----------
test('R67-12: opts.instance http/https origin\'e indirgenir', () => {
  assert.match(MAIN, /function validateInvidiousInstance\(/);
  assert.match(MAIN, /u\.origin/, 'origin normalizasyonu (credential/path atılır) yok');
});

// ---------- R67-13: cancel sahipliği ----------
test('R67-13: invidious:cancel mediaJobs slot\'unu null\'lamaz', () => {
  const cancel = MAIN.match(/ipcMain\.handle\('invidious:cancel'[\s\S]*?\n\}\);/);
  assert.ok(cancel, 'cancel handler bulunamadı');
  assert.doesNotMatch(cancel[0], /mediaJobs\.invidious\s*=\s*null/,
    'cancel slot\'u null\'luyor — close handler sahipliği bozulur');
});

// ---------- R67-15: SID renderer'a gitmez ----------
test('R67-15: login sonucu renderer\'a SID olmadan döner', () => {
  const login = MAIN.match(/ipcMain\.handle\('invidious:login'[\s\S]*?\n\}\);/);
  assert.ok(login, 'login handler bulunamadı');
  assert.match(login[0], /sid,\s*\.\.\.safeData|'sid'\s+in\s+res\.data/,
    'SID soyma yok — renderer\'a sızar');
  assert.match(MAIN, /WHISPER_INVIDIOUS_SID/, 'SID env kanalı yok');
});

// ---------- Backend: auth/feed + email + srv3 + sid ----------
test('backend: /api/v1/auth/feed endpoint\'i kullanılır', () => {
  assert.match(INV_PY, /\/api\/v1\/auth\/feed/);
  assert.doesNotMatch(INV_PY, /api\/v1\/feed\/subscriptions/);
});

test('backend: login formu email alanı gönderir', () => {
  const login = INV_PY.match(/def login\([\s\S]*?body_bytes = /);
  assert.ok(login, 'login fonksiyonu yok');
  assert.match(login[0], /"email":\s*username/, "'email' alanı gönderilmiyor");
});

test('backend: timedtext srv3 istenir ve srv1 parse edilir', () => {
  assert.match(INV_PY, /fmt=srv3/);
  assert.match(INV_PY, /findall\("[^"]*text"\)/, 'srv1 <text> parse yok');
  assert.match(INV_PY, /findall\("[^"]*body[^"]*p"\)/, 'srv3 <p> parse yok');
});

test('backend: SID env/argv kabul edilir ve session kurulur', () => {
  assert.match(INV_PY, /WHISPER_INVIDIOUS_SID/);
  assert.match(INV_PY, /--sid/);
  assert.match(INV_PY, /set_session\(cookie=sid\)/);
});

test('backend: instance failover yardımcısı var', () => {
  assert.match(INV_PY, /def _fetch_with_failover\(/);
  assert.match(INV_PY, /def _iter_instances\(/);
});

test('backend: probe renderer şemasına uyar (heights sayı, stream obje)', () => {
  const emit = INV_PY.match(/emit\(\s*\n\s*"probe",[\s\S]*?source="invidious"/);
  assert.ok(emit, 'probe emit yok');
  assert.match(emit[0], /heights=heights/);
  assert.match(emit[0], /stream=stream_obj/);
  assert.match(emit[0], /isLive=/);
  assert.match(emit[0], /audioLangs=/);
  assert.match(emit[0], /dashUrl=/);
});

// ---------- media.py: download_stream ----------
test('media.py: --url opsiyonel ve --video-id kabul edilir', () => {
  assert.match(MEDIA_PY, /add_argument\("--url", default=""\)/, '--url hâlâ required');
  assert.match(MEDIA_PY, /--video-id/);
});

test('media.py: container mime\'dan seçilir + kısmi dosya silinir', () => {
  assert.match(MEDIA_PY, /def _mime_of\(/);
  assert.match(MEDIA_PY, /out_path\.unlink\(\)/, 'kısmi çıktı silinmiyor');
  assert.match(MEDIA_PY, /\.invtmp-/, 'tmp soneki yok');
});

test('media.py: ffmpeg indirmeden ÖNCE kontrol edilir', () => {
  const fn = MEDIA_PY.match(/def download_stream\([\s\S]*?def fetch\(/);
  assert.ok(fn, 'download_stream yok');
  const ffCheck = fn[0].indexOf('_find_ffmpeg()');
  const fetchStart = fn[0].indexOf('def fetch(');
  assert.ok(ffCheck > 0 && ffCheck < fetchStart,
    'ffmpeg kontrolü fetch\'ten sonra — GB\'lar boşa iner');
});

// ---------- renderer: SmartTube işlevselliği ----------
test('renderer: SmartTube kartı tek-tık oynatma (pendingAutoOpen)', () => {
  assert.match(RENDERER, /player\.pendingAutoOpen = \{ key: mediaKeyFor\('youtube', url\)/);
});

test('renderer: Trend ayracı tam satır — iç içe .st-grid wrap yok', () => {
  // #stGrid zaten display:grid — ayrac/wrap grid item olarak eklenirse tek
  // hücreye sıkışır (TRENDING şeridi boş kutu + scrollbar görünümü).
  const sec = RENDERER.slice(
    RENDERER.indexOf("renderSmartTubeGrid(grid, dedupe(videos)"),
    RENDERER.indexOf('} else {', RENDERER.indexOf("renderSmartTubeGrid(grid, dedupe(videos)"))
  );
  assert.match(sec, /st-grid-row|gridColumn\s*=\s*['"]1 \/ -1['"]/,
    'ayraç tam satır kaplamıyor');
  assert.doesNotMatch(sec, /createElement\('div'\)[\s\S]{0,200}className\s*=\s*'st-grid'/);
});

test('renderer: bölüm render yarış koruması (stSectionSeq)', () => {
  assert.match(RENDERER, /let stSectionSeq = 0/);
  assert.match(RENDERER, /seq !== stSectionSeq/);
});

test('renderer: auth UI senkronu + oturum geri yükleme', () => {
  assert.match(RENDERER, /function refreshSmartTubeAuthUI\(/);
  assert.match(RENDERER, /function restoreInvidiousSession\(/);
  assert.match(RENDERER, /restoreInvidiousSession\(\)/);
});

test('renderer: login modalı Esc/backdrop/şifre-temizleme', () => {
  const modal = RENDERER.match(/function openInvidiousLogin[\s\S]*?^}/m);
  assert.ok(modal, 'openInvidiousLogin yok');
  assert.match(modal[0], /Escape/);
  assert.match(RENDERER, /pass\.value = ''/, 'şifre DOM\'da kalıyor');
});

test('renderer: HLS kurtarma aktif kaynağı kullanır (yt-dlp sabit değil)', () => {
  const recovery = RENDERER.match(/NETWORK_ERROR[\s\S]{0,1200}?probeYoutube|probeWithActiveSource/);
  assert.match(RENDERER, /res = await probeWithActiveSource\(info\.sourceUrl\)/,
    'HLS kurtarma yt-dlp\'ye sabitlenmiş');
});

test('renderer: invidious:event logları dinleniyor', () => {
  assert.match(RENDERER, /window\.api\.onInvidiousEvent/);
});

// ---------- R67 devamı: SmartTube parite işlevleri ----------

test('renderer: grid roving ok-tuşu gezinmesi bağlı', () => {
  assert.match(RENDERER, /function stGridNavKeydown\(/);
  assert.match(RENDERER, /ArrowLeft[\s\S]{0,80}ArrowRight[\s\S]{0,80}ArrowUp[\s\S]{0,80}ArrowDown/);
  assert.match(RENDERER, /function initSmartTubeGridNav\(/);
  assert.match(RENDERER, /initSmartTubeGridNav\(\)/);
  assert.match(RENDERER, /addEventListener\('keydown', stGridNavKeydown\)/);
  // Kart içindeki butondan (kanal linki) da en yakın karta döner
  assert.match(RENDERER, /closest\('\.st-card'\)/);
});

test('renderer: trend kategori chip\'leri backend tab parametresiyle çağrılır', () => {
  assert.match(RENDERER, /function buildTrendChips\(/);
  assert.match(RENDERER, /stTrendTab/);
  assert.match(RENDERER, /opts\.tab \? \{ tab: stTrendTab \}|\{ tab: stTrendTab \}/);
  assert.match(RENDERER, /invidiousFeed\(kind, opts\)/);
  assert.match(MAIN, /--tab', tab/);
  assert.match(INV_PY, /def feed_trending\(instance=None, tab=None\)/);
  assert.match(INV_PY, /_TREND_TABS/);
});

test('renderer: degraded yedek kaynak Invidious gibi gösterilmez', () => {
  assert.match(RENDERER, /feedData\.degraded|feedData && feedData\.degraded/);
  assert.match(RENDERER, /Yedek kaynak \(yt-dlp\)/);
  // Backend payload'ları source/degraded taşır (dict veya kwargs biçimi)
  assert.match(INV_PY, /"degraded": True, "source": "yt-dlp"|degraded=True, source="yt-dlp"/);
  assert.match(INV_PY, /"instance": "yt-dlp:tab"|instance="yt-dlp:tab"/);
});

test('backend: trending/popular yedeği arama değil gerçek feed sayfası', () => {
  assert.match(INV_PY, /def _ytdlp_tab_videos\(/);
  assert.match(INV_PY, /youtube\.com\/feed\/trending/);
  // Eski meta-çöp sorguları kalmamalı
  assert.doesNotMatch(INV_PY, /_ytdlp_search_videos\("youtube trending videos today"/);
  assert.doesNotMatch(INV_PY, /_ytdlp_search_videos\("trending music 2026"/);
});

test('backend: probe recommended listesi emit eder', () => {
  const emit = INV_PY.match(/emit\(\s*\n\s*"probe",[\s\S]*?source="invidious"/);
  assert.ok(emit, 'probe emit yok');
  assert.match(emit[0], /recommended=\[/);
  assert.match(emit[0], /recommendedVideos/);
});

test('backend: comments + playlist komutları şema-doğrulamalı', () => {
  assert.match(INV_PY, /def comments\(video_url/);
  assert.match(INV_PY, /def playlist\(playlist_id/);
  assert.match(INV_PY, /\/api\/v1\/comments\//);
  assert.match(INV_PY, /\/api\/v1\/playlists\//);
  // Playlist ID whitelist
  assert.match(INV_PY, /isalnum\(\) or ch in "-_"/);
  // Komutlar argparse'a bağlı
  assert.match(INV_PY, /elif args\.command == "comments"/);
  assert.match(INV_PY, /elif args\.command == "playlist"/);
});

test('main.js+preload: comments/playlist IPC uçtan uca', () => {
  assert.match(MAIN, /ipcMain\.handle\('invidious:comments'/);
  assert.match(MAIN, /ipcMain\.handle\('invidious:playlist'/);
  // Video ID (11 char) veya http/https URL — başka bir şey değil
  assert.match(MAIN, /\{11\}\$\/\.test/);
  // Playlist ID whitelist
  assert.match(MAIN, /\[A-Za-z0-9_-\]\{2,200\}/);
  // Sonuç tipleri whitelist'te
  const wl = MAIN.match(/INVIDIOUS_RESULT_TYPES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.match(wl[1], /'comments'/);
  assert.match(wl[1], /'playlist'/);
  // Preload köprüsü
  assert.match(PRELOAD, /invidiousComments:.*'invidious:comments'/);
  assert.match(PRELOAD, /invidiousPlaylist:.*'invidious:playlist'/);
});

test('renderer: kart kanal linki oynatmayı tetiklemez (stopPropagation)', () => {
  const card = RENDERER.match(/function buildSmartTubeCard[\s\S]*?return card;\n}/);
  assert.ok(card, 'buildSmartTubeCard yok');
  assert.match(card[0], /st-card-author/);
  assert.match(card[0], /openInvidiousChannelPage\(video\.authorId\)/);
  const goChannel = card[0].match(/const goChannel[\s\S]*?};/);
  assert.ok(goChannel && /stopPropagation/.test(goChannel[0]),
    'kanal tıklaması kart oynatmayı da tetikler');
});

test('renderer: arama sayfalama dedupe + yarış korumalı', () => {
  assert.match(RENDERER, /stSearchSeen/);
  assert.match(RENDERER, /stSearchPage/);
  assert.match(RENDERER, /function stSearchLoadMore\(/);
  assert.match(RENDERER, /seq !== stSearchSeq/);
  // "Daha fazla" düğmesi
  assert.match(RENDERER, /st-more-btn/);
  assert.match(RENDERER, /Daha fazla/);
});

test('renderer: up-next rayı + yorumlar paneli', () => {
  assert.match(RENDERER, /function renderUpNextRail\(/);
  assert.match(RENDERER, /function buildUpNextItem\(/);
  assert.match(RENDERER, /info\.recommended/);
  assert.match(RENDERER, /function loadStComments\(/);
  assert.match(RENDERER, /refreshSmartTubePlayerContext\(info\)/);
  // Panel HTML'de playerStage içinde
  assert.match(HTML, /id="stUpNext"/);
  assert.match(HTML, /id="stUpNextList"/);
  assert.match(HTML, /id="stCommentsList"/);
  assert.match(HTML, /id="playerUpNextBtn"/);
  // Panel stage içinde (fullscreen'da da çalışır)
  const stage = HTML.slice(HTML.indexOf('id="playerStage"'), HTML.indexOf('id="playerSide"'));
  assert.ok(stage.includes('id="stUpNext"'), 'up-next paneli playerStage dışında');
  assert.ok(stage.includes('id="playerUpNextBtn"'), 'panel düğmesi kontrol çubuğunda değil');
});

test('renderer: yorum metni textContent ile basılır (HTML enjeksiyonu yok)', () => {
  const load = RENDERER.match(/async function loadStComments[\s\S]*?stCommentsCont = data\.continuation/);
  assert.ok(load, 'loadStComments yok');
  assert.match(load[0], /text\.textContent = c\.text/);
  assert.doesNotMatch(load[0], /innerHTML\s*=\s*[^\s'"`]/, 'yorum innerHTML ile basılıyor');
  // Backend de HTML etiketlerini soyar
  assert.match(INV_PY, /_re\.sub\(r"<\[\^>\]\+>", "", raw\)/);
});

test('renderer: yorum isteği yarış/nerede-kaldı korumalı', () => {
  assert.match(RENDERER, /stCommentsSeq/);
  const load = RENDERER.match(/async function loadStComments[\s\S]*?seq !== stCommentsSeq/);
  assert.ok(load, 'stCommentsSeq guard yok');
  // Video değişince eski yanıt düşer
  assert.match(RENDERER, /player\.ytInfo !== info/);
});

test('renderer: kanal sayfası iç içe .st-grid üretmez + tam-satır başlık', () => {
  const fn = RENDERER.match(/async function openInvidiousChannelPage[\s\S]*?\n}/);
  assert.ok(fn, 'openInvidiousChannelPage yok');
  assert.match(fn[0], /st-grid-row|gridColumn\s*=\s*['"]1 \/ -1['"]/, 'kanal başlığı tam satır değil');
  assert.doesNotMatch(fn[0], /className\s*=\s*'st-grid'/, 'iç içe st-grid wrap hâlâ var');
});

test('renderer: playerMeta dinamik metinleri locale üzerinden', () => {
  // meta atamaları UiLocale.t() üzerinden gider (mt helper veya doğrudan)
  assert.match(RENDERER, /UiLocale\?\.t\(s\)/);
  assert.match(RENDERER, /UiLocale\?\.t\('Çift dilli izleme ve çalışma alanı'\)/);
  assert.match(RENDERER, /mt\('Sayfa yükleniyor'\)/);
  assert.match(RENDERER, /UiLocale\?\.t\(meta && meta\.isLive/);
  // #playerMeta ignored listesinde — kısmi çeviriyle metin bozulmasın
  const ignoredLine = LOCALE.match(/const ignored = '([^']+)'/);
  assert.ok(ignoredLine && ignoredLine[1].includes('#playerMeta'),
    '#playerMeta ignored listesinde değil — kısmi çeviri bozar');
});

// ---------- R68 doğrulama düzeltmeleri ----------

test('R68 D-K1/K2: closePlayer ölü kaynakta mediaKey sıfırlar + evi geri getirir', () => {
  const fn = RENDERER.match(/function closePlayer\(\)[\s\S]*?\n}/);
  assert.ok(fn, 'closePlayer yok');
  assert.match(fn[0], /!closedVideo\.currentSrc/, 'currentSrc kontrolü yok');
  assert.match(fn[0], /setMediaKey\(''\)/, 'mediaKey sıfırlanmıyor — yeniden açılış siyah kalır');
  assert.match(fn[0], /showHomeWhenNoVideo\(\)/, 'SmartTube geri getirilmiyor');
});

test('R68 D-K5: setSmartTubeVisible arama görünümünü geri getirir', () => {
  const fn = RENDERER.match(/function setSmartTubeVisible[\s\S]*?\n}/);
  assert.ok(fn, 'setSmartTubeVisible yok');
  assert.match(fn[0], /stSearchActive/, 'arama durumu yok sayılıyor');
  assert.match(fn[0], /results\.classList\.remove\('hidden'\)/,
    'arama sonuçları geri getirilmiyor');
});

test('R68 D-K4: kaynak Invidious\'a geçince medya yoksa SmartTube açılır', () => {
  const fn = RENDERER.match(/playerSource = sel\.value[\s\S]{0,900}?setSmartTubeVisible\(true\)/);
  assert.ok(fn, 'playerSourceSelect handler / setSmartTubeVisible yok');
  assert.match(fn[0], /playerSource === 'invidious' && !player\.mediaKey/);
});

test('R68 D-K7: kanal yüklemesi lastInvidiousInstance günceller', () => {
  const fn = RENDERER.match(/async function loadInvidiousChannel[\s\S]*?\n}/);
  assert.ok(fn, 'loadInvidiousChannel yok');
  assert.match(fn[0], /lastInvidiousInstance = res\.data\.instance/,
    'instance güncellenmiyor — göreli thumbnail kırılır');
});

test('R68 D-Y5: arama sıfırlama eski kartları DOM\'dan siler', () => {
  const fn = RENDERER.match(/function resetSmartTubeSearch[\s\S]*?\n}/);
  assert.ok(fn, 'resetSmartTubeSearch yok');
  assert.match(fn[0], /searchGrid\.innerHTML = ''/, 'stSearchGrid temizlenmiyor — DOM birikimi');
  assert.match(fn[0], /stSearchSeen\.clear\(\)/);
});

test('R68 D-K6: giriş uçuşta iken ikinci istek engellenir', () => {
  assert.match(RENDERER, /_invLoginBusy/);
  const fn = RENDERER.match(/async function doInvidiousLogin[\s\S]*?_invLoginBusy = true/);
  assert.ok(fn, 'busy guard yok — Enter ile çift giriş');
});

test('R68 K1: invidious:cancel etiketli download işini de öldürür', () => {
  const cancel = MAIN.match(/ipcMain\.handle\('invidious:cancel'[\s\S]*?\n\}\);/);
  assert.ok(cancel, 'cancel handler yok');
  assert.match(cancel[0], /dl\.jobTag === 'invidious-stream'/,
    'download slot\'undaki Invidious akışı öldürülmüyor');
  // Normal indirme etkilenmez — etiket kontrolü şart
  assert.match(MAIN, /proc\.jobTag = jobTag \|\| kind/);
});

test('R68 K7: SID düz http\'de yalnız yerel/özel ağa gider', () => {
  assert.match(MAIN, /function isLocalInvidiousInstance\(/);
  const env = MAIN.match(/function invidiousAuthEnv[\s\S]*?\n}/);
  assert.ok(env, 'invidiousAuthEnv yok');
  assert.match(env[0], /isLocalInvidiousInstance\(instance\)/,
    'http SID koruması yok — uzak http\'ye sızar');
  // RFC1918 + loopback tanımları
  assert.match(MAIN, /\^10\\\./);
  assert.match(MAIN, /\^192\\\.168\\\./);
});

test('R68 K2: SID safeStorage ile kalıcı + açılışta geri yüklenir', () => {
  assert.match(MAIN, /function persistInvidiousSessions\(/);
  assert.match(MAIN, /function restoreInvidiousSessions\(/);
  assert.match(MAIN, /invidious-session\.safe\.json/);
  assert.match(MAIN, /persistInvidiousSessions\(\);.*K2|persistInvidiousSessions\(\)/);
  const login = MAIN.match(/ipcMain\.handle\('invidious:login'[\s\S]*?\n\}\);/);
  assert.match(login[0], /persistInvidiousSessions\(\)/, 'login kaydetmiyor');
  const logout = MAIN.match(/ipcMain\.handle\('invidious:logout'[\s\S]*?\n\}\);/);
  assert.match(logout[0], /persistInvidiousSessions\(\)/, 'logout temizlemiyor');
  assert.match(MAIN, /restoreInvidiousSessions\(\);.*\n.*createWindow\(\)|restoreInvidiousSessions\(\)/);
});

test('R68 Y2: eski Invidious paneli kaldırıldı (çift DOM/a11y yok)', () => {
  assert.doesNotMatch(HTML, /id="invidiousHome"/, 'eski home paneli hâlâ HTML\'de');
  assert.doesNotMatch(HTML, /id="invidiousSearchResults"/, 'eski arama paneli hâlâ HTML\'de');
  assert.doesNotMatch(RENDERER, /function renderInvidiousHome\(/, 'ölü render hâlâ var');
  assert.doesNotMatch(RENDERER, /function initInvidiousHome\(/, 'ölü init hâlâ var');
  assert.doesNotMatch(RENDERER, /renderInvidiousCard/, 'ölü kart render hâlâ var');
  // Modal düğmeleri yeni bağlama noktasında (initSmartTube)
  const init = RENDERER.match(/function initSmartTube\(\)[\s\S]*?\n}/);
  assert.match(init[0], /invLoginSubmit/, 'modal submit bağlantısı kayboldu');
  assert.match(init[0], /invLoginCancel/, 'modal cancel bağlantısı kayboldu');
});

test('R68 D-K3: birleşik home feed — tek süreç paralel popular+trending', () => {
  assert.match(INV_PY, /def feed_home\(instance=None\)/);
  assert.match(INV_PY, /ThreadPoolExecutor\(max_workers=2\)/);
  assert.match(INV_PY, /_emit_lock/, 'emit kilit yok — NDJSON satırları karışır');
  assert.match(INV_PY, /elif args\.command == "home"/);
  const valid = MAIN.match(/const valid = \[([^\]]+)\]/);
  assert.match(valid[1], /'home'/, "main.js 'home' kind'ını reddediyor");
  // Renderer tek 'home' çağrısı yapar, iki ayrı feed isteği değil
  assert.match(RENDERER, /section === 'home' \? 'home' : section/);
  assert.match(RENDERER, /feedData\.popular/);
  assert.match(RENDERER, /feedData\.trending|feedData\._trending/);
});

test('R68 Y9: klavye seek çubuk görsünü anında tazeler', () => {
  assert.match(RENDERER, /video\.currentTime \+= 10; updateSeekVisuals\(\)/);
  assert.match(RENDERER, /video\.currentTime -= 10; updateSeekVisuals\(\)/);
  assert.match(RENDERER, /video\.currentTime \+= 5; updateSeekVisuals\(\)/);
});

test('R68 Y10: menü açıkken V yalnız menüyü kapatır', () => {
  const fn = RENDERER.match(/e\.key === 'v' \|\| e\.key === 'V'[\s\S]*?return;\s*\n\s*}/);
  assert.ok(fn, 'V handler yok');
  assert.match(fn[0], /subMenu && !subMenu\.classList\.contains\('hidden'\)/);
});

test('R68 Y11: lastSubtitleMode ayar dosyasına yazılır + geri yüklenir', () => {
  const collect = RENDERER.match(/function collectUiSettings[\s\S]*?\n}/);
  assert.match(collect[0], /playerLastSubtitleMode/);
  const apply = RENDERER.match(/function applyUiSettings[\s\S]*?\n  updateGpuBadge/);
  assert.match(apply[0], /playerLastSubtitleMode/);
  const setMode = RENDERER.match(/function setSubtitleMode[\s\S]*?\n}/);
  assert.match(setMode[0], /scheduleSave\(\)/, 'mod değişimi kaydedilmiyor');
});

test('R68 Y12: mute simgesi volumechange ile senkron', () => {
  assert.match(RENDERER, /volumechange', syncMuteIcon/);
  assert.match(RENDERER, /aria-pressed/);
});

test('R68 D-Y3: ambient boyama belge gizliyken durur', () => {
  const paint = RENDERER.match(/const paint = \(\) => \{[\s\S]*?\};/);
  assert.ok(paint, 'paint yok');
  assert.match(paint[0], /document\.hidden/, 'gizli sekmeye hâlâ çiziyor');
});

test('R68 D-Y7: oturum geri yükleme statü satırına yansır', () => {
  const fn = RENDERER.match(/async function restoreInvidiousSession[\s\S]*?\n}/);
  assert.ok(fn, 'restoreInvidiousSession yok');
  assert.match(fn[0], /setSmartTubeStatus/, 'geri yükleme sessiz — kullanıcı göremiyor');
});

test('R68 D-O1: arama sonuç sayısı sınırlı (DOM/dedupe şişmez)', () => {
  assert.match(RENDERER, /ST_SEARCH_MAX/);
  const fn = RENDERER.match(/function stAppendSearchResults[\s\S]*?\n}/);
  assert.match(fn[0], /children\.length >= ST_SEARCH_MAX/);
});

test('R68 O6/O7: arama temizle × + şifre göster düğmesi bağlı', () => {
  assert.match(HTML, /id="stSearchClear"/);
  assert.match(HTML, /id="invLoginPassToggle"/);
  const init = RENDERER.match(/function initSmartTube\(\)[\s\S]*?\n}/);
  assert.match(init[0], /stSearchClear/);
  assert.match(init[0], /invLoginPassToggle/);
});

test('R68 O5/D1: ikonlar aria-hidden + statü satırı aria-live', () => {
  assert.match(HTML, /st-side-icon" aria-hidden="true"/);
  assert.match(HTML, /id="stStatusLine" role="status" aria-live="polite"/);
});

test('R68 O11: kart görselleri decoding=async', () => {
  assert.match(RENDERER, /img\.decoding = 'async'/);
});

test('R68 D-D7: absThumb yalnız http(s) kabul eder (şema beyaz liste)', () => {
  const fn = RENDERER.match(/function absThumb\(url\) \{[\s\S]*?\n}/);
  assert.ok(fn, 'absThumb yok');
  assert.match(fn[0], /\^https\?:/, 'javascript:/data: şemaları geçiyor — img enjeksiyonu');
});

test('R68 Y3: arama input\'u debounce\'lu canlı sorgu yapar', () => {
  assert.match(RENDERER, /searchDebounce/);
  assert.match(RENDERER, /setTimeout\([\s\S]{0,80}450\)/);
});

test('R68 D-O6: yorumlar 200 düğümde kesilir (DOM birikimi yok)', () => {
  assert.match(RENDERER, /ST_COMMENTS_MAX = 200/);
  assert.match(RENDERER, /\.st-comment'\)\.length >= ST_COMMENTS_MAX/);
});

test('R68 D-D3: formatCount Intl compact kullanır', () => {
  assert.match(RENDERER, /Intl\.NumberFormat/);
  assert.match(RENDERER, /notation: 'compact'/);
});

test('R68 D-O9: disk dolu/izin hatası dostça mesaja çevrilir', () => {
  assert.match(MEDIA_PY, /ENOSPC/);
  assert.match(MEDIA_PY, /EACCES, _errno\.EPERM/);
  assert.match(MEDIA_PY, /Disk dolu/);
});

test('R68 O10/D3/D-Y10: placeholder + sidebar focus + kart content-visibility', () => {
  const CSS = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8');
  assert.match(CSS, /#stSearchInput::placeholder/);
  assert.match(CSS, /\.st-side-item:focus-visible/);
  assert.match(CSS, /\.st-card \{[\s\S]*?content-visibility: auto/);
});

// ---------- çalıştır ----------
let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`  ✓ ${t.name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${t.name}\n    ${e.message}`);
  }
}
console.log(`\nreport67-smarttube-wiring: ${passed}/${tests.length} geçti`);
process.exit(failed ? 1 : 0);
