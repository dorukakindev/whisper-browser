'use strict';
// Bounded, read-only view of production runs for the assistant. It is built from the one persistent run record
// (dub-run-ledger) and says only what the record and the verified file check establish. It never carries paths,
// process ids, instance ids, raw logs, command lines, keys or settings content, and it starts nothing.
const PAGE=6;
const en=value=>String(value||'').split(' / ')[0].slice(0,400);
const KNOWN={
 interrupted:'The app instance that started this run is gone, so the run is over; no completed record was written.',
 uncertain:'It cannot be established whether this run is still active.',
 'running-elsewhere':'Another app instance reports this run as active; it is not touched from here.',
 running:'This app instance is running it now.',failed:'The record says the run failed.',cancelled:'The record says the run was cancelled.',
 partial:'The record has a result with failed groups, incomplete quality data or a worker error exit.',completed:'The record says the run completed.',
 'output-missing':'The record says completed, but the audio file is missing or invalid.'
};
function createVoiceRunsApi({ledger,current=()=>({}),active=()=>null,identity=()=>null}){
 const same=(id,openSource)=>{if(!openSource)return null;let open=null;try{open=identity(openSource);}catch(_){return null;}const pinned=ledger.sourceIdentityOf(id);return open&&pinned?open===pinned:null;};
 const row=(item,openSource)=>({run_id:item.id,title:String(item.label||'').slice(0,120),state:item.state,state_reason:item.reason?.code||null,started_at:item.startedAt,
  range_seconds:item.pinned?.range??null,profile:item.pinned?.profile??null,attempt:item.attempt,retry_of:item.retryOf||null,recovered:item.recovered===true,
  audio_file:{check:item.output.state,seconds:item.output.seconds},recoverable:item.recoverable,retryable:item.retryable,audio_unproven:item.unconfirmedOutput===true,
  error:item.error?{code:/\b(ENOENT|EACCES|EPERM|ENOSPC|ETIMEDOUT|ECONNRESET)\b/.exec(String(item.error))?.[1]||'recorded-error',message:'The run recorded a failure. Original details are available in the local production panel; raw worker text is not sent to the model.'}:null,source_matches_current_media:same(item.id,openSource)});
 const NOTE='audio_file.check "valid" means only that the file passes a WAV structure check. The audio was not listened to; its content, meaning and quality are unknown. A source match compares recorded identities, it does not prove the sections are the same content.';
 return {
  list({openSource='',offset=0}={}){
   const all=ledger.list({activeRunId:active(),limit:60}),rows=all.runs.slice(offset,offset+PAGE).map(item=>row(item,openSource));
   return {runs:rows,total:all.runs.length,nextOffset:offset+PAGE<all.runs.length?offset+PAGE:null,active_run_id:active(),unreadable_records:all.unreadable.length,ownerless_audio_files:all.orphans.length,note:NOTE};
  },
  detail(id,{openSource=''}={}){
   const found=ledger.detail(id,{activeRunId:active()});if(!found.ok)return null;
   const item=found.run,next=[];
   if(item.output.state==='valid'&&!['running','running-elsewhere'].includes(item.state))next.push('open_voice_run target=result: opens the run in the panel for listening-only review');
   if(item.retryable)next.push('preview_voice_retry shows the differences; open_voice_run target=retry_preview opens the panel preview, where the user approves');
   if(item.recoverable)next.push('The user can press "Recover the output" in the panel; the assistant cannot recover or start anything');
   return {run:row(item,openSource),source_navigation:{available:same(id,openSource)===true,reason:same(id,openSource)===true?'Can return to the matching currently open media.':'The record keeps an opaque source identity, not a locator to reopen another media. Open the original source first.'},what_the_record_establishes:KNOWN[item.state]||KNOWN.uncertain,why:(found.why||[]).map(entry=>en(entry.text)),settings:found.settings,dictionary_entries:found.dictionary,
    newer_attempt_completed:found.newerResult===true,later_attempts:(found.retries||[]).map(entry=>({run_id:entry.id,state:entry.state,attempt:entry.attempt})),
    unknown:[...(['uncertain','running-elsewhere'].includes(item.state)?['whether the run is still active']:[]),...(item.output.state==='valid'?['what the audio sounds like','whether its content matches the source']:[])],next_steps:next,note:NOTE};
  },
  preview(id,mode){
   const result=ledger.previewView(id,{settings:mode==='current'?'current':'pinned',current:current(),activeRunId:active()});
   if(!result.ok)return {ok:false,code:result.code,reason:en(result.reason),next_step:result.next?en(result.next):null,differences:result.differences||[]};
   return {ok:true,mode:result.mode,attempt:result.attempt,original_options:result.pinned,current_options:result.current,differences:result.differences,voice:{state:result.voice.state},
    cannot_be_rebuilt:result.unrebuildable.map(entry=>en(entry.text)),determinism:en(result.determinism),starts_nothing:true,note:'This is a read-only preview; no approval exists. Starting a retry needs the user\'s explicit approval in the panel.'};
  },
  sourceMatch:same,
  exists:id=>!!ledger.find(id)
 };
}
// Small, bounded facts for the activity card: which saved RECORD was read, and which MEDIA is open, kept apart.
function stepSummary(name,result){
 if(name==='inspect_voice_run'&&result?.run)return {voiceRun:{kind:'record',runId:result.run.run_id,title:result.run.title,state:result.run.state,audio:result.run.audio_file?.check,selected:result.selected_in_panel===result.run.run_id,
  matches:result.run.source_matches_current_media,mediaTitle:result.current_media?.title||'',unknown:(result.unknown||[]).length>0}};
 if(name==='get_voice_runs'&&Array.isArray(result?.runs))return {voiceRun:{kind:'list',count:result.total??result.runs.length,selectedTitle:(result.runs.find(row=>row.run_id===result.selected_in_panel)||{}).title||'',mediaTitle:result.current_media?.title||''}};
 return {};
}
module.exports={createVoiceRunsApi,stepSummary};
