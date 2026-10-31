'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomicWriteFileSync}=require('./fsync-utils');
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const text=(v,n)=>typeof v==='string'?v.replace(/\0/g,'').slice(0,n):'';
// Adapted from assistant-ui withParentsFirst, MIT, AgentbaseAI Inc. (2026).
// Upstream 1fbf00dd0388fee912af95401876a6cc3c232b2c; see third_party/assistant-ui/LICENSE.
function parentsFirst(messages){
  const listed=new Set(messages.map(row=>row.id)),added=new Set(),waiting=new Map(),ordered=[];
  for(const row of messages){
    if(row.parentId!==null&&listed.has(row.parentId)&&!added.has(row.parentId)){
      const children=waiting.get(row.parentId)||[];children.push(row);waiting.set(row.parentId,children);continue;
    }
    for(let i=ordered.push(row)-1;i<ordered.length;i++){
      const current=ordered[i];if(added.has(current.id))continue;added.add(current.id);
      const children=waiting.get(current.id);if(children){waiting.delete(current.id);ordered.push(...children);}
    }
  }
  for(const children of waiting.values())ordered.push(...children);
  return ordered;
}
function evidenceOf(raw){
  if(!Array.isArray(raw))return [];
  const time=v=>typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v));
  return raw.slice(0,40).filter(row=>row&&time(row.start??row.baslangic)&&Number(row.start??row.baslangic)>=0
    &&((row.end??row.bitis)==null||time(row.end??row.bitis)&&Number(row.end??row.bitis)>=Number(row.start??row.baslangic))).map(row=>({
    id:text(row.id,40),start:Number(row.start??row.baslangic),end:Math.max(Number(row.start??row.baslangic),Number.isFinite(Number(row.end??row.bitis))?Number(row.end??row.bitis):0),
    text:text(row.text??row.metin,1200),translation:text(row.translation,1200)}));
}
function citationsOf(raw){return !Array.isArray(raw)?[]:raw.slice(0,40).filter(c=>c&&/^B[0-9]+-[0-9]+$/.test(c.id)&&typeof c.sourceId==='string'&&c.sourceId.length>0&&c.sourceId.length<=500&&!c.sourceId.includes('\0')&&Number.isInteger(c.page)&&c.page>0&&c.page<=100000).map(c=>({id:c.id,sourceId:c.sourceId,page:c.page,kind:c.kind==='page'?'page':'chapter',text:text(c.text,600)}));}
function actionsOf(raw){
  if(!Array.isArray(raw))return [];
  return raw.slice(0,8).flatMap(row=>{
    if(row?.kind==='app_action'){
      if(!id(row.proposalId)||require('./assistant-capabilities').get(row.tool)?.policy!=='proposal')return [];
      return [{kind:'app_action',proposalId:row.proposalId,tool:row.tool,label:text(row.label,120),summary:text(row.summary,1000),
        resultStatus:['accepted','completed','failed','stopped'].includes(row.resultStatus)?row.resultStatus:'',refreshable:row.resultStatus==='failed'&&row.refreshable===true,resultText:text(row.resultText,500)}];
    }
    if(!row||!['seek_to_time','preview_translation_change','open_voice_preparation'].includes(row.kind))return [];
    const result={kind:row.kind,source:evidenceOf(row.source?[row.source]:[])[0]||null,translation:text(row.translation,2000)};
    return result.kind==='open_voice_preparation'||result.source?[result]:[];
  });
}
function cleanThread(raw){
  if(Array.isArray(raw?.messages)&&raw.messages.length>200)throw Error('Message limit reached (200). Export this conversation and start a new one. / Mesaj sınırına ulaşıldı (200). Sohbeti dışa aktarıp yeni sohbet başlat.');
  if(!raw||!id(raw.id)||typeof raw.sourceKey!=='string'||!raw.sourceKey||raw.sourceKey.length>6000||!Array.isArray(raw.messages)||raw.messages.length>200)throw Error('Invalid assistant conversation.');
  const messages=parentsFirst(raw.messages.map(row=>{
    if(!row||!id(row.id)||row.parentId!==null&&!id(row.parentId)||!['user','assistant'].includes(row.role)||typeof row.text!=='string'||row.text.length>32000)throw Error('Invalid assistant message.');
    return {id:row.id,parentId:row.parentId,role:row.role,text:row.text,status:['complete','streaming','stopped','failed'].includes(row.status)?row.status:'complete',evidence:evidenceOf(row.evidence),actions:actionsOf(row.actions),steps:require('./assistant-run-steps').clean(row.steps),citations:citationsOf(row.citations)};
  }));
  const seen=new Set();for(const row of messages){if(seen.has(row.id)||row.parentId!==null&&!seen.has(row.parentId))throw Error('Conversation contains a cycle, duplicate or missing parent.');seen.add(row.id);}
  if(raw.headId!==null&&!seen.has(raw.headId))throw Error('Conversation head is missing.');
  return {id:raw.id,sourceKey:raw.sourceKey,title:text(raw.title,200)||'Conversation',parentThreadId:id(raw.parentThreadId)?raw.parentThreadId:null,
    headId:raw.headId,messages,createdAt:Number.isFinite(raw.createdAt)&&raw.createdAt>0?raw.createdAt:Date.now(),updatedAt:Number.isFinite(raw.updatedAt)&&raw.updatedAt>0?raw.updatedAt:Date.now(),revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0};
}
function validateEnvelope(raw){if(!raw||raw.version!==1||!Array.isArray(raw.threads)||raw.threads.length>200)throw Error('Invalid assistant archive.');const seen=new Set();return {version:1,threads:raw.threads.map(row=>{const cleaned=cleanThread(row);if(seen.has(cleaned.id))throw Error('Duplicate conversation ID.');seen.add(cleaned.id);return cleaned;})};}
function registerAssistantThreads({app,ipcMain,authorized}){
  const file=()=>path.join(app.getPath('userData'),'assistant-conversations.json');
  function read(){if(!fs.existsSync(file()))return {version:1,threads:[]};if(fs.statSync(file()).size>32000000)throw Error('Conversation archive exceeds 32 MB. Original file was preserved.');return validateEnvelope(JSON.parse(fs.readFileSync(file(),'utf8')));}
  function save(data){const json=JSON.stringify(data);if(Buffer.byteLength(json)>32000000)throw Error('Conversation archive exceeds 32 MB. Export or remove unused conversations.');atomicWriteFileSync(file(),json);}
  const handle=async(event,input={})=>{
    if(!authorized(event))return {ok:false,error:'Unauthorized conversation request.'};
    try{
      if(!input||typeof input!=='object'||typeof input.sourceKey!=='string'||!input.sourceKey||input.sourceKey.length>6000)throw Error('Conversation source is missing.');
      const data=read();
      if(input.action==='list')return {ok:true,threads:data.threads.filter(row=>row.sourceKey===input.sourceKey).sort((a,b)=>b.updatedAt-a.updatedAt).map(row=>({...row,messages:row.messages.map(m=>m.status==='streaming'?{...m,status:'stopped'}:m)}))};
      if(input.action==='save'){
        const thread=cleanThread(input.thread);if(thread.sourceKey!==input.sourceKey)throw Error('Conversation source changed.');
        const index=data.threads.findIndex(row=>row.id===thread.id),old=data.threads[index];
        if(old&&(old.sourceKey!==input.sourceKey||old.revision!==thread.revision))throw Error('Conversation changed elsewhere. Reopen it before saving.');
        if(index<0&&data.threads.length>=200)throw Error('Conversation limit reached (200). Export/remove an old conversation.');
        if(index<0&&data.threads.filter(row=>row.sourceKey===input.sourceKey).length>=20)throw Error('Conversation limit reached for this source (20).');
        thread.updatedAt=Date.now();thread.revision=(old?.revision||0)+1;if(index>=0)data.threads[index]=thread;else data.threads.push(thread);save(data);return {ok:true,thread};
      }
      if(input.action==='delete'){const index=data.threads.findIndex(row=>row.id===input.id&&row.sourceKey===input.sourceKey);if(index<0)throw Error('Conversation not found.');data.threads.splice(index,1);save(data);return {ok:true};}
      throw Error('Unsupported conversation operation.');
    }catch(error){return {ok:false,error:error.message};}
  };
  ipcMain.handle('assistant-threads:request',handle);return {handle};
}
module.exports={registerAssistantThreads,cleanThread,validateEnvelope,evidenceOf,actionsOf,parentsFirst};
