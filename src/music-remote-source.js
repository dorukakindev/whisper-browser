'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function create(options){
 const folders=new Set();let active=null;
 async function prepare(request,online){
  if(active)throw Error('A source is being prepared / Bir kaynak hazırlanıyor.');if(folders.size>=8)throw Error('Close music analysis to release temporary sources / Geçici kaynakları temizlemek için müzik analizini kapat.');
  const controller=new AbortController(),runner=options.run||require('./browser-media-tools').run;active=controller;let folder;
  try{
   folder=await fs.promises.mkdtemp(path.join(os.tmpdir(),'whisper-music-source-'));let file,metadata,seconds;
   if(request.kind==='deezer'){
    const row=online.snapshot([request.id])[0],result=await online.samples([row],folder,controller.signal,()=>{});file=result.tracks[0].path;metadata={title:row.title,artist:row.artist,origin:'deezer-preview'};seconds=30;
   }else if(request.kind==='spotify'){
    const shelf=path.join(options.userData(),'media-shelf.json');if(fs.statSync(shelf).size>16000000)throw Error('Library too large');const row=JSON.parse(fs.readFileSync(shelf,'utf8')).linkedPlaylists?.find(p=>p.id===request.playlistId)?.tracks.find(t=>t.id===request.id);if(!row)throw Error('Imported track missing / Aktarılan parça bulunamadı.');
    const engine=require('./spotify-import').create({run:runner,python:options.python});const abort=()=>engine.cancel();controller.signal.addEventListener('abort',abort,{once:true});let stream;try{controller.signal.throwIfAborted();stream=await engine.stream(row.youtubeUrl);}finally{controller.signal.removeEventListener('abort',abort);}controller.signal.throwIfAborted();
    file=stream.url;metadata={title:row.title,artist:row.artist,origin:'spotify-youtube-excerpt'};seconds=90;
   }else throw Error('Invalid remote music source');
   controller.signal.throwIfAborted();const wav=path.join(folder,'reference.wav');await runner(options.ffmpeg(),['-v','error','-nostdin','-protocol_whitelist',request.kind==='spotify'?'https,tls,tcp,crypto':'file,pipe',...(request.kind==='spotify'?['-rw_timeout','15000000']:[]),'-i',file,'-t',String(seconds),'-vn','-ac','1','-ar','48000','-c:a','pcm_s16le',wav],null,controller.signal,90000,null,{waitForCloseOnCancel:true});controller.signal.throwIfAborted();if(request.kind!=='spotify')await fs.promises.unlink(file);folders.add(folder);return {file:wav,metadata:{...metadata,excerptSeconds:seconds}};
  }catch(error){if(folder)await fs.promises.rm(folder,{recursive:true,force:true});throw error;}finally{if(active===controller)active=null;}
 }
 async function release(){active?.abort();const old=[...folders];old.forEach(f=>folders.delete(f));await Promise.all(old.map(f=>fs.promises.rm(f,{recursive:true,force:true})));}
 return {prepare,release,cancel:()=>active?.abort()};
}
module.exports={create};
