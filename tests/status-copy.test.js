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

console.log('status-copy.test.js OK');
