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
  URL, console, Object, Number, Date,
  player: { workspaceMode: 'browser', mediaKey: 'browser:youtube:abcdefghijk', browserActiveTabId: 'a',
    browserPageUrl: 'https://www.youtube.com/watch?v=abcdefghijk&list=ignored', browserTracks: [],
    browserDuration: 1800, browserTime: 800, subPath: '', sub2Path: '' },
  state: {}, $: node, browserTabState: () => ({ id: 'a', service: 'youtube' }),
  buildOptsFromUI: () => ({ input: 'old.mp4', translate: true, translateTo: 'tr' }),
  optsProblem: () => '', logLine() {}, setBrowserSignal() {}, setSubtitleMode() {},
  updatePlayerTaskCenter() {}, startProgressiveChunk: async job => calls.push(job),
  useBrowserTrack: async (_translate, id) => { ctx.player.subPath = ctx.player.browserTracks.find(t => t.id === id).path; },
};
vm.createContext(ctx);
function section(from, to) { const start = code.indexOf(from); assert(start >= 0); return code.slice(start, code.indexOf(to, start)); }
vm.runInContext(section('function youtubeVideoId(', 'function mediaKeyFor('), ctx);
vm.runInContext(section('function progressiveRanges(', 'async function startProgressiveChunk('), ctx);
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
  console.log('Browser YouTube Whisper: URL, browser time, translation intent, reuse, busy and tab race passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
