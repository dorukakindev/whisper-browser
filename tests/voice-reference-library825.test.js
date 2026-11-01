const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('Saved voice disclosure loads without preparing a recording, preserves drafts and recovers failed reads',async t=>{
 const dom=new JSDOM(fs.readFileSync('src/renderer/index.html','utf8'),{runScripts:'outside-only'}),w=dom.window,d=w.document;
 t.after(()=>w.close());w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};
 w.UiLocale={get:()=> 'en',t:value=>value};let failed=false,calls=0,uses=0;
 let rows=[{id:'voice-a',name:'Saved voice',url:'fixture.wav',text:'Original reference transcript.'}];
 w.api={prepareVoiceReference:async()=>({ok:false}),listVoiceReferences:async()=>{calls++;if(failed)throw Error('Controlled offline');return {ok:true,references:rows,folder:'fixture-reference-folder',activeId:'voice-a'};},useVoiceReference:async()=>{uses++;return {ok:true};},onDubEvent(){},openPath(){}};
 w.eval(fs.readFileSync('src/renderer/voice-reference-ui.js','utf8'));
 const library=d.getElementById('voiceReferenceLibrary');assert(library.hidden);
 await w.VoiceReferenceUI.refresh();assert.equal(calls,1);assert.equal(uses,0);assert(!library.hidden);assert(!library.open);
 assert.equal(d.getElementById('voiceReferenceSelect').value,'voice-a');assert.match(d.getElementById('voiceReferenceLibraryLabel').textContent,/1/);
 d.getElementById('voiceReferenceText').value='My edited transcript.';await w.VoiceReferenceUI.refresh();
 assert.equal(d.getElementById('voiceReferenceText').value,'My edited transcript.');assert.equal(uses,0,'Opening the library must not apply or save edits');
 failed=true;assert.equal(await w.VoiceReferenceUI.refresh(),false);assert(!library.hidden,'Keep the last good list on failure');
 const retry=[...d.querySelectorAll('button')].find(n=>n.textContent==='Retry loading voices');assert(retry&&!retry.hidden);
 failed=false;retry.click();await new Promise(setImmediate);assert(retry.hidden);assert.equal(uses,0);
 rows=[];await w.VoiceReferenceUI.refresh();assert(library.hidden);rows=[{id:'voice-a',name:'Saved voice',url:'fixture.wav',text:'Original reference transcript.'}];
 await w.VoiceReferenceUI.refresh();assert.equal(d.getElementById('voiceReferenceText').value,'My edited transcript.');
});
