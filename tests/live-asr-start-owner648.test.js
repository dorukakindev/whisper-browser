'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8').replace(/\r\n/g,'\n');
const code=source.slice(source.indexOf('async function startBrowserLiveAsrCapture('),source.indexOf('function scheduleActiveBrowserTrackRefresh('));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(setImmediate);
function harness(){
 const chooser=deferred(),module=deferred(),sent=[],stops=[],signals=[],nodes=[],contexts=[];
 const tracks=[{kind:'audio',stops:0,stop(){this.stops++;},addEventListener(){}},{kind:'video',stops:0,stop(){this.stops++;}}];
 const stream={getTracks:()=>tracks,getAudioTracks:()=>[tracks[0]],getVideoTracks:()=>[tracks[1]]};
 const player={browserActiveTabId:'a',browserLiveAsrStarting:false,browserLiveAsrActive:false,browserLiveAsrCapture:null,browserLiveAsrStream:null,browserPageUrl:'https://fixture.example/a',mediaKey:'browser:a'};
 const tab={id:'a',generation:1};let asks=0;
 const c={player,window:{api:{startBrowserLiveAsr:async()=>({ok:true,sessionId:'session-a',model:'small'}),stopBrowserLiveAsr:async id=>{stops.push(id);return {ok:true};},sendBrowserLiveAsrChunk:async(_tab,p)=>{sent.push(p);return {ok:false,error:'old-error'};}}},
  navigator:{mediaDevices:{getDisplayMedia:()=>chooser.promise}},openAppDialog:async()=>{asks++;return true;},browserTabState:()=>tab,
  $:()=>({value:'small'}),setBrowserSignal:(...x)=>signals.push(x),updateBrowserLiveAsrButton:()=>{},syncBrowserLiveAsrClock:()=>{},friendlySystemError:s=>s,Blob,
  blobToBase64:async()=> 'AAAA',setTimeout,clearTimeout,Promise,
  AudioContext:class{constructor(){this.audioWorklet={addModule:()=>module.promise};contexts.push(this);}createMediaStreamSource(){return {connect(){},disconnect(){}};}async resume(){}async close(){this.closed=true;}},
  AudioWorkletNode:class{constructor(){this.port={postMessage(){},close(){}};nodes.push(this);}connect(){}disconnect(){}},
 };
 vm.createContext(c);vm.runInContext(code,c);
 return {c,player,tab,chooser,module,tracks,stream,signals,stops,nodes,contexts,sent,asks:()=>asks};
}
test('Stop while display chooser is pending discards late audio instead of reviving capture',async()=>{
 const h=harness();h.module.resolve();const started=h.c.toggleBrowserLiveAsr();await tick();await h.c.stopBrowserLiveAsrCapture(true);h.chooser.resolve(h.stream);await started;
 assert.equal(h.player.browserLiveAsrActive,false);assert.equal(h.player.browserLiveAsrStream,null);assert(h.tracks.every(t=>t.stops>0));assert.equal(h.nodes.length,0);
});
test('same-tab source navigation while chooser waits cannot capture the new video with the old session',async()=>{
 const h=harness();h.module.resolve();const started=h.c.toggleBrowserLiveAsr();await tick();h.tab.generation++;h.player.mediaKey='browser:b';h.chooser.resolve(h.stream);await started;
 assert.equal(h.player.browserLiveAsrActive,false);assert(h.tracks.every(t=>t.stops>0));assert.equal(h.nodes.length,0);
});
test('rapid double activation does not open two consent prompts or start two sessions',async()=>{
 const h=harness();const consent=deferred();h.c.openAppDialog=async()=>{h.count=(h.count||0)+1;return consent.promise;};
 const first=h.c.toggleBrowserLiveAsr();const second=h.c.toggleBrowserLiveAsr();await tick();assert.equal(h.count,1);consent.resolve(false);await Promise.all([first,second]);
});
test('a retired worklet processor error cannot stop a successor capture',async()=>{
 const h=harness();h.module.resolve();h.player.browserLiveAsrActive=true;await h.c.startBrowserLiveAsrCapture(h.stream,'a','old');
 const old=h.nodes[0];const next={sessionId:'new',context:{close:async()=>{}},pending:new Set()};h.player.browserLiveAsrCapture=next;h.player.browserLiveAsrStream={getTracks:()=>[]};
 old.onprocessorerror();await tick();assert.equal(h.player.browserLiveAsrActive,true);assert.equal(h.player.browserLiveAsrCapture,next);assert.equal(h.stops.length,0);
});
test('late obsolete chunk conversion cannot send audio or show an error on the successor',async()=>{
 const h=harness(),encoded=deferred();h.c.blobToBase64=()=>encoded.promise;h.module.resolve();h.player.browserLiveAsrActive=true;await h.c.startBrowserLiveAsrCapture(h.stream,'a','old');
 h.nodes[0].port.onmessage({data:{type:'chunk',pcm:new Int16Array(4000),id:1,offset:0,rate:1}});
 h.player.browserLiveAsrCapture={sessionId:'new'};encoded.resolve('AAAA');await tick();assert.equal(h.sent.length,0);assert.equal(h.signals.length,0);
});

