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
    const imported = [
      { id: 'nmdb:work:1', importRef: 'nmdb:work:1', kind: 'film', title: 'Kuzey', year: 2024,
        imdbId: 'tt1234567', synopsis: 'Sentetik film', watchStatus: 'completed', favorite: false,
        source: { type: 'local', value: 'C:\\Movies\\imported.mp4' }, episodes: [] },
      { id: 'nmdb:work:2', importRef: 'nmdb:work:2', kind: 'series', title: 'Dizi', year: 2023,
        tmdbId: 'tv:42', synopsis: 'Sentetik dizi', episodes: [
          { id: 's1e2', season: 1, number: 2, title: 'Bölüm', watchStatus: 'unspecified',
            source: { type: 'local', value: 'C:\\TV\\imported-s1e2.mp4' } },
        ] },
    ];
    importer.previewNmdbImport = async () => ({ items: imported, warnings: [], count: imported.length });
    registerMediaCatalogService({
      ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [picker] }) },
      owner: () => null, authorized: (event) => event.sender.id === 1,
      userData: () => dir, pythonPath: () => 'synthetic-python',
      inspectMedia: (value) => {
        if (!value.endsWith('allowed.mp4')) throw new Error('Yerel video yolu yetkili değil.');
        return value;
      },
      grantMedia: () => true,
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
    const beforeApply = await invoke(authorized, { action: 'list' });
    assert.equal(beforeApply.items.length, 1);
    const applied = await invoke(authorized, { action: 'import-apply', token: preview.token,
      ids: ['nmdb:work:1', 'nmdb:work:2'] });
    assert.equal(applied.ok, true, applied.error);
    const list = await invoke(authorized, { action: 'list' });
    assert.equal(Object.hasOwn(list, 'watchItems'), false, 'Gereksiz izleme geçmişi renderer’a taşınmamalı');
    const film = list.items.find((item) => item.id === id);
    assert.equal(film.watchStatus, 'watching');
    assert.equal(film.favorite, true);
    assert.equal(film.source.value, 'C:\\Movies\\allowed.mp4');
    const series = list.items.find((item) => item.kind === 'series');
    assert(series);
    assert.equal(series.episodes[0].source.value, 'C:\\TV\\imported-s1e2.mp4');

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
    assert.equal(after.items.find((item) => item.id === series.id).episodes[0].source.value, 'C:\\TV\\imported-s1e2.mp4');

    importer.previewNmdbImport = async () => ({ items: [{ ...imported[0], imdbId: 'tt7654321' }], warnings: [], count: 1 });
    const conflictPreview = await invoke(authorized, { action: 'import-preview' });
    assert.equal(conflictPreview.summary.conflicts.length, 1);
    const conflict = await invoke(authorized, { action: 'import-apply', token: conflictPreview.token, ids: ['nmdb:work:1'] });
    assert.equal(conflict.summary.conflicts.length, 1);
    assert.equal((await invoke(authorized, { action: 'list' })).items.length, 2);
    console.log('media-catalog-service: authorization, source validation, preview/apply and conflict passed');
  } finally {
    importer.previewNmdbImport = originalImport;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
