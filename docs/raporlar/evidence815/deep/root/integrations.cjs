'use strict';const fs=require('fs'),path=require('path'),vm=require('vm'),{JSDOM}=require('jsdom');const root=path.resolve(__dirname,'..'),rows=[];
async function main(){
 const source=fs.readFileSync(path.join(root,'src/renderer/media-hub-ui.js'),'utf8');
 const stream=source.slice(source.indexOf(' async function playStream('),source.indexOf(' async function drawPlayer('));
 const streams=[],ctx={player:{openIntent:0},document:{getElementById:()=>({classList:{remove(){}}})},flushWatchState:async()=>{},setWorkspaceMode(){},setPlayerSource:(...args)=>streams.push(args),setPlayerHls:(...args)=>streams.push(args),currentGeneration:()=>1,currentTorrent:null,window:{NativePlayerUI:{start:async()=>{rows.push({case:'native-stream-start'})}}}};vm.createContext(ctx);vm.runInContext(stream,ctx);
 for(const url of ['http://example.invalid/movie.mkv','https://example.invalid/movie.mkv','rtsp://example.invalid/movie']){const before=rows.length;await ctx.playStream({url,title:'Controlled stream',key:url});rows.push({case:'stream-protocol-native',url,nativeCalled:rows.length>before});}
 // Execute the complete playback-tools renderer with its true subtitle-search callback.
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{url:'https://audit.invalid',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};w.HTMLElement.prototype.scrollIntoView=function(){};
 const api={mediaHub:async()=>({ok:true}),nativePlayer:async()=>({ok:true,available:true}),mediaTorrents:async()=>({ok:true})};
 Object.assign(w,{api,player:{workspaceMode:'player',cues:[{start:20,end:22,text:'find this line'}],chapters:[]},UiLocale:{get:()=> 'en'},NativePlayerUI:{active:()=>false,state:()=>({tracks:[]})},syncBrowserOcclusion:async()=>{},subtitleVideoTime:s=>s+10});
 w.eval(source);w.MediaHubUI.open('player');await new Promise(setImmediate);
 const input=[...w.document.querySelectorAll('input')].find(n=>n.placeholder==='Words from the scene…');if(!input)throw Error('Search control missing');input.value='find';input.oninput();
 const button=[...w.document.querySelectorAll('button')].find(n=>n.textContent.includes('find this line'));if(!button)throw Error('Search result missing');button.click();await new Promise(setImmediate);rows.push({case:'subtitle-search-offset',subtitleStart:20,offset:10,expectedMediaTime:30,actual:w.document.getElementById('playerVideo').currentTime});w.close();
 // True font extraction module with controlled ffprobe result; .ttf and .ttc have
 // identical support in readFonts, but the attachment-discovery filter differs.
 const fontSource=fs.readFileSync(path.join(root,'src/browser-fonts.js'),'utf8'),fontCtx={module:{exports:{}},require:n=>n==='./browser-media-tools'?{run:async()=>JSON.stringify({streams:[{codec_type:'attachment',index:2,tags:{filename:'collection.ttc'}}]})}:require(n)};vm.createContext(fontCtx);vm.runInContext(fontSource,fontCtx);rows.push({case:'ttc-font-attachment',attachments:[{filename:'collection.ttc',codec_type:'attachment'}],result:await fontCtx.module.exports.extractFonts('controlled.mkv','ffmpeg','ffprobe')});
 fs.writeFileSync(path.join(__dirname,'deep815-integrations.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2));
}main().catch(e=>{console.error(e);process.exitCode=1});
