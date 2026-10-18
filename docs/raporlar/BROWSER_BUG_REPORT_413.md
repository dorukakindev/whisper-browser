# Rapor 413 — SRT'den ses üretme arayüzü

Tarih: 2026-10-14. Kullanıcı altyazıdan kendi sesiyle dublaj üretimini arayüzden başlatmak istedi.

## Bulgular ve çözüm

Önceki sürümde browser'a hazır ses yüklenebiliyor, ancak SRT üretimi dış Python komutuyla başlatılıyordu. Ana başlığa ve browser araç çubuğuna SRT → Ses diyaloğu eklendi. Yerel SRT seçimi, kayıtlı VoxCPM2 motoru/referans/döküm ayarları, kısa örnek seçeneği, grup ilerlemesi, durdurma ve çıktı açma sağlandı. Tam üretim aynı browser videosunda tamamlanırsa ses oynatmaya bağlanır; sekme/video değişmişse dosya hazır kalır.

Main süreci yerel seçicilerle motor yapılandırmasını tutar, yetkili altyazı dosyasını dış nano-vLLM/VoxCPM2 aracına gönderir. Tek iş ve diğer GPU işlerine karşı kilit uygulanır. Durdurma süreç ağacını sonlandırır; başarısız sonlandırma işi bitmiş saymaz. Alt süreç ortamından sağlayıcı gizli değişkenleri çıkarılır. Vox venv torch DLL yolu önceliklendirilir.

## Kanıt ve sınırlar

Hedefli service, browser-dub-audio, ui-locale, preload-usage ve innerHTML testleri geçti. Main/preload/service/UI sözdizimi ve diff kontrolü geçti. Windows Chrome'da gerçek renderer/CSS, kontrollü API ile 1400/720px, kaynak seçimi, başlangıç, 3/7 ilerleme ve iptal doğrulandı; sayfa hatası/bulgu yok. Görsel modal hizası düzeltildi.

Bu turda arayüz üzerinden gerçek GPU üretimi, canlı YouTube ve start.bat uçtan uca yeniden çalıştırılmadı. Önceki rapor 412'nin gerçek kısa CLI üretimi tarihsel kanıttır. Tam test paketi kullanıcı tercihiyle koşulmadı. GitHub Actions hesap engeli nedeniyle Windows CI doğrulanamadı. Ses kalitesi ve uzun video senkronu için kullanıcı denemesi gerekli.
