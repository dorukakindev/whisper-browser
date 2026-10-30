# R813 — Konuşma çevirisi, dublaj, asistan ve PDF kullanım kalitesi

30 Ekim 2026. Başlangıç: `c2812e4da3b6aeb5739ae97b81779d1679703c02`. Ürün kodu: `70ebd20b3514f785612ede47f6916cafeeb02d89`. Dal: `codex/quality-workflows813`. [Beş hedef](QUALITY5_2026-10-30.md), [ayıklanmış kanıt](evidence813/acceptance.json).

## Doğrulanan sorunlar ve değişiklikler

1. **Doğru negatif nicelik reddediliyordu.** Gerçek DeepSeek yanıtında “five degrees to minus five / ten-degree drop” doğru Türkçeleştirildiği halde ikinci `five` pozitif sayılıp `eksi beşe` ile eşleşmiyordu. İlk koşu 11/12 ve `meaning_number_mismatch` verdi. Açık `minus/negative` işareti sayı sözcüğüne/rakamına bağlandı; pozitif ve negatif örnekler birbirinin yerine kullanılamıyor. `minus one` da belirsiz yalın `one` istisnasına düşmüyor. Ters işaret, farklı miktar ve tekrar kullanılan nicelik negatif testleri korunuyor.
2. **Alıntı ve bildirme fiili ayrı cümle sanılıyordu.** `"İyiyim." dedi.` doğru yanıtı `fazla_cumle_sonu` ile reddedildi. Sayım ve görsel sarım yalnız kapanan alıntı + bilinen Türkçe bildirme fiilini birlikte ele alır. Gerçek ek cümleler hâlâ sayılır/reddedilir; metin ve noktalama silinmez. Söylenişe uygun deyim yönergesi netleştirildi. Konuşma çevirisi protokolü `speech-v12-signed-reported-speech`; eski önbellek/partial metadata yeni protokolle karıştırılmaz, kullanıcı dosyaları silinmez.
3. **Asistan yeni çeviriden önceki açık altyazıyla sese geçebiliyordu.** Devam akışında tamamlanan Whisper/çeviri işinin tam kimliği ve gereken rolü için uygulanmış `use_job_subtitles` makbuzu artık ses hazırlama/üretim önerisinin ön koşuludur. Kaynak aidiyeti ve kısmi çıktı onayı mevcut ana süreç sınırlarından geçer. Kontrollü test bilinçli erken ses önerisini engelleyip doğru altyazı → üretim → bağlama zincirini doğrular.
4. **Model gerçek kart olmadan “kartı önerdim” diyebiliyordu.** Canlı koşuda gözlendi. O turda gerçek öneri yoksa bu kesin söylem en fazla bir düzeltme turu alır. Araç reddi/iptal sınırları korunur; kart oluşturmak işlem uygulamaz. Asıl açık istek devam akışında tekrar yazılı izin gerektirmez; kullanıcı gerçek kart üzerinden uygulamayı onaylar. Hazır etkin referansın kaydedilmiş adı kullanılır; biyometrik sahiplik/benzerlik iddiası yapılmaz.
5. **PDF'nin eski dinleme hatası yeni sayfaya yazılabiliyordu.** Dinleme isteği, render, metadata, hata ve ilerleme callback'leri yakalanan okuyucu/sayfa/token ile korunur. Eski hata düşürülür, güncel hata görünür kalır ve yeniden deneme çalışır. Hazırlık penceresi açıldıktan sonra da kaynak yeniden kontrol edilir. Özgün PDF değiştirilmez.

Kullanım iyileştirmeleri:

