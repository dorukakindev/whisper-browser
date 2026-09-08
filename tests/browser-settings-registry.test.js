const assert = require('node:assert/strict');

const registry = require('../src/browser-settings-registry');

assert(registry.list().length >= 20, 'Registry kategori değil, ayar başına kayıt içermeli.');
for (const entry of registry.list()) {
  assert.deepEqual(Object.keys(entry).sort(),
    ['category', 'description', 'id', 'keywords', 'label', 'scope'],
    `${entry.id} kaydı eksik veya beklenmeyen alan içeriyor.`);
  assert(entry.id && entry.label && entry.description && entry.category && entry.scope,
    `${entry.id || 'isimsiz kayıt'} açıklayıcı alanlarını doldurmalı.`);
  assert(Array.isArray(entry.keywords) && entry.keywords.length,
    `${entry.id} aranabilir anahtar kelime içermeli.`);
}

assert.deepEqual(registry.categories().map((entry) => entry.id),
  ['site', 'translation', 'privacy', 'session', 'system']);

const sponsorIds = registry.search('sponsor').map((entry) => entry.id);
assert(sponsorIds.includes('browserSponsorMode'));
assert(sponsorIds.includes('browserSponsorCategories'));
assert(!sponsorIds.includes('browserAdblockEnabled'),
  'Arama yalnız kategori kartına değil, eşleşen ayarlara gitmeli.');
assert(registry.search('gizlilik').some((entry) => entry.id === 'browserAdblockEnabled'));
assert(registry.search('engelle').some((entry) => entry.id === 'browserAdblockEnabled'));
assert(registry.search('SponsorBlock').some((entry) => entry.id === 'browserSponsorMode'));

assert(registry.search('donanim').some((entry) => entry.id === 'browserHardwareAcceleration'),
  'Türkçe karakter kullanılmadan yapılan arama Donanım hızlandırmayı bulmalı.');
assert(registry.search('görünüm').some((entry) => entry.id === 'browserPreferredSubtitleMode'),
  'Türkçe karakterli arama ilgili görünüm ayarını bulmalı.');
assert(registry.search('ceviri').some((entry) => entry.id === 'browserPageTarget'),
  'Aksansız arama Türkçe çeviri kayıtlarını bulmalı.');

assert.equal(registry.browserSettingScopeStatus('global'), '',
  'Kapsam katmanı olmayan ayara sahte rozet verilmemeli.');
assert.equal(registry.browserSettingScopeStatus('site-profile', {
  selectedScope: 'site', origin: 'https://ornek.test', hasOverride: true, value: '%110',
}), 'Bu site için özel: %110');
assert.equal(registry.browserSettingScopeStatus('site-profile', {
  selectedScope: 'site', origin: 'https://ornek.test', hasOverride: false, value: '%100',
}), 'Varsayılanı izliyor: %100');
assert.equal(registry.browserSettingScopeStatus('site-profile', {
  selectedScope: 'tab', origin: 'https://ornek.test', hasOverride: true,
}), 'Bu sekme için özel');
assert.equal(registry.browserSettingScopeStatus('site-profile', { selectedScope: 'site' }),
  'Önce bir site açın');

const autoSkip = registry.list().find((entry) => entry.id === 'browserAutoSkipAds');
assert(autoSkip && autoSkip.category === 'privacy' && autoSkip.scope === 'global',
  'Otomatik video reklamı atlama ayarı global Gizlilik kaydı olmalı.');
assert(registry.search('otomatik atla').some((entry) => entry.id === 'browserAutoSkipAds'));

console.log('browser-settings-registry: Türkçe arama ve kapsam testleri geçti.');
