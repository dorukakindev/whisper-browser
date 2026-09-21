'use strict';

/**
 * Report 70 — YouTube OAuth cihaz-akışı + InnerTube entegrasyonu regresyon testi.
 *
 * Güvenlik sözleşmesi:
 * - refresh_token / access_token / client_secret / device_code ASLA renderer'a
 *   dönmez (invoke cevabı veya youtube:event üzerinden).
 * - Tüm youtube:* handler'ları authorizedBrowserSender kontrolünden geçer.
 * - browse_id beyaz liste; continuation uzunluk sınırlı.
 * - OAuth gizli değerleri argv'den değil env kanalından Python'a geçer.
 * - Oturum safeStorage (SafeSecretStore) ile kalıcı; access_token kalıcı DEĞİL.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
const RENDERER = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8');
const YT_PY = fs.readFileSync(path.join(ROOT, 'backend', 'youtube.py'), 'utf8');

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------- handler bloğu çıkarımı ----------
function handlerBody(name) {
  const m = MAIN.match(new RegExp(
    `ipcMain\\.handle\\('${name}',\\s*async[\\s\\S]*?\\n\\}\\);`, 'm'));
  assert.ok(m, `${name} handler'ı bulunamadı`);
  return m[0];
}

// ---------- R70-01: tüm handler'lar yetki kontrolünde ----------
test('R70-01: youtube:* handler\'ları authorizedBrowserSender kontrolünde', () => {
  for (const h of ['youtube:session', 'youtube:setClient', 'youtube:deviceCode',
                   'youtube:poll', 'youtube:browse', 'youtube:logout', 'youtube:cancel']) {
    const body = handlerBody(h);
    assert.ok(/authorizedBrowserSender\(/.test(body), `${h} yetki kontrolü eksik`);
  }
});

// ---------- R70-02: preload köprüsü ----------
test('R70-02: preload YouTube köprü metotları mevcut', () => {
  for (const m of ['youtubeSession', 'youtubeSetClient', 'youtubeDeviceCode',
                   'youtubePoll', 'youtubeBrowse', 'youtubeLogout', 'youtubeCancel',
                   'onYoutubeEvent']) {
    assert.ok(PRELOAD.includes(`${m}:`), `preload eksik: ${m}`);
  }
  assert.match(PRELOAD, /ipcRenderer\.invoke\('youtube:setClient'/);
  assert.match(PRELOAD, /ipcRenderer\.on\('youtube:event'/);
});

// ---------- R70-03: token'lar renderer'a dönmez ----------
test('R70-03: youtube:session cevabı token/secret içermez', () => {
  const body = handlerBody('youtube:session');
  const ret = body.match(/return \{ ok: true, data: \{([\s\S]*?)\} \};/);
  assert.ok(ret, 'session cevabı bulunamadı');
  // Dönen ANAHTARLAR güvenli kümede olmalı (değer referansları değil)
  const keys = [...ret[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
  const safe = new Set(['loggedIn', 'userName', 'userEmail', 'hasClient', 'pendingCode', 'usingBuiltin']);
  for (const k of keys) {
    assert.ok(safe.has(k), `session cevabı beklenmeyen alan dönüyor: ${k}`);
  }
});

test('R70-03b: youtube:poll başarı cevabı yalnız kullanıcı bilgisi döner', () => {
  const body = handlerBody('youtube:poll');
  const ret = body.match(/return \{ ok: true, data: \{[^}]*\} \}/);
  assert.ok(ret, 'poll başarı cevabı bulunamadı');
  assert.ok(!/token|secret/i.test(ret[0]), `poll cevabı token sızdırıyor: ${ret[0]}`);
});

test('R70-03c: youtube:event yalnız log olaylarını iletir (token sızıntısı yok)', () => {
  // poll handler'ındaki onEvent filtresi: yalnız type==='log' forward edilmeli.
  // 'login' emit'i access_token+refresh_token taşır — asla forward edilmemeli.
  const fwd = MAIN.match(/youtube:event[\s\S]{0,200}/g) || [];
  const unsafe = fwd.filter((s) => !/type === 'log'/.test(s) && /send\(/.test(s));
  assert.strictEqual(unsafe.length, 0,
    `youtube:event filtresiz forward bulundu: ${unsafe.join(' | ')}`);
});

test('R70-03d: device_code renderer cevabında deviceCode alanı yok', () => {
  const body = handlerBody('youtube:deviceCode');
  const ret = body.match(/return \{ ok: true, data: \{[\s\S]*?\} \};/);
  assert.ok(ret);
  assert.ok(!/device_code|deviceCode/.test(ret[0]),
    'deviceCode renderer cevabına sızıyor');
  assert.ok(/user_code/.test(ret[0]) && /verification_url/.test(ret[0]));
});

// ---------- R70-04: gizli değerler env kanalı ----------
test('R70-04: OAuth gizli değerleri argv yerine env ile geçer', () => {
  assert.match(MAIN, /WHISPER_YT_CLIENT_SECRET/);
  assert.match(MAIN, /WHISPER_YT_REFRESH_TOKEN/);
  assert.match(MAIN, /WHISPER_YT_ACCESS_TOKEN/);
  assert.match(MAIN, /WHISPER_YT_DEVICE_CODE/);
  // argv'de secret argümanı olmamalı
  assert.ok(!/'--client-secret'|--client-secret/.test(MAIN),
    'client_secret argv ile geçiyor');
  // Python tarafı da env'den okumalı
  assert.match(YT_PY, /os\.environ\.get\("WHISPER_YT_CLIENT_SECRET"/);
  assert.match(YT_PY, /os\.environ\.get\("WHISPER_YT_REFRESH_TOKEN"/);
});

// ---------- R70-05: browse_id beyaz liste (main + backend çift katman) ----------
test('R70-05: browse_id hem main hem backend katmanında whitelist', () => {
  const body = handlerBody('youtube:browse');
  for (const bid of ['FEsubscriptions', 'FEwhat_to_watch', 'FElibrary',
                     'FEhistory', 'VLWL', 'VLLL']) {
    assert.ok(body.includes(`'${bid}'`), `main whitelist eksik: ${bid}`);
  }
  assert.ok(/!allowed\.has\(bid\)/.test(body));
  assert.match(YT_PY, /allowed_browse = \{/);
  assert.match(YT_PY, /bid not in allowed_browse/);
});

// ---------- R70-06: continuation sınırı ----------
test('R70-06: continuation renderer girdisi uzunluk sınırlı', () => {
  const body = handlerBody('youtube:browse');
  assert.match(body, /cont\.slice\(0,\s*\d+\)/);
});

// ---------- R70-07: kalıcılık safeStorage'da; access_token kalıcı değil ----------
test('R70-07: YouTube oturumu SafeSecretStore ile kalıcı', () => {
  assert.match(MAIN, /youtube-session\.safe\.json/);
  const fields = MAIN.match(/fields:\s*\[([^\]]*)\][\s\S]{0,200}?youtube-session|youtube-session[\s\S]{0,300}?fields:\s*\[([^\]]*)\]/);
  const storeBlock = MAIN.match(/youtubeSessionStore = new SafeSecretStore\([\s\S]*?\}\);/);
  assert.ok(storeBlock, 'YouTube SafeSecretStore bulunamadı');
  assert.ok(/client_secret/.test(storeBlock[0]) && /refresh_token/.test(storeBlock[0]));
  // access_token persist edilmemeli (kısa ömürlü — bellekte kalır)
  const persist = MAIN.match(/function persistYoutubeSession[\s\S]*?\n\}/);
  assert.ok(persist);
  assert.ok(!/access_token|accessToken/.test(persist[0]),
    'access_token diske persist ediliyor — güvenlik riski');
});

// ---------- R70-08: logout temizliği + revoke ----------
test('R70-08: logout revoke eder ve yerel oturumu temizler', () => {
  const body = handlerBody('youtube:logout');
  assert.match(body, /\['revoke'\]/);
  assert.match(body, /refreshToken = ''/);
  assert.match(body, /persistYoutubeSession\(\)/);
});

// ---------- R70-09: cancel gerçek süreci öldürür ----------
test('R70-09: youtube:cancel mediaJobs.youtube sürecini öldürür', () => {
  const body = handlerBody('youtube:cancel');
  assert.match(body, /mediaJobs\.youtube/);
  assert.match(body, /terminateProcessTree/);
});

// ---------- R70-10: tek-iş slotu + sonuç whitelist ----------
test('R70-10: runYoutubeCommand tek slot ve sonuç whitelist kullanır', () => {
  assert.match(MAIN, /youtube: null/);
  assert.match(MAIN, /YOUTUBE_RESULT_TYPES\s*=\s*new Set/);
  assert.match(MAIN, /mediaJobs\.youtube\) return resolve/);
  for (const t of ['device_code', 'login', 'token', 'feed', 'me', 'revoked']) {
    assert.ok(MAIN.includes(`'${t}'`), `YOUTUBE_RESULT_TYPES eksik: ${t}`);
  }
});

// ---------- R70-11: setClient doğrulama ----------
test('R70-11: youtube:setClient girdi doğrular ve persist eder', () => {
  const body = handlerBody('youtube:setClient');
  assert.match(body, /test\(id\)/);
  assert.match(body, /test\(secret\)/);
  assert.match(body, /persistYoutubeSession\(\)/);
});

// ---------- R70-12: renderer entegrasyonu ----------
test('R70-12: renderer YouTube login akışını ve düğmeleri bağlar', () => {
  for (const id of ['youtubeLoginModal', 'ytClientId', 'ytClientSecret',
                    'ytUserCode', 'ytVerificationUrl', 'ytPollStatus',
                    'ytDeviceCancel', 'ytClientSave', 'stYtLoginBtn', 'stYtLogoutBtn']) {
    assert.ok(HTML.includes(`id="${id}"`), `HTML eksik: ${id}`);
  }
  assert.match(RENDERER, /window\.api\.youtubeDeviceCode\(\)/);
  assert.match(RENDERER, /window\.api\.youtubePoll\(\)/);
  assert.match(RENDERER, /window\.api\.youtubeSetClient\(/);
  assert.match(RENDERER, /window\.api\.youtubeLogout\(\)/);
  assert.match(RENDERER, /window\.api\.youtubeCancel\(\)/);
  assert.match(RENDERER, /restoreYoutubeSession\(\)/);
});

test('R70-12b: girişliyken subscriptions gerçek YouTube verisi kullanır', () => {
  assert.match(RENDERER, /youtubeLoggedIn\)[\s\S]{0,400}?youtubeBrowse\('FEsubscriptions'\)/);
  // renderer token/secret alanlarını hiç okumaz — yalnız setClient'a yazar
  assert.ok(!/\.(refresh_token|access_token|client_secret|refreshToken|accessToken|clientSecret)\b/
    .test(RENDERER.match(/youtube\w*\([^)]*\)[\s\S]{0,300}/g)?.join('') || ''),
    'renderer YouTube cevabından token/secret okuyor');
});

test('R70-12c: device-code modalı CSS\'i mevcut', () => {
  assert.match(CSS, /\.yt-user-code/);
  assert.match(CSS, /\.yt-device-code-wrap/);
});

// ---------- R70-13: backend sabitleri ----------
test('R70-13: backend yalnız HTTPS Google/YouTube endpoint\'leri kullanır', () => {
  const urls = YT_PY.match(/https?:\/\/[^"'\s]+/g) || [];
  for (const u of urls) {
    assert.ok(u.startsWith('https://'), `düz http endpoint: ${u}`);
    assert.ok(/googleapis\.com|youtube\.com|ytimg\.com|google\.com/.test(u),
      `beklenmeyen endpoint: ${u}`);
  }
  assert.match(YT_PY, /auth\/youtube\.readonly["']/);
});

test('R70-14: istemci değişimi eski tokenları kullanmaz', () => {
  const setClient = MAIN.match(/ipcMain\.handle\('youtube:setClient'[\s\S]*?\n\}\);/);
  assert.ok(setClient, 'youtube:setClient handler yok');
  assert.match(setClient[0], /id !== youtubeSession\.clientId \|\| secret !== youtubeSession\.clientSecret/);
  assert.match(setClient[0], /youtubeSession\.refreshToken = ''/);
  assert.match(setClient[0], /youtubeSession\.accessToken = ''/);
  const ensure = MAIN.match(/async function ensureYoutubeAccessToken\(\)[\s\S]*?\n\}/);
  assert.ok(ensure, 'ensureYoutubeAccessToken yok');
  assert.match(ensure[0], /if \(!youtubeSession\.clientId \|\| !youtubeSession\.clientSecret\) return null/);
});

test('R70-13b: backend NDJSON emit kilit altında (thread-güvenli)', () => {
  assert.match(YT_PY, /_emit_lock = threading\.Lock\(\)/);
  assert.match(YT_PY, /with _emit_lock:/);
});

// ---------- çalıştır ----------
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); passed++; console.log(`ok ${passed} - ${name}`); }
  catch (e) { failed++; console.log(`FAIL - ${name}\n  ${e.message}`); }
}
console.log(`\n${passed} geçti, ${failed} başarısız`);
process.exit(failed ? 1 : 0);
