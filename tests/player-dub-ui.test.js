const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8'), { runScripts: 'outside-only' });
const w = dom.window, el = id => w.document.getElementById(id);
w.DubSyncMap = require('../src/renderer/dub-sync-map');
w.DubWorkspaceModel = require('../src/renderer/dub-workspace-model');
w.eval(fs.readFileSync(path.join(__dirname, '../src/renderer/browser-dub-audio.js'), 'utf8'));
for (const id of ['playerVideo', 'browserDubAudio', 'browserDubBackground','browserDubMusic','browserDubAmbience']) {
  const media = el(id);
  for (const [key, value] of Object.entries({ paused: true, readyState: 4, duration: 100 })) {
    Object.defineProperty(media, key, { value, writable: true });
  }
  media.play = () => { media.paused = false; return Promise.resolve(); };
  media.pause = () => { media.paused = true; };
  media.load = () => {};
}
w.player = { workspaceMode: 'player', mediaKey: 'local:fixture.mp4', localPath: 'fixture.mp4' };
w.browserTabState = () => null;
w.osd = () => {};
w.scheduleBrowserBounds = () => {};
w.api = { onBrowserEvent() {}, muteBrowserTab() { throw new Error('local audio must not mute a browser tab'); } };
el('playerLayer').classList.remove('hidden');
el('playerVideo').setAttribute('src', 'fixture.mp4');
w.eval(fs.readFileSync(path.join(__dirname, '../src/renderer/browser-dub-ui.js'), 'utf8'));
const tick = () => new Promise(setImmediate);
(async () => {
  const ui = w.BrowserDubAudioUI, video = el('playerVideo'), audio = el('browserDubAudio');
  let selected = false;
  el('browserDubFile').click = () => { selected = true; };
  el('playerMore').open = true; el('playerDubAdd').click();
  assert(selected); assert.equal(el('playerMore').open, false);
  const expected = ui.context();
  assert.equal(expected.backgroundSource, 'fixture.mp4');
  assert.equal(await ui.attachGenerated({ name: 'voice.wav', url: 'fixture.wav' }, expected), true);
  assert.equal(video.muted, true);
  video.currentTime = 20; video.paused = false; video.dispatchEvent(new w.Event('play')); await tick();
  assert.equal(audio.currentTime, 20); assert.equal(audio.paused, false);
  video.currentTime = 40; video.paused = true; video.dispatchEvent(new w.Event('pause'));
  assert.equal(audio.currentTime, 40); assert.equal(audio.paused, true);
  el('browserDubOffset').value = '10';
  el('browserDubOffset').dispatchEvent(new w.Event('input'));
  assert.equal(audio.currentTime, 30);
  assert.equal(await ui.attachGenerated({ name: 'new.wav', url: 'new.wav' }, ui.context()), true);
  assert.equal(audio.currentTime, 40, 'new audio starts with zero offset');
  assert.equal(el('browserDubOffset').value, '0', 'offset control must match the newly attached audio');
  ui.stop(); await tick();
  assert.equal(await ui.attachGenerated({name:'mixed.wav',url:'mixed.wav',mix:{voice:.6,background:.8,music:.5,ambience:.4,duck:true,duckAmount:.25},
    background:{url:'bg.wav'},layers:{music:{url:'music.wav'},ambience:{url:'ambience.wav'}},
    rows:[{key:'1',text:'Konuşma',sourceStart:0,sourceEnd:5,audioStart:0,audioEnd:5,status:'ready'}]},ui.context()),true);
  video.currentTime=2;video.paused=false;video.dispatchEvent(new w.Event('play'));await tick();
  assert.equal(audio.volume,.6);assert.equal(el('browserDubMusic').volume,.125);assert.equal(el('browserDubAmbience').volume,.1);
  video.currentTime=7;video.dispatchEvent(new w.Event('timeupdate'));await tick();assert.equal(el('browserDubMusic').volume,.5);
  ui.stop(); await tick();assert.equal(el('browserDubMusic').paused,true);assert.equal(el('browserDubAmbience').paused,true);
  assert.equal(video.muted, false); assert.equal(el('browserDubStrip').classList.contains('hidden'), true);
  w.player.mediaKey = 'other';
  assert.equal(await ui.attachGenerated({ name: 'wrong.wav', url: 'wrong.wav' }, expected), false);
  console.log('player-dub-ui: menu, local attach, mute, play/pause/seek, cleanup and stale output passed');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { w.BrowserDubAudioUI.stop(); dom.window.close(); });
