'use strict';

// T4 — SmartTube/YouTube OAuth uçtan uca dayanıklılık smoke'u.
// Gerçek Electron main + renderer, GERÇEK IPC yolları (youtube:deviceCode /
// poll / authCode / browse / setClient / logout / cancel) ve yalnız
// 127.0.0.1'de dinleyen sahte OAuth+YouTube sunucusu. main.js'in kurduğu
// PKCE loopback dinleyicisine bu dosyadaki Node http istemcisiyle tarayıcı
// taklidi yapılır (state uyuşmazlığı + doğru state senaryoları).
// Gerçek Google hesabı KULLANILMAZ — mock başarı gerçek hesap kanıtı değildir.
// Çalıştırma: node_modules/.bin/electron tests/electron-youtube-oauth.smoke.js

const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.YTOAUTH_OUT
  || path.join(root, '.uiprev', 'youtube-oauth'));
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.resolve(
  process.env.YTOAUTH_PROFILE || path.join(out, `profile-${process.pid}`));
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });

// ---------------------------------------------------------------------------
// Sahte OAuth 2.0 (device + auth-code + refresh + revoke) ve YouTube Data /
// InnerTube sunucusu — tek 127.0.0.1 dinleyicisi. youtube.py'deki
// WHISPER_YT_TEST_BASE kancası tüm gerçek uçları buraya yönlendirir.
// ---------------------------------------------------------------------------
const fake = {
  deviceCalls: 0,
  tokenGrants: { device: 0, code: 0, refresh: 0 },
  revokeCalls: 0,
  browseCalls: [],
  meCalls: 0,
  lastAuthCodeForm: null,
  // device poll davranışı: 'pending:N' → N kez authorization_pending sonra onay;
  // 'denied' → access_denied; 'expired' → expired_token; 'stuck' → hep pending
  devicePollMode: 'pending:1',
  _pendingLeft: 1,
};

const INNERTUBE_FEED = {
  contents: {
    twoColumnBrowseResultsRenderer: {
      tabs: [{ tabRenderer: { content: { richGridRenderer: { contents: [
        { richItemRenderer: { content: { videoRenderer: {
          videoId: 'SUBVID001AA',
          title: { runs: [{ text: 'Abonelik Videosu Alfa' }] },
          ownerText: { runs: [{ text: 'Kanal Alfa',
            navigationEndpoint: { browseEndpoint: { browseId: 'UCalfa' } } }] },
          publishedTimeText: { simpleText: '2 hours ago' },
          lengthText: { simpleText: '4:21' },
          viewCountText: { simpleText: '12K views' },
          thumbnail: { thumbnails: [{ url: 'https://i/320.jpg', width: 320, height: 180 }] },
        } } } },
        { richItemRenderer: { content: { videoRenderer: {
          videoId: 'SUBVID002BB',
          title: { runs: [{ text: 'Abonelik Videosu Beta' }] },
          ownerText: { runs: [{ text: 'Kanal Beta',
            navigationEndpoint: { browseEndpoint: { browseId: 'UCbeta' } } }] },
          publishedTimeText: { simpleText: '1 day ago' },
          lengthText: { simpleText: '10:05' },
          viewCountText: { simpleText: '3.4K views' },
          thumbnail: { thumbnails: [{ url: 'https://i/320.jpg', width: 320, height: 180 }] },
        } } } },
      ] } } } }] },
    },
};

function readForm(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(
      Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))));
  });
}

