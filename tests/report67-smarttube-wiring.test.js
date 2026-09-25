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
const vm = require('vm');

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
  assert.match(INV_PY, /set_session\(cookie=sid[,)]/);
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

// Kaynak deseni kırılganlığından (CRLF/satır kayması) bağımsız olması için kart
// davranışı gerçekten çalıştırılır: kanal düğmesi click/Enter karttaki oynatıcıyı
// tetiklememeli, kart kendi click/Space'inde oynatmalı.
function makeFakeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    className: '',
    children: [],
    parent: null,
    listeners: {},
    attrs: {},
    style: {},
    appendChild(c) { c.parent = el; el.children.push(c); return c; },
    prepend(c) { c.parent = el; el.children.unshift(c); return c; },
    remove() {
      if (el.parent) { el.parent.children = el.parent.children.filter((x) => x !== el); el.parent = null; }
    },
    querySelector(sel) {
      return sel.startsWith('.') ? (findByClass(el, sel.slice(1))[0] || null) : null;
    },
    addEventListener(t, f) { (el.listeners[t] = el.listeners[t] || []).push(f); },
    setAttribute(k, v) { el.attrs[k] = String(v); },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return ''; },
    set(v) { if (v === '') el.children = []; },
  });
  el.classList = {
    _set: () => new Set(el.className.split(' ').filter(Boolean)),
    _sync(s) { el.className = [...s].join(' '); },
    add(c) { const s = el.classList._set(); s.add(c); el.classList._sync(s); },
    remove(c) { const s = el.classList._set(); s.delete(c); el.classList._sync(s); },
    toggle(c, on) {
      const s = el.classList._set();
      const want = on === undefined ? !s.has(c) : !!on;
      if (want) s.add(c); else s.delete(c);
      el.classList._sync(s);
      return want;
    },
    contains(c) { return el.classList._set().has(c); },
  };
  return el;
}

function dispatchBubbling(el, type, props) {
  const e = Object.assign({
    _stopped: false,
    _defaultPrevented: false,
    stopPropagation() { e._stopped = true; },
    preventDefault() { e._defaultPrevented = true; },
  }, props);
  for (let n = el; n && !e._stopped; n = n.parent) {
    for (const f of n.listeners[type] || []) f.call(n, e);
  }
  return e;
}

function findByClass(el, cls) {
  const hit = [];
  (function walk(n) {
    if ((n.className || '').split(' ').includes(cls)) hit.push(n);
    for (const c of n.children || []) walk(c);
  })(el);
  return hit;
}

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

// Gerçek kuyruk fonksiyonlarını kaynaktan çıkarıp sahte localStorage + DOM ile
// kurar — kart düğmesi de aynı bağlamı kullanır.
function buildQueueHarness() {
  const calls = { probe: 0, log: [] };
  const store = fakeStorage();
  const player = { openIntent: 7, pendingAutoOpen: null, mediaKey: '' };
  const ctx = vm.createContext({
    localStorage: store,
    absThumb: (u) => u,
    mediaKeyFor: (kind, ref) => `${kind}:${ref}`,
    watchItemByKey: () => null,
    logLine: (m, l) => calls.log.push(`${l || 'info'}:${m}`),
    queuePlayerProbeFromCard: () => { calls.probe++; },
    updatePlaylistButtons: () => {},
    document: { createElement: (t) => makeFakeEl(t), querySelector: () => null },
    window: { UiLocale: { t: (s) => s } },
    player,
    $: () => null,
    Date,
  });
  const src = (RENDERER.match(/const ST_QUEUE_KEY[\s\S]*?function stQueueRailVideos[\s\S]*?\n\}/) || [])[0];
  assert.ok(src, 'kuyruk yardımcı bloğu yok');
  vm.runInContext(src, ctx);
  return { ctx, store, player, calls };
}

function buildCardHarness(watchItem, extraCtx = {}) {
  const calls = { channel: [], probe: 0, hide: 0, queueToggles: [] };
  const player = { openIntent: 'play', pendingAutoOpen: null, pendingLibrarySeek: null };
  const ctx = vm.createContext(Object.assign({
    document: { createElement: (t) => makeFakeEl(t) },
    window: { UiLocale: { t: (s) => s } },
    absThumb: (u) => u,
    formatCount: () => '5',
    openInvidiousChannelPage: (id) => calls.channel.push(id),
    queuePlayerProbeFromCard: () => { calls.probe++; },
    setSmartTubeVisible: () => { calls.hide++; },
    mediaKeyFor: (kind, ref) => `${kind}:${ref}`,
    watchItemByKey: () => watchItem || null,
    watchProgress: (it) => (Number(it.duration) ? (Number(it.position) / Number(it.duration)) * 100 : 0),
    stQueueHas: () => false,
    stQueueToggle: () => false,
    player,
    $: () => null,
  }, extraCtx));
  const src = (RENDERER.match(/function buildSmartTubeCard\(video\) \{[\s\S]*?return card;\s*\}/) || [])[0];
  assert.ok(src, 'buildSmartTubeCard yok');
  return { calls, player, build: vm.runInContext(src + '\nbuildSmartTubeCard;', ctx) };
}

