'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Dub=require('../src/renderer/browser-dub-audio');
function fixture(){
 let clock=1000;const c={mode:'player',tabId:'v',mediaKey:'test',generation:1,priorMuted:false,visible:true};
 const a={currentTime:0,duration:10,readyState:4,paused:true,playbackRate:1,addEventListener(){},pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()},load(){},removeAttribute(){}};
 const dub=new Dub({audio:a,context:()=>c,now:()=>clock,mute:async()=>({ok:true}),setRate:async()=>({ok:true})});
 return {dub,a,c,advance:n=>clock+=n};
}
const sync={version:1,videoDuration:10,audioDuration:10,segments:[{v0:0,v1:10,a0:0,a1:10}]};
test('natural video end finishes a bounded already-playing tail without seeking past it',async()=>{
 const f=fixture();try{
  await f.dub.attach({url:'file:///test.wav',sync},f.c);f.dub.update({currentTime:9.8,paused:false,ended:false,readyState:4,playbackRate:1});await new Promise(r=>setImmediate(r));
  f.a.currentTime=9.9;f.dub.update({currentTime:10,paused:true,ended:true,readyState:4,playbackRate:1});
  assert.equal(f.a.paused,false);assert.equal(f.a.currentTime,9.9);
  f.a.currentTime=10;f.dub.tick();assert.equal(f.a.paused,true);
 }finally{await f.dub.remove();}
});
test('manual pauses, a stuck tail, and a large gap do not keep audio running',async()=>{
 for(const mode of ['pause','stuck','gap']){
  const f=fixture();try{
   await f.dub.attach({url:'file:///test.wav',sync},f.c);f.dub.update({currentTime:9.8,paused:false,ended:false,readyState:4,playbackRate:1});await new Promise(r=>setImmediate(r));f.a.currentTime=mode==='gap'?9:9.9;
   f.dub.update({currentTime:10,paused:true,ended:mode!=='pause',readyState:4,playbackRate:1});
   if(mode==='stuck'){assert.equal(f.a.paused,false);f.advance(501);f.dub.tick();}
   assert.equal(f.a.paused,true,mode);
  }finally{await f.dub.remove();}
 }
});
test('source changes and ads interrupt a finishing tail',async()=>{
 for(const mode of ['source','ad']){
  const f=fixture();try{
   await f.dub.attach({url:'file:///test.wav',sync},f.c);f.dub.update({currentTime:9.8,paused:false,ended:false,readyState:4,playbackRate:1});await new Promise(r=>setImmediate(r));f.a.currentTime=9.9;
   f.dub.update({currentTime:10,paused:true,ended:true,readyState:4,playbackRate:1});assert.equal(f.a.paused,false);
   if(mode==='source'){f.c.mediaKey='other';f.dub.tick();await new Promise(r=>setImmediate(r));}
   else f.dub.update({currentTime:10,paused:true,ended:true,readyState:4,playbackRate:1,adPlaying:true});
   assert.equal(f.a.paused,true,mode);
  }finally{await f.dub.remove();}
 }
});
