// R323-7 — clipboard/drag URL sanitizasyon fuzz'ı.
// pickDroppedLink (renderer-helpers) uri-list/plain-text bırakma metninden
// yalnız http/https hedef seçmeli: yorum satırları atılır, şema-beyazliste
// dışı reddedilir. Kaynak-slice ile fonksiyonu yükleyip oracle'a koşturur.
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const SRC = fs.readFileSync('src/renderer/renderer-helpers.js', 'utf8');
const m = SRC.match(/function pickDroppedLink\(text\) \{[\s\S]*?\n\}/);
assert.ok(m, 'pickDroppedLink bulunamadı');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[0], sandbox);
const pickDroppedLink = sandbox.pickDroppedLink;
assert.equal(typeof pickDroppedLink, 'function', 'fonksiyon yüklemedi');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (e) { console.error(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; }
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =========================================================================
// Şema beyazlistesi — http/https dışı asla seçilemez
// =========================================================================

test('şema beyazlistesi: yalnız http(s) geçer', () => {
  assert.equal(pickDroppedLink('https://youtube.com/watch?v=x'), 'https://youtube.com/watch?v=x');
  assert.equal(pickDroppedLink('http://ex.com/a?b=1'), 'http://ex.com/a?b=1');
  assert.equal(pickDroppedLink('HTTPS://EX.COM'), 'HTTPS://EX.COM');
  const rejected = [
    'file:///etc/passwd', 'file:///C:/x', 'javascript:alert(1)',
    'data:text/html,<script>x</script>', 'chrome://settings', 'about:blank',
    'mailto:a@b.c', 'ftp://x', 'ws://x', 'whatsapp://x', 'intent://x',
    'whisper-pdf://x', 'whisper-assets://x', 'view-source:https://x',
    'JAVASCRIPT:x', ' java\tscript:x', 'ht tp://x', 'http//x', 'httpx://x',
  ];
  for (const bad of rejected) assert.equal(pickDroppedLink(bad), null, JSON.stringify(bad));
});

test('yorum/boş satır atlanır — spec uyumlu uri-list', () => {
  const t = '# yorum satırı\n\nhttps://youtube.com/watch?v=abc\n#sonra';
  assert.equal(pickDroppedLink(t), 'https://youtube.com/watch?v=abc');
  assert.equal(pickDroppedLink('#sadece\n#yorum'), null);
  assert.equal(pickDroppedLink('  \n  \n'), null);
});

test('metnin ilerisindeki geçerli URL, önceki çöp atlayarak bulunur', () => {
  assert.equal(pickDroppedLink('bırakılan link: https://x.com/v — kaynak'), 'https://x.com/v');
  assert.equal(pickDroppedLink('junk1 junk2\nfile:///etc/p\nhttps://ok.com'), 'https://ok.com');
  assert.equal(pickDroppedLink('javascript:x https://y.com'), 'https://y.com');
});

// =========================================================================
// Fuzz: rastgele karışık metin → invariant'lar
// =========================================================================

test('fuzz: çıktı ya null ya da ilk http(s) token\'ı — asla farklı şema', () => {
  const rnd = mulberry32(31337);
  const pool = ['https://a.com/x', 'http://b.tv', 'file:///etc/x', 'javascript:x',
    'data:x', '#yorum', 'junk', 'text/plain', 'HTTPS://C.COM', 'ftp://d'];
  for (let t = 0; t < 500; t++) {
    const lines = [];
    for (let i = 0; i < 1 + Math.floor(rnd() * 6); i++) {
      const n = Math.floor(rnd() * 4);
      const toks = [];
      for (let j = 0; j < n; j++) toks.push(pool[Math.floor(rnd() * pool.length)]);
      lines.push(toks.join(rnd() < 0.3 ? '\t' : ' '));
    }
    const text = lines.join(rnd() < 0.5 ? '\n' : '\r\n');
    const got = pickDroppedLink(text);
    // uri-list sözleşmesi: '#' ile başlayan satır tamamen yorumdur.
    const tokens = text.split(/[\r\n]+/)
      .filter((l) => { const t = l.trim(); return t && !t.startsWith('#'); })
      .flatMap((l) => l.trim().split(/\s+/)).filter(Boolean);
    const firstOk = tokens.find((x) => /^https?:\/\//i.test(x)) || null;
    assert.equal(got, firstOk, `tohum ${t}: ${JSON.stringify(text)} → ${JSON.stringify(got)}`);
    if (got !== null) assert.ok(/^https?:\/\//i.test(got));
  }
});

test('hostile biçimler crash yok — null döner', () => {
  for (const x of [null, undefined, 0, {}, [], ' ', '\0\0', 'https://', 'http://']) {
    const r = pickDroppedLink(x);
    assert.ok(r === null || r === 'https://' || r === 'http://', JSON.stringify(x));
  }
});

console.log(`dropped-link-fuzz: ${passed} test OK`);
