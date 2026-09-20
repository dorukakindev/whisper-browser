// Parti 5b — A22 yerel çalma listeleri + A38 kalan: radyo zinciri, karıştırma,
// en-çok-oynatılan rayı.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const locale = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'ui-locale.js'), 'utf8');

function extract() {
  const start = renderer.indexOf('// ----- Yerel çalma listeleri (A22) -----');
  const end = renderer.indexOf('// ----- Yerel içerik gizleme');
  assert.ok(start > 0 && end > start, '5b bloğu kesilemedi');
  return renderer.slice(start, end);
}

function harness() {
  const stored = {};
  const calls = { probe: [], osd: [], signal: [] };
  const els = {};
  const ctx = vm.createContext({
    localStorage: { getItem: (k) => stored[k] ?? null, setItem: (k, v) => { stored[k] = v; }, removeItem: (k) => { delete stored[k]; } },
    document: { createElement: () => null, body: { appendChild: () => {} }, addEventListener: () => {}, querySelectorAll: () => [] },
    window: {},
    $: (id) => els[id] || null,
    stQueue: [],
    ST_QUEUE_MAX: 50,
    stQueuePlayNext: () => { calls.probe.push('playNext'); return true; },
    saveStQueue: () => {},
    updatePlaylistButtons: () => {},
    stVideoHidden: () => false,
    queuePlayerProbeFromCard: () => { calls.probe.push('probe'); },
    mediaKeyFor: (t, u) => `${t}:${u}`,
    osd: (m) => calls.osd.push(m),
    setBrowserSignal: (m, ok) => calls.signal.push(m),
    closeStCardMenu: () => {},
    setTimeout,
    player: { autoNext: false, playlistIndex: -1, mediaKey: 'youtube:https://www.youtube.com/watch?v=cur', ytInfo: null, openIntent: 0, pendingAutoOpen: null },
    CSS: { escape: (s) => s },
    JSON, Object, Array, String, Number, Date, Math, Set, encodeURIComponent,
  });
  vm.runInContext(extract() + `
    this.__api = { stPlaylistCreate, stPlaylistRemove, stPlaylistAdd, stPlaylistRemoveItem,
      stPlaylistEnqueue, stPlaylistPlay, stPlaylistById, stBumpPlayCount, stMostPlayedVideos,
      stAutoRelatedNext, stQueueShuffle, stNormPlaylistItem,
      _lists: () => stPlaylists, _counts: () => stPlayCounts, _setQueue: (q) => { stQueue = q; } };
  `, ctx);
  return { api: ctx.__api, ctx, stored, calls, els };
}

const V = (id, extra = {}) => ({ videoId: id, title: `t${id}`, author: 'a', authorId: 'ch', lengthSeconds: 60, ...extra });

// --- A22: çalma listesi CRUD + enqueue/play ---
{
  const { api, ctx } = harness();
  assert.equal(api.stPlaylistCreate('  '), null, 'boş ad reddedilir');
  const list = api.stPlaylistCreate('  Gece  ');
  assert.ok(list && list.name === 'Gece', 'ad trim+kesilir');
  assert.equal(api.stPlaylistAdd(list.id, V('v1')), 'added');
  assert.equal(api.stPlaylistAdd(list.id, V('v1')), 'exists', 'aynı video tekilleştirilir');
  assert.equal(api.stPlaylistAdd('yok', V('v2')), null);
  assert.equal(api._lists()[0].items.length, 1);
  assert.equal(api.stPlaylistRemoveItem(list.id, 'v1'), true);
  assert.equal(api.stPlaylistRemoveItem(list.id, 'v1'), false);
  api.stPlaylistAdd(list.id, V('v1'));
  api.stPlaylistAdd(list.id, V('v2'));
  // Enqueue: mevcut kuyruk korunur, eksikler sona eklenir
  api._setQueue([{ videoId: 'v1', title: 'x' }]);
  assert.equal(api.stPlaylistEnqueue(list.id), 1, 'yalnız eksik video eklenir');
  assert.equal(ctx.stQueue.length, 2);
  // Play: kuyruk liste içeriğiyle baştan kurulur ve playNext tetiklenir
  assert.equal(api.stPlaylistPlay(list.id), true);
  assert.equal(ctx.stQueue[0].videoId, 'v1');
  assert.equal(api.stPlaylistPlay('yok'), false);
  assert.equal(api.stPlaylistRemove(list.id), true);
  assert.equal(api.stPlaylistById(list.id), null);
}

