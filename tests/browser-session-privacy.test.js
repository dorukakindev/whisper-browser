const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {
  SITE_DATA_TYPES,
  browserHttpOrigin,
  clearAllBrowserCookies,
  clearBrowserSiteData,
  destroyBrowserSessionWindows,
  resetBrowserSessionData,
  shutdownBrowserSession,
} = require('../src/browser-session-privacy');

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function privacySessionFake() {
  const calls = [];
  return {
    calls,
    cookies: {
      get: async () => { throw new Error('Çerez değerleri okunmamalı'); },
      flushStore: async () => { calls.push(['flushStore']); },
    },
    closeAllConnections: async () => { calls.push(['closeAllConnections']); },
    clearData: async options => { calls.push(['clearData', options]); },
    clearStorageData: async options => { calls.push(['clearStorageData', options]); },
  };
}

test('site origini kimlik bilgileri, query ve fragment olmadan normalize edilir', () => {
  assert.deepEqual(browserHttpOrigin('https://user:pass@EXAMPLE.test:8443/path?token=x#y'), {
    origin: 'https://example.test:8443',
    host: 'example.test',
  });
  assert.equal(browserHttpOrigin('file:///tmp/a'), null);
  assert.equal(browserHttpOrigin('bozuk'), null);
});

test('site temizliği değerleri okumadan bağlantı, origin verisi, Cache Storage ve flush sırasını korur', async () => {
  const ses = privacySessionFake();
  const result = await clearBrowserSiteData(
    ses,
    'https://user:SENTINEL@example.test:8443/path?code=SENTINEL#SENTINEL',
  );
  assert.equal(result.ok, true);
  assert.equal(result.host, 'example.test');
  assert.equal(result.removed, null);
  assert.deepEqual(ses.calls, [
    ['closeAllConnections'],
    ['clearData', {
      origins: ['https://example.test:8443'],
      dataTypes: [...SITE_DATA_TYPES],
      originMatchingMode: 'origin-in-all-contexts',
    }],
    ['clearStorageData', {
      origin: 'https://example.test:8443',
      storages: ['cachestorage'],
    }],
    ['flushStore'],
  ]);
  assert.doesNotMatch(JSON.stringify({ result, calls: ses.calls }), /SENTINEL/);
});

test('site temizliği HTTP cache ve indirmelere dokunmaz', async () => {
  const ses = privacySessionFake();
  await clearBrowserSiteData(ses, 'https://example.test/');
  const clear = ses.calls.find(call => call[0] === 'clearData')[1];
  assert.equal(clear.dataTypes.includes('cache'), false);
  assert.equal(clear.dataTypes.includes('downloads'), false);
  assert.equal(ses.calls.some(call => call[0] === 'clearCache'), false);
});

test('Cache Storage temizlenemezse değer-okumayan kısmi sonuç görünürdür', async () => {
  const ses = privacySessionFake();
  ses.clearStorageData = async () => {
    ses.calls.push(['clearStorageData']);
    throw new Error('fault:SENTINEL_CACHE_STORAGE');
  };
  const result = await clearBrowserSiteData(ses, 'https://example.test/');
  assert.equal(result.ok, false);
  assert.equal(result.partial, true);
  assert.equal(result.removed, null);
  assert.equal(result.failed, 1);
  assert.match(result.error, /Cache Storage/);
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
  assert.deepEqual(ses.calls.at(-1), ['flushStore']);
});

test('geçersiz site adresi session APIlerine dokunmadan reddedilir', async () => {
  const ses = privacySessionFake();
  const result = await clearBrowserSiteData(ses, 'file:///SENTINEL');
  assert.equal(result.ok, false);
  assert.deepEqual(ses.calls, []);
});

test('bağlantılar kapatılamazsa site verisi ve flush başlamaz', async () => {
  const ses = privacySessionFake();
  ses.closeAllConnections = async () => {
    ses.calls.push(['closeAllConnections']);
    throw new Error('fault:SENTINEL_PENDING_REQUEST');
  };
  await assert.rejects(clearBrowserSiteData(ses, 'https://example.test/'), /SENTINEL_PENDING_REQUEST/);
  assert.deepEqual(ses.calls, [['closeAllConnections']]);
});

