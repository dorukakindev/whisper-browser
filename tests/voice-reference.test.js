const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { registerDubService } = require('../src/dub-service');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-reference-'));
const app = new EventEmitter(); app.getPath = () => root;
let allowed = true, mode = 'ready', release, terminated = 0, preparation;
const handlers = {}, events = [];
const sender = { isDestroyed: () => false, send: (_channel, event) => events.push(event) };
const service = registerDubService({ app, ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
  authorized: () => allowed, busy: () => false, environment: () => ({}), grantMedia: file => assert(fs.existsSync(file)),
  terminate: async () => { terminated++; return true; },
  prepareReference: async options => {
    preparation = options; options.status('transcribe_cuda');
    fs.writeFileSync(options.reference, Buffer.alloc(100)); fs.writeFileSync(options.transcript, 'Reference speech.');
    if (mode === 'hold') { options.onProcess({ exitCode: null }); await new Promise(resolve => { release = resolve; }); options.onProcess(null); }
    if (mode === 'fail') { fs.writeFileSync(options.metadata,'invalid');fs.writeFileSync(options.reference.replace(/\.wav$/,'.partial.wav'),'partial');throw new Error('fixture failure'); }
  } });
const call = (name, request) => handlers[name]({ sender }, request);
const request = () => ({ id: randomUUID(), range: { start: 5, end: 25 } });
const tick = () => new Promise(setImmediate);
(async () => {
  allowed = false; assert.equal((await call('dub:references')).ok, false); allowed = true;
  assert.equal((await call('dub:referencePrepare', { ...request(), range: { start: 5, end: 40 } })).ok, false);
  assert.equal((await call('dub:referencePrepare', { ...request(), id: '../outside' })).ok, false);
  const good = { ...request(), name: '  Türkçe anlatıcı  ' }, result = await call('dub:referencePrepare', good);
  assert(result.ok); assert.equal(preparation.start, 5); assert.equal(preparation.end, 25);
  assert.equal(service.running(), false);
  assert(events.some(event => event.type === 'reference_status' && event.stage === 'transcribe_cuda'));
  assert.equal((await call('dub:referencePrepare', good)).ok, false);
  const library = await call('dub:references'); assert.equal(library.references.length, 1);
  assert.equal(library.references[0].id, good.id);
  assert.equal(library.references[0].name, 'Türkçe anlatıcı');
  assert.equal((await call('dub:referenceRename', { id: good.id, name: '  Yeni ses adı  ' })).ok, true);
  assert.equal((await call('dub:references')).references[0].name, 'Yeni ses adı');
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'Sesler', 'Ses referansları', good.id, 'reference.json'), 'utf8'));
  assert.equal(metadata.createdAt, library.references[0].createdAt);
  for (const name of ['', ' ', 'x'.repeat(161), 'line\nname', 123]) {
    assert.equal((await call('dub:referenceRename', { id: good.id, name })).ok, false);
  }
  assert.equal((await call('dub:referenceRename', { id: '../outside', name: 'name' })).ok, false);
  allowed = false;
  assert.equal((await call('dub:referenceRename', { id: good.id, name: 'blocked' })).ok, false);
  allowed = true;

  assert.equal(await call('dub:referenceUse', { id: good.id, text: '' }).then(r => r.ok), false);
  assert.equal((await call('dub:referenceUse', { id: good.id, text: 'Corrected transcript.' })).ok, true);
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'dub-settings.json'), 'utf8'));
  assert.equal(saved.reference, result.reference.path); assert.equal(fs.readFileSync(saved.transcript, 'utf8'), 'Corrected transcript.');
  mode = 'hold'; const pending = call('dub:referencePrepare', request()); await tick();
  assert.equal(service.running(), true);
  assert.equal((await call('dub:referenceRename', { id: good.id, name: 'busy' })).ok, false);
  assert.equal((await call('dub:referencePrepare', request())).ok, false);
  assert.equal((await call('dub:start', { id: 'blocked' })).ok, false);
  assert.equal((await call('dub:referenceUse', { id: good.id })).ok, false);
  assert.equal((await call('dub:cancel')).ok, true); assert.equal(terminated, 1);
  release(); const stopped = await pending; assert.equal(stopped.cancelled, true); assert.equal(service.running(), false);
  assert.equal((await call('dub:references')).references.length, 1, 'cancelled output must not enter the library');
  const cancelledId=preparation.request.id;
  for (const file of ['reference.wav','reference.txt','reference.json','reference.partial.wav']) assert.equal(fs.existsSync(path.join(root,'Sesler','Ses referansları',cancelledId,file)),false);
  mode = 'fail'; const failed=request();assert.equal((await call('dub:referencePrepare', failed)).ok, false);
  for (const file of ['reference.wav','reference.txt','reference.json','reference.partial.wav']) assert.equal(fs.existsSync(path.join(root,'Sesler','Ses referansları',failed.id,file)),false);
  assert.equal(fs.readFileSync(result.reference.path).length,100,'existing reference must survive another failed job');
  assert.equal(service.running(), false);
  let newest;
  for (let index=0; index<105; index++) {
    const id=index===104 ? '00000000-0000-4000-8000-000000000001' : `ffffffff-ffff-4fff-8fff-${String(index).padStart(12,'0')}`, folder=path.join(root,'Sesler','Ses referansları',id);
    fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'reference.wav'),Buffer.alloc(100));
    fs.writeFileSync(path.join(folder,'reference.txt'),'fixture');
    fs.writeFileSync(path.join(folder,'reference.json'),JSON.stringify({name:String(index),createdAt:new Date(Date.UTC(2040,0,1,0,0,index)).toISOString()}));
    newest=id;
  }
  const recent=await call('dub:references');
  assert.equal(recent.references.length,100);assert.equal(recent.references[0].id,newest,'the newest reference must survive the library limit');
  console.log('voice-reference: authorization, range, library, transcript, busy lock, cancellation and failure passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
