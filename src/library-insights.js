'use strict';
const {DOMAINS,domainOf}=require('./media-domains'),H=require('./personal-history');
const active=r=>(!r.recordState||r.recordState==='active')&&r.hidden!==true;
const ref=r=>JSON.stringify([r.origin||'catalog',r.id]);
const ratingValue=v=>v===null||v===undefined||!['number','string'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>10?null:Number(v);
const scoreFor=r=>r.ratings?.personal==null?require('./personal-collection').ratingOf(r):ratingValue(r.ratings.personal);
function scoped(rows,domain){if(!DOMAINS.includes(domain))throw Error('Choose one media pool / Bir içerik havuzu seçin.');const seen=new Set();return rows.filter(r=>{const key=ref(r);if(!active(r)||domainOf(r)!==domain||seen.has(key))return false;seen.add(key);return true;});}
function labels(raw){return [...new Set((Array.isArray(raw)?raw:typeof raw==='string'?[raw]:[]).map(v=>typeof v==='string'?v:v?.iso_3166_1||v?.name||'').filter(v=>typeof v==='string').map(v=>v.trim().slice(0,120)).filter(Boolean))];}
function fields(r){const year=Number(r.metadata?.year||r.year);return {genres:labels(r.metadata?.genres||r.genres),years:Number.isInteger(year)&&year>=1900&&year<=2200?[String(year)]:[],countries:labels(r.metadata?.countries||r.countries||r.productionCountries)};}
function distribution(rows,{domain='film',sample='consumed'}={}){
 if(!['consumed','rated'].includes(sample))throw Error('Unknown sample / Bilinmeyen örnek.');
 const all=scoped(rows,domain),selected=all.filter(r=>sample==='rated'?scoreFor(r)!==null:['watching','completed','paused','dropped'].includes(r.watchStatus||r.status)||Number(r.progress)>0||Number(r.progress?.position)>0||(r.episodes||[]).some(e=>e.progress?.position>0||e.progress?.completed)),groups={genres:new Map(),years:new Map(),countries:new Map()},missing={genres:0,years:0,countries:0};
 for(const r of selected)for(const [field,values]of Object.entries(fields(r))){if(!values.length)missing[field]++;for(const name of values)groups[field].set(name,(groups[field].get(name)||0)+1);}
 return {domain,sample,count:selected.length,total:all.length,missing,labelTotals:Object.fromEntries(Object.entries(groups).map(([field,map])=>[field,map.size])),groups:Object.fromEntries(Object.entries(groups).map(([field,map])=>[field,[...map].map(([name,count])=>({name,count,share:selected.length?count/selected.length:0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,100)])),multiLabel:true};
}
function periods(rows,{domain='film',years,now=Date.now()}={}){
 const currentYear=Number(H.day(now).slice(0,4));years=years||[currentYear-1,currentYear];if(!Array.isArray(years)||years.length!==2||new Set(years).size!==2||years.some(y=>!Number.isInteger(y)||y<1900||y>currentYear))throw Error('Choose two distinct past/current years / İki farklı geçmiş/güncel yıl seçin.');
 const periods=years.map(year=>({year,count:0,average:null,genres:[],missingGenres:0})),samples=years.map(()=>new Map());let undated=0,futureDates=0;
 for(const r of scoped(rows,domain)){
  const info={...H.ratings(r),current:scoreFor(r)},events=H.clean(r.activity).filter(e=>e.type==='rating').map(e=>({at:e.at,rating:ratingValue(e.to)}));
  if(info.current!==null&&info.currentAt&&!events.some(e=>e.at===info.currentAt))events.push({at:info.currentAt,rating:info.current});
  if(info.current!==null&&!events.length)undated++;
  for(const e of events){if(e.at>now){futureDates++;continue;}const index=years.indexOf(Number(H.day(e.at).slice(0,4)));if(index<0)continue;const old=samples[index].get(ref(r));if(!old||old.at<=e.at)samples[index].set(ref(r),{at:e.at,rating:e.rating===null?null:Number(e.rating),genres:fields(r).genres});}
 }
 periods.forEach((p,i)=>{const rows=[...samples[i].values()].filter(r=>r.rating!==null&&Number.isFinite(r.rating)&&r.rating>=0&&r.rating<=10),genres=new Map();p.count=rows.length;p.average=rows.length?rows.reduce((s,r)=>s+r.rating,0)/rows.length:null;for(const r of rows){if(!r.genres.length)p.missingGenres++;for(const name of r.genres){const g=genres.get(name)||{name,count:0,sum:0};g.count++;g.sum+=r.rating;genres.set(name,g);}}p.genres=[...genres.values()].map(g=>({name:g.name,count:g.count,average:g.sum/g.count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,50);});
 return {domain,periods,undated,futureDates,comparable:periods.every(p=>p.count>=3),minimum:3,dateBasis:'recorded-rating-date',oneScorePerTitle:true};
}
module.exports={distribution,periods};
