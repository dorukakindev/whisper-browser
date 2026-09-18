'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkpointId, checkpointPath, saveCeaCheckpoint,
  loadCeaCheckpoint, clearCeaCheckpoint } = require('../src/browser-cea-checkpoint');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-cea-checkpoint-'));
const url = 'https://media.example/lesson/master.m3u8?sig=private-token';
const tracks = [{ instreamId: 'CC1', language: 'en' }];
const id = checkpointId(url, 'browser:lesson-42', tracks);
const renewed = checkpointId('https://media.example/lesson/master.m3u8?sig=renewed',
  'browser:lesson-42', tracks);
assert.equal(id, renewed, 'Signed URL renewal must not invalidate a local checkpoint');
assert.notEqual(id, checkpointId(url, 'browser:lesson-43', tracks));
assert.throws(() => checkpointPath(root, '../elsewhere'));

try {
  assert.equal(loadCeaCheckpoint(root, id), null);
  const cues = [{ start: 1, end: 2, text: 'A remembered caption', sequence: 4,
    discontinuity: 0, provenance: { segmentUrl: `${url}&token=another-secret` } }];
  assert.equal(saveCeaCheckpoint(root, id, [{ instreamId: 'CC1', cues }], 4, 1000), true);
  const serialized = fs.readFileSync(checkpointPath(root, id), 'utf8');
  assert(!serialized.includes('private-token') && !serialized.includes('another-secret'));
  assert(!serialized.includes('media.example'), 'Source URL must not persist in the payload');
  assert(!serialized.includes('completedIds'), 'Decoder state cannot be safely skipped on restart');
  assert.deepEqual(loadCeaCheckpoint(root, id, 1001), { completedSegments: 4,
    tracks: [{ instreamId: 'CC1', cues: [{ start: 1, end: 2,
      text: 'A remembered caption', sequence: 4, discontinuity: 0 }] }] });
  assert.equal(loadCeaCheckpoint(root, id, 1000 + 8 * 24 * 60 * 60 * 1000), null);
  assert.equal(loadCeaCheckpoint(root, checkpointId(url, 'browser:different', tracks), 1001), null);
  assert.equal(clearCeaCheckpoint(root, id), true);
  assert.equal(clearCeaCheckpoint(root, id), false);
} finally {
  // The directory was created above exclusively for this test. Remove only its
  // known checkpoint file and then the now-empty directory.
  try { fs.unlinkSync(checkpointPath(root, id)); } catch (_) {}
  fs.rmdirSync(root);
}

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
assert.match(main, /completed: new Set\(resume \? previous\.completed : \[\]\).*resume: resume \|\| !!saved/s);
assert.match(main, /persistBrowserHlsCeaCheckpoint\(job\)/);
assert.match(main, /clearBrowserHlsCeaCheckpoint\(job\)/);
console.log('CEA checkpoint: atomic local cue recovery, redaction and decoder-safe replay passed');
