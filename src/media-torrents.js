'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {atomicWriteFileSync}=require('./fsync-utils');
const {withoutSecretEnv}=require('./settings-security');
const {readLimitedBytes}=require('./catalog-discovery');
const ENGINE={version:'9.0.1',url:'https://github.com/ikatson/rqbit/releases/download/v9.0.1/rqbit.exe',sha256:'2ed683203beca628e0c45f62f99feeef4242cecc3444c8422dfe5b1b6aa38cea'};
function safeFile(row,index){
  const parts=row.name_components || String(row.name || '').split(/[\\/]/),size=Number(row.length);
  if(!Array.isArray(parts)||!parts.length||parts.some(p=>typeof p!=='string'||!p||p==='.'||p==='..'||/[\\/:\0]/.test(p)||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))||!Number.isSafeInteger(size)||size<0)throw Error('Unsafe torrent file path or size.');
  return {index,name:parts.join('/'),size,video:/\.(mp4|mkv|webm|avi|mov|m4v|ts|m2ts)$/i.test(parts.at(-1))};
}
function registerMediaTorrents({app,ipcMain,authorized,dialog,owner,protocol,grantMedia,enginePath,fetchImpl=fetch}){
  const root=()=>path.join(app.getPath('userData'),'torrent-media');
  const executable=()=>enginePath?.()||path.join(app.getPath('userData'),'media-engines','rqbit.exe');
  let proc=null,starting=null,base='',auth='',lastError='',indexError='';const previews=new Map(),streams=new Map(),jobs=new Map();
  const indexFile=()=>path.join(app.getPath('userData'),'torrent-library.json');
  function persist(){atomicWriteFileSync(indexFile(),JSON.stringify([...jobs.values()]));}
  function rememberStream(token,entry){streams.set(token,entry);while(streams.size>200)streams.delete(streams.keys().next().value);}
  if(fs.existsSync(indexFile())){try{if(fs.statSync(indexFile()).size>2_000_000)throw Error('Torrent index too large.');const parsed=JSON.parse(fs.readFileSync(indexFile(),'utf8'));if(!Array.isArray(parsed)||parsed.length>1000)throw Error('Invalid torrent index.');for(const row of parsed){if(!/^[a-f0-9]{40}$/i.test(row.hash||''))throw Error('Invalid saved torrent identity.');for(const file of row.selections||[row])safeFile({name:file.name,length:file.size},file.index);jobs.set(row.hash,row);}}catch(error){indexError=error.message+' Original torrent index was preserved.';jobs.clear();}}
  async function api(route,method='GET',body,timeout=15000){
    const response=await fetchImpl(base+route,{method,headers:{Authorization:auth,...(body?{'Content-Type':typeof body==='string'?'application/json':'application/octet-stream'}:{})},body,signal:AbortSignal.timeout(timeout),redirect:'error'});
    if(!response.ok)throw Error(`Torrent engine HTTP ${response.status}`);
    const text=(await readLimitedBytes(response,8_000_000,'Torrent')).toString('utf8');return text?JSON.parse(text):{};
  }
  async function start(){
    if(starting)return starting;
    if(proc&&base)return;
    starting=(async()=>{
      if(!fs.existsSync(executable()))throw Error('Install the torrent engine from Media open → Torrents first.');
      if(createHash('sha256').update(fs.readFileSync(executable())).digest('hex')!==ENGINE.sha256)throw Error('Torrent engine integrity check failed.');
      const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
      const password=randomBytes(32).toString('hex');auth='Basic '+Buffer.from('whisper:'+password).toString('base64');base=`http://127.0.0.1:${port}`;
      fs.mkdirSync(root(),{recursive:true});
      const flags=['--http-api-listen-addr',`127.0.0.1:${port}`,'--disable-upnp-port-forward','--disable-lsd','--disable-dht-persistence'];
      if(process.env.WHISPER_TORRENT_TEST==='1')flags.push('--disable-dht','--disable-trackers','--disable-tcp-listen');
      proc=spawn(executable(),[...flags,'server','start','--persistence-location',path.join(root(),'session'),root()],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...withoutSecretEnv(process.env),RQBIT_HTTP_BASIC_AUTH_USERPASS:'whisper:'+password}});
      const current=proc;proc.stdout.on('data',()=>{});proc.stderr.on('data',chunk=>{lastError=String(chunk).slice(-1500).replaceAll(password,'[redacted]');});
      proc.once('error',error=>{lastError=error.message;});proc.once('close',()=>{if(proc===current){proc=null;base='';streams.clear();}});
      const end=Date.now()+12000;
      while(Date.now()<end){if(current.exitCode!==null)throw Error('Torrent engine stopped: '+lastError);try{await api('/stats','GET',undefined,1000);return;}catch{}await new Promise(r=>setTimeout(r,150));}
      current.kill();throw Error('Torrent engine startup timed out.');
    })();try{await starting;}finally{starting=null;}
  }
  app.whenReady().then(()=>protocol.handle('whisper-media',async request=>{
    try{
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      const url=new URL(request.url),entry=streams.get(url.hostname);
      if(!entry||url.pathname!=='/video'||!proc)return new Response('Expired media stream',{status:404});
      const headers={Authorization:auth};const range=request.headers.get('range');if(range)headers.Range=range;
      const response=await fetchImpl(base+entry.route,{headers,signal:request.signal,redirect:'error'});
      const output=new Headers();for(const name of ['content-type','content-length','content-range','accept-ranges']){const value=response.headers.get(name);if(value)output.set(name,value);}
      output.set('Cache-Control','no-store');
      if(request.method==='HEAD')await response.body?.cancel();
      return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers:output});
    }catch{return new Response('Torrent stream unavailable',{status:503});}
  }));
  const handler=async(event,input={})=>{
    if(!authorized(event))return {ok:false,error:'Unauthorized request.'};
    try{
      if(indexError&&input.action!=='install')throw Error(indexError);
      if(input.action==='status')return {ok:true,installed:fs.existsSync(executable()),running:!!proc,version:ENGINE.version,root:root(),jobs:[...jobs.values()]};
      if(input.action==='install'){
        if(process.platform!=='win32')throw Error('Automatic torrent engine installation currently targets Windows.');
        const response=await fetchImpl(ENGINE.url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('Torrent engine download failed.');
        if(Number(response.headers.get('content-length'))>30_000_000)throw Error('Torrent engine download too large.');
        const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>30_000_000)throw Error('Torrent engine download too large.');chunks.push(chunk);}const bytes=Buffer.concat(chunks);
        if(createHash('sha256').update(bytes).digest('hex')!==ENGINE.sha256)throw Error('Torrent engine checksum mismatch.');
        atomicWriteFileSync(executable(),bytes,{encoding:undefined});return {ok:true,version:ENGINE.version};
      }
      await start();
      if(input.action==='preview'){
        let source=String(input.magnet||'').trim(),bytes;
        if(input.file){const selected=await dialog.showOpenDialog(owner(),{properties:['openFile'],filters:[{name:'Torrent',extensions:['torrent']}]});if(selected.canceled)return {ok:true,canceled:true};const file=selected.filePaths[0];if(fs.statSync(file).size>5_000_000)throw Error('Torrent metadata exceeds 5 MB.');bytes=fs.readFileSync(file);}
        else {if(source.length>16000||!/^magnet:\?/i.test(source)||!new URL(source).searchParams.get('xt')?.match(/^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i))throw Error('Use a valid BitTorrent magnet link.');bytes=Buffer.from(source);}
        const result=await api('/torrents?list_only=true','POST',bytes,90000),details=result.details||result;
        const files=(details.files||[]).map(safeFile);if(files.length>10000||!files.some(r=>r.video))throw Error('No supported video files in this torrent.');
        const hash=String(result.info_hash||details.info_hash||'');if(!/^[a-f0-9]{40}$/i.test(hash))throw Error('Torrent identity is missing.');
        const token=randomUUID();previews.set(token,{bytes,hash,files,at:Date.now()});while(previews.size>8)previews.delete(previews.keys().next().value);
        return {ok:true,token,hash,files,name:details.name||files.find(r=>r.video).name};
      }
      if(input.action==='play'){
        const plan=previews.get(input.token);if(!plan||Date.now()-plan.at>600000)throw Error('Torrent preview expired.');
        const file=plan.files.find(r=>r.index===Number(input.index)&&r.video);if(!file)throw Error('Choose a video file first.');
        const params=new URLSearchParams({only_files:String(file.index),overwrite:'true',sub_folder:plan.hash});
        const added=await api('/torrents?'+params,'POST',plan.bytes,90000);const torrentId=added.id ?? plan.hash;
        const selections=jobs.get(plan.hash)?.selections || [];if(!selections.some(row=>row.index===file.index))selections.push({index:file.index,name:file.name,size:file.size});
        await api(`/torrents/${torrentId}/update_only_files`,'POST',JSON.stringify({only_files:selections.map(row=>row.index)}));
        const token=randomBytes(24).toString('hex');rememberStream(token,{hash:plan.hash,route:`/torrents/${torrentId}/stream/${file.index}`});
        jobs.set(plan.hash,{hash:plan.hash,torrentId,name:file.name,index:file.index,size:file.size,selections,at:Date.now(),paused:false});persist();
        return {ok:true,url:`whisper-media://${token}/video`,hash:plan.hash,index:file.index,title:file.name.split('/').at(-1),key:`torrent:${plan.hash}:${file.index}`};
      }
      const job=jobs.get(input.hash);if(!job)throw Error('Torrent is not in this library.');
      if(input.action==='stats'){const stats=await api(`/torrents/${job.hash}/stats/v1`);return {ok:true,stats,job};}
      if(input.action==='local'){const selected=(job.selections||[job]).find(row=>row.index===Number(input.index??job.index));if(!selected)throw Error('Torrent file selection is missing.');const stats=await api(`/torrents/${job.hash}/stats/v1`),done=Number(stats.file_progress?.[selected.index]);if(!Number.isFinite(done)||done<selected.size)throw Error('This file is still downloading.');const file=fs.realpathSync(path.join(root(),job.hash,selected.name));const rel=path.relative(fs.realpathSync(root()),file);if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.statSync(file).isFile()||fs.statSync(file).size!==selected.size)throw Error('Completed torrent file could not be verified.');grantMedia(file);return {ok:true,path:file};}
      if(input.action==='pause'||input.action==='resume'){await api(`/torrents/${job.hash}/${input.action==='pause'?'pause':'start'}`,'POST');job.paused=input.action==='pause';persist();return {ok:true};}
      if(input.action==='limits'){const download=Number(input.download),upload=Number(input.upload);if(![download,upload].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000))throw Error('Invalid transfer rate.');return {ok:true,result:await api('/torrents/limits','POST',JSON.stringify({download_bps:download||null,upload_bps:upload||null}))};}
      if(input.action==='forget'){await api(`/torrents/${job.hash}/forget`,'POST');jobs.delete(job.hash);for(const [id,stream]of streams)if(stream.hash===job.hash)streams.delete(id);persist();return {ok:true};}
      if(input.action==='reopen'){const selected=(job.selections||[job]).find(row=>row.index===Number(input.index??job.index));if(!selected)throw Error('Torrent file was not previously selected.');if(job.paused){await api(`/torrents/${job.hash}/start`,'POST');job.paused=false;persist();}const token=randomBytes(24).toString('hex');rememberStream(token,{hash:job.hash,route:`/torrents/${job.hash}/stream/${selected.index}`});return {ok:true,url:`whisper-media://${token}/video`,hash:job.hash,index:selected.index,title:selected.name.split('/').at(-1),key:`torrent:${job.hash}:${selected.index}`};}
      throw Error('Unsupported torrent operation.');
    }catch(error){return {ok:false,error:error.message};}
  };
  ipcMain.handle('media-torrents:request',handler);
  app.on('before-quit',()=>{proc?.kill();});
  return {handler,close:()=>{proc?.kill();},engine:ENGINE,nativeSource:url=>{const entry=streams.get(new URL(url).hostname);if(!entry||!base)throw Error('Expired torrent stream.');return {url:base+entry.route,headers:['Authorization: '+auth]};}};
}
module.exports={registerMediaTorrents,safeFile,ENGINE};
