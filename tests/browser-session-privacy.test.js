const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {
  BROWSER_PARTITION,
  browserHttpOrigin,
  clearAllBrowserCookies,
  clearBrowserCookiesForSite,
  destroyBrowserSessionWindows,
  isSensitiveBrowserParam,
  resetBrowserSessionData,
  safeBrowserPlaceUrl,
  shutdownBrowserSession,
} = require('../src/browser-session-privacy');

let passed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('kalıcı tarayıcı partition adı profiller içinde kararlıdır', () => {
  assert.equal(BROWSER_PARTITION, 'persist:whisper-browser');
});

test('geçmiş URL’si Basic-Auth ve OAuth/SAML belirteçlerini kalıcılaştırmaz', () => {
  const safe = safeBrowserPlaceUrl(
    'https://kullanici:SENTINEL_PASSWORD@example.test/callback'
    + '?code=SENTINEL_CODE&state=SENTINEL_STATE&access_token=SENTINEL_TOKEN'
    + '&SAMLResponse=SENTINEL_SAML&lang=tr#SENTINEL_FRAGMENT',
  );
  assert.equal(safe, 'https://example.test/callback?lang=tr');
  assert.doesNotMatch(safe, /SENTINEL/);
});

test('normal gezinme parametreleri ve Türkçe karakterler korunur', () => {
  const safe = safeBrowserPlaceUrl('https://example.test/izle?b%C3%B6l%C3%BCm=21&lang=tr&q=%C4%B0stanbul');
  const parsed = new URL(safe);
  assert.equal(parsed.searchParams.get('bölüm'), '21');
  assert.equal(parsed.searchParams.get('lang'), 'tr');
  assert.equal(parsed.searchParams.get('q'), 'İstanbul');
});

test('hassas parametre eşlemesi sınır ve büyük/küçük harf varyasyonlarını kapsar', () => {
  const sensitive = [
    'TOKEN', 'refresh_token', 'client-secret', 'user_password',
    'credential-id', 'SAMLRequest', 'RelayState', 'nonce', 'ticket',
    'accessToken', 'refreshToken', 'userPassword', 'authorizationCode', 'sessionState',
  ];
  for (const key of sensitive) assert.equal(isSensitiveBrowserParam(key), true, key);
  for (const key of ['language', 'episode', 'subtitle', 'monkey', 'estate']) {
    assert.equal(isSensitiveBrowserParam(key), false, key);
  }
});

test('2.000 sentinel URL fuzz örneğinde hassas değer çıktı snapshot’ına sızmaz', () => {
  const sensitiveKeys = [
    'token', 'access_token', 'refresh-token', 'client_secret', 'password',
    'credential', 'signature', 'authorization', 'code', 'state',
    'nonce', 'ticket', 'assertion', 'SAMLResponse', 'RelayState',
    'accessToken', 'refreshToken', 'userPassword', 'authorizationCode', 'sessionState',
  ];
  for (let i = 0; i < 2000; i++) {
    const key = sensitiveKeys[i % sensitiveKeys.length];
    const cased = i % 2 ? key.toUpperCase() : key;
    const sentinel = `SENTINEL_${i}`;
    const raw = `https://user:${sentinel}@profile${i % 2}.test/path?${encodeURIComponent(cased)}=${sentinel}&page=${i}#${sentinel}`;
    const snapshot = JSON.stringify({ url: safeBrowserPlaceUrl(raw) });
    assert.equal(snapshot.includes(sentinel), false, `örnek ${i}`);
  }
});

test('site origin’i kimlik bilgileri, query ve fragment olmadan normalize edilir', () => {
  assert.deepEqual(browserHttpOrigin('https://user:pass@EXAMPLE.test:8443/path?token=x#y'), {
    origin: 'https://example.test:8443',
    host: 'example.test',
  });
  assert.equal(browserHttpOrigin('file:///tmp/a'), null);
  assert.equal(browserHttpOrigin('bozuk'), null);
});

