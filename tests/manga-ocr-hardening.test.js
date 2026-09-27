'use strict';

// R167 — manga/OCR hattı sertleştirme testleri.
// Bulgu: isSafeMangaImageUrl sondaki-nokta FQDN'sini ('localhost.') normal-
// leştirmeden tam-eşitlik kapısıyla karşılaştırıyordu → SSRF atlatması.
// Ayrıca extractJsonPayload fuzz, detectMangaImageMime sihirli-bayt ve
// normalizeMangaOcrRegions kapıları kilitlenir.

const assert = require('node:assert');
const manga = require('../src/browser-manga.js');

let n = 0;
const ok = (cond, msg) => { n += 1; assert(cond, msg); };

// --- SSRF: sondaki nokta (FQDN kökü) atlatması — R167 gerçek bug ---
ok(manga.isSafeMangaImageUrl('http://localhost./x.png') === false, 'localhost. reddedilir');
ok(manga.isSafeMangaImageUrl('http://LOCALHOST./x.png') === false, 'LOCALHOST. reddedilir');
ok(manga.isSafeMangaImageUrl('http://foo.local./x.png') === false, 'foo.local. reddedilir');
ok(manga.isSafeMangaImageUrl('http://a.local./x.png') === false, 'a.local. reddedilir');
ok(manga.isSafeMangaImageUrl('https://example.com./ok.png') === true, 'public FQDN noktası sorun değil');
ok(manga.isSafeMangaImageUrl('http://localhost/x.png') === false, 'localhost reddedilir');
ok(manga.isSafeMangaImageUrl('http://127.0.0.1/x.png') === false, '127.0.0.1 reddedilir');
ok(manga.isSafeMangaImageUrl('http://0x7f000001/x.png') === false, 'hex IPv4 reddedilir');
ok(manga.isSafeMangaImageUrl('http://2130706433/x.png') === false, 'decimal IPv4 reddedilir');
ok(manga.isSafeMangaImageUrl('http://169.254.169.254/x.png') === false, 'link-local reddedilir');
ok(manga.isSafeMangaImageUrl('http://10.0.0.1/x.png') === false, '10.x reddedilir');
ok(manga.isSafeMangaImageUrl('http://172.16.0.1/x.png') === false, '172.16.x reddedilir');
ok(manga.isSafeMangaImageUrl('http://192.168.1.1/x.png') === false, '192.168.x reddedilir');
ok(manga.isSafeMangaImageUrl('http://[::1]/x.png') === false, '::1 reddedilir');
ok(manga.isSafeMangaImageUrl('http://[::ffff:7f00:1]/x.png') === false, 'v4-mapped ::1 reddedilir');
ok(manga.isSafeMangaImageUrl('http://[fe80::1]/x.png') === false, 'link-local v6 reddedilir');
ok(manga.isSafeMangaImageUrl('http://[fd00::1]/x.png') === false, 'ULA reddedilir');
ok(manga.isSafeMangaImageUrl('http://[2002:7f00:1::]/x.png') === false, '6to4 reddedilir');
ok(manga.isSafeMangaImageUrl('http://user:pw@host/x.png') === false, 'kimlikli URL reddedilir');
ok(manga.isSafeMangaImageUrl('file:///etc/passwd') === false, 'file reddedilir');
ok(manga.isSafeMangaImageUrl('javascript:x') === false, 'javascript reddedilir');
ok(manga.isSafeMangaImageUrl('data:image/png;base64,AA==') === false, 'data reddedilir');
ok(manga.isSafeMangaImageUrl('') === false, 'boş reddedilir');
ok(manga.isSafeMangaImageUrl('notaurl') === false, 'geçersiz reddedilir');
ok(manga.isSafeMangaImageUrl('https://cdn.example.com/p.png') === true, 'https public kabul');
ok(manga.isSafeMangaImageUrl('http://8.8.8.8/x.png') === true, 'public IPv4 kabul');
ok(manga.isSafeMangaImageUrl('http://[2606:4700::1]/x.png') === true, 'public IPv6 kabul');
ok(manga.isSafeMangaImageUrl('http://127.0.0.1.evil.com/x.png') === true,
  '127.0.0.1.evil.com public alan — engel değil');

// --- extractJsonPayload: bozuk/katıştırılmış girdi ---
ok(manga.extractJsonPayload('{"a":1}').a === 1, 'düz JSON');
ok(manga.extractJsonPayload('```json\n{"a":2}\n```').a === 2, 'fenced JSON');
ok(manga.extractJsonPayload('text {"a":3} tail').a === 3, 'gömülü JSON');
ok(manga.extractJsonPayload([{ x: 1 }])[0].x === 1, 'nesne girdisi');
assert.throws(() => manga.extractJsonPayload(''), /boş/, 'boş hata');
assert.throws(() => manga.extractJsonPayload('no json here'), /JSON bulunamadı/, 'json yok hata');
assert.throws(() => manga.extractJsonPayload('{unclosed'), /okunamadı|tamamlanmamış/, 'yarım hata');
n += 3;
// 16-aday tavanı: çok sayıda '{' + geçersiz kapanış → O(n) sınırı
assert.throws(() => manga.extractJsonPayload('{'.repeat(200) + 'data'), /okunamadı/, 'aday tavanı');
n += 1;
ok(manga.extractJsonPayload('prefix {"a":{"b":[1]}} suffix').a.b[0] === 1, 'iç içe gömülü');
ok(manga.extractJsonPayload('x{"s":"{}"}y').s === '{}', 'tırnaklı kaşlı içerik');

