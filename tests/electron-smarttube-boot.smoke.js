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
  // Mock Invidious IPC — gerçek handler'lar bu bare-window'da kayıtlı değil.
  const popular = Array.from({ length: 6 }, (_, i) => mkVideo(`pop${String(i).padStart(8, '0')}`.slice(0, 11).padEnd(11, 'x'), `Popular ${i}`, 'PopChannel'));
  const trending = Array.from({ length: 4 }, (_, i) => mkVideo(`trd${String(i).padStart(8, '0')}`.slice(0, 11).padEnd(11, 'y'), `Trending ${i}`, 'TrendChannel'));
  ipcMain.handle('invidious:feed', async (_e, kind) => ({
    ok: true,
    data: { instance: 'https://mock.invidious.local', videos: kind === 'trending' ? trending : popular },
  }));
  ipcMain.handle('invidious:session', async () => ({ ok: true, data: { loggedIn: false } }));
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
      trendSep: !!trendSep,
      sepFullRow: trendSep ? trendSep.style.gridColumn === '1 / -1' : false,
      noNestedGrid: nested === 0,
    };
  })()`, true);

  const missing = Object.entries(probe).filter(([k, v]) => !v && k !== 'minCardWidth' && k !== 'cardCount').map(([k]) => k);
  assert(missing.length === 0, `SmartTube boot eksikleri: ${missing.join(', ')}`);
  assert(probe.cardCount >= 10, `feed kartları basılmadı: ${probe.cardCount}`);
  assert(probe.minCardWidth >= 180, `kartlar hücreye sıkıştı: min width ${probe.minCardWidth}`);

  win.close();
  console.log(JSON.stringify({ ok: true, probe }));
}

app.whenReady().then(main).then(() => app.quit()).catch(error => {
  console.error(error);
  app.exit(1);
});
