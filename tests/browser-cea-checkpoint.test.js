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
    build: '', migratedFrom: null,
    tracks: [{ instreamId: 'CC1', language: '', name: '', standard: '',
      timeTransform: null, cues: [{ start: 1, end: 2,
      text: 'A remembered caption', sequence: 4, discontinuity: 0 }] }] });
  assert.equal(loadCeaCheckpoint(root, id, 1000 + 8 * 24 * 60 * 60 * 1000), null);
  assert.equal(loadCeaCheckpoint(root, checkpointId(url, 'browser:different', tracks), 1001), null);
  assert.equal(clearCeaCheckpoint(root, id), true);
  assert.equal(clearCeaCheckpoint(root, id), false);

  // Madde 25: parça kimliği + zaman dönüşümü checkpoint'te saklanıp geri yüklenir.
  const tt = { offsetSeconds: 2.45, matches: 37, confidence: 'strong' };
  assert.equal(saveCeaCheckpoint(root, id, [{ instreamId: 'CC1', language: 'en',
    name: 'English captions', standard: 'cea-708', timeTransform: tt, cues }], 9, 2000,
    fs, '3.2.1'), true);
  const loaded = loadCeaCheckpoint(root, id, 2001);
  assert.equal(loaded.build, '3.2.1', 'build kimliği saklanır');
  assert.equal(loaded.migratedFrom, null);
  assert.deepEqual(loaded.tracks[0].language, 'en');
  assert.deepEqual(loaded.tracks[0].name, 'English captions');
  assert.deepEqual(loaded.tracks[0].standard, 'cea-708');
  assert.deepEqual(loaded.tracks[0].timeTransform, tt);
  // Eski biçim (yeni alanlar yok) geriye uyumlu yüklenir — boş kimlik alanları.
  assert.equal(saveCeaCheckpoint(root, id, [{ instreamId: 'CC1', cues }], 10, 3000), true);
  const legacy = loadCeaCheckpoint(root, id, 3001);
  assert.deepEqual(legacy.tracks[0].timeTransform, null);
  assert.deepEqual(legacy.tracks[0].language, '');
  // Bozulmuş zaman dönüşümü ve aşırı değerler düşürülür.
  assert.equal(saveCeaCheckpoint(root, id, [{ instreamId: 'CC1', cues,
    language: 'x'.repeat(200), name: 12345, standard: { evil: 1 },
    timeTransform: { offsetSeconds: Number.POSITIVE_INFINITY, matches: -4,
      confidence: 'x'.repeat(100) } }], 11, 4000), true);
  const hostile = loadCeaCheckpoint(root, id, 4001);
  assert.deepEqual(hostile.tracks[0].timeTransform, null, 'non-finite offset must drop');
  assert.equal(hostile.tracks[0].language.length <= 24, true);
  assert.equal(typeof hostile.tracks[0].name, 'string');
  assert.equal(saveCeaCheckpoint(root, id, [{ instreamId: 'CC1', cues,
    timeTransform: { offsetSeconds: 90001, matches: 2, confidence: 'weak' } }], 12, 5000), true);
  assert.deepEqual(loadCeaCheckpoint(root, id, 5001).tracks[0].timeTransform, null,
    'offset > 24h must drop');

  // Madde 27: sürüm doğrulaması + güvenli migrasyon.
  const target = checkpointPath(root, id);
  const baseRecord = JSON.parse(fs.readFileSync(target, 'utf8'));
  // v0 (sürüm alanı olmayan şema-öncesi kayıt) güvenli dönüştürülür.
  delete baseRecord.version;
  fs.writeFileSync(target, JSON.stringify(baseRecord));
  const v0 = loadCeaCheckpoint(root, id, 6001);
  assert(v0 && v0.migratedFrom === 0 && v0.tracks.length === 1,
    'version-less record migrates as v0');
  assert(fs.existsSync(target), 'migrated record file preserved');
  // Gelecek sürüm reddedilir ama dosya korunur (sağlam kayıp yok).
  baseRecord.version = 2;
  fs.writeFileSync(target, JSON.stringify(baseRecord));
  assert.equal(loadCeaCheckpoint(root, id, 6001), null, 'future version rejected');
  assert(fs.existsSync(target), 'future-version file must not be deleted');
  // Bozuk sürüm alanı reddedilir.
  baseRecord.version = 'abc';
  fs.writeFileSync(target, JSON.stringify(baseRecord));
  assert.equal(loadCeaCheckpoint(root, id, 6001), null, 'non-integer version rejected');
  // Bozuk JSON: yüklenmez ama iş kaybı yaratmaz (null → taze başlangıç).
  fs.writeFileSync(target, '{bozuk');
  assert.equal(loadCeaCheckpoint(root, id, 6001), null, 'corrupt JSON rejected');
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