// --- detectMangaImageMime ---
const mime = manga.detectMangaImageMime;
ok(mime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) === 'image/jpeg', 'jpeg');
ok(mime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])) === 'image/png', 'png');
ok(mime(Buffer.from('GIF89a' + 'x'.repeat(10))) === 'image/gif', 'gif89a');
ok(mime(Buffer.from('RIFFxxxxWEBP', 'ascii')) === 'image/webp', 'webp');
ok(mime(Buffer.from('xxxxftypavif', 'ascii')) === 'image/avif', 'avif');
ok(mime(Buffer.from('xxxxftypavis', 'ascii')) === 'image/avif', 'avis');
ok(mime(Buffer.from('random bytes not image')) === '', 'rastgele → boş');
ok(mime(Buffer.from([0xff])) === '', 'kısa → boş');
ok(mime('not a buffer') === '', 'buffer değil → boş');

// --- normalizeMangaOcrRegions kapıları ---
const norm = manga.normalizeMangaOcrRegions;
ok(JSON.stringify(norm(null)) === '[]', 'null → []');
ok(JSON.stringify(norm({})) === '[]', 'nesne → []');
ok(norm([{ box: [0, 0, 100, 100], source: 'hi' }]).length === 1, 'geçerli bölge');
ok(norm([{ box: [0, 0, 4, 4], source: 'hi' }]).length === 0, '8px altı bölge düşer');
ok(norm([{ box: [0, 0, 100, 100] }]).length === 0, 'source\'suz düşer');
{
  const regions = norm(Array.from({ length: 500 }, (_, i) => ({
    box: [i % 900, i % 900, (i % 900) + 50, (i % 900) + 50], source: `t${i}` })));
  ok(regions.length <= 160, '160 bölge tavanı');
}
{
  const row = norm([{ box: [0, 0, 100, 100], source: 'x', translation: 'should-clear' }])[0];
  ok(row && row.translation === '' && row.hidden === false, 'OCR çeviri/hidden sıfırlanır');
}

// --- normalizeMangaBox sınırları (çeviri taşıyan satırlar — source-only
// satırlar normalizeMangaRegions'da kasten düşer) ---
const regions = manga.normalizeMangaRegions;
{
  const out = regions([{ box: [900, 900, 100, 100], translation: 'çev' }])[0];
  ok(out && out.textBox[0] === 100 && out.textBox[2] === 900, 'ters köşe düzeltilir');
}
ok(regions([{ box: [0, 0, 1001, 1001], translation: 'çev' }]).length === 1, 'clamp 1000');
ok(regions([{ box: ['a', 'b', 'c', 'd'], translation: 'çev' }]).length === 0, 'sayısal olmayan düşer');
ok(regions([{ box: [0, 0, 100, 100], source: 's' }]).length === 0, 'çevirisiz düşer');

// --- mangaOcrCacheKey kararlılığı ---
const k1 = manga.mangaOcrCacheKey(Buffer.from('img'), { model: 'm' });
const k2 = manga.mangaOcrCacheKey(Buffer.from('img'), { model: 'm' });
const k3 = manga.mangaOcrCacheKey(Buffer.from('img2'), { model: 'm' });
const k4 = manga.mangaOcrCacheKey(Buffer.from('img'), { model: 'other' });
ok(k1 === k2, 'aynı girdi aynı anahtar');
ok(k1 !== k3 && k1 !== k4, 'farklı görsel/model farklı anahtar');
ok(/^[a-f0-9]{64}$/.test(k1), 'sha256 biçimi');

// --- buildMangaPrompt sözlük temizliği ---
{
  const prompt = manga.buildMangaPrompt({ glossary: ['a\x00b\n c', ' plain '] });
  ok(!prompt.includes('\x00') && !prompt.includes('\n '), 'kontrol karakterleri temizlenir');
}
{
  const prompt = manga.buildMangaPrompt({ glossary: Array.from({ length: 300 }, (_, i) => `e${i}`) });
  ok(prompt.length < 64 * 1024, 'sözlük tavanı promptu şişirmez');
}

// --- selectMangaCandidates ---
{
  const candidates = [
    { id: 'a', url: 'https://a', readerScore: 9 },
    { id: 'b', url: 'https://b', readerScore: 1 },
    { id: 'c', url: 'https://c', readerScore: 7, excluded: true },
    { id: 'd', url: 'https://d', readerScore: 6 },
  ];
  const picked = manga.selectMangaCandidates(candidates, 2);
  ok(picked.length === 2 && picked[0].id === 'a', 'puana göre sıralı seçim + excluded düşer');
  ok(manga.selectMangaCandidates(null).length === 0, 'null → []');
}

console.log(`manga-ocr-hardening: ${n} kontrol geçti`);