const CARD_VIDEO = {
  title: 't', author: 'a', authorId: 'UA', videoId: 'v1',
  lengthSeconds: 62, viewCount: 5,
  videoThumbnails: [{ url: 'http://x/t.jpg', quality: 'medium' }],
};

test('renderer: kart kanal linki oynatmayı tetiklemez (davranış)', () => {
  const { calls, player, build } = buildCardHarness(null);
  const card = build(CARD_VIDEO);
  const author = findByClass(card, 'st-card-author')[0];
  assert.ok(author, 'kanal butonu yok');

  dispatchBubbling(author, 'click');
  assert.deepStrictEqual(calls.channel, ['UA']);
  assert.strictEqual(calls.probe, 0, 'kanal tıklaması kartı oynattı');
  assert.strictEqual(calls.hide, 0);

  dispatchBubbling(author, 'keydown', { key: 'Enter' });
  assert.deepStrictEqual(calls.channel, ['UA', 'UA']);
  assert.strictEqual(calls.probe, 0, 'kanal Enter\'i kartı oynattı');

  // Ok tuşları kabarcıklanıp grid gezinmesine gitmeli — durdurulmamalı
  const arrow = dispatchBubbling(author, 'keydown', { key: 'ArrowRight' });
  assert.strictEqual(arrow._stopped, false, 'ok tuşu yayılımı kesildi');
  assert.strictEqual(calls.channel.length, 2);

  dispatchBubbling(card, 'click');
  assert.strictEqual(calls.probe, 1, 'kart tıklaması oynatmadı');
  assert.strictEqual(calls.hide, 1);
  assert.ok(player.pendingAutoOpen && player.pendingAutoOpen.key === 'youtube:https://www.youtube.com/watch?v=v1');
  assert.strictEqual(player.pendingLibrarySeek, null, 'kayıtsız kart seek istememeli');

  const space = dispatchBubbling(card, 'keydown', { key: ' ' });
  assert.strictEqual(calls.probe, 2, 'kart Space\'i oynatmadı');
  assert.strictEqual(space._defaultPrevented, true);
});

test('renderer: kart izleme ilerlemesi çubuğu + kaldığı yerden devam (davranış)', () => {
  // Yarım kalmış kayıt: çubuk %50, tık pendingLibrarySeek kurar
  const item = { key: 'youtube:v1', type: 'youtube', position: 300, duration: 600, completed: false };
  let h = buildCardHarness(item);
  let card = h.build(CARD_VIDEO);
  const bar = findByClass(card, 'st-card-progress')[0];
  assert.ok(bar, 'ilerleme çubuğu yok');
  assert.strictEqual(bar.children[0] && bar.children[0].style.width, '50%');
  dispatchBubbling(card, 'click');
  assert.ok(h.player.pendingLibrarySeek, 'devam seek\'i kurulmadı');
  assert.strictEqual(h.player.pendingLibrarySeek.key, 'youtube:v1');
  assert.strictEqual(h.player.pendingLibrarySeek.seconds, 300);

  // Tamamlanmış kayıt: %100 çubuk, seek YOK (baştan başlar)
  h = buildCardHarness({ key: 'youtube:v1', type: 'youtube', position: 600, duration: 600, completed: true });
  card = h.build(CARD_VIDEO);
  const full = findByClass(card, 'st-card-progress')[0];
  assert.ok(full, 'izlenmiş kartta çubuk yok');
  assert.strictEqual(full.children[0].style.width, '100%');
  dispatchBubbling(card, 'click');
  assert.strictEqual(h.player.pendingLibrarySeek, null, 'bitmiş video seek istememeli');

  // Kayıt yok / sıfır ilerleme: çubuk ve seek yok
  h = buildCardHarness({ key: 'youtube:v1', type: 'youtube', position: 0, duration: 600, completed: false });
  card = h.build(CARD_VIDEO);
  assert.strictEqual(findByClass(card, 'st-card-progress').length, 0, 'sıfır ilerlemede çubuk çizildi');
});

