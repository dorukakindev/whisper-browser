# Sayfada bul

Başlangıç commit'i: `0f1de9e`. Raporda kalan browser önerilerinden sayfada bul uygulandı.

- Sayfanın sağ tık menüsünden **Sayfada bul**, uygulama veya yerleşik web sayfası odaktayken **Ctrl+F** ile açılır.
- Yazarken 180 ms debounce; Enter sonraki, Shift+Enter önceki eşleşme, Esc kapatma. Düğmeler de aynı işlemleri sunar.
- Eşleşme sırası/toplamı gösterilir. Sorgu 2000 karakterle sınırlıdır; boş sorgu native API'ye arama olarak gönderilmez.
- Native sonuçlar `requestId`, renderer güncellemeleri sekme ve token ile süzülür. Eski sorgu, sekme değişimi veya kapatma sonrası gelen sonuçlar uygulanmaz. IME yazımı tamamlanmadan arama gönderilmez.
- Sayfa gezinmesi, sekme değişimi ve oynatıcı kapanışında arama temizlenir. Arama metni diske kaydedilmez veya dış arama motoruna gönderilmez.
- Frontend-design yaklaşımı mevcut graphite/amber renkleri, mevcut yazı tipi ve sade tek satırlı düzeni korumak için kullanıldı. Arama araç çubuğunun parçasıdır; native video alanının üstüne çizilmez. Dar pencere ve sade görünüm için ayrı grid satırı vardır.

## Uygulama ve doğrulama

`src/browser-page-find.js` native WebContents aramasını yönetir; `browser:command` kanalının mevcut gönderici/aktif sekme kontrollerinden geçilir. Preload'a yeni ayrıcalık eklenmedi. Gerçek site DOM'una script enjekte edilmedi.

`findNext` seçeneğinin ilk aramada `true`, devam isteğinde `false` olması kurulu Electron tip dosyası ve [resmî WebContents belgesi](https://www.electronjs.org/docs/latest/api/web-contents#contentsfindinpagetext-options) üzerinden kontrol edildi.

Yeni davranış testleri: başlangıç/devam/geri arama, eski native sonuç, boş/geçersiz sorgu, Ctrl+F/IME/arka plan kısıtları, gezinmede temizleme, renderer token/sekme filtresi, Enter/Shift+Enter/Esc ve düğme klavye davranışı.

Tam `npm test`: 51 Node test dosyası + 137 Python testi geçti. Node syntax ve diff kontrolleri başarılı. Gerçek Electron'da piksel yerleşimi/odak geçişi ve native metin eşleşmesi ayrıca elle doğrulanmalı; sentetik WebContents ve renderer testleri bunu kanıtlamaz.

İndirme yöneticisi ve ayarlanabilir arama motoru bu paketin parçası değildir.
