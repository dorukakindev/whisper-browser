(() => {
 'use strict';
 const cache=new Map(),failedLoads=new Set();let pendingLoad=null,lastError='',flushTimer;const queues=new Map();
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const uid=()=>crypto.randomUUID();
 const changed=()=>document.dispatchEvent(new CustomEvent('assistant-workspace-changed'));
 function key(){const global=globalAssistantContext();return global?JSON.stringify(['global',global.workspace,global.page,global.id,global.chapter]):JSON.stringify([player.workspaceMode,player.mediaKey]);}
 async function request(action,sourceKey,values={}){const r=await window.api.assistantThreads({action,sourceKey,...values});if(!r?.ok)throw Error(r?.error||t('Conversation could not be saved.','Sohbet kaydedilemedi.'));return r;}
 function restoreLog(){
  const thread=current(),scope=aiSourceScope(),log=document.getElementById('aiChatLog');if(!log)return;
  const nodes=[...log.querySelectorAll('.ai-msg')];
  for(const node of nodes)node.hidden=node._sourceScope!==scope||node._assistantThreadId!==(thread?.id||'');
  for(const row of thread?.messages||[]){
   if(nodes.some(n=>n._assistantMessageId===row.id&&n._sourceScope===scope&&n._assistantThreadId===thread.id))continue;
   const node=document.createElement('div');node.className='ai-msg ai-msg-'+(row.role==='user'?'user':'ai');
   if(row.status==='streaming')node.classList.add('is-loading');if(['stopped','failed'].includes(row.status))node.classList.add('ai-msg-err');
   node._sourceScope=scope;node._assistantThreadId=thread.id;node._assistantMessageId=row.id;
   const evidence=(row.evidence||[]).map(e=>({id:e.id,baslangic:e.start,bitis:e.end,metin:e.text,ceviri:e.translation}));
   node._transcriptEvidence=evidence;node._chatContext={transcript_evidence:{evidence:evidence.filter(e=>e.id.startsWith('T'))},assistant_tool_evidence:evidence.filter(e=>e.id.startsWith('U'))};
   if(row.role==='assistant')renderAiText(node,row.text);else node.textContent=row.text;log.append(node);
  }
  document.getElementById('aiChatEmpty')?.classList.toggle('hidden',!!thread?.messages.length);
 }
 function workspaceState(){return cache.get(key());}
 function current(){const value=workspaceState();return value?.threads.find(thread=>thread.id===value.active)||null;}
 function fail(error){lastError=error.message;changed();}
 async function load(sourceKey){
  if(cache.has(sourceKey))return cache.get(sourceKey);
  const r=await request('list',sourceKey);if(cache.has(sourceKey))return cache.get(sourceKey);
  const value={threads:r.threads,active:r.threads[0]?.id||null};cache.set(sourceKey,value);if(sourceKey===key())restoreLog();changed();return value;
 }
 function persist(thread){
  const previous=queues.get(thread.id)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   const data=structuredClone(thread);const r=await request('save',thread.sourceKey,{thread:data});thread.revision=r.thread.revision;thread.updatedAt=r.thread.updatedAt;lastError='';changed();
  });queues.set(thread.id,task);task.catch(fail).finally(()=>{if(queues.get(thread.id)===task)queues.delete(thread.id);});return task;
 }
 async function create(title,parent=null,messages=[]){
  const sourceKey=key(),value=await load(sourceKey);if(sourceKey!==key())throw Error(t('The source changed.','Kaynak değişti.'));
  if(value.threads.length>=20)throw Error(t('This source has 20 conversations. Remove an unused one.','Bu kaynakta 20 sohbet var. Kullanılmayan birini kaldır.'));
  const thread={id:uid(),sourceKey,title:title||t('New conversation','Yeni sohbet'),parentThreadId:parent,headId:messages.at(-1)?.id||null,messages:structuredClone(messages),revision:0,createdAt:Date.now(),updatedAt:Date.now()};
  await persist(thread);value.threads.unshift(thread);value.active=thread.id;restoreLog();changed();return thread;
 }
 function history(thread){const pairs=[];for(let i=0;i<thread.messages.length-1;i++){const user=thread.messages[i],reply=thread.messages[i+1];if(user.role==='user'&&reply.role==='assistant'&&reply.status==='complete'){pairs.push({role:'user',content:user.text},{role:'assistant',content:reply.text});i++;}}return pairs.slice(-24);}
 async function prepare(){
  const sourceKey=key(),scope=aiSourceScope();failedLoads.delete(sourceKey);await load(sourceKey);if(sourceKey!==key()||scope!==aiSourceScope())throw Error(t('The source changed.','Kaynak değişti.'));
  if(!current())await create();if(sourceKey!==key()||scope!==aiSourceScope())throw Error(t('The source changed.','Kaynak değişti.'));
  if(current().messages.length>196)throw Error(t('Start a new conversation; this one has reached its message limit.','Bu sohbet mesaj sınırına ulaştı; yeni sohbet başlat.'));
  player.chatHistory=history(current());player.chatHistoryScope=scope;
 }
 function snapshot(){
  const sourceKey=key(),value=cache.get(sourceKey);
  if(!value){if(pendingLoad!==sourceKey&&!failedLoads.has(sourceKey)){pendingLoad=sourceKey;void load(sourceKey).catch(error=>{failedLoads.add(sourceKey);fail(error);}).finally(()=>{if(pendingLoad===sourceKey)pendingLoad=null;});}return {ready:false,error:lastError,threads:[],current:null};}
  return {ready:true,error:lastError,threads:value.threads.map(r=>({id:r.id,title:r.title,updatedAt:r.updatedAt})),current:current()};
 }
 function begin(job){
  const thread=current();if(!thread)return;
  const user={id:uid(),parentId:thread.headId,role:'user',text:job.chatQuestion,status:'complete',evidence:[],actions:[]};
  const reply={id:uid(),parentId:user.id,role:'assistant',text:'',status:'streaming',evidence:[],actions:[]};
  thread.messages.push(user,reply);thread.headId=reply.id;
  if(thread.messages.length===2)thread.title=job.chatQuestion.slice(0,90);
  job.assistantRecord={thread,reply};
  job.bubble._assistantMessageId=reply.id;job.bubble._assistantThreadId=thread.id;
  const nodes=[...document.querySelectorAll('#aiChatLog .ai-msg-user')];const node=nodes.at(-1);if(node){node._assistantMessageId=user.id;node._assistantThreadId=thread.id;}
  const original=job.chatContext?.transcript_evidence?.evidence||[];
  reply.evidence=original.slice(0,40).map(row=>({id:row.id,start:Number(row.baslangic),end:Number(row.bitis)||Number(row.baslangic),text:String(row.metin||'').slice(0,1200),translation:String(row.ceviri||'').slice(0,1200)})).filter(row=>Number.isFinite(row.start));
  void persist(thread);changed();
 }
 function partial(job,text){const rec=job.assistantRecord;if(!rec)return;rec.reply.text=text;clearTimeout(flushTimer);flushTimer=setTimeout(()=>void persist(rec.thread),1000);changed();}
 function evidence(job,event){const rec=job.assistantRecord;if(!rec)return;rec.reply.evidence=[...rec.reply.evidence,...(event.evidence||[])].slice(-40);rec.reply.actions=event.actions||[];changed();}
 function finish(job,text,status){const rec=job.assistantRecord;if(!rec)return;if(rec.reply.status!=='streaming')return;clearTimeout(flushTimer);rec.reply.text=String(text||rec.reply.text||'').slice(0,32000);rec.reply.status=status;void persist(rec.thread);changed();}
 async function command(action,value){
  if(aiChatPreparing||stateGlobalBusy())throw Error(t('Stop the running job before switching conversations.','Sohbet değiştirmeden önce çalışan işi durdur.'));
  const sourceKey=key();await load(sourceKey);if(sourceKey!==key())throw Error(t('The source changed.','Kaynak değişti.'));
  const state=cache.get(sourceKey);
  if(action==='new-thread')await create();
  if(action==='select-thread'){if(!state.threads.some(r=>r.id===value))throw Error('Conversation not found.');state.active=value;}
  if(action==='rename-thread'){const thread=current();if(!thread)return;thread.title=String(value||'').trim().slice(0,200)||thread.title;await persist(thread);}
  if(action==='delete-thread'){const thread=current();if(!thread)return;await queues.get(thread.id)?.catch(()=>{});await request('delete',sourceKey,{id:thread.id});state.threads=state.threads.filter(r=>r.id!==thread.id);state.active=state.threads[0]?.id||null;}
  if(action==='branch'){const thread=current(),index=thread?.messages.findIndex(row=>row.id===value);if(index==null||index<0)throw Error('Message no longer exists.');let end=index,question='';if(thread.messages[index].role==='assistant'){end=Math.max(0,index-1);question=thread.messages[end]?.role==='user'?thread.messages[end].text:'';}else question=thread.messages[index].text;const next=await create(t('Branch: ','Dal: ')+thread.title,thread.id,thread.messages.slice(0,end));next.draft=question;}
  if(current()){player.chatHistory=history(current());player.chatHistoryScope=aiSourceScope();}else{player.chatHistory=[];player.chatHistoryScope=null;}
  restoreLog();changed();
 }
 function stateGlobalBusy(){return !!(window.AssistantMediaCommands?.busy()||window.AssistantPageCommands?.busy()||state.running||state.queueRunning||player.job?.running||player.job?.awaitingExit);}
 function clear(){const thread=current();if(thread){thread.messages=[];thread.headId=null;void persist(thread);changed();}}
 function toolContext(){
  if(globalAssistantContext())return null;
  const now=player.workspaceMode==='browser'?player.browserTime:subtitleSourceTime(document.getElementById('playerVideo')?.currentTime||0,false);
  const scope=document.getElementById('aiTranscriptScope')?.value||'watched';
  let rows;if(player.workspaceMode==='browser')rows=aiVideoRows();else{const roles=browserSubtitleRoleCues(),source=roles.source.length?roles.source:roles.translation;const translations=roles.source.length&&roles.translation.length?translationsForCues(source,roles.translation):[];rows=source.map((row,index)=>({...row,translation:translations[index]||''}));}
  const eligible=rows.map((row,index)=>({...row,id:'U'+index})).filter(row=>Number.isFinite(row.start)&&Number.isFinite(row.end)&&(scope!=='watched'||row.start<=now+.75)&&(scope!=='nearby'||Math.abs(row.start-now)<=180));
  const step=Math.max(1,Math.ceil(eligible.length/3000));const pool=eligible.filter((row,index)=>index%step===0||row.start<=now&&row.end>=now).slice(0,3100).map(row=>({id:row.id,start:row.start,end:row.end,text:String(row.text||'').slice(0,500),translation:String(row.translation||'').slice(0,500)}));
  return {enabled:pool.length>0,time:now,scope,truncated:step>1,rows:pool};
 }
 window.AssistantWorkspace=Object.freeze({key,snapshot,prepare,begin,partial,evidence,finish,command,clear,toolContext,activeId:()=>current()?.id||''});
 document.addEventListener('media-context-changed',()=>{if(workspaceState())restoreLog();});
 window.addEventListener('pagehide',()=>{clearTimeout(flushTimer);});
})();
