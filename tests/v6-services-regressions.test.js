'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temporary=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v6-service-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
test('bundle import stages watch tombstones and notes and rolls all JSON files back on a later rename failure',t=>{
 const dir=temporary(t),settings=path.join(dir,'settings.json'),watchPath=path.join(dir,'watch-library.json');
 const watch=require('../src/watch-library-store').createWatchLibraryStore({filePath:watchPath});watch.upsert({key:'local:before',title:'Before'});
 const {BrowserNoteStore}=require('../src/browser-note-store'),notes=new BrowserNoteStore(path.join(dir,'browser-notes.json'));
 notes.importMissing([{id:'before',mediaId:'local:before',source:'Prior text'}]);fs.writeFileSync(settings,'{"value":"old"}');
 const inputs=[settings,watchPath,notes.filePath,notes.backupPath],before=inputs.map(p=>fs.readFileSync(p));
 const io=Object.create(fs);let failed=false;io.renameSync=(a,b)=>{if(!failed&&b===notes.filePath&&a.includes('.tmp')){failed=true;throw Object.assign(Error('injected'),{code:'EIO'});}return fs.renameSync(a,b);};
 const {commitSettingsBundle}=require('../src/settings-bundle-import');
 const run=writeTransaction=>commitSettingsBundle({entries:[{filePath:settings,value:{value:'new'}}],watchStore:watch,watchLibrary:[{key:'local:after',title:'After'}],watchPath,noteStore:notes,annotations:[{id:'after',mediaId:'local:after',source:'New text'}],writeTransaction});
 assert.throws(()=>run(entries=>require('../src/settings-security').writeJsonTransaction(entries,io)),/injected/);assert.equal(failed,true);
 inputs.forEach((p,i)=>assert.deepEqual(fs.readFileSync(p),before[i]));assert.equal(watch.load()[0].title,'Before');assert.equal(notes.annotations.has('after'),false);
 assert.equal(run(require('../src/settings-security').writeJsonTransaction).importedNotes,1);assert.equal(watch.load()[0].title,'After');assert.equal(new BrowserNoteStore(notes.filePath).annotations.has('after'),true);
});
test('episode-only names require a single matching candidate and cannot cross season folders',()=>{
 const A=require('../src/stremio-addons'),files=[{index:0,name:'Show - 05.mkv',video:true},{index:1,name:'Show - 06.mkv',video:true}];
 assert.equal(A.chooseTorrentFile(files,{}, {season:1,episode:5})?.index,0);
 assert.equal(A.chooseTorrentFile([{index:0,name:'Season 1/Ep 01.mkv',video:true},{index:1,name:'Season 2/Ep 01.mkv',video:true}],{}, {season:2,episode:1})?.index,1);
 assert.equal(A.chooseTorrentFile(files,{}, {season:2,episode:5}),null);
});
test('manual watched mark never steals the latest actual playback continuation',async t=>{
 const dir=temporary(t);let clock=10;const s=require('../src/stremio-service').createStremioService({root:()=>dir,now:()=>clock});const save=x=>s.handle({}, {action:'progress-save',type:'series',id:'tt1234567',duration:1000,...x});
 await save({season:1,episode:5,position:400});clock=20;await save({season:1,episode:1,position:1000,completed:true,manualCompletion:true});
 assert.equal((await s.handle({}, {action:'continue-list'})).items[0].episode,5);
 clock=30;await save({season:1,episode:1,position:500});assert.equal((await s.handle({}, {action:'continue-list'})).items[0].episode,1);
});
test('quiz excludes observed/in-progress items and tolerates unknown titles',()=>{
 const Q=require('../src/taste-quiz'),quiz={version:1,answers:['human',null,null,null,null,null]};
 const rows=[{id:'seen',kind:'film',title:'Seen',genres:['Drama'],progress:{position:1}},{id:'diary',kind:'film',title:'Diary',year:2020,genres:['Drama']},{id:'new',kind:'film',title:null,genres:['Drama']}];
 assert.deepEqual(Q.recommend(quiz,rows,{observedTitles:[{title:'Diary',year:2020}]}).map(x=>x.id),['new']);
});
test('untimed checkpoint resumes only the exact source/provider/context while preserving an existing translation',async()=>{
 const S=require('../src/podcast-session'),text='First paragraph '.repeat(180)+'\n\nSecond paragraph '.repeat(180);
 let entry={id:'e',kind:'podcast',feedId:'f',externalId:'guid',enclosures:[{url:'https://public.example/e.mp3',type:'audio/mpeg'}]};const version=S.sourceVersion(entry);
 entry.podcastWorkspace={sourceVersion:version,position:0,rate:1,transcript:{state:'untimed',format:'plain',text,provenance:'publisher',status:'complete'},translation:{state:'untimed',format:'plain',text:'Prior',provenance:'user'}};
 const store={entry:()=>structuredClone(entry),podcastWorkspace:(_,v,patch)=>{assert.equal(v,version);entry.podcastWorkspace={...entry.podcastWorkspace,...structuredClone(patch)};}};
 let calls=0,fail=true,identity='a'.repeat(64);const factory=()=>{const fn=async()=>{calls++;if(fail&&calls===2)throw Error('quota');return 'Translated chunk '+calls;};fn.checkpointIdentity=identity;return fn;};
 const start=require('../src/podcast-text-translation').createPodcastTextTranslation({store,createTranslator:factory});const input={entryId:'e',sourceVersion:version,expectedTranscriptText:text,targetLanguage:'tr'};
 await assert.rejects(start(input,new AbortController().signal),/quota/);assert.equal(entry.podcastWorkspace.translation.text,'Prior');assert.equal(entry.podcastWorkspace.textTranslationRecovery.parts.length,1);
 fail=false;const result=await start(input,new AbortController().signal);assert(result.translation.text.startsWith('Translated chunk 1'));assert.equal(entry.podcastWorkspace.textTranslationRecovery,null);
 const before=calls;identity='b'.repeat(64);entry.podcastWorkspace.textTranslationRecovery={fingerprint:'wrong',parts:['WRONG']};const other=await start(input,new AbortController().signal);assert(!other.translation.text.includes('WRONG'));assert(calls>before);
});
test('different searchable catalog IDs on the same addon retain independent results',async t=>{
 const root=temporary(t),requested=[];const manifest={id:'catalog',name:'Catalog',version:'1.0.0',resources:['catalog'],types:['movie'],catalogs:['one','two'].map(id=>({id,type:'movie',extra:[{name:'search'}]}))};
 const service=require('../src/stremio-service').createStremioService({root:()=>root,assertUrl:async()=>{},fetch:async url=>{requested.push(url);const data=url.endsWith('manifest.json')?manifest:{metas:[{id:url.includes('/one/')?'tt1111111':'tt2222222',type:'movie',name:'Result'}]};return new Response(JSON.stringify(data));}});
 const preview=await service.handle({}, {action:'addon-preview',url:'https://catalog.example/manifest.json'});await service.handle({}, {action:'addon-install',token:preview.token});
 const result=await service.handle({}, {action:'search',query:'film',types:['movie']});assert.equal(result.items.length,2);assert.equal(requested.filter(u=>u.includes('/catalog/')).length,2);
});
test('webRequest adapters retain independent owners and detach only after the final owner releases',()=>{
 const callbacks=new Map(),session={webRequest:{}};for(const event of ['onBeforeRequest','onBeforeSendHeaders','onHeadersReceived','onSendHeaders','onResponseStarted','onBeforeRedirect','onCompleted','onErrorOccurred'])session.webRequest[event]=fn=>callbacks.set(event,fn);
 const {ownedSession}=require('../src/session-webrequest-mux'),a=ownedSession(session,'a'),b=ownedSession(session,'b');assert.notEqual(a,b);assert.equal(ownedSession(session,'a'),a);
 const calls=[];a.webRequest.onCompleted(()=>calls.push('a'));b.webRequest.onCompleted(()=>calls.push('b'));callbacks.get('onCompleted')({url:'https://example.test/'});assert.deepEqual(calls,['a','b']);
 a.webRequest.onCompleted(null);calls.length=0;callbacks.get('onCompleted')({url:'https://example.test/'});assert.deepEqual(calls,['b']);b.webRequest.onCompleted(null);assert.equal(callbacks.get('onCompleted'),null);
});
test('cover lookup for a saved non-Anime/Manga title is an empty cache miss without permitting its download',async t=>{
 const dir=temporary(t),C=require('../src/personal-collection');C.merge(dir,[{id:'book',domain:'book',metadata:{cover:'https://s4.anilist.co/book.png'}}]);const cache=require('../src/collection-cover-cache').create({root:dir,fetchImpl:()=>{throw Error('must not fetch');}});
 assert.equal(cache.image('book'),'');await assert.rejects(cache.put(['book']),/saved Anime\/Manga/);
});
