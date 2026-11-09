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
  URL, console, Object, Number, Date, interfaceChoice:tr=>tr, setTimeout: fn => { fn(); return 1; },
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

  ctx.state.running=false;ctx.player.browserTracks=[];
  Object.assign(ctx.player,{workspaceMode:'browser',browserActiveTabId:'audio-tab',mediaKey:'web:episode',generation:12,browserPageUrl:'https://publisher.example/episode',browserMediaSeen:true});
  const audioTab={id:'audio-tab',generation:2,mediaId:'episode',browserClockSample:{mediaKey:'web:episode',generation:12,mediaType:'audio',mediaToken:'audio-one'}};
  ctx.browserTabState=()=>audioTab;const audioRequests=[];
  ctx.window={api:{browserExtras:async request=>{audioRequests.push(request);return {ok:true,path:'prepared.mp3',mediaToken:'audio-one'};}}};
  await ctx.startBrowserYoutubeWhisper(false,{clipRange:{start:0,end:10}});
  assert.equal(audioRequests[0].action,'whisper-audio');assert.equal(ctx.player.job.baseOpts.input,'prepared.mp3');assert.equal(ctx.player.job.baseOpts.youtube,undefined);assert.equal(ctx.player.job.browserMediaToken,'audio-one');assert.equal(ctx.player.job.ranges[0].end,10);
  ctx.state.running=false;await ctx.startBrowserYoutubeWhisper(true,{clipRange:{start:0,end:10}});assert.equal(ctx.player.job.baseOpts.translate,true);assert.equal(ctx.player.job.baseOpts.translateKeepSource,true);
  ctx.pSecToTime=seconds=>String(seconds)+'s';
  ctx.PodcastTaskScope=require('../src/renderer/podcast-task-scope');
  ctx.player.browserWhisperRange={url:ctx.player.browserPageUrl,tabId:'audio-tab',mediaKey:'web:episode',mediaToken:'audio-one',range:{start:0,end:10}};
  assert.equal(ctx.currentBrowserWhisperRange().end,10);
  assert.equal(ctx.browserWhisperScopeLabel(),'0:00 → 0:10 · İşlenecek süre 0:10');
  ctx.player.browserWhisperRange.tabId='other-tab';
  assert.equal(ctx.currentBrowserWhisperRange(),null);
  assert.match(ctx.browserWhisperScopeLabel(),/^Bölümün tamamı · /);
  ctx.player.browserWhisperRange.tabId='audio-tab';
  assert.equal(ctx.browserWhisperSourceChanged(ctx.player.job),false);audioTab.browserClockSample.mediaToken='audio-two';assert.equal(ctx.browserWhisperSourceChanged(ctx.player.job),true);assert.equal(ctx.currentBrowserWhisperRange(),null);
  const retained=[];ctx.rememberPendingPlayerLoad=(event,job)=>retained.push({event,job});
  assert.equal(await ctx.handleProgressiveTerminal({type:'done',files:['old-source.srt']},ctx.player.job),true);assert.equal(retained.length,1,'completed output remains pending instead of loading into changed audio');
  ctx.state.running=false;const lastJob=ctx.player.job;
  ctx.player.browserTracks=[{id:'old',path:'old.srt',generatedBy:'whisper',role:'source',status:'complete',mediaToken:'audio-one'}];let preparedCalls=0;
  ctx.window.api.browserExtras=async()=>{preparedCalls++;audioTab.browserClockSample.mediaToken='audio-three';return {ok:true,path:'stale.mp3',mediaToken:'audio-two'};};
  await ctx.startBrowserYoutubeWhisper(false);assert.equal(preparedCalls,1,'old audio captions cannot be reused for new audio');assert.equal(ctx.player.job,lastJob,'late audio preparation cannot start a job for another source');
  let finishPreparation;
  ctx.window.api.browserExtras=request=>{
    audioRequests.push(request);
    return request.action==='whisper-audio'?new Promise(resolve=>{finishPreparation=resolve;}):Promise.resolve({ok:true});
  };
  const pending=ctx.startBrowserYoutubeWhisper(false);
  const preparation=ctx.browserAudioPreparationStatus();
  assert.equal(preparation.state,'running');
  await preparation.cancel();
  assert.equal(ctx.browserAudioPreparationStatus().cancel,null);
  assert.equal(audioRequests.at(-1).action,'cancel-whisper-audio');
  assert.equal(audioRequests.at(-1).requestId,audioRequests.at(-2).requestId);
  finishPreparation({ok:true,path:'late.mp3',mediaToken:'audio-three'});
  await pending;
  assert.equal(ctx.player.job,lastJob,'late success after cancel cannot launch Whisper');
  assert.equal(ctx.browserAudioPreparationStatus(),null);
  const retainedBefore=retained.length;
  await ctx.handleProgressiveTerminal({type:'done',files:['old-source.srt'],browserWhisperSaved:true},lastJob);
  assert.equal(retained.length,retainedBefore,'durably saved result must not become a retry on another episode');
  const savedOutput={path:'saved.srt',role:'source',status:'complete'};
  ctx.window.api.browserExtras=async()=>({ok:true,path:'prepared.mp3',mediaToken:'audio-three',outputs:[savedOutput]});
  ctx.attachCompletedJobSubtitles=async(event,job)=> {
    assert.equal(event.outputs[0],savedOutput);
    assert.equal(job.browserMediaToken,'audio-three');
    return {loaded:true,path:savedOutput.path};
  };
  const reused=await ctx.startBrowserYoutubeWhisper(false,{savedOnly:true});
  assert.equal(reused.reused,true);
  assert.equal(ctx.player.job,lastJob,'opening saved text must not create a job');
  ctx.window.api.browserExtras=async()=>({ok:true,path:'prepared.mp3',mediaToken:'audio-three'});
  await ctx.startBrowserYoutubeWhisper(false,{savedOnly:true});
  assert.equal(ctx.player.job,lastJob,'missing saved text must not start Whisper');
  ctx.friendlySystemError=raw=>raw;
  ctx.window.api.browserExtras=async()=>({ok:false,error:'ENOSPC'});
  await ctx.startBrowserYoutubeWhisper(false,{clipRange:{start:2,end:8}});
  const failed=ctx.browserAudioPreparationStatus();
  assert.match(failed.text,/Diskte yer aç/);
  let retried;
  ctx.window.api.browserExtras=async request=>{retried=request;return {ok:true,path:'prepared.mp3',mediaToken:'audio-three'};};
  await failed.retry();
  assert.equal(retried.range.start,2);
  assert.equal(retried.range.end,8);
  ctx.player.job.failed=true;ctx.player.job.browserWhisperStage='load_model';
  const workerFailure=ctx.browserAudioPreparationStatus();
  assert.match(workerFailure.text,/modelini veya aygıt/);
  audioTab.browserClockSample.mediaToken='other-audio';
  assert.equal(ctx.browserAudioPreparationStatus(),null,'old retry must not appear on another episode');
  console.log('Browser Whisper: YouTube and observed audio, intent, reuse, time range, race and stop passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
