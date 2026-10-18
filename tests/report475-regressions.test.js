'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const diagnostics = require('../src/browser-diagnostics-export');
const places = require('../src/browser-place-url');
const archive = require('../src/browser-translation-archive');
const library = require('../src/browser-library-tools');
const relink = require('../src/media-relink-matcher');
const output = require('../src/browser-subtitle-output');
const {cuesToSrt} = require('../src/browser-subtitles');
const {normalizeChapter} = require('../src/browser-chapters');

test('475-01: structured diagnostic secret values are redacted by key',()=>{
 const result=diagnostics.sanitizeDiagnosticsSecrets({nested:{apiKey:'fixture-secret',Authorization:'fixture-auth',password:'fixture-password'},count:3});
 assert.doesNotMatch(JSON.stringify(result),/fixture-secret|fixture-auth|fixture-password/);
 assert.equal(result.count,3);
});
test('475-02: encoded and SPA matrix session parameters are redacted',()=>{
 for(const sanitize of [places.safePlaceUrl,places.redactUrlSensitiveParams]){
  assert.doesNotMatch(sanitize('https://site.test/a;%74oken=fixture-secret;lang=tr#/watch;jsessionid=fixture-session?id=3'),/fixture-secret|fixture-session/);
  assert.match(sanitize('https://site.test/a;lang=tr'),/lang=tr/);
 }
});
test('475-03: inherited object properties are not counted as page translations',()=>{
 const result=archive.buildPageTranslationExport({format:'json',blocks:[{id:'constructor',text:'source'}],translations:{}});
 assert.equal(result.counts.translated,0);
 assert.equal(result.counts.pending,1);
});
test('475-04: archive exact matching does not restore an empty translation',()=>{
 const result=archive.matchArchivedPage({rows:[{id:'a',source:'source',translation:''}]},[{id:'a',text:'source'}]);
 assert.equal(result.matches.length,0);
 assert.equal(result.exact,false);
});
test('475-05: conflicting known media sizes cannot form a duration-only duplicate group',()=>{
 assert.equal(relink.findLibraryDuplicates([
  {key:'file:a',localPath:'D:/a/video.mkv',sizeBytes:100,duration:3600},
  {key:'file:b',localPath:'D:/b/video.mkv',sizeBytes:900,duration:3600},
 ]).length,0);
});
test('475-06: literal backslash N differs from a real line break in export validation',()=>{
 const expected=[{start:0,end:1,text:'A\\NB'}];
 const changed=cuesToSrt([{start:0,end:1,text:'A\nB'}]);
 assert.equal(output.validateBrowserSubtitleDocument(changed,'srt',expected).ok,false);
});
test('475-07: renaming a collection to its current name preserves its custom order',()=>{
 const item={key:'a',collections:['Ders'],prefs:{collectionOrder:{Ders:3}}};
 assert.equal(library.renameCollection([item],'Ders','Ders')[0].prefs.collectionOrder.Ders,3);
 assert.equal(item.prefs.collectionOrder.Ders,3);
});
test('475-08: deleting a collection also removes its stale custom ordering',()=>{
 const item={key:'a',collections:['Ders'],prefs:{collectionOrder:{Ders:3,Film:1},keep:true}};
 const result=library.removeCollection([item],'Ders')[0];
 assert.deepEqual(result.prefs.collectionOrder,{Film:1});
 assert.equal(result.prefs.keep,true);
 assert.equal(item.prefs.collectionOrder.Ders,3);
});
test('475-09: oversized subtitle export is rejected instead of silently losing the tail',async ()=>{
 const cues=Array.from({length:20001},(_,i)=>({start:i*2,end:i*2+1,text:'line '+i}));
 assert.throws(()=>output.buildBrowserSubtitleDocument(cues,'srt'),/20000/);
 const source = require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/main.js'),'utf8');
 const start = source.indexOf("ipcMain.handle('browser:subtitle:export'");
 const head = source.slice(start,source.indexOf('  const safeTitle =',start));
 let handler;
 require('node:vm').runInNewContext(head+'\n});',{ipcMain:{handle:(_name,fn)=>{handler=fn;}},
   authorizedBrowserSender:()=>true,normalizeCues:value=>value,dt:text=>text});
 assert.match((await handler({}, {cues})).error,/20000/);
});
test('475-10: invalid chapter end fields are omitted instead of surviving object spread',()=>{
 for(const end of [1,'bad',null]){
  const result=normalizeChapter({start:3,end,title:'chapter'});
  assert.equal(Object.hasOwn(result,'end'),false);
 }
 assert.equal(normalizeChapter({start:3,end:5,title:'chapter'}).end,5);
});
