'use strict';

const assert = require('node:assert/strict');
const { createTerminologyMap, terminologyPrompt } = require('../src/browser-terminology');
const { normalizeBrowserSiteTerminology, seedSiteTerminology,
  siteTerminologyScope } = require('../src/browser-site-terminology');

assert.equal(siteTerminologyScope('https://Docs.Example.test/a?token=x', 'TR'),
  'https://docs.example.test|tr');
assert.equal(siteTerminologyScope('javascript:alert(1)', 'tr'), '');
const normalized = normalizeBrowserSiteTerminology({
  'https://docs.example.test/path|tr': [
    { source: 'Commit', target: 'İşleme', count: 3, secret: 'x' },
    { source: 'Commit', target: 'Taahhüt', count: 9 },
  ],
  'javascript:bad|tr': [{ source: 'X', target: 'Y' }],
});
assert.deepEqual(normalized, { 'https://docs.example.test|tr': [
  { source: 'Commit', target: 'İşleme', count: 3 },
] });
const map = createTerminologyMap({ minOccurrences: 2 });
assert.equal(seedSiteTerminology(map, normalized['https://docs.example.test|tr']), 1);
assert.match(terminologyPrompt(map), /Commit=İşleme/);

console.log('Site bazlı terminoloji kalıcılığı testleri geçti.');
