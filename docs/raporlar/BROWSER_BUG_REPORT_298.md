# BROWSER BUG REPORT 298 — R327-5: Test paketi hız profili

Tarih: 2026-09-30 · Dal: `devin/r327-5-test-timing` · Tür: ölçüm/altyapı (bug yok)

## Ne ölçüldü

`npm test` paketinin dosya-bazlı süre dağılımı — `tools/test-timing.mjs` (yeni
araç, bu PR'da eklendi) 397 dosyayı sırayla koşturup süre ölçtü:

```
node tools/test-timing.mjs --top 15 --json out.json
```

## Ölçüm (bu makine, sıralı tek-işlem)

- Toplam: **397 dosya, 162.3 s** — 366 Node `.test.js` + 31 Python `test_*.py`
  (envanter ölçüm anındaki ağaçtır; R332 itibarıyla 367 Node + 47 Python =
  414 dosya — test sayısı sürekli büyür, toplam süre anlık değer kabul edilsin)
- Dağılım: **backend/ 97.5s (%60)**, tests/ 64.7s (%40)
- Medyan dosya: 41ms · p95: ~1.35s → paket "birkaç ağır dosya + uzun kuyruk"

## En yavaş 10

| ms | % | dosya |
|---:|--:|---|
| 18654 | 11.5 | backend/test_invidious.py |
| 12756 | 7.9 | backend/test_transcribe.py |
| 10944 | 6.7 | tests/series-memory-race.test.js |
| 10013 | 6.2 | backend/test_browser_video_analysis_ocr.py |
| 9215 | 5.7 | backend/test_ytdlp_update.py |
| 5801 | 3.6 | backend/test_probe_refinement_r273.py |
| 5440 | 3.4 | tests/browser-video-analysis.test.js |
| 4753 | 2.9 | backend/test_roundtrip_fuzz.py |
| 4051 | 2.5 | tests/browser-direct-media-navigation.test.js |
| 3561 | 2.2 | backend/test_translation_routes.py |

En yavaş 10 dosya toplam sürenin **%51'i**; ilk 5'i %41'i. Bunların hepsi
geçerli davranış testi — asılı/uyuyan test gözlenmedi (uzun sürenin nedeni
gerçek iş: sahte sunucu turları, yarış simülasyonu, OCR/ytdlp işlem hacmi).

## Gözlemler / öneriler (uygulanmadı, kayıt)

- CI darboğazı backend testleri — paralellik istenirse `test_invidious` ve
  `test_transcribe` ayrı job'a ayrılabilir (ikisi toplam 31s).
- `series-memory-race` (10.9s) dosya içi gerçek kilit süreleri taşıyor;
  koşu süresini azaltmak ileride kayıp-güncelleme kapsamını düşürmeden
  tekrar sayısını ayarlamakla mümkün.
- Araç `--only <süzgeç>` ile tek dosya yeniden-ölçümü destekler; tam profil
  CI'da koşulmaz (kısa devre riski ve süre maliyeti).

## Kanıt

- `tools/test-timing.mjs` dosyası bu PR'da eklendi; `node tools/test-timing.mjs
  --only queue-lifecycle` ile doğrulandı, tam profil 397/397 PASS çıktı.
- Ham ölçüm `out.json` biçiminde araç tarafından yazılabilir; bu koşunun tam
  sıralaması devir notunda.
