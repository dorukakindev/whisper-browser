'use strict';
// Metadata-only inventory. Execution and runtime readiness stay in their existing owners.
const registry=require('./assistant-capabilities');
const {search:fold}=require('./text-fold');
const KINDS=new Set(['video','page','book','library','studio']),PAGE_SIZE=10;
function argumentsOf(args){
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['domain','query','offset'].includes(key)))throw Error('Invalid action inventory arguments.');
 const {domain='all',query='',offset=0}=args;
 if(typeof domain!=='string'||domain.length>40||typeof query!=='string'||query.length>400||!Number.isSafeInteger(offset)||offset<0||offset>1000)throw Error('Invalid action inventory arguments.');
 return {domain:domain.trim().toLowerCase()||'all',query:query.replace(/\0/g,'').trim(),offset};
}
function readiness(entry,owner,available){
 const checks={voice:['get_voice_status'],book:['get_book_context'],music:['get_music_context'],video:['get_source_context'],subtitles:['get_source_context','list_subtitle_tracks'],page:['get_source_context'],playback:['get_playback_state'],library:['get_source_context'],jobs:['get_job_status'],settings:['get_app_preferences']};
 let checkTools=checks[entry.domain]||[];
 if(['set_voice_reference','list_voice_references'].includes(entry.name))checkTools=['list_voice_references'];
 if(['get_job_status','get_job_result','cancel_job','use_job_subtitles'].includes(entry.name))checkTools=['get_job_status','get_job_result'];
 if(['get_workflow_settings','configure_workflow','undo_workflow_settings'].includes(entry.name))checkTools=['get_workflow_settings'];
 const missing=[];
 if(['video','voice','playback'].includes(entry.domain)&&owner.hasMedia!==true)missing.push('active_media_not_reported');
 if(entry.domain==='subtitles'&&owner.hasSubtitles!==true)missing.push('subtitle_scope_not_reported');
 const unverified=entry.domain==='voice'?['selected_subtitle_or_reference_readiness','current_voice_job_state']:entry.domain==='book'?['mounted_reader_or_narration_project_state']:checkTools.length?['current_tool_specific_selection_and_state']:[];
 return {verified:false,missing,unverified,checkTools:[...new Set(checkTools)].filter(name=>name!==entry.name&&available.has(name))};
}
function getActionOptions(owner,args={}){
 const {domain,query,offset}=argumentsOf(args),known=owner&&typeof owner==='object'&&!Array.isArray(owner)&&KINDS.has(owner.kind);
 const context=known?Object.fromEntries(['kind','hasFeedSources','hasFeedEntries','hasSubtitles','hasMedia','voiceStudio'].filter(key=>Object.hasOwn(owner,key)).map(key=>[key,owner[key]])):null;
 const available=context?registry.list(context):[],names=new Set(available.map(entry=>entry.name)),counts=new Map();
 for(const entry of available)counts.set(entry.domain,(counts.get(entry.domain)||0)+1);
 const terms=fold(query).split(/\s+/).filter(Boolean),matching=available.filter(entry=>(domain==='all'||entry.domain===domain)&&terms.every(term=>fold([entry.name,entry.domain,entry.label,entry.description].join(' ')).includes(term)));
 const tools=matching.slice(offset,offset+PAGE_SIZE).map(entry=>({name:entry.name,domain:entry.domain,label:entry.label,description:entry.description,policy:entry.policy,requiresApproval:entry.policy==='proposal',requiredArguments:[...(entry.parameters.required||[])],readiness:readiness(entry,context,names)}));
 return {status:'completed',scope:'current_workspace_registry',workspace:context?.kind||null,domain,query,offset,limit:PAGE_SIZE,total:matching.length,nextOffset:offset+tools.length<matching.length?offset+tools.length:null,domains:[...counts].map(([domain,count])=>({domain,count})),tools,limits:'Only tools connected to this current workspace are listed. Listed does not mean ready or authorized to execute. Proposal tools require the existing human approval flow. Readiness is unverified: missing flags mean not reported by the owner, not proof that a selected file/reference is absent. Read the listed current-state tools before acting; never invent IDs, settings, paths or unsupported actions.'};
}
module.exports=Object.freeze({getActionOptions});
