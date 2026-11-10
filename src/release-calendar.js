'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const C=require('./personal-collection'),{releaseOf}=require('./franchise-tracker'),{atomicWriteFileSync}=require('./fsync-utils');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=value=>typeof value==='string'?value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').slice(0,1000):'';
function localDay(event,timeZone='Europe/Istanbul') {
 if(event.date)return event.date;
 const parts=new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(event.at));
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
function normalize(raw,row,fetchedAt) {
 if(!raw||!Number.isSafeInteger(raw.id)||raw.id<1||String(raw.idMal)!==row.providerId||raw.type!==row.domain.toUpperCase())throw Error('Calendar identity changed. / Takvim kimliği değişti.');
 const title=text(raw.title?.romaji||raw.title?.english||row.title),source=`https://anilist.co/${row.domain}/${raw.id}`,premiere=releaseOf(raw.startDate),events=[];
 if(row.domain==='anime') {
  if(!Array.isArray(raw.airingSchedule?.nodes)||typeof raw.airingSchedule.pageInfo?.hasNextPage!=='boolean')throw Error('Incomplete schedule response. / Yayın takvimi yanıtı eksik.');
  for(const node of raw.airingSchedule.nodes) {
   if(node.mediaId!==raw.id||!Number.isSafeInteger(node.episode)||node.episode<1||!Number.isSafeInteger(node.airingAt)||node.airingAt<=0||node.airingAt>7258118400)throw Error('Invalid airing identity or time. / Geçersiz bölüm kimliği veya yayın zamanı.');
   events.push({id:`anilist:anime:${raw.id}:episode:${node.episode}`,kind:'episode',title,episode:node.episode,at:new Date(node.airingAt*1000).toISOString(),sourceTimeZone:'UTC',source,fetchedAt});
  }
 }
 if(premiere?.length===10)events.push({id:`anilist:${row.domain}:${raw.id}:premiere`,kind:'premiere',title,date:premiere,sourceTimeZone:null,source,fetchedAt});
 return {id:row.id,malId:row.providerId,title,domain:row.domain,providerId:raw.id,source,premiere,events:[...new Map(events.map(e=>[e.id,e])).values()],fetchedAt,truncated:raw.airingSchedule?.pageInfo?.hasNextPage===true};
}
const escapeText=value=>text(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function foldLine(line) {
 let result='',current='';for(const char of line){if(Buffer.byteLength(current+char)>75){result+=current+'\r\n';current=' ';}current+=char;}return result+current;
}
const utc=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))throw Error('Invalid calendar timestamp.');return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');};
function toIcs(events) {
 if(!Array.isArray(events)||!events.length||events.length>500)throw Error('Select 1–500 dated events. / Tarihli 1–500 yayın seç.');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Whisper Browser//Release Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const event of events) {
  if(typeof event.id!=='string'||!event.id)throw Error('Invalid event identity.');
  lines.push('BEGIN:VEVENT','UID:'+hash(event.id)+'@whisper-browser.local','DTSTAMP:'+utc(event.fetchedAt??0),'SEQUENCE:'+(event.sequence||0));
  if(event.at)lines.push('DTSTART:'+utc(event.at));
  else if(/^\d{4}-\d{2}-\d{2}$/.test(event.date||'')&&new Date(event.date+'T00:00:00Z').toISOString().slice(0,10)===event.date) {
   lines.push('DTSTART;VALUE=DATE:'+event.date.replace(/-/g,''),'DTEND;VALUE=DATE:'+new Date(Date.parse(event.date+'T00:00:00Z')+86400000).toISOString().slice(0,10).replace(/-/g,''));
  }else throw Error('Unknown or invalid release date. / Yayın tarihi bilinmiyor veya geçersiz.');
  lines.push('SUMMARY:'+escapeText(event.title+(event.episode?' · #'+event.episode:'')),'DESCRIPTION:'+escapeText('AniList · '+(event.sourceTimeZone||'Date only; time zone not supplied')+'\n'+(event.source||'')),'TRANSP:TRANSPARENT','END:VEVENT');
 }
 lines.push('END:VCALENDAR');return lines.map(foldLine).join('\r\n')+'\r\n';
}
function create({root,lookup,now=Date.now}) {
 const directory=()=>typeof root==='function'?root():root,file=()=>path.join(directory(),'release-calendar.json'),pending=new Set();
 function read(){if(!fs.existsSync(file()))return {version:1,calendars:[]};if(fs.statSync(file()).size>8000000)throw Error('Calendar cache exceeds 8 MB. / Takvim önbelleği 8 MB sınırını aşıyor.');const data=JSON.parse(fs.readFileSync(file(),'utf8'));if(data.version!==1||!Array.isArray(data.calendars)||data.calendars.length>1000)throw Error('Calendar cache invalid; preserved. / Takvim önbelleği bozuk; korundu.');return data;}
 function list(){const data=read(),rows=C.read(directory()).rows;const calendars=data.calendars.filter(c=>rows.some(r=>r.id===c.id&&r.domain===c.domain&&(c.malId?c.malId===r.providerId:r.id===`mal:${r.domain}:${r.providerId}`)));return {calendars,revision:hash(calendars)};}
 function source(id){const row=C.read(directory()).rows.find(r=>r.id===id);if(!row||!['anime','manga'].includes(row.domain)||!/^\d{1,10}$/.test(row.providerId||'')||Number(row.providerId)<1)throw Error('Choose a saved MAL identity. / Kayıtlı MAL kimliği seç.');return row;}
 async function refresh({id}={}) {
  const row=source(id);if(pending.has(id))throw Error('Calendar refresh in progress. / Takvim yenileniyor.');pending.add(id);
  try {
   const entry=normalize(await lookup({domain:row.domain,providerId:row.providerId}),row,now());if(source(id).providerId!==row.providerId)throw Error('Identity changed; reload. / Kimlik değişti; yenile.');
   const data=read(),index=data.calendars.findIndex(c=>c.id===id),previous=data.calendars[index];
   for(const event of entry.events){const old=previous?.events.find(e=>e.id===event.id);event.sequence=(old?.sequence||0)+(old&&hash([old.at,old.date,old.title])!==hash([event.at,event.date,event.title])?1:0);}
   if(index<0)data.calendars.push(entry);else data.calendars[index]=entry;
   const json=JSON.stringify(data);if(data.calendars.length>1000||Buffer.byteLength(json)>8000000)throw Error('Calendar cache limit. / Takvim önbelleği sınırı.');fs.mkdirSync(directory(),{recursive:true});atomicWriteFileSync(file(),json);return entry;
  }finally{pending.delete(id);}
 }
 function exportSelected({eventIds,revision}={}) {
  const snapshot=list();if(revision!==snapshot.revision)throw Error('Calendar changed; review your selection again. / Takvim değişti; seçimini yeniden incele.');
  if(!Array.isArray(eventIds)||eventIds.length<1||eventIds.length>500||new Set(eventIds).size!==eventIds.length)throw Error('Select 1–500 distinct events. / Farklı 1–500 yayın seç.');
  const map=new Map(snapshot.calendars.flatMap(c=>c.events).map(e=>[e.id,e])),events=eventIds.map(id=>map.get(id));if(events.some(e=>!e))throw Error('Selected event no longer exists. / Seçili yayın artık yok.');
  return {text:toIcs(events),filename:'whisper-release-calendar.ics',count:events.length};
 }
 return {list,refresh,exportSelected};
}
module.exports={create,normalize,localDay,toIcs};
