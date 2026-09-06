const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const { WatchIndex } = require('../src/watch-index');
const { unifiedLibrarySearch } = require('../src/browser-library-tools');
const { normalizeAnnotation } = require('../src/browser-learning');

const MEDIA_COUNT = 100;
const CUES_PER_TRACK = 500;
const NOTE_COUNT = 2000;
const COLLECTION_COUNT = 200;

function measured(fn) {
  const started = performance.now();
  const value = fn();
  return { value, milliseconds: Math.round((performance.now() - started) * 10) / 10 };
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-library-bench-'));
const heapBefore = process.memoryUsage().heapUsed;
const index = new WatchIndex(path.join(directory, 'watch-index.sqlite'));
const library = [];

try {
  const build = measured(() => {
    for (let mediaIndex = 0; mediaIndex < MEDIA_COUNT; mediaIndex++) {
      const mediaId = `browser:benchmark:${mediaIndex}`;
      const trackId = `${mediaId}|source`;
      const collections = [`Grup ${mediaIndex % COLLECTION_COUNT}`, `Grup ${(mediaIndex + 100) % COLLECTION_COUNT}`];
      const item = {
        key: mediaId, type: 'browser', title: `Ölçüm videosu ${mediaIndex}`,
        sourceRef: `https://example.test/watch/${mediaIndex}`, position: mediaIndex,
        duration: 3600, lastWatched: 1_800_000_000_000 + mediaIndex, collections,
        prefs: { collectionOrder: Object.fromEntries(collections.map((name, order) => [name, order])) },
      };
      library.push(item);
      index.upsertMedia({ id: mediaId, service: item.type, title: item.title, url: item.sourceRef,
        duration: item.duration, position: item.position, lastWatched: item.lastWatched,
        prefs: { collections, collectionOrder: item.prefs.collectionOrder } });
      index.upsertTrack({ id: trackId, mediaId, role: 'source', language: 'en', label: 'English', source: 'benchmark' });
      index.replaceTrackCues(trackId, Array.from({ length: CUES_PER_TRACK }, (_, cueIndex) => ({
        id: `cue-${cueIndex}`, start: cueIndex * 2, end: cueIndex * 2 + 1.5,
        sourceText: cueIndex % 50 === 0 ? `Kalıcı hedef ifade ${mediaIndex}-${cueIndex}` : `Source ${mediaIndex}-${cueIndex}`,
        translationText: cueIndex % 75 === 0 ? `Türkçe ölçüm ${mediaIndex}-${cueIndex}` : `Çeviri ${mediaIndex}-${cueIndex}`,
      })));
    }
    index.transaction(() => {
      for (let noteIndex = 0; noteIndex < NOTE_COUNT; noteIndex++) {
        const mediaId = `browser:benchmark:${noteIndex % MEDIA_COUNT}`;
        index.upsertAnnotation(normalizeAnnotation({
          id: `note:${noteIndex}`, mediaId, type: 'note', start: noteIndex / 10,
          source: `Not kaynağı ${noteIndex}`, translation: `Not çevirisi ${noteIndex}`,
          note: noteIndex % 20 === 0 ? `Aranan not hedef ${noteIndex}` : `Kullanıcı notu ${noteIndex}`,
          trackId: `${mediaId}|source`, cueId: `cue-${noteIndex % CUES_PER_TRACK}`,
          createdAt: 1_800_000_000_000 + noteIndex, updatedAt: 1_800_000_000_000 + noteIndex,
        }));
      }
    });
  });

  const update = measured(() => index.replaceTrackCues('browser:benchmark:0|source',
    Array.from({ length: CUES_PER_TRACK }, (_, cueIndex) => ({
      id: `cue-${cueIndex}`, start: cueIndex * 2, end: cueIndex * 2 + 1.5,
      sourceText: cueIndex === 0 ? 'Güncellenmiş hedef ifade' : `Updated ${cueIndex}`,
      translationText: `Güncel çeviri ${cueIndex}`,
    }))));
  const cueSearch = measured(() => index.searchCues('hedef', 200));
  const noteSearch = measured(() => index.searchAnnotations('hedef', 200));
  const renderModel = measured(() => unifiedLibrarySearch({
    query: 'hedef', scope: 'all', limit: 160, library,
    cueHits: cueSearch.value, notes: noteSearch.value,
  }));
  const heapAfter = process.memoryUsage().heapUsed;

  assert.equal(index.listMedia(1000).length, MEDIA_COUNT);
  assert.equal(index.listAllAnnotations(50000).length, NOTE_COUNT);
  assert(cueSearch.value.length > 0, 'Gerçek FTS cue araması sonuç üretmedi.');
  assert(noteSearch.value.length > 0, 'Gerçek not araması sonuç üretmedi.');
  assert(renderModel.value.length <= 160, 'Renderer modeli güvenli sonuç sınırını aştı.');
  assert.equal(new Set(library.flatMap((item) => item.collections)).size, COLLECTION_COUNT);

  console.log(JSON.stringify({
    runtime: { node: process.version, platform: `${process.platform}-${process.arch}` },
    fixture: { cues: MEDIA_COUNT * CUES_PER_TRACK, notes: NOTE_COUNT, collections: COLLECTION_COUNT, media: MEDIA_COUNT },
    timingsMs: { initialIndex: build.milliseconds, singleTrackUpdate: update.milliseconds,
      cueFtsSearch: cueSearch.milliseconds, noteSearch: noteSearch.milliseconds,
      boundedRenderModel: renderModel.milliseconds },
    results: { cueHits: cueSearch.value.length, noteHits: noteSearch.value.length,
      rendered: renderModel.value.length },
    heapGrowthMiB: Math.round(((heapAfter - heapBefore) / 1024 / 1024) * 100) / 100,
  }, null, 2));
} finally {
  index.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
