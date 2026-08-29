/**
 * Medya kimliği ve kuşak (generation) testleri.
 *
 * Neden var:
 *  - İzleme geçmişi ham URL'ye göre anahtarlanıyordu; aynı video
 *    youtu.be/ID, watch?v=ID&t=30 ve paylaşım parametreli adreslerle FARKLI
 *    kayıtlara düşüyordu.
 *  - Kaynak değişince devam eden asenkron işler (altyazı okuma, kardeş tarama)
 *    eski videonun sonucunu yenisine bağlayabiliyordu; kuşak sayacı bunu keser.
 *
 * Çalıştırma:  node tests/media-source.test.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf-8');
const body = src.slice(src.indexOf('function youtubeVideoId'), src.indexOf('function playerPositionKey'));
const F = new Function(body + '; return { youtubeVideoId, mediaKeyFor };')();

let pass = 0; const fails = [];
const t = (name, fn) => {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fails.push(name + ': ' + e.message); console.log('  FAIL  ' + name + ' — ' + e.message); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };

const BS = String.fromCharCode(92);   // gercek ters bolu

t('aynı YouTube videosu tüm adres biçimlerinde AYNI anahtar', () => {
  const want = 'youtube:DCqSCazDv64';
  const urls = [
    'https://www.youtube.com/watch?v=DCqSCazDv64',
    'https://youtu.be/DCqSCazDv64',
    'https://www.youtube.com/watch?v=DCqSCazDv64&t=30s',
    'https://m.youtube.com/watch?v=DCqSCazDv64&feature=shared',
    'youtube.com/watch?v=DCqSCazDv64',
    'https://www.youtube.com/embed/DCqSCazDv64',
  ];
  for (const u of urls) {
    ok(F.mediaKeyFor('youtube', u) === want, `${u} -> ${F.mediaKeyFor('youtube', u)}`);
  }
});

t('farklı videolar farklı anahtar', () => {
  ok(F.mediaKeyFor('youtube', 'https://youtu.be/AAAAAAAAAAA')
     !== F.mediaKeyFor('youtube', 'https://youtu.be/BBBBBBBBBBB'), 'cakisiyor');
});

t('kimlik çıkarılamayan adres yine de kararlı', () => {
  const k = F.mediaKeyFor('youtube', 'https://example.com/video');
  ok(k.startsWith('youtube:'), k);
  ok(k === F.mediaKeyFor('youtube', ' https://example.com/video '), 'bosluk anahtari degistirdi');
});

t('yerel yol: ayraç ve harf farkı aynı dosyayı bölmez', () => {
  const a = F.mediaKeyFor('local', 'D:' + BS + 'Filmler' + BS + 'Film.mkv');
  const b = F.mediaKeyFor('local', 'd:/Filmler/film.mkv');
  ok(a === b, `${a} != ${b}`);
  ok(a === 'file:d:/filmler/film.mkv', a);
});

t('yerel ve YouTube anahtarları karışmaz', () => {
  ok(F.mediaKeyFor('local', 'DCqSCazDv64') !== F.mediaKeyFor('youtube', 'DCqSCazDv64'), 'ayni');
});

// ---- kuşak koruması kaynakta gerçekten uygulanıyor mu ----
t('kaynak değişimi kuşağı artırır', () => {
  ok(/player@generation@@\+\+/.test(src.replace(/player\.generation\+\+/g, 'player@generation@@++'))
     || src.includes('player.generation++'), 'setMediaKey kusagi artirmiyor');
});

t('asenkron işler kuşak kontrolü yapıyor', () => {
  // loadSubtitle ve attachSiblingSubtitles sonuc gelince hala ayni kaynak mi diye bakmali
  const load = src.slice(src.indexOf('async function loadSubtitle'),
                         src.indexOf('function openPlayer'));
  ok(load.includes('staleGeneration'), 'loadSubtitle/attachSiblingSubtitles kusak kontrolu yapmiyor');
  const guards = (src.match(/staleGeneration\(/g) || []).length;
  ok(guards >= 3, `yalnizca ${guards} kusak kontrolu var (altyazi okuma, kardes tarama, YouTube altyazisi bekleniyor)`);
});

console.log(`\n${pass} geçti, ${fails.length} başarısız (${pass + fails.length} test)`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
