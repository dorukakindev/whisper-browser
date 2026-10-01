# BROWSER_BUG_REPORT_241 — R292: Devin Review flag süpürmesi (#231+#232)

**Dal:** `test/r292-flag-sweep` · **Tarih:** 2026-09-30

## Kapsam
Merge edilmiş PR'ların Devin Review bulgularının triage/kapanış turu:
- #232 (R284 kuyruk-opts roundtrip testi): 2 flag.
- #231 (R283 prompt golden-snapshot): 1 flag (DEVIR-NOTU sıralaması).

## Doğrulanan sorunlar ve düzeltmeler

| Bulgu | Durum | Düzeltme |
|---|---|---|
| `.bak` kurtarma denetimi üretim okuyucusunu koşmuyor (yerel kopya) | Düzeltildi | `queueStatePath`+`readQueueStateRaw` main.js'ten dilimlenip vm sandbox'ta eval ediliyor |
| "Bayt eşitliği" denetimi ham bayt karşılaştırmıyordu | Düzeltildi | `readFileSync(target,'utf8') === JSON.stringify(disk,null,2)` ham karşılaştırma |
| DEVIR-NOTU Önceki satırları tarih dışı sıradaydı (R283>R284) | Düzeltildi | Önceki satırları not tarihine göre azalan sıraya konuldu |

## Ek kilit
Üretim okuyucusu `readQueueStateRaw`'ın 8 MB aşımında `_oversized`
işareti döndürmesi aynı sandbox'ta doğrulandı — okuyucu davranışı
değişirse test kırılır.

## Sonuç
- `node tests/queue-opts-roundtrip.test.js` → 61.384 kontrol PASS.
- Ürün kodu değişmedi (test + doküman).
