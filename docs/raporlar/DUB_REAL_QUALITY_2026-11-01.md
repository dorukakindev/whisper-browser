# Gerçek çeviri ve dublaj kalite kabulü — 1 Kasım 2026

Bu bir beş hedefli kullanım kabulüdür; yeni bug sayısını dolduran toplu tarama değildir. Başlangıç `82a0883142539b245290558958577c52335f4ec7`, ürün `b337e82d090e65c902a49d467485ab5baaaf059a`. Alt ajan kullanılmadı.

## 1. Gerçek kaynakla karşılaştırma

Kullanıcının daha önce oluşturduğu Why is Saturn so Terrifying altyazısının ilk yaklaşık121s bölümü kullanıldı:27kaynak cue. Kaynak/önceki çeviri dosyaları değiştirilmedi. Gerçek video sayfası veya özgün konuşma sesi bu tur yeniden indirilmedi; video dudak senkronu ve kaynak duygu analizi doğrulanmış sayılmaz.

RTX4070SUPER /12282MiB, mevcut VoxCPM2 nano-vLLM motoru ve mevcut izinli referans/döküm kullanıldı. Kişisel ayarlar değiştirilmedi. Model ve referans dosyaları rapora/Git'e taşınmadı.

| Örnek | Metin / yol | Grup | Üretim süresi | İnceleme isteyen |
|---|---|---:|---:|---:|
| A | Önceki Türkçe altyazı / satır satır |27|218,672s|10|
| B | Aynı Türkçe / akıcı bloklar |17|149,953s|7|
| C | Yeni canlı ses için çeviri / anlatım akışı ve doğal söyleyiş yönlendirmesi |17|198,193s|7|

A/B aynı metin ve temel15adım/CFG1.65/temperature0.8/seed42 ayarlarıyla üretildi. İstek sayısı/grup seed'leri ve soğuk-sıcak motor durumu farklıdır; süre farkı saf gruplama hız kazancı veya doğallık kanıtı değildir. B'nin hiçbir grubu yarım cümleyle bitmedi; mevcut tam cümle gruplama yolu işe yaradı, yeniden yazılmadı. C ayrı bir uçtan uca adaydır, tek değişkenli A/B değildir. C üretiminde kaynak ses analiz edilmedi; doğal cümle yönlendirmesi duygu aktarımının yerine sunulmaz. CLI bu denemede ayrıca canlı yeniden yazma köprüsü çalıştırmadı; ses için çeviri zaten ayrı gerçek backend hattında hazırlanmıştı.

Üç dosya da sonlu ve kırpılmamış dalga biçimi içeriyor. C'de10ready/7review/0failed var. Son dosya ASR bütünlük kapısı **geçmedi**: özel ad yazımı/okunuşu ve tekrar şüphesi inceleme gerektiriyor. Yedi grubun tümünde eksik ad kanıtı var; bu, ismin gerçekten hiç okunmadığına tek başına kanıt değildir. ASR ile ses modelinin telaffuzu ayrılmadan eşik düşürülmedi; inceleme kayıtları korunuyor. İnsan dinlemesi yapılmış veya "insan gibi" kazanan seçilmiş sayılmaz.

Yerel dinleme sayfası: `D:\Whisper Local\tmp\assistant618\tmp\dub-real-quality\listen-final\listen.html`. A/B önceki metindir; C yeni canlı çeviridir. WAV'lar ve doğrulama JSON'ları aynı çalışma dizinindedir. Sesler herkese açık GitHub'a gönderilmedi.

## 2. Ses için çeviri — gerçek DeepSeek standard

Mevcut `tools/translation-deepseek-live.cjs` üzerinden gerçek Python `transcribe.py --translate-only --translate-for-speech` hattı çalıştırıldı. Model `deepseek-ai/DeepSeek-V4.1-Flash-1017`, DeepInfra standart katman. Gerçek anahtar yalnız mevcut broker/relay belleğinde kaldı; backend'e sentetik test anahtarı gitti. İsteklerde flex yoktu.

İlk deneme25/27 tamamlandı. `Link in the description.` → `Bağlantı açıklamada.` doğru çevirisi `negation_added` ile reddediliyordu: geniş `-mAd...` fiil kalıbı isim-fiilin bulunma hali `-mAdA` ile karışıyordu. Negatif geçmiş `-mAdI` ve olumsuz zarf-fiil `-mAdAn` korunarak kalıp daraltıldı. Açıklamada/çalışmada/uygulamada olumlu örnekleri ve açıklamadı/açıklamadan/çalışmadık/uygulamadım karşı örnekleri test edildi. Genel olumsuzluk kapısı kapatılmadı.

Diğer retlerde model açık adı zamire çeviriyor, farklı yazım öneriyor veya tek cue'yu fazladan cümlelere ayırıyordu. Ardışık retlerde `retry_hints` üzerine yazıldığı için önceki ad kaybı uyarısı siliniyordu. Artık sınırlı, uygulamanın yazdığı uyarılar birikir; sağlayıcı metni talimat haline getirilmez. Aynı geri bildirim yalnız JSON kanıtında değil yeniden denemenin talimatında da bulunur. Gereken adlar kaynak çıkarıcısından alıntı veri olarak gönderilir; mitolojik/tarihsel adların telaffuz uğruna altyazıda sessizce yeniden yazılmaması açıklanır. Sınırsız deneme veya doğrulama gevşetmesi eklenmedi.

