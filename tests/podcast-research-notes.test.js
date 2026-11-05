'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {normalizeAnnotation,matchingLearningAnnotation}=require('../src/browser-learning');
const {BrowserNoteStore}=require('../src/browser-note-store');

test('research notebook persists untimed podcast context without a fake zero timestamp',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-notes-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'notes.json');
 const raw={mediaId:'rss:episode',mediaType:'podcast',type:'quote',timed:false,start:500,end:600,source:'Original',translation:'Çeviri',note:'My note',sourceEntryId:'entry-one',sourceVersion:'version-one',episodeIdentity:'episode-one',playbackOwner:'player',sourceBinding:{episodeIdentity:'episode-one',resource:'https://user:secret@example.test/audio.mp3?token=secret',revision:1,fingerprintStatus:'unknown',sha256:'unknown'}};
 assert.notEqual(normalizeAnnotation(raw).id,normalizeAnnotation({...raw,sourceVersion:'version-two'}).id);
 const saved=new BrowserNoteStore(file).upsert(raw);const restored=new BrowserNoteStore(file).get(saved.id);
 assert.doesNotMatch(require('../src/browser-research-notebook').researchAnnotationsToMarkdown([restored]),/0\.000 sn/);
 assert.equal(restored.timed,false);assert.equal(restored.start,null);assert.equal(restored.end,null);assert.equal(restored.sourceEntryId,'entry-one');assert.equal(restored.note,'My note');assert.equal(restored.translation,'Çeviri');assert.equal(restored.sourceVersion,'version-one');assert.equal(restored.sourceBinding.resource,'https://example.test/audio.mp3');assert.equal(restored.sourceBinding.fingerprintStatus,'unknown');
 assert.equal(matchingLearningAnnotation([restored],'quote',{mediaId:raw.mediaId,source:'Different',start:0}),null);
});

test('legacy and time-zero annotations preserve their existing timed behavior',()=>{
 const legacy=normalizeAnnotation({mediaId:'local:one',source:'Sentence',start:0,end:3});assert.equal(legacy.timed,true);assert.equal(legacy.start,0);assert.equal(legacy.end,3);
});


test('unified note search preserves podcast source binding and explicit untimed state',()=>{
 const library=require('../src/browser-library-tools');const note=normalizeAnnotation({mediaId:'rss:one',mediaType:'podcast',source:'Original',timed:false,sourceVersion:'v1',sourceEntryId:'entry-one',episodeIdentity:'episode-one',playbackOwner:'player',sourceBinding:{sha256:'unknown',episodeIdentity:'episode-one'}});
 const rows=library.unifiedLibrarySearch({notes:[note],query:'Original',scope:'notes'});assert.equal(rows.length,1);assert.equal(rows[0].timed,false);assert.equal(rows[0].seconds,null);assert.equal(rows[0].sourceEntryId,'entry-one');assert.equal(rows[0].sourceVersion,'v1');assert.equal(rows[0].sourceBinding.sha256,'unknown');
});
