'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const C=require('./personal-collection'),{cover}=require('./collection-metadata'),{readLimitedBytes}=require('./catalog-discovery'),{atomicWriteFileSync}=require('./fsync-utils');
const hash=v=>createHash('sha256').update(v).digest('hex'),MAX_IMAGE=1400*1024,MAX_TOTAL=64*1024*1024;
function raster(bytes){
 let mime='',w=0,h=0;
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){mime='image/png';w=bytes.readUInt32BE(16);h=bytes.readUInt32BE(20);}
 else if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
  mime='image/webp';const kind=bytes.toString('ascii',12,16);
  if(kind==='VP8X'){w=1+bytes.readUIntLE(24,3);h=1+bytes.readUIntLE(27,3);}else if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){w=bytes.readUInt16LE(26)&16383;h=bytes.readUInt16LE(28)&16383;}else if(kind==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);w=1+(bits&16383);h=1+((bits>>>14)&16383);}
 }else if(bytes.length>4&&bytes[0]===255&&bytes[1]===216){
  mime='image/jpeg';let i=2;while(i+8<bytes.length){if(bytes[i++]!==255)break;let marker=bytes[i++];while(marker===255&&i<bytes.length)marker=bytes[i++];if(marker===217||marker===218)break;const length=bytes.readUInt16BE(i);if(length<2||i+length>bytes.length)break;if([192,193,194].includes(marker)){h=bytes.readUInt16BE(i+3);w=bytes.readUInt16BE(i+5);break;}i+=length;}
 }
 if(!mime||!w||!h||w>8192||h>8192||w*h>20000000)throw Error('Unsupported or oversized raster cover. / Desteklenmeyen veya çok büyük kapak görseli.');return mime;
}
function create({root,fetchImpl=fetch,nativeImage,now=Date.now,maxBytes=MAX_TOTAL}={}){
 const directory=()=>path.join(typeof root==='function'?root():root,'collection-cover-cache'),profile=()=>typeof root==='function'?root():root;let busy=false;
 function owned(name){if(!/^(index\.json|[a-f0-9]{64}\.bin)$/.test(name))throw Error('Invalid cache identity. / Geçersiz önbellek kimliği.');const dir=path.resolve(directory());if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('Cache directory is linked. / Önbellek dizini bağlantı içeriyor.');const file=path.join(dir,name);if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Cache file is linked. / Önbellek dosyası bağlantı içeriyor.');return file;}
 function read(){const file=owned('index.json');if(!fs.existsSync(file))return {version:1,entries:[]};if(fs.statSync(file).size>1000000)throw Error('Cover index limit. / Kapak indeksi sınırı.');const d=JSON.parse(fs.readFileSync(file,'utf8'));if(d.version!==1||!Array.isArray(d.entries)||d.entries.length>2000||new Set(d.entries.map(e=>e.key)).size!==d.entries.length||d.entries.some(e=>!cover(e.source)||e.key!==hash(e.source)||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>MAX_IMAGE||!/^[a-f0-9]{64}$/.test(e.digest||'')))throw Error('Cover index invalid; preserved. / Kapak indeksi bozuk; korundu.');return d;}
 function source(id){const row=C.read(profile()).rows.find(r=>r.id===id);const url=row&&(!row.recordState||row.recordState==='active')&&['anime','manga'].includes(row.domain)&&cover(row.metadata?.cover);if(!url||row.metadata?.domain&&row.metadata.domain!==row.domain||row.metadata?.malId&&row.providerId&&row.metadata.malId!==row.providerId)throw Error('Choose a saved Anime/Manga cover. / Kayıtlı Anime/Manga kapağı seç.');return {url,row};}
 const revision=d=>C.hash(d);
 function available(entry){try{const file=owned(entry.key+'.bin'),stat=fs.statSync(file);if(!stat.isFile()||stat.size!==entry.bytes||stat.size>MAX_IMAGE)return false;const bytes=fs.readFileSync(file);return hash(bytes)===entry.digest&&!!raster(bytes);}catch{return false;}}
 function status(){const d=read();return {revision:revision(d),maxBytes,bytes:d.entries.reduce((n,e)=>n+e.bytes,0),entries:d.entries.map(e=>({...e,available:available(e)}))};}
 function image(id){const row=C.read(profile()).rows.find(r=>r.id===id);if(row&&!['anime','manga'].includes(row.domain))return '';const {url}=source(id),d=read(),entry=d.entries.find(e=>e.key===hash(url));if(!entry)return '';try{const file=owned(entry.key+'.bin'),stat=fs.statSync(file);if(!stat.isFile()||stat.size!==entry.bytes||stat.size>MAX_IMAGE)return '';const bytes=fs.readFileSync(file),mime=raster(bytes);if(hash(bytes)!==entry.digest)return '';return `data:${mime};base64,${bytes.toString('base64')}`;}catch{return '';}}
 async function put(ids){
  if(busy)throw Error('Cover operation in progress. / Kapak işlemi sürüyor.');if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length)throw Error('Choose 1–20 distinct covers. / Farklı 1–20 kapak seç.');const selected=ids.map(id=>({id,...source(id)}));let added=0,present=0,failed=0;busy=true;
  try{for(const {id,url}of selected){let created=false;const key=hash(url),file=owned(key+'.bin');try{
   let d=read();if(d.entries.some(e=>e.key===key)&&image(id)){present++;continue;}
   const response=await fetchImpl(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Cover unavailable.');const bytes=await readLimitedBytes(response,MAX_IMAGE,'Cover'),mime=raster(bytes);if(nativeImage){const decoded=nativeImage.createFromBuffer(bytes);if(decoded.isEmpty()&&mime!=='image/webp')throw Error('Cover decode failed.');}if(source(id).url!==url)throw Error('Cover changed during download.');d=read();const old=d.entries.find(e=>e.key===key);if(d.entries.reduce((n,e)=>n+e.bytes,0)-(old?.bytes||0)+bytes.length>maxBytes||!old&&d.entries.length>=2000)throw Error('Cache full.');
   fs.mkdirSync(directory(),{recursive:true});created=!fs.existsSync(file);atomicWriteFileSync(file,bytes);d.entries=[...d.entries.filter(e=>e.key!==key),{key,source:url,bytes:bytes.length,digest:hash(bytes),mime,at:now()}];atomicWriteFileSync(owned('index.json'),JSON.stringify(d));added++;
  }catch{failed++;if(created&&fs.existsSync(file))fs.unlinkSync(file);}}return {added,present,failed,...status()};}finally{busy=false;}
 }
 function removePreview(keys){const d=read();if(!Array.isArray(keys)||!keys.length||keys.length>2000||new Set(keys).size!==keys.length||keys.some(k=>!d.entries.some(e=>e.key===k)))throw Error('Choose cached covers. / Önbellekteki kapakları seç.');return {revision:revision(d),keys,bytes:d.entries.filter(e=>keys.includes(e.key)).reduce((n,e)=>n+e.bytes,0),count:keys.length};}
 function remove(plan){if(busy)throw Error('Cover operation in progress. / Kapak işlemi sürüyor.');const d=read();if(revision(d)!==plan.revision)throw Error('Cache changed; preview again. / Önbellek değişti; yeniden önizle.');for(const key of plan.keys)owned(key+'.bin');let removed=0;const failed=new Set();for(const key of plan.keys){try{const file=owned(key+'.bin');if(fs.existsSync(file))fs.unlinkSync(file);removed++;}catch{failed.add(key);}}d.entries=d.entries.filter(e=>!plan.keys.includes(e.key)||failed.has(e.key));atomicWriteFileSync(owned('index.json'),JSON.stringify(d));return {removed,failed:failed.size,...status()};}
 return {status,image,put,removePreview,remove};
}
module.exports={create,raster,MAX_IMAGE,MAX_TOTAL};