const oauthServer = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const json = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  const p = u.pathname;
  if (req.method === 'POST' && p === '/device/code') {
    fake.deviceCalls += 1;
    return json(200, {
      device_code: `DC-TEST-${fake.deviceCalls}`,
      user_code: 'ABCD-EFGH',
      verification_url: 'https://www.google.com/device',
      expires_in: 600,
      interval: 1,
    });
  }
  if (req.method === 'POST' && p === '/token') {
    const form = await readForm(req);
    const gt = form.grant_type || '';
    if (gt === 'urn:ietf:params:oauth:grant-type:device_code') {
      fake.tokenGrants.device += 1;
      const mode = fake.devicePollMode;
      if (mode === 'denied') return json(400, { error: 'access_denied' });
      if (mode === 'expired') return json(400, { error: 'expired_token' });
      if (mode === 'stuck' || fake._pendingLeft > 0) {
        fake._pendingLeft -= 1;
        return json(400, { error: 'authorization_pending' });
      }
      // expires_in=30 → sonraki browse refresh yolunu zorlar
      return json(200, { access_token: 'AT-DEVICE-1', refresh_token: 'RT-DEVICE-1',
                         expires_in: 30, token_type: 'Bearer' });
    }
    if (gt === 'authorization_code') {
      fake.tokenGrants.code += 1;
      fake.lastAuthCodeForm = form;
      if (form.code !== 'AUTHCODE-1' || !form.code_verifier
          || !/^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/.test(form.redirect_uri || '')) {
        return json(400, { error: 'invalid_grant' });
      }
      return json(200, { access_token: 'AT-PKCE-1', refresh_token: 'RT-PKCE-1',
                         expires_in: 3600, token_type: 'Bearer' });
    }
    if (gt === 'refresh_token') {
      fake.tokenGrants.refresh += 1;
      return json(200, {
        access_token: `AT-REFRESH-${fake.tokenGrants.refresh}`,
        expires_in: 3600, token_type: 'Bearer' });
    }
    return json(400, { error: 'unsupported_grant_type' });
  }
  if (req.method === 'POST' && p === '/revoke') {
    await readForm(req);
    fake.revokeCalls += 1;
    return json(200, {});
  }
  if (req.method === 'GET' && p === '/youtube/v3/channels') {
    fake.meCalls += 1;
    return json(200, { items: [{ snippet: { title: 'Test Kanal (Fake)',
      description: 'sahte' } }] });
  }
  if (req.method === 'POST' && p === '/youtubei/v1/browse') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { fake.browseCalls.push(JSON.parse(Buffer.concat(chunks).toString('utf8')).browseId || ''); }
      catch (_) { fake.browseCalls.push('?'); }
      json(200, INNERTUBE_FEED);
    });
    return undefined;
  }
  if (req.method === 'GET' && (p === '/' || p === '')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><script>var ytcfg={"INNERTUBE_API_KEY":"FAKEKEY-123"};</script></html>');
    return undefined;
  }
  res.writeHead(404); return res.end('yok');
});

// PKCE akışında main.js sistem tarayıcısını shell.openExternal ile açar —
// smoke'ta yakalanır; state'ler buradan loopback'e elle geri yazılır.
const openedUrls = [];
const realOpenExternal = shell.openExternal.bind(shell);
shell.openExternal = (u) => { openedUrls.push(String(u)); return Promise.resolve(); };

const oauthReady = new Promise((resolve, reject) => {
  oauthServer.once('error', reject);
  oauthServer.listen(0, '127.0.0.1', () => {
    process.env.WHISPER_YT_TEST_BASE = `http://127.0.0.1:${oauthServer.address().port}`;
    resolve();
  });
});

const report = { counters: () => JSON.parse(JSON.stringify({
  deviceCalls: fake.deviceCalls, tokenGrants: fake.tokenGrants,
  revokeCalls: fake.revokeCalls, browseCalls: fake.browseCalls,
  meCalls: fake.meCalls,
})) };

const watchdog = setTimeout(() => {
  const error = new Error('YouTube OAuth smoke 240 saniyelik güvenlik sınırını aştı');
  try { fs.writeFileSync(path.join(out, 'error.txt'), error.stack); } catch (_) {}
  console.error(error);
  app.exit(1);
}, 240000);
watchdog.unref();

