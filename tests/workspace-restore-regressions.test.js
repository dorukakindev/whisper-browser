'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { gzipSync } = require('node:zlib');
const packages = require('../src/workspace-package');
const videos = require('../src/workspace-video-package');
const { createCatalogExtensions } = require('../src/catalog-extensions');
const { readBrowserSessionWithStatus, normalizeBrowserSession } = require('../src/browser-session-store');
const { SubtitleFileAccess } = require('../src/local-file-access');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-restore-regression-'));
  const original = { read: videos.read, extract: videos.extract, export: packages.exportPackage, restore: packages.restorePackage };
  try {
    const source = path.join(root, 'profile'), target = path.join(source, 'restored');
    fs.mkdirSync(target, { recursive: true });
    const oldVideo = path.join(source, 'movie.mp4'), newVideo = path.join(target, 'workspace-videos', 'movie.mp4');
    const data = { format: 'whisper-workspace', version: 1, sourceRoot: source, mappings: [],
      files: [{ name: 'browser-notes.json', data: Buffer.from(JSON.stringify({ video: oldVideo })).toString('base64') }],
      rendererValues: { 'browser-subtitle-drafts-v1': JSON.stringify({ [oldVideo]: { path: oldVideo } }) } };
    const mapped = packages.remapRendererValues(target, data, [[oldVideo, newVideo]]);
    assert.equal(mapped['browser-subtitle-drafts-v1'], undefined,
      'Executable subtitle drafts from imported packages must not be restored');
    assert.equal(mapped['browser-source-edits-v1'], null, 'Absent draft keys must clear previous profile values');
    packages.restorePackage(target, data, [[oldVideo, newVideo]]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(target, 'browser-notes.json'))).video, newVideo);

    // Exercise the real apply handler with failures after video extraction.
    for (const failure of ['capture', 'backup', 'restore', 'rollback', 'success']) {
      const storage = new Map([['browser-source-edits-v1', '{"old":true}']]);
      let writes = 0, folder, restarted = false;
      const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
      videos.read = async () => ({ ...data, rendererValues: {} });
      videos.extract = async () => { folder = path.join(target, 'workspace-videos', failure); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, 'video.mp4'), 'fixture'); return folder; };
      packages.exportPackage = () => { if (failure === 'backup') throw Error('backup failure'); };
      packages.restorePackage = () => { if (failure === 'restore' || failure === 'rollback') throw Error('restore failure'); };
      const handler = createCatalogExtensions({ userData: () => target, pythonPath: () => '',
        dialog: { showOpenDialog: async () => ({ filePaths: ['fixture.wbp'] }) },
        owner: () => ({ webContents: { executeJavaScript: async code => {
          if (code.startsWith('Object.fromEntries') && failure === 'capture') throw Error('capture failure');
          if (!code.startsWith('Object.fromEntries')) { writes++; if (failure === 'rollback' && writes === 2) throw Error('renderer destroyed'); }
          return vm.runInNewContext(code, { localStorage });
        } } }), restart: () => { restarted = true; } });
      const event = { sender: { id: 1 } };
      const preview = await handler(event, { action: 'package-preview' });
      const apply = handler(event, { action: 'package-apply', token: preview.token });
      if (failure === 'success') {
        await apply; assert(restarted); assert(!storage.has('browser-source-edits-v1'));
        await assert.rejects(handler(event, { action: 'package-apply', token: preview.token }),
          /Önizleme sona erdi/, 'Tüketilmiş paket önizlemesi yeniden uygulandı');
      } else {
        await assert.rejects(apply); assert(!restarted); assert(!fs.existsSync(folder), failure + ': extracted videos must be removed');
        if (failure !== 'rollback') assert.equal(storage.get('browser-source-edits-v1'), '{"old":true}');
      }
    }
    videos.read = async () => ({ ...data, rendererValues: {} });
    const tokenHandler = createCatalogExtensions({ userData: () => target, pythonPath: () => '',
      dialog: { showOpenDialog: async () => ({ filePaths: ['fixture.wbp'] }) },
      owner: () => ({ webContents: { executeJavaScript: async () => ({}) } }),
      restart: () => {} });
    const tokenEvent = { sender: { id: 11 } };
    const realNow = Date.now;
    try {
      let now = 3_000_000;
      Date.now = () => now;
      const preview = await tokenHandler(tokenEvent, { action: 'package-preview' });
      await assert.rejects(tokenHandler({ sender: { id: 12 } },
        { action: 'package-apply', token: preview.token }), /Önizleme sona erdi/,
      'Başka sender paket önizlemesini uyguladı');
      await assert.rejects(tokenHandler(tokenEvent,
        { action: 'folder-apply', token: preview.token, ids: ['x'] }), /Önizleme sona erdi/,
      'Yanlış türde token kabul edildi');
      now += 900001;
      await assert.rejects(tokenHandler(tokenEvent,
        { action: 'package-apply', token: preview.token }), /Önizleme sona erdi/,
      'Süresi dolmuş paket önizlemesi uygulandı');
    } finally { Date.now = realNow; }
    // A1 / R51-01 — crafted browser-session.json must not grant subtitle access.
    // Exercises the real package-preview → package-apply → restart chain, then the
    // same normalize+grant path restoreBrowserSessionState runs at startup.
    videos.read = original.read; videos.extract = original.extract; packages.restorePackage = original.restore;
    const outsideDir = path.join(root, 'outside');
    fs.mkdirSync(outsideDir, { recursive: true });
    const evilSrt = path.join(outsideDir, 'evil.srt');
    fs.writeFileSync(evilSrt, '1\n00:00:01,000 --> 00:00:02,000\ncrafted\n');
    const craftedSession = {
      version: 8, restoreEnabled: true, cleanExit: true, savedAt: Date.now(),
      activeTabId: 'tab1',
      tabs: [{ id: 'tab1', url: 'https://video.example/watch?v=crafted', title: 'crafted',
        subtitleSelection: { primaryId: 'a', secondaryId: '', primaryFile: evilSrt, secondaryFile: evilSrt } }],
    };
    const wbp = path.join(root, 'crafted.wbp');
    fs.writeFileSync(wbp, gzipSync(Buffer.from(JSON.stringify({
      format: 'whisper-workspace', version: 1, created: new Date().toISOString(),
      sourceRoot: outsideDir, mappings: [],
      files: [{ name: 'browser-session.json', data: Buffer.from(JSON.stringify(craftedSession)).toString('base64') }],
      rendererValues: {},
    }))));
    // Control: normalization alone preserves the file fields — sanitizer is the only barrier.
    const normalized = normalizeBrowserSession(craftedSession);
    assert.equal(normalized.tabs.length, 1);
    assert.equal(normalized.tabs[0].subtitleSelection.primaryFile, evilSrt,
      'normalizeSessionTab preserves primaryFile — the grant would fire without sanitizeImportedSession');
    const sessionRoot = path.join(root, 'grant-check');
    fs.mkdirSync(sessionRoot, { recursive: true });
    let restarted = false;
    const grantHandler = createCatalogExtensions({
      userData: () => sessionRoot, pythonPath: () => '',
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [wbp] }) },
      owner: () => ({ webContents: { executeJavaScript: async () => ({}) } }),
      restart: () => { restarted = true; },
    });
    const grantEvent = { sender: { id: 7 } };
    const grantPreview = await grantHandler(grantEvent, { action: 'package-preview' });
    assert.equal(grantPreview.ok, true);
    await grantHandler(grantEvent, { action: 'package-apply', token: grantPreview.token });
    assert.equal(restarted, true, 'package-apply must trigger restart after restore');
    const written = JSON.parse(fs.readFileSync(path.join(sessionRoot, 'browser-session.json'), 'utf8'));
    assert.equal(written.tabs.length, 1);
    assert.equal(written.tabs[0].subtitleSelection.primaryFile, undefined);
    assert.equal(written.tabs[0].subtitleSelection.secondaryFile, undefined);
    // Post-restart path: readBrowserSessionWithStatus + the restore grant loop.
    const access = new SubtitleFileAccess();
    const loaded = readBrowserSessionWithStatus(path.join(sessionRoot, 'browser-session.json'));
    assert.equal(loaded.session.tabs.length, 1, 'sanitized tab must survive normalization');
    for (const snapshot of loaded.session.tabs) {
      for (const slot of ['primaryFile', 'secondaryFile']) {
        const file = snapshot.subtitleSelection?.[slot];
        if (file) access.grant(file);
      }
    }
    assert.equal(access.has(access.inspect(evilSrt)), false,
      'crafted browser-session.json must not produce a subtitleFileAccess grant');

    // R51-09: aynı vektör media-catalog.json için — el yapımı paketteki
    // source.type==='local' yolu kullanıcı seçimi olmadan 'play' grant'ine
    // dönüşmemeli; imported işareti dosya seçiciyi zorunlu kılar.
    const { itemOf } = require('../src/media-catalog-store');
    const outsideVideo = path.join(outsideDir, 'planted.mp4');
    fs.writeFileSync(outsideVideo, 'not-a-real-video');
    const craftedCatalog = { version: 1, items: [
      { id: 'evil1', kind: 'film', title: 'Planted', source: { type: 'local', value: outsideVideo } },
      { id: 'evil2', kind: 'series', title: 'Planted Series', episodes: [
        { id: 's1e1', season: 1, number: 1, source: { type: 'local', value: outsideVideo } }] },
      { id: 'legit', kind: 'film', title: 'Browser One', source: { type: 'browser', value: 'https://video.example/x' } },
    ] };
    const wbp2 = {
      format: 'whisper-workspace', version: 1, created: new Date().toISOString(),
      sourceRoot: outsideDir, mappings: [],
      files: [{ name: 'media-catalog.json', data: Buffer.from(JSON.stringify(craftedCatalog)).toString('base64') }],
      rendererValues: {},
    };
    packages.restorePackage(sessionRoot, wbp2);
    const writtenCatalog = JSON.parse(fs.readFileSync(path.join(sessionRoot, 'media-catalog.json'), 'utf8'));
    assert.equal(writtenCatalog.items[0].source.imported, true, 'film source imported flag missing');
    assert.equal(writtenCatalog.items[1].episodes[0].source.imported, true, 'episode source imported flag missing');
    assert.equal(writtenCatalog.items[2].source.imported, undefined, 'browser source must not be flagged');
    // itemOf round-trip (mağaza yüklemesi) işareti korumalı.
    const reloaded = itemOf(writtenCatalog.items[0]);
    assert.equal(reloaded.source.imported, true, 'sourceOf drops imported flag');
    // Servis katmanı: imported kaynak sessiz grant yerine dosya seçiciye düşer.
    const serviceSource = fs.readFileSync(path.join(__dirname, '../src/media-catalog-service.js'), 'utf8');
    assert.match(serviceSource, /source\.imported === true[\s\S]{0,400}choose\(/,
      'play must route imported local sources through the file picker');
    console.log('workspace restore regressions: non-cascading paths, absent draft clearing, capture/backup/restore/rollback failure cleanup, crafted-session grant denial, imported-catalog re-grant passed');
  } finally {
    videos.read = original.read; videos.extract = original.extract; packages.exportPackage = original.export; packages.restorePackage = original.restore;
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('whisper-restore-regression-')) throw Error('Invalid cleanup root');
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
