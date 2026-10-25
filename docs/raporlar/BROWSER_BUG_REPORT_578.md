# Rapor578 — Gerçek GPU dublajı, son dosya bütünlüğü ve doğru aşama ölçümü

25 Ekim2026 17:09. Dal `codex/book-reliability549`, PR487. Başlangıç `9df700b4ada0250f499cfdbc0a90e2c76f0d23cb`; ürün bitiş `b9529dc0451fdfac5734d4e6eddff55ddebf53b1`.

## Gerçek kabul

Önceki turdaki kişisel GPU eğitimi bu turda bitmişti: RTX4070SUPER12282MiB,11744MiB boş/0saf compute işi. Mevcut motor venv/kurulu openbmb VoxCPM2 + nano-vLLM, mevcut izinli ses referansı ve birebir döküm kullanıldı; kişisel uygulama kapatılmadı. Ücretli API/model indirmesi yok. Referans19,39sn; enerji/sessizlik/kırpılma kontrolünde uyarı yok. Kişisel ses/döküm/ham log Git'e konmadı.

Kontrollü iki Türkçe grup: on iki kişi, yarış **değil**, kimseyi geride bırakmak **istemiyoruz**, soru ve gelecek zaman cümleleri.15adım/CFG1,65/temperature0,8/seed42/iki paralel grup/akıcı280karakter18sn/video zamanlaması/ayrıntılı CPU ASR.

Gerçek taze cache'te sonuç: **84,125sn uçtan uca**, **30sn/48kHz/1.440.000örnek WAV**. Model yükleme27,406sn, referans5,922sn. Sentez36,593sn ve doğrulama24,078sn **biriken işlem süreleri**; paralel/örtüşen işler nedeniyle duvar saatine toplanmaz. Üretim aşaması duvar42,157sn. İki istek/0tekrar/0cachehit. Her iki grup ASR token benzerliği1,0; eksik/eklenen sözcük, sayı, olumsuzluk, tekrar işaretlenmedi.0hızlandırma/0kırpılma, zaman haritası0–30sn.

Birleştirme ve loudnorm **sonrası son WAV** ayrıca gerçek yerel CPU ASR ile çözüldü: son kelime `paylaşacağız` dahil beklenen metin tokenları1,0 eşleşti. Tüm örnekler sonlu, peak0,792511, dijital kırpılma oranı0. FFmpeg tam decode exit0. Bu nesnel kısa örnek kanıtıdır; ASR aynı hata ailesine sahip olabilir. İnsan kulağıyla öznel ton/duygu değerlendirmesi yapılmış değildir; tüm videolarda kalite veya son-parça timeout sorununun tamamen bittiği iddia edilmez.

## Doğrulanan ölçüm hatası ve düzeltme

`altyazi_oku.py` dosya yazma saatini normalizasyondan önce başlatıp tüm sidecar'lar bittikten sonra kapatıyordu. Bu yüzden son `.performance.json` içinde loudnorm ayrı görünmüyor, süre `file_write_seconds` içine karışıyordu. WAV yazımı ve yan dosya yazımı ayrı toplanır; loudnorm `measured(args,'normalization')` ile hata/fallback dahil ölçülür.

Aynı gerçek üretilmiş iki parçayla GPU üretimini açıkça yasaklayan cache replay:0yeni grup/2cachehit; normalizasyon0,765sn, yazım0,016sn, backendduvar0,797sn. Önceki WAV SHA değişmedi, yeniden birleştirilmiş WAV'ın tüm ses örnekleri öncekiyle **birebir eşit**. Bu üretim hızlandırması değil, doğru süre ayrımıdır.

`accept_dub.py` artık son yerleştirilmiş/normalleştirilmiş WAV'ı da kontrol eder. Önceki araç yalnız üretim öncesi grup kontrollerine bakıyordu; bu bir ürün ses kaybı teyidi değil, kabul kapsamı eksikliğiydi. Son WAV'da eksik sözcük/olumsuzluk, sessizlik, geçersiz örnek, kırpılma veya doğrulayıcı yokluğu kabulü geçirmez. Yeni gerçek fonksiyon gerçek son WAV üzerinde6,218sn'de tekrar geçti. README kullanım/süre ayrımı güncellendi.

## Hedef denetimi ve sınırlar

| Hedef | Kanıt |
|---|---|
| P01 kaynak bölüm ↔ üretim | Rapor568, gerçek Windows EPUB/PDF kimlikli gidiş-dönüş |
| P02 kitap yer imi | Rapor569, ses/metin sürümü ve gerçek grup başlangıcına dönüş |
| P03 hazırlama önizlemesi | Rapor570, seçimsiz öneri/opt-in/geri alma/kaynak SHA korunması |
| P04 ses karşılaştırması | Rapor571, gerçek kontrollü WAV seçimi/eskimetin engeli |
| P05 güncel üretim planı | Rapor572, gerçek model-yüklemeyen Python planı ve bayat snapshot reddi |
| P06 EN/TR iş durumları | Rapor573, hata/timeout/iptal ayrımı ve locale metin korunması |
| P07 dar ekran | Rapor574,800px/%125Electronzoom,48hitölçümü/gerçek görüntü; OS DPI değil |
| P08 kaynak maliyeti | Rapor575,100bölüm gerçek FFmpeg export/decode ve12reader döngüsü |
| P09 kitap asistanı | Rapor576, tam bölüm/pasaj/SHA/sourceguard/5kontrollü sağlayıcı isteği; canlımodel değil |
| P10 gerçek kısa dublaj | Bu rapor, gerçekGPU/ses/ASR/tamdecode/fazlar; öznel dinleme hâlâ kullanıcı değerlendirmesi |

Bu tur4runtime+3normalizasyon+3kabul unittest ve5Node hedefli kontrol geçti; py_compile/diff temiz. Main sohbet dosyası aktarımı8MiB sınırla `--chat-file` kullanıyor,100k bölüm bu sınır içinde; mevcut prompt kitap kapsamını sınırlar. Yeniden tam suite/UI açılışı yapılmadı; UI kodu değişmedi. Önceki nativeWindows kanıtları tarihsel olarak yukarıdaki raporlarda; kişisel start.bat/DRM/gerçek sağlayıcı çağrısı bu turun testi değil. Bilinen ci-determinism-ratchet zamanlama hatası yeniden doğrulanmadı; CI beklenmedi/kapatılmadı.

Yerel özel kanıtlar ignored `tmp/real-dub-accept-5t9fpumt/`: kabul JSON, WAV/sync/quality/performance, son waveform kontrolleri ve private log. İstenen dinleme örneği buradadır; referans veya özel ham log yayımlanmaz. Son GPU kontrolü11419MiB boş/0compute; sahip olduğumuz motor süreçleri normal kapandı. Yeni bağımlılık/kurulum/ayar şeması yok. Ana kopya ve master değiştirilmedi; PR kullanıcı incelemesine açık.
