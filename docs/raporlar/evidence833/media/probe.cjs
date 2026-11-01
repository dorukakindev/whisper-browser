'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../..');
const out=process.env.AUDIT833_OUT?path.resolve(process.env.AUDIT833_OUT):path.join(root,'.uiprev/audit833-media-'+Date.now());
fs.mkdirSync(out,{recursive:true});
const renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
function slice(source,a,b){const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return source.slice(i,j);}
const handlers={};
const c=vm.createContext({fs,path,Buffer,createHash:crypto.createHash,MAX_SUBTITLE_BYTES:32e6,
 ipcMain:{handle:(name,fn)=>handlers[name]=fn},authorizedBrowserSender:()=>true,
 authorizeSubtitleFile:async file=>file,markOwnSubtitleWrite:()=>{},
 renameSyncResilient:require(path.join(root,'src/fsync-utils')).renameSyncResilient,
 app:{getPath:()=>out},appendSubtitleEditLog:()=>'',
 player:{subPath:'',sub2Path:'',subStat:null,sub2Stat:null},window:{api:{}}});
vm.runInContext(slice(main,'function backupOnce(','// Düz metin (Markdown'),c);
vm.runInContext(slice(main,"ipcMain.handle('media:writeSubtitle'","ipcMain.handle('media:saveSubtitleCopy'"),c);
vm.runInContext(slice(renderer,'function subtitleStatFor(','function savedCueStorageKey('),c);
vm.runInContext(slice(renderer,'function replaceTimedCueTexts(','function replaceVttCueTexts('),c);
vm.runInContext(slice(renderer,'function subtitleFindDescriptors()','function subtitleFindFieldLabel('),c);
vm.runInContext(slice(renderer,'function prepareSubtitleBulkOperations(','function subtitleBulkLogChanges('),c);
vm.runInContext(slice(renderer,'function subtitleBulkLogChanges(','function subtitleBulkFileStateStillMatches('),c);
vm.runInContext(slice(renderer,'async function applySubtitleFindReplacement(','function openPlayer('),c);
c.browserLoadedTrack=()=>null;
c.subtitleFindReplace=require(path.join(root,'src/subtitle-find-replace'));
c.timelineBlocksFileWrites=()=>false;c.currentGeneration=()=>1;c.updateSubtitleFindSummary=()=>{};c.osd=()=>{};c.scheduleSubtitleFindReplace=()=>{};
c.clearTimeout=clearTimeout;c.$=id=>id==='subtitleReplaceText'?{value:'AFTER'}:null;
const log=[];c.logLine=(message,level)=>log.push({message,level});
const text=word=>`1\n00:00:01,000 --> 00:00:02,000\n${word}\n`;
function revision(){if(process.env.AUDIT833_HEAD)return process.env.AUDIT833_HEAD;const h=fs.readFileSync(path.join(root,'.git/HEAD'),'utf8').trim();return h.startsWith('ref: ')?fs.readFileSync(path.join(root,'.git',h.slice(5)),'utf8').trim():h;}
const results={head:revision(),platform:process.platform,node:process.version,out,scope:'synthetic filesystem + exact original main/renderer slices; no UI process/profile/provider'};
async function bulk(name,{external=false,retry=false}={}){
 const dir=path.join(out,name);fs.mkdirSync(dir);const first=path.join(dir,'kaynak.srt'),second=path.join(dir,'çeviri.srt');
 fs.writeFileSync(first,text('SOURCE BEFORE'));fs.writeFileSync(second,text('TRANSLATION BEFORE'));
 const stat=p=>{const s=fs.statSync(p);return {size:s.size,mtimeMs:s.mtimeMs};};
 c.player.subPath=first;c.player.sub2Path=second;c.player.subStat=stat(first);c.player.sub2Stat=stat(second);
 c.player.workspaceMode='local';c.player.subRole='source';c.player.sub2Role='translation';c.player.subFormat=c.player.sub2Format='srt';
 c.player.subRaw=text('SOURCE BEFORE');c.player.sub2Raw=text('TRANSLATION BEFORE');
 c.player.cuesRaw=[{start:1,end:2,text:'SOURCE BEFORE',subtitleSourceIndex:0}];c.player.cues2Raw=[{start:1,end:2,text:'TRANSLATION BEFORE',subtitleSourceIndex:0}];
 const calls=[];let firstSucceeded=false;
 c.window.api.writeSubtitle=async(file,content,change,expect)=>{
  calls.push({file:path.basename(file),action:change.action,expect:expect||null});
  if(file===second&&change.action==='bulk-edit'){
   if(external)fs.writeFileSync(first,text('EXTERNAL NEWER WORK THAT MUST SURVIVE'));
   return {ok:false,error:'controlled secondary disk failure'};
  }
  const res=await handlers['media:writeSubtitle']({}, {path:file,text:content,change,expect});
  if(file===first&&change.action==='bulk-edit')firstSucceeded=res.ok;
  return res;
 };
 const search=require(path.join(root,'src/subtitle-find-replace'));const matches=search.findLiteralMatches(c.subtitleFindEntries(),'BEFORE',{caseSensitive:true});
 const plans=search.buildReplacementPlan(matches,new Set(matches.map(m=>m.id)),'AFTER');
 // VM-local plans and Set identity remain faithful to renderer realm.
 const prepared=c.prepareSubtitleBulkOperations(plans);assert(!prepared.error,prepared.error);const files=prepared.files;assert.equal(files.length,2);
 c.player.mediaKey='fixture-two-subtitles';c.player.subtitleFindReplace={generation:1,matches,selected:new Set(matches.map(m=>m.id)),applying:false};
 let res;const realWrite=c.writeSubtitleBulkFiles;c.writeSubtitleBulkFiles=async(...args)=>res=await realWrite(...args);
 await c.applySubtitleFindReplacement('all');c.writeSubtitleBulkFiles=realWrite;
 assert(firstSucceeded);assert.equal(res.ok,false);assert.equal(res.rollbackFailed,false);
 const actual=fs.readFileSync(first,'utf8').replace(/^\uFEFF/,'');
 assert.equal(actual,text('SOURCE BEFORE'));
 const r={result:res,calls,firstAfter:actual,playerStat:c.player.subStat,diskStat:stat(first),sourceBak:fs.readFileSync(first+'.bak','utf8'),uiLogs:log.splice(0),applying:c.player.subtitleFindReplace.applying};assert.equal(r.applying,false);
 if(external){assert(!actual.includes('EXTERNAL'));r.externalLost=true;}
 if(retry){let repeat;c.writeSubtitleBulkFiles=async(...args)=>repeat=await realWrite(...args);await c.applySubtitleFindReplacement('all');c.writeSubtitleBulkFiles=realWrite;assert.equal(repeat.ok,false);assert.match(repeat.error,/dışarıdan/);r.retry=repeat;r.retryUiLogs=log.splice(0);r.diskStillOriginal=fs.readFileSync(first,'utf8').replace(/^\uFEFF/,'')===text('SOURCE BEFORE');}
 return r;
}
(async()=>{
 results.rollbackExternalOverwrite=await bulk('external-overwrite',{external:true});
 results.rollbackStaleStat=await bulk('stale-stat',{retry:true});
 // Counterfactual guard: the real main handler rejects newer outside bytes when
 // handed the same successful-write stat that the rollback branch omits.
 const control=path.join(out,'guard-control.srt');fs.writeFileSync(control,text('INITIAL'));const st=fs.statSync(control);
 fs.writeFileSync(control,text('EXTERNAL WORK LONGER'));
 results.guardControl=await handlers['media:writeSubtitle']({}, {path:control,text:text('ROLLBACK'),expect:{mtimeMs:st.mtimeMs,size:st.size}});
 assert.equal(results.guardControl.ok,false);assert(fs.readFileSync(control,'utf8').includes('EXTERNAL'));
 const normal=path.join(out,'normal.srt');fs.writeFileSync(normal,text('NORMAL'));const ns=fs.statSync(normal);
 results.normalWrite=await handlers['media:writeSubtitle']({}, {path:normal,text:text('CHANGED'),expect:{mtimeMs:ns.mtimeMs,size:ns.size}});assert(results.normalWrite.ok);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({ok:true,out,bugs:['rollback overwrite','rollback stale stat'],controls:['real main rejects stale expect','normal main write']},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
