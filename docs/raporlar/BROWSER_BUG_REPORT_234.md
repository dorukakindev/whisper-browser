# BROWSER_BUG_REPORT_234 — R285: `nextCueBoundaryAt` birim stresi + değişmezlik sözleşmesi

**Dal:** `test/r285-boundary-stress` · **Tür:** test + dokümantasyon (ürün davranışı değişmedi)

## Kapsam

`src/browser-overlay-controller.js` içindeki `nextCueBoundaryAt` (R263'te O(2n) → O(log n + aktif) yapılan kare-başı sınır araması) için JSDoc sözleşmesi + stres testi.

## Bulgular

### Gözlenen tasarım boşluğu (bug DEĞİL — sözleşmeye bağlandı)

Staleness algısı O(1) kalmak için yalnız üç prob noktasını izler: `0`, `n>>1`, `n-1`.
Prob-dışı bir konumda yapılan yerinde `end` mutasyonu bayat `suffixMin`/`prefixMax`
üzerinden yanlış sınır döndürebilir (doğrulandı: `cues[2].end=29` mutasyonu
oracle 29 yerine bayat 30 döndürüyor).

- `start` mutasyonları canlı okunduğu için (ikili arama dizinin kendisini
  tarar) bu kanaldan etkilenmez; asıl bayat kanal `suffixMin`/`prefixMax`'tir.
- Üretim yolunda liste `state.source`/`state.translation` üzerinden **yeni dizi
  referansı** olarak gelir → WeakMap anahtarı değişir, indeks yeniden kurulur;
  prob'lar "canlı izde aynı diziye ekleme" senaryosu için bekçidir.
- Tam mutasyon algısı (tüm alanları izleme) O(n)/çağrı maliyetine döner —
  indeksin varlık sebebini geçersiz kılar.

**Karar:** Davranış değişikliği yapılmadı; sözleşme JSDoc'a yazıldı
("liste salt-okunur; mutasyon yapan çağıran yeni dizi vermeli") ve
prob-noktası garantisi test ile kilitlendi. Prob-dışı mutasyon testi ise
güncel davranışı belgeleyen toleranslı assert olarak bırakıldı (gelecekte
tam algı eklenirse sıkı assert'e çevrilebilir).

## Eklenen testler (tests/browser-overlay-boundary.test.js: 6 → 11 kontrol)

- **Bozuk-dizi enjeksiyonu:** 40 tur × junk öğeler (null, dizgi, NaN alan,
  eksik `end`, dizgi `start`) + seyrek delikler (%25) — atmadan oracle eşliği.
- **Prob mutasyonu:** head/mid/tail × start/end mutasyonunun bayat
  bırakmadığı 6 senaryo + n=200'de mid probu + dizi-kimliği yeniden kurulumu.
- **Sözleşme notu:** prob-dışı mutasyonun garanti kapsamı dışında olduğunu
  belgeleyen toleranslı vaka.
- **Birim-agnostik:** ms ölçekli cue alanlarıyla aynı davranış.
- **Küçülen dizi:** `length` geriye düşünce indeksin yeniden kurulması.

## JSDoc (src/browser-overlay-controller.js)

- Birim sözleşmesi (`sourceTime` cue alanıyla aynı birim; `s`/`ms` agnostik,
  katı `>` karşılaştırması).
- Değişmezlik sözleşmesi (salt-okunur liste, sondan sıralı ekleme, prob
  noktaları, bayat riski, "yeni dizi ver" kuralı).

## Doğrulama

```
node tests/browser-overlay-boundary.test.js  → PASS: 11 kontrol
   [perf] indeksli 20000 sorgu 18.5ms — tam-tarama eşdeğeri ~2610ms
node --check src/browser-overlay-controller.js  → temiz
```

## Sınırlar / Windows

- Kod değişikliği yalnız yorum/JSDoc; ürün davranışı değişmedi. Windows etkisi yok.
- Electron smoke koşulmadı (gömülü işlev değişmedi).
