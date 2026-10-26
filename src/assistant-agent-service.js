'use strict';
const {randomUUID}=require('node:crypto');
const registry=require('./assistant-capabilities'),manifest=require('./assistant-context-manifest'),provider=require('./assistant-provider');
const fold=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').toLowerCase();
const identifier=value=>typeof value==='string'&&/^[\w-]{1,100}$/.test(value);

function register({app,ipcMain,authorized,getConfig,validateOwner=()=>true,fetchImpl=fetch,getJobs=()=>({jobs:[]}),cancelJob=async()=>({ok:false}),probeVideo=async()=>({ok:false}),researchWeb=async()=>({})}){
 const sessions=new Map(),proposals=new Map(),pending=new Map(),captionProbes=new Map();
 const emit=(sender,packet)=>{if(!sender.isDestroyed())sender.send('assistant:agentEvent',packet);};
 function requireOwner(owner){if(!owner.owner||!owner.thread||!validateOwner(owner))throw Error('The source changed / Kaynak değişti.');}
 function requestRenderer(sender,owner,name,args,signal){
  requireOwner(owner);const callId=randomUUID(),budget=name==='translate_video_captions'?100000:30000;
  return new Promise((resolve,reject)=>{
   const abort=()=>finish(null,Error('Assistant action cancelled / Asistan işlemi iptal edildi.'));
   const timer=setTimeout(()=>finish(null,Error('Application action timed out / Uygulama işlemi zaman aşımına uğradı.')),budget);
   const finish=(value,error)=>{if(!pending.has(callId))return;pending.delete(callId);clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
   pending.set(callId,{sender,finish});signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted){abort();return;}
   emit(sender,{type:'action',callId,owner,name,args,deadline:Date.now()+budget});
  });
 }
 ipcMain.handle('assistant:agentResult',(event,input={})=>{
  if(!authorized(event)||!identifier(input.callId))return {ok:false};
  const call=pending.get(input.callId);if(!call||call.sender!==event.sender)return {ok:false};
  let result=input.result;
  try{if(!result||typeof result!=='object'||Array.isArray(result)||!['completed','accepted','failed'].includes(result.status)||JSON.stringify(result).length>16000)throw Error('Invalid result');}
  catch(_){result={status:'failed',error:'Invalid application result.'};}
  call.finish(result);return {ok:true};
 });
 ipcMain.handle('assistant:agentRun',async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized assistant request.'};
  if(sessions.has(event.sender.id))return {ok:false,error:'Assistant is already running / Asistan zaten çalışıyor.'};
  let controller,session,timer,stop;
  try{
   if(!identifier(input.requestId)||typeof input.question!=='string'||!input.question.trim()||input.question.length>16000||JSON.stringify(input).length>4*1024*1024)throw Error('Invalid assistant request.');
   const owner=manifest.clean(input.owner);requireOwner(owner);
   const sourcePool=manifest.pool(input.pool);owner.hasSubtitles=sourcePool.length>0;
   controller=new AbortController();session={id:input.requestId,controller,owner};sessions.set(event.sender.id,session);
   stop=()=>controller.abort();event.sender.once('destroyed',stop);timer=setTimeout(stop,120000);
   const evidence=new Map();
   const execute=async(name,args)=>{
    controller.signal.throwIfAborted();requireOwner(owner);const entry=registry.get(name);
    if(name==='probe_video_captions'){
     const result=await probeVideo(owner,controller.signal);controller.signal.throwIfAborted();requireOwner(owner);
     if(!result?.ok)throw Error(result?.error||'Caption probe failed.');
     const available=(result.data?.subtitleLangs||[]).slice(0,500).filter(row=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,40}$/.test(row.code));
     const languages=available.sort((a,b)=>Number(a.auto)-Number(b.auto)||Number(!/^(?:en|tr)(?:-|$)/.test(a.code))-Number(!/^(?:en|tr)(?:-|$)/.test(b.code))).slice(0,80).map(row=>({id:'yt-'+(row.auto?'auto':'manual')+':'+row.code,language:row.code,automatic:row.auto===true}));
     captionProbes.set(event.sender.id,{owner,languages,expires:Date.now()+300000});return {languages,truncated:available.length>languages.length,note:'Choose a listed caption ID. No captions means Whisper must be explicitly requested; it was not started.'};
    }
    if(name==='app_help')return {capabilities:registry.help(owner,args.domain||'all'),limits:'Only listed assistant tools are connected. The application already has book, dubbing, library and settings screens; broader assistant control of those existing screens comes in later packages. Do not claim those application features are missing.'};
    if(name==='research_web'){const result=await researchWeb(args.query,controller.signal);const sources=(result.sources||[]).filter(row=>require('./assistant-web-research').safeSource(row.url)).slice(0,10);session.webSources=sources;return {text:result.text,sources};}
    if(name==='get_job_status')return getJobs();
    if(name==='get_source_context')return {source:manifest.publicContext(owner),data:manifest.sourceText(input.context,10000)};
    if(name==='list_subtitle_tracks')return {tracks:owner.tracks};
    if(name==='search_subtitles'||name==='get_current_subtitle'){
     const words=[...new Set(fold(args.query).match(/[\p{L}\p{N}]+/gu)||[])].filter(word=>word.length>1).slice(0,24);
     const matches=name==='get_current_subtitle'?sourcePool.filter(row=>row.start<=owner.time&&row.end>=owner.time).slice(0,3):sourcePool.map(row=>({row,score:words.reduce((score,word)=>score+(fold(row.text+' '+row.translation).includes(word)?1:0),0)})).filter(row=>row.score).sort((a,b)=>b.score-a.score||a.row.start-b.row.start).slice(0,8).map(row=>row.row);
     for(const row of matches)evidence.set(row.id,row);
     emit(event.sender,{type:'evidence',requestId:session.id,evidence:[...evidence.values()]});return {matches,scope:'Only the supplied subtitle pool was searched.'};
    }
    if(entry.policy==='proposal'){
     if(name==='translate_video_captions'){const probe=captionProbes.get(event.sender.id);if(!probe||probe.expires<Date.now()||!manifest.same(probe.owner,owner)||!probe.languages.some(row=>row.id===args.caption_id))throw Error('Probe this video first and select a real caption ID.');}
     if(name==='cancel_job'&&!getJobs().jobs.some(row=>row.id===args.job_id&&row.cancellable))throw Error('Job is no longer cancellable.');
     if(['seek_to_time','preview_translation_change','open_subtitle_editor'].includes(name)&&!sourcePool.some(row=>row.id===args.source_id))throw Error('Unknown source subtitle ID.');
     if(['translate_captions','load_caption_track'].includes(name)&&!owner.tracks.some(row=>row.id===args.track_id&&(name==='load_caption_track'||row.role==='source')))throw Error('Unknown source track ID.');
     for(const [key,row] of proposals)if(row.expires<Date.now())proposals.delete(key);
     if(proposals.size>=100||session.proposalCount>=8)throw Error('Too many pending assistant actions.');
     session.proposalCount=(session.proposalCount||0)+1;
     const proposalId=randomUUID(),{label,summary}=registry.describe(name,args,input.locale,owner);
     const action={kind:'app_action',proposalId,tool:name,label,summary};
     proposals.set(proposalId,{sender:event.sender,owner,name,args,expires:Date.now()+10*60*1000});
     emit(event.sender,{type:'proposal',requestId:session.id,action});
     return {status:'proposed',label,proposalId,note:'A real action card was created. It has not run; the user may apply it.'};
    }
    return requestRenderer(event.sender,owner,name,args,controller.signal);
   };
   const result=await provider.run({question:input.question,history:input.history,context:input.context,owner,pool:sourcePool,locale:input.locale,config:getConfig(),signal:controller.signal,fetchImpl,
    onDelta:text=>emit(event.sender,{type:'delta',requestId:session.id,text}),
    onCapability:value=>emit(event.sender,{type:'capabilities',requestId:session.id,value}),execute});
   controller.signal.throwIfAborted();
   if(session.webSources?.length)result.text=result.text.slice(0,28000)+'\n\n'+(input.locale==='tr'?'Web kaynakları:':'Web sources:')+'\n'+session.webSources.map((row,i)=>'[W'+(i+1)+'] '+String(row.title).slice(0,200)+'\n'+row.url).join('\n');
   return {ok:true,...result};
  }catch(error){return {ok:false,cancelled:!!controller?.signal.aborted,error:controller?.signal.aborted?'Assistant stopped or timed out / Asistan durduruldu veya zaman aşımına uğradı.':String(error.message).slice(0,300)};}
  finally{clearTimeout(timer);if(stop)event.sender.removeListener('destroyed',stop);if(sessions.get(event.sender.id)===session)sessions.delete(event.sender.id);}
 });
 ipcMain.handle('assistant:agentCancel',(event,input={})=>{
  if(!authorized(event))return {ok:false};const session=sessions.get(event.sender.id);
  if(session&&session.id===input.requestId)session.controller.abort();return {ok:true};
 });
 ipcMain.handle('assistant:agentApply',async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized assistant action.'};
  const row=proposals.get(input.proposalId);if(!row||row.sender!==event.sender)return {ok:false,error:'This action expired; ask again / Öneri eskidi; yeniden iste.'};
  try{
   const current=manifest.clean(input.owner);if(row.expires<Date.now()||!manifest.same(row.owner,current))throw Error('The source or conversation changed / Kaynak veya sohbet değişti.');
   requireOwner(current);registry.validate(row.name,row.args,current);
   if(row.name==='translate_video_captions'){const probe=captionProbes.get(event.sender.id);if(!probe||probe.expires<Date.now()||!manifest.same(probe.owner,current)||!probe.languages.some(item=>item.id===row.args.caption_id))throw Error('Caption selection expired. Probe again.');}
   proposals.delete(input.proposalId);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),row.name==='translate_video_captions'?100000:30000);
   try{if(row.name==='cancel_job'){const result=await cancelJob(row.args.job_id);return result.ok?{ok:true,result}:{ok:false,error:result.error};}return {ok:true,result:await requestRenderer(event.sender,current,row.name,row.args,controller.signal)};}finally{clearTimeout(timer);}
  }catch(error){return {ok:false,error:String(error.message).slice(0,300)};}
 });
 app.once('will-quit',()=>{for(const row of sessions.values())row.controller.abort();for(const row of pending.values())row.finish(null,Error('Application closing.'));proposals.clear();});
 return {sessions,proposals};
}
module.exports={register};
