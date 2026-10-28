'use strict';
const {randomUUID}=require('node:crypto');
const registry=require('./assistant-capabilities'),manifest=require('./assistant-context-manifest'),provider=require('./assistant-provider');
const fold=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').toLowerCase();
const identifier=value=>typeof value==='string'&&/^[\w-]{1,100}$/.test(value);
const workflowSnapshot=(name,state)=>JSON.stringify(name==='undo_workflow_settings'?{values:state.values,canUndo:state.canUndo,undoChanges:state.undoChanges}:state.values);

function register({app,ipcMain,authorized,getConfig,validateOwner=()=>true,fetchImpl=fetch,getJobs=()=>({jobs:[]}),cancelJob=async()=>({ok:false}),probeVideo=async()=>({ok:false}),resolveJobId=()=>null,researchWeb=async()=>({})}){
 const flows=require('./assistant-flows').createFlows({getJobs}),applications=new Map();
 const sessions=new Map(),proposals=new Map(),pending=new Map(),captionProbes=new Map(),jobBindings=new Map();
 const emit=(sender,packet)=>{if(!sender.isDestroyed())sender.send('assistant:agentEvent',packet);};
 function sameJobSource(binding,owner){return !!binding&&manifest.same({...binding.owner,thread:owner.thread},owner);}
 function jobResult(id,owner){
  const job=getJobs().jobs.find(row=>row.id===id);if(!job)throw Error('Unknown exact job / İlgili iş bulunamadı.');
  const binding=jobBindings.get(id);return {job:{...job,startedByAssistant:!!binding,sourceMatches:binding?sameJobSource(binding,owner):null},note:'Progress is stage-specific. Artifacts are completion metadata, not listened audio or verified text quality.'};
 }
 function subtitleBinding(args,owner){
  const {job}=jobResult(args.job_id,owner),binding=jobBindings.get(args.job_id);
  if(!sameJobSource(binding,owner)||!['start_whisper','translate_captions','translate_video_captions'].includes(binding?.tool)||job.state!=='completed')throw Error('This exact completed subtitle job does not belong to the current source / Bu tamamlanmış altyazı işi açık kaynağa ait değil.');
  const artifacts=job.result?.artifacts?.filter(row=>row.role===args.role)||[];
  if(!artifacts.length||artifacts.some(row=>row.partial)&&args.allow_partial!==true)throw Error('No complete output of the requested role. Review partial results / İstenen rolde tam çıktı yok. Kısmi sonucu kontrol et.');
  return binding;
 }
 function requireOwner(owner){if(!owner.owner||!owner.thread||!validateOwner(owner))throw Error('The source changed / Kaynak değişti.');}
 function requestRenderer(sender,owner,name,args,signal){
  requireOwner(owner);const callId=randomUUID(),budget=['prepare_voice_reference','start_voice_generation','voice_group','pick_local_voice_reference','prepare_book_narration','start_book_narration','book_chapter','export_book_audio','load_title_reviews','translate_title_synopsis'].includes(name)?120000:name==='translate_video_captions'?100000:30000;
  return new Promise((resolve,reject)=>{
   const cancel=error=>{if(!pending.has(callId))return;emit(sender,{type:'action-cancel',callId});finish(null,error);};
   const abort=()=>cancel(Error(signal?.reason==='timeout'?'Application action timed out / Uygulama işlemi zaman aşımına uğradı.':'Assistant action cancelled / Asistan işlemi iptal edildi.'));
   const destroyed=()=>cancel(Error('Application window closed / Uygulama penceresi kapandı.'));
   const timer=setTimeout(()=>cancel(Error('Application action timed out / Uygulama işlemi zaman aşımına uğradı.')),budget);
   const finish=(value,error)=>{if(!pending.has(callId))return;pending.delete(callId);clearTimeout(timer);signal?.removeEventListener('abort',abort);sender.removeListener('destroyed',destroyed);error?reject(error):resolve(value);};
   pending.set(callId,{sender,owner,finish,cancel});signal?.addEventListener('abort',abort,{once:true});sender.once('destroyed',destroyed);
   if(signal?.aborted){abort();return;}if(sender.isDestroyed()){destroyed();return;}
   emit(sender,{type:'action',callId,owner,name,args,deadline:Date.now()+budget});
  });
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
 ipcMain.handle('assistant:agentRun',async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized assistant request.'};
  if(sessions.has(event.sender.id)||applications.has(event.sender.id))return {ok:false,error:'Assistant is already running / Asistan zaten çalışıyor.'};
  let controller,session,timer,stop,resumed;
  try{
   if(!identifier(input.requestId)||typeof input.question!=='string'||!input.question.trim()||input.question.length>16000||JSON.stringify(input).length>4*1024*1024)throw Error('Invalid assistant request.');
   const owner=manifest.clean(input.owner);requireOwner(owner);
   resumed=input.continuationId?flows.resume(input.continuationId,event.sender.id,owner,{deferCommit:true}):null;
   if(resumed?.waiting)return {ok:true,waiting:true,text:resumed.text};
   const flow=resumed?.flow||flows.start(event.sender.id,owner,input.question);
   const sourcePool=manifest.pool(input.pool);owner.hasSubtitles=sourcePool.length>0;
   const config=getConfig();
   controller=new AbortController();session={id:input.requestId,controller,owner,flow};sessions.set(event.sender.id,session);
   stop=()=>controller.abort('closed');event.sender.once('destroyed',stop);timer=setTimeout(()=>controller.abort('timeout'),require('./assistant-settings').timeout(config));
   const evidence=new Map(),offered=new Map(),planned=new Set();let attempted=0,failed=0;
   const executeUnchecked=async(name,args)=>{
    controller.signal.throwIfAborted();requireOwner(owner);const entry=registry.get(name);
    if(name==='probe_video_captions'){
     const result=await probeVideo(owner,controller.signal);controller.signal.throwIfAborted();requireOwner(owner);
     if(!result?.ok)throw Error(result?.error||'Caption probe failed.');
     const available=(result.data?.subtitleLangs||[]).slice(0,500).filter(row=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,40}$/.test(row.code));
     const languages=available.sort((a,b)=>Number(a.auto)-Number(b.auto)||Number(!/^(?:en|tr)(?:-|$)/.test(a.code))-Number(!/^(?:en|tr)(?:-|$)/.test(b.code))).slice(0,80).map(row=>({id:'yt-'+(row.auto?'auto':'manual')+':'+row.code,language:row.code,automatic:row.auto===true}));
     captionProbes.set(event.sender.id,{owner,languages,expires:Date.now()+300000});return {languages,truncated:available.length>languages.length,note:'Choose a listed caption ID. No captions means Whisper must be explicitly requested; it was not started.'};
    }
    if(name==='app_help')return {capabilities:registry.help(owner,args.domain||'all'),limits:'Only listed assistant tools are connected. Book, dubbing, library and normal settings tools are source/domain dependent. Do not claim unlisted controls or access to secrets, files, arbitrary browser automation or the full book.'};
    if(name==='research_web'){const result=await researchWeb(args.query,controller.signal);controller.signal.throwIfAborted();requireOwner(owner);const sources=(Array.isArray(result.sources)?result.sources:[]).filter(row=>row&&require('./assistant-web-research').safeSource(row.url)).slice(0,10);session.webSources=[...new Map([...(session.webSources||[]),...sources].map(row=>[row.url,row])).values()].slice(0,10);return {text:result.text,sources};}
    if(name==='get_job_status'){const state=getJobs(),ordered=[...state.jobs.filter(job=>['running','cancelling'].includes(job.state)),...state.jobs.filter(job=>!['running','cancelling'].includes(job.state))],offset=args.offset||0;return {revision:state.revision,jobs:args.job_id?[jobResult(args.job_id,owner).job]:ordered.slice(offset,offset+5).map(job=>jobResult(job.id,owner).job),total:state.jobs.length,nextOffset:!args.job_id&&offset+5<ordered.length?offset+5:null};}
    if(name==='get_job_result')return jobResult(args.job_id,owner);
    if(name==='get_source_context')return {source:manifest.publicContext(owner),data:manifest.sourceText(input.context,10000)};
    if(name==='list_subtitle_tracks')return {tracks:owner.tracks};
    if(name==='search_subtitles'||name==='get_current_subtitle'){
     const words=[...new Set(fold(args.query).match(/[\p{L}\p{N}]+/gu)||[])].filter(word=>word.length>1).slice(0,24);
     const matches=name==='get_current_subtitle'?sourcePool.filter(row=>row.start<=owner.time&&row.end>=owner.time).slice(0,3):sourcePool.map(row=>({row,score:words.reduce((score,word)=>score+(fold(row.text+' '+row.translation).includes(word)?1:0),0)})).filter(row=>row.score).sort((a,b)=>b.score-a.score||a.row.start-b.row.start).slice(0,8).map(row=>row.row);
     for(const row of matches)evidence.set(row.id,row);
     emit(event.sender,{type:'evidence',requestId:session.id,evidence:[...evidence.values()]});return {matches,scope:'Only the supplied subtitle pool was searched.'};
    }
    if(entry.policy==='proposal'){
     attempted++;
     const signature=name+':'+JSON.stringify(Object.fromEntries(Object.keys(args).sort().map(key=>[key,args[key]])));
     if(offered.has(signature))return {...offered.get(signature),note:'This exact review card already exists. It has not run.'};
     const previous=[...offered.values()].map(row=>row.tool);
     const prerequisite=previous.find(prior=>(['start_whisper','translate_video_captions','translate_captions'].includes(prior)&&entry.domain==='voice')||(['configure_voice_generation','prepare_voice_reference','set_voice_reference'].includes(prior)&&['start_voice_generation','use_generated_voice'].includes(name))||(['prepare_book_narration','select_book_chapters','start_book_narration'].includes(prior)&&['start_book_narration','export_book_audio'].includes(name)));
     if(prerequisite){return {status:'blocked',note:'Apply the prerequisite card '+prerequisite+' first, then Continue with result after exact job completion. No dependent card or job was created.'};}

     if(flows.repeated(flow,name,args))return {status:'completed',note:'This exact step already ran in this flow. Read current status; do not repeat it.'};
     if(name==='translate_video_captions'){const probe=captionProbes.get(event.sender.id);if(!probe||probe.expires<Date.now()||!manifest.same(probe.owner,owner)||!probe.languages.some(row=>row.id===args.caption_id))throw Error('Probe this video first and select a real caption ID.');}
     if(name==='use_job_subtitles')subtitleBinding(args,owner);
     if(name==='cancel_job'&&!getJobs().jobs.some(row=>row.id===args.job_id&&row.cancellable))throw Error('Job is no longer cancellable.');
     if(['seek_to_time','preview_translation_change','open_subtitle_editor'].includes(name)&&!sourcePool.some(row=>row.id===args.source_id))throw Error('Unknown source subtitle ID.');
     if(['translate_captions','load_caption_track'].includes(name)&&!owner.tracks.some(row=>row.id===args.track_id&&(name==='load_caption_track'||row.role==='source')))throw Error('Unknown source track ID.');
     for(const [key,row] of proposals)if(row.expires<Date.now())proposals.delete(key);
     const existing=[...proposals].find(([,row])=>row.flow===flow&&row.name===name&&JSON.stringify(row.args)===JSON.stringify(args));
     if(existing){const [proposalId,row]=existing,action={kind:'app_action',proposalId,tool:name,label:row.label,summary:row.summary};emit(event.sender,{type:'proposal',requestId:session.id,action});const receipt={status:'proposed',label:row.label,proposalId,tool:name,note:'The existing un-applied card was reused. It has not run.'};offered.set(signature,receipt);return receipt;}
     if(proposals.size>=100||session.proposalCount>=8)throw Error('Too many pending assistant actions.');
     session.proposalCount=(session.proposalCount||0)+1;
     const proposalId=randomUUID();let libraryIdentity,collectionIdentity,workflowIdentity,translationIdentity;let {label,summary}=registry.describe(name,args,input.locale,owner);
     if(['configure_workflow','undo_workflow_settings'].includes(name)){const state=await requestRenderer(event.sender,owner,'get_workflow_settings',{domain:args.domain},controller.signal);if(state.status!=='completed'||!state.values)throw Error('Workflow settings unavailable.');workflowIdentity=workflowSnapshot(name,state);if(name==='configure_workflow')summary=require('./assistant-workflow-settings').summary(args.domain,args.changes_json,input.locale,state);else {if(!state.canUndo)throw Error('No unchanged workflow action to undo.');summary=require('./assistant-workflow-settings').summary(args.domain,JSON.stringify(state.undoChanges),input.locale,state);}}
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
     if(entry.domain==='library'&&args.item_id){const state=await requestRenderer(event.sender,owner,'get_title_details',{item_id:args.item_id},controller.signal);if(!state.item||!state.identity)throw Error('Title identity unavailable.');libraryIdentity=state.identity;summary=String(state.item.title).slice(0,160)+' · '+summary;}
     if(name==='apply_library_collection'){const state=await requestRenderer(event.sender,owner,'get_collection_plan',{plan_id:args.plan_id},controller.signal);if(!state.plan)throw Error('Collection plan unavailable.');collectionIdentity=JSON.stringify(state.plan);summary=(state.plan.member===false?(input.locale==='tr'?'Üyelikten çıkar: ':'Remove membership: '):(input.locale==='tr'?'Üyeliğe ekle: ':'Add membership: '))+state.plan.name+' · '+state.plan.items.map(row=>row.title).join(', ').slice(0,1200);}
     controller.signal.throwIfAborted();requireOwner(owner);
     const action={kind:'app_action',proposalId,tool:name,label,summary};
     proposals.set(proposalId,{sender:event.sender,owner,name,args,flow,label,summary,libraryIdentity,collectionIdentity,workflowIdentity,translationIdentity,expires:Date.now()+10*60*1000});
     emit(event.sender,{type:'proposal',requestId:session.id,action});
     const receipt={status:'proposed',label,proposalId,tool:name,note:'A real action card was created. It has not run; the user may apply it.'};offered.set(signature,receipt);if(name==='apply_library_collection')planned.delete(args.plan_id);return receipt;
    }
    const result=await requestRenderer(event.sender,owner,name,args,controller.signal);if(name==='plan_library_collection'&&result.status==='completed'&&result.plan?.id)planned.add(result.plan.id);return result;
   };
   const execute=async(name,args)=>{emit(event.sender,{type:'progress',requestId:session.id,phase:'tool',domain:name==='research_web'?'web':registry.get(name)?.domain||''});try{const result=await executeUnchecked(name,args);if(['failed','blocked'].includes(result?.status))failed++;return result;}catch(error){if(!controller.signal.aborted)failed++;throw error;}finally{if(!controller.signal.aborted)emit(event.sender,{type:'progress',requestId:session.id,phase:'thinking'});}};
   const result=await provider.run({question:flow.question,continuation:flows.evidence(flow),history:input.history,context:input.context,owner,pool:sourcePool,locale:input.locale,config,signal:controller.signal,fetchImpl,
    onProgress:phase=>{if(!controller.signal.aborted&&validateOwner(owner))emit(event.sender,{type:'progress',requestId:session.id,phase});},
    onDelta:text=>emit(event.sender,{type:'delta',requestId:session.id,text}),
    onReplace:text=>emit(event.sender,{type:'replace',requestId:session.id,text}),
    onCapability:value=>emit(event.sender,{type:'capabilities',requestId:session.id,value}),execute});
   controller.signal.throwIfAborted();requireOwner(owner);
   if(session.webSources?.length)result.text=result.text.slice(0,28000)+'\n\n'+(input.locale==='tr'?'Web kaynakları:':'Web sources:')+'\n'+session.webSources.map((row,i)=>'[W'+(i+1)+'] '+String(row.title).slice(0,200)+'\n'+row.url).join('\n');
   const execution={cards:offered.size,pendingPlans:planned.size,attempted,blockedOrFailed:failed,appliedActions:0};
   if(attempted||planned.size||/kart|\bcard\b|başlat|started|tamamlan|completed/i.test(result.text)){const tr=input.locale==='tr';const note=tr?'Uygulama doğrulaması: '+offered.size+' gerçek işlem kartı oluşturuldu; bu istek kartları uygulamadı, transkripsiyon/dublaj başlatmadı.':'Application verification: '+offered.size+' real action cards created; this request applied no cards and started no transcription/dubbing.';const extra=planned.size?(tr?' Koleksiyon planı yalnız veri; uygulanabilir kartı henüz yok.':' A collection plan is data only; its review card is still missing.'):'';result.text=result.text.slice(0,30500)+'\n\n'+note+extra;}
   resumed?.settle?.(true);return {ok:true,...result,execution};
  }catch(error){const timedOut=controller?.signal.aborted&&controller.signal.reason==='timeout';return {ok:false,timedOut:!!timedOut,cancelled:!!controller?.signal.aborted&&!timedOut,error:timedOut?'Assistant timed out. Received text was kept; you can retry / Asistan zaman aşımına uğradı. Alınan metin korundu; yeniden deneyebilirsin.':controller?.signal.aborted?'Assistant stopped / Asistan durduruldu.':String(error.message).slice(0,300)};}
  finally{resumed?.settle?.(false);clearTimeout(timer);if(stop)event.sender.removeListener('destroyed',stop);if(sessions.get(event.sender.id)===session)sessions.delete(event.sender.id);}
 });
 ipcMain.handle('assistant:agentCancel',(event,input={})=>{
  if(!authorized(event))return {ok:false};const session=sessions.get(event.sender.id);
  if(session&&session.id===input.requestId)session.controller.abort('user');const applying=applications.get(event.sender.id);if(applying?.id===input.requestId)applying.controller.abort('user');return {ok:true};
 });
 ipcMain.handle('assistant:agentApply',async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized assistant action.'};
  if(sessions.has(event.sender.id)||applications.has(event.sender.id))return {ok:false,error:'Another assistant action is running / Başka asistan işlemi sürüyor.'};
  const row=proposals.get(input.proposalId);if(!row||row.sender!==event.sender)return {ok:false,error:'This action expired; ask again / Öneri eskidi; yeniden iste.'};
  try{
   const current=manifest.clean(input.owner);if(row.expires<Date.now()||!manifest.same(row.owner,current))throw Error('The source or conversation changed / Kaynak veya sohbet değişti.');
   requireOwner(current);registry.validate(row.name,row.args,current);
   if(row.name==='translate_video_captions'){const probe=captionProbes.get(event.sender.id);if(!probe||probe.expires<Date.now()||!manifest.same(probe.owner,current)||!probe.languages.some(item=>item.id===row.args.caption_id))throw Error('Caption selection expired. Probe again.');}
   proposals.delete(input.proposalId);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort('timeout'),['prepare_voice_reference','start_voice_generation','voice_group','pick_local_voice_reference','prepare_book_narration','start_book_narration','book_chapter','export_book_audio','load_title_reviews','translate_title_synopsis'].includes(row.name)?120000:row.name==='translate_video_captions'?100000:30000);
   const stop=()=>controller.abort('closed');event.sender.once('destroyed',stop);if(event.sender.isDestroyed())stop();
   applications.set(event.sender.id,{id:input.proposalId,controller});
   try{if(row.translationIdentity){const state=await requestRenderer(event.sender,current,'get_translation_profile',{profile_id:row.args.translation_profile||row.args.profile_id},controller.signal);if(JSON.stringify(state.profile)!==row.translationIdentity)throw Error('Translation profile changed; ask again / Çeviri profili değişti; yeniden isteyin.');}if(row.workflowIdentity){const state=await requestRenderer(event.sender,current,'get_workflow_settings',{domain:row.args.domain},controller.signal);if(workflowSnapshot(row.name,state)!==row.workflowIdentity)throw Error('Workflow settings changed; ask again / İşlem ayarları değişti; yeniden isteyin.');}if(row.libraryIdentity){const state=await requestRenderer(event.sender,current,'get_title_details',{item_id:row.args.item_id},controller.signal);if(state.identity!==row.libraryIdentity)throw Error('Title changed; ask again.');}if(row.collectionIdentity){const state=await requestRenderer(event.sender,current,'get_collection_plan',{plan_id:row.args.plan_id},controller.signal);if(JSON.stringify(state.plan)!==row.collectionIdentity)throw Error('Collection plan changed; ask again.');}if(row.name==='cancel_job'){const result=await cancelJob(row.args.job_id);return result.ok?{ok:true,result}:{ok:false,error:result.error};}const binding=row.name==='use_job_subtitles'?subtitleBinding(row.args,current):null;const result=await requestRenderer(event.sender,current,row.name,binding?{...row.args,job_id:binding.externalId}:row.args,controller.signal);const exactId=resolveJobId(result?.jobId);if(result?.status==='accepted'&&exactId){jobBindings.set(exactId,{owner:current,externalId:result.jobId,tool:row.name});while(jobBindings.size>50)jobBindings.delete(jobBindings.keys().next().value);}const continuation=flows.record(row.flow,row.name,row.args,result,resolveJobId(result?.jobId));const invalidated=[];if(['accepted','completed'].includes(result?.status))for(const [id,other] of proposals)if(other.flow===row.flow){proposals.delete(id);invalidated.push(id);}return {ok:true,result:{...result,...continuation,invalidatedProposalIds:invalidated}};}finally{clearTimeout(timer);event.sender.removeListener('destroyed',stop);applications.delete(event.sender.id);}
  }catch(error){return {ok:false,error:String(error.message).slice(0,300)};}
 });
 app.once('will-quit',()=>{for(const row of sessions.values())row.controller.abort('closed');for(const row of applications.values())row.controller.abort('closed');for(const row of pending.values())row.finish(null,Error('Application closing.'));proposals.clear();flows.tokens.clear();captionProbes.clear();jobBindings.clear();});
 return {sessions,proposals,flows,applications};
}
module.exports={register};
