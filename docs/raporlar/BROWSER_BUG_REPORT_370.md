# BROWSER_BUG_REPORT_370 — 100-kuyruk batch 7: performans

## Kapsam

Önceden optimize edilmiş yüzeyler (overlay indeks, places arama, subtitle
arama) dışında kalan sıcak yolların ölçümü + regresyon bütçeleri.

## Bulgular

- **B-370-01 (düzeltildi):** `translatePattern` her DOM metin mutasyonunda
  72 regex'i lineer tarıyordu (~2.6µs/miss). `localizeText` orijinal
  metni WeakMap'ten alsa bile çeviriyi her mutasyonda yeniden koşturur;
  dinamik sayaçlar ("3 indirme") sürekli miss üretir. Sonuç girdiye göre
  deterministik olduğundan 1024 girişlik sınırlı memo eklendi:
  **tekrar-miss 218ms→46ms (x100k), karışık miss 105ms→12ms (x40k)**.
  Memo dolunca `clear()` — sınırsız büyüme yok.

## Ölçüm ve bütçe tablosu (`tests/perf-budgets-ratchet.test.js`)

| # | Yol | Ölçüm | Bütçe |
|---|-----|-------|-------|
| 61 | translatePattern tekrar-miss 20k | 12ms | <100ms |
| 62 | translate hit 100k / tekrar-miss 40k | 16ms / 14ms | <300 / <200ms |
| 63 | parseTimedBlocks 10k cue | 46ms | <500ms |
| 64 | browserActiveCuesAt 50k ×1000 | 2ms | <300ms |
| 65 | normalizeQueueSnapshot(500) ×100 | 91ms | <1000ms |
| 66 | mergeQueueSnapshotForSave(500v500) ×50 | 125ms | <1500ms |
| 67 | renderer.js+main.js derleme ×5 | 69ms | <1500ms |
| 68 | snapshotOptions ×20k | 88ms | <1500ms |
| 69 | memo doğruluğu + 1024 sınır davranışı | — | işlevsel |
| 70 | ratchet bütünlüğü | 11 kontrol | hepsi |

Eşikler ölçümün ~5-10× — amaç mutlak hız değil gerileme koruması.

## Teslim

- `src/renderer/ui-locale.js`: `translatePattern` sınırlı memo.
- `tests/perf-budgets-ratchet.test.js` (yeni): 11 kontrol, hepsi geçti.
- Yan etki testleri: ui-locale.test.js (14), ui-locale-dynamic (73+OSD),
  ui-locale-dedupe, ui-locale-userdata (10), browser-ui-r4 ve bağlantılı
  5 test dosyası — hepsi geçti.

## Windows etkisi

Yalnız renderer'da bellek-içi memo; davranış aynı (dil geçişi,
pattern anlamları). Windows'ta koşulmadı.
