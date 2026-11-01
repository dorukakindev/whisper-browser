'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const M=require('./userscript-model'),{createUserscriptStore}=require('./userscript-store');
const NETWORK_GRANTS=['GM_xmlhttpRequest','GM.xmlHttpRequest'];
const runtimeBlocked=row=>[...(row.metadata.blocked||[]),...(row.metadata.grants.some(g=>NETWORK_GRANTS.includes(g))?['GM network requests are not implemented in this engine.']:[])];
function registerUserscriptService({app,ipcMain,authorized,dialog,owner,getTabForContents,activeTab,fetchPublic=require('./feed-service').fetchPublic}){
 let database;const store=()=>database||=createUserscriptStore(path.join(app.getPath('userData'),'userscripts.json'));
 const caps=new Map(),previews=new Map(),sessions=new WeakSet(),bound=new WeakSet();
 const project=row=>({id:row.id,code:row.code,metadata:row.metadata,revision:row.revision,enabled:row.enabled,blocked:runtimeBlocked(row),errors:row.errors,history:row.history.map(h=>({revision:h.revision,updatedAt:h.updatedAt})),updatedAt:row.updatedAt});
 const send=(cap,payload)=>{try{if(!cap.wc.isDestroyed())cap.frame.send('userscripts:event',{token:cap.token,...payload});}catch(_){}};
 function dispose(cap){send(cap,{type:'dispose'});caps.delete(cap.token);}
 function invalidateTab(tab){for(const cap of [...caps.values()])if(cap.tabId===tab?.id)dispose(cap);}
 function ownedFrame(event){const wc=event?.sender,frame=event?.senderFrame,tab=wc&&getTabForContents(wc);if(!tab||tab.closing||!frame||wc.isDestroyed())return null;let frames;try{frames=wc.mainFrame.framesInSubtree||[];}catch(_){return null;}if(frame!==wc.mainFrame&&!frames.includes(frame))return null;return {wc,frame,tab,url:String(frame.url||'')};}
 function descriptor(event,row){const scope=ownedFrame(event);if(!scope||scope.frame!==scope.wc.mainFrame||!row.enabled||runtimeBlocked(row).length||store().isPaused(scope.url)||!M.matches(row.metadata,scope.url,{isFrame:scope.frame!==scope.wc.mainFrame}))return null;if(caps.size>=1024||[...caps.values()].filter(cap=>cap.wc===scope.wc).length>=256)throw Error('Userscript runtime context limit reached; reload fewer frames.');
  for(const cap of [...caps.values()])if(cap.wc===scope.wc&&cap.frame===scope.frame&&cap.id===row.id)dispose(cap);
  const cap={token:randomUUID(),id:row.id,revision:row.revision,wc:scope.wc,frame:scope.frame,tabId:scope.tab.id,generation:scope.tab.generation,url:scope.url,menus:new Map(),calls:0,minute:Date.now()};caps.set(cap.token,cap);
  return {token:cap.token,id:row.id,revision:row.revision,code:row.code,metadata:row.metadata,values:store().getValues(row.id)};
 }
 function current(event,token){const cap=caps.get(token),scope=ownedFrame(event);if(!cap||!scope||scope.wc!==cap.wc||scope.frame!==cap.frame||scope.tab.id!==cap.tabId||scope.tab.generation!==cap.generation||scope.url!==cap.url)throw Error('Userscript document capability expired.');const row=store().get(cap.id);if(!row.enabled||row.revision!==cap.revision||runtimeBlocked(row).length||store().isPaused(scope.url)||!M.matches(row.metadata,scope.url,{isFrame:scope.frame!==scope.wc.mainFrame})){dispose(cap);throw Error('Userscript scope or revision changed.');}if(Date.now()-cap.minute>60000){cap.minute=Date.now();cap.calls=0;}if(++cap.calls>600)throw Error('Userscript operation budget exceeded.');return {cap,row};}
 const granted=(row,name)=>row.metadata.grants.includes('GM_'+name)||row.metadata.grants.includes('GM.'+name);
 function operation(event,input={}){
  if(input.op==='release'){const cap=caps.get(input.token);if(cap&&cap.wc===event.sender&&cap.frame===event.senderFrame)dispose(cap);return {ok:true};}
  const {cap,row}=current(event,input.token),data=input.data||{};
  if(input.op==='error'){store().writeError(cap.id,String(data.message||'Script error'));return {ok:true};}
  const permissions={getValues:'getValue',setValue:'setValue',deleteValue:'deleteValue',listValues:'listValues',menu:'registerMenuCommand',unmenu:'unregisterMenuCommand'};
  if(!permissions[input.op]||!granted(row,permissions[input.op]))throw Error('Userscript grant is not permitted: '+input.op);
  if(input.op==='getValues')return {ok:true,values:store().getValues(cap.id)};
  if(input.op==='listValues')return {ok:true,keys:Object.keys(store().getValues(cap.id))};
  if(input.op==='setValue'||input.op==='deleteValue'){
   const before=store().getValues(cap.id),key=data.key;if(typeof key!=='string'||key.length>1000)throw Error('Invalid script value key.');
   if(input.op==='setValue')store().setValue(cap.id,key,data.value);else store().deleteValue(cap.id,key);
   const after=store().getValues(cap.id);for(const target of caps.values())if(target.id===cap.id&&target.revision===cap.revision)send(target,{type:'value',key,oldValue:before[key],value:after[key],deleted:!Object.hasOwn(after,key),remote:target.token!==cap.token});return {ok:true};
  }
  if(input.op==='menu'){if(cap.menus.size>=32)throw Error('Userscript menu limit reached.');const label=String(data.label||'').trim().slice(0,160);if(!label)throw Error('Menu label required.');const id=randomUUID();cap.menus.set(id,label);return {ok:true,id};}
  if(input.op==='unmenu'){cap.menus.delete(String(data.id||''));return {ok:true};}
  throw Error('Unsupported userscript operation.');
 }
 ipcMain.on('userscripts:bootstrap',(event,input={})=>{try{const scope=ownedFrame(event);if(!scope||scope.url!==input.url||scope.frame!==scope.wc.mainFrame){event.returnValue={ok:false,scripts:[],error:'Only main browser frames are supported with the current sandbox settings.'};return;}for(const cap of [...caps.values()])if(cap.wc===scope.wc&&cap.frame===scope.frame)dispose(cap);event.returnValue={ok:true,scripts:store().matching(scope.url,{isFrame:scope.frame!==scope.wc.mainFrame}).filter(row=>!runtimeBlocked(row).length).map(row=>descriptor(event,row)).filter(Boolean)};}catch(error){event.returnValue={ok:false,scripts:[],error:error.message};}});
 ipcMain.on('userscripts:op',(event,input)=>{try{event.returnValue=operation(event,input);}catch(error){event.returnValue={ok:false,error:error.message};}});
 function remember(event,preview){for(const [id,p]of previews)if(Date.now()-p.at>600000)previews.delete(id);if(previews.size>=8)previews.delete(previews.keys().next().value);const token=randomUUID();previews.set(token,{...preview,owner:event.sender.id,at:Date.now()});return token;}
 ipcMain.handle('userscripts:request',async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized userscript manager request.'};
  try{const action=input.action||'list';
   if(action==='list')return {ok:true,scripts:store().list().map(project),pausedOrigins:store().pausedOrigins(),support:{network:false,require:false,resources:false,unsafeWindow:false,iframeExecution:false,mainFramesOnly:true,managedCleanup:true,arbitraryDomUndo:false}};
   if(action==='revision'){const row=store().get(input.id),previous=row.history.find(h=>h.revision===input.revision);if(!previous)throw Error('Previous script revision is unavailable.');return {ok:true,code:previous.code,revision:previous.revision,updatedAt:previous.updatedAt};}
   if(action==='preview'){
    let code=input.code,source='pasted';if(input.pickfile){const result=await dialog.showOpenDialog(owner(),{title:'Preview userscript / Kullanıcı betiğini önizle',properties:['openFile'],filters:[{name:'Userscript (*.user.js)',extensions:['js']}]});if(result.canceled||!result.filePaths?.[0])return {ok:false,canceled:true};const file=result.filePaths[0],stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>M.MAX_SCRIPT_BYTES||!file.toLowerCase().endsWith('.user.js'))throw Error('Choose a physical .user.js file up to512KiB.');code=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(file));source='file';}
    else if(input.url){const url=new URL(input.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('Use an explicit public HTTPS userscript URL.');const response=await fetchPublic(url.href);if(response.status!==200)throw Error('Userscript download failed.');if(new URL(response.effectiveUrl||url.href).protocol!=='https:'||!Buffer.isBuffer(response.buffer)||response.buffer.length>M.MAX_SCRIPT_BYTES)throw Error('Userscript response exceeds512KiB or changed protocol.');code=new TextDecoder('utf-8',{fatal:true}).decode(response.buffer);source='https';}
    const preview=store().preview(code,{id:input.id}),blocked=runtimeBlocked({metadata:preview.script.metadata});const token=remember(event,{preview,code});return {ok:true,...preview,blocked,source,token};
   }
   if(action==='install'){const prepared=previews.get(input.token);if(!prepared||prepared.owner!==event.sender.id||Date.now()-prepared.at>600000||input.confirm!==true)throw Error('Review and confirm this owner-bound preview first.');const p=prepared.preview,blocked=runtimeBlocked({metadata:p.script.metadata});const row=store().install(prepared.code,{id:p.existingId||undefined,confirm:true,expectedRevision:p.baseRevision,expectedHash:p.script.revision,enabled:blocked.length?false:input.enabled});previews.delete(input.token);invalidateScript(row.id);return {ok:true,script:project(row),reloadRequired:true};}
   if(action==='enabled'){const row=store().get(input.id);if(input.enabled&&runtimeBlocked(row).length)throw Error('Unsupported userscript APIs prevent enabling.');const saved=store().setEnabled(input.id,input.enabled);invalidateScript(input.id);return {ok:true,script:project(saved),reloadRequired:true};}
   if(action==='pause'){const result=store().setPaused(input.origin,input.paused);for(const cap of [...caps.values()])if(new URL(cap.url).origin===result.origin)dispose(cap);return {ok:true,...result,reloadRequired:true};}
   if(action==='rollback'){if(input.confirm!==true)throw Error('Confirm rollback first.');const row=store().get(input.id),saved=store().rollback(input.id,{confirm:true,revision:input.revision,expectedRevision:input.expectedRevision||row.revision});invalidateScript(input.id);return {ok:true,script:project(saved),reloadRequired:true};}
   if(action==='remove'){if(input.confirm!==true)throw Error('Confirm script removal first.');store().remove(input.id);invalidateScript(input.id);return {ok:true,reloadRequired:true};}
   const tab=activeTab();if(!tab||input.tabId&&input.tabId!==tab.id||!tab.view||tab.view.webContents.isDestroyed())throw Error('Choose the active browser tab.');const wc=tab.view.webContents;
   if(action==='run'){const row=store().get(input.id),payload=descriptor({sender:wc,senderFrame:wc.mainFrame},row);if(!payload)throw Error('Script is disabled, unsupported or outside its site scope.');wc.mainFrame.send('userscripts:run',{...payload,forced:true});return {ok:true};}
   if(action==='menus'){const menus=[];for(const cap of [...caps.values()])if(cap.wc===wc){try{current({sender:wc,senderFrame:cap.frame},cap.token);}catch(_){dispose(cap);continue;}for(const [id,label]of cap.menus)menus.push({id,label,scriptId:cap.id,tabId:cap.tabId});}return {ok:true,menus};}
   if(action==='command'){const cap=[...caps.values()].find(c=>c.wc===wc&&c.menus.has(input.id||input.menuId));if(!cap)throw Error('Userscript command expired.');current({sender:wc,senderFrame:cap.frame},cap.token);send(cap,{type:'command',id:input.id||input.menuId});return {ok:true};}
   throw Error('Unknown userscript manager action.');
  }catch(error){return {ok:false,error:String(error.message||error).slice(0,1000)};}
 });
 function invalidateScript(id){for(const cap of [...caps.values()])if(cap.id===id)dispose(cap);}
 function bindSession(session){if(sessions.has(session))return;session.registerPreloadScript({type:'frame',filePath:path.join(__dirname,'userscript-preload.js')});sessions.add(session);}
 function bindTab(tab,wc){if(bound.has(wc))return;bound.add(wc);wc.on('did-start-navigation',(event,_url,inPlace,main)=>{if((event?.isMainFrame??main)&&!(event?.isSameDocument??inPlace))invalidateTab(tab);});wc.on('did-navigate-in-page',()=>queueMicrotask(()=>{for(const cap of [...caps.values()])if(cap.wc===wc){let url;try{url=String(cap.frame.url||'');const row=store().get(cap.id);if(tab.closing||!row.enabled||row.revision!==cap.revision||store().isPaused(url)||!M.matches(row.metadata,url,{isFrame:cap.frame!==wc.mainFrame})){dispose(cap);continue;}cap.url=url;cap.generation=tab.generation;send(cap,{type:'location',url});}catch(_){dispose(cap);}}}));wc.once('destroyed',()=>{for(const cap of [...caps.values()])if(cap.wc===wc)dispose(cap);});}
 return {bindSession,bindTab,invalidateTab,disposeTab:invalidateTab,store,operation,contextCount:()=>caps.size};
}
module.exports={registerUserscriptService,runtimeBlocked};
