'use strict';
// The single canonical writer for research notes. Every caller (the research-notebook IPC and the source-bound
// podcast notes confirmed in the assistant) goes through save(); there is no second copy of this logic.
// `expectRevision` makes the write a compare-and-set: the revision of the note that would be replaced is checked
// in the same synchronous step as the write, so a note changed after a preview is never overwritten.
// The store, the watch index and the media registration are injected so tests drive the real code path.
const {createHash}=require('node:crypto');
const {normalizeAnnotation}=require('./browser-learning');

// Revision of the note a save would replace: 'new' when there is none. Shared by preview and write boundary.
function annotationRevision(existing){
 return existing?createHash('sha256').update(JSON.stringify([existing.updatedAt,existing.note])).digest('hex').slice(0,24):'new';
}

function createAnnotationWriter({store,index=()=>null,indexMedia=()=>{},now=Date.now}){
 function usable(){
  const target=store();
  return target.loadError||target.migrationError?{error:target.loadError||target.migrationError}:{target};
 }
 function save(raw,options={}){
  const annotation=normalizeAnnotation(raw||{});
  if(!annotation.id||!annotation.mediaId)return {ok:false,error:'Not ve medya kimliği gerekli.'};
  const {target,error}=usable();
  if(error)return {ok:false,error};
  if(typeof options.expectRevision==='string'&&annotationRevision(target.get(annotation.id))!==options.expectRevision){
   return {ok:false,code:'target-changed',error:'The saved note changed after this preview; nothing was saved. / Kayıtlı not önizlemeden sonra değişti; hiçbir şey kaydedilmedi.'};
  }
  let saved,committed=null;
  try{saved=target.upsert({...raw,id:annotation.id,mediaId:annotation.mediaId,updatedAt:now()});}
  catch(failure){
   // Rename committed but directory durability could not be confirmed: the note IS stored and memory matches disk.
   // Report that honestly (ok:false for old callers, committed:true for the ones that can tell) instead of a plain failure.
   if(failure?.committed!==true)throw failure;
   committed=failure;saved=target.get(annotation.id);
  }
  try{const watch=index();indexMedia(watch,saved);watch?.upsertAnnotation(saved);}catch(_){}
  return committed?{ok:false,committed:true,error:String(committed.message||committed),annotation:saved}:{ok:true,annotation:saved};
 }
 function get(id){
  try{const {target,error}=usable();return error?null:target.get(id);}catch(_){return null;}
 }
 return {save,get,revisionOf:annotationRevision};
}
module.exports={createAnnotationWriter,annotationRevision};
