'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../../../..'),out=process.env.AUDIT833_OUT?path.resolve(process.env.AUDIT833_OUT):path.join(root,'.uiprev/audit833-media-wave-'+Date.now());fs.mkdirSync(out,{recursive:true});
function revision(){if(process.env.AUDIT833_HEAD)return process.env.AUDIT833_HEAD;const h=fs.readFileSync(path.join(root,'.git/HEAD'),'utf8').trim();return h.startsWith('ref: ')?fs.readFileSync(path.join(root,'.git',h.slice(5)),'utf8').trim():h;}
const ffmpeg='C:/ffmpeg/bin/ffmpeg.exe',file=path.join(out,'Türkçe-source.mkv');
const generation=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=64x64:r=10:d=3','-f','lavfi','-i',"aevalsrc='if(between(t,0.8,1.2),0.5*sin(2*PI*440*t),0)':s=8000:d=3",'-map','0:v','-map','1:a','-c:v','ffv1','-c:a','pcm_s16le','-y',file],{encoding:'utf8',windowsHide:true});assert.equal(generation.status,0,generation.stderr);
const dom=new JSDOM('<body>'+['timelineAnalyze','timelineAnalyzeCancel','timelineAnalysisFrom','timelineAnalysisTo','timelineAnalysisTrack','timelineStatus','sceneStatus','timelineQcFps'].map(id=>['timelineAnalyze','timelineAnalyzeCancel'].includes(id)?`<button id="${id}"></button>`:`<input id="${id}">`).join('')+'</body>',{url:'https://fixture.invalid'});
const w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
const $=id=>w.document.getElementById(id);$('timelineAnalysisFrom').value='0';$('timelineAnalysisTo').value='3';$('timelineAnalysisTrack').value='0';$('timelineQcFps').value='24';
const player={localPath:file,mediaKey:'fixture-source',offset:0,cues:[{start:.9,end:1.1,text:'Test spoken interval'}],timeline:{waveform:[],waveformStart:0,waveformDuration:0}};
const {analyze}=require(path.join(root,'src/media-analysis'));let lastResult,undo=0,dirty=[];
const c=vm.createContext({window:{api:{analyzeMedia:async req=>{const r=await analyze(req.file,req,{ffmpeg});return lastResult={ok:true,...r};},cancelMediaAnalysis:async()=>({ok:true})}},document:w.document,$,player,interfaceChoice:(_tr,en)=>en,currentGeneration:()=>1,staleGeneration:g=>g!==1,drawTimeline:()=>{},renderTimelineIssues:()=>{},SceneTimingTools:require(path.join(root,'src/scene-timing-tools')),sceneInterval:()=>({lo:0,hi:3}),sceneStatus:m=>{$('sceneStatus').textContent=m;},subtitleSourceTime:t=>t,timelinePushUndo:()=>undo++,timelineMarkDirty:m=>dirty.push(m)});
const source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
function slice(a,b){const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i);return source.slice(i,j);}
c.player.workspaceMode='local';c.timelineRangeSeconds=()=>null;
vm.runInContext(slice('function subtitleSourceTime(','function subtitleVideoTime('),c);
vm.runInContext(slice('function sceneInterval(','function sceneNoteKey('),c);
// Use actual DOM listener registration and exact preview/apply callback.
vm.runInContext(slice("$('timelineAnalyze')?.addEventListener('click'",'function localizeIntegrationControls'),c);
vm.runInContext(slice('function previewTimingChanges(',"$('timingPreview')"),c);
async function clickAndWait(track){$('timelineAnalysisTrack').value=String(track);$('timelineAnalyze').click();for(let n=0;n<200&&$('timelineAnalyze').disabled;n++)await new Promise(r=>setTimeout(r,20));assert(!$('timelineAnalyze').disabled);return JSON.parse(JSON.stringify(lastResult));}
(async()=>{
 const first=await clickAndWait(0);assert(first.waveform&&first.waveform.points.length);const stored=player.timeline.waveform;
 const second=await clickAndWait(1);assert.equal(second.waveform,null);assert(second.warnings.length);assert.equal(player.timeline.analysis.track,1);assert.equal(player.timeline.waveform,stored);
 c.previewTimingChanges(true);let dialog=w.document.querySelector('dialog');assert(dialog,'old track waveform still produces actionable preview');const preview=dialog.textContent;dialog.querySelector('footer button:last-child').click();assert.equal(undo,1);assert.equal(dirty.length,1);assert(player.cues[0].start<.9&&player.cues[0].end>1.1);
 const after={...player.cues[0]};player.cues=[{start:.9,end:1.1,text:'Test spoken interval'}];player.timeline.waveform=[];player.timeline.waveformDuration=0;c.previewTimingChanges(true);assert(!w.document.querySelector('dialog'));
 const emptyControl=$('sceneStatus').textContent;
 // Re-use the known real track-0 waveform solely as a source-time conversion control.
 player.timeline.waveform=stored;player.timeline.waveformDuration=first.waveform.duration;player.offset=.1;
 player.cues=[{start:.8,end:1,text:'Offset control'}];c.previewTimingChanges(true);dialog=w.document.querySelector('dialog');assert(dialog);dialog.querySelector('footer button:last-child').click();
 const offsetControl={...player.cues[0]};assert(Math.abs(offsetControl.start-.7)<1e-9);assert(Math.abs(offsetControl.end-1.1)<1e-9);
 player.cues=[{start:.8,end:1,text:'Transform stale guard'}];c.previewTimingChanges(true);dialog=w.document.querySelector('dialog');assert(dialog);player.offset=.2;const apply=dialog.querySelector('footer button:last-child');apply.click();assert(apply.disabled);assert.equal(player.cues[0].start,.8);const staleGuard=dialog.textContent;dialog.close();
 const result={head:revision(),node:process.version,platform:process.platform,source:{audioTracks:1,duration:3},first:{track:first.track,points:first.waveform.points.length,duration:first.waveform.duration},second:{track:second.track,waveform:second.waveform,warnings:second.warnings,uiStatus:$('timelineStatus').textContent},oldWaveformRetained:true,preview,appliedAfterFailedAudioProbe:after,undo,dirty,clearedWaveformControl:emptyControl,offsetControl,staleTransformGuard:staleGuard,limits:'Real FFmpeg and original listener/sceneInterval/subtitleSourceTime/preview; jsdom UI, raw number-input allowed track index 1 of one-track file, no native window/speaker/GPU'};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,out,bug:'partial missing-track analysis retains old waveform and applies old-track timing',after},null,2));dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;dom.window.close();});
