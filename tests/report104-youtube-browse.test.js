const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const start = main.indexOf('let _ytBrowseTail = Promise.resolve();');
const end = main.indexOf("ipcMain.handle('youtube:browse'", start);
assert(start > 0 && end > start);
const enqueue = vm.runInNewContext(`${main.slice(start, end)}\nytBrowseSerialized`, { Promise });

(async () => {
  let release;
  const started = new Promise((resolve) => { release = resolve; });
  const called = [];
  const first = enqueue('FEa', async () => { called.push('first'); await started; return 1; }, true);
  await Promise.resolve();
  const stale = enqueue('FEb', () => { called.push('stale'); return 2; }, true);
  const latest = enqueue('FEb', () => { called.push('latest'); return 3; }, true);
  release();
  assert.equal(await first, 1);
  const superseded = await stale;
  assert.equal(superseded.superseded, true);
  assert.equal(await latest, 3);
  assert.deepEqual(called, ['first', 'latest']);
  const continuation = enqueue('FEa', () => 'continuation', false);
  assert.equal(await continuation, 'continuation');
  // Ayrı browseId'ler birbirini geçersiz kılmaz (R112-01): FEb kuyruğu
  // FEc'nin bekleyen işini düşürmez.
  const otherBid = enqueue('FEc', () => { called.push('other'); return 4; }, true);
  assert.equal(await otherBid, 4);
  console.log('report104 YouTube browse queue regressions: ok');
})().catch((error) => { console.error(error); process.exitCode = 1; });
