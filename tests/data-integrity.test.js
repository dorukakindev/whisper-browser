'use strict';
// Madde 35 — veri bütünlüğü denetimi: kırık ilişki, mükerrer kimlik ve bozuk
// kayıt taraması; onarım önizlemesi ve onaylı + yedekli uygulama kilitlenir.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { auditUserData, applyRepairs } = require('../src/data-integrity');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  PASS  ${name}`); }
const j = (o) => JSON.stringify(o, null, 2);
const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-'));
const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

// ---------- temiz dizin → bulgu yok ----------
test('boş userData dizini sorunsuz taranır', () => {
  const { issues } = auditUserData(fresh());
  assert.deepStrictEqual(issues, []);
});

// ---------- bozuk dosya + sağlam .bak → onarılabilir ----------
test('bozuk birincil + sağlam .bak → corrupt-file onarılabilir bulgu', () => {
  const root = fresh();
  fs.writeFileSync(path.join(root, 'watch-library.json'), '{bozuk json', 'utf8');
  fs.writeFileSync(path.join(root, 'watch-library.json.bak'), j({ schemaVersion: 3, items: [] }), 'utf8');
  const { issues } = auditUserData(root);
  const hit = issues.find((i) => i.kind === 'corrupt-file' && i.store === 'watch-library.json');
  assert.ok(hit, 'bulgu bekleniyordu');
  assert.strictEqual(hit.severity, 'error');
  assert.deepStrictEqual(hit.repair, { type: 'restore-backup', store: 'watch-library.json' });
});

test('bozuk birincil + bozuk .bak → onarım planı yok', () => {
  const root = fresh();
  fs.writeFileSync(path.join(root, 'browser-notes.json'), 'bozuk', 'utf8');
  fs.writeFileSync(path.join(root, 'browser-notes.json.bak'), 'yine bozuk', 'utf8');
  const { issues } = auditUserData(root);
  const hit = issues.find((i) => i.id === 'corrupt-file:browser-notes.json');
  assert.ok(hit);
  assert.strictEqual(hit.repair, null);
});

// ---------- mükerrer kayıtlar ----------
test('izleme kütüphanesi kanonik-anahtar mükerreri raporlanır ve en yeni kalır', () => {
  const root = fresh();
  const items = [
    { key: 'file:///C:/Media/A.mp4', title: 'Eski', lastWatched: 10 },
    { key: 'file:///d:/other.mp4', title: 'Tekil', lastWatched: 5 },
    { key: 'file:///c:\\media\\a.mp4', title: 'Yeni', lastWatched: 99 }, // kanonik eş
  ];
  fs.writeFileSync(path.join(root, 'watch-library.json'), j({ schemaVersion: 3, items }), 'utf8');
  const { issues } = auditUserData(root);
  const dup = issues.find((i) => i.kind === 'duplicate' && i.store === 'watch-library.json');
  assert.ok(dup, 'mükerrer bulgu');
  const report = applyRepairs(root, [dup.id]);
  assert.deepStrictEqual(report.applied, [dup.id]);
  const merged = read(root, 'watch-library.json').items;
  assert.strictEqual(merged.length, 2);
  const kept = merged.find((m) => m.title !== 'Tekil');
  assert.strictEqual(kept.title, 'Yeni', 'en yeni kayıt kalmalı');
  assert.ok(fs.existsSync(path.join(root, 'watch-library.json.integrity.bak')), 'yedek üretildi');
});

test('katalog mükerrer id + oturum mükerrer sekme dedupe kilitleri', () => {
  const root = fresh();
  fs.writeFileSync(path.join(root, 'media-catalog.json'), j({ version: 1, items: [
    { id: 'm1', title: 'A', kind: 'film', updatedAt: 1 },
    { id: 'm1', title: 'A2', kind: 'film', updatedAt: 50 },
    { id: 'm2', title: 'B', kind: 'film', updatedAt: 2 },
  ] }), 'utf8');
  fs.writeFileSync(path.join(root, 'browser-session.json'), j({ version: 8, tabs: [
    { id: 't1', url: 'u' }, { id: 't2', url: 'v' }, { id: 't1', url: 'w' },
  ] }), 'utf8');
  const { issues } = auditUserData(root);
  const catDup = issues.find((i) => i.id === 'dup-catalog:m1');
  const tabDup = issues.find((i) => i.id === 'dup-tab:t1');
  assert.ok(catDup && tabDup);
  const report = applyRepairs(root, [catDup.id, tabDup.id]);
  assert.strictEqual(report.applied.length, 2);
  const items = read(root, 'media-catalog.json').items;
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items.find((i) => i.id === 'm1').title, 'A2');
  assert.strictEqual(read(root, 'browser-session.json').tabs.length, 2);
});

