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

function researchWorld(t){
 const {createAnnotationWriter}=require('../src/research-annotation-writer'),{createResearchNotes}=require('../src/assistant-research-notes'),manifest=require('../src/assistant-context-manifest');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'research-chain-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new BrowserNoteStore(path.join(dir,'notes.json'));let clock=100;
 const writer=createAnnotationWriter({store:()=>store,now:()=>++clock});
 const a=writer.save({id:'note-a',mediaId:'episode-a',mediaType:'podcast',mediaTitle:'Episode A',source:'A literal source about patience.',translation:'Sabır hakkında özgün metin.',note:'I agree.',timed:false}).annotation;
 const b=writer.save({id:'note-b',mediaId:'episode-b',mediaType:'youtube',mediaTitle:'Episode B',source:'A contrary source about urgency.',note:'I disagree.',timed:true,start:12}).annotation;
 const notes={save:writer.save,get:writer.get,list:(filters,limit)=>store.filter(filters,limit)},owner={kind:'studio',owner:'notebook',thread:'one'};let valid=true;
 const api=createResearchNotes({notes,manifest,validateOwner:()=>valid});return {file:path.join(dir,'notes.json'),store,writer,a,b,owner,notes,api,invalid:()=>valid=false,read:(action,args)=>api.read(7,{action,args,owner}),call:(action,rest)=>api.handle(7,{action,owner,...rest})};
}

test('notebook synthesis uses real separate evidence, preview edits and one canonical idempotent save',t=>{
 const h=researchWorld(t),found=h.read('search',{query:'source'});assert.equal(found.matches.length,2);assert.equal(found.matches[0].personalNote.length>0,true);assert.equal(JSON.stringify(found).includes('mediaUrl'),false);
 const cards=h.read('read',{note_ids:['note-a','note-b']}).matches;assert.equal(cards[0].text,h.a.source);assert.equal(cards[0].translation,h.a.translation);assert.equal(cards[0].personalNote,h.a.note);assert.equal(cards[0].timed,false);assert.equal(cards[0].seconds,null);
 const draft=h.read('draft',{source_ids:cards.map(c=>c.id),text:'Sources disagree; evidence is limited.'}).draft;assert.equal(h.store.list().length,2);
 const p=h.call('preview',{id:draft.id,text:'My edited synthesis.'});assert.equal(p.ok,true);assert.equal(h.call('save',{id:draft.id,token:p.token,text:'Old text'}).ok,false);
 const result=h.call('save',{id:draft.id,token:p.token,text:p.text});assert.equal(result.ok,true);assert.equal(result.annotation.note,'My edited synthesis.');assert.equal(result.annotation.timed,false);assert.equal(result.annotation.researchSources.length,2);assert.equal(h.store.list().length,3);
 assert.equal(h.call('save',{id:draft.id,token:p.token,text:p.text}).replayed,true);assert.equal(h.store.list().length,3);assert.equal(h.store.get('note-a').note,'I agree.');
 assert.equal(result.annotation.tags.includes('AI draft'),true);assert.equal(new BrowserNoteStore(h.file).get(result.annotation.id).researchSources.length,2);
});

test('notebook drafts reject removed/changed evidence, cross-thread requests and obsolete preview tokens',t=>{
 const h=researchWorld(t),cards=h.read('read',{note_ids:['note-a','note-b']}).matches;
 const d=h.read('draft',{source_ids:cards.map(c=>c.id),text:'Draft'}).draft;
 const old=h.call('preview',{id:d.id,text:'First'}),newer=h.call('preview',{id:d.id,text:'New'});
 assert.equal(h.call('save',{id:d.id,token:old.token,text:old.text}).code,'preview-changed');
 h.writer.save({...h.a,tags:['new evidence'],note:h.a.note}); // Same text/time is still a different evidence revision.
 assert.equal(h.call('save',{id:d.id,token:newer.token,text:newer.text}).code,'source-changed');assert.equal(h.call('inspect',{id:cards[0].id}).ok,false);assert.equal(h.store.list().length,2);
 assert.equal(h.api.handle(8,{action:'get',id:d.id,owner:h.owner}).ok,false);assert.equal(h.api.handle(7,{action:'get',id:d.id,owner:{...h.owner,thread:'other'}}).ok,false);
 assert.equal(h.read('draft',{source_ids:['N00000000-0000-0000-0000-000000000000'],text:'Invented'}).ok,false);h.invalid();assert.throws(()=>h.call('get',{id:d.id}),/changed/);
});

