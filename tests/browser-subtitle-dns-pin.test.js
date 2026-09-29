'use strict';

// R242: fetchBrowserBuffer artık DNS doğrulamasıyla bağlantıyı aynı IP'ye
// sabitler (rebinding). Doğrudan ortamda session.fetch yerine
// requestPinnedSubtitleBuffer çağrılmalı; proxy'li veya oturumun https'i
// işlediği ortamlarda Chromium yoluna geri düşülmeli.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeContext(overrides = {}) {
  const calls = { pinned: [], fetched: [] };
  const session = {
    resolveProxy: async () => 'DIRECT',
    cookies: { get: async () => [{ name: 'sid', value: '1' }] },
    getUserAgent: () => 'UA-test',
    protocol: { isProtocolHandled: async () => false },
    fetch: async (url, opts) => {
      calls.fetched.push({ url, opts });
      return { status: 200, ok: true, headers: new Map(), arrayBuffer: async () => Buffer.from('web') };
    },
  };
  const context = {
    URL, Buffer, Map, Promise, BROWSER_FETCH_TIMEOUT: 1000,
    activeBrowserTab: () => ({ view: { webContents: { isDestroyed: () => false, getURL: () => 'https://page.example/', session } } }),
    assertPublicBrowserSubtitleUrl: async () => ({ address: '93.184.216.34', family: 4 }),
    requestPinnedSubtitleBuffer: async (url, pin, opts) => {
      calls.pinned.push({ url, pin, opts });
      return { status: 200, ok: true, headers: new Map(), arrayBuffer: async () => Buffer.from('node') };
    },
    sanitizeBrowserUserAgent: (v) => v,
    withAbortTimeout: (fn) => fn(undefined),
    browserSubtitleStateError: (code, message) => Object.assign(new Error(message), { code }),
    browserSubtitleHttpError: (status) => Object.assign(new Error(`HTTP ${status}`), { code: 'EBROWSER_HTTP', status }),
    readResponseBufferLimited: async (res) => Buffer.from(await res.arrayBuffer()),
    parseRetryAfterMs: () => 0,
    isCurrentBrowserContext: () => true,
    browserTabById: () => null,
    decodeSubtitleBuffer: (buffer) => ({ text: buffer.toString() }),
    ...overrides.context,
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  vm.runInContext(source.slice(
    source.indexOf('async function fetchBrowserBuffer('),
    source.indexOf('async function fetchBrowserText(')), context);
  return { context, calls, session };
}

test('DIRECT ortamda altyazı indirmesi doğrulanmış IPye sabitlenir (rebinding kapalı)', async () => {
  const { context, calls } = makeContext();
  const buffer = await context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null);
  assert.equal(buffer.toString(), 'node');
  assert.equal(calls.pinned.length, 1);
  assert.deepEqual(calls.pinned[0].pin, { address: '93.184.216.34', family: 4 });
  assert.equal(calls.pinned[0].opts.maxBytes, 1024);
  assert.equal(calls.fetched.length, 0, 'DIRECT ortamda session.fetch kullanılmamalı');
});

test('aynı kökende oturum çerezleri Node isteğine taşınır', async () => {
  const { context, calls, session } = makeContext();
  session.getUserAgent = () => 'UA';
  await context.fetchBrowserBuffer('https://page.example/subs/a.srt', 1024, null);
  assert.equal(calls.pinned[0].opts.headers.Cookie, 'sid=1');
  assert.equal(calls.pinned[0].opts.headers['User-Agent'], 'UA');
});

test('proxyli ortam Chromium fetch yoluna geri düşer', async () => {
  const { context, calls, session } = makeContext();
  session.resolveProxy = async () => 'PROXY corp:8080';
  const buffer = await context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null);
  assert.equal(buffer.toString(), 'web');
  assert.equal(calls.pinned.length, 0);
  assert.equal(calls.fetched.length, 1);
});

test('oturum https protokolünü işliyorsa interceptor korunur (session.fetch)', async () => {
  const { context, calls, session } = makeContext();
  session.protocol.isProtocolHandled = async () => true;
  const buffer = await context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null);
  assert.equal(buffer.toString(), 'web');
  assert.equal(calls.pinned.length, 0);
  assert.equal(calls.fetched.length, 1);
});

