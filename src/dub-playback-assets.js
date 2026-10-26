'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { atomicWriteFileSync } = require('./fsync-utils');

// Only a native picker can introduce a path. Saved watch preferences contain
// opaque IDs, never a path that would grant arbitrary file access on restore.
function registerDubPlaybackAssets({ app, ipcMain, dialog, owner, authorized, grantMedia }) {
  const file = () => path.join(app.getPath('userData'), 'dub-playback-assets.json');
  const read = () => {
    if (!fs.existsSync(file())) return {};
    if (fs.statSync(file()).size > 1_000_000) throw Error('Voice attachment index is too large.');
    const rows = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (!rows || typeof rows !== 'object' || Array.isArray(rows) || Object.keys(rows).length > 2000
        || Object.entries(rows).some(([id,file]) => !/^[0-9a-f-]{36}$/.test(id) || typeof file !== 'string' || file.length > 4096 || !path.isAbsolute(file)))
      throw Error('Invalid voice attachment index.');
    return rows;
  };
  const asset = (id, rows) => {
    if (!/^[0-9a-f-]{36}$/.test(id || '') || typeof rows[id] !== 'string') throw Error('Voice attachment is unavailable.');
    const resolved = fs.realpathSync(rows[id]);
    if (!fs.statSync(resolved).isFile() || !/\.(wav|mp3|m4a|flac|ogg|opus|aac)$/i.test(resolved)) throw Error('Voice attachment is unavailable.');
    if (grantMedia(resolved) === false) throw Error('Voice attachment access was denied.');
    return { name: path.basename(resolved), url: pathToFileURL(resolved).href, playbackAsset: { kind: 'local', id } };
  };
  const guard = fn => async (event, input) => {
    if (!authorized(event)) return { ok: false, error: 'Unauthorized request.' };
    try { return await fn(input); } catch (error) { return { ok: false, error: error.message }; }
  };
  ipcMain.handle('dub:choosePlaybackAudio', guard(async () => {
    const result = await dialog.showOpenDialog(owner(), { properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['wav','mp3','m4a','flac','ogg','opus','aac'] }] });
    if (result.canceled || !result.filePaths?.[0]) return { ok: true, canceled: true };
    const rows = read(), resolved = fs.realpathSync(result.filePaths[0]);
    // Reusing the same picked file should not consume another persistent slot.
    const equal = file => process.platform === 'win32' ? file.toLowerCase() === resolved.toLowerCase() : file === resolved;
    const id = Object.keys(rows).find(id => equal(rows[id])) || randomUUID();
    rows[id] = resolved;
    if (Object.keys(rows).length > 2000) throw Error('Voice attachment limit reached.');
    const output = asset(id, rows);
    atomicWriteFileSync(file(), JSON.stringify(rows));
    return { ok: true, output };
  }));
  ipcMain.handle('dub:restorePlaybackAudio', guard(async id => ({ ok: true, output: asset(id, read()) })));
}
module.exports = { registerDubPlaybackAssets };
