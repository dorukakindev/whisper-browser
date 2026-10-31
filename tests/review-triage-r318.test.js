// R318 — Devin Review toplu triage (PR #236–#263) regresyon kilitleri.
// Davranışsal doğrulama mümkün olanlar fonksiyonel; kalanlar statik sözleşme
// kilidi (kaynak kalıbı) olarak tutulur.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC_MAIN = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
const SRC_RND = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
const SRC_PY = fs.readFileSync(path.join(ROOT, 'backend/update_ytdlp.py'), 'utf8');

const { foldSearchIndex, foldSearchText } = require('../src/browser-address-model');

test('foldSearchIndex: dense-map hizası her zaman birebir (jamo NFC + emoji)', () => {
  const corpus = [
    '한',                    // önceden NFC bileşik
    '한',                  // L+V+T ayrışık — tek heceye katlanır
    '하ᅧ',                  // L+V+V (birleşmeyen) — dense'de 2 UTF-16 birimi
    'a하ᅧb',                // karışık kenar
    '😀한 x',              // emoji vekil çifti + jamo
    'İlhan 한lı 😀ğış',
  ];
  for (const raw of corpus) {
    const { dense, map } = foldSearchIndex(raw);
    // map dizisindeki kayıt sayısı dense DİZİSİNİN değil dense DİZGESİNİN
    // UTF-16 birim sayısına eşit olmalı — birim→özgün-aralık eşleşmesi.
    assert.strictEqual(map.length, dense.length,
      `map/dense hizası bozuldu: ${JSON.stringify(raw)}`);
    const folded = foldSearchText(raw);
    for (let i = 0; i < map.length; i += 1) {
      const [start, len] = map[i];
      assert.ok(start >= 0 && len >= 1 && start + len <= folded.length,
        `map[${i}] sınır dışı: ${JSON.stringify(raw)}`);
      if (i > 0) assert.ok(start >= map[i - 1][0], 'map geriye gitti');
    }
    assert.strictEqual(dense, dense.normalize('NFC'), 'dense NFC değil');
  }
});

test('foldSearchIndex: birleşmeyen kalan jamo kendi aralığına eşlenir (#265)', () => {
  // '하ᅧ' → dense '하ᅧ': birleşen '하' özgün dizinin ilk 2 birimini kaplar,
  // kalan 'ᅧ' kendi 1-birimlik aralığına gider — tek jamo araması artık
  // ilk heceyi de vurgulamaz.
  const { dense, map } = foldSearchIndex('하ᅧ');
  assert.strictEqual(dense, '하ᅧ');
  assert.strictEqual(map.length, 2);
  assert.deepStrictEqual(map[0], [0, 2], 'birleşen hece tükettiği aralığa gitmeli');
  assert.deepStrictEqual(map[1], [2, 1], 'kalan jamo kendi aralığına gitmeli');
  // Tam birleşik dizide baş hecesi özgün dizinin tamamını kaplar.
  const full = foldSearchIndex('한');
  assert.strictEqual(full.dense, '한');
  assert.deepStrictEqual(full.map[0], [0, 3]);
});

test('main.js: iş günlüğü — ekleme kipi bayt sayacı + akış-kimliği hata bekçisi', () => {
  // Append kipinde sayaç mevcut içerik + başlık boyutundan başlar.
  assert.match(SRC_MAIN, /bytes: initialBytes \+ headerBytes/);
  // Dolu (4 MB üstü) dosyaya başlık eklenmez — sonekli dosya adı denenir.
  assert.match(SRC_MAIN, /initialBytes \+ headerBytes > LOG_MAX_BYTES/);
  // Gecikmiş 'error' olayı yalnız kendi akışının kaydını sıfırlar — yeni işin
  // günlüğü eski akışın hatasıyla kaybolmaz.
  assert.match(SRC_MAIN, /jobLog && jobLog\.stream === stream/);
  // Kesimden sonra olaylar biçimlendirilmeden atılır (sınır içinde değil).
  assert.match(SRC_MAIN, /if \(!jobLog \|\| jobLog\.truncated \|\| LOG_SKIP\.has\(event\.type\)\) return;/);
});

