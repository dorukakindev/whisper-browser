// Parti 5a — A01 kart bağlam menüsü, A03 yerel gizleme, A08 sonuç türü filtreleri.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const locale = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'ui-locale.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');

// Kesit: gizleme/filtre fonksiyonları
function extractFns() {
  const start = renderer.indexOf("// ----- Yerel içerik gizleme (A03)");
  const end = renderer.indexOf('// ----- Kart bağlam menüsü');
  assert.ok(start > 0 && end > start, 'gizleme bloğu kesilemedi');
  return renderer.slice(start, end);
}

const els = {};
const stored = {};
const $ = (id) => els[id];
const ctx = vm.createContext({
  $, localStorage: { getItem: (k) => stored[k] ?? null, setItem: (k, v) => { stored[k] = v; } },
  document: { querySelectorAll: () => [] },
  watchItemByKey: () => null,
  watchProgress: () => 0,
  mediaKeyFor: (t, id) => `${t}:${id}`,
  setBrowserSignal: () => {},
  stCurrentSection: 'home',
  window: {},
  Set, JSON, String, Number, Array, Date, console,
});
vm.runInContext(extractFns() + `
  this.__api = { stIsShort, stVideoHidden, stFilterVideos, stHideVideo, stHideChannel,
    stUnhideVideo, stUnhideChannel, stChannelHidden,
    _set: (v, c) => { stHiddenVideos = v; stHiddenChannels = c; },
    _get: () => ({ videos: stHiddenVideos, channels: stHiddenChannels }) };
`, ctx);
const api = ctx.__api;

// stIsShort sözleşmesi
assert.equal(api.stIsShort({ type: 'short' }), true);
assert.equal(api.stIsShort({ type: 'shortVideo' }), true);
assert.equal(api.stIsShort({ url: 'https://www.youtube.com/shorts/abc' }), true);
assert.equal(api.stIsShort({ isShort: true }), true);
assert.equal(api.stIsShort({ type: 'video', lengthSeconds: 45 }), false, 'süre tek başına short sayılmaz');
assert.equal(api.stIsShort({}), false);

// Kullanıcı gizleme (A03)
api.stHideVideo({ videoId: 'v1', title: 't1' });
assert.ok(api._get().videos.has('v1'));
assert.ok(api.stVideoHidden({ videoId: 'v1' }));
assert.equal(api.stVideoHidden({ videoId: 'v2' }), false);
api.stHideChannel({ authorId: 'ch9', author: 'Kanal X' });
assert.ok(api.stChannelHidden('ch9'));
assert.ok(api.stVideoHidden({ authorId: 'ch9', videoId: 'v3' }));
api.stUnhideVideo('v1');
assert.equal(api.stVideoHidden({ videoId: 'v1' }), false);
api.stUnhideChannel('ch9');
assert.equal(api.stChannelHidden('ch9'), false);
assert.equal(JSON.parse(stored.stHiddenVideos).length >= 0, true, 'kalıcı yazım');

// A08 bayrakları: checkbox durumu canlı okunur
els.stHideShorts = { checked: true };
els.stHideLive = { checked: true };
assert.ok(api.stVideoHidden({ type: 'short' }));
assert.ok(api.stVideoHidden({ liveNow: true, videoId: 'v9' }));
assert.equal(api.stVideoHidden({ type: 'video', videoId: 'v10' }), false);
els.stHideWatched = { checked: true };
ctx.watchItemByKey = () => ({ completed: true });
assert.ok(api.stVideoHidden({ videoId: 'watched1' }));
ctx.watchItemByKey = () => ({ completed: false });
ctx.watchProgress = () => 97;
assert.ok(api.stVideoHidden({ videoId: 'watched2' }), '%95+ ilerleme izlenmiş sayılır');
ctx.watchProgress = () => 40;
assert.equal(api.stVideoHidden({ videoId: 'watched3' }), false);
const list = api.stFilterVideos([{ videoId: 'a' }, { videoId: 'watched3' }, { liveNow: true, videoId: 'b' }]);
assert.equal(list.length, 2, 'filtre canlı/hidden öğeleri atmalı');

// --- A01 menü + bağlantı kontrolleri ---
assert.match(renderer, /addEventListener\('contextmenu'/, 'kart sağ tık menüsü bağlı');
assert.match(renderer, /role', 'menu'\)/, 'menü role=menu');
assert.match(renderer, /role', 'menuitem'\)/, 'menü öğeleri role=menuitem');
assert.match(renderer, /'Kanalı gizle'/, 'kanal gizleme menüde');
assert.match(renderer, /'Videoyu gizle'/, 'video gizleme menüde');
assert.match(renderer, /'Bağlantıyı kopyala'/, 'bağlantı kopyalama menüde');
assert.match(renderer, /openInvidiousChannelPage/, 'kanalı aç gerçek işleve bağlı');
assert.ok(!/addItem\([^)]*Watch ?Later/i.test(renderer), 'menüde sahte Watch Later yok (katalog koşulu)');
assert.match(renderer, /st-card-menu-btn/, 'keşfedilebilir ⋯ düğmesi kartta');
assert.match(renderer, /aria-haspopup', 'menu'/, 'menü düğmesi aria-haspopup');
assert.match(renderer, /closeStCardMenu/, 'menü kapatma yolu');

// --- A08 ayar bağlantıları ---
for (const id of ['stHideShorts', 'stHideWatched', 'stHideLive', 'stHideTrending']) {
  assert.ok(indexHtml.includes(`id="${id}"`), `index.html ${id} içermeli`);
  assert.ok(renderer.includes(`'${id}'`), `renderer persist listesi ${id} içermeli`);
}
assert.match(indexHtml, /id="stHiddenList"/, 'gizlenenler listesi panelde');
assert.match(indexHtml, /data-place-tab="offline"/, 'önceki parti: çevrimdışı sekme mevcut');
assert.match(renderer, /stFilterVideos\(/, 'feed süzgeci çağrılıyor');
assert.match(renderer, /applyStContentFilters/, 'canlı filtre uygulayıcısı');
assert.match(renderer, /dataset\.stUnhideChannel|st-unhide-channel|stUnhideChannel/, 'geri alma yolu');
assert.match(styles, /\.st-card-menu\b/, 'menü stili');
assert.match(styles, /\.st-hidden-list/, 'gizlenenler liste stili');
for (const key of ['İçerik filtreleri', 'Gizlenenler', 'Kanalı gizle', 'Videoyu gizle', 'Geri al']) {
  assert.ok(locale.includes(`['${key}'`), `locale eksik: ${key}`);
}

console.log('smarttube-filters-parti5.test.js OK');
