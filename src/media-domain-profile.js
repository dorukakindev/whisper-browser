'use strict';
const {DOMAINS,domainOf}=require('./media-domains');
const themesOf=row=>(row.metadata?.themes||row.themes||[]).filter(t=>typeof t==='string'||t?.name&&!t.isMediaSpoiler&&!t.isGeneralSpoiler&&Number(t.rank)>=50).map(t=>typeof t==='string'?t:t.name);
function profileFor(data,catalog,collection,domain='film'){
 if(!DOMAINS.includes(domain))throw Error('Unknown taste domain.');
 const rows=collection.filter(r=>r.domain===domain),items=catalog.filter(r=>domainOf(r)===domain).map(r=>({...r,genres:r.metadata?.genres||r.genres||[],themes:themesOf(r)}));
 for(const r of rows){const score=require('./personal-collection').ratingOf(r);items.push({id:r.id,title:r.title,kind:'series',ratings:{personal:score==null?null:String(score)},genres:r.metadata?.genres||r.genres||[],themes:themesOf(r),directors:[],portraitSource:'collection',recordState:r.recordState});}
 const diary=(data.diary||[]).filter(r=>domainOf(r)===domain),reviews=(data.reviews||[]).filter(r=>domainOf(r)===domain);
 const saved=domain==='film'?data.tasteProfile||{}:data.tasteDomains?.[domain]||{};
 return {...require('./media-taste').profile(diary,items,saved,reviews),domain,domains:DOMAINS};
}
module.exports={profileFor};
