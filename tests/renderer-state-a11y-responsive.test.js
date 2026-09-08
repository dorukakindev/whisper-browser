const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');
const {
  createJobModel,
  validateJobState,
  shouldAcceptRunEvent,
  cycleFocusIndex,
  isElementVisibleForFocus,
  effectiveViewport,
} = require('../src/renderer-ui-model');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8');
let modelDurationMs = 0;

function ok(name, fn) {
  fn();
  console.log(`  OK  ${name}`);
}

ok('double start, aynı tick start+cancel ve done+exit geçişleri deterministik', () => {
  const m = createJobModel();
  const start = m.dispatch({ type: 'start' });
  assert.equal(start.accepted, true);
  assert.equal(m.dispatch({ type: 'start' }).accepted, false);
  assert.equal(m.dispatch({ type: 'cancel' }).effect, 'invoke-cancel');
  assert.equal(m.dispatch({ type: 'cancel' }).effect, 'duplicate-cancel');
  assert.equal(m.dispatch({ type: 'start-resolved', generation: start.state.generation, ok: true }).effect, 'retry-cancel');
  assert.equal(m.dispatch({ type: 'exit', generation: start.state.generation }).accepted, true);

  const next = m.dispatch({ type: 'start' });
  m.dispatch({ type: 'start-resolved', generation: next.state.generation, ok: true });
  assert.equal(m.dispatch({ type: 'done', generation: next.state.generation }).accepted, true);
  assert.equal(m.state.phase, 'awaiting-exit');
  assert.equal(m.dispatch({ type: 'progress', generation: next.state.generation }).accepted, false);
  assert.equal(m.dispatch({ type: 'exit', generation: next.state.generation }).accepted, true);
  assert.equal(m.state.phase, 'idle');
});

ok('capture error, reload, sekme, navigation ve stale selection birbirinden bağımsız', () => {
  const m = createJobModel();
  m.dispatch({ type: 'capture-error' });
  assert.equal(m.state.capture, 'error');
  m.dispatch({ type: 'tab', tab: 'library' });
  assert.equal(m.state.tab, 'library');
  m.dispatch({ type: 'navigate' });
  const nav = m.state.navigationGeneration;
  assert.equal(m.dispatch({ type: 'select', navigationGeneration: nav - 1 }).accepted, false);
  assert.equal(m.dispatch({ type: 'select', navigationGeneration: nav }).accepted, true);
  m.dispatch({ type: 'reload' });
  assert.equal(m.state.phase, 'idle');
  assert.equal(m.state.selectionGeneration, null);
});

ok('10.000 olay dizisi durum değişmezlerini koruyor', () => {
  const startedAt = performance.now();
  let seed = 0x38a11;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const types = ['start', 'queue-start', 'queue-item-start', 'start-resolved', 'cancel', 'progress',
    'status', 'segment', 'done', 'error', 'exit', 'queue-stop', 'capture-error', 'capture-recover',
    'capture-disable', 'tab', 'navigate', 'select', 'reload'];
  for (let sequence = 0; sequence < 10000; sequence++) {
    const m = createJobModel();
    for (let step = 0; step < 40; step++) {
      const type = types[Math.floor(random() * types.length)];
      const generationOffset = Math.floor(random() * 3) - 1;
      m.dispatch({
        type,
        ok: random() > 0.2,
        tab: ['main', 'player', 'browser', 'library'][Math.floor(random() * 4)],
        generation: m.state.generation + generationOffset,
        navigationGeneration: m.state.navigationGeneration + generationOffset,
      });
      assert.equal(validateJobState(m.state), true, `dizi=${sequence} adım=${step}`);
    }
  }
  modelDurationMs = performance.now() - startedAt;
});

ok('temporary mutation done olayında erken idle kusurunu yeniden yakalıyor', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'renderer-ui-model.js'), 'utf8');
  const mutant = source.replace("state.phase = 'awaiting-exit';", "state.phase = 'idle';");
  assert.notEqual(mutant, source, 'mutation uygulanamadı');
  const sandbox = { module: { exports: {} }, exports: {}, globalThis: {} };
  vm.runInNewContext(mutant, sandbox, { filename: 'renderer-ui-model.mutant.js' });
  const m = sandbox.module.exports.createJobModel();
  const start = m.dispatch({ type: 'start' });
  m.dispatch({ type: 'start-resolved', generation: start.state.generation, ok: true });
  m.dispatch({ type: 'done', generation: start.state.generation });
  assert.throws(() => assert.equal(m.state.phase, 'awaiting-exit'));
});

