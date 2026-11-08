'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS  ${name}`);
}

test('kuyruk köprüsü yalnız ana renderer IPC yüzeyinden sunulur', () => {
  assert.match(preload, /loadQueueState:\s*\(\) => ipcRenderer\.invoke\('queue:load'\)/);
  assert.match(preload, /saveQueueState:\s*\(snapshot\) => ipcRenderer\.invoke\('queue:save', snapshot\)/);
  assert.match(main, /ipcMain\.handle\('queue:load'[\s\S]{0,180}authorizedBrowserSender\(event\)/);
  assert.match(main, /ipcMain\.handle\('queue:save'[\s\S]{0,180}authorizedBrowserSender\(event\)/);
});

test('çalışan kuyruk işi iki taraftan kalıcılaştırılır ve terminal olay ana süreçte yazılır', () => {
  const processQueue = renderer.slice(renderer.indexOf('async function processNextQueueItem'),
    renderer.indexOf('// ===== Helpers ====='));
  assert.match(processQueue, /next\.status = 'running'[\s\S]*await persistQueueNow\(\)/);
  assert.match(main, /activeQueueItemId = jobMeta\.queueItemId;[\s\S]{0,100}persistQueueRunning\(jobMeta\.queueItemId, options/);
  assert.match(main, /event\.type === 'done' \|\| event\.type === 'error'[\s\S]{0,180}persistQueueTerminal/);
  assert.match(main, /if \(!jobMeta\.terminalSeen\) persistQueueTerminal\(jobMeta\.queueItemId, exitEvent/);
});

test('renderer yenilenince yaşayan işe bağlanır, çökmüş iş beklemeye alınır', () => {
  const restore = renderer.slice(renderer.indexOf('async function restorePersistedQueue'),
    renderer.indexOf('async function offerBurnInRecovery'));
  assert.match(restore, /item\.id === activeId && item\.status === 'running'/);
  assert.match(restore, /state\.lastJobVideo = active\.type === 'file' \? active\.input : null/);
  assert.match(restore, /yarım kuyruk işi kurtarıldı/);
  assert.match(renderer, /queueSecretsFromCurrentUi\(next\.opts\)/);
});

test('burn-in kurtarma kaydı preload üzerinden yönetilir ve yollar doğrulanır', () => {
  for (const channel of ['burnin:recovery:get', 'burnin:recovery:recover', 'burnin:recovery:discard']) {
    assert(main.includes(`ipcMain.handle('${channel}'`), `${channel} handler yok`);
    assert(preload.includes(`ipcRenderer.invoke('${channel}'`), `${channel} preload köprüsü yok`);
  }
  // Okuma döngüsü burnin-output.js'te: sürüm-reddi .bak dirilmesini kapatır.
  assert.match(main, /readBurninRecoveryFile\(burninRecoveryStatePath\(\)\)/);
  assert.match(main, /burninRecoveryPathsMatch\(normalized\)/);
  assert.match(main, /replaceBurninOutput\(recovery\.tempPath, recovery\.outPath\)/);
});

test('burn-in başlatma ve iptal yalnız ana renderer tarafından çağrılır', () => {
  const start = main.slice(main.indexOf("ipcMain.handle('burnin:start'"),
    main.indexOf("ipcMain.handle('burnin:cancel'"));
  const cancel = main.slice(main.indexOf("ipcMain.handle('burnin:cancel'"),
    main.indexOf("ipcMain.handle('burnin:recovery:get'"));
  assert.match(start, /authorizedBrowserSender\(event\)/);
  assert.match(cancel, /authorizedBrowserSender\(event\)/);
});

test('burn-in kurtarma PID yanında süreç kimliğini ve tamamlanmış nihai çıktıyı doğrular', () => {
  assert.match(main, /function processNameForPid/);
  assert.match(main, /burninRecoveryProcessMatches/);
  assert.match(main, /burninFinalOutputLooksComplete/);
  assert.match(main, /if \(inspected\.alreadyDone\)/);
  assert.match(renderer, /status\.alreadyDone/);
});

test('başarılı FFmpeg kapanışı geç gelen iptal bayrağına rağmen finalize edilir', () => {
  const start = main.slice(main.indexOf("ipcMain.handle('burnin:start'"),
    main.indexOf("ipcMain.handle('burnin:cancel'"));
  assert.match(start, /if \(ok\) \{[\s\S]{0,160}replaceBurninOutput\(tempPath, outPath\)/);
  assert.doesNotMatch(start, /if \(ok && !job\.cancelled\)/);
});

test('çalışmaya devam eden eski FFmpeg periyodik izlenir ve yarım iş yeniden başlatılabilir', () => {
  const recovery = renderer.slice(renderer.indexOf('async function offerBurnInRecovery'),
    renderer.indexOf('function buildOptsFromUI'));
  assert.match(recovery, /setTimeout\(offerBurnInRecovery, 5000\)/);
  assert.match(recovery, /Tamamlanan videoyu kurtar/);
  assert.match(recovery, /Yarım kalan gömmeyi sürdür/);
  assert.match(recovery, /window\.api\.burnInStart\(result\.videoPath, result\.subPath, result\.recoveryId\)/);
  const restart = main.slice(main.indexOf("ipcMain.handle('burnin:recovery:recover'"),
    main.indexOf("ipcMain.handle('burnin:recovery:discard'"));
  assert.doesNotMatch(restart, /clearBurninRecoveryState\(recovery\.id, true\)/);
  assert.match(main, /if \(job\.previousRecovery && !job\.cancelled\)[\s\S]{0,420}writeBurninRecoveryState\(job\.previousRecovery\)/);
});

console.log(`job-recovery-contracts: ${passed} test`);

require('node:test')('saved result reader restores focus even when closed during a pending read and keeps content as text',async()=>{
 const {JSDOM}=require('jsdom'),vm=require('node:vm'),assert=require('node:assert/strict');
 const dom=new JSDOM('<button id="open">Read result</button>',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let release;w.api={authorizeHistoryFiles:async()=>({ok:true,files:['C:/saved.srt']}),readSubtitle:()=>new Promise(r=>release=r)};w.interfaceChoice=(tr,en)=>en;
 const code=renderer.slice(renderer.indexOf('async function openHistoryResult('),renderer.indexOf('async function openHistoryItem('));vm.runInContext(code,dom.getInternalVMContext());
 try{
  const button=w.document.getElementById('open'),pending=w.openHistoryResult({id:'saved',title:'<img src=x>'},button);await new Promise(r=>setImmediate(r));
  const dialog=w.document.querySelector('.history-result-reader');assert(dialog);assert.equal(dialog.querySelector('h2').textContent,'<img src=x>');assert.equal(dialog.querySelector('img'),null);assert.equal(dialog.querySelector('pre').getAttribute('aria-busy'),'true');
  dialog.close();assert.equal(button.disabled,false);assert.equal(w.document.activeElement,button);
  release({ok:true,text:'<script>unsafe()</script>'});await pending;assert.equal(w.document.querySelector('script'),null);assert.equal(w.document.querySelector('dialog'),null);
 }finally{w.close();}
});

require('node:test')('history playback uses only revalidated files and never opens media after refusal',async()=>{
 const assert=require('node:assert/strict'),vm=require('node:vm');
 const code=renderer;
 const body=code.slice(code.indexOf('async function openHistoryItem('),code.indexOf('// ---- izlerken cumle birlestirme'));
 for(const accepted of [false,true]){
  const opened=[],state={lastJobVideo:'old',outputFiles:['old']};const ctx={player:{openIntent:0},state,window:{api:{authorizeHistoryFiles:async()=>({ok:accepted,video:accepted?'C:/approved.mp4':'',files:accepted?['C:/approved.tr.srt']:[],error:'Source missing'})}},logLine(){},openPlayer:()=>opened.push({...state}),mediaKeyFor(){},$:()=>({classList:{remove(){}}})};
  vm.createContext(ctx);vm.runInContext(body,ctx);await ctx.openHistoryItem({id:'saved',source:'file',video:'C:/moved.mp4',files:['C:/missing.srt','C:/approved.tr.srt']});
  assert.equal(opened.length,accepted?1:0);if(accepted)assert.deepEqual(Array.from(opened[0].outputFiles),['C:/approved.tr.srt']);
 }
});
