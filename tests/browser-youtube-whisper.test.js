const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const { JSDOM } = require('jsdom');
const markup = new JSDOM(fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/index.html'), 'utf8')).window.document;
assert.equal(markup.querySelectorAll('#playerJobBar').length, 1);
assert.equal(markup.getElementById('playerJobBar').parentElement.id, 'playerLayer',
  'browser progress must remain outside the collapsible subtitle sidebar');
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, { value: '', style: {}, classList: { add() {}, remove() {} }, click() { this.clicks = (this.clicks || 0) + 1; } });
  return nodes.get(id);
};
const calls = [];
const ctx = {
  URL, console, Object, Number, Date, setTimeout: fn => { fn(); return 1; },
  player: { workspaceMode: 'browser', mediaKey: 'browser:youtube:abcdefghijk', browserActiveTabId: 'a',
    browserPageUrl: 'https://www.youtube.com/watch?v=abcdefghijk&list=ignored', browserTracks: [],
    browserDuration: 1800, browserTime: 800, subPath: '', sub2Path: '' },
  startPlayerSubtitleTranslation:async config=>{node('makeTransBtn').click();ctx.translationRequest=config;ctx.player.job={kind:'translate'};return {ok:true,job:ctx.player.job};},
  state: {}, $: node, browserTabState: () => ({ id: 'a', service: 'youtube' }),
  buildOptsFromUI: () => ({ input: 'old.mp4', translate: true, translateTo: 'tr' }),
  optsProblem: () => '', logLine() {}, setBrowserSignal() {}, setSubtitleMode() {},
  updatePlayerTaskCenter() {}, updateBrowserSubtitleSummary() {}, syncSubtitlePrimaryAction() {},
  startProgressiveChunk: async job => calls.push(job),
  useBrowserTrack: async (_translate, id) => { ctx.player.subPath = ctx.player.browserTracks.find(t => t.id === id).path; },
};
vm.createContext(ctx);
ctx.URL = URL;
const endpointStart = code.indexOf('function translationEndpointReady(');
vm.runInContext(code.slice(endpointStart, code.indexOf('\n}', endpointStart) + 2), ctx);
function section(from, to) { const start = code.indexOf(from); assert(start >= 0); return code.slice(start, code.indexOf(to, start)); }
vm.runInContext(section('function youtubeVideoId(', 'function mediaKeyFor('), ctx);
vm.runInContext(section('function progressiveRanges(', 'async function startProgressiveChunk('), ctx);
vm.runInContext(section('function cueKey(', 'function progressiveRanges('), ctx);
vm.runInContext(section('async function handleProgressiveTerminal(', 'function playerJobEvent('), ctx);
vm.runInContext(section('function currentBrowserYoutubeUrl(', 'async function exportBrowserAbClip('), ctx);
vm.runInContext(section('function currentBrowserWhisperRange(', 'function openBrowserWhisperRangeSettings('), ctx);
vm.runInContext(section('function parseClipInput(', "['clipStart', 'clipEnd']"), ctx);
ctx.uiText = text => text;
vm.runInContext(section('async function startProgressivePlayerTranscription(', '// "Altyazı oluştur"'), ctx);
(async () => {
  assert.equal(ctx.currentBrowserYoutubeUrl(), 'https://www.youtube.com/watch?v=abcdefghijk');
  for (const url of ['https://evil.test/watch?v=abcdefghijk', 'https://youtube.com/', 'https://youtube.com.evil.test/watch?v=abcdefghijk']) {
    ctx.player.browserPageUrl = url;
    assert.equal(ctx.currentBrowserYoutubeUrl(), '');
  }
  ctx.player.browserPageUrl = 'https://youtu.be/abcdefghijk';
  await ctx.startBrowserYoutubeWhisper(false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].baseOpts.translate, false);
  assert.equal(calls[0].baseOpts.input, undefined);
  assert.equal(calls[0].baseOpts.youtube, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(calls[0].ranges[0].start, 0);
  assert.match(calls[0].baseOpts.outputNameSuffix, /^-whisper-[a-z0-9-]{4,48}$/i);
  // Tek geçiş: aşamalı plan kaldırıldı — konumdan bağımsız tüm video tek işte.
  assert.equal(ctx.progressiveRanges(1306, 8).length, 1,
    'izleme konumu ikinci bir iş üretti');
  assert.deepEqual(Array.from(ctx.progressiveRanges(1306, 8), range => [range.start, range.end]),
    [[0, 1306]]);
  assert.deepEqual(Array.from(ctx.progressiveRanges(1800, 800), range => [range.start, range.end]),
    [[0, 1800]], 'tek geçiş tüm videoyu baştan sona kapsamalı');
  const refreshed = ctx.replaceLiveCuesForRefresh(
    [{ start: 596, end: 599.98, text: 'yarım eski' }, { start: 600, end: 602, text: 'eski sınır' }],
    [{ start: 596, end: 602, text: 'tam yenilenmiş cümle' }],
    { start: 596, end: 1306 });
  assert.deepEqual(Array.from(refreshed, cue => cue.text), ['tam yenilenmiş cümle']);
  assert.equal(calls[0].browserTabId, 'a');
  await ctx.startBrowserYoutubeWhisper(true);
  assert.equal(calls.length, 1, 'meşgulken ikinci iş başladı');
  ctx.state.running = false;
  await ctx.startBrowserYoutubeWhisper(true);
  assert.equal(calls[1].baseOpts.translate, true);
  assert.equal(calls[1].baseOpts.translateKeepSource, true);
  ctx.state.running = false;
  ctx.player.browserTracks = [{ id: 'tr', path: 'translated.srt', generatedBy: 'whisper', role: 'translation', language: 'tr', status: 'complete' }];
  node('translateTo').value = 'tr';
  await ctx.startBrowserYoutubeWhisper(true);
  assert.equal(calls.length, 2, 'hazır çeviri tekrar Whisper çalıştırdı');
  ctx.player.browserTracks = [{ id: 'src', path: 'source.srt', generatedBy: 'whisper', role: 'source' }];
  await ctx.startBrowserYoutubeWhisper(true);
  assert.equal(node('makeTransBtn').clicks, 1);
  assert.equal(calls.length, 2, 'hazır kaynak tekrar Whisper çalıştırdı');
  ctx.useBrowserTrack = async () => { ctx.player.browserActiveTabId = 'b'; };
  await ctx.startBrowserYoutubeWhisper(true);
  assert.equal(node('makeTransBtn').clicks, 1, 'geciken kaynak yeni sekmede çeviri başlattı');
  ctx.player.browserActiveTabId = 'a';
  ctx.state.running = false;
  ctx.player.browserWhisperRange = { url: ctx.currentBrowserYoutubeUrl(), range: { start: 120, end: 600 } };
  await ctx.startBrowserYoutubeWhisper(true);
  assert.equal(calls.length, 3, 'a selected range must bypass reusable full-video source');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[2].ranges)), [{ start: 120, end: 600 }]);
  assert.equal(calls[2].baseOpts.translate, true);
  assert.equal(calls[2].clipRange.start, 120);
  let submitted;
  ctx.startTranscribeSafe = async opts => { submitted = opts; return { ok: true }; };
  vm.runInContext(section('async function startProgressiveChunk(', 'async function finishProgressiveJob('), ctx);
  await ctx.startProgressiveChunk(ctx.player.job);
  assert.equal(submitted.clipStart, 120);
  assert.equal(submitted.clipEnd, 600);
  assert.equal(submitted.translate, true, 'same clipped transcription job must request translation');
  ctx.startProgressiveChunk = async job => calls.push(job);
  assert.equal(ctx.validateBrowserWhisperRange(true, '0:00', '10:00', 1800).range.end, 600);
  for (const [a,b] of [['10:00','0:00'],['bad','10:00'],['0:00','40:00'],['','10:00']]) {
    assert(ctx.validateBrowserWhisperRange(true,a,b,1800).error);
  }
  assert.equal(ctx.validateBrowserWhisperRange(false, '', '', 1800).range, null);
  ctx.player.browserWhisperRange.url = 'https://www.youtube.com/watch?v=another';
  assert.equal(ctx.currentBrowserWhisperRange(), null, 'range must not leak to another video');
  ctx.state.running = false;
  ctx.browserSubtitleSync = { hashText: text => Buffer.from(text).toString('hex') };
  ctx.renderBrowserTracks = () => {};
  vm.runInContext(section('function registerCompletedBrowserOutputs(', 'async function attachCompletedJobSubtitles('), ctx);
  ctx.registerCompletedBrowserOutputs({ items: [{ role: 'translation', path: 'partial.srt', language: 'tr', status: 'partial', completed: 1, failed: 2 }],
    translation: { sourceHash: 'hash' } }, { workspaceMode: 'browser', browserTabId: 'a', mediaKey: ctx.player.mediaKey, selectedSubPath: 'source.srt' });
  const registered = ctx.player.browserTracks.find(track => track.path === 'partial.srt');
  assert.equal(registered.sourceTrackId, 'src', 'çeviri mevcut kaynak izinden koptu');
  assert.equal(registered.status, 'partial');
  assert.equal(registered.failed, 2);
  ctx.registerCompletedBrowserOutputs({ items: [{ role: 'source', path: 'range.srt' }] },
    { workspaceMode: 'browser', browserTabId: 'a', mediaKey: ctx.player.mediaKey, clipRange: { start: 120, end: 600 } });
  assert.equal(ctx.player.browserTracks.find(t => t.path === 'range.srt').generatedBy, 'whisper-range', 'partial video output must not masquerade as reusable full-video output');
  const before = ctx.player.browserTracks.length;
  ctx.registerCompletedBrowserOutputs({ items: [{ role: 'translation', path: 'wrong.srt' }] },
    { workspaceMode: 'browser', browserTabId: 'other', mediaKey: ctx.player.mediaKey });
  assert.equal(ctx.player.browserTracks.length, before, 'başka sekmenin çıktısı eklendi');

  // Tek geçişli oynatıcı işi çeviri aşamasında ilerleme göstermeli: llm_progress
  // önceden yalnız 'translate' işinde işleniyordu, 'progressive' işte çubuk
  // transkripsiyonun %100'ünde donuk kalıyordu.
  ctx.updateMakeTransState = () => {};
  vm.runInContext(section('function playerJobEvent(', 'function completedSubtitleOutputs('), ctx);
  const progJob = { running: true, mediaKey: ctx.player.mediaKey, kind: 'progressive',
    browserTabId: 'a', ranges: [{ start: 0, end: 1800 }], rangeIndex: 0 };
  ctx.player.job = progJob;
  ctx.playerJobEvent({ type: 'llm_progress', percent: 42, done: 106, total: 252, failed: 3, stage: 'translate' });
  assert.equal(node('playerJobText').textContent, 'Çeviri oluşturuluyor · %42 · 106/252 blok · 3 eksik');
  assert.equal(node('playerJobFill').style.width, '42%');
  assert.equal(progJob.completed, 106);
  ctx.playerJobEvent({ type: 'llm_progress', percent: 80, done: 10, total: 12 });
  assert.equal(node('playerJobText').textContent, 'LLM düzeltiyor · %80 · 10/12 blok');
  ctx.playerJobEvent({ type: 'status', stage: 'translate', text: 'Ceviriliyor: Turkce' });
  assert.equal(node('playerJobFill').style.width, '0%');
  assert.equal(progJob.percent, null, 'new stage reused transcription percentage');
  ctx.playerJobEvent({ type: 'llm_progress', percent: 0, done: 0, total: 252,
    stage: 'translate', waiting: true, elapsed: 35 });
  assert.equal(node('playerJobText').textContent,
    'Çeviri oluşturuluyor · %0 · 0/252 blok · Sağlayıcı yanıtı bekleniyor · 35 sn');
  ctx.player.browserActiveTabId = 'other';
  ctx.playerJobEvent({ type: 'llm_progress', percent: 50, stage: 'translate' });
  assert.equal(progJob.percent, 0, 'background tab progress contaminated current video');
  ctx.player.browserActiveTabId = 'a';
  ctx.player.job = null;

  const terminalActions = [];
  const job = {
    running: true, awaitingExit: false, mediaKey: ctx.player.mediaKey,
    browserTabId: 'a', ranges: [{ start: 0, end: 600 }, { start: 600, end: 1200 }],
    rangeIndex: 0, outputFiles: [], outputDescriptors: [],
  };
  ctx.player.job = job;
  ctx.player.workspaceMode = 'browser';
  ctx.completedSubtitleOutputs = event => ({
    items: event.outputs || [],
    source: (event.outputs || []).find(item => item.role === 'source') || null,
    translation: null,
  });
  ctx.subtitleOutputContract = { errorLabel: code => code === 'quota' ? 'Sağlayıcı kotası doldu' : code };
  ctx.finishProgressiveJob = async () => terminalActions.push('finish');
  ctx.startProgressiveChunk = async () => terminalActions.push('next');
  await ctx.handleProgressiveTerminal({
    type: 'done', files: ['source.srt'],
    outputs: [{ role: 'source', path: 'source.srt' }],
    translation: { requested: true, failed: 20, lastError: 'quota', stopProgressive: true },
  }, job);
  await ctx.handleProgressiveTerminal({ type: 'exit', code: 0 }, job);
  assert.deepEqual(terminalActions, ['finish'], 'kalıcı çeviri hatasından sonra ikinci aralık başlatıldı');
  assert.equal(job.rangeIndex, 0);

  ctx.state.running = false;
  ctx.player.browserActiveTabId = 'a';
  ctx.player.browserWhisperRange = null;
  ctx.player.browserTracks = [{ id: 'normal', path: 'normal.srt', generatedBy: 'whisper',
    role: 'translation', language: 'tr', status: 'complete' }];
  const speechJobs = [];
  ctx.startProgressiveChunk = async job => speechJobs.push(job);
  ctx.buildOptsFromUI = () => ({ translateTo: 'tr', translateRefine: true,
    llmPostprocess: true, mergeContinuation: true, dedupeCues: true });
  await ctx.startBrowserYoutubeWhisper(true, { forSpeech: true });
  assert.equal(speechJobs.length, 1, 'ordinary ready translation was reused for speech');
  const speech = speechJobs[0].baseOpts;
  assert.equal(speech.translateForSpeech, true);
  assert.equal(speech.translateRefine, true);
  for (const field of ['llmPostprocess', 'mergeContinuation', 'dedupeCues']) assert.equal(speech[field], false);
  ctx.state.running = false;
  ctx.player.browserTracks = [{ id: 'speech', path: 'speech.srt', generatedBy: 'whisper',
    role: 'translation', language: 'tr', status: 'complete', forSpeech: true }];
  await ctx.startBrowserYoutubeWhisper(true, { forSpeech: true });
  assert.equal(speechJobs.length, 2, 'old speech prompt output bypassed the improved translation');
  speechJobs.pop(); // Keep the remaining independent assertions on the original job index.
  ctx.state.running = false;
  ctx.player.browserTracks[0].speechProtocol = 'speech-v8-nominal-quote-gates';
  await ctx.startBrowserYoutubeWhisper(true, { forSpeech: true });
  assert.equal(speechJobs.length,2,'v8 speech must not bypass current meaning checks');
  speechJobs.pop();ctx.state.running=false;
  const backendProtocol=fs.readFileSync(require('node:path').join(__dirname,'../backend/transcribe.py'),'utf8').match(/SPEECH_TRANSLATION_PROTOCOL = '([^']+)'/)[1];
  assert.equal(backendProtocol,'speech-v18-pronoun-context-review');
  assert(code.includes("speechProtocol: forSpeech ? '"+backendProtocol+"'"),'new track labels must match backend');
  ctx.player.browserTracks[0].speechProtocol = backendProtocol;
  ctx.useBrowserTrack = async (_translate, id) => { ctx.player.subPath = ctx.player.browserTracks.find(t => t.id === id).path; };
  await ctx.startBrowserYoutubeWhisper(true, { forSpeech: true });
  assert.equal(speechJobs.length, 1, 'ready speech translation was regenerated');
  ctx.player.browserWhisperRange = { url: ctx.currentBrowserYoutubeUrl(), range: { start: 120, end: 300 } };
  ctx.player.browserTracks[0].generatedBy = 'whisper-range';
  ctx.player.browserTracks[0].clipRange = { start: 120, end: 300 };
  await ctx.startBrowserYoutubeWhisper(true, { forSpeech: true });
  assert.equal(speechJobs.length, 1, 'same completed range should not rerun Whisper or translation');
  ctx.player.browserWhisperRange.range.end = 400;
  await ctx.startBrowserYoutubeWhisper(true, { forSpeech: true });
  assert.equal(speechJobs.length, 2, 'different range incorrectly reused completed output');
  assert.equal(speechJobs[1].ranges[0].end, 400);
  ctx.state.running = false;
  ctx.player.browserWhisperRange.range.end = 300;
  node('translateModel').value = 'new-model';
  node('translateEndpointPreset').value = 'custom';
  node('translateBaseUrl').value = 'https://provider.example/v1/';
  ctx.player.browserTracks[0].model = 'old-model';
  ctx.player.browserTracks[0].provider = 'https://provider.example/v1';
  await ctx.startBrowserYoutubeWhisper(true, { forSpeech: true });
  assert.equal(speechJobs.length, 3, 'speech output from another model was silently reused');
  ctx.state.running = false;
  ctx.player.browserTracks[0].model = 'new-model';
  await ctx.startBrowserYoutubeWhisper(true, { forSpeech: true });
  assert.equal(speechJobs.length, 3, 'matching model/provider/range should reuse output');

  console.log('Browser YouTube Whisper: URL, intent, mode-specific reuse, time range, race and stop passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
