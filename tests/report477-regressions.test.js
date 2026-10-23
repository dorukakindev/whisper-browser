const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { EventEmitter } = require('node:events');
const { createResourceScheduler } = require('../src/job-resource-scheduler');
const profiles = require('../src/browser-site-profiles');
function childProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdout.setEncoding = child.stderr.setEncoding = child.stderr.resume = () => {};
  return child;
}
async function dubFixture(t, saved = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report477-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const handlers = {}, calls = [], app = new EventEmitter();
  app.getPath = name => path.join(root, name);
  fs.mkdirSync(app.getPath('userData'), { recursive:true });
  fs.writeFileSync(path.join(app.getPath('userData'), 'dub-settings.json'), JSON.stringify(saved));
  const srt = path.join(root, 'ses.srt'); fs.writeFileSync(srt, 'subtitle');
  require('../src/dub-service').registerDubService({ app, ipcMain:{handle:(name,fn)=>handlers[name]=fn},
    authorized:()=>true, busy:()=>false, authorizeSubtitle:async()=>srt, owner:()=>null,
    environment:()=>({Path:'configured-tools'}), terminate:async()=>true,
    spawn:(exe,args,options)=>{const child=childProcess();calls.push({exe,args,options,child});return child;} });
  const sender = new EventEmitter(); sender.id=1;sender.isDestroyed=()=>false;
  await handlers['dub:config']({sender}); // Complete asynchronous storage migration first.
  return { call:(name,...args)=>handlers[name]({sender},...args), calls };
}
test('477-01: invalid persisted voice config recovers defaults', async t => {
  for (const saved of [null, [], {engine:42,reference:{},transcript:[]}]) {
    const f=await dubFixture(t,saved), result=await f.call('dub:config');
    assert.equal(result.ok,true);assert.equal(typeof result.engine,'string');
  }
});
test('477-02: configured Windows Path survives both voice subprocess paths', async t => {
  const f=await dubFixture(t);
  const pending=f.call('dub:plan',{srt:'ses.srt'});
  await new Promise(setImmediate);
  f.calls[0].child.stdout.emit('data',JSON.stringify({sourceHash:'fixture',groups:[{key:'1',text:'Merhaba',seconds:1}]}));
  f.calls[0].child.emit('close',0);await pending;
  assert.equal(f.calls[0].options.env.PATH,'configured-tools');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'report477-background-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const exe=path.join(root,'backend/separator-venv/Scripts/python.exe');
  fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'fixture');
  let spawned, options;
  const output=path.join(root,'out.wav');fs.writeFileSync(output,require('./helpers/wav-fixture')());
  const ready=require('../src/dub-background').prepareBackground({appRoot:root,userData:root,source:'x',srt:'x',output,
    ffmpeg:'ffmpeg',downloadPython:'python',environment:()=>({Path:'configured-tools'}),
    isCancelled:()=>false,onProcess:()=>{},status:()=>{},spawn:(_exe,_args,opts)=>{options=opts;spawned=childProcess();return spawned;}});
  spawned.emit('close',0);await ready;
  assert.ok(options.env.PATH.endsWith(path.delimiter+'configured-tools'));
  assert.equal(options.env.Path,undefined);
});
test('477-03: repeated resource classes occupy only one slot',()=>{
  const s=createResourceScheduler({cpu:2});s.enqueue({id:'one',classes:['cpu','cpu']});
  assert.equal(s.snapshot().classes.cpu.count,1);
  assert.equal(s.enqueue({id:'two',classes:['cpu']}),'running');
});
test('477-04: changing a scheduler snapshot cannot leak a running resource',()=>{
  const s=createResourceScheduler({cpu:1});s.enqueue({id:'one',classes:['cpu']});
  s.snapshot().running[0].classes.length=0;s.release('one');
  assert.equal(s.enqueue({id:'two',classes:['cpu']}),'running');
});
test('477-05: freeing a multi-resource job dispatches every eligible waiter',()=>{
  const dispatched=[],s=createResourceScheduler({cpu:1,disk:1},{onDispatch:id=>dispatched.push(id)});
  s.enqueue({id:'both',classes:['cpu','disk']});s.enqueue({id:'cpu',classes:['cpu']});s.enqueue({id:'disk',classes:['disk']});
  s.release('both');assert.deepEqual(dispatched,['cpu','disk']);assert.equal(s.snapshot().queued.length,0);
});
test('477-06: inherited field names cannot be saved as site or path options',()=>{
  for(const field of ['constructor','toString','__proto__']) {
    assert.equal(profiles.withBrowserSiteProfileField({},'https://example.test',field,2).ok,false);
    assert.equal(profiles.withBrowserPathProfileField({},'https://example.test/video',field,2).ok,false);
  }
});
test('477-07: IPv6 zoom settings survive legacy profile migration',()=>{
  const result=profiles.normalizeBrowserSiteProfiles({}, {'[::1]':1.5});
  assert.deepEqual(result,{'https://[::1]':{zoom:1.5}});
});
test('477-08: malformed successful subprocess plans are rejected',async t=>{
  const f=await dubFixture(t);
  for(const plan of [null,{}, {sourceHash:'x',groups:[null]}, {sourceHash:'x',groups:[{key:'1',text:'hello',seconds:0}]}]) {
    const pending=f.call('dub:plan',{srt:'x'});await new Promise(setImmediate);
    const child=f.calls.at(-1).child;child.stdout.emit('data',JSON.stringify(plan));child.emit('close',0);
    assert.equal((await pending).ok,false);
  }
});
test('477-09: corrupted model score rows do not crash settings or event recording',()=>{
  const score=require('../src/translation-model-score');
  const store={model:[null,{batches:4,invalid:1,rejections:{}},{batches:'bad',invalid:9}]};
  assert.equal(score.describe(store,'model').level,'poor');
  const full=Object.fromEntries(Array.from({length:40},(_,i)=>['broken'+i,null]));
  const next=score.recordRun(full,{model:'fresh',batches:4,invalid_batches:1});
  assert.equal(score.summarize(next,'fresh').batches,4);
});
test('477-10: absent closed-tab volume/rate use defaults while explicit zero remains muted',()=>{
  const {normalizeClosedBrowserTab:normalize}=require('../src/browser-tab-history');
  for(const value of [null,'',false]) {
    const restored=normalize({url:'https://example.test',volume:value,rate:value});
    assert.equal(restored.volume,1);assert.equal(restored.rate,1);
  }
  assert.equal(normalize({url:'https://example.test',volume:0}).volume,0);
});