test('resolveProxy çökerse DIRECT varsayılmaz — Chromium yoluna düşülür', async () => {
  const { context, calls, session } = makeContext();
  session.resolveProxy = async () => { throw new Error('pac yok'); };
  const buffer = await context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null);
  assert.equal(buffer.toString(), 'web');
  assert.equal(calls.pinned.length, 0);
  assert.equal(calls.fetched.length, 1);
});

test('DIRECT; PROXY zincirinde doğrudan bacak düşerse proxy yedeği denenir', async () => {
  const { context, calls, session } = makeContext();
  session.resolveProxy = async () => 'DIRECT; PROXY corp:8080';
  context.requestPinnedSubtitleBuffer = async () => { throw new Error('ECONNREFUSED'); };
  const buffer = await context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null);
  assert.equal(buffer.toString(), 'web');
  assert.equal(calls.fetched.length, 1, 'doğrudan bacak düşünce session.fetch yedeği çalışmalı');
});

test('tek DIRECT bacakta pinning hatası aynen yükselir (yedek yok)', async () => {
  const { context, calls } = makeContext();
  context.requestPinnedSubtitleBuffer = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(() => context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null), /ECONNREFUSED/);
  assert.equal(calls.fetched.length, 0);
});

test('http sayfasında Secure çerezler Cookie başlığına taşınmaz', async () => {
  const { context, calls, session } = makeContext();
  session.cookies.get = async () => [
    { name: 'sid', value: '1', secure: false },
    { name: 'sess', value: 'gizli', secure: true },
  ];
  session.getUserAgent = () => 'UA';
  context.activeBrowserTab = () => ({ view: { webContents: { isDestroyed: () => false, getURL: () => 'http://page.example/', session } } });
  await context.fetchBrowserBuffer('http://page.example/subs/a.srt', 1024, null);
  assert.equal(calls.pinned[0].opts.headers.Cookie, 'sid=1');
});

test('yönlendirme hedefi yeniden doğrulanıp ayrıca sabitlenir', async () => {
  const pinnedCalls = [];
  const { context } = makeContext({
    context: {
      requestPinnedSubtitleBuffer: async (url, pin) => {
        pinnedCalls.push({ url, pin });
        if (pinnedCalls.length === 1) {
          return { status: 302, ok: false, headers: new Map([['location', 'https://cdn.example/x.srt']]) };
        }
        return { status: 200, ok: true, headers: new Map(), arrayBuffer: async () => Buffer.from('ok') };
      },
    },
  });
  const buffer = await context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null);
  assert.equal(buffer.toString(), 'ok');
  assert.equal(pinnedCalls.length, 2);
  assert.equal(pinnedCalls[1].url, 'https://cdn.example/x.srt');
});

// #184 SEC_0002: boyut sınırı/iptal ilke hatasıdır — çok bacaklı zincirde
// ağ hatası sanılıp ikinci istek (proxy yedeği) yapılmamalı.
test('çok bacaklı zincirde boyut sınırı ilke hatası proxy yedeği tetiklemez', async () => {
  const { context, calls, session } = makeContext();
  session.resolveProxy = async () => 'DIRECT; PROXY corp:8080';
  context.requestPinnedSubtitleBuffer = async () => {
    throw Object.assign(new Error('Altyazı yanıtı güvenli boyut sınırını aşıyor.'), { code: 'ESUBTITLE_LIMIT' });
  };
  await assert.rejects(() => context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null), /boyut sınırını aşıyor/);
  assert.equal(calls.fetched.length, 0, 'ilke hatasında proxy yedeği ikinci istek yapmamalı');
});

