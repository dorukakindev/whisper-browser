(() => {
 'use strict';
 if(!window.api?.assistantAgentRun||!window.api.onAssistantAgentEvent)return;
 let pending=null,retryPacket=null,applying=null;const proposalTasks=new Map(),continuations=new Map(),actionCalls=new Map();
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const activity=task=>{
  if(task?.cancelled)return t('Stopping the assistant request; media jobs are managed in Jobs…','Asistan isteği durduruluyor; medya işleri İşler bölümünden yönetilir…');
  if(task?.phase==='reasoning')return t('Reasoning through your request…','İsteğin değerlendiriliyor…');
  if(task?.phase==='writing')return t('Writing the answer…','Yanıt yazılıyor…');
  if(task?.phase==='applying')return t('Waiting for the application result…','Uygulama sonucu bekleniyor…');
  if(task?.phase==='tool'){const labels={settings:['Reading application settings…','Uygulama ayarları okunuyor…'],library:['Reading library information…','Kütüphane bilgisi okunuyor…'],book:['Reading book and narration state…','Kitap ve seslendirme durumu okunuyor…'],voice:['Reading voice preparation state…','Ses hazırlığı durumu okunuyor…'],video:['Checking video and captions…','Video ve altyazılar kontrol ediliyor…'],page:['Reading page information…','Sayfa bilgisi okunuyor…'],subtitles:['Searching the selected subtitles…','Seçili altyazılar taranıyor…'],web:['Researching web sources…','Web kaynakları araştırılıyor…']};const label=labels[task.domain];return label?t(...label):t('Checking application information…','Uygulama bilgisi kontrol ediliyor…');}
  return t('Waiting for the assistant response…','Asistan yanıtı bekleniyor…');
 };
 // The owner snapshot is taken after awaits; a "so far" request never reaches past the moment it was asked.
 const frozenOwner=context=>{const owner=window.AssistantAppActions.snapshot(),cutoff=context?.watched_cutoff??context?.podcastAnchor?.time;if(context?.workspace==='podcast'&&Number.isFinite(cutoff))return {...owner,time:Math.max(0,cutoff)};return Number.isFinite(cutoff)&&Number.isFinite(owner?.time)&&cutoff<owner.time?{...owner,time:Math.max(0,cutoff)}:owner;};
 const soFarQuestion=question=>/(?:bu ana kadar|şu ana kadar|şimdiye kadar|buraya kadar|so far|up to (?:now|this point)|until now)/iu.test(String(question||''));
 const errorText=value=>{const parts=String(value||'').split(' / ');return window.UiLocale?.get?.()==='tr'&&parts[1]?parts[1]:parts[0];};
 const changed=()=>{updateAiChatActions();document.dispatchEvent(new Event('assistant-agent-changed'));};
 const status=()=>{const task=pending||applying;return task&&window.AssistantAppActions.current(task.owner)?{...task,activity:activity(task)}:null;};
 async function send(question,context,history,scope,resume,options={}){
  const requestOptions={responseContract:options.responseContract};
  if(pending||applying)return;retryPacket=null;
  const previous=resume?window.AssistantWorkspace.resume(resume.proposalId,context):null;
  const prefix=previous?.text?(previous.text.length>16000?t('Earlier flow text was shortened.\n','Önceki akış metni kısaltıldı.\n'):'')+previous.text.slice(-16000)+'\n\n':'';
  const task={id:crypto.randomUUID(),scope,question,history,context,owner:frozenOwner(context),text:prefix,prefix,actions:previous?.actions||[],evidence:previous?.evidence||[],trace:previous?.steps||[],citations:previous?.citations||[],runtimeMessages:previous?.runtimeMessages||[]};
  if(previous)task.job=previous.job;else{aiChatAdd('user',question);task.job={chatQuestion:question,chatContext:context,sourceScope:scope,bubble:aiChatAdd('ai',t('Connecting to your assistant…','Asistana bağlanılıyor…'),'is-loading')};window.AssistantWorkspace?.begin(task.job);}
  pending=task;changed();
  document.getElementById('aiChatText').value='';autoGrowChatBox();
  let result;
  try{
   if(!await saveAppSettings())throw Error(t('Provider settings could not be saved securely.','Sağlayıcı ayarları güvenli kaydedilemedi.'));
   if(task.cancelled||!window.AssistantAppActions.current(task.owner))throw Error(t('The source changed.','Kaynak değişti.'));
   result=await window.api.assistantAgentRun({requestId:task.id,question,responseContract:requestOptions.responseContract,continuationId:resume?.token,owner:task.owner,context:window.AssistantContextManifest.sourceText(context),
    pool:window.AssistantContextManifest.pool(context.assistant_tools?.rows),history,locale:window.UiLocale?.get?.()||'en'});
  }catch(error){result={ok:false,cancelled:!!task.cancelled,error:String(error.message)};}
  if(result?.ok&&(task.cancelled||result.cancelled))result={...result,ok:false,cancelled:true};
  const current=window.AssistantAppActions.current(task.owner),state=result?.ok&&current?'complete':task.cancelled||result?.cancelled||!current?'stopped':'failed';
  let text=result?.ok?(result.text?prefix+String(result.text):task.text):[task.text,task.cancelled?t('Stopped. Received text was kept.','Durduruldu. Alınan metin korundu.'):errorText(result?.error)||t('Assistant request failed.','Asistan isteği başarısız oldu.')].filter(Boolean).join('\n\n');
  if(result?.ok&&result.capabilities?.tools==='unsupported')text+='\n\n'+t('This provider rejected application tools. The reply is text only; no application action was performed.','Bu sağlayıcı uygulama araçlarını reddetti. Yanıt yalnız metindir; uygulama işlemi yapılmadı.');
  if(text.length>32000)text=t('Earlier flow text was shortened.\n','Önceki akış metni kısaltıldı.\n')+text.slice(-31800);
  task.trace=(task.trace||[]).map(row=>row.state==='running'?{...row,state:'stopped'}:row);window.AssistantWorkspace?.steps?.(task.job,task.trace);
  task.job.bubble.classList.remove('is-loading');if(state!=='complete')task.job.bubble.classList.add('ai-msg-err');
  if(result?.ok&&current)window.AssistantWorkspace?.citations?.(task.job,[...new Map([...task.citations,...(result.bookCitations||[]),...(result.filmCitations||[]),...(result.podcastCitations||[])].map(row=>[row.id,row])).values()]);
  if(result?.ok&&current)window.AssistantWorkspace?.basis?.(task.job,{unverified:result.podcastUnverified||0});
  if(result?.runtime?.pending?.length){task.runtimeMessages=task.runtimeMessages||[];for(const row of result.runtime.pending){const pendingRow={...row,status:'not-delivered'},at=task.runtimeMessages.findIndex(old=>old.id===row.id&&old.runId===row.runId);if(at<0)task.runtimeMessages.push(pendingRow);else task.runtimeMessages[at]=pendingRow;}window.AssistantWorkspace?.runtime?.(task.job,task.runtimeMessages);text+='\n\n'+t('Some queued messages were not delivered before this task ended. They remain in the activity record.','Görev bitmeden bazı sıradaki mesajlar iletilemedi. İşlem kaydında korunuyor.');}
  renderAiText(task.job.bubble,text);window.AssistantWorkspace?.finish(task.job,text,state);
  if(result?.ok&&current){player.chatHistory=[...history,{role:'user',content:question},...(task.runtimeMessages||[]).filter(row=>row.status==='delivered').map(row=>({role:'user',content:row.text})),{role:'assistant',content:text}].slice(-24);player.chatHistoryScope=scope;document.dispatchEvent(new CustomEvent('assistant-answer',{detail:{text,context}}));}
  if(!resume&&!result?.ok&&current&&!task.cancelled&&!result?.cancelled)retryPacket={question,context,history,scope,owner:task.owner,options:requestOptions};
  if(pending===task)pending=null;changed();return result;
 }
 const unsubscribe=window.api.onAssistantAgentEvent(packet=>{
  if(!packet||typeof packet!=='object')return;
  if(packet.type==='action-cancel'){const call=actionCalls.get(packet.callId);if(call)call.cancelled=true;return;}
  if(packet.type==='action'){
   if(!Number.isFinite(packet.deadline)||packet.deadline<Date.now()){void window.api.assistantAgentResult({callId:packet.callId,result:{status:'failed',error:'Action expired / İşlem isteği eskidi.'}});return;}
   const call={cancelled:false};actionCalls.set(packet.callId,call);
   void window.AssistantAppActions.execute(packet.name,packet.args,packet.owner,{deadline:packet.deadline,isCancelled:()=>call.cancelled,expectedSettings:packet.expectedSettings}).then(result=>window.api.assistantAgentResult({callId:packet.callId,result}))
    .catch(error=>window.api.assistantAgentResult({callId:packet.callId,result:{status:'failed',error:String(error.message).slice(0,300)}})).finally(()=>actionCalls.delete(packet.callId));return;
  }
  const task=pending;if(!task||packet.requestId!==task.id||task.cancelled)return;
  if(!window.AssistantAppActions.current(task.owner)){void cancel();return;}
  if(packet.type==='runtime-message'||packet.type==='runtime-delivered'){
   const rows=packet.type==='runtime-message'?[packet.receipt]:packet.messages||[];task.runtimeMessages=task.runtimeMessages||[];
   for(const row of rows){const at=task.runtimeMessages.findIndex(old=>old.id===row.id&&old.runId===row.runId);if(at<0)task.runtimeMessages.push(row);else task.runtimeMessages[at]=row;}
   const invalid=new Set(packet.invalidatedProposalIds||[]);if(invalid.size){task.actions=task.actions.filter(row=>!invalid.has(row.proposalId));window.AssistantWorkspace?.evidence(task.job,{evidence:task.evidence,actions:task.actions});}
   window.AssistantWorkspace?.runtime?.(task.job,task.runtimeMessages);
  }else if(packet.type==='read-progress'){
   const row=task.trace?.find(row=>row.id===packet.callId);
   if(!row||row.state!=='running'||row.intentRevision!==packet.intentRevision||!Number.isSafeInteger(packet.sequence)||packet.sequence<1||packet.sequence<=(row.readProgress?.sequence||0))return;
   if(packet.final)delete row.readProgress;else row.readProgress={...packet.value,sequence:packet.sequence,sourceRevision:packet.sourceRevision};
   task.trace=window.AssistantRunSteps.clean(task.trace);window.AssistantWorkspace?.steps?.(task.job,task.trace);
  }else if(packet.type==='tool-step'){task.trace=task.trace||[];const at=task.trace.findIndex(row=>row.id===packet.step?.id);if(at>=0)task.trace[at]=packet.step;else task.trace.push(packet.step);task.trace=window.AssistantRunSteps.clean(task.trace);window.AssistantWorkspace?.steps?.(task.job,task.trace);
  }else if(packet.type==='progress'){task.phase=['tool','reasoning','writing'].includes(packet.phase)?packet.phase:'thinking';task.domain=String(packet.domain||'');
  }else if(packet.type==='replace'){task.text=task.prefix+String(packet.text||'');task.job.bubble.textContent=task.text;window.AssistantWorkspace?.partial(task.job,task.text);
  }else if(packet.type==='delta'){
   task.text=(task.text+String(packet.text||'')).slice(0,32000);task.job.bubble.textContent=task.text;window.AssistantWorkspace?.partial(task.job,task.text);
  }else if(packet.type==='proposal'||packet.type==='evidence'){
   if(packet.type==='proposal'){if(!task.actions.some(row=>row.proposalId===packet.action.proposalId))task.actions.push(packet.action);proposalTasks.set(packet.action.proposalId,{question:task.question,history:(task.history||[]).slice(-12).map(row=>({role:row.role,content:String(row.content||'').slice(0,5000)})),frozen:soFarQuestion(task.question)?task.context:null});while(proposalTasks.size>50)proposalTasks.delete(proposalTasks.keys().next().value);}else task.evidence=packet.evidence||[];
   task.job.chatContext.assistant_tool_evidence=task.evidence.map(row=>({id:row.id,baslangic:row.start,bitis:row.end,metin:row.text,ceviri:row.translation}));
   task.job.bubble._chatContext=task.job.chatContext;
   task.job.bubble._transcriptEvidence=task.job.chatContext.assistant_tool_evidence;
   window.AssistantWorkspace?.evidence(task.job,{evidence:task.evidence,actions:task.actions});
  }else if(packet.type==='capabilities'){
   task.capabilities=packet.value;
   if(packet.value?.tools==='unsupported')document.dispatchEvent(new CustomEvent('assistant-tool-support',{detail:{supported:false}}));
  }
  changed();
 });
 async function message(text,mode='steer'){
  const task=pending;if(!task||task.cancelled||!window.AssistantAppActions.current(task.owner))throw Error(t('No active task on this source.','Bu kaynakta etkin görev yok.'));
  if(!['steer','followup'].includes(mode)||typeof text!=='string'||!text.trim()||text.length>4000)throw Error(t('Enter a short task message.','Kısa bir görev mesajı yaz.'));
  const result=await window.api.assistantAgentMessage({requestId:task.id,owner:task.owner,mode,text});if(!result?.ok)throw Error(result?.error||t('Message could not be queued.','Mesaj sıraya alınamadı.'));return result;
 }
 async function cancel(){
  const task=pending||applying;if(!task||task.cancelled)return;
  task.cancelled=true;if(task.job)task.job.bubble.textContent=(task.text?task.text+'\n\n':'')+t('Stopping…','Durduruluyor…');changed();
  await window.api.assistantAgentCancel({requestId:task.id});
 }
 async function apply(proposal){
  if(pending||applying)throw Error(t('Wait for the current assistant action.','Geçerli asistan işlemini bekle.'));
  const task={id:proposal.proposalId,owner:window.AssistantAppActions.snapshot(),phase:'applying'};applying=task;changed();let result;
  try{const response=await window.api.assistantAgentApply({proposalId:proposal.proposalId,owner:task.owner});
   // The same approval is still running: keep the card as it is; nothing is marked failed or applied.
   if(response?.pending)throw Error(errorText(response.error)||t('This action is still running.','Bu işlem hâlâ sürüyor.'));
   result=response?.ok?response.result:response?.uncertain||response?.unconfirmed?{status:'unknown',error:response.error}:{status:task.cancelled?'stopped':'failed',refreshable:response?.refreshable===true,error:response?.error||t('Action failed.','İşlem başarısız oldu.')};
   if(response?.ok&&response.replayed)result={...result,note:[result.note,t('This approval was already applied; it was not applied again.','Bu onay zaten uygulanmıştı; yeniden uygulanmadı.')].filter(Boolean).join(' ')};if(typeof result.error==='string')result.error=errorText(result.error);
   if(result.continuationState==='unverified')result.note=(result.note||'')+' '+t('Follow this job in Jobs; its completion cannot be linked to an automatic next step.','Bu işi İşler bölümünden takip et; tamamlanması sonraki adıma güvenle bağlanamıyor.');
   if(result.continuationState==='limit')result.note=(result.note||'')+' '+t('Eight applied steps reached. Ask a new question to continue.','Sekiz uygulanan adıma ulaşıldı. Devam etmek için yeni bir soru sor.');
   window.AssistantWorkspace?.actionResult(proposal.proposalId,result);
   for(const id of result.invalidatedProposalIds||[])window.AssistantWorkspace?.actionResult(id,{status:'stopped',note:t('Previous results changed. Continue the latest applied step to plan again.','Önceki sonuçlar değişti. Yeniden planlamak için uygulanan son adımdan devam et.')});
   const origin=proposalTasks.get(proposal.proposalId);if(result.continuationId&&origin&&window.AssistantAppActions.current(task.owner))continuations.set(proposal.proposalId,{token:result.continuationId,proposalId:proposal.proposalId,owner:task.owner,origin,expires:Date.now()+600000,maxExpires:Date.now()+86400000,waiting:result.continuationState==='waiting',jobId:result.continuationJobId||null});while(continuations.size>50)continuations.delete(continuations.keys().next().value);
   if(['failed','stopped','unknown'].includes(result.status))throw Error(result.error||t('Action stopped. A started media job remains separately controlled in Jobs.','Asistan işlemi durdu. Başlamış medya işi İşler bölümünden ayrıca yönetilir.'));return result;
  }finally{if(applying===task)applying=null;changed();}
 }
 async function refresh(proposal){
  if(pending||applying)throw Error(t('Wait for the current assistant action.','Geçerli asistan işlemini bekle.'));
  const task={id:proposal.proposalId,owner:window.AssistantAppActions.snapshot(),phase:'applying'};applying=task;changed();
  try{
   const response=await window.api.assistantAgentApply({mode:'refresh',proposalId:proposal.proposalId,owner:task.owner});
   if(!response?.ok||!response.action)throw Error(errorText(response?.error)||t('The card could not be refreshed. Ask for a new proposal.','Kart yenilenemedi. Yeni bir öneri iste.'));
   if(task.cancelled||!window.AssistantAppActions.current(task.owner))throw Error(t('The source changed. No action was applied.','Kaynak değişti. İşlem uygulanmadı.'));
   window.AssistantWorkspace.replaceProposal(proposal.proposalId,response.action);
   const origin=proposalTasks.get(proposal.proposalId);if(origin)proposalTasks.set(response.action.proposalId,origin);
   proposalTasks.delete(proposal.proposalId);continuations.delete(proposal.proposalId);
   return response.action;
  }finally{if(applying===task)applying=null;changed();}
 }
 const flowInfo=proposal=>{
  const row=continuations.get(proposal.proposalId);if(!row||!window.AssistantWorkspace?.canResume(proposal.proposalId)||!window.AssistantAppActions.current(row.owner))return {canContinue:false,waiting:false};
  const state=window.AssistantFlowState.describe(row,window.AssistantJobsUI?.snapshot()?.jobs||[]);
  const notes={partial:t('This job finished with a partial output. Inspect the missing lines before preparing voice.','Bu iş kısmi çıktıyla bitti. Ses hazırlamadan önce eksik satırları kontrol et.'),running:t('The exact job is still running.','İlgili iş hâlâ sürüyor.'),cancelling:t('Waiting for the job to stop.','İşin durması bekleniyor.'),failed:t('This stage failed. Review its result in Jobs, then request a new approval card for this stage only. Completed steps are kept.','Bu adım başarısız. Sonucunu İşler bölümünde incele, sonra yalnız bu adım için yeni onay kartı iste. Tamamlanan adımlar korunur.'),stopped:t('The previous job was stopped. No next step will start.','Önceki iş durduruldu. Sonraki adım başlamaz.'),unverified:t('The exact job is no longer available. Open Jobs.','İlgili iş artık doğrulanamıyor. İşler bölümünü aç.'),expired:t('This continuation expired. Ask a new question.','Bu devam isteği eskidi. Yeni bir soru sor.')};
  return {canContinue:state.ready||state.waiting||state.retryable,waiting:state.waiting,retryable:state.retryable===true,flowState:state.state,partial:state.partial===true,flowNote:notes[state.state]||'',progress:state.percent};
 };

 async function continueAction(proposal){const info=flowInfo(proposal);if(!info.canContinue||info.waiting)throw Error(info.flowNote||t('This step is not ready.','Bu adım hazır değil.'));const row=continuations.get(proposal.proposalId);if(!row||window.AssistantFlowState.expiry(row,window.AssistantJobsUI?.snapshot()?.jobs||[])<=Date.now()||pending||applying||!window.AssistantWorkspace?.canResume(proposal.proposalId)||!window.AssistantAppActions.current(row.owner))throw Error(t('This continuation is no longer available.','Bu devam isteği artık kullanılamıyor.'));continuations.delete(proposal.proposalId);changed();let consumed=false;try{const context=row.origin.frozen?{...row.origin.frozen}:aiChatContext();context.assistant_tools=window.AssistantWorkspace?.toolContext();const result=await send(row.origin.question,context,row.origin.history,aiSourceScope(),row);consumed=!!result?.ok&&!result.waiting;return result;}finally{if(!consumed&&window.AssistantFlowState.expiry(row,window.AssistantJobsUI?.snapshot()?.jobs||[])>Date.now()&&window.AssistantAppActions.current(row.owner)&&window.AssistantWorkspace?.canResume(proposal.proposalId))continuations.set(proposal.proposalId,row);changed();}}
 // A prepared book intentionally opens its exact new production source. Only
 // this applying action may adopt that single context commit; other navigation
 // and explicit cancellation retain the usual stale-source protection.
 async function bookPreparation(owner,projectId,chapter,open){
  const task=applying;
  if(!window.AssistantAppActions.current(owner)||task?.cancelled)throw Error(t('Book source changed.','Kitap kaynağı değişti.'));
  if(!task||!window.AssistantContextManifest.same(task.owner,owner))return open();
  const target=String(projectId)+':'+chapter;
  task.bookHandoff=target;
  try{return await open();}finally{if(task.bookHandoff===target)delete task.bookHandoff;}
 }
 const canRetry=()=>!!retryPacket&&window.AssistantAppActions.current(retryPacket.owner);
 async function retry(){if(!canRetry()||pending||applying)return;const row=retryPacket;await send(row.question,row.context,row.history,row.scope,undefined,row.options);}
 window.AssistantAgentUI=Object.freeze({send,message,status,busy:()=>!!pending||!!applying,applyingId:()=>applying?.id||null,cancel,apply,refresh,flowInfo,continueAction,canRetry,retry,bookPreparation});
 document.addEventListener('media-context-changed',()=>{const task=pending||applying;
  if(task===applying&&task&&!task.cancelled&&task.bookHandoff&&window.globalAssistantContext?.()?.id===task.bookHandoff){
   const next=window.AssistantAppActions.snapshot();
   if(next.kind==='book'){delete task.bookHandoff;task.owner=next;return;}
  }
  if(task&&!window.AssistantAppActions.current(task.owner))void cancel();
 });
 window.addEventListener('pagehide',()=>{unsubscribe?.();const task=pending||applying;if(task)void window.api.assistantAgentCancel({requestId:task.id});});
})();
