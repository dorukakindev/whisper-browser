'use strict';
// R159: NDJSON protokol dayanıklılığı — sınır davranışları + fuzz rekonstrüksiyonu.
const assert = require('assert');
const { createNdjsonLineBuffer } = require('../src/ndjson-lines');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };

// Kesin sınır: uzunluk == max geçer, max+1 düşer.
{
  const drops = [];
  const p = createNdjsonLineBuffer({ maxLineChars: 2048, onOverflow: (l) => drops.push(l) });
  ok(p.push('x'.repeat(2048) + '\n').length === 1, 'max satır geçer');
  ok(p.push('x'.repeat(2049) + '\n').length === 0 && drops[0] === 2049, 'max+1 düşer');
}

// flush() dropping sırasında → [] ve durum temizlenir.
{
  const p = createNdjsonLineBuffer({ maxLineChars: 1024 });
  p.push('x'.repeat(2000));            // pending taşması → dropping
  ok(p.flush().length === 0, 'dropping sırasında flush boş');
  ok(p.push('{"a":1}\n').length === 1, 'dropping sonrası toparlanma');
  ok(p.flush().length === 0, 'ikinci flush boş');
}

// Yalnız \r satır sonu değil; \n gelince \r satır içinde kalır (JSON.parse tolere eder).
{
  const p = createNdjsonLineBuffer();
  ok(p.push('{"a":1}\r').length === 0, 'lone CR satır sonu değil');
  ok(p.push('\r\n').length === 1, 'CRLF satırını verir');
}

// Boş push / undefined / null güvenli.
{
  const p = createNdjsonLineBuffer();
  ok(p.push('').length === 0 && p.push(null).length === 0 && p.push(undefined).length === 0,
    'boş parçalar güvenli');
}

// Üst üste taşan satırlar her seferinde onOverflow çağırır.
{
  let count = 0;
  const p = createNdjsonLineBuffer({ maxLineChars: 1024, onOverflow: () => count++ });
  p.push('x'.repeat(2000) + '\n' + 'y'.repeat(2000) + '\n');
  ok(count === 2, 'iki taşan satır iki kez raporlanır');
}

// Fuzz: rastgele parçalama → kayıpsız rekonstrüksiyon.
{
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let round = 0; round < 2000; round++) {
    const events = Array.from({ length: Math.floor(rnd() * 6) + 1 }, (_, i) =>
      JSON.stringify({ type: 'segment', i, text: 'türkçe 🙂 ' + 'x'.repeat(Math.floor(rnd() * 40)) }));
    const stream = events.join('\n') + (rnd() > 0.3 ? '\n' : '');
    const p = createNdjsonLineBuffer();
    const out = [];
    for (let i = 0; i < stream.length;) {
      const step = Math.floor(rnd() * 50) + 1;
      out.push(...p.push(stream.slice(i, i + step)));
      i += step;
    }
    out.push(...p.flush());
    const got = out.filter((l) => l.trim()).map((l) => JSON.parse(l));
    ok(got.length === events.length, `fuzz tur ${round}: ${got.length}/${events.length} olay`);
    got.forEach((ev, i) => ok(ev.i === i && ev.type === 'segment', `fuzz tur ${round} olay ${i}`));
  }
}

// Bozuk satır arada — tampon kopmaz, sonraki olay gelir (ana handleLine sözleşmesi).
{
  const p = createNdjsonLineBuffer();
  const lines = p.push('{bozuk\n{"type":"done"}\n');
  ok(lines.length === 2, 'bozuk + geçerli satır birlikte gelir');
  ok(JSON.parse(lines[1]).type === 'done', 'bozuk satır sonrası toparlanma');
}

console.log(`ndjson-durability: ${n} kontrol geçti`);
