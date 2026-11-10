'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validVoiceOutput}=require('./voice-output');
const suffix={delivery:'-delivery.json',background:'-background.wav'};
function createSavedAssets(root){
 const file=(id,kind)=>{
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(id||'')||!Object.hasOwn(suffix,kind))throw Error('Invalid saved source / Geçersiz kayıtlı kaynak.');
  return path.join(root,id+suffix[kind]);
 };
 function inspect(target,kind){
  const stat=fs.lstatSync(target);
  if(!stat.isFile()||fs.realpathSync(target)!==path.resolve(target))throw Error('Saved source changed / Kayıtlı kaynak değişti.');
  if(kind==='delivery'){
   if(stat.size>2000000||!Array.isArray(JSON.parse(fs.readFileSync(target,'utf8')).groups))throw Error('Invalid saved delivery / Geçersiz kayıtlı anlatım.');
  }else if(!validVoiceOutput(target))throw Error('Invalid saved background / Geçersiz kayıtlı arka plan.');
  const hash=crypto.createHash('sha256'),fd=fs.openSync(target,'r'),buffer=Buffer.allocUnsafe(65536);
  try{let count;while((count=fs.readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,count));}
  finally{fs.closeSync(fd);}
  return {sha256:hash.digest('hex'),size:stat.size};
 }
 function capture(id,kind){return inspect(file(id,kind),kind);}
 function restore(summary){
  const assets={};
  for(const kind of Object.keys(suffix)){
   const receipt=summary.savedAssets?.[kind];
   const required=kind==='delivery'?(summary.pinned?.deliveryAutomatic||summary.pinned?.followDelivery):!!summary.background;
   if(!receipt){if(required)throw Error('Saved source cannot be verified; reopen the original source / Kayıtlı kaynak doğrulanamıyor; özgün kaynağı yeniden açın.');continue;}
   const actual=capture(summary.id,kind);
   if(actual.sha256!==receipt.sha256||actual.size!==receipt.size)throw Error('Saved source changed / Kayıtlı kaynak değişti.');
   assets[kind]={id:summary.id,kind,...actual};
  }
  return assets;
 }
 function copy(asset,id){
  const actual=capture(asset.id,asset.kind);
  if(actual.sha256!==asset.sha256||actual.size!==asset.size)throw Error('Saved source changed / Kayıtlı kaynak değişti.');
  const target=file(id,asset.kind);
  fs.copyFileSync(file(asset.id,asset.kind),target,fs.constants.COPYFILE_EXCL);
  const copied=capture(id,asset.kind);
  if(copied.sha256!==asset.sha256||copied.size!==asset.size)throw Error('Saved source changed during copying / Kopyalama sırasında kayıtlı kaynak değişti.');
  return target;
 }
 return {capture,restore,copy};
}
module.exports={createSavedAssets};
