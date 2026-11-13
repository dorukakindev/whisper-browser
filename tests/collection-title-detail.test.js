'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{JSDOM}=require('jsdom'),C=require('../src/personal-collection'),M=require('../src/collection-metadata');
const raw=()=>({id:101,idMal:1,type:'ANIME',title:{romaji:'Source title'},description:'A <b>story</b><br>with two brothers.',bannerImage:'https://s4.anilist.co/banner.jpg',coverImage:{large:'https://s4.anilist.co/cover.jpg'},averageScore:90,genres:['Action'],episodes:64,format:'TV',status:'FINISHED',studios:{nodes:[{name:'bones'}]}});
const entry=()=>({id:'mal:anime:1',providerId:'1',provider:'myanimelist',title:'My title',domain:'anime',kind:'anime',rating:9,status:'watching',progress:12,total:64,metadata:{title:'My corrected title',genres:['Drama']},metadataOverrides:{title:{at:123}}});
function archive(t,row=entry()){const root=fs.mkdtempSync(path.join(os.tmpdir(),'collection-detail-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));C.merge(root,[row]);return {root,file:path.join(root,'personal-collection.json')};}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};

test('Read-only detail uses cached metadata offline, automatically enriches and preserves personal fields byte-for-byte',async t=>{
 const {root,file}=archive(t),before=fs.readFileSync(file);let calls=0;
 const service=M.create({root,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://graphql.anilist.co');assert.equal(options.credentials,'omit');assert.match(JSON.parse(options.body).query,/idMal:1,type:ANIME/);return new Response(JSON.stringify({data:{m0:raw()}}));}});
 assert.equal((await service.detail({id:entry().id})).metadata.title,'My corrected title');assert.equal(calls,1);
 const result=await service.detail({id:entry().id,refresh:true});assert.equal(calls,2);assert.equal(result.metadata.title,'My corrected title');assert.deepEqual(result.metadata.genres,['Drama']);assert.equal(result.metadata.averageScore,90);assert.equal(result.metadata.description,'A story\nwith two brothers.');
 assert.equal((await service.detail({id:entry().id})).metadata.description,result.metadata.description);assert.equal(calls,2);assert.deepEqual(fs.readFileSync(file),before);
 await assert.rejects(service.detail({id:entry().id,refresh:'yes'}),/Choose/);
 service.apply([{id:entry().id,metadata:{...M.normalize(raw(),'anime'),description:'Updated',averageScore:98,banner:'https://s4.anilist.co/new.jpg'}}]);
 const saved=C.read(root);saved.rows[0].metadata.description='Personal summary';saved.rows[0].metadata.averageScore=80;saved.rows[0].metadata.banner='https://s4.anilist.co/personal.jpg';C.write(root,saved);
 service.apply([{id:entry().id,metadata:M.normalize(raw(),'anime')}]);assert.equal(C.read(root).rows[0].metadata.description,'Personal summary');assert.equal(C.read(root).rows[0].metadata.averageScore,80);assert.equal(C.read(root).rows[0].metadata.banner,'https://s4.anilist.co/personal.jpg');
});

test('Detail rejects changed identity, missing provider results and unsafe artwork without touching the archive',async t=>{
 const {root,file}=archive(t);let release;
 const service=M.create({root,fetchImpl:()=>new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({data:{m0:raw()}})));})});
 const pending=service.detail({id:entry().id,refresh:true});await settle();const changed=C.read(root);changed.rows[0].progress=13;C.write(root,changed);const before=fs.readFileSync(file);release();await assert.rejects(pending,/changed/);assert.deepEqual(fs.readFileSync(file),before);
 const unsafe=M.normalize({...raw(),bannerImage:'https://s4.anilist.co@evil.test/banner',averageScore:101,description:'<script>hostile()</script>'},'anime');assert.equal(unsafe.banner,'');assert.equal(unsafe.averageScore,null);assert.equal(unsafe.description,'hostile()');
 const missing=M.create({root,fetchImpl:async()=>new Response(JSON.stringify({data:{}}))});await assert.rejects(missing.detail({id:entry().id,refresh:true}),/unavailable/);assert.deepEqual(fs.readFileSync(file),before);
});

function ui(t){
 const dom=new JSDOM('<main id="mediaHome"><nav><button data-home-page="watched">Library</button></nav></main>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;t.after(()=>w.close());w.UiLocale={get:()=> 'en'};w.matchMedia=()=>({matches:true});
 w.MediaTitleUI={createPage(){const p=w.document.createElement('section');p.open=true;p.close=()=>{p.open=false;p.dispatchEvent(new w.Event('close'));p.remove();};w.document.querySelector('main').append(p);return p;}};
 for(const file of ['media-visual.js','cinema-ui.js','collection-title-ui.js'])w.eval(fs.readFileSync('src/renderer/'+file,'utf8'));
 w.CinemaFilmTools={mount(){throw Error('Film-only tools must not mount');}};w.CinemaFilmRound4={mount(){throw Error('Film-only tools must not mount');}};w.AssistantFilmActions={openPicker(){throw Error('Film comparison is unavailable for manga');}};return w;
}

test('Anime/manhwa pages reuse the cinema composition with real labels, accessible heading and no film-only actions',async t=>{
 const w=ui(t),row={...entry(),metadata:{...M.normalize(raw(),'anime'),description:'<img src=x onerror=hostile()> A synopsis'}},calls=[];
 w.api={mediaShelf:async input=>{calls.push(input);if(input.action==='collection-detail')return {ok:true,metadata:row.metadata};return {ok:true,image:''};},openExternal:async()=>{}};
 let edits=0;const page=w.CollectionTitleUI.open(row,{onEdit:()=>{edits++;return {...row,progress:13};}});await settle();
 assert(page.querySelector('.cn-film-hero'));assert.equal(page.querySelector('#mediaTitleHeading').textContent,'My title');assert.equal(page.getAttribute('aria-labelledby'),'mediaTitleHeading');assert.equal(page.querySelectorAll('.cn-story img').length,0);assert.match(page.textContent,/AniList community score90\/100/);assert.doesNotMatch(page.textContent,/IMDb|Compare films|Ask about this film|Film credits/);
 assert(calls.every(c=>['collection-detail','collection-cover-get'].includes(c.action)));assert(calls.filter(c=>c.action==='collection-detail').every(c=>c.refresh===false));
 const edit=[...page.querySelectorAll('button')].find(b=>b.textContent==='Rate / edit');edit.click();await settle();assert.equal(edits,1);assert.match(page.textContent,/13 \/ 64 episodes/);
 w.api.mediaShelf=async input=>input.action==='collection-list'?{ok:true,rows:[{...row,title:'Corrected source title',metadata:{...row.metadata,description:'Refreshed synopsis'}}]}:{ok:true,image:''};w.document.dispatchEvent(new w.Event('media-metadata-updated'));await settle();assert.equal(page.querySelector('h1').textContent,'Corrected source title');assert.match(page.textContent,/Refreshed synopsis/);page.close();const manga={...row,id:'mal:manga:1',domain:'manga',kind:'manhwa',metadata:{...row.metadata,domain:'manga',duration:25,format:'MANGA',description:'A manhwa story.'}};w.api.mediaShelf=async input=>({ok:true,metadata:manga.metadata,image:''});const next=w.CollectionTitleUI.open(manga);await settle();assert.match(next.textContent,/Manhwa/);assert.doesNotMatch(next.querySelector('.cn-meta').textContent,/min/);assert.match(next.textContent,/chapters/);
});

test('Library title and cover open details; edit stays separate and history display respects series/podcast identity',async t=>{
 const w=ui(t);w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.api={mediaShelf:async()=>({ok:true,rows:[entry()],catalog:[]})};
 let opened=0;w.CollectionTitleUI={open:row=>{assert.equal(row.id,entry().id);opened++;}};w.eval(fs.readFileSync('src/renderer/personal-library-ui.js','utf8'));const mounted=w.PersonalLibraryUI.mount(w.document.querySelector('main'));await settle();
 w.document.querySelector('.plog-title').click();await settle();w.document.querySelector('button.plog-identity').click();await settle();assert.equal(opened,2);assert.equal(w.document.querySelector('dialog'),null);
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Rate / edit').click();await settle();assert(w.document.querySelector('dialog'));
 const classify=w.PersonalLibraryUI.historyDomain;assert.equal(classify({title:'Family Guy · S23E3'}),'series');assert.equal(classify({url:'https://www.ivoox.com/episode-audios-mp3_rf_123.html'}),'podcast');assert.equal(classify({domain:'anime',title:'Show S01E1'}),'anime');assert.equal(classify({podcastId:'show',type:'browser'}),'podcast');assert.equal(classify({title:'A film',type:'stream'}),'film');assert.equal(classify({type:'browser',sourceRef:'https://www.ivoox.com/episode-audios-mp3_rf_123.html'}),'podcast');assert.equal(classify({type:'browser',key:'browser:https://www.ivoox.com/episode-audios-mp3_rf_123.html'}),'podcast');assert.equal(classify({sourceRef:'https://ivoox.com.evil.test/episode'}),'film');mounted.dispose();
});

test('A late library lookup cannot open a superseded title or reopen after navigation',async t=>{
 const w=ui(t),pending=[],opened=[];w.api={mediaShelf:()=>new Promise(resolve=>pending.push(resolve))};w.CollectionTitleUI={open:row=>opened.push(row.id)};w.eval(fs.readFileSync('src/renderer/personal-library-ui.js','utf8'));
 const second={...entry(),id:'mal:anime:2',providerId:'2'},reply={ok:true,rows:[entry(),second],catalog:[]};
 const first=w.PersonalLibraryUI.openCollection(entry().id),next=w.PersonalLibraryUI.openCollection(second.id);pending[1](reply);await next;pending[0](reply);await first;assert.deepEqual(opened,[second.id]);
 const late=w.PersonalLibraryUI.openCollection(entry().id);w.document.querySelector('#mediaHome').dataset.page='podcast';pending[2](reply);await late;assert.deepEqual(opened,[second.id]);const filmRace=w.PersonalLibraryUI.openCollection(entry().id);const film=w.document.createElement('section');film.className='media-title-page';w.document.querySelector('#mediaHome').append(film);pending[3](reply);await filmRace;assert.deepEqual(opened,[second.id]);
});

test('Automatic page enrichment paints the response and grouped themes without a manual click; late closed replies stay detached',async t=>{
 const w=ui(t),a={...entry(),metadata:{}},pending=[];w.api={mediaShelf:input=>input.action==='collection-cover-get'?Promise.resolve({ok:true}):new Promise(resolve=>pending.push({input,resolve})),openExternal:async()=>{}};
 const page=w.CollectionTitleUI.open(a);assert.equal(pending[0].input.refresh,false);assert.match(page.textContent,/Loading public title information/);
 pending[0].resolve({ok:true,metadata:{description:'Loaded automatically',themes:[{name:'Found Family',rank:91,category:'Theme-Other'}]},match:{score:72,rated:5,support:[{title:'Liked title',rating:9,shared:['theme:found family']}],counter:[]}});await settle();
 assert.match(page.textContent,/Loaded automatically/);assert.match(page.textContent,/Themes \/ Other/);assert.match(page.querySelector('.ct-match').textContent,/72/);assert.match(page.textContent,/Liked title/);
 [...page.querySelectorAll('button')].find(b=>b.textContent==='Read public reviews').click();await settle();const review=pending.at(-1);assert.equal(review.input.action,'collection-reviews');page.close();review.resolve({ok:true,id:a.id,rows:[{summary:'Late review',body:'must not repaint',author:'A',score:null,url:'https://anilist.co/review/1'}]});await settle();assert.equal(w.document.querySelector('.collection-title-page'),null);
});
