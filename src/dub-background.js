'use strict';
const fs = require('node:fs');
const path = require('node:path');

function prepareBackground({source,srt,range,output,appRoot,userData,downloadPython,ffmpeg,
  spawn,environment,onProcess,status,isCancelled}) {
  const python = path.join(appRoot,'backend','separator-venv','Scripts','python.exe');
  if (!fs.existsSync(python)) throw new Error('Arka plan ayırma ortamı eksik; install-browser-extras.bat dosyasını çalıştırın.');
  if (isCancelled()) throw new Error('İptal edildi.');
  const args = [path.join(appRoot,'tools','voxcpm2','prepare_background.py'),
    '--source',source,'--srt',srt,'--output',output,'--models',path.join(appRoot,'backend','separator-models'),
    '--cache',path.join(userData,'dub-background-cache'),'--ffmpeg',ffmpeg,'--download-python',downloadPython];
  if (range) args.push('--start',String(range.start),'--end',String(range.end));
  const torchLib = path.join(appRoot,'backend','separator-venv','Lib','site-packages','torch','lib');
  const env = {...environment(),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PATH:torchLib+path.delimiter+(process.env.PATH || '')};
  for (const key of Object.keys(env)) if (key!=='PATH' && key.toLowerCase()==='path') delete env[key];
  return new Promise((resolve,reject) => {
    const child = spawn(python,args,{cwd:appRoot,env,windowsHide:true});
    onProcess(child);
    let pending='', tail='', settled=false;
    const finish = error => { if (settled) return; settled=true; onProcess(null); error ? reject(error) : resolve(output); };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stderr.on('data',text=>{tail=(tail+text).slice(-2000);});
    child.stdout.on('data',text=>{
      pending=(pending+text).slice(-16384); const lines=pending.split(/\r?\n/); pending=lines.pop();
      for (const line of lines) if (line.startsWith('DUB_BACKGROUND ')) status(line.slice(15).trim());
    });
    child.once('error',()=>finish(new Error('Arka plan aracı başlatılamadı.')));
    child.once('close',code=>finish(code===0 && fs.existsSync(output) ? null : new Error('Arka plan ayrıştırılamadı. '+tail.trim().split(/\r?\n/).at(-1)?.slice(0,500))));
  });
}
module.exports={prepareBackground};
