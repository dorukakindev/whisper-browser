'use strict';
// Recovery comes only from an authorized generated subtitle's adjacent metadata.
// No file paths, API configuration, or provider credentials enter the feed store.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code='source-mismatch')=>{const messages={'missing-recovery':'Verified cue recovery is unavailable / Doğrulanmış satır kurtarma bilgisi yok.','no-missing-cues':'No verified missing cues / Doğrulanmış eksik satır yok.','for-speech-unsupported':'Speech translation retry needs its original protocol / Seslendirme çevirisini yeniden denemek için özgün protokol gerekli.','unchanged-completed-cue':'An unchanged completed cue needs review / Değişmemiş tamamlanmış satır incelenmeli.'};const error=Error(messages[code]||'Translation recovery does not match this source / Çeviri kurtarma bilgisi bu kaynakla eşleşmiyor.');error.code=code;throw error;};
const normalize=value=>String(value).normalize('NFC').replace(/\s+/gu,' ').trim();
const seconds=value=>value%1000===0?`${value/1000}.0`:String(value/1000);
const entryJson=row=>`"s":${seconds(row.startMs)},"e":${seconds(row.endMs)},"t":${JSON.stringify(row.text)}`;
const sourceHash=rows=>hash('['+rows.map(row=>'{'+entryJson(row)+'}').join(',')+']');
const cueKey=(row,index)=>hash('{"i":'+index+','+entryJson(row)+'}');
function originals(value){
 if(!Array.isArray(value)||!value.length||value.length>20000)fail();
 const rows=value.map(row=>{if(!row||!Number.isSafeInteger(row.startMs)||!Number.isSafeInteger(row.endMs)||row.startMs<0||row.endMs<=row.startMs||row.endMs>31536000000||typeof row.text!=='string'||!row.text.trim()||row.text.length>12000||/[\u0000]/u.test(row.text))fail();return {startMs:row.startMs,endMs:row.endMs,text:row.text.normalize('NFC')};});
 if(Buffer.byteLength(JSON.stringify(rows))>2000000)fail();return rows;
}
function parse(text){
 if(typeof text!=='string'||text.length>500000)fail();
 const rows=[];
 for(const block of text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split(/\n[ \t]*\n/)){
  const lines=block.split('\n'),index=lines.findIndex(line=>line.includes('-->'));if(index<0){if(/^WEBVTT(?:[ \t]|$)/.test(lines[0])||/^(?:NOTE|STYLE|REGION)(?:[ \t]|$)/.test(lines[0]))continue;fail();}
  const match=/^\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})(?:\s.*)?$/.exec(lines[index]);if(!match||index>1)fail();
  const part=offset=>{const hours=Number(match[offset]),minutes=Number(match[offset+1]),secs=Number(match[offset+2]),ms=Number(match[offset+3]);if(minutes>=60||secs>=60)fail();return ((hours*60+minutes)*60+secs)*1000+ms;};
  const body=lines.slice(index+1).join('\n').trim();if(!body)fail();rows.push({startMs:part(1),endMs:part(5),text:body});
 }
 return originals(rows);
}
function coverage(value){if(value==null)return null;if(!value||typeof value!=='object'||!Number.isFinite(value.start)||!Number.isFinite(value.end)||value.start<0||value.end<=value.start||value.end>31536000)fail();return {start:value.start,end:value.end};}
function validate(raw,sourceText,translationText,targetLanguage){
 if(!raw||raw.version!==1||typeof raw.targetLanguage!=='string'||!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(raw.targetLanguage)||typeof raw.forSpeech!=='boolean'||raw.targetLanguage.toLowerCase()!==String(targetLanguage||'').toLowerCase()||raw.translationTextHash!==hash(translationText))fail();
 const rows=originals(raw.sourceCues),source=parse(sourceText),translated=parse(translationText);
 if(source.length!==rows.length||translated.length!==rows.length||!Array.isArray(raw.completed)||raw.completed.length!==rows.length||raw.completed.some(value=>typeof value!=='boolean'))fail();
 if(rows.some((row,i)=>source[i].startMs!==row.startMs||source[i].endMs!==row.endMs||normalize(source[i].text)!==normalize(row.text)||translated[i].startMs!==row.startMs||translated[i].endMs!==row.endMs))fail();
 return {version:1,targetLanguage:raw.targetLanguage.toLowerCase(),forSpeech:raw.forSpeech,sourceCues:rows,completed:[...raw.completed],translationTextHash:raw.translationTextHash};
}
function readOutputRecovery(file,bytes){
 try{
  if(typeof file!=='string'||!path.isAbsolute(file)||!file.toLowerCase().endsWith('.srt')||!Buffer.isBuffer(bytes)||bytes.length>4000000)return null;
  const original=fs.lstatSync(file);if(!original.isFile()||original.isSymbolicLink()||original.size!==bytes.length)return null;
  const sidecar=file+'.meta.json',stat=fs.lstatSync(sidecar);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8000000||path.dirname(fs.realpathSync(sidecar))!==path.dirname(fs.realpathSync(file)))return null;
  const meta=JSON.parse(fs.readFileSync(sidecar,'utf8')),rows=originals(meta.originalCues),translated=parse(bytes.toString('utf8'));
  if(meta.version!==1||meta.role!=='translation'||typeof meta.forSpeech!=='boolean'||meta.sourceContextVersion!==1||meta.subtitleHash!==hash(bytes)||meta.originalHash!==hash(JSON.stringify(rows))||meta.sourceHash!==sourceHash(rows)||!Array.isArray(meta.cues)||meta.cues.length!==rows.length||translated.length!==rows.length||meta.total!==rows.length) return null;
  if(meta.cues.some((cue,i)=>!cue||typeof cue.text!=='string'||cue.key!==cueKey(rows[i],i)||!['completed','failed'].includes(cue.status)||normalize(cue.text)!==normalize(translated[i].text)||rows[i].startMs!==translated[i].startMs||rows[i].endMs!==translated[i].endMs))return null;
  const completed=meta.cues.map(cue=>cue.status==='completed'),count=completed.filter(Boolean).length;
  if(meta.completed!==count||meta.failed!==rows.length-count||meta.status!==(count===rows.length?'complete':'partial'))return null;
  const text=bytes.toString('utf8').replace(/^\uFEFF/,'');
  return validate({version:1,targetLanguage:meta.targetLanguage,forSpeech:meta.forSpeech===true,sourceCues:rows,completed,translationTextHash:hash(text)},serialize(rows),text,meta.targetLanguage);
 }catch{return null;}
}
function timestamp(value){const ms=value%1000,total=Math.floor(value/1000),s=total%60,m=Math.floor(total/60)%60,h=Math.floor(total/3600);return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+','+String(ms).padStart(3,'0');}
function serialize(rows){return rows.map((row,i)=>`${i+1}\n${timestamp(row.startMs)} --> ${timestamp(row.endMs)}\n${row.text}\n`).join('\n')+'\n';}
function eligibility(source,translation,targetLanguage,expectedTranscriptText){
 if(!translation?.recovery)fail('missing-recovery');
 if(source?.state!=='timed'||source.status==='partial'||translation?.state!=='timed'||translation.status!=='partial'||source.text!==expectedTranscriptText||translation.targetLanguage!==targetLanguage)fail();
 const recovered=validate(translation.recovery,source.text,translation.text,targetLanguage),completed=recovered.completed.filter(Boolean).length;
 if(completed===recovered.completed.length)fail('no-missing-cues');
 if(recovered.forSpeech)fail('for-speech-unsupported');
 const translated=parse(translation.text);
 // Backend --translate-retry-only checks its exact SDH/echo and cue-cleanup
 // rules before any request. Do not guess which unchanged cues were failures.
 return {recovered,translated,completed,selected:coverage(translation.coverage)};
}
function recoveryInfo(source,translation){
 try{const value=eligibility(source,translation,translation?.targetLanguage,source?.text);return {canRetry:true,total:value.recovered.completed.length,completed:value.completed,failed:value.recovered.completed.length-value.completed};}catch(error){return {canRetry:false,partial:translation?.status==='partial',total:0,completed:0,failed:0,reason:error.code||'source-mismatch'};}
}
function materialize({directory,sourceVersion,source,translation,targetLanguage,expectedTranscriptText}){
 if(!/^[a-f0-9]{64}$/.test(sourceVersion||''))fail();
 const {recovered,translated,completed,selected}=eligibility(source,translation,targetLanguage,expectedTranscriptText),id=hash(JSON.stringify({source:source.text,translation:translation.text,recovery:recovered,coverage:selected})).slice(0,20),sourcePath=path.join(directory,sourceVersion+'-retry-'+id+'.srt'),translationPath=path.join(directory,sourceVersion+'-retry-'+id+'-translation.srt');
 const sourcePayload='\uFEFF'+serialize(recovered.sourceCues),translationPayload='\uFEFF'+serialize(translated),digest=sourceHash(recovered.sourceCues),metadata={version:1,role:'translation',sourceHash:digest,sourceId:hash(JSON.stringify({kind:'file',source:sourcePath,hash:digest})),targetLanguage:recovered.targetLanguage,forSpeech:false,total:translated.length,completed,failed:translated.length-completed,status:'partial',sourceContextVersion:1,subtitleHash:hash(translationPayload),originalHash:hash(JSON.stringify(recovered.sourceCues)),originalCues:recovered.sourceCues,cues:translated.map((row,i)=>({key:cueKey(recovered.sourceCues[i],i),status:recovered.completed[i]?'completed':'failed',text:row.text,error:recovered.completed[i]?'':'api_failure'}))};
 fs.mkdirSync(directory,{recursive:true});const write=require('./fsync-utils').atomicWriteFileSync;write(sourcePath,sourcePayload);write(translationPath,translationPayload);write(translationPath+'.meta.json',JSON.stringify(metadata)+'\n');
 return {sourcePath,translationPath,targetLanguage:recovered.targetLanguage,forSpeech:false,translateRetryOnly:true,total:translated.length,completed,failed:translated.length-completed,coverage:selected};
}
// File repair is separate from feed recovery: the exact generated file and sidecar
// are re-read at approval. Original artifacts and successful rows stay untouched.
function repairFile({file,bytes,directory,prepare=false,expectedHash,allowMixed=false,selectedIndices}){
 let raw=readOutputRecovery(file,bytes),mixed=false;
 const text=require('./browser-textutil').decodeSubtitleBuffer(bytes).text;
 if(!raw){
  if(!allowMixed)return {canRepair:false,reason:'missing-recovery'};
  const rows=parse(text);mixed=true;
  raw={version:1,targetLanguage:'tr',forSpeech:false,sourceCues:rows,completed:rows.map(()=>true),translationTextHash:hash(text)};
 }
 const translated=parse(text);
 const suspects=require('./translation-review-summary').untranslatedIndices(raw.sourceCues,translated,raw.targetLanguage).filter(i=>raw.completed[i]);
 const failed=new Set(raw.completed.flatMap((done,i)=>done?[]:[i]));for(const i of suspects)failed.add(i);
 const metadata=mixed?{mixedSubtitleRepair:true}:JSON.parse(fs.readFileSync(file+'.meta.json','utf8'));
 if(metadata.mixedSubtitleRepair===true)mixed=true;
 const fingerprint=hash(Buffer.concat([bytes,Buffer.from(JSON.stringify(metadata))]));
 const info={canRepair:failed.size>0,total:raw.completed.length,failed:failed.size,suspected:suspects.length,targetLanguage:raw.targetLanguage,fingerprint,mixed,rows:[...failed].sort((a,b)=>a-b).slice(0,500).map(index=>({index,start:translated[index].startMs/1000,end:translated[index].endMs/1000,source:raw.sourceCues[index].text.slice(0,1000),translation:translated[index].text.slice(0,1000)})),rowsPartial:failed.size>500};
 if(!prepare||!info.canRepair)return info;
 if(expectedHash!==fingerprint)fail();
 let cueRange=null;
 if(selectedIndices!==undefined){
  if(!Array.isArray(selectedIndices)||!selectedIndices.length||selectedIndices.length>500||new Set(selectedIndices).size!==selectedIndices.length||selectedIndices.some(i=>!Number.isSafeInteger(i)||!failed.has(i)))fail('invalid-selection');
  const selected=new Set(selectedIndices),start=Math.min(...selectedIndices.map(i=>translated[i].startMs/1000)),end=Math.max(...selectedIndices.map(i=>translated[i].endMs/1000));
  const affected=[...failed].filter(i=>translated[i].endMs/1000>start+.001&&translated[i].startMs/1000<end-.001);
  if(affected.some(i=>!selected.has(i)))throw Error('Choose every failed row in one continuous time range. / Tek zaman aralığındaki tüm eksik satırları seç.');
  if(end-start<=.004)throw Error('This cue is too short for a safe range selection. / Bu satır güvenli aralık seçimi için çok kısa.');
  // Existing engine range matching has a 1 ms tolerance. An interior window
  // selects whole cues without accidentally including a touching neighbour.
  cueRange=(Math.round((start+.002)*1000)/1000)+':'+(Math.round((end-.002)*1000)/1000);
 }
 if(raw.forSpeech&&!(typeof metadata.speechProtocol==='string'&&/^speech-[a-z0-9-]{1,100}$/.test(metadata.speechProtocol)))fail('for-speech-unsupported');
 const sourceText=serialize(raw.sourceCues),source={state:'timed',text:sourceText,status:'complete'};
 const track={state:'timed',text,status:'partial',targetLanguage:raw.targetLanguage,
  recovery:{...raw,forSpeech:false,completed:raw.completed.map((done,i)=>done&&!failed.has(i))}};
 const result=materialize({directory,sourceVersion:fingerprint,source,translation:track,targetLanguage:raw.targetLanguage,expectedTranscriptText:sourceText});
 if(raw.forSpeech||mixed||cueRange){
  const staged=JSON.parse(fs.readFileSync(result.translationPath+'.meta.json','utf8'));
  if(mixed)staged.mixedSubtitleRepair=true;
  if(raw.forSpeech){staged.forSpeech=true;staged.speechProtocol=metadata.speechProtocol;}
  if(cueRange)staged.repairCueRange=cueRange;
  require('./fsync-utils').atomicWriteFileSync(result.translationPath+'.meta.json',JSON.stringify(staged)+'\n');
  result.forSpeech=raw.forSpeech;
 }
 return {...info,...result,...(cueRange?{translateCueRange:cueRange}:{}),repairInputProof:{source:hash(fs.readFileSync(result.sourcePath)),translation:hash(fs.readFileSync(result.translationPath)),metadata:hash(fs.readFileSync(result.translationPath+'.meta.json'))}};
}
// Called only after both subtitle paths have been authorized by main.
function verifyRepairInputs(options){
 const proof=options.repairInputProof;
 if(proof===undefined)return;
 const invalid=()=>{throw Error('Approved repair files changed; review again / Onaylanan onarım dosyaları değişti; yeniden inceleyin.');};
 if(options.translateOnly!==true||options.translateRetryOnly!==true||!proof||typeof proof!=='object'||Array.isArray(proof))invalid();
 for(const [key,file]of [['source',options.input],['translation',options.translateExisting],['metadata',typeof options.translateExisting==='string'?options.translateExisting+'.meta.json':null]]){
  if(typeof proof[key]!=='string'||!/^[a-f0-9]{64}$/.test(proof[key])||typeof file!=='string')invalid();
  try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024||hash(fs.readFileSync(file))!==proof[key])invalid();}catch{invalid();}
 }
 const metadata=JSON.parse(fs.readFileSync(options.translateExisting+'.meta.json','utf8'));if(metadata.repairCueRange!==undefined&&options.translateCueRange!==metadata.repairCueRange)invalid();
}
module.exports={readOutputRecovery,validate,coverage,recoveryInfo,materialize,repairFile,verifyRepairInputs};
