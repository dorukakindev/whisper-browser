'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http'),net=require('node:net'),cp=require('node:child_process');
const root=process.cwd(),out=path.resolve(process.env.R815_WORKFLOWS_OUT||'.tmp/next815-workflows/run');
fs.mkdirSync(out,{recursive:true});
const files=['src/assistant-mcp-bridge.js','tools/whisper-mcp.cjs','src/assistant-guide.js','src/assistant-retrieval.js','src/browser-workflow-recorder.js','src/browser-automation-rules.js','src/main.js','src/renderer/renderer.js','src/renderer/renderer-helpers.js','src/browser-subtitles.js'];
const sha=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
function readHead(){const h=fs.readFileSync(path.join(root,'.git/HEAD'),'utf8').trim();if(!h.startsWith('ref: '))return h;const ref=h.slice(5),f=path.join(root,'.git',ref);if(fs.existsSync(f))return fs.readFileSync(f,'utf8').trim();return fs.readFileSync(path.join(root,'.git/packed-refs'),'utf8').split(/\r?\n/).find(l=>l.endsWith(' '+ref)).split(' ')[0];}
function exactFunction(file,name){const s=fs.readFileSync(path.join(root,file),'utf8');const start=s.indexOf('function '+name+'(');assert(start>=0);const next=s.indexOf('\nfunction ',start+1);return s.slice(start,next<0?s.length:next).trim();}
const rules=require(path.join(root,'src/browser-automation-rules'));
const events=[],writes=[],tab={id:'fixture-tab',mediaId:'fixture-video',generation:1};
const sandbox={path,Date,Map,Set,Math,Number,String,Array,JSON,createHash:crypto.createHash,fs,
browserTrackPublications:new Map(),browserTrackPublicationNeedsMetadataRefresh:()=>false,
browserSubtitleDir:()=>out,writeSubtitleAtomic:(p,body)=>writes.push({p,characters:body.length}),cuesToSrt:c=>c.map(x=>x.text).join('\n'),
browserWatchMediaId:t=>t.mediaId,browserAssetStore:()=>({putTrack:r=>({ok:true,assetId:'asset:'+r.trackId,srtPath:path.join(out,r.trackId+'.srt'),document:{...r,cues:r.cues}})}),watchIndex:()=>null,scheduleBrowserSessionSave:()=>{},trackBrowserSubtitleFile:()=>{},sendBrowserEvent:(_t,e)=>events.push(e),redactCaptureUrl:x=>x,
player:{browserTracks:[],browserActiveTabId:tab.id},effectiveBrowserProfile:()=>({origin:'https://fixture.invalid',values:{subtitleAutomation:'auto',targetLanguage:'tr'}}),browserTabState:()=>tab,window:{BrowserAutomationRules:rules},queueMicrotask:fn=>fn(),useBrowserTrack:async(_translate,id)=>{sandbox.calls.push(id);},calls:[],setBrowserSignal:()=>{},friendlySystemError:x=>x};
vm.createContext(sandbox);
vm.runInContext(exactFunction('src/main.js','persistBrowserTrack')+'\n'+exactFunction('src/main.js','publishBrowserTrackNow'),sandbox);
vm.runInContext('const browserSubtitleAutomationGate=window.BrowserAutomationRules.createBrowserAutomationGate();\n'+exactFunction('src/renderer/renderer.js','browserSubtitleAutomationInput')+'\n'+exactFunction('src/renderer/renderer.js','handleBrowserSubtitleAutomation'),sandbox);
function publish(id,n){sandbox.entry={normalized:require(path.join(root,'src/browser-subtitles')).normalizeCues(Array.from({length:Math.ceil(n/500)},(_,i)=>({start:i*20,end:i*20+20,text:'x'.repeat(Math.min(500,n-i*500))}))),meta:{language:'en',format:'textTrack',captureComplete:true},tab,publicationKey:id,fingerprint:id};return vm.runInContext('publishBrowserTrackNow(entry)',sandbox);}
async function main(){
 const oversized=publish('oversized',200001);sandbox.track=oversized;
 const oversizedInput=vm.runInContext('browserSubtitleAutomationInput(track)',sandbox),oversizedDecision=rules.browserAutomationDecision(oversizedInput);
 assert.equal(oversized.cueIdentities.reduce((n,c)=>n+c.text.length,0),200001);assert.equal(oversizedInput.sourceCharacters,32080);assert.equal(oversizedDecision.state,'eligible');
 const accurateControl=rules.browserAutomationDecision({...oversizedInput,sourceCharacters:200001});assert.equal(accurateControl.state,'blocked_by_limit');
 const batch=[];for(const id of ['normal-a','normal-b']){tab.mediaId=id;const track=publish(id,190000);sandbox.track=track;const input=vm.runInContext('browserSubtitleAutomationInput(track)',sandbox);const decision=vm.runInContext('handleBrowserSubtitleAutomation(track)',sandbox);batch.push({id,actualCharacters:track.cueIdentities.reduce((n,c)=>n+c.text.length,0),input,decision});}
 assert.equal(sandbox.calls.length,2);assert.equal(sandbox.player.browserAutomationSessionJobs,2);assert.equal(sandbox.player.browserAutomationLiveCharacters,0);
 const cumulativeControl=rules.browserAutomationDecision({...batch[1].input,sourceCharacters:190000,newCharacters:190000,liveCharacters:190000});assert.equal(cumulativeControl.state,'blocked_by_limit');
 const automation={single:{actualCharacters:200001,input:oversizedInput,decision:oversizedDecision,countercontrol:accurateControl},twoJobs:batch,totalActualCharacters:380000,calls:sandbox.calls,counterLiveCharacters:sandbox.player.browserAutomationLiveCharacters,countercontrol:cumulativeControl,producerEvents:events.map(e=>({type:e.type,hasCharacterCount:Object.hasOwn(e.track,'characterCount'),hasAppendedCharacters:Object.hasOwn(e.track,'appendedCharacters')})),limits:'Gerçek main publisher/persist ve renderer input/handler; asset store/disk/IPC/translation facade kontrollü; gerçek sağlayıcı yok.'};
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const token='fixture-only-local-bridge-token-000000000000';
 const bridge=require(path.join(root,'src/assistant-mcp-bridge')).createBridge({token,port,getJobs:()=>({jobs:[]}),getTabs:()=>({tabs:[]})});
 await bridge.start();let mcp;
 try{
  async function post(body,split,auth=token,origin){return await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/rpc',method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json',...(origin?{Origin:origin}:{})}},res=>{let text='';res.setEncoding('utf8');res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,body:text?JSON.parse(text):null}));});req.on('error',reject);if(split){req.write(body.subarray(0,split));setTimeout(()=>req.end(body.subarray(split)),40);}else req.end(body);});}
  const id='fixture-ş-id',body=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'get_jobs',arguments:{}}}));
  const unsplit=await post(body),asciiBody=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:'ascii-id',method:'ping'}));const asciiSplit=await post(asciiBody,15);
  const splitAt=body.indexOf(Buffer.from('ş'))+1;assert(splitAt>0);const split=await post(body,splitAt),badAuth=await post(body,0,'wrong'),originRejected=await post(body,0,token,'https://fixture.invalid');
  assert.equal(unsplit.body.id,id);assert.equal(asciiSplit.body.id,'ascii-id');assert.notEqual(split.body.id,id);assert.equal(split.status,200);assert.equal(split.body.id,'fixture-��-id');assert.equal(badAuth.status,403);assert.equal(originRejected.status,403);
  mcp={requestedId:id,splitByteOffset:splitAt,unsplit,asciiSplit,split,badAuthStatus:badAuth.status,originRejectedStatus:originRejected.status,limits:'Gerçek createBridge HTTP127.0.0.1; Unicode id iki Buffer arasında bölündü. Gerçek istemci/kişisel MCP ayarı kullanılmadı.'};
 }finally{await bridge.stop();}
 const report={head:readHead(),sourceSha256:sha,automation,mcp,passed:true};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,out,automationSource:oversizedInput.sourceCharacters,actual:200001,total:380000,liveCounter:0,mcpCorruptedId:mcp.split.body.id}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
