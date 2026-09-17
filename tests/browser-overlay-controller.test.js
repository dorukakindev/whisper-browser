const assert = require('assert');
const vm = require('vm');
const { buildBrowserOverlayScript } = require('../src/browser-overlay-controller');

let passed = 0;
function test(name, fn) { fn(); passed += 1; }

const script = buildBrowserOverlayScript({ mode: 'both', source: [], translation: [] }, '(cues) => cues');

test('overlay tek controller ve observer yaşam döngüsü kurar', () => {
  assert.match(script, /__whisperBrowserOverlayController/);
  assert.match(script, /new MutationObserver/);
  assert.match(script, /new ResizeObserver/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /fullscreenchange/);
});

test('kapalı, gizli ve duraklatılmış durumda sürekli frame planlamaz', () => {
  assert.match(script, /document\.hidden \|\| state\.mode === 'off' \|\| !media \|\| media\.paused/);
  assert.match(script, /state\.mode === 'off'\) \{[\s\S]*?cancelFrame/);
  assert.match(script, /requestVideoFrameCallback/);
  assert.match(script, /const nextCueBoundary = boundaries\.length \? Math\.min/);
  assert.match(script, /boundaryTimer = setTimeout/);
  assert.doesNotMatch(script, /const callback = \(\) => \{[\s\S]{0,120}render\(\);[\s\S]{0,120}requestVideoFrameCallback\(callback\)/);
});

test('oynatıcı zamanı ve iki bağımsız iz dönüşümü finite olmayan sayfalı değerlerden korunur', () => {
  assert.match(script, /const finite = \(value, fallback = 0\)/);
  assert.match(script, /videoToSource\(videoTime, state\.sourceTransform\)/);
  assert.match(script, /videoToSource\(videoTime, state\.translationTransform\)/);
  assert.match(script, /sourceToVideo\(raw, transform\)/);
  assert.match(script, /nextCueBoundary - videoTime/);
  assert.match(script, /if \(scale <= 0\) return finite\(videoTime\) - finite\(state\.offset, 0\)/);
});

test('sıfır boyutlu ses öğesinde altyazı gerçek oynatıcı kapsayıcısına bağlanır', () => {
  assert.match(script, /resolveMediaRect/);
  assert.match(script, /String\(item\?\.tagName \|\| ''\)\.toLowerCase\(\) === 'audio'/);
  assert.match(script, /node = item\.parentElement/);
  assert.match(script, /rect\.width > 120 && rect\.height > 60/);
  assert.match(script, /return viewportRect\(\)/);
});

test('ilk durum kapalıysa DOM katmanı ve medya taraması oluşturmaz', () => {
  let created = 0, scanned = 0;
  const window = { addEventListener() {} };
  const document = {
    hidden: false, documentElement: {},
    addEventListener() {}, getElementById() { return null; },
    createElement() { created++; return {}; },
    querySelectorAll() { scanned++; return []; },
  };
  const result = vm.runInNewContext(
    buildBrowserOverlayScript({ mode: 'off', style: { hideSiteCaptions: true } }, '() => []'),
    { window, document, globalThis: window, cancelAnimationFrame() {}, requestAnimationFrame() { return 1; } });
  assert.equal(result, true);
  assert.equal(created, 0);
  assert.equal(scanned, 0);
  assert.equal(window.__whisperBrowserOverlayController.diagnostics().hasMedia, false);
});

test('kapalı moda geçiş medya dinleyicilerini ve seçimi bırakır', () => {
  assert.match(script, /state\.mode === 'off'\) \{[\s\S]*?stopWatchingMedia\(\);[\s\S]*?media = null/);
  assert.match(script, /if \(state\.mode !== 'off'\) startObserving\(\)/);
});

test('mevcut başka bir medya oynayınca seçim önbelleği yenilenir', () => {
  assert.match(script, /const candidateListeners = new Map\(\)/);
  assert.match(script, /for \(const type of \['play', 'pause', 'loadedmetadata', 'emptied'\]\)/);
  assert.match(script, /const activity = \(\) => \{[\s\S]*?mediaDirty = true;[\s\S]*?render\(\)/);
  assert.match(script, /candidateListeners\.clear\(\)/);
});

test('doküman taraması frame callback içinde değil yalnız kirli keşifte yapılır', () => {
  const callback = script.slice(script.indexOf('const queueFrame'), script.indexOf('function render'));
  assert(!callback.includes('querySelectorAll'));
  assert.match(script, /if \(!mediaDirty && media && media\.isConnected\) return media/);
  assert.doesNotMatch(script, /querySelectorAll\('\*'\)/);
  assert.match(script, /scanShadowHosts = \(node, depth = 0\)/);
});

test('DOM değişiklikleri tek animation frame içinde birleştirilir', () => {
  const observer = script.slice(script.indexOf('const mutationObserver'), script.indexOf('mutationObserver.observe'));
  assert.match(observer, /if \(mutationFrame/);
  assert.match(observer, /mutationFrame = requestAnimationFrame/);
});

test('yeniden enjeksiyon yeni controller üretmeden state günceller', () => {
  assert.match(script, /existing && typeof existing\.update === 'function'/);
  assert.match(script, /existing\.update\(nextState\)/);
  assert.match(script, /update\(value\) \{\s*\/\/[^\n]*\n\s*cancelFrame\(\);\s*\n\s*state = value/);
});
test('saydamlık sıfır değeri varsayılanla ezilmez', () => {
  assert.match(buildBrowserOverlayScript({ mode: 'source', style: { opacity: 0 } }, '(cues) => cues'),
    /Number\.isFinite\(rawOpacity\) \? rawOpacity : \.82/);
});

test('web altyazısı basılı tutularak taşınır ve yeni konum uygulamaya bildirilir', () => {
  assert.match(script, /addEventListener\('pointerdown'/);
  assert.match(script, /setPointerCapture/);
  assert.match(script, /window\.addEventListener\('pointerup', finishDrag, true\)/);
  assert.match(script, /window\.addEventListener\('blur', cancelDrag, true\)/);
  assert.match(script, /lostpointercapture/);
  assert.match(script, /detachDragListeners/);
  assert.match(script, /__whisperTrustedBridgeSend\?\.\('overlay-style'/);
  assert.equal((script.match(/!event\.isTrusted/g) || []).length, 4);
  assert.doesNotMatch(script, /__WHISPER_BROWSER_OVERLAY_STYLE__/);
  assert.match(script, /Math\.min\(75/);
  assert.match(script, /style\.pointerEvents = 'auto'/);
  assert.match(script, /boxSizing = 'border-box'/);
  assert.match(script, /maxHeight = 'min\(calc\('/);
  assert.match(script, /const baseMargin = Math\.min\(96, Math\.max\(20, rect\.height \* \.09\)\)/);
  assert.doesNotMatch(script, /Math\.max\(96, rect\.height \* \(bottomOffset/);
});

test('satır ayırıcı karakterleri silmeden JavaScript içinde güvenle escape eder', () => {
  const escaped = buildBrowserOverlayScript({ mode: 'source', source: [{ text: `a\u2028b\u2029c` }] }, '(cues) => cues');
  assert(escaped.includes('a\\u2028b\\u2029c'));
  assert(!escaped.includes(`a\u2028b`));
});

test('R51-77: JASSUB canvas aktifken DOM altyazı kutusu çizilmez ve geri döner', () => {
  // Aynı video üzerinde ASS canvas + DOM overlay aynı z-index'te çift metin
  // çiziyordu. render() artık __whisperAssState varlığında cue kutusunu gizler;
  // detach durumu null'a indirdiği için sonraki render'da katman geri döner.
  assert.match(script, /globalThis\.__whisperAssState\) \{\s*if \(root\) root\.style\.display = 'none'/);
  assert.match(script, /__whisperBrowserOverlayController = \{[\s\S]{0,80}render,/);
  // ASS tarafı kurulum ve detach sonrası render'ı tetikler — duraklatılmış
  // videoda timeupdate gelmediği için tetikleme olmadan çift metin kalırdı.
  const { buildAssInstallScript, buildAssClearScript } = require('../src/browser-ass-renderer');
  const install = buildAssInstallScript('[Script Info]\nX\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hi', 'op');
  assert.equal((install.match(/__whisperBrowserOverlayController\?\.render\?\.\(\)/g) || []).length, 2);
  assert.match(install, /__whisperAssState === state\) globalThis\.__whisperAssState = null/);
  assert.match(buildAssClearScript(), /previous\.detach\(\)/);
});

test('R51-73: dikey VTT writingMode cue kutusuna uygulanır, karışık içerikte temizlenir', () => {
  assert.match(script, /applyWritingMode\(source, sourceCues\)/);
  assert.match(script, /applyWritingMode\(translation, translationCues\)/);
  assert.match(script, /every\(\(cue\) => cue && cue\.writingMode === list\[0\]\.writingMode\)/);
  assert.match(script, /mode === 'rl' \? 'vertical-rl' : mode === 'lr' \? 'vertical-lr' : ''/);
  // Parser tarafı: vertical:rl gerçekten writingMode'a iniyor.
  const { parseSubtitlePayload } = require('../src/browser-subtitles');
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000 vertical:rl line:90%\n縦書きテスト\n';
  const cues = parseSubtitlePayload(Buffer.from(vtt, 'utf8'), 'text/vtt', 'https://x.test/a.vtt').cues || [];
  assert.equal(cues[0].writingMode, 'rl');
  assert.equal(cues[0].line, '90%');
});

console.log(`browser-overlay-controller: ${passed} test`);
