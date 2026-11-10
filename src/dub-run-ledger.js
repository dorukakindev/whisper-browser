'use strict';
// Persistent production run records. This is NOT a second job store: the existing per-run summary
// (`userData/dub-logs/<id>-<ts>.json`) stays the one record. This module adds what it lacked:
//  * options pinned when the run starts (source identity, track digest, range, profile, dictionary…),
//  * a per-app-instance lease so a restart can tell "still running elsewhere" from "interrupted" without
//    deciding from a PID or a record age alone,
//  * first-terminal-wins settlement, so a late or repeated event never rewrites a finished run,
//  * read-only classification (listing never writes), explicit recovery and an approved, single-use retry.
// Nothing here stores keys, session data, headers or absolute paths; outputs are resolved by run id.
const fs=require('node:fs'),path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {atomicWriteFileSync}=require('./fsync-utils');
const {inspectVoiceOutput,voiceOutputIdentity,matchesVoiceOutput,voiceOutputIdentityAsync,matchesVoiceOutputAsync}=require('./voice-output');

const ID=/^[a-zA-Z0-9-]{1,80}$/;
const ENUMS={profile:['fast','quality'],verification:['fast','balanced','detailed'],timingMode:['clip','video'],grouping:['akici','anlatim','cumle','satir'],
 expression:['reference','calm','warm','lively'],deliveryStrength:['gentle','balanced','strong'],resultMode:['natural','custom']};
const FLAGS=['followDelivery','autoFit','naturalSpeech','forceAll','narration','sample','deliveryAutomatic','positionSample'];
const MAX_RUNS=60,MAX_TAIL=64*1024,TOKEN_TTL=10*60*1000;
const locators=require('./dub-source-locator');
const sha=value=>createHash('sha256').update(value).digest('hex');
const text=(en,tr)=>en+' / '+tr;
const REASONS={
 'legacy-record':text('This record was written before options were pinned; it cannot be retried exactly.','Bu kayıt seçenekler sabitlenmeden önce yazıldı; birebir yeniden denenemez.'),
 'source-missing':text('The saved input of this run is gone, so it cannot be verified.','Bu işin kayıtlı girdisi yok; doğrulanamıyor.'),
 'source-changed':text('The saved input of this run no longer matches what was pinned.','Bu işin kayıtlı girdisi sabitlenenle artık uyuşmuyor.'),
 'voice-missing':text('The saved voice reference is missing or unreadable, so no generation can use it.','Kayıtlı ses referansı yok veya okunamıyor; hiçbir üretim onu kullanamaz.'),
 'voice-changed':text('The voice reference changed since this run; the pinned voice cannot be restored automatically.','Ses referansı bu işten sonra değişti; sabitlenen ses otomatik geri getirilemez.'),
 'chapter-run':text('Book chapter runs are retried from the chapter, not from here.','Kitap bölümü işleri buradan değil, bölümden yeniden denenir.'),
 'output-changed':text('The audio file changed or disappeared after the list was loaded.','Ses dosyası liste yüklendikten sonra değişti veya kayboldu.'),
 'selection-unrecoverable':text('This run used a selection that cannot be restored exactly.','Bu iş, birebir geri getirilemeyen bir seçim kullandı.'),
 'not-retryable':text('This run cannot be retried: it completed cleanly, it is still active, or its state is uncertain.','Bu iş yeniden denenemez: temiz tamamlandı, hâlâ etkin veya durumu belirsiz.'),
 'preview-outdated':text('The settings changed after this preview; preview the retry again. Nothing was started.','Ayarlar bu önizlemeden sonra değişti; yeniden denemeyi yeniden önizle. Hiçbir şey başlatılmadı.'),
 'expired':text('This retry approval expired or was already used; preview it again.','Bu yeniden deneme onayı süresi doldu veya kullanıldı; yeniden önizle.'),
 'unknown-run':text('This run record was not found.','Bu iş kaydı bulunamadı.'),
 'busy':text('Another production is running; wait for it to finish.','Başka bir üretim çalışıyor; bitmesini bekle.')
};
const NEXT={
 'source-missing':text('Open the source and start a new generation.','Kaynağı aç ve yeni bir üretim başlat.'),
 'source-changed':text('Start a new generation from the current source; the earlier result stays available.','Güncel kaynaktan yeni üretim başlat; önceki sonuç korunur.'),
 'busy':text('Wait for the running production to finish, then preview again.','Çalışan üretimin bitmesini bekle, sonra yeniden önizle.'),
 'voice-missing':text('Choose or restore a voice reference, then preview again.','Bir ses referansı seç veya geri getir, sonra yeniden önizle.'),
 'output-changed':text('Reload the list; if the file is gone, start a new generation.','Listeyi yenile; dosya yoksa yeni üretim başlat.'),
 'voice-changed':text('Retry with the current voice (preview it separately) or restore the original reference.','Güncel sesle yeniden dene (ayrıca önizlenir) veya özgün referansı geri getir.'),
 'legacy-record':text('Start a new generation; this old record stays as history.','Yeni üretim başlat; bu eski kayıt geçmiş olarak kalır.'),
 'chapter-run':text('Open the book chapter and regenerate it there.','Kitap bölümünü aç ve orada yeniden üret.'),
 'selection-unrecoverable':text('Start a new generation and choose the recordings again.','Yeni üretim başlat ve kayıtları yeniden seç.')
};