Ara canlı denemelerde hâlâ24/27 veya25/27 sonuçlar alındı; başarısızlıklar saklandı. Son kaynak adı/talimat düzeltmesinden sonra:

- Eksikleri tamamlama:27/27,0boş/çevrilmemiş/zaman uyumsuz blok; önceki doğru çeviriler korundu,3istek.
- **Sıfırdan bağımsız son koşu:**27/27,0başarısız blok,10istek. `status=complete`, `.partial` değil tam çıktı.

Bu tek sahnenin model kalitesi ve stokastik davranışına ait kanıttır; bütün videolarda sıfır hata garantisi değildir. İlk başarısızlık ve son başarı farklı JSON/günlüklerde tutulur. Aynı retli metni önbelleğe başarı gibi yazma davranışı eklenmedi.

Gerçek `dub-editor-client.editSpeech` ile ayrıca4kaynaklı kısa cümle sınandı:3doğal cümle değiştirilmeden döndü. Ağır isim-fiilli bir cümle düzenlendi ve ayrı anlam kontrolü `equivalent:true` ile geçti. Bu örnekte düzenleme küçük: `Bir kararın alınmasının gerekli olduğu düşünülmektedir.` → `Bir karar alınmasının gerekli olduğu düşünülmektedir.` Sonuç abartılarak büyük üslup başarısı sayılmaz. 200token'lık anlam denetiminin bu standart modelde boş yanıt verdiği hipotezi doğrulanmadı; token ayarı değiştirilmedi.

## 3. Son parça güvenilirliği

`tools/dub-stall-acceptance.py` gerçek GPU üretiminde son `generate` isteğini ve ilk iptal onayını kontrollü olarak taktı. Bu doğal oluşmuş nano-vLLM takılmasının yeniden üretimi değildir.

Yaklaşık79,625s içinde iki motor oturumu kullanılarak kabul tamamlandı: ilk tamamlanan gerçek WAV SHA256 değeri korundu, aynı referansla yeniden başlatıldı,1grup önbellekten/1grup yeni üretildi ve süreç çıkışı0. Mevcut koruma yolu çalıştığı için motor yaşam döngüsü gereksiz yere değiştirilmedi. Normal iptal/kalite yeniden deneme yolları27üretim testiyle ayrıca sınandı.

## 4. Sade ama dürüst sonuç görünümü

Mevcut Doğal dublaj ana akışı ve gelişmiş ayarlar korunur. `speechResult` artık karma sonuçta kaynak metni bulunmayan grupları, başka bir grubun `source_reviewed` durumu yüzünden gizlemez.

Sonuç kartında kısa doğrulama özeti eklendi: üretilemeyen/sessiz kalabilecek gruplar, dinleme isteyen gruplar, tümü metin denetiminden geçen veya hiç/seçili metin denetimi yapılan sonuçlar ayrılır. Üretilmiş dosya, metin denetimi ve insan doğallığı aynı başarı değildir. Yeni ayar/düğme eklenmedi; mevcut Grupları dinle yolu kullanılır. TR/EN, tekil/çoğul ve eski doğrulamasız çıktı durumu korunur.

Impeccable dar iyileştirme akışı ve mevcut tema kullanıldı. Gerçek Windows Electron kabulü TR1440/TR820/EN640, klavye odağı, üretim, hazır/inceleme, varsayılan profil, gelişmiş seçimler ve kullanıcı metin/ses/aralık korumasını sınadı; son koşuda12görüntü üretildi. Geniş başlangıç ve dar sonuç/inceleme görüntüleri gözle kontrol edildi. Kontrollü UI verileri gerçek motor başarısı diye sayılmadı.

## Kontroller / araştırma / sınırlar

77Python testi geçti: negation634(2), translation_feedback804(3), speech_guard802(3), speech_quality813(9), speech_translation(33), dub_generation_quality(27).15Node testi geçti: dub-natural-result, dub-run-info809, dub-editor-client. Toplam92hedefli test; aynı kontrollerin tekrar koşuları sayıya eklenmedi. Syntax ve diff kontrolü geçti. Tam npm test/uzun CI beklenmedi.

Resmî [VoxCPM kaynak deposu](https://github.com/OpenBMB/VoxCPM), [model kartı](https://huggingface.co/openbmb/VoxCPM2/blob/main/README.md) ve [üretim parametreleri](https://voxcpm.readthedocs.io/en/latest/usage_guide.html) incelendi. Referans tonu, prompt devamı ve stil kontrolü ayrımı mevcut kodla karşılaştırıldı. Yeni motor/dependency, rastgele model parametresi veya kullanıcı onayı olmadan kalıcı telaffuz sözlüğü eklenmedi. Harici kod kopyalanmadı.

Gerçek video oynatımı/dudak senkronu, kaynak sesin duygu analizi, farklı referanslar/TV-DPI ve insan dinleme tercihi bu tur doğrulanmadı. start.bat değiştirilmedi veya yeniden başlatılmadı; kişisel uygulama kapatılmadı. Raw yorum/altyazı/ses/profil/istek günlükleri Git'e eklenmedi.
