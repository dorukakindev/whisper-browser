# Rapor734 — Ses çevirisinde kaynaktan bağımsız rol incelemesi

Başlangıç master aec509f0509735cc2bf6802a47f219b20452dd61. Dal codex/speech-relations734. Ürün 6afbf9516690d45e741346c485661c47e6ba2564, test bitişi3bbe3ddd39b4788fcdc195d09bd277f096422952. R733'ün açık iki yanlışını ele alır; yeni bug diye tekrar sayılmaz.

## Problem ve nihai davranış
R733'te model sahiplik karşıtlığını alıcıya, özür borcunun alıcısını borçluya çeviriyordu. Aynı taslağı ikinci kez göstermek ve genel yönergeyi uzatmak tek başına güvenilir olmadı. Artık **ses için çeviri + gözden geçirme** açıkken, İngilizce kaynakta not/rather than/instead of + iyelik/şahıs zamiri biçimindeki riskli gruplar ayrı inceleme paketinde ele alınır. Diğer gruplar normal editöre gider; normal çeviriye ek rol isteği eklenmez.

`backend/speech_relations.py`: kaynağı okuyup aktör/eylem/nesne/sahip/alıcı ve dışlanan rol adaylarını ister. Kaynak grup kimliği korunur; yanıt tam kapsama, tekil integerID (bool reddi), kapalı contrast_role enum, altı kısa metin alanı, kontrol karakteri/boyut sınırlarıyla doğrulanır. En fazla12grup/6000kaynak karakteri; en fazla4adet1200karakter salt kaynak komşusu. Boşluk>=8sn sahneleri ayırır. Çeviri taslağı/neighbor_drafts bağımsız kaynak okumasına gönderilmez. Bu sınırlı tetikleyici her tür anlamsal riski bulmaz; yalnız İngilizce desteği iddia edilir.

`backend/transcribe.py`: riskli ve normal grupları ayırır, aday rolleri mevcut sağlayıcı/rota/hata/iptal mekanizmasıyla alır. Riskli grubun doğrulanmamış taslağı yalnız istek kopyasından çıkarılır; stored çıktı/cache bozulmaz. Ayrı kısa kaynaktan çeviri yönergesi ve mevcut JSON sentences/items sözleşmesi kullanılır. Sözlük, kilitli çeviriler ve güvenilmeyen sahne notu korunur. Yeni aday mevcut parça/ID/ad/sayı/olumsuzluk ve refinement kapılarından geçmeden uygulanmaz. Gösterge metriklerinde ek istekler sayılır; rol kaydının doğruluk kanıtı olmadığı logda belirtilir. Speech protocolv10 ile önceki önbellekten ayrılır.

Ek rol okuması başarısızsa ilk taslak korunur ve iki dilli uyarı verilir. Başarısız rol incelemesi refined olarak cache'e yazılmaz; sonraki çağrıda taslak çeviriyi yeniden ücretlendirmeden inceleme tekrar denenir. Kaynak okuma için en fazla2 taşıma denemesi; yeniden JSON-uyumluluk/rota davranışı mevcut ortak fonksiyondur. İptal ve kalıcı sağlayıcı hatası gizlenmez. Ek ücret/gecikme vardır; bu maliyetsiz hızlanma değildir. Yeni IPC/ayar/bağımlılık/kurulum/schema yok.

## Gerçek canlı kanıt ve başarısız yollar
[Kaynak16cue](TRANSLATION734_2026-10-29/source.srt), [bağımsız8cue](TRANSLATION734_2026-10-29/holdout-source.srt), [bütün ara koşu özetleri](TRANSLATION734_2026-10-29/runs.json). Her koşunun gerçek sentetik SRT'si aynı dizinde; kişisel metin/anahtar/prompt logu yok.

