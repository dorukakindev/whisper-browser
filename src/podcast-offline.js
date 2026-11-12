 'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto'),{safeTarget}=require('./workspace-safe-path'),session=require('./podcast-session');
const LIMIT=1024**3,MAX=512*1024**2,FILES=64;
function create({root,store,fetchAudio,publicPin,grantMedia,now=()=>Date.now(),freeBytes=folder=>{const s=fs.statfsSync(folder);return Number(s.bavail)*Number(s.bsize);}}){
 let busy=false;const retryAt=new Map();
 const dir=()=>safeTarget(root(),'podcast-audio/offline');
 const digest=async file=>{const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');};
 function inventory(){const folder=dir();let bytes=0,files=0,keptFiles=0;if(fs.existsSync(folder))for(const name of fs.readdirSync(folder)){const stat=fs.lstatSync(safeTarget(folder,name));if(stat.isFile()){bytes+=stat.size;files++;if(/^[a-f0-9]{64}-[a-f0-9]{64}\.[a-z0-9]+$/.test(name))keptFiles++;}}return {bytes,files,keptFiles,incompleteFiles:files-keptFiles,limit:LIMIT,fileLimit:FILES,personalFilesScanned:false};}
 async function open(entry){
  try{const version=session.sourceVersion(entry),binding=session.sourceBinding(entry),folder=dir();if(!fs.existsSync(folder))return {available:false};
   const names=fs.readdirSync(folder).filter(n=>n.startsWith(version+'-'+binding.sha256+'.'));
   if(names.length!==1)return {available:false};const file=safeTarget(folder,names[0]),before=fs.lstatSync(file);
   if(!before.isFile()||before.size!==binding.length||await digest(file)!==binding.sha256)return {available:false};const after=fs.lstatSync(file);
   if(before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||before.size!==after.size||version!==session.sourceVersion(store.entry(entry.id))||!grantMedia?.(file))return {available:false};
   return {available:true,path:file,sourceVersion:version,sourceBinding:binding,permanent:true};
  }catch{return {available:false};}
 }
 async function keep(id,version,signal,onProgress,resume=false){
  if(busy)throw Error('Offline copy already running / Çevrimdışı kopyalama sürüyor.');busy=true;let temporary;
  try{const retryKey=id+':'+version;if((retryAt.get(retryKey)||0)>now())throw Error('Retry-After: '+Math.ceil((retryAt.get(retryKey)-now())/1000)+' s / Sunucunun bekleme süresi dolmadı.');const entry=store.entry(id);if(entry.kind!=='podcast'||session.sourceVersion(entry)!==version)throw Error('Podcast source changed / Podcast kaynağı değişti.');const existing=await open(entry);if(existing.available)return {...existing,reused:true};
   const audio=entry.enclosures.find(e=>/^audio\//.test(e.type));if(!audio)throw Error('No public audio / Genel ses kaynağı yok.');const folder=dir();fs.mkdirSync(folder,{recursive:true});const quota=inventory(),ownPart=safeTarget(folder,version+'.partial'),ownMeta=ownPart+'.resume.json',ownBytes=fs.existsSync(ownPart)?fs.lstatSync(ownPart).size:0,ownFiles=(fs.existsSync(ownPart)?1:0)+(fs.existsSync(ownMeta)?1:0);
   if(quota.files-ownFiles>=FILES||LIMIT-quota.bytes+ownBytes<MAX||freeBytes(folder)+ownBytes<MAX)throw Error('Offline quota or free space insufficient; reserve 512 MB / Kota veya boş alan yetersiz; 512 MB ayırın.');
   temporary=safeTarget(folder,version+'.partial');let evidence;try{evidence=await fetchAudio(audio.url,temporary,{signal,publicPin,maxBytes:MAX,onProgress,resume,retainPartial:true});retryAt.delete(retryKey);}catch(error){if(error.status===429){const raw=String(error.retryAfter||''),wait=/^\d+$/.test(raw)?Number(raw)*1000:Date.parse(raw)-now();if(Number.isFinite(wait)&&wait>0){retryAt.set(retryKey,now()+wait);while(retryAt.size>64)retryAt.delete(retryAt.keys().next().value);}}throw error;}signal.throwIfAborted();
   const stat=fs.lstatSync(temporary);if(!stat.isFile()||stat.size!==evidence.bytes||stat.size>MAX||await digest(temporary)!==evidence.sha256)throw Error('Offline bytes failed verification / Kopya doğrulanamadı.');
   if(session.sourceVersion(store.entry(id))!==version)throw Error('Podcast source changed / Podcast kaynağı değişti.');
   signal.throwIfAborted();const pins=store.sourcePins();if(pins.length>=1000&&!pins.includes(id))throw Error('Source pin capacity reached / Kaynak sabitleme sınırı doldu.');
   const evidenceRecord=session.audioEvidence(entry,evidence),predicted={...entry,podcastAudioEvidence:evidenceRecord,podcastSourceRevision:evidenceRecord.revision},predictedVersion=session.sourceVersion(predicted),name=predictedVersion+'-'+evidenceRecord.sha256+require('./podcast-audio').managedAudioExtension(evidence.mime,audio.url),target=safeTarget(folder,name);let linked=false;
   try{try{(()=>{try{fs.linkSync(temporary,target);}catch(e){if(['EPERM','ENOSYS','EXDEV','ENOTSUP','EMLINK'].includes(e.code))fs.copyFileSync(temporary,target,fs.constants.COPYFILE_EXCL);else throw e;}})();linked=true;}catch(error){if(error.code!=='EEXIST')throw error;if(await digest(target)!==evidenceRecord.sha256)throw Error('Existing offline copy changed; review storage / Mevcut kopya değişti; depolamayı incele.');}
    signal.throwIfAborted();if(session.sourceVersion(store.entry(id))!==version)throw Error('Podcast source changed / Podcast kaynağı değişti.');
    const verified=store.podcastAudioEvidence(id,version,evidence,{pin:true});return {kept:true,sourceVersion:verified.sourceVersion,copyBytes:stat.size,resumeState:evidence.resumeState||'fresh',...inventory()};
   }catch(error){if(linked)fs.rmSync(target,{force:true});throw error;}

  }finally{if(temporary&&!fs.existsSync(temporary+'.resume.json'))await fs.promises.rm(temporary,{force:true}).catch(()=>{});busy=false;}
 }
 return {keep,open,inventory};
}
module.exports={create};
