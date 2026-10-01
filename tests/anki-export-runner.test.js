'use strict';

// R334 ölü-bölge kilidi — runAnkiExport (src/main.js): kapsam haritasında
// hiç çağrılmayan kullanıcı-yüzeyi fonksiyon. Sözleşme: tek-uçuş kapısı,
// betik varlığı, 32 MB girdi sınırı, 2 dk zaman aşımı, stderr/bozuk-JSON
// hata yolları, son-satır JSON parse + çıktı dosyası doğrulaması,
// settled idempotency.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, 'Bölüm bulunamadı: ' + start);
  return source.slice(from, to);
}

function makeCtx({ appDir, spawnImpl, timerFire = false }) {
  const timers = [];
  const ctx = vm.createContext({
    String, Number, Array, Set, JSON, Buffer, RegExp, Error, Promise,
    Math, Object, Date, console, EventEmitter, process,
    fs, path,
    ankiExportJob: null,
    appResourceRoot: () => appDir,
    resolvePython: () => 'python3',
    spawn: spawnImpl,
    terminateProcessTree: (proc) => { proc.killed = true; },
    setTimeout: (fn) => { timers.push(fn); if (timerFire) fn(); return { unref() {}, ref() {} }; },
    clearTimeout: () => {},
  });
  ctx.__timers = timers;
  return ctx;
}

function evalRunner(ctx) {
  vm.runInContext(
    section('function runAnkiExport(', "ipcMain.handle('browser:research:exportAnki'"),
    ctx);
}

function fakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdout.setEncoding = () => {};
  proc.stderr.setEncoding = () => {};
  proc.stdin = new EventEmitter();
  proc.stdin.end = (data) => { proc.stdin.__data = data; };
  return proc;
}

async function t_busy_gate() {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-anki-'));
  const ctx = makeCtx({ appDir, spawnImpl: () => fakeProc() });
  evalRunner(ctx);
  ctx.ankiExportJob = { proc: {} }; // uçuşta iş var
  const r = await vm.runInContext(
    "runAnkiExport([{id:1}], '/tmp/x.apkg', 'd')", ctx);
  assert.match(r.error, /zaten çalışıyor/);
  fs.rmSync(appDir, { recursive: true, force: true });
}

async function t_missing_script() {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-anki-'));
  const ctx = makeCtx({ appDir, spawnImpl: () => fakeProc() });
  evalRunner(ctx);
  const r = await vm.runInContext(
    "runAnkiExport([{id:1}], '/tmp/x.apkg', 'd')", ctx);
  assert.match(r.error, /bulunamadı/);
  fs.rmSync(appDir, { recursive: true, force: true });
}

async function t_oversize() {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-anki-'));
  fs.mkdirSync(path.join(appDir, 'backend'));
  fs.writeFileSync(path.join(appDir, 'backend', 'export_anki.py'), '# stub');
  const ctx = makeCtx({ appDir, spawnImpl: () => fakeProc() });
  evalRunner(ctx);
  const big = [{ id: 1, text: 'x'.repeat(33 * 1024 * 1024) }];
  const r = await vm.runInContext(
    `runAnkiExport(${JSON.stringify(big)}, '/tmp/x.apkg', 'd')`, ctx);
  assert.match(r.error, /sınırını aşıyor/);
  fs.rmSync(appDir, { recursive: true, force: true });
}

