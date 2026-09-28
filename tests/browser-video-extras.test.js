// R179 — DeArrow/RYD topluluk ekstraları: yanıt ayrıştırma, oy seçimi,
// önbellek/in-flight davranışı ve handler yük/sınır disiplini.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
  extractDeArrowBranding, pickDeArrowTitle, pickDeArrowThumbnail,
  sanitizeDeArrowTitle, normalizeRydVotes, youtubeVideoId,
} = require('../src/browser-sponsorblock');

const main = fs.readFileSync(require.resolve('../src/main.js'), 'utf8');

let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`  PASS  ${name}`); }

const VID = 'abcdefghijk';

const brandingPayload = [
  { videoID: 'othervideo1', titles: [{ title: 'Başka video', votes: 50, original: false }] },
  { videoID: VID, videoDuration: 612,
    titles: [
      { title: 'ŞOK EDİCİ!! BUNA İNANAMAYACAKSINIZ', votes: 0, original: true },
      { title: 'Video özeti: üç teknik nokta', votes: 12, original: false },
      { title: 'Tıklama tuzağı olmayan başlık', votes: 30, original: false },
      { title: '  ', votes: 99, original: false },
    ],
    thumbnails: [
      { timestamp: 120.5, votes: 4, original: false },
      { timestamp: -5, votes: 99, original: false },
      { timestamp: 88, votes: 2, original: true },
    ] },
];

function harness(options = {}) {
  const start = main.indexOf("ipcMain.handle('browser:videoExtras:get'");
  const end = main.indexOf("ipcMain.handle('browser:capture:setEnabled'", start);
  assert.ok(start > 0 && end > start, 'handler bloğu bulunamadı');
  const calls = { dearrow: 0, ryd: 0 };
  const sandbox = {
    ipcMain: { handle: (name, fn) => { sandbox.__handler = fn; } },
    authorizedBrowserSender: () => options.authorized !== false,
    sponsorBlockVideoId: (u) => youtubeVideoId(u),
    fetchDeArrowBranding: async () => { calls.dearrow += 1; return { ok: true, videoId: VID, title: 'Topluluk', thumbnail: null }; },
    fetchYouTubeDislikes: async () => { calls.ryd += 1; return { ok: true, videoId: VID, likes: 10, dislikes: 3 }; },
    Promise, String, Object, Number,
  };
  vm.runInNewContext(main.slice(start, end), sandbox);
  return { handler: sandbox.__handler, calls };
}

