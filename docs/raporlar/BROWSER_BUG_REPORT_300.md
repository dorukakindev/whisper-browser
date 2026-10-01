# BROWSER_BUG_REPORT_300 — R332: Devin Review toplu triage (PR #266–#300)

Tarih: 2026-10-01 · Dal: `devin/1790814769-r332-review-triage` · Kapsam:
PR #266–#299 ve merge edilmiş #300 üzerindeki tüm Devin Review bulgularının
(~103 kayıt) tek turda triage'ı: doğrulananlar düzeltildi, belirsiz/kapsam-
genişletici olanlara thread analizi + `report_triage` ile `needs_human`
işareti verildi.

## Düzeltilen kod bulguları

| Bulgu | Kök neden | Düzeltme |
|---|---|---|
| `classify_translation_error`: OpenAI `insufficient_quota` 429'la geliyor | 429 dalı kota örüntüsü kontrolünden önce `rate_limit` döndürüyordu; kullanıcıya "biraz sonra dene" öneriliyordu | 429 dalında tükenme örüntüsü (`insufficient_quota`, "exceeded your current quota") → `quota`; RPM "quota" kelimesi yanıltmasın diye kalıplar daraltıldı (`backend/transcribe.py`, kilit testte) |
| Hangul jamo yorumu çelişkisi | `src/browser-address-model.js` yorum bloğu iki farklı eşleme davranışı anlatıyordu | Yanlış paragraf silindi; doğru davranış (birleşmiş hece `consumed` dizisini kaplar, jamo kendi aralığına eşlenir) tek paragraf olarak kaldı |
| `compute_media_duration` docstring | "YouTube aralıklı indirme" iddiası güncel akışı yansıtmıyordu | Docstring güncellendi: tam ses iner, kırpma `extract_audio`'da olur |
| `assign_speakers` "tie" testi | Tasarlanmış eşitlik IEEE float'ta asimetrikti (1.1−1.0 ≠ 1.0−0.9) — deterministik B kazanıyordu | Test gerçek sözleşmeyi kilitler: `out[0] == "B"` + tekrar-çağrı determinizmi; yorum IEEE ayrıntısını açıklar |
| `player-time-transform` mock'u yön tersi | Testteki stub `videoToSourceTime`/`sourceToVideoTime` formüllerini gerçek modülün tersine tanımlıyordu — gerçek regresyon testten geçebilirdi | Stub gerçek sözleşmeye uyarlandı (`video = source*scale + offset`); assert değerleri güncellendi |
| `process-churn-fuzz` sarkan timer | `close` yarışı kazanınca 4 sn'lik timer süreç sonuna dek açık kalıyordu | `timeoutHandle` + `.finally(clearTimeout)` — yarış sonrası temizlik |

## Düzeltilen test/alaviye bulguları

- `browser-address-perf`: 50k benchmark üretim sınırını (BROWSER_PLACE_LIMIT=100)
  aşıyordu → `placesOf(100)` üretim-şekilli `<10ms` testi eklendi; 50k testi
  "kapasite payı" olarak korundu.
- `coverage-map`: `direct >= 160` eşiği 10 modüllük kayıp toleransı veriyordu →
  mevcut seviyeye (170) sabitlendi.
- `userdata-corruption-matrix`: ENOSPC enjeksiyonu eklendi — `fault` kancasıyla
  `before-temp-write`/`after-temp-write`/`before-main-replace` noktalarında
  birincil dosyanın ve `.bak`'ın korunması + yarım `.tmp` temizliği kilitlendi.
- `interval-inventory`, `job-current-predicate-fuzz`, `listener-pair-sweep`,
  `settings-hostile-fuzz`, `renderer-realm-faithfulness`, `unload-decision-fuzz`,
  `translation-endpoints.test` — önceki R332 turunun düzeltmeleri (bu dosyada
  toplu): extractFn/extractHandler bayat-grep koruması, NON_TEMP_OUTPUT_VARS
  whitelist'i, REAL_PREDICATES VM oracle'ı, mainWindow dedupe, LONG/ORDINAL
  fixture'ları, `--explain` reasoning-kapısı, `_route_key` host+path, diarization
  CPU fallback, VTT charref, download containment, `_wx_num` yardımcısı.

