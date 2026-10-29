# Rapor776 — Çalışma ekranında eski kitap bağlamı

## Doğrulama ve çözüm

P063/P071/P079: kitap ekranından sezon altyazı senkronu, intro veya bellek ekranına geçince MediaExperience owner aynı dialog olduğu için eski book-chapter bağlamı kalıyordu. assistant.state eski kitabı döndürüyor ve kitap araçlarını bu ekranlarda erişilebilir tutuyordu. Parent62409f10 üzerinde üç geçiş aynı kökten FAIL. Bunlar üç ayrı bug değil tek bağlam yaşam döngüsü hatasıdır.

`src/renderer/media-workflows-ui.js`: mevcut setContext sözleşmesiyle bu üç yüzey gerçek workflow:<kind> kimliği, workflow türü ve yerelleştirilmiş başlık yayımlar. Kitap excerpt/selectedText taşınmaz. assistantProject eski book kimliğiyle eşleşmediği için kitap araçları reddedilir; tekrar books render'ı kendi bookContext'ini kurar. Yeni IPC/API/ayar/şema/bağımlılık veya tasarım sistemi yok. Mevcut kaynak sözleşmesi kullanıldı, dış kod alınmadı.

`tests/book-review-owner727.test.js`: üç geçişte state null, book-chapter türü yok ve doğrudan select_book_chapters reddi; kitaba dönünce aynı kitap bağlamı geri. Önce3FAIL→finalPASS.

`tests/electron-book-reliability.smoke.js --workflow-context-only`: gerçek Windows main/preload/PDF import3sayfa/renderer ve globalAssistantContext ile üçyüzey kaynak kimliği, boş eski metin ve kitaba dönüş kabulü. Yeni flag yalnız bu kısa kabulü çalıştırır; normal kapsam değiştirilmedi. [Native sonuç](CONTEXT776_2026-10-29/context-results.json), [incelenmiş tema görüntüsü](CONTEXT776_2026-10-29/workflow-context-sync.png). NativeExit0 doğrudan process.WaitForExit ile tutuldu. Görsel yerleşim değişmedi; bu bütün app tasarım iddiası değildir.

## Kontroller ve sınırlar

`node --test tests/book-review-owner727.test.js tests/book-assistant-actions.test.js tests/book-text-search.test.js`:16PASS. Değişen runtime/test syntax ve diffcheckPASS. Native kaynak/araç katmanı gerçek, canlı model/ücretli API/GPU/kişisel start.bat/tam npm bu pakette yok.11before-quit listener uyarısı gizlenmedi;CIbeklenmez.

Reader readChapter/closeReader request invalidation kodu da incelendi; yeni repro olmadığı için yeni bug/kanıt sayılmadı.90aktifhedef sürer.
