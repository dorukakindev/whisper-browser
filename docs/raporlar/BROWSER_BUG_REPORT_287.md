# BROWSER_BUG_REPORT_287 — R327 performans turu (omnibox önbelleği + ölçüm envanteri)

Tarih: 2026-09-30 · Kapsam: başlangıç require zinciri, büyük-geçmiş omnibox/render perf, 50k-cue overlay, uzun-oturum bellek.

## Bulgular

### B-327-01 — Omnibox tuş-vuruşu gecikmesi: kayıt başına tekrarlanan foldSearchIndex (DÜZELTİLDİ)

- **Belirti:** `buildAddressResults` ve `inlineCompletion`, geçmiş+yer imi kayıtları için her tuş vuruşunda `foldSearchIndex(title+url)` ve `strippedUrl` işlemini yeniden hesaplıyordu.
- **Ölçüm (bu makine):**
  - 10.000 kayıt: tuş vuruşu başına **~43 ms**
  - 50.000 kayıt: tuş vuruşu başına **~207 ms** (ilkyazım ~270 ms)
- **Kök neden:** Kayıt nesneleri (`player.browserPlaces`) tuş vuruşları arasında değişmeyen kalıcı nesnelerdir; katlanmış arama dizini hiç önbelleğe alınmıyordu.
- **Düzeltme:** `src/browser-address-model.js` içine `placeSearchIndexCache` (WeakMap) — kayıt nesnesi başına `{bare, dense, urlKey, bareDense, bareMap}` bir kez hesaplanır; places nesnesi yenilendiğinde eski girdiler GC ile temizlenir. `match` (yer imi/geçmiş) ve `inlineCompletion` artık `placeSearchIndexOf` üzerinden okur.
- **Ölçüm sonrası:** 50k'de tuş vuruşu ortalaması **207 ms → ~6 ms** (~34×); 10k'de 43 ms → ~1 ms. İlk (ısınma) sorgu yine tüm kayıtları bir kez katlar (~426 ms @ 50k, tek seferlik — kabul edilebilir, not edildi).
- **Sınır:** Önbellek nesne-kimliğine bağlıdır; aynı url'li yeni nesne güncel başlığı doğru yansıtır (test'te kilitli).

### B-327-02 — Yok (ölçüm bulgusu üretmedi)

R327-1 (başlangıç require zinciri): 12 modül ~22 ms, `main.js` parse ~14 ms, modül başına ≤6 ms — zaten R141+R244 (v8Cache) ile iyileştirilmiş; lazy-load ek yükü gereksiz. Temiz.

R327-3 (50k-cue overlay): `nextCueBoundaryAt` O(log n) indeksi (R263) doğrulandı — 100k çağrı 38 ms. Temiz.

R327-4 (uzun-oturum bellek): 200 döngü × (5k places + 5 sorgu) — heap 11.7 MB'de sabit, sızıntı yok. Temiz.

## Doğrulama

- `node tests/browser-address-perf.test.js` — 5/5 (doğruluk, önbellek tazelemesi, inlineCompletion, 50k bütçe <60 ms ort., kaynak ratchet'i)
- `node tests/browser-address-model.test.js` — 9/9
- `node --check src/browser-address-model.js` — temiz

## Windows etkisi

Renderer içi saf-JS önbelleği; platform bağımsız. Kullanıcı tarafında adres çubuğu yazma akıcılığı iyileşir (özellikle uzun süredir kullanılan profillerde biriken geçmişte).
