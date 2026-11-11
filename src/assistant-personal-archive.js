'use strict';
const {domainOf,DOMAINS}=require('./media-domains'),{hash,ratingOf}=require('./personal-collection');
// Read model only. A shelf/collection source reference is never a catalog opener ID.
function query(rows,input={}){
 const offset=input.offset??0;
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000||input.domain&&!DOMAINS.includes(input.domain)||input.max_duration_minutes!==undefined&&(!Number.isFinite(input.max_duration_minutes)||input.max_duration_minutes<0))throw Error('Invalid archive query.');
 const minutesOf=row=>row.runtime??row.metadata?.runtime??(domainOf(row)==='anime'?row.metadata?.duration:null);
 const fold=require('./text-fold').search,q=fold(input.query||'');let unknownDuration=0;
 const selected=rows.filter(row=>{
  if(input.domain&&domainOf(row)!==input.domain||input.status&&(row.status||row.watchStatus||'unspecified')!==input.status||q&&!fold(row.title||'').includes(q))return false;
  if(input.max_duration_minutes!==undefined){const minutes=minutesOf(row);if(!Number.isFinite(minutes)||minutes<=0){unknownDuration++;return false;}if(minutes>input.max_duration_minutes)return false;}
  return true;
 }).map(row=>({source_ref:row.origin+':'+row.id,...(row.origin==='catalog'?{item_id:'catalog:'+row.id}:{}),owner:row.origin,id:row.id,revision:row.revision||hash(row),domain:domainOf(row),title:String(row.title||'').slice(0,300),status:row.status||row.watchStatus||'unspecified',rating:row.origin==='catalog'?ratingOf({rating:row.ratings?.personal}):ratingOf(row),ratingScale:'0-10',progress:row.progress??null,total:row.total??null,runtimeMinutes:minutesOf(row)??null,durationMeaning:['anime','series'].includes(domainOf(row))?'per-episode-minutes':domainOf(row)==='podcast'?'episode-minutes':'work-minutes',progressUnit:row.progressUnit||null,personalNote:String(row.note||'').slice(0,2000),manualResume:row.personalMedia?.manualResume?{episodeId:row.personalMedia.manualResume.episodeId,positionSeconds:row.personalMedia.manualResume.positionSeconds}:null,metadataMissing:!(row.genres||row.metadata?.genres)?.length})).sort((a,b)=>a.source_ref.localeCompare(b.source_ref));
 const snapshotRevision=hash([input.query||'',input.domain||null,input.status||null,input.max_duration_minutes??null,selected]);
 if(input.snapshot_revision&&input.snapshot_revision!==snapshotRevision)throw Error('Archive changed; restart the query. / ArÅŸiv deÄŸiÅŸti; sorguyu yeniden baÅŸlatÄ±n.');
 return {items:selected.slice(offset,offset+8),total:selected.length,offset,nextOffset:offset+8<selected.length?offset+8:null,snapshotRevision,unknownDuration,scope:'Existing catalog, imported collection and shelf source metadata only. Completion is not liking; missing ratings are unknown. No source text or external records were read.'};
}
module.exports={query};
