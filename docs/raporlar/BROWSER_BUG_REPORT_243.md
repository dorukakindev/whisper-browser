# BROWSER BUG REPORT 243 — err_* EN/TR tam kapsama ratchet'i

**Tarih:** 2026-09-30 · **Kapsam:** Plan-2 madde 9 — kullanıcıya ulaşan teknik hata kodlarının dostu dile çevrim kapsaması
**Sonuç:** 3 gerçek kapsama boşluğu kapatıldı + kalıcı ratchet eklendi (330 kontrol).

## Bulgular
1. **Alt-çizgili Chromium kodları kural kaçırıyordu.** `systemError` kalıpları boşluklu metin içindi (`timed out`, `connection reset`); Chromium `ERR_CONNECTION_TIMED_OUT` biçiminde gelir → ham kod kullanıcıya düşüyordu. `systemError` artık mesajı bir de `_`→` ` normalize edilmiş kopyayla sınar.
2. **Kural ailesi boşlukları** — proxy/tünel, SSL, yönlendirme döngüsü, engelleyici, boş yanıt, geçersiz şema, bağlantı-kapandı/ağ-değişti, QUIC/HTTP2-3, `ERR_INSECURE_RESPONSE` için kural yoktu: 9 yeni aile eklendi (TR + EN).
3. **`browserLoadError` generikte kalan sık kodlar** — proxy hatası (-130 vb.), adres ulaşılamaz (-109), yönlendirme döngüsü (-310), engelleyici (-20/-24/-27), bağlantı kesildi (-101/-100/-103), SSL (-107 vb.), boş yanıt (-324), ağ değişti (-21), geçersiz adres (-300..-303) ham Chromium metni gösteriyordu: hepsine TR mesaj + `messageKey` + EN şablon eklendi.

## Ratchet tasarımı
`tests/err-coverage-ratchet.test.js`:
- **Üretim davranışı:** `browserLoadError` fonksiyon dilimi vm'de koşulur — 25 sık errno'da generik kalma yasağı + TR mesajda ham `ERR_*` kodu yasağı + açıklama-yolu eşleşmesi (errno bilinmese bile).
- **Statik drift denetimi:** `main.js` + `browser-lifecycle-policy.js`'teki tüm `messageKey` literal'leri `BROWSER_ERROR_EN` kapsamında olmalı (`generic` hariç — bilinçli ham geçiş); tüm EN şablonları params'sız çağrılıp boş-olmayan metin üretmeli.
- **`systemError` korpusu:** 45 gerçekçi dizgi × TR/EN → kural eşleşmesi zorunlu + ham ayrıntı parantezde korunur; bilinmeyenler değişmeden geçer; boş girdi 'Bilinmeyen hata.'/'Unknown error.'.

## Kanıt
- `node tests/err-coverage-ratchet.test.js` → 330 kontrol PASS.
- İlişkili mevcut testler (status-copy, r273-review-triage, browser-parti7, report124, ui-locale, navigation-abort) PASS.

## Sınırlar
- `generic` yol EN şablonu bilinçli taşımaz (ham Chromium metni zaten İngilizcedir).
- Download/medya hata yüzeyleri kapsam dışı.
