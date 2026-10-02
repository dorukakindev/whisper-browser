// Kuyruk-50 madde 21 — adapter uyumluluk paketi: her browser adaptörü aynı
// davranış sözleşmesinden geçer + yerel site fixture'ları (sayfa → yanıt
// yönlendirmesi). Fixture tablosu gerçek alan/yol şekillerini temsil eder;
// ağ erişimi gerektirmez.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const { createBuiltinAdapterRegistry, normalizeAdapter, BUILTIN_ADAPTER_DEFINITIONS }
  = require('../src/browser-adapter-registry');
const {
  ADAPTER_REGISTRY, GENERIC_ADAPTER, adapterAcceptsResponse,
  browserAdapterForUrl, browserResponseAdapter,
} = require('../src/browser-adapters');

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---- Yerel site fixture'ları: { sayfa, kabul edilen yanıt URL'leri, yabancı sayfa } ----
const FIXTURES = [
  { id: 'netflix', page: 'https://www.netflix.com/watch/81215568', responses: ['https://ipv6-c015-ist001-ix.1.oca.nflxvideo.net/range/subs?x.vtt'], foreign: 'https://www.hulu.com' },
  { id: 'disney', page: 'https://www.disneyplus.com/video/abc-123', responses: ['https://disneyplus.edgesuite.bamgrid.com/suitcase/captions.en.vtt'], foreign: 'https://vimeo.com' },
  { id: 'max', page: 'https://play.max.com/video/watch/xyz', responses: ['https://manifest.production.max.com/video.mpd'], foreign: 'https://netflix.com' },
  { id: 'discovery', page: 'https://go.discoveryplus.com/video/show/abc', responses: ['https://discoveryplus.akamaized.net/subs/turkish.vtt'], foreign: 'https://primevideo.com' },
  { id: 'hulu', page: 'https://www.hulu.com/watch/episode-1', responses: ['https://v2.translations.hulu.com/timedtext/episode.vtt'], foreign: 'https://max.com' },
  { id: 'youtube', page: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', responses: ['https://rr1---sn-abc.googlevideo.com/api/timedtext?v=dQw4&lang=en'], foreign: 'https://vimeo.com/watch/1' },
  { id: 'prime-video', page: 'https://www.primevideo.com/detail/0ABC', responses: ['https://cfww.media-amazon.com/dash/captions/aa.vtt'], foreign: 'https://hulu.com' },
  { id: 'crunchyroll', page: 'https://www.crunchyroll.com/watch/E123', responses: ['https://static.crunchyroll.com/i/subtitles/en.vtt'], foreign: 'https://netflix.com' },
  { id: 'bbc-iplayer', page: 'https://www.bbc.co.uk/iplayer/episode/m001', responses: ['https://vod-subtitles.bbc.co.uk/iplayer/subtitles/eb.vtt'], foreign: 'https://arte.tv' },
  { id: 'arte', page: 'https://www.arte.tv/en/videos/123456/', responses: ['https://arte-cdn.net/arte/api/subtitles/en.vtt'], foreign: 'https://bbc.co.uk' },
  { id: 'raiplay', page: 'https://www.raiplay.it/video/2024/episode.html', responses: ['https://vod.rai.it/subtitles/episode.it.vtt'], foreign: 'https://arte.tv' },
  { id: 'plex', page: 'https://app.plex.tv/desktop/#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F5', responses: ['https://meta.plex.tv/library/metadata/5/streams.vtt'], foreign: 'https://max.com' },
  { id: 'stremio', page: 'https://web.stremio.com/#/detail/movie/tt123', responses: ['https://strem.io/subtitles/stream.vtt'], foreign: 'https://vimeo.com' },
  { id: 'coursera', page: 'https://www.coursera.org/lecture/course/part-1', responses: ['https://d2jfg5zni9lci.cloudfront.net/subtitles/coursera.vtt'], foreign: 'https://udemy.com' },
  { id: 'udemy', page: 'https://www.udemy.com/course/react/learn/lecture/123', responses: ['https://udemycdn.com/course/lecture/subs/tr.vtt'], foreign: 'https://coursera.org' },
  { id: 'vimeo', page: 'https://vimeo.com/987654321', responses: ['https://vod-progressive.vimeocdn.com/texttrack/track.vtt'], foreign: 'https://youtube.com' },
];

// ---- Sözleşme 1: sayfa → adaptör eşleşmesi ----
for (const f of FIXTURES) {
  const found = browserAdapterForUrl(f.page);
  check(`${f.id}: sayfa doğru adaptöre eşlenir`, found.id === f.id, `got ${found.id}`);
}
check('bilinmeyen sayfa → generic', browserAdapterForUrl('https://bilinmeyen-servis.example/watch').id === 'generic');
check('geçersiz URL → generic (atmaz)', browserAdapterForUrl('://bozuk').id === 'generic');
check('boş string → generic', browserAdapterForUrl('').id === 'generic');
check('non-http şema → generic', browserAdapterForUrl('ftp://netflix.com/x').id === 'generic');

// ---- Sözleşme 2: yanıt URL'si sayfa bağlamında aynı servise bağlanır ----
for (const f of FIXTURES) {
  for (const ru of f.responses) {
    const got = browserResponseAdapter(f.page, ru);
    check(`${f.id}: yanıt bağlamda korunur`, got.id === f.id, `${ru} → ${got.id}`);
  }
}
// Yanıt hostu yabancı ama responseHint tutar → sayfa adaptörü kazanır.
check('netflix sayfasında nflxvideo altyazısı netflix kalır',
  browserResponseAdapter('https://netflix.com/watch/1', 'https://nflxvideo.net/timedtext/x.vtt').id === 'netflix');
// Yabancı sayfa + yabancı altyazı yanıtı → generic.
check('yabancı sayfa + generic .vtt → generic',
  browserResponseAdapter('https://bilinmeyen.example/x', 'https://cdn.example/x.vtt').id === 'generic');
check('null yanıt URL → generic', browserResponseAdapter('https://netflix.com', null).id === 'generic');

// ---- Sözleşme 3: yabancı sayfa başka servise sızmasın ----
for (const f of FIXTURES) {
  const found = browserAdapterForUrl(f.foreign);
  check(`${f.id}: yabancı sayfa ${f.id} değil`, found.id !== f.id, `got ${found.id}`);
}

// ---- Sözleşme 4: responseHint altyazıyı kabul eder, alakasızı reddeder ----
const captions = [
  'https://cdn.example.com/subs/en.vtt',
  'https://cdn.example.com/ttml/ep.ttml',
  'https://cdn.example.com/manifest/video.mpd',
  'https://cdn.example.com/hls/index.m3u8',
];
const junk = [
  'https://cdn.example.com/thumb.jpg',
  'https://cdn.example.com/api/metadata.json',
  'https://cdn.example.com/lib/player.js',
];
for (const f of FIXTURES) {
  const adapter = ADAPTER_REGISTRY.get(f.id);
  for (const ru of captions) {
    check(`${f.id}: altyazı yolu kabul`, adapterAcceptsResponse(adapter, { url: ru }), ru);
  }
  for (const ru of junk) {
    const accepted = adapterAcceptsResponse(adapter, { url: ru, mimeType: 'image/jpeg' });
    check(`${f.id}: junk reddedilir`, !accepted, ru);
  }
}
check('mime-only VTT kabul', adapterAcceptsResponse(GENERIC_ADAPTER, { url: 'https://x/a', mimeType: 'text/vtt' }));
check('json reddedilir', !adapterAcceptsResponse(GENERIC_ADAPTER, { url: 'https://x/a', mimeType: 'application/json' }));
check('boş yanıt güvenli', !adapterAcceptsResponse(GENERIC_ADAPTER, {}));

// ---- Sözleşme 5: registry invariantları ----
const CAP_KEYS = ['signIn', 'playback', 'nativeTextTrack', 'networkCapture', 'manifestCapture', 'dualTrack', 'overlay', 'fullscreen', 'translation'];
for (const a of ADAPTER_REGISTRY.list()) {
  check(`${a.id}: frozen`, Object.isFrozen(a) && Object.isFrozen(a.capabilities));
  check(`${a.id}: id kalıbı`, /^[a-z0-9][a-z0-9-]{1,47}$/.test(a.id));
  check(`${a.id}: label dolu`, a.label.length > 0 && a.label.length <= 80);
  check(`${a.id}: help dolu`, a.help.length > 0 && a.help.length <= 300);
  check(`${a.id}: tüm yetenek anahtarları boolean`, CAP_KEYS.every((k) => typeof a.capabilities[k] === 'boolean'));
  check(`${a.id}: verificationStatus enum`, ['verified', 'partial', 'unverified'].includes(a.verificationStatus));
  check(`${a.id}: verifiedAt kalıbı`, a.verifiedAt === '' || /^\d{4}-\d{2}-\d{2}$/.test(a.verifiedAt));
  check(`${a.id}: source=builtin`, a.source === 'builtin');
}
check('16 yerleşik adaptör kayıtlı', ADAPTER_REGISTRY.list().length === BUILTIN_ADAPTER_DEFINITIONS.length);
check('capabilityMatrix her adaptörü döndürür', ADAPTER_REGISTRY.capabilityMatrix().length === ADAPTER_REGISTRY.list().length);
check('hiçbir adaptörün id çakışması yok', new Set(ADAPTER_REGISTRY.list().map((a) => a.id)).size === ADAPTER_REGISTRY.list().length);

// ---- Sözleşme 6: hata/temizleme davranışı ----
check('çift kayıt atmaz → Error fırlatır', (() => {
  const r = new (Object.getPrototypeOf(ADAPTER_REGISTRY).constructor)();
  r.register({ id: 'x-test', hosts: ['x.test'] });
  try { r.register({ id: 'x-test', hosts: ['x.test'] }); return false; } catch (e) { return /zaten kayıtlı/.test(e.message); }
})());
check('geçersiz id reddedilir', (() => {
  try { normalizeAdapter({ id: 'BAD ID!' }); return false; } catch (_) { return true; }
})());
check('normalizeAdapter boş tanımı reddeder', (() => {
  try { normalizeAdapter({}); return false; } catch (_) { return true; }
})());
check('kullanıcı adaptörü yerleşiği geçersiz sürümle ezer mi — hayır', (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-adapter-'));
  fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ version: 9, id: 'netflix', hosts: ['evil.example'] }));
  const { loaded, errors } = createBuiltinAdapterRegistry().loadJsonDirectory(dir);
  return loaded.length === 0 && errors.length === 1;
})());
check('JSON dizini: geçerli kullanıcı adaptörü yüklenir, büyük dosya reddedilir', (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-adapter-'));
  fs.writeFileSync(path.join(dir, 'ok.json'), JSON.stringify({ version: 1, id: 'mytv', hosts: ['mytv.example'], label: 'MyTV' }));
  fs.writeFileSync(path.join(dir, 'big.json'), JSON.stringify({ version: 1, id: 'big', hosts: ['x'.repeat(200 * 1024)] }));
  const { loaded, errors } = createBuiltinAdapterRegistry().loadJsonDirectory(dir);
  return JSON.stringify(loaded) === '["mytv"]' && errors.length === 1;
})());
// loadJsonDirectory eksik dizini recursive mkdir ile oluşturur (ilk-açılış UX'i);
// gerçek hata ancak oluşturulamaz/okunamaz yolda doğar — dosya çakışması bunu verir.
check('JSON dizini okunamazsa hata döner (atmaz)', (() => {
  const blocker = path.join(os.tmpdir(), `wb-adapter-engel-${process.pid}`);
  fs.writeFileSync(blocker, 'x');
  try {
    const { loaded, errors } = createBuiltinAdapterRegistry().loadJsonDirectory(blocker);
    return loaded.length === 0 && errors.length === 1;
  } finally {
    fs.rmSync(blocker, { force: true });
  }
})());
check('get/lookup unknown → null', ADAPTER_REGISTRY.get('yok') === null);
check('get case-insensitive', ADAPTER_REGISTRY.get('NETFLIX').id === 'netflix');

console.log(`browser-adapter-contract: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
