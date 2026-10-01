'use strict';
// R402 (kuyruk-g15): YouTube hesap gecisi/silme — eski feed ve token
// yenileme yanitlarinin aktif hesaba karismasini onleyen bekci zincirinin
// kaynak invariant'lari. Denetim R120-C'de kuruldu; burada devamli kilitlenir.
const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const helpers = fs.readFileSync(path.join(root, 'src/renderer/renderer-helpers.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const t = (name, fn) => { fn(); console.log(`ok ${name}`); };

t('token yenileme: bekleme sonrasi hesap-kimligi yeniden dogrulanir', () => {
  // ensureYoutubeAccessToken icerisinde uc nokta: await sonrasi acct
  // referansi + activeId + in-flight accountId uyumu.
  const body = main.slice(main.indexOf('async function ensureYoutubeAccessToken'),
    main.indexOf('function validateInvidiousInstance'));
  assert.match(body, /youtubeSession\.activeId !== accountId \|\| youtubeSession\.accounts\[accountId\] !== acct/,
    'bekleme sonrasi kimlik bekçisi yok');
  assert.match(body, /youtubeSession\.accounts\[accountId\] !== acct\) return null/,
    'spawn oncesi kimlik bekçisi yok');
  assert.match(body, /flight\.accountId === accountId \? token : ensureYoutubeAccessToken\(\)/,
    'in-flight hesap uyumu bekçisi yok');
});

t('token yenileme: ayni-kimlik yeniden-girisi eski sonucu ezemez', () => {
  const body = main.slice(main.indexOf('async function ensureYoutubeAccessToken'),
    main.indexOf('function validateInvidiousInstance'));
  assert.match(body, /Aynı kimlikle çıkış\/yeniden giriş gerçekleştiyse eski sonuç yenisini ezemez|accounts\[accountId\] !== acct/,
    'yeniden-giris bekçisi yok');
});

t('env spawn aninda aktif hesaptan okunur (bayat override yok)', () => {
  const env = main.slice(main.indexOf('function youtubeAuthEnv'), main.indexOf('function runYoutubeCommand'));
  assert.match(env, /const acct = ytActiveAccount\(\)/, 'env aktif hesaptan okunmuyor');
});

t('env override yalniz disaridan verilir — aktif-olmayan hesap tokeni revoke icin', () => {
  const env = main.slice(main.indexOf('function youtubeAuthEnv'), main.indexOf('function runYoutubeCommand'));
  assert.match(env, /overrides\.refreshToken !== undefined/, 'refresh override bekçisi yok');
});

t('hesap gecisi: renderer bolumu force-render eder (seq++ → eski feed stale)', () => {
  const fn = helpers.slice(helpers.indexOf('async function switchYoutubeAccount'),
    helpers.indexOf('async function removeYoutubeAccount'));
  assert.match(fn, /renderSmartTubeSection\(stCurrentSection, \{ force: true \}\)/,
    'switch sonrasi force-render yok');
});

t('hesap silme: renderer bolumu force-render eder', () => {
  const fn = helpers.slice(helpers.indexOf('async function removeYoutubeAccount'),
    helpers.indexOf('// Bırakılan link'));
  assert.match(fn, /renderSmartTubeSection\(stCurrentSection, \{ force: true \}\)/,
    'remove sonrasi force-render yok');
});

t('feed cagrilari: her await sonrasinda stale() bekçisi', () => {
  // renderSmartTubeSection icinde youtubeBrowse await'lerinin hemen ardindan
  // stale() cagrisi olmali — eski hesabin feed'i yeni hesaba yazilmaz.
  const section = renderer.slice(renderer.indexOf('async function renderSmartTubeSection'));
  const browseCalls = section.match(/youtubeBrowse\([^)]*\)\.catch/g) || [];
  assert(browseCalls.length >= 3, `youtubeBrowse cagri sayisi beklenenden az: ${browseCalls.length}`);
  const afterEach = section.match(/youtubeBrowse[\s\S]{0,120}?if \(stale\(\)\) return/g) || [];
  assert(afterEach.length >= 3, `stale() bekçisi eksik: ${afterEach.length}/${browseCalls.length}`);
});

t('cikis: uçuştaki auth poll oldurulur (gec basari oturumu geri yazamaz)', () => {
  const logout = main.slice(main.indexOf("ipcMain.handle('youtube:logout'"),
    main.indexOf("ipcMain.handle('youtube:cancel'"));
  assert.match(logout, /terminateProcessTree\(mediaJobs\.youtubeAuth/,
    'logout auth poll oldurmuyor');
  assert.match(logout, /_ytAbortAuthFlow/, 'logout abort akisi yok');
});

t('browse serilestirme: ayni browse_id supersede eder, farkli id ezmez', () => {
  const ser = main.slice(main.indexOf('function ytBrowseSerialized'), main.indexOf("ipcMain.handle('youtube:browse'"));
  assert.match(ser, /_ytBrowseGenerations\.get\(browseId\)/, 'browse-id bazli nesil yok');
});

t('silme: aktif hesap cikarilinca siradaki aktiflesir + persist', () => {
  const logout = main.slice(main.indexOf("ipcMain.handle('youtube:logout'"),
    main.indexOf("ipcMain.handle('youtube:cancel'"));
  assert.match(logout, /ytAccounts\.removeAccount/, 'removeAccount cagrisi yok');
  assert.match(logout, /persistYoutubeSession/, 'persist cagrisi yok');
});

console.log('youtube-account-switch-contract: 10 bekci kilidi gecti');
