'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const scheduler = require('../src/browser-translation-scheduler');
const terminology = require('../src/browser-terminology');

async function main() {
  const code = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const source = code.slice(code.indexOf('function startBrowserTranslation('), code.indexOf('function stopBrowserLiveAsr('));
  const stored = [], archived = [];
  const context = {
    ...scheduler, ...terminology, createHash, Map,
    browserTranslationConfig: () => ({ targetLanguage: 'tr', model: 'fixture', workers: 1,
      glossary: [], register: 'natural', profanity: 'preserve', terminologyEnabled: false, endpoint: 'http://localhost/fixture' }),
    browserTranslationConfigProblem: () => '',
    browserExtras: null, browserWatchMediaId: () => 'fixture-media', browserNetworkOnline: true,
    safeTranslationEndpoint: value => value, browserTranslationCache: () => new Map(),
    requestBrowserSentenceTranslation: async () => ({ text: 'Aynı çeviri.', parts: ['Aynı çeviri.'] }),
    sendBrowserEvent() {}, updateBrowserTranslationDiagnostics() {}, noteBrowserDiagnosticActivity() {},
    browserSubtitleIdentityHash: value => createHash('sha256').update(value).digest('hex'),
    persistBrowserTrack: (_tab, track, cues, options) => { stored.push({ track, cues, options }); return { ...track, persisted: true }; },
    browserTranslationArchive: () => ({ saveSubtitle: record => { archived.push(record); return { ok: true, path: 'fixture.srt' }; } }),
  };
  vm.createContext(context); vm.runInContext(source, context);
  const tab = { id: 'one', generation: 1, position: 0 };
  const before = [{ id: 'a', start: 0, end: 2, text: 'Wait.' }];
  assert(context.startBrowserTranslation(tab, before, { trackId: 'source' }).ok);
  await tab.translationScheduler.whenIdle();
  assert.equal(archived.length, 1);
  const first = archived[0];
  const after = [{ id: 'a', start: 0, end: 2, text: 'Please wait.' }];
  assert(context.startBrowserTranslation(tab, after, { trackId: 'source', refresh: true }).ok);
  await tab.translationScheduler.whenIdle();
  assert.equal(archived.length, 2, 'Same translated text must still persist under the new source identity');
  assert.notEqual(archived[1].sourceHash, first.sourceHash);
  assert.notEqual(archived[1].trackId, first.trackId);
  assert.equal(archived[1].sourceHash, createHash('sha256').update(JSON.stringify([[0, 2, 'Please wait.']])).digest('hex'));
  assert.equal(stored[1].options.sourceHash, archived[1].sourceHash);
  assert.notEqual(stored[0].cues[0].sourceCueHash, stored[1].cues[0].sourceCueHash);
  assert(context.startBrowserTranslation(tab, [
    { id: 'q', start: 0, end: 2, text: 'Will you come?', speaker: 'A' },
    { id: 'a', start: 3, end: 5, text: 'I will.', speaker: 'B' },
  ], { trackId: 'dialogue' }).ok);
  await tab.translationScheduler.whenIdle();
  const answer = tab.translationScheduler.sentences.find(row => row.text === 'I will.');
  assert.equal(answer.contextBefore[0].text, 'Will you come?');
  assert.equal(answer.contextBefore[0].speaker, 'A');
  console.log('browser source refresh: real scheduler/main persistence keeps archive, track and cue identities aligned');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
