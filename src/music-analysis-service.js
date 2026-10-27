'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { randomUUID, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { run } = require('./browser-media-tools');
const { MediaFileAccess } = require('./local-file-access');
const { atomicWriteFileSync } = require('./fsync-utils');
const EXTENSIONS = ['mp3','wav','m4a','aac','flac','ogg','opus','wma'];
function selection(request, duration) {
  const start = request.start === undefined ? 0 : Number(request.start);
  const end = request.end === undefined || request.end === null ? duration : Number(request.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + .05 || end - start < 1 || end - start > 1800)
    throw Error('Select 1 second to 30 minutes within the track / Parça içinde 1 saniye–30 dakika seç.');
  return { start, end: Math.min(end, duration) };
}
async function digest(file, signal) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { signal })) hash.update(chunk);
  return hash.digest('hex');
}
function createService(options) {
  const access = new MediaFileAccess(EXTENSIONS), sources = new Map();
  let active = null, last = null;
  const runner = options.run || run;
  function remember(file, metadata={}) {
    const target = access.grant(file); if (!target) throw Error('Unsupported audio file / Desteklenmeyen ses dosyası.');
    const id = randomUUID(), source = { id, file: target, title: String(metadata.title||path.basename(target, path.extname(target))).slice(0,300), libraryId:metadata.id,artist:metadata.artist||'' };
    sources.set(id, source); while (sources.size > 32) sources.delete(sources.keys().next().value);
    return { id, title: source.title, artist:source.artist,url: pathToFileURL(target).href };
  }
  function status() { return active ? { id: active.id, state: 'running', stage: active.stage,mode:active.mode,completed:active.completed,total:active.total,title:active.title } : last || { state: 'idle' }; }
  function cancel() { active?.controller.abort(); return { ok: true }; }
  async function start(request) {
    if (active) throw Error('An analysis is running / Bir analiz çalışıyor.');
    const mode=request.mode||'analyze';if(!['analyze','search','prepare','online','tags','prepare-tags'].includes(mode))throw Error('Unknown music mode');
    const source = sources.get(request.sourceId); if (!source&&!['prepare','prepare-tags'].includes(mode)) throw Error('Select the audio again / Sesi yeniden seç.');
    if(request.references!==undefined&&(!['search','online'].includes(mode)||!Array.isArray(request.references)||!request.references.length||request.references.length>3))throw Error('Select 1–3 references / 1–3 referans seç.');
    const references=request.references?.map(r=>{const saved=sources.get(r.id);if(!saved)throw Error('Reference expired; select it again / Referans eskidi; yeniden seç.');const range=r.range;if(range!==null&&(!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]<0||range[1]-range[0]<1||range[1]-range[0]>1800))throw Error('Invalid reference range');return {...saved,range};});
    if(references&&new Set(references.map(r=>JSON.stringify([r.file,r.range]))).size!==references.length)throw Error('Duplicate reference / Aynı referans tekrarlandı.');
    const onlineRows=mode==='online'?options.online().snapshot(request.trackIds):null;
    const controller = new AbortController(), job = { id: randomUUID(), controller, stage: mode==='analyze'?'probe':mode==='prepare'?'download':'model',mode }; active = job;
    let temp;
    const pending = (async () => {
      try {
        if(mode!=='analyze'){
          const onProgress=p=>{job.stage=p.stage;job.completed=p.completed;job.total=p.total;job.title=String(p.title||'').slice(0,150);};
          let candidates;
          if(onlineRows){
            if(!require('./music-similarity').modelStatus(options.modelDir()).ready)throw Error('Prepare CLAP first / Önce CLAP hazırla.');
            temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),'whisper-previews-'));
            candidates={...await options.online().samples(onlineRows,temp,controller.signal,onProgress),cacheDir:path.join(temp,'vectors'),requested:onlineRows.length};
          }
          const result=await require('./music-similarity').execute(options,{mode,source,request,signal:controller.signal,runner,onProgress,candidates,references});
          if(controller.signal.aborted)throw Error('Cancelled');
          last={id:job.id,state:'completed',mode,result:{...result,sourceId:source?.id}};return;
        }
        const file = access.authorize(source.file), before = await fs.promises.stat(file);
        if (before.size > 1024 * 1024 * 1024) throw Error('Audio exceeds 1 GB / Ses dosyası 1 GB sınırını aşıyor.');
        const metadata = JSON.parse(await runner(options.ffprobe(), ['-v','error','-show_entries','format=duration','-of','json',file], null, controller.signal, 30000));
        const duration = Number(metadata.format?.duration);
        const range = selection(request, duration);
        job.stage = 'fingerprint';
        const contentHash = await digest(file, controller.signal);
        const key = createHash('sha256').update(JSON.stringify(['music-dsp-1',contentHash,range])).digest('hex');
        const cacheDir = path.join(options.userData(), 'music-analysis');
        const cachedFile = path.join(cacheDir, key + '.json');
        let result, cached = false;
        if (fs.existsSync(cachedFile) && fs.statSync(cachedFile).size < 2_000_000) {
          try { result = JSON.parse(await fs.promises.readFile(cachedFile, 'utf8')); cached = result.version === 'music-dsp-1' && Array.isArray(result.points) && Array.isArray(result.waveform); if (!cached) result = null; } catch { result = null; }
        }
        if (!result) {
          job.stage = 'decode';
          temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'whisper-music-'));
          const wav = path.join(temp, 'analysis.wav');
          await runner(options.ffmpeg(), ['-v','error','-nostdin','-ss',String(range.start),'-i',file,'-t',String(range.end-range.start),'-map','0:a:0','-vn','-ac','1','-ar','11025','-c:a','pcm_s16le',wav], null, controller.signal, 180000, null, { waitForCloseOnCancel: true });
          job.stage = 'measure';
          result = JSON.parse(await runner(options.python(), [path.join(__dirname,'../backend/music_analysis.py'),'--input',wav], null, controller.signal, 180000, null, { waitForCloseOnCancel: true }));
        }
        const after = await fs.promises.stat(file);
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw Error('Audio changed; analyze again / Ses değişti; yeniden analiz et.');
        if (controller.signal.aborted) throw Error('Cancelled');
        if (!cached) {
          await fs.promises.mkdir(cacheDir,{recursive:true}); atomicWriteFileSync(cachedFile,JSON.stringify(result));
          // Only this service's content-addressed JSON cache is eligible for eviction.
          const entries = (await fs.promises.readdir(cacheDir)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name));
          const dated = await Promise.all(entries.map(async name=>({name,time:(await fs.promises.stat(path.join(cacheDir,name))).mtimeMs})));
          for (const item of dated.sort((a,b)=>b.time-a.time).slice(24)) await fs.promises.unlink(path.join(cacheDir,item.name));
        }
        last = { id:job.id,state:'completed',result:{...result,range,sourceId:source.id,title:source.title,sourceDuration:duration,cached} };
      } catch (error) {
        last = { id:job.id,state:controller.signal.aborted?'cancelled':'failed', error: controller.signal.aborted ? 'Cancelled / İptal edildi.' : error.message };
      } finally {
        if (temp) {try {await fs.promises.rm(temp,{recursive:true,force:true});} catch {if(last?.id===job.id)last.cleanupWarning=true;}}
        if (active === job) active = null;
      }
    })();
    job.pending = pending;
    return { ok:true,id:job.id };
  }
  return {remember,status,cancel,start,close:async()=>{cancel();await active?.pending;}};
}
function register(options) {
  const services = new Map(), onlineServices = new Map();
  const preferences=require('./music-preferences').store(options.userData);
  const listening=require('./music-listening').store(options.userData);
  options.ipcMain.handle('music-analysis:request', async(event,request={})=>{
    if (!options.authorized(event)) return {ok:false,error:'Unauthorized'};
    let service = services.get(event.sender.id);
    if (!service) {
      service = createService({...options,preferences,online:()=>onlineServices.get(event.sender.id)}); services.set(event.sender.id,service);
      event.sender.once('destroyed',()=>{service.cancel();services.delete(event.sender.id);});
    }
    let online=onlineServices.get(event.sender.id);
    if(!online){online=require('./music-online').createOnline(options);onlineServices.set(event.sender.id,online);event.sender.once('destroyed',()=>{online.cancel();onlineServices.delete(event.sender.id);});}
    try {
      if(request.action==='listening-history')return {ok:true,trials:listening.read()};
      if(request.action==='listening-save')return {ok:true,trial:listening.save(service.status(),request)};
      if(request.action==='preferences')return {ok:true,hidden:preferences.read()};
      if(request.action==='feedback'){
        let title;
        if(request.hidden===false){const saved=preferences.read().find(r=>r.provider===request.provider&&r.id===request.id);if(!saved)throw Error('Unknown hidden track');title=saved.title;}
        else if(request.provider==='deezer')title=online.snapshot([request.id])[0].title;
        else if(request.provider==='local'){const row=require('./music-similarity').loadTracks(options.userData()).find(r=>r.id===request.id);if(!row)throw Error('Unknown library track');title=row.title;}
        else throw Error('Unknown music provider');
        return {ok:true,hidden:preferences.set(request.provider,request.id,title,request.hidden)};
      }
      if(request.action==='online')return await online.handle(request);
      if (request.action === 'select') {
        const chosen = await options.dialog.showOpenDialog(options.owner(),{properties:['openFile'],filters:[{name:'Audio',extensions:EXTENSIONS}]});
        if (chosen.canceled || !chosen.filePaths?.[0]) return {ok:true,canceled:true};
        options.grantMedia(chosen.filePaths[0]);
        return {ok:true,source:service.remember(chosen.filePaths[0])};
      }
      if (request.action === 'library') {
        const file = path.join(options.userData(),'media-shelf.json');
        if (fs.statSync(file).size > 16_000_000) throw Error('Library too large');
        const row = JSON.parse(await fs.promises.readFile(file,'utf8')).music?.find(row=>row.id===request.id);
        if (!row) throw Error('Track missing / Parça bulunamadı.');
        options.grantMedia(row.path);
        return {ok:true,source:service.remember(row.path,row)};
      }
      if (request.action === 'model') {const engine=require('./music-similarity');return {ok:true,...engine.modelStatus(options.modelDir()),...await engine.runtimeStatus(options,options.run||run)};}
      if (request.action === 'start') return await service.start(request);
      if (request.action === 'status') return {ok:true,job:service.status()};
      if (request.action === 'cancel') {online.cancel();return service.cancel();}
      throw Error('Unknown music action');
    } catch(error) {return {ok:false,error:error.message};}
  });
  options.app.on('before-quit',()=>{for(const service of services.values())service.cancel();for(const online of onlineServices.values())online.cancel();});
}
module.exports = {selection,createService,register};
