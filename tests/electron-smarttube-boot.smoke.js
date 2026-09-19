'use strict';

// R67-01 regresyon smoke'u: renderer.js top-level TDZ çökmesi SmartTube'u ölü
// bırakıyordu ("İçerik yükleniyor…"da takılma). Bu smoke gerçek index.html +
// preload'i gizli pencerede yükler, console hatalarını toplar, mock IPC
// handler'larıyla feed'in gerçekten DOM'a bastığını ve bölüm ayracının grid
// hücresine sıkışmadığını doğrular — kaynak-regex testleri bu sınıfı yakalayamaz.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

const mkVideo = (id, title, author) => ({
  videoId: id,
  title,
  author,
  authorId: 'UC' + id,
  viewCount: 1234567,
  publishedText: '2 days ago',
  lengthSeconds: 754,
  liveNow: false,
  videoThumbnails: [{ url: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg', quality: 'medium' }],
});

async function main() {
  let copiedCode = '';
  let slowNextDeviceCode = false;
  let deviceCancelCount = 0;
  // Mock Invidious IPC — gerçek handler'lar bu bare-window'da kayıtlı değil.
  const popular = Array.from({ length: 6 }, (_, i) => mkVideo(`pop${String(i).padStart(8, '0')}`.slice(0, 11).padEnd(11, 'x'), `Popular ${i}`, 'PopChannel'));
  const trending = Array.from({ length: 4 }, (_, i) => mkVideo(`trd${String(i).padStart(8, '0')}`.slice(0, 11).padEnd(11, 'y'), `Trending ${i}`, 'TrendChannel'));
  const musicTrend = Array.from({ length: 3 }, (_, i) => mkVideo(`mus${String(i).padStart(8, '0')}`.slice(0, 11).padEnd(11, 'z'), `MusicHit ${i}`, 'MusicChannel'));
  ipcMain.handle('invidious:feed', async (_e, kind, opts) => {
    const tab = opts && opts.tab;
    if (kind === 'home') {
      // D-K3 birleşik paket — tek emit'te popular+trending
      return { ok: true, data: {
        instance: 'https://mock.invidious.local', kind: 'home',
        popular: { videos: popular }, trending: { videos: trending },
      } };
    }
    if (kind === 'trending' && tab === 'music') {
      return { ok: true, data: { instance: 'https://mock.invidious.local', tab, videos: musicTrend } };
    }
    if (kind === 'trending' && tab === 'news') {
      // Degraded provenance — renderer "yedek" etiketi göstermeli
      return { ok: true, data: { instance: 'yt-dlp:tab', tab, videos: musicTrend, degraded: true, source: 'yt-dlp' } };
    }
    return { ok: true, data: { instance: 'https://mock.invidious.local', videos: kind === 'trending' ? trending : popular } };
  });
  ipcMain.handle('invidious:session', async () => ({ ok: true, data: { loggedIn: false } }));
  ipcMain.handle('invidious:channel', async (_e, id) => ({
    ok: true,
    data: {
      info: { author: 'MockChannel', authorId: id, subCount: 123456, description: 'desc' },
      videos: popular.slice(0, 3),
    },
  }));
  ipcMain.handle('invidious:comments', async (_e, vid) => ({
    ok: true,
    data: {
      videoId: vid,
      comments: [
        { author: 'u1', text: '<b>ilk</b> yorum', likeCount: 12, publishedText: '1d' },
        { author: 'u2', text: 'ikinci', likeCount: 0, publishedText: '2d' },
      ],
      continuation: '',
      disabled: false,
    },
  }));
  ipcMain.handle('invidious:search', async (_e, q, opts) => ({
    ok: true,
    data: { videos: popular.slice(0, 2).map(v => ({ ...v, videoId: 's' + v.videoId.slice(0, 10), title: `${q}-${v.title}` })) },
  }));
  // Mock YouTube OAuth IPC — oturum başta kapalı; renderer'da elle açılır
  ipcMain.handle('youtube:session', async () => ({
    ok: true,
    data: { loggedIn: false, userName: '', hasClient: true, pendingCode: false },
  }));
  ipcMain.handle('youtube:deviceCode', async () => {
    if (slowNextDeviceCode) { slowNextDeviceCode = false; await delay(350); }
    return { ok: true, data: { user_code: 'ABCD-EFGH', verification_url: 'https://www.google.com/device', expires_in: 1800 } };
  });
  ipcMain.handle('youtube:poll', async () => {
    await delay(700);
    return { ok: true, data: { userName: 'MockYT' } };
  });
  ipcMain.handle('youtube:cancel', async () => { deviceCancelCount++; return { ok: true }; });
  ipcMain.handle('clipboard:write', async (_e, value) => { copiedCode = value; return true; });
  const ytSubs = Array.from({ length: 2 }, (_, i) =>
    mkVideo(`yts${String(i).padStart(8, '0')}`.slice(0, 11).padEnd(11, 'q'), `SubVid ${i}`, 'YTChannel'));
  ipcMain.handle('youtube:browse', async (_e, bid) => (
    bid === 'FEsubscriptions' || bid === 'FEwhat_to_watch'
      ? { ok: true, data: { kind: 'youtube', browse_id: bid,
          videos: bid === 'FEwhat_to_watch' ? [mkVideo('personal123', 'PersonalVid', 'YTChannel')] : ytSubs,
          continuation: '', instance: 'youtube.com' } }
      : { ok: false, error: 'bad browse_id' }
  ));
  ipcMain.handle('queue:save', async () => ({ ok: true }));
  ipcMain.handle('models:status', async () => ({ ok: true, data: {} }));
  ipcMain.on('settings:saveSync', (e) => { e.returnValue = { ok: true }; });

  const consoleErrors = [];
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.resolve(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.on('console-message', (_e, _level, message) => {
    if (/ReferenceError|TypeError|is not defined|Uncaught/i.test(message)) {
      consoleErrors.push(message);
    }
  });
  let crashed = false;
  win.webContents.on('render-process-gone', () => { crashed = true; });

  await win.webContents.loadFile(path.resolve(__dirname, '..', 'src', 'renderer', 'index.html'));
  await delay(2500);

  assert(!crashed, 'renderer süreci çöktü');
  assert(consoleErrors.length === 0,
    `renderer boot'ta uncaught hata: ${consoleErrors.slice(0, 3).join(' | ')}`);

  const probe = await win.webContents.executeJavaScript(`(() => {
    const grid = document.getElementById('stGrid');
    // Layout ölçümü için ebeveyn zincirindeki tüm .hidden'ları aç
    // (uygulama açılışta player görünümünde değil — zincir display:none, width'ler 0)
    const browser = document.getElementById('smarttubeBrowser');
    for (let el = browser; el && el !== document.body; el = el.parentElement) {
      el.classList.remove('hidden');
      el.style.removeProperty('display');
    }
    if (grid) void grid.offsetWidth;
    const seps = grid ? [...grid.querySelectorAll('.st-section-title')] : [];
    const trendSep = seps.find((el) => /trend/i.test(el.textContent)) || null;
    const cards = grid ? [...grid.querySelectorAll(':scope > .st-card')] : [];
    const nested = grid ? grid.querySelectorAll(':scope > .st-grid').length : -1;
    const widths = cards.map((c) => c.getBoundingClientRect().width);
    return {
      api: typeof window.api === 'object' && window.api !== null,
      invidiousFeed: typeof window.api?.invidiousFeed === 'function',
      stGrid: !!grid,
      smarttube: !!document.getElementById('smarttubeBrowser'),
      renderSection: typeof renderSmartTubeSection === 'function',
      fetchFeed: typeof fetchInvidiousFeed === 'function',
      initSmartTube: typeof initSmartTube === 'function',
      cardRenderer: typeof buildSmartTubeCard === 'function',
      loginModal: !!document.getElementById('invidiousLoginModal'),
      // Feed gerçekten DOM'a bastı mı?
      cardCount: cards.length,
      minCardWidth: widths.length ? Math.min(...widths) : 0,
      // Layout regresyonu: ayrac tam satır, iç içe .st-grid yok
      // (st-grid-row sınıfı veya inline style — computed ile doğrula)
      trendSep: !!trendSep,
      sepFullRow: trendSep ? getComputedStyle(trendSep).gridColumn === '1 / -1' : false,
      noNestedGrid: nested === 0,
    };
  })()`, true);

  if (process.env.SMARTTUBE_SCREENSHOT) {
    const fs = require('node:fs');
    await win.webContents.executeJavaScript("document.getElementById('playerLayer').classList.remove('hidden'); setWorkspaceMode('player'); setSmartTubeVisible(true)", true);
    win.showInactive();
    await delay(600);
    const shot = await win.webContents.capturePage();
    fs.writeFileSync(process.env.SMARTTUBE_SCREENSHOT, shot.toPNG());
  }

  const missing = Object.entries(probe).filter(([k, v]) => !v && k !== 'minCardWidth' && k !== 'cardCount').map(([k]) => k);
  assert(missing.length === 0, `SmartTube boot eksikleri: ${missing.join(', ')}`);
  assert(probe.cardCount >= 10, `feed kartları basılmadı: ${probe.cardCount}`);
  assert(probe.minCardWidth >= 180, `kartlar hücreye sıkıştı: min width ${probe.minCardWidth}`);

  // ===== Yeni SmartTube parite işlevleri — gerçek DOM'da doğrula =====
  const feat = await win.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    const grid = document.getElementById('stGrid');
    const browser = document.getElementById('smarttubeBrowser');
    for (let el = browser; el && el !== document.body; el = el.parentElement) {
      el.classList.remove('hidden');
      el.style.removeProperty('display');
    }

    // 1) Trend chip'leri — bölüme girince 5 chip, tıklayınca tab'lı istek
    renderSmartTubeSection('trending');
    await sleep(400);
    const chips = [...grid.querySelectorAll('.st-chip')];
    out.chipCount = chips.length;
    out.chipActive = chips.filter((c) => c.classList.contains('is-active')).length;
    const musicChip = chips.find((c) => /müzik|music/i.test(c.textContent));
    if (musicChip) musicChip.click();
    await sleep(400);
    out.musicTabLoaded = grid.textContent.includes('MusicHit');
    out.chipActiveAfterClick = [...grid.querySelectorAll('.st-chip.is-active')].length;

    // 2) Degraded statü — 'news' tab'ı mock'ta degraded döner
    const newsChip = [...grid.querySelectorAll('.st-chip')].find((c) => /haber|news/i.test(c.textContent));
    if (newsChip) newsChip.click();
    await sleep(400);
    const status = document.getElementById('stStatusLine');
    out.degradedStatus = status && /yedek|fallback/i.test(status.textContent);

    // 3) Roving grid nav — ArrowRight sonraki karta odaklar
    const cards = [...grid.querySelectorAll('.st-card')];
    if (cards.length >= 2) {
      cards[0].focus();
      cards[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      out.rovingRight = document.activeElement === cards[1];
      cards[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      out.rovingEnd = document.activeElement === cards[cards.length - 1];
    }

    // 4) Up Next + yorumlar — mock probe context'i
    // (production'da probe handler player.ytInfo'yu AYNI nesneyle kurar;
    //  loadStComments'in stale koruması buna bakar)
    const fakeInfo = {
      videoId: 'abc12345678', id: 'abc12345678', title: 't',
      instance: 'https://mock.invidious.local',
      recommended: [{ videoId: 'rec12345678', title: 'Rec Video', author: 'RecCh',
                      videoThumbnails: [], lengthSeconds: 61 }],
    };
    player.ytInfo = fakeInfo;
    refreshSmartTubePlayerContext(fakeInfo);
    await sleep(400);
    out.upNextBtn = !document.getElementById('playerUpNextBtn').classList.contains('hidden');
    out.upNextItems = document.getElementById('stUpNextList').children.length;
    const comments = document.getElementById('stCommentsList');
    out.commentCount = comments.querySelectorAll('.st-comment').length;
    out.commentNoHtml = !comments.querySelector('.st-comment b');   // textContent ile basıldı

    // 5) Kanal sayfası — iç içe grid yok, başlık tam satır
    await openInvidiousChannelPage('UCmock');
    await sleep(300);
    const head = grid.querySelector('.st-channel-head');
    // st-grid-row sınıfı veya inline style — computed ile doğrula
    out.channelHead = !!head && getComputedStyle(head).gridColumn === '1 / -1';
    out.channelNoNested = grid.querySelectorAll(':scope > .st-grid').length === 0;
    out.channelCards = grid.querySelectorAll(':scope > .st-card').length;

    // 6) Kırpık ipucu — hint rect'i stage içinde kalmalı
    const hint = document.getElementById('subHiddenHint');
    const stage = document.getElementById('playerStage');
    hint.classList.remove('hidden');
    const hr = hint.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    out.hintInStage = hr.right <= sr.right + 1 && hr.bottom <= sr.bottom + 1 && hr.width > 0;
    hint.classList.add('hidden');

    // 7) YouTube OAuth — girişli durumda subscriptions gerçek YouTube verisi
    out.ytModal = !!document.getElementById('youtubeLoginModal');
    youtubeLoggedIn = true;
    youtubeUserName = 'MockYT';
    refreshYoutubeAuthUI();
    out.ytLoginHidden = document.getElementById('stYtLoginBtn').classList.contains('hidden');
    out.ytLogoutVisible = !document.getElementById('stYtLogoutBtn').classList.contains('hidden');
    await renderSmartTubeSection('subscriptions');
    await sleep(400);
    out.ytSubsRendered = grid.textContent.includes('SubVid');
    out.ytStatus = /YouTube/.test(document.getElementById('stStatusLine').textContent);
    await renderSmartTubeSection('home');
    out.ytHomeRendered = grid.textContent.includes('PersonalVid');
    out.ytHomeLabel = /For you|Senin için/.test(document.getElementById('stSectionTitle').textContent);
    // Oynatıcı panelindeki OAuth düğmesi/durumu aynı oturumla senkron kalmalı.
    const pBtn = document.getElementById('playerYtOAuthBtn');
    const pStatus = document.getElementById('playerYtOAuthStatus');
    out.ytPlayerBtnSynced = !!pBtn && !!pStatus
      && !pStatus.classList.contains('hidden')
      && pStatus.textContent.includes('MockYT');
    youtubeLoggedIn = false;
    youtubeUserName = '';
    refreshYoutubeAuthUI();
    out.ytLogoutCleanup = document.getElementById('stYtLogoutBtn').classList.contains('hidden');
    out.ytPlayerCleanup = !!pStatus && pStatus.classList.contains('hidden')
      && !!pBtn && pBtn.textContent.length > 0;
    return out;
  })()`, true);

  const failed = Object.entries(feat).filter(([, v]) => !v && typeof v === 'boolean').map(([k]) => k);
  assert(feat.chipCount === 5, `trend chip sayısı: ${feat.chipCount}`);
  assert(feat.musicTabLoaded, 'music chip tıklaması tab=music içeriğini getirmedi');
  assert(feat.chipActiveAfterClick === 1, `aktif chip: ${feat.chipActiveAfterClick}`);
  assert(feat.degradedStatus === true, 'degraded statü satırı gösterilmedi');
  assert(feat.rovingRight === true, 'ArrowRight sonraki karta odaklamadı');
  assert(feat.rovingEnd === true, 'End son karta odaklamadı');
  assert(feat.upNextBtn === true, 'up-next düğmesi görünmedi');
  assert(feat.upNextItems >= 1, `up-next öğe: ${feat.upNextItems}`);
  assert(feat.commentCount >= 2, `yorum sayısı: ${feat.commentCount}`);
  assert(feat.commentNoHtml === true, 'yorum HTML ile basıldı');
  assert(feat.channelHead === true, 'kanal başlığı tam satır değil');
  assert(feat.channelNoNested === true, 'kanal sayfasında iç içe grid var');
  assert(feat.channelCards >= 3, `kanal kartları: ${feat.channelCards}`);
  assert(feat.hintInStage === true, 'subHiddenHint stage sınırları dışında/kırpık');
  assert(feat.ytModal === true, 'youtubeLoginModal yok');
  assert(feat.ytLoginHidden === true, 'girişliyken stYtLoginBtn gizlenmedi');
  assert(feat.ytLogoutVisible === true, 'girişliyken stYtLogoutBtn görünmedi');
  assert(feat.ytSubsRendered === true, 'YouTube abonelik kartları basılmadı');
  assert(feat.ytHomeRendered === true && feat.ytHomeLabel === true, 'girişli YouTube kişisel ana akışı basılmadı');
  assert(feat.ytStatus === true, 'YouTube statü satırı gösterilmedi');
  assert(feat.ytLogoutCleanup === true, 'çıkışta stYtLogoutBtn gizlenmedi');
  assert(feat.ytPlayerBtnSynced === true, 'oynatıcı paneli OAuth durumu senkron değil');
  assert(feat.ytPlayerCleanup === true, 'çıkışta oynatıcı OAuth durumu temizlenmedi');
  assert(failed.length === 0, `özellik probları: ${failed.join(', ')}`);

  // Kayıtlı istemciyle giriş formu tekrar gösterilmeden cihaz koduna geçmeli.
  await win.webContents.executeJavaScript('openYoutubeLogin()', true);
  await delay(250);
  const deviceFlow = await win.webContents.executeJavaScript(`(() => {
    const dlg = document.getElementById('youtubeLoginModal');
    const code = document.getElementById('ytUserCode');
    const view = document.getElementById('ytDeviceView');
    const client = document.getElementById('ytClientView');
    document.getElementById('ytCopyCode').click();
    return {
      modalOpen: !dlg.classList.contains('hidden'),
      deviceVisible: !view.classList.contains('hidden'),
      clientHidden: client.classList.contains('hidden'),
      code: code.textContent,
    };
  })()`, true);
  await delay(100);
  assert(deviceFlow.modalOpen && deviceFlow.deviceVisible && deviceFlow.clientHidden,
    'kayıtlı istemci doğrudan cihaz kodu ekranına geçmedi');
  assert(deviceFlow.code === 'ABCD-EFGH', `yanlış cihaz kodu: ${deviceFlow.code}`);
  assert(copiedCode === 'ABCD-EFGH', 'cihaz kodu panoya kopyalanmadı');
  await delay(800);
  const loggedAfterPoll = await win.webContents.executeJavaScript(`(() => ({
    logged: youtubeLoggedIn,
    modalClosed: document.getElementById('youtubeLoginModal').classList.contains('hidden'),
    account: youtubeUserName,
  }))()`, true);
  assert(loggedAfterPoll.logged && loggedAfterPoll.modalClosed && loggedAfterPoll.account === 'MockYT',
    'cihaz onayı sonrası YouTube oturumu arayüze yansımadı');

  // İlk kod isteği geç döndüğünde eski kuşak, yeni kuşağın poll'unu iptal etmemeli.
  slowNextDeviceCode = true;
  await win.webContents.executeJavaScript('youtubeLoggedIn = false; refreshYoutubeAuthUI(); openYoutubeLogin()', true);
  await delay(70);
  await win.webContents.executeJavaScript('closeYoutubeLogin(); openYoutubeLogin()', true);
  await delay(450);
  const raceView = await win.webContents.executeJavaScript(`(() => ({
    code: document.getElementById('ytUserCode').textContent,
    visible: !document.getElementById('ytDeviceView').classList.contains('hidden'),
  }))()`, true);
  assert(raceView.visible && raceView.code === 'ABCD-EFGH', 'yeni cihaz kodu eski kuşakta kayboldu');
  assert(deviceCancelCount === 1, `bayat cihaz kodu yeni akışı iptal etti: ${deviceCancelCount}`);
  await win.webContents.executeJavaScript('closeYoutubeLogin()', true);

  win.close();
  console.log(JSON.stringify({ ok: true, probe, feat, deviceFlow, loggedAfterPoll }));
}

app.whenReady().then(main).then(() => app.quit()).catch(error => {
  console.error(error);
  app.exit(1);
});
