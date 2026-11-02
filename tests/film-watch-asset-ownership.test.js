'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate);
async function run(t,role,change){
 const dom=new JSDOM('<div id="mhStatus"></div><dialog open><main class="mtd-body"></main></dialog>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());let release,releasePlayback;const calls=[];let context={mediaKey:'initial',visible:true,hasMedia:true,generation:1,tabId:'player'};
 w.player={openIntent:1};w.UiLocale={get:()=> 'en'};const page=w.document.querySelector('dialog');page.close=()=>{page.open=false;page.dispatchEvent(new w.Event('close'));};
 w.BrowserDubAudioUI={context:()=>context,attachGenerated:async output=>{calls.push(['voice',output,context.mediaKey]);return true;}};w.MediaExperience={setContext(){},openVoice:async()=>{}};
 w.openMediaCatalogPlayback=async item=>{context={...context,mediaKey:item.key};calls.push(['play',item.key]);};w.addSubtitleOption=()=>{};w.loadSubtitle=async file=>calls.push(['subtitle',file,context.mediaKey]);
 w.api={mediaTools:async req=>{if(req.action==='film-watch-overview')return {ok:true,title:'Fixture',catalogId:'film',sources:['A','B'].map(id=>({id,label:'Cut '+id,type:'local',locator:{editionId:id}})),assets:['A','B'].map(id=>({id:role+id,name:id,role,sourceId:id}))};if(req.action==='film-watch-reflection-state')return {ok:true,revision:'r'};if(req.action==='film-watch-asset')return new Promise(r=>release=r);throw Error(req.action);},mediaCatalog:async req=>change==='play-await'?new Promise(resolve=>releasePlayback=()=>resolve({ok:true,watchItem:{key:req.editionId}})):({ok:true,watchItem:{key:req.editionId}})};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/film-watch-ui.js'),'utf8'));w.FilmWatchUI.mount(page,{id:'film'});await tick();[...w.document.querySelectorAll('button')].find(b=>b.textContent===(role==='subtitle'?'Use subtitle':'Use voice')).click();await tick();assert(release);
 const source=w.document.querySelector('[aria-label="Playback source"]');if(change&&change!=='play-await'){source.value='B';source.dispatchEvent(new w.Event('change'));if(change==='roundtrip'){source.value='A';source.dispatchEvent(new w.Event('change'));}}
 release({ok:true,file:'A.srt',output:'A.wav'});await tick();if(change==='play-await'){assert(releasePlayback);source.value='B';source.dispatchEvent(new w.Event('change'));releasePlayback();}await tick();await tick();return calls;
}
for(const role of ['subtitle','voice']){
 test('R846-01 '+role+' unchanged source applies the selected asset',async t=>{const calls=await run(t,role,false);assert.deepEqual(calls,[['play','A'],[role,role==='subtitle'?'A.srt':'A.wav','A']]);});
 test('R846-01 '+role+' delayed asset does not follow a newer source selection',async t=>{assert.deepEqual(await run(t,role,true),[]);});
 test('R846-01 '+role+' source changes during playback resolution are cancelled',async t=>{assert.deepEqual(await run(t,role,'play-await'),[]);});
 test('R846-01 '+role+' source roundtrip also invalidates the pending operation',async t=>{assert.deepEqual(await run(t,role,'roundtrip'),[]);});
}
