// Doküman indeks bütünlüğü ratchet'i: docs/devir/ altındaki her not
// DEVIR-NOTU.md indeksinde bağlantılı olmalı; docs/raporlar/ altındaki her
// BROWSER_BUG_REPORT_*.md INDEX.md'de satır almalı. Ayrıca tersi de doğru:
// indeksteki bağlantılar var olmayan dosyalara işaret etmemeli (ölü link).
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// 1) Her devir notu indekste bağlantılı
const devirIndex = fs.readFileSync(path.join(root, 'DEVIR-NOTU.md'), 'utf-8');
const devirFiles = fs.readdirSync(path.join(root, 'docs/devir'))
  .filter((f) => f.endsWith('.md'));
const unindexed = devirFiles.filter((f) => !devirIndex.includes(f));
assert.deepStrictEqual(unindexed, [],
  `DEVIR-NOTU.md indeksine eklenmemiş devir notları: ${unindexed.join(', ')}`);

// 2) İndeksteki her devir bağlantısı mevcut dosyaya işaret etmeli
const deadDevir = [...devirIndex.matchAll(/docs\/devir\/([0-9A-Za-z._-]+\.md)/g)]
  .map((m) => m[1])
  .filter((f) => !f.includes('YYYY') && !f.includes('MM-DD')) // şablon örneği
  .filter((f) => !fs.existsSync(path.join(root, 'docs/devir', f)));
assert.deepStrictEqual(deadDevir, [],
  `DEVIR-NOTU.md'de var olmayan dosyalara bağlantılar: ${deadDevir.join(', ')}`);

// 3) Her hata raporu INDEX.md'de satır almalı
const raporIndex = fs.readFileSync(path.join(root, 'docs/raporlar/INDEX.md'), 'utf-8');
const reportFiles = fs.readdirSync(path.join(root, 'docs/raporlar'))
  .filter((f) => /^BROWSER_BUG_REPORT_\d+\.md$/.test(f));
const unindexedReports = reportFiles.filter((f) => !raporIndex.includes(f));
assert.deepStrictEqual(unindexedReports, [],
  `INDEX.md'ye eklenmemiş raporlar: ${unindexedReports.join(', ')}`);

// 4) INDEX'teki her rapor bağlantısı mevcut dosyaya işaret etmeli
const deadReports = [...raporIndex.matchAll(/BROWSER_BUG_REPORT_\d+\.md/g)]
  .map((m) => m[0])
  .filter((f) => !fs.existsSync(path.join(root, 'docs/raporlar', f)));
assert.deepStrictEqual(deadReports, [],
  `INDEX.md'de var olmayan raporlara bağlantılar: ${deadReports.join(', ')}`);

console.log('docs-index-integrity: ' +
  `${devirFiles.length} devir notu + ${reportFiles.length} rapor satırı doğrulandı`);
