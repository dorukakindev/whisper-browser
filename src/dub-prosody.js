'use strict';
const fs = require('node:fs');
const path = require('node:path');

function prepareProsody({ source, srt, output, range, sample, grouping, strength, appRoot, python, ffmpeg,
  spawn, terminate, environment, onProcess, status, isCancelled, setTimeoutFn=setTimeout, clearTimeoutFn=clearTimeout }) {
  if (isCancelled()) throw new Error('Cancelled');
  const args = [path.join(appRoot,'tools','voxcpm2','prepare_prosody.py'),'--source',source,'--srt',srt,
    '--output',output,'--grouping',grouping,'--strength',strength,'--ffmpeg',ffmpeg];
  if (range) args.push('--start',String(range.start),'--end',String(range.end));
  if (sample) args.push('--sample');
  return new Promise((resolve,reject) => {
    const child = spawn(python,args,{cwd:appRoot,env:{...environment(),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},windowsHide:true});
    onProcess(child);
    let pending='', settled=false, timedOut=false, failureCode='', workerError=false;
    const done = error => { if (settled) return; settled=true; clearTimeoutFn(timer); onProcess(null); error ? reject(error) : resolve(output); };
    const timer=setTimeoutFn(() => {
      timedOut=true;
      // Do not detach a live process from the owning job before it is stopped.
      Promise.resolve().then(()=>terminate(child)).then(stopped => {
        if (stopped===false && child.exitCode==null && child.signalCode==null) {
          status('stop_failed'); // Retain ownership; user may retry Stop.
        } // Successful termination is a request; close is the ownership boundary.
      }).catch(()=>status('stop_failed'));
    },30*60*1000);
    timer.unref?.();
    child.stdout.setEncoding('utf8'); child.stderr.resume();
    child.stdout.on('data',text => {
      pending=(pending+text).slice(-4096); const lines=pending.split(/\r?\n/); pending=lines.pop();
      for (const line of lines) {
        if (/^DUB_PROSODY \d+\/\d+$/.test(line)) status(line.slice(12));
        if (line==='DUB_PROSODY_ERROR MULTIPLE_AUDIO_TRACKS') failureCode='MULTIPLE_AUDIO_TRACKS';
      }
    });
    // Keep the live worker owned after kill/send failures; close is final.
    child.on('error',()=>{workerError=true;});
    child.once('close',code=>{
      const error=new Error(timedOut ? 'Prosody analysis timed out' : workerError ? 'Prosody worker failed' : 'Prosody source could not be analyzed');error.code=failureCode;
      done(code===0 && !workerError && !timedOut && !isCancelled() && fs.existsSync(output) ? null : error);
    });
  });
}
module.exports={prepareProsody};
