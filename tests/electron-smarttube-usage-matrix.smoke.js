'use strict';

// Gece denetimi A-matrisi: electron-smarttube-boot'un kapsamadığı hücreler.
//  1) Klavye çapraz-tetik: yazar düğmesi Enter/Space → yalnız kanal IPC;
//     kart Enter/Space → oynatma probe'u (kanal IPC YOK); ArrowRight → yalnız odak.
//  2) Kart open sonrası probe hatası → SmartTube overlay'i geri açılır (F-7).
//  3) 'subscriptions' YouTube-browse hatası boş grid yerine showError+retry.
//  4) 'home' besleme hatası boş grid yerine showError+retry.
//  5) Gerçek yeniden başlatma: stPlayQueue ayrı electron sürecinde korunur
//     (phase=write / phase=verify).

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

function registerMockIpc(counters) {
  const popular = Array.from({ length: 4 }, (_, i) => mkVideo(`pop${String(i).padEnd(8, '0')}`.slice(0, 11).padEnd(11, 'x'), `Popular ${i}`, 'PopChannel'));
  const trending = Array.from({ length: 3 }, (_, i) => mkVideo(`trd${String(i).padEnd(8, '0')}`.slice(0, 11).padEnd(11, 'y'), `Trending ${i}`, 'TrendChannel'));
  ipcMain.handle('invidious:feed', async (_e, kind) => {
    counters.feed += 1;
    if (counters.failFeed) return { ok: false, error: counters.failFeed };
    if (kind === 'home') {
      return { ok: true, data: { instance: 'https://mock.invidious.local', popular: { videos: popular }, trending: { videos: trending } } };
    }
    return { ok: true, data: { instance: 'https://mock.invidious.local', videos: popular } };
  });
  ipcMain.handle('invidious:channel', async () => { counters.channel += 1; return { ok: true, data: { author: 'MockChannel', videos: popular.slice(0, 2) } }; });
  ipcMain.handle('invidious:search', async () => ({ ok: true, data: { videos: popular.slice(0, 2) } }));
  // media:probe — kart open()'ın tetiklediği video-bilgi probe'u (ytdlp kaynağı).
  ipcMain.handle('media:probe', async () => { counters.probe += 1; return { ok: false, error: 'mock probe unavailable' }; });
  ipcMain.handle('youtube:browse', async (_e, bid) => {
    counters.browse += 1;
    if (counters.failBrowse) return { ok: false, error: counters.failBrowse };
    return { ok: true, data: { videos: popular.slice(0, 2) } };
  });
  ipcMain.handle('queue:save', async () => ({ ok: true }));
  ipcMain.handle('queue:load', async () => ({ ok: true, data: null }));
  ipcMain.on('queue:saveSync', (event) => { event.returnValue = { ok: true }; });
  ipcMain.handle('youtube:session', async () => ({ ok: true, data: { logged: false } }));
  ipcMain.handle('invidious:subscriptions', async () => ({ ok: false, error: 'HTTP 401 login' }));
}

