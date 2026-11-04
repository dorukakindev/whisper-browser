'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');const {randomUUID}=require('node:crypto');
const {withoutSecretEnv}=require('./settings-security');
const {terminateProcessTreeAndWait}=require('./process-lifecycle');
function registerNativePlayer({app,ipcMain,BrowserWindow,owner,authorized,authorizeMedia,torrents,dialog}){
 let session=null,stopping=null,sequence=0,startEpoch=0;
 const configFile=()=>path.join(app.getPath('userData'),'native-player-engine.json');let configured='';
 try{if(fs.existsSync(configFile())&&fs.statSync(configFile()).size<8192)configured=JSON.parse(fs.readFileSync(configFile(),'utf8')).path||'';}catch{}
 const executable=()=>process.env.WHISPER_NATIVE_TEST==='1'&&process.env.WHISPER_MPV_PATH?process.env.WHISPER_MPV_PATH:configured||path.join(process.env.LOCALAPPDATA||'', 'Luna Player','mpv','mpv.exe');
 function send(s,type='state',extra={}){const win=owner();if(session===s&&win&&!win.isDestroyed())win.webContents.send('native-player:event',{type,key:s.key,generation:s.generation,...s.state,...extra});}
 async function command(s,value){
  if(session!==s||!s.socket?.writable)throw Error('Native player disconnected.');
  const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.pending.delete(id);reject(Error('Native player command timed out.'));},5000);s.pending.set(id,{resolve,reject,timer,name:value[0]});s.socket.write(JSON.stringify({command:value,request_id:id})+'\n');});
 }
 function layout(s,bounds){s.bounds=bounds;if(!s.host||s.host.isDestroyed()||!owner())return;const base=owner().getContentBounds(),w=Math.max(1,Math.min(base.width,Math.round(Number(bounds.width)||1))),h=Math.max(1,Math.min(base.height,Math.round(Number(bounds.height)||1)));s.host.setBounds({x:base.x+Math.max(0,Math.round(bounds.x||0)),y:base.y+Math.max(0,Math.round(bounds.y||0)),width:w,height:h});}
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
 function requestStop(){startEpoch++;return stop();}
 const handler=async(event,input={})=>{
  if(!authorized(event))return {ok:false,error:'Unauthorized request.'};
  let opened;
  try{
   if(input.action==='status')return {ok:true,available:fs.existsSync(executable()),active:!!session||!!stopping,stopping:!!stopping,platform:process.platform};
   if(input.action==='choose'){const selected=await dialog.showOpenDialog(owner(),{properties:['openFile'],filters:[{name:'mpv.exe',extensions:['exe']}]});if(selected.canceled)return {ok:true,canceled:true};const file=fs.realpathSync(selected.filePaths[0]);if(path.basename(file).toLowerCase()!=='mpv.exe'||!fs.statSync(file).isFile())throw Error('Choose mpv.exe from your trusted mpv installation.');configured=file;require('./fsync-utils').atomicWriteFileSync(configFile(),JSON.stringify({path:file}));return {ok:true};}
   if(input.action==='stop'){await requestStop();return {ok:true};}
   if(input.action==='start'){
    const epoch=++startEpoch;
    if(process.platform!=='win32')throw Error('Embedded native player currently targets Windows.');if(!fs.existsSync(executable()))throw Error('mpv.exe was not found. The normal player remains available.');
    let source,headers=[];if(String(input.source||'').startsWith('whisper-media:'))({url:source,headers}=torrents.nativeSource(input.source));else if(/^(?:https?|rtsp):\/\//.test(input.source||'')){const url=new URL(input.source);if(url.username||url.password)throw Error('Embedded URL credentials are not supported.');source=url.href;}else source=await authorizeMedia(input.path);
    if(epoch!==startEpoch)throw Error('Native playback was superseded.');
    await stop();if(epoch!==startEpoch)throw Error('Native playback was superseded.');const host=new BrowserWindow({parent:owner(),show:false,frame:false,skipTaskbar:true,focusable:false,backgroundColor:'#000000',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    const handle=host.getNativeWindowHandle(),wid=(handle.length>=8?handle.readBigUInt64LE():BigInt(handle.readUInt32LE())).toString(),pipe='\\\\.\\pipe\\whisper-mpv-'+randomUUID();
    const s={host,key:String(input.key||'').slice(0,2048),generation:input.generation,pending:new Map(),state:{time:0,duration:0,paused:true,speed:1,volume:1,muted:false,buffering:false,tracks:[]}};session=s;opened=s;
    s.owner=owner();s.reposition=()=>layout(s,s.bounds||input.bounds||{});s.owner.on('move',s.reposition);s.owner.on('resize',s.reposition);
    const config=path.join(app.getPath('userData'),'native-player-input.conf');fs.writeFileSync(config,'MBTN_LEFT script-message whisper-toggle\nMBTN_LEFT_DBL script-message whisper-fullscreen\n');
    const args=['--no-config','--load-scripts=no','--idle=yes','--terminal=no','--osc=no','--input-default-bindings=no','--input-vo-keyboard=no','--input-conf='+config,'--wid='+wid,'--input-ipc-server='+pipe,'--hwdec=auto','--keep-open=yes','--sub-auto=no','--audio-file-auto=no','--ytdl=no','--osd-level=1','--osd-align-y=bottom','--osd-align-x=center','--osd-font-size=28'];
    s.proc=spawn(executable(),args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:withoutSecretEnv(process.env)});s.proc.stdout.on('data',()=>{});let error='';s.proc.stderr.on('data',c=>{error=(error+c).slice(-1200);});s.proc.on('error',e=>{error=e.message;});s.proc.once('close',()=>{s.closed=true;if(session===s){send(s,'error',{error:'Native player closed. '+error});void stop().catch(()=>{});}});
    const until=Date.now()+8000;while(Date.now()<until&&!s.socket&&session===s){try{s.socket=await new Promise((resolve,reject)=>{const socket=net.createConnection(pipe);socket.once('error',e=>{socket.destroy();reject(e);});socket.once('connect',()=>resolve(socket));});}catch{await new Promise(r=>setTimeout(r,100));}}
    if(session!==s){s.socket?.destroy();throw Error('Native playback was superseded.');}
    if(!s.socket){await stop();throw Error('Native player IPC startup timed out. '+error);}
    let buffer='';s.socket.on('error',()=>{});s.socket.on('close',()=>{if(session===s){send(s,'error',{error:'Native player connection closed.'});void stop().catch(()=>{});}});
    s.socket.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>2_000_000){void stop().catch(()=>{});return;}let line;while((line=buffer.indexOf('\n'))>=0){const text=buffer.slice(0,line);buffer=buffer.slice(line+1);let row;try{row=JSON.parse(text);}catch{continue;}const pending=s.pending.get(row.request_id);if(pending){s.pending.delete(row.request_id);clearTimeout(pending.timer);row.error==='success'?pending.resolve(row.data):pending.reject(Error(pending.name+': '+row.error));}
      if(row.event==='file-loaded')s.loaded=true;
      if(row.event==='property-change'){const map={'time-pos':'time','duration':'duration','pause':'paused','speed':'speed','volume':'volume','mute':'muted','paused-for-cache':'buffering','track-list':'tracks'};const key=map[row.name];if(key)s.state[key]=row.name==='volume'?Number(row.data)/100:row.data;}
      if(row.event==='client-message'&&row.args?.[0]?.startsWith('whisper-'))send(s,'input',{input:row.args[0]});
      if(row.event==='end-file'&&row.reason==='eof')send(s,'ended');
    }});
    await command(s,['set_property','http-header-fields',headers]);
    for(const [i,name]of ['time-pos','duration','pause','speed','volume','mute','paused-for-cache','track-list'].entries())await command(s,['observe_property',i+1,name]);
    await command(s,['loadfile',source]);await command(s,['set_property','pause',true]);
    const readyDeadline=Date.now()+12000;while(!s.loaded&&Date.now()<readyDeadline&&session===s)await new Promise(r=>setTimeout(r,50));
    if(session!==s||!s.loaded)throw Error('Native media did not become ready.');
    if(Number(input.time)>0)await command(s,['seek',Number(input.time),'absolute']);
    layout(s,input.bounds||{});host.showInactive();s.pulse=setInterval(()=>send(s),200);send(s,'ready');return {ok:true};
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
   if(input.action==='layout'){layout(s,input.bounds||{});if(input.hidden)s.host.hide();else s.host.showInactive();return {ok:true};}
   if(input.action==='command'){
    const filters={off:'',night:'lavfi=[acompressor=threshold=0.025:ratio=6:attack=6:release=350]',dialogue:'lavfi=[acompressor=threshold=0.04:ratio=3:attack=8:release=280]',guard:'lavfi=[acompressor=threshold=0.2:ratio=12:attack=2:release=200]'};
    if(input.command==='profile'){if(!Object.hasOwn(filters,input.value))throw Error('Invalid listening profile.');await command(s,['set_property','af',filters[input.value]]);return {ok:true};}
    const allowed={play:()=>['set_property','pause',false],pause:()=>['set_property','pause',true],seek:()=>['seek',Math.max(0,Math.min(s.state.duration||604800,Number(input.value)||0)),'absolute'],speed:()=>['set_property','speed',Math.max(.25,Math.min(4,Number(input.value)||1))],volume:()=>['set_property','volume',Math.max(0,Math.min(100,Number(input.value)*100))],mute:()=>['set_property','mute',!!input.value],audio:()=>['set_property','aid',Number(input.value)],text:()=>['show-text',String(input.value||'').slice(0,1500).replace(/[{}]/g,''),700]};if(!allowed[input.command])throw Error('Unsupported native command.');await command(s,allowed[input.command]());return {ok:true};
   }
   throw Error('Unsupported native player operation.');
  }catch(error){if(opened&&session===opened){try{await stop();}catch(stopError){return {ok:false,error:stopError.message};}}return {ok:false,error:error.message};}
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
module.exports={registerNativePlayer};
