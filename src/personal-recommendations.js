'use strict';
// Weighted feature cosine adapted from seanime-taste-engine (MIT), pinned source
// and full notice: docs/third-party/seanime-taste-engine-LICENSE.txt.
const {domainOf}=require('./media-domains');
const fold=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en').trim();
function cosine(a,b){let dot=0,na=0,nb=0;for(const k of Object.keys(a)){na+=a[k]*a[k];if(b[k])dot+=a[k]*b[k];}for(const k of Object.keys(b))nb+=b[k]*b[k];return na>0&&nb>0?dot/Math.sqrt(na*nb):0;}
function features(row){const m=row.metadata||row,result={};for(const g of m.genres||[])result['genre:'+fold(g)]=1;for(const t of m.themes||[]){if(t.name&&t.rank>=50&&!t.isMediaSpoiler&&!t.isGeneralSpoiler)result['theme:'+fold(t.name)]=t.rank/100;}for(const s of m.studios||m.directors||[])result['creator:'+fold(s)]=.7;return result;}
function recommend(rows,candidates,{domain,limit=12,exploration=false,maxMinutes=0}={}){
 if(!require('./media-domains').DOMAINS.includes(domain)||!Number.isInteger(limit)||limit<1||limit>24)throw Error('Choose a valid media pool and result limit.');
 const owned=rows.filter(r=>domainOf(r)===domain),rated=owned.map(r=>({...r,rating:r.rating??(r.ratings?.personal==null?null:Number(r.ratings.personal))})).filter(r=>Number.isFinite(r.rating)),positive=rated.filter(r=>r.rating>=7),negative=rated.filter(r=>r.rating<=5),all=[...new Map([...owned,...candidates.filter(r=>domainOf(r)===domain)].map(r=>[r.id,r])).values()],df={};
 for(const r of all)for(const key of Object.keys(features(r)))df[key]=(df[key]||0)+1;
 const vector=r=>Object.fromEntries(Object.entries(features(r)).map(([key,value])=>[key,value*(Math.log((all.length+1)/((df[key]||0)+1))+1)])),profile={};
 for(const r of rated){const weight=r.rating>=7?(r.rating-6)/4:r.rating<=5?-(6-r.rating)/6:0;for(const [key,v]of Object.entries(vector(r)))profile[key]=(profile[key]||0)+v*weight;}
 const known=new Map(owned.map(r=>[r.id,r])),seen=new Set(),pool=[];
 for(const c of [...owned.filter(r=>(r.status||r.watchStatus)==='planned'),...candidates]){if(domainOf(c)!==domain||seen.has(c.id)||c.metadata?.adult||c.adult)continue;seen.add(c.id);const current=known.get(c.id);if(current&&(current.status||current.watchStatus)!=='planned')continue;if(current?.rating!=null||current?.ratings?.personal!=null)continue;if(maxMinutes&&(!(c.metadata?.duration>0)||c.metadata.duration>maxMinutes))continue;
  const v=vector(c),support=positive.map(r=>({itemId:r.id,title:r.title,rating:r.rating,similarity:cosine(v,vector(r)),shared:Object.keys(features(c)).filter(k=>features(r)[k]).slice(0,8)})).filter(e=>e.similarity>0).sort((a,b)=>b.similarity-a.similarity).slice(0,3),counter=negative.map(r=>({itemId:r.id,title:r.title,rating:r.rating,similarity:cosine(v,vector(r)),shared:Object.keys(features(c)).filter(k=>features(r)[k]).slice(0,8)})).filter(e=>e.similarity>0).sort((a,b)=>b.similarity-a.similarity).slice(0,2),score=cosine(v,profile);
  for(const evidence of support){const seed=positive.find(r=>r.id===evidence.itemId),without={...profile},weight=(seed.rating-6)/4;for(const [key,value]of Object.entries(vector(seed)))without[key]=(without[key]||0)-value*weight;evidence.influence=score-cosine(v,without);}if(!support.length||(!exploration&&score<=0))continue;pool.push({...c,score,support,counter,basis:'weighted-metadata-similarity',confidence:support.length>=3?'supported':support.length>=2?'emerging':'single',limitations:['not-an-enjoyment-probability',...(!c.metadata?.genres?.length&&!c.genres?.length?['missing-genres']:[]),...(counter.length?['contrary-ratings']:[])],vector:v});
 }
 // Diversify the shortlist without changing the displayed, uncalibrated similarity.
 const selected=[];while(pool.length&&selected.length<limit){pool.sort((a,b)=>(b.score-.15*Math.max(0,...selected.map(r=>cosine(b.vector,r.vector))))-(a.score-.15*Math.max(0,...selected.map(r=>cosine(a.vector,r.vector))))||a.title.localeCompare(b.title));selected.push(pool.shift());}
 return {rows:selected.map(({vector,...r})=>r),domain,rated:rated.length,positive:positive.length,negative:negative.length,metadataRated:rated.filter(r=>Object.keys(features(r)).length).length,needsMetadata:positive.length>0&&!positive.some(r=>Object.keys(features(r)).length),needsRatings:!positive.length};
}
module.exports={recommend,features,cosine};