test('tüm çerez temizliği değerleri okumaz ve diğer storage türlerine dokunmaz', async () => {
  const ses = privacySessionFake();
  const result = await clearAllBrowserCookies(ses);
  assert.deepEqual(result, { ok: true, removed: null, failed: 0, total: null });
  assert.deepEqual(ses.calls, [
    ['closeAllConnections'],
    ['clearData', { dataTypes: ['cookies'] }],
    ['flushStore'],
  ]);
});

test('bekleyen Set-Cookie yanıtı yeni sırada temizliği geri alamaz', async () => {
  const state = { cookie: true, requestInFlight: true, requestTerminated: false };
  const ses = {
    cookies: { get: async () => { throw new Error('değer okunmamalı'); }, flushStore: async () => {} },
    closeAllConnections: async () => { state.requestTerminated = true; },
    clearData: async () => { state.cookie = false; },
  };
  await clearAllBrowserCookies(ses);
  if (state.requestInFlight && !state.requestTerminated) state.cookie = true;
  assert.equal(state.cookie, false);
});

function fakeWindow(browserSession, alreadyDestroyed = false, fail = false) {
  let destroyed = alreadyDestroyed;
  return {
    webContents: { session: browserSession },
    isDestroyed: () => destroyed,
    destroy: () => {
      if (fail) throw new Error('fault');
      destroyed = true;
    },
  };
}

test('yalnız hedef partition popup pencereleri kapanır ve hata sayılır', () => {
  const sessionA = {};
  const sessionB = {};
  const main = fakeWindow(sessionA);
  const popupA = fakeWindow(sessionA);
  const failedA = fakeWindow(sessionA, false, true);
  const popupB = fakeWindow(sessionB);
  const deadA = fakeWindow(sessionA, true);
  const result = destroyBrowserSessionWindows(
    [main, popupA, failedA, popupB, deadA],
    sessionA,
    main,
  );
  assert.deepEqual(result, { destroyed: 1, failed: 1 });
  assert.equal(main.isDestroyed(), false);
  assert.equal(popupA.isDestroyed(), true);
  assert.equal(popupB.isDestroyed(), false);
});

function resetSessionFake(closeError = null) {
  const calls = [];
  return {
    calls,
    cookies: { flushStore: async () => { calls.push('flushCookies'); } },
    closeAllConnections: async () => {
      calls.push('closeAllConnections');
      if (closeError) throw closeError;
    },
    clearStorageData: async () => { calls.push('clearStorageData'); },
    clearCache: async () => { calls.push('clearCache'); },
    clearAuthCache: async () => { calls.push('clearAuthCache'); },
  };
}

test('session reset bağlantı, storage, cache, auth ve flush sırasını korur', async () => {
  const ses = resetSessionFake();
  await resetBrowserSessionData(ses);
  assert.deepEqual(ses.calls, [
    'closeAllConnections', 'clearStorageData', 'clearCache', 'clearAuthCache', 'flushCookies',
  ]);
});

test('reset bağlantıları kapatamazsa yarışa açık temizliğe başlamaz', async () => {
  const ses = resetSessionFake(new Error('fault:SENTINEL_CLOSE'));
  await assert.rejects(resetBrowserSessionData(ses), /SENTINEL_CLOSE/);
  assert.deepEqual(ses.calls, ['closeAllConnections']);
});

function shutdownSessionFake(calls) {
  return {
    cookies: { flushStore: async () => { calls.push('flushCookies'); } },
    closeAllConnections: async () => { calls.push('closeAllConnections'); },
    flushStorageData: () => { calls.push('flushStorageData'); },
  };
}

