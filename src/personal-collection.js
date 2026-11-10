'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{createHash}=require('node:crypto');
const {SaxesParser}=require('saxes'),{atomicWriteFileSync}=require('./fsync-utils');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const STATUSES=['planned','watching','completed','paused','dropped'];
const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'')||v.startsWith('0000'))return null;const d=new Date(v+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v?v:null;};
function parseMal(buffer,source='XML'){
 const bytes=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);if(bytes.length>8000000)throw Error('Import exceeds 8 MB.');
 const xml=(bytes[0]===31&&bytes[1]===139?zlib.gunzipSync(bytes,{maxOutputLength:8000000}):bytes).toString('utf8');
 const parser=new SaxesParser(),stack=[],rows=[];let row=null,kind='',text='',root=false;
 parser.on('doctype',()=>{throw Error('XML document types are not supported.');});
 parser.on('opentag',tag=>{stack.push(tag.name);text='';if(stack.length===1){if(tag.name!=='myanimelist')throw Error('Choose a MyAnimeList XML export.');root=true;}if(stack.length===2&&['anime','manga'].includes(tag.name)){kind=tag.name;row={};}});
 parser.on('text',v=>{text+=v;});parser.on('cdata',v=>{text+=v;});
 parser.on('closetag',tag=>{if(row&&stack.length===3)row[tag.name]=text.trim();if(row&&stack.length===2){
  const id=row[kind==='anime'?'series_animedb_id':'manga_mangadb_id'],title=row[kind==='anime'?'series_title':'manga_title'];
  if(!/^\d{1,10}$/.test(id||'')||!title)throw Error('Invalid MAL title identity.');
  const state={Watching:'watching',Reading:'watching',Completed:'completed','On-Hold':'paused','On Hold':'paused',Dropped:'dropped','Plan to Watch':'planned','Plan to Read':'planned','1':'watching','2':'completed','3':'paused','4':'dropped','6':'planned'}[row.my_status];if(!state)throw Error('Unknown MAL reading/watching status.');
  const score=Number(row.my_score||0);if(!Number.isInteger(score)||score<0||score>10)throw Error('Invalid MAL rating.');
  const count=name=>{const n=Number(row[name]||0);if(!Number.isSafeInteger(n)||n<0||n>1000000)throw Error('Invalid MAL progress.');return n;};
  rows.push({id:'mal:'+kind+':'+id,provider:'myanimelist',providerId:id,kind,domain:kind,title:title.slice(0,500),format:(row.series_type||'').slice(0,60),status:state,rating:score||null,progress:count(kind==='anime'?'my_watched_episodes':'my_read_chapters'),total:count(kind==='anime'?'series_episodes':'manga_chapters'),volumes:count('my_read_volumes'),totalVolumes:count('manga_volumes'),startDate:date(row.my_start_date),finishDate:date(row.my_finish_date),note:(row.my_comments||'').slice(0,4000),tags:(row.my_tags||'').slice(0,2000),source:String(source).slice(0,200)});row=null;
 }stack.pop();text='';});parser.write(xml).close();if(!root||!rows.length||rows.length>10000)throw Error('Empty or oversized MAL list.');return rows;
}
function read(root){const file=path.join(root,'personal-collection.json');if(!fs.existsSync(file))return {version:1,rows:[]};if(fs.statSync(file).size>16000000)throw Error('Personal collection exceeds 16 MB.');const d=JSON.parse(fs.readFileSync(file,'utf8'));if(d.version!==1||!Array.isArray(d.rows)||d.rows.length>10000)throw Error('Invalid personal collection; original preserved.');return d;}
function write(root,data){const json=JSON.stringify(data);if(data.rows.length>10000||Buffer.byteLength(json)>16000000)throw Error('Personal collection limit exceeded.');fs.mkdirSync(root,{recursive:true});atomicWriteFileSync(path.join(root,'personal-collection.json'),json);}
function merge(root,incoming,now=Date.now()){
 const d=read(root),map=new Map(d.rows.map(r=>[r.id,r]));let added=0,updated=0,conflicts=0;
 for(const r of incoming){const old=map.get(r.id),variant={...r};delete variant.variants;
  if(!old){map.set(r.id,{...r,importedAt:now,variants:[variant]});added++;continue;}
  const variants=[...(old.variants||[])];if(!variants.some(v=>hash(v)===hash(variant)))variants.push(variant);
  const mismatch=['rating','status','progress'].some(k=>old[k]!==r[k]);if(mismatch)conflicts++;
  // First source/current user edit owns conflicting values. Fill only absent metadata.
  map.set(r.id,{...r,...old,rating:old.rating==null&&!old.ratedAt?r.rating:old.rating,total:old.total||r.total,totalVolumes:old.totalVolumes||r.totalVolumes,format:old.format||r.format,startDate:old.startDate||r.startDate,finishDate:old.finishDate||r.finishDate,variants:variants.slice(-12)});updated++;
 }
 d.rows=[...map.values()];write(root,d);return {added,updated,conflicts,total:d.rows.length};
}
function save(root,input,now=Date.now()){
 const d=read(root),row=d.rows.find(r=>r.id===input.id);if(!row)throw Error('Collection title no longer exists.');if(input.revision!==hash(row))throw Error('Title changed; reload before saving.');
 const p=input.patch;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['rating','status','progress','kind'].includes(k)))throw Error('Invalid collection update.');
 if(Object.hasOwn(p,'rating')&&p.rating!==null&&(!Number.isFinite(p.rating)||p.rating<0||p.rating>10))throw Error('Choose a rating from 0 to 10.');
 if(p.status!==undefined&&!STATUSES.includes(p.status))throw Error('Invalid collection status.');
 if(p.progress!==undefined&&(!Number.isSafeInteger(p.progress)||p.progress<0||p.progress>1000000||row.total>0&&p.progress>row.total))throw Error('Invalid progress.');
 if(p.kind!==undefined&&!(row.domain==='manga'&&['manga','manhwa','manhua'].includes(p.kind)))throw Error('Choose manga, manhwa or manhua.');
 for(const key of ['status','rating','progress'])if(Object.hasOwn(p,key))row.activity=require('./personal-history').append(row.activity,key,row[key],p[key],now);
 if(p.kind&&p.kind!==row.kind)row.kindEditedAt=now;
 if(p.status&&p.status!==row.status){row.statusMarkedAt=now;if(p.status==='completed')row.completedMarkedAt=now;}
 if(Object.hasOwn(p,'rating')&&p.rating!==row.rating)row.ratedAt=now;
 Object.assign(row,p,{updatedAt:now});write(root,d);return row;
}
module.exports={parseMal,read,write,merge,save,hash,STATUSES};