app.setAppPath(root);
app.setPath('userData', process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
app.commandLine.appendSwitch('disable-gpu');
// main.js registerSchemesAsPrivileged'i modül yüklenirken çağırır —
// app ready'den ÖNCE require edilmeli (gauntlet pattern).
require('../src/main.js');

app.whenReady().then(async () => {
  await oauthReady;
  console.log(`[yt-oauth] sahte OAuth/YouTube: ${process.env.WHISPER_YT_TEST_BASE}`);

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, label, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = await fn().catch(() => null);
      if (v) return v;
      await delay(250);
    }
    throw new Error(`until zaman aşımı: ${label}`);
  };

  const win = await until(async () => BrowserWindow.getAllWindows().find((w) =>
    w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()), 'Ana pencere');
  win.show();
  const run = async (code) => {
    let timer;
    try {
      return await Promise.race([
        win.webContents.executeJavaScript(`(async()=>{${code}})()`, true),
        new Promise((_, reject) => { timer = setTimeout(() =>
          reject(new Error(`Renderer isteği zaman aşımı: ${code.slice(0, 90)}`)), 30000); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  await until(() => run('return typeof initialSettingsReady!=="undefined"?await initialSettingsReady.then(()=>true):false'), 'Ayarlar');
  const shot = async (name) => fs.writeFileSync(path.join(out, `${name}.png`),
    (await win.webContents.capturePage()).toPNG());

  // ---- Faz 0: çıkış durumu + modal açılışı (görsel + klavye) ----
  await run(`openPlayer();setWorkspaceMode('player');setSmartTubeVisible(true);return true`);
  const preLogin = await run(`return {
    loginBtn: !document.getElementById('stYtLoginBtn').classList.contains('hidden'),
    logoutHidden: document.getElementById('stYtLogoutBtn').classList.contains('hidden'),
    loggedInFlag: youtubeLoggedIn,
  }`);
  assert.equal(preLogin.loginBtn, true, 'çıkış durumunda stYtLoginBtn görünmeli');
  assert.equal(preLogin.logoutHidden, true, 'stYtLogoutBtn gizli olmalı');
  assert.equal(preLogin.loggedInFlag, false);
  report.preLogin = preLogin;

  // Kayıtlı istemci yokken gömülü TVHTML5 istemcisi devrededir: login
  // tıklaması cihaz görünümünü açar ve cihaz-kodu akışını KENDİLİĞİNDEN
  // başlatır (sıfır-kurulum UX). ytClientView yalnız "İstemciyi değiştir"
  // ile açılır. 'stuck' ile akış onayda asılı kalır, modal açık incelenir.
  fake.devicePollMode = 'stuck';
  await run(`document.getElementById('stYtLoginBtn').click();return true`);
  await until(() => run(`return !document.getElementById('youtubeLoginModal').classList.contains('hidden')
    && !document.getElementById('ytDeviceView').classList.contains('hidden')
    && !document.getElementById('ytDeviceCodeBlock').classList.contains('hidden')`), 'auto device flow');
  await until(() => run(`return document.getElementById('ytUserCode').textContent==='ABCD-EFGH'`), 'auto user code');
  assert.ok(fake.deviceCalls >= 1, 'gömülü istemci cihaz kodu istedi');
  report.autoDeviceFlow = { deviceCalls: fake.deviceCalls };
  await shot('01-logged-out-modal');
  // Esc ile kapanış (klavye doğrulaması + süren poll'un iptali)
  await run(`document.getElementById('youtubeLoginModal').dispatchEvent(
    new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true`);
  assert.equal(await run(`return document.getElementById('youtubeLoginModal').classList.contains('hidden')`), true,
    'Esc modalı kapatmalı');

  // Client kaydı — yeniden açılışta gömülü akış yine kendiliğinden başlar;
  // "İstemciyi değiştir" akışı iptal edip ytClientView'a iner. Input içinde
  // Enter 'Kaydet ve devam et'i tetikler.
  await run(`document.getElementById('stYtLoginBtn').click();return true`);
  await until(() => run(`return !document.getElementById('ytDeviceView').classList.contains('hidden')
    && document.getElementById('ytUserCode').textContent==='ABCD-EFGH'`), 'auto device flow-2');
  await run(`document.getElementById('ytChangeClient').click();return true`);
  await until(() => run(`return !document.getElementById('ytClientView').classList.contains('hidden')`), 'ytClientView');
  await run(`document.getElementById('ytClientId').value='FAKE-CLIENT-12345';
    document.getElementById('ytClientSecret').value='fakesecret123';
    document.getElementById('ytClientId').dispatchEvent(
      new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true`);
  await until(() => run(`return !document.getElementById('ytDeviceView').classList.contains('hidden')`), 'ytDeviceView');
  const sessionHasClient = await run(`return (await window.api.youtubeSession()).data.hasClient`);
  assert.equal(sessionHasClient, true, 'youtube:setClient sonrası hasClient');

  // ---- Faz 1a: cihaz akışı — iptal ----
  fake.devicePollMode = 'stuck';
  await run(`startYoutubeDeviceFlow();return true`);
  await until(() => run(`return document.getElementById('ytUserCode').textContent==='ABCD-EFGH'`), 'user code');
  await shot('02-device-code-shown');
  await run(`document.getElementById('ytDeviceCancel').click();return true`);
  await delay(500);
  const afterCancel = await run(`return {
    modalHidden: document.getElementById('youtubeLoginModal').classList.contains('hidden'),
    loggedIn: youtubeLoggedIn }`);
  assert.equal(afterCancel.loggedIn, false, 'iptal edilmiş akışta giriş olamaz');
  // Geç gelen onay: fake bir sonraki poll'da onaylayacak şekilde çevir —
  // süreç öldürüldüğü için asla ulaşmamalı.
  fake.devicePollMode = 'pending:0';
  await delay(4000);
  assert.equal(await run(`return (await window.api.youtubeSession()).data.loggedIn`), false,
    'iptal sonrası geç onay oturum açmamalı');

  // ---- Faz 1b: cihaz akışı — reddedilme (başarısız giriş ekranı) ----
  fake.devicePollMode = 'denied';
  await run(`document.getElementById('stYtLoginBtn').click();return true`);
  await until(() => run(`return !document.getElementById('ytDeviceView').classList.contains('hidden')`), 'ytDeviceView-denied');
  await run(`startYoutubeDeviceFlow();return true`);
  await until(() => run(`return /reddetti/.test(document.getElementById('ytPollStatus').textContent)`), 'denied error', 30000);
  await shot('03-login-denied');
  assert.equal(await run(`return youtubeLoggedIn`), false);
  await run(`closeYoutubeLogin();return true`);

  // ---- Faz 1c: PKCE — state uyuşmazlığı ----
  openedUrls.length = 0;
  await run(`document.getElementById('stYtLoginBtn').click();return true`);
  await until(() => run(`return !document.getElementById('ytDeviceView').classList.contains('hidden')`), 'ytDeviceView-pkce');
  await run(`startYoutubeBrowserFlow();return true`);
  await until(async () => openedUrls.length > 0, 'openExternal URL');
  const authUrl = new URL(openedUrls[0]);
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authUrl.searchParams.get('state').length > 10, 'state uzunluğu');
  assert.match(authUrl.searchParams.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/);
  // Yanlış state → main akışı 'state uyuşmadı' ile reddeder; token takası YOK.
  const cbUrl = new URL(authUrl.searchParams.get('redirect_uri'));
  cbUrl.searchParams.set('code', 'AUTHCODE-1');
  cbUrl.searchParams.set('state', 'WRONG-STATE');
  const cbResp = await new Promise((resolve) => {
    http.get(cbUrl, (r) => { r.resume(); resolve(r.statusCode); }).on('error', () => resolve(-1));
  });
  assert.equal(cbResp, 400, 'yanlış state için 400');
  await until(() => run(`return /uyuşmadı|tamamlanamadı/.test(document.getElementById('ytPollStatus').textContent)`), 'state mismatch status');
  assert.equal(fake.tokenGrants.code, 0, 'state uyuşmazken token takası olamaz');
  assert.equal(await run(`return youtubeLoggedIn`), false);
  await shot('04-pkce-state-mismatch');

  // ---- Faz 1d: PKCE — iptal + geç cevap ----
  openedUrls.length = 0;
  await run(`startYoutubeBrowserFlow();return true`);
  await until(async () => openedUrls.length > 0, 'openExternal URL 2');
  await run(`closeYoutubeLogin();return true`);   // kullanıcı iptali
  await delay(300);
  // Loopback dinleyicisi kapatılmış olmalı — doğru state ile bile cevap düşer.
  const cbUrl2 = new URL(new URL(openedUrls[0]).searchParams.get('redirect_uri'));
  cbUrl2.searchParams.set('code', 'AUTHCODE-1');
  cbUrl2.searchParams.set('state', new URL(openedUrls[0]).searchParams.get('state'));
  const lateResp = await new Promise((resolve) => {
    http.get(cbUrl2, (r) => { r.resume(); resolve(r.statusCode); }).on('error', () => resolve(-1));
  });
  assert.equal(lateResp, -1, 'iptal sonrası loopback dinleyicisi kapalı olmalı');
  assert.equal(fake.tokenGrants.code, 0, 'iptal edilmiş akışta takas olamaz');

  // ---- Faz 2: cihaz akışı başarılı giriş ----
  fake.devicePollMode = 'pending:1';
  fake._pendingLeft = 1;
  await run(`document.getElementById('stYtLoginBtn').click();return true`);
  await until(() => run(`return !document.getElementById('ytDeviceView').classList.contains('hidden')`), 'ytDeviceView-login');
  await run(`startYoutubeDeviceFlow();return true`);
  await until(() => run(`return youtubeLoggedIn===true`), 'login success', 40000);
  const loggedInUi = await run(`return {
    logoutShown: !document.getElementById('stYtLogoutBtn').classList.contains('hidden'),
    loginHidden: document.getElementById('stYtLoginBtn').classList.contains('hidden'),
    modalHidden: document.getElementById('youtubeLoginModal').classList.contains('hidden'),
    name: youtubeUserName }`);
  assert.equal(loggedInUi.logoutShown, true, 'giriş sonrası logout düğmesi');
  assert.equal(loggedInUi.loginHidden, true);
  assert.equal(loggedInUi.modalHidden, true, 'başarı sonrası modal kapanır');
  assert.equal(loggedInUi.name, 'Test Kanal (Fake)', 'channels.mine kanal adı');
  report.loggedInUi = loggedInUi;
  await shot('05-logged-in');
  // Girişli modal görünümü
  await run(`document.getElementById('stYtLogoutBtn').click();return true`);
  await until(() => run(`return !document.getElementById('ytLoggedView').classList.contains('hidden')`), 'ytLoggedView');
  await shot('06-logged-view');
  await run(`document.getElementById('ytLoggedClose').click();return true`);

  // ---- Faz 3: abonelik feed'i + oynatıcıya geçiş ----
  await run(`renderSmartTubeSection('subscriptions', { force: true });return true`);
  await until(() => run(`return document.querySelectorAll('#stGrid .st-card').length>=2`), 'subs cards', 20000);
  assert.ok(fake.browseCalls.includes('FEsubscriptions'), 'FEsubscriptions browse çağrısı');
  const subs = await run(`return {
    titles: [...document.querySelectorAll('#stGrid .st-card .st-card-title, #stGrid .st-card')].map(c=>c.textContent.slice(0,40)).slice(0,3) }`);
  report.subscriptions = subs;
  await shot('07-subscriptions');
  // Klavyeyle ilk karta git, Enter → player handoff
  const handoff = await run(`const card=document.querySelector('#stGrid .st-card');
    card.focus();card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    return { ytUrl: document.getElementById('playerYtUrl').value,
      pending: !!(player.pendingAutoOpen), browserHidden: document.getElementById('smarttubeBrowser').classList.contains('hidden')||!document.getElementById('playerStage').classList.contains('browsing') }`);
  assert.match(handoff.ytUrl, /youtube\.com\/watch\?v=SUBVID001AA/, 'karta basınca player URL');
  assert.equal(handoff.pending, true, 'pendingAutoOpen (probe→otoplay zinciri)');
  report.handoff = handoff;
  await shot('08-player-handoff');
  await run(`setSmartTubeVisible(true);return true`);

  // ---- Faz 4: token yenileme + eşzamanlı browse dayanıklılığı ----
  // (expires_in=30 → ilk browse refresh tetikler)
  // F-101-1 RED kanıtı: iki eşzamanlı browse — giriş-sonrası home re-render'ı
  // ile kullanıcı bölüm tıklaması gerçek akışta böyle çakışıyor; ikinci istek
  // 'zaten çalışıyor' ile reddedilmemeli (kuyruk/serileştirme beklenir).
  const conc = await run(`return await Promise.all([
    window.api.youtubeBrowse('FEsubscriptions').catch(e=>({ok:false,error:e.message})),
    window.api.youtubeBrowse('FEwhat_to_watch').catch(e=>({ok:false,error:e.message}))])`);
  assert.equal(conc[0].ok, true, `eşzamanlı browse[0]: ${conc[0].error || ''}`);
  assert.equal(conc[1].ok, true, `eşzamanlı browse[1] 'already running' olmamalı: ${conc[1].error || ''}`);
  report.concurrentBrowse = conc.map((c) => ({ ok: c.ok, error: c.error || null }));
  // expires_in=30'lu giriş token'ı ilk browse'da (faz 3) yenilendi — toplam
  // tam olarak 1 refresh olmalı; sonraki browse'lar taze token'ı yenilemez.
  assert.equal(fake.tokenGrants.refresh, 1, 'tam olarak bir refresh grant');
  await run(`return await window.api.youtubeBrowse('FEsubscriptions')`);
  assert.equal(fake.tokenGrants.refresh, 1, 'taze token tekrar yenilenmez');
  report.tokenGrantsAfterRefresh = { ...fake.tokenGrants };

  // ---- Faz 5: hesap/istemci değişimi eski oturumu düşürür ----
  await run(`return await window.api.youtubeSetClient('OTHER-CLIENT-6789', 'othersecret456')`);
  const afterClientSwap = await run(`return (await window.api.youtubeSession()).data`);
  assert.equal(afterClientSwap.loggedIn, false, 'istemci değişimi oturumu düşürmeli');
  await run(`await restoreYoutubeSession();return true`);
  assert.equal(await run(`return !document.getElementById('stYtLoginBtn').classList.contains('hidden')`), true,
    'istemci değişiminde login düğmesi geri gelir');

  // ---- Faz 6: PKCE başarılı giriş + logout/revoke ----
  openedUrls.length = 0;
  await run(`document.getElementById('stYtLoginBtn').click();return true`);
  await until(() => run(`return !document.getElementById('ytDeviceView').classList.contains('hidden')`), 'ytDeviceView-pkce-ok');
  await run(`startYoutubeBrowserFlow();return true`);
  await until(async () => openedUrls.length > 0, 'openExternal URL 3');
  const authUrl3 = new URL(openedUrls[0]);
  const okCb = new URL(authUrl3.searchParams.get('redirect_uri'));
  okCb.searchParams.set('code', 'AUTHCODE-1');
  okCb.searchParams.set('state', authUrl3.searchParams.get('state'));
  const okStatus = await new Promise((resolve) => {
    http.get(okCb, (r) => { r.resume(); resolve(r.statusCode); }).on('error', () => resolve(-1));
  });
  assert.equal(okStatus, 200, 'doğru state + code → 200');
  await until(() => run(`return youtubeLoggedIn===true`), 'pkce login', 30000);
  assert.equal(fake.tokenGrants.code, 1, 'tek authorization_code takası');
  assert.ok(fake.lastAuthCodeForm.code_verifier.length > 20, 'PKCE verifier iletildi');
  await run(`await doYoutubeLogout();return true`);
  await delay(400);
  const postLogout = await run(`return {
    session: (await window.api.youtubeSession()).data.loggedIn,
    loginBtn: !document.getElementById('stYtLoginBtn').classList.contains('hidden'),
    logoutHidden: document.getElementById('stYtLogoutBtn').classList.contains('hidden') }`);
  assert.equal(postLogout.session, false, 'logout sonrası oturum yok');
  assert.equal(postLogout.loginBtn, true);
  assert.equal(postLogout.logoutHidden, true);
  assert.ok(fake.revokeCalls >= 1, 'logout revoke çağrısı');
  report.postLogout = postLogout;

  // ---- Özet ----
  report.countersFinal = report.counters();
  report.pass = true;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('[yt-oauth] TÜM SENARYOLAR GEÇTİ');
  console.log(JSON.stringify(report.countersFinal));
  app.exit(0);
}).catch((err) => {
  console.error('[yt-oauth] HATA:', err);
  try {
    report.error = String(err && err.stack || err);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  } catch (_) {}
  app.exit(1);
});
