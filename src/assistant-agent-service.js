'use strict';
const {randomUUID}=require('node:crypto');
const registry=require('./assistant-capabilities'),manifest=require('./assistant-context-manifest'),provider=require('./assistant-provider');
const settingProposals=require('./assistant-setting-proposals');
const workflowPlan=require('./assistant-workflow-plan');
const runtimeTools=require('./assistant-runtime');
const fold=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').toLowerCase();
const identifier=value=>typeof value==='string'&&/^[\w-]{1,100}$/.test(value);
const workflowSnapshot=(name,state)=>JSON.stringify(name==='undo_workflow_settings'?{values:state.values,canUndo:state.canUndo,undoChanges:state.undoChanges}:state.values);

function register({app,ipcMain,authorized,getConfig,validateOwner=()=>true,fetchImpl=fetch,getJobs=()=>({jobs:[]}),cancelJob=async()=>({ok:false}),probeVideo=async()=>({ok:false}),resolveJobId=()=>null,researchWeb=async()=>({})}){
 const flows=require('./assistant-flows').createFlows({getJobs}),applications=new Map();
 const sessions=new Map(),proposals=new Map(),pending=new Map(),refreshable=new Map(),captionProbes=new Map(),jobBindings=new Map();
 const emit=(sender,packet)=>{if(!sender.isDestroyed())sender.send('assistant:agentEvent',packet);};
 function sameJobSource(binding,owner){return !!binding&&manifest.same({...binding.owner,thread:owner.thread},owner);}
 function jobResult(id,owner){
  const job=getJobs().jobs.find(row=>row.id===id);if(!job)throw Error('Unknown exact job / İlgili iş bulunamadı.');
  const binding=jobBindings.get(id);return {job:{...job,startedByAssistant:!!binding,sourceMatches:binding?sameJobSource(binding,owner):null,...(binding?{startedSource:{kind:binding.owner.kind,title:binding.owner.title,range:binding.owner.range}}:{})},note:'Progress is stage-specific. Artifacts are completion metadata, not listened audio or verified text quality.'};
 }
 function subtitleBinding(args,owner){
  const {job}=jobResult(args.job_id,owner),binding=jobBindings.get(args.job_id);
  if(!sameJobSource(binding,owner)||!['start_whisper','translate_captions','translate_video_captions'].includes(binding?.tool)||job.state!=='completed')throw Error('This exact completed subtitle job does not belong to the current source / Bu tamamlanmış altyazı işi açık kaynağa ait değil.');
  const artifacts=job.result?.artifacts?.filter(row=>row.role===args.role)||[];
  if(!artifacts.length||artifacts.some(row=>row.partial)&&args.allow_partial!==true)throw Error('No complete output of the requested role. Review partial results / İstenen rolde tam çıktı yok. Kısmi sonucu kontrol et.');
  return binding;
 }
 function requireOwner(owner){if(!owner.owner||!owner.thread||!validateOwner(owner))throw Error('The source changed / Kaynak değişti.');}
 function requestRenderer(sender,owner,name,args,signal,expectedSettings){
  requireOwner(owner);const callId=randomUUID(),budget=name==='analyze_title_reviews'?420000:['prepare_voice_reference','start_voice_generation','voice_group','pick_local_voice_reference','prepare_book_narration','start_book_narration','book_chapter','export_book_audio','load_title_reviews','get_film_page_info','get_film_person_info','translate_title_synopsis'].includes(name)?120000:name==='translate_video_captions'?100000:30000;
  return new Promise((resolve,reject)=>{
   const cancel=error=>{if(!pending.has(callId))return;emit(sender,{type:'action-cancel',callId});finish(null,error);};
   const abort=()=>cancel(Error(signal?.reason==='timeout'?'Application action timed out / Uygulama işlemi zaman aşımına uğradı.':'Assistant action cancelled / Asistan işlemi iptal edildi.'));
   const destroyed=()=>cancel(Error('Application window closed / Uygulama penceresi kapandı.'));
   const timer=setTimeout(()=>cancel(Error('Application action timed out / Uygulama işlemi zaman aşımına uğradı.')),budget);
   const finish=(value,error)=>{if(!pending.has(callId))return;pending.delete(callId);clearTimeout(timer);signal?.removeEventListener('abort',abort);sender.removeListener('destroyed',destroyed);error?reject(error):resolve(value);};
   pending.set(callId,{sender,owner,finish,cancel});signal?.addEventListener('abort',abort,{once:true});sender.once('destroyed',destroyed);
   if(signal?.aborted){abort();return;}if(sender.isDestroyed()){destroyed();return;}
   emit(sender,{type:'action',callId,owner,name,args,...(expectedSettings?{expectedSettings}:{}),deadline:Date.now()+budget});
  });
 }
 function settingsSnapshot(name,args,state,owner){
  if(name==='undo_app_preferences')registry.validate('set_app_preferences',state.undoChanges,owner);
  return settingProposals.snapshot(name,args,state);
 }
 async function captureSettings(sender,owner,row,signal){
  if(['set_app_preferences','undo_app_preferences','configure_voice_generation'].includes(row.name)){
   const state=await requestRenderer(sender,owner,row.name!=='configure_voice_generation'?'get_app_preferences':'get_voice_status',{},signal);
   row.settingsIdentity=settingsSnapshot(row.name,row.args,state,owner);
   row.summary=settingProposals.summary(row.name,row.args,row.settingsIdentity,row.locale);
   row.expectedSettings=row.name==='undo_app_preferences'?{kind:'preferences',...JSON.parse(row.settingsIdentity)}:{kind:row.name==='set_app_preferences'?'preferences':'voice',values:JSON.parse(row.settingsIdentity)};
  }
  if(['configure_workflow','undo_workflow_settings'].includes(row.name)){
   const state=await requestRenderer(sender,owner,'get_workflow_settings',{domain:row.args.domain},signal);
   if(state.status!=='completed'||!state.values)throw Error('Workflow settings unavailable.');
   if(row.name==='undo_workflow_settings'&&!state.canUndo)throw Error('No unchanged workflow action to undo.');
   row.workflowIdentity=workflowSnapshot(row.name,state);
   const changes=row.name==='configure_workflow'?require('./assistant-workflow-settings').parse(row.args.domain,row.args.changes_json):state.undoChanges;
   row.expectedSettings={kind:'workflow',domain:row.args.domain,values:Object.fromEntries(Object.keys(changes).map(key=>[key,state.values[key]])),...(row.name==='undo_workflow_settings'?{canUndo:state.canUndo,undoChanges:state.undoChanges}:{})};
   row.summary=require('./assistant-workflow-settings').summary(row.args.domain,row.name==='configure_workflow'?row.args.changes_json:JSON.stringify(state.undoChanges),row.locale,state);
  }
  if(['set_translation_profile','set_voice_reference'].includes(row.name)){
   const translation=row.name==='set_translation_profile';
   const state=await requestRenderer(sender,owner,translation?'get_translation_profile':'list_voice_references',translation?{profile_id:row.args.profile_id}:{},signal);
   const target=translation?state.profile:state.references?.find(ref=>ref.id===row.args.reference_id);
   if(state.status!=='completed'||!target||!identifier(state.selectionIdentity))throw Error('Current selection or requested target unavailable.');
   row.selectionIdentity=state.selectionIdentity;
   row.expectedSettings={kind:translation?'translation-profile':'voice-reference',identity:state.selectionIdentity};
   if(translation){row.translationIdentity=JSON.stringify(state.profile);row.summary=registry.describe(row.name,row.args,row.locale,owner).summary+' · '+state.profile.model+' ('+state.profile.provider+')';}
   else row.summary=(row.locale==='tr'?'Referans: ':'Reference: ')+target.name+(row.locale==='tr'?' · üretim başlamaz.':' · generation does not start.');
  }
  return row;
 }
 ipcMain.handle('assistant:agentResult',(event,input={})=>{
  if(!authorized(event)||!identifier(input.callId))return {ok:false};
  const call=pending.get(input.callId);if(!call||call.sender!==event.sender)return {ok:false};
  try{requireOwner(call.owner);}catch(error){call.cancel(error);return {ok:false};}
  let result=input.result;
  try{if(!result||typeof result!=='object'||Array.isArray(result)||!['completed','accepted','failed'].includes(result.status)||JSON.stringify(result).length>16000)throw Error('Invalid result');}
  catch(_){result={status:'failed',error:'Invalid application result.'};}
  call.finish(result);return {ok:true};
 });
 ipcMain.handle('assistant:agentMessage',(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized running-task message.'};
  try{const session=sessions.get(event.sender.id),owner=manifest.clean(input.owner);
   if(!session||session.id!==input.requestId||session.reviewMode||session.controller.signal.aborted||!manifest.same(owner,session.owner))throw Error('This task/source is no longer active / Bu görev/kaynak artık etkin değil.');
   requireOwner(session.owner);const receipt=session.runtime.enqueue(input.mode,input.text),invalidatedProposalIds=[];
   if(input.mode==='steer')for(const [id,row]of proposals)if(row.sender===event.sender&&row.runId===session.id){proposals.delete(id);invalidatedProposalIds.push(id);}
   emit(event.sender,{type:'runtime-message',requestId:session.id,receipt,invalidatedProposalIds});return {ok:true,receipt,invalidatedProposalIds};
  }catch(error){return {ok:false,error:String(error.message).slice(0,300)};}
 });
 ipcMain.handle('assistant:agentRun',async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized assistant request.'};
  if(sessions.has(event.sender.id)||applications.has(event.sender.id))return {ok:false,error:'Assistant is already running / Asistan zaten çalışıyor.'};
  let controller,session,timer,stop,resumed;
  try{
   if(!identifier(input.requestId)||typeof input.question!=='string'||!input.question.trim()||input.question.length>16000||JSON.stringify(input).length>4*1024*1024)throw Error('Invalid assistant request.');
   if(input.responseContract!==undefined&&!['review-analysis','recall-analysis'].includes(input.responseContract))throw Error('Invalid assistant response contract.');
   const owner=manifest.clean(input.owner);requireOwner(owner);
   const recallMode=input.responseContract==='recall-analysis',recallContract=recallMode?require('./assistant-recall-contract'):null,recallEvidence=recallMode?recallContract.normalize(input.context?.recallAnalysis):null;
   const reviewMode=input.responseContract==='review-analysis'||recallMode,reviewModel=reviewMode&&!recallMode?require('./renderer/media-tools-model'):null;
   const reviewContext=reviewMode&&!recallMode?reviewModel.normalizeReviewAnalysis(input.context?.reviewAnalysis):null;
   if(reviewMode&&(!recallMode&&!reviewContext||owner.kind!=='library'||recallMode&&!owner.hasFeedSources||input.continuationId!==undefined))throw Error('Review analysis requires a valid library review sample without continuation.');
   const reviewEvidence=reviewMode&&!recallMode?JSON.parse(reviewContext):null;
   resumed=input.continuationId?flows.resume(input.continuationId,event.sender.id,owner,{deferCommit:true}):null;
   if(resumed?.waiting)return {ok:true,waiting:true,text:resumed.text};
   const flow=resumed?.flow||flows.start(event.sender.id,owner,input.question);
   const sourcePool=manifest.pool(reviewMode?[]:input.pool);owner.hasSubtitles=sourcePool.length>0;
   const config=getConfig();
   controller=new AbortController();session={id:input.requestId,controller,owner,flow,reviewMode,runtime:runtimeTools.createRuntime(input.requestId)};sessions.set(event.sender.id,session);
   stop=()=>controller.abort('closed');event.sender.once('destroyed',stop);timer=setTimeout(()=>controller.abort('timeout'),require('./assistant-settings').timeout(config));
   const evidence=new Map(),offered=new Map(),planned=new Set();let attempted=0,failed=0;
   const executeUnchecked=async(name,args,onPartial)=>{
    controller.signal.throwIfAborted();requireOwner(owner);const entry=registry.get(name);
    if(name==='probe_video_captions'){
     const result=await probeVideo(owner,controller.signal);controller.signal.throwIfAborted();requireOwner(owner);
     if(!result?.ok)throw Error(result?.error||'Caption probe failed.');
     const available=(result.data?.subtitleLangs||[]).slice(0,500).filter(row=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,40}$/.test(row.code));
     const languages=available.sort((a,b)=>Number(a.auto)-Number(b.auto)||Number(!/^(?:en|tr)(?:-|$)/.test(a.code))-Number(!/^(?:en|tr)(?:-|$)/.test(b.code))).slice(0,80).map(row=>({id:'yt-'+(row.auto?'auto':'manual')+':'+row.code,language:row.code,automatic:row.auto===true}));
     captionProbes.set(event.sender.id,{owner,languages,expires:Date.now()+300000});return {languages,truncated:available.length>languages.length,note:'Choose a listed caption ID. No captions means Whisper must be explicitly requested; it was not started.'};
    }
    if(name==='search_app_guide')return require('./assistant-guide').lookup(args.query);
    if(name==='app_help')return {capabilities:registry.help(owner,args.domain||'all'),limits:'Only listed assistant tools are connected. Book, dubbing, library and normal settings tools are source/domain dependent. Do not claim unlisted controls or access to secrets, files, arbitrary browser automation or the full book.'};
    if(name==='research_web'){
     const result=await researchWeb(args.query,controller.signal,onPartial);controller.signal.throwIfAborted();requireOwner(owner);
     const safeSource=require('./assistant-web-research').safeSource;
     const sources=(Array.isArray(result.sources)?result.sources:[]).filter(row=>row&&safeSource(row.url)).slice(0,10).map(row=>({url:safeSource(row.url),title:String(row.title||'').slice(0,200)}));
     const readable=(Array.isArray(result.passages)?result.passages:[]).filter(row=>row&&typeof row.text==='string'&&row.text.trim()&&sources.some(source=>source.url===safeSource(row.url))).slice(0,10);
     const providerText=typeof result.text==='string'?result.text.trim().slice(0,16000):'';
     if(result.ok===false||result.status&&result.status!=='completed'||!sources.length||!readable.length&&!providerText)throw Error('No sourced web evidence received / Kaynaklı web kanıtı alınamadı.');
     session.webSources=[...new Map([...(session.webSources||[]),...sources].map(row=>[row.url,row])).values()].slice(0,10);
     const passages=readable.flatMap(row=>{const url=safeSource(row.url),at=session.webSources.findIndex(source=>source.url===url);return at<0?[]:[{id:'W'+(at+1),url,title:String(row.title||'').slice(0,200),text:row.text.slice(0,6000),truncated:row.truncated===true||row.text.length>6000}];});
     // A passage response cannot fall back to its original local W labels when
     // all of its URLs were excluded by the session source budget.
     const synthesisAllowed=!readable.length&&sources.every(row=>session.webSources.some(accepted=>accepted.url===row.url));
     return {status:'completed',method:result.method||'provider',sourceKind:passages.length?'web_page_excerpts':'provider_synthesis',scope:result.scope||'External research, separate from the attached open page. Provider synthesis is not a verbatim source excerpt.',text:passages.length?passages.map(row=>'['+row.id+'] '+row.title+'\n'+row.url+'\n'+row.text).join('\n\n'):synthesisAllowed?providerText:'',sources:session.webSources,passages,blocked:result.blocked||[]};
    }
    if(name==='get_job_status'){const state=getJobs(),ordered=[...state.jobs.filter(job=>['running','cancelling'].includes(job.state)),...state.jobs.filter(job=>!['running','cancelling'].includes(job.state))],offset=args.offset||0;return {revision:state.revision,jobs:args.job_id?[jobResult(args.job_id,owner).job]:ordered.slice(offset,offset+5).map(job=>jobResult(job.id,owner).job),total:state.jobs.length,nextOffset:!args.job_id&&offset+5<ordered.length?offset+5:null};}
    if(name==='get_job_result')return jobResult(args.job_id,owner);
    if(name==='get_workflow_plan')return workflowPlan.build(owner,args.goal);
    if(name==='get_source_context')return {source:manifest.publicContext(owner),data:manifest.sourceText(input.context,10000),translationChoices:workflowPlan.translationChoices(owner)};
    if(name==='list_subtitle_tracks')return {tracks:owner.tracks};
    if(name==='search_subtitles'||name==='get_current_subtitle'){
     const result=await requestRenderer(event.sender,owner,name,args,controller.signal);
     controller.signal.throwIfAborted();requireOwner(owner);
     if(result?.status!=='completed')throw Error(result?.error||'Subtitle retrieval failed.');
     if(!Array.isArray(result.matches)||result.matches.length>8||!['watched','nearby','full'].includes(result.transcriptScope)||!Number.isFinite(result.position)||result.position<0||!Number.isSafeInteger(result.searchedCues)||result.searchedCues<result.matches.length)throw Error('Invalid subtitle retrieval result.');
     const matches=manifest.pool(result.matches);
     if(matches.length!==result.matches.length||result.matches.some(row=>typeof row.text!=='string'||typeof row.translation!=='string'||!/^U(?:0|[1-9]\d*)$/.test(row.id)||!Number.isSafeInteger(Number(row.id.slice(1)))||(result.transcriptScope==='watched'&&row.start>result.position+.75)||(result.transcriptScope==='nearby'&&Math.abs(row.start-result.position)>180)||(name==='get_current_subtitle'&&(row.start>result.position||row.end<result.position))))throw Error('Invalid subtitle retrieval evidence.');
     for(const row of matches)evidence.set(row.id,row);
     emit(event.sender,{type:'evidence',requestId:session.id,evidence:[...evidence.values()]});
     return {status:'completed',matches,transcriptScope:result.transcriptScope,position:result.position,searchedCues:result.searchedCues,scope:'The complete currently eligible subtitle rows were searched; only bounded matching excerpts are returned. The rest of the transcript was not read.'};
    }
    if(entry.policy==='proposal'){
     attempted++;
     if(['translate_page','translate_captions','translate_video_captions','start_whisper'].includes(name)&&workflowPlan.ambiguousTranslation(input.question,owner))return {status:'blocked',note:'The current request does not select a translation source. Ask whether the human means this web page, existing captions, YouTube captions or Whisper audio. No card was created and no job started.',translationChoices:workflowPlan.translationChoices(owner)};
     if(!flows.retryAllowed(flow,name,args))return {status:'blocked',note:'The previous exact job failed. Only retry its same stage and arguments with a new approval card. Completed earlier stages and dependent stages are blocked.'};
     const signature=name+':'+JSON.stringify(Object.fromEntries(Object.keys(args).sort().map(key=>[key,args[key]])));
     if(offered.has(signature))return {...offered.get(signature),note:'This exact review card already exists. It has not run.'};
     const previous=[...offered.values()].map(row=>row.tool);
     const prerequisite=previous.find(prior=>(['start_whisper','translate_video_captions','translate_captions'].includes(prior)&&entry.domain==='voice')||(['configure_voice_generation','prepare_voice_reference','set_voice_reference'].includes(prior)&&['start_voice_generation','use_generated_voice'].includes(name))||(['prepare_book_narration','select_book_chapters','start_book_narration'].includes(prior)&&['start_book_narration','export_book_audio'].includes(name)));
     if(prerequisite){return {status:'blocked',note:'Apply the prerequisite card '+prerequisite+' first, then Continue with result after exact job completion. No dependent card or job was created.'};}

     if(entry.domain==='voice'){
      const subtitleIndex=flow.steps.findLastIndex(step=>['start_whisper','translate_video_captions','translate_captions'].includes(step.tool));
      const subtitle=flow.steps[subtitleIndex];
      if(subtitle?.jobId){
       const role=subtitle.tool==='start_whisper'&&!subtitle.args.translate?'source':'translation';
       const attached=flow.steps.slice(subtitleIndex+1).some(step=>step.tool==='use_job_subtitles'&&step.status==='completed'&&step.args.job_id===subtitle.jobId&&step.args.role===role&&step.result?.track?.role===role);
       if(!attached)return {status:'blocked',note:'Load this exact job output before voice preparation: use_job_subtitles with job_id '+subtitle.jobId+' and role '+role+'. A previously loaded subtitle is not proof that the new translation was loaded. Partial output still requires explicit partial-result review. No voice card or job was created.'};
      }
     }

     if(flows.repeated(flow,name,args))return {status:'completed',note:'This exact step already ran in this flow. Read current status; do not repeat it.'};
     if(name==='translate_video_captions'){const probe=captionProbes.get(event.sender.id);if(!probe||probe.expires<Date.now()||!manifest.same(probe.owner,owner)||!probe.languages.some(row=>row.id===args.caption_id))throw Error('Probe this video first and select a real caption ID.');}
     if(name==='use_job_subtitles')subtitleBinding(args,owner);
     if(name==='cancel_job'&&!getJobs().jobs.some(row=>row.id===args.job_id&&row.cancellable))throw Error('Job is no longer cancellable.');
     if(['seek_to_time','preview_translation_change','open_subtitle_editor'].includes(name)&&!sourcePool.some(row=>row.id===args.source_id)&&!evidence.has(args.source_id))throw Error('Unknown source subtitle ID.');
     if(['translate_captions','load_caption_track'].includes(name)&&!owner.tracks.some(row=>row.id===args.track_id&&(name==='load_caption_track'||row.role==='source')))throw Error('Unknown source track ID.');
     for(const [key,row] of proposals)if(row.expires<Date.now())proposals.delete(key);
     const existing=[...proposals].find(([,row])=>row.flow===flow&&row.name===name&&JSON.stringify(row.args)===JSON.stringify(args));
     if(existing){const [proposalId,row]=existing,action={kind:'app_action',proposalId,tool:name,label:row.label,summary:row.summary};emit(event.sender,{type:'proposal',requestId:session.id,action});const receipt={status:'proposed',label:row.label,proposalId,tool:name,note:'The existing un-applied card was reused. It has not run.'};offered.set(signature,receipt);return receipt;}
     if(proposals.size>=100||session.proposalCount>=8)throw Error('Too many pending assistant actions.');
     session.proposalCount=(session.proposalCount||0)+1;
     const proposalId=randomUUID();let libraryIdentity,collectionIdentity,workflowIdentity,translationIdentity,personalMediaIdentity,personalMediaSettings;let {label,summary}=registry.describe(name,args,input.locale,owner);

     if(args.translation_profile||name==='set_translation_profile'){const state=await requestRenderer(event.sender,owner,'get_translation_profile',{profile_id:args.translation_profile||args.profile_id},controller.signal);if(state.status!=='completed'||!state.profile)throw Error('Configured translation model unavailable.');translationIdentity=JSON.stringify(state.profile);summary+=' · '+state.profile.model+' ('+state.profile.provider+')';}
     if(name==='set_voice_reference'){const state=await requestRenderer(event.sender,owner,'list_voice_references',{},controller.signal);const ref=state.references?.find(row=>row.id===args.reference_id);if(!ref)throw Error('Unknown saved voice reference.');summary=(input.locale==='tr'?'Referans: ':'Reference: ')+ref.name+(input.locale==='tr'?' · üretim başlamaz.':' · generation does not start.');}
     if(['voice_group','use_generated_voice','start_voice_generation'].includes(name)){const state=await requestRenderer(event.sender,owner,'get_voice_status',name==='voice_group'?{group_id:args.group_id}:{},controller.signal);const voice=state.voice;if(!voice||voice.busy)throw Error('Voice panel unavailable or busy.');if(name==='voice_group'){const group=voice.groups?.find(row=>row.id===args.group_id);if(!group)throw Error('Unknown current voice group.');summary=(input.locale==='tr'?'Grup ':'Group ')+group.number+' · '+summary;}if(name==='use_generated_voice'&&(!voice.output||voice.output.id!==args.output_id||voice.output.sample||voice.output.syncInvalid))throw Error('No matching full voice output.');if(name==='start_voice_generation'&&(!voice.subtitleReady||!voice.engineAndReferenceReady))throw Error('Open voice preparation and select subtitles/reference first.');}
     if(entry.domain==='book'){
      const state=await requestRenderer(event.sender,owner,'get_book_context',{},controller.signal);
      if(name==='prepare_book_narration'){
       if(!state.reader?.canPrepare)throw Error('Open a source page/chapter first.');
       const source=state.reader.source;
       if(typeof source?.text==='string'&&!source.text.trim())throw Error('The current page/chapter has no readable text / Açık sayfa/bölümde okunabilir metin yok.');
       if(source?.type==='book-page'&&(args.to-args.from>=100||Number.isInteger(source.totalPages)&&args.to>source.totalPages))throw Error('Choose 1–100 pages within the current PDF / Güncel PDF içinde 1–100 sayfa seç.');
       if(source?.type==='book-chapter'&&(args.from!==source.chapterNumber||args.to!==source.chapterNumber||args.text==='translation'))throw Error('Prepare the current original chapter; select other chapters in production / Güncel özgün bölümü hazırla; diğer bölümleri üretimde seç.');
      }else{
       if(!state.production||state.production.busy)throw Error('Open idle book production first.');
       if(['start_book_narration','export_book_audio'].includes(name)&&state.production.selectedCount===0)throw Error('Select production chapters first / Önce üretim bölümlerini seç.');
       if(Number.isInteger(state.production.total)&&(args.to>state.production.total||args.chapter>state.production.total))throw Error('Chapter is outside this production project / Bölüm bu üretim projesinin dışında.');
      }
      summary=String(state.reader?.source?.title||state.production?.title||owner.title).slice(0,120)+' · '+summary;
     }
     if(entry.domain==='library'&&args.item_id&&!(name==='propose_personal_media_update'&&args.item_id.startsWith('content:'))){const state=await requestRenderer(event.sender,owner,'get_title_details',{item_id:args.item_id},controller.signal);if(!state.item||!state.identity)throw Error('Title identity unavailable.');libraryIdentity=state.identity;summary=String(state.item.title).slice(0,160)+' · '+summary;}
     if(name==='propose_personal_media_update'){
      if(['page','video'].includes(owner.kind)){
       const match=await requestRenderer(event.sender,owner,'get_current_media_match',{},controller.signal);
       const content=args.item_id.startsWith('content:');
       if(content&&(args.season!==undefined||/\b(?:film\w*|movie\w*|series|season\w*|episode\w*|dizi\w*|bolum\w*|sezon\w*|s\d+e\d+)\b/i.test(fold(flow.question))))return {status:'blocked',needsSelection:true,candidates:match.candidates||[],note:'Current web content does not prove a film, series or episode identity. Ask the human to choose the exact title first. No update card or write was created.'};
       const details=content?await requestRenderer(event.sender,owner,'read_personal_media',{item_id:args.item_id},controller.signal):await requestRenderer(event.sender,owner,'get_title_details',{item_id:args.item_id},controller.signal);
       const named=fold(flow.question).includes(fold(details.item?.title))&&!!fold(details.item?.title);
       if((content||!named)&&(match.status!=='completed'||match.needsSelection||match.item?.item_id!==args.item_id))return {status:'blocked',needsSelection:true,candidates:match.candidates||[],note:'The browser source is not proven to be this title. Ask the human to choose a returned title; no update card or write was created.'};
      }
      const state=await requestRenderer(event.sender,owner,name,args,controller.signal);
      if(state.status!=='completed'||state.operation!=='preview'||!state.token||!state.personalIdentity||!state.preview||!state.owner)throw Error(state.error||'Personal media preview unavailable.');
      personalMediaIdentity=state.personalIdentity;personalMediaSettings={kind:'personal-media',token:state.token,itemId:args.item_id,args:JSON.stringify(args),owner:state.owner};summary=String(state.summary||summary).slice(0,4500);
     }
     if(name==='apply_library_collection'){const state=await requestRenderer(event.sender,owner,'get_collection_plan',{plan_id:args.plan_id},controller.signal);if(!state.plan)throw Error('Collection plan unavailable.');collectionIdentity=JSON.stringify(state.plan);summary=(state.plan.member===false?(input.locale==='tr'?'Üyelikten çıkar: ':'Remove membership: '):(input.locale==='tr'?'Üyeliğe ekle: ':'Add membership: '))+state.plan.name+' · '+state.plan.items.map(row=>row.title).join(', ').slice(0,1200);}
     controller.signal.throwIfAborted();requireOwner(owner);
     const row=await captureSettings(event.sender,owner,{sender:event.sender,owner,name,args,flow,label,summary,locale:input.locale,libraryIdentity,collectionIdentity,workflowIdentity,translationIdentity,personalMediaIdentity,...(personalMediaSettings?{expectedSettings:personalMediaSettings}:{}),expires:Date.now()+10*60*1000},controller.signal);
     summary=row.summary;const action={kind:'app_action',proposalId,tool:name,label,summary};
     row.runId=session.id;row.intentRevision=session.runtime.revision;proposals.set(proposalId,row);
     emit(event.sender,{type:'proposal',requestId:session.id,action});
     const receipt={status:'proposed',label,proposalId,tool:name,note:'A real action card was created. It has not run; the user may apply it.'};offered.set(signature,receipt);if(name==='apply_library_collection')planned.delete(args.plan_id);return receipt;
    }
    const result=await requestRenderer(event.sender,owner,name,args,controller.signal);if(name==='search_book'&&result.status==='completed'){session.bookCitations=[...(session.bookCitations||[]),...(result.matches||[]).filter(hit=>hit.navigable&&typeof hit.sourceId==='string'&&Number.isInteger(hit.page)).map(hit=>({id:hit.id,sourceId:hit.sourceId,page:hit.page,kind:hit.kind,text:String(hit.text||hit.excerpt||'').slice(0,600)}))].slice(-40);}if(name==='plan_library_collection'&&result.status==='completed'&&result.plan?.id)planned.add(result.plan.id);return result;
   };
   const execute=async(name,args,metadata={})=>{
    const traceId=randomUUID(),traceStarted=Date.now(),intentRevision=session.runtime.revision,sourceRevision=runtimeTools.sourceKey(owner);let sequence=0,finished=false;
    const publishRead=(value,final=false)=>{if(finished||controller.signal.aborted||!validateOwner(owner)||session.runtime.revision!==intentRevision)return;emit(event.sender,{type:'read-progress',requestId:session.id,callId:traceId,providerCallId:metadata.providerCallId,name,intentRevision,sourceRevision,sequence:++sequence,final,value:runtimeTools.partial(value)});};
    emit(event.sender,{type:'tool-step',requestId:session.id,step:{id:traceId,name,state:'running',intentRevision,started:traceStarted}});emit(event.sender,{type:'progress',requestId:session.id,phase:'tool',domain:name==='research_web'?'web':registry.get(name)?.domain||''});
    try{const result=await executeUnchecked(name,args,name==='research_web'?value=>publishRead(value):undefined);if(['failed','blocked'].includes(result?.status))failed++;if(sequence)publishRead({},true);finished=true;emit(event.sender,{type:'tool-step',requestId:session.id,step:{id:traceId,name,intentRevision,state:['proposed','failed','blocked','accepted'].includes(result?.status)?result.status:'completed',elapsedMs:Date.now()-traceStarted}});return result;}
    catch(error){finished=true;if(!controller.signal.aborted)failed++;emit(event.sender,{type:'tool-step',requestId:session.id,step:{id:traceId,name,intentRevision,state:controller.signal.aborted?'stopped':'failed',elapsedMs:Date.now()-traceStarted}});throw error;}
    finally{finished=true;if(!controller.signal.aborted)emit(event.sender,{type:'progress',requestId:session.id,phase:'thinking'});}
   };
   const result=await provider.run({question:flow.question,responseContract:input.responseContract,continuation:reviewMode?[]:flows.evidence(flow),history:reviewMode?[]:input.history,context:reviewMode?(recallMode?{type:'recall-sources',recallAnalysis:recallEvidence}:{...input.context,reviewAnalysis:reviewContext}):input.context,owner,pool:sourcePool,locale:input.locale,config,signal:controller.signal,fetchImpl,
    takeMessages:mode=>{requireOwner(owner);return session.runtime.take(mode);},
    onHumanMessages:rows=>{const invalidatedProposalIds=[];if(rows.some(row=>row.mode==='steer')){offered.clear();planned.clear();for(const [id,row]of proposals)if(row.sender===event.sender&&row.runId===session.id){proposals.delete(id);invalidatedProposalIds.push(id);}}flow.question=(flow.question+'\n\n'+rows.map(row=>'Latest human '+row.mode+': '+row.text).join('\n')).slice(-16000);emit(event.sender,{type:'runtime-delivered',requestId:session.id,messages:rows,intentRevision:session.runtime.revision,invalidatedProposalIds});},
    onProgress:phase=>{if(!controller.signal.aborted&&validateOwner(owner))emit(event.sender,{type:'progress',requestId:session.id,phase});},
    onDelta:text=>emit(event.sender,{type:'delta',requestId:session.id,text}),
    onReplace:text=>emit(event.sender,{type:'replace',requestId:session.id,text}),
    onCapability:value=>emit(event.sender,{type:'capabilities',requestId:session.id,value}),execute});
   controller.signal.throwIfAborted();requireOwner(owner);
   if(reviewMode)result.text=JSON.stringify(recallMode?recallContract.parseAnswer(result.text,recallEvidence):reviewModel.parseDecisionResponse(result.text,reviewEvidence.reviews));
   if(!reviewMode&&session.webSources?.length)result.text=result.text.slice(0,28000)+'\n\n'+(input.locale==='tr'?'Web kaynakları:':'Web sources:')+'\n'+session.webSources.map((row,i)=>'[W'+(i+1)+'] '+String(row.title).slice(0,200)+'\n'+row.url).join('\n');
   if(!reviewMode&&failed)result.text=result.text.slice(0,29500)+'\n\n'+(input.locale==='tr'?failed+' araç kontrolü başarısız veya engellendi; bu kısımların sonucu doğrulanamadı.':failed+' tool checks failed or were blocked; those parts could not be verified.');
   const execution={cards:offered.size,pendingPlans:planned.size,attempted,blockedOrFailed:failed,appliedActions:0};
   let structuredAnswer=false;try{const parsed=JSON.parse(result.text);structuredAnswer=parsed!==null&&typeof parsed==='object';}catch{}
   if(!reviewMode&&(attempted||planned.size||(!structuredAnswer&&/kart|\bcard\b|başlat|started|tamamlan|completed/i.test(result.text)))){const tr=input.locale==='tr';const note=tr?'Uygulama doğrulaması: '+offered.size+' gerçek işlem kartı oluşturuldu; bu istek kartları uygulamadı, transkripsiyon/dublaj başlatmadı.':'Application verification: '+offered.size+' real action cards created; this request applied no cards and started no transcription/dubbing.';const extra=planned.size?(tr?' Koleksiyon planı yalnız veri; uygulanabilir kartı henüz yok.':' A collection plan is data only; its review card is still missing.'):'';result.text=result.text.slice(0,30500)+'\n\n'+note+extra;}
   resumed?.settle?.(true);return {ok:true,...result,runtime:session.runtime.snapshot(),execution,bookCitations:session.bookCitations||[]};
  }catch(error){const timedOut=controller?.signal.aborted&&controller.signal.reason==='timeout';return {ok:false,runtime:session?.runtime?.snapshot(),timedOut:!!timedOut,cancelled:!!controller?.signal.aborted&&!timedOut,error:timedOut?'Assistant timed out. Received text was kept; you can retry / Asistan zaman aşımına uğradı. Alınan metin korundu; yeniden deneyebilirsin.':controller?.signal.aborted?'Assistant stopped / Asistan durduruldu.':String(error.message).slice(0,300)};}
  finally{session?.runtime?.close();resumed?.settle?.(false);clearTimeout(timer);if(stop)event.sender.removeListener('destroyed',stop);if(sessions.get(event.sender.id)===session)sessions.delete(event.sender.id);}
 });
 ipcMain.handle('assistant:agentCancel',(event,input={})=>{
  if(!authorized(event))return {ok:false};const session=sessions.get(event.sender.id);
  if(session&&session.id===input.requestId)session.controller.abort('user');const applying=applications.get(event.sender.id);if(applying?.id===input.requestId)applying.controller.abort('user');return {ok:true};
 });
 ipcMain.handle('assistant:agentApply',async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized assistant action.'};
  if(sessions.has(event.sender.id)||applications.has(event.sender.id))return {ok:false,error:'Another assistant action is running / Başka asistan işlemi sürüyor.'};
  if(input.mode==='refresh')return refreshProposal(event,input);
  const row=proposals.get(input.proposalId);if(!row||row.sender!==event.sender)return {ok:false,error:'This action expired; ask again / Öneri eskidi; yeniden iste.'};
  try{
   const current=manifest.clean(input.owner);if(row.expires<Date.now()||!manifest.same(row.owner,current))throw Error('The source or conversation changed / Kaynak veya sohbet değişti.');
   requireOwner(current);registry.validate(row.name,row.args,current);
   if(row.name==='translate_video_captions'){const probe=captionProbes.get(event.sender.id);if(!probe||probe.expires<Date.now()||!manifest.same(probe.owner,current)||!probe.languages.some(item=>item.id===row.args.caption_id))throw Error('Caption selection expired. Probe again.');}
   proposals.delete(input.proposalId);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort('timeout'),row.name==='analyze_title_reviews'?420000:['prepare_voice_reference','start_voice_generation','voice_group','pick_local_voice_reference','prepare_book_narration','start_book_narration','book_chapter','export_book_audio','load_title_reviews','get_film_page_info','get_film_person_info','translate_title_synopsis'].includes(row.name)?120000:row.name==='translate_video_captions'?100000:30000);
   const stop=()=>controller.abort('closed');event.sender.once('destroyed',stop);if(event.sender.isDestroyed())stop();
   applications.set(event.sender.id,{id:input.proposalId,controller});
   try{
    if(row.personalMediaIdentity){const state=await requestRenderer(event.sender,current,'read_personal_media',{item_id:row.args.item_id},controller.signal);if(state.status!=='completed'||state.personalIdentity!==row.personalMediaIdentity)throw Object.assign(Error('Personal media changed; review again / Kişisel kayıt değişti; yeniden inceleyin.'),{stale:true});}
    if(row.selectionIdentity){const translation=row.name==='set_translation_profile',state=await requestRenderer(event.sender,current,translation?'get_translation_profile':'list_voice_references',translation?{profile_id:row.args.profile_id}:{},controller.signal);if(state.status!=='completed'||state.selectionIdentity!==row.selectionIdentity||!translation&&!state.references?.some(ref=>ref.id===row.args.reference_id))throw Object.assign(Error('Selection changed; refresh and review / Seçim değişti; yenileyip inceleyin.'),{stale:true});}if(row.settingsIdentity){const state=await requestRenderer(event.sender,current,row.name!=='configure_voice_generation'?'get_app_preferences':'get_voice_status',{},controller.signal);if(settingsSnapshot(row.name,row.args,state,current)!==row.settingsIdentity)throw Object.assign(Error('Settings changed; refresh and review / Ayarlar değişti; yenileyip inceleyin.'),{stale:true});}if(row.translationIdentity){const state=await requestRenderer(event.sender,current,'get_translation_profile',{profile_id:row.args.translation_profile||row.args.profile_id},controller.signal);if(JSON.stringify(state.profile)!==row.translationIdentity)throw Error('Translation profile changed; ask again / Çeviri profili değişti; yeniden isteyin.');}if(row.workflowIdentity){const state=await requestRenderer(event.sender,current,'get_workflow_settings',{domain:row.args.domain},controller.signal);if(workflowSnapshot(row.name,state)!==row.workflowIdentity)throw Object.assign(Error('Workflow settings changed; refresh and review / İşlem ayarları değişti; yenileyip inceleyin.'),{stale:true});}if(row.libraryIdentity){const state=await requestRenderer(event.sender,current,'get_title_details',{item_id:row.args.item_id},controller.signal);if(state.identity!==row.libraryIdentity)throw Error('Title changed; ask again.');}if(row.collectionIdentity){const state=await requestRenderer(event.sender,current,'get_collection_plan',{plan_id:row.args.plan_id},controller.signal);if(JSON.stringify(state.plan)!==row.collectionIdentity)throw Error('Collection plan changed; ask again.');}if(row.name==='cancel_job'){const result=await cancelJob(row.args.job_id);return result.ok?{ok:true,result}:{ok:false,error:result.error};}const binding=row.name==='use_job_subtitles'?subtitleBinding(row.args,current):null;const result=await requestRenderer(event.sender,current,row.name,binding?{...row.args,job_id:binding.externalId}:row.args,controller.signal,row.expectedSettings);if(row.expectedSettings&&result?.status==='failed'&&result.stale===true)throw Object.assign(Error(String(result.error||'Settings changed; refresh and review.').slice(0,300)),{stale:true});const exactId=resolveJobId(result?.jobId);if(result?.status==='accepted'&&exactId){jobBindings.set(exactId,{owner:current,externalId:result.jobId,tool:row.name});while(jobBindings.size>50)jobBindings.delete(jobBindings.keys().next().value);}const continuation=flows.record(row.flow,row.name,row.args,result,resolveJobId(result?.jobId));const invalidated=[];if(['accepted','completed'].includes(result?.status))for(const [id,other] of proposals)if(other.flow===row.flow){proposals.delete(id);invalidated.push(id);}return {ok:true,result:{...result,...continuation,invalidatedProposalIds:invalidated}};}finally{clearTimeout(timer);event.sender.removeListener('destroyed',stop);applications.delete(event.sender.id);}
  }catch(error){if(error.stale){for(const [id,other] of refreshable)if(other.expires<Date.now())refreshable.delete(id);if(refreshable.size>=100)refreshable.delete(refreshable.keys().next().value);refreshable.set(input.proposalId,row);}return {ok:false,...(error.stale?{stale:true,refreshable:true}:{}),error:String(error.message).slice(0,300)};}
 });
 async function refreshProposal(event,input={}){
  if(!authorized(event))return {ok:false,error:'Unauthorized assistant action.'};
  if(sessions.has(event.sender.id)||applications.has(event.sender.id))return {ok:false,error:'Another assistant action is running.'};
  const row=refreshable.get(input.proposalId);if(!row||row.sender!==event.sender)return {ok:false,error:'This refresh expired; ask again.'};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort('timeout'),30000);
  try{
   const owner=manifest.clean(input.owner);if(row.expires<Date.now()||!manifest.same(row.owner,owner))throw Error('The source or conversation changed.');
   requireOwner(owner);registry.validate(row.name,row.args,owner);
   applications.set(event.sender.id,{id:input.proposalId,controller});
   const renewed={...row,expires:Date.now()+10*60*1000};
   if(row.name==='propose_personal_media_update'){
    const content=row.args.item_id.startsWith('content:');
    const title=await requestRenderer(event.sender,owner,content?'read_personal_media':'get_title_details',{item_id:row.args.item_id},controller.signal);
    const state=await requestRenderer(event.sender,owner,row.name,row.args,controller.signal);
    if(!(content?title.personalIdentity:title.identity)||state.status!=='completed'||state.operation!=='preview'||!state.token||!state.personalIdentity||!state.owner)throw Error('Personal media preview unavailable.');
    renewed.libraryIdentity=content?undefined:title.identity;renewed.personalMediaIdentity=state.personalIdentity;renewed.summary=String(state.summary).slice(0,4500);renewed.expectedSettings={kind:'personal-media',token:state.token,itemId:row.args.item_id,args:JSON.stringify(row.args),owner:state.owner};
   }
   const fresh=await captureSettings(event.sender,owner,renewed,controller.signal);
   requireOwner(owner);if(proposals.size>=100)throw Error('Too many pending assistant actions.');
   const proposalId=randomUUID();proposals.set(proposalId,fresh);refreshable.delete(input.proposalId);
   return {ok:true,action:{kind:'app_action',proposalId,tool:fresh.name,label:fresh.label,summary:fresh.summary}};
  }catch(error){return {ok:false,error:String(error.message).slice(0,300)};}finally{clearTimeout(timer);applications.delete(event.sender.id);}
 }
 app.once('will-quit',()=>{for(const row of sessions.values())row.controller.abort('closed');for(const row of applications.values())row.controller.abort('closed');for(const row of pending.values())row.finish(null,Error('Application closing.'));proposals.clear();refreshable.clear();flows.tokens.clear();captionProbes.clear();jobBindings.clear();});
 return {sessions,proposals,flows,applications};
}
module.exports={register};
