'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(){
 let current=true,release;const calls=[];const player={browserTracks:[],browserDuration:60,subPath:''},tab={};
 const window={UiLocale:{get:()=> 'en'},AssistantAppActions:{current:()=>current},api:{downloadYoutubeSubs:async args=>{calls.push(['download',args]);return {ok:true,data:{path:'fixture-Türkçe.srt'}};}}};
 const box={window,player,state:{running:false},currentBrowserYoutubeUrl:()=> 'https://www.youtube.com/watch?v=abcdefghijk',youtubeCookieBrowser:()=>'',browserSubtitleSync:{hashText:()=> 'hash'},browserTabState:()=>tab,renderBrowserTracks:()=>{},browserTrackSourceLanguage:track=>track.language.split('-')[0],currentBrowserWhisperRange:()=>null,pSecToTime:String,validateBrowserWhisperRange:()=>({}),useBrowserTrack:async(_,id)=>{calls.push(['load',id]);player.subPath=player.browserTracks.find(row=>row.id===id)?.path;return {ok:true};},startPlayerSubtitleTranslation:async args=>{calls.push(['translate',args]);return {ok:true,job:{}};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-caption-actions'),'utf8'),box);
 return {window,player,calls,box,sourceChanged:()=>current=false,run:args=>window.AssistantCaptionActions.translate(args,{owner:'A'})};
}
test('Manual caption download preserves per-job target, speech and exact range without Whisper',async()=>{
 const h=harness();assert.equal((await h.run({caption_id:'yt-manual:en',target_language:'de',start:5,end:25,forSpeech:true})).status,'accepted');
 assert.equal(h.calls[0][1].auto,false);assert.equal(h.calls[0][1].lang,'en');const args=h.calls.at(-1)[1];assert.equal(args.targetLanguage,'de');assert.equal(args.forSpeech,true);assert.equal(args.range.start,5);assert.equal(args.range.end,25);assert.equal(h.player.browserTracks[0].generatedBy,'youtube-captions');
});
test('A changed source after download never loads captions or starts a translation',async()=>{
 const h=harness();h.window.api.downloadYoutubeSubs=async()=>{h.sourceChanged();return {ok:true,data:{path:'old.srt'}};};
 await assert.rejects(h.run({caption_id:'yt-auto:en'}),/changed/);assert.equal(h.calls.length,0);assert.equal(h.player.browserTracks.length,0);
});
test('Invalid selection and occupied media do not download, transcribe or silently switch source',async()=>{
 const h=harness();await assert.rejects(h.run({caption_id:'invented'}),/Invalid/);assert.equal(h.calls.length,0);
 h.box.state.running=true;await assert.rejects(h.run({caption_id:'yt-manual:en'}),/running/);assert.equal(h.calls.length,0);
});
test('Positive possessive words do not become negation; actual negative verbs still block wrong meaning',()=>{
 const {translationBlockingIssues:issues}=require('../src/subtitle-sentence-layout');
 for(const [source,target] of [['I have 3 apples.','3 elmam var.'],['Okay.','Tamam.'],['This is a bathhouse.','Bu bir hamam.']])assert.deepEqual(issues(source,target,'tr'),[],target);
 for(const target of ['Gelemem.','Yapmam.','Sevmem.','Okuyamam.'])assert(issues('I can do it.',target,'tr').includes('negation_added'),target);
 assert(issues('I cannot come.','Gelebilirim.','tr').includes('negation_missing'));
});

test('Fractional second bounds reach the translation plan without truncation',async()=>{
 const h=harness();await h.run({caption_id:'yt-manual:en',start:5.125,end:25.75});const args=h.calls.at(-1)[1];assert.equal(args.range.start,5.125);assert.equal(args.range.end,25.75);
});

test('an explicit job provider survives the caption adapter without changing global settings',async()=>{
 const h=harness(),config={endpoint:'https://api.deepinfra.com/v1/openai',model:'deepseek-ai/DeepSeek-V4.1-Flash-1017',apiKey:'fixture-deep',profile:{id:'assistant',model:'deepseek-ai/DeepSeek-V4.1-Flash-1017'}};h.window.AssistantTranslationActions={resolve:async id=>{assert.equal(id,'assistant');return config;}};await h.run({caption_id:'yt-manual:en',translation_profile:'assistant'});assert.equal(h.calls.at(-1)[1].translationConfig,config);
});