test('main.js: çökme kurtarmada manga durumu sıfırlanır + unload loadError taşımaz', () => {
  // Çökme/crash yüzeyinde renderer'ın manga buton kilidini açan idle yayını.
  assert.ok(SRC_MAIN.includes("state: 'idle', translated: 0, visible: false, retryable: 0"),
    'manga-state idle/retryable:0 sıfırlaması eksik');
  const unloadIdx = SRC_MAIN.indexOf("tab.lifecycle = 'unloaded'");
  assert.ok(unloadIdx > 0, "tab.lifecycle = 'unloaded' bulunamadı");
  assert.ok(SRC_MAIN.slice(Math.max(0, unloadIdx - 400), unloadIdx).includes('tab.loadError = null'),
    'unload yolu önceki loadError bayrakını temizlemiyor');
});

test('main.js: ses-iz probu null-stream TypeError\'a karşı korunur', () => {
  const {parseAudioStreams}=require('../src/media-audio-tracks');
  assert.deepEqual(parseAudioStreams({streams:[null,{},false,{codec_type:'video'}]}),[]);
  assert.equal(parseAudioStreams({streams:[null,{codec_type:'audio',index:2,codec_name:'aac'}]})[0].index,0);
});

test('renderer.js: yan-boyutlandırıcı yalnız başlatan pointerId\'yi sürükler', () => {
  assert.match(SRC_RND, /let dragPointerId = null/);
  assert.match(SRC_RND, /e\.button !== 0 \|\| dragging/);
  assert.match(SRC_RND, /!dragging \|\| e\.pointerId !== dragPointerId/);
  assert.match(SRC_RND, /dragPointerId = null/);
});

test('renderer.js: PDF çeviri iptali reader kimliği + cancelRequested bayrağı', () => {
  assert.match(SRC_RND, /player\.pdfReader !== reader/);
  assert.match(SRC_RND, /if \(reader\) reader\.cancelRequested = true/);
  const start = SRC_RND.indexOf("$('pdfTranslateCancel')?.addEventListener('click'");
  const end = SRC_RND.indexOf("$('pdfExport')", start);
  assert(start >= 0 && end > start, 'PDF cancel handler fixture boundary missing');
  let cancel;
  const calls = [], player = { pdfReader: { pdfHash: 'same-document', translationOperationId: 'operation-one' } };
  vm.runInNewContext(SRC_RND.slice(start, end), {
    player, $: () => ({ addEventListener: (_event, handler) => { cancel = handler; } }),
    window: { api: { cancelPdfTranslation: (...args) => calls.push(args) } },
  });
  const previous = player.pdfReader;
  cancel();
  assert.equal(previous.cancelRequested, true);
  assert.deepEqual(calls, [['same-document', 'operation-one']]);
  player.pdfReader = { pdfHash: 'same-document', translationOperationId: 'operation-two' };
  cancel();
  assert.equal(player.pdfReader.cancelRequested, true);
  assert.deepEqual(calls.at(-1), ['same-document', 'operation-two'], 'same hash must cancel only the current operation');
  player.pdfReader = null;
  cancel();
  assert.equal(calls.length, 2, 'closed reader must not send a stale cancellation');
  assert.match(SRC_RND, /reader\.cancelRequested = false/);
});

test('renderer.js: sayfa çevirisi scope alanı whitelist yedeğine düşer', () => {
  assert.match(SRC_RND, /scopeValid\(tab\.browserPageScope\)/);
  assert.match(SRC_RND, /scopeValid\(scopePref\)/);
});

test('renderer.js: gömülü iz ipucu okunamayan (metin-değil-bitmap-değil) izleri sayar', () => {
  assert.match(SRC_RND, /!track\.extractable && !track\.requiresOcr/);
  assert.match(SRC_RND, /unreadCount/);
});

test('renderer.js: sponsor kategori değişimi segmentleri yeniler', () => {
  assert.match(SRC_RND, /browserSponsorCategories'\)\.addEventListener\('change', \(\) => \{\s*refreshBrowserSponsorSegments/);
});

test('renderer.js: kanal sayfalama — kartlar düğme satırının ÜSTÜNE eklenir', () => {
  assert.match(SRC_RND, /tabBody\.insertBefore\(buildSmartTubeCard\(v\), row\)/);
  assert.match(SRC_RND, /!added && got\.length < 20/);
});

test('update_ytdlp.py: sağlıklı-paket kapısı yarım silinmeyi previous\'a düşürmez', () => {
  assert.match(SRC_PY, /_RUNTIME_REQUIRED_FILES/);
  assert.match(SRC_PY, /def _healthy_package\(runtime_root, relative\)/);
  assert.match(SRC_PY, /_healthy_package\(runtime_root, item\)/);
});
