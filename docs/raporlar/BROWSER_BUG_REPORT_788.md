# Rapor 788 — Ses için çeviri kabulü ve sade dublaj stüdyosu

## Kapsam ve doğrulanan neden

Başlangıç master 0c844643edf3db42731fcd16c95bfb1069f90d5a; dal codex/speech-quality788. Bitiş ürün/test kodu d2b1a2ca23cfdf7df9f2fbcfff10342966475c99. Kullanıcının kaynakları değişmedi; kişisel loglar, sesler, API yanıtları ve anahtarlar bu teslimde yok.

İlgili gerçek transkripsiyon işinin günlüğü gpt-6.1-sol modelini gösteriyordu; asistanın DeepSeek seçimi bu işin çeviri modelini değiştirmemişti. 297 cue içinden 53 başarısızdı; özgün metin korunarak partial çıktı verilmişti. Dolayısıyla bu dosyanın eksikliği doğrudan DeepSeek arızası diye nitelendirilemez. Ayrı canlı DeepSeek denemesiyle kalite kapılarındaki yanlış retler ayrıca doğrulandı.

## Düzeltmeler

1. Ses için çeviride aynı sınırlı cümle grubunun kelime/sayı/özel ad yerleşimi tam cümle üzerinden değerlendirilir. Gruplar arası taşıma açılmadı. SDH ve biçim etiketleri kendi cue'sunda denetlenmeye devam eder; normal altyazı modu eski cue bazlı çapa sözleşmesini korur.
2. Son kalite raporu da ses modunda aynı cümle bütünlüğünü kullanır; geçerli dağıtımın sonradan başarısız sayılmasını önler. Kaynak yankısı, boş cue ve zaman değişikliği denetimleri korunur.
3. Türkçe çoğul olumsuz yeterlik, edip etmeme gibi alternatif soru yapıları ve dar geçmiş alışkanlık ilgi cümlesi karşılıkları tanınır. Gerçek olumsuzluk ve tek başına koşullu modal kaybı negatif testlerle hâlâ reddedilir.
4. Açıkça tanıtılan eser adlarının yerelleştirilmesi, hedefte adlandırma yapısı ve büyük harfli başlık koşullarıyla kabul edilir. Kişi adı değiştirme ve başlığı tümden silme negatif kontrolleri reddedilir. Christian/Hristiyan eşdeğeri eklenir.
5. Model, tam cümle ve cue parçalarını iki farklı doğru anlatımla döndürdüğünde yalnız ses modunda sınırlı uzlaştırma yapılır: iki gösterim de ayrı ayrı kaynak anlamı ve çapaları korumalı, tüm ID'ler dolu olmalı. Parçaların birleşimi tek kayıt metni olur; sonraki sınır/tekrar/kuyruk kontrolleri atlanmaz. Eksik ID veya sayı kaybı onarılmış sayılmaz.
6. Konuşma protokolü speech-v11-sentence-meaning oldu; eski protokol çıktısı yeni kabulden geçirilmeden kullanılmaz. Prompt ses moduyla tutarlı hale getirildi.
7. Stüdyoda hazır profil ve zamanlama önde, motor/gruplama, deneysel anlatım ve gelişmiş AI ayarları açılır bölümlerde. Kayıtlı referans arama/seçme görünür. Checkbox aralığı, başlık boyutu, arama alanı, dar ekran ve alt işlem çubuğu düzenlendi. Uzun aşama dökümü üretim ayrıntılarına taşındı; hata/uyarı görünür kaldı.
8. AI düzenleme hataları güvenli reason enum'u taşır: configuration/authentication/rate_limit/provider/timeout/output_limit/empty_reply/meaning_guard. Ham sağlayıcı hatası/kişisel metin yeni alan üzerinden sızdırılmaz. Kesilmiş çıktı kullanılmaz; anlam koruma filtresi devam eder. Çıktı bütçesi 600'den 2400'e çıkarıldı, timeout45sn korunur. Bu değişiklik özgün işteki genel uyarının kesin nedenini geriye dönük kanıtlamaz.
9. Gelişmiş AI bölümünde seçili çeviri modeli ve asistandan bağımsız olduğu açıkça gösterilir; kişisel model ayarı test için değiştirilmedi.

