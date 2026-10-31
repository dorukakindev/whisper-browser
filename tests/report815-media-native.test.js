'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {findMediaTool}=require('./media-runtime');
const ffmpeg=findMediaTool('ffmpeg'),ffprobe=findMediaTool('ffprobe');
function run(binary,args){const result=spawnSync(binary,args,{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(result.status,0,result.error?.message||result.stderr);return result.stdout;}
test('B16 native: WMV/WMA input successfully muxes to MP4 using production audio arguments',{skip:!ffmpeg||!ffprobe},t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r815-wmv-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const source=path.join(dir,'source.WMV'),output=path.join(dir,'output.mp4');run(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c=black:s=64x64:r=10:d=0.4','-f','lavfi','-i','sine=frequency=400:duration=0.4','-c:v','wmv2','-c:a','wmav2','-shortest',source]);run(ffmpeg,['-v','error','-y','-i',source,'-c:v','mpeg4',...require('../src/burnin-output').burninAudioArgs(source,output),output]);const probe=JSON.parse(run(ffprobe,['-v','error','-show_streams','-of','json',output]));assert.equal(probe.streams.find(s=>s.codec_type==='audio').codec_name,'aac');
});
const collection=process.platform==='win32'?path.join(process.env.WINDIR||'C:\\Windows','Fonts','cambria.ttc'):'';
test('B14 native: real MKV TTC attachment is extracted by the production font module',{skip:!ffmpeg||!ffprobe||!collection||!fs.existsSync(collection)},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r815-ttc-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const source=path.join(dir,'fixture.mkv');run(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c=black:s=64x64:r=10:d=0.2','-c:v','ffv1','-attach',collection,'-metadata:s:t','mimetype=application/x-truetype-font','-metadata:s:t','filename=collection.ttc',source]);const fonts=await require('../src/browser-fonts').extractFonts(source,ffmpeg,ffprobe);assert.equal(fonts.length,1);assert.equal(Buffer.from(fonts[0].base64,'base64').subarray(0,4).toString(),'ttcf');assert.equal(Buffer.from(fonts[0].base64,'base64').length,fs.statSync(collection).size);
});
