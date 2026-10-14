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
    assert.equal((await call('dub:start',{id:'invalid-profile',srt,profile:'unsafe'})).ok,false);
    assert.equal((await call('dub:start',{id:'test',srt,sample:true})).ok,true);
    assert.equal(service.running(),true);
    assert.equal((await call('dub:start',{id:'second',srt})).ok,false);
    assert.ok(calls[0].args.includes('--limit')); assert.equal(calls[0].opts.env.HF_HUB_DISABLE_XET,'1');
    assert.equal(calls[0].args[calls[0].args.indexOf('--tasarsa')+1], 'kirp');
    assert.equal(calls[0].args[calls[0].args.indexOf('--steps')+1], '15');
    assert.equal(calls[0].args[calls[0].args.indexOf('--eszamanli')+1], '4');
    child.stdout.emit('data','[2/7] private subtitle text\n');
    assert.deepEqual(events.at(-1),{id:'test',type:'progress',done:2,total:7});
    child.stdout.emit('data','Zamanlama: 2 grup hizlandirildi, 0 grup kirpildi, 0 grup tasiyor.\nSes: 2.0 dk | Islem: 1.1 dk\n');
    child.stdout.emit('data','DUB_METRICS {"attempts":8,"retries":1,"generation_seconds":12,"unexpected":"private"}\n');
    const output=calls[0].args[calls[0].args.indexOf('--output')+1]; fs.writeFileSync(output,'audio');
    child.emit('close',0); assert.equal(service.running(),false); assert.equal(events.at(-1).type,'done');
    assert.ok(events.at(-1).url.startsWith('file:')); assert.equal(events.at(-1).name,'Türkçe-dublaj.wav');
    const finished = events.at(-1);
    const summary = JSON.parse(fs.readFileSync(finished.logPath, 'utf8'));
    assert.equal(summary.result, 'done'); assert.equal(summary.sample, true);
    assert.equal(summary.metrics.retries, 1);
    assert.equal(summary.metrics.unexpected, undefined);
    assert.equal(summary.settings.steps, 15);
    assert.equal(summary.timing.clipped, 0);
    assert.deepEqual(summary.progress, { done:2, total:7 });
    assert.ok(summary.elapsedSeconds >= 0); assert.ok(Date.parse(summary.finishedAt) >= Date.parse(summary.startedAt));
    const records = fs.readFileSync(finished.logPath.replace(/\.json$/, '.ndjson'), 'utf8');
    assert.match(records, /"type":"progress"/); assert.doesNotMatch(records, /private subtitle text/);
    assert.match(records, /Islem: 1.1 dk/);
    assert.equal((await call('dub:start',{id:'test',srt})).ok,false,'existing output was overwritten');
    await call('dub:start',{id:'cancel',srt,profile:'fast',concurrency:8}); killOK=false;
    assert.equal(calls.at(-1).args[calls.at(-1).args.indexOf('--steps')+1], '10');
    assert.equal(calls.at(-1).args[calls.at(-1).args.indexOf('--eszamanli')+1], '8');
    assert.equal((await call('dub:config')).concurrency, 8);
    assert.equal((await call('dub:cancel')).ok,false); assert.equal(service.running(),true);
    killOK=true; assert.equal((await call('dub:cancel')).ok,true); child.emit('close',1);
    assert.equal(events.at(-1).type,'cancelled');
    assert.equal(JSON.parse(fs.readFileSync(events.at(-1).logPath, 'utf8')).result, 'cancelled');
    await call('dub:start',{id:'error',srt}); child.stderr.emit('data','ValueError: timing overflow\n'); child.emit('close',1);
    assert.equal(events.at(-1).type,'error'); assert.match(events.at(-1).error,/timing overflow/);
    assert.equal(JSON.parse(fs.readFileSync(events.at(-1).logPath, 'utf8')).exitCode, 1);
    fs.rmSync(path.join(root, 'dub-logs'), {recursive:true,force:true});
    fs.writeFileSync(path.join(root, 'dub-logs'), 'blocked directory');
    assert.equal((await call('dub:start',{id:'log-failure',srt})).ok,true);
    const fallback=calls.at(-1).args[calls.at(-1).args.indexOf('--output')+1]; fs.writeFileSync(fallback,'audio');
    child.emit('close',0);
    assert.equal(events.at(-1).type,'done'); assert.ok(events.at(-1).logError, 'log failure must be reported without losing audio');
    console.log('dub-service: authorization, single job, safe output, progress, cancellation and failure passed');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
