const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// R311 — SmartTube kanal/playlist derinliği:
//  A) sekme değişimi uçuştaki eski sekme isteğini öldürür (stale render yok)
//  B) kanal-içi arama sayfa sayacını sıfırlar ve aktif chip'i nötrler
//     (yoksa aramadan sonra "Videolar" chip'i early-return'e takılırdı)
//  C) ilk 'videos' sayfası "Daha fazla" ile derinleşir (dedupe'lu)
//  D) geçici fetch hatası sayfalama düğmesini öldürmez ve sayfa atlatmaz
const src = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const start = src.indexOf('const ST_CH_TABS = [');
const end = src.indexOf('// ----- Düğme bağlama', start);
assert(start >= 0 && end > start, 'kanal sayfası dilimi bulunamadı');
const plStart = src.indexOf('async function openInvidiousPlaylistPage');
const plEnd = src.indexOf('// Arama sonuçlarını dedupe', plStart);
assert(plStart >= 0 && plEnd > plStart, 'playlist sayfası dilimi bulunamadı');
const ldStart = src.indexOf('async function loadInvidiousPlaylist');
const ldEnd = src.indexOf('\nasync function', ldStart + 10);
assert(ldStart >= 0 && ldEnd > ldStart, 'loadInvidiousPlaylist dilimi bulunamadı');
const slice = src.slice(ldStart, ldEnd) + '\n' + src.slice(plStart, plEnd) + '\n' + src.slice(start, end);
assert(slice.includes('function renderStChannelTab'), 'renderStChannelTab dilimde yok');
assert(slice.includes('function openInvidiousPlaylistPage'), 'openInvidiousPlaylistPage dilimde yok');

function fakeElement(tag) {
  const el = {
    tagName: String(tag || '').toUpperCase(),
    children: [],
    dataset: {},
    className: '',
    textContent: '',
    style: {},
    type: '',
    value: '',
    disabled: false,
    _listeners: {},
    get classList() {
      const self = this;
      return {
        add(c) { if (!self.className.includes(c)) self.className += (self.className ? ' ' : '') + c; },
        remove(c) { self.className = self.className.split(' ').filter((x) => x && x !== c).join(' '); },
        toggle(c, force) {
          const on = force === undefined ? !self.className.includes(c) : !!force;
          if (on) self.classList.add(c); else self.classList.remove(c);
        },
        contains(c) { return self.className.split(' ').includes(c); },
      };
    },
    setAttribute(k, v) { (this.dataset.attrs = this.dataset.attrs || {})[k] = v; },
    appendChild(child) { this.children.push(child); return child; },
    append(...els) { this.children.push(...els); },
    prepend(child) { this.children.unshift(child); return child; },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    remove() {
      for (const p of this._parents || []) {
        p.children = p.children.filter((c) => c !== this);
      }
    },
    querySelectorAll(sel) {
      return this.children.filter((c) => c.className && c.className.split(' ').includes(sel.replace('.', '')));
    },
    querySelector() { return null; },
    fire(type, ev = {}) {
      for (const fn of this._listeners[type] || []) fn(ev);
    },
  };
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return html; },
    set(v) { html = v; if (v === '') el.children = []; },
  });
  return el;
}
function track(el) {
  el.appendChild = (child) => { (child._parents = child._parents || new Set()).add(el); el.children.push(child); return child; };
  el.append = (...els) => els.forEach((c) => el.appendChild(c));
  el.prepend = (child) => { (child._parents = child._parents || new Set()).add(el); el.children.unshift(child); };
  el.remove = function () {
    for (const p of this._parents || []) p.children = p.children.filter((c) => c !== this);
    this._parents = new Set();
  };
  el.querySelectorAll = function (sel) {
    const cls = sel.replace('.', '');
    const out = [];
    const walk = (node) => node.children.forEach((c) => {
      if (c.className && c.className.split(' ').includes(cls)) out.push(c);
      walk(c);
    });
    walk(this);
    return out;
  };
  return el;
}

