'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const packages = require('../src/workspace-package');
const videos = require('../src/workspace-video-package');
const { createCatalogExtensions } = require('../src/catalog-extensions');

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
    assert.deepEqual(JSON.parse(mapped['browser-subtitle-drafts-v1']), { [newVideo]: { path: newVideo } });
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
      } else {
        await assert.rejects(apply); assert(!restarted); assert(!fs.existsSync(folder), failure + ': extracted videos must be removed');
        if (failure !== 'rollback') assert.equal(storage.get('browser-source-edits-v1'), '{"old":true}');
      }
    }
    console.log('workspace restore regressions: non-cascading paths, absent draft clearing, capture/backup/restore/rollback failure cleanup passed');
  } finally {
    videos.read = original.read; videos.extract = original.extract; packages.exportPackage = original.export; packages.restorePackage = original.restore;
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('whisper-restore-regression-')) throw Error('Invalid cleanup root');
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
