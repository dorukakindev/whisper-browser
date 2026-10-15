const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'), {runScripts:'outside-only'});
const w = dom.window, el = id => w.document.getElementById(id);
let onEvent, request, cancelOK = true;
let attached = false;
w.BrowserDubAudioUI = { context: () => ({ mode:'player', tabId:'player-video', mediaKey:'fixture',
  currentTime:42, backgroundSource:'fixture.mp4', visible:true, hasMedia:true }),
  attachGenerated: async (_file, context) => { attached = context.mode === 'player'; return true; } };
w.syncBrowserOcclusion = () => {};
w.api = {
  dubConfig: async () => ({ok:true,ready:true,engine:'fixture',reference:'voice.wav',transcript:'voice.txt'}),
  latestDub: async () => ({ok:true}), selectFile: async () => 'test.srt',
  onDubEvent: callback => {onEvent=callback;},
  startDub: async value => {request=value;return {ok:true};}, cancelDub: async () => ({ok:cancelOK}),
};
el('dubGeneratorDialog').showModal = () => {el('dubGeneratorDialog').open=true;};
w.eval(fs.readFileSync(path.join(root,'src/renderer/dub-generator-ui.js'),'utf8'));
const tick = () => new Promise(setImmediate);
(async()=>{
  el('playerDubGenerate').click();await tick();assert.equal(el('dubGeneratorDialog').open,true);
  el('dubRangeEnabled').checked=true;el('dubRangeEnabled').dispatchEvent(new w.Event('input'));
  el('dubRangeNow').click();assert.equal(el('dubRangeStart').value,'42');
  el('dubChooseSrt').click();await tick();
  el('dubRangeEnabled').checked=true;el('dubRangeStart').value='10:00';el('dubRangeEnd').value='20:00';el('dubKeepBackground').checked=true;
  el('dubGeneratorStart').click();await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(request.range)),{start:600,end:1200});assert.equal(request.keepBackground,true);
  assert.equal(request.backgroundSource,'fixture.mp4');
  el('dubGeneratorCancel').click();await tick();
  assert.equal(el('dubGeneratorStatus').textContent,'Durduruluyor…');
  onEvent({id:request.id,type:'status',text:'late progress'});
  assert.equal(el('dubGeneratorStatus').textContent,'Durduruluyor…');
  onEvent({id:request.id,type:'cancelled',elapsedSeconds:3});
  assert.equal(el('dubGeneratorStatus').textContent,'Durduruldu.');
  assert.equal(el('dubGeneratorProgress').hasAttribute('value'),true,'stopped preparation must stop its indeterminate animation');
  assert.equal(el('dubGeneratorCancel').disabled,true);
  el('dubGeneratorStart').click();await tick();cancelOK=false;
  el('dubGeneratorCancel').click();await tick();
  assert.match(el('dubGeneratorStatus').textContent,/doğrulanamadı/);
  assert.equal(el('dubGeneratorCancel').disabled,false);
  onEvent({id:request.id,type:'done',name:'fixture.wav',url:'fixture.wav'});await tick();
  assert.equal(attached,true,'generated audio must attach to the local player');
  attached=false;el('dubGeneratorUse').click();await tick();assert.equal(attached,true);
  dom.window.close();
  console.log('dub-generator-ui: selected background range, confirmed stop and failed stop passed');
})().catch(e=>{dom.window.close();console.error(e);process.exitCode=1;});
