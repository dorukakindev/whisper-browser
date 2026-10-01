'use strict';
// Batch-2 ratchet: renderer/UI kenar invariantları — derin denetim turlarında
// doğrulanmış davranışların geri düşmemesi için statik kilitler.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.join(__dirname, '../src/renderer');
const renderer = fs.readFileSync(path.join(SRC, 'renderer.js'), 'utf8');
const lines = renderer.split('\n');
let n = 0;
const ok = (cond, msg) => { n++; assert(cond, msg); };

// 1) Tüm localStorage.setItem çağrıları try bloğu içinde (kota/özel-mod
//    istisnası kullanıcı metnini kaybettirmesin).
{
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
  const unguarded = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8').split('\n');
    src.forEach((line, i) => {
      if (/localStorage\.setItem/.test(line)) {
        const ctx = src.slice(Math.max(0, i - 15), i + 1).join('\n');
        if (!/try\s*\{/.test(ctx)) unguarded.push(`${file}:${i + 1}`);
      }
    });
  }
  ok(unguarded.length === 0, `korumasız localStorage.setItem: ${unguarded.join(', ')}`);
}

// 2) Yakalanmayan reddi kullanıcıya bildiren genel işleyici + günlük sınırı.
ok(/addEventListener\('unhandledrejection'/.test(renderer), 'unhandledrejection işleyicisi yok');
ok(/LOG_LINE_LIMIT\s*=\s*\d+/.test(renderer), 'LOG_LINE_LIMIT tanımsız');
const logFn = renderer.slice(renderer.indexOf('const LOG_LINE_LIMIT'), renderer.indexOf('window.addEventListener(\'unhandledrejection\''));
ok(/trimLogLines\(log\)/.test(logFn), 'logLine eklerken kırpmıyor');
ok(/isNearBottom\(log\)/.test(logFn), 'logLine altta-yapışma korumuyor');

// 3) DOM sınırı: odaklı segment silinmeden önce düzenleme commit edilir
//    (enforcePreviewCap içinde commitSegmentEdit çağrısı zorunlu).
{
  const cap = renderer.slice(renderer.indexOf('function enforcePreviewCap'), renderer.indexOf('function flushPendingPreviewSegments'));
  ok(/commitSegmentEdit\(focused\)/.test(cap), 'enforcePreviewCap odaklı düzenlemeyi commit etmeden siliyor');
  ok(/removeChild\(preview\.firstElementChild\)/.test(cap), 'enforcePreviewCap removeChild bekleniyor');
}

// 4) Canlı ekleme altta-yapışmayı korur (kullanıcı yukarı kaydırdıysa zıplamaz).
{
  const flush = renderer.slice(renderer.indexOf('function flushPendingPreviewSegments'), renderer.indexOf('function addSegment'));
  ok(/isNearBottom\(preview\)/.test(flush), 'flushPendingPreviewSegments stick hesaplamıyor');
  ok(/if \(stick\) preview\.scrollTop/.test(flush), 'flushPendingPreviewSegments stick uygulamıyor');
}

// 5) Sürükleme dinleyicileri pointercancel/lostpointercapture ile eşleşir
//    (R316 töreni): setPointerCapture kullanan her dosyada iptal işleyicisi var.
{
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    if (/setPointerCapture/.test(src)) {
      ok(/pointercancel|lostpointercapture/.test(src), `${file}: setPointerCapture iptalsiz`);
    }
  }
}

// 6) Düzenleme çakışma bekçileri: üç koruma katmanı kaybolmasın.
ok(/function quickEditorStillCurrent/.test(renderer), 'quickEditorStillCurrent bekçisi yok');
ok(/cueEditTarget\s*=\s*\{ index/.test(renderer), 'cueEditTarget imza sabitlemesi yok');
ok(/openedRevision/.test(renderer) && /baseTranslation/.test(renderer), 'tarayıcı düzenleme revizyon/tabanı kontrolü yok');
ok(/player\.editing/.test(renderer) && /player\.editing\s*=\s*true/.test(renderer), 'editing bayrağı kullanılmıyor');

// 7) renderCueList kullanıcı metnini escapeHtml üzerinden basıyor (boş durum/CTA).
{
  const fn = renderer.slice(renderer.indexOf('function renderCueList'), renderer.indexOf('function untranslatedCueBanner') > 0 ? renderer.indexOf('function untranslatedCueBanner') : renderer.indexOf('function renderCueList') + 4000);
  ok(/escapeHtml\(/.test(fn), 'renderCueList kaçışsız metin basıyor');
}

// 8) B-366-01: ui-locale-change işleyicisi dinamik metin üreten yüzeyleri
//    yeniden çizer — sözlük taraması (scan) yalnız sabit girdileri çevirir;
//    interfaceChoice/describe çıktıları handler içinde tazelenmelidir.
{
  const handler = renderer.slice(renderer.indexOf("addEventListener('ui-locale-change'"), renderer.indexOf("addEventListener('ui-locale-change'") + 1200);
  for (const fn of ['renderTranslationModelScore', 'updateGpuBadge', 'renderIntegrityResults',
    'renderRuntimeStatus', 'renderBrowserDiagnostics', 'renderBrowserPlaybackDiagnostics', 'renderBrowserPageReport']) {
    ok(handler.includes(`${fn}(`), `ui-locale-change ${fn} tazelemiyor`);
  }
  ok(/let lastRuntimeStatusEnv/.test(renderer) && /lastRuntimeStatusEnv = env/.test(renderer), 'runtime env önbelleği yok');
  // Model-uyum uyarısı da günlükte geçerli dili izlesin.
  const record = renderer.slice(renderer.indexOf('function recordTranslationModelScore'), renderer.indexOf('function recordTranslationModelScore') + 900);
  ok(/describe\(next, event\.model, globalThis\.UiLocale\?\.get/.test(record), 'recordTranslationModelScore describe\'a locale geçirmiyor');
}

console.log(`renderer-edge-ratchet: ${n} kontrol geçti`);
