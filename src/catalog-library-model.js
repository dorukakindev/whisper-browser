'use strict';
const FIELD_LOCKS = ['title','originalTitle','year','synopsis','imdbId','tmdbId','genres','cast','runtime','directors','tagline','backdrop','tmdbRating','tmdbVotes','posterPath'];
const EXTRA_KINDS = ['trailer','behind-scenes','deleted-scene','interview','commentary','other'];
const clean = (value,max=120) => typeof value==='string'?value.trim().slice(0,max):'';
function relations(raw, old, sourceOf) {
  const list=(key,max)=>{const value=raw[key]??old?.[key]??[];if(!Array.isArray(value)||value.length>max)throw Error('Too many library sources.');return value;};
  const seen=new Set(),id=row=>{const value=clean(row?.id);if(!value||seen.has(value))throw Error('Invalid or duplicate library source ID.');seen.add(value);return value;};
  const source=row=>{const value=sourceOf(row);if(!value)throw Error('Invalid library playback source.');return value;};
  const editions=list('editions',30).map(row=>{const parts=row.parts??[];if(!Array.isArray(parts)||parts.length>30)throw Error('Too many movie parts.');return {id:id(row),label:clean(row.label,160)||'Edition',cut:clean(row.cut,160),source:source(row.source),parts:parts.map(part=>({id:id(part),label:clean(part.label,160)||'Part',source:source(part.source)}))};});
  const extras=list('extras',100).map(row=>({id:id(row),title:clean(row.title,160)||'Extra',kind:EXTRA_KINDS.includes(row.kind)?row.kind:'other',source:source(row.source)}));
  const fieldLocks=[...new Set(list('fieldLocks',FIELD_LOCKS.length).filter(field=>FIELD_LOCKS.includes(field)))];
  const selectedEditionId=clean(raw.selectedEditionId??old?.selectedEditionId);
  if(selectedEditionId&&!editions.some(row=>row.id===selectedEditionId))throw Error('Selected edition no longer exists.');
  return {editions,extras,fieldLocks,selectedEditionId};
}
function lockedPatch(item, patch) { const next={...patch};for(const key of item.fieldLocks||[])delete next[key];return next; }
function playbackSource(item,{editionId,partId,extraId}={}) {
  if(extraId){const extra=(item.extras||[]).find(row=>row.id===extraId);if(!extra)throw Error('Extra video not found.');return {source:extra.source,label:extra.title,extraId};}
  const key=editionId===undefined?item.selectedEditionId:editionId;
  if(!key){if(partId)throw Error('Choose the edition before its part.');return {source:item.source,label:'',editionId:''};}
  const edition=(item.editions||[]).find(row=>row.id===key);if(!edition)throw Error('Edition not found.');
  if(partId){const part=edition.parts.find(row=>row.id===partId);if(!part)throw Error('Movie part not found.');return {source:part.source,label:edition.label+' · '+part.label,editionId:key,partId};}
  return {source:edition.source,label:edition.label,editionId:key};
}
function allSources(item){return [item.source,...(item.episodes||[]).map(row=>row.source),...(item.editions||[]).flatMap(row=>[row.source,...(row.parts||[]).map(part=>part.source)]),...(item.extras||[]).map(row=>row.source)].filter(Boolean);}
module.exports={relations,lockedPatch,playbackSource,allSources,FIELD_LOCKS,EXTRA_KINDS};
