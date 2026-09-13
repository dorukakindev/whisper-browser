const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
(async()=>{
 const tab={id:'a',subtitleSelection:{primaryId:'',secondaryId:'',primaryFile:'old.srt',secondaryFile:'second.vtt'},subtitleSelectionRestored:false,restoreSubtitleMode:'both',subtitleSyncRecords:[]};
 const controls={playerSubSelect:{},playerSubSelect2:{}};
 const ctx={player:{workspaceMode:'browser',browserActiveTabId:'a',browserTracks:[],subPath:'',sub2Path:''},state:{pendingPlayerLoad:{}},currentGeneration:()=>1,staleGeneration:()=>false,browserTabState:()=>tab,$:id=>controls[id],addSubtitleOption(){},window:{api:{selectFile:async()=>'moved.srt'}},browserSyncTrack:()=>null,browserSubtitleSync:{hashText:x=>x},renderBrowserCueAt(){},scheduleBrowserOverlaySync(){},flushWatchState(){},updatePlayerTaskCenter(){},logLine(){},setSubtitleMode(mode){ctx.mode=mode;},saveActiveBrowserTabWorkspace(){if(tab.subtitleSelectionRestored)tab.subtitleSelection={primaryId:'',secondaryId:'',primaryFile:ctx.player.subPath,secondaryFile:ctx.player.sub2Path};}};
 ctx.loadSubtitle=async(file,secondary,options={})=>{if(!options.silent)tab.subtitleSelectionRestored=true;if(file==='old.srt')return;ctx.player[secondary?'sub2Path':'subPath']=file;};
 vm.createContext(ctx);vm.runInContext(extract('async function locateMissingSubtitle(','window.api.onEvent('),ctx);vm.runInContext(extract('async function restoreBrowserSubtitleSelection(','async function loadPersistedBrowserTranslation('),ctx);
 await ctx.restoreBrowserSubtitleSelection(tab);
 await ctx.locateMissingSubtitle('old.srt',false,'source');
 assert.equal(ctx.player.sub2Path,'second.vtt','Birinci dosya bulununca ikinci kayıtlı altyazı da geri yüklenmeli');
 assert.equal(ctx.mode,'both','Kurtarma çift dil tercihini korumalı');
 console.log('Çift dosya kurtarma: ikinci kanal ve görünüm korundu.');
})().catch(e=>{console.error(e);process.exitCode=1;});
