'use strict';
// R294: status-copy err_* / browserLoadError EN-TR tam kapsama ratchet'i.
// (1) Kullanıcıya ulaşan teknik hata kodları dostu metne çevrilir (ham kod
//     düşmez); (2) üretilen her messageKey için EN şablonu mevcuttur;
//     (3) browserLoadError'un sık Chromium errno kümesi generik kalmaz.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(repo, 'src/main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(repo, 'src/renderer/renderer.js'), 'utf8');
const StatusCopy = require(path.join(repo, 'src/renderer/status-copy.js'));

let checks = 0;
function ok(cond, label) { checks += 1; assert.ok(cond, label); }

// —— browserLoadError: üretim fonksiyonu dilimlenip gerçek davranışı sınanır ——
const loadFn = vm.runInNewContext(
  main.slice(main.indexOf('function browserLoadError('), main.indexOf('function browserTabForWebContents('))
  + '\nbrowserLoadError');

// Sık görülen errno kümesi — hiçbiri 'generic' kalmamalı (errno + açıklama yolu).
const CASES = [
  [-105, 'net::ERR_NAME_NOT_RESOLVED'],
  [-106, 'net::ERR_INTERNET_DISCONNECTED'],
  [-118, 'net::ERR_CONNECTION_TIMED_OUT'],
  [-138, 'net::ERR_NETWORK_ACCESS_DENIED'],
  [-356, 'net::ERR_QUIC_PROTOCOL_ERROR'],
  [-102, 'net::ERR_CONNECTION_REFUSED'],
  [-501, 'net::ERR_INSECURE_RESPONSE'],
  [-111, 'net::ERR_TUNNEL_CONNECTION_FAILED'],
  [-130, 'net::ERR_PROXY_CONNECTION_FAILED'],
  [-367, 'net::ERR_PROXY_AUTH_REQUESTED_WITH_NO_CONNECTION'],
  [-109, 'net::ERR_ADDRESS_UNREACHABLE'],
  [-310, 'net::ERR_TOO_MANY_REDIRECTS'],
  [-311, 'net::ERR_UNSAFE_REDIRECT'],
  [-20, 'net::ERR_BLOCKED_BY_CLIENT'],
  [-27, 'net::ERR_BLOCKED_BY_RESPONSE'],
  [-24, 'net::ERR_BLOCKED_BY_ADMINISTRATOR'],
  [-101, 'net::ERR_CONNECTION_RESET'],
  [-100, 'net::ERR_CONNECTION_CLOSED'],
  [-103, 'net::ERR_CONNECTION_ABORTED'],
  [-107, 'net::ERR_SSL_PROTOCOL_ERROR'],
  [-113, 'net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH'],
  [-324, 'net::ERR_EMPTY_RESPONSE'],
  [-21, 'net::ERR_NETWORK_CHANGED'],
  [-300, 'net::ERR_INVALID_URL'],
  [-301, 'net::ERR_DISALLOWED_URL_SCHEME'],
];
for (const [code, desc] of CASES) {
  const r = loadFn(code, desc);
  ok(r && typeof r.message === 'string' && r.message.length > 0, `${desc}: TR mesaj boş`);
  ok(r.messageKey && r.messageKey !== 'generic', `${desc}: generic kaldı`);
  ok(!/ERR_[A-Z_]+/.test(r.message), `${desc}: TR mesaj ham kod içeriyor`);
}
// errno'su bilinmeyen ama açıklaması tanınan yollar da eşleşmeli
for (const desc of ['net::ERR_PROXY_CONNECTION_FAILED', 'net::ERR_TOO_MANY_REDIRECTS',
  'net::ERR_SSL_PROTOCOL_ERROR', 'net::ERR_CONNECTION_RESET']) {
  ok(loadFn(NaN, desc).messageKey !== 'generic', `${desc}: açıklama yolu generik`);
}
// Aborted yüklemeler kullanıcıya hata gibi yansımaz — tanınan küme dışında generik de kalabilir
ok(loadFn(-3, 'net::ERR_ABORTED').messageKey === 'generic', 'ERR_ABORTED generik kalmalı');

// —— messageKey ↔ BROWSER_ERROR_EN eşleşmesi (statik, gelecekteki drift'i de yakalar) ——
const enBlock = renderer.slice(renderer.indexOf('const BROWSER_ERROR_EN = {'), renderer.indexOf('function browserErrorText('));
const enMap = vm.runInNewContext(enBlock.replace('const BROWSER_ERROR_EN = {', '({').replace(/};\s*$/, '})'));
const enKeys = new Set(Object.keys(enMap));