// ---- pinned options: bounded, validated, no paths ------------------------------------------------------------
function pinOptions(raw={}){
 const out={};
 for(const [key,list] of Object.entries(ENUMS))if(list.includes(raw[key]))out[key]=raw[key];
 for(const key of FLAGS)if(typeof raw[key]==='boolean')out[key]=raw[key];
 if([4,8].includes(raw.concurrency))out.concurrency=raw.concurrency;
 if(raw.range&&Number.isFinite(raw.range.start)&&Number.isFinite(raw.range.end)&&raw.range.start>=0&&raw.range.end>raw.range.start)out.range={start:raw.range.start,end:raw.range.end};
 if(typeof raw.sourceDuration==='number'&&raw.sourceDuration>0&&raw.sourceDuration<=86400)out.sourceDuration=raw.sourceDuration;
 if(typeof raw.sourceIdentity==='string'&&raw.sourceIdentity.length<=200)out.sourceIdentity=raw.sourceIdentity;
 // A versioned locator is kept only if it validates; an unusable one is dropped here, never repaired or guessed.
 if(raw.sourceLocator){const found=locators.clean(raw.sourceLocator);if(found.state==='ok')out.sourceLocator=found.locator;}
 if(/^[a-f0-9]{64}$/.test(raw.subtitleHash||''))out.subtitleHash=raw.subtitleHash;
 if(/^[a-f0-9]{64}$/.test(raw.dubTextHash||''))out.dubTextHash=raw.dubTextHash;
 if(typeof raw.referenceFingerprint==='string'&&raw.referenceFingerprint.length<=200)out.referenceFingerprint=sha(raw.referenceFingerprint);
 if(typeof raw.referenceName==='string')out.referenceName=raw.referenceName.slice(0,120);
 if(Array.isArray(raw.pronunciations))out.pronunciations=raw.pronunciations.slice(0,200).filter(row=>row&&typeof row.from==='string'&&typeof row.to==='string').map(row=>({from:row.from.slice(0,120),to:row.to.slice(0,120)}));
 if(Array.isArray(raw.forceGroups)){
  const keys=raw.forceGroups.filter(key=>typeof key==='string'&&/^\d+(?:,\d+)*$/.test(key)&&key.length<=200);
  out.forceGroupCount=raw.forceGroups.length;if(keys.length===raw.forceGroups.length&&keys.length<=500)out.forceGroups=keys;
 }
 if(Number.isSafeInteger(raw.groupTakesCount)&&raw.groupTakesCount>=0)out.groupTakesCount=raw.groupTakesCount;
 if(typeof raw.speechSourceStatus==='string')out.speechSourceStatus=raw.speechSourceStatus.slice(0,40);
 out.digest=sha(JSON.stringify(Object.keys(out).sort().map(key=>[key,out[key]])));
 return out;
}
// What the renderer may see: no hashes of the voice, no dictionary content, no identities.
const safeView=pinned=>pinned?Object.fromEntries(['profile','verification','timingMode','grouping','expression','deliveryStrength','resultMode','concurrency','autoFit','naturalSpeech','followDelivery','range']
 .filter(key=>pinned[key]!==undefined).map(key=>[key,pinned[key]])):null;
const COMPARE=['profile','verification','timingMode','grouping','expression','deliveryStrength','resultMode','concurrency','autoFit','naturalSpeech','followDelivery'];

function defaultPidAlive(pid){
 if(!Number.isSafeInteger(pid)||pid<=0)return false;
 try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}
}
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const writeJson=(file,value)=>atomicWriteFileSync(file,JSON.stringify(value,null,2),{encoding:'utf8'});

