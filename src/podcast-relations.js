'use strict';
// Relations describe publisher metadata, never personal taste or inferred timestamps.
const fold=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('en').trim();
const visible=e=>e&&e.hidden!==true&&(!e.recordState||e.recordState==='active')&&!(e.spoiler==='marked'&&!e.spoilerAllowed);
const guests=e=>[...String(e.text||e.summary||'').matchAll(/^(?:guest|guests|konuk|konuklar)\s*:\s*([^\r\n]{2,120})$/gim)].slice(0,8).map(m=>({value:fold(m[1]),quote:m[0]}));
const cite=e=>({entryId:e.id,revision:e.revision,url:e.url||'',feedId:e.feedId||''});
function timed(e,phrase,cache){
 const needle=fold(phrase).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 if(needle.replace(/\s/g,'').length<2)return null;
 if(!cache.has(e)){
  const session=require('./podcast-session'),version=session.sourceVersion(e),w=e.podcastWorkspace,t=w?.transcript;let cues=[];
  if(w?.sourceVersion===version&&t?.state==='timed'&&['srt','vtt'].includes(t.format)&&(!t.status||t.status==='complete')&&(t.provenance!=='asr'||session.matchesTranscriptTimeline(t.timeline,version,session.sourceBinding(e))))try{session.validateTimedText(t.text);cues=require('./browser-subtitles').parseSubtitlePayload(t.text,'','transcript.'+t.format).cues;}catch{}
  cache.set(e,{cues,version,provenance:t?.provenance});
 }
 const {cues,version,provenance}=cache.get(e),cue=cues.find(c=>(' '+fold(c.text).replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ').includes(' '+needle+' '));
 return cue?{start:cue.start,end:cue.end,quote:cue.text,sourceVersion:version,provenance,clock:'saved-source-seconds',playbackVerified:false}:null;
}
function relate(seed,candidates,{partial=false}={}){
 if(seed.kind!=='podcast'||!visible(seed))return {rows:[],total:0,partial};
 const rows=[],seen=new Set(),aGuests=guests(seed),aTags=(seed.categories||[]).filter(t=>typeof t==='string');
 for(const e of candidates.slice(0,4000)){
  if(!visible(e)||e.kind!=='podcast'||e.id===seed.id||e.canonicalId&&e.canonicalId===seed.canonicalId||seen.has(e.id))continue;seen.add(e.id);
  const evidence=[],add=(kind,sourceQuote,targetQuote)=>evidence.push({kind,source:{...cite(seed),quote:sourceQuote},target:{...cite(e),quote:targetQuote},timing:'metadata'});
  if(seed.feedId&&seed.feedId===e.feedId)add('series',seed.provenance?.find(p=>p.feedId===seed.feedId)?.title||seed.sourceFeed?.title||seed.feedId,e.provenance?.find(p=>p.feedId===e.feedId)?.title||e.sourceFeed?.title||e.feedId);
  for(const tag of aTags.slice(0,30)){const other=(e.categories||[]).find(t=>typeof t==='string'&&fold(t)===fold(tag));if(other)add('topic',tag,other);}
  for(const g of aGuests){const other=guests(e).find(t=>t.value===g.value);if(other)add('guest',g.quote,other.quote);}
  if(evidence.length)rows.push({id:e.id,title:e.title,revision:e.revision,evidence:evidence.slice(0,12)});
 }
 const cache=new Map();for(const row of rows.slice(0,20)){const e=candidates.find(c=>c.id===row.id);for(const evidence of row.evidence)if(evidence.kind!=='series'){for(const [source,owner]of [[evidence.source,seed],[evidence.target,e]])source.timed=timed(owner,evidence.kind==='guest'?source.quote.replace(/^[^:]+:\s*/, ''):source.quote,cache);}}
 return {rows:rows.slice(0,20),total:rows.length,partial:partial||rows.length>20||candidates.length>4000};
}
module.exports={relate};
