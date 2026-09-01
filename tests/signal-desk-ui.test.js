/** Signal Desk ve ortak üretim-UX sözleşmesi (DOM'suz kaynak testi). */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rendererRoot = path.join(ROOT, 'src', 'renderer');
const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(rendererRoot, 'renderer.js'), 'utf8');
const css = fs.readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8');
const design = fs.readFileSync(path.join(ROOT, 'UI-DESIGN-SYSTEM.md'), 'utf8');
const ux = fs.readFileSync(path.join(ROOT, 'UX-CONTRACT.md'), 'utf8');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log(`  FAIL  ${name} — ${error.message}`); }
}
function assert(value, message) { if (!value) throw new Error(message || 'assert'); }

test('iş özeti kaynak, motor, çıktı, dil ve VRAM sinyallerini gösteriyor', () => {
  for (const id of ['signalDesk', 'summarySource', 'summaryEngine', 'summaryOutput', 'summaryTranslation', 'summaryVram']) {
    assert(html.includes(`id="${id}"`), `${id} görünümü eksik`);
    assert(js.includes(`$('${id}')`), `${id} canlı güncellenmiyor`);
  }
  assert(/function updateSignalDesk\s*\(/.test(js), 'ortak iş özeti sahibi yok');
});

test('preset farkı referans profili ve alan farklarını saklamıyor', () => {
  assert(html.includes('id="presetDiffCount"') && html.includes('id="presetDiffList"'), 'preset fark yüzeyi eksik');
  assert(/function currentPresetDiffs\s*\(/.test(js), 'preset karşılaştırma işlevi yok');
  assert(/presetReference/.test(js), 'özel ayarlar temel profilini kalıcı tutmuyor');
});

test('Kuyruk, Geçmiş ve Kontrol tek erişilebilir İşler merkezinde', () => {
  assert(html.includes('id="jobsCard"'), 'İşler merkezi yok');
  for (const tab of ['queue', 'history', 'review']) {
    assert(html.includes(`data-jobs-tab="${tab}"`), `${tab} sekmesi yok`);
  }
  assert(/function setJobsTab\s*\(/.test(js), 'sekme durum sahibi yok');
  assert(/function renderReviewCenter\s*\(/.test(js), 'elle kontrol özeti yok');
});

test('sinyal zinciri backend aşamalarını koruyup kullanıcı dilinde gösteriyor', () => {
  for (const stage of ['download', 'extract', 'load_model', 'transcribe', 'llm_postprocess', 'diarize', 'write']) {
    assert(html.includes(`data-stage="${stage}"`), `${stage} aşaması kaybolmuş`);
  }
  assert(/grid-template-columns:\s*repeat\(7/.test(css), 'yatay sinyal zinciri yerleşimi yok');
});

test('iş doğrulaması görünür, alana bağlı ve ilk hataya gidebiliyor', () => {
  assert(html.includes('id="jobValidation" role="alert"'), 'iş hata özeti canlı bölge değil');
  assert(/function optsProblemInfo\s*\(/.test(js), 'alan kimlikli doğrulama sahibi yok');
  assert(/aria-invalid/.test(js) && /jobValidationText/.test(js), 'hata alanla ilişkilendirilmiyor');
  assert(/jobValidationFix/.test(js) && /scrollIntoView/.test(js), 'ilk hataya git yolu yok');
});

test('ürün akışında tarayıcı confirm/prompt kalmadı', () => {
  const calls = js.match(/(?:window\.)?(?:alert|confirm|prompt)\s*\(/g) || [];
  assert(calls.length === 0, `yerel dialog çağrıları kaldı: ${calls.join(', ')}`);
  assert(html.includes('id="appDialog"') && /function openAppDialog\s*\(/.test(js), 'ortak uygulama dialogu yok');
  assert(/\.inert\s*=/.test(js), 'modal arka planı inert yapılmıyor');
  assert(/event\.key !== 'Tab'/.test(js), 'modal odak döngüsü yok');
});

test('sonuç masası kalite ölçülerini ayrıştırıyor ve oynatıcı incelemesi sunuyor', () => {
  for (const id of ['qualityCps', 'qualityOverlap', 'qualityLong', 'qualityMaxCps', 'reviewOutput']) {
    assert(html.includes(`id="${id}"`), `${id} eksik`);
    assert(js.includes(`$('${id}')`), `${id} bağlı değil`);
  }
});

test('tüm aramalar uygulamaya ait temizleme düğmesine sahip', () => {
  for (const id of ['previewSearchClear', 'historySearchClear', 'clearCueSearch', 'playerLibrarySearchClear']) {
    assert(html.includes(`id="${id}"`), `${id} eksik`);
    assert(js.includes(`$('${id}')`), `${id} dinleyicisi yok`);
  }
  assert(/e\.isComposing/.test(js), 'IME güvenliği görünmüyor');
});

test('gizli anahtarlar maskeli ve klavye erişimli görünürlük düğmesine sahip', () => {
  for (const id of ['hfToken', 'translateApiKey', 'mangaApiKey', 'llmApiKey']) {
    assert(new RegExp(`type="password" id="${id}"`).test(html), `${id} maskeli değil`);
    assert(html.includes(`data-secret-target="${id}"`), `${id} görünürlük düğmesi yok`);
  }
  assert(/aria-pressed/.test(js) && /setSelectionRange/.test(js), 'görünürlük durumu/caret korunmuyor');
});

test('global scrollbar, AA muted token ve azaltılmış hareket sözleşmesi var', () => {
  assert(/--text-muted:\s*#84929c/.test(css), 'AA muted token runtimea geçmemiş');
  assert(/scrollbar-color:/.test(css) && /\*::-webkit-scrollbar/.test(css), 'çift motorlu global scrollbar yok');
  assert(/forced-colors:\s*active/.test(css), 'forced colors yolu yok');
  assert(/prefers-reduced-motion:\s*reduce[\s\S]*gpu-badge \.dot/.test(css), 'döngüsel hareket azaltılmıyor');
});

test('tasarım ve davranış kararları kalıcı sözleşmede', () => {
  assert(design.includes('### 6.9 Signal Desk'), 'tasarım sistemi Signal Desk kararını taşımıyor');
  assert(design.includes('Model B'), 'token sahipliği açıklanmamış');
  assert(ux.includes('## 3. İşler merkezi') && ux.includes('## 4. Dialog'), 'UX sözleşmesi eksik');
});

console.log(`\n${pass} test geçti`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