const producers = ['src/main.js', 'src/browser-lifecycle-policy.js'];
const usedKeys = new Set();
for (const rel of producers) {
  const src = fs.readFileSync(path.join(repo, rel), 'utf8');
  for (const m of src.matchAll(/messageKey:\s*'([a-z-]+)'/g)) usedKeys.add(m[1]);
  for (const m of src.matchAll(/messageKey\s*=\s*'([a-z-]+)'/g)) usedKeys.add(m[1]);
}
for (const key of usedKeys) {
  if (key === 'generic') continue; // generik yol ham açıklamayı basar — bilinçli
  ok(enKeys.has(key), `BROWSER_ERROR_EN eksik: ${key}`);
}
// Her EN şablonu params'sız da anlamlı metin üretmeli
for (const [key, tpl] of Object.entries(enMap)) {
  const out = typeof tpl === 'function' ? tpl({}) : String(tpl);
  ok(typeof out === 'string' && out.length > 0, `EN şablonu boş/çöktü: ${key}`);
}

// —— systemError: err_* aile kapsaması ——
// Kapsanması gereken dizgiler: kural eşleşmeli (çıktı girdiden farklı).
const COVERED = [
  'net::ERR_NAME_NOT_RESOLVED', 'net::ERR_INTERNET_DISCONNECTED',
  'net::ERR_CONNECTION_TIMED_OUT', 'net::ERR_CONNECTION_REFUSED',
  'net::ERR_CONNECTION_RESET', 'net::ERR_CONNECTION_CLOSED',
  'net::ERR_CONNECTION_ABORTED', 'net::ERR_NETWORK_CHANGED',
  'net::ERR_NETWORK_ACCESS_DENIED', 'net::ERR_QUIC_PROTOCOL_ERROR',
  'net::ERR_PROXY_CONNECTION_FAILED', 'net::ERR_TUNNEL_CONNECTION_FAILED',
  'net::ERR_PROXY_AUTH_REQUESTED_WITH_NO_CONNECTION',
  'net::ERR_ADDRESS_UNREACHABLE', 'net::ERR_ADDRESS_IN_USE',
  'net::ERR_TOO_MANY_REDIRECTS', 'net::ERR_INVALID_REDIRECT',
  'net::ERR_BLOCKED_BY_CLIENT', 'net::ERR_BLOCKED_BY_RESPONSE',
  'net::ERR_BLOCKED_BY_ADMINISTRATOR',
  'net::ERR_SSL_PROTOCOL_ERROR', 'net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH',
  'net::ERR_CERT_AUTHORITY_INVALID', 'net::ERR_CERT_DATE_INVALID',
  'net::ERR_INSECURE_RESPONSE', 'net::ERR_EMPTY_RESPONSE',
  'net::ERR_INVALID_URL', 'net::ERR_DISALLOWED_URL_SCHEME',
  'net::ERR_UNKNOWN_URL_SCHEME', 'net::ERR_UNSAFE_PORT',
  'net::ERR_ABORTED', 'net::ERR_FILE_NOT_FOUND', 'net::ERR_ACCESS_DENIED',
  'net::ERR_UPLOAD_FILE_CHANGED', 'net::ERR_DISK_FULL', 'net::ERR_H2_OR_QUIC_REQUIRED',
  'ENOENT: no such file or directory', 'spawn ffmpeg ENOENT',
  'EACCES: permission denied', 'ENOSPC: no space left on device',
  'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN',
  'ENOTFOUND', 'EBUSY: resource busy', 'EMFILE: too many open files',
  'AbortError: The operation was aborted', 'NotAllowedError: Permission denied',
];
for (const raw of COVERED) {
  for (const locale of ['tr', 'en']) {
    const out = StatusCopy.systemError(locale, raw);
    ok(out !== raw, `kural eşleşmedi (${locale}): ${raw}`);
    ok(out.includes(raw.slice(0, 40)) || out.includes('('), `ham ayrıntı kayboldu (${locale}): ${raw}`);
  }
}
// Bilinmeyen girdiler olduğu gibi geçer (parantez eklenmez)
for (const raw of ['Bilinmeyen arıza 17', 'net::ERR_WINSOCK_UNEXPECTED_WRITTEN_BYTES', 'totally opaque string']) {
  assert.strictEqual(StatusCopy.systemError('tr', raw), raw);
  assert.strictEqual(StatusCopy.systemError('en', raw), raw);
}
assert.strictEqual(StatusCopy.systemError('tr', ''), 'Bilinmeyen hata.');
assert.strictEqual(StatusCopy.systemError('en', ''), 'Unknown error.');
checks += 8;
// Spot içerik kontrolleri
assert.match(StatusCopy.systemError('tr', 'net::ERR_PROXY_CONNECTION_FAILED'), /[Pp]roxy/);
assert.match(StatusCopy.systemError('tr', 'net::ERR_TOO_MANY_REDIRECTS'), /yönlendirme/);
assert.match(StatusCopy.systemError('en', 'net::ERR_SSL_PROTOCOL_ERROR'), /SSL/);
assert.match(StatusCopy.systemError('en', 'net::ERR_CONNECTION_TIMED_OUT'), /timed out/i);
assert.match(StatusCopy.systemError('tr', 'net::ERR_CONNECTION_TIMED_OUT'), /zaman aşım/);
checks += 5;

console.log(`PASS: err-coverage-ratchet (${checks} kontrol)`);
