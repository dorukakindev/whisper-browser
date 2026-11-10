'use strict';
const {domainOf}=require('./media-domains');
function clean(events){return (Array.isArray(events)?events:[]).filter(e=>e&&['status','rating','progress'].includes(e.type)&&Number.isSafeInteger(e.at)&&e.at>0).slice(-200).map(({type,at,from,to})=>({type,at,from,to}));}
function append(events,type,from,to,at=Date.now()){const result=clean(events);if(from!==to)result.push({type,at,from:from??null,to:to??null});return result.slice(-200);}
const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
function activity(catalog=[],collection=[]){const events=[],undatedByDomain={};let undated=0;
 for(const r of [...catalog,...collection]){
  const domain=domainOf(r),history=clean(r.activity),status=r.watchStatus||r.status;
  for(const e of history)events.push({...e,id:r.id+'|'+e.type+'|'+e.at,date:day(e.at),itemId:r.id,title:r.title,domain,origin:'recorded',cover:r.metadata?.cover||''});
  if(r.statusMarkedAt&&!history.some(e=>e.type==='status'&&e.at===r.statusMarkedAt))events.push({id:r.id+'|status|'+r.statusMarkedAt,itemId:r.id,title:r.title,domain,type:'status',to:status,at:r.statusMarkedAt,date:day(r.statusMarkedAt),origin:'recorded'});
  if(r.finishDate&&/^\d{4}-\d{2}-\d{2}$/.test(r.finishDate))events.push({id:r.id+'|source-finish|'+r.finishDate,itemId:r.id,title:r.title,domain,type:'source-finish',to:'completed',date:r.finishDate,origin:'imported-date'});
  if(!r.statusMarkedAt&&!history.length&&!r.finishDate&&status&&status!=='unspecified'){undated++;undatedByDomain[domain]=(undatedByDomain[domain]||0)+1;}
 }
 return {events:events.sort((a,b)=>b.date.localeCompare(a.date)||(b.at||0)-(a.at||0)),undated,undatedByDomain};
}
function ratings(row){const raw=row.ratings?.personal,current=raw==null?require('./personal-collection').ratingOf(row):String(raw).trim()===''?null:Number(raw),events=clean(row.activity).filter(e=>e.type==='rating').sort((a,b)=>b.at-a.at);const latest=events.find(e=>Number(e.to)===current&&e.to!==null);return {current:Number.isFinite(current)?current:null,currentAt:latest?.at||(Number.isSafeInteger(row.ratedAt)&&row.ratedAt>0?row.ratedAt:null),events,sourceVariants:(row.variants||[]).filter(v=>v.rating!=null).map(v=>({source:v.source||null,rating:require('./personal-collection').ratingOf({...row,...v,ratedAt:v.ratedAt}),dateKnown:false}))};}
module.exports={clean,append,activity,day,ratings};
