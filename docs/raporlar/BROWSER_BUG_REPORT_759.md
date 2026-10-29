# Rapor759 — Kitap üretiminde tek dil ve dengeli metin alanı

## Somut sorunlar

R758 gerçek Windows görüntüsünde otomatik PDF bölüm başlığı `Page / Sayfa 2` olarak iki dilde görünüyordu. Bölüm/ready özeti de sıradan string üretildiğinden açık ekranda dil değişiminde eski dilde kalıyordu. Bu kullanıcı kitap metni değil, uygulamanın ürettiği başlık/sayaçtır. Sabit34vh metin alanı tek cümle için gereksiz boşluk ayırıyor, bitişik bölüm seçim düğmeleri ve geniş ekran üst kontrollerinin ayrı satırları çalışma alanını aşağı itiyordu.

## Değişiklikler

- src/book-workflow-status.js: pageLabels yalnız pozitif tamsayı pageNumber ve tam tarihsel otomatik başlık eşleşmesinde EN/TR UI etiketi üretir. Eksik/uyumsuz sayfa numarası ve özel/yeniden adlandırılmış bölüm aynen korunur.
- src/renderer/media-workflows-ui.js: oluşturulmuş bölüm başlığı ve seçim aria etiketi yerelleşir; sayaç etiketleri canlı locale güncellemesine katılır, EN tekil1chapter düzelir. Kullanıcının kitap/author/özel başlık/metni çeviri işlemine sokulmaz. Seçim düğmeleri ayrı aralıklı grupta; geniş ekran aralık ve arama tek satırda, dar ekranda normal akışta.
- src/renderer/media-workflows.css: kısa/uzun metne göre sınırlandırılmış field-sizing; boş durum satırı yer kaplamaz; kapalı yönetim araçları üst araç satırına sığar. Ortak tema/tokenlar/klavye odağı korunur; yeni animasyon veya tema sistemi yok.
- tests/book-page-label759.test.js: yalnız doğrulanmış otomatik başlık, özel başlık ve yanlış pageNumber ayrımı.
- tests/electron-assistant-books.smoke.js --layout-acceptance: gerçek PDF/renderer'da açıkken EN/TR başlık/aria/sayaç, diskte eski başlığın korunması, kısa/uzun alan ve geniş kontrol hizası, yüzde125 dar taşma/alt eylemlere erişim kanıtı. Eski kaynak/aralık/üretim ret-kabul kontrolleri korunur.

## Kanıt

[Ölçümler](evidence759/layout.json), [TR koyu geniş](evidence759/selected-page-production-tr.png), [EN açık dar yüzde125](evidence759/production-en-light.png), [dar alt eylemler](evidence759/production-en-light-actions-125.png) gerçek Windows görüntüleri açılıp incelendi. Kısa180px; uzun420px max420/scroll5790; geniş aralık ve arama üstleri396.25px eşit. Dar ekranda yatay taşma yok, ana dört düğme44px, alt eylem alanı sticky başlık ile dialog altı arasında kaydırılarak görülebiliyor. Tüm eylemlerin ilk viewport'ta görünmesi iddia edilmez; uzun akış kayar. Saklanan `Page / Sayfa 2` aynıdır: yalnız görüntü değişir, dışa aktarılmış metadata bu tur dönüştürülmedi.

7hedefli Node PASS (page-label/status/handoff); ayrıca assistant-book-actions3PASS önceki hedefli koşuda geçti. Native final exit0, kaynak sayfa2/1bölüm, kontrollü motor2start (ilkret/sonkabul); gerçekGPU/model/ücretliAPI yok. ÜçJSsyntax/diffPASS. Aynı native test düzen eklerinden sonra yalnız yeni geometri/erişim belirsizliği için tekrarlandı; tam test/CI beklenmedi. Mevcut11before-quit listener uyarısı açık.

## Kaynaklar ve sınırlar

frontend-design ve make-interfaces-feel-better yaklaşımı ortak bileşenlere uygulandı. [Chrome resmî field-sizing açıklaması](https://developer.chrome.com/docs/css-ui/css-field-sizing) incelendi; yerel Chromium'da davranış ölçüldü. Standart CSS kullanıldı, dış kütüphane kodu alınmadı, bağımlılık eklenmedi. Kişisel start.bat/GPU/gerçek uzun kitap/insan ses kalitesi ve bütün uygulama tasarımı bu kanıt değildir. Mevcut kullanıcı kitabı/ayarları değiştirilmedi. P092/P094/P097 görünüm kapsamı ilerler;90aktif hedef tamamlanmış sayılmaz, müzik kapsamı eklenmedi.

Başlangıç master2a6361cfecca9801f67f8f3f59fed8f3f1d43e1a; ürün/test bitişi8ef599656b874f83e3638bfc35c859ae86f9b666. Yeni schema/IPC/kurulum yok. Normal PR/master teslimi ve ana kopyada kişisel dosyaları koruma uygulanır.
