'use strict';
// R280 — SponsorBlock fetch + önbellek TTL/anahtar-çakışması stresi.
// İki katman: (a) main.js'ten vm ile dilimlenen fetchSponsorBlockSegments
// üzerinde sahte net.request/timers ile davranışsal senaryolar;
// (b) SponsorBlockCache TTL, LRU ve anahtar uzayı ratchet'leri.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const {
  SponsorBlockCache, normalizeCategories, hashPrefix,
  extractHashSegments, splitSponsorActions, validateSegments,
  validateChapters, clampSegmentsToDuration,
} = require('../src/browser-sponsorblock');

const mainSrc = fs.readFileSync(require.resolve('../src/main.js'), 'utf8');
const VID = 'abcdefghijk';

let passed = 0;
const ok = (name, cond, extra = '') => { assert(cond, `${name} ${extra}`); passed += 1; console.log(`  PASS ${name}`); };

// --- fetch dilimi: gerçek kaynaktan fonksiyonu çıkar ---
function makeFetchHarness({ timers = {} } = {}) {
  const start = mainSrc.indexOf('function fetchSponsorBlockSegments');
  const end = mainSrc.indexOf('function fetchDeArrowBranding', start);
  assert(start > 0 && end > start, 'fetchSponsorBlockSegments dilimi bulunamadı');
  const sponsorBlockCache = new SponsorBlockCache();
  const sponsorBlockInFlight = new Map();
  const fakeTimers = { pending: [], nextId: 1, cleared: new Set() };
  const setTimeout = (fn, ms) => { const id = fakeTimers.nextId++; fakeTimers.pending.push({ id, fn, ms }); return id; };
  const clearTimeout = (id) => { fakeTimers.cleared.add(id); fakeTimers.pending = fakeTimers.pending.filter((t) => t.id !== id); };
  const requests = [];
  const sandbox = {
    normalizeSponsorCategories: normalizeCategories,
    sponsorBlockCache, sponsorBlockInFlight, sponsorBlockHashPrefix: hashPrefix,
    clampSponsorSegmentsToDuration: clampSegmentsToDuration,
    extractSponsorHashSegments: extractHashSegments,
    splitSponsorActions, validateSponsorSegments: validateSegments,
    validateSponsorChapters: validateChapters,
    net: { request: (opts) => { const r = fakeRequest(opts); requests.push(r); return r; } },
    SPONSORBLOCK_HOST: 'sponsor.ajay.app', MAX_SPONSORBLOCK_BYTES: 2 * 1024 * 1024,
    setTimeout, clearTimeout, Promise, JSON, Buffer, String, Number, setImmediate,
    console,
  };
  vm.runInNewContext(`${mainSrc.slice(start, end)}; this.fetch = fetchSponsorBlockSegments;`, sandbox);
  return { fetch: sandbox.fetch, cache: sponsorBlockCache, inFlight: sponsorBlockInFlight, requests, timers: fakeTimers };
}

function fakeRequest(opts) {
  const handlers = { request: {}, response: {} };
  const req = {
    opts, handlers, aborted: false,
    on: (ev, fn) => { handlers.request[ev] = fn; },
    abort: () => { req.aborted = true; },
    end: () => { req.ended = true; },
    emitResponse: (res) => handlers.request.response?.(res),
  };
  return req;
}
function fakeResponse(statusCode = 200) {
  const handlers = {};
  return {
    statusCode, handlers,
    on: (ev, fn) => { handlers[ev] = fn; },
    emit: (ev, arg) => handlers[ev]?.(arg),
    destroy: () => {},
  };
}
const fireTimers = (timers) => { const p = timers.pending; timers.pending = []; p.forEach((t) => t.fn()); };
const settled = (p) => { let v; let done = false; p.then((x) => { done = true; v = x; }); return { get done() { return done; }, get value() { return v; } }; };
const microDrain = () => new Promise((r) => setImmediate(r));

