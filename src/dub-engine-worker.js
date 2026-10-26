 'use strict';
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const path=require('node:path');
// One private stdin worker owned by this Electron process. No listening port.
function createDubEngineWorker({spawn,terminate,idleMs=60000}){
 let host=null,active=null,timer=null,key='',closing=null,pending='',serial=0,starting=false;
 const finish=(run,code,signal=null)=>{
  if(active!==run)return;active=null;run.exitCode=code;run.signalCode=signal;
  run.stdout.end();run.stderr.end();run.emit('close',code,signal);
  if(host&&!active&&host.exitCode==null&&!closing){const idleHost=host;timer=setTimeout(()=>{if(host===idleHost&&!active)void release().catch(()=>{});},idleMs);timer.unref?.();}
 };
 async function release(){
  clearTimeout(timer);if(closing)return closing;if(!host)return true;
  const proc=host;closing=Promise.resolve().then(async()=>{
   const ok=await terminate(proc);if(ok===false)throw Error('Warm voice engine could not stop.');
   if(host===proc){host=null;key='';const run=active;if(run)finish(run,proc.exitCode??1,proc.signalCode??null);}return true;
  }).finally(()=>{closing=null;});return closing;
 }
 async function start(python,args,options){
  clearTimeout(timer);if(active||starting)throw Error('Voice worker is busy.');
  starting=true;
  try {
  if(closing)await closing;
  const next=JSON.stringify([python,args[0],options.cwd,...['VOXCPM_ROOT','CUDA_VISIBLE_DEVICES','CUDA_DEVICE_ORDER','PYTHONPATH','PYTHONHOME'].map(name=>options.env?.[name]??'')]);
  if(host&&key!==next)await release();
  if(!host){
   key=next;pending='';const proc=spawn(python,[path.join(path.dirname(args[0]),'dub_worker.py')],{...options,stdio:['pipe','pipe','pipe']});host=proc;
   proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');
   proc.stdout.on('data',chunk=>{
    if(host!==proc)return;pending+=chunk;if(pending.length>1048576){pending='';active?.stderr.write('Voice worker output exceeded its bound.\n');void release().catch(()=>{});return;}
    let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index).replace(/\r$/,'');pending=pending.slice(index+1);
     if(line.startsWith('DUB_WORKER_DONE ')){try{const done=JSON.parse(line.slice(16));if(active&&done.id===active.workerId&&Number.isInteger(done.code)){const run=active;finish(run,done.code);}}catch{} }
     else active?.stdout.write(line+'\n');
    }
   });
   proc.stderr.on('data',chunk=>{if(host===proc)active?.stderr.write(chunk);});
   proc.once('error',error=>{
    if(host!==proc)return;
    const run=active;host=null;key='';
    // spawn ENOENT can arrive on nextTick before callers can subscribe after await start().
    setImmediate(()=>{if(!run||active!==run)return;run.stderr.write(error.message+'\n');if(run.listenerCount('error'))run.emit('error',error);finish(run,1);});
   });
   proc.once('close',(code,signal)=>{if(host!==proc)return;host=null;key='';const run=active;if(run)setImmediate(()=>finish(run,code??1,signal));});
   proc.stdin.on('error',error=>{if(host===proc&&active){active.stderr.write(error.message+'\n');void release().catch(()=>{});}});
  }
  const run=new EventEmitter();run.stdout=new PassThrough();run.stderr=new PassThrough();run.pid=host.pid;run.exitCode=null;run.signalCode=null;run.workerId=String(++serial);const ownedHost=host;run.kill=signal=>active===run&&host===ownedHost?ownedHost.kill(signal):false;active=run;
  // Callers attach their listeners immediately after awaiting start.
  setImmediate(()=>{
   if(active!==run||host!==ownedHost)return;
   try{ownedHost.stdin.write(JSON.stringify({id:run.workerId,args:args.slice(1)})+'\n');}
   catch(error){run.stderr.write(error.message+'\n');if(run.listenerCount('error'))run.emit('error',error);void release().catch(()=>{});}
  });
  return run;
  } finally {starting=false;}
 }
 return {start,release,running:()=>!!host};
}
module.exports={createDubEngineWorker};
