# Rapor705 — PDF seçili ses metni önizlemesi

Başlangıçmasterdff5ee56ffdf47c9c8850b72b5901acb8b146fa5. Yeni özellik; başlık/dipnot/çift sütun otomatik düzeltme tamamlandı diye sunulmaz.

## Kullanım

PDF→Sesli oku→başlangıç/bitiş ve Orijinal/Çeviri seç→**Metni önizle**. Proje oluşturmadan ve ses üretmeden seçili sayfaların aktarılacak metni incelenir. Kapanabilir bölümde aralık/kaynak modu, sayfa seçici, toplam karakter ve salt-okunur metin vardır. Sayfa seçici PDF sayfasını değiştirmez. Aynı prepareVoice yolu previewOnly dalıyla kullanılır; üretim hazırlığı güncel metni yeniden toplar, önizlemenin eski hâlini zorla kullanmaz. Düzenleme daha sonra projedeki mevcut metin editöründe yapılır.

Eksik çeviri, geçersiz1–100sayfa aralığı ve kaynak sahipliği kapıları ortaktır. Aralık/metin türü inputu ve belge kapanışı/değişimi eski önizlemeyi temizler. Önizleme sırasında aralık değişmişse geç sonuç gösterilmez. İlk50.000karakter/sayfa görüntü sınırı açıkça belirtilir; proje metni sessizce kırpılmaz. Bu büyük-sayfa sınırı kodda var; bu native testte4000karakter örnek kullanıldı.

## Tasarım ve test

Mevcut plainCSSgrafit/amber teması ve düğme sistemi korundu. Bölüm kapalıyken okuyucu alanı geniş kalır, açıkken ses paneli en fazla48vh; metin odaklandığında görünür. İlk dar ekran görüntüsünde metin görünüm dışında kalıyordu; gerçektextarea görünürlük assertion'ı eklendi ve yerleşim düzeltildi. Sayfa değişiminde imleç/scrollbaşlangıca alınır. EN/TR manuel dinamik etiketler ve statik sözlük karşılığı var. ui-locale testi ilk Metniönizle eksik çevirisini yakaladı; istisna/eşik yerine gerçek karşılık eklendi.

-3hedefliNode dosyası PASS:preparationownership/readingorder/locale;syntax/diffPASS.
- Native Windows gerçek3sayfaPDF:2–3aralığı,3990karakter,iki sayfa içeriği doğru; önizlemede proje sayısı değişmez; hazır proje iki bölümünün metni önizlemeyle birebir. Aralıkinputu eski metni temizler. Eksik translation preview reddedilir; proje yok. Okuyucunun mevcut zoom/voice/assistant/nextpagepause/close/TXT akışı da PASS.
- TRdark800125% ve ENlight1100100% gerçek görüntüler incelendi, textarea yataytaşma yok ve sespaneli içinde görünür. [Kanıt](PREVIEW705_2026-10-28/native.json).

## Kaynak ve sınırlar

Mevcut extractPdfReaderPage→prepareVoice→book-from-reader zinciri kullanıldı; ikinci çıkarıcı/summarizer eklenmedi. Mozilla PDF.js Apache2pdf_find_controller.js extractText/getTextContent yaklaşımı kaynak olarak incelendi. Dışkod/dependency/IPC/kalıcı şema yok. Önizleme metni kullanıcı verisidir, arayüz çevirisine sokulmaz. Ham kişiselPDF/profil/ses/API committe yok.

Bu native kabul orijinal metin ve eksikçeviri kapısını doğrular; başarılı canlıçeviri örneği yok. Başlık/dipnot/çift sütun karmaşık gerçekPDF kabulü ve EPUB/diğer okuma akışları ayrıca; P064/P065 bekler, P066PDFkapsamı doğrulandı. GPU/TTS/doğallık/start.bat/install/DRM/liveLLM yok.11before-quit warning açık;CIbeklenmedi.
