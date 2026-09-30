// R323-4 — URL/host normalizasyon fuzz'ı (50'lik gece kuyruğu).
// Hedefler:
//   - isLocalInvidiousInstance (main.js, vm-dilim): SID'in http'de yalnızca
//     gerçekten yerel/özel host'a gitmesi — '127.evil.com' sahteciliği (B-323-02)
//   - safePlaceUrl / redactUrlSensitiveParams (browser-place-url): credential,
//     hassas parametre (sorgu + ;path + hash-route), OAuth-fragment reddi
//   - normalizeBrowserUrl (browser-media-identity): IDN kanonikleştirme,
//     credential sıyırma, parametre sıralama, idempotans
//   - hostMatches: nokta-sınırlı suffix eşleşmesi
// Oracle'lar bağımsızdır — modül regex'lerini tekrar yazmayız.

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { safePlaceUrl, redactUrlSensitiveParams } = require('../src/browser-place-url');
const { normalizeBrowserUrl, isAmazonHost, canonicalMediaIdentity } = require('../src/browser-media-identity');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (e) { console.error(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const fnMatch = mainSrc.match(/function isLocalInvidiousInstance\(instance\) \{[\s\S]*?\n\}/);
assert(fnMatch, 'isLocalInvidiousInstance bulunamadı');
const sandbox = { URL, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(`globalThis.isLocalInvidiousInstance = ${fnMatch[0]}`, sandbox);
const isLocal = sandbox.isLocalInvidiousInstance;

// =========================================================================
// Bölüm A — isLocalInvidiousInstance (SID kapısı)
// =========================================================================

test('B-323-02: sayısal-önekli DNS sahteleri SID alamaz', () => {
  // WHATWG host parser '127.evil.com'u alan adı olarak BIRAKIR — önceki
  // /^127\./ önek kontrolü bunu yerel sayıyordu.
  const spoofs = [
    'http://127.evil.com/', 'http://127.0.0.1.evil.com/', 'http://10.evil.com/',
    'http://192.168.evil.com/', 'http://192.168.1.evil.com/', 'http://172.16.evil.com/',
    'http://172.31.attacker.io/', 'http://0x7f.evil.com/', 'http://2130706433.evil.com/',
  ];
  for (const url of spoofs) {
    assert.equal(isLocal(url), false, `${url} yerel sayılmamalı`);
  }
});

test('gerçek yerel hostlar SID almaya devam eder', () => {
  const locals = [
    'http://127.0.0.1:3000/', 'http://127.1/', 'http://10.0.0.5/',
    'http://192.168.1.10/', 'http://172.16.0.1/', 'http://172.31.255.254/',
    'http://localhost:3000/', 'http://pi.local/', 'http://[::1]/',
    'http://[fc00::1]/', 'http://[fd12::8]/',
  ];
  for (const url of locals) {
    assert.equal(isLocal(url), true, `${url} yerel olmalı`);
  }
  // IPv4 kısa/hex/octal/dword biçimleri parser'da kanonikleşir → yerel.
  for (const url of ['http://2130706433/', 'http://0x7f.1/', 'http://0177.0.0.1/']) {
    assert.equal(isLocal(url), true, `${url} kanonik IPv4 yerel`);
  }
});

test('sınır ve genel durumlar: https her zaman, dış host hiçbir zaman', () => {
  assert.equal(isLocal('https://youtube.com/'), true);
  assert.equal(isLocal('https://127.evil.com/'), true); // https'te kapı açık — SID gitmez kural http'ye
  assert.equal(isLocal('http://youtube.com/'), false);
  assert.equal(isLocal('http://8.8.8.8/'), false);
  assert.equal(isLocal('http://172.15.0.1/'), false);
  assert.equal(isLocal('http://172.32.0.1/'), false);
  assert.equal(isLocal('http://169.254.1.1/'), false); // link-local kapsam dışı — bilinçli
  assert.equal(isLocal('ftp://127.0.0.1/'), false);
  assert.equal(isLocal('http://[::ffff:7f00:1]/'), false); // IPv4-mapped IPv6 sayılmaz
  assert.equal(isLocal(''), false);
  assert.equal(isLocal('not a url'), false);
});

// =========================================================================
// Bölüm B — safePlaceUrl + redactUrlSensitiveParams
// =========================================================================

test('safePlaceUrl: credential + hassas parametre (sorgu, ;path, hash-route) temizlenir', () => {
  const out = safePlaceUrl('https://user:pass@video.site/x;jsessionid=ABC/y?sig=K&safe=1&utm_c=z#/play?token=T&q=2');
  assert.ok(out.startsWith('https://video.site/'), out);
  assert.ok(!/user|pass|sig=K|jsessionid|utm_c|token=T/i.test(out), `sızıntı: ${out}`);
  assert.ok(out.includes('safe=1'), 'güvenli parametre korunur');
  assert.ok(out.includes('#/play'), 'SPA route korunur');
});

test('safePlaceUrl: OAuth-fragment ve rota-olmayan hash atılır', () => {
  assert.equal(safePlaceUrl('https://a.b/c#access_token=XYZ'), 'https://a.b/c');
  assert.equal(safePlaceUrl('https://a.b/c#frag'), 'https://a.b/c');
  assert.equal(safePlaceUrl('https://a.b/c#t=123'), 'https://a.b/c#t=123');
  assert.equal(safePlaceUrl('https://a.b/c#start=1h2m3s'), 'https://a.b/c#start=1h2m3s');
});

test('safePlaceUrl: şema kapısı + 8192 sınırı + idempotans fuzz', () => {
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x',
    'ftp://h/p', '://kırık', '', null, 42]) {
    assert.equal(safePlaceUrl(bad), '', `${bad} reddedilmeli`);
  }
  assert.equal(safePlaceUrl('https://a.b/' + 'x'.repeat(9000)), '');
  const rnd = mulberry32(20260930);
  const keys = ['token', 'sid', 'utm_a', 'ref', 'keep', 'v', 'X-Amz-Signature'];
  for (let t = 0; t < 400; t++) {
    const params = [];
    for (let k = 0; k < rnd() * 8; k++) params.push(`${keys[Math.floor(rnd() * keys.length)]}=${t}${k}`);
    const raw = `https://host${t}.test/p${t}?${params.join('&')}${rnd() < 0.3 ? '#/r?sig=x&ok=1' : ''}`;
    const once = safePlaceUrl(raw);
    if (once === '') continue;
    assert.equal(safePlaceUrl(once), once, `idempotans bozuldu: ${once}`);
    const u = new URL(once);
    for (const k of u.searchParams.keys()) {
      assert.ok(!/token|sid|utm_|^ref$|x-amz|sig/i.test(k), `hassas anahtar kaldı: ${k}`);
    }
  }
});

test('redactUrlSensitiveParams: değişiklik yoksa ham adres aynen döner', () => {
  const raw = 'https://a.b/c%20d?q=1';
  assert.equal(redactUrlSensitiveParams(raw), raw);
  const redacted = redactUrlSensitiveParams('https://a.b/?sig=x&ok=1#access_token=y');
  assert.ok(!/sig=x|access_token/.test(redacted), redacted);
  assert.ok(redacted.includes('ok=1'));
});

// =========================================================================
// Bölüm C — normalizeBrowserUrl: IDN/punycode + kanonikleştirme
// =========================================================================

test('IDN: NFC/NFD/büyük-harf aynı punycode kimliğe iner', () => {
  const nfc = normalizeBrowserUrl('https://MÜNCHEN.DE/x');
  const nfd = normalizeBrowserUrl('https://münchen.de/x'.normalize('NFD'));
  const mixed = normalizeBrowserUrl('https://müNCHEN.de/x');
  assert.equal(nfc, 'https://xn--mnchen-3ya.de/x');
  assert.equal(nfc, nfd);
  assert.equal(nfc, mixed);
});

test('credential + tracking sıyırma, sıralama, idempotans fuzz', () => {
  assert.equal(normalizeBrowserUrl('https://u:p@h.test/'), 'https://h.test/');
  const rnd = mulberry32(31337);
  const keys = ['sig', 'utm_q', 'fbclid', 'token', 'keep', 'zeta', 'alpha'];
  for (let t = 0; t < 400; t++) {
    const n = Math.floor(rnd() * 7);
    const params = [];
    for (let i = 0; i < n; i++) params.push(`${keys[Math.floor(rnd() * keys.length)]}=${i}`);
    const url = `https://H${t}.TEST:443/a//b/?${params.join('&')}`;
    const once = normalizeBrowserUrl(url);
    if (!once) continue;
    assert.equal(normalizeBrowserUrl(once), once, `idempotans: ${once}`);
    const u = new URL(once);
    assert.equal(u.hostname, u.hostname.toLowerCase());
    assert.equal(u.username, '');
    for (const k of u.searchParams.keys()) {
      assert.ok(!/sig|utm|fbclid|token/i.test(k), `${k} kaldı`);
    }
  }
  // :443 https'te düşer, ardışık / korunur (path 'a//b/' → 'a//b')
  const out = normalizeBrowserUrl('https://h.test:443/a//b/');
  assert.equal(out, 'https://h.test/a//b');
});

test('SPA hash-route korunur; düz hash ve uzun adres', () => {
  assert.ok(normalizeBrowserUrl('https://st.test/#/player/abc').includes('#/player/abc'));
  assert.ok(normalizeBrowserUrl('https://st.test/#!/x').includes('#!/x'));
  assert.equal(normalizeBrowserUrl('https://st.test/#frag'), 'https://st.test/');
  // 16384+ kesimi geçerli URL kalır (kesim sırasında bozulmaz)
  const long = normalizeBrowserUrl('https://h.test/' + 'a'.repeat(20000));
  assert.ok(long.length <= 16384);
  assert.equal(normalizeBrowserUrl('javascript:alert(1)'), '');
});

test('hostMatches (isAmazonHost üzerinden): yalnız nokta-sınırlı suffix', () => {
  assert.equal(isAmazonHost('amazon.com'), true);
  assert.equal(isAmazonHost('www.amazon.com'), true);
  assert.equal(isAmazonHost('evilamazon.com'), false);
  assert.equal(isAmazonHost('amazon.com.evil.com'), false);
  assert.equal(isAmazonHost('amazon.co.uk'), true); // ayrı suffix girdisi
});

// =========================================================================
// Bölüm D — kanonik kimlik dağılımı (hafif stres)
// =========================================================================

test('canonicalMediaIdentity: credential/tracking varyantları tek kimliğe iner', () => {
  const a = canonicalMediaIdentity('https://User:Pass@example.com/watch?v=abc&utm_x=1');
  const b = canonicalMediaIdentity('https://example.com/watch?v=abc&fbclid=y');
  assert.equal(a.key, b.key);
});

console.log(`url-host-fuzz: ${passed}/${passed} OK`);