async function openWindow() {
  const win = new BrowserWindow({
    // Gizli pencerede document focus olmaz (HTMLElement.focus() no-op) —
    // klavye/odak matrisi için pencereyi görünür açıyoruz (DISPLAY=:0 şartı).
    show: true, width: 1280, height: 800,
    webPreferences: {
      preload: path.resolve(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  await win.webContents.loadFile(path.resolve(__dirname, '..', 'src', 'renderer', 'index.html'));
  await delay(2200);
  return win;
}

async function main() {
  const phase = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1] || 'all';

  if (phase === 'verify') {
    const win = await openWindow();
    const queue = await win.webContents.executeJavaScript(`localStorage.getItem('stPlayQueue')`, true);
    assert(queue && JSON.parse(queue).length === 2,
      `restart sonrası stPlayQueue korunmadı: ${queue}`);
    console.log('A-matrix verify: restart sonrası oynatma kuyruğu localStorage\'da korundu — PASS');
    win.close();
    app.quit();
    return;
  }

  const counters = { feed: 0, channel: 0, browse: 0, probe: 0, failFeed: false, failBrowse: false };
  registerMockIpc(counters);
  const win = await openWindow();
  // Gizli pencerede document.hasFocus() false'tur ve HTMLElement.focus() no-op
  // olur — main tarafta webContents focus vererek klavye/odak testlerini aç.
  win.webContents.focus();

  // --- 1) Klavye çapraz-tetik matrisi -------------------------------------
  // SmartTube overlay'i #playerLayer içinde yaşar — katman açılmadan grid
  // 0×0 kalır ve kartlar content-visibility ile render atlanır (odak no-op).
  // Gerçek akış: openPlayer() katmanı açar, medya yoksa showHomeWhenNoVideo
  // ana sayfayı çizer. Önceki fazdan kalan stPlayQueue kuyruk rayı kart
  // seçicilerini bozmasın diye temizlenir.
  await win.webContents.executeJavaScript(
    `localStorage.removeItem('stPlayQueue'); stQueue = []; openPlayer();`, true);
  await win.webContents.executeJavaScript('renderSmartTubeSection(\'home\')', true);
  await delay(600);
  const elems = await win.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('#stGrid .st-card');
    const author = card && card.querySelector('.st-card-author');
    return { hasCard: !!card, hasAuthor: !!author };
  })()`, true);
  assert(elems.hasCard && elems.hasAuthor, 'kart/yazar öğesi basılmadı');

  // Yazar düğmesi: Enter + Space → yalnız kanal sayfası, probe tetiklenmez.
  await win.webContents.executeJavaScript(`(() => {
    const author = document.querySelector('#stGrid .st-card .st-card-author');
    const fire = (key) => author.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fire('Enter'); fire(' ');
  })()`, true);
  await delay(700);
  assert(counters.channel === 2, `yazar Enter+Space 2 kanal çağrısı üretmeli: ${counters.channel}`);
  assert(counters.probe === 0, `yazar tuşları probe tetiklememeli: ${counters.probe}`);

  // Kart Enter → probe 1 kez; overlay önce kapanır, probe hatasında geri açılır.
  const cardEnter = await win.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('#stGrid .st-card');
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return {
      url: document.getElementById('playerYtUrl').value,
      autoOpen: !!player.pendingAutoOpen,
      stHidden: document.getElementById('smarttubeBrowser').classList.contains('hidden'),
    };
  })()`, true);
  assert(/watch\?v=pop/.test(cardEnter.url), `kart Enter URL yazmadı: ${cardEnter.url}`);
  assert(cardEnter.stHidden === true, 'kart Enter sonrası SmartTube kapanmadı');
  await delay(900);
  const afterProbe = await win.webContents.executeJavaScript(`(() => ({
    stHidden: document.getElementById('smarttubeBrowser').classList.contains('hidden'),
    autoOpen: !!player.pendingAutoOpen,
  }))()`, true);
  assert(counters.probe === 1, `kart Enter bir probe tetiklemeli: ${counters.probe}`);
  assert(afterProbe.autoOpen === false, 'probe hatasında pendingAutoOpen silahlanmış kaldı');
  assert(afterProbe.stHidden === false, 'probe hatası SmartTube\'u geri açmadı (siyah sahne)');

  // Kart Space → ikinci probe; yazar tuşlarıyla kanal çağrısı artmadı.
  await win.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('#stGrid .st-card');
    card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  })()`, true);
  await delay(900);
  assert(counters.probe === 2, `kart Space ikinci probe üretmeli: ${counters.probe}`);
  assert(counters.channel === 2, `kart tuşları kanal açmamalı: ${counters.channel}`);

  // ArrowRight → yalnız odak taşır; IPC yok. Grid async yeniden çizilebildiği
  // için sorgu+odak+dispatch tek atomik evaluate içinde.
  const nav = await win.webContents.executeJavaScript(`(() => {
    const grid = document.getElementById('stGrid');
    const cards = [...grid.querySelectorAll('.st-card')];
    if (cards.length < 2) return { n: cards.length };
    const c0 = cards[0];
    c0.focus();
    const focused = document.activeElement === c0;
    c0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    return { n: cards.length, focused, moved: document.activeElement === cards[1] };
  })()`, true);
  assert(nav.n >= 2, `roving için yeterli kart yok: ${nav.n}`);
  assert(nav.focused, 'kart odaklanamadı');
  assert(nav.moved, 'ArrowRight sonraki karta odaklamadı');
  await delay(300);
  assert(counters.probe === 2 && counters.channel === 2, 'ok tuşu IPC tetikledi');
  console.log('A-matrix: klavye çapraz-tetik yok (yazar→kanal×2, kart→probe×2, ok→odak) + probe hatasında overlay geri açıldı — PASS');

  // --- 2) subscriptions YouTube hatası → showError+retry -------------------
  counters.failBrowse = 'HTTP 500 mock';
  await win.webContents.executeJavaScript('youtubeLoggedIn = true; renderSmartTubeSection(\'subscriptions\')', true);
  await delay(600);
  const subsErr = await win.webContents.executeJavaScript(`(() => {
    const grid = document.getElementById('stGrid');
    const btns = [...grid.querySelectorAll('button')].map(b => b.textContent);
    return { text: grid.textContent, retry: btns.some(t => /Tekrar dene|Try again/i.test(t)) };
  })()`, true);
  assert(/500/.test(subsErr.text), `abonelik hatası görünür değil: ${subsErr.text.slice(0, 80)}`);
  assert(subsErr.retry, 'abonelik hata durumunda Tekrar dene yok');
  console.log('A-matrix: YouTube abonelik 500 hatası → hata+retry — PASS');

  // --- 3) home besleme hatası → showError+retry + retry sonrası iyileşme ---
  // force: true — aksi halde INV_FEED_CACHE_MS içindeki cache'ten servis
  // edilir ve mock hiç çağrılmaz.
  counters.failFeed = 'mock feed unavailable';
  await win.webContents.executeJavaScript('renderSmartTubeSection(\'home\', { force: true })', true);
  await delay(600);
  const homeErr = await win.webContents.executeJavaScript(`(() => {
    const grid = document.getElementById('stGrid');
    const btns = [...grid.querySelectorAll('button')].map(b => b.textContent);
    return { text: grid.textContent, retry: btns.some(t => /Tekrar dene|Try again/i.test(t)) };
  })()`, true);
  assert(/mock feed unavailable|Hata|hata/i.test(homeErr.text), `home hatası görünür değil: ${homeErr.text.slice(0, 80)}`);
  assert(homeErr.retry, 'home hata durumunda Tekrar dene yok');
  // Retry gerçekten iyileşiyor mu? Bayrağı kaldırıp aynı yoldan tekrar dene.
  counters.failFeed = false;
  await win.webContents.executeJavaScript('renderSmartTubeSection(\'home\', { force: true })', true);
  await delay(600);
  const homeOk = await win.webContents.executeJavaScript(
    `document.querySelectorAll('#stGrid .st-card').length`, true);
  assert(homeOk > 0, 'feed hatası sonrası retry kartları geri getirmedi');
  console.log('A-matrix: home besleme hatası → hata+retry ve retry sonrası iyileşme — PASS');

  // --- 3b) HTTP durum matrisi: 401 giriş ipucu; 403/429/offline ham hata ---
  // 'trending' bölümü home'un aksine showError'a düşer — sınıf ayrımı burada
  // test edilir.
  const statusCases = [
    { err: 'HTTP 401 login required', want: /Oturum aç|Sign in/i, name: '401→giriş ipucu' },
    { err: 'HTTP 403 forbidden', want: /403/, name: '403→ham hata' },
    { err: 'HTTP 429 rate limited', want: /429/, name: '429→ham hata' },
    { err: 'ENOTFOUND offline', want: /ENOTFOUND/, name: 'offline→ham hata' },
  ];
  for (const c of statusCases) {
    counters.failFeed = c.err;
    await win.webContents.executeJavaScript('renderSmartTubeSection(\'trending\', { force: true })', true);
    await delay(600);
    const cell = await win.webContents.executeJavaScript(`(() => {
      const grid = document.getElementById('stGrid');
      const btns = [...grid.querySelectorAll('button')].map(b => b.textContent);
      return { text: grid.textContent, retry: btns.some(t => /Tekrar dene|Try again/i.test(t)) };
    })()`, true);
    assert(c.want.test(cell.text), `${c.name}: beklenen durum görünür değil — "${cell.text.slice(0, 90)}"`);
    assert(cell.retry, `${c.name}: Tekrar dene yok`);
  }
  counters.failFeed = false;
  console.log('A-matrix: 401→giriş ipucu, 403/429/offline→ham hata+retry — PASS');

  // --- 4) Gerçek restart kalıcılığı (phase=write) --------------------------
  if (phase === 'write') {
    await win.webContents.executeJavaScript(`localStorage.setItem('stPlayQueue',
      JSON.stringify([{ videoId: 'persist1', title: 'Kalıcı 1' }, { videoId: 'persist2', title: 'Kalıcı 2' }]))`, true);
    console.log('A-matrix write: stPlayQueue yazıldı — phase=verify ile yeniden başlatın');
  }

  win.close();
  app.quit();
}

app.whenReady().then(main).catch((error) => {
  console.error('A-matrix smoke hatası:', error && error.stack || error);
  app.exit(1);
});
