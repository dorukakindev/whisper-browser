'use strict';
// Independent sandbox preload: no local require and no third-party code in world999.
const {contextBridge,ipcRenderer,webFrame}=require('electron');
const executions=new Map();let nextWorld=2000;
function runtimeBootstrap(seed){
 'use strict';
 const bridge=globalThis.__whisperUserscriptBridge,grants=new Set(seed.metadata.grants),values=seed.values||{},styles=new Set(),listeners=new Map(),menus=new Map();let alive=true,sequence=0;
 const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
 const call=(op,data={})=>{if(!alive)throw Error('Userscript document was disposed.');return bridge.call(op,data);};
 const api={
  getValue:(key,fallback)=>Object.hasOwn(values,key)?copy(values[key]):fallback,
  setValue:(key,value)=>{call('setValue',{key,value});Object.defineProperty(values,key,{value:copy(value),enumerable:true,configurable:true,writable:true});},
  deleteValue:key=>{call('deleteValue',{key});delete values[key];},
  listValues:()=>call('listValues').keys,
  addStyle:css=>{if(typeof css!=='string'||css.length>200000)throw Error('Invalid or oversized style.');const style=document.createElement('style');style.textContent=css;styles.add(style);const attach=()=>{if(alive)(document.head||document.documentElement)?.appendChild(style);};if(document.documentElement)attach();else document.addEventListener('DOMContentLoaded',attach,{once:true});return style;},
  addValueChangeListener:(key,callback)=>{if(typeof key!=='string'||typeof callback!=='function')throw Error('Invalid value listener.');if(listeners.size>=100)throw Error('Value listener limit reached.');const id=++sequence;listeners.set(id,{key,callback});return id;},
  removeValueChangeListener:id=>listeners.delete(id),
  registerMenuCommand:(label,callback)=>{if(typeof callback!=='function')throw Error('Menu callback required.');const result=call('menu',{label});menus.set(result.id,callback);return result.id;},
  unregisterMenuCommand:id=>{call('unmenu',{id});menus.delete(id);},
 };
 const GM={};for(const [name,fn]of Object.entries(api)){if(grants.has('GM_'+name))Object.defineProperty(globalThis,'GM_'+name,{value:fn,configurable:true});if(grants.has('GM.'+name))GM[name]=(...args)=>Promise.resolve().then(()=>fn(...args));}
 const info=Object.freeze({script:Object.freeze({name:seed.metadata.name,namespace:seed.metadata.namespace,version:seed.metadata.version,description:seed.metadata.description,grant:[...seed.metadata.grants],matches:[...seed.metadata.matches]}),scriptHandler:'Whisper local userscripts',version:'1',supported:{network:false,require:false,resources:false,unsafeWindow:false}});
 if(grants.has('GM_info'))Object.defineProperty(globalThis,'GM_info',{value:info,configurable:true});if(grants.has('GM.info'))GM.info=info;if(Object.keys(GM).length)Object.defineProperty(globalThis,'GM',{value:Object.freeze(GM),configurable:true});
 const dispose=()=>{if(!alive)return;alive=false;for(const style of styles)style.remove();styles.clear();listeners.clear();menus.clear();bridge.unsubscribe();};
 bridge.subscribe(event=>{
  if(event.type==='dispose'){dispose();return;}if(!alive)return;
  if(event.type==='value'){if(event.deleted)delete values[event.key];else Object.defineProperty(values,event.key,{value:copy(event.value),enumerable:true,configurable:true,writable:true});for(const listener of listeners.values())if(listener.key===event.key)try{listener.callback(event.key,copy(event.oldValue),copy(event.value),event.remote===true);}catch(error){try{call('error',{message:error.message});}catch(_){}}}
  else if(event.type==='command'){try{menus.get(event.id)?.();}catch(error){try{call('error',{message:error.message});}catch(_){}}}
  else if(event.type==='location')window.dispatchEvent(new CustomEvent('whisper:userscript-location',{detail:{url:event.url}}));
 });
}
function report(entry,error){try{ipcRenderer.sendSync('userscripts:op',{token:entry.row.token,op:'error',data:{message:String(error?.message||error).slice(0,1000)}});}catch(_){}}
function dispose(entry){if(!entry||!executions.has(entry.row.token))return;executions.delete(entry.row.token);entry.cancel?.();try{entry.callback?.({type:'dispose'});}catch(_){}entry.callback=null;try{ipcRenderer.sendSync('userscripts:op',{token:entry.row.token,op:'release'});}catch(_){}}
function launch(row){
 if(!row||typeof row.code!=='string'||typeof row.token!=='string')return;
 for(const entry of [...executions.values()])if(entry.row.id===row.id)dispose(entry);
 const entry={row,callback:null,cancel:null};executions.set(row.token,entry);
 const run=()=>{if(!executions.has(row.token))return;try{
  let source;
  if(row.metadata.world==='page')source=`(function(){\n${row.code}\n})();`;
  else{
   if(nextWorld>=2512)throw Error('Userscript world capacity reached; reload the page.');
   const world=nextWorld++;
   contextBridge.exposeInIsolatedWorld(world,'__whisperUserscriptBridge',{
    call:(op,data)=>{const result=ipcRenderer.sendSync('userscripts:op',{token:row.token,op,data});if(!result?.ok)throw Error(result?.error||'Userscript operation failed.');return result;},
    subscribe:callback=>{if(typeof callback!=='function')throw Error('Callback required.');entry.callback=callback;},
    unsubscribe:()=>{entry.callback=null;},
   });
   source=`(function(){(${runtimeBootstrap.toString()})(JSON.parse(${JSON.stringify(JSON.stringify({metadata:row.metadata,values:row.values}))}));\n${row.code}\n})();`;
   entry.world=world;
  }
  const world=row.metadata.world==='page'?0:entry.world;
  const task=webFrame.executeJavaScriptInIsolatedWorld(world,[{code:source+'\n//# sourceURL=whisper-userscript-'+row.id+'.user.js'}]);Promise.resolve(task).catch(error=>report(entry,error));
 }catch(error){report(entry,error);dispose(entry);}};
 if(row.forced||row.metadata.runAt==='document-start'){run();return;}
 let timer=null;
 const ready=()=>{if(row.metadata.runAt==='document-idle')timer=setTimeout(run,0);else run();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
 entry.cancel=()=>{document.removeEventListener('DOMContentLoaded',ready);if(timer!==null)clearTimeout(timer);};
}
ipcRenderer.on('userscripts:event',(_event,message)=>{const entry=executions.get(message?.token);if(!entry)return;if(message.type==='dispose'){dispose(entry);return;}if(message.type==='value'&&!entry.callback){if(message.deleted)delete entry.row.values[message.key];else Object.defineProperty(entry.row.values,message.key,{value:message.value,enumerable:true,configurable:true,writable:true});}else try{entry.callback?.(message);}catch(error){report(entry,error);}});
ipcRenderer.on('userscripts:run',(_event,row)=>launch(row));
window.addEventListener('pagehide',()=>{for(const entry of [...executions.values()])dispose(entry);},{once:true});
try{const boot=ipcRenderer.sendSync('userscripts:bootstrap',{url:location.href});if(boot?.ok)for(const row of boot.scripts||[])launch(row);}catch(_){/* Non-browser and opaque frames receive no script capability. */}