test('renderer: devam rayı kimliği eşler, sıralar, tekilleştirir (davranış)', () => {
  const src = (RENDERER.match(/function stContinueWatchingVideos\(\) \{[\s\S]*?\n\}/) || [])[0];
  assert.ok(src, 'stContinueWatchingVideos yok');
  const ctx = vm.createContext({
    watchLibraryCache: [
      { key: 'youtube:b', type: 'youtube', title: 'B', position: 10, duration: 100, lastWatched: 200 },
      { key: 'youtube:a', type: 'youtube', title: 'A', position: 50, duration: 100, lastWatched: 300 },
      { key: 'youtube:a', type: 'youtube', title: 'A2', position: 60, duration: 100, lastWatched: 400 },
      { key: 'youtube:done', type: 'youtube', title: 'D', position: 90, duration: 90, completed: true, lastWatched: 500 },
      { key: 'youtube:zero', type: 'youtube', title: 'Z', position: 0, duration: 100, lastWatched: 600 },
      { key: 'file:/x.mp4', type: 'local', title: 'L', position: 10, duration: 100, lastWatched: 700 },
      { key: 'weird', type: 'youtube', title: 'W', position: 10, duration: 100, lastWatched: 100, sourceRef: 'https://youtu.be/wid123' },
    ],
    watchProgress: (it) => (Number(it.duration) ? (Number(it.position) / Number(it.duration)) * 100 : 0),
    youtubeVideoId: (u) => (String(u).match(/youtu\.be\/([\w-]+)/) || [])[1] || '',
    lastInvidiousInstance: 'https://inv.example',
  });
  const fn = vm.runInContext(src + '\nstContinueWatchingVideos;', ctx);
  const out = fn();
  // Sıra lastWatched desc: A2/a tekilleşir (ilk görülen alınır); 'weird'
  // kanonik olmayan anahtarıyla düşer; 'done'/'zero'/yerel kayıtlar elenir.
  assert.strictEqual(out.map((v) => v.videoId).join(','), 'a,b');
  assert.strictEqual(out[0].title, 'A2', 'en taze kayıt aynı kimlik için tutulmalı');
  // F-106-1b: Invidious /vi/ vekâleti bozuk (200+HTML) — thumb'lar artık
  // i.ytimg.com doğrudan ve instance bağımsız
  assert.ok(out[0].videoThumbnails[0].url.startsWith('https://i.ytimg.com/vi/a/'),
    'küçük resim i.ytimg.com doğrudan olmalı');
  ctx.lastInvidiousInstance = '';
  assert.strictEqual(fn()[0].videoThumbnails.length, 1, "thumb instance'a bağımlı olmamalı");
});

test('renderer: kuyruk ekle/çıkar/kalıcılık/güvenli-thumb (davranış)', () => {
  const { ctx, store } = buildQueueHarness();
  const v = (id) => ({ videoId: id, title: 'T' + id, videoThumbnails: [{ url: 'https://i/t.jpg', quality: 'medium' }] });
  assert.strictEqual(ctx.stQueueToggle(v('a')), true);
  assert.strictEqual(ctx.stQueueToggle(v('b')), true);
  assert.ok(ctx.stQueueHas('a') && ctx.stQueueHas('b'));
  assert.strictEqual(JSON.parse(store.getItem('stPlayQueue')).length, 2, 'kalıcı depo yazılmadı');
  assert.strictEqual(ctx.stQueueToggle(v('a')), false, 'ikinci toggle çıkarmadı');
  assert.ok(!ctx.stQueueHas('a') && ctx.stQueueHas('b'));
  // Bozuk/boş kayıt ve güvensiz thumbnail şeması temizlenir
  store.setItem('stPlayQueue', JSON.stringify([
    { videoId: 'x', thumb: 'javascript:alert(1)', title: 't' },
    { videoId: '' }, null,
  ]));
  const loaded = ctx.loadStQueue();
  assert.strictEqual(loaded.length, 1, 'geçersiz kayıtlar elenmedi');
  assert.strictEqual(loaded[0].thumb, '', 'güvensiz thumbnail şeması kalıcıda tutuldu');
  assert.strictEqual(loaded[0].videoId, 'x');
});

test('renderer: kuyruk playNext + dequeue eşleşen kimliği her konumdan düşürür (davranış)', () => {
  const { ctx, player, calls } = buildQueueHarness();
  assert.strictEqual(ctx.stQueuePlayNext(), false, 'boş kuyruk oynatmamalı');
  ctx.stQueueToggle({ videoId: 'n1', videoThumbnails: [] });
  ctx.stQueueToggle({ videoId: 'n2', videoThumbnails: [] });
  ctx.stQueueToggle({ videoId: 'n3', videoThumbnails: [] });
  assert.strictEqual(ctx.stQueuePlayNext(), true);
  assert.strictEqual(calls.probe, 1, 'probe tetiklenmedi');
  assert.strictEqual(player.pendingAutoOpen.key, 'youtube:https://www.youtube.com/watch?v=n1');
  assert.strictEqual(player.pendingAutoOpen.intent, 8);
  // Probe başarısızsa sıra korunur; açılan kayıt her konumdan düşer (F3)
  assert.strictEqual(ctx.stQueueDequeueIfPlaying('youtube:other'), false);
  assert.strictEqual(ctx.stQueueDequeueIfPlaying('youtube:n2'), true, 'ortadaki kayıt düşmeli');
  assert.strictEqual(ctx.stQueueDequeueIfPlaying('youtube:n2'), false, 'tekrar düşmez');
  assert.deepStrictEqual([...ctx.stQueueRailVideos()].map((v) => v.videoId), ['n1', 'n3']);
  assert.strictEqual(ctx.stQueueDequeueIfPlaying('youtube:n1'), true);
  assert.strictEqual(ctx.stQueueRailVideos()[0].videoId, 'n3');
});

test('renderer: kuyruk kapasite taşmasında düşen kayıt loglanır (F4, davranış)', () => {
  const { ctx, calls } = buildQueueHarness();
  for (let i = 0; i < 50; i++) ctx.stQueueToggle({ videoId: `v${i}`, title: `T${i}`, videoThumbnails: [] });
  assert.strictEqual(ctx.stQueueRailVideos().length, 50);
  ctx.stQueueToggle({ videoId: 'v50', title: 'yeni', videoThumbnails: [] });
  assert.strictEqual(ctx.stQueueRailVideos().length, 50, 'kapasite aşıldı');
  assert.strictEqual(ctx.stQueueRailVideos()[0].videoId, 'v1', 'en eski kayıt düşmeli');
  assert.ok(calls.log.some((l) => l.startsWith('warn:') && l.includes('T0')),
    'düşen kayıt kullanıcıya bildirilmedi');
});

