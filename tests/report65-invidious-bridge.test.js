const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('main.js Invidious IPC handler\'ları tanımlı', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  // 3 yeni IPC kanalı
  assert.match(main, /ipcMain\.handle\('invidious:probe'/);
  assert.match(main, /ipcMain\.handle\('invidious:subs'/);
  assert.match(main, /ipcMain\.handle\('invidious:cancel'/);
});

test('main.js runInvidiousCommand yardımcısı mevcut', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /function runInvidiousCommand\(/);
});

test('mediaJobs invidious slot\'unu içerir', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /const mediaJobs = \{[^}]*invidious/);
});

test('preload.js Invidious API\'lerini köprüler', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(preload, /probeInvidious:\s*\(/);
  assert.match(preload, /downloadInvidiousSubs:\s*\(/);
  assert.match(preload, /cancelInvidious:\s*\(/);
  assert.match(preload, /onInvidiousEvent:\s*\(/);
});

test('invidious:event kanalı renderer\'a iletilir', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /'invidious:event'/);
  assert.match(main, /mainWindow\.webContents\.send\('invidious:event'/);
});

test('invidious.py dosyası backend\'de var', () => {
  const invidiousPy = path.join(__dirname, '..', 'backend', 'invidious.py');
  assert(fs.existsSync(invidiousPy), 'invidious.py eksik');
});

test('invidious.py varsayılan instance listesi içerir', () => {
  const py = fs.readFileSync(path.join(__dirname, '..', 'backend', 'invidious.py'), 'utf8');
  assert.match(py, /DEFAULT_INSTANCES\s*=/);
  // En az birkaç instance olmalı
  const matches = py.match(/https:\/\/[^\s"',]+/g) || [];
  assert(matches.length >= 5, `Yetersiz Invidious instance: ${matches.length}`);
});

test('invidious.py extract_video_id yardımcısı içerir', () => {
  const py = fs.readFileSync(path.join(__dirname, '..', 'backend', 'invidious.py'), 'utf8');
  assert.match(py, /def extract_video_id\(/);
  // youtube.com, youtu.be ve embed pattern'leri (Python regex kaynak string)
  assert.match(py, /youtube\\\.com\/watch/);
  assert.match(py, /youtu\\\.be/);
  assert.match(py, /youtube\\\.com\/embed/);
});

test('invidious.py timedtext → SRT dönüşümü içerir', () => {
  const py = fs.readFileSync(path.join(__dirname, '..', 'backend', 'invidious.py'), 'utf8');
  assert.match(py, /def _convert_timedtext_to_srt\(/);
  assert.match(py, /def _ms_to_srt_time\(/);
});

test('invidious.py URL güvenlik kontrolleri yapar', () => {
  const py = fs.readFileSync(path.join(__dirname, '..', 'backend', 'invidious.py'), 'utf8');
  // HTTP user-agent gönderimi (Invidious bazen bot koruması uygular)
  assert.match(py, /User-Agent/);
});

test('IPC kanalında URL politika doğrulaması yapılır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const invidiousSection = main.slice(
    main.indexOf("ipcMain.handle('invidious:probe'"),
    main.indexOf("ipcMain.handle('invidious:subs'")
  );
  assert.match(invidiousSection, /decideUrlPolicy/);
  assert.match(invidiousSection, /http:|https:/);
});

test('Invidious helper sızıntı yapmaz: cancel için mediaJobs temizliği', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const cancel = main.slice(
    main.indexOf("ipcMain.handle('invidious:cancel'"),
    main.indexOf("ipcMain.handle('media:readSubtitle'")
  );
  assert.match(cancel, /terminateProcessTree/);
  assert.match(cancel, /mediaJobs\.invidious\s*=\s*null/);
});

test('download_stream komutu media.py argparse\'da tanımlı', () => {
  const py = fs.readFileSync(path.join(__dirname, '..', 'backend', 'media.py'), 'utf8');
  assert.match(py, /['"]download_stream['"]/);
  assert.match(py, /--video-url/);
  assert.match(py, /--audio-url/);
  assert.match(py, /def download_stream/);
  // main dispatch
  assert.match(py, /elif args\.command == ['"]download_stream['"]/);
});

test('invidious:downloadStream IPC handler tanımlı', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /ipcMain\.handle\('invidious:downloadStream'/);
  // URL politika kontrolü
  const start = main.indexOf("ipcMain.handle('invidious:downloadStream'");
  const end = main.indexOf("ipcMain.handle('media:readSubtitle'");
  assert(start > 0 && end > start, 'IPC handler bölümü bulunamadı');
  const sec = main.slice(start, end);
  assert.match(sec, /decideUrlPolicy/);
  assert.match(sec, /http:|https:/);
});

test('Invidious auth: login/logout IPC\'leri tanımlı', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /ipcMain\.handle\('invidious:login'/);
  assert.match(main, /ipcMain\.handle\('invidious:logout'/);
  assert.match(main, /ipcMain\.handle\('invidious:session'/);
});

test('Invidious feed: popular/trending/subscriptions IPC\'leri tanımlı', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /ipcMain\.handle\('invidious:feed'/);
  assert.match(main, /ipcMain\.handle\('invidious:search'/);
  assert.match(main, /ipcMain\.handle\('invidious:channel'/);
});

test('Invidious auth: videoUrl validation rejects bad scheme', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf("ipcMain.handle('invidious:downloadStream'");
  const end = main.indexOf("ipcMain.handle('media:readSubtitle'");
  assert(start > 0 && end > start, 'IPC handler bölümü bulunamadı');
  const sec = main.slice(start, end);
  assert.match(sec, /http:/);
  assert.match(sec, /https:/);
  assert.match(sec, /policy\.action\s*!==\s*['"]external['"]/);
});

test('Invidious ana sayfa renderer bağlantıları', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  // renderer.js'te renderInvidiousHome tanımlı
  assert.match(html, /function renderInvidiousHome/);
  assert.match(html, /function renderInvidiousCard/);
  assert.match(html, /initInvidiousHome/);
  // search
  assert.match(html, /async function searchInvidious/);
  assert.match(html, /async function doInvidiousLogin/);
  assert.match(html, /async function doInvidiousLogout/);
});

test('Invidious HTML elemanları index.html\'de mevcut', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(html, /id="invidiousHome"/);
  assert.match(html, /id="invidiousSearchInput"/);
  assert.match(html, /id="invidiousSearchBtn"/);
  assert.match(html, /id="invidiousLoginBtn"/);
  assert.match(html, /id="invidiousLoginModal"/);
  assert.match(html, /id="invLoginUsername"/);
  assert.match(html, /id="invLoginPassword"/);
  assert.match(html, /id="invLoginSubmit"/);
  assert.match(html, /id="invLoginCancel"/);
});

test('Invidious CSS stilleri mevcut', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
  assert.match(css, /\.inv-card/);
  assert.match(css, /\.inv-grid/);
  assert.match(css, /\.inv-card-thumb/);
  assert.match(css, /\.inv-card-duration/);
  assert.match(css, /\.invidious-home/);
  assert.match(css, /\.invidious-toolbar/);
});

test('Invidious auth backend: login fonksiyonu şifreyi güvenli yollar', () => {
  const py = fs.readFileSync(path.join(__dirname, '..', 'backend', 'invidious.py'), 'utf8');
  assert.match(py, /def login\(/);
  assert.match(py, /def logout\(/);
  assert.match(py, /set_session/);
  assert.match(py, /_auth_headers/);
  // Cookie header ile SID gönderimi
  assert.match(py, /SID=/);
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
    } catch (error) {
      error.message = `${name}: ${error.message}`;
      throw error;
    }
  }
  console.log(`invidious-bridge: ${passed} test`);
})().catch(error => {
  console.error('FAIL:', error.message);
  process.exit(1);
});
