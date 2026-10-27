'use strict';
// Independent implementation of public metadata import; Spotify audio is never extracted.
const {readLimitedBytes}=require('./catalog-discovery');
const {randomUUID}=require('node:crypto');
const ID=/^[A-Za-z0-9]{22}$/;
function address(raw){
 const u=new URL(String(raw).trim());
 const m=u.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/);
 if(u.protocol!=='https:'||u.hostname!=='open.spotify.com'||u.port||u.username||u.password||!m)throw Error('Use a Spotify track, album or playlist link / Spotify parça, albüm veya liste bağlantısı kullan.');
 return {type:m[1],id:m[2],url:`https://open.spotify.com/${m[1]}/${m[2]}`};
}
function parse(html,source){
 const script=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].find(m=>/\bid\s*=\s*["']__NEXT_DATA__["']/i.test(m[1]));
 if(!script)throw Error('Spotify metadata unavailable; the link may be private / Spotify bilgileri okunamadı; bağlantı gizli olabilir.');
 const entity=JSON.parse(script[2])?.props?.pageProps?.state?.data?.entity;
 if(!entity||typeof entity.name!=='string')throw Error('Spotify metadata format changed / Spotify bilgi biçimi değişti.');
 const entries=source.type==='track'?[entity]:entity.trackList;
 if(!Array.isArray(entries)||!entries.length)throw Error('No readable tracks / Okunabilir parça bulunamadı.');
 const tracks=entries.slice(0,100).flatMap((e,index)=>{
  const id=String(e.uri||'').match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1]||(source.type==='track'?source.id:'');
  const title=e.title||e.name;if(!ID.test(id)||typeof title!=='string'||!title.trim())return [];
  const duration=Number(e.duration)/1000;
  return [{index,spotifyId:id,title:title.trim().slice(0,300),artist:(typeof e.subtitle==='string'?e.subtitle:(e.artists||[]).map(a=>a.name).join(', ')).replace(/\u00a0/g,' ').slice(0,300),duration:Number.isFinite(duration)&&duration>0&&duration<86400?duration:0,spotifyUrl:`https://open.spotify.com/track/${id}`}];
 });
 if(!tracks.length)throw Error('No usable tracks / Kullanılabilir parça bulunamadı.');
 return {...source,name:entity.name.slice(0,300),tracks,read:tracks.length,limited:source.type!=='track'};
}
function video(row){
 const id=String(row.id||'');if(!/^[A-Za-z0-9_-]{11}$/.test(id)||typeof row.title!=='string'||(row.is_live||row.live_status==='is_live'))return null;
 return {id,url:'https://www.youtube.com/watch?v='+id,title:row.title.slice(0,300),artist:String(row.channel||row.uploader||'').slice(0,300),duration:Number(row.duration)||0};
}
function create({fetchImpl=fetch,run,python}){
 const drafts=new Map();let controller=null;
 async function exclusive(fn){if(controller)throw Error('A Spotify operation is running / Bir Spotify işlemi sürüyor.');const c=new AbortController();controller=c;try{return await fn(c.signal);}finally{if(controller===c)controller=null;}}
 async function read(raw,owner){return exclusive(async signal=>{
  const source=address(raw),timeout=AbortSignal.timeout(20000),combined=AbortSignal.any([signal,timeout]);
  const response=await fetchImpl(`https://open.spotify.com/embed/${source.type}/${source.id}`,{redirect:'error',signal:combined,headers:{Accept:'text/html'}});
  if(!response.ok)throw Error('Spotify HTTP '+response.status);
  const data=parse((await readLimitedBytes(response,3000000,'Spotify')).toString('utf8'),source);
  const token=randomUUID();drafts.set(token,{...data,owner,at:Date.now(),matches:new Map()});for(const [key,d] of drafts)if(d.at<Date.now()-3600000||drafts.size>8)drafts.delete(key);
  return {token,...data};
 });}
 function draft(token,owner){const d=drafts.get(token);if(!d||d.owner!==owner||d.at<Date.now()-3600000)throw Error('Import expired; read the link again / İçe aktarım süresi doldu; bağlantıyı yeniden oku.');return d;}
 async function match(token,index,owner){return exclusive(async signal=>{
  const d=draft(token,owner),track=d.tracks.find(t=>t.index===index);if(!track)throw Error('Unknown Spotify track');
  const query=[track.artist,track.title,'audio'].join(' ').slice(0,650);
  const data=JSON.parse(await run(python(),['-m','yt_dlp','--ignore-config','--flat-playlist','--dump-single-json','--no-warnings','--socket-timeout','15','--retries','1','--','ytsearch3:'+query],null,signal,60000));
  const hits=(data.entries||[]).map(video).filter(Boolean).sort((a,b)=>track.duration?Math.abs(a.duration-track.duration)-Math.abs(b.duration-track.duration):0);
  d.matches.set(index,hits);return {index,hits};
 });}
 function selection(token,choices,owner){
  const d=draft(token,owner);if(!Array.isArray(choices)||!choices.length||choices.length>100)throw Error('Select matched tracks');
  const seen=new Set();const tracks=choices.map(c=>{if(!Number.isInteger(c.index)||seen.has(c.index))throw Error('Duplicate track selection');seen.add(c.index);const track=d.tracks.find(t=>t.index===c.index),hit=d.matches.get(c.index)?.find(h=>h.id===c.videoId);if(!track||!hit)throw Error('Review a current YouTube match first');return {...track,id:randomUUID(),youtubeUrl:hit.url,youtubeTitle:hit.title,youtubeDuration:hit.duration};}).sort((a,b)=>a.index-b.index);
  return {name:d.name,sourceUrl:d.url,tracks};
 }
 async function stream(url){return exclusive(async signal=>{
  if(!/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(url))throw Error('Invalid saved YouTube link');
  const d=JSON.parse(await run(python(),['-m','yt_dlp','--ignore-config','--no-playlist','--dump-single-json','--no-warnings','--socket-timeout','15','--retries','1','-f','bestaudio/best','--',url],null,signal,60000));
  const u=new URL(d.url);if(u.protocol!=='https:'||!u.hostname.endsWith('.googlevideo.com')||u.username||u.password||u.port)throw Error('No compatible YouTube audio stream / Uyumlu YouTube ses akışı bulunamadı.');return {url:u.href};
 });}
 return {read,match,selection,stream,cancel:()=>controller?.abort(),forget:(token,owner)=>{if(owner!==undefined&&drafts.get(token)?.owner!==owner)return false;return drafts.delete(token);}};
}
module.exports={address,parse,video,create};