- Ölçülmüş grup sınırı hız/seviye/durak uyarıları hem grup incelemesinde hem asistanın sınırlı bağlamında bulunur. `ready` statüsü “dinleyerek kontrol gerekmiyor” anlamına gelmez. Ham ASR ve özel yollar asistan özetine taşınmaz. Devamlılık satırındaki **Dinle** aynı grup oynatma yolunu kullanır; üretim yapmaz. Ham kayıtlar ve mevcut akıcı varsayılan korunur.
- Tamamlanan işin terminal altyazı çıktısı kısmi ise asistan kartı **Kısmi sonucu incele** ve açıklama gösterir. Akış sırasındaki `partial` bayrağı tam bitmiş bir iş için yanlış alarm üretmez; terminal artifact sayıları kullanılır.
- PDF uzun başlığı kesilerek tam ad tooltip'te korunur; uzun tanı metni üç satırlık kaydırılabilir alanda kalır. Sayfa ve kontrol kaydırmaları ayrıdır. Grup dinleme satırları dar ekranda sarılır, EN/TR ve mevcut tema token'ları korunur.

## Gerçek ve kontrollü kanıtlar

**DeepSeek V4.1 standart, Flex yok:** Aynı 12 sentetik kaynak cue önce 11/12 idi. İşaret düzeltmesinden sonra alıntı biçimiyle ilgili ikinci yanlış ret ortaya çıktı. İki düzeltmeden sonra ve son v12 protokolünde **12/12**, sıfır boş/kaynakta kalan/zaman uyumsuz blok; son koşu iki gerçek API isteği. Deyim, retorik soru, belirsizlik, karşıtlık, yüzde, negatif sıcaklık ve emir anlamları çıktı üzerinden incelendi. Bu bir kör insan paneli veya bütün çeviriler için kalite garantisi değildir.

**Canlı asistan:** Son tam koşu `tmp/deepseek-live-acceptance-1793382505967.json`: **5/5**, toplam 14 standart istek. Tam işten doğru çeviriyi yükleme, kısmi sonuçta üretime geçmeme, hazır kayıtlı referansla üretim kartı, yalnız hazırlama isteği ve tamamlanan ses kimliğiyle bağlama önerisi. Kaynak/okuma/öneri adaptörleri sentetiktir; bu koşu gerçek GUI'den YouTube → Whisper → GPU → bağlama işlemini tek zincirde çalıştırmış sayılmaz. Ana süreçte zincir uygulaması kontrollü regresyonda, Windows onay/IPC akışı native testte ayrı doğrulandı. Önceki başarısız canlı denemeler gizlenmedi: eksik test referans okuması, gereksiz referans kimlik sorusu, sahte kart söylemi ve ikinci yazılı onay isteği sonrasında yeniden test edildi.

