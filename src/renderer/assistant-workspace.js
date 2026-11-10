(() => {
 'use strict';
 const cache=new Map(),failedLoads=new Set();let pendingLoad=null,lastError='';const queues=new Map(),flushTimers=new Map(),removedThreads=new WeakSet(),replyOwners=new WeakMap();
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const uid=()=>crypto.randomUUID();
 const changed=()=>document.dispatchEvent(new CustomEvent('assistant-workspace-changed'));
 function key(){return window.AssistantSourceContext.conversation(player,globalAssistantContext());}
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
   node._feedEvidence=row.feedEvidence||[];
   node._transcriptEvidence=evidence;node._chatContext={transcript_evidence:{evidence:evidence.filter(e=>e.id.startsWith('T'))},assistant_tool_evidence:evidence.filter(e=>e.id.startsWith('U')),page:row.pageEvidence?.length?{blocks:row.pageEvidence,source:row.pageEvidence[0].source}:null};
   if(row.pageEvidence?.[0]?.source?.tabId)node.dataset.pageSourceTabId=row.pageEvidence[0].source.tabId;
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
  const value={capacity:r.capacity,threads:r.threads,active:r.threads[0]?.id||null};cache.set(sourceKey,value);if(sourceKey===key())restoreLog();changed();return value;
 }
 function cancelFlush(thread){clearTimeout(flushTimers.get(thread));flushTimers.delete(thread);}
 function scheduleFlush(thread){if(removedThreads.has(thread)||flushTimers.has(thread))return;flushTimers.set(thread,setTimeout(()=>{flushTimers.delete(thread);void persist(thread);},1000));}
 // A job owns its original reply even after navigation, but never a cleared,
 // deleted, completed, or resumed-by-another-job reply.
 function record(job){const rec=job.assistantRecord;if(!rec||removedThreads.has(rec.thread)||replyOwners.get(rec.reply)!==rec||rec.reply.status!=='streaming'||!rec.thread.messages.includes(rec.reply))return null;return rec;}
 function own(job,thread,reply){const rec={thread,reply};job.assistantRecord=rec;replyOwners.set(reply,rec);}
 function persist(thread){
  if(removedThreads.has(thread))return Promise.resolve();
  const previous=queues.get(thread.id)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   if(removedThreads.has(thread))return;
   const data=structuredClone(thread);const r=await request('save',thread.sourceKey,{thread:data});thread.revision=r.thread.revision;thread.updatedAt=r.thread.updatedAt;const state=cache.get(thread.sourceKey);if(state&&r.capacity)state.capacity=r.capacity;lastError='';changed();
  });queues.set(thread.id,task);task.catch(fail).finally(()=>{if(queues.get(thread.id)===task)queues.delete(thread.id);});return task;
 }
 async function create(title,parent=null,messages=[]){
  const sourceKey=key(),value=await load(sourceKey);if(sourceKey!==key())throw Error(t('The source changed.','Kaynak değişti.'));
  if(value.threads.length>=20)throw Error(t('This source has 20 conversations. Remove an unused one.','Bu kaynakta 20 sohbet var. Kullanılmayan birini kaldır.'));
  const thread={id:uid(),sourceKey,title:title||t('New conversation','Yeni sohbet'),parentThreadId:parent,headId:messages.at(-1)?.id||null,messages:structuredClone(messages),revision:0,createdAt:Date.now(),updatedAt:Date.now()};
  await persist(thread);value.threads.unshift(thread);value.active=thread.id;restoreLog();changed();return thread;
 }
 async function artifact(messageId,kind) {
  const thread=current(),sourceKey=key();
  const message=thread?.messages.find(row=>row.id===messageId);
  if(!message||message.role!=='assistant'||message.status!=='complete')throw Error(t('A completed reply is required.','Tamamlanmış bir yanıt gerekli.'));
  await persist(thread);
  if(current()!==thread||key()!==sourceKey)throw Error(t('The source changed.','Kaynak değişti.'));
  const result=await window.api.assistantArtifacts({action:'from-message',sourceKey,threadId:thread.id,messageId,kind});
  if(!result?.ok)throw Error(result?.code==='no-cited-content'?t('No explicit source citations are available for this output.','Bu çıktı için açık kaynak işareti bulunamadı.'):t('The output could not be saved.','Çıktı kaydedilemedi.'));
  if(removedThreads.has(thread))return;
  const ref=window.AssistantArtifactStore.makeThreadRef(result.doc);
  message.artifacts=[...(message.artifacts||[]).filter(row=>row.artifactId!==ref.artifactId),ref].slice(-8);
  await persist(thread);
  if(current()===thread&&key()===sourceKey)await window.AssistantArtifactsUI.open(ref.artifactId);
 }
 async function openArtifact(id) {
  const thread=current();
  const listed=thread?.messages.some(row=>row.artifacts?.some(ref=>ref.artifactId===id));
  const saved=await window.api.assistantArtifacts({action:'list',threadId:thread?.id});
  if(!thread||current()!==thread||(!listed&&!saved?.artifacts?.some(ref=>ref.artifactId===id)))throw Error(t('Output is unavailable in this conversation.','Bu sohbette çıktı bulunamadı.'));
  try{await window.AssistantArtifactsUI.open(id);}catch(error){throw Error(error.message+' '+t('Keep the saved conversation. Review its source and, if needed, explicitly save a new output from the original reply. Nothing was regenerated.','Kayıtlı sohbeti koru. Kaynağını incele ve gerekiyorsa asıl yanıttan açıkça yeni çıktı kaydet. Yeniden üretim yapılmadı.'));}
 }
 function history(thread){const pairs=[];for(let i=0;i<thread.messages.length-1;i++){const user=thread.messages[i],reply=thread.messages[i+1];if(user.role==='user'&&reply.role==='assistant'&&reply.status==='complete'){pairs.push({role:'user',content:user.text},...(reply.runtimeMessages||[]).filter(row=>row.status==='delivered').map(row=>({role:'user',content:row.text})),{role:'assistant',content:reply.text});i++;}}return pairs.slice(-24);}
 async function prepare(){
  const sourceKey=key(),scope=aiSourceScope();failedLoads.delete(sourceKey);await load(sourceKey);if(sourceKey!==key()||scope!==aiSourceScope())throw Error(t('The source changed.','Kaynak değişti.'));
  if(!current())await create();if(sourceKey!==key()||scope!==aiSourceScope())throw Error(t('The source changed.','Kaynak değişti.'));
  if(current().messages.length>196)throw Error(t('Start a new conversation; this one has reached its message limit.','Bu sohbet mesaj sınırına ulaştı; yeni sohbet başlat.'));
  player.chatHistory=history(current());player.chatHistoryScope=scope;
 }
 function snapshot(){
  const sourceKey=key(),value=cache.get(sourceKey);
  if(!value){if(pendingLoad!==sourceKey&&!failedLoads.has(sourceKey)){pendingLoad=sourceKey;void load(sourceKey).catch(error=>{failedLoads.add(sourceKey);fail(error);}).finally(()=>{if(pendingLoad===sourceKey)pendingLoad=null;});}return {ready:false,error:lastError,threads:[],current:null};}
  return {ready:true,error:lastError,capacity:{...value.capacity,messages:current()?.messages.length||0,messageLimit:200,sourceThreads:value.threads.length,sourceLimit:20},threads:value.threads.map(r=>({id:r.id,title:r.title,updatedAt:r.updatedAt})),current:current()};
 }
 function begin(job){
  const thread=current();if(!thread||job.sourceScope&&job.sourceScope!==aiSourceScope()||job.bubble?._assistantThreadId&&job.bubble._assistantThreadId!==thread.id)return;
  const user={id:uid(),parentId:thread.headId,role:'user',text:job.chatQuestion,status:'complete',evidence:[],actions:[]};
  const reply={id:uid(),parentId:user.id,role:'assistant',text:'',status:'streaming',evidence:[],actions:[]};
  thread.messages.push(user,reply);thread.headId=reply.id;
  if(thread.messages.length===2)thread.title=job.chatQuestion.slice(0,90);
  own(job,thread,reply);
  job.bubble._assistantMessageId=reply.id;job.bubble._assistantThreadId=thread.id;
  const nodes=[...document.querySelectorAll('#aiChatLog .ai-msg-user')];const node=nodes.filter(node=>node._sourceScope===aiSourceScope()&&node._assistantThreadId===thread.id).at(-1);if(node){node._assistantMessageId=user.id;node._assistantThreadId=thread.id;}
  const original=job.chatContext?.transcript_evidence?.evidence||[];
  reply.evidence=original.slice(0,40).map(row=>({id:row.id,start:Number(row.baslangic),end:Number(row.bitis)||Number(row.baslangic),text:String(row.metin||'').slice(0,1200),translation:String(row.ceviri||'').slice(0,1200)})).filter(row=>Number.isFinite(row.start));
  reply.feedEvidence=(job.chatContext?.feedSources||[]).slice(0,3).map(({id,entryId,nodeId,title,url,scope,revision,reactionRevision,text,shortened})=>({id,entryId,nodeId,title,url,scope,revision,reactionRevision,text:String(text||'').slice(0,1200),shortened:!!shortened}));
  job.bubble._feedEvidence=reply.feedEvidence;
  const page=job.chatContext?.page;
  reply.pageEvidence=(page?.blocks||[]).slice(0,80).filter(row=>/^S[0-9]{1,5}$/.test(row.id)&&typeof row.text==='string').map(row=>({id:row.id,text:row.text.slice(0,2000),source:page.source||{tabId:job.sourcePageTabId||job.bubble.dataset?.pageSourceTabId||player.browserActiveTabId||'',generation:typeof browserTabState==='function'?browserTabState()?.generation:null,pageUrl:page.url||player.browserPageUrl||''}}));
  void persist(thread);changed();
 }
 function resume(proposalId,context){const thread=current(),reply=thread?.messages.find(row=>row.actions?.some(action=>action.proposalId===proposalId));if(!reply||thread.headId!==reply.id)throw Error(t('Continue only the latest reply in this conversation.','Bu sohbette yalnız son yanıttan devam edilebilir.'));restoreLog();const bubble=[...document.querySelectorAll('#aiChatLog .ai-msg')].find(node=>node._assistantMessageId===reply.id&&node._assistantThreadId===thread.id&&node._sourceScope===aiSourceScope());if(!bubble)throw Error('Reply is unavailable.');reply.status='streaming';bubble.classList.add('is-loading');bubble.classList.remove('ai-msg-err');const job={chatContext:context,sourceScope:aiSourceScope(),bubble};own(job,thread,reply);scheduleFlush(thread);changed();return {job,text:reply.text,actions:reply.actions||[],evidence:reply.evidence||[],citations:reply.citations||[],steps:reply.steps||[],runtimeMessages:reply.runtimeMessages||[]};}
 function citations(job,rows){const rec=record(job);if(!rec)return;rec.reply.citations=structuredClone(rows||[]);scheduleFlush(rec.thread);changed();}
 function basis(job,value){const rec=record(job);if(!rec)return;rec.reply.basis={unverified:Math.max(0,Math.min(40,Math.trunc(Number(value?.unverified))||0))};scheduleFlush(rec.thread);changed();}
 function runtime(job,rows){const rec=record(job);if(!rec)return;rec.reply.runtimeMessages=structuredClone(rows||[]).slice(-8);scheduleFlush(rec.thread);changed();}
 function steps(job,rows){const rec=record(job);if(!rec)return;rec.reply.steps=window.AssistantRunSteps.clean(rows);scheduleFlush(rec.thread);changed();}
 function partial(job,text){const rec=record(job);if(!rec)return;rec.reply.text=String(text||'').slice(0,32000);scheduleFlush(rec.thread);changed();}
 function evidence(job,event){const rec=record(job);if(!rec)return;window.AssistantRunSteps.actionCapacity(event.actions||[]);rec.reply.evidence=[...new Map([...rec.reply.evidence,...(event.evidence||[])].map(row=>[row.id,row])).values()].slice(-40);rec.reply.actions=structuredClone(event.actions||[]);scheduleFlush(rec.thread);changed();}
 function finish(job,text,status){const rec=record(job);if(!rec)return;cancelFlush(rec.thread);rec.reply.text=String(text||rec.reply.text||'').slice(0,32000);rec.reply.status=status;void persist(rec.thread);changed();}
 async function command(action,value){
  if(aiChatPreparing||stateGlobalBusy())throw Error(t('Stop the running job before switching conversations.','Sohbet değiştirmeden önce çalışan işi durdur.'));
  const sourceKey=key();await load(sourceKey);if(sourceKey!==key())throw Error(t('The source changed.','Kaynak değişti.'));
  const state=cache.get(sourceKey);
  if(action==='new-thread')await create();
  if(action==='select-thread'){if(!state.threads.some(r=>r.id===value))throw Error('Conversation not found.');state.active=value;}
  if(action==='rename-thread'){const thread=current();if(!thread)return;thread.title=String(value||'').trim().slice(0,200)||thread.title;await persist(thread);}
  if(action==='delete-thread'){const thread=current();if(!thread)return;removedThreads.add(thread);cancelFlush(thread);try{await queues.get(thread.id)?.catch(()=>{});await request('delete',sourceKey,{id:thread.id});}catch(error){removedThreads.delete(thread);scheduleFlush(thread);throw error;}state.threads=state.threads.filter(r=>r.id!==thread.id);state.active=state.threads[0]?.id||null;}
  if(action==='branch'){const thread=current(),index=thread?.messages.findIndex(row=>row.id===value);if(index==null||index<0)throw Error('Message no longer exists.');let end=index,question='';if(thread.messages[index].role==='assistant'){end=Math.max(0,index-1);question=thread.messages[end]?.role==='user'?thread.messages[end].text:'';}else question=thread.messages[index].text;const next=await create(t('Branch: ','Dal: ')+thread.title,thread.id,thread.messages.slice(0,end));next.draft=question;}
  if(current()){player.chatHistory=history(current());player.chatHistoryScope=aiSourceScope();}else{player.chatHistory=[];player.chatHistoryScope=null;}
  restoreLog();changed();
 }
 function stateGlobalBusy(){return !!(window.AssistantAgentUI?.busy()||window.AssistantVideoCommands?.busy()||window.AssistantMediaCommands?.busy()||window.AssistantPageCommands?.busy()||(player.job?.kind==='chat'&&(player.job.running||player.job.awaitingExit)));}
 function actionResult(proposalId,result){
  for(const value of cache.values())for(const thread of value.threads)for(const message of thread.messages){
   const action=message.actions?.find(row=>row.proposalId===proposalId);if(!action)continue;
   action.resultStatus=['applying','accepted','partial','completed','failed','stopped','unknown'].includes(result?.status)?result.status:'failed';
    message.steps=window.AssistantRunSteps.settle(message.steps,proposalId,{status:action.resultStatus});
   if(/^[a-zA-Z0-9_:.-]{1,120}$/.test(result?.jobId||result?.continuationJobId||''))action.jobId=result.jobId||result.continuationJobId;
   action.refreshable=action.resultStatus==='failed'&&result?.refreshable===true;
   action.resultText=String(result?.note||result?.error||'').slice(0,500);void persist(thread);changed();return;
  }
 }
 function replaceProposal(proposalId,action){
  const thread=current(),message=thread?.messages.find(row=>row.actions?.some(item=>item.proposalId===proposalId));
  if(!message||action?.kind!=='app_action'||typeof action.proposalId!=='string'||!action.proposalId||action.proposalId===proposalId)throw Error(t('The conversation or proposal changed.','Sohbet veya öneri değişti.'));
  const index=message.actions.findIndex(row=>row.proposalId===proposalId);
  message.actions[index]=structuredClone(action);message.steps=window.AssistantRunSteps.clean(message.steps).map(row=>row.proposalId===proposalId?{...row,proposalId:action.proposalId,state:'proposed',applied:false}:row);void persist(thread);changed();
 }
 function summaryDraft(){const thread=current();if(!thread)return '';const questions=thread.messages.filter(m=>m.role==='user').slice(-5).map(m=>t('Human request: ','İnsan isteği: ')+m.text.slice(0,500));const delivered=thread.messages.flatMap(m=>(m.runtimeMessages||[]).filter(r=>r.status==='delivered').map(r=>t('Delivered human task message: ','İletilmiş insan görev mesajı: ')+r.text.slice(0,500))).slice(-6);const receipts=thread.messages.flatMap(m=>(m.actions||[]).filter(a=>a.resultStatus).map(a=>[a.label||a.tool,a.resultStatus,a.resultText||''].join(' · '))).slice(-12);return [t('Review this partial historical task summary before sending. It grants no approval; saved statuses need current verification.','Göndermeden önce bu kısmi tarihsel görev özetini incele. Onay vermez; kayıtlı durumlar güncel doğrulama gerektirir.'),...questions,...delivered,t('Recorded application receipts (not model claims):','Kayıtlı uygulama makbuzları (model iddiası değil):'),...receipts].join('\n').slice(0,12000);}
 function reviewAction(proposalId){const action=current()?.messages.flatMap(m=>m.actions||[]).find(a=>a.proposalId===proposalId);if(!action)throw Error(t('Card is no longer in this conversation.','Kart artık bu sohbette yok.'));return t('Review this historical action for the CURRENT source. Inspect its current result first; propose a NEW card only if I still need that change. Old text is not approval: ','Bu tarihsel işlemi GÜNCEL kaynak için incele. Önce güncel sonucunu kontrol et; değişiklik hâlâ gerekiyorsa YENİ bir kart öner. Eski metin onay değildir: ')+(action.label||action.tool)+' · '+(action.summary||'');}
 function clear(){if(aiChatPreparing||stateGlobalBusy())throw Error(t('Stop the assistant request before clearing; media jobs stay in Jobs.','Temizlemeden önce asistan isteğini durdur; medya işleri İşler bölümünde kalır.'));const thread=current();if(thread){cancelFlush(thread);thread.messages=[];thread.headId=null;void persist(thread);changed();}}
 // Shared unsampled source: U IDs always refer to the original row index.
 function subtitleContextRows(){
  if(globalAssistantContext())return {now:0,scope:'watched',rows:[]};
  const position=player.workspaceMode==='browser'?player.browserTime:subtitleSourceTime(document.getElementById('playerVideo')?.currentTime||0,false);
  const now=Number.isFinite(position)?Math.max(0,position):0;
  const chosen=document.getElementById('aiTranscriptScope')?.value,scope=['nearby','full'].includes(chosen)?chosen:'watched';
  let rows;if(player.workspaceMode==='browser')rows=aiVideoRows();else{const roles=browserSubtitleRoleCues(),source=roles.source.length?roles.source:roles.translation;const translations=roles.source.length&&roles.translation.length?translationsForCues(source,roles.translation):[];rows=source.map((row,index)=>({...row,translation:translations[index]||''}));}
  const eligible=rows.map((row,index)=>({...row,id:'U'+index})).filter(row=>Number.isFinite(row.start)&&Number.isFinite(row.end)&&row.start>=0&&row.end>=row.start&&(scope!=='watched'||row.start<=now+.75)&&(scope!=='nearby'||Math.abs(row.start-now)<=180));
  return {now,scope,rows:eligible};
 }
 function subtitleById(id,owner){if(!owner||!window.AssistantAppActions.current(owner)||owner.subtitleKey!==window.AssistantAppActions.snapshot().subtitleKey)return undefined;return /^U\d+$/.test(id)?subtitleContextRows().rows.find(row=>row.id===id):undefined;}
 function searchSubtitleContext(name,args={}){
  const {now,scope,rows}=subtitleContextRows(),search=window.BrowserTranscriptSearch;
  if(!search?.transcriptExcerpt)throw Error(t('Subtitle retrieval is unavailable.','Altyazı araması kullanılamıyor.'));
  const terms=name==='search_subtitles'?search.transcriptTokens(args.query):[];
  if(name==='search_subtitles'&&!terms.length)throw Error(t('Use at least one searchable keyword of two or more characters.','En az iki karakterli aranabilir bir sözcük kullanın.'));
  const selected=name==='get_current_subtitle'?rows.filter(row=>row.start<=now&&row.end>=now).slice(0,3):terms.length?rows.map(row=>{const body=search.foldTranscriptText(String(row.text||'')+' '+String(row.translation||''));return {row,score:terms.reduce((score,word)=>score+(body.includes(word)?1:0),0)};}).filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score||a.row.start-b.row.start||Number(a.row.id.slice(1))-Number(b.row.id.slice(1))).slice(0,8).map(hit=>hit.row):[];
  const matches=selected.map(row=>{const source=search.transcriptExcerpt(row.text,terms,700),translation=search.transcriptExcerpt(row.translation,terms,700);return {id:row.id,start:row.start,end:row.end,text:source.text,translation:translation.text,
   ...(source.truncated?{textOffset:source.offset,textTruncated:true}:{}),...(translation.truncated?{translationOffset:translation.offset,translationTruncated:true}:{})};});
  return {status:'completed',matches,transcriptScope:scope,position:now,searchedCues:rows.length};
 }
 function toolContext(){
  if(globalAssistantContext())return null;
  const {now,scope,rows:eligible}=subtitleContextRows();
  const step=Math.max(1,Math.ceil(eligible.length/3000));const pool=eligible.filter((row,index)=>index%step===0||row.start<=now&&row.end>=now).slice(0,3100).map(row=>({id:row.id,start:row.start,end:row.end,text:String(row.text||'').slice(0,500),translation:String(row.translation||'').slice(0,500)}));
  return {enabled:pool.length>0,time:now,scope,truncated:step>1,rows:pool};
 }
 window.AssistantWorkspace=Object.freeze({basis,key,snapshot,summaryDraft,reviewAction,artifact,openArtifact,prepare,begin,resume,canResume:proposalId=>!!current()?.messages.at(-1)?.actions?.some(action=>action.proposalId===proposalId),partial,evidence,runtime,steps,citations,finish,command,clear,toolContext,searchSubtitleContext,subtitleById,actionResult,replaceProposal,busy:stateGlobalBusy,activeId:(sourceKey=key())=>cache.get(sourceKey)?.active||''});
 document.addEventListener('media-context-changed',()=>{if(workspaceState())restoreLog();});
 window.addEventListener('pagehide',()=>{const pending=new Set(flushTimers.keys());for(const thread of pending)cancelFlush(thread);for(const state of cache.values())for(const thread of state.threads)if(pending.has(thread)||thread.messages.some(row=>row.status==='streaming'))void persist(thread);});
})();
