'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../src/renderer/media-search-model'),{createMetadataClient}=require('../src/catalog-discovery');
test('cross-source search folds Turkish text, keeps source identity and bounds each visible group',()=>{
  const catalog=[{id:'film',title:'İstanbul Çığlığı'}],shelf={books:[{id:'book',title:'Other',author:'İstanbul'}],music:[{id:'track',title:'Track',artist:'İstanbul'}]},history=[{key:'youtube:abcdefghijk',title:'İstanbul stream'}];
  const before=structuredClone({catalog,shelf,history});const groups=model.groups('istanbul',catalog,shelf,history);assert.deepEqual(groups.map(g=>g.rows.length),[1,1,1,1]);assert.equal(groups[0].rows[0].id,'film');assert.deepEqual({catalog,shelf,history},before);
  const many=model.groups('story',Array.from({length:100},(_,i)=>({id:String(i),title:'story'})),{},[])[0];assert.equal(many.total,100);assert.equal(many.rows.length,40);assert.deepEqual(model.groups('',catalog,shelf,history),[]);
});
test('TMDB gallery only emits bounded fixed-origin image URLs and preserves film/series identity',async()=>{
  const calls=[],client=createMetadataClient(async(url,options)=>{calls.push(String(url));return new Response(JSON.stringify({backdrops:[{file_path:'/a.jpg'},{file_path:'//evil.example/a.jpg'},{file_path:'/../x.jpg'},{file_path:'/a.jpg'},...Array.from({length:100},(_,i)=>({file_path:`/b${i}.jpg`}))],posters:[{file_path:'/poster.png'}]}));});
  const result=await client.images({kind:'film',tmdbId:'movie:123'},'fixture-tmdb-credential-not-a-real-key');assert(result.rows.length<=100);assert(result.rows.every(r=>/^https:\/\/image\.tmdb\.org\/t\/p\/w1280\/[a-zA-Z0-9._-]+$/.test(r.url)));assert.equal(result.rows.filter(r=>r.url.endsWith('/a.jpg')).length,1);assert(!result.rows.some(r=>r.url.includes('evil')));assert(calls[0].includes('/movie/123/images'));
  await client.images({kind:'film',tmdbId:'movie:123'},'fixture-tmdb-credential-not-a-real-key');assert.equal(calls.length,1);await assert.rejects(client.images({kind:'series',tmdbId:'movie:123'},'fixture-tmdb-credential-not-a-real-key'));
});
test('typing keeps online lookup explicit and late online responses cannot replace a new query',async()=>{
  const {JSDOM}=require('jsdom'),fs=require('node:fs'),dom=new JSDOM('<body><button id="opener">Search</button></body>',{url:'https://fixture.example/',runScripts:'outside-only'}),w=dom.window;
  const pending=[];try{
    w.syncBrowserOcclusion=()=>{};w.UiLocale={get:()=> 'en'};w.MediaSearchModel=model;
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
    w.api={mediaCatalog:async()=>({ok:true,items:[{id:'film',title:'Witness'}]}),mediaShelf:async()=>({ok:true,books:[],music:[]}),listWatchLibrary:async()=>[],mediaDiscovery:input=>new Promise(resolve=>pending.push({input,resolve}))};
    w.eval(fs.readFileSync(require.resolve('../src/renderer/media-search-ui'),'utf8'));await w.MediaSearchUI.open('Witness');assert.equal(pending.length,0);
    const button=w.document.querySelector('.mhs-dialog>.mh-action');button.click();await new Promise(r=>setImmediate(r));assert.equal(pending.length,2);assert.equal(pending[0].input.query,'Witness');
    const input=w.document.querySelector('input');input.value='Changed';input.dispatchEvent(new w.Event('input'));
    for(const job of pending)job.resolve({ok:true,rows:[{providerId:'tt1234567',title:'Late old result',kind:job.input.kind}]});await new Promise(setImmediate);
    assert.equal(w.document.querySelector('.mhs-remote').textContent,'');assert(!w.document.querySelector('.mhs-dialog').textContent.includes('Late old result'));
    w.document.querySelector('.mhs-dialog header button').click();assert(!w.document.querySelector('.mhs-dialog'));
  }finally{w.close();}
});
