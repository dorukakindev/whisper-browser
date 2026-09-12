'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PERSISTENT_SCHEMA_INVENTORY } = require('../src/persistent-schema-inventory');

const root = path.join(__dirname, '..');
const text = file => fs.readFileSync(path.join(root, file), 'utf8');
const ids = new Set();
const inventoriedConstants = new Set();

for (const item of PERSISTENT_SCHEMA_INVENTORY) {
  assert(!ids.has(item.id), `yinelenen şema kimliği: ${item.id}`);
  ids.add(item.id);
  assert(Number.isInteger(item.version) && item.version > 0, `geçersiz sürüm: ${item.id}`);
  assert(fs.existsSync(path.join(root, item.source)), `şema kaynağı yok: ${item.source}`);
  assert(item.migrationTest && fs.existsSync(path.join(root, item.migrationTest)),
    `migration/doğrulama testi yok: ${item.id}`);
  const source = text(item.source);
  for (const name of item.constants || []) {
    inventoriedConstants.add(`${item.source}:${name}`);
    const pattern = new RegExp(`(?:const\\s+)?${name}\\s*=\\s*${item.version}(?:\\D|$)`);
    assert(pattern.test(source), `${item.id} sürümü kaynakla uyuşmuyor: ${name}`);
  }
  if (item.sourceMarker) assert(source.includes(item.sourceMarker),
    `${item.id} kaynak işareti değişti; envanter/migration kararı güncellenmeli`);
}

// src altındaki her sürüm/şema sabiti tabloda olmak zorunda. Yeni sabit eklemek
// bu testi bilinçli olarak kırar; sürüm bump'ı migration kanıtı olmadan geçmez.
const sourceFiles = fs.readdirSync(path.join(root, 'src'))
  .filter(name => name.endsWith('.js')).map(name => `src/${name}`);
const discovered = [];
const constantPattern = /(?:const\s+)?([A-Z][A-Z0-9_]*(?:VERSION|SCHEMA)[A-Z0-9_]*)\s*=\s*\d+/g;
for (const file of sourceFiles) {
  const source = text(file);
  for (const match of source.matchAll(constantPattern)) discovered.push(`${file}:${match[1]}`);
}
assert.deepEqual(discovered.filter(key => !inventoriedConstants.has(key)), [],
  'envantere eklenmemiş sürüm sabitleri var');

console.log(`persistent-schema-inventory: ${PERSISTENT_SCHEMA_INVENTORY.length} şema/protokol doğrulandı`);
