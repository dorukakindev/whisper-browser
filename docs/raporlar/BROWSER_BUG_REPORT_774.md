# Rapor774 — Arama sonucunda kitap oturumu kimliği

P006/P063/P069/P079 bağlantılı gezinme kabulü. Arama sonucu callback'i saveChapter sonrasında yalnız project.id karşılaştırıyordu. Aynı kitap yeniden açıldığında kimlik aynı kaldığı için eski arama tıklaması yeni oturumun bölümünü ve asistan bağlamını değiştiriyordu. Parent ea1529a5 üzerinde `Old search hit cannot select a chapter in the reopened session`1!==0 FAIL.

`src/renderer/media-workflows-ui.js`: arama navigasyonu ortak projectOpenRequest sayacına katılır; save sonrası request/dialog/open/projectId/bodyVersion ve mevcut arama valid koşulları aranır. Kendi books render'ı sonrasında yalnız kendisinin hâlâ navigation sahibi olması metin seçimi/focus için gerekir; kendi render değişikliği yanlış stale sayılmaz. Önceki text-changed ve exact UTF16 seçim kontrolleri korunur. Mevcut openProject desenini genişletir; yeni IPC/CSS/bağımlılık/ayar yok, dış kod kopyası yok.

`tests/book-review-owner727.test.js`: gerçek BookTextSearch fixture'a bağlanır, ikinci bölüm arama sonucu bulunur, eski save bekletilir, aynı kitap tekrar açılır; eski cevap çözülünce yeni chapter0 ve assistant currentChapter1 korunur. ParentFAIL→finalPASS. Önceki kitap/approval/chapter testleri de geçer.

Yer imi yolları ayrıca koddan incelendi; readChapter readerRequest ve mount generation kontrolleri mevcut. Bu tur yer imi için yeni repro/başarı iddiası yok, değişiklik yapılmadı.

## Kabul

`node --test tests/book-review-owner727.test.js tests/book-text-search.test.js tests/book-review-selection690.test.js`:12PASS. Runtime syntax/diffcheckPASS. Kontrollü jsdom/IPC; gerçek nativeWindows/disk/GPU/start.bat/tam npm değil. Yerleşim/etiket/tema değişmedi, yeni görsel kabul yok; uzunCIbeklenmedi. Kişisel dosyalar kapsam dışı.90aktifhedef devam eder.
