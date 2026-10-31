'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
async function fixture(t){
 const dom=new JSDOM('<div id="playerLayer"><div id="playerStage"><video id="playerVideo"></video></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,v=w.document.getElementById('playerVideo');
 v.play=async()=>{};v.pause=()=>{};Object.defineProperty(v,'duration',{configurable:true,get:()=>120});
 w.player={workspaceMode:'player',localPath:'fixture.mp4',mediaKey:'file:fixture',generation:1};
 w.BrowserDubAudioUI={context:()=>({visible:true,hasMedia:true}),snapshot:()=>null,stop:async()=>{}};w.AssistantAppActions={current:()=>true};w.UiLocale={get:()=> 'en'};let startupError='';w.osd=message=>{startupError=message;};
 let reject='',pending,onEvent,calls=[];
 w.api={nativePlayer:async input=>{calls.push(input);if(input.action==='command'&&input.command===reject)return {ok:false,error:'Native command refused'};if(input.action==='command'&&pending)return pending(input);return {ok:true};},onNativePlayer:fn=>{onEvent=fn;},onAssistantVisibility:()=>{}};
 w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/native-player-ui.js'),'utf8'));
 assert.equal(await w.NativePlayerUI.start(),true,startupError);assert.equal(w.NativePlayerUI.active(),true);
 w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/assistant-library-actions.js'),'utf8'));
 return {w,v,calls,reject:op=>{reject=op;},defer:fn=>{pending=fn;},run:(operation,value)=>w.AssistantLibraryActions.execute('playback_control',{operation,value},{})};
}
for(const [operation,value,property,before] of [['speed',1.5,'playbackRate',1],['volume',.3,'volume',1],['seek',25,'currentTime',0]])test('assistant native '+operation+' refuses failed IPC rather than reporting completion',async t=>{
 const h=await fixture(t);h.reject(operation);
 await assert.rejects(h.run(operation,value),/Native command refused/);assert.equal(h.v[property],before);
 const call=h.calls.at(-1);assert.equal(call.command,operation);assert.equal(call.value,value);assert.equal(call.key,'file:fixture');
});
test('native command receipt is awaited before assistant completion',async t=>{
 const h=await fixture(t);let reply;h.defer(()=>new Promise(resolve=>{reply=resolve;}));let completed=false;
 const action=h.run('speed',1.25).then(value=>{completed=true;return value;});await Promise.resolve();assert.equal(completed,false);
 reply({ok:true});assert.equal((await action).status,'completed');
});