ok('üretim olay kapısı idle/cancel/awaiting-exit durumunda stale ilerlemeyi reddediyor', () => {
  assert.equal(shouldAcceptRunEvent({ running: false }, 'progress'), false);
  assert.equal(shouldAcceptRunEvent({ running: true, cancelled: true }, 'segment'), false);
  assert.equal(shouldAcceptRunEvent({ running: true, awaitingExit: true }, 'status'), false);
  assert.equal(shouldAcceptRunEvent({ running: true }, 'progress'), true);
  assert.match(js, /RendererUiModel\.shouldAcceptRunEvent\(state, event\.type\)/);
  const exitBlock = js.slice(js.indexOf("case 'exit':"), js.indexOf("// ===== Result modal"));
  assert(exitBlock.indexOf('if (state.queueRunning') < exitBlock.indexOf('if (state.awaitingExit'),
    'kuyruk exit yolu tekil terminal yolundan önce çalışmalı');
});

ok('25 viewport/ölçek birleşimi responsive kırılma sözleşmesini kapsıyor', () => {
  const sizes = [
    [1024, 600], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440],
  ];
  const scales = [100, 125, 150, 200, 250];
  let count = 0;
  for (const [width, height] of sizes) {
    for (const scale of scales) {
      const view = effectiveViewport(width, height, scale);
      assert.equal(view.mainColumns, view.cssWidth <= 980 ? 1 : 2);
      assert.equal(view.compact, view.cssWidth <= 560);
      assert.equal(view.playerStacked, view.cssWidth <= 860);
      assert(view.cssHeight > 0);
      count++;
    }
  }
  assert.equal(count, 25);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.app-main\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.actions\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*?\.player-body/);
  const libraryRule = css.match(/\.player-library\s*\{([^}]*)\}/s)[1];
  assert.match(libraryRule, /display:\s*flex/);
  assert.match(libraryRule, /flex:\s*1/);
  assert.match(libraryRule, /min-height:\s*0/);
});

