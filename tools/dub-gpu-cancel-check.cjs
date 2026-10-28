'use strict';
// Explicit, local-only hardware acceptance. Never touches the user's application/profile.
const fs = require('node:fs'), path = require('node:path');
const cp = require('node:child_process'), assert = require('node:assert/strict');
const {randomInt} = require('node:crypto');
const {createDubEngineWorker} = require('../src/dub-engine-worker');
const {terminateProcessTreeAndWait} = require('../src/process-lifecycle');
const {withoutSecretEnv} = require('../src/settings-security');
function arg(name) {
  const at = process.argv.indexOf(name);
  assert(at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--'), name + ' required');
  return path.resolve(process.argv[at + 1]);
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('Timeout: ' + label)), ms);
  })]); } finally { clearTimeout(timer); }
}
function descendants(pid) {
  assert(Number.isSafeInteger(pid) && pid > 0);
  // PID-only traversal: no command lines, names, credentials, or unrelated process records.
  const script = `function Children([int]$parent) { foreach($c in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$parent")) { [int]$c.ProcessId; Children ([int]$c.ProcessId) } }; @(Children ${pid}) | ConvertTo-Json -Compress`;
  const raw = cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {windowsHide:true, timeout:15000, encoding:'utf8'}).trim();
  const value = raw ? JSON.parse(raw) : [];
  return (Array.isArray(value) ? value : [value]).filter(x => Number.isSafeInteger(x) && x > 0);
}
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
function gpu() {
  return cp.execFileSync('nvidia-smi', ['--query-gpu=memory.free,memory.total', '--format=csv,noheader,nounits'], {windowsHide:true, timeout:5000, encoding:'utf8'}).trim().split(/,\s*/).map(Number);
}
async function main() {
  assert(process.argv.includes('--run-real-gpu-cancel'), 'Explicit --run-real-gpu-cancel required');
  assert.equal(process.platform, 'win32', 'Windows acceptance only');
  const engine = arg('--engine'), reference = arg('--reference'), verifyPython = arg('--verify-python');
  const python = path.join(engine, '.venv', 'Scripts', 'python.exe');
  for (const file of [python, reference, verifyPython]) assert(fs.statSync(file).isFile());
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, '.uiprev', 'gpu-cancel', Date.now() + '-' + process.pid);
  fs.mkdirSync(output, {recursive:true});
  const source = path.join(output, 'synthetic.srt');
  fs.writeFileSync(source, '\uFEFF1\n00:00:00,000 --> 00:00:40,000\nBu kontrollü denemede uzun bir cümleyi seslendiriyoruz. Kitap okumak ve yeni fikirler öğrenmek güzel bir alışkanlıktır. Bugün kütüphaneye gidip farklı hikayeler bulacağız. Birlikte çalışırken her cümlenin doğal akışını korumaya dikkat ediyoruz.\n');
  const env = {...withoutSecretEnv(process.env), PYTHONUTF8:'1', PYTHONIOENCODING:'utf-8', PYTHONUNBUFFERED:'1', VOXCPM_ROOT:engine, HF_HUB_OFFLINE:'1'};
  const inherited = Object.keys(env).find(k => k.toLowerCase() === 'path');
  env.PATH = [path.join(engine,'.venv','Lib','site-packages','torch','lib'), path.join(root,'backend','bin'), env[inherited] || ''].join(path.delimiter);
  for (const key of Object.keys(env)) if (key !== 'PATH' && key.toLowerCase() === 'path') delete env[key];
  const hosts = [], owned = new Set();
  const worker = createDubEngineWorker({spawn:(...args) => {
    const proc = cp.spawn(...args); hosts.push(proc); owned.add(proc.pid); return proc;
  }, terminate:proc => terminateProcessTreeAndWait(proc, {spawn:cp.spawn}), idleMs:60000});
  const options = {cwd:engine, env, windowsHide:true};
  // One recorded seed per probe avoids accidentally taking a previous probe's
  // all-cache path; both cancel and restart use identical generation settings.
  const seed = randomInt(1, 100000000);
  const common = [path.join(root,'tools','voxcpm2','altyazi_oku.py'), source, reference,
    '--mode','clone','--steps','15','--seed',String(seed),'--eszamanli','2','--verification','detailed','--verify-python',verifyPython,'--timing-mode','video'];
  const result = {seed, beforeMiB:gpu(), samples:[], source:'synthetic paragraph', complete:false};
  async function launch(name) {
    const run = await worker.start(python, [...common, '--output',path.join(output,name+'.wav')], options);
    const closed = new Promise(resolve => run.once('close', (code, signal) => resolve({code,signal})));
    const log = fs.createWriteStream(path.join(output,name+'.log'));
    const events = []; let pending = '', readyResolve;
    const ready = new Promise(resolve => { readyResolve = resolve; });
    run.on('error', error => { events.push({error:error.code || 'worker_error'}); });
    run.stderr.on('data', chunk => log.write(chunk));
    run.stdout.on('data', chunk => {
      log.write(chunk); pending += chunk;
      let end;
      while ((end=pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0,end); pending=pending.slice(end+1);
        for (const prefix of ['DUB_ENGINE ', 'DUB_REFERENCE_CACHE ', 'DUB_PHASES ', 'DUB_ACTIVITY ']) if (line.startsWith(prefix)) {
          const data=JSON.parse(line.slice(prefix.length)); events.push({type:prefix.trim(),...data});
          if (prefix==='DUB_REFERENCE_CACHE ') readyResolve();
        }
      }
    });
    closed.then(() => log.end());
    return {run,closed,ready,events};
  }
  try {
    const first = await launch('cancelled');
    await bounded(Promise.race([first.ready, first.closed.then(() => { throw Error('Worker ended before reference preparation'); })]), 120000, 'GPU/reference ready');
    await pause(250);
    const children = descendants(first.run.pid); children.forEach(pid => owned.add(pid));
    assert.equal(first.run.exitCode, null, 'must cancel active work');
    assert(first.events.some(row => row.type==='DUB_ACTIVITY' && row.stage==='synthesis'), 'real synthesis must have started');
    assert(children.length > 0, 'real GPU descendants must be observed');
    const loadedMiB = gpu(), started = performance.now();
    assert.equal(await terminateProcessTreeAndWait(first.run, {spawn:cp.spawn}), true);
    const stopped = await bounded(first.closed, 10000, 'cancel close');
    assert.notEqual(stopped.code, 0, 'interrupted run cannot report success');
    assert.equal(worker.running(), false);
    const end = Date.now()+5000;
    while ([first.run.pid,...children].some(alive) && Date.now()<end) await pause(50);
    assert([first.run.pid,...children].every(pid => !alive(pid)), 'owned descendants must not survive');
    assert(!fs.existsSync(path.join(output,'cancelled.wav')), 'canceled generation must not publish a final WAV');
    result.samples.push({kind:'cancel', observedChildren:children.length, loadedMiB, stopMilliseconds:Math.round(performance.now()-started), allObservedPidsClosed:true, synthesisStarted:true, finalWav:false, exit:stopped});
    const second = await launch('restart');
    const done = await bounded(second.closed, 240000, 'fresh restart completion');
    assert.equal(done.code, 0);
    assert.equal(hosts.length, 2, 'cancellation must force a fresh host');
    const quality=JSON.parse(fs.readFileSync(path.join(output,'restart.quality.json'),'utf8'));
    result.samples.push({kind:'restart', freshHost:true, exit:done, events:second.events, quality});
    const finalChildren=descendants(second.run.pid);finalChildren.forEach(pid=>owned.add(pid));
    assert.equal(await worker.release(), true);
    const releasedBy = Date.now()+10000;
    while ([...owned].some(alive) && Date.now()<releasedBy) await pause(50);
    assert([...owned].every(pid=>!alive(pid)), 'release must close all observed owned PIDs');
    result.afterMiB=gpu(); result.complete=true;
    fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({output,complete:true,observedChildren:children.length,stopMilliseconds:result.samples[0].stopMilliseconds,restartCode:done.code}));
  } finally {
    await worker.release();
    if (!result.complete) fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(result,null,2));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
