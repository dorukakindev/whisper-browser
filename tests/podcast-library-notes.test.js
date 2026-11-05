'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(require.resolve('../src/renderer/podcast-library-ui'),'utf8'),tick=()=>new Promise(setImmediate);
function fixture(t,{load,open,identity=true}={}){
 const dom=new JSDOM('<body><main></main></body>',{runScripts:'outside-only'}),w=dom.window;w.eval(source);t.after(()=>w.close());const root=w.document.querySelector('main'),calls=[],row={title:'Same title',entryId:identity?'entry-one':'',episodeIdentity:identity?'episode-one':'',sourceVersion:'v1'},program={id:'program',title:'Show',episodes:[row]};
 const dispose=w.PodcastLibraryUI.mount(root,{podcasts:[program]},{queue:()=>({rows:[]}),listEpisodeNotes:async(p,r)=>{calls.push([p,r]);return load?load():{ok:true,annotations:[]};},openEpisodeNote:open||(()=>true)});
 const panel=root.querySelector('.pl-hero .pl-saved-notes');return{w,root,row,program,panel,calls,dispose,toggle:panel.querySelector('.pl-notes-toggle')};
}

test('episode notes load on demand and filter by entry or episode identity, never shared titles',async t=>{
 const opened=[],notes=[{id:'one',type:'quote',mediaType:'podcast',mediaTitle:'Other title',sourceEntryId:'entry-one',source:'Actual sentence',translation:'Çeviri',note:'My note',timed:true,start:0},{id:'two',type:'word',mediaType:'podcast',episodeIdentity:'episode-one',source:'Actual word',timed:false,start:null},{id:'three',type:'note',mediaType:'podcast',sourceEntryId:'wrong-entry',episodeIdentity:'wrong-episode',mediaTitle:'Same title',source:'Unrelated'},{id:'four',type:'note',mediaType:'browser',sourceEntryId:'entry-one',source:'Wrong media kind'}];
 const f=fixture(t,{load:()=>({ok:true,annotations:notes}),open:async note=>{opened.push(note);return true;}});assert.equal(f.calls.length,0);f.toggle.click();await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],f.program);assert.equal(f.calls[0][1],f.row);
 assert.equal(f.panel.querySelectorAll('.pl-note').length,2);assert.match(f.panel.textContent,/Passage · 0:00/);assert.match(f.panel.textContent,/Word · Untimed/);assert.doesNotMatch(f.panel.textContent,/Unrelated|Wrong media kind/);assert.match(f.panel.textContent,/My note|Çeviri/);
 f.panel.querySelector('.pl-note-open').click();await tick();assert.equal(opened[0],notes[0]);assert.equal(f.root.querySelector('audio,video'),null);f.toggle.click();f.toggle.click();await tick();assert.equal(f.calls.length,1);
});

test('notes expose loading, error, retry and source-specific empty state',async t=>{
 let resolve,attempt=0;const f=fixture(t,{load:()=>++attempt===1?new Promise(r=>resolve=r):{ok:true,annotations:[]}});f.toggle.click();assert.match(f.panel.textContent,/Loading saved/);assert.equal(f.panel.querySelector('.pl-notes-body').getAttribute('aria-busy'),'true');
 resolve({ok:false,error:'private backend message'});await tick();assert.match(f.panel.textContent,/could not be loaded/);assert.doesNotMatch(f.panel.textContent,/private backend/);assert.equal(f.panel.querySelector('.pl-notes-refresh').disabled,false);
 f.panel.querySelector('.pl-notes-refresh').click();await tick();assert.match(f.panel.textContent,/No saved passages, words or notes for this episode/);assert.equal(f.panel.querySelector('.pl-notes-body').getAttribute('aria-busy'),'false');
});

test('unidentified episodes cannot query notes and disposed loads cannot populate stale library',async t=>{
 const noIdentity=fixture(t,{identity:false});assert.equal(noIdentity.toggle.disabled,true);noIdentity.toggle.click();assert.equal(noIdentity.calls.length,0);
 let resolve;const f=fixture(t,{load:()=>new Promise(r=>resolve=r)});f.toggle.click();f.dispose();resolve({ok:true,annotations:[{mediaType:'podcast',sourceEntryId:'entry-one',source:'Late note'}]});await tick();assert.equal(f.panel.querySelector('.pl-note'),null);
});

test('source changes discard delayed notes and failed source open keeps notes visible',async t=>{
 let resolve;const f=fixture(t,{load:()=>new Promise(r=>resolve=r)});f.toggle.click();f.row.entryId='entry-new';resolve({ok:true,annotations:[{mediaType:'podcast',sourceEntryId:'entry-one',source:'Old note'}]});await tick();assert.match(f.panel.textContent,/Episode changed/);assert.equal(f.panel.querySelector('.pl-note'),null);
 const second=fixture(t,{load:()=>({ok:true,annotations:[{mediaType:'podcast',sourceEntryId:'entry-one',source:'Kept note',timed:false}]}),open:()=>false});second.toggle.click();await tick();second.panel.querySelector('.pl-note-open').click();await tick();assert.match(second.panel.textContent,/could not be opened/);assert.match(second.panel.textContent,/Kept note/);
});


