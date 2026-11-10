'use strict';
const {DOMAINS,domainOf}=require('./media-domains');
function profileFor(data,catalog,collection,domain='film'){
 if(!DOMAINS.includes(domain))throw Error('Unknown taste domain.');
 const rows=collection.filter(r=>r.domain===domain),items=catalog.filter(r=>domainOf(r)===domain);
 for(const r of rows)items.push({id:r.id,title:r.title,kind:'series',ratings:{personal:r.rating==null?null:String(r.rating)},genres:r.metadata?.genres||r.genres||[],directors:[]});
 const diary=(data.diary||[]).filter(r=>domainOf(r)===domain),reviews=(data.reviews||[]).filter(r=>domainOf(r)===domain);
 const saved=domain==='film'?data.tasteProfile||{}:data.tasteDomains?.[domain]||{};
 return {...require('./media-taste').profile(diary,items,saved,reviews),domain,domains:DOMAINS};
}
module.exports={profileFor};
