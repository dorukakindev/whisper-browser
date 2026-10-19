# Rapor 418 — Sesi kullan ve metin/TXT stüdyosu erişimi

2026-10-15. Kullanıcı üretilen sesi yeniden dosyadan seçmeden açık YouTube videosuna bağlamak ve bağımsız metin/TXT seslendirme arayüzü istedi.

Önceki otomatik bağlama yalnız üretim sırasında yakalanan video bağlamına uygulanıyordu. Sonradan elle yeniden bağlama düğmesi ve uygulama yeniden açılınca çıktı erişimi yoktu. Sesi kullan eklendi: kullanıcı tıkladığında o anki video bağlamı alınır, mevcut WAV doğrudan bağlanır. Sekme/video değişme yarışında mevcut controller doğrulamaları sürer. Video olmayan browser sekmesi kabul edilmez. Otomatik aynı-video bağlama korunur.

Son başarılı çıktıyı dub-logs içinden bulma IPC'si eklendi; yalnız id formatı, dub-output köküyle eşleşen kayıt ve mevcut dosya kabul edilir. Medya erişimi main'de verilir; renderer rastgele yerel dosya okuyamaz. Ses adı SRT seçiminden ayrı gösterilir.

Bağımsız arayüz zaten Desktop/Ses/VoxCPM2/arayuz.bat ile açılan Sesli Kitap Stüdyosu idi. Metin yapıştırma/TXT seçimi, kayıtlı referans, nano-vLLM ve Dinle ve oku mevcut. Yeni Metin/TXT stüdyosunu aç düğmesi bilinen motor klasörünün pythonw/arayuz.py dosyasını açar; rastgele renderer komutu çalıştırmaz. CUDA torch DLL önceliği ve temizlenmiş ortam kullanılır. Bu düğmeyle açılan stüdyo açıkken başka GPU işi engellenir; stüdyo kapatılınca kilit kalkar. Kendi arayuz_ayarlar.json tercihlerini kullanır; Whisper SRT profilleriyle karıştırılmadı. GUI kaynak/ayarları değiştirilmedi.

Node servis testleri çıktı bulma, launch argümanı ve stüdyo kilidini doğruladı. Locale/preload/innerHTML/audio-controller ve sözdizimi/diff geçti. Mevcut metin GUI testleri16/16 geçti; Tk kapanış ThemeChanged ve bir resource uyarısı verdi, test başarısızlığı yok. Windows Chrome gerçek renderer/CSS, kontrollü API1400/720px manuel ses bağlama ve stüdyo düğmesi çağrısı0bulgu. Yeni gerçek YouTube sesi/GUI üzerinden GPU ses üretimi ve start.bat E2E koşulmadı. Tam paket çalıştırılmadı; GitHub kimlik doğrulaması/CI önceki engelleri ayrı sınır.