## Belge bulguları (tamamlandı)

- **devir kimlikleri:** 0948/1001/1007/1029/1120/1124/1129/1133/1137/1915/2115
  notlarına kesin başlangıç/bitiş squash kimlikleri yazıldı (`git log` master
  üzerinden doğrulandı).
- **ASAR:** `tools/package-windows.js` `asar:false` kullanıyor — devir-1211 ve
  rapor-289'daki `app.asar/src` varsayımı `resources/app/src` düzeniyle düzeltildi.
- **rapor 297:** IPC önek sayımı özeti düzeltildi (105+4+3+2+2 değil doğru dağılım).
- **rapor 298:** envanter ölçüm anına bağlı not eklendi (367 Node + 47 Python).
- **IPC-KATALOG:** 216 kanal + servis-modülü footnote'ları + `sendSync` 3 kanal.
- **INDEX.md:** 300→270 arası iniş sırası tek blokta; sondaki dağınık satırlar silindi.
- **ACIK-KARARLAR:** #184 proxy/whisper-assets satırları + blueprint önerisi
  "Kullanıcı kararı bekleyenler"e taşındı; bayat merge-kuyruğu satırı temizlendi.
- **CHANGELOG Unreleased:** R321 boş-sekme ikincil reddi + R332 triage özeti.
- **devir-2000/2045:** Windows Ctrl+C ve Windows-etkisi "Yok" satırları.

## needs_human olarak bırakılanlar (thread analizi + report_triage)

- **#288 flag-1:** 50k places benchmark'ının üretim ölçeğini aşması — bilinçli
  kapasite payı olarak korundu; üretim-şekilli test eklendi.
- **#275/#276/#284 oracle-bağımsızlık flag'leri:** fuzz oracle'ları zaten
  bağımsız uygulamalar; realign/IsCurrent sözleşmeleri kilitli.
- **#281/#284 test-mimari flag'leri:** VM-ortamlı ratchet tasarım gereği —
  kodu değil sözleşmeyi test eder.
- **#282 race-gate flag'i:** churn testinin zamanlama penceresi bilinçli;
  deterministik bekleme eklemek sinyali öldürür.
- **#286 ENOSPC flag'i:** raporun "doğrulanmış" iddiası soak-tanısına
  dayanıyordu; otomatik matrise enjeksiyon eklendi (yukarıda).
- **#300 kalan 2 bulgu:** (a) explain hataları yalnız TR — i18n kapsam
  genişletmesi, ayrı tur; (b) çip-dili Electron-smoke kapsamı — smoke altyapı
  genişletmesi, ayrı tur.

## Doğrulama

- `backend/venv/bin/python backend/test_transcribe.py` → 213/213 PASS
- `backend/test_golden_matrix.py` → 3/3 · `test_diarization.py` → 14/14 ·
  `test_exit_contract.py` → 6/6 (açık-transaction Ctrl+C dahil)
- JS hedefli: browser-address-perf 6/6, coverage-map, interval-inventory,
  job-current-predicate-fuzz, listener-pair-sweep, renderer-realm-faithfulness,
  settings-hostile-fuzz, translation-endpoints, unload-decision-fuzz,
  player-time-transform 3/3, process-churn-fuzz 3/3,
  userdata-corruption-matrix 12/12
- `node --check` değişen tüm JS dosyaları + `py_compile` transcribe.py — temiz

## Windows etkisi

Yok — değişiklikler backend hata sınıflandırması, test kilitleri ve belgeler.
Electron yüzeyine dokunan tek değişiklik (connect-src) önceki turda yapıldı;
Windows CI koşusu bu PR'da doğrular.
