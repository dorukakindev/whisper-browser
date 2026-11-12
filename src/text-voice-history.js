'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomicWriteFileSync}=require('./fsync-utils');
const {validVoiceOutput}=require('./voice-output');
const ID=/^text-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function json(file,max){if(fs.statSync(file).size>max)throw Error('Oversized voice record.');return JSON.parse(fs.readFileSync(file,'utf8'));}
function createTextVoiceHistory(app){
 const file=path.join(app.getPath('userData'),'text-voice-history.json');
 const roots=()=>require('./voice-storage').voiceStorage(app);
 function item(id){
  if(!ID.test(id))throw Error('Invalid text result identity.');
  try {
  const dirs=roots(),input=fs.realpathSync(path.join(dirs.input,'Metin')),folder=path.join(input,id);
  if(fs.realpathSync(folder)!==folder)throw Error('Invalid text result folder.');
  for(const name of ['job.json','request.json'])if(fs.realpathSync(path.join(folder,name))!==path.join(folder,name))throw Error('Invalid text result record.');
  const summary=json(path.join(folder,'job.json'),32768),request=json(path.join(folder,'request.json'),65536);
  if(summary.id!==id||summary.result!=='done'||summary.settings?.kind!=='text')throw Error('Text result is not complete.');
  const name=typeof request.output==='string'?path.basename(request.output):'';
  if(!name.endsWith('-'+id+'.wav'))throw Error('Invalid text result output.');
  const output=path.join(fs.realpathSync(dirs.output),name);
  if(path.resolve(request.output)!==output||fs.realpathSync(output)!==output||summary.path!==request.output||!validVoiceOutput(output))throw Error('Text audio is missing or invalid.');
  return {id,path:output,name,sample:summary.sample===true,finishedAt:typeof summary.finishedAt==='string'?summary.finishedAt:'',elapsedSeconds:Number.isFinite(summary.elapsedSeconds)?Math.max(0,summary.elapsedSeconds):null};
  } catch(error) { if(error.code==='ENOENT')throw Error('Saved text audio or its input is missing. Restore the original files or create a new recording. / Kayıtlı metin sesi veya girdisi eksik. Özgün dosyaları geri getirin ya da yeni kayıt oluşturun.',{cause:error}); throw error; }
 }
 function ids(){
  try{const data=json(file,16384);if(data.version!==1||!Array.isArray(data.ids))return [];return data.ids.filter(id=>typeof id==='string'&&ID.test(id)).slice(0,20);}catch(error){if(error.code!=='ENOENT')return [];}
  // One-time adoption of existing production logs. Read only the newest100 records,
  // and never follow per-job symlinks. No audio or manuscript is duplicated.
  const input=path.join(roots().input,'Metin');let names=[];
  try{names=fs.readdirSync(input,{withFileTypes:true}).filter(d=>d.isDirectory()&&ID.test(d.name)).slice(-2000).map(d=>({id:d.name,time:fs.statSync(path.join(input,d.name)).mtimeMs})).sort((a,b)=>b.time-a.time).slice(0,100);}catch{return [];}
  const adopted=[];for(const {id}of names){try{item(id);adopted.push(id);}catch{}if(adopted.length===20)break;}
  atomicWriteFileSync(file,JSON.stringify({version:1,ids:adopted}),{encoding:'utf8'});return adopted;
 }
 function list(){const result=[];for(const id of ids())try{result.push(item(id));}catch{}return result;}
 function record(id){item(id);atomicWriteFileSync(file,JSON.stringify({version:1,ids:[id,...ids().filter(value=>value!==id)].slice(0,20)}),{encoding:'utf8'});}
 return {list,record,get:item};
}
module.exports={createTextVoiceHistory};