test('kapanış web yüzeyleri, bağlantılar, storage ve cookie sırasını korur', async () => {
  const calls = [];
  const browserSession = shutdownSessionFake(calls);
  const main = fakeWindow(browserSession);
  const popup = {
    webContents: { session: browserSession },
    isDestroyed: () => false,
    destroy: () => { calls.push('destroyPopup'); },
  };
  const result = await shutdownBrowserSession(browserSession, {
    destroyView: () => { calls.push('destroyView'); return true; },
    listWindows: () => [main, popup],
    excludedWindow: main,
  });
  assert.deepEqual(calls, [
    'destroyView', 'destroyPopup', 'closeAllConnections', 'flushStorageData', 'flushCookies',
  ]);
  assert.deepEqual(result, {
    resetCompleted: false,
    viewClosed: true,
    destroyedWindows: 1,
    failedWindows: 0,
  });
});

test('aktif mutation bitmeden kapanış teardown ve flush başlatmaz', async () => {
  const calls = [];
  let finishMutation;
  const activeMutation = new Promise(resolve => { finishMutation = resolve; });
  const closing = shutdownBrowserSession(shutdownSessionFake(calls), {
    activeMutation,
    destroyView: () => { calls.push('destroyView'); return true; },
    listWindows: () => [],
  });
  await Promise.resolve();
  assert.deepEqual(calls, []);
  finishMutation();
  await closing;
  assert.deepEqual(calls, ['destroyView', 'closeAllConnections', 'flushStorageData', 'flushCookies']);
});

test('başarılı aktif reset kapanışta silinen sessionı yeniden flush etmez', async () => {
  const calls = [];
  const result = await shutdownBrowserSession(shutdownSessionFake(calls), {
    activeReset: Promise.resolve({ ok: true }),
    destroyView: () => { calls.push('destroyView'); return true; },
  });
  assert.equal(result.resetCompleted, true);
  assert.deepEqual(calls, []);
});

test('başarısız aktif reset normal kontrollü kapanış yoluna düşer', async () => {
  const calls = [];
  const result = await shutdownBrowserSession(shutdownSessionFake(calls), {
    activeReset: Promise.reject(new Error('fault:SENTINEL_RESET')),
    destroyView: () => { calls.push('destroyView'); return true; },
    listWindows: () => [],
  });
  assert.equal(result.resetCompleted, false);
  assert.deepEqual(calls, ['destroyView', 'closeAllConnections', 'flushStorageData', 'flushCookies']);
});

test('session mutation tracker aynı anda yalnız bir bakım yazarı çalıştırır', async () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf('function trackBrowserSessionMutation');
  const end = main.indexOf('async function clearBrowserSiteData', start);
  assert.ok(start >= 0 && end > start);
  const track = vm.runInNewContext(`(() => {
    let browserSessionMutationPromise = null;
    ${main.slice(start, end)}
    return trackBrowserSessionMutation;
  })()`);
  let finishFirst;
  const first = track(() => new Promise(resolve => { finishFirst = resolve; }));
  assert.throws(() => track(async () => 'çakışan'), /başka bir bakım işlemi/);
  await Promise.resolve();
  finishFirst('birinci');
  assert.equal(await first, 'birinci');
  assert.equal(await track(async () => 'ikinci'), 'ikinci');
});