async function t_success_and_kill_tracking() {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-anki-'));
  fs.mkdirSync(path.join(appDir, 'backend'));
  fs.writeFileSync(path.join(appDir, 'backend', 'export_anki.py'), '# stub');
  const outPath = path.join(appDir, 'out.apkg');
  const proc = fakeProc();
  const spawnCalls = [];
  const ctx = makeCtx({
    appDir,
    spawnImpl: (py, args, opts) => {
      spawnCalls.push([py, args, opts]);
      return proc;
    },
  });
  evalRunner(ctx);
  const p = vm.runInContext(`runAnkiExport([{id:1,type:'quote'}], ${JSON.stringify(outPath)}, 'Deck')`, ctx);
  // argv: betik + --output + --deck-name
  // vm-realm dizisi → host dizisine çevir (deepStrictEqual referans eşitliği ister)
  assert.deepStrictEqual(Array.from(spawnCalls[0][1]),
    [path.join(appDir, 'backend', 'export_anki.py'), '--output', outPath, '--deck-name', 'Deck']);
  assert.strictEqual(ctx.ankiExportJob?.proc, proc, 'ankiExportJob uçuşta izlenir');
  // stdin'e notlar JSON olarak gitti
  assert.ok(JSON.parse(String(proc.stdin.__data)).annotations[0].type === 'quote');
  fs.writeFileSync(outPath, 'PKG');
  proc.stdout.emit('data', 'gurultu satir\n{"ok":true,"cards":7}');
  proc.emit('close', 0);
  const r = await p;
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.path, outPath);
  assert.strictEqual(r.cards, 7);
  assert.strictEqual(ctx.ankiExportJob, null, 'iş bittiğinde izleme sıfırlanır');
  fs.rmSync(appDir, { recursive: true, force: true });
}

async function t_error_paths() {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-anki-'));
  fs.mkdirSync(path.join(appDir, 'backend'));
  fs.writeFileSync(path.join(appDir, 'backend', 'export_anki.py'), '# stub');
  const outPath = path.join(appDir, 'out.apkg');

  // spawn throw
  let ctx = makeCtx({ appDir, spawnImpl: () => { throw new Error('boom'); } });
  evalRunner(ctx);
  let r = await vm.runInContext(
    `runAnkiExport([{id:1}], ${JSON.stringify(outPath)}, 'd')`, ctx);
  assert.match(r.error, /başlatılamadı.*boom/);

  // error event ENOENT
  const proc = fakeProc();
  ctx = makeCtx({ appDir, spawnImpl: () => proc });
  evalRunner(ctx);
  let p = vm.runInContext(`runAnkiExport([{id:1}], ${JSON.stringify(outPath)}, 'd')`, ctx);
  proc.emit('error', Object.assign(new Error('no such'), { code: 'ENOENT' }));
  r = await p;
  assert.match(r.error, /sanal ortamı bulunamadı/);

  // close≠0 + stderr
  const proc2 = fakeProc();
  ctx = makeCtx({ appDir, spawnImpl: () => proc2 });
  evalRunner(ctx);
  p = vm.runInContext(`runAnkiExport([{id:1}], ${JSON.stringify(outPath)}, 'd')`, ctx);
  proc2.stderr.emit('data', 'genanki hatasi detayi');
  proc2.emit('close', 3);
  r = await p;
  assert.match(r.error, /genanki hatasi detayi/);

  // close=0 ama bozuk stdout → doğrulama hatası
  const proc3 = fakeProc();
  ctx = makeCtx({ appDir, spawnImpl: () => proc3 });
  evalRunner(ctx);
  p = vm.runInContext(`runAnkiExport([{id:1}], ${JSON.stringify(outPath)}, 'd')`, ctx);
  proc3.stdout.emit('data', 'json degil');
  proc3.emit('close', 0);
  r = await p;
  assert.match(r.error, /doğrulanamadı|JSON/i);
  fs.rmSync(appDir, { recursive: true, force: true });
}

async function t_settled_idempotent() {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-anki-'));
  fs.mkdirSync(path.join(appDir, 'backend'));
  fs.writeFileSync(path.join(appDir, 'backend', 'export_anki.py'), '# stub');
  const proc = fakeProc();
  const ctx = makeCtx({ appDir, spawnImpl: () => proc });
  evalRunner(ctx);
  const p = vm.runInContext("runAnkiExport([{id:1}], '/tmp/x.apkg', 'd')", ctx);
  proc.emit('error', new Error('ilk hata'));
  proc.emit('close', 0); // settled sonrası ikinci finish yok sayılır
  const r = await p;
  assert.match(r.error, /ilk hata/);
  fs.rmSync(appDir, { recursive: true, force: true });
}

async function main() {
  await t_busy_gate();
  await t_missing_script();
  await t_oversize();
  await t_success_and_kill_tracking();
  await t_error_paths();
  await t_settled_idempotent();
  console.log('anki-export-runner: 6 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
