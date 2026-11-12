'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const Model = require('./renderer/dub-workspace-model');
const {validate} = require('./renderer/dub-sync-map');

function registerDubWorkspace({app,ipcMain,authorized,dialog,owner,authorizeMedia,authorizeSubtitle,grantMedia,grantSubtitle,
  spawn,terminate,python,ffmpeg,copy=(_tr,en)=>en,busy=()=>false,environment=()=>process.env}) {
  const outputs=new Map(); let operation=null;
  function register(output) {
    if (!output?.path) return output;
    const saved={...output,sync:validate(output.sync),mix:Model.mix(output.mix)};
    try { saved.rows=Model.groups(output.quality?.groups || output.rows || []); } catch (_) { saved.rows=[]; }
    if (output.quality) saved.quality={...output.quality,groups:saved.rows};
    saved.qualityUnavailable=output.qualityUnavailable===true || !saved.rows.length;
    saved.syncInvalid=output.syncInvalid===true || (output.settings?.timingMode==='video' && !saved.sync);
    outputs.set(saved.path,saved);
    if(outputs.size>100) outputs.delete(outputs.keys().next().value);
    return saved;
  }
  const guard=fn=>async(e,...args)=>{
    if(!authorized(e))return {ok:false,error:'Unauthorized request.'};
    try {return await fn(e,...args);}catch(error){return {ok:false,error:error.message};}
  };
  function known(request) {
    const o=outputs.get(request?.path);
    if(!o)throw new Error('Open a generated voice or a saved dubbing project first.');
    return o;
  }
  async function asset(file) {
    const resolved=await authorizeMedia(file);
    grantMedia(resolved);
    return {path:resolved,url:pathToFileURL(resolved).href,name:path.basename(resolved)};
  }
  ipcMain.handle('dub:workspaceAsset',guard(async(_e,file)=>({ok:true,asset:await asset(file)})));
  function begin(e) {
    if(operation || busy())throw new Error('Wait for the current job to finish.');
    const op={sender:e.sender,cancelled:false,proc:null};op.finished=new Promise(resolve=>{op.finish=resolve;});operation=op;
    op.destroyed=()=>{void cancel(op);};
    e.sender.once?.('destroyed',op.destroyed);return op;
  }
  function end(op){op.sender.removeListener?.('destroyed',op.destroyed);if(operation===op)operation=null;op.finish();}
  function check(op) {if(op.cancelled || op.sender.isDestroyed())throw new Error('Cancelled.');}
  async function extras(request) {
    const result={};
    for(const kind of ['music','ambience']) if(request.layers?.[kind]?.path) result[kind]=await asset(request.layers[kind].path);
    return result;
  }
  ipcMain.handle('dub:projectSave',guard(async(e,request={})=>{
    const output=known(request), op=begin(e);let staging;
    try {
      const choice=await dialog.showSaveDialog(owner(),{title:copy('Taşınabilir dublaj projesi kaydet','Save portable dubbing project'),defaultPath:'Dublaj.dubproject',filters:[{name:copy('Dublaj proje klasörü','Dubbing project folder'),extensions:['dubproject']}]});
      if(choice.canceled || !choice.filePath)return {ok:true,cancelled:true};
      check(op);
      const target=choice.filePath.toLowerCase().endsWith('.dubproject')?choice.filePath:choice.filePath+'.dubproject';
      if(fs.existsSync(target))throw new Error('Choose a new project name; existing projects are preserved.');
      staging=target+'.partial-'+randomUUID();await fsp.mkdir(staging);
      const files={voice:'voice.wav'}, layers=await extras({...request,layers:request.layers ?? output.layers});
      const source=await authorizeMedia(output.path);await fsp.copyFile(source,path.join(staging,files.voice));
      if(output.background?.path) {files.background='background.wav';await fsp.copyFile(await authorizeMedia(output.background.path),path.join(staging,files.background));}
      for(const kind of ['music','ambience']) if(layers[kind]){files[kind]=kind+path.extname(layers[kind].path).toLowerCase();await fsp.copyFile(layers[kind].path,path.join(staging,files[kind]));check(op);}
      if(output.subtitle) {
        files.subtitle='subtitles.srt';await fsp.copyFile(await authorizeSubtitle(output.sourceSubtitle || output.subtitle),path.join(staging,files.subtitle));
        if(output.rows.length){
          files.sourceSubtitle='subtitles.srt';files.subtitle='dub.srt';files.spokenSubtitle='speech.srt';
          const tc=seconds=>{const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
          await fsp.writeFile(path.join(staging,files.subtitle),'\uFEFF'+output.rows.map((r,i)=>`${i+1}\n${tc(r.sourceStart)} --> ${tc(r.sourceEnd)}\n${r.displayText || r.text}\n`).join('\n'),'utf8');
          await fsp.writeFile(path.join(staging,files.spokenSubtitle),'\uFEFF'+output.rows.map((r,i)=>`${i+1}\n${tc(r.sourceStart)} --> ${tc(r.sourceEnd)}\n${r.text}\n`).join('\n'),'utf8');
        }
      }
      if(request.includeVideo===true){
        let videoPath=output.video?.path;
        if(!videoPath){
          const chosen=await dialog.showOpenDialog(owner(),{title:copy('Projeye eklenecek yerel videoyu seçin','Choose the local source video to include'),properties:['openFile'],filters:[{name:'Video',extensions:['mp4','mkv','webm','mov','avi','m4v']}]});
          if(chosen.canceled)throw new Error('Cancelled.');
          grantMedia(chosen.filePaths[0]);videoPath=chosen.filePaths[0];
        }
        const media=await asset(videoPath);files.video='source'+path.extname(media.path).toLowerCase();
        await fsp.copyFile(media.path,path.join(staging,files.video));
      }
      const manifest={format:'whisper-dub-project',version:1,name:output.name,files,
        sync:output.sync,syncInvalid:output.syncInvalid===true,range:output.range || null,sample:output.sample===true,rows:output.rows,
        mix:Model.mix(request.mix ?? output.mix),settings:output.settings || null,
        qualityUnavailable:output.qualityUnavailable===true || !output.rows.length};
      check(op);await fsp.writeFile(path.join(staging,'project.json'),JSON.stringify(manifest,null,2),'utf8');
      // No overwrite: the unique staging directory is installed only at the end.
      if(fs.existsSync(target))throw new Error('Project already exists.');
      await fsp.rename(staging,target);staging=null;return {ok:true,path:target};
    }finally{try{if(staging)await fsp.rm(staging,{recursive:true,force:true,maxRetries:5,retryDelay:100});}finally{end(op);}}
  }));
  ipcMain.handle('dub:projectOpen',guard(async(e)=>{
    const op=begin(e);
    try{
      const choice=await dialog.showOpenDialog(owner(),{title:copy('Dublaj projesinin project.json dosyasını açın','Open dubbing project.json'),properties:['openFile'],filters:[{name:copy('Dublaj projesi','Dubbing project'),extensions:['json']}]});
      if(choice.canceled || !choice.filePaths?.length)return {ok:true,cancelled:true};
      const file=choice.filePaths[0], folder=fs.realpathSync(path.dirname(file));
      if(fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size>16000000)throw new Error('Invalid dubbing project.');
      const value=JSON.parse((await fsp.readFile(file,'utf8')).replace(/^\uFEFF/,''));
      if(value.format!=='whisper-dub-project' || value.version!==1 || !value.files || !value.files.voice)throw new Error('Invalid dubbing project.');
      const sync=validate(value.sync),rows=Model.groups(value.rows||[]),range=value.range;
      if(range && (!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.start<0||range.end<=range.start||range.end>86400))throw new Error('Invalid project range.');
      if(range && sync && Math.abs(range.end-range.start-sync.videoDuration)>.05)throw new Error('Invalid project range.');
      const loaded={},pendingGrants=[];
      for(const kind of ['voice','background','music','ambience','subtitle','sourceSubtitle','spokenSubtitle','video']) if(value.files[kind]){
        const name=value.files[kind];
        if(typeof name!=='string' || path.basename(name)!==name || /[\\/:\x00-\x1f]/.test(name) || name==='.' || name==='..')throw new Error('Invalid project asset.');
        const target=path.join(folder,name);
        if(!fs.statSync(target).isFile() || fs.realpathSync(target)!==target)throw new Error('Missing or linked project asset.');
        if(kind==='subtitle'||kind==='sourceSubtitle'||kind==='spokenSubtitle') {if(path.extname(name).toLowerCase()!=='.srt')throw new Error('Invalid subtitles.');pendingGrants.push(['subtitle',target]);loaded[kind]=target;}
        else {if(!/\.(wav|mp3|flac|ogg|opus|m4a|aac|mp4|mkv|webm|mov|avi|m4v)$/i.test(name))throw new Error('Invalid media.');pendingGrants.push(['media',target]);loaded[kind]={path:target,url:pathToFileURL(target).href,name};}
      }
      check(op);
      for(const [kind,target] of pendingGrants){if(kind==='subtitle')grantSubtitle(target);else grantMedia(target);}
      const output=register({path:loaded.voice.path,url:loaded.voice.url,name:String(value.name||'Dublaj.wav').slice(0,200),
        sync,syncInvalid:value.syncInvalid===true || (value.settings?.timingMode==='video' && !sync),range,sample:value.sample===true,rows,quality:{version:1,groups:rows},mix:Model.mix(value.mix),
        qualityUnavailable:value.qualityUnavailable===true || !rows.length,
        settings:value.settings && typeof value.settings==='object' && !Array.isArray(value.settings) ? value.settings : null,
        background:loaded.background,subtitle:loaded.subtitle,sourceSubtitle:loaded.sourceSubtitle,spokenSubtitle:loaded.spokenSubtitle,layers:{music:loaded.music,ambience:loaded.ambience},video:loaded.video});
      return {ok:true,output};
    }finally{end(op);}
  }));
  ipcMain.handle('dub:workspaceExport',guard(async(e,request={})=>{
    const output=known(request);
    if(!['audio','video','dual'].includes(request.kind))throw new Error('Invalid export type.');
    if(output.syncInvalid && request.kind!=='audio')throw new Error('The timing map is invalid; export audio or regenerate the voice.');
    if(output.sample && request.kind!=='audio')throw new Error('A preview cannot be exported as a full video.');
    const op=begin(e);let temp,partial;
    try{
      let video=null;
      if(request.kind!=='audio'){
        if(output.video?.path)video=(await asset(output.video.path)).path;
        else{
          const choice=await dialog.showOpenDialog(owner(),{title:copy('Aynı videonun yerel dosyasını seçin','Choose the local source video (same video and timeline)'),properties:['openFile'],filters:[{name:'Video',extensions:['mp4','mkv','webm','mov','avi','m4v']}]});
          if(choice.canceled)return {ok:true,cancelled:true};
          grantMedia(choice.filePaths[0]);video=(await asset(choice.filePaths[0])).path;
        }
      }
      const ext=request.kind==='audio'?'wav':'mp4';
      const choice=await dialog.showSaveDialog(owner(),{title:copy('Dublajı dışa aktar','Export dubbing'),defaultPath:'Dublaj.'+ext,filters:[{name:ext.toUpperCase(),extensions:[ext]}]});
      if(choice.canceled || !choice.filePath)return {ok:true,cancelled:true};
      const target=choice.filePath.toLowerCase().endsWith('.'+ext)?choice.filePath:choice.filePath+'.'+ext;
      // Preserve source media and previous exports even if a path is selected twice.
      if(fs.existsSync(target))throw new Error('Choose a new output name; existing files are preserved.');
      const layers=await extras({...request,layers:request.layers ?? output.layers});check(op);
      const cfg={voice:await authorizeMedia(output.path),video,kind:request.kind,sync:output.sync,range:output.range||null,
        rows:output.rows,mix:Model.mix(request.mix ?? output.mix),background:output.background?.path?await authorizeMedia(output.background.path):null,
        music:layers.music?.path||null,ambience:layers.ambience?.path||null};
      temp=await fsp.mkdtemp(path.join(os.tmpdir(),'whisper-dub-export-'));
      partial=path.join(path.dirname(target),'.dub-'+randomUUID()+'.partial.'+ext);
      await fsp.writeFile(path.join(temp,'request.json'),JSON.stringify(cfg),'utf8');
      check(op);
      await new Promise((resolve,reject)=>{
        const child=spawn(python(),[path.join(__dirname,'..','backend','dub_export.py'),'--request',path.join(temp,'request.json'),'--output',partial,'--ffmpeg',ffmpeg()],
          {cwd:temp,env:{...environment(),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},windowsHide:true});
        op.proc=child;let tail='';
        child.stdout?.on('data',()=>{});child.stderr?.on('data',text=>{tail=(tail+text).slice(-2000);});
        let workerError;
        // A runtime error is not proof that the child exited. Retain ownership
        // and partial files until close; keep listening for subsequent errors.
        child.on('error',error=>{workerError=error;});
        child.once('close',code=>code===0 && !workerError?resolve():reject(new Error(op.cancelled?'Cancelled.':workerError?.message||tail.trim().slice(-1200)||'Export failed.')));
      });
      check(op);if(!fs.statSync(partial).size)throw new Error('Export produced no media.');
      // link is an exclusive install, preventing a concurrent overwrite race.
      try{await fsp.link(partial,target);}catch(error){
         // exFAT/FAT32/ağ paylaşımları hard link desteklemez; yine dışlayıcı (COPYFILE_EXCL) kopya ile kur.
         if(!['EPERM','ENOSYS','EXDEV','ENOTSUP','EMLINK'].includes(error?.code))throw error;
         await fsp.copyFile(partial,target,fs.constants.COPYFILE_EXCL);
       }
       await fsp.unlink(partial);partial=null;grantMedia(target);
      return {ok:true,path:target,url:pathToFileURL(target).href};
    }finally{
      try{if(partial)await fsp.rm(partial,{force:true,maxRetries:5,retryDelay:100});if(temp)await fsp.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}finally{end(op);}
    }
  }));
  function cancel(op){
    if(op.cancelPromise)return op.cancelPromise;
    op.cancelled=true;
    op.cancelPromise=(async()=>{
      try {
        if(op.proc && await terminate(op.proc)===false){op.cancelled=false;return {ok:false};}
        return {ok:true};
      }catch(_){op.cancelled=false;return {ok:false};}
    })();
    const attempt=op.cancelPromise;
    void attempt.then(result=>{if(!result.ok && op.cancelPromise===attempt)op.cancelPromise=null;});
    return attempt;
  }
  ipcMain.handle('dub:workspaceCancel',guard(async(e)=>{
    if(!operation || operation.sender!==e.sender)return {ok:false};
    return cancel(operation);
  }));
  let quitting=false;
  app?.on('before-quit',event=>{
    const op=operation;if(!op)return;
    event?.preventDefault?.();if(quitting)return;quitting=true;
    void cancel(op).then(async result=>{if(!result.ok){quitting=false;return;}await op.finished;quitting=false;app.quit?.();}).catch(()=>{quitting=false;});
  });
  return {register,running:()=>!!operation};
}
module.exports={registerDubWorkspace};
