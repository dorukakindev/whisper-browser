'use strict';
const fs=require('node:fs'),path=require('node:path');
const VIDEO=/\.(?:mkv|mp4|webm|avi|mov|m4v|ts)$/i,SIDECAR=/\.(?:nfo|srt|vtt|ass|ssa|jpg|jpeg|png|webp)$/i;
const folded=value=>process.platform==='win32'?value.toLowerCase():value;
async function inventory(root){
 const absolute=path.resolve(root),stat=await fs.promises.lstat(absolute);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Choose an accessible physical library folder.');
 const real=await fs.promises.realpath(absolute),rows=[],warnings=[];let visited=0,incomplete=false;
 async function walk(folder,depth){
  if(depth>12){incomplete=true;warnings.push('Folder depth limit reached.');return;}
  let entries;try{entries=await fs.promises.readdir(folder,{withFileTypes:true});}catch(error){incomplete=true;warnings.push(path.relative(real,folder)+': '+error.code);return;}
  for(const entry of entries){if(++visited>10000){incomplete=true;return;}const file=path.join(folder,entry.name);let s;try{s=await fs.promises.lstat(file);}catch(error){incomplete=true;warnings.push(path.relative(real,file)+': '+error.code);continue;}
   if(s.isSymbolicLink())continue;
   const physical=await fs.promises.realpath(file).catch(()=>null);if(!physical){incomplete=true;continue;}const relative=path.relative(real,physical);if(relative.startsWith('..'+path.sep)||path.isAbsolute(relative))continue;
   if(s.isDirectory()){if(!['.git','node_modules','.codex'].includes(entry.name))await walk(file,depth+1);continue;}
   if(!s.isFile()||(!VIDEO.test(entry.name)&&!SIDECAR.test(entry.name)))continue;
   rows.push({relative:relative.split(path.sep).join('/'),size:s.size,mtimeMs:s.mtimeMs,kind:VIDEO.test(entry.name)?'video':'sidecar',unstable:Date.now()-s.mtimeMs<2000});
  }
 }
 await walk(real,0);rows.sort((a,b)=>a.relative.localeCompare(b.relative,'en',{numeric:true}));return {root:real,rows,warnings:[...new Set(warnings)].slice(0,30),incomplete};
}
function diff(previous,next){const old=new Map((previous||[]).map(row=>[folded(row.relative),row])),current=new Map(next.rows.map(row=>[folded(row.relative),row]));
 const added=next.rows.filter(row=>!old.has(folded(row.relative))),changed=next.rows.filter(row=>{const before=old.get(folded(row.relative));return before&&(before.size!==row.size||before.mtimeMs!==row.mtimeMs||before.relative!==row.relative);}),missing=next.incomplete?[]:(previous||[]).filter(row=>!current.has(folded(row.relative)));
 const possibleMoves=missing.flatMap(before=>added.filter(after=>after.size===before.size&&path.posix.basename(after.relative).toLowerCase()===path.posix.basename(before.relative).toLowerCase()).map(after=>({before:before.relative,after:after.relative,confidence:'candidate-only'}))).slice(0,100);
 return {added,changed,missing,possibleMoves,unstable:next.rows.filter(row=>row.unstable)};
}
function normalizeSnapshots(value){if(value===undefined)return [];if(!Array.isArray(value)||value.length>10)throw Error('Invalid library folder snapshots.');return value.map(snapshot=>{
 if(!snapshot||typeof snapshot.root!=='string'||!path.isAbsolute(snapshot.root)||!Array.isArray(snapshot.rows)||snapshot.rows.length>10000)throw Error('Invalid library folder snapshot.');
 return {root:snapshot.root.slice(0,2048),updatedAt:Number(snapshot.updatedAt)||0,rows:snapshot.rows.map(row=>{if(!row||typeof row.relative!=='string'||row.relative.length>2048||row.relative.split(/[\\/]/).includes('..')||path.isAbsolute(row.relative)||!Number.isFinite(row.size)||row.size<0||!Number.isFinite(row.mtimeMs)||!['video','sidecar'].includes(row.kind))throw Error('Invalid snapshot file.');return {relative:row.relative,size:row.size,mtimeMs:row.mtimeMs,kind:row.kind};})};});}
module.exports={inventory,diff,normalizeSnapshots};