// ============ Davranışsal: gövde-ortası askı ============
(async () => {

// Başlıkları verip akışı durduran sunucu — zaman aşımı gövde bitene dek
// canlı kalmalı; aksi halde promise ve uçuş içi kilit sonsuza dek asılıdır.
{
  const h = makeFetchHarness();
  const s = settled(h.fetch(VID, ['sponsor'], 120));
  await microDrain();
  const res = fakeResponse(200);
  h.requests[0].emitResponse(res);
  res.emit('data', Buffer.from('{"partial":'));
  await microDrain();
  ok('askı gövdesinde önceden çözümleme yok', !s.done);
  fireTimers(h.timers); // 7 sn sayacı ateşle
  await microDrain();
  ok('askı gövdesi zaman aşımıyla çözülür', s.done && s.value && s.value.ok === false
    && s.value.errorKind === 'timeout', JSON.stringify(s.value));
  ok('askı sonrası uçuş içi kilit temizlendi', h.inFlight.size === 0);
  const s2 = settled(h.fetch(VID, ['sponsor'], 120));
  await microDrain();
  ok('kilit sonrası yeni istek gidebiliyor', h.requests.length === 2);
  fireTimers(h.timers); await microDrain();
}

// 'aborted' ve 'error' yanıt olayları — DeArrow/RYD'de var olan kapanış yolları.
for (const ev of ['aborted', 'error']) {
  const h = makeFetchHarness();
  const s = settled(h.fetch(VID, ['sponsor'], 0));
  await microDrain();
  const res = fakeResponse(200);
  h.requests[0].emitResponse(res);
  res.emit(ev);
  await microDrain();
  ok(`yanıt '${ev}' olayı network hatasıyla kapanır`, s.done && s.value.errorKind === 'network', JSON.stringify(s.value));
  ok(`'${ev}' sonrası uçuş içi kilit temiz`, h.inFlight.size === 0);
}

// 404 → negatif önbellek (2 dk); aynı anahtar ikinci çağrıda ağ istemez.
{
  const h = makeFetchHarness();
  const s = settled(h.fetch(VID, ['sponsor'], 0));
  await microDrain();
  const res = fakeResponse(404);
  h.requests[0].emitResponse(res);
  res.emit('end');
  await microDrain();
  ok('404 negatif kayıtla çözülür', s.done && s.value.ok === true && s.value.segments.length === 0);
  const s2 = await h.fetch(VID, ['sponsor'], 0);
  ok('negatif kayıt ikinci çağrıda ağ istemez', h.requests.length === 1 && s2.cached === true);
}

// HTTP 500 → önbelleğe yazılmaz; ikinci çağrı yeni istek yapar.
{
  const h = makeFetchHarness();
  const s = settled(h.fetch(VID, ['sponsor'], 0));
  await microDrain();
  const res = fakeResponse(500);
  h.requests[0].emitResponse(res);
  res.emit('end');
  await microDrain();
  ok('HTTP 500 hata olarak döner', s.done && s.value.ok === false && s.value.errorKind === 'http');
  const s2 = settled(h.fetch(VID, ['sponsor'], 0));
  await microDrain();
  ok('HTTP 500 önbelleğe yazılmadı — yeni istek', h.requests.length === 2);
  fireTimers(h.timers); await microDrain();
}

// Eşzamanlı çağrılar tek istekte birleşir (in-flight dedupe).
{
  const h = makeFetchHarness();
  const s1 = settled(h.fetch(VID, ['sponsor'], 0));
  const s2 = settled(h.fetch(VID, ['sponsor'], 0));
  await microDrain();
  ok('eşzamanlı çağrı tek net.request', h.requests.length === 1);
  const res = fakeResponse(404); h.requests[0].emitResponse(res); res.emit('end');
  await microDrain();
  ok('dedupe iki çağrıyı da çözer', s1.done && s2.done && s1.value.ok && s2.value.ok);
}

// Mutlu yol: gerçek segment yükü → doğrulama + pozitif önbellek.
{
  const h = makeFetchHarness();
  const s = settled(h.fetch(VID, ['sponsor'], 120));
  await microDrain();
  const res = fakeResponse(200);
  const payload = JSON.stringify([{ videoID: VID, videoDuration: 600,
    segments: [{ category: 'sponsor', actionType: 'skip', segment: [10, 20], UUID: 'u1' }] }]);
  h.requests[0].emitResponse(res);
  res.emit('data', Buffer.from(payload));
  res.emit('end');
  await microDrain();
  ok('mutlu yol segment döndürür', s.done && s.value.ok && s.value.segments.length === 1
    && s.value.segments[0].start === 10 && s.value.segments[0].end === 20, JSON.stringify(s.value));
  const s2 = await h.fetch(VID, ['sponsor'], 60);
  ok('pozitif kayıt önbellekten + süreye göre kırpılır', s2.cached === true && h.requests.length === 1);
}

// ============ Anahtar-çakışması + TTL ratchet'leri ============
{
  const c = new SponsorBlockCache();
  const kSkip = c.key(VID, ['sponsor'], 'skip,chapter');
  const kChapter = c.key(VID, ['sponsor'], 'chapter');
  const kEmpty = c.key(VID, [], 'skip,chapter');
  const kBranding = c.key(VID, [], 'branding');
  const kOtherVid = c.key('zzzzzzzzzzz', ['sponsor'], 'skip,chapter');
  const keys = new Set([kSkip, kChapter, kEmpty, kBranding, kOtherVid]);
  ok('anahtar uzayı çakışmasız (kategori/aksiyon/video ayrımı)', keys.size === 5, [...keys].join(' | '));
  ok('kategori sırası normalize edilir', c.key(VID, ['intro', 'sponsor'], 'x') === c.key(VID, ['sponsor', 'intro'], 'x'));
  ok('bilinmeyen kategori anahtara sızamaz', !c.key(VID, ['sponsor', 'bogus'], 'x').includes('bogus'));
}

{
  const c = new SponsorBlockCache({ maxEntries: 3, ttlMs: 1000, negativeTtlMs: 100 });
  const t0 = 1_000_000;
  c.set(VID, ['sponsor'], { v: 1 }, { now: t0, actionType: 'x' });
  ok('TTL sınırında pozitif kayıt geçerli', c.get(VID, ['sponsor'], 'x', t0 + 999) !== null);
  ok('TTL aşımı pozitif kaydı düşürür', c.get(VID, ['sponsor'], 'x', t0 + 1001) === null);
  c.set(VID, ['sponsor'], { v: 2 }, { now: t0, negative: true, actionType: 'x' });
  ok('negatif TTL içinde geçerli', c.get(VID, ['sponsor'], 'x', t0 + 99) !== null);
  ok('negatif TTL daha kısa — 100ms sonrası düşer', c.get(VID, ['sponsor'], 'x', t0 + 101) === null);
  // Negatif → pozitif geçişi zamanı yeniler
  c.set(VID, ['sponsor'], { v: 3 }, { now: t0, negative: true, actionType: 'x' });
  c.set(VID, ['sponsor'], { v: 4 }, { now: t0 + 50, actionType: 'x' });
  ok('negatif→pozitif geçişi pozitif TTL ile yaşar', c.get(VID, ['sponsor'], 'x', t0 + 50 + 999) !== null);
  // LRU: 4. kayıt en eskiyi atar, get() tazeleyeni korur
  const c2 = new SponsorBlockCache({ maxEntries: 2 });
  c2.set('a', [], 1, { now: 0, actionType: 'x' });
  c2.set('b', [], 2, { now: 1, actionType: 'x' });
  c2.get('a', [], 'x', 2); // a'yı tazele
  c2.set('c', [], 3, { now: 3, actionType: 'x' });
  ok('LRU: tazelenen a korunur, b atılır', c2.get('a', [], 'x', 4) !== null && c2.get('b', [], 'x', 4) === null);
}

console.log(`\nsponsorblock-fetch-resilience: ${passed} kontrol geçti`);
process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
