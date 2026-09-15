'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const uiModel = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer-ui-model.js'), 'utf8');
const workspacePackage = fs.readFileSync(path.join(__dirname, '..', 'src', 'workspace-package.js'), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `Bölüm bulunamadı: ${start}`);
  return source.slice(from, to);
}

const transcribe = section(main, "ipcMain.handle('transcribe:start'", "ipcMain.handle('transcribe:cancel'");
assert.match(transcribe, /for \(const optionName of \['syncSrt', 'translateExisting'\]\)[\s\S]*authorizeSubtitleFile/);
assert.match(transcribe, /cleanupFailedJobStart[\s\S]*endJobLog\(\)[\s\S]*fs\.rmSync\(activeJobTempDir/);

const watch = section(main, 'function scanWatchFolder()', "ipcMain.handle('watch:start'");
assert.match(watch, /mediaFileAccess\.grant\(file\)[\s\S]*watch:newFiles/);

const queueRestore = section(main, 'function loadQueueState()', 'function persistQueueTerminal');
assert.doesNotMatch(queueRestore, /mediaFileAccess\.grant/);
assert.doesNotMatch(section(main, "ipcMain.handle('library:list'", "ipcMain.handle('library:upsert'"), /grantKnownMediaRecords/);
assert.match(section(main, "ipcMain.handle('library:authorizeItem'", "ipcMain.handle('library:upsert'"), /authorizeMediaFile/);

const search = section(main, 'function subtitleTextForSearch', 'function subtitleSearchBlocks');
assert.match(search, /subtitleFileAccess\.inspect[\s\S]*subtitleFileAccess\.has/);
assert.doesNotMatch(section(main, 'function restoreBrowserMediaSubtitlePreference', 'function browserWatchMediaId'), /\.grant\(/);

const burnin = section(main, "ipcMain.handle('burnin:start'", "ipcMain.handle('burnin:cancel'");
assert.match(burnin, /authorizeMediaFile\(videoPath\)[\s\S]*authorizeSubtitleFile\(subPath\)/);
const pdf = section(main, "ipcMain.handle('pdf:open'", "ipcMain.handle('pdf:state'");
assert.match(pdf, /pickedByDialog[\s\S]*showMessageBox[\s\S]*PDF dosyasına erişim onaylanmadı/);

for (const name of ['onWatchFlushBeforeClose', 'onMediaEvent']) {
  const start = preload.indexOf(`${name}:`);
  const body = preload.slice(start, preload.indexOf('\n  },', start) + 5);
  assert.match(body, /return \(\) => ipcRenderer\.removeListener/);
}

assert.match(renderer, /exitForActiveJob[\s\S]*event\.queueItemId !== state\.currentQueueId && !exitForActiveJob/);
assert.match(renderer, /authorizeWatchItem\?\.\(item\.key\)/);
assert.match(renderer, /state\.watchDir = s\.watchDir \|\| null/);
assert.match(renderer, /embeddedSubtitleLoadRequest[\s\S]*staleGeneration\(targetGeneration\)/);
assert.match(renderer, /type === 'youtube'\) return mediaKeyFor\('youtube', value\)/);
assert.match(renderer, /NOTE_DRAFT_MAX_COUNT = 50[\s\S]*baseVersion: noteDraftVersion/);
assert.match(renderer, /writeSubtitle\(job\.sourceFile[\s\S]*if \(!result\?\.ok\) throw/);
assert.match(renderer, /playerPreviewUnmatchedEdits = \[\][\s\S]*copyPreviewEdits.*classList\.add/);
assert.match(uiModel, /translation_chunk[\s\S]*translation_refresh[\s\S]*chat[\s\S]*explain/);
assert.doesNotMatch(workspacePackage, /STORAGE_KEYS[^\n]*browser-subtitle-drafts-v1/);
assert.match(section(main, "ipcMain.handle('watch:start'", "ipcMain.handle('watch:stop'"), /watchFolderAccess[\s\S]*showMessageBox/);
assert.match(section(main, "ipcMain.on('library:upsert-before-close'", 'function flushWatchLibraryBeforeClose'), /senderFrame !== mainWindow\.webContents\.mainFrame/);
assert.match(main, /tab\.translationSourceHash = sourceHash/);
assert.doesNotMatch(section(main, 'const isCurrent = \(\) => !tab.closing', 'tab.translationScheduler = scheduler'), /browserWatchMediaId/);

console.log('Rapor 29-31 erişim, yaşam döngüsü ve altyazı regresyonları geçti.');
