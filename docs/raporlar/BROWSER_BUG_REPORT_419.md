# Rapor 419 — GitHub ses/dublaj ekosistemi incelemesi

2026-10-15. Kullanıcı farklı GitHub projelerini araştırıp ses sistemini nasıl daha iyi yapabileceğimi istedi. Birincil repo README, dil listesi, parametre belgeleri ve bir dublaj projesinin gerçek zamanlama kodu incelendi. Bu tur araştırmadır; yeni model kurulmadı, ses kalitesi veya hız kıyaslaması yapılmadı.

## Sonuç ve adaylar

| Kaynak | Doğrulanan özellik | Bizim iş için değerlendirme |
| --- | --- | --- |
| [k2-fsa/OmniVoice](https://github.com/k2-fsa/OmniVoice) | Referansla klonlama; duration/speed; Türkçe dil listesinde | En güçlü yeni dublaj motoru adayı: üretim sırasında hedef süre verilebilir. Windows12GB/kişisel ses kalitesi henüz doğrulanmadı. |
| [OmniVoice parametreleri](https://github.com/k2-fsa/OmniVoice/blob/master/docs/generation-parameters.md) | duration öncelikli, silence postprocessing tam süreyi kısaltabilir | Kesmeden süreye uyma deneyi için postprocess_output=False gerekir; çok kısa hedefte anlaşılırlık yine sınanmalı. |
| [kadirb4rut/video-dubbing-translator](https://github.com/kadirb4rut/video-dubbing-translator) | VoxCPM2, vokal/background ayırma, WhisperX, Windows kurulum akışı | TTS motorundan çok ortam/müzik koruma ve çıktı yeniden kurma fikirleri değerli.15sn demo bütün videolarda başarı değildir. |
| [tachikomared/tachidubb](https://github.com/tachikomared/tachidubb) | Yerel hat, süreyi dikkate alan çeviri ve arka plan koruma | Ayrı, kullanıcıya gösterilen dublaj metniyle süreye uygun yeniden ifade yaklaşımı alınabilir. Orijinal SRT otomatik değiştirilmez. |
| [nomadkaraoke/python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator) | Programatik/CLI vokal ve instrumental ayırma, CUDA | Orijinal konuşmayı çıkarıp müzik/efektleri kendi sesin altında tutma için uygun aday. Ayırma kusursuz garanti değil, ek işlem süresi/model gerektirir. |
| [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) | Multilingual V3 listesinde Türkçe; Turbo/Nano İngilizce | Türkçe karşılaştırma için Multilingual V3; Turbo hız rakamları Türkçeye uygulanamaz. Mevcut Chatterbox ortamı yerinde korunmalı. |
| [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) | Ana model ailesinin resmi dil listesinde Türkçe yok | Doğrudan ana Türkçe motor yerine konması bu kanıtla gerekçelendirilemez. Üçüncü taraf Türkçe ince ayarı ayrı incelenmeli. |

OmniVoice [Türkçe dil kaydı](https://github.com/k2-fsa/OmniVoice/blob/master/docs/languages.md) kontrol edildi. Kendi sesimizde daha iyi olduğunu yalnız bu kayıt kanıtlamaz. Repo hız/FlashInfer rakamlarının bir bölümü H100/Çince ölçümleridir;4070SUPERWindows'a hız oranı taşınmadı. Windows ibaresi bulunmaması destek yok demek değildir; burada doğrulanmış kurulum iddiası yok.

## Kaynak kod kontrolü

video-dubbing-translator içindeki [Video_Translator.py](https://github.com/kadirb4rut/video-dubbing-translator/blob/main/Video_Translator.py) change_ClipSpeed tüm süre farkını atempo ile kapatır; gerektiğinde filtre zinciri kurar, video bitişine apad/-t uygular. Bu yöntem konuşmayı korumaya çalışsa da çok büyük hızlandırmayı sınırlandırmaz. Bizim mevcut1.25tavanını bu davranışla körlemesine değiştirmek doğal konuşmayı bozabilir. Yalnız README/demo nedeniyle bizim sistemden üstün denmedi.

## Önerilen sıra

1. Ayrı venv ve aynı kısa Türkçe metin/referansla OmniVoice duration denemesi; normal ve sıkışık pencerede kelime eksilmesi, ses benzerliği, toplam süre ve VRAM ölçümü. Başarı olursa mevcut VoxCPM2 korunarak seçimli ikinci motor.
2. İsteğe bağlı orijinal ambiyans/müzik koruma: yerel videodan stem ayırma→vokal çıkarma→dublajla miks. Browser'da orijinal sesi sadece kısık bırakmakla aynı değildir; orijinal konuşma kalıntısı ve dosya erişimi sınırları değerlendirilir.
3. Süreye göre dublaj metni hazırlama: yalnız kullanıcıya gösterilen ikinci metin üzerinde, anlam/özel ad/sayı korumasıyla. SRT'nin sessizce değiştirilmesi yok.
4. Seçili taşan/kusurlu grubu yeniden üretme ve kısa A/B dinleme ekranı: bütün videoyu tekrar hesaplamadan kaliteyi düzeltme.

Mevcut motor/paket/ayarlar değiştirilmedi; kişisel ses/döküm/altyazı dış servise gönderilmedi. Lisans ve Windows bağımlılıkları uygulamadan önce kaynağın mevcut sürümünde yeniden kontrol edilmelidir. Büyük modeller/araçlar kurulmadı. Bu rapor önerileri uygulandı saymaz.