test('F5a: elle çıkarma rayı tazeler — ghost kart ve boş başlık kalmaz (davranış)', () => {
  const grid = makeFakeEl('div');
  const { ctx } = buildQueueHarness();
  ctx.$ = (id) => (id === 'stGrid' ? grid : null);
  ctx.stCurrentSection = 'home';
  ctx.buildSmartTubeCard = (v) => { const e = makeFakeEl('div'); e.className = 'st-card'; e.dataset = { vid: v.videoId }; return e; };
  const rail = () => findByClass(grid, 'st-queue-rail')[0] || null;
  const railCards = () => (rail() ? findByClass(rail(), 'st-card').map((c) => c.dataset.vid) : []);

  ctx.stQueueToggle({ videoId: 'a1', title: 'A1', videoThumbnails: [] });
  ctx.stQueueToggle({ videoId: 'a2', title: 'A2', videoThumbnails: [] });
  assert.deepStrictEqual(railCards().sort(), ['a1', 'a2'], 'eklemeler rayda görünmeli');
  ctx.stQueueToggle({ videoId: 'a1' });
  assert.deepStrictEqual(railCards(), ['a2'], 'çıkarılan kart rayda ghost kaldı');
  ctx.stQueueToggle({ videoId: 'a2' });
  assert.strictEqual(rail(), null, 'kuyruk boşalınca ray kaldırılmalı');
});

test('F5b: boş kuyrukla render sonrası ilk ekleme rayı oluşturur; diğer bölümde oluşturmaz (davranış)', () => {
  const grid = makeFakeEl('div');
  const { ctx } = buildQueueHarness();
  ctx.$ = (id) => (id === 'stGrid' ? grid : null);
  ctx.buildSmartTubeCard = (v) => { const e = makeFakeEl('div'); e.className = 'st-card'; return e; };
  const rail = () => findByClass(grid, 'st-queue-rail')[0] || null;

  // Arama gibi home dışı bölümde ekleme: kuyruk yazılır ama ray kurulmaz
  ctx.stCurrentSection = 'search';
  ctx.stQueueToggle({ videoId: 's1', title: 'S1', videoThumbnails: [] });
  assert.ok(ctx.stQueueHas('s1'));
  assert.strictEqual(rail(), null, 'home dışı bölümde ray oluşturulmamalı');
  ctx.stQueueToggle({ videoId: 's1' }); // geri al

  // Home render'ı boş kuyrukla ray kurmadı — ilk ekleme rayı yaratmalı
  ctx.stCurrentSection = 'home';
  ctx.stQueueToggle({ videoId: 'h1', title: 'H1', videoThumbnails: [] });
  assert.ok(rail(), 'ilk ekleme rayı oluşturmadı');
  assert.strictEqual(findByClass(rail(), 'st-section-title').length, 1, 'başlık yok');
  assert.strictEqual(findByClass(rail(), 'st-card').length, 1);
});

test('F5c: ana sayfa akışı boşta boş grid bırakmaz — raylar + giriş CTA + retry (davranış)', () => {
  const grid = makeFakeEl('div');
  const calls = { login: 0, rerender: [] };
  const ctx = vm.createContext({
    document: { createElement: (t) => makeFakeEl(t), createDocumentFragment: () => makeFakeEl('frag') },
    window: { UiLocale: { t: (s) => s } },
    youtubeLoggedIn: false,
    openYoutubeLogin: () => { calls.login++; },
    renderSmartTubeSection: (s, o) => { calls.rerender.push([s, o && o.force]); },
    stQueueRailVideos: () => [{ videoId: 'q1', title: 'Q', author: '', authorId: '', lengthSeconds: 0, videoThumbnails: [] }],
    stContinueWatchingVideos: () => [{ videoId: 'c1', title: 'C', author: '', authorId: '', lengthSeconds: 0, videoThumbnails: [] }],
    stMostPlayedVideos: () => [],
    buildSmartTubeCard: (v) => { const e = makeFakeEl('div'); e.className = 'st-card'; return e; },
  });
  const src = (RENDERER.match(/function stHomeRailsFragment[\s\S]*?function stRenderHomeFallback[\s\S]*?\n\}/) || [])[0];
  assert.ok(src, 'ana sayfa fallback yardımcıları yok');
  vm.runInContext(src, ctx);

  assert.strictEqual(ctx.stRenderHomeFallback(grid, 'Akış alınamadı'), true);
  assert.ok(findByClass(grid, 'st-queue-rail').length, 'kuyruk rayı render edilmedi');
  assert.strictEqual(findByClass(grid, 'st-card').length, 2, 'yerel kartlar eksik');
  const box = findByClass(grid, 'st-home-fallback')[0];
  assert.ok(box, 'fallback hata kutusu yok');
  const btns = findByClass(box, 'btn');
  assert.strictEqual(btns.length, 2, 'giriş + tekrar dene düğmeleri eksik');
  dispatchBubbling(btns[0], 'click');
  assert.strictEqual(calls.login, 1, 'giriş düğmesi openYoutubeLogin çağırmadı');
  dispatchBubbling(btns[1], 'click');
  assert.deepStrictEqual(calls.rerender, [['home', true]], 'retry home force render yapmadı');

  // Girişliyken CTA düğmesi gösterilmez
  const grid2 = makeFakeEl('div');
  ctx.youtubeLoggedIn = true;
  ctx.stRenderHomeFallback(grid2, 'x');
  assert.strictEqual(findByClass(grid2, 'btn').length, 1, 'girişli durumda login düğmesi olmamalı');
});

