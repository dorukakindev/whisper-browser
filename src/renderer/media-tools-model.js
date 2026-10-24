(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MediaToolsModel=factory();})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const text = (v, limit=2000) => String(v ?? '').replace(/\0/g,'').trim().slice(0,limit);
function reviewRows(raw) {
  if (typeof raw !== 'string' || raw.length > 120000) throw Error('Use at most 120,000 characters.');
  let rows;
  if (raw.trim().startsWith('[')) { rows=JSON.parse(raw); if (!Array.isArray(rows)) throw Error('Expected a review array.'); }
  else rows=raw.split(/\n\s*\n/).map(body=>({text:body}));
  const parsed=rows.slice(0,100).map((row,i)=>({id:text(row.id,80)||String(i+1),author:text(row.author,120),text:text(row.text,4000),spoiler:!!row.spoiler})).filter(r=>r.text.length>=8);
  if(new Set(parsed.map(r=>r.id)).size!==parsed.length)throw Error('Review IDs must be unique.');return parsed;
}
function verifyDecision(raw, reviews) {
  if (!raw || !Array.isArray(raw.points) || !raw.points.length || raw.points.length>16) throw Error('Analysis needs 1–16 supported points.');
  return {summary:text(raw.summary,3000), fit:text(raw.fit,2000), points:raw.points.map(row=>{
    const source=reviews.find(r=>r.id===row.id), quote=text(row.quote,800);
    if (!source || quote.length<8 || !source.text.includes(quote)) throw Error('A review quote could not be verified.');
    return {id:row.id,quote,reason:text(row.reason,1500),kind:['praise','criticism','debate'].includes(row.kind)?row.kind:'debate'};
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

return Object.freeze({reviewRows,verifyDecision,tonight});
});
