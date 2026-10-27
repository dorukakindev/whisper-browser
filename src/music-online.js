'use strict';
// Provider separation / explicit identity selection inspired by musicmeta (Apache-2.0).
// Independently implemented for Electron; no upstream source copied.
const fs=require('node:fs'),path=require('node:path');
const {readLimitedBytes}=require('./catalog-discovery');
const {atomicWriteFileSync}=require('./fsync-utils');
function safeUrl(value,kind){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return '';if(kind==='preview'&&!/^(?:cdnt-preview|cdn-preview-[a-z0-9-]+)\.dzcdn\.net$/i.test(u.hostname))return '';if(kind==='art'&&u.hostname!=='cdn-images.dzcdn.net')return '';if(kind==='link'&&(!['www.deezer.com','deezer.com'].includes(u.hostname)||!/^\/(?:[a-z]{2}\/)?track\/\d+$/.test(u.pathname)))return '';return u.href;}catch{return '';}}
function track(row){if(!Number.isSafeInteger(row?.id)||row.id<=0||!Number.isSafeInteger(row.artist?.id)||typeof row.title!=='string')return null;const url=safeUrl(row.link,'link');if(!url)return null;return {id:String(row.id),title:row.title.slice(0,300),artist:String(row.artist.name||'').slice(0,200),artistId:row.artist.id,duration:Number(row.duration)||0,url,art:safeUrl(row.album?.cover_medium,'art'),evidence:'catalog',provider:'Deezer'};}
function createOnline({userData,fetchImpl=fetch}){
 const known=new Map();let active=null,lastAt=0;
 const file=()=>path.join(userData(),'music-discovery-list.json');
 function load(){if(!fs.existsSync(file()))return [];if(fs.statSync(file()).size>1_000_000)throw Error('Discovery list is too large / Keşif listesi çok büyük.');const rows=JSON.parse(fs.readFileSync(file(),'utf8'));if(!Array.isArray(rows))throw Error('Invalid discovery list');return rows.filter(r=>/^\d+$/.test(r.id)&&Number.isSafeInteger(r.artistId)&&r.artistId>0&&safeUrl(r.url,'link')).slice(0,500).map(r=>({id:r.id,title:String(r.title||'').slice(0,300),artist:String(r.artist||'').slice(0,200),artistId:r.artistId,url:safeUrl(r.url,'link'),art:safeUrl(r.art,'art'),evidence:'catalog',provider:'Deezer'}));}
 async function request(route,signal){
  const gap=300-(Date.now()-lastAt);if(gap>0)await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Cancelled'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},gap);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});lastAt=Date.now();
  const response=await fetchImpl('https://api.deezer.com/'+route,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Music catalog HTTP '+response.status);
  const data=JSON.parse((await readLimitedBytes(response,2_000_000)).toString('utf8'));
  if(data.error)throw Error(data.error.code===4?'Catalog quota reached; try later / Katalog kotası doldu; sonra dene.':'Music provider returned an error / Müzik sağlayıcısı hata döndürdü.');return data;
 }
 function remember(rows){for(const r of rows)known.set(r.id,r);while(known.size>1000)known.delete(known.keys().next().value);return rows;}
 // Snapshot identities before the asynchronous job starts. URLs are always refreshed
 // from the provider; neither renderer URLs nor signed URLs are persisted.
 function snapshot(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>8||new Set(ids).size!==ids.length)throw Error('Choose 1–8 current recordings / Güncel 1–8 kayıt seç.');
  return ids.map(id=>{const row=known.get(id);if(!row)throw Error('Catalog results changed; search again / Katalog sonuçları değişti; yeniden ara.');return {...row};});
 }
 async function samples(rows,directory,signal,progress){
  const tracks=[],failures=[];
  for(const [index,row] of rows.entries()){
   signal.throwIfAborted();progress({stage:'preview',completed:index,total:rows.length,title:row.title});
   try{
    const data=await request('track/'+row.id,signal),url=safeUrl(data.preview,'preview');
    if(!url||String(data.id)!==row.id)throw Error('Preview unavailable');
    const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])});
    if(!response.ok)throw Error('Preview HTTP '+response.status);
    let bytes;try{bytes=await readLimitedBytes(response,8_000_000,'Preview / Önizleme');}finally{await response.body?.cancel().catch(()=>{});}
    signal.throwIfAborted();if(bytes.length<100)throw Error('Empty preview');
    const file=path.join(directory,row.id+'.mp3');await fs.promises.writeFile(file,bytes,{flag:'wx'});
    tracks.push({...row,path:file});
   }catch(error){signal.throwIfAborted();failures.push({id:row.id,reason:'preview-unavailable'});}
  }
  if(!tracks.length)throw Error('No previews could be read. Catalog results are unchanged / Önizlemeler okunamadı. Katalog sonuçları değişmedi.');
  return {tracks,failures};
 }
 async function handle(input){
  if(!input||typeof input!=='object')throw Error('Invalid music request');
  if(input.op==='cancel'){active?.abort();return {ok:true};}
  if(input.op==='list')return {ok:true,results:remember(load())};
  if(input.op==='save'||input.op==='remove'){
   const row=known.get(input.id);if(!row)throw Error('Choose a current result / Güncel bir sonuç seç.');
   const rows=load().filter(r=>r.id!==row.id);if(input.op==='save')rows.unshift(row);if(rows.length>500)throw Error('Discovery list limit: 500');atomicWriteFileSync(file(),JSON.stringify(rows));return {ok:true};
  }
  if(active)throw Error('A catalog request is running / Bir katalog isteği çalışıyor.');
  const controller=new AbortController();active=controller;
  try{
   if(input.op==='search'){
    const q=String(input.query||'').trim();if(!q||q.length>200)throw Error('Enter a song and artist (up to 200 characters) / Şarkı ve sanatçı yaz (en fazla 200 karakter).');
    const data=await request('search?'+new URLSearchParams({q,limit:'12'}),controller.signal);
    return {ok:true,results:remember((data.data||[]).map(track).filter(Boolean)),kind:'identity'};
   }
   const seed=known.get(input.id);if(!seed)throw Error('Choose the exact recording first / Önce doğru kaydı seç.');
   if(input.op==='preview'){
    const data=await request('track/'+seed.id,controller.signal),url=safeUrl(data.preview,'preview');
    if(!url)throw Error('No playable preview is available / Oynatılabilir önizleme yok.');return {ok:true,url,source:seed.url};
   }
   if(input.op==='discover'){
    const radio=await request('artist/'+seed.artistId+'/radio?limit=30',controller.signal);
    let rows=(radio.data||[]).map(track).filter(Boolean).filter(r=>r.id!==seed.id&&(!input.excludeArtist||r.artistId!==seed.artistId));
    if(rows.length<5){
     const related=await request('artist/'+seed.artistId+'/related?limit=3',controller.signal);
     for(const artist of (related.data||[]).slice(0,3)){
      if(!Number.isSafeInteger(artist.id)||artist.id<=0||artist.id===seed.artistId)continue;
      const top=await request('artist/'+artist.id+'/top?limit=4',controller.signal);
      rows.push(...(top.data||[]).map(track).filter(Boolean).filter(r=>r.id!==seed.id&&(!input.excludeArtist||r.artistId!==seed.artistId)));
     }
    }
    const seen=new Set();rows=rows.filter(r=>!seen.has(r.id)&&seen.add(r.id));
    return {ok:true,results:remember(rows.slice(0,20)),kind:'recommendations',seed,method:'artist-radio-related'};
   }
   throw Error('Unknown catalog action');
  }finally{if(active===controller)active=null;}
 }
 function restoreRows(rows){
  return remember((Array.isArray(rows)?rows:[]).slice(0,20).filter(r=>r&&typeof r.id==='string'&&/^\d+$/.test(r.id)&&Number.isSafeInteger(r.artistId)&&r.artistId>0).map(r=>({id:r.id,title:String(r.title||'').slice(0,300),artist:String(r.artist||'').slice(0,200),artistId:r.artistId,url:'https://www.deezer.com/track/'+r.id,art:safeUrl(r.art,'art'),evidence:'catalog',provider:'Deezer'})));
 }
 return {handle,snapshot,samples,restoreRows,cancel:()=>active?.abort()};
}
module.exports={safeUrl,track,createOnline};
