const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { BrowserAssetStore } = require('../src/browser-asset-store');
const { WatchIndex, ftsQuery } = require('../src/watch-index');
const { normalizeAnnotation } = require('../src/browser-learning');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-watch-index-'));
try {
  test('web altyazı varlığı JSON ve BOM SRT olarak kalıcı yazılır', () => {
    const store = new BrowserAssetStore({ rootDir: path.join(dir, 'assets') });
    const result = store.putTrack({
      mediaId: 'youtube:abc',
      trackId: 'en-main',
      language: 'en',
      label: 'English',
      source: 'network',
      signedUrl: 'https://cdn.example/sub.vtt?token=LEAK',
      requestHeaders: { Authorization: 'Bearer LEAK' },
      cues: [
        { id: 'a', start: 0, end: 1.25, text: 'Hello world.' },
        { id: 'b', start: 2, end: 3, text: 'Second line.' },
      ],
    });
    assert(result.ok, result.error);
    assert.match(result.assetId, /^[a-f0-9]{24}:[a-f0-9]{32}$/);
    const diskJson = fs.readFileSync(result.jsonPath, 'utf8');
    assert(!diskJson.includes('LEAK'));
    const diskSrt = fs.readFileSync(result.srtPath, 'utf8');
    assert.equal(diskSrt.charCodeAt(0), 0xFEFF);
    assert.match(diskSrt, /00:00:00,000 --> 00:00:01,250/);
    const loaded = store.getTrack(result.assetId);
    assert(loaded.ok, loaded.error);
    assert.equal(loaded.document.cueCount, 2);
    assert.equal(loaded.document.mediaId, 'youtube:abc');
    assert(store.removeTrack(result.assetId).ok);
    assert.equal(store.getTrack(result.assetId).ok, false);
  });

  test('FTS sorgusu kullanıcı metnini güvenli prefix terimlerine dönüştürür', () => {
    assert.equal(ftsQuery('  Merhaba dünya!  '), '"Merhaba"* AND "dünya"*');
    assert.equal(ftsQuery('" OR *'), '"OR"*');
  });

  const index = new WatchIndex(path.join(dir, 'watch.db'));
  try {
    test('medya, iz ve cue ilişkisi FTS indeksine yazılır', () => {
      index.upsertMedia({
        id: 'youtube:abc', service: 'youtube', title: 'Deneme videosu',
        url: 'https://youtube.com/watch?v=abc', duration: 120, position: 32,
        prefs: { speed: 1.25 },
      });
      index.upsertTrack({
        id: 'track:en', mediaId: 'youtube:abc', role: 'source', language: 'en',
        label: 'English', source: 'network', assetPath: 'asset.srt',
      });
      assert.equal(index.getTrack('track:en').media_id, 'youtube:abc');
      assert.equal(index.listTracks('youtube:abc').length, 1);
      assert.equal(index.replaceTrackCues('track:en', [
        { id: 'a', start: 10, end: 12, sourceText: 'Hello world.', translationText: 'Merhaba dünya.' },
        { id: 'b', start: 20, end: 22, sourceText: 'A quiet second line.', translationText: 'Sessiz ikinci satır.' },
      ]), 2);
      const result = index.searchCues('dünya');
      assert.equal(result.length, 1);
      assert.equal(result[0].media_id, 'youtube:abc');
      assert.equal(result[0].cue_id, 'a');
      assert.equal(result[0].start, 10);
      assert.match(result[0].translation_text, /Merhaba/);
    });

    test('cue değişimi eski FTS metnini kaldırır', () => {
      index.replaceTrackCues('track:en', [
        { id: 'a', start: 10, end: 12, sourceText: 'Changed text.', translationText: 'Değişmiş metin.' },
      ]);
      assert.equal(index.searchCues('dünya').length, 0);
      assert.equal(index.searchCues('değişmiş').length, 1);
    });

    test('notlar medya ve zamana bağlı saklanır', () => {
      const annotation = normalizeAnnotation({
        type: 'quote', mediaId: 'youtube:abc', start: 10, end: 12,
        source: 'Changed text.', translation: 'Değişmiş metin.', note: 'önemli',
      });
      index.upsertAnnotation(annotation);
      const rows = index.listAnnotations('youtube:abc');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].note, 'önemli');
      assert.equal(rows[0].start, 10);
    });

    test('eski watch-library kayıtları temel medya satırlarına göç eder', () => {
      const count = index.migrateLegacyWatchLibrary([{
        key: 'local:c:/film.mkv', type: 'local', title: 'Film', sourceRef: 'c:/film.mkv',
        duration: 7200, position: 400, completed: false, lastWatched: 123, prefs: { speed: 1 },
      }]);
      assert.equal(count, 1);
      const media = index.getMedia('local:c:/film.mkv');
      assert.equal(media.title, 'Film');
      assert.equal(media.position, 400);
      assert.deepEqual(media.prefs, { speed: 1 });
    });
  } finally {
    index.close();
  }

  console.log(`watch-index-assets: ${passed} test`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
