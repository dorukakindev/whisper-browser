'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');const {randomUUID}=require('node:crypto');
const {withoutSecretEnv}=require('./settings-security');
const {terminateProcessTreeAndWait}=require('./process-lifecycle');
const NATIVE_SUBTITLE_FONTS=Object.freeze({system:'Segoe UI',serif:'Georgia',mono:'Consolas',rounded:'Segoe UI Variable'});
function normalizeNativeText(value){
 const literal=(text,limit)=>String(text||'').slice(0,limit).replace(/\r\n?/g,'\n').replace(/\t/g,'    ').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g,'');
 if(value==null||typeof value==='string')return{primary:literal(value,1500),secondary:'',legacy:true};
 const keys=new Set(['primary','secondary','primaryRole','secondaryRole','fontSize','font','weight','outline']);
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.has(key)))throw Error('Invalid native subtitle projection.');
 for(const key of ['primary','secondary'])if(value[key]!==undefined&&typeof value[key]!=='string')throw Error('Invalid native subtitle text.');
 for(const key of ['primaryRole','secondaryRole'])if(value[key]!==undefined&&!['source','translation'].includes(value[key]))throw Error('Invalid native subtitle role.');
 if(value.font!==undefined&&!Object.hasOwn(NATIVE_SUBTITLE_FONTS,value.font))throw Error('Invalid native subtitle font.');
 const number=(key,fallback,min,max)=>{if(value[key]===undefined)return fallback;if(typeof value[key]!=='number'||!Number.isFinite(value[key]))throw Error('Invalid native subtitle style.');return Math.max(min,Math.min(max,value[key]));};
 return{primary:literal(value.primary,750),secondary:literal(value.secondary,750),primaryRole:value.primaryRole||'source',secondaryRole:value.secondaryRole||'translation',fontSize:number('fontSize',28,18,80),font:value.font||'system',weight:Math.round(number('weight',600,100,900)/100)*100,outline:number('outline',70,0,100),legacy:false};
}
function buildNativeText(text,codes,height){
 if(text.legacy)return text.primary;
 if(!text.primary&&!text.secondary)return '';
 // mpv documents its opaque ASS gates and literal escaping here:
 // https://mpv.io/manual/stable/#command-interface-osd-ass-cc
 // User text never enters a trusted style region. C1 filtering above also
 // removes mpv's U+0092 gate and U+0091 symbol escape from subtitle input.
 const scale=720/Math.max(120,Math.min(16384,Number(height)||720));
 const font=(text.fontSize*scale).toFixed(2),border=(text.outline*.03*scale).toFixed(2),shadow=(text.outline*.015*scale).toFixed(2);
 const line=(content,role)=>codes.start+`{\\r\\an2\\fn${NATIVE_SUBTITLE_FONTS[text.font]}\\fs${font}\\b${text.weight}\\bord${border}\\shad${shadow}\\3c&H000000&\\4c&H000000&\\1c&H${role==='translation'?'8DCCED':'FFFFFF'}&}`+codes.stop+content;
 return[[text.primary,text.primaryRole],[text.secondary,text.secondaryRole]].filter(([content])=>content).sort((a,b)=>(a[1]==='source'?0:1)-(b[1]==='source'?0:1)).map(([content,role])=>line(content,role)).join('\n');
}
function nativeTrackCommand(tracks,type,value){
 const property=type==='audio'?'aid':'sid';
 if(type==='sub'&&(value==='no'||value===false))return ['set_property',property,'no'];
 const id=typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;
 if(!Number.isSafeInteger(id)||id<1||!Array.isArray(tracks)||!tracks.some(track=>track?.type===type&&track.id===id))throw Error('Native track changed or is unavailable. Refresh the current source tracks.');
 return ['set_property',property,id];
}
function registerNativePlayer({app,ipcMain,BrowserWindow,owner,authorized,authorizeMedia,torrents,dialog,sourceHeaders}){
 let session=null,stopping=null,sequence=0,startEpoch=0,startup=null;
 // Fixed-schema in-memory receipt: no source, title, path, key or error strings.
 function startupTrace(){
  const clock=()=>typeof performance!=='undefined'?performance.now():Date.now(),started=clock(),attemptId=randomUUID();let elapsed=0,outcome='pending',phase='authorize';const stages=[],mediaEvents=[],cache={};
  const time=()=>elapsed=Math.max(elapsed,Math.round(clock()-started));
  const snapshot=()=>({attemptId,outcome,phase,elapsedMs:outcome==='pending'?time():elapsed,stages:stages.map(row=>({...row})),media:{events:mediaEvents.map(row=>({...row})),cache:{...cache}}});
  const publish=()=>{const win=owner();if(win&&!win.isDestroyed())try{win.webContents.send('native-player:event',{type:'startup',startup:snapshot()});}catch{}};
  const mark=value=>{if(outcome!=='pending')return;phase=value;stages.push({phase:value,elapsedMs:time()});publish();};
  const finish=value=>{if(outcome==='pending'){outcome=value;time();publish();}};
  const observe=row=>{
   if(outcome!=='pending')return;
   if(['start-file','file-loaded','playback-restart'].includes(row.event)&&!mediaEvents.some(item=>item.event===row.event)){
    mediaEvents.push({event:row.event,elapsedMs:time()});publish();
   }
   if(row.event!=='property-change')return;
   if(row.name==='cache-speed'&&Number.isFinite(row.data)&&row.data>=0)cache.bytesPerSecond=row.data;
   if(row.name==='demuxer-cache-state'&&row.data&&typeof row.data==='object'){
    for(const [name,key]of [['raw-input-rate','inputBytesPerSecond'],['total-bytes','totalBytes'],['cache-duration','durationSeconds']])if(Number.isFinite(row.data[name])&&row.data[name]>=0)cache[key]=row.data[name];
    for(const [name,key]of [['underrun','underrun'],['idle','idle']])if(typeof row.data[name]==='boolean')cache[key]=row.data[name];
   }
  };
  mark('authorize');return {mark,finish,snapshot,observe};
 }
 const configFile=()=>path.join(app.getPath('userData'),'native-player-engine.json');let configured='';
 try{if(fs.existsSync(configFile())&&fs.statSync(configFile()).size<8192)configured=JSON.parse(fs.readFileSync(configFile(),'utf8')).path||'';}catch{}
 const executable=()=>process.env.WHISPER_NATIVE_TEST==='1'&&process.env.WHISPER_MPV_PATH?process.env.WHISPER_MPV_PATH:configured||path.join(process.env.LOCALAPPDATA||'', 'Luna Player','mpv','mpv.exe');
 function send(s,type='state',extra={}){const win=owner();if(session===s&&win&&!win.isDestroyed())win.webContents.send('native-player:event',{type,key:s.key,generation:s.generation,...s.state,...extra});}
 async function command(s,value){
  if(session!==s||!s.socket?.writable)throw Error('Native player disconnected.');
  const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.pending.delete(id);reject(Error('Native player command timed out.'));},5000);s.pending.set(id,{resolve,reject,timer,name:value[0]});s.socket.write(JSON.stringify({command:value,request_id:id})+'\n');});
 }
 function layout(s,bounds){
  // A source/stage handoff can briefly hide the video. Do not turn its empty
  // rectangle into a visible 1px mpv host or revive an old rectangle on move.
  s.bounds=bounds;const win=owner();if(!s.host||s.host.isDestroyed()||!win)return false;
  const base=win.getContentBounds();
  if(!['x','y','width','height'].every(k=>Number.isFinite(bounds[k]))||Math.round(bounds.width)<1||Math.round(bounds.height)<1||base.width<1||base.height<1){if(s.host.isVisible())s.host.hide();return false;}
  const w=Math.min(base.width,Math.round(bounds.width)),h=Math.min(base.height,Math.round(bounds.height));
  const next={x:base.x+Math.max(0,Math.round(bounds.x)),y:base.y+Math.max(0,Math.round(bounds.y)),width:w,height:h},previous=s.host.getBounds();
  if(Object.keys(next).some(k=>next[k]!==previous[k]))s.host.setBounds(next);return true;
 }
 async function stop(){
  const s=stopping?.session||session;if(!s)return {ok:true};
  if(stopping?.promise)return stopping.promise;
  session=null;clearInterval(s.pulse);s.owner?.removeListener('move',s.reposition);s.owner?.removeListener('resize',s.reposition);s.socket?.destroy();
  for(const p of s.pending.values()){clearTimeout(p.timer);p.reject(Error('Native player stopped.'));}s.pending.clear();
  if(!s.host.isDestroyed())s.host.destroy();
  const state=stopping||{session:s,promise:null};stopping=state;
  state.promise=Promise.resolve().then(()=>s.closed?true:terminateProcessTreeAndWait(s.proc,{spawn})).then(closed=>{
   if(!closed)throw Error('Native player has not confirmed shutdown / Oynatıcı kapanışı doğrulanamadı.');
   if(stopping===state)stopping=null;return {ok:true};
  }).finally(()=>{state.promise=null;});
  return state.promise;
 }
 // External cancellation must also invalidate starts still awaiting file consent.
 // Internal session replacement uses stop() without invalidating its own epoch.
 function requestStop(){startEpoch++;startup?.finish('cancelled');return stop();}
 const handler=async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized request.'};
  let opened,trace;
  try{
   if(input.action==='startup-diagnostics')return {ok:true,startup:startup?.snapshot()||null};
   if(input.action==='status')return {ok:true,available:fs.existsSync(executable()),active:!!session||!!stopping,stopping:!!stopping,platform:process.platform,startup:startup?.snapshot()||null};
   if(input.action==='choose'){const selected=await dialog.showOpenDialog(owner(),{properties:['openFile'],filters:[{name:'mpv.exe',extensions:['exe']}]});if(selected.canceled)return {ok:true,canceled:true};const file=fs.realpathSync(selected.filePaths[0]);if(path.basename(file).toLowerCase()!=='mpv.exe'||!fs.statSync(file).isFile())throw Error('Choose mpv.exe from your trusted mpv installation.');configured=file;require('./fsync-utils').atomicWriteFileSync(configFile(),JSON.stringify({path:file}));return {ok:true};}
   if(input.action==='stop'){await requestStop();return {ok:true};}
   if(input.action==='start'){
    startup?.finish('cancelled');trace=startup=startupTrace();
    const epoch=++startEpoch;
    if(process.platform!=='win32')throw Error('Embedded native player currently targets Windows.');if(!fs.existsSync(executable()))throw Error('mpv.exe was not found. The normal player remains available.');
    let source,headers=[];if(String(input.source||'').startsWith('whisper-media:'))({url:source,headers}=torrents.nativeSource(input.source));else if(/^(?:https?|rtsp):\/\//.test(input.source||'')){const url=new URL(input.source);if(url.username||url.password)throw Error('Embedded URL credentials are not supported.');source=url.href;try{const extra=typeof sourceHeaders==='function'?sourceHeaders(source):[];headers=(Array.isArray(extra)?extra:[]).map(([name,value])=>name+': '+value);}catch{headers=[];}}else source=await authorizeMedia(input.path);
    if(epoch!==startEpoch)throw Error('Native playback was superseded.');
    trace.mark('previous-stop');await stop();if(epoch!==startEpoch)throw Error('Native playback was superseded.');trace.mark('host-create');const host=new BrowserWindow({parent:owner(),show:false,frame:false,skipTaskbar:true,focusable:false,backgroundColor:'#000000',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    const handle=host.getNativeWindowHandle(),wid=(handle.length>=8?handle.readBigUInt64LE():BigInt(handle.readUInt32LE())).toString(),pipe='\\\\.\\pipe\\whisper-mpv-'+randomUUID();
    const s={host,key:String(input.key||'').slice(0,2048),generation:input.generation,network:/^https?:\/\//i.test(source),pending:new Map(),state:{time:0,duration:0,paused:true,speed:1,volume:1,muted:false,buffering:false,tracks:[]}};session=s;opened=s;
    s.owner=owner();s.reposition=()=>layout(s,s.bounds||input.bounds||{});s.owner.on('move',s.reposition);s.owner.on('resize',s.reposition);
    const config=path.join(app.getPath('userData'),'native-player-input.conf');fs.writeFileSync(config,'MBTN_LEFT script-message whisper-toggle\nMBTN_LEFT_DBL script-message whisper-fullscreen\n');
    const args=['--no-config','--load-scripts=no','--idle=yes','--terminal=no','--osc=no','--input-default-bindings=no','--input-vo-keyboard=no','--input-conf='+config,'--wid='+wid,'--input-ipc-server='+pipe,'--hwdec=auto','--keep-open=yes','--sub-auto=no','--sid=no','--audio-file-auto=no','--ytdl=no','--osd-level=1','--osd-align-y=bottom','--osd-align-x=center','--osd-font-size=28'];
    trace.mark('process-spawn');s.proc=spawn(executable(),args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:withoutSecretEnv(process.env)});s.proc.stdout.on('data',()=>{});let error='';s.proc.stderr.on('data',c=>{error=(error+c).slice(-1200);});s.proc.on('error',e=>{error=e.message;s.startError='Native player could not start. '+e.message;trace.finish('failed');});s.proc.once('exit',()=>{if(!s.ready){s.startError='Native player exited before media initialization.';trace.finish('failed');}});s.proc.once('close',()=>{s.closed=true;if(!s.ready)trace.finish('failed');if(session===s){send(s,'error',{error:'Native player closed. '+error});void stop().catch(()=>{});}});
    trace.mark('ipc-connect');const until=Date.now()+8000;while(Date.now()<until&&!s.socket&&!s.startError&&session===s){try{s.socket=await new Promise((resolve,reject)=>{const socket=net.createConnection(pipe);socket.once('error',e=>{socket.destroy();reject(e);});socket.once('connect',()=>resolve(socket));});}catch{await new Promise(r=>setTimeout(r,100));}}
    if(session!==s){s.socket?.destroy();throw Error('Native playback was superseded.');}
    if(s.startError)throw Error(s.startError);
    if(!s.socket){await stop();throw Error('Native player IPC startup timed out. '+error);}
    let buffer='';s.socket.on('error',()=>{});s.socket.on('close',()=>{if(session===s){send(s,'error',{error:'Native player connection closed.'});void stop().catch(()=>{});}});
    function failPlayback(){
     if(session!==s||s.loadError)return;
     s.loadError='Native media could not play.';
     if(s.ready){send(s,'error',{error:s.loadError});void stop().catch(()=>{});}
    }
    function notifyEnd(){
     if(session!==s||s.endNotified||s.loadError)return;
     const {time,duration}=s.state;
     const endTolerance=Math.max(2,Math.min(10,duration*.02));
     // A truncated HTTP response can produce EOF rather than an mpv error.
     if(s.network&&s.ready&&time>0&&duration-time>endTolerance){failPlayback();return;}
     s.endNotified=true;send(s,'ended');
    }
    s.socket.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>2_000_000){void stop().catch(()=>{});return;}let line;while((line=buffer.indexOf('\n'))>=0){const text=buffer.slice(0,line);buffer=buffer.slice(line+1);let row;try{row=JSON.parse(text);}catch{continue;}const pending=s.pending.get(row.request_id);if(pending){s.pending.delete(row.request_id);clearTimeout(pending.timer);row.error==='success'?pending.resolve(row.data):pending.reject(Error(pending.name+': '+row.error));}
      if(session===s&&startup===trace)trace.observe(row);
      if(row.event==='file-loaded')s.loaded=true;
      // keep-open pauses on EOF without unloading the file; end-file need not fire.
      if(row.event==='property-change'&&row.name==='eof-reached'){
        if(row.data===false)s.endNotified=false;
        else if(row.data===true)notifyEnd();
      }
      if(row.event==='property-change'){
       const map={'time-pos':'time','duration':'duration','pause':'paused','speed':'speed','volume':'volume','mute':'muted','paused-for-cache':'buffering','track-list':'tracks','chapter-list':'chapters'};
       const key=map[row.name];
       if(key&&((key!=='time'&&key!=='duration')||Number.isFinite(row.data)))s.state[key]=key==='tracks'&&!Array.isArray(row.data)?[]:row.name==='volume'?Number(row.data)/100:row.data;
      }
      if(row.event==='client-message'&&row.args?.[0]?.startsWith('whisper-'))send(s,'input',{input:row.args[0]});
      if(row.event==='end-file'&&row.reason==='error')failPlayback();
      if(row.event==='end-file'&&row.reason==='eof')notifyEnd();
    }});
    trace.mark('configure');
    await command(s,['set_property','http-header-fields',headers]);
    for(const [i,name]of ['time-pos','duration','pause','speed','volume','mute','paused-for-cache','track-list','eof-reached','chapter-list'].entries())await command(s,['observe_property',i+1,name]);
    // Optional read-only diagnostics never gate playback on mpv support/replies.
    for(const [i,name]of ['cache-speed','demuxer-cache-state'].entries())void command(s,['observe_property',11+i,name]).catch(()=>{});
    trace.mark('load');await command(s,['loadfile',source]);await command(s,['set_property','pause',true]);
    trace.mark('media-ready');const readyDeadline=Date.now()+12000;while(!s.loaded&&!s.loadError&&Date.now()<readyDeadline&&session===s)await new Promise(r=>setTimeout(r,50));
    if(s.loadError)throw Error(s.loadError);
    if(session!==s||!s.loaded)throw Error('Native media did not become ready.');
    if(Number(input.time)>0){trace.mark('seek');await command(s,['seek',Number(input.time),'absolute']);}
    if(s.loadError)throw Error(s.loadError);
    trace.mark('present');s.ready=true;if(layout(s,input.bounds||{})&&!host.isVisible())host.showInactive();trace.mark('ready');trace.finish('ready');s.pulse=setInterval(()=>send(s),200);send(s,'ready');return {ok:true,startup:trace.snapshot()};
   }
   const s=session;if(!s||s.key!==input.key||s.generation!==input.generation)return {ok:false,error:'Native playback source changed.'};
   if(input.action==='diagnostics'){
    if(s.diagnosticsPending)return {ok:false,error:'Diagnostics are already in progress.'};
    s.diagnosticsPending=true;
    try{
     const properties=require('./native-player-diagnostics').PROPERTIES;
     const rows=await Promise.allSettled(properties.map(name=>command(s,['get_property',name])));
     if(session!==s)return {ok:false,error:'Native playback source changed.'};
     const props={};
     rows.forEach((result,i)=>{const value=result.value;if(result.status==='fulfilled'&&(typeof value==='boolean'||Number.isFinite(value)||(typeof value==='string'&&/^[A-Za-z0-9._+-]{1,24}$/.test(value))))props[properties[i]]=value;});
     return {ok:true,props};
    }finally{s.diagnosticsPending=false;}
   }
   if(input.action==='snapshot'){const file=path.join(app.getPath('temp'),'whisper-mpv-'+randomUUID()+'.png');try{await command(s,['screenshot-to-file',file,'video']);const bytes=await fs.promises.readFile(file);if(bytes.length>16000000)throw Error('Native frame too large.');return {ok:true,image:'data:image/png;base64,'+bytes.toString('base64')};}finally{await fs.promises.unlink(file).catch(()=>{});}}
   if(input.action==='layout'){const visible=layout(s,input.bounds||{})&&!input.hidden;if(visible!==s.host.isVisible()){if(visible)s.host.showInactive();else s.host.hide();}return {ok:true};}
   if(input.action==='command'){
    const filters={off:'',night:'lavfi=[acompressor=threshold=0.025:ratio=6:attack=6:release=350]',dialogue:'lavfi=[acompressor=threshold=0.04:ratio=3:attack=8:release=280]',guard:'lavfi=[acompressor=threshold=0.2:ratio=12:attack=2:release=200]'};
    if(input.command==='profile'){if(!Object.hasOwn(filters,input.value))throw Error('Invalid listening profile.');await command(s,['set_property','af',filters[input.value]]);return {ok:true};}
    if(input.command==='text'){
     const text=normalizeNativeText(input.value),revision=s.textRevision=(s.textRevision||0)+1;
     let codes;
     if(!text.legacy&&(text.primary||text.secondary)){
      s.assCodesPromise??=Promise.all([command(s,['get_property','osd-ass-cc/0']),command(s,['get_property','osd-ass-cc/1'])]).then(([start,stop])=>{
       if(typeof start!=='string'||typeof stop!=='string'||!start||!stop||start.length>32||stop.length>32)throw Error('Native subtitle formatting is unavailable.');return{start,stop};
      });
      codes=await s.assCodesPromise;
     }
     if(session!==s)throw Error('Native playback source changed.');
     if(revision!==s.textRevision)return{ok:true,skipped:true};
     // Explicit raw prefix prevents property expansion even if command defaults
     // change; subtitle content such as ${path} is always shown literally.
     await command(s,['raw','show-text',buildNativeText(text,codes,s.bounds?.height),700]);return{ok:true};
    }
    const allowed={play:()=>['set_property','pause',false],pause:()=>['set_property','pause',true],seek:()=>['seek',Math.max(0,Math.min(s.state.duration||604800,Number(input.value)||0)),'absolute'],speed:()=>['set_property','speed',Math.max(.0625,Math.min(4,Number(input.value)||1))],volume:()=>['set_property','volume',Math.max(0,Math.min(100,Number(input.value)*100))],mute:()=>['set_property','mute',!!input.value],audio:()=>nativeTrackCommand(s.state.tracks,'audio',input.value),sub:()=>nativeTrackCommand(s.state.tracks,'sub',input.value),vprop:()=>{const value=input.value;if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid native property packet.');const spec={brightness:[-100,100],contrast:[-100,100],saturation:[-100,100],gamma:[-100,100],hue:[-100,100],'video-zoom':[-2,2],panscan:[0,1],'audio-delay':[-10,10],'sub-delay':[-30,30],'video-pan-x':[-1,1],'video-pan-y':[-1,1]};const name=String(value.name||'');if(name==='video-rotate')return ['set_property',name,[0,90,180,270].includes(Number(value.value))?Number(value.value):0];if(name==='video-aspect-override'){const v=Number(value.value);return ['set_property',name,Number.isFinite(v)&&v>=0.3&&v<=4?v:-1];}if(!Object.hasOwn(spec,name))throw Error('Unsupported native property.');const [lo,hi]=spec[name],v=Number(value.value);if(!Number.isFinite(v))throw Error('Invalid native property value.');return ['set_property',name,Math.max(lo,Math.min(hi,v))];}};if(!allowed[input.command])throw Error('Unsupported native command.');await command(s,allowed[input.command]());return {ok:true};
   }
   throw Error('Unsupported native player operation.');
  }catch(error){trace?.finish(startup!==trace||/superseded/.test(error.message)?'cancelled':'failed');if(opened&&session===opened){try{await stop();}catch(stopError){return {ok:false,error:stopError.message,...(trace?{startup:trace.snapshot()}:{})};}}return {ok:false,error:error.message,...(trace?{startup:trace.snapshot()}:{})};}
 };
 ipcMain.handle('native-player:request',handler);
 let quitting=false;
 app.on('before-quit',event=>{
  startEpoch++;
  if(!session&&!stopping)return;
  event?.preventDefault?.();if(quitting)return;quitting=true;
  void stop().then(()=>{quitting=false;app.quit?.();},()=>{quitting=false;});
 });
 return {stop:requestStop,handler};
}
module.exports={registerNativePlayer,normalizeNativeText,buildNativeText};