**Gerçek VoxCPM2 GPU A/B:** Aynı metin/referans, 15 adım, CFG1.65, temperature0.8, hızlandırma1.0. A: satır, 4/4 ready; B: akıcı, 2/2 ready. İki WAV 33.6 saniye, final ASR/bütünlük geçti, clipped fraction0. Ölçülen sınır uyarısı yok. A wall78.594s/model yükleme23.219s; B wall23.984s/model yükleme0. Sentez ve doğrulama paralel olduğundan faz süreleri wall toplamı değildir; soğuk/sıcak etkisi nedeniyle hız üstünlüğü/kalite kazananı çıkarılmadı. İnsan doğallık kazananı yok; ses ayarları sırf ASR geçti diye değiştirilmedi. Yerel dinleme: `tmp/quality813-ab/listen/listen.html` (ham sesler Git'e eklenmedi).

**Windows görüntüsü/etkileşim:** Gerçek PDF ve sentetik WAV ile son okuyucu kabulü, geç hata/current hata/retry, kaynak seçimi, sayfa aralığı, asistan bağlamı, vurgu, zoom ve dar ekran geçti. Native asistan akışında dört kontrollü HTTP isteği, iki mesaj, gerçek onay/IPC/klavye ve480px panel geçti. Dublajda14 görüntü, TR koyu / EN açık125%, gerçek fare girdisiyle grup dinleme geçti. Güvenilir browser köprüsü testi geçti; gerçek hesap/DRM doğrulaması değildir. [PDF](evidence813/pdf-reader-compact.png), [kısmi sonuç](evidence813/assistant-partial-tr.png), [TR dublaj](evidence813/dub-continuity-tr.png), [EN dublaj](evidence813/dub-continuity-en.png).

## Kısa kontroller

- `node --test tests/assistant-provider.test.js tests/assistant-agent-service.test.js tests/assistant-voice-actions.test.js`: **52 geçti**.
- `node --test tests/backend-sentence-translation.test.js tests/speech-translation-ui.test.js tests/assistant-voice-actions.test.js tests/assistant-flows.test.js tests/assistant-flow-state.test.js tests/assistant-workflow654.test.js`: **28 geçti**; ilk dosyanın içindeki125 denetim ayrı yeni bug/ürün hedefi sayılmadı.
- `PYTHONPATH=backend ... -m unittest backend.test_speech_quality813 backend.test_speech_guard802 backend.test_speech_translation backend.test_audit794 backend.test_audit796`: **42 geçti**.
- Son native sıra: `electron-pdf-reader-experience.smoke.js --quality813`, `electron-assistant-flows.smoke.js`, `electron-dub-experience795.smoke.js --experience801 --continuity813`, `electron-browser-trusted-bridge.smoke.js --disable-gpu`: **4/4 exit0**.
- Değişen JS/Python ve main/preload/renderer sözdizimi, `git diff --check`: geçti. Yeni bağımlılık/kurulum yok.

Test düzeneği hataları ürün hatası diye sayılmadı: Node sandbox `spawn EPERM` sonrası yetkili çalıştırma; boşluklu doğrulayıcı Python argümanının tırnaklanması; native dinleme senaryosunun grup seçimini sonraki eski kontrole taşımaması; ana süreç testinin değişken araç tur sayısı yerine gerçek aşamalarla ilerlemesi. Hiçbir kalite eşiği düşürülmedi.

## Önceki CI ve sınırlar — açık kayıt

Başlangıç `c2812e4d` için artık bitmiş olan [Windows](https://github.com/dorukakindev/whisper-browser/actions/runs/41092509024/job/124190315304) ve [Ubuntu](https://github.com/dorukakindev/whisper-browser/actions/runs/41092509024/job/124190315505) tam paketleri **failure**. Windows günlüğünde **47 test dosyası başarısız**. Bu sayı bu tur yeniden çalıştırılmış tam paket sonucu değildir. Tüm kök nedenler ayrıştırılmadı veya bu pakette düzeltilmedi; hepsi ortam hatası diye sınıflandırılmadı. Örnekler: `ci-determinism-ratchet`, `css-hardcoded-colors`, `settings-ui-persist-roundtrip`, eski Python stüdyo testi, `test_translation_audit_2026_09_22`, `test_report495_audio`, eski/eksik VM bağımlılıkları. Bu paketin hedefli sonuçları tam CI yeşil anlamına gelmez. Test/CI kapatılmadı, eşik/baseline yükseltilmedi; yeni CI teslimi bekletmez.

Native testlerde mevcut **11 before-quit listener** uyarısı, GPU bağımlılığında mevcut NumPy/writeable ve weight_norm uyarıları devam eder. Kişisel uygulama kapatılmadı; `start.bat`/`install.bat` değişmedi ve kişisel normal açılış yeniden başlatılmadı. Gerçek yeni YouTube hesabı/Cloudflare/DRM kabulü, uzun GPU soak ve tüm ekran/DPI matrisi bu tur yapılmadı. Müzik analizi/yerel LLM eklenmedi.

## Dış kaynak incelemesi

[OpenBMB VoxCPM2 gerçek prompt/reference kodu](https://github.com/OpenBMB/VoxCPM/blob/main/src/voxcpm/model/voxcpm2.py) ve [PDF.js API kaynağı](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js) (Apache-2.0), [LangGraph interrupt/continuation örüntüsü](https://docs.langchain.com/oss/javascript/langgraph/interrupts), [WAI modal örüntüsü](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) ve [dublajda anlam/doğallık/zamanlama çalışması](https://aclanthology.org/2023.tacl-1.25/) incelendi. Projenin mevcut motoru, sahiplik ve onay mekanizmaları geliştirildi; harici kod/SDK veya yeni bağımlılık kopyalanmadı. README/issue iddiası çalışan sonuç diye kabul edilmedi.