// ---------- kırık ilişkiler ----------
test('kayıp altyazı yolu → broken-relation + prune-paths onarımı', () => {
  const root = fresh();
  const exists = path.join(root, 'ok.srt');
  fs.writeFileSync(exists, '1\n00:00:01,000 --> 00:00:02,000\nx\n', 'utf8');
  const gone = path.join(root, 'tasindi', 'kayip.srt');
  fs.writeFileSync(path.join(root, 'watch-library.json'), j([
    { key: 'file:///v.mp4', title: 'V', subtitlePaths: [exists, gone] },
  ]), 'utf8');
  const { issues } = auditUserData(root);
  const hit = issues.find((i) => i.kind === 'broken-relation');
  assert.ok(hit, 'kırık ilişki bulgu');
  assert.strictEqual(hit.repair.type, 'prune-paths');
  applyRepairs(root, [hit.id]);
  const items = read(root, 'watch-library.json');
  assert.deepStrictEqual(items[0].subtitlePaths, [exists]);
});

test('kayıp yerel medya kaynağı raporlanır ama silinmez', () => {
  const root = fresh();
  const missing = path.join(root, 'mov', 'film.mp4');
  fs.writeFileSync(path.join(root, 'media-catalog.json'), j({ version: 1, items: [
    { id: 'm1', title: 'Film', kind: 'film', source: { type: 'local', value: missing } },
  ] }), 'utf8');
  const { issues } = auditUserData(root);
  const hit = issues.find((i) => i.kind === 'broken-relation' && i.store === 'media-catalog.json');
  assert.ok(hit);
  assert.strictEqual(hit.repair, null, 'medya geri gelebilir — onarım önerilmez');
});

test('yetim not kaydı info-severity raporlanır', () => {
  const root = fresh();
  fs.writeFileSync(path.join(root, 'watch-library.json'), j([
    { key: 'file:///mevcut.mp4', title: 'Var' },
  ]), 'utf8');
  fs.writeFileSync(path.join(root, 'browser-notes.json'), j({ version: 1, annotations: [
    { mediaId: 'file:///mevcut.mp4', text: 'geçerli' },
    { mediaId: 'file:///gitmis.mp4', text: 'yetim' },
  ] }), 'utf8');
  const { issues } = auditUserData(root);
  const hit = issues.find((i) => i.id === 'orphan-notes');
  assert.ok(hit);
  assert.strictEqual(hit.severity, 'info');
  assert.strictEqual(hit.repair, null);
});

// ---------- onarım güvenliği ----------
test('yalnız seçilen bulgular onarılır; eskiyen id atlanır', () => {
  const root = fresh();
  fs.writeFileSync(path.join(root, 'history.json'), '{bozuk', 'utf8');
  fs.writeFileSync(path.join(root, 'history.json.bak'), j([]), 'utf8');
  fs.writeFileSync(path.join(root, 'media-catalog.json'), j({ version: 1, items: [
    { id: 'x', kind: 'film' }, { id: 'x', kind: 'film' },
  ] }), 'utf8');
  const { issues } = auditUserData(root);
  const repairable = issues.filter((i) => i.repair);
  assert.strictEqual(repairable.length, 2);
  // Yalnız katalog dedupe seçildi — history onarımsız kalır.
  const report = applyRepairs(root, ['dup-catalog:x', 'olmayan-id']);
  assert.deepStrictEqual(report.applied, ['dup-catalog:x']);
  assert.ok(report.skipped.some((s) => s.id === 'olmayan-id'));
  const corruptAgain = auditUserData(root).issues.find((i) => i.id === 'corrupt-file:history.json');
  assert.ok(corruptAgain, 'seçilmeyen bulgu hâlâ duruyor');
});

test('onarım sonrası tekrar tarama temiz rapor verir', () => {
  const root = fresh();
  fs.writeFileSync(path.join(root, 'watch-library.json'), j({ schemaVersion: 3, items: [
    { key: 'k', title: 'A', lastWatched: 1 }, { key: 'k', title: 'B', lastWatched: 2 },
  ], tombstones: [{ key: 'k', removedAt: 1 }, { key: 'k', removedAt: 3 }] }), 'utf8');
  const first = auditUserData(root).issues;
  const ids = first.map((i) => i.id);
  assert.ok(first.some((i) => i.id === 'dup-watch:k'));
  assert.ok(first.some((i) => i.id === 'dup-tombstone:k'));
  applyRepairs(root, ids);
  assert.deepStrictEqual(auditUserData(root).issues, []);
});

console.log(`\n${passed} test geçti.`);
