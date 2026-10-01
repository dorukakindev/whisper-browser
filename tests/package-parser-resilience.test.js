'use strict';

// Madde 45 — parser dayanıklılığı: çalışma paketi ve katalog okuyucularında
// boyut/derinlik/bozuk-Unicode sınırları. Özyinelemeli gezginler yığını
// patlatmamalı (RangeError → temiz hata); boyutsuz dosya okuması belleği
// kontrolsüz şişirmemeli; bozuk bayt akışı koruma hatasına düşmeli.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pkg = require('../src/workspace-package');
const { createMediaCatalogStore } = require('../src/media-catalog-store');

const deepJson = (depth) => '['.repeat(depth) + '1' + ']'.repeat(depth);

// remapRendererValues → rewrite özyinelemesi: derin rendererValues
// RangeError yerine WP_DEPTH kodlu temiz hata vermeli.
{
  const data = {
    format: 'whisper-workspace', version: 1, sourceRoot: '/x',
    files: [], mappings: [],
    rendererValues: { 'browser-source-edits-v1': deepJson(40000) },
  };
  let error = null;
  try { pkg.remapRendererValues('/tmp/target', data); } catch (e) { error = e; }
  assert(error, 'derin rendererValues sessiz geçti');
  assert.equal(error.code, 'WP_DEPTH', `RangeError yerine beklenen kod: ${error.code}`);
  assert(!/call stack/i.test(error.message), 'yığın taşması ham olarak sızdı');
}

// Meşru derinlik (32 altı) çalışmaya devam etmeli — tavan gerçek veriyi kırmaz.
{
  const data = {
    format: 'whisper-workspace', version: 1, sourceRoot: '/x',
    files: [], mappings: [['/x', '/tmp/target']],
    rendererValues: { 'browser-source-edits-v1': deepJson(20) },
  };
  const out = pkg.remapRendererValues('/tmp/target', data);
  assert.equal(out['browser-source-edits-v1'], deepJson(20));
}

// exportPackage: kökte derin JSON dosyası varsa paket sessizce ham (mutlak
// yollu) içerikle yazılmamalı — temiz hata vermeli.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wbp-deep-'));
  fs.writeFileSync(path.join(root, 'history.json'), deepJson(40000));
  let error = null;
  try { pkg.exportPackage(root, path.join(root, 'out.wbp')); } catch (e) { error = e; }
  assert.equal(error?.code, 'WP_DEPTH', `dışa aktarım sessiz kaldı veya yanlış hata: ${error?.code}`);
  fs.rmSync(root, { recursive: true, force: true });
}

// readPackage: bozuk gzip akışı JSON.parse çökmesi değil temiz hata.
{
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wbp-bad-')), 'bozuk.wbp');
  fs.writeFileSync(file, Buffer.from([0x1f, 0x8b, 0xff, 0xff, 0x00, 0x01]));
  assert.throws(() => pkg.readPackage(file), (e) => !(e instanceof RangeError));
}

// media-catalog: 64MB üstü dosya belleği şişirmeden koruma hatasına düşer.
{
  const store = createMediaCatalogStore({ filePath: '/x/media-catalog.json', fsImpl: {
    readFileSync: () => ' '.repeat(65e6),
    mkdirSync: () => {}, writeFileSync: () => {}, copyFileSync: () => {},
    renameSync: () => {}, unlinkSync: () => {},
  } });
  assert.throws(() => store.list(), /çok büyük|korunuyor/);
}

// media-catalog: geçersiz UTF-8 baytları (bozuk Unicode) parse hatası değil
// koruma hatası üretmeli — baytlar U+FFFD'ye düşse bile şema kapısı yakalar.
{
  const store = createMediaCatalogStore({ filePath: '/x/media-catalog.json', fsImpl: {
    readFileSync: () => '���\u{10FFFF}',
    mkdirSync: () => {}, writeFileSync: () => {}, copyFileSync: () => {},
    renameSync: () => {}, unlinkSync: () => {},
  } });
  assert.throws(() => store.list(), /korunuyor|geçersiz/);
}

// Normal katalog verisi tavandan etkilenmez.
{
  const good = JSON.stringify({ version: 1, items: [] });
  const store = createMediaCatalogStore({ filePath: '/x/media-catalog.json', fsImpl: {
    readFileSync: () => good,
    mkdirSync: () => {}, writeFileSync: () => {}, copyFileSync: () => {},
    renameSync: () => {}, unlinkSync: () => {},
  } });
  assert.deepEqual(store.list(), []);
}

console.log('package-parser-resilience: 7 senaryo geçti');
