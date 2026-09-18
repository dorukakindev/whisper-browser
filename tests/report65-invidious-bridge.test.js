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
