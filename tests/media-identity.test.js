/** Servis-bilinçli URL kimliği, pairwise fixture ve karşı-örnek testleri. */
const {
  canonicalWebUrl,
  mediaKeyFor,
  youtubeVideoId,
} = require('../src/media-identity');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log(`  FAIL  ${name} — ${error.message}`); }
}
function assert(value, message) { if (!value) throw new Error(message || 'assert'); }

const fixtures = [];
const videoIds = Array.from({ length: 10 }, (_, index) =>
  String.fromCharCode(65 + index) + String(index).padStart(10, '0'));
for (const id of videoIds) {
  const playlist = 'PL' + id + 'XYZ';
  const variants = [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/watch?v=${id}&t=30s`,
    `https://m.youtube.com/watch?v=${id}&feature=shared`,
    `youtube.com/watch?v=${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube.com/v/${id}`,
    `http://www.youtube.com/watch?v=${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/watch?index=4&list=${playlist}&v=${id}`,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${id}`,
    `https://www.youtube.com./watch?v=${id}`,
    `//youtu.be/${id}`,
    `https://music.youtube.com/watch?v=${id}`,
  ];
  for (const url of variants) fixtures.push({ group: `video:${id}`, url, key: mediaKeyFor('youtube', url) });
}

for (let index = 0; index < 5; index++) {
  const id = `PL_FIXTURE_${String(index).padStart(4, '0')}`;
  const variants = [
    `https://www.youtube.com/playlist?list=${id}`,
    `youtube.com/playlist?utm_source=test&list=${id}`,
    `https://m.youtube.com/watch?list=${id}&index=8`,
    `https://www.youtube.com/watch?index=2&list=${id}`,
  ];
  for (const url of variants) fixtures.push({ group: `playlist:${id}`, url, key: mediaKeyFor('youtube', url) });
}

for (let index = 0; index < 10; index++) {
  const base = `https://media.example.test/catalog/~viewer/video-${index}?a=1&b=${index}`;
  const variants = [
    base,
    `HTTPS://MEDIA.EXAMPLE.TEST:443/catalog/%7Eviewer/video-${index}?b=${index}&a=1&utm_source=test`,
    `https://media.example.test./catalog/~viewer/video-${index}?a=1&b=${index}&fbclid=fixture`,
    `https://media.example.test/catalog/~viewer/video-${index}?b=${index}&a=1`,
  ];
  for (const url of variants) fixtures.push({ group: `web:${index}`, url, key: mediaKeyFor('browser', url) });
}

for (let index = 0; index < 5; index++) {
  const variants = [
    `https://cdn.example.test/video.m3u8?asset=film-${index}&Signature=synthetic-${index}&Expires=100`,
    `https://cdn.example.test/video.m3u8?Expires=100&Signature=synthetic-${index}&asset=film-${index}`,
    `https://cdn.example.test/video.m3u8?Signature=synthetic-${index}&asset=film-${index}&Expires=100&utm_medium=fixture`,
  ];
  for (const url of variants) fixtures.push({ group: `signed:${index}`, url, key: mediaKeyFor('browser', url) });
}

for (let index = 0; index < 5; index++) {
  const target = encodeURIComponent(`https://target.example.test/video/${index}?episode=${index}`);
  const variants = [
    `https://go.example.test/redirect?url=${target}&campaign=test`,
    `https://go.example.test/redirect?campaign=test&url=${target}`,
    `https://go.example.test/redirect?url=${target}&utm_source=fixture&campaign=test`,
  ];
  for (const url of variants) fixtures.push({ group: `redirect:${index}`, url, key: mediaKeyFor('browser', url) });
}

test('en az 150 hassas olmayan URL fixture üretildi', () => {
  assert(fixtures.length >= 150, `fixture sayısı ${fixtures.length}`);
});

test('tüm fixture çiftlerinde false split ve false merge sıfır', () => {
  let falseSplits = 0;
  let falseMerges = 0;
  let samePairs = 0;
  let differentPairs = 0;
  for (let i = 0; i < fixtures.length; i++) {
    for (let j = i + 1; j < fixtures.length; j++) {
      const sameExpected = fixtures[i].group === fixtures[j].group;
      const sameActual = fixtures[i].key === fixtures[j].key;
      if (sameExpected) {
        samePairs++;
        if (!sameActual) falseSplits++;
      } else {
        differentPairs++;
        if (sameActual) falseMerges++;
      }
    }
  }
  console.log(`    fixture=${fixtures.length}, aynı-çift=${samePairs}, farklı-çift=${differentPairs}, false-split=${falseSplits}, false-merge=${falseMerges}`);
  assert(falseSplits === 0, `false split ${falseSplits}`);
  assert(falseMerges === 0, `false merge ${falseMerges}`);
});

test('YouTube görünümlü başka alan adları video kimliğine dönüşmez', () => {
  const id = videoIds[0];
  const impostors = [
    `https://evil.example/watch?v=${id}`,
    `https://youtu.be.evil.example/${id}`,
    `https://youtube.com.evil.example/embed/${id}`,
    `https://youtube.com@evil.example/watch?v=${id}`,
    `https://notyoutube.example/path/youtu.be/${id}`,
  ];
  for (const url of impostors) {
    assert(youtubeVideoId(url) === '', `kimlik çıkarıldı: ${url}`);
    assert(mediaKeyFor('youtube', url) !== `youtube:${id}`, `yanlış birleşti: ${url}`);
  }
});

