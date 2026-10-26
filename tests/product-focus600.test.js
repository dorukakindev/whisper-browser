'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {processOutput}=require('../src/browser-reference-media');
const preparation=require('../src/book-text-preparation');
const {auditSubtitlePair,alignByTimestamp}=require('../src/subtitle-pair-quality');
const {evidenceOf,actionsOf}=require('../src/assistant-thread-store');
function fake(){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();return child;}
for(const kind of ['abort','timeout','overflow','consume']) test(`P0${['abort','timeout','overflow','consume'].indexOf(kind)+1} reference ${kind} waits for confirmed closure`,async()=>{
 const child=fake(),controller=new AbortController();let complete=false,requested=false,close;
 const terminated=new Promise(r=>close=r);
 const pending=processOutput('fixture',[],{spawnImpl:()=>child,signal:controller.signal,timeout:kind==='timeout'?2:500,
 limit:kind==='overflow'?1:1024,consume:kind==='consume'?()=>{throw Error('consumer failed')}:undefined,
 terminate:()=>{requested=true;return terminated;}}).then(()=>{complete=true;},e=>{complete=true;return e;});
 if(kind==='abort')controller.abort();
 if(kind==='overflow'||kind==='consume')child.stdout.write(Buffer.from('more'));
 await new Promise(r=>setTimeout(r,15));assert(requested);assert.equal(complete,false);
 child.emit('close',0);close(true);const error=await pending;
 assert(error instanceof Error);assert.match(error.message,/iptal|zaman|boyutu|consumer/);
});
test('P05 failed shutdown is explicit rather than falsely claiming stopped',async()=>{
 const controller=new AbortController(),child=fake();const pending=processOutput('fixture',[],{spawnImpl:()=>child,signal:controller.signal,terminate:async()=>false});
 controller.abort();await assert.rejects(pending,/durduğu doğrulanamadı/);child.emit('close',1);
});
test('P06 pre-aborted request never spawns',async()=>{
 const controller=new AbortController();controller.abort();let called=false;
 await assert.rejects(processOutput('fixture',[],{signal:controller.signal,spawnImpl:()=>{called=true;}}),/iptal/);assert.equal(called,false);
});
test('P07 stderr UTF-8 split across chunks retains Turkish diagnostics',async()=>{
 const child=fake(),pending=processOutput('fixture',[],{spawnImpl:()=>child});
 const text=Buffer.from('İşlem başarısız: çığ');for(const byte of text)child.stderr.write(Buffer.from([byte]));child.emit('close',1);
 await assert.rejects(pending,e=>e.message==='İşlem başarısız: çığ');
});
test('P08 missing executable reports its error and clears pending timer',async()=>{
 const child=fake(),pending=processOutput('fixture',[],{spawnImpl:()=>child});child.emit('error',Error('ENOENT'));await assert.rejects(pending,/ENOENT/);
});
test('P19/P20 soft hyphen before LF and CRLF is reviewable and opt-in',()=>{
 for(const line of ['\n','\r\n']){
 const source='Bu bilgi\u00ad'+line+'sayar çalışıyor.',s=preparation.preview(source).suggestions;assert.equal(s.length,1);assert(s[0].soft);
 assert.equal(preparation.apply(source,source,{}).text,source);
 assert.equal(preparation.apply(source,source,{[s[0].id]:'join'}).text,'Bu bilgisayar çalışıyor.');
 assert.throws(()=>preparation.apply(source,source,{[s[0].id]:'hyphen'}));
 }
});
test('P21 short fragments can be explicitly joined, without touching names or paragraph breaks',()=>{
 const source='o-\nkuma ve oku-\nma';const s=preparation.preview(source).suggestions;assert.equal(s.length,2);
 assert.equal(preparation.apply(source,source,Object.fromEntries(s.map(x=>[x.id,'join']))).text,'okuma ve okuma');
 for(const source of ['İ-\nstanbul','NATO-\nUSA','bilgi\u00ad\n\nsayar'])assert.equal(preparation.preview(source).suggestions.length,0);
});
test('P22 empty translation pair cannot pass quality',()=>{const r=auditSubtitlePair([],[]);assert.equal(r.pass,false);assert.equal(r.issues.sourceBelowMinimum.length,1);assert.equal(r.issues.targetBelowMinimum.length,1);});
test('P23 invalid source timing yields blocking diagnosis rather than throw or pass',()=>{
 for(const cue of [null,{start:NaN,end:1,text:'one'},{start:0,end:Infinity,text:'one'},{start:2,end:1,text:'one'},{start:-1,end:1,text:'one'}]){
 const r=auditSubtitlePair([cue],[{start:0,end:1,text:'bir'}]);assert(!r.pass);assert.equal(r.issues.invalidSource.length,1);
 }
});
test('P24 invalid target timing cannot silently satisfy coverage',()=>{
 for(const cue of [null,{start:0,end:0,text:'bir'},{start:0,end:1,text:null}]){const r=auditSubtitlePair([{start:0,end:1,text:'one'}],[cue]);assert(!r.pass);assert.equal(r.issues.invalidTarget.length,1);}
});
test('P25 duplicate timestamp buckets match in source order and retain only unused targets',()=>{
 const cues=Array.from({length:20000},(_,i)=>({start:0,end:1,text:String(i)}));const r=alignByTimestamp(cues.slice(0,-1),cues);
 assert.equal(r.matched.length,19999);assert.equal(r.matched[19998].target.text,'19998');assert.deepEqual(r.extra,[cues[19999]]);
});
test('P26 large connected timing group avoids argument-stack overflow',()=>{
 const source=Array.from({length:140000},(_,i)=>({start:i,end:i+1,text:'x'}));
 const result=auditSubtitlePair(source,[{start:0,end:140000,text:'Farklı bir anlatım.'}]);assert.equal(result.coveredSourceCues,source.length);
});
test('P27 assistant evidence never coerces booleans or empty strings into video time zero',()=>{
 assert.deepEqual(evidenceOf([{start:false},{start:true},{start:''},{start:' '},{start:[]},{start:{}}]),[]);
});
test('P28 backwards or nonfinite evidence is rejected before action creation',()=>{
 assert.deepEqual(evidenceOf([{start:4,end:3},{start:4,end:false},{start:Infinity},{start:1,end:'NaN'}]),[]);
 assert.deepEqual(actionsOf([{kind:'seek_to_time',source:{start:false}}]),[]);
});
test('P29 valid legacy numeric timestamp strings and Turkish aliases remain readable',()=>{
 assert.deepEqual(evidenceOf([{baslangic:'1.5',bitis:'2.5',metin:'söz'}])[0],{id:'',start:1.5,end:2.5,text:'söz',translation:''});
 assert.equal(evidenceOf([{start:0}])[0].end,0);
});
