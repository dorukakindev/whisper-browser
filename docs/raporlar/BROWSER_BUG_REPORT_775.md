# Rapor775 — Windows kitap/PDF/yer imi birleşik kabulü

## Gerçek Windows bulguları

Mevcut `tests/electron-book-reliability.smoke.js` güncel master218b7b09 üzerinde ayrı profil, sentetik3sayfaPDF/EPUB ve gerçek fixtureWAV/FFmpeg ile çalıştı. Tam akış ilk koşuda yeni sesin yer imi konumuna dönmesinde timeout oldu. Görüntüde özgün PDF başlığı `[object Object]1` idi. Başarı raporlanmadı.

1. **Doğrulanmış yer iminde yanlış eski revision isteği:** book-mark-open doğru yeni outputId/audio-remapped/2s döndürürken readChapter bellekteki eski expectedChapter.output kimliğini book-listen'a gönderiyordu. Main güvenli biçimde `Ses değişti; bölümü yeniden açın` ile reddediyordu. Çözüm resume varsa onun ana süreçten doğrulanmış outputId/textHash'ini isteğe koyar; main dosya/hash ve sonuç-resume eşitliği kontrolleri kaldırılmaz. Eski/bozuk sürümü sessiz kabul etme yok.
2. **Yerelleştirme nesnesi stringify:** uiLabel nesnesine +number uygulanınca `[object Object]` oluşuyordu. PDF sayfa başlığı ve aynı kalıptaki seçili sayfa/kopya sayaçları, sayıyı TR/EN etiketlerin içine alarak onarıldı. Sadece PDF başlığı native görselde doğrudan doğrulandı; diğer iki kod yolu aynı kök, ayrı yeni bug sayılmadı.

`src/renderer/media-workflows-ui.js` iki düzeltme; `tests/electron-book-reliability.smoke.js` yalnız sentetik book-mark-open/book-listen cevap kimliklerini bounded test loguna yazar ve reader görünümünde object-string olmadığını assert eder. Yeni bağımlılık/ayar/IPC/şema yok. Mevcut revision ve yerelleştirme altyapısı kullanılır; dış kod kopyası yok.

## Son kabul ve kanıt

Final aynı nativeWindows test `ok:true` sonuç dosyası ve terminal başarı satırı üretti, süreç PID7760 kayboldu. Dış OS exit kodu retained handle ile ayrıca kaydedilmedi; bunu gözlenmiş exit0 diye sunmuyoruz. Script başarı dalı app.exit(0) çağırır. İlk iki deneme timeout/hata ile terminal oldu; gözlem süresi nedeniyle yeni süreç başlatılmadı.

[Sonuçlar](BOOK775_2026-10-29/results.json), [sentetik IPC revision kanıtı](BOOK775_2026-10-29/navigation-calls.json), [düzeltilmiş PDF etiketi](BOOK775_2026-10-29/reader-tr-dark.png), [2s grup başına eşlenen yer imi](BOOK775_2026-10-29/bookmark-remapped-tr-dark.png), [ses sürümleri dar125](BOOK775_2026-10-29/voice-takes-800-1.25.png), [EPUB kaynak dönüşü](BOOK775_2026-10-29/epub-return-to-source-tr-dark.png). İlk iki görsel açılıp incelendi. Test mevcut PDFhighlight/zoom/manualreview/M4B/sürümler/yerimi/EPUB dönüş assert'lerini sonuna kadar geçti; bunlar yeni özellik olarak sayılmadı. Yeni yer imi kimliği request ve resultta eşleşir, text-changed ayrı reddedilir.

`node --test tests/book-review-owner727.test.js tests/book-review-selection690.test.js tests/book-bookmarks.test.js tests/book-review-revision728.test.js`:13PASS. İki JS syntax/diffcheckPASS. Gerçek PDF.js/decoder/FFmpeg ve IPC var fakat motor/voice sesleri fixture, canlı sağlayıcı/GPU/insan ses kalitesi/kişisel start.bat kabulü değil.11before-quit listener uyarısı sürüyor. Tam npm/uzun CI beklenmedi. P063/P067/P068/P069/P070/P092/P097 kısmi/mevcut kanıt genişledi;90aktifhedef sürer.