test('geçersiz ve çelişkili video kimlikleri fallback alanında ayrı kalır', () => {
  const bad = [
    'https://youtube.com/watch?v=ABCDEF',
    'https://youtube.com/watch?v=ABCDEFGHIJKL',
    `https://youtube.com/watch?v=${videoIds[0]}&v=${videoIds[1]}`,
    `https://youtu.be/${videoIds[0]}/extra`,
  ].map((url) => mediaKeyFor('youtube', url));
  assert(new Set(bad).size === bad.length, 'geçersiz kaynaklar birleşti');
  assert(bad.every((key) => key.startsWith('youtube-url:v2:')), 'fallback prefix yanlış');
});

test('playlist bağlamı videoyu bölmez, playlist-only index de kimlik değildir', () => {
  const id = videoIds[2];
  const list = 'PL_CONTEXT_0001';
  assert(mediaKeyFor('youtube', `https://youtube.com/watch?v=${id}&list=${list}&index=1`)
    === mediaKeyFor('youtube', `https://youtube.com/watch?index=99&list=${list}&v=${id}`), 'video playlist indexiyle bölündü');
  assert(mediaKeyFor('youtube', `https://youtube.com/playlist?list=${list}&index=1`)
    === mediaKeyFor('youtube', `https://youtube.com/watch?list=${list}&index=99`), 'playlist indexiyle bölündü');
});

test('imzalı ve servis-anlamlı sorgular silinmez veya açık metin sızdırmaz', () => {
  const a = mediaKeyFor('browser', 'https://cdn.example.test/video.m3u8?asset=film-a&Signature=fixture-secret-a&Expires=10');
  const b = mediaKeyFor('browser', 'https://cdn.example.test/video.m3u8?asset=film-a&Signature=fixture-secret-b&Expires=10');
  const c = mediaKeyFor('browser', 'https://cdn.example.test/video.m3u8?asset=film-b&Signature=fixture-secret-a&Expires=10');
  assert(a !== b && a !== c && b !== c, 'imza veya asset sorgusu yanlış birleşti');
  assert(!a.includes('fixture-secret-a'), 'imza anahtara açık metin girdi');
  assert(a === mediaKeyFor('browser', 'https://cdn.example.test/video.m3u8?Expires=10&Signature=fixture-secret-a&asset=film-a'), 'sorgu sırası false split üretti');
});

test('redirect hedefi, fragment, yol harfi ve anlamlı query farklılıkları korunur', () => {
  const pairs = [
    ['https://go.example.test/r?url=https%3A%2F%2Fa.test%2F1', 'https://go.example.test/r?url=https%3A%2F%2Fa.test%2F2'],
    ['https://spa.example.test/watch#episode-1', 'https://spa.example.test/watch#episode-2'],
    ['https://media.example.test/Video', 'https://media.example.test/video'],
    ['https://media.example.test/watch?id=1', 'https://media.example.test/watch?id=2'],
  ];
  for (const [a, b] of pairs) assert(canonicalWebUrl(a) !== canonicalWebUrl(b), `${a} ile ${b} birleşti`);
});

test('userinfo kimliği ayırır fakat anahtarda açık metin kalmaz', () => {
  const a = mediaKeyFor('browser', 'https://alice:synthetic-pass-a@media.example.test/video');
  const b = mediaKeyFor('browser', 'https://alice:synthetic-pass-b@media.example.test/video');
  assert(a !== b, 'farklı userinfo birleşti');
  assert(!a.includes('alice') && !a.includes('synthetic-pass-a'), 'userinfo açık metin kaldı');
});

test('deterministik rastgele URL karşı-testlerinde çakışma ve tracking split yok', () => {
  let seed = 0x27c0ffee;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const keys = new Set();
  let trackingSplits = 0;
  for (let index = 0; index < 2000; index++) {
    const value = random().toString(36) + '-' + index.toString(36);
    const url = `https://service-${index % 17}.example.test/watch/${value}?episode=${index}&quality=${random() % 2160}`;
    const key = mediaKeyFor('browser', url);
    if (keys.has(key)) throw new Error(`rastgele çakışma: ${index}`);
    keys.add(key);
    if (key !== mediaKeyFor('browser', url + '&utm_campaign=fixture')) trackingSplits++;
  }
  console.log(`    rastgele=2000, benzersiz=${keys.size}, tracking-false-split=${trackingSplits}`);
  assert(keys.size === 2000, `benzersiz ${keys.size}`);
  assert(trackingSplits === 0, `tracking split ${trackingSplits}`);
});

test('rastgele YouTube impostor alan adları gerçek video anahtarıyla birleşmez', () => {
  for (let index = 0; index < 500; index++) {
    const id = String.fromCharCode(65 + (index % 26)) + String(index).padStart(10, '0');
    const url = `https://youtube.com.attacker-${index}.example/watch?v=${id}`;
    assert(mediaKeyFor('youtube', url) !== `youtube:${id}`, `impostor ${index} birleşti`);
  }
});

test('kimlik üretimi 50 bin URL için etkileşim yolunu bloke edecek düzeye çıkmaz', () => {
  const started = process.hrtime.bigint();
  let checksum = 0;
  for (let index = 0; index < 50000; index++) {
    checksum += mediaKeyFor('browser', `https://perf.example.test/v/${index}?b=2&a=1&utm_source=x`).length;
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`    kimlik-perf=50000 URL/${elapsedMs.toFixed(1)} ms, checksum=${checksum}`);
  assert(elapsedMs < 5000, `çok yavaş: ${elapsedMs.toFixed(1)} ms`);
});

console.log(`\n${passed} geçti, ${failures.length} başarısız (${passed + failures.length} test; ${fixtures.length} fixture)`);
if (failures.length) {
  failures.forEach((failure) => console.error('  - ' + failure));
  process.exit(1);
}
