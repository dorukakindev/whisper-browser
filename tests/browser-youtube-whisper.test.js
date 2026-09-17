const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/renderer.js'), 'utf8');
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
  state: {}, $: node, browserTabState: () => ({ id: 'a', service: 'youtube' }),
  buildOptsFromUI: () => ({ input: 'old.mp4', translate: true, translateTo: 'tr' }),
  optsProblem: () => '', logLine() {}, setBrowserSignal() {}, setSubtitleMode() {},
  updatePlayerTaskCenter() {}, updateBrowserSubtitleSummary() {}, syncSubtitlePrimaryAction() {},
  startProgressiveChunk: async job => calls.push(job),
  useBrowserTrack: async (_translate, id) => { ctx.player.subPath = ctx.player.browserTracks.find(t => t.id === id).path; },
};
vm.createContext(ctx);
function section(from, to) { const start = code.indexOf(from); assert(start >= 0); return code.slice(start, code.indexOf(to, start)); }
vm.runInContext(section('function youtubeVideoId(', 'function mediaKeyFor('), ctx);
vm.runInContext(section('function progressiveRanges(', 'async function startProgressiveChunk('), ctx);
vm.runInContext(section('function cueKey(', 'function progressiveRanges('), ctx);
vm.runInContext(section('async function handleProgressiveTerminal(', 'function playerJobEvent('), ctx);
vm.runInContext(section('function currentBrowserYoutubeUrl(', 'async function exportBrowserAbClip('), ctx);
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
  assert.equal(calls[0].ranges[0].start, 798);
  assert.match(calls[0].baseOpts.outputNameSuffix, /^-whisper-[a-z0-9-]{4,48}$/i);
  assert.equal(ctx.progressiveRanges(1306, 8).length, 2,
    'videonun başındaki birkaç saniye için üçüncü ve yıkıcı bir iş üretildi');
  assert.deepEqual(Array.from(ctx.progressiveRanges(1306, 8), range => [range.start, range.end]),
    [[0, 600], [596, 1306]]);
  assert.deepEqual(Array.from(ctx.progressiveRanges(1800, 800), range => [range.start, range.end]),
    [[798, 1398], [1394, 1800], [0, 802]], 'aşamalı işler sınır bağlamını örtüştürmeli');
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
  ctx.browserSubtitleSync = { hashText: text => Buffer.from(text).toString('hex') };
  ctx.renderBrowserTracks = () => {};
  vm.runInContext(section('function registerCompletedBrowserOutputs(', 'async function attachCompletedJobSubtitles('), ctx);
  ctx.registerCompletedBrowserOutputs({ items: [{ role: 'translation', path: 'partial.srt', language: 'tr', status: 'partial', completed: 1, failed: 2 }],
    translation: { sourceHash: 'hash' } }, { workspaceMode: 'browser', browserTabId: 'a', mediaKey: ctx.player.mediaKey, selectedSubPath: 'source.srt' });
  const registered = ctx.player.browserTracks.find(track => track.path === 'partial.srt');
  assert.equal(registered.sourceTrackId, 'src', 'çeviri mevcut kaynak izinden koptu');
  assert.equal(registered.status, 'partial');
  assert.equal(registered.failed, 2);
  const before = ctx.player.browserTracks.length;
  ctx.registerCompletedBrowserOutputs({ items: [{ role: 'translation', path: 'wrong.srt' }] },
    { workspaceMode: 'browser', browserTabId: 'other', mediaKey: ctx.player.mediaKey });
  assert.equal(ctx.player.browserTracks.length, before, 'başka sekmenin çıktısı eklendi');

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

  console.log('Browser YouTube Whisper: URL, translation intent, reuse, tab race and permanent-error stop passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
