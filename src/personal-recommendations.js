'use strict';
// Weighted feature cosine adapted from seanime-taste-engine (MIT), pinned source
// and full notice: docs/third-party/seanime-taste-engine-LICENSE.txt.
const {domainOf}=require('./media-domains');
const identity=r=>['anime','manga'].includes(r.domain)&&Number(r.providerId)>0?'mal:'+r.domain+':'+r.providerId:r.id;
const fold=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en').trim();
function scoreOf(r){if(r.provider==='myanimelist'||String(r.id||'').startsWith('mal:'))return require('./personal-collection').ratingOf(r);const raw=r.rating??r.ratings?.personal;if(raw==null||!['number','string'].includes(typeof raw)||String(raw).trim()==='')return null;const value=Number(raw);return Number.isFinite(value)&&value>=0&&value<=10?value:null;}
function cosine(a,b){let dot=0,na=0,nb=0;for(const k of Object.keys(a)){na+=a[k]*a[k];if(b[k])dot+=a[k]*b[k];}for(const k of Object.keys(b))nb+=b[k]*b[k];return na>0&&nb>0?dot/Math.sqrt(na*nb):0;}
function features(row){const m=row.metadata||row,result={};for(const g of m.genres||[])result['genre:'+fold(g)]=1;for(const t of m.themes||[]){if(t.name&&t.rank>=50&&!t.isMediaSpoiler&&!t.isGeneralSpoiler)result['theme:'+fold(t.name)]=t.rank/100;}for(const s of m.studios||m.directors||[])result['creator:'+fold(s)]=.7;return result;}
function recommend(rows,candidates,{domain,limit=12,exploration=false,maxMinutes=0,diversity='balanced',preferenceSignals}={}){
 if(!require('./media-domains').DOMAINS.includes(domain)||!Number.isInteger(limit)||limit<1||limit>24)throw Error('Choose a valid media pool and result limit.');
 if(!['off','balanced','varied'].includes(diversity))throw Error('Choose a valid diversity setting.');const diversityWeight={off:0,balanced:.15,varied:.45}[diversity];
 const owned=rows.filter(r=>domainOf(r)===domain),rated=owned.map(r=>({...r,rating:scoreOf(r)})).filter(r=>Number.isFinite(r.rating)),positive=rated.filter(r=>r.rating>=7),negative=rated.filter(r=>r.rating<=5),all=[...new Map([...owned,...candidates.filter(r=>domainOf(r)===domain)].map(r=>[r.id,r])).values()],df={};
 for(const r of all)for(const key of Object.keys(features(r)))df[key]=(df[key]||0)+1;
 const vector=r=>Object.fromEntries(Object.entries(features(r)).map(([key,value])=>[key,value*(Math.log((all.length+1)/((df[key]||0)+1))+1)])),profile={};
 for(const r of rated){const weight=r.rating>=7?(r.rating-6)/4:r.rating<=5?-(6-r.rating)/6:0;for(const [key,v]of Object.entries(vector(r)))profile[key]=(profile[key]||0)+v*weight;}
 for(const [key,value]of Object.entries(preferenceSignals?.vector||{}))if(Number.isFinite(value)&&/^(genre|theme):/.test(key))profile[key]=(profile[key]||0)+value*(Math.log((all.length+1)/((df[key]||0)+1))+1);
 const known=new Map(owned.map(r=>[identity(r),r])),seen=new Set(),pool=[];
 for(const c of [...owned.filter(r=>(r.status||r.watchStatus)==='planned'),...candidates]){if(domainOf(c)!==domain||seen.has(identity(c))||c.metadata?.adult||c.adult)continue;seen.add(identity(c));const current=known.get(identity(c));if(current&&(current.status||current.watchStatus)!=='planned')continue;if(current&&scoreOf(current)!==null)continue;if(maxMinutes&&(!(c.metadata?.duration>0)||c.metadata.duration>maxMinutes))continue;
  const v=vector(c),support=positive.map(r=>({itemId:r.id,title:r.title,rating:r.rating,similarity:cosine(v,vector(r)),shared:Object.keys(features(c)).filter(k=>features(r)[k]).slice(0,8)})).filter(e=>e.similarity>0).sort((a,b)=>b.similarity-a.similarity).slice(0,3),counter=negative.map(r=>({itemId:r.id,title:r.title,rating:r.rating,similarity:cosine(v,vector(r)),shared:Object.keys(features(c)).filter(k=>features(r)[k]).slice(0,8)})).filter(e=>e.similarity>0).sort((a,b)=>b.similarity-a.similarity).slice(0,2),score=cosine(v,profile);
  for(const evidence of support){const seed=positive.find(r=>r.id===evidence.itemId),without={...profile},weight=(seed.rating-6)/4;for(const [key,value]of Object.entries(vector(seed)))without[key]=(without[key]||0)-value*weight;evidence.influence=score-cosine(v,without);}const preferenceEvidence=(preferenceSignals?.evidence||[]).filter(e=>features(c)[e.key]).slice(0,8);if((!support.length&&!preferenceEvidence.length)||(!exploration&&score<=0))continue;pool.push({...c,score,preferenceEvidence,support,counter,basis:'weighted-metadata-similarity',confidence:support.length>=3?'supported':support.length>=2?'emerging':'single',limitations:['not-an-enjoyment-probability',...(!c.metadata?.genres?.length&&!c.genres?.length?['missing-genres']:[]),...(counter.length?['contrary-ratings']:[])],vector:v});
 }
 // Diversify the shortlist without changing the displayed, uncalibrated similarity.
 const selected=[];while(pool.length&&selected.length<limit){pool.sort((a,b)=>(b.score-diversityWeight*Math.max(0,...selected.map(r=>cosine(b.vector,r.vector))))-(a.score-diversityWeight*Math.max(0,...selected.map(r=>cosine(a.vector,r.vector))))||a.title.localeCompare(b.title));selected.push(pool.shift());}
 return {rows:selected.map(({vector,...r})=>r),domain,rated:rated.length,positive:positive.length,negative:negative.length,metadataRated:rated.filter(r=>Object.keys(features(r)).length).length,needsMetadata:positive.length>0&&!positive.some(r=>Object.keys(features(r)).length),needsRatings:!positive.length&&!Object.values(preferenceSignals?.vector||{}).some(v=>v>0)};
}
// Explain only this target against other explicitly rated titles, without training on itself.
// Training copies are excluded from the planned recommendation pool; saved statuses are untouched.
function match(rows,target,{preferences}={}){
 const domain=domainOf(target),training=rows.filter(row=>identity(row)!==identity(target)).map(row=>({...row,status:'watching',watchStatus:'watching'})),candidate={...target,status:'planned',watchStatus:'planned',rating:null,ratings:{...target.ratings,personal:null}},result=recommend(training,[candidate],{domain,limit:1,exploration:true,diversity:'off'}),found=result.rows.find(item=>identity(item)===identity(target));
 const shared=preferences?.evidence?.filter(e=>features(target)[e.key])||[],personal=shared.length?cosine(features(target),preferences.vector):null,combined=found?(personal===null?found.score:.7*found.score+.3*personal):personal;
 return {preferenceEvidence:shared.slice(0,8),domain,rated:result.rated,positive:result.positive,negative:result.negative,score:combined===null?null:Math.round(Math.max(0,combined)*100),confidence:found?.confidence||'insufficient',support:found?.support||[],counter:found?.counter||[],basis:'weighted-metadata-similarity',limitations:found?.limitations||['insufficient-rated-metadata']};
}
module.exports={recommend,features,cosine,identity,scoreOf,match};
