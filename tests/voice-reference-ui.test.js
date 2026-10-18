const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..'), dom = new JSDOM(fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8'), { runScripts: 'outside-only' });
const w = dom.window, el = id => w.document.getElementById(id), tick = () => new Promise(setImmediate);
let resolvePrepare, request, renamed, used, progress, changed = false;
const entry = { id: 'prepared', name: '5–25 s', url: 'fixture.wav', text: 'Reference speech.' };
w.HTMLMediaElement.prototype.pause = w.HTMLMediaElement.prototype.load = () => {};
w.BrowserDubAudioUI = { context: () => ({ hasMedia: true, visible: true, mode: 'browser', tabId: 'fixture', generation: 3, mediaId: 'video' }) };
w.api = { prepareVoiceReference: value => { request = value; return new Promise(resolve => { resolvePrepare = resolve; }); },
  listVoiceReferences: async () => ({ ok: true, references: [entry], folder: 'reference-folder' }),
  renameVoiceReference: async value => { renamed = value; return { ok: true, name: value.name.trim() }; },
  useVoiceReference: async value => { used = value; return { ok: true }; }, cancelDub: async () => ({ ok: true }),
  onDubEvent: fn => { progress = fn; }, openPath() {} };
w.addEventListener('voice-reference:changed', () => { changed = true; });
w.eval(fs.readFileSync(path.join(root, 'src/renderer/voice-reference-ui.js'), 'utf8'));
(async () => {
  el('voiceReferenceName').value = 'İlk referans';
  el('voiceReferencePrepare').click(); await tick();
  assert.equal(request.name, 'İlk referans');
  assert.deepEqual(JSON.parse(JSON.stringify(request.range)), { start: 5, end: 25 });
  assert.equal(request.context.generation, 3); assert.equal(el('voiceReferenceUse').disabled, true);
  progress({ id: request.id, type: 'reference_status', stage: 'transcribe_cuda' });
  assert.match(el('voiceReferenceStatus').textContent, /GPU/);
  resolvePrepare({ ok: true, reference: entry }); await tick();
  assert.match(el('voiceReferenceStatus').textContent, /Referans hazır/);
  assert.equal(el('voiceReferenceUse').disabled, false);
  assert.equal(el('voiceReferenceName').value, entry.name);
  el('voiceReferenceName').value = '  Türkçe sesim  ';
  el('voiceReferenceName').dispatchEvent(new w.Event('input'));
  el('voiceReferenceRename').click(); await tick();
  assert.equal(renamed.id, entry.id);
  assert.equal(el('voiceReferenceSelect').selectedOptions[0].textContent, 'Türkçe sesim');

  el('voiceReferenceText').value = 'Corrected.'; el('voiceReferenceText').dispatchEvent(new w.Event('input'));
  el('voiceReferenceName').value = 'Unsaved name'; el('voiceReferenceName').dispatchEvent(new w.Event('input'));
  el('voiceReferenceRecorder').open = true;
  el('voiceReferenceRecorder').dispatchEvent(new w.Event('toggle')); await tick();
  assert.equal(el('voiceReferenceText').value,'Corrected.','refresh preserves an unsaved transcript');
  assert.equal(el('voiceReferenceName').value,'Unsaved name','refresh preserves an unsaved name');
  el('voiceReferenceUse').click(); await tick();
  assert.equal(used.id, entry.id); assert.equal(used.text, 'Corrected.'); assert(changed);
  el('voiceReferencePrepare').click(); await tick(); el('voiceReferenceCancel').click(); await tick();
  assert.equal(el('voiceReferenceStatus').textContent, 'Durduruluyor…');
  progress({ id: request.id, type: 'reference_status', stage: 'extract' });
  assert.equal(el('voiceReferenceStatus').textContent, 'Durduruluyor…');
  resolvePrepare({ ok: false, cancelled: true }); await tick();
  assert.equal(el('voiceReferenceStatus').textContent, 'Durduruldu.');
  el('voiceReferencePrepare').click(); await tick();
  resolvePrepare({ ok: false, error: 'Audio server connection failed. Check your network or proxy.' }); await tick();
  assert.match(el('voiceReferenceStatus').textContent, /Ses sunucusuna bağlanılamadı/);
  el('voiceReferencePrepare').click(); await tick();
  resolvePrepare({ ok: false, error: '<b>untrusted</b>' }); await tick();
  assert.equal(el('voiceReferenceStatus').children.length, 0, 'error text is never HTML');
  el('voiceReferenceEnd').value = '2:00'; el('voiceReferencePrepare').click(); await tick();
  assert.match(el('voiceReferenceStatus').textContent, /3–30/);
  el('voiceReferenceEnd').value='0:25';
  w.api.listVoiceReferences=async()=>({ok:false});
  el('voiceReferencePrepare').click();await tick();resolvePrepare({ok:true,reference:entry});await tick();
  assert.match(el('voiceReferenceStatus').textContent,/liste/);
  assert.equal(el('voiceReferenceUse').disabled,true,'a failed reload must not leave the previous voice ready to apply');
  const pending=[];w.api.listVoiceReferences=()=>new Promise(resolve=>pending.push(resolve));
  el('voiceReferenceRecorder').dispatchEvent(new w.Event('toggle'));await tick();
  el('voiceReferenceRecorder').dispatchEvent(new w.Event('toggle'));await tick();
  assert.equal(pending.length,2);
  pending[1]({ok:true,references:[{...entry,id:'newest',name:'Newest'}],folder:'folder',activeId:'newest'});await tick();
  pending[0]({ok:true,references:[entry],folder:'old-folder'});await tick();
  assert.equal(el('voiceReferenceSelect').value,'newest','a late list response cannot replace newer references');
  console.log('voice-reference-ui: 5–25 range, GPU status, preview/use, transcript and confirmed cancellation passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => dom.window.close());
