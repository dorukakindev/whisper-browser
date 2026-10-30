# Rapor801 — Dublaj çalışma deneyimi, alıntı vurgusu ve kaynaklı iş merkezi

Kapsam: kullanıcının onayladığı sekiz geliştirme. Başlangıç `b8c33aad6ec71894e8da22504e4c98d554059c35`; bitiş ürün kodu `0d20e0d854591d3dfc49da4d7b2893ee92b73883`.

## Uygulanan davranışlar ve kullanım

1. **Üretim kontrolü:** Altyazıdan ses stüdyosunun başındaki **Metni denetle**, mevcut motorun gerçek grup planını kullanır; tahmini süre, yoğun/uzun metin ve ölçülmüş referans uyarılarını gösterir. Sorunlu gruba basınca metin düzenleyicisi açılır. Üretimden önce plan hazırlanır. Süre formülü kelime/karakter tahminidir, doğallık puanı değildir. Yeni kaynak eski incelemeyi kullanamaz.
2. **İzlediğim anı düzelt:** Aynı stüdyodaki düğme veya **Ctrl+Alt+R**, güncel video zamanıyla tekil eşleşen tamamlanmış grubu açar. Metni uygula ve yalnız bu grubu yeniden üret. Farklı video, belirsiz örtüşme, örnek çıktı veya etkin üretim reddedilir. Native browser klavye köprüsü de bağlandı.
3. **Ses devamlılığı:** Ham WAV gruplarında aktif RMS, kenar sessizliği ve yaklaşık kelime/sn ölçülür. Komşu seviye/tempo sıçramaları görünür. Mevcut doğal konuşma seçeneği açıkken yalnız belirgin seviye aykırılarına en fazla ±2 dB uygulanır. Ham cache değişmez; geçici kopyalar mevcut zamanlama hattına girer. Perde, duygu veya tempo tekdüzeleştirilmez; yeni bir duygu aktarım modeli değildir. Ölçümler kalite raporunda ve kayıtlı dublaj çalışma alanında korunur.
4. **Çevirileri karşılaştır:** Kaynak, normal çeviri ve seslendirme SRT/VTT dosyalarını mevcut yetkili dosya seçiciyle açar. Zaman örtüşmesiyle eşler; üç sütun, dar ekranda tek sütun, sayfalama, değişen metin ve eksilen sayılar görünür. Dosyaları değiştirmez, anlamın korunduğuna otomatik onay vermez.
5. **PDF alıntısı:** Önceki R800'deki doğru sayfaya gitme akışına pasaj vurgusu eklendi. Okuma metninde CSS Highlight, özgün PDF'de eşleşen metin öğelerinin koordinat kutuları kullanılır. Tekrar eden alıntıda konum tahmin edilmez; taranmış/eşleşmeyen metinde açık durum gösterilir. Bu kutular tam glif hassasiyetli yeni bir PDF metin katmanı değildir.
6. **İşlem merkezi:** **Ctrl+Shift+J** ile Tümü / Çalışan / İnceleme / Hazır grupları; dublaj inceleme sayısı ve **Videoya dön / Kitaba dön** eylemleri. Kitap dönüşü doğru proje **ve bölüm** yüklenince doğrulanır. Browser dönüşü sekme kuşağını kontrol eder; kapanmış/değişmiş sekmeye körlemesine gitmez. Bu kaynak bağları mevcut oturumla sınırlıdır.
7. **Asistan sonuç doğrulaması:** Ses ayarı yazımı, etkin referans, video ses bağlantısı, kabul edilen iş, seçili/dinlenen grup ve özgün sese dönüş uygulama durumundan yeniden okunur. Ayar setter'ı yazıyı kabul etmezse başarılı makbuz üretilmez. Başlatılan işin kabulü tamamlandığı anlamına gelmez. Referans hazırlama/seçici makbuzları ölçülmüş sonuç diye sunulmaz.
8. **Windows görünüm turu:** Grafit/amber ve açık tema, EN/TR; geniş ekran ve 900 px + %125 zoom; asistan 480 px. Kaydırma içeriği alt eylem alanını ezmiyor. İkincil dosya/kayıt düğmeleri **Dosyalar ve kayıt** menüsünde. Karşılaştırma kapatma ve dosya seçme kontrolleri belirgin; reduced-motion tercihi korunur.

## Bulunan ve düzeltilen bağlantı hataları

