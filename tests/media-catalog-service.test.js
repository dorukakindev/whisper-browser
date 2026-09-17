'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerMediaCatalogService } = require('../src/media-catalog-service');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-catalog-service-'));
  const importer = require('../src/nmdb-catalog-import');
  const originalImport = importer.previewNmdbImport;
  try {
    const handlers = new Map();
    let picker = 'C:\\Movies\\allowed.mp4';
    let pickerCanceled = false;
    let pickerCalls = 0;
    const granted = [];
    const imported = [
      { id: 'nmdb:work:1', importRef: 'nmdb:work:1', kind: 'film', title: 'Kuzey', year: 2024,
        imdbId: 'tt1234567', synopsis: 'Sentetik film', watchStatus: 'completed', favorite: false,
        source: { type: 'local', value: 'C:\\Movies\\imported.mp4', imported: true }, episodes: [] },
      { id: 'nmdb:work:2', importRef: 'nmdb:work:2', kind: 'series', title: 'Dizi', year: 2023,
        tmdbId: 'tv:42', synopsis: 'Sentetik dizi', episodes: [
          { id: 's1e2', season: 1, number: 2, title: 'Bölüm', watchStatus: 'unspecified',
            source: { type: 'local', value: 'C:\\TV\\imported-s1e2.mp4', imported: true } },
        ] },
    ];
    importer.previewNmdbImport = async () => ({ items: imported, warnings: [], count: imported.length });
    registerMediaCatalogService({
      ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
      dialog: { showOpenDialog: async () => {
        pickerCalls++;
        return { canceled: pickerCanceled, filePaths: pickerCanceled ? [] : [picker] };
      } },
      owner: () => null, authorized: (event) => event.sender.id === 1 || event.sender.id === 3,
      userData: () => dir, pythonPath: () => 'synthetic-python',
      inspectMedia: (value) => {
        if (!value.endsWith('allowed.mp4')) throw new Error('Yerel video yolu yetkili değil.');
        return value;
      },
      grantMedia: (value) => { granted.push(value); return true; },
      watchItems: () => [],
      nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    });
    const invoke = handlers.get('media-catalog:request');
    assert(invoke);
    const authorized = { sender: { id: 1 } }, denied = { sender: { id: 2 } };
    assert.equal((await invoke(denied, { action: 'list' })).ok, false);
    const created = await invoke(authorized, { action: 'save', item: {
      kind: 'film', title: 'Kuzey', year: 2024, imdbId: 'tt1234567',
      watchStatus: 'watching', favorite: true,
      source: { type: 'local', value: 'C:\\Secret\\untrusted.mp4' },
      posterPath: 'C:\\Secret\\untrusted.jpg',
    } });
    assert.equal(created.ok, true, created.error);
    assert.equal(created.item.source, null, 'Renderer yolu doğrudan saklanmamalı');
    const id = created.item.id;
    const url = await invoke(authorized, { action: 'source-url', id, url: 'https://video.example/watch?token=secret' });
    assert.equal(url.ok, true, url.error);
    assert.equal(url.item.source.type, 'browser');
    assert(!url.item.source.value.includes('token=secret'));
    picker = 'C:\\Movies\\blocked.mp4';
    assert.equal((await invoke(authorized, { action: 'source-file', id })).ok, false);
    picker = 'C:\\Movies\\allowed.mp4';
    const local = await invoke(authorized, { action: 'source-file', id });
    assert.equal(local.ok, true, local.error);
    assert.equal(local.item.source.value, picker);

    picker = path.join(dir, 'synthetic.db');
    const preview = await invoke(authorized, { action: 'import-preview' });
    assert.equal(preview.ok, true, preview.error);
    assert.equal(preview.summary.updated.length, 1);
    assert.equal(preview.summary.added.length, 1);
    const wrongSender = await invoke({ sender: { id: 3 } }, { action: 'import-apply',
      token: preview.token, ids: ['nmdb:work:1'] });
    assert.equal(wrongSender.ok, false, 'Önizleme başka sender tarafından uygulanabildi');
    assert.equal((await invoke({ sender: { id: 3 } }, {
      action: 'import-cancel', token: preview.token,
    })).ok, true);
    const wrongToken = await invoke(authorized, { action: 'import-apply',
      token: 'yanlis-token', ids: ['nmdb:work:1'] });
    assert.equal(wrongToken.ok, false);
    const beforeApply = await invoke(authorized, { action: 'list' });
    assert.equal(beforeApply.items.length, 1);
    const applied = await invoke(authorized, { action: 'import-apply', token: preview.token,
      ids: ['nmdb:work:1', 'nmdb:work:2'] });
    assert.equal(applied.ok, true, applied.error);
    assert.equal((await invoke(authorized, { action: 'import-apply', token: preview.token,
      ids: ['nmdb:work:1'] })).ok, false, 'Tüketilmiş önizleme yeniden uygulandı');
    const list = await invoke(authorized, { action: 'list' });
    assert.equal(Object.hasOwn(list, 'watchItems'), false, 'Gereksiz izleme geçmişi renderer’a taşınmamalı');
    const film = list.items.find((item) => item.id === id);
    assert.equal(film.watchStatus, 'watching');
    assert.equal(film.favorite, true);
    assert.equal(film.source.value, 'C:\\Movies\\allowed.mp4');
    const series = list.items.find((item) => item.kind === 'series');
    assert(series);
    assert.equal(series.episodes[0].source.value, 'C:\\TV\\imported-s1e2.mp4');
    assert.equal(series.episodes[0].source.imported, true);

    // R51-09 davranış testi: içe aktarılmış yerel yol doğrudan grant edilmez.
    // İptal dosyayı ve katalog kaydını değiştirmez; seçim yapıldığında ise
    // yalnız seçilen yol grant edilir ve imported işareti kalıcı olarak kalkar.
    const pickerBeforeCancel = pickerCalls;
    pickerCanceled = true;
    const canceledPlay = await invoke(authorized, {
      action: 'play', id: series.id, episodeId: series.episodes[0].id,
    });
    assert.deepEqual(canceledPlay, { ok: false, canceled: true });
    assert.equal(pickerCalls, pickerBeforeCancel + 1);
    assert.deepEqual(granted, [], 'İptal edilen içe aktarım yolu grant edildi');
    const afterCancel = await invoke(authorized, { action: 'list' });
    assert.equal(afterCancel.items.find((item) => item.id === series.id)
      .episodes[0].source.imported, true, 'İptal imported işaretini kaldırdı');

    pickerCanceled = false;
    picker = 'C:\\Movies\\allowed.mp4';
    const played = await invoke(authorized, {
      action: 'play', id: series.id, episodeId: series.episodes[0].id,
    });
    assert.equal(played.ok, true, played.error);
    assert.equal(played.watchItem.sourceRef, picker);
    assert.equal(played.watchItem.localPath, picker);
    assert.deepEqual(granted, [picker], 'Seçilmeyen veya birden çok yol grant edildi');
    const afterPlay = await invoke(authorized, { action: 'list' });
    assert.equal(afterPlay.items.find((item) => item.id === series.id)
      .episodes[0].source.imported, undefined, 'Seçim sonrası imported işareti korunmuş');
    assert.equal(afterPlay.items.find((item) => item.id === series.id)
      .episodes[0].source.value, picker);

    const changed = await invoke(authorized, { action: 'save', item: { id: series.id,
      episodes: [{ ...series.episodes[0], watchStatus: 'completed' }] } });
    assert.equal(changed.ok, true, changed.error);
    const nextPreview = await invoke(authorized, { action: 'import-preview' });
    assert.equal(nextPreview.summary.updated.length, 2);
    const repeat = await invoke(authorized, { action: 'import-apply', token: nextPreview.token,
      ids: ['nmdb:work:1', 'nmdb:work:2'] });
    assert.equal(repeat.ok, true, repeat.error);
    const after = await invoke(authorized, { action: 'list' });
    assert.equal(after.items.length, 2);
    assert.equal(after.items.find((item) => item.id === series.id).episodes[0].watchStatus, 'completed');
    assert.equal(after.items.find((item) => item.id === series.id).episodes[0].source.value, picker,
      'Yeniden içe aktarım kullanıcının doğruladığı yerel yolu ezdi');
    assert.equal(after.items.find((item) => item.id === series.id).episodes[0].source.imported, undefined);

    importer.previewNmdbImport = async () => ({ items: [{ ...imported[0], imdbId: 'tt7654321' }], warnings: [], count: 1 });
    const conflictPreview = await invoke(authorized, { action: 'import-preview' });
    assert.equal(conflictPreview.summary.conflicts.length, 1);
    const conflict = await invoke(authorized, { action: 'import-apply', token: conflictPreview.token, ids: ['nmdb:work:1'] });
    assert.equal(conflict.summary.conflicts.length, 1);
    assert.equal((await invoke(authorized, { action: 'list' })).items.length, 2);
    const realNow = Date.now;
    try {
      let now = 1_000_000;
      Date.now = () => now;
      const expiring = await invoke(authorized, { action: 'import-preview' });
      now += 15 * 60 * 1000 + 1;
      assert.equal((await invoke(authorized, { action: 'import-apply', token: expiring.token,
        ids: ['nmdb:work:1'] })).ok, false, 'Süresi dolmuş önizleme uygulandı');
    } finally { Date.now = realNow; }
    console.log('media-catalog-service: authorization, source validation, preview/apply and conflict passed');
  } finally {
    importer.previewNmdbImport = originalImport;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
