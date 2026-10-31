(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MediaToolsModel=factory();})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const text = (v, limit=2000) => String(v ?? '').replace(/\0/g,'').trim().slice(0,limit);
function reviewMetadata(row={}) {
 const result={};try{const u=new URL(row.permalink);if(u.protocol==='https:'&&u.hostname==='letterboxd.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/[a-z0-9_-]+\/film\/[a-z0-9-]+\/(?:[1-9]\d*\/)?$/i.test(u.pathname))result.permalink=u.href;}catch{}
 const claimed=text(row.authorId,80).toLowerCase(),linked=result.permalink?new URL(result.permalink).pathname.split('/')[1].toLowerCase():'';
 if(linked)result.authorId=linked;
 else if(!linked&&/^[a-z0-9_-]{1,80}$/.test(claimed))result.authorId=claimed;
 try{const parser=typeof module==='object'&&module.exports?require('../letterboxd-reviews'):globalThis.LetterboxdReviews,source=parser?.reviewPageSource(row.source?.url);
  if(source&&(!linked||new URL(result.permalink).pathname.split('/')[3]===new URL(source.url).pathname.split('/')[2])&&(!row.source.sort||row.source.sort===source.sort)&&(!row.source.page||row.source.page===source.page))result.source=source;
 }catch{}
 const date=String(row.date||'');if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date)result.date=date;
 if(typeof row.rating==='number'&&row.rating>=0.5&&row.rating<=5&&Number.isInteger(row.rating*2))result.rating=row.rating;
 return result;
}
function reviewRows(raw) {
  if (typeof raw !== 'string' || raw.length > 120000) throw Error('Use at most 120,000 characters.');
  let rows;
  if (raw.trim().startsWith('[')) { rows=JSON.parse(raw); if (!Array.isArray(rows)) throw Error('Expected a review array.'); }
  else rows=raw.split(/\n\s*\n/).map(body=>({text:body}));
  const parsed=rows.slice(0,100).map((row,i)=>({id:text(row?.id,80)||String(i+1),author:text(row?.author,120),text:text(row?.text,4000),spoiler:!!row?.spoiler,...reviewMetadata(row||{})})).filter(r=>r.text.length>=8);
  if(new Set(parsed.map(r=>r.id)).size!==parsed.length)throw Error('Review IDs must be unique.');return parsed;
}
function reviewSample(reviews, limit=4500) {
 const selected=[],originals=[],decisions=[];
 for(const row of reviews){
   if(selected.length>=20){decisions.push({id:row.id,included:false,reason:'review-limit'});continue;}
   // Reserve a readable prefix for other sources before spending the rest on
   // any long opening review. JSON escaping and metadata count in both rounds.
   const candidate={...row,text:row.text.slice(0,80)};
   if(JSON.stringify([...selected,candidate]).length>limit){decisions.push({id:row.id,included:false,reason:'size-limit'});continue;}
   selected.push(candidate);originals.push(row);decisions.push({id:row.id,included:true,reason:'included',originalLength:row.text.length,sentLength:candidate.text.length});
 }
 for(let round=0;round<20;round++){
  const unfinished=selected.map((row,i)=>i).filter(i=>selected[i].text.length<originals[i].text.length);if(!unfinished.length)break;
  let changed=false;
  for(let pos=0;pos<unfinished.length;pos++){
   const i=unfinished[pos],current=selected[i].text.length,budget=JSON.stringify(selected).length+Math.floor((limit-JSON.stringify(selected).length)/(unfinished.length-pos));
   let lo=current,hi=originals[i].text.length;while(lo<hi){const mid=Math.ceil((lo+hi)/2),candidate=selected.map((row,j)=>j===i?{...row,text:originals[i].text.slice(0,mid)}:row);if(JSON.stringify(candidate).length<=budget)lo=mid;else hi=mid-1;}
   if(lo>current){selected[i].text=originals[i].text.slice(0,lo);changed=true;}
  }
  if(!changed)break;
 }
 let truncated=0;for(const row of selected){const decision=decisions.find(value=>value.id===row.id);decision.sentLength=row.text.length;if(row.text.length<decision.originalLength){decision.reason='shortened';truncated++;}}
 return {reviews:selected,omitted:reviews.length-selected.length,truncated,decisions};
}
function reviewAssessment(reviews, points=[]) {
 const normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('en-US');
 const unique=new Set(reviews.map(r=>normalize(r.text))),quoted=new Set(points.filter(p=>reviews.some(r=>r.id===p.id)).map(p=>normalize(reviews.find(r=>r.id===p.id).text)));
 const authors=reviews.map(row=>reviewMetadata(row).authorId),independentAuthors=new Set(authors.filter(Boolean)).size,unknownAuthors=authors.filter(value=>!value).length;
 return {total:reviews.length,distinct:unique.size,duplicates:reviews.length-unique.size,quoted:quoted.size,independentAuthors,unknownAuthors,limited:unique.size<5||independentAuthors<5};
}
function personalEvidence(taste={}) {
 const aspects=['story','characters','pace','visuals','sound','emotion'],configured=taste.preferencesConfigured===true;
 const preferences=configured?{weights:Object.fromEntries(aspects.map(key=>[key,Math.max(0,Math.min(5,Number(taste.preferences?.weights?.[key])||0))])),avoid:aspects.filter(key=>taste.preferences?.avoid?.includes(key)),note:text(taste.preferences?.note,600)}:null;
 const sources=new Map((taste.reviews||[]).map(row=>[row.id,row])),insights=[];
 for(const row of (taste.analysis?.insights||[]).slice(0,3)){
  if(!aspects.includes(row.aspect)||!['likes','dislikes','mixed'].includes(row.direction))continue;
  const evidence=[];for(const citation of (row.evidence||[]).slice(0,3)){const source=sources.get(citation.id),quote=text(citation.quote,240);if(source&&quote.length>=8&&String(source.text||'').includes(quote))evidence.push({id:text(citation.id,80),title:text(source.title,120),quote});}
  if(evidence.length)insights.push({aspect:row.aspect,direction:row.direction,reason:text(row.reason,120),evidence});
 }
 const acceptedAnalysis=insights.length?{summary:text(taste.analysis.summary,400),insights}:null;
 const quiz=typeof module==='object'&&module.exports?require('../taste-quiz'):globalThis.TasteQuiz;
 let questionnaire=null;try{const saved=quiz?.restore(taste.quiz);if(saved)questionnaire={kind:'explicit_choices',answers:saved.answers.flatMap((answer,i)=>{const choice=quiz.questions[i].choices.find(row=>row[0]===answer);return choice?[{question:quiz.questions[i].id,choice:answer,meaning:choice[1]}]:[]})};}catch{}
 const result={preferencesConfigured:configured,preferences,acceptedAnalysis,analysisEvidenceUnavailable:!!taste.analysis&&!acceptedAnalysis,questionnaire};
 // Keep the full personal context bounded too: a pathological quoted/profile
 // payload must not consume the public-review sample's entire context window.
 while(JSON.stringify(result).length>3000){
  if(result.acceptedAnalysis?.insights.length>1){result.acceptedAnalysis.insights.pop();continue;}
  const evidence=result.acceptedAnalysis?.insights[0]?.evidence;
  if(evidence?.length>1){evidence.pop();continue;}
  if(result.acceptedAnalysis?.summary.length){result.acceptedAnalysis.summary=result.acceptedAnalysis.summary.slice(0,Math.floor(result.acceptedAnalysis.summary.length/2));continue;}
  if(result.preferences?.note.length){result.preferences.note=result.preferences.note.slice(0,Math.floor(result.preferences.note.length/2));continue;}
  if(result.acceptedAnalysis){result.acceptedAnalysis=null;result.analysisEvidenceUnavailable=true;continue;}
  break;
 }
 return result;
}
function decisionEvidence(item,reviews,taste={}) {
 const profile=personalEvidence(taste);
 const result={title:String(item.title||'').slice(0,200),year:item.year,kind:item.kind,reviews:[],profile,limitations:'Default weights are not explicit preferences. Accepted analysis is an inference from earlier personal reviews, not a guaranteed prediction.'};
 const overhead=JSON.stringify(result).length;
 const normalized=reviews.map((row,i)=>({id:text(row?.id,80)||String(i+1),author:text(row?.author,120),text:text(row?.text,4000),spoiler:!!row?.spoiler,...reviewMetadata(row||{})}));
 const sample=reviewSample(normalized,Math.max(100,Math.min(4500,7700-overhead)));
 result.reviews=sample.reviews;return {evidence:result,sample};
}
function decisionContext(item,reviews,taste={}) {return JSON.stringify(decisionEvidence(item,reviews,taste).evidence);}
function decisionFreshness(snapshot,item,reviews,taste={}) {return !snapshot?.context?'unknown':snapshot.context===decisionContext(item,reviews,taste)?'current':'stale';}
function validateEvidenceSnapshot(raw,reviews,item) {
 if(raw===undefined)return undefined;
 if(!raw||raw.version!==1||typeof raw.context!=='string'||raw.context.length>8000||!raw.profile||typeof raw.profile!=='object'||Array.isArray(raw.profile))throw Error('Invalid analysis evidence snapshot.');
 let context;try{context=JSON.parse(raw.context);}catch{throw Error('Invalid analysis evidence snapshot.');}
 if(!context||!Array.isArray(context.reviews)||JSON.stringify(context.reviews)!==JSON.stringify(reviews)||JSON.stringify(context.profile)!==JSON.stringify(raw.profile)||JSON.stringify(raw).length>16000||(item&&['title','year','kind'].some(key=>String(context[key]??'')!==String(key==='title'?text(item[key],200):item[key]??''))))throw Error('Analysis evidence snapshot does not match its review sample.');
 return {version:1,context:raw.context,profile:context.profile};
}
function verifyDecision(raw, reviews) {
  if (!raw || !Array.isArray(raw.points) || !raw.points.length || raw.points.length>16) throw Error('Analysis needs 1–16 supported points.');
  return {summary:text(raw.summary,3000), fit:text(raw.fit,2000), points:raw.points.map(row=>{
    const source=reviews.find(r=>r.id===row.id), quote=text(row.quote,800);
    if (!source || quote.length<8 || !source.text.includes(quote)) throw Error('A review quote could not be verified.');
    const quoteTr=text(row.quoteTr,800);
    return {id:row.id,quote,reason:text(row.reason,1500),kind:['praise','criticism','debate'].includes(row.kind)?row.kind:'debate',...(quoteTr?{quoteTr,quoteTrKind:'paraphrase'}:{})};
  }),at:Date.now()};
}
function tonight(items, history=[], options={}) {
  const max=Math.max(0,Math.min(300,Number(options.minutes)||0));
  const moods={tense:/thriller|crime|horror|gerilim|suç|korku/i,light:/comedy|family|komedi|aile/i,deep:/drama|documentary|belgesel/i,epic:/adventure|fantasy|science fiction|macera|fantastik|bilim/i,heart:/romance|romantik/i};
  const normalize=key=>String(key||'').startsWith('file:')?String(key).replace(/\\/g,'/').toLowerCase():String(key||'');
  const seen=new Map();for(const row of history){const key=normalize(row.key);if(!seen.has(key)||Number(row.lastWatched||0)>Number(seen.get(key).lastWatched||0))seen.set(key,row);}
  const watched=source=>source?seen.get(normalize(source.watchKey||'file:'+source.value)):null;
  const recent=new Set(options.recent||[]);
  const rows=[];
  for (const item of items) {
    const episode=item.kind==='series'?[...(item.episodes||[])].sort((a,b)=>a.season-b.season||a.number-b.number).find(ep=>ep.source&&ep.watchStatus!=='completed'&&!watched(ep.source)?.completed):null;
    const source=episode?.source || (item.kind==='film'?item.source:null);
    if (!source || source.type!=='local' || source.imported || item.watchStatus==='completed' || watched(source)?.completed) continue;
    const progress=watched(source),number=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):0;
    const duration=number(progress?.duration)||number(episode?0:item.runtime)*60;
    const position=Math.min(duration||Infinity,number(progress?.position));
    const remaining=duration?Math.max(0,duration-position):0;
    if(duration&&remaining===0)continue;
    if (max && (!remaining || remaining>max*60)) continue;
    const runtime=duration/60;
    const mood=!!moods[options.mood]?.test((item.genres||[]).join(' '));
    rows.push({itemId:item.id,episodeId:episode?.id||'',title:item.title,year:item.year,runtime:Math.ceil(runtime),remaining:Math.ceil(remaining/60),position,duration,episode:episode?`S${episode.season} E${episode.number}`:'',mood,
      score:(mood?5:0)+(episode?2:0)+(item.favorite?1:0)-(recent.has(item.id)?10:0),source:source.value});
  }
  return rows.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)).slice(0,8);
}

return Object.freeze({reviewRows,reviewMetadata,reviewSample,reviewAssessment,decisionEvidence,decisionContext,decisionFreshness,validateEvidenceSnapshot,verifyDecision,tonight});
});