// ---------- Hesap yetkisi: uygulama başka bir ürünün OAuth kimliğini kullanmaz ----------
test('main: cihaz kodu kayıtlı client ile, yoksa YouTube TV istemcisiyle başlar', () => {
  // Üçüncü-taraf bir uygulamanın OAuth kimliği hâlâ gömülmemeli; kullanılan
  // TVHTML5 istemcisi YouTube'un KENDİ birinci-taraf TV istemcisi (TV cihaz
  // akışının standart yolu — yt-dlp/SmartTube da aynısını yapar) ve main.js
  // değil backend/youtube.py'de tutulur.
  assert.doesNotMatch(MAIN, /YT_BUILTIN_CLIENT_(?:ID|SECRET)/,
    'başka uygulamanın OAuth kimliği gömülmemeli');
  const dc = (MAIN.match(/ipcMain\.handle\('youtube:deviceCode'[\s\S]*?\n\}\);/) || [])[0];
  assert.ok(dc, 'youtube:deviceCode handler yok');
  assert.match(dc, /useTv = !\(youtubeSession\.clientId && youtubeSession\.clientSecret\)/,
    'clientsız durumda TV istemcisine düşülmeli');
  assert.match(dc, /\['device_code', '--client-id', useTv \? 'tv' : youtubeSession\.clientId\]/);
  assert.match(MAIN, /hasClient: !!\(youtubeSession\.clientId && youtubeSession\.clientSecret\)/);
  assert.match(MAIN, /\['poll', '--client-id', tvMode \? 'tv' : youtubeSession\.clientId/);
  assert.match(MAIN, /\['refresh', '--client-id', tvMode \? 'tv' : youtubeSession\.clientId\]/);
});

test('backend: YouTube salt-okuma kapsamı ve cihaz akışı', () => {
  const PY = fs.readFileSync(path.join(ROOT, 'backend', 'youtube.py'), 'utf8');
  assert.match(PY, /OAUTH_SCOPE = "https:\/\/www\.googleapis\.com\/auth\/youtube\.readonly"/);
  assert.match(PY, /oauth2\.googleapis\.com\/device\/code/);
  assert.match(PY, /grant_type.*device_code/);
});

