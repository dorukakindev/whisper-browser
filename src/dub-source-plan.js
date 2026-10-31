'use strict';
const path=require('node:path');
function buildSourcePlan({srt,grouping,range,python,appRoot,spawn,environment={},isCancelled=()=>false,onProcess=()=>{},terminate}) {
  return new Promise((resolve,reject)=>{
    if(isCancelled())return reject(Object.assign(Error('Source planning cancelled'),{code:'DUB_START_CANCELLED'}));
    let proc,settled=false,output='',outputBytes=0,stderr='',stopError=null,timer,grace;
    const active=()=>proc&&proc.exitCode==null&&proc.signalCode==null;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(grace);error?reject(error):resolve(value);};
    const stop=message=>{
      if(stopError||settled)return;
      stopError=Error(message);
      grace=setTimeout(()=>finish(Object.assign(stopError,{processActive:active()})),2000);
      // A broken termination helper must not leave this promise pending.
      Promise.resolve().then(()=>terminate(proc)).then(()=>{
        if(!active())finish(stopError);
      }).catch(()=>{});
    };
    try {
      proc=spawn(python,[path.join(appRoot,'tools','voxcpm2','dub_plan.py'),srt,
        ...(range?[String(range.start),String(range.end)]:[]),'--grouping',grouping],
      {cwd:path.dirname(python),env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
      onProcess(proc);
      timer=setTimeout(()=>stop('Source plan timed out'),15000);
      proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');
      proc.stdout.on('data',data=>{if(settled||stopError)return;outputBytes+=Buffer.byteLength(data,'utf8');if(outputBytes>4_000_000)return stop('Source plan exceeded output limit');output+=data;});
      proc.stderr.on('data',data=>{stderr=(stderr+data).slice(-2000);});
      proc.once('error',error=>finish(error));
      proc.once('close',code=>{
        if(isCancelled())return finish(Object.assign(Error('Source planning cancelled'),{code:'DUB_START_CANCELLED'}));
        if(stopError)return finish(stopError);
        if(code!==0)return finish(Error(stderr||'Source plan unavailable'));
        try {
          const value=JSON.parse(output),keys=new Set();
          if(!/^[a-f0-9]{64}$/.test(value?.sourceHash||'')||!Array.isArray(value.groups)||!value.groups.length||value.groups.length>5000
            ||value.groups.some(row=>{
              if(!row||typeof row.key!=='string'||row.key.length>2000||!/^\d+(?:,\d+)*$/.test(row.key)||keys.has(row.key)
                ||typeof row.text!=='string'||!row.text.trim()||row.text.length>8000||!Number.isFinite(row.seconds)||row.seconds<=0)return true;
              keys.add(row.key);return false;
            }))throw Error('Invalid source plan');
          finish(null,{sourceHash:value.sourceHash,groups:value.groups});
        }catch(error){finish(error);}
      });
    }catch(error){finish(error);}
  });
}
module.exports={buildSourcePlan};
