const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const renderer = read('src/renderer/renderer.js');
const indexHtml = read('src/renderer/index.html');
const locale = read('src/renderer/ui-locale.js');

// --- A19: YouTube-paritesi kısayollar + çift-tık kenar seek -------------------
assert.match(renderer, /e\.key === 't' \|\| e\.key === 'T'/, 'T tuşu bağlı değil');
assert.match(renderer, /setViewMode\(player\.viewMode === 'cinema'/, 'T sinema modunu açmalı/kapatmalı');
assert.match(renderer, /e\.key === 'i' \|\| e\.key === 'I'/, 'I tuşu bağlı değil');
assert.match(renderer, /toggleMiniPlayer\(\)/, 'I mini oynatıcıya gitmeli');
assert.match(renderer, /action: 'mini-open'/, 'tarayıcıda mini pencere browserExtras üzerinden açılmalı');
assert.match(renderer, /requestPictureInPicture/, 'yerelde resim-içinde-resim kullanılmalı');
assert.match(renderer, /toggleCueSaved\(\)/, 'K tuşundaki kurulu cümle-kaydet eylemi korunmalı (Space oynat/duraklat)');
assert.match(renderer, /ratio < 0\.3/, 'çift-tık sol bölge geri seek');
assert.match(renderer, /ratio > 0\.7/, 'çift-tık sağ bölge ileri seek');
assert.match(renderer, /\$\('fullscreenBtn'\)\.click\(\)/, 'orta bölge tam ekranı korumalı');
// dblclick bölge mantığını vm ile doğrula
const dbl = renderer.match(/video\.addEventListener\('dblclick', \(e\) => \{[\s\S]*?\n  \}\);/)[0];
{
  const calls = [];
  const video = { currentTime: 100, paused: false, getBoundingClientRect: () => ({ left: 0, width: 1000 }), addEventListener: (_, fn) => calls.push(fn) };
  const ctx = {
    video, player: { suppressClick: false }, osd: () => {}, $: (id) => ({ click: () => calls.push(id) }),
    updateSeekVisuals: () => {}, showControls: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(`${dbl}`, ctx);
  const handler = calls.find((f) => typeof f === 'function');
  handler({ clientX: 100 }); assert.equal(video.currentTime, 90, 'sol kenar -10 sn');
  handler({ clientX: 900 }); assert.equal(video.currentTime, 100, 'sağ kenar +10 sn');
  video.currentTime = 100; handler({ clientX: 500 });
  assert.deepEqual(calls.filter((c) => c === 'fullscreenBtn'), ['fullscreenBtn'], 'orta bölge tam ekran');
}

// --- A36: mediaSession --------------------------------------------------------
assert.match(renderer, /navigator\.mediaSession/, 'mediaSession erişimi');
assert.match(renderer, /new MediaMetadata\(/, 'metadata üretilmeli');
assert.match(renderer, /setActionHandler/, 'eylem handlerları kurulmalı');
for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']) {
  assert(renderer.includes(`'${a}'`), `mediaSession eylemi eksik: ${a}`);
}
assert.match(renderer, /playbackState = active/, 'tarayıcı modunda oturum none durumuna çekilmeli');
assert.match(renderer, /ms\.metadata = null/, 'kapanışta metadata temizlenmeli');
assert.match(renderer, /clearPlayerMediaSession\(\)/, 'closePlayer oturumu temizlemeli');
assert.match(renderer, /setPositionState/, 'OS seek çubuğu için konum durumu');

// --- A38: uyku zamanlayıcısı --------------------------------------------------
assert.match(indexHtml, /id="sleepTimer"/, 'kontrol çubuğunda uyku select');
assert.match(indexHtml, /value="end"/, 'bölüm sonunda dur seçeneği');
assert.match(indexHtml, /value="30"/, '30 dk seçeneği');
assert.match(renderer, /sleepTimerAt = minutes > 0 \? Date\.now\(\) \+ minutes \* 60000 : 0/, 'süre hesabı');
assert.match(renderer, /player\.autoNext && player\.sleepTimerMode !== 'end'[^\n]*playPlaylistDelta\(1\)/, "ended'da 'end' kipi autoNext'i engellemeli");
assert.match(renderer, /setInterval\(checkPlayerSleepTimer, 15000\)/, 'periyodik kontrol');
assert.match(renderer, /browserCommand\('pause'\)/, 'tarayıcı modunda web videosu duraklatılmalı');

// vm: zamanlayıcı fonksiyonu deterministik davranış testi
const checkFn = renderer.match(/function checkPlayerSleepTimer\(\) \{[\s\S]*?\n\}/)[0];
const labelFn = renderer.match(/function sleepTimerLabel\(\) \{[\s\S]*?\n\}/)[0];
{
  const events = [];
  const sel = { value: '30' };
  const video = { pause: () => events.push('pause') };
  const ctx = {
    player: { sleepTimerAt: 0, sleepTimerMode: '', workspaceMode: 'player' },
    $: (id) => (id === 'sleepTimer' ? sel : id === 'playerVideo' ? video : null),
    osd: (t) => events.push(`osd:${t}`),
    browserCommand: (cmd) => { events.push(`cmd:${cmd}`); return Promise.resolve(); },
    Date,
  };
  vm.createContext(ctx);
  vm.runInContext(`${checkFn}\n${labelFn}`, ctx);
  vm.runInContext('checkPlayerSleepTimer()', ctx);
  assert.deepEqual(events, [], 'zamanlayıcı kapalıyken hiçbir şey olmamalı');
  ctx.player.sleepTimerAt = Date.now() + 60000;
  vm.runInContext('checkPlayerSleepTimer()', ctx);
  assert.deepEqual(events, [], 'süre dolmadan duraklatmamalı');
  ctx.player.sleepTimerAt = Date.now() - 1000;
  vm.runInContext('checkPlayerSleepTimer()', ctx);
  assert.deepEqual(events, ['pause', 'osd:Uyku zamanlayıcısı: oynatma duraklatıldı'], 'süre dolunca duraklat + osd');
  assert.equal(sel.value, '0', 'select sıfırlanmalı');
  assert.equal(ctx.player.sleepTimerAt, 0);
  events.length = 0;
  ctx.player.workspaceMode = 'browser';
  ctx.player.sleepTimerAt = Date.now() - 1;
  vm.runInContext('checkPlayerSleepTimer()', ctx);
  assert.equal(events[0], 'cmd:pause', 'tarayıcı modunda browserCommand pause');
  ctx.player.sleepTimerMode = 'end';
  assert.equal(vm.runInContext('sleepTimerLabel()', ctx), 'bölüm sonunda');
}

// --- yardım paneli + ui-locale -------------------------------------------------
assert.match(indexHtml, /<kbd>T<\/kbd><span>Sinema modu<\/span>/, 'yardım T satırı');
assert.match(indexHtml, /<kbd>I<\/kbd><span>Mini oynatıcı<\/span>/, 'yardım I satırı');
assert.match(indexHtml, /kenar<\/kbd><span>∓10 sn seek<\/span>/, 'yardım çift-tık satırı');
assert.match(locale, /'Uyku: kapalı', 'Sleep: off'/);
assert.match(locale, /'Bölüm sonunda dur', 'Stop at end of video'/);

console.log('player-extras-parti3.test.js OK');