test('saved transcript coverage is labeled as the selected interval in both languages',t=>{
 const f=fixture(t),refresh=()=>f.root.querySelector('.pl-search').dispatchEvent(new f.w.Event('input'));
 f.row.podcastWorkspace={sourceVersion:'v1',transcript:{hasText:true,coverage:{start:75,end:135}}};refresh();assert.equal(f.root.querySelector('.pl-coverage').textContent,'Selected interval · 1:15–2:15');
 f.w.UiLocale={get:()=> 'tr'};f.row.podcastWorkspace={...f.row.podcastWorkspace,transcript:{hasText:true,coverage:{start:0,end:12}}};refresh();assert.equal(f.root.querySelector('.pl-coverage').textContent,'Seçili aralık · 0:00–0:12');
 f.row.podcastWorkspace={sourceVersion:'old',transcript:{hasText:true,coverage:{start:0,end:12}}};refresh();assert.equal(f.root.querySelector('.pl-coverage'),null);
 f.row.podcastWorkspace={sourceVersion:'v1',transcript:{hasText:true,coverage:{start:null,end:12}}};refresh();assert.equal(f.root.querySelector('.pl-coverage'),null);
});

test('research source filter uses exact entry or episode identity before the store result limit',t=>{
 const {filterResearchAnnotations}=require('../src/browser-research-notebook'),{BrowserNoteStore}=require('../src/browser-note-store'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'episode-notes-filter-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new BrowserNoteStore(path.join(dir,'notes.json'));
 const byEntry={id:'entry-note',mediaType:'podcast',sourceEntryId:'entry-one',mediaTitle:'Other title',updatedAt:1},byIdentity={id:'episode-note',mediaType:'podcast',episodeIdentity:'episode-one',updatedAt:2},byBinding={id:'binding-note',mediaType:'podcast',sourceBinding:{episodeIdentity:'episode-one'},updatedAt:3};
 const unrelated=Array.from({length:5010},(_,i)=>({id:'other-'+i,mediaType:'podcast',sourceEntryId:'other-entry',episodeIdentity:'other-episode',mediaTitle:'Same title',updatedAt:i+10}));
 const wrongType={id:'browser-note',mediaType:'browser',sourceEntryId:'entry-one',updatedAt:9000};store.annotations=new Map([...unrelated,byEntry,byIdentity,byBinding,wrongType].map(note=>[note.id,note]));
 const filters={podcastSource:{sourceEntryId:'entry-one',episodeIdentity:'episode-one'}};assert.deepEqual(store.filter(filters,1).map(note=>note.id),['binding-note']);assert.deepEqual(store.filter(filters,5).map(note=>note.id),['binding-note','episode-note','entry-note']);
 assert.equal(filterResearchAnnotations([byEntry,byIdentity],{podcastSource:{}}).length,0);assert.deepEqual(filterResearchAnnotations([byEntry,byIdentity],{podcastSource:{sourceEntryId:'entry-on'}}),[]);
});


test('explicitly opened episode notes survive metadata repaint and stay isolated by source version',async t=>{
 const f=fixture(t,{load:()=>({ok:true,annotations:[{id:'kept',mediaType:'podcast',sourceEntryId:'entry-one',source:'Saved passage',timed:false}]})});const repaint=()=>f.root.querySelector('.pl-search').dispatchEvent(new f.w.Event('input'));
 assert.equal(f.calls.length,0);f.toggle.click();await tick();const previous=f.root.querySelector('.pl-hero');assert.match(previous.querySelector('.pl-notes-body').textContent,/Saved passage/);
 f.row.duration=100;repaint();await tick();const current=f.root.querySelector('.pl-hero');assert.notEqual(current,previous);assert.equal(current.querySelector('.pl-notes-toggle').getAttribute('aria-expanded'),'true');assert.equal(current.querySelector('.pl-notes-body').hidden,false);assert.match(current.querySelector('.pl-notes-body').textContent,/Saved passage/);
 const afterRestore=f.calls.length;f.row.sourceVersion='v2';repaint();await tick();assert.equal(f.root.querySelector('.pl-hero .pl-notes-body').hidden,true);assert.equal(f.calls.length,afterRestore);
});

test('closing notes or disposing the library prevents disclosure restoration reads',async t=>{
 const f=fixture(t),repaint=()=>f.root.querySelector('.pl-search').dispatchEvent(new f.w.Event('input'));f.toggle.click();await tick();f.toggle.click();f.row.duration=200;repaint();await tick();assert.equal(f.root.querySelector('.pl-hero .pl-notes-body').hidden,true);assert.equal(f.calls.length,1);
 f.root.querySelector('.pl-hero .pl-notes-toggle').click();await tick();const count=f.calls.length;f.row.duration=300;repaint();f.dispose();await tick();assert.equal(f.calls.length,count);
});


test('page refresh restores only explicitly opened source-bound notes across library mounts',async t=>{
 const dom=new JSDOM('<body><main></main></body>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());w.eval(source);
 const root=w.document.querySelector('main'),noteDisclosures=new Set(),row={entryId:'entry-one',episodeIdentity:'episode-one',sourceVersion:'v1',title:'Episode'};let reads=0;
 const data={podcasts:[{id:'show',title:'Show',episodes:[row]}]},actions={noteDisclosures,queue:()=>({rows:[]}),listEpisodeNotes:async()=>{reads++;return {ok:true,annotations:[{mediaType:'podcast',sourceEntryId:'entry-one',timed:false,source:'Saved passage'}]};}};
 let dispose=w.PodcastLibraryUI.mount(root,data,actions);assert.equal(reads,0);root.querySelector('.pl-notes-toggle').click();await tick();dispose();root.replaceChildren();
 dispose=w.PodcastLibraryUI.mount(root,data,actions);await tick();assert.equal(root.querySelector('.pl-notes-toggle').getAttribute('aria-expanded'),'true');assert.match(root.querySelector('.pl-notes-body').textContent,/Saved passage/);
 root.querySelector('.pl-notes-toggle').click();dispose();root.replaceChildren();const before=reads;dispose=w.PodcastLibraryUI.mount(root,data,actions);await tick();assert.equal(reads,before);assert.equal(root.querySelector('.pl-notes-body').hidden,true);dispose();
});