function privacySessionFake() {
  const calls = [];
  return {
    calls,
    cookies: {
      get: async () => { throw new Error('Çerez değerleri okunmamalı'); },
      flushStore: async () => { calls.push(['flushStore']); },
    },
    closeAllConnections: async () => { calls.push(['closeAllConnections']); },
    clearData: async (options) => { calls.push(['clearData', options]); },
  };
}

test('site çerez temizliği değerleri okumadan yalnız normalize origin’i hedefler', async () => {
  const ses = privacySessionFake();
  const result = await clearBrowserCookiesForSite(ses, 'https://user:SENTINEL@example.test:8443/path?code=SENTINEL');
  assert.deepEqual(result, { ok: true, host: 'example.test', removed: null });
  assert.deepEqual(ses.calls, [
    ['closeAllConnections'],
    ['clearData', {
      origins: ['https://example.test:8443'],
      dataTypes: ['cookies'],
      originMatchingMode: 'origin-in-all-contexts',
    }],
    ['flushStore'],
  ]);
  assert.doesNotMatch(JSON.stringify({ result, calls: ses.calls }), /SENTINEL/);
});

test('tüm çerez temizliği diğer storage türlerine dokunmaz ve değerleri okumaz', async () => {
  const ses = privacySessionFake();
  const result = await clearAllBrowserCookies(ses);
  assert.deepEqual(result, { ok: true, removed: null });
  assert.deepEqual(ses.calls, [
    ['closeAllConnections'],
    ['clearData', { dataTypes: ['cookies'] }],
    ['flushStore'],
  ]);
});

test('geçersiz site adresi session API’sine dokunmadan reddedilir', async () => {
  const ses = privacySessionFake();
  const result = await clearBrowserCookiesForSite(ses, 'file:///SENTINEL');
  assert.equal(result.ok, false);
  assert.deepEqual(ses.calls, []);
});

test('çerez temizliğinde bağlantılar kapatılamazsa silme ve flush başlamaz', async () => {
  for (const clear of [
    (ses) => clearBrowserCookiesForSite(ses, 'https://example.test/logout'),
    (ses) => clearAllBrowserCookies(ses),
  ]) {
    const ses = privacySessionFake();
    ses.closeAllConnections = async () => {
      ses.calls.push(['closeAllConnections']);
      throw new Error('fault:SENTINEL_PENDING_COOKIE');
    };
    await assert.rejects(clear(ses), /SENTINEL_PENDING_COOKIE/);
    assert.deepEqual(ses.calls, [['closeAllConnections']]);
  }
});

test('bekleyen Set-Cookie yanıtı eski sırada temizliği geri alır; yeni sıra isteği sonlandırır', async () => {
  function pendingCookieSession() {
    const calls = [];
    const state = { cookie: true, requestInFlight: true, requestTerminated: false };
    return {
      calls,
      state,
      cookies: { flushStore: async () => { calls.push('flushStore'); } },
      closeAllConnections: async () => {
        calls.push('closeAllConnections');
        state.requestTerminated = true;
      },
      clearData: async () => {
        calls.push('clearData');
        state.cookie = false;
      },
      finishRequest: () => {
        if (state.requestInFlight && !state.requestTerminated) state.cookie = true;
        state.requestInFlight = false;
      },
    };
  }

  const legacy = pendingCookieSession();
  await legacy.clearData({ dataTypes: ['cookies'] });
  legacy.finishRequest();
  assert.equal(legacy.state.cookie, true, 'eski sıra Set-Cookie karşı örneğini üretmedi');

  const hardened = pendingCookieSession();
  await clearAllBrowserCookies(hardened);
  hardened.finishRequest();
  assert.equal(hardened.state.cookie, false);
  assert.deepEqual(hardened.calls, ['closeAllConnections', 'clearData', 'flushStore']);
});

function fakeWindow(browserSession, label, alreadyDestroyed = false) {
  let destroyed = alreadyDestroyed;
  return {
    label,
    webContents: { session: browserSession },
    isDestroyed: () => destroyed,
    destroy: () => { destroyed = true; },
  };
}

