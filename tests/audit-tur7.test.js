const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');

// Hata 168: güvenilir arka plan sekmesinin dinamik sayfa blokları kendi
// sekme oturumuna gider; kullanıcı eylemi gerektiren mesajlar aktif kalır.
const bridgeStart = main.indexOf("ipcMain.on('browser:trusted-bridge'");
const bridgeEnd = main.indexOf('\n});', bridgeStart) + 4;
const sender = { mainFrame: {} };
sender.isDestroyed = () => false;
const background = { id: 'background', view: { webContents: sender } };
let bridgeHandler;
let acceptedBlocks = 0;
let mangaEdits = 0;
let captures = 0;
vm.runInNewContext(main.slice(bridgeStart, bridgeEnd), {
  ipcMain: { on: (_channel, fn) => { bridgeHandler = fn; } },
  browserTabs: new Map([['background', background]]),
  browserActiveTabId: 'active',
  acceptDynamicBrowserPageBlocks: () => { acceptedBlocks++; },
  applyMangaEditFromPage: () => { mangaEdits++; },
  applyBrowserOverlayStyleFromPage() {},
  captureBrowserMangaPosition: async () => { captures++; },
});
const event = { sender, senderFrame: sender.mainFrame };
bridgeHandler(event, { type: 'page-blocks', payload: { bridgeToken: 'x', blocks: [] } });
bridgeHandler(event, { type: 'manga-edit', payload: {} });
bridgeHandler(event, { type: 'reading-position', payload: null });
assert.equal(acceptedBlocks, 1);
assert.equal(mangaEdits, 0);
assert.equal(captures, 0);

// Hata 166/176: gerçek renderer politika uygulayıcısını iki kez çağır;
// yanıt beklerken aynı seek/hız IPC komutu çoğalmamalı.
const policyStart = renderer.indexOf('function applyPlaybackLearningPolicy(');
const policyEnd = renderer.indexOf('\nfunction renderCue()', policyStart);
const commands = [];
const player = {
  editing: false, holdingSpeed: false, playbackPolicy: 'skip-gaps',
  cues: [{ id: 'a', start: 2, end: 4, text: 'Bir' }, { id: 'b', start: 10, end: 12, text: 'İki' }],
  offset: 0, learningBaseRate: 1, browserRate: 1,
};
const policyContext = vm.createContext({
  player,
  $: () => ({ seeking: false }),
  window: { WhisperPlaybackPolicy: require('../src/playback-policy') },
  subtitleSourceTime: (value) => value,
  subtitleVideoTime: (value) => value,
  browserCommand: (command, value) => {
    commands.push([command, value]);
    return new Promise(() => {});
  },
  currentGeneration: () => 1,
  osd() {},
  setTimeout,
});
vm.runInContext(renderer.slice(policyStart, policyEnd)
  + '\nthis.applyPolicy = applyPlaybackLearningPolicy;', policyContext);
policyContext.applyPolicy(5, 4.9, false, true);
policyContext.applyPolicy(5.1, 5, false, true);
assert.equal(commands.filter(([command]) => command === 'seek').length, 1);
player.playbackPolicy = 'accelerate-gaps';
policyContext.applyPolicy(5, 4.9, false, true);
policyContext.applyPolicy(5.1, 5, false, true);
assert.equal(commands.filter(([command]) => command === 'speed').length, 1);
assert.equal(player.browserRate, 2, 'hız komutu gönderilir gönderilmez iyimser yansıtılmalı');

console.log('Tur 7: arka plan blokları ve tarayıcı öğrenme komutu regresyonları geçti.');
