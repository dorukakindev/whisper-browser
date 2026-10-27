'use strict';
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {MediaFileAccess}=require('./local-file-access');
const MODEL='laion/clap-htsat-unfused',REVISION='8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a';
let working=false;
function modelStatus(directory){
  try{const manifest=JSON.parse(fs.readFileSync(path.join(directory,'READY.json'),'utf8'));return {ready:manifest.model===MODEL&&manifest.revision===REVISION&&fs.statSync(path.join(directory,'pytorch_model.bin')).size===614525833,model:MODEL,revision:REVISION,bytes:614525833};}
  catch{return {ready:false,model:MODEL,revision:REVISION,bytes:614525833};}
}
function loadTracks(userData){
  const file=path.join(userData,'media-shelf.json');
  if(!fs.existsSync(file))return [];
  if(fs.statSync(file).size>16_000_000)throw Error('Library too large / Kitaplık çok büyük.');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(data.music)||data.music.length>5000)throw Error('Invalid music library / Müzik kitaplığı geçersiz.');
  return data.music;
}
async function runtimeStatus(options,runner){
  try{
    const value=JSON.parse(await runner((options.musicPython||options.python)(),['-c',"import importlib.metadata as m,json; print(json.dumps({p:m.version(p) for p in ['torch','transformers','numpy']}))"],null,null,15000));
    const [major,minor]=value.torch.split(/[.+]/).map(Number),[tm,tn]=value.transformers.split('.').map(Number);
    return {runtimeReady:(major>2||(major===2&&minor>=6))&&tm===4&&tn>=57,versions:value};
  }catch{return {runtimeReady:false};}
}
async function execute(options,{mode,source,request,signal,onProgress,runner,candidates,references}){
  if(working)throw Error('Music indexing is already running / Müzik indeksleme zaten çalışıyor.');
  working=true;
  try{
    const args=[path.join(__dirname,'../backend/music_similarity.py'),'--model-dir',options.modelDir()];
    const progress=line=>{try{const p=JSON.parse(line);if(['download','model','index','rank','tags'].includes(p.stage))onProgress(p);}catch{}};
    const python=(options.musicPython||options.python)();
    if(mode==='prepare')return JSON.parse(await runner(python,[...args,'--prepare'],null,signal,1800000,progress,{waitForCloseOnCancel:true}));
    if(!modelStatus(options.modelDir()).ready)throw Error('Prepare the CLAP model first / Önce CLAP modelini hazırla.');
    const access=new MediaFileAccess(['mp3','wav','m4a','aac','flac','ogg','opus','wma']);
    if(['tags','prepare-tags'].includes(mode)){
      const script=[path.join(__dirname,'../backend/music_tags.py'),'--model-dir',options.modelDir()];
      if(mode==='prepare-tags')return JSON.parse(await runner(python,[...script,'--prepare'],null,signal,180000,progress,{waitForCloseOnCancel:true}));
      const payload={reference:{id:'reference',path:access.inspect(source.file)},range:request.range||null,ffmpeg:options.ffmpeg(),ffprobe:options.ffprobe(),cacheDir:path.join(options.userData(),'music-vectors')};
      return JSON.parse(await runner(python,script,JSON.stringify(payload),signal,600000,progress,{waitForCloseOnCancel:true}));
    }
    const hidden=new Set((options.preferences?.read()||[]).filter(r=>r.provider===(candidates?'deezer':'local')).map(r=>r.id));
    const tracks=(candidates?.tracks||loadTracks(options.userData())).filter(r=>!hidden.has(r.id));
    if(!tracks.length)throw Error('No available tracks. Add music or restore hidden tracks / Kullanılabilir parça yok. Müzik ekle veya gizlenen parçaları geri al.');
    const valid=[],skipped=[];
    for(const row of tracks){try{valid.push({id:row.id,path:access.inspect(row.path),title:String(row.title||'').slice(0,300),artist:String(row.artist||'').slice(0,200)});}catch{skipped.push(row.id);}}
    const refs=(references||[{...source,range:request.range||null}]).map((r,i)=>({id:'reference:'+r.id+':'+i,path:access.inspect(r.file),artist:r.artist||'',title:r.title||'',range:r.range}));
    if(request.intent!==undefined&&(typeof request.intent!=='string'||request.intent.length>300))throw Error('Use an English sound description up to 300 characters / En fazla 300 karakter İngilizce ses tarifi kullan.');
    if(request.intentWeight!==undefined&&(!Number.isFinite(request.intentWeight)||request.intentWeight<0||request.intentWeight>.6))throw Error('Invalid intent weight');
    const payload={intent:request.intent||'',intentWeight:request.intentWeight??.35,diverse:request.diverse===true,reference:refs[0],references:refs,tracks:valid,range:refs[0].range,excludeArtist:request.excludeArtist===true,
      ffmpeg:options.ffmpeg(),ffprobe:options.ffprobe(),cacheDir:candidates?.cacheDir||path.join(options.userData(),'music-vectors'),preview:!!candidates};
    if(payload.range&&(!Array.isArray(payload.range)||payload.range.length!==2||!payload.range.every(Number.isFinite)||payload.range[0]<0||payload.range[1]-payload.range[0]<1||payload.range[1]-payload.range[0]>1800))throw Error('Invalid music range / Müzik aralığı geçersiz.');
    const result=JSON.parse(await runner(python,args,JSON.stringify(payload),signal,12*60*60*1000,progress,{waitForCloseOnCancel:true}));
    const rows=new Map(valid.map(row=>[row.id,row]));
    result.results=(result.results||[]).slice(0,20).flatMap(hit=>{
      const row=rows.get(hit.id);
      if(!row||!Number.isFinite(hit.score)||hit.score < -1||hit.score>1)return [];
      const matchedRef=refs.find(r=>r.id===hit.referenceId)||refs[0];
      const binding={referenceTitle:matchedRef.title,referenceUrl:pathToFileURL(matchedRef.path).href,referenceScores:(hit.referenceScores||[]).map(s=>({title:refs.find(r=>r.id===s.id)?.title||'',range:refs.find(r=>r.id===s.id)?.range,score:s.score}))};
      if(candidates){const metadata=candidates.tracks.find(r=>r.id===row.id);return [{...hit,...binding,title:row.title,artist:row.artist,url:metadata.url,art:metadata.art,evidence:'preview-clap',provider:'Deezer'}];}
      try{const file=access.inspect(row.path);options.grantMedia(file);return [{...hit,...binding,title:row.title,artist:row.artist,url:pathToFileURL(file).href}];}catch{return [];}
    });
    result.failed=(Number(result.failed)||0)+skipped.length+(candidates?.failures.length||0);
    if(candidates){result.evidence='preview-clap';result.requested=candidates.requested;result.previewFailures=candidates.failures;}
    return result;
  }finally{working=false;}
}
module.exports={modelStatus,runtimeStatus,loadTracks,execute,MODEL,REVISION};