test('renderer: giriş modalı istemciyi doğrulayıp QR çiziyor', () => {
  const open = (RENDERER.match(/function openYoutubeLogin\(\) \{[\s\S]*?dlg\.classList\.remove\('hidden'\);/) || [])[0];
  assert.ok(open, 'openYoutubeLogin bulunamadı');
  assert.match(open, /window\.api\.youtubeSession\(\)/);
  assert.match(open, /res\.data\.hasClient/);
  // İstemci varsa yöntem seçimi, yoksa sıfır-kurulum TV cihaz akışı otomatik
  // başlar (F-106-3 — eski davranış kullanıcıyı Google Cloud formuna atıyordu)
  assert.match(open, /_ytShowAuthChoice\(\)/);
  assert.match(open, /res\.data\.hasClient[\s\S]{0,600}?startYoutubeDeviceFlow\(\)/,
    'hasClient=false dalında cihaz akışı otomatik başlamalı');
  // QR canvas markup + çizim
  assert.ok(HTML.includes('id="ytQrCanvas"'), 'QR canvas yok');
  const flow = (RENDERER.match(/async function startYoutubeDeviceFlow[\s\S]*?youtubePoll\(\)/) || [])[0];
  assert.ok(flow, 'startYoutubeDeviceFlow bulunamadı');
  assert.ok(/QRCode\.toCanvas\(qrCanvas/.test(flow), 'QR çizimi cihaz akışına bağlanmadı');
});

test('renderer: kuyruk rayı display:contents kabı + tazeleme (sözleşme)', () => {
  assert.match(RENDERER, /className = 'st-queue-rail'/, 'kuyruk rayı kabı yok');
  assert.match(RENDERER, /function stRefreshQueueRail\(\)/, 'ray tazeleme fonksiyonu yok');
  const CSS = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8');
  assert.match(CSS, /\.st-queue-rail\s*\{\s*display:\s*contents/, 'display:contents kuralı eksik');
});

test('renderer: kart kuyruk düğmesi oynatmadan ekle/çıkar (davranış)', () => {
  const state = { inQ: false, count: 0 };
  const h = buildCardHarness(null, {
    stQueueHas: () => state.inQ,
    stQueueToggle: () => { state.count++; state.inQ = !state.inQ; return state.inQ; },
  });
  const card = h.build(CARD_VIDEO);
  const qBtn = findByClass(card, 'st-card-queue')[0];
  assert.ok(qBtn, 'kuyruk düğmesi yok');
  assert.strictEqual(qBtn.textContent, '+');
  dispatchBubbling(qBtn, 'click');
  assert.strictEqual(state.inQ, true);
  assert.strictEqual(qBtn.textContent, '✓');
  assert.ok(qBtn.classList.contains('is-queued'));
  assert.strictEqual(h.calls.probe, 0, 'kuyruk düğmesi kartı oynattı');
  const ev = dispatchBubbling(qBtn, 'keydown', { key: 'Enter' });
  assert.strictEqual(state.inQ, false);
  assert.strictEqual(ev._stopped, true);
  assert.strictEqual(ev._defaultPrevented, true, 'Enter native click engellenmeli — çift toggle olur');
});

test('renderer: ended ve Next düğmesi kuyruk akışına bağlı (kaynak sözleşmesi)', () => {
  const ended = (RENDERER.match(/video\.addEventListener\('ended'[\s\S]*?\}\);/) || [])[0];
  assert.ok(ended && /stQueueAutoNext\(\)/.test(ended), 'ended → stQueueAutoNext yok');
  assert.ok(/function stQueueAutoNext[\s\S]*?stQueuePlayNext\(\)/.test(RENDERER), 'stQueueAutoNext sırayı oynatmıyor');
  assert.ok(/autoNext/.test(ended), 'autoNext saygısı düştü');
  assert.match(RENDERER, /playerNextMedia'\)\.addEventListener[\s\S]*?stQueuePlayNext\(\)/);
  // Dequeue yalnız akış açılış noktalarında — probe değil
  const stream = (RENDERER.match(/playerStream'\)\.addEventListener\('click'[\s\S]*?\}\);/) || [])[0];
  assert.ok(stream && (stream.match(/stQueueDequeueIfPlaying\(ytKey\)/g) || []).length === 2,
    'hls+progressive her iki açılış kolunda dequeue yok');
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
  assert.match(RENDERER, /UiLocale\?\.t\(player\.metaBase\)/);
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

test('R68 Y3: arama input\'u debounce\'lu canlı sorgu yapar (davranış, sahte saat)', () => {
  const blk = (RENDERER.match(/\n  if \(searchInp\) \{[\s\S]*?\n  \}/) || [])[0];
  assert.ok(blk, 'searchInp dinleyici bloğu yok');
  let now = 0;
  const timers = [];
  const setTimeout = (cb, ms) => { const t = { cb, at: now + ms, dead: false }; timers.push(t); return t; };
  const clearTimeout = (t) => { if (t) t.dead = true; };
  const advance = (ms) => {
    now += ms;
    for (;;) {
      const due = timers.filter((t) => !t.dead && !t.ran && t.at <= now)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.ran = true;
      due.cb();
    }
  };
  const inp = makeFakeEl('input');
  inp.value = '';
  const searchCalls = [];
  let resets = 0;
  const wire = new Function(
    'searchInp', 'syncSearchClear', 'doSmartTubeSearch', 'resetSmartTubeSearch',
    'setTimeout', 'clearTimeout', blk);
  wire(inp, () => {}, () => searchCalls.push(inp.value), () => { resets++; }, setTimeout, clearTimeout);

  inp.value = 'dizi önerisi';
  dispatchBubbling(inp, 'input');
  advance(449);
  assert.strictEqual(searchCalls.length, 0, 'debounce beklemeden sorgu attı');
  advance(1);
  assert.deepStrictEqual(searchCalls, ['dizi önerisi'], '450ms dolunca sorgu atmadı');

  inp.value = 'dizi öneri';
  dispatchBubbling(inp, 'input');
  advance(449);
  assert.strictEqual(searchCalls.length, 1, 'eski timer iptal edilmedi');
  advance(1);
  assert.strictEqual(searchCalls.length, 2, 'yeni sorgu zamanında atılmadı');
  assert.strictEqual(searchCalls[1], 'dizi öneri');

  inp.value = 'değişen';
  dispatchBubbling(inp, 'input');
  inp.value = 'değişti!';
  advance(1000);
  assert.strictEqual(searchCalls.length, 2, 'bayat sorgu bekçisi çalışmadı');

  inp.value = '';
  dispatchBubbling(inp, 'input');
  assert.strictEqual(resets, 1, 'boş input sıfırlamadı');
  advance(1000);
  assert.strictEqual(searchCalls.length, 2, 'boş input sorgu attı');

  inp.value = 'hızlı';
  dispatchBubbling(inp, 'input');
  dispatchBubbling(inp, 'keydown', { key: 'Enter' });
  assert.strictEqual(searchCalls.length, 3, 'Enter anında sorgu atmadı');
  advance(1000);
  assert.strictEqual(searchCalls.length, 3, 'Enter sonrası bekleyen timer tekrar sorgu attı');
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

// ---------- F1: kuyruk/Sonraki düğmesi tazeliği (FULL_REVIEW 2026-09-20) ----------
// stQueueToggle kuyruğu değiştirir ama düğmeleri tazelemezdi; setMediaKey de
// güncellemeyi mediaKey atanmadan ÖNCE yapıyordu → bayat disabled durumu.

function buildMediaKeyHarness() {
  const buttons = {
    playerPrevMedia: { disabled: false },
    playerNextMedia: { disabled: true },
  };
  const calls = { update: 0 };
  const player = {
    openIntent: 1, generation: 0, mediaKey: 'file:/a.mkv',
    playlist: ['a', 'b'], playlistIndex: 0,
    pendingLibrarySeek: null, pendingSubs: null, ytInfo: null,
    originalUrl: '', localPath: '', isLive: true, playbackAudioLang: 'x',
    resumeOffered: true, watchSession: {}, watchManualCompletedKey: 'k',
    watchManualCompleted: true, watchRemovedKey: 'k',
    hlsRecovery: { sourceChanged() {} },
  };
  const ctx = vm.createContext({
    player,
    localStorage: fakeStorage(),
    $: (id) => buttons[id] || null,
    closeTimeline() {}, flushWatchState() {}, resetMediaBoundState() {},
    loadSavedCues() {}, loadSavedWords() {}, updateCueMeta() {},
    syncPlayerSourceQuick() {}, syncSubtitlePrimaryAction() {},
    aiChatCtxLabel() {}, currentGeneration: () => player.generation,
    absThumb: (u) => u, mediaKeyFor: (kind, ref) => `${kind}:${ref}`,
    queuePlayerProbeFromCard() {},
    updatePlaylistButtons() {},
    watchItemByKey: () => null, logLine() {},
    document: { createElement: (t) => makeFakeEl(t), querySelector: () => null },
    window: { UiLocale: { t: (s) => s } },
    setTimeout, Date,
  });
  const qsrc = (RENDERER.match(/const ST_QUEUE_KEY[\s\S]*?function stQueueRailVideos[\s\S]*?\n\}/) || [])[0];
  const upsrc = (RENDERER.match(/function updatePlaylistButtons\(\) \{[\s\S]*?\n\}/) || [])[0];
  const smk = (RENDERER.match(/function setMediaKey\(key\) \{[\s\S]*?\n\}/) || [])[0];
  assert.ok(qsrc && upsrc && smk, 'kuyruk/updatePlaylistButtons/setMediaKey blokları çıkarılamadı');
  vm.runInContext(qsrc, ctx);
  ctx.updatePlaylistButtons = vm.runInContext(`(${upsrc})`, ctx);
  vm.runInContext(smk, ctx);
  return { ctx, player, buttons, calls };
}

test('F1: stQueueToggle Sonraki düğmesini tazeler (davranış)', () => {
  const calls = { update: 0 };
  const store = fakeStorage();
  const ctx = vm.createContext({
    localStorage: store,
    absThumb: (u) => u,
    mediaKeyFor: (kind, ref) => `${kind}:${ref}`,
    queuePlayerProbeFromCard() {},
    updatePlaylistButtons: () => { calls.update++; },
    watchItemByKey: () => null, logLine() {},
    document: { createElement: (t) => makeFakeEl(t), querySelector: () => null },
    window: { UiLocale: { t: (s) => s } },
    player: { openIntent: 1, pendingAutoOpen: null, mediaKey: '' },
    $: () => null,
    Date,
  });
  const src = (RENDERER.match(/const ST_QUEUE_KEY[\s\S]*?function stQueueRailVideos[\s\S]*?\n\}/) || [])[0];
  vm.runInContext(src, ctx);
  const v = (id) => ({ videoId: id, title: 'T' + id, videoThumbnails: [] });
  assert.strictEqual(ctx.stQueueToggle(v('a')), true);
  assert.strictEqual(calls.update, 1, 'ekleme düğme durumunu tazelemedi');
  assert.strictEqual(ctx.stQueueToggle(v('a')), false);
  assert.strictEqual(calls.update, 2, 'çıkarma düğme durumunu tazelemedi');
});

test('F1: setMediaKey Sonraki düğmesini YENİ anahtarla hesaplar (davranış)', () => {
  const { ctx, player, buttons } = buildMediaKeyHarness();
  ctx.stQueueToggle({ videoId: 'v1', title: 't', videoThumbnails: [] });
  // file → youtube: güncelleme yeni mediaKey ile koşmalı — kuyruk doluyken
  // Sonraki açık kalmalı (eski 'file:' anahtarıyla hesaplanırsa kapalı kalırdı).
  ctx.setMediaKey('youtube:v1');
  assert.strictEqual(player.mediaKey, 'youtube:v1');
  assert.strictEqual(buttons.playerNextMedia.disabled, false,
    'kuyruk dolu YouTube medyasında Sonraki kapalı kaldı');
  // youtube → file: kuyruk bakliyken yerel playlist boş → Sonraki kapalı.
  ctx.setMediaKey('file:/b.mkv');
  assert.strictEqual(buttons.playerNextMedia.disabled, true,
    'yerel dosyada Sonraki kuyruk yüzünden açık kaldı');
});

// ---------- siyah sahne: kart probe'u sert hatada overlay'i geri açmalı ----------
test('F-6: başarısız kart probe\'u pendingAutoOpen varken SmartTube\'u geri açar (davranış)', () => {
  const src = (RENDERER.match(
    /if \(!res \|\| !res\.ok\) \{\s*\n\s*const message = friendlyYoutubeError[\s\S]*?\n    \}/
  ) || [])[0];
  assert.ok(src, 'playerProbe hata dalı bulunamadı');
  assert.ok(/pendingAutoOpen = null;[\s\S]*?setSmartTubeVisible\(true\)/.test(src),
    'hata dalı otomatik-açılışta overlay\'i geri açmıyor');

  const run = (pendingAutoOpen, res, message) => {
    const calls = { log: [], drawer: [], overlay: [] };
    const player = { pendingAutoOpen };
    const ctx = vm.createContext({
      friendlyYoutubeError: () => message,
      logLine: (m) => calls.log.push(m),
      toggleDrawerAt: (_btn, sel) => calls.drawer.push(sel),
      setSmartTubeVisible: (v) => calls.overlay.push(v),
    });
    vm.runInContext(`(function (player, res) {\n${src}\n})`, ctx)(player, res);
    return { calls, player };
  };

  // Kart kaynaklı otomatik açılış + sert hata → overlay geri açılır, niyet düşer
  {
    const { calls, player } = run({ key: 'youtube:v1', intent: 1 }, { ok: false, error: 'x' }, 'ağ hatası');
    assert.strictEqual(player.pendingAutoOpen, null);
    assert.deepStrictEqual(calls.overlay, [true], 'kart probe hatası overlay\'i geri açmadı');
    assert.deepStrictEqual(calls.drawer, [], 'oturumsuz hata çekmece açmamalı');
  }
  // Elle "Bilgi al" hatası (otomatik niyet yok) → overlay açılmaz
  {
    const { calls } = run(null, { ok: false, error: 'x' }, 'ağ hatası');
    assert.deepStrictEqual(calls.overlay, [], 'manuel probe hatası overlay açmamalı');
  }
  // Oturum-doğrulama hatası → hem çekmece hem (kart yolundaysa) overlay
  {
    const { calls } = run({ key: 'youtube:v1', intent: 2 }, { ok: false, error: 'x' }, 'oturum doğrulaması istedi');
    assert.deepStrictEqual(calls.drawer, ['#playerCookieBrowser']);
    assert.deepStrictEqual(calls.overlay, [true]);
  }
  // res=null (IPC çağrısı attı) kart yolunda → yine overlay geri açılır
  {
    const { calls } = run({ key: 'youtube:v1', intent: 3 }, null, 'bilinmeyen hata');
    assert.deepStrictEqual(calls.overlay, [true], 'res=null kart probe\'u siyah sahnede bıraktı');
  }
});

// ---------- F2: sıradan otomatik geçiş kaldığı yerden devam etmeli ----------
test('F2: stQueuePlayNext yarım kalmış kayda pendingLibrarySeek kurar (davranış)', () => {
  const src = (RENDERER.match(/function stQueuePlayNext\(\) \{[\s\S]*?\n\}/) || [])[0];
  assert.ok(src, 'stQueuePlayNext bulunamadı');

  const run = (watch) => {
    const calls = { probe: 0 };
    const player = { openIntent: 0, pendingAutoOpen: null, pendingLibrarySeek: null };
    const box = { value: '' };
    const ctx = vm.createContext({
      stQueue: [{ videoId: 'v9', title: 't' }],
      player,
      $: (id) => (id === 'playerYtUrl' ? box : null),
      mediaKeyFor: (kind, ref) => `${kind}:${ref}`,
      watchItemByKey: () => watch,
      queuePlayerProbeFromCard: () => { calls.probe++; },
      setSmartTubeVisible: () => {},
    });
    vm.runInContext(src + '\nstQueuePlayNext;', ctx).call(ctx);
    return { calls, player, box };
  };

  // Yarım kalmış kayıt → seek kurulur (kart tıklamasıyla aynı)
  {
    const { calls, player } = run({ key: 'x', position: 300, duration: 600, completed: false });
    assert.strictEqual(calls.probe, 1);
    assert.ok(player.pendingAutoOpen, 'otomatik açılış niyeti kurulmadı');
    assert.ok(player.pendingLibrarySeek, 'devam seek\'i kurulmadı');
    assert.strictEqual(player.pendingLibrarySeek.seconds, 300);
    assert.strictEqual(player.pendingLibrarySeek.key, player.pendingAutoOpen.key);
  }
  // Tamamlanmış kayıt → seek yok (baştan başlar)
  {
    const { player } = run({ key: 'x', position: 590, duration: 600, completed: true });
    assert.strictEqual(player.pendingLibrarySeek, null, 'tamamlanmış kayda seek kuruldu');
  }
  // Kayıt yok → seek yok
  {
    const { player } = run(null);
    assert.strictEqual(player.pendingLibrarySeek, null, 'kayıtsız videoya seek kuruldu');
  }
  // Boş kuyruk → false, hiçbir şey kurulmaz
  {
    const player = { openIntent: 0, pendingAutoOpen: null, pendingLibrarySeek: null };
    const ctx = vm.createContext({
      stQueue: [], player, $: () => null,
      mediaKeyFor: (k, r) => `${k}:${r}`,
      watchItemByKey: () => null, queuePlayerProbeFromCard: () => {},
    });
    assert.strictEqual(vm.runInContext(src + '\nstQueuePlayNext;', ctx).call(ctx), false);
  }
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
