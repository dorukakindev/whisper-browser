'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
test('source proof changes for an in-place edit outside the old sampled head and tail',()=>{
 const code=renderer.slice(renderer.indexOf('function browserTrackSourceIdentity('),renderer.indexOf('\n}',renderer.indexOf('function browserTrackSourceIdentity('))+2);
 const cues=Array.from({length:70},(_,i)=>({start:i,end:i+1,text:'line '+i}));
 const ctx={browserSubtitleSync:{cuePrefixHash:(rows,count)=>JSON.stringify(rows.slice(0,count))},browserSubtitleRoleCues:()=>({source:cues}),browserTabState:()=>({mediaId:'A'})};vm.createContext(ctx);vm.runInContext(code,ctx);
 const first=ctx.browserTrackSourceIdentity({id:'source'},cues).sourceHash;cues[40].text='Edited middle';assert.notEqual(ctx.browserTrackSourceIdentity({id:'source'},cues).sourceHash,first);
});
test('automatic subtitle result cannot replace an explicit Whisper job, including during read',async()=>{
 const text=fs.readFileSync(require.resolve('../src/renderer/stremio-ui.js'),'utf8'),code=text.slice(text.indexOf('  async function autoSubtitle('),text.indexOf('  // Expired lists',text.indexOf('  async function autoSubtitle(')));
 const owner={ctx:{},streamToken:'t',streamId:'s'},player={mediaKey:'A',generation:1,subPath:'',job:{running:true,mediaKey:'A'}};let saved=0,read=0;
 const ctx={session:owner,player,subtitleLanguage:()=> 'tr',subtitleLanguageCode:x=>x,document:{getElementById:()=>({value:'tr'})},call:async action=>{if(action==='subtitles')return {subtitles:[{preferred:true,id:'1'}],token:'subs'};saved++;return {filePath:'s.srt',language:'tr'};},addSubtitleOption(){},loadSubtitle:async()=>{read++;},rememberWorkTracks(){},toast(){},t:a=>a};vm.createContext(ctx);vm.runInContext(code,ctx);
 await ctx.autoSubtitle(owner);assert.equal(saved,0);assert.equal(read,0);
 player.job=null;ctx.loadSubtitle=async(_path,_secondary,options)=>{player.job={running:true,mediaKey:'A'};assert.equal(options.isCancelled(),true);};await ctx.autoSubtitle(owner);assert.equal(saved,1);assert.equal(player.subPath,'');
 assert(!renderer.includes('autoSubtitleGrace'),'manual selection cancellation must not have a global grace window');
});
test('native PiP projects both visible channels with offsets and removes old-source captions',()=>{
 const code=renderer.slice(renderer.indexOf('let miniCaptionTrack='),renderer.indexOf("if($('playerVideo'))for(const event",renderer.indexOf('let miniCaptionTrack=')));
 const track={cues:[],addCue(c){this.cues.push(c);},removeCue(c){this.cues.splice(this.cues.indexOf(c),1);}},video={currentTime:12,addTextTrack:()=>track},player={mediaKey:'A',generation:1,workspaceMode:'player',cues:[{start:10,end:14,text:'Source'}],cues2:[{start:11,end:13,text:'Translation'}],offset:1,offset2:0};
 const ctx={player,document:{pictureInPictureElement:video},$:id=>id==='playerVideo'?video:{checked:true},subtitleVideoTime:(t,second)=>t+(second?player.offset2:player.offset),VTTCue:class{constructor(start,end,text){Object.assign(this,{start,end,text});}}};vm.createContext(ctx);vm.runInContext(code,ctx);ctx.syncMiniPlayerCaptions();assert.equal(track.cues.length,2);assert.equal(track.cues[0].start,11);assert.equal(track.mode,'showing');player.mediaKey='B';player.generation++;player.cues=[];player.cues2=[];ctx.syncMiniPlayerCaptions();assert.equal(track.cues.length,0);ctx.document.pictureInPictureElement=null;ctx.syncMiniPlayerCaptions();assert.equal(track.mode,'disabled');
});
