const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  canonicalMediaIdentity,
  isAmazonHost,
  normalizeBrowserUrl,
} = require('../src/browser-media-identity');
const {
  BROWSER_IPC_VERSION,
  browserEventMatches,
  createBrowserEventEnvelope,
  nextAcquisitionId,
} = require('../src/browser-event-envelope');
const {
  BROWSER_SESSION_VERSION,
  normalizeBrowserSession,
  readBrowserSession,
  readBrowserSessionWithStatus,
  writeBrowserSessionAtomic,
} = require('../src/browser-session-store');
const { createBuiltinAdapterRegistry } = require('../src/browser-adapter-registry');

let passed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('hassas ve takip parametreleri kanonik URL’den çıkarılır', () => {
  const url = normalizeBrowserUrl('https://Example.com/watch/42/?utm_source=x&token=SECRET&apikey=A&client_secret=B&refresh_token=C&oauth_token=D&csrf=E&xsrf=F&lang=en#part');
  assert.equal(url, 'https://example.com/watch/42?lang=en');
  assert(!url.includes('SECRET'));
});

test('ana süreç tek örnek kilidi, yetkili bildirim ve izole sayfa köprüsü kullanır', () => {
  const root = path.join(__dirname, '..', 'src');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const browserPreload = fs.readFileSync(path.join(root, 'browser-preload.js'), 'utf8');
  assert.match(main, /app\.requestSingleInstanceLock\(\)/);
  assert.match(main, /app\.on\('second-instance'/);
  assert.match(main, /ipcMain\.handle\('notify', \(event, opts\)/);
  assert.match(main, /event\.sender !== mainWindow\.webContents/);
  assert.match(main, /executeJavaScriptInIsolatedWorld/);
  assert.match(main, /preload: path\.join\(__dirname, 'browser-preload\.js'\)/);
  assert.match(browserPreload, /ipcRenderer\.send\('browser:trusted-bridge'/);
  assert.doesNotMatch(main, /rawMsg\.startsWith\('__WHISPER_(?:MANGA_EDIT|BROWSER_OVERLAY_STYLE)__/);
});

test('YouTube URL biçimleri aynı medya kimliğine birleşir', () => {
  const a = canonicalMediaIdentity('https://www.youtube.com/watch?v=abc123&utm_source=test');
  const b = canonicalMediaIdentity('https://youtu.be/abc123?t=30');
  const c = canonicalMediaIdentity('https://www.youtube-nocookie.com/embed/abc123?rel=0');
  assert.equal(a.key, 'youtube:abc123');
  assert.equal(b.key, 'youtube:abc123');
  assert.equal(c.key, 'youtube:abc123');
  assert.equal(canonicalMediaIdentity('https://www.youtube.com/clip/UgkxClipToken').key,
    'youtube:clip:UgkxClipToken');
  assert.equal(canonicalMediaIdentity('https://www.youtube.com/clip/UgkxClipToken?v=fullVideo').key,
    'youtube:clip:UgkxClipToken');
  assert.equal(canonicalMediaIdentity('https://www.netflix.com/browse?jbv=81234567').key,
    'netflix:81234567');
});

test('Amazon Prime bölgesel alan adları aynı servis olarak tanınır', () => {
  const registry = createBuiltinAdapterRegistry();
  for (const host of ['amazon.com', 'amazon.co.uk', 'amazon.com.tr', 'amazon.de', 'amazon.co.jp']) {
    assert.equal(isAmazonHost(host), true, host);
    assert.equal(canonicalMediaIdentity(`https://www.${host}/gp/video/detail/ABC123`).service,
      'prime-video', host);
    assert.equal(registry.forPage(`https://www.${host}/gp/video/detail/ABC123`)?.id,
      'prime-video', `${host} adaptörü`);
  }
  assert.equal(isAmazonHost('amazon.example.com'), false);
});

test('Vimeo doğrudan paylaşım adresi sayısal video kimliğini korur', () => {
  const direct = canonicalMediaIdentity('https://vimeo.com/123456789?share=copy');
  const player = canonicalMediaIdentity('https://player.vimeo.com/video/123456789');
  assert.equal(direct.key, 'vimeo:123456789');
  assert.equal(player.key, 'vimeo:123456789');
});

test('bilinmeyen web adresi sabit ve hassas olmayan hash kimliği alır', () => {
  const a = canonicalMediaIdentity('https://media.example/show/1?token=a&lang=en');
  const b = canonicalMediaIdentity('https://media.example/show/1?lang=en&token=b');
  assert.equal(a.key, b.key);
  assert.match(a.key, /^web:url:[a-f0-9]{24}$/);
  assert(!a.canonicalUrl.includes('token='));
});

test('16 KiB üstünde aynı öneki taşıyan farklı URLler ayrı kimlik alır', () => {
  const prefix = `https://media.example/watch?id=${'a'.repeat(16400)}`;
  const first = canonicalMediaIdentity(`${prefix}AAAA`);
  const second = canonicalMediaIdentity(`${prefix}BBBB`);
  assert.notEqual(first.key, second.key);
  assert.equal(first.canonicalUrl.length, 16384);
  assert.equal(second.canonicalUrl.length, 16384);
});

test('olay zarfı tab, nesil, medya ve edinme kimliğini birlikte kapılar', () => {
  const context = { tabId: 'tab-1', generation: 4, mediaId: 'youtube:a', acquisitionId: 'cap-1' };
  const event = createBrowserEventEnvelope('subtitle-found', context, { count: 2 }, 123);
  assert(browserEventMatches(event, context, { requireMediaId: true, requireAcquisitionId: true }));
  assert(!browserEventMatches(event, { ...context, generation: 5 }));
  assert(!browserEventMatches(event, { ...context, mediaId: 'youtube:b' }));
  assert(!browserEventMatches(event, { ...context, acquisitionId: 'cap-2' }));
  assert.equal(event.at, 123);
  assert.equal(event.version, BROWSER_IPC_VERSION);
  assert(!browserEventMatches({ ...event, version: BROWSER_IPC_VERSION + 1 }, context));
});

test('tarayıcı tanısı sınırlı geçmiş, filtre ve güvenli dışa aktarma yüzeyine sahip', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  assert.match(main, /browserDiagnostics\.recent = browserDiagnostics\.recent\.slice\(0, 100\)/);
  assert.match(main, /ipcMain\.handle\('browser:diagnostics:export'/);
  assert.match(main, /operationId: tab\?\.operationId \|\| nextAcquisitionId\('diagnostics'\)/);
  assert.match(preload, /exportBrowserDiagnostics/);
  assert.match(html, /id="browserDiagnosticsFilter"/);
  assert.match(html, /id="browserDiagnosticsCopy"/);
  assert.match(html, /id="browserDiagnosticsExport"/);
  assert.match(renderer, /toLocaleLowerCase\('tr'\).*includes\(filter\)/s);
});

test('edinme kimlikleri tekrar etmez', () => {
  const first = nextAcquisitionId('web track');
  const second = nextAcquisitionId('web track');
  assert.notEqual(first, second);
  assert.match(first, /^web-track-/);
});

test('oturum şeması yalnız izinli ve sınırlı alanları saklar', () => {
  const session = normalizeBrowserSession({
    version: 99,
    activeTabId: 't1',
    cleanExit: false,
    secret: 'LEAK',
    tabs: [{
      id: 't1',
      url: 'https://www.netflix.com/watch/81234567?token=LEAK&utm_source=x',
      title: 'Film',
      position: 90,
      duration: 100,
      rate: 99,
      volume: -4,
      offset: 99,
      subtitleMode: 'translation',
      mangaPosition: { documentId: 'netflix:81234567', imageId: 'page-4', ordinal: 3, ratio: 1.8 },
      requestHeaders: { Authorization: 'Bearer LEAK' },
      trackRefs: [{ id: 'source', role: 'source', language: 'EN' }],
    }],
  });
  assert.equal(session.version, BROWSER_SESSION_VERSION);
  assert.equal(session.activeTabId, 't1');
  assert.equal(session.cleanExit, false);
  assert.equal(session.tabs[0].mediaId, 'netflix:81234567');
  assert.equal(session.tabs[0].rate, 4);
  assert.equal(session.tabs[0].volume, 0);
  assert.equal(session.tabs[0].offset, 99);
  assert.equal(normalizeBrowserSession({ tabs: [{ id: 'far', url: 'https://example.test', offset: 90000 }] })
    .tabs[0].offset, 86400);
  assert.equal(session.tabs[0].subtitleMode, 'translation');
  assert.equal(session.tabs[0].trackRefs[0].language, 'en');
  assert.equal(session.tabs[0].mangaPosition.imageId, 'page-4');
  assert.equal(session.tabs[0].mangaPosition.ratio, 1);
  const serialized = JSON.stringify(session);
  assert(!serialized.includes('LEAK'));
  assert(!serialized.includes('requestHeaders'));
});

test('oturum temiz kapanış işaretini taşır, eski sürümde bilinmiyor bırakır', () => {
  assert.equal(normalizeBrowserSession({ version: BROWSER_SESSION_VERSION, cleanExit: true, tabs: [] }).cleanExit, true);
  assert.equal(normalizeBrowserSession({ version: BROWSER_SESSION_VERSION, cleanExit: false, tabs: [] }).cleanExit, false);
  assert.equal(normalizeBrowserSession({ version: 7, tabs: [] }).cleanExit, null);
});

test('oturum SPA rotasını korurken hash içindeki gizli anahtarı siler', () => {
  const session = normalizeBrowserSession({ tabs: [
    { id: 'route', url: 'https://reader.example/#/chapter/7?page=2&token=LEAK' },
  ] });
  assert.equal(session.tabs[0].url, 'https://reader.example/#/chapter/7?page=2');
  assert(!JSON.stringify(session).includes('LEAK'));
});

test('oturum atomik yazılır, okunur ve önceki sürüm yedeklenir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-browser-session-'));
  const file = path.join(dir, 'browser-session.json');
  try {
    let result = writeBrowserSessionAtomic(file, {
      activeTabId: 'one',
      cleanExit: false,
      tabs: [{ id: 'one', url: 'https://youtu.be/first', position: 2 }],
    });
    assert(result.ok, result.error);
    result = writeBrowserSessionAtomic(file, {
      activeTabId: 'two',
      tabs: [{ id: 'two', url: 'https://youtu.be/second', position: 8 }],
    });
    assert(result.ok, result.error);
    assert(fs.existsSync(`${file}.bak`));
    const loaded = readBrowserSession(file);
    assert.equal(loaded.activeTabId, 'two');
    assert.equal(loaded.tabs[0].mediaId, 'youtube:second');
    assert.equal(loaded.tabs[0].position, 8);
    assert.equal(readBrowserSession(`${file}.bak`).cleanExit, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bozuk ana oturum dosyasında sağlam yedek kullanılır', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-browser-session-backup-'));
  const file = path.join(dir, 'browser-session.json');
  try {
    fs.writeFileSync(file, '{bozuk', 'utf8');
    fs.writeFileSync(`${file}.bak`, JSON.stringify({
      activeTabId: 'backup',
      tabs: [{ id: 'backup', url: 'https://youtu.be/recovered', position: 17 }],
    }), 'utf8');
    const loaded = readBrowserSession(file);
    assert.equal(loaded.activeTabId, 'backup');
    assert.equal(loaded.tabs[0].mediaId, 'youtube:recovered');
    assert.equal(loaded.tabs[0].position, 17);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ana ve yedek oturum birlikte bozuksa kullanıcı uyarısı üretilir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-browser-session-damaged-'));
  const file = path.join(dir, 'browser-session.json');
  try {
    fs.writeFileSync(file, '{bozuk', 'utf8');
    fs.writeFileSync(`${file}.bak`, '[]', 'utf8');
    const loaded = readBrowserSessionWithStatus(file);
    assert.equal(loaded.session.tabs.length, 0);
    assert.match(loaded.warning, /ana dosya ve yedek kullanılabilir değil/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('kısmen bozuk oturumdaki düşürülen sekmeler kullanıcıya bildirilir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-browser-session-partial-'));
  const file = path.join(dir, 'browser-session.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ tabs: [
      { id: 'ok', url: 'https://example.test/read' },
      { id: 'bad', url: 'javascript:alert(1)' },
    ] }), 'utf8');
    const loaded = readBrowserSessionWithStatus(file);
    assert.equal(loaded.session.tabs.length, 1);
    assert.equal(loaded.droppedTabs, 1);
    assert.match(loaded.warning, /1 sekme/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ana süreç oturumu açılışta geri yükler ve kapanmadan önce yazar', async () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(main, /restoreBrowserSessionState\(\);\s*\r?\n\s*createWindow\(\)/);
  assert.match(main, /Önceki tarayıcı oturumu beklenmedik biçimde sona erdi/);
  assert.match(main, /browserOrderlyShutdown = false;\s*\r?\n\s*persistBrowserSessionNow\(\)/);
  const calls = [];
  await require('../src/browser-session-privacy').shutdownBrowserSession({
    closeAllConnections: async () => calls.push('close'),
    flushStorageData: () => calls.push('storage'),
    cookies: { flushStore: async () => calls.push('cookies') },
  });
  assert.deepEqual(calls, ['close', 'storage', 'cookies']);
  const close = main.slice(main.indexOf("mainWindow.on('close'"),
    main.indexOf("mainWindow.on('closed'"));
  assert.match(close, /await flushBrowserSession\(\)/);
  const flush = main.slice(main.indexOf('async function flushBrowserSession'),
    main.indexOf('async function shutdownPersistentBrowserSession'));
  assert.match(flush, /persistBrowserSessionNow\(\)/);
  assert.match(flush, /browserOrderlyShutdown = true/);
  assert.match(close, /destroyBrowserView\(\)[\s\S]*await shutdownPersistentBrowserSession\(mainWindow\)/);
  assert.match(main, /ipcMain\.handle\('browser:session:updateTab'/);
  assert.match(main, /sessionWarning, \.\.\.browserNavigationState\(\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8'),
    /if \(result\.sessionWarning &&[\s\S]{0,220}setBrowserSignal\(result\.sessionWarning/);
  assert.match(preload, /updateBrowserSessionTab/);
  const updateTab = main.slice(main.indexOf("ipcMain.handle('browser:session:updateTab'"),
    main.indexOf("ipcMain.handle('browser:resources:snapshot'"));
  assert.match(updateTab, /const liveUrl = wc[\s\S]*url: liveUrl \|\| raw\?\.url \|\| tab\.restoredUrl/);
});

test('renderer sekme sınırını sandbox uyumlu preload köprüsünden alır', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  // Değerin oturum deposuyla eşitliği preload-sandbox.test.js içinde,
  // preload bütünüyle çalıştırılarak doğrulanır.
  assert.doesNotMatch(preload, /require\(['"]\.\.?\//);
  assert.match(preload, /browserLimits: Object\.freeze\(\{ maxTabs: MAX_SESSION_TABS \}\)/);
  assert.match(renderer, /Number\(window\.api\.browserLimits\?\.maxTabs\) \|\| 24/);
});

test('kalıcı sekme özeti konum, hız, medya, altyazı görünümü ve iz referanslarını taşır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const snapshot = main.slice(main.indexOf('function browserTabSnapshot'), main.indexOf('function browserTabsSnapshot'));
  for (const field of ['mediaId', 'position', 'duration', 'rate', 'volume', 'offset', 'subtitleMode', 'trackRefs', 'resumePending']) {
    assert(snapshot.includes(field), `eksik alan: ${field}`);
  }
});

test('kapanış finalinden sonra gecikmiş sekme timerı boş oturum yazamaz', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const persist = main.slice(main.indexOf('function persistBrowserSessionNow'),
    main.indexOf('function restoreBrowserSessionState'));
  assert.match(persist, /if \(browserSessionFinalizedForQuit\) return \{ ok: true, skipped: true \}/);
  assert.match(persist, /function scheduleBrowserSessionSave[\s\S]*if \(browserSessionFinalizedForQuit\) return/);
});

test('renderer yenilenince süren web çevirisine ana süreç snapshotından yeniden bağlanır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  assert.match(main, /translationTrackId:\s*tab\?\.translationTrackId/);
  assert.match(main, /ipcMain\.handle\('browser:translation:snapshot'/);
  assert.match(preload, /getBrowserTranslationSnapshot/);
  assert.match(renderer, /async function restoreBrowserTranslationSnapshot/);
  assert.match(renderer, /void restoreBrowserTranslationSnapshot\(tab\)/);
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
  console.log(`browser-foundation: ${passed} test`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
