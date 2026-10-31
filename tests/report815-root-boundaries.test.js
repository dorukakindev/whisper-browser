'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const model=require('../src/model-manager'),privacy=require('../src/browser-diagnostics-export');
const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');

test('B08/B79/B80 model status, selected repository and busy-after-confirm agree',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'models815-'));
 try{
  const first=path.join(root,'first'),second=path.join(root,'second'),repoName='models--Systran--faster-whisper-tiny';
  const partial=path.join(first,repoName),usable=path.join(second,repoName);
  fs.mkdirSync(partial,{recursive:true});fs.mkdirSync(usable,{recursive:true});
  for(const name of ['config.json','model.bin','tokenizer.json'])fs.writeFileSync(path.join(usable,name),'fixture');
  const env={HF_HUB_CACHE:first,HUGGINGFACE_HUB_CACHE:second};
  assert.equal(model.modelCacheRoots(root,env)[0],first);
  assert.equal(model.scanModelCache(root,env).models.find(r=>r.id==='tiny').installed,true);
  assert.equal(model.findModelRepository(root,'tiny',env,false).repo.path,usable);
  assert.equal(model.deleteCachedModel(root,'tiny',env,partial).ok,false);
  assert(fs.existsSync(usable)&&fs.existsSync(partial));
  const handlers={},context={KNOWN_MODELS:['tiny'],authorizedBrowserSender:()=>true,appResourceRoot:()=>root,
   require:id=>{assert.equal(id,'./model-manager');return model;},process:{env},scanModelCache:()=>model.scanModelCache(root,env),
   activeJob:null,burninJob:null,burninStartPending:false,browserLiveAsr:null,modelBenchmarkJob:null,modelProcesses:new Set(),mainWindow:{},
   loadSettings:()=>({ui:{uiLocale:'tr'}}),ipcMain:{handle:(name,fn)=>handlers[name]=fn}};
  context.dialog={showMessageBox:async()=>{context.activeJob={};return {response:0};}};
  const start=main.indexOf("ipcMain.handle('models:delete'");
  const end=main.indexOf("ipcMain.handle('models:benchmark'",start);
  assert(start>0&&end>start);vm.runInNewContext(main.slice(start,end),context);
  const busy=await handlers['models:delete']({}, {model:'tiny'});
  assert.equal(busy.ok,false);assert.match(busy.error,/çalışırken/);assert(fs.existsSync(usable));
  context.activeJob=null;context.dialog.showMessageBox=async()=>({response:0});
  assert.equal((await handlers['models:delete']({}, {model:'tiny'})).ok,true);
  assert(!fs.existsSync(usable));assert(fs.existsSync(partial),'Unselected partial repository remains');
 }finally{assert(path.basename(root).startsWith('models815-'));fs.rmSync(root,{recursive:true,force:true});}
});

test('B119 free-text assignments use the same canonical secret keys as objects',()=>{
 for(const field of ['clientSecret','accessToken','private_key','privateKey','x-api-key','refreshToken']){
  const marker='FAKE_PRIVATE_VALUE';
  for(const line of [field+'='+marker,`"${field}":"${marker} WITH SPACES"`,`${field}='${marker} WITH SPACES'`]){
   assert(!privacy.redactBrowserDiagnosticsText(line).includes(marker),field+' assignment');
   assert(!JSON.stringify(privacy.sanitizeDiagnosticsSecrets({error:line,[field]:marker})).includes(marker));
  }
 }
 const normal='status=ready code=401 state=loading client_id=public';
 assert.equal(privacy.redactBrowserDiagnosticsText(normal),normal);
});

test('B120 real capture producer redacts known cue text before truncating diagnostics',()=>{
 const cue='FAKE_PRIVATE_CUE_START '+('Only synthetic private text for the privacy test. '.repeat(20));
 const diagnostics={counts:{page:0,parsed:0,rejected:0,errors:0},recent:[]};
 const context={browserDiagnostics:diagnostics,browserTrackBuffers:new Map([['fixture',[{text:cue}]]]),
  isCurrentBrowserContext:()=>true,activeBrowserTab:()=>null,browserResponseAdapter:()=>({label:'fixture'}),
  redactCaptureUrl:require('../src/browser-adapters').redactCaptureUrl,
  publishBrowserDiagnostics:()=>{},sanitizeDiagnosticsSecrets:privacy.sanitizeDiagnosticsSecrets,
  sanitizeDiagnosticsAgainstCueText:privacy.sanitizeDiagnosticsAgainstCueText};
 const start=main.indexOf('function noteBrowserCapture('),end=main.indexOf('function noteBrowserDiagnosticActivity(',start);
 vm.runInNewContext(main.slice(start,end),context);
 context.noteBrowserCapture('page',{},'error','Parser error: '+cue+'; clientSecret=FAKE_SECRET');
 const exported=privacy.sanitizeDiagnosticsAgainstCueText(privacy.sanitizeDiagnosticsSecrets(diagnostics),context.browserTrackBuffers);
 const bytes=JSON.stringify(exported);assert(!bytes.includes('FAKE_PRIVATE'));assert(!bytes.includes('FAKE_SECRET'));
 assert(bytes.includes(privacy.SUBTITLE_REDACTION));assert(bytes.includes('Parser error'));
 assert(diagnostics.recent[0].detail.length<=160);
 for(const limit of [80,160,240,400,800]){
  const truncated=('Parser error: '+cue).slice(0,limit)+'; stage=parse';
  const redacted=privacy.redactCapturedCueText(truncated,[cue]);
  assert(!redacted.includes('FAKE_PRIVATE')&&!redacted.includes('synthetic private text'));
  assert(redacted.includes('Parser error')&&redacted.includes('stage=parse'));
 }
});
