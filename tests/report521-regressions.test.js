const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{execFileSync}=require('node:child_process'),{EventEmitter}=require('node:events');
const wav=require('./helpers/wav-fixture');const root=path.resolve(__dirname,'..');
function load(file){
  if(!process.env.AUDIT_BASELINE)return require('../'+file);
  const filename=path.join(root,file),m={exports:{}};
  const source=execFileSync('git',['show','8bd73d8e7bb75571e20232ecd5877f025737f800:'+file],{cwd:root,encoding:'utf8'});
  vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename})(createRequire(filename),m,m.exports);
  return m.exports;
}
const checks=[];const test=(name,fn)=>checks.push([name,fn]);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'audit521-'));
test('unsupported/truncated WAV data is not playable output',()=>{
 const {validVoiceOutput}=load('src/voice-output.js');const file=path.join(dir,'audio.wav');
 fs.writeFileSync(file,wav());assert.equal(validVoiceOutput(file),true);
 for(const mutation of [b=>b.writeUInt16LE(17,20),b=>b.writeUInt32LE(55,40),b=>b.writeUInt32LE(1,4),b=>b.writeUInt16LE(0,34)]){
  const b=wav();mutation(b);fs.writeFileSync(file,b);assert.equal(validVoiceOutput(file),false);
 }
});
test('unrecoverable subtitle preferences never overwrite old data',()=>{
 const {BrowserSubtitlePreferences}=load('src/browser-subtitle-preferences.js');let writes=0;
 const s=new BrowserSubtitlePreferences({read:()=>{throw Error('corrupt');},readBackup:()=>{throw Error('corrupt backup');},write:()=>writes++});
 assert.throws(()=>s.put({mediaId:'x',url:'https://video.test/x',subtitleSelection:{primaryFile:'a.srt'},subtitleMode:'both'}));assert.equal(writes,0);
 const newer=new BrowserSubtitlePreferences({read:()=>({version:1,items:[null]}),write:()=>writes++});assert.throws(()=>newer.remove('x'));assert.equal(writes,0);
});
test('synchronous failed process kill reports false and stays retryable',()=>{
 const {terminateProcessTree}=load('src/process-lifecycle.js');
 for(const platform of ['linux','win32']){
  const proc={exitCode:null,signalCode:null,pid:12,kill:()=>false};
  assert.equal(terminateProcessTree(proc,{platform,spawn:()=>{throw Error('taskkill missing')},killFn:()=>false}),false);
  assert.equal(proc._terminating,false);
 }
});
test('Stop waits for actual close; failed async taskkill remains retryable',async()=>{
 const {terminateProcessTreeAndWait}=load('src/process-lifecycle.js');
 assert.equal(typeof terminateProcessTreeAndWait,'function');
 const c=new EventEmitter();c.pid=9;c.exitCode=c.signalCode=null;c.kill=()=>false;
 const killer=new EventEmitter();
 const stopping=terminateProcessTreeAndWait(c,{platform:'win32',spawn:()=>killer,waitMs:20});
 killer.emit('error',Error('denied'));
 assert.equal(await stopping,false);assert.equal(c._terminating,false);
 c.kill=()=>true;
 const retry=terminateProcessTreeAndWait(c,{platform:'linux',killFn:()=>true,waitMs:20});
 c.exitCode=1;c.emit('close',1);assert.equal(await retry,true);
});
function worker(){const c=new EventEmitter();c.exitCode=c.signalCode=null;c.stdout=new EventEmitter();c.stderr=new EventEmitter();c.stdout.setEncoding=c.stderr.setEncoding=c.stderr.resume=()=>{};return c;}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
test('prosody timeout retains ownership until actual child close',async()=>{
 const {prepareProsody}=load('src/dub-prosody.js');let owned,timeout;const child=worker(),out=path.join(dir,'delivery.json');fs.writeFileSync(out,'{}');
 const realTimer=global.setTimeout;global.setTimeout=fn=>{timeout=fn;return {unref(){}};};
 let pending;try{pending=prepareProsody({source:'s',srt:'s',output:out,appRoot:dir,python:'p',ffmpeg:'f',spawn:()=>child,environment:()=>({}),isCancelled:()=>false,status:()=>{},onProcess:p=>owned=p,terminate:async()=>true,setTimeoutFn:fn=>{timeout=fn;return {unref(){}};},clearTimeoutFn:()=>{}});}finally{global.setTimeout=realTimer;}
 const result=pending.then(()=>true,()=>false);
 try{assert.equal(typeof timeout,'function');timeout();await flush();assert.equal(owned,child,'a kill request is not child completion');}
 finally{child.exitCode=0;child.emit('close',0);}
 assert.equal(await result,false,'expired jobs cannot report success');assert.equal(owned,null);
});
test('background preparation has a bounded owned timeout',async()=>{
 const {prepareBackground}=load('src/dub-background.js');let owned,timeout,kills=0;const child=worker();
 const python=path.join(dir,'backend/separator-venv/Scripts/python.exe');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'fixture');
 const output=path.join(dir,'background.wav');fs.writeFileSync(output,wav());
 const pending=prepareBackground({source:'s',srt:'s',output,appRoot:dir,userData:dir,downloadPython:'p',ffmpeg:'f',spawn:()=>child,environment:()=>({}),isCancelled:()=>false,status:()=>{},onProcess:p=>owned=p,terminate:async()=>{kills++;return true;},setTimeoutFn:fn=>{timeout=fn;return {unref(){}};},clearTimeoutFn:()=>{}});
 const result=pending.then(()=>true,()=>false);
 try{assert.equal(typeof timeout,'function');timeout();await flush();assert.equal(kills,1);assert.equal(owned,child);}
 finally{child.exitCode=0;child.emit('close',0);}
 assert.equal(await result,false);assert.equal(owned,null);
});
(async()=>{let failures=0;for(const [name,fn] of checks){try{await fn();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+': '+e.message);}}console.log(`${checks.length-failures}/${checks.length} passed`);if(failures)process.exitCode=1;})().finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
