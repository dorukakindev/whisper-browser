'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const baseline=require('../src/voice-reference-baseline');
test('original recognition remains independent from corrected text and rejects changed audio',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'reference-baseline-'));
 try{
  const wav=path.join(root,'Özgün ses.wav'),file=path.join(root,'reference-asr.json');
  fs.writeFileSync(wav,require('./helpers/wav-fixture')(480));
  baseline.save(wav,file,'İlk otomatik döküm.');
  fs.writeFileSync(path.join(root,'reference.txt'),'Corrected text.');
  assert.equal(baseline.read(wav,file),'İlk otomatik döküm.');
  const audio=fs.readFileSync(wav);audio[audio.length-1]^=1;fs.writeFileSync(wav,audio);
  assert.equal(baseline.read(wav,file),null,'same-size audio edits invalidate the baseline');
  fs.writeFileSync(file,'{broken');assert.equal(baseline.read(wav,file),null);
  assert.equal(baseline.read(wav,path.join(root,'missing')),null,'legacy references have no invented ASR proof');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('comparison shows edits safely and restore changes only the editor',async()=>{
 const {JSDOM}=require('jsdom');
 const root=path.join(__dirname,'..'),dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{runScripts:'outside-only'});
 const w=dom.window,el=id=>w.document.getElementById(id),tick=()=>new Promise(setImmediate);
 const entry={id:'test',name:'Sentetik',text:'İlk metin.',transcriptBaseline:'İlk metin.',url:'fixture.wav'};
 let writes=0,locale='tr';
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};
 w.UiLocale={get:()=>locale,t:x=>x};
 w.api={prepareVoiceReference(){},listVoiceReferences:async()=>({ok:true,references:[entry],activeId:entry.id,folder:'fixture'}),onDubEvent(){},useVoiceReference:async()=>{writes++;return {ok:true};}};
 for(const file of ['src/translation-diff.js','src/renderer/voice-reference-ui.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 el('voiceReferenceRecorder').open=true;el('voiceReferenceRecorder').dispatchEvent(new w.Event('toggle'));await tick();
 assert.match(el('voiceReferenceComparisonTitle').textContent,/aynı/);
 el('voiceReferenceText').value='Başka <img src=x onerror=alert(1)> metin.';el('voiceReferenceText').dispatchEvent(new w.Event('input'));
 assert.match(el('voiceReferenceComparisonTitle').textContent,/düzenlendi/);
 assert.match(el('voiceReferenceEdited').textContent,/<img/);assert.equal(el('voiceReferenceEdited').querySelector('img'),null);
 el('voiceReferenceRestoreTranscript').click();assert.equal(el('voiceReferenceText').value,entry.transcriptBaseline);assert.equal(writes,0);
 locale='en';w.document.dispatchEvent(new w.Event('ui-locale-change'));assert.match(el('voiceReferenceComparisonTitle').textContent,/Matches/);
 entry.transcriptBaseline=null;el('voiceReferenceRecorder').dispatchEvent(new w.Event('toggle'));await tick();
 assert.match(el('voiceReferenceComparisonTitle').textContent,/No original/);assert.equal(el('voiceReferenceComparisonColumns').hidden,true);
 dom.window.close();
});
