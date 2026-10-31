# Kullanıcının daralttığı kritik kapsamın kabul denetimi

## Kapsam kararı

31 Ekim’de kullanıcı bazı maddeleri keyfi bulup yalnız önemli işlerin yapılmasını istedi; 100 sayısının bile fazla olabileceğini belirtti. Bu yüzden **200 adayın tamamını uygulamak artık kabul koşulu değildir**. `CRITICAL-FOCUS.md` ve `TASKS.json.countTargetRetired` bu açık değişikliği kaydeder. Eski satırlar tarihsel aday olarak korunur; ertelenen özellikler tamamlandı diye işaretlenmez.

Bu denetimin kapısı aşağıdaki altı kritik ürün ölçütüdür. Son tam test, güvenli ana dal teslimi ve ana kopya doğrulaması tamamlanmadan teslim kapanmış sayılmaz. Başarılı senaryo dışında bütün uygulamanın hatasızlığı iddia edilmez.

| Zorunlu ölçüt | Yetkili güncel kanıt | Sonuç ve sınır |
|---|---|---|
| Doğru asistan kaynağı/iz/sohbet; eski onay yeni insan tercihini ezmesin | `assistant-agent-service.js`, renderer action katmanları; `assistant-workspace-ownership200`, `assistant-setting-proposals200`, `assistant-selection-stale-critical`, `assistant-source-*200`, `dub-output-owner-continuity` regresyonları. PR734–737 native kaynak/ayar kartı akışları. | Seçim ve kaynak/generation token’ları, native referans yazım kontrolü, ayrı yenileme/onay; manuel Sesi kullan da native kaynak+üretim kaydına bağlandı. Her araç ailesi için evrensel güvenlik iddiası değil. |
| Çeviri eksikliği ve anlam kaybı gizlenmesin; son geçiş ilk tam metni yok etmesin | Gerçek `transcribe.py` normal+speech yollarında bu tur 8 anlam vakası/9 cue; `live-meaning-review.json`, iki SRT. `test_speech_translation`, `test_transcribe`, `sentence_translation` sözleşmeleri; kalite ve artifact partial alanları. | İki canlı koşu tam; ilk/final metinler ve her önerme ayrı okundu. Kısmi/eksik/echo yanıtları mevcut negatif testlerde hazır kabul edilmiyor. Tüm diller/konular için genel eşdeğerlik veya hatasızlık kanıtı değil. |
| Dublajın son parçası/opsiyonel fit/doğrulama hatası tamamlanmış sesi kaybettirmesin; doğru kaynak/ref/örnek kapsamı korunsun | `test_dub_generation_quality` stalled-last-request ve duration-fit testleri, `test_natural_dub_generation` stall/OOM/cancel, `assistant-voice-actions`, `dub-request-owner756`, `dub-current-subtitle764`; PR735–737. | İlk tam WAV opsiyonel ikinci istekten önce korunur. Kurtarılan grup review, placeholder failed; tümü başarısız iş başarılı çıktı sayılmaz. Örnek yalnız o işin seçimidir. Kontrollü arıza + önceki gerçek GPU A-B ayrı kanıtlardır; insan doğallığı kazananı seçilmedi. |
| Konuşmayı koruyan senkron, kaldırma/gezinme/seek/pause/speed ve özgün ses | `dub-sync-map`, `independent-dub-rate-ownership`, `browser-dub-audio`, `browser-dub-mute-ownership`, `test_dub_timing` ve `test_dub_finish`; PR736 native cross-origin decoder/controller/mute receipt. | İlk mute yarışı ve oturum sahipliği onarıldı. Yeni insan mute/unmute kararı korunur; yanlış generation işlem alamaz; kalan eski bit gezinme sonunda bırakılır. Gerçek YouTube/DRM veya her site doğrulaması değil. |
| Ana sayfada iş sürsün; iptal/yeniden deneme doğru tek işi hedeflesin; durumlar ayrışsın | PR737 `native-home-acceptance` browser scheduler; bu tur gerçek tiny backend `native-whisper-home.json`; `renderer-stop-identity-critical`, `assistant-job-continuity-critical`, `report821-job-cancel`, `book-generation-stop645`, native/warm dub testleri. | Gerçek transkripsiyon tek süreçte 14 cue üretti; Home/geri dönüş kaynak ve iş kimliğini korudu. Dört renderer Stop yolu tam kimlik gönderir; eskisi yenisini durduramaz. running/cancelling/terminal durum ve partial artifact/kalite uyarıları korunur. |
| Gerçek kullanım engeli varsa düzelt; listeyi kozmetikle doldurma | Bu tur sekiz native assistant durumunda akış, uzun kod, onay kartı, hit-test ve composer; önceki doğal dublaj native 1440/820/640 ve kaynak/ayar/review seçimi ekranları. | İncelenen akışlarda örtüşme, erişilemeyen kontrol veya belge taşması bulunmadı. Kaydırılabilir onay alanı gerçek tıklamayla çalıştı. Tüm uygulama için evrensel görsel/erişilebilirlik sertifikası değil; yeni tema yapılmadı. |

## Teslim koşulları

- Eski 200/100 kota geri açılmaz; müzik, yeni Letterboxd/kütüphane genişlemesi ve yedekleme işleri zorunlu sayılmaz.
- Ürün onarımları önceki PR734–737 ile ana sürümde. Bu tur yeni ürün bug’ı çıkmadı; iki native kabul testi ve kanıt teslim edilir.
- Son tam yerel komut `node tests/run-all.js`; native kabul ayrı, canlı DeepInfra inference ayrı, önceki GPU A-B ayrı kaydedilir. CI sonucu beklenmez ve başarısızlık saklanmaz.
- Ana kopya yalnız doğrulanan fast-forward ile güncellenir; kişisel dosya hashleri ve izlenmeyen dosyalar korunur, açık uygulama kapatılmaz.

## Kapanışta iddia edilmeyecekler

200 aday tamamlanmadı. İnsan kulağıyla oyunculuk/doğallık üstünlüğü seçilmedi. Her site, model, GPU, cihaz, kitap ve çeviri dili sınanmadı. Bunlar eski isteğe bağlı adaylar veya açık kalite sınırlarıdır; kanıtsız başarıya çevrilmez. Sonraki yeni özellik/kozmetik işi bu kapanışın içine zorla sokulmaz.