## Kanıt ve kontroller

- Gerçek DeepSeek V4.1 Flash standard tier, güvenli bellek broker'ı, üretim Python translate-only/for-speech/refine hattı; aynı kaynak bölümünden 27 cue. İlk koşuda15 başarısız/11 kaynak metinli; son koşuda5 gerçek API isteği,27/27 kabul,0 kaynak metinli/boş/zaman/anlam kalite hatası. Son kabul .uiprev/speech-translation-live/1793304360121-14004/acceptance.json. Ham istek/yanıt kişisel ve Git dışında. Rastlantısal model çıktıları nedeniyle bu bir evrensel kalite veya tüm video sonucu iddiası değildir.
- Python: `python -m unittest discover -s backend -p test_speech_translation.py`:26 PASS. Zaman koruma, sayı kaybı, SDH/markup yerinde kalma, gerçek ad/olumsuzluk/modal kaybı ve uzlaştırma negatifleri dahil.
- Node: backend-sentence-translation(125 kontrol), speech-translation-ui, dub-generator-ui, voice-reference-ui, dub-editor-request, dub-service ve dub-service-warm-start geçti.
- Yeni `tests/electron-dub-layout788.smoke.js`: gerçek Windows Electron'da TR koyu1440 ve EN açık800,3 durum/6 görüntü; modal/alt çubuk görünürlüğü, yatay taşma ve kaydırma-alt çubuk sınırı PASS. Son kanıt .uiprev/dub-layout788-1793305047496; görüntüler elle de incelendi. Ön genel21 ekran kontrolü de geçti.
- JS syntax, Python py_compile ve git diff --check PASS.
- Ek uyarı testi ilk kez bitmiş işe warning gönderdiği için düştü; ürünün terminalden sonra olayı reddetmesi doğruydu. Test çalışan işe taşındı, yeniden geçti. Eşik gevşetilmedi.

## Sınırlar ve ses incelemesi

Cızırtı için salt-okunur analizde çıktı dijital clipping göstermedi,123 grup sınırında sıçrama yoktu; referansın tek örnek tepeye vurması kaynağın kesin kanıtı değildir. Kullanıcı incelemeyi bırakmamı istedi; filtre veya ses değişikliği uygulanmadı. Ses kalitesi çözüldü iddiası yok.

Tüm297 cue yeniden çevrilmedi; eski kişisel partial dosya üzerine yazılmadı. İnsan kulağıyla dublaj kabulü, bu yeni metinle tamGPU üretimi ve canlı YouTube bu pakette koşulmadı. start.bat/install.bat değişmedi; kişisel uygulama kapatılmadı, normal start.bat açılışı yeniden sınanmadı. CI açık, beklenmiyor; tam npm test bu turda koşulmadı. İzole Electron testinde mevcut MaxListenersExceededWarning ve kapalı ağ filtre hazırlama uyarısı görüldü; gizlenmedi. Yeni bağımlılık veya kurulum yok.

## Dosyalar

- backend/sentence_translation.py: anlam/çapa ve ses yanıtı uzlaştırma yardımcıları.
- backend/transcribe.py: speech protokolü, prompt, kabul ve kalite raporu bağlantısı.
- backend/test_speech_translation.py: davranış ve negatif regresyonlar.
- src/main.js: AI düzenleme bütçesi ve güvenli hata sınıflaması.
- src/dub-editor-request.js + src/dub-service.js: güvenli reason enum'u ve olay aktarımı.
- src/renderer/index.html + browser-chrome.css + ui-locale.js + dub-generator-ui.js: sade stüdyo, model bilgisi, lokalize uyarı.
- tests/dub-editor-request.test.js + dub-generator-ui.test.js: reason ve UI davranışı.
- tests/electron-dub-layout788.smoke.js: ayrı profilli gerçek Windows düzen kabulü.

Ürün100'ün müzik kapsamı büyütülmedi;90 hedef aktiftir. Yeni bulgu sayısı doldurulmadı. Yerel uygulamanın çeviri/model sözleşmeleri kullanıldı; dış kod veya bağımlılık alınmadı. Sağlayıcı dokümanına erişim bu turda doğrulanamadığı için desteklenmemiş API özelliği eklenmedi.
