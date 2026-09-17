const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { entries, translate, normalize } = require('../src/renderer/ui-locale');

assert.equal(normalize('tr'), 'tr');
assert.equal(normalize('en'), 'en');
assert.equal(normalize('invalid'), 'en');
assert.equal(translate('Kaynağını seç', 'en'), 'Choose a source');
assert.equal(translate('  Kaynağını seç  ', 'en'), '  Choose a source  ');
assert.equal(translate('Choose a source', 'tr'), 'Kaynağını seç');
assert.equal(translate('Some user subtitle text', 'en'), 'Some user subtitle text');
assert.equal(translate('Media library', 'tr'), 'Arşiv');
assert.equal(translate('BROWSER', 'tr'), 'BROWSER');

const originals = entries.map(([source]) => source);
assert.equal(new Set(originals).size, originals.length, 'Each Turkish UI key must be unique');

const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
assert.match(html, /<html lang="en">/);
assert.match(html, /id="openPlayer"[^>]*>BROWSER<\/button>/);
assert.match(html, /id="uiLocale"/);
assert.match(html, /id="playerUiLocale"/);
assert.match(html, /<script src="ui-locale\.js"><\/script>\s*<script src="renderer\.js"><\/script>/);
const localized = new Map(entries);
const staticCopy = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const untranslated = new Set();
for (const match of staticCopy.matchAll(/>([^<>]+)</g)) {
  const value = match[1].replace(/\s+/g, ' ').trim();
  if (/[çğıöşüÇĞİÖŞÜ]/.test(value) && !localized.has(value)) untranslated.add(value);
}
for (const match of staticCopy.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)) {
  const value = match[1].trim();
  if (/[çğıöşüÇĞİÖŞÜ]/.test(value) && !localized.has(value)) untranslated.add(value);
}
assert.deepEqual([...untranslated].sort(), [
  'Açık', // The theme option is explicitly updated in setLocale.
  'Çift dilli tek dosya da yaz (&lt;ad&gt;.dual.srt — kaynak ve çeviri üst üste)',
  'İndirilenler\\Whisper\\GİRDİ', // Actual on-disk directory names are not translated.
  'İndirilenler\\Whisper\\ÇIKTI',
  'wav2vec2 ile &lt;100ms kelime hizalaması verir (ilk seçimde',
].sort(), 'Static UI copy must have a translation or a documented exception');
console.log('ui-locale: 14 assertions passed');