function makeContext(apiOverrides = {}) {
  const ids = {};
  for (const id of ['stGrid', 'stSectionTitle', 'stSearchResults', 'stSearchGrid', 'stSearchInput']) {
    ids[id] = track(fakeElement(id === 'stSearchInput' ? 'input' : 'div'));
  }
  const ctx = {
    window: { api: { invidiousChannelTab: async () => ({ ok: true, data: { videos: [] } }) , ...apiOverrides }, UiLocale: undefined },
    document: { createElement: (tag) => track(fakeElement(tag)) },
    invCall: (fn) => fn(),
    loadInvidiousChannel: async () => ({ info: { author: 'KanalX', authorId: 'ch1' }, videos: [] }),
    stSectionSeq: 0,
    stChannelTabSeq: 0,
    stSearchActive: false,
    stSearchSeq: 0,
    stSearchQuery: '',
    stSearchHasMore: false,
    stSearchSeen: new Set(),
    stSelectSection: () => {},
    stIsSubscribed: () => false,
    stSubToggle: () => {},
    stVideoHidden: () => false,
    buildSmartTubeCard: (v) => { const c = track(fakeElement('div')); c.className = 'st-card'; c.dataset.vid = v.videoId; c.textContent = v.title || v.videoId; return c; },
    renderStPlaylistRail: () => {},
    formatCount: (n) => String(n),
    $: (id) => ids[id] || null,
  };
  ctx._ids = ids;
  vm.createContext(ctx);
  return ctx;
}

function loadIn(ctx) {
  vm.runInContext(slice, ctx, { filename: 'renderer.js#channel' });
}

const { test } = require('node:test');

test('sekme değişimi uçuştaki eski sekme sonucunu düşürür', async () => {
  const calls = [];
  let resolveFirst;
  const api = {
    invidiousChannelTab: (cid, opts) => {
      calls.push(opts);
      if (calls.length === 1) return new Promise((res) => { resolveFirst = () => res({ ok: true, data: { videos: [{ videoId: 'stale1' }] } }); });
      return Promise.resolve({ ok: true, data: { videos: [{ videoId: 'fresh1' }] } });
    },
  };
  const ctx = makeContext(api);
  loadIn(ctx);
  ctx.stSectionSeq = 1;
  const body = track(fakeElement('div'));
  let page = 1;
  const p1 = ctx.renderStChannelTab('ch1', 'videos', body, () => page, (p) => { page = p; });
  // Kullanıcı başka sekmeye geçti → sayaç arttı
  ctx.stChannelTabSeq++;
  resolveFirst();
  await p1;
  assert.equal(body.children.filter((c) => c.dataset && c.dataset.vid === 'stale1').length, 0,
    'eski sekme sonucu yeni gövdeye yazıldı');
  // Yeni sekme render'ı normal çalışır
  await ctx.renderStChannelTab('ch1', 'shorts', body, () => page, (p) => { page = p; });
  assert.equal(body.children.filter((c) => c.dataset && c.dataset.vid === 'fresh1').length, 1,
    'yeni sekme sonucu çizilemedi');
});

test('kanal arama sayfayı sıfırlar + aktif chip nötrlenir (videolara dönüş çalışır)', async () => {
  const calls = [];
  const api = {
    invidiousChannelTab: (cid, opts) => { calls.push(opts); return Promise.resolve({ ok: true, data: { videos: [{ videoId: 'sr1' }] } }); },
  };
  const ctx = makeContext(api);
  ctx.loadInvidiousChannel = async () => ({ info: { author: 'KanalX', authorId: 'ch1' }, videos: [{ videoId: 'v0' }] });
  loadIn(ctx);
  await ctx.openInvidiousChannelPage('ch1');
  const grid = ctx._ids.stGrid;
  const tabRow = grid.querySelectorAll('.st-chips')[0];
  const chips = tabRow.querySelectorAll('.st-chip');
  assert.equal(chips.length, 9, 'sekmeler çizilmedi');
  // 'videos' chip'i aktif; videolarda "Daha fazla" yok (1 video < 20)
  const search = tabRow.children.find((c) => c.className === 'st-ch-search');
  assert.ok(search, 'kanal-içi arama alanı yok');
  search.value = 'test';
  search.fire('keydown', { key: 'Enter', preventDefault() {} });
  await new Promise((r) => setImmediate(r));
  // Arama isteği sayfa 1'den gitmeli (önceden kalan sayfa sayacı yok)
  const searchCall = calls.find((c) => c.query === 'test');
  assert.ok(searchCall, 'arama isteği yapılmadı');
  assert.equal(searchCall.page, 1, 'arama kalan sayfa numarasından başladı');
  // Aktif chip yok (hepsi deselected)
  assert.equal(chips.filter((c) => c.classList.contains('is-active')).length, 0, 'arama sırasında chip aktif kaldı');
  // 'Videolar' chip'ine tıklama artık early-return'e takılmaz → videos render'ı çalışır
  const videosChip = chips.find((c) => c.dataset.stChTab === 'videos');
  videosChip.fire('click');
  await new Promise((r) => setImmediate(r));
  const backCall = calls[calls.length - 1];
  assert.equal(backCall.tab, 'videos');
  assert.equal(backCall.page, 1);
});

