'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
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
  assert.match(main, /activeQueueItemId = jobMeta\.queueItemId;[\s\S]{0,100}persistQueueRunning\(jobMeta\.queueItemId, options\)/);
  assert.match(main, /event\.type === 'done' \|\| event\.type === 'error'[\s\S]{0,180}persistQueueTerminal/);
  assert.match(main, /if \(!jobMeta\.terminalSeen\) persistQueueTerminal\(jobMeta\.queueItemId, exitEvent\)/);
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
  assert.match(main, /normalizeBurninRecovery\(JSON\.parse/);
  assert.match(main, /burninRecoveryPathsMatch\(recovery\)/);
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
