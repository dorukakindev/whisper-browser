# 520 — Claude ses tesliminin güvenli uyarlaması

2026-10-22. Taban `31db4dc46f1ac62ef920d26eb625fef30852c199`. Kullanıcı onayı: yararlı düzeltmeleri uygula, sonra canlıya al. Önceki inceleme [Rapor519](BROWSER_BUG_REPORT_519.md) bu dala dahil edildi. Harici ZIP kör uygulanmadı; 16 incelenmiş dosya aday olarak alınıp aşağıdaki güvenlik değişiklikleri ve üretim önbelleği/shift bağı birlikte düzenlendi.

## Alınan düzeltmeler

- Sayıların metin sonunda/virgül önünde okunması; para sembolleri, km/h ve m/s birimleri, vb./bkz./örn./Sn./Doç. açılımları. Görüntülenen SRT değiştirilmez, motora giden ayrı konuşma metni hazırlanır. Tarih/saat/sürüm ve metin içi ordinal belirsizliğinde muhafazakâr davranış sürer; metin sonundaki `3.` tek başına hâlâ belirsizdir ve kardinal okunur. Gerçek ses doğallığı ölçülmedi.
- Doğrulamada beklenen ve işitilen para ifadeleri aynı konuşma normalizasyonuyla karşılaştırılır. Doğru okumaların yanlış review'a düşmesi azalır; sayı değişimi ve olumsuzluk testleri korunur.
- Tanınan SDH/müzik/alkış etiketleri TTS metninden ayıklanır; gerçek parantezli replik ve bilinmeyen isim korunur. Atlanan satır adedi plan IPC'sinde ve EN/TR durum metninde gösterilir. Tümü ses dışı girdide sessiz başarı yerine mevcut boş-SRT hatası sürer.
- Küçük harfli Türkçe SDH modifiers kümesi aynı `_key` normalizasyonundan geçer; `[Müzik çalıyor]` ve büyük harfli biçimi tutarlı tanınır. Bu ortak yardımcı çeviri SDH işlemini de etkiler.
- Anlatıcıdaki sıradan iki nokta artık genel konuşmacı sınırı değildir; tire, köşeli etiket ve kısa ad etiketi korunur. `Ahmet bin Ali` / `Ludwig van Beethoven` gibi parçacıklı adlar ayrıca desteklendi. Sıradan başlık ile gerçek adın sezgisel ayrımı kusursuz değildir; `satir` modu hâlâ cue başınadır.
- Normal çeviriye dönüşte translateLenient kullanıcının kendi tercihiyle geri yüklenir; ses çevirisi katı kalır.

## Dış patch'e göre ek korumalar

1. **Kimlik kayması giderildi.** `SourceCues` liste uyumlu üçlüleri ve filtre öncesi geçerli cue sırasını ayrı saklar. `make_groups` özgün kimlikleri kullanır. SRT hash'i aynı kalırken eski editin yanlış cümleye taşınması önlenir. Aralık/önizleme/force-group/prosodi ortak plan yolunu kullanır. Zaman kaydırma `shift_cues` ile kimlikleri korur; silinen ilk konuşma sonraki kimlikleri yeniden saydırmaz. Eski caller'ların düz tuple listeleri hâlâ desteklenir.
2. **Eski ses yeni kuralları atlamaz.** `SPOKEN_TEXT_VERSION` üretim settings/cache kimliğine eklenir. Konuşma metni hazırlığı TTS önbelleğinden sonra yapıldığı için bu ayrım gereklidir. Eski dosyalar silinmez; yeni kuralla ilk üretim yeniden hesaplanır.
3. **Kapanış hatası başarı sayılmaz.** `Tamamlandi:` marker'ı beklenen dosya yoluyla eşleşmeli, WAV yapısal kontrolden geçmeli. Nonzero çıkışta çıktı dinlenebilir kurtarma olarak sunulur; `done` gönderilmez, otomatik video bağlama ve başarılı latest kaydı yapılmaz. Çıkış kodu/tanı korunur. Video modunda sync hâlâ doğrulanır; bozuk haritada sadece WAV kurtarma yolu sürer. İptal, marker'sız hata ve kesik WAV kuralları gevşetilmez. Marker ve WAV başlığı gerçek ses kalite onayı değildir.
4. `Bkz. Şekil 2.` artık `Bakınız Şekil iki.` olur; büyük harfle devam ediyor diye nokta eklenmez. Gereksiz yapay cümle durağı giderildi.

## Hedefli kanıt

Windows backend venv Python, gerçek depodaki abbreviation dosyasıyla:

| Dosya / kontrol | Sonuç |
|---|---|
| tests/test_dub_finish.py | 10 geçti |
| tests/test_dub_plan_regressions.py | 8 geçti; eski editin doğru cue'da kalması, SDH sonrası kimlik, aralık, preview, negatif shift dahil |
| tests/test_dub_timing.py | 14 geçti |
| backend/test_subtitle_sdh.py | 9 geçti |
| tests/test_dub_quality.py | 4 geçti |
| tests/test_dub_generation_quality.py | 14 geçti (kontrollü motor) |
| tests/test_dub_prosody.py | 6 geçti |
| backend/test_dub_flowing_groups.py | 6 geçti |
| backend/test_dub_resume.py | 3 geçti |
| backend/test_speech_translation.py (unittest discover) | 16 geçti |
| tests/test_report497_speech.py | 5 geçti |
| Node dub-service, dub-generator-ui, speech-translation-ui, browser-youtube-whisper | geçti |
| ui-locale-dedupe | 5 geçti |
| Değişen Python py_compile, JS node --check, git diff --check | geçti |

Kurtarma testi nonzero native kodu + geçerli fixture WAV + marker ile **error/recoverablePath** ve dosyanın korunduğunu doğrular. UI testi kurtarılan sesi dinlenebilir açar ama Use düğmesini gizler ve attach çağırmaz. Testler kalite veya gerçek donanım kanıtı diye sunulmaz.

## Sınırlar

Gerçek GPU/VoxCPM2 üretimi, dinlemeli A/B, canlı çeviri sağlayıcısı, YouTube/DRM ve Electron/start.bat yeniden açılışı yapılmadı. UI yerleşimi değişmedi; durum metni/etkileşim jsdom ve yerelleştirme kontrolleriyle doğrulandı, gerçek pencere görseli alınmadı. Tam paket gereksiz tekrar edilmedi, CI açık ve beklenmiyor. Yeni bağımlılık yok. Uygulama ayarları ve kullanıcı dosyaları değişmez. Kaynak görmeyen sonraki doğallaştırma editörünün semantik doğruluğu ve tam duygu aktarımı bu çalışmada çözülmüş sayılmaz.