ok('axe-benzeri isim, dialog, canlı bölge ve görünür focus sözleşmeleri', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'yinelenen id bulundu');
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    assert(text || /\baria-label="[^"]+"/.test(attrs) || /\btitle="[^"]+"/.test(attrs),
      `erişilebilir adı olmayan button: ${attrs.slice(0, 100)}`);
  }
  assert.match(html, /id="resultModal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="resultModalTitle"/);
  assert.match(html, /id="previewSearch"[^>]*aria-label="Canlı önizlemede ara"/);
  assert.match(html, /id="timelineClose"[^>]*aria-label="Zamanlama masasını kapat"/);
  assert.match(html, /id="statusPill"[^>]*role="status"[^>]*aria-live="polite"/);
  const progressTag = html.match(/<div[^>]*id="progressBar"[^>]*>|<div[^>]*role="progressbar"[^>]*id="progressBar"[^>]*>/)[0];
  assert.match(progressTag, /role="progressbar"/);
  assert.match(progressTag, /aria-valuenow="0"/);
  assert.match(css, /:focus-visible\s*\{[^}]*outline:/);
  assert.match(js, /function closeResultModal\(/);
  assert.match(js, /resultModal[^\n]*addEventListener\('keydown'/);
  const labelledControls = ['youtubeUrl', 'presetSelect', 'audioTrack', 'glossaryInput',
    'subtitleEditBox', 'playerSeek', 'playerSpeed', 'playerVolume', 'playerQuickYtUrl',
    'cueSearch', 'aiChatText', 'playerYtUrl', 'playerChapters', 'playerSubSelect'];
  for (const id of labelledControls) {
    const tag = html.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bid="${id}"[^>]*>`, 's'));
    assert(tag, `${id} kontrolü bulunamadı`);
    assert.match(tag[0], /\baria-label="[^"]+"/, `${id} için programatik etiket yok`);
  }
});

ok('dialog focus çevrimi ileri, geri ve dışarıdan girişte kararlı', () => {
  assert.equal(cycleFocusIndex(0, 3, false), 1);
  assert.equal(cycleFocusIndex(2, 3, false), 0);
  assert.equal(cycleFocusIndex(0, 3, true), 2);
  assert.equal(cycleFocusIndex(-1, 3, false), 0);
  assert.equal(cycleFocusIndex(-1, 3, true), 2);
  assert.equal(cycleFocusIndex(0, 0, false), -1);
});

ok('dialog focus listesi gizli ata ve kapalı details içeriğini dışarıda bırakıyor', () => {
  const visible = {
    closest: () => null,
    getClientRects: () => [{ width: 10, height: 10 }],
  };
  const hiddenByAncestor = {
    closest: () => ({ className: 'hidden' }),
    getClientRects: () => [{ width: 10, height: 10 }],
  };
  const closedDetailsDescendant = {
    closest: () => null,
    getClientRects: () => [],
  };
  assert.equal(isElementVisibleForFocus(visible), true);
  assert.equal(isElementVisibleForFocus(hiddenByAncestor), false);
  assert.equal(isElementVisibleForFocus(closedDetailsDescendant), false);
  assert.match(js, /filter\(window\.RendererUiModel\.isElementVisibleForFocus\)/);

  const source = fs.readFileSync(path.join(ROOT, 'src', 'renderer-ui-model.js'), 'utf8');
  const mutant = source.replace('return element.getClientRects().length > 0;', 'return true;');
  assert.notEqual(mutant, source, 'focus görünürlüğü mutation uygulanamadı');
  const sandbox = { module: { exports: {} }, exports: {}, globalThis: {} };
  vm.runInNewContext(mutant, sandbox, { filename: 'renderer-ui-model.focus-mutant.js' });
  assert.throws(() => assert.equal(
    sandbox.module.exports.isElementVisibleForFocus(closedDetailsDescendant), false));
});

ok('tablist klavyesi ve kütüphane re-render odak/kaydırma geri yüklemesi bağlı', () => {
  assert.match(js, /function handleRovingTabKey\(/);
  assert.match(js, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(js, /\.side-tab'[\s\S]*?addEventListener\('keydown'/);
  assert.match(js, /libraryUiRestore\s*=\s*\{/);
  assert.match(js, /list\.scrollTop\s*=\s*Math\.max/);
  assert.match(js, /if \(candidate\) candidate\.focus\(\)/);
  assert.match(html, /role="tablist" aria-label="Kaynak türü"/);
  assert.match(html, /id="sideTabLibrary"[^>]*role="tab"[^>]*aria-controls="playerLibraryPanel"[^>]*tabindex="-1"/);
  assert.match(js, /\$\$\('\.tab\[data-tab\]'\)\.forEach/);
  assert.match(html, /id="browserHistoryTab"[^>]*role="tab"[^>]*aria-selected="false"[^>]*aria-controls="browserPlacesList"[^>]*tabindex="-1"/);
  assert.match(html, /id="playerYoutubeTab"[^>]*role="tab"[^>]*aria-selected="false"[^>]*aria-controls="playerYoutubePanel"[^>]*tabindex="-1"/);
  assert.match(js, /candidate\.setAttribute\('aria-selected', active \? 'true' : 'false'\)/);
  assert.match(js, /g\.setAttribute\('aria-expanded', open \? 'true' : 'false'\)/);
});

ok('normal metin için son tema muted rengi WCAG AA karşıtlığını sağlıyor', () => {
  function luminance(hex) {
    const rgb = hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255)
      .map((x) => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  const roots = [...css.matchAll(/:root\s*\{([\s\S]*?)\}/g)];
  const finalRoot = roots.at(-1)[1];
  const muted = finalRoot.match(/--text-muted:\s*(#[0-9a-f]{6})/i)[1];
  const surfaces = ['#0a0c0f', '#151b22', '#1c242c'];
  for (const surface of surfaces) assert(contrast(muted, surface) >= 4.5,
    `${muted}, ${surface} üzerinde 4.5:1 altında`);
  for (const pair of [['#909096', '#141415'], ['#929298', '#101011']]) {
    assert(contrast(pair[0], pair[1]) >= 4.5, `${pair.join(' / ')} 4.5:1 altında`);
  }
});

console.log(`\n11 renderer durum/a11y/responsive testi geçti; 10.000 dizi, 400.000 olay ve 25 viewport/ölçek örneği sınandı (${modelDurationMs.toFixed(1)} ms model süresi).`);
