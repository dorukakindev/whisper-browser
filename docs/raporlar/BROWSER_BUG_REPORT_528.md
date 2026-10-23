# Rapor528 — Üretim sonunda takılma, gerçek sesi kurtarma ve eksik metin

2026-10-23. Depo: https://github.com/dorukakindev/whisper-browser
Dal: `codex/deep-audio528`.
Başlangıç master `fb86bb3264cecc6acf3d6806b28780468e01072c`.
Bitiş ürün kodu `1f1606e9d8e54f2dcb1ab2628e122cb4675966f7`.

Kullanıcı daha derin inceleme istedi. Sekiz yeni somut kusur ve önceki Rapor527'de giren bir uyumluluk regresyonu onarıldı; dokuz kök aşağıda. Aynı kökün test varyantları ayrı hata sayılmadı. Yeni gelen AGENTS talimatı ayrı PR açılmasını ve kendimiz merge etmemeyi istedi; bu tur ana sürüme alınmayacak. Ana Windows kopyası ve kullanıcı dosyaları değiştirilmedi.

## Bulgular ve onarımlar

| No | Önem | Kök neden / gerçek etkisi | Düzeltme ve kanıt |
|---|---|---|---|
| 528-01 | Yüksek | BrowserDubAudio, tam dublajın sonunu ses dosyasından önce background.duration ile belirler. Kısa arka plan katmanı bitince uzun konuşma da susar; uzun katmanda ses bittikten sonra özgün ses gereksiz kapalı kalır. | Tam dublaj süresi voice.duration; açık range/sync önceliği korunur. 3/120 sn katman,100 sn konuşma,20/101 sn konumları ile ses devamı ve özgün sesi geri açma doğrulandı. Eski HEAD aynı testte duruyor. |
| 528-02 | Yüksek | İlk akustik aday kalite puanı>0 ise retry çalışır; ilk dalga quality_retry dönmeden diske yazılmaz. İkinci üretim takılır/OOM olursa eldeki gerçek konuşma kaybolur ve kurtarma sessiz bölüm sanabilir. | Her iyileşen geçerli aday retry'dan önce checkpoint WAV'a alınır. Kesinti metadata'sı review ve acoustic_retry_interrupted olur; sonraki deneme yine zorlanır. Kontrollü engine, ilk2 sn ses ve sonraki stalled retry; restart tükense bile16000 örnek kurtarıldı. Eski kaynak EngineStalled ile tamamlanamaz. |
| 528-03 | Yüksek | SpeechVerifier.close ikinci3 sn wait zaman aşımını dışarı atar; finally'deki bu hata başarılı generation'ı veya gerçek EngineStalled istisnasını maskeler. Kullanılabilir parçalar olmasına rağmen son WAV kurulumuna gidilemez. | terminate/kill işletim hataları ve son wait timeout'u kontrollü uyarı olur; mevcut ses ve asıl engine/cancel sonucu korunur. CancelledError yutulmaz. Başarısız terminate ve kill-sonrası kapanmayan worker fixture'ları; eski kaynak TimeoutError ile düşüyor. Sürecin kesin kapanamadığı durum başarılı kapandı diye sunulmaz. |
| 528-04 | Yüksek | Eski motordan ithal loudnorm_audio, iki ffmpeg geçişini son tarihsiz çalıştırır; yalnız returncode/dosya varlığına bakar ve farklı ada kurabilir. Son bölüm bittiği halde süresiz bekleme, kesik WAV'ın özgünün üstüne kurulması veya sync/quality yolu kayması mümkündür. | Projeye ait dub_finalize.normalize_audio: geçiş başına30–600 sn sınır, sonlu ölçümler, PCM örnek hızı/kanal/frame denetimi, aynı yola atomik kurulum. Hata/kilit/timeout'ta özgün WAV kalır; partial silinir ve Node sahipliğine de eklenir. 72000→24000 örnek kesilmiş eski çıktı eski helper tarafından kabul edildi; yenisi reddediyor. Gerçek Windows ffmpeg3 sn Türkçe boşluklu yol,24000 Hz/frame korunumu geçti. İki geçiş toplam üst sınırı1200 sn olabilir; her donanımda kalite/süre garantisi değildir. |
| 528-05 | Yüksek | terminateProcessTreeAndWait, sinyal teslim edilmiş ama close gelmemiş işte _terminating=true bırakır. Kullanıcının sonraki Durdur çağrısı yeni taskkill/sinyal göndermeden yine timeout olur. | Aynı çocuk için eşzamanlı wait paylaşılır; doğrulanmamış canlı süreçte wait son tarihinde yeni explicit denemeye izin verilir. Sahiplik close'a kadar korunur. İlk stop=false, tekrar yeni sinyal, close sonrası true ve Windows gerçek parent/grandchild kill testi. Eski HEAD yeni sinyali göndermiyor. |
| 528-06 | Orta | Özgün anlatım analizinde herhangi bir ffmpeg excerpt timeout'u tüm prepare_prosody'yi düşürür; önceden başarıyla analiz edilmiş satırlar da kaybolur. Sürekli bozuk kaynakta her satır90 sn denenebilir. | Kesit hatası feature=None olarak korunur; iyi komşular atılmaz. Üç ardışık decode hatasından sonra kalan kesitler yönlendirmesiz tamamlanır. Sessiz ama başarıyla decode edilmiş kesit hata sayılmaz. Good/timeout/good ve good/3timeout/kalan atlama, ayrıca3 sessizden sonra iyi kesit testleri. |
| 528-07 | Yüksek | Ses metni editörü choices.content'ı alıp finish_reason=length gibi kesinti kanıtını yok sayar. Dilbilgisel olarak tam ilk cümle heuristik kapılardan geçebilir, sonraki cümle sessizce kaybolur. | editorText bilinen length/max_tokens/content_filter/tool/function sonlarını reddeder; özgün metne dönüş korunur. stop/end_turn ve reason vermeyen eski sağlayıcı davranışı korunur. İlk cümlenin safeShortening'den geçtiğini gösteren test ve kesinti durumunda ret. editorIdentity v4 ile AI düzenlemesi içeren eski parçalar yeniden değerlendirilir; kaynaklar silinmez. Bu semantik eşdeğerlik garantisi değildir. |
| 528-08 | Yüksek | Dublaj parse_srt end<start gerçek konuşma cue'sunu hiç bildirmeden düşürür; diğer satırlar seslendirilip iş başarılı görünür. | Gerçek konuşma için cue numaralı açık hata, GPU'dan önce zaman düzeltme talebi. Bozuk zaman tahmin edilmez; sıfır süreli cue'nun1 ms onarımı ve kaynak kimlikleri korunur. Üç satırlı örnekte orta replik eski kaynakta sessizce kayboluyor; yeni kaynak cue2 hatası veriyor. |
| 528-09 | Orta | Önceki Rapor527 coveredCueIds düzeltmesi çıktı zamanı var ama source zamanı yoksa NaN sınır karşılaştırması yapıyor. Eski identity-only kaynaklarda birleşik çeviri yanlış partial olur. Bu benim önceki teslimimde giren gerçek regresyondur. | Zaman bilinmeyen tarafta yalnız tekil kimlik için eski eşleşme; iki tarafta sonlu sınırlar varsa sıkı containment aynı kalır. null/boş source zamanı artık0 sayılmaz. Belirsiz duplicate kimlikler tamamlanmış sayılmaz. Hem eski merged sözleşmesi hem Rapor527 dış-aralık kaybı testi birlikte geçti. |