// --- A22: sınırlar ---
{
  const { api } = harness();
  for (let i = 0; i < 30; i++) api.stPlaylistCreate(`l${i}`);
  assert.equal(api.stPlaylistCreate('fazla'), null, 'liste tavanı 30');
  const list = api._lists()[0];
  for (let i = 0; i < 200; i++) api.stPlaylistAdd(list.id, V(`x${i}`));
  assert.equal(api.stPlaylistAdd(list.id, V('x201')), 'full', 'öğe tavanı 200');
}

// --- A38: en çok oynatılan ---
{
  const { api } = harness();
  api.stBumpPlayCount(V('a'));
  api.stBumpPlayCount(V('b'));
  api.stBumpPlayCount(V('b'));
  const top = api.stMostPlayedVideos();
  assert.equal(top[0].videoId, 'b', 'sayıma göre sıralanır');
  assert.equal(top[0]._playCount, 2);
  assert.equal(top[0].videoThumbnails.length, 0, 'http-olmayan thumb süzülür');
  assert.equal(api.stBumpPlayCount({}), undefined, 'kimliksiz probe yok sayılır');
}

// --- A38: radyo zinciri kapılar ---
{
  const { api, calls, els, ctx } = harness();
  // Kapalı → hiçbir şey yapmaz
  assert.equal(api.stAutoRelatedNext(), false);
  els.stAutoRelated = { checked: true };
  // Sıra dolu → devralmaz
  ctx.stQueue.push({ videoId: 'q1' });
  assert.equal(api.stAutoRelatedNext(), false);
  ctx.stQueue.length = 0;
  // YouTube dışı medya → yok
  ctx.player.mediaKey = 'local:/x.mp4';
  assert.equal(api.stAutoRelatedNext(), false);
  ctx.player.mediaKey = 'youtube:https://www.youtube.com/watch?v=cur';
  // Öneri yok → yok
  ctx.player.ytInfo = { recommended: [] };
  assert.equal(api.stAutoRelatedNext(), false);
  // Öneri var → probe kurulur
  ctx.player.ytInfo = { recommended: [{ videoId: 'n1', title: 'sonraki' }] };
  assert.equal(api.stAutoRelatedNext(), true);
  assert.equal(calls.probe.length, 1);
  assert.ok(ctx.player.pendingAutoOpen.key.includes('n1'));
  assert.equal(ctx.player.openIntent, 1);
}

// --- A38: shuffle ---
{
  const { api, ctx, calls } = harness();
  assert.equal(api.stQueueShuffle(), false, 'tek öğe karıştırılmaz');
  api._setQueue([V('1'), V('2'), V('3'), V('4'), V('5')]);
  assert.equal(api.stQueueShuffle(), true);
  assert.equal(ctx.stQueue.length, 5, 'öğe kaybı yok');
  assert.ok(calls.osd.length >= 1);
}

// --- Bağlantı regex'leri ---
assert.match(renderer, /addItem\([^)]*'Listeye ekle…'/, 'menüde listeye-ekle öğesi');
assert.match(renderer, /openStPlaylistPicker/, 'seçici menü');
assert.match(renderer, /else if \(player\.sleepTimerMode !== 'end'\) stAutoRelatedNext\(\)/, 'ended radyo zinciri');
assert.match(renderer, /stBumpPlayCount\(info\)/, 'oynatma sayacı açılışta');
assert.match(renderer, /'En çok oynatılan'/, 'ana sayfa rayı');
assert.ok(indexHtml.includes('id="stAutoRelated"'), 'radyo onayı panelde');
assert.ok(indexHtml.includes('id="stShuffleQueue"'), 'karıştır düğmesi panelde');
assert.ok(indexHtml.includes('id="stPlaylistList"'), 'liste paneli');
assert.ok(indexHtml.includes('id="stPlaylistName"'), 'liste adı girişi');
for (const key of ['Çalma listeleri', 'En çok oynatılan', 'Sırayı karıştır', 'Listeye ekle…', 'Oluştur']) {
  assert.ok(locale.includes(`['${key}'`), `locale eksik: ${key}`);
}

console.log('smarttube-playlists-parti5b.test.js OK');
