const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// F-104-2: SmartTube "Kanallar" sekmesinde akış hatası (500/timeout) boş
// kanal listesi olarak görünmemeli — diğer bölümler gibi hata + "Tekrar dene"
// verilmeli. fetchInvidiousSubscriptions giriş-sınıfı hataları zaten null'a
// indirir; kalan hatalar showError'a ulaşmalı.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const start = renderer.indexOf('async function renderSmartTubeSection(');
const end = renderer.indexOf('\nfunction ', start);
assert(start >= 0 && end > start, 'renderSmartTubeSection dilimi bulunamadı');

function fakeElement(tag) {
  return {
    tagName: String(tag || '').toUpperCase(),
    children: [],
    dataset: {},
    className: '',
    textContent: '',
    innerHTML: '',
    style: {},
    type: '',
    disabled: false,
    setAttribute() {},
    appendChild(el) { this.children.push(el); return el; },
    append(...els) { this.children.push(...els); },
    prepend(el) { this.children.unshift(el); return el; },
    querySelector() { return null; },
    addEventListener() {},
    remove() {},
  };
}

function makeContext(subscriptionsResult, searchResult) {
  const grid = fakeElement('div');
  const channelsCalls = [];
  const context = {
    window: { api: {}, UiLocale: undefined },
    document: { createElement: (tag) => fakeElement(tag) },
    setTimeout: () => 0,
    logLine: () => {},
    $: (id) => (id === 'stGrid' ? grid : null),
    stSectionSeq: 0,
    stActiveHomeRequestId: null,
    youtubeLoggedIn: false,
    watchLibraryCache: [],
    lastInvidiousInstance: '',
    setSmartTubeStatus: () => {},
    fetchInvidiousSubscriptions: async () => {
      if (subscriptionsResult instanceof Error) throw subscriptionsResult;
      return subscriptionsResult;
    },
    searchInvidious: async () => {
      if (searchResult instanceof Error) throw searchResult;
      return searchResult || [];
    },
    stFilterVideos: (v) => v,
    buildSmartTubeCard: (v) => { const el = fakeElement('div'); el.textContent = v?.title || 'card'; return el; },
    renderSmartTubeChannels: (channels) => {
      channelsCalls.push(channels);
      // Gerçek render'ın boş-liste metni — hata bu metne dönüşmemeli.
      if (!channels.length) {
        grid.innerHTML = '<div class="inv-status">Oturum açtıktan sonra aboneliklerin burada görünür.</div>';
      }
    },
    renderStSubsPanel: () => {},
    stSearchActive: false,
  };
  vm.createContext(context);
  vm.runInContext(renderer.slice(start, end), context);
  return { context, grid, channelsCalls };
}

let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`  PASS  ${name}`); }