## Gerçek CI kanıtı ve karşılaştırma

Önceki master fb86bb32 için GitHub Actions run40014755942 tamamlandı: Windows ve Ubuntu test işleri Run test suite aşamasında browser-translation-merged.test.js 'partial' != 'complete' hatasında kaldı. Bu artifact kotası engeli değildir; ürün regresyonu528-09'dur. Loglar yalnız GitHub kimlik bilgisiyle GitHub API üzerinden alındı; imzalı log sunucusuna Authorization aktarılmadı. Günlüklerin kişisel/ham kopyası Git'e eklenmedi. Rapor527'nin legacy desteği iddiası source zamanı eksik durumu kapsamıyordu; bu rapor düzeltme kaydıdır.

Ignored tmp/audit528-baseline eski HEAD kaynakları ve teslim testlerinin kopyasıyla:
- Browser kısa background ve iptal tekrar testi2/2 başarısız.
- Dört seçili Python eski-yol testi: kaybolan aday EngineStalled, verifier kapanışı TimeoutError, prosody TimeoutExpired, ters cue hatası beklenirken hata yok.3 error+1failure. Yeni test yardımcı importuna bağımlı vaka bu karşılaştırmaya alınmadı.
- Eski uygulamanın doğrudan kullandığı installed kitap_ortak.loudnorm_audio AST gövdesi kontrollü converter ile72000 frame özgünün24000 frame'e düşmesini kabul etti. Harici motor dosyasına dokunulmadı.
- İlk baseline Node denemesi sandbox spawn EPERM idi; ürün bug sayılmadı, izinli koşumla gerçek assertion hataları tekrarlandı.
- editor finish_reason kaybı eski main'in doğrudan content okuması ve heuristiğin tek-cümle önekini kabul etmesiyle kanıtlandı; sağlanan servis API'si çağrılmadı.

