const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {withoutSecretEnv}=require('../src/settings-security');
const {canonicalLocalPath,SubtitleFileAccess}=require('../src/local-file-access');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
function handler(name,context){const start=source.indexOf(`ipcMain.handle('${name}'`),end=source.indexOf('\n});',start);let callback;vm.runInNewContext(source.slice(start,end+4),{...context,ipcMain:{handle:(_n,fn)=>{callback=fn;}}});return callback;}
(async()=>{
  const env=withoutSecretEnv({WHISPER_YT_REFRESH_TOKEN:'sentinel',whisper_yt_access_token:'sentinel',WHISPER_YT_CLIENT_SECRET:'sentinel',WHISPER_INVIDIOUS_PASSWORD:'sentinel',NO_PROXY:'localhost,[::1],.example.com',HTTPS_PROXY:'http://proxy.invalid:8080',PATH:'fixture'});
  assert.equal(env.NO_PROXY,'localhost,::1,.example.com');assert.equal(env.HTTPS_PROXY,'http://proxy.invalid:8080');assert.equal(env.PATH,'fixture');assert(!JSON.stringify(env).includes('sentinel'));
  const py=path.join(root,'backend/venv/Scripts/python.exe');
  if(fs.existsSync(py)){
    const p=require('node:child_process').spawnSync(py,['-c',"import httpx; c=httpx.Client(); c.close(); print('ok')"],{env:withoutSecretEnv({...process.env,NO_PROXY:'localhost,[::1]',no_proxy:'localhost,[::1]',HTTPS_PROXY:'http://proxy.invalid:8080',https_proxy:'http://proxy.invalid:8080'}),encoding:'utf8',windowsHide:true});assert.equal(p.status,0,p.stderr);assert.equal(p.stdout.trim(),'ok');
  }
  let calls=0;
  const download=handler('media:download',{dt:tr=>tr,authorizedBrowserSender:()=>true,decideUrlPolicy:()=>({action:'external',protocol:'https:',hostname:'fixture.invalid',url:'https://fixture.invalid/v'}),sanitizeAbsolutePath:x=>x,loadSettings:()=>({inputDir:'fixture'}),pushBoundOption:(a,k,v)=>a.push(k,v),runMediaCommand:async()=>{calls++;return {ok:true};}});
  for(const height of [-1,0,NaN,Infinity,{},[720],'bad',20000])assert.equal((await download({}, {height})).ok,false);
  assert.equal((await download({}, {height:'1080'})).ok,true);assert.equal(calls,1);
  if(process.platform==='win32'){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report407-'));
    try{const deep=path.join(dir,...Array(6).fill('uzun-Türkçe-dosya-yolu-407-abcdefghijk'));fs.mkdirSync(deep,{recursive:true});const file=path.join(deep,'altyazı.srt');fs.writeFileSync(file,'test');assert(file.length>260);assert.equal(canonicalLocalPath('\\\\?\\'+file),canonicalLocalPath(file));assert(new SubtitleFileAccess().grant('\\\\?\\'+file));for(const bad of ['\\\\.\\pipe\\x','\\\\?\\GLOBALROOT\\Device\\x','\\\\?\\'+file+':hidden'])assert.throws(()=>canonicalLocalPath(bad));}
    finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
  const renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
  const begin=renderer.indexOf('window.api.onEvent((event) => {'),end=renderer.indexOf('\n});',begin);
  const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'));
  const state={running:true,cancelled:true,queueRunning:true,currentQueueId:1,queue:[{id:1,status:'running'}],startTime:Date.now()};
  let callback,modals=0;
  const noop=()=>{};
  const context={state,RendererUiModel:require('../src/renderer-ui-model'),$:id=>dom.window.document.getElementById(id),$$:s=>[...dom.window.document.querySelectorAll(s)],window:{api:{onEvent:fn=>{callback=fn;}}},playerJobEvent:()=>false,updatePlayerTaskCenter:noop,clearPreviewActiveSegment:noop,refreshHistory:noop,logLine:noop,recordStageTiming:noop,markStagesDoneUpTo:noop,setProgress:noop,formatTime:()=>'',reportWatchQueueResult:noop,renderQueue:noop,setStatus:noop,notifyDone:noop,showResultModal:()=>{modals++;},setTimeout:()=>1,_queueNextTimer:null};
  context.finishRunAwaitingProcessExit=()=>{state.running=true;state.cancelled=false;};
  vm.runInNewContext(renderer.slice(begin,end+4),context);
  callback({type:'done',files:['ready.srt'],segments:1});assert.equal(state.queue[0].status,'done');
  callback({type:'exit',code:0,cancelled:true,cancelTooLate:true});assert.equal(state.queue[0].status,'done');assert.equal(state.running,false);
  Object.assign(state,{running:true,cancelled:true,queueRunning:false,currentQueueId:null,awaitingExit:false});
  callback({type:'done',files:['ready.srt'],segments:1});assert.equal(modals,1,'accepted completed output must be visible after late cancellation');
  dom.window.close();console.log('report407: proxy, secrets, download height, Windows long paths and late-completion UI passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
