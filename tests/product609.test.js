'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const tools=require('../src/scene-timing-tools'),{prepare,probe}=require('../src/media-compatibility');
test('safe timing proposals preserve text, never trim, stay inside interval and undo signature detects edits',()=>{
const cues=[{start:1.08,end:2,text:'İlk söz.'},{start:2.2,end:3,text:'İkinci söz.'},{start:3.2,end:4,text:'Son.'}],before=structuredClone(cues),p=tools.propose(cues,{shots:[1],lo:0,hi:3});assert.equal(p.cues[0].start,1);assert(p.cues[0].end>2);assert.equal(p.cues[2].end,4);assert.deepEqual(cues,before);for(let i=0;i<cues.length;i++){assert(p.cues[i].start<=cues[i].start);assert(p.cues[i].end>=cues[i].end);assert.equal(p.cues[i].text,cues[i].text);}assert.notEqual(p.base,tools.signature(p.cues));assert.equal(tools.propose(p.cues,{shots:[1],lo:0,hi:3}).changes.length,0);
assert.equal(tools.propose([{start:1,end:2,text:'a'},{start:1.9,end:3,text:'b'}],{shots:[.95]}).cues[0].end,2);
});
test('scene notes bounded and control-free',()=>{assert.equal(tools.context({summary:'a'.repeat(3000),terms:'\0x'}).summary.length,2000);assert.equal(tools.context({terms:'\0x'}).terms,'x');});
test('real H264/PCM remux, verified AAC cache, cancellation and source preservation',async()=>{
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product609-')),file=path.join(dir,'Türkçe örnek.mkv'),ffmpeg=process.platform==='win32'?'C:\\ffmpeg\\bin\\ffmpeg.exe':'ffmpeg',ffprobe=process.platform==='win32'?'C:\\ffmpeg\\bin\\ffprobe.exe':'ffprobe';
try{const g=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=160x90:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','pcm_s16le','-shortest',file],{encoding:'utf8'});assert.equal(g.status,0,g.stderr);const bytes=fs.readFileSync(file),options={directory:path.join(dir,'cache'),ffmpeg,ffprobe},r=await prepare(file,options);assert.equal(r.cached,false);const m=await probe(r.path,ffprobe);assert(m.streams.some(s=>s.codec_name==='aac'));assert.equal((await prepare(file,options)).cached,true);assert.deepEqual(bytes,fs.readFileSync(file));const c=new AbortController();c.abort();await assert.rejects(prepare(file,{...options,signal:c.signal}));assert(!fs.readdirSync(options.directory).some(n=>n.includes('partial')));
fs.writeFileSync(r.path,'bad');assert.equal((await prepare(file,options)).cached,false);
const other=path.join(dir,'other.avi'),u=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=160x90:d=1','-c:v','mpeg4',other],{encoding:'utf8'});assert.equal(u.status,0,u.stderr);await assert.rejects(prepare(other,options),/H.264/);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('timing endpoint comparison includes media offset, scale, distinct start/end shifts and no invented residual',()=>{
 const changes=[{before:{start:10,end:12},after:{start:9.9,end:12.1}},{before:{start:90,end:92},after:{start:90,end:92.2}}],before=JSON.stringify(changes);
 const effect=tools.effect(changes,time=>time+2);assert.equal(effect.start.before,12);assert.equal(effect.start.after,11.9);assert.equal(effect.end.before,94);assert.equal(effect.end.after,94.2);assert.equal(effect.count,2);
 const scaled=tools.effect(changes,time=>time*1.01+3);assert(Math.abs(scaled.start.delta+.101)<1e-8);assert(Math.abs(scaled.end.delta-.202)<1e-8);assert.equal(effect.residual,undefined);assert.equal(JSON.stringify(changes),before);
 assert.equal(tools.effect([]),null);assert.equal(tools.effect(changes,()=>NaN),null);
});

test('timing dialog previews media endpoints without changes; cancel and stale-source Apply never mutate',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<input id="timelineQcFps" value="24">',{runScripts:'outside-only'}),w=dom.window;let writes=0;
 try{
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const cues=[{start:1.08,end:2,text:'First'},{start:2.2,end:3,text:'Second'}];
 Object.assign(w,{SceneTimingTools:tools,player:{workspaceMode:'player',mediaKey:'A',cues,timeline:{analysis:{shots:[1]}}},$:(id)=>w.document.getElementById(id),interfaceChoice:(tr,en)=>en,sceneInterval:()=>({lo:0,hi:3}),subtitleSourceTime:t=>t,subtitleVideoTime:t=>t+2,currentGeneration:()=>1,staleGeneration:()=>false,timelinePushUndo:()=>writes++,timelineMarkDirty:()=>writes++,sceneStatus:message=>{throw Error(message);}});
 const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8');
 w.eval(source.slice(source.indexOf('function timingEffectCopy('),source.indexOf('function refreshBrowserSyncEffect(')));
 w.eval(source.slice(source.indexOf('function previewTimingChanges('),source.indexOf("$('timingPreview')?.addEventListener")));
 const before=JSON.stringify(cues);w.previewTimingChanges();assert.equal(JSON.stringify(cues),before);assert.equal(writes,0);assert.match(w.document.querySelector('.timing-effect-summary').textContent,/3.080 → 3.000/);assert.match(w.document.querySelector('.timing-effect-summary').textContent,/not measured/);
 w.document.querySelector('dialog footer button').click();assert.equal(w.document.querySelector('dialog'),null);assert.equal(writes,0);
 w.previewTimingChanges();cues[0].text='Changed';w.document.querySelector('dialog footer button:last-child').click();assert.equal(w.document.querySelector('dialog footer button:last-child').disabled,true);assert.equal(writes,0);assert.equal(cues[0].start,1.08);
 }finally{w.close();}
});
