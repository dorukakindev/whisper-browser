# BROWSER_BUG_REPORT_336 — Kuyruk-50 madde 24: Live Whisper ses parçası değişimi

Tarih: 2026-10-01 · Başlangıç: `8ef159a`

## Kapsam / bulgu

Madde 24: "Yayın sırasında ses dili veya ses parçası değişince tamponu ve
transkripsiyon bağlamını doğru yenile. Eski sesin geç gelen sonucunu yeni
dilin altyazısına ekleme."

Denetimde bulunan kusur (B-336-01): canlı ASR işi tek `streamKey`
(`live-asr:<tab>:<acq>`) altında tüm parçaları aynı ize yazıyordu. Otomatik
dil modunda kaynak ses dili değişince (ses parçası/program değişimi) yeni
dilin cue'ları eski dilin altyazı izine katılıyordu; `event.language` bilgisi
kaydediliyor ama iz bölünmüyordu.

## Düzeltme

- `src/live-asr-audio-switch.js` (yeni saf modül): dil gözlemi takipçisi —
  aynı yeni dil `minConsecutive` (vars. 2) ardışık parçada görülünce 'switch'
  döner ve `streamSeq` artar. Tek seferlik yanlış algı 'pending' kalır ve iz
  bölünmez; eski dile dönüş sayacı sıfırlar.
- `main.js` segment işleyici: otomatik modda `job.audioSwitch.observe()`
  sonucuna göre streamKey `live-asr:<tab>:<acq>:p<N>` olarak evrilir; switch
  anında kullanıcıya `live-asr-warning` bildirimi gider. Sabit-dil
  (`--language`) modunda davranış değişmez — kullanıcı seçimi korunur.
- Geç gelen eski-parça satırları `browserLiveAsr !== job` ve
  `isCurrentBrowserContext` kapılarıyla zaten düşürülüyordu (madde gereksinimi
  karşılanmış); yeni iz ayrımıyla eski dilin yeni izi kirletmesi de kapanmış
  oldu.

## Kanıt

- `tests/live-asr-audio-switch.test.js` → **15/15 PASS** (ilk dil kilidi,
  blip/pending sıfırlama, 2 ardışık switch, seq artışları, dönüşümlü sapma,
  normalize, geçersiz dil, yapılandırılabilir eşik, pending seq sabitliği).
- `node --check src/main.js` temiz; `tests/live-asr-worklet.test.js` 13/13.
- Windows etkisi: streamKey biçimi değişikliği yalnız canlı iz içidir;
  canlı ASR Windows'ta aynı akışla çalışır — dil-pinli kullanım etkilenmez.
