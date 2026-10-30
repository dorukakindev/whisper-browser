'use strict';
const {registerQuitCleanup}=require('./quit-cleanup');
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto'),{processOutput}=require('./browser-reference-media');
async function probe(file,ffprobe,signal){const raw=await processOutput(ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type,codec_name','-of','json',file],{signal,timeout:20000});return JSON.parse(raw.toString('utf8'));}
async function prepare(file,{directory,ffmpeg,ffprobe,signal}={}){
 const before=fs.statSync(file),identity=JSON.stringify([file,before.size,before.mtimeMs,'h264-copy-aac-v1']);
 const meta=await probe(file,ffprobe,signal),video=meta.streams?.find(s=>s.codec_type==='video'),audio=meta.streams?.find(s=>s.codec_type==='audio'),duration=Number(meta.format?.duration);
 if(!video||video.codec_name!=='h264')throw Error('Video codec requires a different player; this repair copies H.264 video only. / Bu onarım yalnız H.264 videoyu kopyalar; farklı oynatıcı gerekir.');
 if(!Number.isFinite(duration)||duration<=0||duration>21600)throw Error('Unsupported duration / Desteklenmeyen süre.');
 fs.mkdirSync(directory,{recursive:true});const name=createHash('sha256').update(identity).digest('hex'),output=path.join(directory,name+'.mp4');
 async function valid(p){try{const v=await probe(p,ffprobe,signal);return v.streams?.some(s=>s.codec_type==='video'&&s.codec_name==='h264')&&(!audio||v.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'))&&Math.abs(Number(v.format?.duration)-duration)<2;}catch(e){if(signal?.aborted)throw e;return false;}}
 if(fs.existsSync(output)&&await valid(output)){const after=fs.statSync(file);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('Source changed / Kaynak değişti.');return{path:output,cached:true,duration};}
 const estimate=before.size+Math.ceil(duration*40000),limit=4*1024**3;
 const used=fs.readdirSync(directory).filter(n=>/^[a-f0-9]{64}\.mp4$/.test(n)).reduce((sum,n)=>sum+fs.statSync(path.join(directory,n)).size,0);
 const free=fs.statfsSync(directory);if(estimate>limit||used+estimate>limit||Number(free.bavail)*Number(free.bsize)<estimate+256*1024**2)throw Error('Not enough repair cache space (4 GB limit). / Onarım alanı yetersiz (4 GB sınırı).');
 const partial=path.join(directory,name+'.'+randomUUID()+'.partial.mp4');
 try{await processOutput(ffmpeg,['-nostdin','-v','error','-i',file,'-map','0:v:0','-map','0:a:0?','-c:v','copy','-c:a','aac','-b:a','192k','-sn','-dn','-movflags','+faststart','-n',partial],{signal,timeout:15*60*1000,consumeStderr:()=>{if(fs.existsSync(partial)&&fs.statSync(partial).size>limit)throw Error('Repair output limit / Onarım çıktı sınırı.');}});
 if(signal?.aborted)throw Error('Cancelled / İptal edildi.');const after=fs.statSync(file);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('Source changed / Kaynak değişti.');if(!await valid(partial))throw Error('Prepared file failed verification / Hazırlanan dosya doğrulanamadı.');
 fs.renameSync(partial,output);return{path:output,cached:false,duration};
 }finally{try{fs.unlinkSync(partial);}catch{}}
}
function register({app,ipcMain,authorized,authorize,grant,ffmpeg,ffprobe}){
 const jobs=new Map();
 ipcMain.handle('media:prepareCompatible',async(event,file)=>{if(!authorized(event))return{ok:false,error:'Unauthorized'};if(jobs.has(event.sender.id))return{ok:false,error:'Already running / Zaten çalışıyor.'};const controller=new AbortController(),sender=event.sender,onDestroyed=()=>controller.abort();jobs.set(sender.id,controller);sender.once('destroyed',onDestroyed);
 try{const source=authorize(file),result=await prepare(source,{directory:path.join(app.getPath('userData'),'cache','media-compatibility'),ffmpeg:ffmpeg(),ffprobe:ffprobe(),signal:controller.signal});if(controller.signal.aborted)throw Error('Cancelled / İptal edildi.');grant(result.path);return{ok:true,...result};}catch(error){return{ok:false,error:error.message};}finally{sender.removeListener('destroyed',onDestroyed);if(jobs.get(sender.id)===controller)jobs.delete(sender.id);}});
 ipcMain.handle('media:cancelCompatible',event=>{if(!authorized(event))return{ok:false};jobs.get(event.sender.id)?.abort();return{ok:true};});registerQuitCleanup(app,()=>{for(const c of jobs.values())c.abort();});
}
module.exports={probe,prepare,register};
