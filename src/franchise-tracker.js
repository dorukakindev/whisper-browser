'use strict';
const fs = require('node:fs');
const path = require('node:path');
const C = require('./personal-collection');
const { atomicWriteFileSync } = require('./fsync-utils');
const { cover } = require('./collection-metadata');
const text = value => typeof value === 'string' ? value.trim().slice(0, 500) : '';
const relations = new Set(['PREQUEL','SEQUEL','PARENT','SIDE_STORY','SPIN_OFF','ADAPTATION','SOURCE','ALTERNATIVE','SUMMARY','COMPILATION','CONTAINS','CHARACTER','OTHER','SAME_UNIVERSE']);
function releaseOf(date) {
 if (!Number.isInteger(date?.year) || date.year < 1900 || date.year > 2200) return null;
 const year = String(date.year);
 if (!Number.isInteger(date.month) || date.month < 1 || date.month > 12) return year;
 const month = year + '-' + String(date.month).padStart(2, '0');
 if (!Number.isInteger(date.day) || date.day < 1 || date.day > new Date(Date.UTC(date.year,date.month,0)).getUTCDate()) return month;
 return month + '-' + String(date.day).padStart(2, '0');
}
function nodeOf(raw) {
 if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1 || !['ANIME','MANGA'].includes(raw.type)) throw Error('Invalid franchise identity. / Geçersiz seri kimliği.');
 const domain = raw.type.toLowerCase();
 return { id:`anilist:${domain}:${raw.id}`, providerId:raw.id, malId:Number.isSafeInteger(raw.idMal)&&raw.idMal>0?String(raw.idMal):null, domain,
  title:text(raw.title?.romaji||raw.title?.english||raw.title?.native)||String(raw.id), cover:cover(raw.coverImage?.large), format:text(raw.format),
  status:text(raw.status), release:releaseOf(raw.startDate), volumes:Number.isSafeInteger(raw.volumes)&&raw.volumes>0?raw.volumes:null,
  episodes:Number.isSafeInteger(raw.episodes)&&raw.episodes>0?raw.episodes:null, url:`https://anilist.co/${domain}/${raw.id}` };
}
function graphOf(raw, fetchedAt) {
 const seed = {...nodeOf(raw),fetchedAt}, nodes = new Map([[seed.id,seed]]), edges = [];
 if (!Array.isArray(raw.relations?.edges)) throw Error('Incomplete relation response. / İlişki yanıtı eksik.');
 for (const edge of raw.relations.edges.slice(0,100)) {
  if (!relations.has(edge.relationType) || !edge.node) continue;
  const target = {...nodeOf(edge.node),fetchedAt}; if(target.id===seed.id)continue;
  nodes.set(target.id,target); edges.push({from:seed.id,to:target.id,type:edge.relationType,source:seed.url,fetchedAt});
 }
 return {root:seed.id,nodes:[...nodes.values()],edges,fetchedAt,storyOrder:null,scope:'direct-relations',truncated:raw.relations.edges.length>100};
}
function create({root,lookup,now=Date.now}) {
 const directory = () => typeof root === 'function' ? root() : root;
 const file = () => path.join(directory(),'franchise-tracker.json');
 function read() {
  if(!fs.existsSync(file()))return {version:1,entries:[]};
  if(fs.statSync(file()).size>8000000)throw Error('Series cache exceeds 8 MB. / Seri önbelleği 8 MB sınırını aşıyor.');
  const data=JSON.parse(fs.readFileSync(file(),'utf8'));
  if(data.version!==1||!Array.isArray(data.entries)||data.entries.length>1000)throw Error('Series cache invalid; preserved. / Seri önbelleği bozuk; korundu.');
  return data;
 }
 function write(data) {
  const json=JSON.stringify(data);if(data.entries.length>1000||Buffer.byteLength(json)>8000000)throw Error('Series cache limit. / Seri önbelleği sınırı.');
  fs.mkdirSync(directory(),{recursive:true});atomicWriteFileSync(file(),json);
 }
 function source(id) {
  const row=C.read(directory()).rows.find(row=>row.id===id);
  if(!row||!['anime','manga'].includes(row.domain)||!/^\d{1,10}$/.test(row.providerId||'')||Number(row.providerId)<1)throw Error('Choose a saved MAL identity. / Kayıtlı MAL kimliği seç.');
  return row;
 }
 const matches=(e,r)=>!!r&&e.domain===r.domain&&e.graph?.nodes.find(n=>n.id===e.graph.root)?.malId===r.providerId;
 function list(){const data=read(),rows=C.read(directory()).rows;return {...data,entries:data.entries.filter(e=>matches(e,rows.find(r=>r.id===e.id)))};}
 const pending=new Set();
 async function refresh({id,nodeId}={}) {
  const row=source(id);if(pending.has(id))throw Error('Series refresh in progress. / Seri yenileniyor.');
  const old=list().entries.find(e=>e.id===id),known=nodeId?old?.graph.nodes.find(n=>n.id===nodeId):null;
  if(nodeId&&!known)throw Error('Choose a verified relation. / Doğrulanmış ilişki seç.');
  pending.add(id);
  try {
   const raw=await lookup(known?{domain:known.domain,anilistId:known.providerId}:{domain:row.domain,providerId:row.providerId});
   if(raw?.type!==(known?.domain||row.domain).toUpperCase()||(known?raw.id!==known.providerId:String(raw?.idMal)!==row.providerId))throw Error('Franchise identity changed. / Seri kimliği değişti.');
   const graph=graphOf(raw,now());
   // Re-read after the network wait: a follow/unfollow action must never be lost.
   if(source(id).providerId!==row.providerId)throw Error('Identity changed; reload. / Kimlik değişti; yenile.');const data=read(),entry=data.entries.find(e=>e.id===id&&matches(e,row));
   if(entry?.graph.root&&entry.graph.root!== (nodeId?entry.graph.root:graph.root))throw Error('Series identity changed; reload. / Seri kimliği değişti; yenile.');
   const graphs={...(entry?.graphs||{}),[graph.root]:graph};
   if(Object.keys(graphs).length>30)throw Error('Map limit: 30 expanded titles. / Harita sınırı: 30 açılmış yapım.');
   const unionNodes=new Map(),unionEdges=new Map();
   for(const g of Object.values(graphs).sort((a,b)=>a.fetchedAt-b.fetchedAt)) {for(const n of g.nodes)unionNodes.set(n.id,n);for(const e of g.edges)unionEdges.set(e.from+'|'+e.to+'|'+e.type,e);}
   const merged={...graph,root:entry?.graph.root||graph.root,nodes:[...unionNodes.values()],edges:[...unionEdges.values()],scope:'expanded-direct-relations',expanded:Object.keys(graphs)};
   const next={...entry,id,title:row.title,domain:row.domain,following:entry?.following||false,graph:merged,graphs,updates:entry?.updates||[]};
   if(next.following) {
    const previousNode=entry.graph.nodes.find(n=>n.id===graph.root),currentNode=graph.nodes[0];
    if(previousNode&&currentNode.domain==='manga'&&previousNode.volumes!==null&&currentNode.volumes!==null&&previousNode.volumes!==currentNode.volumes)
     next.updates.push({kind:'volumes',nodeId:currentNode.id,node:currentNode,previous:previousNode.volumes,current:currentNode.volumes,detectedAt:graph.fetchedAt,source:currentNode.url});
    if(previousNode&&((previousNode.status&&currentNode.status&&previousNode.status!==currentNode.status)||(currentNode.release&&previousNode.release!==currentNode.release)))
     next.updates.push({kind:'release-info',nodeId:currentNode.id,node:currentNode,previous:{status:previousNode.status,release:previousNode.release},current:{status:currentNode.status,release:currentNode.release},detectedAt:graph.fetchedAt,source:currentNode.url});
    const seen=new Set(entry.seen||[]);
    for(const edge of graph.edges.filter(e=>e.type==='SEQUEL')) {
     const key=edge.from+'|'+edge.to;
     if(!seen.has(key))next.updates.push({key,kind:'sequel',nodeId:edge.to,node:graph.nodes.find(n=>n.id===edge.to),from:edge.from,detectedAt:graph.fetchedAt,source:edge.source});
     seen.add(key);
    }
    next.seen=[...seen];next.updates=next.updates.slice(-100);
   }
   const index=data.entries.findIndex(e=>e.id===id);if(index<0)data.entries.push(next);else data.entries[index]=next;write(data);return next;
  } finally {pending.delete(id);}
 }
 function follow({id,following}={}) {
  source(id);if(typeof following!=='boolean')throw Error('Invalid follow state. / Geçersiz takip durumu.');
  const data=read(),entry=data.entries.find(e=>e.id===id);if(!entry||!matches(entry,source(id)))throw Error('Load the map first. / Önce haritayı yükle.');
  if(following&&!entry.following){entry.followedAt=now();entry.seen=entry.graph.edges.filter(e=>e.type==='SEQUEL').map(e=>e.from+'|'+e.to);entry.updates=[];}
  entry.following=following;write(data);return entry;
 }
 return {list,refresh,follow};
}
module.exports={create,graphOf,releaseOf};
