const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { BrowserAssetStore, normalizeCues: normalizeAssetCues } = require('../src/browser-asset-store');
const { WatchIndex, foldSearchText, ftsQuery } = require('../src/watch-index');
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

  test('tamamlanan web çevirisi ayrı translation rolüyle kalıcı yazılır', () => {
    const store = new BrowserAssetStore({ rootDir: path.join(dir, 'translation-assets') });
    const result = store.putTrack({
      mediaId: 'browser:discovery:episode-1',
      trackId: 'translation-tr-main',
      language: 'tr',
      label: 'TR çeviri',
      role: 'translation',
      source: 'translation',
      cues: [{ id: 'web-tr-1', cueId: 'source-1', sourceCueHash: 'deadbeef',
        start: 1, end: 3, text: 'Çeviri yeniden kullanılacak.' }],
    });
    assert(result.ok, result.error);
    const loaded = store.getTrack(result.assetId);
    assert(loaded.ok, loaded.error);
    assert.equal(loaded.document.role, 'translation');
    assert.equal(loaded.document.source, 'translation');
    assert.equal(loaded.document.language, 'tr');
    assert.equal(loaded.document.cues[0].cueId, 'source-1');
    assert.equal(loaded.document.cues[0].sourceCueHash, 'deadbeef');
  });

  test('çeviri varlığı kaynak kanıtını saklar ve yeniden açılışta doğrulanabilir', () => {
    const store = new BrowserAssetStore({ rootDir: path.join(dir, 'identity-assets') });
    const result = store.putTrack({
      mediaId: 'browser:test:episode', trackId: 'translation-1', language: 'tr',
      label: 'TR', role: 'translation', source: 'translation',
      sourceHash: 'abc123', sourceTrackId: 'source-1',
      provider: 'https://api.example.test/v1', model: 'gpt-test',
      cues: [{ start: 0, end: 1, text: 'Merhaba' }],
    });
    assert(result.ok, result.error);
    const loaded = store.getTrack(result.assetId);
    assert.equal(loaded.document.sourceHash, 'abc123');
    assert.equal(loaded.document.sourceTrackId, 'source-1');
    assert.equal(loaded.document.provider, 'https://api.example.test/v1');
    assert.equal(loaded.document.model, 'gpt-test');
  });

  test('eski yarım kalmış web altyazısı geçici dosyaları temizlenir', () => {
    const rootDir = path.join(dir, 'sweep-assets');
    const nested = path.join(rootDir, 'nested');
    fs.mkdirSync(nested, { recursive: true });
    const oldTemp = path.join(nested, 'old.json.1.tmp');
    const freshTemp = path.join(nested, 'fresh.json.1.tmp');
    fs.writeFileSync(oldTemp, 'old');
    fs.writeFileSync(freshTemp, 'fresh');
    const now = Date.now();
    const oldDate = new Date(now - 48 * 60 * 60 * 1000);
    fs.utimesSync(oldTemp, oldDate, oldDate);
    const store = new BrowserAssetStore({ rootDir });
    assert.equal(store.sweepTempFiles(24 * 60 * 60 * 1000, now), 1);
    assert.equal(fs.existsSync(oldTemp), false);
    assert.equal(fs.existsSync(freshTemp), true);
  });

  test('altyazı varlığı sınırda en yeni 20.000 cueyu korur', () => {
    const cues = Array.from({ length: 20005 }, (_, index) => ({ id: index, start: index, end: index + 1, text: `Satır ${index}` }));
    const normalized = normalizeAssetCues(cues);
    assert.equal(normalized.length, 20000);
    assert.equal(normalized[0].text, 'Satır 5');
    assert.equal(normalized[19999].text, 'Satır 20004');
  });

  test('altyazı varlığı sonlu olmayan zamanlarla bozuk SRT üretmez', () => {
    const normalized = normalizeAssetCues([
      { id: 'valid', start: 0, end: 1, text: 'Sağlam' },
      { id: 'infinite', start: Infinity, end: Infinity, text: 'Bozuk' },
      { id: 'nan', start: 2, end: Number.NaN, text: 'Bozuk 2' },
    ]);
    assert.deepEqual(normalized.map((cue) => cue.id), ['valid']);
  });

  test('JSON sağlamken eksik SRT yeniden üretilir', () => {
    const store = new BrowserAssetStore({ rootDir: path.join(dir, 'repair-assets') });
    const saved = store.putTrack({ mediaId: 'web:repair', trackId: 'tr', cues: [
      { id: '1', start: 0, end: 1, text: 'Onarılan satır' },
    ] });
    assert(saved.ok, saved.error);
    fs.unlinkSync(saved.srtPath);
    const loaded = store.getTrack(saved.assetId);
    assert(loaded.ok, loaded.error);
    assert.equal(fs.existsSync(saved.srtPath), true);
    assert.match(fs.readFileSync(saved.srtPath, 'utf8'), /Onarılan satır/);
  });

  test('referanssız eski asset çifti temizlenir, referanslı olan korunur', () => {
    const store = new BrowserAssetStore({ rootDir: path.join(dir, 'orphan-assets') });
    const orphan = store.putTrack({ mediaId: 'web:orphan', trackId: 'a', cues: [
      { id: '1', start: 0, end: 1, text: 'Eski' },
    ] });
    const kept = store.putTrack({ mediaId: 'web:kept', trackId: 'b', cues: [
      { id: '1', start: 0, end: 1, text: 'Kalsın' },
    ] });
    const now = Date.now();
    const old = new Date(now - 40 * 24 * 60 * 60 * 1000);
    for (const filePath of [orphan.jsonPath, orphan.srtPath, kept.jsonPath, kept.srtPath]) fs.utimesSync(filePath, old, old);
    assert.equal(store.sweepOrphans(new Set([kept.assetId]), 30 * 24 * 60 * 60 * 1000, now), 2);
    assert.equal(fs.existsSync(orphan.jsonPath), false);
    assert.equal(fs.existsSync(orphan.srtPath), false);
    assert.equal(fs.existsSync(kept.jsonPath), true);
    assert.equal(fs.existsSync(kept.srtPath), true);
  });

  test('FTS sorgusu kullanıcı metnini güvenli prefix terimlerine dönüştürür', () => {
    assert.equal(ftsQuery('  Merhaba dünya!  '), '"Merhaba"* AND "dünya"*');
    assert.equal(ftsQuery('" OR *'), '"OR"*');
  });

  test('Türkçe büyük-küçük harf araması I ve İ ayrımını doğru katlar', () => {
    assert.equal(foldSearchText('IŞIK'), 'ışık');
    assert.equal(foldSearchText('İZMİR'), 'izmir');
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
      assert(index.listTrackAssetPaths().includes('asset.srt'));
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
      assert.match(result[0].snippet, /\[dünya\]/i,
        'arama eşleşmesi çeviri sütunundayken snippet kaynak sütununa sabitlenmemeli');
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
        source: 'Changed text.', translation: 'Değişmiş metin.', note: 'IŞIK önemli',
      });
      index.upsertAnnotation(annotation);
      const rows = index.listAnnotations('youtube:abc');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].note, 'IŞIK önemli');
      assert.equal(rows[0].start, 10);
      assert.equal(index.searchAnnotations('ışık').length, 1);
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

    test('eski iz kayıtlarını ve ilişkili varlık yollarını budar', () => {
      index.upsertTrack({
        id: 'track:old', mediaId: 'youtube:abc', role: 'source', language: 'en',
        label: 'Eski', source: 'network', assetPath: 'old.srt',
        updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      });
      const removed = index.pruneTracks({ maxTracks: 100, maxAgeMs: 24 * 60 * 60 * 1000 });
      assert(removed.some((track) => track.id === 'track:old' && track.asset_path === 'old.srt'));
      assert.equal(index.getTrack('track:old'), null);
    });
  } finally {
    index.close();
  }

  console.log(`watch-index-assets: ${passed} test`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