test('changing active tabs closes every track returned by the old chooser',async()=>{
 const h=harness();h.module.resolve();const started=h.c.toggleBrowserLiveAsr();await tick();h.player.browserActiveTabId='b';h.chooser.resolve(h.stream);await started;
 assert(h.tracks.every(t=>t.stops>0));assert.equal(h.nodes.length,0);assert.equal(h.player.browserLiveAsrStarting,false);
});
test('Stop during worklet module loading cannot connect a recorder after loading finishes',async()=>{
 const h=harness();const started=h.c.toggleBrowserLiveAsr();await tick();h.chooser.resolve(h.stream);await tick();await h.c.stopBrowserLiveAsrCapture(true);h.module.resolve();await started;
 assert.equal(h.nodes.length,0);assert(h.contexts.every(c=>c.closed));assert(h.tracks.every(t=>t.stops>0));assert.equal(h.player.browserLiveAsrActive,false);
});
test('an old slow context close cleans only its own stream and cannot stop the new backend',async()=>{
 const h=harness(),closed=deferred();h.module.resolve();h.player.browserLiveAsrActive=true;await h.c.startBrowserLiveAsrCapture(h.stream,'a','old');
 h.player.browserLiveAsrStream=h.stream;h.contexts[0].close=()=>closed.promise;h.nodes[0].port.postMessage=m=>{if(m.type==='flush')h.nodes[0].port.onmessage({data:{type:'flushed'}});};
 const stopping=h.c.stopBrowserLiveAsrCapture(true);await tick();
 const freshTrack={stops:0,stop(){this.stops++;}},next={sessionId:'new'};h.player.browserLiveAsrCapture=next;h.player.browserLiveAsrStream={getTracks:()=>[freshTrack]};h.player.browserLiveAsrActive=true;
 closed.resolve();await stopping;assert.equal(freshTrack.stops,0);assert.equal(h.player.browserLiveAsrCapture,next);assert.deepEqual(h.stops,['old']);assert.equal(h.player.browserLiveAsrActive,true);
});
test('backend terminal event cancels a pending chooser, but an old session event cannot stop a successor',async()=>{
 const a=source.indexOf("  if (event.type === 'live-asr-state' && event.active === false) {");
 const b=source.indexOf('    return;\n  }',a)+'    return;\n  }'.length;
 const h=harness();vm.runInContext('function terminal(event){'+source.slice(a,b)+'}',h.c);
 h.module.resolve();const started=h.c.toggleBrowserLiveAsr();await tick();
 h.c.terminal({type:'live-asr-state',active:false,sessionId:'session-a'});h.chooser.resolve(h.stream);await started;assert.equal(h.nodes.length,0);
 h.player.browserLiveAsrActive=true;h.player.browserLiveAsrCapture={sessionId:'successor'};
 h.c.terminal({type:'live-asr-state',active:false,sessionId:'session-a'});assert.equal(h.player.browserLiveAsrActive,true);
});
test('session-scoped main stop rejects old or malformed IDs while keeping explicit legacy stop',async()=>{
 const main=fs.readFileSync(require.resolve('../src/main'),'utf8');const a=main.indexOf("ipcMain.handle('browser:liveAsr:stop'");const b=main.indexOf('\n});',a)+4;
 const c={browserLiveAsr:{id:'new'},authorizedBrowserSender:e=>e.authorized,stopBrowserLiveAsr:()=>{c.calls++;return true;},calls:0,ipcMain:{handle:(_name,fn)=>c.handler=fn}};vm.createContext(c);vm.runInContext(main.slice(a,b),c);
 for(const id of ['old','',12])assert.equal((await c.handler({authorized:true},{sessionId:id})).ok,false);
 assert.equal((await c.handler({authorized:false},{sessionId:'new'})).ok,false);assert.equal(c.calls,0);
 assert.equal((await c.handler({authorized:true},{sessionId:'new'})).ok,true);assert.equal((await c.handler({authorized:true})).ok,true);assert.equal(c.calls,2);
});
test('normal capture still connects, flushes and can start again after a completed stop',async()=>{
 const h=harness();h.module.resolve();h.chooser.resolve(h.stream);await h.c.toggleBrowserLiveAsr();
 assert.equal(h.player.browserLiveAsrActive,true);assert.equal(h.nodes.length,1);assert.equal(h.player.browserLiveAsrCapture.sessionId,'session-a');
 h.nodes[0].port.postMessage=m=>{if(m.type==='flush')h.nodes[0].port.onmessage({data:{type:'flushed'}});};
 await h.c.stopBrowserLiveAsrCapture(true);assert.equal(h.player.browserLiveAsrActive,false);assert.equal(h.player.browserLiveAsrCapture,null);assert.equal(h.stops[0],'session-a');
 await h.c.toggleBrowserLiveAsr();assert.equal(h.player.browserLiveAsrActive,true);assert.equal(h.nodes.length,2);
});