## Kontroller

- Node hedefli12 dosya/runner13 test: report528-audit, dub-service, browser-dub-audio, process-lifecycle, dub-generator-ui, dub-workspace-ui, dub-editor-request, dub-text-guard, ui-locale, ui-locale-userdata, ui-locale-dynamic, report523-worker-ownership geçti. Alt assertion sayıları ayrı bug sayılmadı.
- 528-09 sonrasında browser-translation-merged, browser-translation-integrity, report527-audit, report528-audit: runner15/15 geçti. Önceki hatalı CI testinin kendisi korunarak geçti; test silme/gevşetme yok.
- Python14 ilgili dosya,86 yöntem geçti: test_audio528, test_dub_generation_quality, test_dub_plan_regressions, test_report491_audio, test_dub_lifecycle, test_dub_resume, test_dub_recovery, test_dub_timing, test_dub_quality, test_pipeline_524, test_pipeline_525, test_dub_prosody, test_dub_completion, test_dub_module_paths.
- `npm run test:electron-bridge` Windows'ta geçti: trusted bridge/TextTrack/EME/media/shadow/iframe ve isolated-world fixture. Bu gerçek YouTube DRM başarısı değildir.
- Gerçek ffmpeg normalizasyonu ve gerçek Windows parent/grandchild iptali ilgili testlerin içinde geçti.
- Değişen JS/Python sözdizimi, main/preload/renderer/transcribe kontrolleri ve git diff --check geçti.

## Kullanım, Windows etkisi ve sınırlar

Yeni ayar gerekmiyor. Üretim sonunda 'Ses yüksekliği dengeleniyor…' aşaması görünür; opsiyonel dengeleme atlanırsa özgün sesin korunduğu söylenir. Bu üç yeni status/warning Türkçe/İngilizce sözlüğe eklendi. HTML/CSS/geometri değişmedi; yeni gerçek arayüz ekran görüntüsü alınmadı, Jsdom UI ve Electron bridge geçti.

Windows kilitli dosya denemesinde farklı ad yaratılmaz, özgün kayıt korunur. Türkçe/boşluklu yol, örnek hızı, gerçek taskkill ağacı doğrulandı. install.bat/start.bat, bağımlılık ve dış VoxCPM2 motoru değişmedi. Yeni repo dosyası dub_finalize.py mevcut numpy/soundfile/ffmpeg ortamını kullanır. Yalnız editorIdentity v3→v4 AI düzenleme önbellek adresi değişir; model ağırlığı/varsayılan üslup/ücretli servis eklenmedi.

Tam npm test bu turda çalıştırılmadı. CI açık kalır; yeni PR sonucu beklenmez ve yeşil denmez. Gerçek Whisper/VoxCPM2 GPU, kişisel referansla uzun üretim/dinleme, canlı çeviri sağlayıcısı, YouTube/hesap/DRM ve normal start.bat açılışı koşulmadı. Ana kopyadaki üç yerel belge düzenlemesi ve untracked kullanıcı dosyalarına dokunulmadı. Yeni gelen kullanıcı talimatı gereği PR merge edilmez ve ana kopya bu turun koduna güncellenmez.
