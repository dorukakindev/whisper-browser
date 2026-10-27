'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
function fixture(tracks){
 const calls=[],player={browserActiveTabId:'a',mediaKey:'fixture',browserTracks:tracks},state={},nodes={translateTo:{value:'tr'},translateModel:{value:'new-model'},translateEndpointPreset:{value:'https://new.example/v1'},makeTransBtn:{disabled:false}};
 const ctx={player,state,$:id=>nodes[id],currentBrowserYoutubeUrl:()=> 'https://www.youtube.com/watch?v=abcdefghijk',currentBrowserWhisperRange:()=>null,setBrowserSignal(){},setSubtitleMode(){},useBrowserTrack:async(_secondary,id)=>{player.subPath=tracks.find(t=>t.id===id).path;return {ok:true};},startPlayerSubtitleTranslation:async config=>{calls.push({kind:'translation',config});return {ok:true,jobId:'translation'};},startProgressivePlayerTranscription:async config=>{calls.push({kind:'whisper',config});player.job={backendJobId:'new'};}};
 vm.runInNewContext(code.slice(code.indexOf('async function startBrowserYoutubeWhisper('),code.indexOf('async function exportBrowserAbClip(')),ctx);
 return {ctx,calls};
}
test('Whisper reuse never presents partial source captions as a completed transcription',async()=>{
 for(const flags of [{status:'partial'},{failed:1},{captureComplete:false}]){
  const h=fixture([{id:'s',path:'partial.srt',role:'source',generatedBy:'whisper',...flags}]);
  const result=await h.ctx.startBrowserYoutubeWhisper(false);
  assert.equal(result.reused,undefined);assert.equal(h.calls[0]?.kind,'whisper','Partial source requires actual transcription, not a completed cache receipt');
 }
});
test('An existing translation from a different model or provider cannot bypass the selected settings',async()=>{
 for(const change of [{model:'old-model',provider:'https://new.example/v1'},{model:'new-model',provider:'https://old.example/v1'}]){
  const h=fixture([{id:'t',path:'translated.srt',role:'translation',generatedBy:'whisper',language:'tr',status:'complete',...change},{id:'s',path:'source.srt',role:'source',generatedBy:'whisper',status:'complete'}]);
  const result=await h.ctx.startBrowserYoutubeWhisper(true);
  assert.equal(result.reused,undefined);assert.equal(h.calls[0]?.kind,'translation','A completed source can still avoid re-transcription');
 }
 const h=fixture([{id:'t',path:'translated.srt',role:'translation',generatedBy:'whisper',language:'tr',status:'complete',model:'new-model',provider:'https://new.example/v1/'}]);
 assert.equal((await h.ctx.startBrowserYoutubeWhisper(true)).reused,true);assert.equal(h.calls.length,0);
});

test('Normal translation registration preserves frozen job settings for later reuse',()=>{
 const h=fixture([]);h.ctx.player.workspaceMode='browser';const tab={id:'a'};
 h.ctx.browserTabState=()=>tab;h.ctx.browserSubtitleSync={hashText:text=>String(text.length)};h.ctx.renderBrowserTracks=()=>{};
 vm.runInNewContext(code.slice(code.indexOf('function registerCompletedBrowserOutputs('),code.indexOf('async function attachCompletedJobSubtitles(')),h.ctx);
 h.ctx.registerCompletedBrowserOutputs({items:[{role:'translation',path:'translated.srt',language:'tr',status:'complete'}]}, {workspaceMode:'browser',browserTabId:'a',mediaKey:'fixture',translateForSpeech:false,translateModel:'frozen-model',translateBaseUrl:'https://frozen.example/v1'});
 assert.equal(h.ctx.player.browserTracks[0].model,'frozen-model');assert.equal(h.ctx.player.browserTracks[0].provider,'https://frozen.example/v1');
});
