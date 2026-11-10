'use strict';
const {createHash}=require('node:crypto'),{features}=require('./personal-recommendations');
function sample(cached){
 const candidates=cached.baseline.slice(0,24).map(r=>({id:r.id,title:r.title,features:features(r)}));
 const allRatings=cached.ratings.map(r=>({id:r.id,rating:require('./personal-collection').ratingOf(r),features:features(r)})).filter(r=>r.rating!==null),ratings=allRatings.slice(0,500);
 const body={version:1,domain:cached.options.domain,candidates,ratings,candidateScope:'displayed-metadata-shortlist',conditions:{filters:structuredClone(cached.options.filters),diversity:cached.options.diversity,repeat:cached.options.repeat,asOf:cached.options.asOf},ratingsPartial:allRatings.length>500,sourceCandidateCount:cached.candidates.length};
 return {...body,sampleHash:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
function compare(sample,report,baseline){
 if(!report||report.sampleHash!==sample.sampleHash)throw Error('Model report belongs to another sample. / Model raporu başka örneğe ait.');
 if(typeof report.model!=='string'||!report.model.trim()||report.model.length>160||/[\x00-\x1f]/.test(report.model)||!Array.isArray(report.scores)||report.scores.length>24)throw Error('Invalid model report. / Geçersiz model raporu.');
 const byId=new Map(sample.candidates.map(c=>[c.id,c])),seen=new Set();for(const r of report.scores){if(!r||!byId.has(r.id)||seen.has(r.id)||!Number.isFinite(r.score)||Math.abs(r.score)>1e9)throw Error('Invalid or duplicate candidate score. / Geçersiz veya yinelenen aday puanı.');seen.add(r.id);}
 const model=report.scores.map(r=>({id:r.id,title:byId.get(r.id).title,score:r.score})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)),metadata=baseline.map(r=>({id:r.id,title:r.title,score:r.score}));
 const k=Math.min(5,metadata.length,model.length),top=new Set(metadata.slice(0,k).map(r=>r.id));
 return {metadata,model,modelName:report.model.trim(),modelVerified:false,notSaved:true,coverage:metadata.length?model.length/metadata.length:0,topK:k,topKOverlap:k?model.slice(0,k).filter(r=>top.has(r.id)).length/k:null,sampleHash:sample.sampleHash};
}
module.exports={sample,compare};
