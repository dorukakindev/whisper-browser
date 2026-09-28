'use strict';

const assert = require('assert');
const copy = require('../src/renderer/status-copy');

assert.strictEqual(copy.subtitleSearch('en', { failed: true }),
  'Search failed — see the status above for details. You can try again.');
assert.strictEqual(copy.subtitleSearch('tr', { visibleCount: 0 }),
  'Eşleşen altyazı bulunamadı. Başlığı veya dili değiştirin.');
assert.match(copy.subtitleSearch('en', { visibleCount: 50, totalCount: 82, hashMatch: true }),
  /50 candidates \(showing the first results from 82.+File fingerprint matches appear first\./);
assert.match(copy.subtitleSearch('tr', { visibleCount: 3, totalCount: 3 }), /^3 aday ·/);

assert.strictEqual(copy.clock(65.9), '1:05');
assert.strictEqual(copy.burnIn('en', { type: 'start' }), 'Preparing subtitle embed…');
assert.strictEqual(copy.burnIn('tr', { type: 'cancel' }), 'İptal ediliyor…');
assert.strictEqual(copy.burnIn('en', { type: 'progress', percent: 25.4, current: 65, total: 130 }),
  'Embedding… 25% · 1:05 / 2:10');
assert.strictEqual(copy.burnIn('tr', { type: 'progress', percent: 1, current: 7 }), 'Gömülüyor… 0:07');
assert.strictEqual(copy.burnIn('en', { type: 'done' }), 'Completed ✓');

// systemError: teknik hata parçaları dostu dile çevrilir, ham ayrıntı korunur
assert.strictEqual(copy.systemError('tr', ''), 'Bilinmeyen hata.');
assert.strictEqual(copy.systemError('en', null), 'Unknown error.');
assert.match(copy.systemError('tr', "ENOENT: no such file or directory, open 'D:\\a\\f.srt'"),
  /^Dosya veya komut bulunamadı\. \(ENOENT/);
assert.match(copy.systemError('en', 'Error: EACCES: permission denied, open'),
  /^Permission denied .*\(Error: EACCES/);
assert.match(copy.systemError('tr', 'connect ETIMEDOUT 93.184.216.34:443'),
  /^Bağlantı zaman aşımına uğradı\./);
assert.match(copy.systemError('en', 'net::ERR_NAME_NOT_RESOLVED'),
  /^Could not resolve the host/);
assert.match(copy.systemError('tr', 'Error: spawn C:\\venv\\python.exe ENOENT'),
  /Dosya veya komut bulunamadı\./);
assert.match(copy.systemError('en', 'request to https://x failed, reason: connect ECONNREFUSED'),
  /^Connection refused/);
assert.match(copy.systemError('tr', 'self signed certificate in certificate chain'),
  /^Güvenlik sertifikası doğrulanamadı\./);
// Zaten dost/Türkçe olan veya tanınmayan mesajlar birebir geçer
assert.strictEqual(copy.systemError('tr', 'Python sanal ortamı bulunamadı.'),
  'Python sanal ortamı bulunamadı.');
assert.strictEqual(copy.systemError('en', 'Özel sağlayıcı hatası'), 'Özel sağlayıcı hatası');
// Uzun ham ayrıntı 160 karakterde kesilir
const long = `ENOENT ${'x'.repeat(300)}`;
assert.ok(copy.systemError('en', long).length < 220, 'uzun ayrıntı kısaltılmalı');

console.log('status-copy.test.js OK');
