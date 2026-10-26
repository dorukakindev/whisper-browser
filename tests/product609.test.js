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
