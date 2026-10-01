# BROWSER BUG REPORT 283 — R324-4 iptal/abort yayılım tutarlılığı

**Tarih:** 2026-09-30 · **Dal:** `devin/<ts>-r324-4-abort-fuzz` · **Tür:** sözleşme fuzz + statik ratchet (temiz)

## Kapsam

R324-4: abort/iptal zinciri — `AbortController.abort(reason)` → `signal.aborted`
kontrol noktaları → `IsCurrent` predicate'leri → sonuç düşürme.

## Denetlenen yüzey

- `pageTranslationJobIsCurrent` / `mangaJobIsCurrent`: aynı dörtlü sözleşme
  (kimlik + !aborted + nesil + canlı görünüm).
- `stopBrowserPageTranslation` / `stopBrowserManga`: abort önce, slot
  temizliği sonra; scheduler `cancelAll` + applyTimer temizliği.
- İşçi döngülerinde `signal.aborted` kontrol noktaları (7347, 7945, 8240 …).
- `terminateProcessTree` `_terminating` sahiplenmesi (R324-2'de kilitlendi).

## Bulgular

**Gerçek bug yok.** Yayılım modeli tutarlı: abort sinyali hem işçi döngülerde
fırlatıyor hem IsCurrent predicate'lerini geçersiz kılıyor; bayat job
sonuçları düşüyor.

Belgelendirilen sözleşme ayrıntısı: IsCurrent predicate'leri strict boolean
değil truthy/falsy döndürür — `tab.view` yokken son operand `null` döner.
Çağrıcılar `!isCurrent(...)` bağlamında kullandığı için güvenli; test bunu
açıkça kilitler.

Test-hazırlık kusurları (üretim kodu etkilenmedi): oracle strict-equal
karşılaştırıyordu (`null !== false`); `= null` ilk eşleşmesi ilgisiz timer
temizliğini yakalıyordu — slot-adıyla daraltıldı.

## Eklenen ratchet

`tests/job-current-predicate-fuzz.test.js` (5 test):

- 3000 tohumlu sözleşme fuzz'ı: rastgele kimlik/nesil/aborted/görünüm
  permütasyonlarında predicate ≡ oracle (falsy-semantiğiyle).
- NaN nesil her iki tarafta da eşleşmez (`NaN !== NaN` güvenli taraf).
- Predicate gövdesi dört koşulu statik kilitler.
- `stopBrowser*` gövdelerinde abort, slot temizliğinden önce.
- `signal.aborted` kontrol noktası yoğunluğu alt sınırı.

## Doğrulama

- `node tests/job-current-predicate-fuzz.test.js` → 5/5 PASS.

## Windows etkisi

Yok — test-only.

## Doğrulanmayan sınırlar

Abort → gerçek alt-süreç ölümü zinciri Windows'ta birebir gözlenmedi;
`terminateProcessTree` churn davranışı R324-2'de kilitlendi.
