# Rapor772 — Kayıtlı kitap seçiminde geç yanıt

## Kök neden ve uygulama

Kitap üretimi proje select onchange, saveChapter ve book-open awaitlerinden sonra sahiplik kontrolü yapmadan global project'i değiştiriyordu. Yeni select seçimi veya dış openProject tamamlandıktan sonra eski IPC sonucu eski kitabı ve asistan bağlamını geri getirebiliyordu. f77 sonrasındaki master cd8e6c4c üzerinde iki repro FAIL (two!==one), mevcut close kontrolü PASS. Bu R727 review onayı yarışı değil, kayıtlı proje seçicisidir.

`src/renderer/media-workflows-ui.js`: seçilen ID await öncesi alınır; mevcut projectOpenRequest ortak sayacı kullanılır. save/open sonrasında aynı dialog, bodyVersion, açık pencere ve istek kimliği aranır. Save project nesnesini kendi başına değiştirebildiği için object equality kullanılmaz; sonraki gerçek kullanıcı seçimi engellenmez. Geç hatalar yeni görünümün durumuna yazılmaz. Boş seçim ve busy çağrısı iş başlatmaz. Yeni katman, bağımlılık veya IPC yok; mevcut dış openProject sahiplik desenini genişletir, dış kod alınmadı.

`tests/book-review-owner727.test.js`: yeni seçim, dış openProject ve kapatma sırasında bekleyen book-open sonucunun görünüm/asistan kimliğini geri alamaması. Parent2FAIL→final3PASS; eski iki approval testi de geçer.

`tests/book-review-selection690.test.js`: önceden t→uiLabel yerelleştirme geçişi testin kaynak selector ve VM helper'ını eskittiği için başlangıçta kırmızıydı. Selector ve VM yardımcısı gerçek runtime'a güncellendi; aynı repeated-passage ve changed-draft assert'leri korunur. İlk selector düzeltmesinden sonra eksik helper ReferenceError verdi; finalde giderildi. Test silinmedi/eşik gevşetilmedi.

## Kabul ve sınırlar

`node --test tests/book-review-owner727.test.js tests/book-review-selection690.test.js tests/book-review-revision728.test.js`:9PASS. Değişen runtime JS syntax ve diffcheck PASS. DOM ve IPC kontrollü jsdom; gerçek Windows Electron/disk/save/GPU/kişisel start.bat veya görsel kabul değildir. UI şekli/etiket/tema değişmediği için yeni ekran görüntüsü üretilmedi. Tam npm/uzun CI beklenmedi. Kod başlangıcı cd8e6c4c2be8e5ede7b6602283729ca3ffa7c1b4; bitiş kimliği devirde. P006/P063/P069/P079 kısmi ilerleme;90aktifhedef devam eder.