test('yalnız hedef partition’ın popup pencereleri kapanır', () => {
  const sessionA = {};
  const sessionB = {};
  const main = fakeWindow(sessionA, 'ana');
  const popupA1 = fakeWindow(sessionA, 'a-1');
  const popupA2 = fakeWindow(sessionA, 'a-2');
  const popupB = fakeWindow(sessionB, 'b-1');
  const deadA = fakeWindow(sessionA, 'ölü', true);
  const result = destroyBrowserSessionWindows([main, popupA1, popupA2, popupB, deadA], sessionA, main);
  assert.deepEqual(result, { destroyed: 2, failed: 0 });
  assert.equal(main.isDestroyed(), false);
  assert.equal(popupA1.isDestroyed(), true);
  assert.equal(popupA2.isDestroyed(), true);
  assert.equal(popupB.isDestroyed(), false);
});

test('hedef partition popup’ı kapanmazsa sessiz başarı verilmez', () => {
  const browserSession = {};
  const popup = {
    webContents: { session: browserSession },
    isDestroyed: () => false,
    destroy: () => { throw new Error('fault:SENTINEL_DESTROY'); },
  };
  assert.deepEqual(destroyBrowserSessionWindows([popup], browserSession), { destroyed: 0, failed: 1 });
});

function resetSessionFake({ closeError = null } = {}) {
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

test('bağlantılar kapatılamazsa yarışa açık veri temizliği başlamaz', async () => {
  const ses = resetSessionFake({ closeError: new Error('fault:SENTINEL_PENDING_REQUEST') });
  await assert.rejects(resetBrowserSessionData(ses), /SENTINEL_PENDING_REQUEST/);
  assert.deepEqual(ses.calls, ['closeAllConnections']);
});

test('bekleyen istek eski sırada temizlenen storage’ı yeniden doldurur; yeni sıra engeller', async () => {
  function raceSession() {
    const state = { cache: true, pending: true, aborted: false };
    return {
      state,
      cookies: { flushStore: async () => {} },
      closeAllConnections: async () => { state.aborted = true; },
      clearStorageData: async () => { state.cache = false; },
      clearCache: async () => { state.cache = false; },
      clearAuthCache: async () => {},
      completePending: () => {
        if (state.pending && !state.aborted) state.cache = true;
        state.pending = false;
      },
    };
  }
  const legacy = raceSession();
  await legacy.clearStorageData();
  await legacy.clearCache();
  legacy.completePending();
  assert.equal(legacy.state.cache, true, 'eski sıra yarış karşı örneğini üretmedi');

  const hardened = raceSession();
  await resetBrowserSessionData(hardened);
  hardened.completePending();
  assert.equal(hardened.state.cache, false);
});

function shutdownSessionFake(calls) {
  return {
    cookies: { flushStore: async () => { calls.push('flushCookies'); } },
    closeAllConnections: async () => { calls.push('closeAllConnections'); },
    flushStorageData: () => { calls.push('flushStorageData'); },
  };
}

test('normal kapanış bütün browser yüzeylerini susturup bağlantılardan sonra flush eder', async () => {
  const calls = [];
  const browserSession = shutdownSessionFake(calls);
  const main = fakeWindow(browserSession, 'ana');
  const otherSession = {};
  const otherPopup = fakeWindow(otherSession, 'başka-partition');
  const popup = {
    webContents: { session: browserSession },
    isDestroyed: () => false,
    destroy: () => { calls.push('destroyPopup'); },
  };

  const result = await shutdownBrowserSession(browserSession, {
    destroyView: () => { calls.push('destroyView'); return true; },
    listWindows: () => [main, popup, otherPopup],
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
  assert.equal(main.isDestroyed(), false);
  assert.equal(otherPopup.isDestroyed(), false);
});

test('aktif session reseti bitmeden kapanış ikinci bir flush başlatmaz', async () => {
  const calls = [];
  let finishReset;
  const activeReset = new Promise((resolve) => { finishReset = resolve; });
  const closing = shutdownBrowserSession(shutdownSessionFake(calls), {
    activeReset,
    destroyView: () => { calls.push('destroyView'); return true; },
    listWindows: () => { calls.push('listWindows'); return []; },
  });

  await Promise.resolve();
  assert.deepEqual(calls, [], 'reset sürerken paralel teardown/flush başladı');
  finishReset({ ok: true });
  assert.deepEqual(await closing, {
    resetCompleted: true,
    viewClosed: true,
    destroyedWindows: 0,
    failedWindows: 0,
  });
  assert.deepEqual(calls, [], 'başarılı resetten sonra silinen session yeniden flush edildi');
});

test('aktif cookie mutation bitmeden kapanış teardown ve flush başlatmaz', async () => {
  const calls = [];
  let finishMutation;
  const activeMutation = new Promise((resolve) => { finishMutation = resolve; });
  const closing = shutdownBrowserSession(shutdownSessionFake(calls), {
    activeMutation,
    destroyView: () => { calls.push('destroyView'); return true; },
    listWindows: () => { calls.push('listWindows'); return []; },
  });

  await Promise.resolve();
  assert.deepEqual(calls, [], 'cookie temizliği sürerken kapanış session’a dokundu');
  finishMutation({ ok: true });
  assert.deepEqual(await closing, {
    resetCompleted: false,
    viewClosed: true,
    destroyedWindows: 0,
    failedWindows: 0,
  });
  assert.deepEqual(calls, [
    'destroyView', 'listWindows', 'closeAllConnections', 'flushStorageData', 'flushCookies',
  ]);
});

test('session mutation tracker aynı anda yalnız bir bakım yazarı çalıştırır', async () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf('function trackBrowserSessionMutation');
  const end = main.indexOf('async function clearBrowserCookiesForSite', start);
  assert.ok(start >= 0 && end > start, 'session mutation tracker kaynakta bulunamadı');
  const track = vm.runInNewContext(`(() => {
    let browserSessionMutationPromise = null;
    ${main.slice(start, end)}
    return trackBrowserSessionMutation;
  })()`);

  let finishFirst;
  const first = track(() => new Promise((resolve) => { finishFirst = resolve; }));
  assert.throws(() => track(async () => 'çakışan'), /başka bir bakım işlemi/);
  await Promise.resolve();
  finishFirst('birinci');
  assert.equal(await first, 'birinci');
  assert.equal(await track(async () => 'ikinci'), 'ikinci');
});

test('aktif reset başarısızsa kapanış yüzeyleri yeniden susturup kalıcılığı tamamlar', async () => {
  const calls = [];
  const result = await shutdownBrowserSession(shutdownSessionFake(calls), {
    activeReset: Promise.reject(new Error('fault:SENTINEL_RESET')),
    destroyView: () => { calls.push('destroyView'); return true; },
    listWindows: () => { calls.push('listWindows'); return []; },
  });
  assert.deepEqual(calls, [
    'destroyView', 'listWindows', 'closeAllConnections', 'flushStorageData', 'flushCookies',
  ]);
  assert.equal(result.resetCompleted, false);
});

test('kapanışta bağlantılar susturulamazsa yarışa açık flush başlamaz', async () => {
  const calls = [];
  const browserSession = shutdownSessionFake(calls);
  browserSession.closeAllConnections = async () => {
    calls.push('closeAllConnections');
    throw new Error('fault:SENTINEL_CLOSE');
  };
  await assert.rejects(shutdownBrowserSession(browserSession, {
    destroyView: () => { calls.push('destroyView'); return true; },
    listWindows: () => { calls.push('listWindows'); return []; },
  }), /SENTINEL_CLOSE/);
  assert.deepEqual(calls, ['destroyView', 'listWindows', 'closeAllConnections']);
});

async function createLocalOriginFixtures(count) {
  const servers = [];
  const origins = [];
  for (let i = 0; i < count; i++) {
    const host = `127.0.0.${i + 1}`;
    const server = http.createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ fixture: i + 1 }));
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, host, resolve);
    });
    const address = server.address();
    servers.push(server);
    origins.push(`http://${host}:${address.port}`);
  }
  return {
    origins,
    close: async () => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))),
  };
}

