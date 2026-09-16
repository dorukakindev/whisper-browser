'use strict';

// Rapor 51/53 gerçek bulgu düzeltmelerinin regresyon testleri.
// Her test, düzeltmenin bozulursa hangi kullanıcı etkisinin geri geleceğini belirtir.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const identity = require('../src/browser-media-identity');
const subtitles = require('../src/browser-subtitles');
const manga = require('../src/browser-manga');
const security = require('../src/settings-security');
const sync = require('../src/browser-subtitle-sync');
const mediaTools = require('../src/browser-media-tools');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`  OK  ${name}`); passed++; }
  catch (error) { console.error(`  FAIL ${name}`); throw error; }
}

// ---- R51-51: SPA hash-route kimliği -----------------------------------------
test('normalizeBrowserUrl: #/ ve #!/ rota parçaları korunur, diğer fragmentler atılır', () => {
  const n = identity.normalizeBrowserUrl;
  assert.strictEqual(n('https://a.test/app#/watch/abc'), 'https://a.test/app#/watch/abc');
  assert.strictEqual(n('https://a.test/app#!/video/xyz'), 'https://a.test/app#!/video/xyz');
  assert.notStrictEqual(n('https://a.test/app#/watch/abc'), n('https://a.test/app#/watch/def'),
    'farklı SPA rotaları aynı mediaId\'ye çökmemeli');
  assert.strictEqual(n('https://a.test/page#section'), 'https://a.test/page');
  assert.strictEqual(n('https://a.test/page#'), 'https://a.test/page');
  assert.strictEqual(n('https://a.test/w?v=1&utm_source=x#frag'), 'https://a.test/w?v=1');
});

// ---- R51-48: reklam bağlamında atlama kaydı ---------------------------------
test('decideSkip: adPlaying sırasında otomatik atlama ateşlenmez', () => {
  const api = require('../src/browser-skip-segments');
  const record = api.normalizeRecord({ id: 'r1', scope: 'media', scopeKey: 'm',
    kind: 'intro', start: 10, end: 40, autoSkip: true });
  const ctx = { currentTime: 20, mediaKey: 'm', seriesKey: '', playing: true };
  assert.strictEqual(api.decideSkip([record], ctx).shouldSkip, true);
  assert.strictEqual(api.decideSkip([record], { ...ctx, adPlaying: true }).shouldSkip, false);
  // Reklam bitince aynı içerik aralığında atlama yeniden çalışır.
  const after = api.decideSkip([record], { ...ctx, adPlaying: false });
  assert.strictEqual(after.shouldSkip, true);
});

// ---- R51-02: endpoint kimliği değişince sır mirası kesilir -------------------
test('sanitizeSettings: endpoint değişen içe aktarımda apiKey taşınmaz', () => {
  const existing = {
    translate: { endpointPreset: 'https://api.openai.com/v1', apiKey: 'SECRET-KEY' },
    ui: {},
  };
  // Aynı endpoint → anahtar korunur (kullanıcı yedeği geri yükler).
  const same = security.sanitizeSettings(
    { translate: { endpointPreset: 'https://api.openai.com/v1' } },
    { allowSecrets: false, existingSettings: existing });
  assert.strictEqual(same.translate.apiKey, 'SECRET-KEY');
  // Endpoint değişti → eski anahtar saldırganın endpoint'ine sızmasın.
  const changed = security.sanitizeSettings(
    { translate: { endpointPreset: 'custom', customBaseUrl: 'https://evil.example/v1' } },
    { allowSecrets: false, existingSettings: existing });
  assert.strictEqual(changed.translate.apiKey, undefined);
  // ui fallback üzerinden gelen endpoint değişimi de yakalanır.
  const viaUi = security.sanitizeSettings(
    { ui: { translateEndpointPreset: 'custom', translateBaseUrl: 'https://evil.example/v1' } },
    { allowSecrets: false, existingSettings: existing });
  assert.strictEqual(viaUi.translate?.apiKey, undefined);
});

// ---- R51-75: bidi/görünmez kontrol temizliği ---------------------------------
test('cleanCueText: RLO/isolate/ZWSP/WJ/ALM/gövde-BOM sıyrılır, ZWNJ korunur', () => {
  const spoofed = 'normal\u202E tnopeS\u202C metin';
  const cleaned = subtitles.cleanCueText(spoofed);
  assert.ok(!/[؜-‏‪-‮⁠-⁤⁦-⁩؜﻿]/.test(cleaned));
  assert.ok(cleaned.includes('normal'));
  // ZWNJ (200C) gösterimde korunur — anlam taşıyabilir.
  assert.ok(subtitles.cleanCueText('a‌b').includes('‌'));
});

test('hashText: görünmez enjeksiyon kimliği bölmez', () => {
  const a = sync.hashText('merhaba dünya');
  const b = sync.hashText('merhaba ‏dünya'); // RLM enjekte
  const c = sync.hashText('merhaba ⁦dünya⁩'); // isolate enjekte
  assert.strictEqual(a, b);
  assert.strictEqual(a, c);
});

// ---- R51-17/18: HLS BYTERANGE + GAP ------------------------------------------
test('parseHlsSegments: EXT-X-BYTERANGE aralığı ve GAP bayrağı korunur', () => {
  const playlist = [
    '#EXTM3U', '#EXT-X-TARGETDURATION:6', '#EXT-X-MEDIA-SEQUENCE:10',
    '#EXTINF:6.0', '#EXT-X-BYTERANGE:1000@0', 'seg.ts',
    '#EXTINF:6.0', '#EXT-X-BYTERANGE:1000', 'seg.ts',   // örtük → öncekinin devamı
    '#EXT-X-GAP', '#EXTINF:6.0', 'seg2.ts',
  ].join('\n');
  const segs = subtitles.parseHlsSegments(playlist, 'https://cdn.test/live/');
  assert.strictEqual(segs.length, 3);
  assert.deepStrictEqual(segs[0].byteRange, { start: 0, end: 999 });
  assert.deepStrictEqual(segs[1].byteRange, { start: 1000, end: 1999 },
    'offset\'siz BYTERANGE aynı URI\'de önceki aralığın devamı olmalı');
  assert.strictEqual(segs[2].gap, true);
  assert.strictEqual(segs[0].gap, undefined);
});

