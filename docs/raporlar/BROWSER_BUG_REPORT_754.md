# Rapor754 — Canlı PDF çevirisinden seslendirme metnine, doğru durum ve kompakt önizleme

## Yeni gerçek kanıt
P066/P067 akışında yalnız başarılı sahte sağlayıcı değil gerçek DeepSeek standard kullanıldı. Ayrı Windows Electron profili/sentetik iki sayfa PDF → gerçek PDF.js çıkarımı → kayıtlı güvenli DeepSeek hesabı,2HTTPisteği →2/2sayfaTürkçe → diskte çeviri durumu ve gerçekTXTexport → yalnız2.sayfa çeviri önizlemesi → tekbölümlü seslendirme projesi. Önizleme sırasında proje sayısı0, hazırlama sonrası1; önizleme metni ve proje metni byte/metin olarak aynı. GPU sesi başlatılmadı. [Canlı sonuç](evidence754/live-pdf-chain.json).

Örnek: “Second page begins. More text follows. End of fixture.” → “İkinci sayfa başlıyor. Metin devam ediyor. Fikstürün sonu.” Teknikfixture sözcüğünün çevirisi genel edebî kalite kanıtı değildir. Sadece iki kısa sayfa; büyük kitap/EPUB/insan kalite kabulü tamamlandı sayılmaz.

## Düzeltilen ürün sorunları
1. renderer.js updatePdfReaderProgress her state.pages anahtarını sayıyordu; failed/pending/karma bloklu sayfa bile2/2veyeşiltamamdı. Şimdi yalnız belge sınırındaki geçerli sayfa anahtarları ve tamamlanmış bloklar sayılır. translated/skipped/kullanıcıdüzeltmesi mevcut PDF servisinin tamamlanma sözleşmesiyle uyumludur; başarısız sayfa gizlenmez. [Önce-kırmızı](evidence754/progress-before.txt); son native kontrollü1failed+1ready→1/2vecomplete:false.
2. styles.css tamamlanma rengi sabit açık yeşildi; açık temada okunmuyordu. Ortak --success tokenı kullanılır; final gerçek açık temada4.6909kontrast, Node eşiği4.5gevşetilmedi.
3. pdf-reader.css kısa58karakterlik önizlemeye sabit17vh boşluk ayırıyordu. field-sizing:content/min88px/maxmin(180px,20vh) ile içerik boyutu kullanılır; uzun metin içeride kayar. Final gerçekWindows kısa88px/uzun180px(scroll7137/client179),950pxyükseklikte411pxokuyucualanı.800CSSpx/yüzde125ENaçıkta yataytaşmayok. TümDPI/ekrankapsamı iddia edilmez.

## Değişen dosyalar
- src/renderer/renderer.js: doğru sayfa tamamlanma sayacı.
- src/renderer/styles.css: temaya bağlı tamamlanma rengi.
- src/renderer/pdf-reader.css: içerik boyutlu sınırlı önizleme.
- tests/pdf-progress754.test.js: failed/partial/pending,bounds,skipped,edited sözleşmesi2test.
- tests/electron-pdf-translate.smoke.js: varsayılan ücretsiz yerel sağlayıcı korunur; --live-deepseek açıkoptin, güvenli broker→NodeIPC→yalnızDeepInfraAuthorization,12istektavanı/60snrequest/240sntoplam; Downloads ayrıprofileyönlü. --preview-acceptance ücretsiz kontrollü modda aynı seçiliönizleme/projeyeaktarım, görünürlük(elementFromPoint),uzunmetin,ENlight125,kontrast ve başarısızsayfasayacı kontrolü. Kişisel anahtar argv/log/dosya/commit'e yazılmaz. Test profiline yalnızsentetiktokenkonur.

## Kanıtların sınırı ve hazırlık hataları
İlk iki canlı test adaptörü denemesi yerel relay izni ve provider değişken adı nedeniyle başarısızdı; bunlar ürün bugı sayılmadı. Sonra veri zinciri geçti fakat ekran görüntüsü ana sayfaydı; bu görsel kabul sayılmadı. Görünür okuyucu açılışı ve elementFromPoint şartıyla canlı zincir tekrar geçti. Bir ara body media-home-active sınıfını yok sayma beklentisi hatalıydı: gerçek uygulama okuyucuyu bu sınıf korunurken overlay olarak açar; kontrol gerçek görünen elemana çevrildi. Test beklentisi ürüne kalibre edildi, başarısız çıktı tamamlandı diye sunulmadı.

Canlısonuç/görüntü kompaktCSSöncesidir: [canlı görünür PDF](evidence754/live-preview-before-compact.png). Son ürün değişikliklerinden sonra yeniden ücretli istek açmak yerine aynı gerçek PDF.js/IPC/projeakışı kontrollüsağlayıcıyla doğrulandı: [finalölçüm](evidence754/final-controlled-layout.json), [TRkoyu](evidence754/controlled-translated-preview.png), [ENaçık125](evidence754/controlled-translated-preview-en-narrow.png). tr~ metinleri kontrollüplaceholderdır, modelçevirisi değildir. Görseller gerçekten açılıp incelendi. YeniGPU/ses/M4B/kişiselstart.bat/gerçekfizikselfileseçici yok. Mevcut11before-quit listener uyarısı ve basit PDFfixturexrefindexing uyarısı açık.

## Kontroller ve kaynak
4hedefliNode (progress2,ownership1,fileaccessscript1),ikiJSsyntax,diffPASS. Varsayılan ücretsizPDFE2E,canlı2sayfazincir,finalkontrollüönizleme/DPI/kontrastakışıexit0. UzunCIbeklenmedi/kapatılmadı. Yeni bağımlılık/schema/IPC/kurulum yok. frontend-design/make-interfaces-feel-better öncekiokunmuş ortaktema kuralları uygulandı. Mevcut pdf-translate.js isPdfPageComplete davranışı esas alındı; mevcut nativeDeepSeekbroker/relay yaklaşımı tekrar kullanıldı. Harici repo kodu alınmadı, yeni model/SDK eklenmedi. Bu paket tüm ürün planını tamamlamaz;90aktifhedef devam.
