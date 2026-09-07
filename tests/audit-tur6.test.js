const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// Hata 154/159: gerçek renderer işlevlerini çalıştır; kimlik bir kez kullanılır
// ve temel metin kaydı cue'nun gerçek indeksiyle eşleşir.
const cueStart = renderer.indexOf('function browserTranslationCueKey(');
const cueEnd = renderer.indexOf('function applyLoadedBrowserTranslation(', cueStart);
const edit = { sourceCueHash: 'src|second|2|3|1', baseTranslation: '' };
const cueContext = vm.createContext({
  player: { browserBaseCues: new Map() },
  browserTabState: () => ({ mediaId: 'media', subtitleEdits: [edit] }),
  browserTrackSourceIdentity: () => ({ mediaId: 'media', sourceHash: 'src' }),
  browserSubtitleSync: {
    hashText: (value) => value,
    editRecordMatches: (record, context) => record.sourceCueHash === context.sourceCueHash,
    applyEditRecord: (cue) => cue,
  },
});
vm.runInContext(renderer.slice(cueStart, cueEnd)
  + '\nthis.attach = attachBrowserCueIdentities; this.remember = rememberBrowserBaseCues;', cueContext);
const attached = cueContext.attach({ role: 'translation', cueIdentities: [
  { cueId: 'later', start: 9, end: 10 },
  { cueId: 'first-match', start: 1, end: 2 },
] }, [
  { start: 1, end: 2, text: 'Bir' },
  { start: 1, end: 2, text: 'İki' },
]);
assert.equal(attached[0].cueId, 'first-match');
assert.equal(attached[1].cueId, undefined, 'aynı identity iki cueya bağlanmamalı');
cueContext.remember({ id: 'tr', role: 'translation' }, [
  { cueId: 'first', start: 0, end: 1, text: 'Bir' },
  { cueId: 'second', start: 2, end: 3, text: 'Korunan temel' },
]);
assert.equal(edit.baseTranslation, 'Korunan temel');

// Hata 161: oturumdaki aynı mediaId sekmesinin URL'si dizine yazılır.
const importStart = main.indexOf('function importBrowserSessionVariants(');
const importEnd = main.indexOf("ipcMain.handle('browser:session:export'", importStart);
const indexedMedia = [];
const importContext = vm.createContext({
  browserAssetStore: () => ({ putTrack: () => ({ ok: true, assetId: 'asset:hash' }) }),
  watchIndex: () => ({
    upsertMedia: (row) => indexedMedia.push(row), upsertTrack() {}, replaceTrackCues() {},
  }),
});
vm.runInContext(main.slice(importStart, importEnd)
  + '\nthis.importVariants = importBrowserSessionVariants;', importContext);
importContext.importVariants({
  variants: [{ mediaId: 'youtube:abc', trackId: 'en', role: 'source', language: 'en',
    label: 'English', source: 'network', cues: [], updatedAt: 1 }],
  session: { tabs: [{ mediaId: 'youtube:abc',
    url: 'https://www.youtube.com/watch?v=abc', trackRefs: [] }] },
});
assert.equal(indexedMedia[0].url, 'https://www.youtube.com/watch?v=abc');

console.log('Tur 6: cue kimliği, edit temeli ve oturum varyantı regresyonları geçti.');
