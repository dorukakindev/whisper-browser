'use strict';

const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');
const { summarizeTranslationIntegrity } = require('../src/browser-translation-integrity');

const sourceCues = [
  { id: 'a', text: 'Bir' }, { id: 'b', text: 'İki' }, { id: 'c', text: 'Üç' },
];

const partial = summarizeTranslationIntegrity({
  sourceCues,
  results: new Map([['a', { cueId: 'a', text: 'One' }]]),
  state: { total: 2, completed: 1, queued: [], pending: [], failures: [{ sentenceId: 's2' }] },
});
assert.equal(partial.status, 'partial');
assert.equal(partial.reason, 'provider-failure');
assert.equal(partial.sourceCues, 3);
assert.equal(partial.translatedCues, 1);
assert.deepEqual(partial.missingCueIds, ['b', 'c']);

const running = summarizeTranslationIntegrity({
  sourceCues, results: [{ cueId: 'a' }],
  state: { total: 2, completed: 1, queued: ['s2'], pending: [], failures: [] },
});
assert.equal(running.status, 'running');
// Kuyruktaki cümle pipeline'a kabul edilmiş sayılır (rapor 69 O15):
// completed+pending+queued+failed toplamı submittedSentences'ı verir.
assert.equal(running.submittedSentences, 2);

const complete = summarizeTranslationIntegrity({
  sourceCues, results: sourceCues.map((cue) => ({ cueId: cue.id, text: 'Translation' })),
  state: { total: 2, completed: 2, queued: [], pending: [], failures: [] },
});
assert.equal(complete.status, 'complete');
assert.equal(complete.missingCues, 0);

const invalidOutput = summarizeTranslationIntegrity({ sourceCues,
  results: [{ cueId: 'a', text: 'One' }, { cueId: 'b', text: ' ' }, { cueId: 'c' }, { cueId: 'foreign', text: 'Other track' }],
  state: { total: 2, completed: 2, pending: [], queued: [] } });
assert.equal(invalidOutput.status, 'partial');
assert.equal(invalidOutput.translatedCues, 1);
assert.deepEqual(invalidOutput.missingCueIds, ['b', 'c']);
assert.deepEqual(summarizeTranslationIntegrity({ sourceCues: [{ text: 'A' }, { text: 'B' }],
  results: [{ text: '' }, { text: 'İki' }] }).missingCueIds, ['index:0']);

const captureGap = summarizeTranslationIntegrity({
  sourceCues, results: sourceCues.map((cue) => ({ cueId: cue.id, text: 'Çeviri' })),
  state: { total: 2, completed: 2, pending: [], queued: [] },
  capture: [{ streamKey: 'dash', ranges: [{ start: 0, end: 10 }],
    missingRanges: [{ start: 10, end: 12 }] }],
});
assert.equal(captureGap.status, 'partial');
assert.equal(captureGap.reason, 'capture-gap');

const fileGap = summarizeTranslationIntegrity({
  sourceCues, results: sourceCues.map((cue) => ({ cueId: cue.id, text: 'Çeviri' })),
  state: { total: 2, completed: 2, pending: [], queued: [] },
  fileCueIds: new Set(['a', 'c']),
});
assert.equal(fileGap.reason, 'file-gap');
assert.deepEqual(fileGap.missingFileCueIds, ['b']);

const displayGap = summarizeTranslationIntegrity({
  sourceCues, results: sourceCues.map((cue) => ({ cueId: cue.id, text: 'Çeviri' })),
  state: { total: 2, completed: 2, pending: [], queued: [] },
  displayedCues: [{ id: 'web-tr-a', text: 'Bir' }, { cueId: 'b', text: 'İki' }],
});
assert.equal(displayGap.reason, 'display-gap');
assert.deepEqual(displayGap.missingDisplayCueIds, ['c']);

const endToEnd = summarizeTranslationIntegrity({
  sourceCues, results: sourceCues.map((cue) => ({ cueId: cue.id, text: 'Çeviri' })),
  state: { total: 2, completed: 2, pending: [], queued: [] },
  capture: [{ ranges: [{ start: 0, end: 12 }], missingRanges: [] }],
  fileCues: sourceCues.map((cue) => ({ ...cue, text: 'Dosya' })),
  displayedCueIds: new Set(['web-tr-a', 'b', 'c']),
});
assert.equal(endToEnd.status, 'complete');
assert.equal(endToEnd.writtenCues, 3);
assert.equal(endToEnd.displayedCues, 3);
const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const displayedStart = mainSource.indexOf("ipcMain.handle('browser:translation:displayed'");
const displayedEnd = mainSource.indexOf("ipcMain.handle('browser:translation:snapshot'", displayedStart);
const displayedHandler = mainSource.slice(displayedStart, displayedEnd);
assert(displayedStart >= 0 && displayedEnd > displayedStart, 'Görünüm bütünlüğü IPC handler yok.');
assert.match(displayedHandler, /authorizedBrowserSender\(event\)/);
assert.match(displayedHandler, /activeRequestedBrowserTab\(request\.tabId\)/);
assert.match(displayedHandler, /request\.trackId[\s\S]*tab\.translationTrackId/);
assert.match(displayedHandler, /slice\(0, 20000\)/);
assert.match(displayedHandler, /replace\(\/\^web-tr-\//);
assert.match(displayedHandler, /updateBrowserTranslationDiagnostics\(tab\)/);
const exportStart = mainSource.indexOf("ipcMain.handle('browser:subtitle:export'");
const exportEnd = mainSource.indexOf("ipcMain.handle('browser:diagnostics:export'", exportStart);
const exportHandler = mainSource.slice(exportStart, exportEnd);
assert.match(exportHandler, /translationFileCueIds = new Set/);
assert.match(exportHandler, /validateBrowserSubtitleDocument/);
assert.match(exportHandler, /integrity:/);
assert.match(preloadSource, /reportBrowserTranslationDisplayed:[\s\S]*browser:translation:displayed/);
assert.match(rendererSource, /applyBrowserTranslationResult[\s\S]*reportBrowserTranslationDisplayed/);
assert.match(rendererSource, /restoreBrowserTranslationSnapshot[\s\S]*reportBrowserTranslationDisplayed/);

console.log('browser-translation-integrity: 10 test geçti');
