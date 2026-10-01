// R334 devamı — saf-Node modüllerde kilitlenmemiş EXPORT yüzeyi:
// watch-library-store (parseDocument/migrateWatchDocument/canonicalBrowserUrl/
// extractBundledWatchLibrary/stableJson), settings-security.endpointIdentity,
// pdf-translate (isPdfPageComplete/isStandalonePageNumber),
// browser-subtitle-search.scoreCandidate.
'use strict';
const assert = require('assert');
const wl = require('../src/watch-library-store');
const ss = require('../src/settings-security');
const pdf = require('../src/pdf-translate');
const { scoreCandidate } = require('../src/browser-subtitle-search');

const results = [];
async function t(name, fn) {
  try { await fn(); results.push([name, 'PASS']); }
  catch (e) { results.push([name, `FAIL ${e.message}`]); console.log('FAIL', name, e); }
}

async function t_canonical_url() {
  // gizli sorgu anahtarları + hash atılır; geri kalan korunur
  assert.strictEqual(
    wl.canonicalBrowserUrl('https://ex.com/p?token=abc&ok=2&SIG=x#frag'),
    'https://ex.com/p?ok=2');
  assert.strictEqual(wl.canonicalBrowserUrl('https://ex.com/p?session=s'), 'https://ex.com/p');
  assert.strictEqual(wl.canonicalBrowserUrl('not a url'), '');
  assert.strictEqual(wl.canonicalBrowserUrl(''), '');
  // stableJson deterministik pretty-print
  assert.strictEqual(wl.stableJson({ b: 1 }), '{\n  "b": 1\n}');
}

async function t_parse_document() {
  // sağlam JSON → exact
  const ok = wl.parseDocument('[{"key":"a"}]');
  assert.strictEqual(ok.exact, true);
  assert.deepStrictEqual(ok.value, [{ key: 'a' }]);
  // bozuk parça karantinaya, sağlamlar hayatta
  const salvaged = wl.parseDocument('[{"key":"a"}, {bozuk}, {"key":"b"}]');
  assert.strictEqual(salvaged.exact, false);
  assert.strictEqual(salvaged.value.length, 2);
  assert.strictEqual(salvaged.syntaxQuarantine.length, 1);
  assert.strictEqual(salvaged.syntaxQuarantine[0].index, 1);
  // top-level dizi değilse kurtarma yok
  assert.throws(() => wl.parseDocument('{bozuk'));
  // tümü bozuk → rethrow
  assert.throws(() => wl.parseDocument('[{a},{b}]'));
  // extractBundledWatchLibrary: yedek zarfı
  assert.strictEqual(wl.extractBundledWatchLibrary({ backupVersion: 1, watchLibrary: [] }), null);
  assert.deepStrictEqual(wl.extractBundledWatchLibrary({ backupVersion: 2, watchLibrary: [1] }), [1]);
  assert.strictEqual(wl.extractBundledWatchLibrary(null), null);
}

async function t_migrate_doc() {
  // tanınmayan kök → throw
  assert.throws(() => wl.migrateWatchDocument({ random: true }), /kök şeması/);
  // paket zarfından kurtarma
  const bundled = wl.migrateWatchDocument({ backupVersion: 2, watchLibrary: [{ key: 'file:/a.mp4', lastWatched: 5 }] });
  assert.strictEqual(bundled.document.items.length, 1);
  assert.strictEqual(bundled.report.inputRecords, 1);
  // kanonik anahtar: gizli query atılır
  const doc = wl.migrateWatchDocument([{ key: 'browser:https://x/?token=zzz&p=1' }]);
  assert.strictEqual(doc.document.items[0].key, 'browser:https://x/?p=1');
  // aynı kanonik anahtarlı iki kayıt → dedupe
  const dup = wl.migrateWatchDocument([
    { key: 'file:/a.mp4', lastWatched: 1 },
    { key: 'file:/a.mp4', lastWatched: 9 },
  ]);
  assert.strictEqual(dup.document.items.length, 1);
  assert.strictEqual(dup.report.duplicateRecords, 1);
  // mezar taşı öğeyi siler
  const del = wl.migrateWatchDocument({
    items: [{ key: 'file:/a.mp4' }],
    tombstones: [{ key: 'file:/a.mp4', removedAt: 100 }],
  });
  assert.strictEqual(del.document.items.length, 0);
  assert.strictEqual(del.document.tombstones.length, 1);
  assert.strictEqual(del.report.deletedItems, 1);
  // eski mezar taşı yenisiyle ezilir
  const two = wl.migrateWatchDocument({
    items: [],
    tombstones: [{ key: 'file:/a', removedAt: 5 }, { key: 'file:/a', removedAt: 50 }],
  });
  assert.strictEqual(two.document.tombstones.length, 1);
  assert.strictEqual(two.document.tombstones[0].removedAt, 50);
  // itemLimit → overflowItems
  const over = wl.migrateWatchDocument([{ key: 'file:/a' }, { key: 'file:/b' }], { itemLimit: 1 });
  assert.strictEqual(over.document.items.length, 1);
  assert.strictEqual(over.document.overflowItems.length, 1);
  // şema zemini: düşük sürüm 3'e yükselir
  const floor = wl.migrateWatchDocument({ schemaVersion: 1, items: [] });
  assert.strictEqual(floor.document.schemaVersion, wl.CURRENT_SCHEMA_VERSION);
  // kural-dışı kayıt → karantina + rejectedRecords
  const rej = wl.migrateWatchDocument([{ nokey: 1 }, { key: 'file:/ok' }]);
  assert.strictEqual(rej.report.rejectedRecords, 1);
  assert.strictEqual(rej.document.migrationQuarantine.length, 1);
  assert.strictEqual(rej.document.items.length, 1);
  // sıralama: lastWatched desc
  const sorted = wl.migrateWatchDocument([{ key: 'file:/a', lastWatched: 1 }, { key: 'file:/b', lastWatched: 9 }]);
  assert.strictEqual(sorted.document.items[0].key, 'file:/b');
}