test('main reset yardımcısı eşzamanlı çağrıyı tekilleştirir ve boş oturumu temizliğin ardından yazar', async () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const trackStart = main.indexOf('function trackBrowserSessionMutation');
  const trackEnd = main.indexOf('async function clearBrowserSiteData', trackStart);
  const resetStart = main.indexOf('function resetPersistentBrowserSession');
  const resetEnd = main.indexOf('function rememberBrowserVisit', resetStart);
  assert.ok(trackStart >= 0 && trackEnd > trackStart && resetStart >= 0 && resetEnd > resetStart);
  const events = [];
  let finishReset;
  const harness = vm.runInNewContext(`(() => {
    let browserSessionMutationPromise = null;
    let browserSessionResetPromise = null;
    let browserSessionSaveTimer = 21;
    let browserOverlay = {};
    ${main.slice(trackStart, trackEnd)}
    ${main.slice(resetStart, resetEnd)}
    return {
      resetPersistentBrowserSession,
      state: () => ({ browserSessionMutationPromise, browserSessionResetPromise,
        browserSessionSaveTimer, browserOverlay }),
    };
  })()`, {
    clearTimeout: value => events.push(['clearTimeout', value]),
    destroyBrowserView: () => events.push('destroyView'),
    session: { fromPartition: () => ({}) },
    BROWSER_PARTITION: 'synthetic',
    destroyBrowserSessionWindows: () => { events.push('destroyPopups'); return { destroyed: 2, failed: 0 }; },
    BrowserWindow: { getAllWindows: () => ['main', 'popup'] },
    mainWindow: 'main',
    resetBrowserSessionData: () => {
      events.push('resetData');
      return new Promise(resolve => { finishReset = resolve; });
    },
    writeBrowserSessionAtomic: (_file, snapshot) => {
      events.push(['write', snapshot]);
      return { ok: true };
    },
    browserSessionPath: () => 'session.json',
    app: {},
    browserSessionRestoreEnabled: true,
    browserPlacesSnapshot: () => ({ history: [] }),
  });
  const first = harness.resetPersistentBrowserSession();
  const duplicate = harness.resetPersistentBrowserSession();
  assert.equal(first, duplicate);
  await Promise.resolve();
  assert.deepEqual(events.slice(0, 4), [
    ['clearTimeout', 21], 'destroyView', 'destroyPopups', 'resetData',
  ]);
  assert.equal(events.some(event => Array.isArray(event) && event[0] === 'write'), false);
  finishReset();
  const result = await first;
  assert.equal(result.closedWindows, 2);
  assert.deepEqual(events.at(-1), ['write', { restoreEnabled: true, tabs: [] }]);
  assert.equal(harness.state().browserSessionMutationPromise, null);
  assert.equal(harness.state().browserSessionResetPromise, null);
});

test('iki profil restartında site temizliği yalnız hedef origin ve profili etkiler', async () => {
  class PersistentFixture {
    constructor(dir) {
      this.file = path.join(dir, 'browser-storage.json');
      try { this.state = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
      catch (_) { this.state = {}; }
      this.cookies = {
        get: async () => { throw new Error('değer okunmamalı'); },
        flushStore: async () => fs.writeFileSync(this.file, JSON.stringify(this.state)),
      };
    }
    async closeAllConnections() {}
    async clearData(options) {
      for (const origin of options.origins || Object.keys(this.state)) {
        if (this.state[origin]) this.state[origin].cookies = false;
      }
    }
    async clearStorageData(options) {
      if (options?.origin && this.state[options.origin]) this.state[options.origin].cacheStorage = false;
      else for (const entry of Object.values(this.state)) {
        entry.cookies = false;
        entry.cacheStorage = false;
      }
    }
    async clearCache() { for (const entry of Object.values(this.state)) entry.httpCache = false; }
    async clearAuthCache() { for (const entry of Object.values(this.state)) entry.auth = false; }
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-session-privacy-'));
  try {
    const origins = ['https://a.test', 'https://b.test'];
    const dirs = ['profil-a', 'profil-b'].map(name => {
      const dir = path.join(root, name);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'browser-storage.json'), JSON.stringify(Object.fromEntries(
        origins.map(origin => [origin, {
          cookies: true, cacheStorage: true, httpCache: true, auth: true,
        }]),
      )));
      fs.writeFileSync(path.join(dir, 'watch-library.json'), JSON.stringify({ count: 21 }));
      return dir;
    });
    let profileA = new PersistentFixture(dirs[0]);
    await clearBrowserSiteData(profileA, `${origins[1]}/logout?token=SENTINEL`);
    profileA = new PersistentFixture(dirs[0]);
    const profileB = new PersistentFixture(dirs[1]);
    assert.equal(profileA.state[origins[1]].cookies, false);
    assert.equal(profileA.state[origins[1]].cacheStorage, false);
    assert.equal(profileA.state[origins[1]].httpCache, true);
    assert.ok(Object.values(profileA.state[origins[0]]).every(Boolean));
    assert.ok(Object.values(profileB.state).every(entry => Object.values(entry).every(Boolean)));
    for (const dir of dirs) {
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'watch-library.json'))), { count: 21 });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  OK  ${name}`);
    } catch (error) {
      console.error(`  FAIL ${name}\n${error.stack}`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log(`\n${passed} tarayıcı session/mahremiyet testi geçti.`);
})();
