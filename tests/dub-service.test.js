const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { registerDubService } = require('../src/dub-service');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dub-service-'));
const desktop = path.join(root, 'desktop'), engine = path.join(desktop, 'Ses', 'VoxCPM2');
fs.mkdirSync(path.join(engine, '.venv', 'Scripts'), { recursive:true });
for (const name of ['altyazi_oku.py','anlatici_ham.wav','anlatici_ham.txt','.venv/Scripts/python.exe']) fs.writeFileSync(path.join(engine,name), 'fixture');
const srt = path.join(root,'Türkçe.srt'); fs.writeFileSync(srt,'fixture');
const handlers = {}, events = [], calls = []; let child, allowed = true, killOK = true;
const app = new EventEmitter(); app.getPath = name => name === 'desktop' ? desktop : root;
const sender = { isDestroyed:()=>false, send:(_channel,e)=>events.push(e) };
const service = registerDubService({ app, ipcMain:{handle:(name,fn)=>handlers[name]=fn},
  dialog:{}, owner:()=>null, authorized:()=>allowed, authorizeSubtitle:async p=>{ assert.equal(p,srt); return p; },
  busy:()=>false, grantMedia:p=>assert.ok(fs.existsSync(p)), environment:()=>({PATH:'fixture'}),
  spawn:(exe,args,opts)=>{
    calls.push({exe,args,opts}); child=new EventEmitter(); child.exitCode=null;
    child.stdout=new EventEmitter(); child.stderr=new EventEmitter();
    child.stdout.setEncoding=child.stderr.setEncoding=()=>{}; return child;
  }, terminate:()=>killOK });
const call = (name,...args)=>handlers[name]({sender},...args);
(async()=>{
  try {
    assert.equal((await call('dub:config')).ready,true);
    allowed=false; assert.equal((await call('dub:start',{id:'denied',srt})).ok,false); allowed=true;
    assert.equal((await call('dub:start',{id:'../bad',srt})).ok,false);
    assert.equal((await call('dub:start',{id:'test',srt,sample:true})).ok,true);
    assert.equal(service.running(),true);
    assert.equal((await call('dub:start',{id:'second',srt})).ok,false);
    assert.ok(calls[0].args.includes('--limit')); assert.equal(calls[0].opts.env.HF_HUB_DISABLE_XET,'1');
    child.stdout.emit('data','[2/7] private subtitle text\n');
    assert.deepEqual(events.at(-1),{id:'test',type:'progress',done:2,total:7});
    const output=calls[0].args[calls[0].args.indexOf('--output')+1]; fs.writeFileSync(output,'audio');
    child.emit('close',0); assert.equal(service.running(),false); assert.equal(events.at(-1).type,'done');
    assert.ok(events.at(-1).url.startsWith('file:')); assert.equal(events.at(-1).name,'Türkçe-dublaj.wav');
    assert.equal((await call('dub:start',{id:'test',srt})).ok,false,'existing output was overwritten');
    await call('dub:start',{id:'cancel',srt}); killOK=false;
    assert.equal((await call('dub:cancel')).ok,false); assert.equal(service.running(),true);
    killOK=true; assert.equal((await call('dub:cancel')).ok,true); child.emit('close',1);
    assert.equal(events.at(-1).type,'cancelled');
    await call('dub:start',{id:'error',srt}); child.stderr.emit('data','ValueError: timing overflow\n'); child.emit('close',1);
    assert.equal(events.at(-1).type,'error'); assert.match(events.at(-1).error,/timing overflow/);
    console.log('dub-service: authorization, single job, safe output, progress, cancellation and failure passed');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
