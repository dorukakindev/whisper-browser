// R300 — görüntü sink güvenliği: sayfa/medya/oturum kökenli URL'lerin
// img.src / backgroundImage sink'lerine şema kapısı olmadan basılmaması
// + kapı fonksiyonlarının davranış kilidi.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

function loadHelpers() {
  // Tek bağlam: yardımcılar birbirini (safeSeekSheetImageUrl →
  // safeRemoteImageUrl) ve modül-düzeyi durumu (lastInvidiousInstance) çözer.
  const sandbox = { lastInvidiousInstance: 'https://invidious.test' };
  for (const name of ['safeRemoteImageUrl', 'safeSeekSheetImageUrl', 'absThumb']) {
    const match = rendererSrc.match(new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}`, 'm'));
    assert(match, `${name} renderer.js içinde bulunamadı`);
    vm.runInNewContext(`globalThis.${name} = ${match[0]};`, sandbox);
  }
  return sandbox;
}

test('kapı fonksiyonları şema matrisini doğru süzer', () => {
  const { safeRemoteImageUrl, safeSeekSheetImageUrl } = loadHelpers();
  const ok = [
    'https://i.ytimg.com/vi/x/0.jpg', 'http://192.168.1.5/t.png',
    'data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/4',
    'blob:https://site.test/abc',
  ];
  for (const url of ok) {
    assert.strictEqual(safeRemoteImageUrl(url), url, `kabul edilmeyen güvenli URL: ${url}`);
    assert.strictEqual(safeSeekSheetImageUrl(url), url, `sheet kapısı reddetti: ${url}`);
  }
  const bad = [
    'javascript:alert(1)', 'data:text/html,<script>x</script>',
    'file:///etc/passwd', 'vbscript:x', '//evil.test/track.png',
    ' https://ok.test/a.png"\n) ', 'x'.repeat(5000),
    'https://evil.test/a b.png', 'https://evil.test/a"b.png',
  ];
  for (const url of bad) {
    assert.strictEqual(safeSeekSheetImageUrl(url), '', `sheet kapısı kabul etti: ${JSON.stringify(url.slice(0, 40))}`);
    assert.strictEqual(safeRemoteImageUrl(url), '', `remote kapısı kabul etti: ${JSON.stringify(url.slice(0, 40))}`);
  }
  // Boyut sınırı yalnız sheet kapısında (patolojik dizgiler); remote kapısı
  // büyük data URL'i şema doğru olduğu sürece geçirir.
  assert.strictEqual(safeSeekSheetImageUrl(`data:image/png;base64,${'a'.repeat(17 * 1024 * 1024)}`), '');
  // svg favicon'lar <img>'de script çalıştırmaz — kabul edilir.
  assert.strictEqual(safeRemoteImageUrl('data:image/svg+xml;base64,PHN2Zz4=').length > 0, true);
  // Yerel ffmpeg sprite'ları büyük base64 data:image'lar — kabul edilmeli.
  const bigSprite = `data:image/jpeg;base64,${'a'.repeat(600 * 1024)}`;
  assert.strictEqual(safeSeekSheetImageUrl(bigSprite), bigSprite);
  assert.strictEqual(safeRemoteImageUrl(`data:image/png;base64,${'a'.repeat(5000)}`).length > 0, true);
});

test('favicon render sink\'i kapısız ham tab.favicon basmaz', () => {
  const block = rendererSrc.match(/const faviconSrc = [\s\S]*?favicon\.src = faviconSrc;/);
  assert(block, 'favicon kapı bloğu bulunamadı');
  assert.match(block[0], /safeRemoteImageUrl\(tab\.favicon\)/);
});

test('seekbar sprite backgroundImage JSON.stringify kaçışıyla basılır', () => {
  const block = rendererSrc.match(/const safeUrl = safeSeekSheetImageUrl[\s\S]*?backgroundImage = [^;]+;/);
  assert(block, 'sheet sink bloğu bulunamadı');
  assert.match(block[0], /backgroundImage = `url\(\$\{JSON\.stringify\(safeUrl\)\}\)`/);
  // Tırnak enjeksiyonu: JSON.stringify çıktısı geçerli tek dizgi literalidir.
  const hostile = 'https://x/y.png");}body{display:none}//';
  const injected = JSON.stringify(hostile);
  assert.match(injected, /^"(?:[^"\\]|\\.)*"$/);
  assert.strictEqual(JSON.parse(injected), hostile, 'JSON.stringify roundtrip bozuldu');
});

test('omnibox sonuç simgesi yalnız data:image kabul eder', () => {
  const helpers = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer-helpers.js'), 'utf8');
  assert(helpers.includes('^data:image\\/'), 'icon kapısı gevşedi');
});

test('absThumb http(s)-dışı şemaları reddeder', () => {
  const { absThumb } = loadHelpers();
  assert.strictEqual(absThumb('//cdn.test/x.png'), 'https://cdn.test/x.png');
  assert.strictEqual(absThumb('javascript:x'), '');
  assert.strictEqual(absThumb('data:image/png;base64,x'), '');
  assert.strictEqual(absThumb('/t.jpg'), 'https://invidious.test/t.jpg');
  assert.strictEqual(absThumb('https://a.test/b.png'), 'https://a.test/b.png');
});

console.log(`image-sink-security: ${passed} kontrol geçti`);