- İş merkezinden aynı kitap açıkken erken dönüş farklı bölümde kalıyordu. Karşılaştırma artık bölüm kimliğini de içeriyor; native test proje ve bölüm 2'yi doğrular.
- Geç gelen ön inceleme yeni kaynakla karışabilirdi. Dosya ve medya kimliği hem async okuma sonrasında hem UI tarafında denetleniyor.
- Kalite ölçümleri mevcut çalışma alanı doğrulayıcısından geçerken kayboluyordu. Ana süreç ve workspace şeması sınırlı, doğrulanmış continuity alanını koruyor.
- Asistan yalnız `ok` makbuzuna dayanabiliyordu. Değişen ses eylemlerinde gerçek durum okuması eklendi.

## Doğrulama

- Node hedefli 8 test dosyası: **22 test geçti**. Komut: `node --test --test-reporter=spec tests/dub-experience801.test.js tests/assistant-voice-actions.test.js tests/browser-command-palette.test.js tests/dub-service.test.js tests/dub-workspace.test.js tests/reader-production800.test.js tests/media-workflows.test.js tests/ui-locale.test.js`.
- `D:\Whisper Local\backend\venv\Scripts\python.exe backend/test_dub_continuity801.py`: **3 geçti**. Gerçek sentetik WAV ölçümü, ±2 dB sınırı, örnek/süre korunması, raw hash değişmezliği, geçici dosya temizliği ve ardından gerçek timeline/WAV yazımı doğrulandı.
- Değişen/yeni **19 JS syntax + 3 Python py_compile** geçti. `git diff --check` temiz.
- Gerçek Windows Electron: `tests/electron-dub-experience795.smoke.js --experience801`: 10 kare, üç gerçek SRT'nin yetkili IPC ile okunması, değişen sayı, düzenlenmiş grup 2'nin yalnız kendisinin yeniden üretimi, farklı kaynak reddi ve taşma/alt alan ölçümleri geçti. Motor olayları kontrollüdür; GPU üretimi değildir.
- `tests/electron-pdf-reader-experience.smoke.js --experience801`: doğru sayfa, özgün PDF kutuları ve prose highlight geçti.
- `tests/electron-media-workflows.smoke.js --tasks801`: inceleme kovası, aynı proje ve tam bölüm 2'ye dönüş geçti.
- `tests/electron-assistant-workspace798.smoke.js`: kontrollü yerel HTTP/SSE ile 5 istek, öneri/uygulama/iptal ve 480 px açık tema geçti. Gerçek API/model başarısı değildir.
- İlk sandbox Node denemesi Windows `spawn EPERM` ile çalışamadı; izinli aynı komut geçti. İlk kitap testi render bitmeden textarea okudu; bekleme gerçek bölüm DOM'una bağlandı. İlk dar ekran ekran görüntüleri eski kareyi yakaladı; test penceresini öne alıp iki animation frame bekleyerek yeniden çekildi, son PNG'ler açılarak incelendi. Hiçbiri ürün başarısı diye gizlenmedi.

## Kanıt ve araştırma

Yalnız sentetik içerikli Windows PNG'leri [evidence801](evidence801/manifest.json) altında boyut/SHA256 manifestiyle kayıtlı; kişisel profil/anahtar yok.

Mevcut `PdfSpokenMap`, grup planı, dosya yetkilendirmesi, task merkezi, doğal konuşma ve zamanlama katmanları kullanıldı. [PDF.js gerçek text layer kaynağı](https://github.com/mozilla/pdf.js/blob/master/src/display/text_layer.js) koordinat yaklaşımı için incelendi; bağımlılığın mevcut Apache-2.0 lisansı değişmedi. Kaynaktan yeni kod kopyalanmadı. FFmpeg çevrim içi loudnorm belgesine erişim denemesi timeout oldu; okundu diye sayılmadı, mevcut normalizasyon hattı değiştirilmedi. Yeni bağımlılık/indirme/yerel LLM yok.

## Sınırlar

Canlı DeepSeek/YouTube, gerçek GPU/VoxCPM2 üretimi, insan dinleme/doğallık karşılaştırması bu turda koşulmadı. Böyle bir kalite artışı garanti edilmiyor. `start.bat`/`install.bat` değişmedi; kişisel uygulama kapatılmadı ve start.bat yeniden açılışı denenmedi. Tam npm test ve uzun CI beklenmedi; testler kapatılmadı. Native çalışmalarda önceden mevcut **11 before-quit listener MaxListenersExceededWarning** sürüyor; eşik artırılarak gizlenmedi. İzole dublaj testindeki engellenmiş filtre indirme uyarısı testin ağ kapatmasıdır. Devam eden eski müzik analizine yeni hedef eklenmedi.
