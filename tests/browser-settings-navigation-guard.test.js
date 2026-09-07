const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const start = source.indexOf('function browserSettingsSurfaceVisible(');
const end = source.indexOf("if ($('browserBack'))", start);
assert(start >= 0 && end > start, 'Tarayıcı gezinme komutu koruması bulunamadı.');

const calls = [];
const notices = [];
const context = {
  player: { browserSurface: 'settings' },
  browserCommand: async (...args) => { calls.push(args); return { ok: true }; },
  setBrowserSignal: (...args) => notices.push(args),
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

(async () => {
  const blocked = await context.runBrowserChromeCommand('reload');
  assert.equal(blocked.blocked, true);
  assert.equal(calls.length, 0, 'Ayarlar görünürken reload IPC yoluna gitmemeli.');
  assert.match(notices[0][0], /ayarları açıkken/);

  context.player.browserSurface = 'web';
  const allowed = await context.runBrowserChromeCommand('reload');
  assert.equal(allowed.ok, true);
  assert.deepEqual(calls, [['reload']]);

  context.player.browserSurface = 'settings';
  await context.runBrowserChromeCommand('play');
  assert.deepEqual(calls, [['reload'], ['play']], 'Koruma yalnız gezinme komutlarını kapsamalı.');
  console.log('Tarayıcı ayar yüzeyi gezinme koruması geçti.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
