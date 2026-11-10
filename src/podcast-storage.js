'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{safeTarget}=require('./workspace-safe-path');
function inventory({root,entries=[],managed=[]}){
 const exactOwners=new Map(),textOwners=new Map();
 const add=(map,key,value)=>{if(!key)return;const rows=map.get(key)||[];if(rows.length<8)rows.push(value);map.set(key,rows);};
 for(const e of entries){const version=require('./podcast-session').sourceVersion(e),owner={entryId:e.id,title:e.title};add(textOwners,version,owner);for(const w of [e.podcastWorkspace,e.podcastWorkspace?.previous])if(w?.transcript?.timeline?.file)add(exactOwners,w.transcript.timeline.file,{...owner,current:w.sourceVersion===version});}
 const groups=Object.fromEntries(['preparation','exactAudio','textCopies'].map(k=>[k,{files:0,bytes:0}])),rows=[];let totalFiles=0,totalBytes=0,partial=false,skippedLinks=0,examined=0;
 for(const [kind,relative]of [['preparation','podcast-audio'],['exactAudio','podcast-audio/transcript-cache'],['textCopies','podcast-transcripts']]){
  try{const folder=safeTarget(root,relative);if(!fs.existsSync(folder))continue;for(const name of fs.readdirSync(folder).sort()){
   if(++examined>2000){partial=true;break;}const file=path.join(folder,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink()){skippedLinks++;continue;}if(!stat.isFile())continue;
   const active=managed.find(m=>path.resolve(m.file)===path.resolve(file)),owners=(kind==='exactAudio'?exactOwners.get(name):kind==='textCopies'?textOwners.get(/^([a-f0-9]{64})/.exec(name)?.[1]):null)||[];
   groups[kind].files++;groups[kind].bytes+=stat.size;totalFiles++;totalBytes+=stat.size;
   if(rows.length<200)rows.push({id:createHash('sha256').update(kind+':'+name).digest('hex').slice(0,24),kind,bytes:stat.size,active:!!active,entryId:active?.entryId||null,owners,state:kind==='preparation'?(active?'active':'leftover'):owners.length?'associated':'unassociated',verification:'not-rehashed'});
  }}catch(error){if(error.code!=='ENOENT')partial=true;}
 }
 return {groups,rows,totalFiles,totalBytes,partial:partial||totalFiles>rows.length,skippedLinks,scanLimit:2000,displayLimit:200,exactAudioLimit:{bytes:1024**3,files:32},personalAudioScanned:false,automaticCleanup:false};
}
module.exports={inventory};
