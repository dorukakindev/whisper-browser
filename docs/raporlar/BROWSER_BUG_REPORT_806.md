# Rapor806 — Ürün100 P31–P40 kitap/PDF akışı

Başlangıç `3350accdb7f330d18091ec4dcf6b38702c064564`; bitiş ürün kodu `515939c0dbc26f30cebe8aeba90cc401b4f89ee0`; dal `codex/product100-reader806`. [Plan](PRODUCT100_2026-10-30.md)40aday/23geliştirme/17mevcut,60sürüyor. Bu paket5iyileştirme ve5mevcut davranış kaydıdır;10yeni bug değildir.

## Onarımlar ve kullanım

- P31 media-workflows-ui.js: explicit chapter ile proje açılışı render ve source guard tamamlandıktan sonra doğru textarea'ya odaklanır. Önceki saveChapter kirli metni bekleyerek kaydeder; focusEditor=false isteği odak zorlamaz. Regresyon önceki projenin exact metin/chapter kaydının yeni open'dan önce yapıldığını doğrular.
- P34 renderer.js: Reading→Yan yana geçişi sayfa yüksekliğini değiştirip aynı scrollTop'ta sonraki sayfayı aktif seçebiliyordu. Gerçek native testte sayfa2→3 ve vurgu kaybı görüldü. Görünüm değişimi mevcut sayfa içi göreli konumu tutar; iki render frame boyunca layout kaynaklı scroll sayfa kimliğini değiştirmez. Sequence/source sahipliği koruması hızlı geçişlerde eski callback'i etkisiz bırakır. Kullanıcı sonraki gerçek scroll ile yine sayfa değiştirebilir. Test gevşetilmedi.
- P35 pdf-reader-experience.js/pdf-reader.css: başlangıç/bitiş dahil sayfa sayısı ve source/translation özeti, önizlemenin üzerinde küçük temalı satırdır. Elle seçilen aralık aynı belgede panel kapat/aç ile sıfırlanmaz; yeni belge sıfırlar. Extraction pending iken range/mode değişimi eski captured range ile proje oluşturmaz; yeniden hazırlama istenir.
- P36: boş orijinal sayfa yanlışlıkla finish translation hatası veriyordu. Artık sayfa numarası/metin katmanı/boş tarama ihtimali açık, sayfa otomatik atlanmaz. Çok kısa sayfalar yalnız olası başlık olarak önizlemede listelenir ve metin korunur; başlık olduğu kesin iddia edilmez.
- P38: mevcut book-readiness gerçek dosya kontrolü üstüne seçili hazır/bekleyen bölüm özeti eklendi. Otomatik PDF sayfa başlıkları ortak chapterLabel üzerinden EN/TR gösterilir; kullanıcı kitap adı/metni çevrilmez. Onay/export kuralları gevşetilmedi.

## Mevcut bulunanlar

P32 PdfCitationUI tekrarlı alıntıyı ambiguous sayar, yanlış vurguyu tahmin etmez ve nedeni gösterir. Bu pakette koddan incelendi; yeni ambiguous alıntı native testi koşulmadı.
P33 selectedText ve excerpt ayrımı; yabancı article/collapsed seçim testleri ve P40 asistan açılışında page/selection/scroll eşitliği gerçek Windows'ta geçti.
P37 review listesi yalnız non-ready gruplar; exact key/ikinci repeated passage seçimi ve owner reddi testleri geçti. P39 PDF açıkken global oynatıcı kısayolları return eder; oklar form/okuyucuda kalır. Yeni klavye özelliği sayılmadı.

## Doğrulama ve başarısız deneme

`node --test --test-reporter=spec tests/book-render-owner644.test.js tests/book-review-selection690.test.js tests/book-review-owner727.test.js tests/book-export-inputs.test.js tests/book-passage-context.test.js tests/pdf-spoken-map.test.js tests/pdf-visible-page689.test.js tests/book-page-label759.test.js` →33/33geçti.6JSsyntax,diff geçti.

Gerçek Windows Electron `tests/electron-pdf-reader-experience.smoke.js --reader806` izole profilde31PNG ile geçti. Gerçek sentetik PDF açma/çıkarma, EN/TR dark/light ve800px%125, metin önizleme, boş/başlık controlled extraction, extraction pending-range reddi, gerçek kitap hazırlığı/readiness, kontrollü WAV dinleme/PDF kutuları, zoom/view sonrası kimlik/konum/ses eşitliği, sayfa değişince pause, asistan seçimi ve kaynak dönüşü sınandı. Ses ton fixture'ı kullanıldı; GPU/model/insan kulağı kalite kanıtı değildir.

İkinci native koşu view change sonrası mapped boxes0 ile başarısızdı; ekran sayfa3'e kaymayı doğruladı. Yukarıdaki anchor/switchingView onarımından sonra aynı assertion değişmeden geçti. Önceden var11before-quit listener uyarısı sürüyor; eşik artırılmadı. Yeni bağımlılık/kalıcı şema yok. start.bat/kurulum değişmedi, kişisel uygulama kapatılmadı. Tam npm/CI beklenmedi.

## Kaynak yaklaşımı

Mevcut PDF.js vendor Apache-2.0 lisansı korundu. [Mozilla pdf_viewer.js](https://github.com/mozilla/pdf.js/blob/master/web/pdf_viewer.js) görünüm/gezinme kodu ile mevcut uygulama yolu karşılaştırıldı; tam viewer taşınmadı ve dış kod kopyalanmadı. Bu uygulamanın speech/source sahipliğini ortak bir wrapper ile korumak daha uyumluydu; README başarı kanıtı sayılmadı.
