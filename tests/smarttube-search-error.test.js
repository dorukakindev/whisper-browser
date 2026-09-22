const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// F-104-1: SmartTube araması, Invidious işi {ok:false,error} döndürdüğünde
// hatayı yutmamalı — grid'de "Sonuç yok." yerine gerçek hata görünmeli.
// searchInvidious, fetchInvidiousFeed ile aynı sözleşmeyi izler: {ok:false}
// yanıtında sebep metniyle throw eder.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const start = renderer.indexOf('async function searchInvidious(');
const end = renderer.indexOf('async function searchInvidiousPlaylists(', start);
assert(start >= 0 && end > start, 'searchInvidious dilimi bulunamadı');

let chain = Promise.resolve();
function invCall(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function makeContext(apiResult) {
  const context = {
    window: { api: { invidiousSearch: async () => apiResult } },
    invCall,
    logLine: () => {},
  };
  vm.createContext(context);
  vm.runInContext(renderer.slice(start, end), context);
  return context;
}

let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`  PASS  ${name}`); }

(async () => {
  await test('arama hatası sebebiyle throw eder — boş sonuç gibi yutulmaz', async () => {
    const context = makeContext({ ok: false, error: 'Invidious işlemi zaman sınırını aştı.' });
    await assert.rejects(
      () => context.searchInvidious('test', 1),
      /zaman sınırını aştı/,
      'IPC {ok:false} yanıtı boş dizi yerine hata üretmeli'
    );
  });

  await test('bilinmeyen hata metni de korunur', async () => {
    const context = makeContext({ ok: false, error: 'HTTP 500' });
    await assert.rejects(() => context.searchInvidious('q', 1), /HTTP 500/);
  });

  await test('gerçek boş sonuç ayrı kalır: {ok:true,videos:[]} → []', async () => {
    const context = makeContext({ ok: true, data: { videos: [] } });
    assert.deepEqual(await context.searchInvidious('niche', 1), []);
  });

  await test('başarılı sonuç videoları döner', async () => {
    const context = makeContext({ ok: true, data: { videos: [{ videoId: 'a' }] } });
    assert.deepEqual(await context.searchInvidious('x', 1), [{ videoId: 'a' }]);
  });

  await test('boş sorgu IPC çağırmadan [] döner', async () => {
    let calls = 0;
    const context = makeContext({});
    context.window.api.invidiousSearch = async () => { calls += 1; return { ok: true, data: { videos: [] } }; };
    const out = await context.searchInvidious('   ', 1);
    assert.equal(out.length, 0);
    assert.equal(calls, 0);
  });

  console.log(`smarttube-search-error: ${passed} test`);
})().catch((error) => { console.error(error); process.exit(1); });
