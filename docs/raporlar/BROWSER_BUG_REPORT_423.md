# Rapor423 — Konuşma yetişmeme ve arka plan koruma

Kök neden: sabit video penceresine sığmayan Türkçe ses,1.25× tempo ve boşluk payından sonra kesiliyordu. Kullanıcı videonun yavaşlamasını seçti. Yeni video modu konuşmayı doğal hızda ve tam tutar, genişletilmiş ses zamanına video haritası hazırlar; tarayıcı denetleyicisi hızı gerektiğinde düşürüp sonra geri yükler. Eski hız/mute tercihi korunur; yenilenmeyen override3sn sonra bırakılır. Sabit/kırp modu ayrıca vardır.

Kullanıcı ayrıca özgün konuşma yerine kendi sesi gelirken müzik/ortam kalsın istedi. Audio Separator'ın mevcut kilitli opsiyonel ortamı kuruldu, instrumental katman ayrı oynatıcı Audio'sunda özgün video saatiyle eşlendi. Arka plan CPU'da yerel; Vox CUDA ortamı değişmedi. Ayrıştırma kusursuz değildir; konuşma izi/efekt kaybı olabilir. Hata olursa yalnız dublaj uyarıyla üretilir, iptal tüm hazırlık/üretimi durdurur. Tek dosyalık mix/video export eklenmedi.

Kanıt:12Python hedefli test; Node servis/denetleyici/harita/32medya/9paket kontrolleri; gerçek kısa yerel ayırma ve üretim akışında1sn video→3.19658sn tam ses/0kırpma + arka plan. Chrome1400/720 fixture görsel kontrol. Canlı YouTube ve yeni start.bat uçtan uca denenmedi; tam genel Windows CI yeşil iddiası yok. Eski kesilmiş WAV yeniden hazırlanmalıdır; saklı ham parçalar uygun ayarda yeniden kullanılabilir.

Kaynaklar: https://github.com/nomadkaraoke/python-audio-separator , https://github.com/facebookresearch/demucs .