// ---- R51-40: extractJsonPayload sınırlı aday taraması -------------------------
test('extractJsonPayload: kötü niyetli gövdede doğrusal davranış + doğru çıkarım', () => {
  const direct = manga.extractJsonPayload('{"regions":[{"box":[1,2,3,4]}]}');
  assert.ok(direct && direct.regions.length === 1);
  const wrapped = manga.extractJsonPayload('prefix {"a":1} suffix');
  assert.strictEqual(wrapped.a, 1);
  // Tümü açılış parantezi olan gövde: eski O(n²) tarama yerine sınırlı aday.
  // Sözleşme: çıkarılamayan yanıtta hata fırlatılır — önemli olan hızlı fırlatması.
  const hostile = '{'.repeat(200000);
  const t0 = Date.now();
  assert.throws(() => manga.extractJsonPayload(hostile), /okunamadı|bulunamadı/);
  assert.ok(Date.now() - t0 < 2000, 'extractJsonPayload kötü girdide asılı kalmamalı');
});

// ---- R51-25: stderr satır kancası pts_time kaybetmez --------------------------
test('mediaTools.run: onStderrLine akan stderr satırlarını eksiksiz iletir', async () => {
  const lines = [];
  const script = 'for(let i=0;i<50;i++)console.error(`pts_time:${i}.5`)';
  const out = await mediaTools.run(process.execPath, ['-e', script], '', null, 15000,
    (line) => { const m = line.match(/pts_time:([\d.]+)/); if (m) lines.push(Number(m[1])); });
  assert.strictEqual(lines.length, 50, `50 işaret bekleniyor, ${lines.length} geldi`);
  assert.strictEqual(lines[0], 0.5);
  assert.strictEqual(lines[49], 49.5);
});

// ---- R51-41: <img> src değişiminde kimlik -------------------------------------
test('manga tarama scripti: kimlik içerik-src\'ye bağlı, eski overlay sökülür', () => {
  const code = manga.mangaCandidateScanScript();
  assert.ok(code.includes('__whisperMangaSrcIds'), 'src→id haritası eksik');
  assert.ok(code.includes('new WeakMap'), 'WeakMap öğe-bazlı kimlik için gerekli');
  assert.ok(code.includes('overlayState.overlays.delete(oldId)'),
    'src değişiminde eski çeviri katmanı sökülmeli');
  new Function(code); // enjekte kod sözdizimsel olarak geçerli
});

// ---- R51-59: ETA ilk progress olayında kurulur --------------------------------
test('renderer ETA: saat indirme/çıkarımı saymaz, resume ekseni doğru', () => {
  const renderer = read('src/renderer/renderer.js');
  assert.ok(renderer.includes('state._etaBase'),
    'ETA tabanı ilk progress olayında kurulmalı');
  assert.match(renderer, /percent < state\._etaBase\.percent/,
    'geriye giden yüzdede taban sıfırlanmalı');
  const resets = renderer.match(/state\._etaBase = null/g) || [];
  assert.ok(resets.length >= 4, `iş başlangıçlarında _etaBase sıfırlanmalı (${resets.length} bulundu)`);
});

// ---- R51-62: manga düzenleme reddi geri bildirimli -----------------------------
test('manga edit reddi: otoriter değer sayfaya geri yazılır, kullanıcı uyarılır', () => {
  const main = read('src/main.js');
  assert.ok(main.includes("type: 'manga-edit-rejected'"),
    'ret durumunda renderer olayı gönderilmeli');
  assert.ok(main.includes('data-whisper-manga-region'),
    'ret durumunda sayfa overlay\'i otoriter değere döndürülmeli');
  const renderer = read('src/renderer/renderer.js');
  assert.ok(renderer.includes("'manga-edit-rejected'"),
    'renderer kullanıcıya reddi göstermeli');
});

// ---- R51-85: import bellek uygulaması + kayıtlı hız ---------------------------
test('import: playerPositions/sponsorExemptions belleğe uygulanır; hız kaydı korunur', () => {
  const renderer = read('src/renderer/renderer.js');
  assert.match(renderer, /s\.playerPositions && typeof s\.playerPositions === 'object'/,
    'import edilen konumlar player.positions\'a yazılmalı');
  assert.match(renderer, /s\.browserSponsorExemptions !== undefined/,
    'alan yokken mevcut istisnalar korunmalı');
  assert.ok(renderer.includes('browserSavedRateMediaId'),
    'kayıtlı hız medya kimliğine bağlı geri uygulanmalı');
});

// ---- R51-92: seri atlama kaydı sahiplik/yetim --------------------------------
test('skip servisleri: yetim seri kayıtları görünür+silinebilir, son üyede taşınır', () => {
  const svc = read('src/browser-feature-services.js');
  assert.ok(svc.includes('orphanedSeriesRecord'), 'yetim kayıt tanımı eksik');
  assert.ok(svc.includes('ownsRecord'), 'sahiplik kontrolü eksik');
  assert.match(svc, /!Object\.values\(data\(\)\.series\)\.includes\(previous\)/,
    'yeniden bağlamada son üye ayrılınca kayıtlar taşınmalı');
});

console.log(`\nreport51-kademe-fixes: ${passed} test geçti`);
