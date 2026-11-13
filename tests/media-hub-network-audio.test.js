'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function fixture(t){
 const dom=new JSDOM('<section id="playerLayer" class="hidden"></section><video id="playerVideo"></video>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 w.UiLocale={get:()=> 'en'};w.api={mediaHub:async()=>({ok:true,persistent:true})};w.resync=[];
 w.eval(`var player={mediaKey:'',generation:0,openIntent:0,workspaceMode:'player'};
  var currentGeneration=()=>player.generation,flushWatchState=()=>Promise.resolve({ok:true}),setWorkspaceMode=mode=>player.workspaceMode=mode;
  var setPlayerSource=(_url,_title,key)=>{player.mediaKey=key;player.generation++;};var setPlayerHls=setPlayerSource;
  var syncSubtitlePrimaryAction=()=>window.resync.push(window.MediaHubUI.whisperSource());`);
 w.eval(fs.readFileSync(require.resolve('../src/renderer/media-hub-ui'),'utf8'));return w;
}
const stream=(letter,kind='ready')=>{const key='stream:'+letter.repeat(64);return {ok:true,key,url:`https://media.invalid/${letter}.mp4`,title:'Synthetic stream',whisperAudio:kind,audioSource:{owner:'mediaHub',key,token:kind==='ready'?'synthetic-'+letter:''}};};
const copy=value=>JSON.parse(JSON.stringify(value));

test('network playback exposes its current bounded audio capability and resynchronizes Whisper without pretending the video is local',async t=>{
 const w=fixture(t),item=stream('a');assert.equal(await w.MediaHubUI.playStream(item,0,{autoplay:false}),true);
 assert.deepEqual(copy(w.MediaHubUI.whisperSource()),item.audioSource);assert.equal(w.MediaHubUI.whisperStatus().ok,true);
 assert.equal(w.resync.length,1);assert.equal(w.resync[0].key,item.key);assert(!w.player.localPath,'a URL must not become a fake local file');
});

test('network audio capability rejects A/B/A generations and Browser takeover, and a non-network playback retires it',async t=>{
 const w=fixture(t),item=stream('a');await w.MediaHubUI.playStream(item,0,{autoplay:false});
 w.player.generation++;assert.equal(w.MediaHubUI.whisperSource(),null);assert.equal(w.MediaHubUI.whisperStatus(),null);
 await w.MediaHubUI.playStream(item,0,{autoplay:false});w.player.workspaceMode='browser';assert.equal(w.MediaHubUI.whisperSource(),null);
 w.player.workspaceMode='player';await w.MediaHubUI.playStream({key:item.key,url:item.url,whisperAudio:'ready'},0,{autoplay:false});
 assert.equal(w.MediaHubUI.whisperSource(),null);assert.equal(w.MediaHubUI.whisperStatus(),null);
});

test('adaptive and insecure network sources explain the supported next step without advertising Whisper capability',async t=>{
 const w=fixture(t);
 for(const kind of ['adaptive','insecure']){await w.MediaHubUI.playStream(stream('a',kind),0,{autoplay:false});
  assert.equal(w.MediaHubUI.whisperSource(),null);const status=w.MediaHubUI.whisperStatus();assert.equal(status.ok,false);assert.equal(status.kind,kind);assert.match(status.message,/HTTPS/);
 }
});

test('a superseded delayed network handoff cannot replace the latest audio capability',async t=>{
 const w=fixture(t);let release;
 w.api.mediaHub=request=>request.key===stream('a').key?new Promise(resolve=>release=resolve):Promise.resolve({ok:true,persistent:true});
 const old=w.MediaHubUI.playStream(stream('a'),0,{autoplay:false});await w.MediaHubUI.playStream(stream('b'),0,{autoplay:false});
 release({ok:true,persistent:true});assert.equal(await old,false);assert.equal(w.MediaHubUI.whisperSource().key,stream('b').key);
});
