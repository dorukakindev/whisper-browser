(() => {
 'use strict';
 if(!window.api?.assistantAgentRun||!window.api.onAssistantAgentEvent)return;
 let pending=null,retryPacket=null,applying=null;const proposalTasks=new Map(),continuations=new Map(),actionCalls=new Map();
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const errorText=value=>{const parts=String(value||'').split(' / ');return window.UiLocale?.get?.()==='tr'&&parts[1]?parts[1]:parts[0];};
 const changed=()=>{updateAiChatActions();document.dispatchEvent(new Event('assistant-agent-changed'));};
 const status=()=>{const task=pending||applying;return task&&window.AssistantAppActions.current(task.owner)?task:null;};
 async function send(question,context,history,scope,resume){
  if(pending||applying)return;retryPacket=null;
  const previous=resume?window.AssistantWorkspace.resume(resume.proposalId,context):null;
  const prefix=previous?.text?(previous.text.length>16000?t('Earlier flow text was shortened.\n','Önceki akış metni kısaltıldı.\n'):'')+previous.text.slice(-16000)+'\n\n':'';
  const task={id:crypto.randomUUID(),scope,question,history,context,owner:window.AssistantAppActions.snapshot(),text:prefix,prefix,actions:previous?.actions||[],evidence:previous?.evidence||[]};
  if(previous)task.job=previous.job;else{aiChatAdd('user',question);task.job={chatQuestion:question,chatContext:context,sourceScope:scope,bubble:aiChatAdd('ai',t('Connecting to your assistant…','Asistana bağlanılıyor…'),'is-loading')};window.AssistantWorkspace?.begin(task.job);}
  pending=task;changed();
  document.getElementById('aiChatText').value='';autoGrowChatBox();
  let result;
  try{
   if(!await saveAppSettings())throw Error(t('Provider settings could not be saved securely.','Sağlayıcı ayarları güvenli kaydedilemedi.'));
   if(task.cancelled||!window.AssistantAppActions.current(task.owner))throw Error(t('The source changed.','Kaynak değişti.'));
   result=await window.api.assistantAgentRun({requestId:task.id,question,continuationId:resume?.token,owner:task.owner,context:window.AssistantContextManifest.sourceText(context),
    pool:window.AssistantContextManifest.pool(context.assistant_tools?.rows),history,locale:window.UiLocale?.get?.()||'en'});
  }catch(error){result={ok:false,cancelled:!!task.cancelled,error:String(error.message)};}
  const current=window.AssistantAppActions.current(task.owner),state=result?.ok&&current?'complete':task.cancelled||result?.cancelled||!current?'stopped':'failed';
  let text=result?.ok?(result.text?prefix+String(result.text):task.text):[task.text,task.cancelled?t('Stopped. Received text was kept.','Durduruldu. Alınan metin korundu.'):errorText(result?.error)||t('Assistant request failed.','Asistan isteği başarısız oldu.')].filter(Boolean).join('\n\n');
  if(result?.ok&&result.capabilities?.tools==='unsupported')text+='\n\n'+t('This provider rejected application tools. The reply is text only; no application action was performed.','Bu sağlayıcı uygulama araçlarını reddetti. Yanıt yalnız metindir; uygulama işlemi yapılmadı.');
  if(text.length>32000)text=t('Earlier flow text was shortened.\n','Önceki akış metni kısaltıldı.\n')+text.slice(-31800);
  task.job.bubble.classList.remove('is-loading');if(state!=='complete')task.job.bubble.classList.add('ai-msg-err');
  renderAiText(task.job.bubble,text);window.AssistantWorkspace?.finish(task.job,text,state);
  if(result?.ok&&current){player.chatHistory=[...history,{role:'user',content:question},{role:'assistant',content:text}].slice(-24);player.chatHistoryScope=scope;document.dispatchEvent(new CustomEvent('assistant-answer',{detail:{text,context}}));}
  if(!resume&&!result?.ok&&current&&!task.cancelled&&!result?.cancelled)retryPacket={question,context,history,scope,owner:task.owner};
  if(pending===task)pending=null;changed();return result;
 }
 const unsubscribe=window.api.onAssistantAgentEvent(packet=>{
  if(!packet||typeof packet!=='object')return;
  if(packet.type==='action-cancel'){const call=actionCalls.get(packet.callId);if(call)call.cancelled=true;return;}
  if(packet.type==='action'){
   if(!Number.isFinite(packet.deadline)||packet.deadline<Date.now()){void window.api.assistantAgentResult({callId:packet.callId,result:{status:'failed',error:'Action expired / İşlem isteği eskidi.'}});return;}
   const call={cancelled:false};actionCalls.set(packet.callId,call);
   void window.AssistantAppActions.execute(packet.name,packet.args,packet.owner,{deadline:packet.deadline,isCancelled:()=>call.cancelled}).then(result=>window.api.assistantAgentResult({callId:packet.callId,result}))
    .catch(error=>window.api.assistantAgentResult({callId:packet.callId,result:{status:'failed',error:String(error.message).slice(0,300)}})).finally(()=>actionCalls.delete(packet.callId));return;
  }
  const task=pending;if(!task||packet.requestId!==task.id||task.cancelled)return;
  if(!window.AssistantAppActions.current(task.owner)){void cancel();return;}
  if(packet.type==='delta'){
   task.text=(task.text+String(packet.text||'')).slice(0,32000);task.job.bubble.textContent=task.text;window.AssistantWorkspace?.partial(task.job,task.text);
  }else if(packet.type==='proposal'||packet.type==='evidence'){
   if(packet.type==='proposal'){task.actions.push(packet.action);proposalTasks.set(packet.action.proposalId,{question:task.question,history:(task.history||[]).slice(-12).map(row=>({role:row.role,content:String(row.content||'').slice(0,5000)}))});while(proposalTasks.size>50)proposalTasks.delete(proposalTasks.keys().next().value);}else task.evidence=packet.evidence||[];
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
 async function cancel(){
  const task=pending||applying;if(!task||task.cancelled)return;
  task.cancelled=true;if(task.job)task.job.bubble.textContent=(task.text?task.text+'\n\n':'')+t('Stopping…','Durduruluyor…');changed();
  await window.api.assistantAgentCancel({requestId:task.id});
 }
 async function apply(proposal){
  if(pending||applying)throw Error(t('Wait for the current assistant action.','Geçerli asistan işlemini bekle.'));
  const task={id:proposal.proposalId,owner:window.AssistantAppActions.snapshot()};applying=task;changed();let result;
  try{const response=await window.api.assistantAgentApply({proposalId:proposal.proposalId,owner:task.owner});result=response?.ok?response.result:{status:task.cancelled?'stopped':'failed',error:response?.error||t('Action failed.','İşlem başarısız oldu.')};
   if(result.continuationState==='unverified')result.note=(result.note||'')+' '+t('Follow this job in Jobs; its completion cannot be linked to an automatic next step.','Bu işi İşler bölümünden takip et; tamamlanması sonraki adıma güvenle bağlanamıyor.');
   if(result.continuationState==='limit')result.note=(result.note||'')+' '+t('Eight applied steps reached. Ask a new question to continue.','Sekiz uygulanan adıma ulaşıldı. Devam etmek için yeni bir soru sor.');
   window.AssistantWorkspace?.actionResult(proposal.proposalId,result);
   for(const id of result.invalidatedProposalIds||[])window.AssistantWorkspace?.actionResult(id,{status:'stopped',note:t('Previous results changed. Continue the latest applied step to plan again.','Önceki sonuçlar değişti. Yeniden planlamak için uygulanan son adımdan devam et.')});
   const origin=proposalTasks.get(proposal.proposalId);if(result.continuationId&&origin&&window.AssistantAppActions.current(task.owner))continuations.set(proposal.proposalId,{token:result.continuationId,proposalId:proposal.proposalId,owner:task.owner,origin,expires:Date.now()+600000,waiting:result.continuationState==='waiting'});while(continuations.size>50)continuations.delete(continuations.keys().next().value);
   if(['failed','stopped'].includes(result.status))throw Error(result.error||t('Action stopped. A started media job remains separately controlled in Jobs.','Asistan işlemi durdu. Başlamış medya işi İşler bölümünden ayrıca yönetilir.'));return result;
  }finally{if(applying===task)applying=null;changed();}
 }
 const flowInfo=proposal=>{const row=continuations.get(proposal.proposalId);return {canContinue:!!row&&row.expires>Date.now()&&window.AssistantWorkspace?.canResume(proposal.proposalId)&&window.AssistantAppActions.current(row.owner),waiting:!!row?.waiting};};
 async function continueAction(proposal){const row=continuations.get(proposal.proposalId);if(!row||row.expires<Date.now()||pending||applying||!window.AssistantWorkspace?.canResume(proposal.proposalId)||!window.AssistantAppActions.current(row.owner))throw Error(t('This continuation is no longer available.','Bu devam isteği artık kullanılamıyor.'));continuations.delete(proposal.proposalId);changed();const context=aiChatContext();context.assistant_tools=window.AssistantWorkspace?.toolContext();const result=await send(row.origin.question,context,row.origin.history,aiSourceScope(),row);if(result?.waiting&&window.AssistantAppActions.current(row.owner))continuations.set(proposal.proposalId,row);changed();}
 const canRetry=()=>!!retryPacket&&window.AssistantAppActions.current(retryPacket.owner);
 async function retry(){if(!canRetry()||pending||applying)return;const row=retryPacket;await send(row.question,row.context,row.history,row.scope);}
 window.AssistantAgentUI=Object.freeze({send,status,busy:()=>!!pending||!!applying,cancel,apply,flowInfo,continueAction,canRetry,retry});
 document.addEventListener('media-context-changed',()=>{const task=pending||applying;if(task&&!window.AssistantAppActions.current(task.owner))void cancel();});
 window.addEventListener('pagehide',()=>{unsubscribe?.();const task=pending||applying;if(task)void window.api.assistantAgentCancel({requestId:task.id});});
})();
