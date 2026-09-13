'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { discoverHamFinalPairs } = require('../src/subtitle-corpus-discovery');
const entries = {
  '/root': [{ name: 'nested', isDirectory: () => true, isFile: () => false },
    { name: 'A.ham.srt', isDirectory: () => false, isFile: () => true }],
  [path.join('/root', 'nested')]: [{ name: 'B.ham.srt', isDirectory: () => false, isFile: () => true }],
};
const files = new Set([path.join('/root', 'A.srt'), path.join('/root', 'nested', 'B.srt')]);
const fakeFs = { readdirSync: (dir) => entries[dir] || [], existsSync: (file) => files.has(file) };
const pairs = discoverHamFinalPairs(fakeFs, '/root', ['nested/B.ham.srt']);
assert.equal(pairs.length, 1);
assert.equal(pairs[0].relativeSource, 'A.ham.srt');
assert.equal(pairs[0].relativeTarget, 'A.srt');
console.log('subtitle-corpus-discovery: 3 test');
