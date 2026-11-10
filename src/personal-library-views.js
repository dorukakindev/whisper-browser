'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),C=require('./personal-collection'),{domainOf,DOMAINS}=require('./media-domains'),{atomicWriteFileSync}=require('./fsync-utils');
const active=r=>!r.recordState||r.recordState==='active',integer=v=>Number.isSafeInteger(v)&&v>=0?v:null;
function metadataOf(row){const m=row.metadata||{};return m.domain&&row.domain&&m.domain!==row.domain||m.malId&&row.providerId&&m.malId!==row.providerId?{}:m;}
function counter(progress,total,unit,basis){progress=integer(progress);total=integer(total)>0?total:null;return {progress,total,unit,basis:total?basis:'unknown',remaining:total!==null&&progress!==null?Math.max(0,total-progress):null,over:total!==null&&progress!==null&&progress>total};}
function series(collection,catalog){
 const rows=[];
 for(const row of collection.filter(r=>active(r)&&['anime','manga'].includes(r.domain))){const personal=row.total>0,volumes=row.totalVolumes>0,m=metadataOf(row);rows.push({id:row.id,title:row.title,domain:row.domain,origin:'collection',status:row.status,counts:counter(row.progress,personal?row.total:m.total,row.domain==='anime'?'episodes':'chapters',personal?'personal-total':'source-total'),volumes:row.domain==='manga'?counter(row.volumes,volumes?row.totalVolumes:m.volumes,'volumes',volumes?'personal-total':'source-total'):null});}
 for(const row of catalog.filter(r=>active(r)&&r.kind==='series')){const episodes=(row.episodes||[]).slice().sort((a,b)=>a.season-b.season||a.number-b.number),seasons=new Map();let complete=0;const missing=[];for(const ep of episodes){const done=ep.watchStatus==='completed'||ep.progress?.completed===true;const s=seasons.get(ep.season)||{season:ep.season,listed:0,completed:0};s.listed++;if(done){complete++;s.completed++;}else missing.push({id:ep.id,season:ep.season,number:ep.number,started:!!(ep.progress?.position>0)});seasons.set(ep.season,s);}rows.push({id:row.id,title:row.title,domain:domainOf(row),origin:'catalog',status:row.watchStatus,counts:counter(episodes.length?complete:null,episodes.length||null,'episodes','listed-episodes'),seasons:[...seasons.values()],missingEpisodes:missing.slice(0,24),missingCount:missing.length});}
 return {total:rows.length,rows:rows.slice(0,2000),partial:rows.length>2000};
}
function filterOf(raw){
 const keys=['domain','kind','status','rating','minRating','maxRating','genre','country','yearFrom','yearTo','progress'];if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!keys.includes(k)))throw Error('Invalid shelf filter. / Geçersiz raf filtresi.');
 const f={domain:'',kind:'',status:'',rating:'any',minRating:null,maxRating:null,genre:'',country:'',yearFrom:null,yearTo:null,progress:'any',...raw};
 if(f.domain&&!DOMAINS.includes(f.domain)||f.kind&&!['anime','manga','manhwa','manhua','film','series','book','podcast'].includes(f.kind)||f.status&&!['planned','watching','completed','paused','dropped','unspecified'].includes(f.status)||!['any','rated','unrated'].includes(f.rating)||!['any','started','remaining','unknown'].includes(f.progress))throw Error('Choose valid shelf conditions. / Geçerli raf koşulları seç.');
 for(const k of ['minRating','maxRating'])if(f[k]!==null&&(!Number.isFinite(f[k])||f[k]<0||f[k]>10))throw Error('Rating range is 0–10. / Puan aralığı 0–10.');
 for(const k of ['yearFrom','yearTo'])if(f[k]!==null&&(!Number.isInteger(f[k])||f[k]<1880||f[k]>2200))throw Error('Choose a valid year. / Geçerli yıl seç.');
 if(f.minRating!==null&&f.maxRating!==null&&f.minRating>f.maxRating||f.yearFrom!==null&&f.yearTo!==null&&f.yearFrom>f.yearTo||f.rating==='unrated'&&(f.minRating!==null||f.maxRating!==null))throw Error('Conflicting shelf conditions. / Çelişen raf koşulları.');
 if(typeof f.genre!=='string'||f.genre.length>100||typeof f.country!=='string'||f.country!==''&&!/^[A-Z]{2}$/.test(f.country))throw Error('Choose genre and ISO country. / Tür ve ISO ülke kodu seç.');f.genre=f.genre.trim();return f;
}
function progressOf(row){
 if(row.kind==='series'&&row.episodes?.length)return {progress:row.episodes.filter(e=>e.watchStatus==='completed'||e.progress?.completed===true).length,total:row.episodes.length};
 if(row.progress&&typeof row.progress==='object')return {progress:Number.isFinite(row.progress.position)&&row.progress.position>=0?Math.floor(row.progress.position):null,total:row.progress.duration>0?Math.floor(row.progress.duration):null};
 return {progress:integer(row.progress),total:integer(row.total)>0?row.total:integer(metadataOf(row).total)>0?metadataOf(row).total:null};
}
function evaluate(rows,raw){
 const f=filterOf(raw),items=[];let count=0;
 for(const r of rows.filter(active)){
  const m=metadataOf(r),domain=domainOf(r),status=r.watchStatus||r.status||'unspecified',score=r.ratings?C.ratingOf({rating:r.ratings.personal}):C.ratingOf(r),genres=Array.isArray(m.genres||r.genres)?(m.genres||r.genres).filter(g=>typeof g==='string'):[],countries=m.country?[m.country]:r.productionCountries||[],rawYear=m.year||r.year,year=Number.isInteger(rawYear)&&rawYear>=1880&&rawYear<=2200?rawYear:null,{progress,total}=progressOf(r),started=progress>0||r.volumes>0||r.progress?.position>0||(r.episodes||[]).some(e=>e.progress?.position>0||e.watchStatus==='watching'),volumeTotal=r.totalVolumes>0?r.totalVolumes:m.volumes,remaining=total!==null&&progress!==null&&progress<total||domain==='manga'&&integer(r.volumes)!==null&&volumeTotal>r.volumes,reason=[];
  if(f.domain&&domain!==f.domain||f.kind&&r.kind!==f.kind||f.status&&status!==f.status||f.rating==='rated'&&score===null||f.rating==='unrated'&&score!==null||f.minRating!==null&&(score===null||score<f.minRating)||f.maxRating!==null&&(score===null||score>f.maxRating)||f.genre&&!genres.some(g=>g.toLocaleLowerCase('tr')===f.genre.toLocaleLowerCase('tr'))||f.country&&!countries.includes(f.country)||f.yearFrom!==null&&(!year||year<f.yearFrom)||f.yearTo!==null&&(!year||year>f.yearTo)||f.progress==='started'&&!started||f.progress==='remaining'&&!remaining||f.progress==='unknown'&&total!==null)continue;
  for(const key of ['domain','kind','status','genre','country'])if(f[key])reason.push({key,value:f[key]});if(f.rating!=='any'||f.minRating!==null||f.maxRating!==null)reason.push({key:'rating',value:score});if(f.yearFrom!==null||f.yearTo!==null)reason.push({key:'year',value:year});if(f.progress!=='any')reason.push({key:'progress',value:f.progress});if(!reason.length)reason.push({key:'all',value:'active-record'});
  count++;if(items.length<200)items.push({id:r.id,title:r.title,domain,origin:r.origin,status,rating:score,reason});
 }
 return {filter:f,count,items,partial:count>200};
}
function create({root,now=Date.now}={}){
 const directory=()=>typeof root==='function'?root():root,file=()=>path.join(directory(),'personal-smart-shelves.json');
 function read(){if(!fs.existsSync(file()))return {version:1,shelves:[]};if(fs.statSync(file()).size>200000)throw Error('Smart shelf file limit. / Akıllı raf dosyası sınırı.');const data=JSON.parse(fs.readFileSync(file(),'utf8'));if(data.version!==1||!Array.isArray(data.shelves)||data.shelves.length>30)throw Error('Smart shelf file invalid; preserved. / Akıllı raf dosyası bozuk; korundu.');return data;}
 function list(){const d=read();return {...d,revision:C.hash(d)};}
 function save({id,name,filter,revision}){const d=read();if(revision!==C.hash(d))throw Error('Shelves changed; reload. / Raflar değişti; yenile.');if(typeof name!=='string'||!name.trim()||name.length>100)throw Error('Name your shelf. / Rafına ad ver.');const old=id?d.shelves.find(s=>s.id===id):null;if(id&&!old||!old&&d.shelves.length>=30)throw Error('Shelf unavailable or limit reached. / Raf yok veya sınıra ulaşıldı.');const row={id:old?.id||randomUUID(),name:name.trim(),filter:filterOf(filter),updatedAt:now()};d.shelves=old?d.shelves.map(s=>s.id===id?row:s):[...d.shelves,row];write(d);return {row,...list()};}
 function write(d){const json=JSON.stringify(d);if(Buffer.byteLength(json)>200000)throw Error('Smart shelf file limit. / Akıllı raf dosyası sınırı.');fs.mkdirSync(directory(),{recursive:true});atomicWriteFileSync(file(),json);}
 function remove({id,revision}){const d=read();if(revision!==C.hash(d))throw Error('Shelves changed; reload. / Raflar değişti; yenile.');if(!d.shelves.some(s=>s.id===id))throw Error('Shelf unavailable. / Raf yok.');d.shelves=d.shelves.filter(s=>s.id!==id);write(d);return list();}
 return {list,save,remove};
}
module.exports={series,filterOf,evaluate,create};
