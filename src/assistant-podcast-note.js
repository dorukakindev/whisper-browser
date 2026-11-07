'use strict';
// Source-bound podcast notes. Draft and preview never write. A save is bound, before any wait, to an immutable
// snapshot: the approved preview (token, exact text, draft revision), the exact saved source (search token), the
// owner, and the revision of the note it would replace. After every wait and again at the write boundary the
// snapshot is re-checked against the live draft; a newer preview, a cancelled draft, a changed owner/source or a
// note changed elsewhere refuses the save without writing. The new text is never written under an old approval.
// A repeated save (lost reply, double click) returns the first result instead of writing again.
const {createHash,randomUUID}=require('node:crypto');
const sources=require('./renderer/assistant-podcast-sources');
const {createReceipts}=require('./assistant-receipts');
const {annotationRevision}=require('./research-annotation-writer');
const sha=value=>createHash('sha256').update(value).digest('hex');
const MAX_NOTE=8000,TTL=10*60*1000,MAX_DRAFTS=40;
const OWNER='The conversation or source changed / Sohbet veya kaynak değişti.';
const GONE='The saved source was changed or removed; nothing was saved. Search again. / Kayıtlı kaynak değişmiş veya silinmiş; hiçbir şey kaydedilmedi. Yeniden ara.';
const OUTDATED='The note changed after this preview; preview it again before saving. Nothing was saved. / Not bu önizlemeden sonra değişti; kaydetmeden önce yeniden önizle. Hiçbir şey kaydedilmedi.';
const TARGET='The saved note changed after this preview; preview it again. Nothing was saved. / Kayıtlı not önizlemeden sonra değişti; yeniden önizle. Hiçbir şey kaydedilmedi.';
const CANCELLED='The note draft was cancelled; nothing was saved. / Not taslağı iptal edildi; hiçbir şey kaydedilmedi.';
const EXPIRED='This note draft expired; open it again. / Not taslağı eskidi; yeniden aç.';
const BUSY='Another note for this passage is being saved. Try again in a moment. / Bu pasaj için başka bir not kaydediliyor. Birazdan yeniden dene.';
const SAVING='This note is still being saved / Not hâlâ kaydediliyor.';