function createRunLedger({logsDir,outputDir,inputDir,instanceId=randomBytes(12).toString('hex'),now=Date.now,pidAlive=defaultPidAlive,heartbeatMs=5000,pid=process.pid}){
 const leaseDir=()=>path.join(logsDir,'instances'),leaseFile=id=>path.join(leaseDir(),id+'.json');
 const staleAfter=Math.max(15000,heartbeatMs*3);
 const tokens=new Map();let active=null;
 const safeId=value=>typeof value==='string'&&ID.test(value);

 // ---- writing: only the start of a run, its heartbeat, its single terminal settlement ----
 function writeLease(runId){writeJson(leaseFile(instanceId),{instanceId,pid,startedAt:new Date(now()-process.uptime()*1000).toISOString(),heartbeatAt:now(),activeRunId:runId});}
 function pruneLeases(){
  try{for(const name of fs.readdirSync(leaseDir())){
   if(!name.endsWith('.json')||name===instanceId+'.json')continue;
   try{const lease=readJson(path.join(leaseDir(),name));if(now()-Number(lease.heartbeatAt)>7*86400000&&!pidAlive(lease.pid))fs.rmSync(path.join(leaseDir(),name),{force:true});}catch(_){}
  }}catch(_){}
 }
 function begin({summaryPath,id,startedAt,sample=false,pinned,retryOf=null,attempt=1,label=''}){
  if(!safeId(id))throw Error('Invalid run id.');
  writeJson(summaryPath,{version:2,id,startedAt,result:'running',sample:sample===true,instanceId,pid,label:String(label||'').replace(/[\u0000-\u001f]/g,'').slice(0,120),pinned:pinOptions(pinned||{}),retryOf:safeId(retryOf)?retryOf:null,attempt:Number.isSafeInteger(attempt)&&attempt>0?attempt:1});
  active=id;writeLease(id);pruneLeases();
 }
 function heartbeat(id){if(active!==id)return false;try{writeLease(id);return true;}catch(_){return false;}}
 function end(id){if(active===id)active=null;try{fs.rmSync(leaseFile(instanceId),{force:true});}catch(_){}}
 // First terminal wins: a late or repeated event can never turn a finished run into another result.
 function settle(summaryPath,summary){
  let current=null;try{current=readJson(summaryPath);}catch(_){}
  if(current&&current.result&&current.result!=='running')return {ok:true,ignored:true};
  const keep=current?Object.fromEntries(['version','instanceId','pid','pinned','retryOf','attempt','workerCompleted','label'].filter(key=>current[key]!==undefined).map(key=>[key,current[key]])):{};
  writeJson(summaryPath,{...keep,...summary});return {ok:true};
 }
 function mark(summaryPath,patch){
  try{const current=readJson(summaryPath);if(current.result!=='running')return false;writeJson(summaryPath,{...current,...patch});return true;}catch(_){return false;}
 }

 // ---- reading: classification never writes ----
 function outputInfo(id,expected=null){
  const file=path.join(outputDir,id+'.wav');
  try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())return {state:'invalid',file};const info=inspectVoiceOutput(file);
    if(info&&expected&&(expected.version!==1||!/^[a-f0-9]{64}$/.test(expected.sha256||'')||((stat.size!==expected.size||stat.mtimeMs!==expected.mtimeMs)&&!matchesVoiceOutput(file,expected))))return {state:'changed',file,size:stat.size};
    return info?{state:'valid',file,seconds:Math.round(info.seconds*10)/10,size:stat.size}:{state:'invalid',file,size:stat.size};}
  catch(_){return {state:'missing',file};}
 }
 function liveness(summary,activeRunId){
  if(!summary.instanceId)return {state:'uncertain',reason:'legacy-record'};
  if(summary.instanceId===instanceId)return activeRunId===summary.id||active===summary.id?{state:'running'}:{state:'uncertain',reason:'unsettled-in-this-session'};
  let lease=null;try{lease=readJson(leaseFile(summary.instanceId));}catch(_){}
  if(!lease)return {state:'uncertain',reason:'instance-unknown'};
  const alive=pidAlive(lease.pid),fresh=now()-Number(lease.heartbeatAt)<=staleAfter;
  if(!alive)return {state:'interrupted',reason:'instance-gone'};
  if(fresh&&lease.activeRunId===summary.id)return {state:'running-elsewhere'};
  // The process id answers, but the heartbeat stopped or points elsewhere: the id may be reused, or the machine slept.
  return {state:'uncertain',reason:'heartbeat-stale'};
 }
 function describe(summary,file,activeRunId){
  const id=summary.id,out=outputInfo(id,summary.outputIdentity),pinned=summary.pinned||null;
  let state,reason=null,recoverable=false;
  const result=summary.result;
  if(result==='done'){
   const failed=Array.isArray(summary.quality?.groups)&&summary.quality.groups.some(row=>row.status==='failed');
   // The worker may report completion and then exit with an error: the audio is accepted, but the run is not a clean completion.
   const exitError=(Number.isFinite(summary.exitCode)&&summary.exitCode!==0)||(typeof summary.exitSignal==='string'&&summary.exitSignal!=='');
   state=out.state!=='valid'?'output-missing':failed||summary.qualityIncomplete===true||exitError?'partial':'completed';
   if(state==='partial'&&exitError)reason='exit-after-complete';
   if(out.state!=='valid')reason=out.state==='changed'?'output-changed':out.state==='invalid'?'invalid-audio':'output-missing';
  }else if(result==='cancelled')state='cancelled';
  else if(result==='error')state='failed';
  else if(result==='running'){const live=liveness(summary,activeRunId);state=live.state;reason=live.reason||null;}
  else{state='uncertain';reason='unknown-result';}
  // A valid, complete-looking output is recoverable only with the worker's own completion evidence (durable marker).
  const evidence=summary.workerCompleted===true||typeof summary.recoverablePath==='string';
  // Only a run that is certainly over may be recovered. A live run with a late heartbeat, another instance's run or a legacy
  // record is never recovered from under its owner: its own settlement (with quality and sync data) must be able to land.
  const over=state==='interrupted'||(state==='uncertain'&&reason==='unsettled-in-this-session')||state==='failed'||state==='cancelled';
  if(over&&out.state==='valid'&&evidence)recoverable=true;
  const retryable=['interrupted','failed','cancelled','output-missing','partial'].includes(state);
  return {id,label:typeof summary.label==='string'?summary.label:'',state,reason:reason?{code:reason}:null,startedAt:summary.startedAt||null,finishedAt:summary.finishedAt||null,
   elapsedSeconds:Number.isFinite(summary.elapsedSeconds)?summary.elapsedSeconds:null,sample:summary.sample===true,attempt:summary.attempt||1,retryOf:summary.retryOf||null,
   recovered:summary.recovered===true,output:{state:out.state,seconds:out.seconds??null,size:out.size??null},unconfirmedOutput:!recoverable&&out.state==='valid'&&['interrupted','uncertain'].includes(state),
   restorable:result==='done'&&out.state==='missing'&&summary.outputIdentity?.version===1&&/^[a-f0-9]{64}$/.test(summary.outputIdentity.sha256||''),
   recoverable,retryable,pinned:safeView(pinned),legacy:!pinned,source:locators.view(pinned?.sourceLocator,typeof pinned?.sourceIdentity==='string'),error:result==='error'?String(summary.error||'').slice(0,300):null};
 }
 function list({activeRunId=null,limit=30}={}){
  const runs=[],unreadable=[],ids=new Set();
  let names=[];try{names=fs.readdirSync(logsDir).filter(name=>name.endsWith('.json'));}catch(_){}
  for(const name of names){
   try{
    const file=path.join(logsDir,name),stat=fs.statSync(file);if(!stat.isFile())continue;
    const summary=readJson(file);if(!summary||typeof summary!=='object'||!safeId(summary.id))throw Error('shape');
    ids.add(summary.id);runs.push({row:describe(summary,file,activeRunId),time:Date.parse(summary.startedAt)||stat.mtimeMs});
   }catch(_){unreadable.push(name.slice(0,120));}
  }
  runs.sort((a,b)=>b.time-a.time);
  const orphans=[];
  try{for(const name of fs.readdirSync(outputDir)){
   const match=/^([a-zA-Z0-9-]{1,80})\.wav$/.exec(name);if(!match||/-(?:background|group-takes)$/.test(match[1])||ids.has(match[1]))continue;
   const info=outputInfo(match[1]);orphans.push({id:match[1],valid:info.state==='valid',size:info.size??null,seconds:info.seconds??null});if(orphans.length>=20)break;
  }}catch(_){}
  return {runs:runs.slice(0,limit>0?Math.min(limit,MAX_RUNS):30).map(item=>item.row),unreadable:unreadable.slice(0,20),orphans,
   // Ownerless files have no source, section or timeline of their own: they are listed, never attached or applied.
   orphanNote:orphans.length?text('These audio files have no run record, so their source, section and timeline are unknown; they are not attached to anything.','Bu ses dosyalarının iş kaydı yok; kaynakları, bölümleri ve zaman eksenleri bilinmiyor; hiçbir şeye bağlanmaz.'):null};
 }
 function find(id){
  if(!safeId(id))return null;
  let names=[];try{names=fs.readdirSync(logsDir).filter(name=>name.endsWith('.json')&&name.startsWith(id+'-'));}catch(_){}
  for(const name of names.sort().reverse()){try{const file=path.join(logsDir,name),summary=readJson(file);if(summary.id===id)return {file,summary};}catch(_){}}
  return null;
 }

 // ---- detail: everything the panel may say about one run, read-only ----
 function detail(id,{activeRunId=null}={}){
  const found=find(id);if(!found)return {ok:false,code:'unknown-run',error:REASONS['unknown-run']};
  const row=describe(found.summary,found.file,activeRunId),s=found.summary,out=outputInfo(id,s.outputIdentity),pinned=s.pinned||null;
  const why=[];
  if(row.recoverable)why.push({code:'completion-evidence',text:text('The worker reported that it finished, and the audio file passes the WAV check ('+(out.seconds??'?')+' s).','İşçi bittiğini bildirdi ve ses dosyası WAV denetimini geçiyor ('+(out.seconds??'?')+' sn).')});
  if(row.unconfirmedOutput)why.push({code:'no-evidence',text:text('An audio file exists, but nothing proves the worker finished writing it; it may be incomplete.','Bir ses dosyası var ama işçinin yazmayı bitirdiğini gösteren kanıt yok; yarım olabilir.')});
  if(out.state==='invalid')why.push({code:'invalid-audio',text:text('The audio file is truncated or not a valid WAV; it is not treated as a result.','Ses dosyası kesik veya geçerli WAV değil; sonuç sayılmaz.')});
  if(out.state==='missing')why.push({code:'output-missing',text:text('The saved WAV is not at its recorded location. The production record is kept.','Kayıtlı WAV beklenen konumda yok. Üretim kaydı korunuyor.')});
  if(out.state==='changed')why.push({code:'output-changed',text:text('The WAV differs from the saved output identity. It cannot be used as this production.','WAV kayıtlı çıktı kimliğinden farklı. Bu üretimin sonucu olarak kullanılamaz.')});
  if(row.reason?.code==='exit-after-complete')why.push({code:'exit-after-complete',text:text('The worker reported completion but then exited with an error code. The audio passes the WAV check and was kept; treat quality as unverified.','İşçi tamamlandığını bildirdi ama sonra hata koduyla kapandı. Ses WAV denetimini geçiyor ve korundu; kaliteyi doğrulanmamış say.')});
  if(row.reason?.code==='heartbeat-stale')why.push({code:'heartbeat',text:text('The app instance that started this run still has a process, but stopped reporting; it may be paused or the process id may belong to something else.','Bu işi başlatan uygulama örneğinin süreci var ama bildirim durdu; duraklatılmış olabilir veya süreç kimliği başka bir şeye ait olabilir.')});
  if(row.reason?.code==='legacy-record')why.push({code:'legacy',text:REASONS['legacy-record']});
  let later=[];try{later=fs.readdirSync(logsDir).filter(name=>name.endsWith('.json')).flatMap(name=>{try{const r=readJson(path.join(logsDir,name));return r.retryOf===id&&safeId(r.id)?[{id:r.id,state:describe(r,name,activeRunId).state,attempt:r.attempt||2}]:[];}catch(_){return [];}});}catch(_){}
  return {ok:true,run:row,why,error:row.error,label:row.label,
   settings:safeView(pinned),dictionary:Array.isArray(pinned?.pronunciations)?pinned.pronunciations.length:0,
   sourceVersion:pinned?.subtitleHash?pinned.subtitleHash.slice(0,8):null,optionsVersion:pinned?.digest?String(pinned.digest).slice(0,8):null,
   bound:!!(pinned?.subtitleHash&&pinned?.range!==undefined||pinned?.subtitleHash),retries:later.slice(0,10),
   newerResult:later.some(item=>['completed','partial'].includes(item.state))};
 }
 // Re-verifies the file at the moment of opening (the list may be older): a changed or deleted file is an explicit, explained error.
 function review(id,{activeRunId=null}={}){
  const found=find(id);if(!found)return {ok:false,code:'unknown-run',error:REASONS['unknown-run']};
  const row=describe(found.summary,found.file,activeRunId),out=outputInfo(id,found.summary.outputIdentity);
  if(found.summary.outputIdentity&&!matchesVoiceOutput(out.file,found.summary.outputIdentity))return {ok:false,code:'output-changed',error:REASONS['output-changed'],next:NEXT['output-changed'],state:out.state};
  if(out.state!=='valid')return {ok:false,code:'output-changed',error:REASONS['output-changed'],next:NEXT['output-changed'],state:out.state};
  if(['running','running-elsewhere'].includes(row.state))return {ok:false,code:'not-retryable',error:text('The run is still active; its audio may still be written.','İş hâlâ etkin; ses hâlâ yazılıyor olabilir.')};
  const s=found.summary,bound=!!(s.pinned?.subtitleHash&&['completed','partial'].includes(row.state));
  return {ok:true,file:out.file,seconds:out.seconds,size:out.size,name:path.basename(out.file),state:row.state,
   // "bound" = a finished record whose source track and range were pinned; everything else is listening-only, never synchronized use.
   use:bound?'bound':'listen-only',recovered:row.recovered};
 }

 // ---- explicit recovery of a finished-but-unrecorded output ----
 function recover(id,{activeRunId=null}={}){
  const found=find(id);if(!found)return {ok:false,code:'unknown-run',error:REASONS['unknown-run']};
  const row=describe(found.summary,found.file,activeRunId);
  if(row.state==='completed'&&row.recovered)return {ok:true,id,replayed:true};
  if(!row.recoverable)return {ok:false,code:'not-recoverable',error:text('No verified complete output with the worker\'s completion evidence exists for this run.','Bu iş için işçinin tamamlanma kanıtıyla doğrulanmış tam çıktı yok.')};
  const out=outputInfo(id);if(out.state!=='valid')return {ok:false,code:'not-recoverable',error:text('The output is missing or incomplete.','Çıktı eksik veya yarım.')};
  let sync=null;try{sync=readJson(out.file.replace(/\.wav$/i,'.sync.json'));}catch(_){}
  const s=found.summary;
  const recovered={...Object.fromEntries(['version','instanceId','pid','pinned','retryOf','attempt','startedAt','sample','label'].filter(key=>s[key]!==undefined).map(key=>[key,s[key]])),
   id,result:'done',recovered:true,finishedAt:new Date(now()).toISOString(),path:out.file,name:path.basename(out.file),sourceIdentity:s.pinned?.sourceIdentity||null,subtitleHash:s.pinned?.subtitleHash||null,
   range:s.pinned?.range||null,settings:s.pinned?safeView(s.pinned):null,sync,qualityUnavailable:true,previousResult:s.result,outputIdentity:voiceOutputIdentity(out.file)};
  // Atomic replace of the one record; the previous terminal record (if any) is kept under previousResult only.
  writeJson(found.file,recovered);return {ok:true,id};
 }

 // ---- retry: pinned options, separate preview, single-use approval ----
 function inputCopy(id){
  try{const dir=path.join(inputDir,id),names=fs.readdirSync(dir).filter(name=>name.toLowerCase().endsWith('.srt'));
   if(names.length!==1)return null;const file=path.join(dir,names[0]);return fs.lstatSync(file).isFile()&&fs.realpathSync(file)===path.resolve(file)?file:null;}catch(_){return null;}
 }
 // Side-effect-free evaluation shared by the preview and by the approval boundary.
 function evaluate(id,{settings='pinned',current={},activeRunId=null,allowCompleted=false}={}){
  const found=find(id);if(!found)return {ok:false,code:'unknown-run',reason:REASONS['unknown-run']};
  const row=describe(found.summary,found.file,activeRunId),pinned=found.summary.pinned;
  const refuse=(code,extra={})=>({ok:false,code,reason:REASONS[code]||code,next:NEXT[code]||null,...extra});
  if(!row.retryable&&!(allowCompleted&&row.state==='completed'))return refuse('not-retryable');
  if(activeRunId)return refuse('busy');
  if(!pinned)return refuse('legacy-record');
  if(pinned.narration)return refuse('chapter-run');
  if(pinned.groupTakesCount>0||(pinned.forceGroupCount>0&&!pinned.forceGroups))return refuse('selection-unrecoverable');
  const copy=inputCopy(id);if(!copy)return refuse('source-missing');
  let bytes;try{bytes=fs.readFileSync(copy);}catch(_){return refuse('source-missing');}
  if(sha(bytes)!==pinned.subtitleHash)return refuse('source-changed');
  let dubText=null;
  if(pinned.dubTextHash){
   try{
    const file=path.join(inputDir,id,'dub-text.json');
    if(!fs.lstatSync(file).isFile()||fs.realpathSync(file)!==path.resolve(file)||fs.statSync(file).size>24000000)return refuse('source-changed');
    const bytes=fs.readFileSync(file);
    if(sha(bytes)!==pinned.dubTextHash)return refuse('source-changed');
    dubText=JSON.parse(bytes);
   }catch(_){return refuse('source-changed');}
  }else if(found.summary.settings?.reviewedText){
   return refuse('selection-unrecoverable');
  }
  const differences=COMPARE.filter(key=>pinned[key]!==undefined&&current[key]!==undefined&&JSON.stringify(pinned[key])!==JSON.stringify(current[key])).map(key=>({field:key,pinned:pinned[key],current:current[key]}));
  if(dubText&&settings==='current'&&current.grouping!==undefined&&current.grouping!==pinned.grouping)return refuse('selection-unrecoverable',{differences});
  // A missing or unreadable reference is not "unchanged": nothing can be generated with it, in either mode.
  if(pinned.referenceFingerprint&&(current.referenceMissing||!current.referenceFingerprint))return refuse('voice-missing',{differences});
  const voiceChanged=!!(pinned.referenceFingerprint&&current.referenceFingerprint&&pinned.referenceFingerprint!==sha(current.referenceFingerprint));
  if(voiceChanged){differences.push({field:'voice',pinned:'pinned',current:'changed'});if(settings==='pinned')return refuse('voice-changed',{differences});}
  const use=settings==='current'?{...pinned,...Object.fromEntries(COMPARE.filter(key=>current[key]!==undefined).map(key=>[key,current[key]]))}:pinned;
  const digest=sha(JSON.stringify([id,settings,use.digest,pinned.subtitleHash,COMPARE.map(key=>current[key]),current.referenceFingerprint?sha(current.referenceFingerprint):null]));
  return {ok:true,found,copy,use,pinned,dubText,differences,digest,attempt:(found.summary.attempt||1)+1,settings,voiceChanged};
 }
 // Everything the preview says; shared by the token-issuing plan (UI) and the token-free assistant preview.
 function planBody(view,options){
  const {pinned,settings}=view,summary=view.found.summary,unrebuildable=[];
  if(pinned.deliveryAutomatic)unrebuildable.push({code:'delivery-source',text:text('Automatic delivery used a background/prosody source from an open tab; it is not rebuilt, so the delivery may differ.','Otomatik anlatım, açık bir sekmedeki arka plan/prozodi kaynağını kullandı; yeniden kurulmaz, anlatım farklı olabilir.')});
  if(pinned.speechSourceStatus==='available')unrebuildable.push({code:'speech-source',text:text('Speech-editing evidence came from the open source then; it may differ now.','Konuşma düzenleme kanıtı o sırada açık kaynaktan geldi; şimdi farklı olabilir.')});
  return {mode:settings,attempt:view.attempt,pinned:safeView(pinned),current:safeView(options.current||{}),differences:view.differences,
   source:{label:summary.label||'',range:pinned.range||null,trackVerified:true,sample:pinned.sample===true},
   voice:{name:pinned.referenceName||'',state:view.voiceChanged?'changed':'same',currentName:String(options.current?.referenceName||'')},
   dictionary:Array.isArray(pinned.pronunciations)?pinned.pronunciations.length:0,reviewedText:Object.keys(view.dubText?.edits||{}).length,unrebuildable,
   determinism:text('Using the same options does not guarantee identical audio; a new generation can sound different.','Aynı seçeneklerin kullanılması aynı sesin üretileceği anlamına gelmez; yeni üretim farklı duyulabilir.'),
   technical:{attempt:view.attempt,optionsVersion:String(pinned.digest||'').slice(0,8),trackVersion:String(pinned.subtitleHash||'').slice(0,8),previewMode:settings},
   note:settings==='current'?text('This starts a NEW generation with today\'s settings; the earlier result stays untouched.','Bu, bugünkü ayarlarla YENİ bir üretim başlatır; önceki sonuç olduğu gibi kalır.'):text('This starts a NEW generation with the options pinned to the original run; the earlier result stays untouched.','Bu, özgün işe sabitlenen seçeneklerle YENİ bir üretim başlatır; önceki sonuç olduğu gibi kalır.'),
   speechSourceNote:null};
 }
 function plan(id,options={}){
  const view=evaluate(id,options);if(!view.ok)return view;
  const token=randomBytes(32).toString('hex'),{settings,pinned}=view;
  // One open approval per run and mode: a newer preview of the same mode invalidates the older token; pinned and current stay separate.
  for(const [key,entry] of tokens)if(entry.runId===id&&entry.settings===settings&&entry.state==='open')tokens.delete(key);
  tokens.set(token,{runId:id,settings,digest:view.digest,state:'open',expires:now()+TOKEN_TTL,copy:view.copy,use:view.use,attempt:view.attempt,pinned});
  while(tokens.size>50)tokens.delete(tokens.keys().next().value);
  return {ok:true,token,...planBody(view,options)};
 }
 // Read-only: never issues, replaces or invalidates an approval token (an assistant question must not disturb the user's open preview).
 function previewView(id,options={}){
  const view=evaluate(id,options);if(!view.ok)return view;
  return {ok:true,...planBody(view,options)};
 }
 function sourceIdentityOf(id){const found=find(id);return found?.summary?.pinned?.sourceIdentity??null;}
 // The stored locator of one run as written (main only; never sent to a renderer or a model). found=false means no such run.
 function locatorOf(id){const found=find(id);if(!found)return {found:false,raw:null};return {found:true,raw:found.summary?.pinned?.sourceLocator??null,hasIdentity:typeof found.summary?.pinned?.sourceIdentity==='string'};}
 function locatorFingerprint(id){const row=locatorOf(id);if(!row.found)return null;const checked=locators.clean(row.raw);return checked.state==='ok'?locators.fingerprint(checked.locator):null;}
 // The caller supplies start(request, trusted) → {ok,...}. Claimed before any await; a repeated or concurrent approval never starts a second run.
 async function approve(token,{newId,start,current={},activeRunId=null,busy=()=>false}){
  const entry=typeof token==='string'?tokens.get(token):null;
  if(!entry)return {ok:false,code:'expired',error:REASONS.expired};
  if(entry.state==='applying')return {ok:false,code:'pending',pending:true,error:text('This retry is already starting.','Bu yeniden deneme zaten başlıyor.')};
  if(entry.state==='settled')return {...entry.result,replayed:true};
  if(entry.state==='failed')return {ok:false,code:'expired',error:REASONS.expired};
  if(entry.expires<=now()){tokens.delete(token);return {ok:false,code:'expired',error:REASONS.expired};}
  // Replays and duplicates were answered above; only a genuinely new start needs a free production slot, and being busy consumes nothing.
  if(busy())return {ok:false,code:'busy',error:REASONS.busy};
  entry.state='applying';
  try{
   // Re-verify at the approval boundary: the input and the settings the preview showed must still be the same.
   const again=evaluate(entry.runId,{settings:entry.settings,current,activeRunId});
   if(!again.ok){entry.state='open';return {ok:false,code:again.code,error:again.reason,next:again.next};}
   if(again.digest!==entry.digest){tokens.delete(token);return {ok:false,code:'preview-outdated',error:REASONS['preview-outdated']};}
   const use=entry.use;
   const request={id:newId,profile:use.profile,concurrency:use.concurrency,timingMode:use.timingMode,verification:use.verification,grouping:use.grouping,expression:use.expression,
    followDelivery:use.followDelivery,deliveryStrength:use.deliveryStrength,resultMode:use.resultMode,autoFit:use.autoFit,naturalSpeech:use.naturalSpeech,forceAll:false,
    forceGroups:entry.pinned.forceGroups||[],sample:entry.pinned.sample===true,positionSample:entry.pinned.positionSample===true,range:entry.pinned.range,sourceDuration:entry.pinned.sourceDuration};
   for(const key of Object.keys(request))if(request[key]===undefined)delete request[key];
   const result=await start(request,{srt:again.copy,dubText:again.dubText,sourceIdentity:entry.pinned.sourceIdentity??null,sourceLocator:entry.pinned.sourceLocator??null,pronunciations:entry.pinned.pronunciations||[],retryOf:entry.runId,attempt:entry.attempt});
   // A failed start may have left a partial run behind: the approval is consumed and a new preview is required.
   if(result?.ok===false){entry.state='failed';return {ok:false,code:'start-failed',error:String(result.error||'').slice(0,300)};}
   entry.state='settled';entry.result={ok:true,runId:newId,retryOf:entry.runId,attempt:entry.attempt};
   // The run now has a newer attempt: its other open previews are closed so one click cannot start a second one.
   for(const [key,other] of tokens)if(other!==entry&&other.runId===entry.runId&&other.state==='open')tokens.delete(key);
   return entry.result;
  }catch(error){
   entry.state='failed';
   return {ok:false,code:'start-failed',error:String(error?.message||error).slice(0,300)};
  }
 }
 const prepareEdit=(id,options)=>evaluate(id,{...options,settings:'pinned',allowCompleted:true});
 async function restoreOutput(id,candidate,expectedRecord){
  const found=find(id);if(!found||sha(JSON.stringify(found.summary))!==expectedRecord)throw Error('Run record changed / Üretim kaydı değişti.');
  if(found.summary.result!=='done'||outputInfo(id).state!=='missing'||!await matchesVoiceOutputAsync(candidate,found.summary.outputIdentity))throw Error('Restore no longer matches / Geri yükleme artık eşleşmiyor.');
  const recordCurrent=()=>{const current=find(id);return current&&sha(JSON.stringify(current.summary))===expectedRecord;};
  if(!recordCurrent()||outputInfo(id).state!=='missing')throw Error('Run or target changed / Üretim kaydı veya hedef değişti.');
  const target=path.join(outputDir,id+'.wav');
  try{await fs.promises.copyFile(candidate,target,fs.constants.COPYFILE_EXCL);}
  catch(error){return {ok:false,code:error.code==='EEXIST'?'restore-target-exists':'restore-copy-failed',error:text('The WAV could not be copied. The source is kept; check the output location before retrying.','WAV kopyalanamadı. Kaynak korunuyor; yeniden denemeden önce çıktı konumunu kontrol edin.')};}
  const identity=await voiceOutputIdentityAsync(target);
  if(!identity||identity.sha256!==found.summary.outputIdentity.sha256||identity.size!==found.summary.outputIdentity.size)return {ok:false,code:'restore-verification-failed',error:text('The copied WAV could not be verified. The source and target were kept; inspect the output location before retrying.','Kopyalanan WAV doğrulanamadı. Kaynak ve hedef korundu; yeniden denemeden önce çıktı konumunu inceleyin.')};
  if(!recordCurrent())return {ok:false,code:'restore-record-changed',outputPreserved:true,error:text('The WAV was copied and verified, but the run record changed. Both files are kept; reopen the run to review it.','WAV kopyalandı ve doğrulandı, ancak üretim kaydı değişti. İki dosya korunuyor; incelemek için kaydı yeniden açın.')};
  // The original completion, options, source and reports remain the same record.
  try{writeJson(found.file,{...found.summary,outputIdentity:identity,outputRestoredAt:new Date(now()).toISOString()});}
  catch{return {ok:false,code:'restore-record-write-failed',outputPreserved:true,id,name:path.basename(target),error:text('The WAV was copied and verified, but the run record could not be updated. Both files are kept. Reopen the run and inspect the audio before retrying.','WAV kopyalandı ve doğrulandı, ancak üretim kaydı güncellenemedi. İki dosya da korunuyor. Yeniden denemeden önce kaydı açıp sesi inceleyin.')};}
  return {ok:true,id,name:path.basename(target)};
 }
 return {instanceId,begin,heartbeat,end,settle,mark,list,find,detail,review,recover,restoreOutput,plan,previewView,prepareEdit,sourceIdentityOf,locatorOf,locatorFingerprint,approve,outputInfo,staleAfter,get active(){return active;}};
}
module.exports={createRunLedger,pinOptions,safeView,REASONS};