(async () => {
  await test('kanal akışı 500 hatası boş liste değil hata+retry gösterir', async () => {
    const { context, grid, channelsCalls } = makeContext(new Error('HTTP 500'));
    await context.renderSmartTubeSection('channels');
    const texts = JSON.stringify(grid);
    assert.doesNotMatch(texts, /Oturum açtıktan sonra/, 'ağ hatası oturum ipucuna dönüşmemeli');
    assert.match(texts, /500|Hata/, 'hata metni gridde görünmeli');
    assert.equal(channelsCalls.length, 0,
      'hata durumunda boş kanal listesi çizilmemeli');
    const flat = (el) => [el, ...(el.children || []).flatMap(flat)];
    const hasRetry = flat(grid).some((el) => /Tekrar dene/.test(el.textContent || ''));
    assert.equal(hasRetry, true, 'Tekrar dene butonu sunulmalı');
  });

  await test('kanal akışı timeout hatası da gizlenmez', async () => {
    const { context, grid, channelsCalls } = makeContext(new Error('Invidious işlemi zaman sınırını aştı.'));
    await context.renderSmartTubeSection('channels');
    const texts = JSON.stringify(grid);
    assert.doesNotMatch(texts, /Oturum açtıktan sonra/, 'ağ hatası oturum ipucuna dönüşmemeli');
    assert.match(texts, /zaman sınırını|Hata/, 'zaman aşımı gridde görünmeli');
    assert.equal(channelsCalls.length, 0);
  });

  await test('gerçek boş abonelik listesi eskisi gibi boş-mesaj gösterir', async () => {
    const { context, channelsCalls } = makeContext([]);
    await context.renderSmartTubeSection('channels');
    assert.equal(channelsCalls.length, 1);
    assert.equal(channelsCalls[0].length, 0);
  });

  await test('giriş-sınıfı hata null iletilir (oturum ipucu korunur)', async () => {
    // fetchInvidiousSubscriptions giriş hatalarını null'a indirger — davranış
    // değişmemeli: boş liste render edilir, hata ekranı değil.
    const subsError = new Error('401 login required');
    const grid = fakeElement('div');
    const channelsCalls = [];
    const context = {
      window: { api: {}, UiLocale: undefined },
      document: { createElement: (tag) => fakeElement(tag) },
      setTimeout: () => 0,
      logLine: () => {},
      $: (id) => (id === 'stGrid' ? grid : null),
      stSectionSeq: 0,
      stActiveHomeRequestId: null,
      youtubeLoggedIn: false,
      watchLibraryCache: [],
      lastInvidiousInstance: '',
      setSmartTubeStatus: () => {},
      fetchInvidiousSubscriptions: async () => {
        if (/giriş|login|401|unauthor/i.test(subsError.message)) return null;
        throw subsError;
      },
      renderSmartTubeChannels: (channels) => {
      channelsCalls.push(channels);
      // Gerçek render'ın boş-liste metni — hata bu metne dönüşmemeli.
      if (!channels.length) {
        grid.innerHTML = '<div class="inv-status">Oturum açtıktan sonra aboneliklerin burada görünür.</div>';
      }
    },
      renderStSubsPanel: () => {},
      stSearchActive: false,
    };
    vm.createContext(context);
    vm.runInContext(renderer.slice(start, end), context);
    await context.renderSmartTubeSection('channels');
    assert.equal(channelsCalls.length, 1);
    assert.equal(channelsCalls[0].length, 0);
  });

  await test('live bölümü akış hatasında "canlı yok" yerine hata+retry gösterir', async () => {
    const { context, grid } = makeContext(null, new Error('HTTP 502'));
    await context.renderSmartTubeSection('live');
    const texts = JSON.stringify(grid);
    assert.doesNotMatch(texts, /Canlı yayın bulunamadı/, 'ağ hatası boş-yayın mesajına dönüşmemeli');
    assert.match(texts, /502|Hata/, 'hata metni gridde görünmeli');
    const flat = (el) => [el, ...(el.children || []).flatMap(flat)];
    const hasRetry = flat(grid).some((el) => /Tekrar dene/.test(el.textContent || ''));
    assert.equal(hasRetry, true, 'Tekrar dene butonu sunulmalı');
  });

  await test('live bölümü gerçek boş sonuçta eski boş-mesajı korur', async () => {
    const { context, grid } = makeContext(null, []);
    await context.renderSmartTubeSection('live');
    assert.match(JSON.stringify(grid), /Canlı yayın bulunamadı/);
  });

  // --- stSearchLoadMore: sayfalama hatası "sonuç bitti" gibi davranmamalı ---
  const lmStart = renderer.indexOf('async function stSearchLoadMore(');
  const lmEnd = renderer.indexOf('\nfunction ', lmStart);
  assert(lmStart >= 0 && lmEnd > lmStart, 'stSearchLoadMore dilimi bulunamadı');

  function makeLoadMoreContext(searchResult) {
    const grid = fakeElement('div');
    const results = fakeElement('div');
    const moreBtn = fakeElement('button');
    moreBtn.textContent = 'Daha fazla';
    results.querySelector = (sel) => (sel === '.st-more-btn' ? moreBtn : null);
    const appended = [];
    const context = {
      window: { api: {}, UiLocale: undefined },
      document: { createElement: (tag) => fakeElement(tag) },
      $: (id) => ({ stSearchGrid: grid, stSearchResults: results }[id] || null),
      stSearchLoading: false,
      stSearchHasMore: true,
      stSearchQuery: 'test',
      stSearchPage: 1,
      stSearchSeq: 1,
      stSearchActive: true,
      searchInvidious: async () => {
        if (searchResult instanceof Error) throw searchResult;
        return searchResult || [];
      },
      stUpdateSearchMore: () => { moreBtn.disabled = false; moreBtn.textContent = 'Daha fazla'; },
      stAppendSearchResults: (videos) => appended.push(...videos),
    };
    vm.createContext(context);
    vm.runInContext(renderer.slice(lmStart, lmEnd), context);
    return { context, moreBtn, appended };
  }

  await test('sayfalama hatası hasMore\'u kapatmaz, butonu retry+hata yapar', async () => {
    const { context, moreBtn, appended } = makeLoadMoreContext(new Error('HTTP 500'));
    await context.stSearchLoadMore();
    assert.equal(context.stSearchHasMore, true, 'geçici hata sayfalama sonu sanılmasın');
    assert.equal(moreBtn.disabled, false, 'buton tekrar denenebilir kalmalı');
    assert.match(moreBtn.textContent, /Tekrar dene.*500|500.*Tekrar dene/, 'hata metni butonda görünmeli');
    assert.equal(appended.length, 0);
  });

  await test('gerçek boş sayfa hasMore\'u kapatır (davranış korunur)', async () => {
    const { context } = makeLoadMoreContext([]);
    await context.stSearchLoadMore();
    assert.equal(context.stSearchHasMore, false);
  });

  await test('sayfalama başarısı sonuçları ekler', async () => {
    const { context, appended } = makeLoadMoreContext([{ videoId: 'a' }, { videoId: 'b' }]);
    await context.stSearchLoadMore();
    assert.equal(appended.length, 2);
    assert.equal(context.stSearchPage, 2);
  });

  console.log(`smarttube-channels-error: ${passed} test`);
})().catch((error) => { console.error(error); process.exit(1); });
