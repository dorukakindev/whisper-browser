# BROWSER_BUG_REPORT_252 — R303 Devin Review triage (#245 + #247)

| Öğe | Değer |
|-----|-------|
| Dal | fix/r303-review-triage |
| Kod commit | 16a335f |
| Bulgu sayısı | 4 (1 bug düzeltildi, 1 bayat, 2 docs) |

## Bulgular
1. **#245 bug — emoji araması altyazı vurgusunu bozuyor (GERÇEK):**
   `foldSearchIndex`'in map dizisi öğe, dense dizesi UTF-16 birimi sayar;
   vekil çift tek kayıtta kalınca `appendHighlighted` map sınırını aşıyordu.
   Düzeltme: vekil çift için ikinci map kaydı (iki src kopyasında birden).
   Kilit: `omnibox-unicode.test.js` +5 kontrol (map↔dense hizası, ofset kayması,
   emoji+ASCII kuyruk sınır okuması).
2. **#247 bug — sprite 4096 sınırı (BAYAT):** incelenen commit `f281d30` zaten
   16 MB sınırını içeriyor; ek işlem yok.
3. **#247 flag ×2 (DOCS):** R300 devir notu + rapor 249'daki `4096` artıkları
   16 MB'a güncellendi; devir notunun dosya listesine
   `tests/settings-roundtrip.test.js` eklendi.
