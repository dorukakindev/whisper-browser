'use strict';

// Credentials stay in the main process. The renderer carries only a scoped ID.
function createPdfTranslationOperations({now=()=>Date.now(),maxOperations=64,maxPerSender=8,ttlMs=15*60*1000}={}) {
  const operations=new Map(),senders=new Map();
  const key=(sender,hash,id)=>JSON.stringify([sender.id,hash,id]);
  function detachUnused(){for(const [id,row] of senders)if(![...operations.values()].some(op=>op.senderId===id)){row.sender.removeListener('destroyed',row.closed);senders.delete(id);}}
  function prune(){for(const [id,op] of operations)if(now()-op.at>ttlMs)operations.delete(id);detachUnused();}
  function release(sender,hash,operationId){for(const [id,op] of operations)if(op.senderId===sender?.id&&op.hash===hash&&(!operationId||op.id===operationId))operations.delete(id);detachUnused();}
  function clear(){operations.clear();detachUnused();}
  function resolve(sender,document,request,getConfig){
    prune();
    if(request.operationId===undefined)return getConfig(); // Legacy one-batch callers.
    const id=request.operationId;
    if(!sender||!Number.isInteger(sender.id)||typeof id!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(id))throw Error('Invalid PDF translation operation.');
    const slot=key(sender,document.pdfHash,id);
    if(request.firstBatch===true){
      if(operations.has(slot))throw Error('PDF translation operation already started.');
      if(operations.size>=maxOperations||[...operations.values()].filter(op=>op.senderId===sender.id).length>=maxPerSender)throw Error('Too many PDF translation operations. Cancel an earlier operation first.');
      const config=JSON.parse(JSON.stringify(getConfig()));
      operations.set(slot,{id,hash:document.pdfHash,document,senderId:sender.id,config,at:now()});
      if(!senders.has(sender.id)){
        const closed=()=>{for(const [key,op] of operations)if(op.senderId===sender.id)operations.delete(key);detachUnused();};
        sender.once('destroyed',closed);senders.set(sender.id,{sender,closed});
      }
    }
    const operation=operations.get(slot);
    if(!operation||operation.document!==document){release(sender,document.pdfHash,id);throw Error('PDF translation operation expired or the document changed. Start again.');}
    operation.at=now();
    return JSON.parse(JSON.stringify(operation.config));
  }
  return {resolve,release,clear,size:()=>{prune();return operations.size;}};
}
module.exports={createPdfTranslationOperations};
