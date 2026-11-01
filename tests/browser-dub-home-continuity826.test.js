'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Dub=require('../src/renderer/browser-dub-audio');
const flush=()=>new Promise(setImmediate);
function fixture(mode='browser',play){
 const c={mode,tabId:'source-tab',mediaKey:'source-A',mediaId:'media-A',generation:1,visible:true,priorMuted:false};
 const calls=[],revoked=[];
 const audio={currentTime:0,duration:30,readyState:4,paused:true,addEventListener(){},load(){},removeAttribute(){},pause(){this.paused=true;},play(){this.paused=false;return play?play():Promise.resolve();}};
 const dub=new Dub({audio,context:()=>c,now:()=>1000,mute:async(id,muted,s,mode)=>{calls.push({muted,mode});return {ok:true,leaseOwned:true};},urls:{createObjectURL:()=> 'blob:retained',revokeObjectURL:url=>revoked.push(url)}});
 return {c,audio,dub,calls,revoked};
}
for(const mode of ['browser','player'])test(`${mode}: Home retains the attachment, mix and offset while pausing; source replacement disposes`,async()=>{
 const h=fixture(mode);try{
  assert(await h.dub.attach({name:'controlled.wav',mix:{voice:.4}},h.c));h.dub.offset=1.25;
  h.dub.update({currentTime:8,paused:false,playbackRate:1,readyState:4});await flush();assert.equal(h.audio.paused,false);
  const session=h.dub.session;h.c.visible=false;h.dub.tick();await flush();
  assert.equal(h.dub.session,session);assert.equal(h.audio.paused,true);assert.equal(h.dub.offset,1.25);assert.equal(session.mix.voice,.4);assert.deepEqual(h.revoked,[]);assert.equal(h.calls.at(-1).muted,false);
  h.c.visible=true;h.dub.tick();await flush();assert.equal(h.audio.paused,true,'old playing telemetry must not autoplay on return');
  h.dub.update({currentTime:8,paused:true,playbackRate:1,readyState:4});await flush();assert.equal(h.audio.paused,true);
  h.dub.update({currentTime:8,paused:false,playbackRate:1,readyState:4});await flush();await flush();assert.equal(h.audio.paused,false);assert.equal(h.audio.currentTime,6.75);assert.equal(h.dub.session,session);
  h.c.visible=false;h.c.generation++;h.dub.tick();await flush();assert.equal(h.dub.session,null);assert.deepEqual(h.revoked,['blob:retained']);
 }finally{await h.dub.remove();}
});
test('a pending play promise settling after Home cannot restart retained audio',async()=>{
 let release;const h=fixture('browser',()=>new Promise(resolve=>{release=resolve;}));
 try{
  await h.dub.attach({name:'controlled.wav'},h.c);h.dub.update({currentTime:7,paused:false,playbackRate:1,readyState:4});assert(release);
  await h.dub.suspend();h.c.visible=false;h.audio.paused=false;release();await flush();
  assert.equal(h.audio.paused,true);assert(h.dub.session,'late play must pause without destroying the retained attachment');
 }finally{await h.dub.remove();}
});

test('suspending an adaptive dub releases video speed while retaining its validated time map',async()=>{
 const h=fixture(),rates=[];h.dub.setRate=async request=>{rates.push(request);return {ok:true};};
 try{
  await h.dub.attach({name:'adaptive.wav',sync:{version:1,videoDuration:10,audioDuration:12,segments:[{v0:0,v1:4,a0:0,a1:6}]}},h.c);
  h.dub.update({currentTime:2,paused:false,playbackRate:2/3,readyState:4});await flush();await flush();
  const map=h.dub.session.sync;assert.equal(h.audio.currentTime,3);
  h.c.visible=false;await h.dub.suspend();assert.equal(rates.at(-1).release,true);assert.equal(rates.at(-1).rate,1);assert.equal(h.dub.session.sync,map);
  h.c.visible=true;h.dub.update({currentTime:2,paused:true,playbackRate:1,readyState:4});await flush();assert.equal(h.audio.paused,true);assert.equal(h.dub.session.sync,map);
 }finally{await h.dub.remove();}
});