(async () => {
  await test('DeArrow yanıtı yalnız doğru videoID kaydına süzülür', async () => {
    const rec = extractDeArrowBranding(brandingPayload, VID);
    assert.equal(rec.videoDuration, 612);
    assert.equal(rec.titles.length, 4);
    assert.equal(extractDeArrowBranding(brandingPayload, 'missing0000'), null);
    assert.equal(extractDeArrowBranding('ne dizi ne nesne', VID), null);
    assert.equal(extractDeArrowBranding([], VID), null);
  });

  await test('R195: DeArrow harita zarfı — videoID ve sha256(videoID) anahtarlı', async () => {
    const record = { videoDuration: 300, titles: [{ title: 'Gerçek başlık', votes: 9, original: false }] };
    // videoID anahtarlı harita (belgelenen gerçek yanıt biçimi)
    const byId = { otherid12345: { titles: [{ title: 'Başka', votes: 5 }] }, [VID]: record };
    assert.equal(extractDeArrowBranding(byId, VID).videoDuration, 300);
    // Tam sha256(videoID) anahtarlı harita + içte videoID alanı
    const crypto = require('node:crypto');
    const fullHash = crypto.createHash('sha256').update(VID).digest('hex');
    const byHash = { deadbeef: { videoID: 'x', titles: [] }, [fullHash]: { ...record, videoID: VID } };
    assert.equal(extractDeArrowBranding(byHash, VID).titles.length, 1);
    // R196: tam sha256 anahtarlı kayıt içte videoID taşımaz — anahtarın kendisi
    // kimliği verir (SponsorBlock /api/branding/<prefix> gerçek yanıt biçimi)
    const byHashBare = { [fullHash]: record };
    assert.equal(extractDeArrowBranding(byHashBare, VID).videoDuration, 300);
    // Anahtar eşleşmez ama kayıt içi videoID eşleşir
    const byValue = { somekey: { videoID: VID, titles: [{ title: 't', votes: 1 }] } };
    assert.equal(extractDeArrowBranding(byValue, VID).titles.length, 1);
    // Yanlış video hiçbir yolla eşleşmez
    assert.equal(extractDeArrowBranding(byId, 'nope0000000'), null);
    assert.equal(extractDeArrowBranding({ [VID]: 'dizi-değil' }, VID), null);
  });

  await test('En çok oylanan özgün-olmayan başlık seçilir; boş adaylar atılır', async () => {
    const title = pickDeArrowTitle(brandingPayload[1].titles);
    assert.equal(title, 'Tıklama tuzağı olmayan başlık');
  });

  await test('Kilitli DeArrow başlığı oydan bağımsız öncelenir', async () => {
    const titles = [
      { title: 'Oylu', votes: 40, original: false },
      { title: 'Kilitli başlık', votes: 1, locked: true, original: false },
    ];
    assert.equal(pickDeArrowTitle(titles), 'Kilitli başlık');
    assert.equal(pickDeArrowTitle([{ title: 'Orijinal', votes: 100, original: true }]), '');
    assert.equal(pickDeArrowTitle('dizi degil'), '');
  });

  await test('Başlık temizliği kontrol karakterlerini ayıklar ve uzunluğu sınırlar', async () => {
    assert.equal(sanitizeDeArrowTitle('  çok\n\tboşluk   var  '), 'çok boşluk var');
    assert.equal(sanitizeDeArrowTitle('x'.repeat(500)).length, 200);
    assert.equal(sanitizeDeArrowTitle(null), '');
  });

  await test('DeArrow karesi geçersiz zaman damgalarını ve orijinalleri eler', async () => {
    const thumb = pickDeArrowThumbnail(brandingPayload[1].thumbnails);
    assert.deepEqual(thumb, { timestamp: 120.5 });
    assert.equal(pickDeArrowThumbnail([{ timestamp: 50, original: true, votes: 9 }]), null);
    assert.equal(pickDeArrowThumbnail(null), null);
    assert.equal(pickDeArrowThumbnail([{ locked: true, timestamp: 33, original: false },
      { timestamp: 1, votes: 50, original: false }]).timestamp, 33);
  });

  await test('RYD oyları doğrulanır; sahte/bozuk yükler reddedilir', async () => {
    assert.deepEqual(normalizeRydVotes({ id: VID, likes: 1200, dislikes: 34 }, VID), { likes: 1200, dislikes: 34 });
    assert.equal(normalizeRydVotes({ id: 'xxxxxxxxxxx', likes: 1, dislikes: 1 }, VID), null);
    assert.equal(normalizeRydVotes({ id: VID, likes: -1, dislikes: 0 }, VID), null);
    assert.equal(normalizeRydVotes({ id: VID, likes: 'abc', dislikes: 0 }, VID), null);
    assert.equal(normalizeRydVotes([1, 2], VID), null);
    assert.equal(normalizeRydVotes(null, VID), null);
    // id alanı eksikse yine de sayılır (eski API sürümleri)
    assert.deepEqual(normalizeRydVotes({ likes: 5, dislikes: 6 }, VID), { likes: 5, dislikes: 6 });
  });

  await test('main.js videoExtras handlerı yetki kapısı ve video-id doğrulaması içerir', async () => {
    const { handler } = harness();
    assert.equal(typeof handler, 'function');
  });

  await test('handler: iki kaynak bayrağı da ayrı ayrı toplanır', async () => {
    const { handler, calls } = harness();
    const res = await handler({ sender: {} }, { url: `https://www.youtube.com/watch?v=${VID}`, options: { dearrow: true, dislikes: true } });
    assert.equal(res.ok, true);
    assert.equal(res.videoId, VID);
    assert.equal(res.dearrow.title, 'Topluluk');
    assert.equal(res.votes.likes, 10);
    assert.equal(res.votes.dislikes, 3);
    assert.equal(calls.dearrow, 1);
    assert.equal(calls.ryd, 1);
  });

  await test('handler: kapalı kaynak için fetch çağrısı yapılmaz', async () => {
    const { handler, calls } = harness();
    const res = await handler({ sender: {} }, { url: `youtube:${VID}`, options: { dislikes: true } });
    assert.equal(res.ok, true);
    assert.equal(calls.dearrow, 0, 'kapalı DeArrow için istek çıktı');
    assert.equal(calls.ryd, 1);
    assert.equal(res.votes.dislikes, 3);
    const none = await handler({ sender: {} }, { url: `youtube:${VID}`, options: {} });
    assert.equal(none.ok, true);
    assert.equal(calls.dearrow + calls.ryd, 1, 'boş seçimde gereksiz ağ isteği');
  });

  await test('handler: yetkisiz gönderici ve YouTube-olmayan adres reddedilir', async () => {
    let ctx = harness({ authorized: false });
    const denied = await ctx.handler({ sender: {} }, { url: `https://www.youtube.com/watch?v=${VID}` });
    assert.equal(denied.ok, false);
    ctx = harness();
    const bad = await ctx.handler({ sender: {} }, { url: 'https://example.com/x', options: { dearrow: true } });
    assert.equal(bad.ok, false);
    assert.equal(bad.errorKind, 'unsupported');
  });

  console.log(`browser-video-extras: ${passed} kontrol geçti`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