class PersistentSessionFixture {
  constructor(profileDir) {
    this.file = path.join(profileDir, 'browser-storage-metadata.json');
    this.cookies = { flushStore: async () => this.save() };
    try { this.state = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (_) { this.state = {}; }
  }

  seed(origins) {
    for (const origin of origins) {
      this.state[origin] = {
        cookies: true, indexdb: true, localstorage: true,
        cachestorage: true, serviceworkers: true, cache: true, auth: true,
      };
    }
    this.save();
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.state), 'utf8');
  }

  async clearData(options) {
    const targets = options.origins || Object.keys(this.state);
    for (const origin of targets) {
      if (!this.state[origin]) continue;
      for (const type of options.dataTypes || []) this.state[origin][type] = false;
    }
  }

  async closeAllConnections() {}
  async clearStorageData() {
    for (const entry of Object.values(this.state)) {
      for (const type of ['cookies', 'indexdb', 'localstorage', 'cachestorage', 'serviceworkers']) {
        entry[type] = false;
      }
    }
  }
  async clearCache() { for (const entry of Object.values(this.state)) entry.cache = false; }
  async clearAuthCache() { for (const entry of Object.values(this.state)) entry.auth = false; }
}

test('2 profil × 3 yerel origin × 2 restart çevrimi izolasyonu metadata düzeyinde korur', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-session-privacy-'));
  const local = await createLocalOriginFixtures(3);
  try {
    const profileDirs = ['profil-a', 'profil-b'].map((name) => {
      const dir = path.join(root, name);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'watch-library.json'), JSON.stringify({ count: 21 }), 'utf8');
      return dir;
    });
    for (const dir of profileDirs) new PersistentSessionFixture(dir).seed(local.origins);

    // Restart 1: profil A'da yalnız ikinci origin'in çerezleri temizlenir.
    let profileA = new PersistentSessionFixture(profileDirs[0]);
    let profileB = new PersistentSessionFixture(profileDirs[1]);
    await clearBrowserCookiesForSite(profileA, `${local.origins[1]}/logout?token=SENTINEL`);
    profileA = new PersistentSessionFixture(profileDirs[0]);
    profileB = new PersistentSessionFixture(profileDirs[1]);
    assert.equal(profileA.state[local.origins[1]].cookies, false);
    assert.equal(profileA.state[local.origins[1]].localstorage, true);
    assert.equal(profileA.state[local.origins[0]].cookies, true);
    assert.equal(profileA.state[local.origins[2]].cookies, true);
    assert.ok(Object.values(profileB.state).every((entry) => Object.values(entry).every(Boolean)));

    // Restart 2: profil A'nın web session'ı sıfırlanır; profil B ve uygulama
    // watch-library dosyası browser partition temizliğinin dışında kalır.
    await resetBrowserSessionData(profileA);
    profileA = new PersistentSessionFixture(profileDirs[0]);
    profileB = new PersistentSessionFixture(profileDirs[1]);
    assert.ok(Object.values(profileA.state).every((entry) => Object.values(entry).every((value) => value === false)));
    assert.ok(Object.values(profileB.state).every((entry) => Object.values(entry).every(Boolean)));
    for (const dir of profileDirs) {
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'watch-library.json'), 'utf8')), { count: 21 });
    }
    const privacySnapshot = JSON.stringify({ profileA: profileA.state, profileB: profileB.state });
    assert.doesNotMatch(privacySnapshot, /SENTINEL|cookieValue|tokenValue/i);
  } finally {
    await local.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  OK  ${name}`);
    } catch (err) {
      console.error(`  FAIL ${name}\n${err.stack}`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log(`\n${passed} tarayıcı session/mahremiyet testi geçti.`);
})();