test('çok bacaklı zincirde kullanıcı iptali proxy yedeği tetiklemez', async () => {
  const { context, calls, session } = makeContext();
  session.resolveProxy = async () => 'DIRECT; PROXY corp:8080';
  context.withAbortTimeout = (fn) => fn({ aborted: true, addEventListener() {}, removeEventListener() {} });
  context.requestPinnedSubtitleBuffer = async () => {
    throw Object.assign(new Error('Altyazı isteği iptal edildi.'), { code: 'ERR_ABORTED' });
  };
  await assert.rejects(() => context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null), /iptal edildi/);
  assert.equal(calls.fetched.length, 0, 'iptalde proxy yedeği çalışmamalı');
});

// #184 SEC_0001: proxy yedeği kendi çözümlemesini yapar — pin ile yedek
// arasındaki DNS kayması (TOCTOU) için hedef yeniden doğrulanır.
test('proxy yedeğinden önce hedef yeniden doğrulanır (TOCTOU daralması)', async () => {
  const validates = [];
  const { context, session } = makeContext({
    context: {
      assertPublicBrowserSubtitleUrl: async (url) => {
        validates.push(url);
        return { address: '93.184.216.34', family: 4 };
      },
      requestPinnedSubtitleBuffer: async () => { throw new Error('ECONNRESET'); },
    },
  });
  session.resolveProxy = async () => 'DIRECT; PROXY corp:8080';
  const buffer = await context.fetchBrowserBuffer('https://subs.example/a.srt', 1024, null);
  assert.equal(buffer.toString(), 'web');
  assert.deepEqual(validates, ['https://subs.example/a.srt', 'https://subs.example/a.srt'],
    'pin doğrulaması + yedek öncesi yeniden doğrulama beklenir');
});

// İlke-hatası kodları kaynağında da kilitlenir: pinned istek sınır aşınca
// ESUBTITLE_LIMIT, iptalde ERR_ABORTED üretmeli (yukarıdaki kapılar buna
// güvenir; kod düşerse ikinci istek geri döner).
function makePinnedContext({ chunkBytes = 2048 } = {}) {
  const { EventEmitter } = require('events');
  const context = {
    URL, Buffer, Map, Promise, BROWSER_FETCH_TIMEOUT: 1000, console,
    https: {
      request: (_parsed, _opts, onResponse) => {
        const request = {
          _err: null,
          setTimeout() {},
          on(event, fn) { if (event === 'error') request._onerror = fn; },
          destroy(err) {
            request._err = err;
            // Gerçek soket destroy(err) 'error' yayar — sınır/iptal hatası
            // bu kanaldan reddedilir.
            setImmediate(() => request._onerror?.(err));
          },
          end() {
            const response = new EventEmitter();
            onResponse(response);
            setImmediate(() => {
              response.emit('data', Buffer.alloc(chunkBytes));
              if (request._err) request._onerror?.(request._err);
            });
          },
        };
        return request;
      },
    },
    http: { request: () => { throw new Error('http beklenmiyor'); } },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  vm.runInContext(source.slice(
    source.indexOf('async function requestPinnedSubtitleBuffer('),
    source.indexOf('async function fetchBrowserBuffer(')), context);
  return context;
}

test('pinned istek boyut sınırında ESUBTITLE_LIMIT kodlu hata üretir', async () => {
  const context = makePinnedContext();
  await assert.rejects(
    () => context.requestPinnedSubtitleBuffer('https://subs.example/big.srt',
      { address: '93.184.216.34', family: 4 }, { maxBytes: 8 }),
    (error) => error.code === 'ESUBTITLE_LIMIT' && /boyut sınırını aşıyor/.test(error.message));
});

test('pinned istek iptalde ERR_ABORTED kodlu hata üretir', async () => {
  // Küçük chunk: sınır yarışı olmadan yalnız iptal yolu sınanır.
  const context = makePinnedContext({ chunkBytes: 8 });
  const signal = { aborted: false, addEventListener(_e, fn) { this._fn = fn; }, removeEventListener() {} };
  const pending = context.requestPinnedSubtitleBuffer('https://subs.example/a.srt',
    { address: '93.184.216.34', family: 4 }, { maxBytes: 1024, signal });
  signal.aborted = true;
  signal._fn();
  await assert.rejects(() => pending, (error) => error.code === 'ERR_ABORTED');
});