function createNotes({podcastSearch,notes,manifest,validateOwner=()=>true,receipts=createReceipts(),now=Date.now}){
 const drafts=new Map(),targets=new Map();
 const fail=(code,error,extra={})=>({ok:false,code,error,...extra});
 // A draft whose save is waiting is never pruned: its snapshot and receipt must outlive the wait.
 const prune=()=>{
  const time=now();
  for(const [id,draft] of drafts)if(!draft.saving&&draft.expires<=time)drafts.delete(id);
  for(const [id,draft] of drafts){if(drafts.size<=MAX_DRAFTS)break;if(!draft.saving)drafts.delete(id);}
 };
 const live=owner=>{try{return !!owner&&validateOwner(owner)===true;}catch(_){return false;}};
 const ownerOf=input=>{try{const owner=manifest.clean(input?.owner);return owner&&live(owner)?owner:null;}catch(_){return null;}};
 async function resolve(draft){
  let result;
  try{result=await podcastSearch(draft.locator);}catch(_){draft.stale=true;return fail('source-changed',GONE,{sourceChanged:true});}
  if(!result?.ok||result.row?.token!==draft.locator.token){draft.stale=true;return fail('source-changed',GONE,{sourceChanged:true});}
  return {row:result.row};
 }
 const annotationId=row=>'podcast-note:'+sha(JSON.stringify([row.episodeIdentity,row.sourceVersion,row.role,row.timed?row.seconds:null,row.quote])).slice(0,32);
 const view=(row,existing)=>({show:String(row.showTitle||'').slice(0,200),episode:String(row.episodeTitle||'').slice(0,300),role:row.role,timed:row.timed===true,
  seconds:row.timed?row.seconds:null,end:row.timed?row.end:null,quote:String(row.quote||'').slice(0,2000),access:'available',
  existing:existing?{note:String(existing.note||'').slice(0,MAX_NOTE),updatedAt:existing.updatedAt}:null});
 // Only verified time is stored; the quote and the exact source version/binding come from the saved source, never from the caller.
 const payload=(row,id,text)=>({id,type:'quote',mediaId:'podcast:'+row.episodeIdentity,mediaType:'podcast',
  mediaTitle:[row.showTitle,row.episodeTitle].filter(Boolean).join(' — ').slice(0,500),mediaUrl:'',source:row.quote,translation:'',note:text,
  timed:row.timed===true,start:row.timed?row.seconds:null,end:row.timed?row.end:null,
  trackId:(row.role==='translation'?'translation:':'publisher:')+row.episodeIdentity,cueId:'saved-search',
  sourceVersion:row.sourceVersion,sourceBinding:row.sourceBinding,episodeIdentity:row.episodeIdentity,playbackOwner:row.playbackOwner,sourceEntryId:row.sourceEntryId||''});

 async function save(sender,input,draft,owner){
  const token=typeof input.previewToken==='string'?input.previewToken:'',key=draft.id+':'+token;
  if(!draft.preview||draft.preview.token!==token)return fail('preview-outdated',OUTDATED);
  // A save whose preview was replaced is already refused at its next check; it must not block the new approval.
  const current=draft.saving;
  if(current&&(current.stage==='writing'||current.snapshot.preview===draft.preview))return fail('pending',SAVING,{pending:true});
  const holder=targets.get(draft.annotationId);
  if(holder&&holder.draft!==draft)return fail('target-busy',BUSY,{pending:true});
  // Immutable snapshot taken before any await. Nothing below reads the mutable draft.preview for what to write.
  const snapshot=Object.freeze({preview:draft.preview,token,text:draft.preview.text,revision:draft.preview.revision,targetRevision:draft.preview.targetRevision,
   locatorToken:draft.locator.token,annotationId:draft.annotationId,owner});
  const ticket={draft,stage:'verifying',snapshot};
  draft.saving=ticket;draft.expires=now()+TTL;targets.set(snapshot.annotationId,ticket);
  receipts.claim(key,{sender,owner,name:'podcast-note'});
  const refuse=(failure)=>{receipts.drop(key);return failure;};
  // Everything that can invalidate the approval, checked after each wait and at the write boundary.
  const stale=()=>{
   if(draft.cancelled)return fail('cancelled',CANCELLED);
   if(drafts.get(draft.id)!==draft)return fail('expired',EXPIRED);
   if(draft.preview!==snapshot.preview||draft.preview.token!==snapshot.token||draft.preview.text!==snapshot.text||draft.preview.revision!==snapshot.revision)return fail('preview-outdated',OUTDATED);
   if(!live(snapshot.owner))return fail('owner-changed',OWNER);
   return null;
  };
  try{
   const found=await resolve(draft);
   if(found.ok===false)return refuse(stale()||found);
   const changed=stale();if(changed)return refuse(changed);
   const existing=notes.get(snapshot.annotationId);
   if(annotationRevision(existing)!==snapshot.targetRevision)return refuse(fail('target-changed',TARGET));
   // Write boundary: no await between the checks above and the call. expectRevision repeats the target check inside the writer.
   ticket.stage='writing';
   let saved,committed=false;
   try{saved=await notes.save(payload(found.row,snapshot.annotationId,snapshot.text),{expectRevision:snapshot.targetRevision});}
   catch(error){
    if(error?.committed===true){committed=true;saved={ok:true};}
    else{
     // An exception is not proof that nothing was written: verify before reporting a plain failure.
     const after=notes.get(snapshot.annotationId);
     if(after&&annotationRevision(after)!==snapshot.targetRevision&&after.note===snapshot.text){committed=true;saved={ok:true};}else throw error;
    }
   }
   if(saved?.committed===true){committed=true;saved={ok:true};}
   if(saved?.code==='target-changed')return refuse(fail('target-changed',TARGET));
   if(!saved?.ok)throw Error(saved?.error||'The note could not be saved.');
   const result={annotationId:snapshot.annotationId,created:!existing,source:view(found.row,null),...(committed?{durable:false}:{})};
   draft.saved={annotationId:snapshot.annotationId,created:!existing};
   receipts.settle(key,{state:'settled',result});
   return {ok:true,...result};
  }catch(error){return refuse(fail('save-failed',String(error?.message||error).slice(0,300)));}
  finally{if(draft.saving===ticket)draft.saving=null;if(targets.get(snapshot.annotationId)===ticket)targets.delete(snapshot.annotationId);}
 }

 return {
  drafts,
  async handle(sender,input){
   prune();
   const action=input?.action;
   if(action==='draft'){
    const owner=ownerOf(input);if(!owner)return fail('owner-changed',OWNER);
    const locator=sources.cleanLocator(input.locator);if(!locator)return fail('invalid','Invalid source / Geçersiz kaynak.');
    const draft={id:randomUUID(),sender,owner,locator,revision:0,preview:null,saving:null,saved:null,cancelled:false,stale:false,expires:now()+TTL};
    const found=await resolve(draft);if(found.ok===false)return found;
    draft.annotationId=annotationId(found.row);drafts.set(draft.id,draft);
    const existing=notes.get(draft.annotationId);
    return {ok:true,draftId:draft.id,annotationId:draft.annotationId,source:view(found.row,existing),targetRevision:annotationRevision(existing)};
   }
   if(action==='save'){
    // A settled approval replays even after its draft expired (drafts live 10 minutes, receipts 30): a lost reply never saves twice.
    const receipt=receipts.get(String(input?.draftId||'')+':'+(typeof input?.previewToken==='string'?input.previewToken:''));
    if(receipt&&receipt.sender===sender){
     const owner=ownerOf(input);if(!owner||!manifest.same(receipt.owner,owner))return fail('owner-changed',OWNER);
     if(receipt.state==='applying')return fail('pending',SAVING,{pending:true});
     if(receipt.state==='settled')return {ok:true,replayed:true,...receipt.result};
    }
   }
   const draft=drafts.get(input?.draftId);
   if(!draft||draft.sender!==sender)return fail('expired',EXPIRED);
   const owner=ownerOf(input);if(!owner||!manifest.same(draft.owner,owner))return fail('owner-changed',OWNER);
   if(action==='cancel'){
    // A write in progress cannot be cancelled; a save still verifying is aborted at its next check; a finished write is never denied.
    if(draft.saving?.stage==='writing')return fail('pending',SAVING,{pending:true});
    drafts.delete(draft.id);draft.cancelled=true;
    return draft.saved?{ok:true,cancelled:false,saved:true,annotationId:draft.saved.annotationId}:{ok:true,cancelled:true,saved:false};
   }
   if(action==='preview'){
    if(typeof input.text!=='string')return fail('invalid','Invalid note text / Geçersiz not metni.');
    const text=input.text.replace(/\0/g,'').trim();
    if(text.length>MAX_NOTE)return fail('too-long','The note is limited to 8000 characters / Not en çok 8000 karakter olabilir.');
    if(draft.saving?.stage==='writing')return fail('pending',SAVING,{pending:true});
    const found=await resolve(draft);if(found.ok===false)return found;
    if(draft.cancelled||drafts.get(draft.id)!==draft)return fail('cancelled',CANCELLED);
    if(!live(owner))return fail('owner-changed',OWNER);
    if(draft.saving?.stage==='writing')return fail('pending',SAVING,{pending:true});
    const existing=notes.get(draft.annotationId),targetRevision=annotationRevision(existing);
    draft.revision+=1;
    // A new preview replaces the approvable text; any save of the older preview that is still verifying is refused at its next check.
    const approval=sha(JSON.stringify([draft.id,draft.revision,text,draft.locator.token,targetRevision]));
    draft.preview={token:approval,revision:draft.revision,text,targetRevision};draft.expires=now()+TTL;
    return {ok:true,revision:draft.revision,previewToken:approval,note:text,annotationId:draft.annotationId,targetRevision,source:view(found.row,existing)};
   }
   if(action==='save')return save(sender,input,draft,owner);
   return fail('invalid','Unknown note action / Bilinmeyen not işlemi.');
  }
 };
}
module.exports={createNotes};
