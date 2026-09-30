# BROWSER_BUG_REPORT_247 — R298: #245 review turu-2 + #239–244 flag triage

Tarih: 2026-09-30 · Dal: `fix/r297-omnibox-unicode` · Bitiş kod: `98d50a6`

## Özet

PR #245'in ikinci review turunda katlamanın sentinel tasarımının üç gerçek
boşluğu saptandı; kök neden tek mekanizmayla (yoğun eşleşme dizini) çözüldü.
Ayrıca #239–#244 arası tüm flag'ler aynı dala toplandı.

## Doğrulanan bug'lar (düzeltildi)

1. **Metindeki görünmez karakter sözcüğü bölüyordu** — `ca\u200Bfe` kayıtlı
   başlığı `cafe` sorgusuyla bulunamıyordu (metinde `\uFFFF` işaretçi kalıyor,
   `includes` yanlış dönüyordu). Yeni `foldSearchIndex`: metin ve sorgu aynı
   yoğun forma iner; vurgu/tamamlama ofsetleri `map` ile özgün metne çevrilir.
2. **Emoji-yalnız sorgu her şeyi döndürüyordu** — vekil yarıları işaretçiye
   düşünce sorgu `''` oluyor ve `includes('')` tüm geçmişi eşleştiriyordu.
   Vekil ÇİFTLERİ artık korunur (yalnız kopuk yarı işaretçi); boş yoğun sorgu
   kayıt eşleştirmez.
3. **Ayrışık Korece jamo eşleşmiyordu** — `한` başlığı `한` sorgusuyla
   bulunamıyordu. Yoğun formda NFC kompozisyonlu jamo dizileri tek heceye
   katlanır — iki yazım da aynı dense dizgiye iner.

## Flag → uygulandı

- `inlineCompletion` katlanmış uzunlukla kesim yapıp sorgudaki görünmez
  karakteri üretilen adrese taşıyordu (`ca\u200Be.com`); kapı onu reddediyordu.
  Artık adayın özgün karakterleriyle kesilir ve `prefix` döndürür; renderer
  prefix≠yazılan iken adayı kendi yazımıyla gösterir.

## #239–#244 flag kapanışları

- `browser-session-store` dedupe `-dupN` üretimi özgün kimlikleri çalamaz.
- `err_unsafe_redirect` ayrı status-copy kuralı + ui-locale TR/EN çifti.
- `queue-opts-roundtrip` artık gerçek `writeQueueState` `.bak` (önceki-birincil)
  sözleşmesini sınar.
- `series-memory-race` READY-bariyerli `merge-late` `_save` yarışı ekledi.
- `ci-determinism` aux `tests/*.js` kapsamı + wallclock deseni baseline'a işlendi.
- `translation-cache-fuzz` içerik çıktıları: son-yazım-kazanır, mezar-taşı
  silmesi, `.corrupt-*` arşiv varlığı, temel-fuzz `ok0` canlı.

## Kanıt

- `omnibox-unicode` 72 kontrol; etkilenen 17 test dosyası tamamı PASS.
- Basınç/satır pin'leri (dom-innerhtml, ci-determinism, err-coverage) güncel.

## Kalan borç

- Windows IME yolu korunuyor; caret görünümü elle kontrol önerilir (mantık
  testiyle kilitli).