- İlk bağımsız rol çıkarımı + ayrı çeviri prototipi4repliği doğru yaptı. Ürün hattında daha geniş editör isteğiyle tekrarlar tutarsızdı: scene-main araba sahipliğini, split-main özür alıcısını yine yanlış bıraktı. Bunlar başarı diye gizlenmedi.
- İstekten taslak kaldırılırken yerel evaluator `row.translation` alanına bağlıydı; hedefli2test kırmızı oldu. Değerlendirme dondurulmuş `review_drafts` üzerinden yürütüldü. Bu ara geliştirme hatası kullanıcıya yayımlanmadı.
- Son rol şeması paralel iki koşuda429aldı. Model yedek taslakla çıktı verdi; **rate-limit-main/holdout rol kalitesi kanıtı değildir**. Süreçler gerçekPID ve terminal sonuçlarıyla izlendi; timeout yüzünden aynı iş yeniden başlatılmadı. Son kabul işleri sırayla koşuldu.
- Nihai accepted-main:5HTTP200,16/16cue,0boş/başarısız/kaynakdil/zamanfarkı; bilinen iki repliksahiplik/alıcı doğru. [Nihai16cue](TRANSLATION734_2026-10-29/accepted-main.srt).
- Nihai accepted-holdout:3HTTP200,8/8cue aynı yapısal kabul. Yedi açık rol karşıtlığı korunuyor. `But he lent you the helmet, not me` kaynakta actor/recipient açısından belirsiz; hedef alıcı karşıtlığını seçiyor, kesin yanlış veya kesin doğru sayılmıyor. Bazı brother karşılıkları kardeş olarak cinsiyet ayrıntısını genelliyor; tam sözcüksel detay kabulü değil. [Nihai8cue](TRANSLATION734_2026-10-29/accepted-holdout.srt).

Gerçek DeepInfra DeepSeekV4.1standard/Flexyok, güvenli Electron broker/relay, kişisel ayar değişmeden gerçek WindowsPythontranslate-only/speech/refine hattı. Nihai16+8koşu8HTTP200; ara prototip/tekrar/429istekleri ayrıca runs.json'da. Bir kerelik iyi örnek genel doğruluk garantisi değildir. Üretilmiş rol adayları yanlış olabilir; mekanik kabul anlam doğruluğu sayılmaz. Nihai sözlük/sahne passthrough eklemesi sonrası ilgili yerel test PASS; canlı korpuslarda sözlük/sahne notu yoktu.

## Test ve ortam
- `python -m unittest discover -s backend -p test_speech_relations.py`:10PASS. Boyut/tekilID/enum/kontrol karakteri,25grubu12'likpaketlere eksiksiz bölme, sahnebağlamı, taslaksız veri, gerçek llm_translate refiner akışı, normalçevirideekistekyok, başarısızlık+cacheyenideninceleme, iptal yayılımı, sözlük/sahnenotu.
- Mevcut speech_translation20, speech_fidelity7335, translation_quality_corpus5 PASS.
- Node backend-sentence-translation125kontrol ve report5185PASS; Python py_compile ve gitdiffcheckPASS.
- UI/CSS/start.bat/install.bat değişmedi; yeni ekran görüntüsü gerekmiyor. Gerçek yeniGPU/TTS/ASR/YouTube/DRM/nativepicker/insandinlemesi yok. Tam paket/CI beklenmedi; görülmeyen CI sonucu yeşil sayılmaz. NativeWindowsbrokerçalışması BATetkileşimli kabulü yerine geçmez.

## Kaynak incelemesi ve sınırlar
Mevcut refinement/cache/route sözleşmesi kullanıldı. [GEMBA](https://github.com/MicrosoftTranslator/GEMBA) kaynak/çeviri değerlendirmesi yaklaşımı ve CC-BY-SA4lisansı görüldü; kopyalama yapılmadı, gemba_mqm.py tahmini yolu404olduğu için o dosya okunmuş sayılmadı. [COMET XCOMETMetric kaynak kodu](https://github.com/Unbabel/COMET/blob/master/comet/models/multitask/xcomet_metric.py) kaynak/çeviri/reference ve hata aralığı değerlendirmesini ayırır (Apache2). Biz model/bağımlılık kurmadık, COMET skoru üretmedik; yalnız genel tek puan yerine kaynak dayanağını ayrı inceleme yaklaşımını değerlendirdik. Dış kod/prompt kopyalanmadı.

P011/P012/P017 ilerleme kısmi: seçilen iki hatanın son canlı kabulü var; bütün diller, dolaylı anlatım, geniş film bağlamı, otomatik belirsizlik tespiti ve insan kalite karşılaştırması açık.90hedef bitmedi; müzik kapsam dışı.
