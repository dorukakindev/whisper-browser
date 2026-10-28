'use strict';
// Explicit opt-in. The production Python speech translation pipeline receives
// only a synthetic relay credential. The real key stays in the broker/relay.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict');
if(!process.argv.includes('--run-live-speech-translation')){console.error('Explicit --run-live-speech-translation required; paid DeepSeek standard inference.');app.exit(2);return;}
const root=path.resolve(__dirname,'..'),flag=process.argv.indexOf('--source');
if(flag<0||!process.argv[flag+1]){console.error('--source synthetic.srt required');app.exit(2);return;}
const source=path.resolve(process.argv[flag+1]);assert(fs.statSync(source).isFile()&&fs.statSync(source).size<=100000);
const out=path.join(root,'.uiprev','speech-translation-live',Date.now()+'-'+process.pid);fs.mkdirSync(path.join(out,'profile'),{recursive:true});app.setPath('userData',path.join(out,'profile'));app.commandLine.appendSwitch('disable-gpu');
let key='',requests=0,backend;const records=[],events=[];
function stopBackend(){if(backend?.pid&&backend.exitCode===null&&backend.signalCode===null){cp.spawnSync('taskkill',['/PID',String(backend.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}backend=null;}
const keyReady=new Promise((resolve,reject)=>{
 const child=cp.spawn(process.execPath,[path.join(root,'tools/assistant-deepseek-native.cjs'),'--credential-broker'],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const timer=setTimeout(()=>{child.kill();reject(Error('Credential broker timeout'))},20000);
 child.on('message',m=>{if(m?.type==='credential'){key=m.key;clearTimeout(timer);resolve()}else if(m?.type==='error'){clearTimeout(timer);reject(Error('Credential broker failed'))}});
 child.on('error',()=>{clearTimeout(timer);reject(Error('Credential broker failed'))});
 child.on('exit',()=>{if(!key){clearTimeout(timer);reject(Error('Credential unavailable'))}});
});keyReady.catch(()=>{});
const relay=http.createServer((req,res)=>{
 let body='';req.on('data',b=>{body+=b;if(body.length>1000000)req.destroy()});
 req.on('end',async()=>{try{
  await keyReady;const input=JSON.parse(body);assert.equal(input.model,'deepseek-ai/DeepSeek-V4.1-Flash-1017');assert(!input.service_tier);if(++requests>40)throw Error('Live evaluation request budget exceeded');
  const began=Date.now(),response=await fetch('https://api.deepinfra.com/v1/openai/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(input),signal:AbortSignal.timeout(90000)});
  const text=await response.text();records.push({request:input,status:response.status,elapsedMs:Date.now()-began,response:response.ok?JSON.parse(text):{error:'Provider request failed'}});
  fs.writeFileSync(path.join(out,'requests.json'),JSON.stringify(records,null,2));res.writeHead(response.status,{'Content-Type':'application/json'});res.end(response.ok?text:'{"error":"Provider request failed"}');
 }catch{res.writeHead(502);res.end('{"error":"Live evaluation relay failed"}')}});
});
app.whenReady().then(async()=>{
 await keyReady;await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve));
 const args=[path.join(root,'backend/transcribe.py'),'--input',source,'--translate-only','true','--translate','true','--language','en','--translate-to','tr','--translate-base-url',`http://127.0.0.1:${relay.address().port}/v1`,'--translate-model','deepseek-ai/DeepSeek-V4.1-Flash-1017','--translate-workers','1','--translate-cache','false','--translate-for-speech','true','--translate-refine','true','--output-dir',path.join(out,'translated'),'--formats','srt,json'];
 backend=cp.spawn(path.join(root,'backend/venv/Scripts/python.exe'),args,{cwd:root,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',WHISPER_TRANSLATE_API_KEY:'synthetic-relay-only'}});
 backend.stdout.setEncoding('utf8');backend.stderr.setEncoding('utf8');
 let pending='',stderr='';backend.stdout.on('data',b=>{pending+=b;let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);try{events.push(JSON.parse(line))}catch{}}fs.writeFileSync(path.join(out,'events.json'),JSON.stringify(events,null,2))});backend.stderr.on('data',b=>{stderr=(stderr+b).slice(-16000)});
 const code=await new Promise((resolve,reject)=>{backend.once('error',reject);backend.once('close',resolve)});backend=null;
 const done=events.findLast(e=>e.type==='done'),quality=events.findLast(e=>e.type==='quality_report');
 const complete=!!done&&quality?.translation_failed===0&&quality?.translation_untranslated===0&&quality?.translation_empty===0&&quality?.translation_timing_mismatch===0;
 const result={code,requests,standardTier:true,complete,quality:quality||null,done:done||null,errors:events.filter(e=>e.type==='error')};fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(out,'stderr.txt'),stderr);key='';relay.close();console.log(JSON.stringify({out,code,requests,complete}));app.exit(code===0&&complete?0:1);
}).catch(()=>{stopBackend();key='';relay.close();console.error('Live speech translation acceptance failed; inspect isolated evidence.');app.exit(1)});
app.on('will-quit',stopBackend);
setTimeout(()=>{stopBackend();key='';relay.close();console.error('Live speech translation acceptance timed out');app.exit(2)},360000).unref();
