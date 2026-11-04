'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');

async function fixture(t, count, probe) {
  const temp = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'media-hub-metadata-'));
  const media = path.join(root, 'media'), profile = path.join(root, 'profile');
  fs.mkdirSync(media); fs.mkdirSync(profile);
  for (let index = 0; index < count; index++) {
    fs.writeFileSync(path.join(media, String(index).padStart(4, '0') + '.mp4'), '');
  }
  const app = new EventEmitter();
  app.getPath = () => profile;
  t.after(() => {
    app.emit('before-quit');
    assert.equal(path.dirname(root), temp);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const serviceFile = require.resolve('../src/media-hub-service');
  const nativeRequire = createRequire(serviceFile), module = { exports: {} }, calls = [];
  const registerRequire = name => {
    if (name === './browser-media-tools') return { run: async (executable, args) => {
      assert.equal(executable, 'fixture-ffprobe');
      const file = args.at(-1); calls.push(file);
      if (probe) await probe(file);
      return JSON.stringify({ format: { duration: '123.5' }, streams: [{ codec_type: 'audio', tags: { language: 'eng' } }] });
    } };
    // Explicit scans drive these tests; native recursive watcher timing is unrelated.
    if (name === 'node:fs') return { ...fs, watch: () => {
      const watcher = new EventEmitter(); watcher.close = () => {}; return watcher;
    } };
    return nativeRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(serviceFile, 'utf8'), {
    require: registerRequire, module, Buffer, setTimeout, clearTimeout,
  }, { filename: serviceFile });
  const service = module.exports.registerMediaHub({
    app, ipcMain: { handle() {} }, authorized: () => true, owner: () => null,
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [media] }) },
    inspectMedia: file => file, grantMedia() {}, catalogStore: () => ({ list: () => [] }),
    ffprobe: () => 'fixture-ffprobe',
  });
  const request = input => service.handle({ sender: { id: 1 } }, input);
  const added = await request({ action: 'folder-add' });
  assert.equal(added.ok, true); assert.equal(added.folder.files.length, count);
  return { request, folder: added.folder, calls };
}

async function readPending(request, initial) {
  let folder = initial;
  for (let batch = 0; batch < 40; batch++) {
    const ids = folder.files.filter(file => !file.metadataRead).slice(0, 20).map(file => file.id);
    if (!ids.length) return folder;
    const result = await request({ action: 'folder-metadata', folderId: folder.id, ids });
    assert.equal(result.ok, true, result.error);
    folder = result.folder;
  }
  assert.fail('Pending files did not advance through the scanned folder.');
}

test('all 600 scanned files remain reachable without evicting earlier measurements', async t => {
  const { request, folder: initial, calls } = await fixture(t, 600);
  const folder = await readPending(request, initial);
  assert.equal(calls.length, 600); assert.equal(new Set(calls).size, 600);
  assert.equal(folder.files.filter(file => file.metadataRead).length, 600);
  for (const file of folder.files) {
    assert.equal(file.durationSeconds, 123.5); assert.equal(file.language, 'eng');
  }
  const cached = await request({ action: 'folder-metadata', folderId: folder.id, ids: folder.files.slice(0, 20).map(file => file.id) });
  assert.equal(cached.ok, true); assert.equal(calls.length, 600);
});

test('20 failed early files do not starve later files and explicit retry can recover them', async t => {
  let failing = true;
  const { request, folder: initial, calls } = await fixture(t, 600, file => {
    if (failing && Number(path.basename(file, '.mp4')) < 20) throw Error('Fixture probe failed.');
  });
  let folder = await readPending(request, initial);
  assert.equal(calls.length, 600);
  const failed = folder.files.filter(file => file.metadataError);
  assert.equal(failed.length, 20); assert.equal(folder.files.filter(file => file.durationSeconds === 123.5).length, 580);
  for (const file of failed) {
    assert.equal(file.metadataRead, true); assert.equal(file.durationSeconds, null); assert.equal(file.language, null);
    assert.equal(file.spokenLanguages.length, 0);
  }
  const ids = failed.map(file => file.id);
  let result = await request({ action: 'folder-metadata', folderId: folder.id, ids });
  assert.equal(result.ok, true); assert.equal(result.results.filter(row => !row.ok).length, 20);
  assert.equal(calls.length, 600, 'Ordinary reads reuse the failed attempt instead of blocking progress.');
  failing = false;
  result = await request({ action: 'folder-metadata', folderId: folder.id, ids, retry: true });
  assert.equal(result.ok, true); assert.equal(result.results.filter(row => row.ok).length, 20);
  assert.equal(calls.length, 620);
  folder = result.folder;
  assert.equal(folder.files.filter(file => file.metadataError).length, 0);
  assert.equal(folder.files.filter(file => file.durationSeconds === 123.5).length, 600);
});

test('unchanged rescans and enabled toggles retain measurements; changed size invalidates one file', async t => {
  const { request, folder: initial, calls } = await fixture(t, 2);
  let folder = await readPending(request, initial);
  let result = await request({ action: 'folder-scan', folderId: folder.id });
  assert.equal(result.ok, true); folder = result.folder;
  assert.equal(folder.files.filter(file => file.metadataRead).length, 2);
  for (const enabled of [false, true]) {
    result = await request({ action: 'folder-enabled', folderId: folder.id, enabled });
    assert.equal(result.ok, true); assert.equal(result.folder.enabled, enabled);
    assert.equal(result.folder.files.filter(file => file.metadataRead).length, 2);
  }
  const changed = folder.files[0], stable = folder.files[1];
  fs.writeFileSync(changed.path, 'changed size');
  result = await request({ action: 'folder-scan', folderId: folder.id });
  assert.equal(result.ok, true); folder = result.folder;
  const invalidated = folder.files.find(file => file.id === changed.id);
  assert.equal(invalidated.metadataRead, undefined); assert.equal(invalidated.durationSeconds, undefined);
  assert.equal(folder.files.find(file => file.id === stable.id).durationSeconds, 123.5);
  folder = await readPending(request, folder);
  assert.equal(calls.length, 3); assert.equal(calls.at(-1), changed.path);
  assert.equal(folder.files.filter(file => file.metadataRead).length, 2);
});
