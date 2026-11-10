'use strict';
const {hash}=require('./personal-collection');
const animeFields=['title','aliases','cover','genres','themes','studios','country','format','total','volumes','duration','year','adult'];
const catalogFields=['title','originalTitle','originalLanguage','productionCountries','directorIds','directorPeople','directorsTruncated','year','synopsis','imdbId','genres','cast','runtime','directors','tagline','backdrop','tmdbRating','tmdbVotes','posterPath'];
const missing=v=>v==null||v===''||Array.isArray(v)&&!v.length;
const digest=v=>hash([v]);
const at=v=>Number.isSafeInteger(v)&&v>0?v:null;
function record(values,keys,provider,identity,time){return Object.fromEntries(keys.filter(k=>Object.hasOwn(values,k)).map(k=>[k,{provider,identity,at:at(time),valueHash:digest(values[k])}]));}
function clean(value){
 if(!value||value.version!==1)return {version:1,fields:{}};
 const fields={};for(const key of [...animeFields,...catalogFields]){const f=value.fields?.[key];if(f&&['anilist','tmdb','user','unknown'].includes(f.provider)&&/^[a-f0-9]{64}$/.test(f.valueHash||''))fields[key]={provider:f.provider,identity:typeof f.identity==='string'?f.identity.slice(0,120):'',at:at(f.at),valueHash:f.valueHash,legacy:f.legacy===true};}
 const p=value.pair;const pair=p&&typeof p.tmdbId==='string'&&/^(movie|tv):[1-9]\d*$/.test(p.tmdbId)&&/^tt\d{7,12}$/.test(p.imdbId||'')?{tmdbId:p.tmdbId,imdbId:p.imdbId,at:at(p.at)}:null;
 return {version:1,fields,pair};
}
function fieldsOf(row,origin='collection',now=Date.now()){
 const collection=origin==='collection',values=collection?row.metadata||{}:row,evidence=clean(collection?values.evidence:row.metadataEvidence),keys=collection?animeFields:catalogFields;
 return keys.map(key=>{const f=evidence.fields[key],override=collection&&row.metadataOverrides?.[key],matches=f&&f.valueHash===digest(values[key]),legacy=!!f?.legacy;
  const provider=override?'user':f?(matches?f.provider:'unknown'):collection&&row.metadata?.provider==='anilist'?'anilist':'unknown',time=override?at(override.at):f?.at||(!f&&provider==='anilist'?at(values.fetchedAt):null);
  return {key,value:key==='posterPath'?(values[key]?'stored':null):values[key]??null,provider,identity:f?.identity||'',at:time,age:time?Math.max(0,now-time):null,stale:time?now-time>7*86400000:null,state:override||matches&&f?.provider==='user'?'user':f&&!matches?'changed':legacy||!f&&provider==='anilist'?'legacy':missing(values[key])?'missing':provider==='unknown'?'unknown':'sourced',unlockable:!!override&&!override.unlocked,protected:!collection&&key==='title'||!!override&&!override.unlocked||row.fieldLocks?.includes(key)||matches&&f?.provider==='user'&&!override?.unlocked||!!f&&!matches};
 });
}
function identities(row,origin='collection'){
 const nodes={mal:null,anilist:null,imdb:null,tmdb:null},links=[];
 if(origin==='collection'){
  const m=row.metadata||{},domain=row.domain;
  if(['anime','manga'].includes(domain)&&/^[1-9]\d{0,9}$/.test(row.providerId||''))nodes.mal={id:row.providerId,url:`https://myanimelist.net/${domain}/${row.providerId}`,state:'recorded'};
  if(m.provider==='anilist'&&Number.isSafeInteger(m.providerId)&&m.providerId>0&&m.domain===domain)nodes.anilist={id:String(m.providerId),url:`https://anilist.co/${domain}/${m.providerId}`,state:'recorded'};
  const p=m.identityProof;
  if(nodes.mal&&nodes.anilist&&p?.malId===row.providerId&&p.anilistId===m.providerId&&p.domain===domain&&m.malId===row.providerId){links.push({from:'mal',to:'anilist',source:nodes.anilist.url,at:at(p.at)});nodes.mal.state=nodes.anilist.state='verified';}
  else if(nodes.mal&&m.malId&&m.malId!==row.providerId&&nodes.anilist)nodes.anilist.state='conflict';
 }else{
  if(/^tt\d{7,12}$/.test(row.imdbId||''))nodes.imdb={id:row.imdbId,url:`https://www.imdb.com/title/${row.imdbId}/`,state:'recorded'};
  const match=/^(movie|tv):([1-9]\d*)$/.exec(row.tmdbId||'');if(match&&match[1]===(row.kind==='series'?'tv':'movie'))nodes.tmdb={id:row.tmdbId,url:`https://www.themoviedb.org/${match[1]}/${match[2]}`,state:'recorded'};
  const p=clean(row.metadataEvidence).pair;if(nodes.imdb&&nodes.tmdb&&p?.imdbId===row.imdbId&&p.tmdbId===row.tmdbId){links.push({from:'tmdb',to:'imdb',source:nodes.tmdb.url,at:p.at});nodes.imdb.state=nodes.tmdb.state='verified';}
 }
 return {nodes,links};
}
function report(row,origin='collection',now=Date.now()){return {id:row.id,title:row.title,origin,revision:hash(row),identities:identities(row,origin),fields:fieldsOf(row,origin,now)};}
module.exports={animeFields,catalogFields,missing,digest,record,clean,fieldsOf,identities,report};
