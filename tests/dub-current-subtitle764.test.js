'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate);
function fixture(mode='browser'){
 const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id);let media='A',config=async()=>({ok:true,ready:true}),picked=0,started=0;
 w.player={subPath:'C:/source.srt',sub2Path:'C:/translated.tr.srt',sub2Role:'translation',browserTracks:[{path:'C:/source.srt'},{path:'C:/translated.tr.srt'}]};
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};w.syncBrowserOcclusion=()=>{};
 w.BrowserDubAudioUI={context:()=>({mode,tabId:'tab',mediaKey:media,source:media,generation:1,visible:true,hasMedia:true,subtitleRange:{start:300,end:600}})};
 w.api={dubConfig:()=>config(),onDubEvent(){},latestDub:async()=>({ok:true,output:null}),selectFile:async()=>{picked++;return 'C:/manual.srt';},startDub:async()=>{started++;return {ok:true};}};
 el('dubGeneratorDialog').showModal=()=>el('dubGeneratorDialog').open=true;
 w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-generator-ui'),'utf8'));
 return {w,el,open:async()=>{el(mode==='player'?'playerDubGenerate':'browserDubGenerate').click();await tick();},changeMedia:()=>media='B',holdConfig:()=>new Promise(resolve=>{config=()=>new Promise(reply=>resolve(reply));}),get picked(){return picked;},get started(){return started;},close:()=>w.close()};
}
test('Normal browser button adopts the active translation and range without picking or generating',async()=>{const h=fixture();try{await h.open();assert.equal(h.el('dubSrtName').textContent,'translated.tr.srt');assert.equal(h.el('dubRangeStart').value,'5:00');assert.equal(h.el('dubRangeEnd').value,'10:00');assert.equal(h.picked,0);assert.equal(h.started,0);}finally{h.close();}});
test('Local player and assistant share the same preparation entry',async()=>{const h=fixture('player');try{await h.w.DubGeneratorUI.prepareCurrent();assert.equal(h.el('dubSrtName').textContent,'translated.tr.srt');assert.equal(h.started,0);}finally{h.close();}});
test('A manually selected SRT remains selected when reopening',async()=>{const h=fixture();try{await h.open();h.el('dubChooseSrt').click();await tick();await h.open();assert.equal(h.el('dubSrtName').textContent,'manual.srt');assert.equal(h.picked,1);}finally{h.close();}});
test('Source SRT is used when no translation is selected',async()=>{const h=fixture();try{h.w.player.sub2Role='comparison';await h.open();assert.equal(h.el('dubSrtName').textContent,'source.srt');}finally{h.close();}});
test('Browser rejects leftover paths and non-SRT sources',async()=>{for(const path of ['C:/stale.srt','C:/source.vtt']){const h=fixture();try{h.w.player.sub2Role='';h.w.player.subPath=path;await h.open();assert.notEqual(h.el('dubSrtName').textContent,path.split('/').pop());assert(h.el('dubGeneratorStart').disabled);}finally{h.close();}}});
test('A source change while configuration loads never adopts the old subtitle',async()=>{const h=fixture();try{const pending=h.holdConfig();h.el('browserDubGenerate').click();const reply=await pending;h.changeMedia();reply({ok:true,ready:true});await tick();assert.notEqual(h.el('dubSrtName').textContent,'translated.tr.srt');}finally{h.close();}});

test('Ready lookup carries the chosen SRT and exact inherited clip',async()=>{const h=fixture();try{let query;h.w.api.latestDub=async value=>{query=value;return {ok:true,output:null};};await h.open();assert.deepEqual(JSON.parse(JSON.stringify(query)),{source:'A',srt:'C:/translated.tr.srt',range:{start:300,end:600}});}finally{h.close();}});
test('A ready-result lookup cannot replace a newly edited clip',async()=>{const h=fixture();try{let reply;h.w.api.latestDub=()=>new Promise(resolve=>reply=resolve);await h.open();h.el('dubRangeStart').value='6:00';reply({ok:true,output:{name:'Old clip',url:'file:///old.wav',range:{start:300,end:600}}});await tick();assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),null);assert.equal(h.el('dubRangeStart').value,'6:00');}finally{h.close();}});
