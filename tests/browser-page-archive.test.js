'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');

assert.match(main, /async function saveBrowserPageArchive/);
assert.match(main, /await wc\.savePage\(outputPath, 'MHTML'\)/);
assert.match(main, /ipcMain\.handle\('browser:archivePage'/);
assert.match(main, /activeRequestedBrowserTab\(request && request\.tabId\)/);
assert.match(preload, /archiveBrowserPage: \(tabId\) => ipcRenderer\.invoke\('browser:archivePage'/);
assert.match(html, /id="browserArchivePage"[^>]*>Sayfayı arşivle</);
assert.match(renderer, /window\.api\.archiveBrowserPage\?\.\(player\.browserActiveTabId\)/);
assert.match(renderer, /Sayfanın çevrimdışı MHTML kopyası kaydedildi/);

console.log('browser-page-archive: MHTML IPC, UI ve etkin sekme sınırı doğrulandı');