function notebookDom(t){
 const vm=require('node:vm'),{JSDOM}=require('jsdom');const dom=new JSDOM('<input id="researchSearch"><div id="playerLibraryList"></div><p id="playerLibraryStatus"></p>');t.after(()=>dom.window.close());
 const w=dom.window;w.CSS={escape:value=>value};const context={window:w,document:w.document,CSS:w.CSS,$:id=>w.document.getElementById(id),researchAnnotations:[],researchLoadSeq:0,playerLibraryView:'research',researchLibraryFilters:()=>({}),uiText:x=>x,interfaceChoice:(_,en)=>en,pSecToTime:value=>{assert.equal(Number.isFinite(value),true);return value+'s';},logLine:()=>{},osd:()=>{},openUnifiedLibraryResult:async()=>false};
 w.api={};const code=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),a=code.indexOf('const researchDraftCache'),b=code.indexOf('// Kutuphane her yazim/arama',a);vm.createContext(context);vm.runInContext(code.slice(a,b),context);return {w,context,eval:code=>vm.runInContext(code,context)};
}

test('notebook refresh preserves typing and its original revision, exposes conflict and never interprets HTML',async t=>{
 const h=researchWorld(t),f=notebookDom(t);const row=h.writer.withRevision(h.a);f.context.researchAnnotations=[row];f.eval('renderResearchLibrary()');const editor=f.w.document.querySelector('textarea');editor.value='<img src=x onerror=alert(1)> My draft';editor.focus();editor.setSelectionRange(2,5);f.w.document.getElementById('playerLibraryList').scrollTop=82;
 const changed=h.writer.save({...h.a,note:'Changed elsewhere'}).annotation;
 f.w.api.listResearchAnnotations=async()=>({ok:true,annotations:[h.writer.withRevision(changed)]});await f.eval('loadResearchLibrary()');
 assert.equal(f.w.document.querySelector('textarea').value,editor.value);assert.equal(f.w.document.querySelector('img'),null);assert.match(f.w.document.querySelector('.research-card-conflict').textContent,/changed elsewhere/);assert.equal(f.w.document.activeElement.dataset.researchField,'note');assert.equal(f.w.document.activeElement.selectionStart,2);
 let sent;f.w.api.saveResearchAnnotation=async(raw,rev)=>{sent=rev;return h.writer.saveChecked(raw,rev);};const save=f.w.document.querySelector('[data-research-action=save]');await f.context.handleResearchLibraryAction({target:save});assert.equal(sent,row.revision);assert.equal(h.store.get(h.a.id).note,'Changed elsewhere');
 const overwrite=f.w.document.querySelector('[data-research-conflict=overwrite]');await f.context.handleResearchLibraryAction({target:overwrite});assert.equal(h.store.get(h.a.id).note,editor.value);
});

test('late notebook loads cannot replace newer filters; errors keep notes; source refusal stays on its card',async t=>{
 const h=researchWorld(t),f=notebookDom(t);f.context.researchAnnotations=[h.writer.withRevision(h.a)];f.eval('renderResearchLibrary()');let finish;f.w.api.listResearchAnnotations=()=>new Promise(r=>finish=r);const old=f.eval('loadResearchLibrary()');f.w.api.listResearchAnnotations=async()=>({ok:true,annotations:[h.writer.withRevision(h.b)]});await f.eval('loadResearchLibrary()');finish({ok:true,annotations:[h.a]});await old;assert.match(f.w.document.querySelector('.research-card').textContent,/Episode B/);
 f.w.api.listResearchAnnotations=async()=>({ok:false,error:'read error'});await f.eval('loadResearchLibrary()');assert.match(f.w.document.querySelector('.research-card').textContent,/Episode B/);assert.match(f.w.document.getElementById('playerLibraryStatus').textContent,/could not refresh/);
 await f.context.handleResearchLibraryAction({target:f.w.document.querySelector('[data-research-action=open]')});assert.match(f.w.document.querySelector('.research-card-open-note').textContent,/could not be opened/);
});

test('conflict overwrite changes personal fields without reverting a newer quotation or source binding',t=>{
 const h=researchWorld(t),old=h.writer.withRevision(h.a),changed=h.writer.save({...h.a,source:'New verified quotation',sourceVersion:'new-version',note:'Elsewhere'}).annotation;
 const result=h.writer.saveChecked({...old,note:'My explicit overwrite'},h.writer.revisionOf(changed));assert.equal(result.ok,true);assert.equal(result.annotation.source,'New verified quotation');assert.equal(result.annotation.sourceVersion,'new-version');assert.equal(result.annotation.note,'My explicit overwrite');
});
