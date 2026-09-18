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
  assert.match(handler[0], /'download'\)/, "'download' slot'u kullanılmalı");
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
