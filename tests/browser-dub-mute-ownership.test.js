'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/main.js'),'utf8');
const block=source.slice(source.indexOf("ipcMain.handle('browser:tab:mute'"),source.indexOf("ipcMain.handle('browser:places:folder'"));
const releaseHold=source.slice(source.indexOf('function releaseSourceReturnHold('),source.indexOf("ipcMain.handle('browser:navigate'"));
function harness(initial=false){
 let muted=initial,handler,authorized=true;const events=[];
 const wc={isDestroyed:()=>false,isAudioMuted:()=>muted,setAudioMuted:value=>{muted=value;},isCurrentlyAudible:()=>false};
 const tab={id:'tab',generation:1,mediaId:'video-A',view:{webContents:wc}};
 vm.runInNewContext(releaseHold+block,{ipcMain:{handle:(_name,fn)=>{handler=fn;}},authorizedBrowserSender:()=>authorized,browserTabById:id=>id==='tab'?tab:null,sendBrowserEvent:(_tab,value)=>events.push(value)});
 const meta=(owner,mode,extra={})=>({owner,mode,generation:1,mediaId:'video-A',...extra});
 return {tab,wc,events,meta,read:()=>muted,call:(value,lease)=>handler({},'tab',value,lease),deny:()=>{authorized=false;}};
}
test('late original-source commands cannot mute a replacement media generation',()=>{
 const h=harness();h.tab.generation=2;h.tab.mediaId='video-B';
 assert.equal(h.call(true,h.meta('old','acquire')).ok,false);assert.equal(h.read(),false);
 assert.equal(h.call(true,h.meta('old','update')).stale,true);assert.equal(h.read(),false);
});
test('an owned mute is released across navigation without stranding the tab mute bit',()=>{
 const h=harness();assert.equal(h.call(true,h.meta('owner','acquire')).priorMuted,false);assert.equal(h.read(),true);
 h.tab.generation=2;h.tab.mediaId='video-B';assert.equal(h.call(false,h.meta('owner','release')).ok,true);assert.equal(h.read(),false);assert.equal(h.tab.dubAudioMute,null);
});
test('a manual idempotent mute wins over old dubbing release',()=>{
 const h=harness();h.call(true,h.meta('owner','acquire'));h.call(true);assert.equal(h.read(),true);
 assert.equal(h.call(false,h.meta('owner','release')).skipped,true);assert.equal(h.read(),true);
});
test('manual unmute revokes queued dubbing updates too',()=>{
 const h=harness();h.call(true,h.meta('owner','acquire'));h.call(false);
 assert.equal(h.call(true,h.meta('owner','update')).skipped,true);assert.equal(h.read(),false);
});
test('replacement attachment inherits original human mute and old release cannot undo it',()=>{
 const h=harness();h.call(true,h.meta('old','acquire'));assert.equal(h.call(true,h.meta('new','acquire')).priorMuted,false);
 assert.equal(h.call(false,h.meta('old','release')).skipped,true);assert.equal(h.read(),true);
 h.call(false,h.meta('new','release'));assert.equal(h.read(),false);
});
test('an already muted tab remains muted outside a dubbing range and after removal',()=>{
 const h=harness(true);const first=h.call(false,h.meta('owner','acquire'));assert.equal(first.priorMuted,true);assert.equal(first.leaseOwned,true);assert.equal(h.read(),true);
 h.call(false,h.meta('owner','update'));assert.equal(h.read(),true);h.call(false,h.meta('owner','release'));assert.equal(h.read(),true);
});
test('a range attachment with no active mute still releases its lease',async()=>{
 const h=harness(),Dub=require('../src/renderer/browser-dub-audio');
 const audio={addEventListener(){},pause(){},removeAttribute(){},load(){}};
 const c={mode:'browser',tabId:'tab',mediaKey:'video-A',generation:1,mediaId:'video-A',priorMuted:false};
 const dub=new Dub({audio,context:()=>c,urls:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},mute:(_id,muted,s,mode)=>h.call(muted,h.meta(s.muteOwner,mode))});
 try{assert.equal(await dub.attach({name:'range.wav',range:{start:10,end:20}},c),true);assert(h.tab.dubAudioMute);assert.equal(h.read(),false);await dub.remove();assert.equal(h.tab.dubAudioMute,null);assert.equal(h.read(),false);}finally{await dub.remove();}
});
test('release never changes another WebContents or direct manual audio state',()=>{
 const h=harness();h.call(true,h.meta('owner','acquire'));let replacement=true;
 h.tab.view.webContents={...h.wc,isAudioMuted:()=>replacement,setAudioMuted:v=>{replacement=v;}};
 assert.equal(h.call(false,h.meta('owner','release')).skipped,true);assert.equal(replacement,true);
});
test('malformed ownership and unauthorized requests neither mutate nor revoke a valid lease',()=>{
 const h=harness();h.call(true,h.meta('owner','acquire'));const owner=h.tab.dubAudioMute;
 for(const lease of [null,{},h.meta('bad/owner','release'),h.meta('owner','unknown')])assert.equal(h.call(false,lease).ok,false);
 h.deny();assert.equal(h.call(false).ok,false);assert.equal(h.tab.dubAudioMute,owner);assert.equal(h.read(),true);
});
