'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
fs.mkdirSync(path.resolve(__dirname,'fixture'),{recursive:true});
const root=fs.mkdtempSync(path.join(__dirname,'fixture','run-'));
const repo=path.resolve(__dirname,'../../../..');
const Model=require(path.join(repo,'src/renderer/dub-experience-model'));
const RunInfo=require(path.join(repo,'src/renderer/dub-run-info'));
const {registerDubWorkspace}=require(path.join(repo,'src/dub-workspace'));
const cue=(start,end,text)=>({start,end,text});
async function main(){
 const missing=Model.comparisonRows({source:[],normal:[cue(0,2,'İlk bölüm.'),cue(8,10,'İkinci ödeme 500 lira.'),cue(12,14,'Son bölüm.')],speech:[cue(0,2,'İlk bölüm.'),cue(12,14,'Son bölüm.')]});
 const control=Model.comparisonRows({source:[],normal:[cue(0,2,'İlk bölüm.'),cue(8,10,'İkinci ödeme 500 lira.'),cue(12,14,'Son bölüm.')],speech:[]});
 assert.equal(missing.rows.length,2);assert.equal(missing.rows.some(r=>r.cue.start===8),false);assert.equal(control.rows.length,3);
 const handlers={},voice=path.join(root,'voice.wav'),subtitle=path.join(root,'source.srt'),project=path.join(root,'saved.dubproject');
 fs.writeFileSync(voice,'controlled fixture bytes; project copy does not decode media');fs.writeFileSync(subtitle,'1\n00:00:00,000 --> 00:00:02,000\nMerhaba.\n');
 const row={key:'1',group:1,text:'Merhaba.',sourceStart:0,sourceEnd:2,audioStart:0,audioEnd:2,status:'ready',verification:{status:'passed'},speechEditing:{natural:'editor_failed'}};
 const input={path:voice,url:'file:///controlled/voice.wav',name:'controlled.wav',subtitle,quality:{version:1,groups:[row]},settings:{timingMode:'clip'}};
 const before=RunInfo.speechResult(input,true),sender={isDestroyed:()=>false};
 const svc=registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,owner:()=>null,
 dialog:{showSaveDialog:async()=>({filePath:project}),showOpenDialog:async()=>({filePaths:[path.join(project,'project.json')]})},
 authorizeMedia:async p=>p,authorizeSubtitle:async p=>p,grantMedia:()=>{},grantSubtitle:()=>{}});
 const registered=svc.register(input);
 const saved=await handlers['dub:projectSave']({sender},{path:voice});assert.equal(saved.ok,true);
 const manifest=JSON.parse(fs.readFileSync(path.join(project,'project.json'),'utf8'));
 const opened=await handlers['dub:projectOpen']({sender});assert.equal(opened.ok,true);
 const after=RunInfo.speechResult(opened.output,true);
 assert.match(before,/unavailable/);assert.equal(after,'');assert.equal(registered.quality.groups[0].speechEditing,undefined);assert.equal(manifest.rows[0].speechEditing,undefined);
 const results={head:process.env.AUDIT835_HEAD||'unrecorded',
 missingPassage:{rowsWithSpeech:missing.rows.length,rowsWithoutSpeech:control.rows.length,retainedStarts:missing.rows.map(r=>r.cue.start),missingNumberWarnings:missing.rows.flatMap(r=>r.missingNumbers),omittedNormalCue:8},
 editingEvidence:{input:row.speechEditing,before,registered:registered.quality.groups[0].speechEditing??null,manifest:manifest.rows[0].speechEditing??null,restored:opened.output.quality.groups[0].speechEditing??null,after,saveOk:saved.ok,openOk:opened.ok},limits:'Real production JS modules and project save/open IPC; synthetic bytes copied only, no audio decode, UI/GPU/provider or personal settings.'};
 fs.writeFileSync(path.join(__dirname,'result.json'),JSON.stringify(results,null,2));process.stdout.write(JSON.stringify(results,null,2)+'\n');
}
main().catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
