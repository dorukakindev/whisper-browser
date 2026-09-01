const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  canonicalMediaIdentity,
  normalizeBrowserUrl,
} = require('../src/browser-media-identity');
const {
  browserEventMatches,
  createBrowserEventEnvelope,
  nextAcquisitionId,
} = require('../src/browser-event-envelope');
const {
  BROWSER_SESSION_VERSION,
  normalizeBrowserSession,
  readBrowserSession,
  writeBrowserSessionAtomic,
} = require('../src/browser-session-store');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test('hassas ve takip parametreleri kanonik URL’den çıkarılır', () => {
  const url = normalizeBrowserUrl('https://Example.com/watch/42/?utm_source=x&token=SECRET&lang=en#part');
  assert.equal(url, 'https://example.com/watch/42?lang=en');
  assert(!url.includes('SECRET'));
});

test('YouTube URL biçimleri aynı medya kimliğine birleşir', () => {
  const a = canonicalMediaIdentity('https://www.youtube.com/watch?v=abc123&utm_source=test');
  const b = canonicalMediaIdentity('https://youtu.be/abc123?t=30');
  assert.equal(a.key, 'youtube:abc123');
  assert.equal(b.key, 'youtube:abc123');
});

test('bilinmeyen web adresi sabit ve hassas olmayan hash kimliği alır', () => {
  const a = canonicalMediaIdentity('https://media.example/show/1?token=a&lang=en');
  const b = canonicalMediaIdentity('https://media.example/show/1?lang=en&token=b');
  assert.equal(a.key, b.key);
  assert.match(a.key, /^web:url:[a-f0-9]{24}$/);
  assert(!a.canonicalUrl.includes('token='));
});

test('olay zarfı tab, nesil, medya ve edinme kimliğini birlikte kapılar', () => {
  const context = { tabId: 'tab-1', generation: 4, mediaId: 'youtube:a', acquisitionId: 'cap-1' };
  const event = createBrowserEventEnvelope('subtitle-found', context, { count: 2 }, 123);
  assert(browserEventMatches(event, context, { requireMediaId: true, requireAcquisitionId: true }));
  assert(!browserEventMatches(event, { ...context, generation: 5 }));
  assert(!browserEventMatches(event, { ...context, mediaId: 'youtube:b' }));
  assert(!browserEventMatches(event, { ...context, acquisitionId: 'cap-2' }));
  assert.equal(event.at, 123);
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
    secret: 'LEAK',
    tabs: [{
      id: 't1',
      url: 'https://www.netflix.com/watch/81234567?token=LEAK&utm_source=x',
      title: 'Film',
      position: 90,
      duration: 100,
      rate: 99,
      volume: -4,
      requestHeaders: { Authorization: 'Bearer LEAK' },
      trackRefs: [{ id: 'source', role: 'source', language: 'EN' }],
    }],
  });
  assert.equal(session.version, BROWSER_SESSION_VERSION);
  assert.equal(session.activeTabId, 't1');
  assert.equal(session.tabs[0].mediaId, 'netflix:81234567');
  assert.equal(session.tabs[0].rate, 4);
  assert.equal(session.tabs[0].volume, 0);
  assert.equal(session.tabs[0].trackRefs[0].language, 'en');
  const serialized = JSON.stringify(session);
  assert(!serialized.includes('LEAK'));
  assert(!serialized.includes('requestHeaders'));
});

test('oturum atomik yazılır, okunur ve önceki sürüm yedeklenir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-browser-session-'));
  const file = path.join(dir, 'browser-session.json');
  try {
    let result = writeBrowserSessionAtomic(file, {
      activeTabId: 'one',
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
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ana süreç oturumu açılışta geri yükler ve kapanmadan önce yazar', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(main, /restoreBrowserSessionState\(\);\s*\r?\n\s*createWindow\(\)/);
  assert.match(main, /persistBrowserSessionNow\(\);[\s\S]*cookies\.flushStore/);
  assert.match(main, /ipcMain\.handle\('browser:session:updateTab'/);
  assert.match(preload, /updateBrowserSessionTab/);
});

test('kalıcı sekme özeti konum, hız, medya ve iz referanslarını taşır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const snapshot = main.slice(main.indexOf('function browserTabSnapshot'), main.indexOf('function browserTabsSnapshot'));
  for (const field of ['mediaId', 'position', 'duration', 'rate', 'volume', 'offset', 'trackRefs', 'resumePending']) {
    assert(snapshot.includes(field), `eksik alan: ${field}`);
  }
});

console.log(`browser-foundation: ${passed} test`);
