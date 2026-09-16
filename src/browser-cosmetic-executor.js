'use strict';
const {browserScriptExecutionReady}=require('./browser-script-execution');
// One loading listener per WebContents, instead of one Electron waiter per script.
function createCosmeticExecutor(onError=()=>{}){
  const queues=new WeakMap();
  const report=(error,wc,url)=>{try{onError(error,{webContents:wc,url});}catch(_){}};
  return function schedule(wc,method,args,allowed=()=>true){
    if(!wc||wc.isDestroyed())return Promise.resolve();
    let queue=queues.get(wc);
    if(!queue){
      queue={items:new Map(),listening:false};queues.set(wc,queue);
      queue.flush=()=>{
        if(!browserScriptExecutionReady(wc))return;
        wc.removeListener('did-stop-loading',queue.flush);queue.listening=false;
        const items=[...queue.items.values()];queue.items.clear();
        for(const item of items)if(wc.getURL()===item.url&&item.allowed()){
          Promise.resolve().then(()=>{
            if(wc.isDestroyed()||wc.getURL()!==item.url||!item.allowed())return;
            return schedule(wc,item.method,item.args,item.allowed);
          }).catch((error)=>report(error,wc,item.url));
        }
      };
      wc.once('destroyed',()=>{queue.items.clear();wc.removeListener('did-stop-loading',queue.flush);});
    }
    const item={method,args,url:wc.getURL(),allowed};
    if(browserScriptExecutionReady(wc))return Promise.resolve().then(()=>{
      if(wc.isDestroyed()||wc.getURL()!==item.url||!allowed())return;
      if(!browserScriptExecutionReady(wc))return schedule(wc,method,args,allowed);
      return wc[method](...args);
    }).catch((error)=>report(error,wc,item.url));
    if(queue.items.size<128)queue.items.set(method+':'+String(args[0]),item);
    if(!queue.listening){queue.listening=true;wc.on('did-stop-loading',queue.flush);}
    return Promise.resolve();
  };
}
module.exports={createCosmeticExecutor};
