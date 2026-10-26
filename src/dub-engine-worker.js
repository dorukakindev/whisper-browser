 'use strict';
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const path=require('node:path');
// One private stdin worker owned by this Electron process. No listening port.
function createDubEngineWorker({spawn,terminate,idleMs=60000}){
 let host=null,active=null,timer=null,key='',closing=null,pending='',serial=0,starting=false;
 const failedExit=code=>code===0?1:(code??1); // DONE olmadan gelen close(0) başarı sayılmaz
 const finish=(run,code,signal=null)=>{
  if(active!==run)return;active=null;clearTimeout(run.drainTimer);run.exitCode=code;run.signalCode=signal;
  run.stdout.end();run.stderr.end();run.emit('close',code,signal);
  if(host&&!active&&host.exitCode==null&&!closing){const idleHost=host;timer=setTimeout(()=>{if(host===idleHost&&!active)void release().catch(()=>{});},idleMs);timer.unref?.();}
 };
 async function release(){
  clearTimeout(timer);if(closing)return closing;if(!host)return true;
  const proc=host;closing=Promise.resolve().then(async()=>{
   const ok=await terminate(proc);if(ok===false)throw Error('Warm voice engine could not stop.');
   if(host===proc){host=null;key='';const run=active;if(run)finish(run,failedExit(proc.exitCode),proc.signalCode??null);}return true;
  }).finally(()=>{closing=null;});return closing;
 }
 async function start(python,args,options,control={}){
  clearTimeout(timer);if(active||starting)throw Error('Voice worker is busy.');
  starting=true;
  try {
  if(closing)await closing;
  const next=JSON.stringify([python,args[0],options.cwd,...['VOXCPM_ROOT','CUDA_VISIBLE_DEVICES','CUDA_DEVICE_ORDER','PYTHONPATH','PYTHONHOME'].map(name=>options.env?.[name]??'')]);
  if(host&&key!==next)await release();
  // Bekleme sırasında gelen iptal: yeni host açılmaz, argv gönderilmez.
  if(control.isCancelled?.())throw Object.assign(Error('Voice worker start was cancelled.'),{code:'DUB_START_CANCELLED'});
  if(!host){
   key=next;pending='';let errPending='',framed=false,errOwner=null;const proc=spawn(python,[path.join(path.dirname(args[0]),'dub_worker.py')],{...options,stdio:['pipe','pipe','pipe']});host=proc;
   proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');
   proc.stdout.on('data',chunk=>{
    if(host!==proc)return;pending+=chunk;if(pending.length>1048576){pending='';active?.stderr.write('Voice worker output exceeded its bound.\n');void release().catch(()=>{});return;}
    let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index).replace(/\r$/,'');pending=pending.slice(index+1);
     if(line.startsWith('DUB_WORKER_DONE ')){try{const done=JSON.parse(line.slice(16));if(active&&done.id===active.workerId&&Number.isInteger(done.code)){const run=active;
       if(typeof done.stderr==='string'&&done.stderr.length<=65536){
         framed=true;
         if(done.stderr&&!(run.stderrTail||'').endsWith(done.stderr))run.stderr.write(done.stderr);
         finish(run,done.code);
       }else if(!framed||run.stderrEnded)finish(run,done.code);
       else{run.doneCode=done.code;run.drainTimer=setTimeout(()=>{if(active===run)finish(run,run.doneCode);},500);run.drainTimer.unref?.();}}}catch{} }
     else active?.stdout.write(line+'\n');
    }
   });
   // Python tarafı her işin stderr'ini DUB_WORKER_STDERR_BEGIN/END <id> ile çerçeveler (eski worker çerçevesizdir ve eski davranışı korur).
   const route=text=>{const run=active;if(!run||framed&&errOwner!==run.workerId)return;run.stderrTail=((run.stderrTail||'')+text).slice(-32768);run.stderr.write(text);};
   proc.stderr.on('data',chunk=>{
    if(host!==proc)return;errPending+=chunk;let out='',index;
    while((index=errPending.indexOf('\n'))>=0){
     const line=errPending.slice(0,index+1);errPending=errPending.slice(index+1);
     const mark=/^DUB_WORKER_STDERR_(BEGIN|END) (\S+)\r?\n$/.exec(line);
     if(!mark){out+=line;continue;}
     if(out){route(out);out='';}
     if(mark[1]==='BEGIN'){framed=true;errOwner=mark[2];}
     else if(active&&active.workerId===mark[2]){active.stderrEnded=true;if(active.doneCode!=null)finish(active,active.doneCode);}
    }
    if(errPending.length>65536){route(errPending.slice(-65536));errPending='';}
    if(errPending&&!('DUB_WORKER_STDERR_'.startsWith(errPending)||errPending.startsWith('DUB_WORKER_STDERR_'))){out+=errPending;errPending='';}
    if(out)route(out);
   });
   proc.on('error',error=>{
    if(host!==proc)return;
    // pid varsa süreç oluştu: 'error' kill/send başarısızlığıdır ve süreç canlı olabilir. close görülene kadar sahiplik bırakılmaz.
    if(Number.isInteger(proc.pid)&&proc.pid>0){active?.stderr.write(error.message+'\n');return;}
    const run=active;host=null;key='';
    // spawn ENOENT can arrive on nextTick before callers can subscribe after await start().
    setImmediate(()=>{if(!run||active!==run)return;run.stderr.write(error.message+'\n');if(run.listenerCount('error'))run.emit('error',error);finish(run,1);});
   });
   proc.once('close',(code,signal)=>{if(host!==proc)return;host=null;key='';const run=active;if(run)setImmediate(()=>{if(active===run&&code===0)run.stderr.write('Voice worker exited before reporting completion.\n');finish(run,failedExit(code),signal);});});
   proc.stdin.on('error',error=>{if(host===proc&&active){active.stderr.write(error.message+'\n');void release().catch(()=>{});}});
  }
  const run=new EventEmitter();run.stdout=new PassThrough();run.stderr=new PassThrough();run.pid=host.pid;run.exitCode=null;run.signalCode=null;run.workerId=String(++serial);const ownedHost=host;run.kill=signal=>active===run&&host===ownedHost?ownedHost.kill(signal):false;active=run;
  // Callers attach their listeners immediately after awaiting start.
  setImmediate(()=>{
   if(active!==run||host!==ownedHost||control.isCancelled?.())return;
   try{ownedHost.stdin.write(JSON.stringify({id:run.workerId,args:args.slice(1)})+'\n');}
   catch(error){run.stderr.write(error.message+'\n');if(run.listenerCount('error'))run.emit('error',error);void release().catch(()=>{});}
  });
  return run;
  } finally {starting=false;}
 }
 return {start,release,running:()=>!!host};
}
module.exports={createDubEngineWorker};
