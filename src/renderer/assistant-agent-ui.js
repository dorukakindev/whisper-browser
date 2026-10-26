(() => {
 'use strict';
 if(!window.api?.assistantAgentRun||!window.api.onAssistantAgentEvent)return;
 let pending=null;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const errorText=value=>{const parts=String(value||'').split(' / ');return window.UiLocale?.get?.()==='tr'&&parts[1]?parts[1]:parts[0];};
 const changed=()=>{updateAiChatActions();document.dispatchEvent(new Event('assistant-agent-changed'));};
 const status=()=>pending&&window.AssistantAppActions.current(pending.owner)?pending:null;
 async function send(question,context,history,scope){
  if(pending)return;
  const task={id:crypto.randomUUID(),scope,owner:window.AssistantAppActions.snapshot(),text:'',actions:[],evidence:[]};
  aiChatAdd('user',question);
  task.job={chatQuestion:question,chatContext:context,sourceScope:scope,bubble:aiChatAdd('ai',t('Connecting to your assistant…','Asistana bağlanılıyor…'),'is-loading')};
  window.AssistantWorkspace?.begin(task.job);pending=task;changed();
  document.getElementById('aiChatText').value='';autoGrowChatBox();
  let result;
  try{
   if(!await saveAppSettings())throw Error(t('Provider settings could not be saved securely.','Sağlayıcı ayarları güvenli kaydedilemedi.'));
   if(task.cancelled||!window.AssistantAppActions.current(task.owner))throw Error(t('The source changed.','Kaynak değişti.'));
   result=await window.api.assistantAgentRun({requestId:task.id,question,owner:task.owner,context:window.AssistantContextManifest.sourceText(context),
    pool:window.AssistantContextManifest.pool(context.assistant_tools?.rows),history,locale:window.UiLocale?.get?.()||'en'});
  }catch(error){result={ok:false,cancelled:!!task.cancelled,error:String(error.message)};}
  const current=window.AssistantAppActions.current(task.owner),state=result?.ok&&current?'complete':task.cancelled||result?.cancelled||!current?'stopped':'failed';
  let text=result?.ok?String(result.text||task.text):[task.text,task.cancelled?t('Stopped. Received text was kept.','Durduruldu. Alınan metin korundu.'):errorText(result?.error)||t('Assistant request failed.','Asistan isteği başarısız oldu.')].filter(Boolean).join('\n\n');
  if(result?.ok&&result.capabilities?.tools==='unsupported')text+='\n\n'+t('This provider rejected application tools. The reply is text only; no application action was performed.','Bu sağlayıcı uygulama araçlarını reddetti. Yanıt yalnız metindir; uygulama işlemi yapılmadı.');
  task.job.bubble.classList.remove('is-loading');if(state!=='complete')task.job.bubble.classList.add('ai-msg-err');
  renderAiText(task.job.bubble,text);window.AssistantWorkspace?.finish(task.job,text,state);
  if(result?.ok&&current){player.chatHistory=[...history,{role:'user',content:question},{role:'assistant',content:text}].slice(-24);player.chatHistoryScope=scope;document.dispatchEvent(new CustomEvent('assistant-answer',{detail:{text,context}}));}
  if(pending===task)pending=null;changed();
 }
 const unsubscribe=window.api.onAssistantAgentEvent(packet=>{
  if(!packet||typeof packet!=='object')return;
  if(packet.type==='action'){
   if(!Number.isFinite(packet.deadline)||packet.deadline<Date.now()){void window.api.assistantAgentResult({callId:packet.callId,result:{status:'failed',error:'Action expired / İşlem isteği eskidi.'}});return;}
   void window.AssistantAppActions.execute(packet.name,packet.args,packet.owner,{deadline:packet.deadline}).then(result=>window.api.assistantAgentResult({callId:packet.callId,result}))
    .catch(error=>window.api.assistantAgentResult({callId:packet.callId,result:{status:'failed',error:String(error.message).slice(0,300)}}));return;
  }
  const task=pending;if(!task||packet.requestId!==task.id||task.cancelled)return;
  if(!window.AssistantAppActions.current(task.owner)){void cancel();return;}
  if(packet.type==='delta'){
   task.text=(task.text+String(packet.text||'')).slice(0,32000);task.job.bubble.textContent=task.text;window.AssistantWorkspace?.partial(task.job,task.text);
  }else if(packet.type==='proposal'||packet.type==='evidence'){
   if(packet.type==='proposal')task.actions.push(packet.action);else task.evidence=packet.evidence||[];
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
  const task=pending;if(!task||task.cancelled)return;
  task.cancelled=true;task.job.bubble.textContent=(task.text?task.text+'\n\n':'')+t('Stopping…','Durduruluyor…');changed();
  await window.api.assistantAgentCancel({requestId:task.id});
 }
 async function apply(proposal){
  if(pending)throw Error(t('Wait for the assistant reply to finish.','Asistan yanıtının bitmesini bekle.'));
  const response=await window.api.assistantAgentApply({proposalId:proposal.proposalId,owner:window.AssistantAppActions.snapshot()});
  const result=response?.ok?response.result:{status:'failed',error:response?.error||t('Action failed.','İşlem başarısız oldu.')};
  window.AssistantWorkspace?.actionResult(proposal.proposalId,result);
  if(result.status==='failed')throw Error(result.error||t('Action failed.','İşlem başarısız oldu.'));
  return result;
 }
 window.AssistantAgentUI=Object.freeze({send,status,busy:()=>!!pending,cancel,apply});
 document.addEventListener('media-context-changed',()=>{if(pending&&!window.AssistantAppActions.current(pending.owner))void cancel();});
 window.addEventListener('pagehide',()=>{unsubscribe?.();if(pending)void window.api.assistantAgentCancel({requestId:pending.id});});
})();
