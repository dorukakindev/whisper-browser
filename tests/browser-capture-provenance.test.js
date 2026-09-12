'use strict';

const assert = require('node:assert/strict');
const { CaptureCoverageMap, coverageGaps, mergeCoverageRanges,
  normalizeCueProvenance } = require('../src/browser-capture-provenance');

assert.deepEqual(mergeCoverageRanges([
  { start: 10, end: 20 }, { start: 0, end: 5 }, { start: 4.98, end: 10.01 },
]), [{ start: 0, end: 20 }]);
assert.deepEqual(coverageGaps([{ start: 0, end: 10 }, { start: 12, end: 20 }]), [
  { start: 10, end: 12 },
]);
const map = new CaptureCoverageMap();
map.success('track', { start: 0, duration: 6 });
map.success('track', { start: 6, duration: 6 });
map.observeCues('track', [
  { start: 0.5, end: 2 }, { start: 1.95, end: 4 }, { start: 8, end: 9 },
]);
map.failure('track', { start: 12, duration: 6, sequence: 3, discontinuity: 1,
  url: 'https://cdn.test/s3.m4s?sig=secret&token=private&lang=en' }, 'HTTP 404');
const [coverage] = map.snapshot();
assert.deepEqual(coverage.ranges, [{ start: 0, end: 12 }]);
assert.equal(coverage.coveredSeconds, 12);
assert.deepEqual(coverage.cueRanges, [{ start: .5, end: 4 }, { start: 8, end: 9 }]);
assert.deepEqual(coverage.cueGaps, [{ start: 4, end: 8 }]);
assert.equal(coverage.failures[0].url, 'https://cdn.test/s3.m4s?lang=en');
assert.doesNotMatch(JSON.stringify(coverage), /secret|private/);
const provenance = normalizeCueProvenance({ layer: 'manifest', streamKey: 'x',
  segmentUrl: 'https://cdn.test/sub.m4s?X-Goog-Signature=secret&fmt=stpp', epoch: 'x:2',
  discontinuity: 2, sequence: 91, automatic: true });
assert.equal(provenance.epoch, 'x:2');
assert.equal(provenance.segmentUrl, 'https://cdn.test/sub.m4s?fmt=stpp');
assert.equal(provenance.automatic, true);

console.log('Yakalama provenance ve kapsama haritası testleri geçti.');
