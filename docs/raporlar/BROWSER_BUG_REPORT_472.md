# BROWSER_BUG_REPORT_472 — Medya giriş borusu hatasında gereksiz bekleme

## Doğrulanan hata

`src/browser-media-tools.js` hem `run()` hem kalıcı anlamsal arama worker'ında
stdin `error` olayını boş callback ile yutuyordu. Alt süreç giriş borusunu
kapatıp yaşamaya devam ederse istek artık gönderilemese de Promise askıda
kalıyordu: tek seferlik işte tipik 120 saniye, anlamsal aramada 300 saniye.
Süreç ayrıca kapanırsa close handler işi bitirebildiğinden her EPIPE aynı
uzunlukta beklemez; hata pipe bozukken close gelmemesi senaryosudur.

## Kanıt ve düzeltme

Kontrollü EventEmitter alt süreç fixture'ında stdout/close üretmeden stdin'e
EPIPE gönderildi. Önce her iki akışta da istek reddedilmedi (2 kırmızı).
Artık tek seferlik iş çocuğu kapatıp hata ile biter; worker kendi kimliğini
kontrol eden retire() üzerinden bütün bekleyenleri reddeder. Sonraki arama
yeni süreç kurar; eski stdin error olayı yeni süreci kapatmaz.

`tests/report472-regressions.test.js`: 2 geçti. report471-regressions (3),
browser-feature-services ve ci-determinism-ratchet geçti. node --check ve
git diff --check temiz. Gerçek pipe/OS/model çalıştırılmadı; fixture protokol
kontrolüdür. Windows Node üzerinde koşuldu. UI/kurulum/şema değişmedi.
Kullanıcının son talebiyle uzun test paketi çalıştırılmadı, CI beklenmedi.