test('ilk videos sayfası Daha fazla ile derinleşir + geçici hata düğmeyi öldürmez', async () => {
  const calls = [];
  let failOnce = true;
  const api = {
    invidiousChannelTab: (cid, opts) => {
      calls.push(opts);
      if (failOnce) { failOnce = false; return Promise.reject(new Error('ağ hatası')); }
      return Promise.resolve({ ok: true, data: { videos: [{ videoId: 'v20' }, { videoId: 'v0' }] } });
    },
  };
  const ctx = makeContext(api);
  const vids = Array.from({ length: 20 }, (_, i) => ({ videoId: `v${i}` }));
  ctx.loadInvidiousChannel = async () => ({ info: { author: 'KanalX', authorId: 'ch1' }, videos: vids });
  loadIn(ctx);
  await ctx.openInvidiousChannelPage('ch1');
  const grid = ctx._ids.stGrid;
  const moreBtn = grid.querySelectorAll('.st-more-btn')[0];
  assert.ok(moreBtn, '20 videoluk ilk sayfada Daha fazla yok');
  moreBtn.fire('click');
  await new Promise((r) => setImmediate(r));
  assert.equal(calls[0].page, 2, 'ikinci sayfa istenmedi');
  assert.equal(moreBtn.disabled, false, 'geçici hata düğmeyi öldürdü');
  moreBtn.fire('click');
  await new Promise((r) => setImmediate(r));
  assert.equal(calls[1].page, 2, 'hatalı deneme sayfa sayacını ilerletti');
  const tabBody = grid.querySelectorAll('.st-ch-body')[0];
  const ids = tabBody.querySelectorAll('.st-card').map((c) => c.dataset.vid);
  assert.equal(ids.filter((x) => x === 'v20').length, 1, 'sayfa-2 videosu eklenmedi');
  assert.equal(ids.filter((x) => x === 'v0').length, 1, 'tekrar eden video dedupe edilmedi');
});

test('playlist Daha fazla geçici hatada canlı kalır, sayfa atlamaz', async () => {
  const pages = [];
  let failNext = false;
  const api = {
    invidiousPlaylist: (pid, opts) => {
      const pg = (opts && opts.page) || 1;
      pages.push(pg);
      if (pg === 1) {
        return Promise.resolve({ ok: true, data: { playlistId: pid, title: 'PL', videos: Array.from({ length: 20 }, (_, i) => ({ videoId: `p${i}` })) } });
      }
      if (failNext) { failNext = false; return Promise.reject(new Error('down')); }
      return Promise.resolve({ ok: true, data: { videos: [{ videoId: 'pX' }] } });
    },
  };
  const ctx = makeContext(api);
  loadIn(ctx);
  const grid = ctx._ids.stGrid;
  await ctx.openInvidiousPlaylistPage('PL1');
  failNext = true;
  const moreBtn = grid.querySelectorAll('.st-more-btn')[0];
  assert.ok(moreBtn, 'playlist Daha fazla düğmesi yok');
  moreBtn.fire('click');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(moreBtn.disabled, false, 'geçici hata playlist düğmesini öldürdü');
  moreBtn.fire('click');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(pages, [1, 2, 2], 'hatalı deneme sayfayı atlattı');
  const cardIds = grid.querySelectorAll('.st-card').map((c) => c.dataset.vid);
  assert.ok(cardIds.includes('pX'), 'ikinci sayfa videosu gridde yok');
});