async function t_endpoint_identity() {
  assert.strictEqual(ss.endpointIdentity({ endpointPreset: 'custom', customBaseUrl: 'HTTPS://X.COM/v1' }), 'custom:https://x.com/v1');
  assert.strictEqual(ss.endpointIdentity({ endpointPreset: 'openai' }), 'preset:openai');
  assert.strictEqual(ss.endpointIdentity({}, { defaultPreset: 'deepL' }), 'preset:deepL');
  assert.strictEqual(ss.endpointIdentity({}), '');
  assert.strictEqual(ss.endpointIdentity(null), '');
  assert.strictEqual(ss.endpointIdentity({ endpointPreset: 'inherit' }, { inherited: 'preset:parent' }), 'preset:parent');
  // ui fallback yalnız uiKeys verilince
  assert.strictEqual(ss.endpointIdentity({}, { ui: { a: 'custom', b: 'http://h' }, uiKeys: ['a', 'b'] }), 'custom:http://h');
  assert.strictEqual(ss.endpointIdentity({}, { ui: { a: 'custom' } }), '', 'uiKeys yok → ui okunmaz');
  // grup alanı ui'ı geçersiz kılar
  assert.strictEqual(ss.endpointIdentity({ endpointPreset: 'x' }, { ui: { a: 'custom' }, uiKeys: ['a'] }), 'preset:x');
}

async function t_pdf_gates() {
  assert.strictEqual(pdf.isPdfPageComplete([{ status: 'translated' }, { status: 'skipped' }]), true);
  assert.strictEqual(pdf.isPdfPageComplete([{ status: 'pending' }]), false);
  assert.strictEqual(pdf.isPdfPageComplete([]), true, 'boş sayfa tamamlanmış sayılır');
  assert.strictEqual(pdf.isPdfPageComplete(null), false);
  assert.strictEqual(pdf.isStandalonePageNumber('12'), true);
  assert.strictEqual(pdf.isStandalonePageNumber('— 12 —'), true);
  assert.strictEqual(pdf.isStandalonePageNumber('Sayfa 3'), true);
  assert.strictEqual(pdf.isStandalonePageNumber('page iv'), true, 'Roma rakamı');
  assert.strictEqual(pdf.isStandalonePageNumber('5 of 9'), true);
  assert.strictEqual(pdf.isStandalonePageNumber('5/9'), true);
  assert.strictEqual(pdf.isStandalonePageNumber('s. 7'), true);
  assert.strictEqual(pdf.isStandalonePageNumber('hello 12'), false);
  assert.strictEqual(pdf.isStandalonePageNumber('123456'), false, '6 basamak sınırı');
  assert.strictEqual(pdf.isStandalonePageNumber('chapter 2'), false);
  assert.strictEqual(pdf.isStandalonePageNumber(''), false);
}

async function t_score_candidate() {
  const target = { query: 'The Matrix', season: 1, episode: 2, language: 'tr', release: 'bluray' };
  const mk = (attrs) => ({ attributes: attrs });
  // sıfır sinyal
  assert.strictEqual(scoreCandidate(mk({}), { query: 'x' }), 0);
  // hash eşleşmesi en güçlü
  assert.strictEqual(scoreCandidate(mk({ moviehash_match: true }), { query: 'x' }), 100);
  // tam başlık
  const full = mk({
    moviehash_match: true,
    feature_details: { title: 'The Matrix', season_number: 1, episode_number: 2 },
    language: 'tr',
    release: 'bluray',
  });
  assert.strictEqual(scoreCandidate(full, target), 100 + 50 + 15 + 15 + 10 + 25);
  // kısmi başlık + kısmi sürüm
  const partial = mk({ feature_details: { title: 'The Matrix Reloaded' }, release: 'x264-bluray-rip' });
  assert.strictEqual(scoreCandidate(partial, target), 30 + 12);
  // dil varyantı: 'tr' hedef ↔ 'tr-TR' aday eşleşir
  assert.strictEqual(scoreCandidate(mk({ language: 'tr-TR' }), { language: 'tr' }), 10);
  assert.strictEqual(scoreCandidate(mk({ language: 'en' }), { language: 'tr' }), 0);
  // sezon uyuşmazsa puan yok
  assert.strictEqual(scoreCandidate(mk({ feature_details: { season_number: 9 } }), target), 0);
}

async function main() {
  await t('t_canonical_url', t_canonical_url);
  await t('t_parse_document', t_parse_document);
  await t('t_migrate_doc', t_migrate_doc);
  await t('t_endpoint_identity', t_endpoint_identity);
  await t('t_pdf_gates', t_pdf_gates);
  await t('t_score_candidate', t_score_candidate);
  const failed = results.filter(([, s]) => s !== 'PASS');
  console.log(`exported-deadzone: ${results.length - failed.length} senaryo geçti`);
  if (failed.length) process.exit(1);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
