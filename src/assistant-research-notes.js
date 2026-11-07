'use strict';
// One source of truth: the existing notebook store/writer. Snapshots authorize reads and previews, never writes without confirmation.
const {randomUUID}=require('node:crypto');
const {annotationRevision}=require('./research-annotation-writer');
function createResearchNotes({notes,manifest,validateOwner=()=>true,now=Date.now}){
 const cards=new Map(),drafts=new Map(),TTL=600000;
 const fail=(code,error)=>({ok:false,code,error});
 const changed=()=>fail('source-changed','A referenced note changed or was removed. Review the current notes again. / Dayanak not değişti veya kaldırıldı. Güncel notları yeniden inceleyin.');
 const ownerOf=input=>{const owner=manifest.clean(input.owner);if(!validateOwner(owner))throw Error('Conversation or source changed / Sohbet veya kaynak değişti.');return owner;};
 const owns=(row,sender,owner)=>row&&row.sender===sender&&manifest.same(row.owner,owner)&&row.expires>now();
 function prune(){for(const map of [cards,drafts]){for(const [id,row]of map)if(row.expires<=now())map.delete(id);while(map.size>120)map.delete(map.keys().next().value);}}
 const provenTime=row=>row.timed===true&&Number.isFinite(row.start)&&row.start>=0&&(row.start>0||!!row.cueId||!!row.trackId);
 const publicNote=(row,id)=>({id,kind:'research-note',noteId:row.id,revision:annotationRevision(row),title:String(row.mediaTitle||'Saved note').slice(0,300),text:String(row.source||'').slice(0,4000),translation:String(row.translation||'').slice(0,4000),personalNote:String(row.note||'').slice(0,8000),origin:row.tags?.includes('AI draft')?'ai-draft':'saved-note',timed:provenTime(row),seconds:provenTime(row)?row.start:null});
 function snapshot(row,sender,owner){const id='N'+randomUUID(),card=publicNote(row,id);cards.set(id,{sender,owner,expires:now()+TTL,card});return card;}
 function resolve(id,sender,owner){const entry=cards.get(id);if(!owns(entry,sender,owner))return null;const row=notes.get(entry.card.noteId);return row&&annotationRevision(row)===entry.card.revision?{row,card:entry.card}:null;}
 const draftView=row=>({id:row.id,kind:'research-draft',draftId:row.id,title:'AI draft / AI taslağı',text:row.text,sourceCount:row.refs.length});
 function read(sender,input){prune();const owner=ownerOf(input),args=input.args||{};
  if(input.action==='search'){
   const query=String(args.query||'').trim();if(!query||query.length>400)return fail('query-required','Enter a literal text query / Düz metin sorgusu girin.');
   const rows=notes.list({query,...(args.media_type?{mediaType:args.media_type}:{})},9);
   return {ok:true,matches:rows.slice(0,8).map(row=>snapshot(row,sender,owner)),more:rows.length>8,limit:8,scope:'Literal local notebook text search; source quotations, saved translations and personal notes are separate. AI interpretations are not source facts. Unreturned notes were not read.'};
  }
  if(input.action==='read'){
   const ids=args.note_ids;if(!Array.isArray(ids)||!ids.length||ids.length>8||new Set(ids).size!==ids.length)return fail('invalid-selection','Select 1–8 distinct notes / 1–8 farklı not seçin.');
   const rows=ids.map(id=>typeof id==='string'&&notes.get(id));if(rows.some(row=>!row))return changed();
   return {ok:true,matches:rows.map(row=>snapshot(row,sender,owner)),limit:8,scope:'Only the explicitly requested saved notes; personal notes and prior AI drafts are interpretations, not verified source facts.'};
  }
  if(input.action==='draft'){
   const refs=args.source_ids,text=String(args.text||'').trim();
   if(!Array.isArray(refs)||!refs.length||refs.length>8||new Set(refs).size!==refs.length||!text||text.length>8000)return fail('invalid-draft','Select real note references and a draft up to 8000 characters / Gerçek not dayanakları ve en fazla 8000 karakterlik taslak gerekli.');
   if(refs.some(id=>!resolve(id,sender,owner)))return changed();
   if([...text.matchAll(/\[(N[a-f0-9-]{36})\]/g)].some(match=>!refs.includes(match[1])))return fail('unknown-reference','The draft cites an unselected note / Taslak seçilmemiş bir nota atıf yapıyor.');
   const id='D'+randomUUID(),row={id,sender,owner,refs:[...refs],text,expires:now()+TTL,preview:null,result:null};drafts.set(id,row);
   return {ok:true,draft:draftView(row),scope:'Unsaved AI interpretation. The person must edit/review, preview and confirm it; this created no notebook record.'};
  }
  return fail('unsupported','Unsupported read / Desteklenmeyen okuma.');
 }
 function handle(sender,input={}){prune();const owner=ownerOf(input);
  if(input.action==='inspect'){
   const resolved=resolve(input.id,sender,owner);return resolved?{ok:true,card:resolved.card,annotation:resolved.row}:changed();
  }
  const row=drafts.get(input.id);if(!owns(row,sender,owner))return fail('expired','Draft expired; prepare it again / Taslak eskidi; yeniden hazırlayın.');
  // A lost response must replay the exact confirmed result even if the referenced notes later change.
  if(input.action==='save'&&row.result&&input.token===row.result.token)return {...row.result.value,replayed:true};
  if(row.refs.some(id=>!resolve(id,sender,owner)))return changed();
  if(input.action==='get')return {ok:true,draft:draftView(row),sources:row.refs.map(id=>cards.get(id).card)};
  if(input.action==='preview'){
   const text=String(input.text||'').trim();if(!text||text.length>8000)return fail('invalid-text','Draft must contain 1–8000 characters / Taslak 1–8000 karakter olmalı.');
   if([...text.matchAll(/\[(N[a-f0-9-]{36})\]/g)].some(match=>!row.refs.includes(match[1])))return fail('unknown-reference','The draft cites an unselected note / Taslak seçilmemiş bir nota atıf yapıyor.');
   row.text=text;row.preview={token:randomUUID(),text};return {ok:true,token:row.preview.token,text,sources:row.refs.map(id=>cards.get(id).card)};
  }
  if(input.action==='save'){
   if(!row.preview||row.preview.token!==input.token||row.preview.text!==input.text)return fail('preview-changed','Preview the last visible draft again / Son görünen taslağı yeniden önizleyin.');
   const targetId='research-draft:'+row.id;
   if(notes.get(targetId))return fail('target-changed','The target note already exists; it was not overwritten / Hedef not zaten var; üzerine yazılmadı.');
   const source=row.refs.map(id=>{const c=cards.get(id).card;return '['+c.id+'] '+c.title+'\n'+c.text;}).join('\n\n');
   const first=resolve(row.refs[0],sender,owner).row;
   const saved=notes.save({id:targetId,mediaId:first.mediaId,mediaType:first.mediaType,mediaTitle:first.mediaTitle,type:'note',timed:false,source:source.slice(0,4000),note:row.preview.text,tags:['AI draft'],researchSources:row.refs.map(id=>{const c=cards.get(id).card;return {noteId:c.noteId,revision:c.revision};}),links:[]},{expectRevision:'new'});
   if(saved?.ok||saved?.committed)row.result={token:input.token,value:saved};return saved;
  }
  return fail('unsupported','Unsupported action / Desteklenmeyen işlem.');
 }
 return {read,handle};
}
module.exports={createResearchNotes};
