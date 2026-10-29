'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {registerMediaWorkflows}=require('../src/media-workflows');
for(const stop of ['cancel','destroyed'])test(`cancelled folder picker cannot return cached season results after ${stop}`,async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'season-cancel-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'season');fs.mkdirSync(dir);for(const name of ['01.mp4','02.mp4'])fs.writeFileSync(path.join(dir,name),'synthetic file metadata only');
 const signature=crypto.createHash('sha256').update(JSON.stringify(['season-spectral-v2',fs.realpathSync(dir),...['01.mp4','02.mp4'].map(name=>{const s=fs.statSync(path.join(dir,name));return [name,s.size,s.mtimeMs];})])).digest('hex');
 const cached=path.join(root,'season-analysis',signature+'.json');fs.mkdirSync(path.dirname(cached));fs.writeFileSync(cached,JSON.stringify({rows:[{name:'01.mp4',intro:[{start:0,end:5}]}],suggestOnly:true}));
 let release;const pick=new Promise(resolve=>release=resolve),handlers={},app=new EventEmitter();app.getPath=()=>root;
 const sender=Object.assign(new EventEmitter(),{id:42,isDestroyed:()=>false,send(){}});
 registerMediaWorkflows({app,ipcMain:{handle:(key,fn)=>handlers[key]=fn},authorized:e=>e.sender===sender,owner:()=>null,dialog:{showOpenDialog:()=>pick},python:()=>process.execPath,ffmpeg:()=>process.execPath,ffprobe:()=>process.execPath});
 const call=r=>handlers['media-workflows:request']({sender},r);
 const pending=call({action:'season-intro',id:'controlled-scan'});
 if(stop==='cancel')await call({action:'cancel'});else sender.emit('destroyed');
 release({canceled:false,filePaths:[dir]});
 const result=await pending;assert.equal(result.ok,false,'Aborted selection cannot return ready cached results');assert(!result.cached);
 assert.equal(sender.listenerCount('destroyed'),0,'Owned cancellation hook is removed');
 assert(fs.existsSync(cached),'Existing valid cache is preserved');
 if(stop==='cancel'){const next=await call({action:'season-intro',id:'fresh-scan'});assert.equal(next.ok,true);assert.equal(next.cached,true,'Cancellation releases the service slot without deleting valid cache');}
});
