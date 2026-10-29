const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {createBrowserAlignment}=require('../../src/browser-alignment');
const python=process.env.WHISPER_TEST_PYTHON||path.resolve('backend/venv/Scripts/python.exe'),ffmpeg=process.env.WHISPER_TEST_FFMPEG||'C:/ffmpeg/bin/ffmpeg.exe';
let child,closed=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function accept(mode){
 let temp,closedAt=0;closed=false;
 const spawnImpl=(exe,args,opts)=>{const p=cp.spawn(exe,args,opts);if(exe===python){child=p;temp=opts.env.WHISPER_ALIGN_TMPDIR;p.once('close',()=>{closed=true;closedAt=performance.now();});}return p;};
 const controller=new AbortController(),cues=Array.from({length:150},(_,i)=>({start:i*12+2,end:i*12+10,text:'Synthetic '+i}));
 const began=performance.now();
 const outcome=createBrowserAlignment({pythonPath:python,ffmpegPath:ffmpeg,spawnImpl}).align({audioPath:path.resolve('tmp/r782/long-synthetic.wav'),targetCues:cues},{signal:controller.signal,timeoutMs:mode==='timeout'?1000:120000}).then(value=>({value}),error=>({error:error.message,closedAtTerminal:closed,terminalAt:performance.now()}));
 const watch=cp.spawn(python,['tmp/r782/observe.py',String(child.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',stderr='';watch.stdout.on('data',b=>output+=b);watch.stderr.on('data',b=>stderr+=b);watch.on('error',()=>{});
 const code=await new Promise(resolve=>watch.once('close',resolve));assert.equal(code,0,'Real FFmpeg child must be observed: '+output+stderr);
 const observed=JSON.parse(output).observed,requested=performance.now();if(mode==='abort')controller.abort();
 const result=await outcome;assert(result.error&&result.closedAtTerminal);assert.equal(fs.existsSync(temp),false);assert.match(result.error,mode==='abort'?/iptal/:/zaman aşımına/);
 for(const row of observed){let alive=true;for(let i=0;i<30;i++){try{process.kill(row.pid,0);}catch{alive=false;break;}await wait(30);}assert(!alive,'Observed PID still alive: '+row.name);}
 const terminalDurationMs=result.terminalAt-began,abortToTerminalMs=mode==='abort'?result.terminalAt-requested:null;
 const referenceCues=[1,12,23].map((start,i)=>({start,end:start+8,text:'Synthetic '+i}));const freshStarted=performance.now();const fresh=await createBrowserAlignment({pythonPath:python,ffmpegPath:ffmpeg}).align({audioPath:path.resolve('tmp/r782/short-synthetic.mp4'),targetCues:referenceCues});assert.equal(fresh.cues.length,3);
 return {mode,ok:true,terminalDurationMs,abortToTerminalMs,closeBeforeTerminal:closedAt<=result.terminalAt,observedProcesses:observed.map(r=>r.name),observedPidsExited:true,tempRemoved:true,freshAlignmentCues:fresh.cues.length,freshAlignmentMs:performance.now()-freshStarted,error:result.error};
}
(async()=>{const results=[];for(const mode of ['abort','timeout'])results.push(await accept(mode));const report={head:cp.execFileSync('git',['rev-parse','HEAD']).toString().trim(),platform:process.platform,node:process.version,workload:'real browser_align.py/ffsubsync/FFmpeg; synthetic1800sWAV; fresh35sMP4',results};fs.writeFileSync('tmp/r782/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));})().catch(e=>{console.error(e.stack);if(child&&!closed)cp.spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true});process.exitCode=1});
