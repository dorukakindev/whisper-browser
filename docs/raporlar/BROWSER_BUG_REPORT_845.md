# Doğrulanıp düzeltilen RSS/Keşfet/asistan hataları

Bu kayıt yeni toplu denetim değildir; aktif ürün tesliminde doğrudan doğrulanan onarımlardır. Tarihsel raporları yeniden açmaz.

| Alan | Önce | Sonra / kanıt |
|---|---|---|
| RSS sıra | Kaynak sırası en yeni sanılıyordu | Tarih + kararlı fallback; feed-store |
| RSS yenileme | İlk sekiz abonelik sonrası kalıyordu | Sınırlı partileri tamamlama; feed-service/UI |
| RSS liste | İlk 100 sonrası erişim yoktu | Daha fazla yükle ve toplam; feed-ui/native |
| RSS kaydetme | Kaydedilen filtresinde kaldırınca okuyucu bayat kalıyordu | Güncel girdi yeniden okunur; feed-ui |
| RSS seçim | Geç gelen eski yazı yeni seçimi ezebiliyordu | readerEpoch; feed-ui |
| RSS dönüş | Bekleyen restore yeni seçimi ezebiliyordu | Intent iptali; feed-ui |
| RSS bağlantı | İlk browser açılışında adres yeni sekmeyle eziliyordu | showBrowserWorkspace beklenir; native browser dönüş |
| RSS tıklama | Yavaş A isteği B sonrasında A'ya gidiyordu | İlk await öncesi intent; feed-navigation-race negatif kontrol |
| Keşfet kimlik | Sağlayıcı başka IMDb ayrıntısını kabul edebiliyordu | Hedef IMDb kontrolü; media-discovery-service |
| Keşfet filtre | Yıl modunda görünmeyen tür eski filtresi kalıyordu | Yıl sözleşmesi eşleşir; service |
| Keşfet kişisel | Türsüz IMDb ve bağımsız beğenmeme dışlaması yanlış olabiliyordu | Türlü kimlik + açık dislike; service |
| Keşfet puan | Kayıtlı yüksek puan sırası uygulanmıyordu | Puan azalan, puansızlar sona; service |
| Keşfet retry | Append başarısızlığında sıfıra dönüyordu | Aynı cursor; result-state/native |
| Asistan kaynak | Aynı RSS kimliğinde değişen metin revizyonu ayırt edilmiyordu | Bağlam parmak izi; assistant feed tests |
| Asistan alıntı | Toggle olayı gelmeden rerender kapalıyı açıyordu | Açık/kapalı eşzamanlı yakalanır; conversation |
| Asistan odak | Tekrar eden alıntı ID'si önceki mesaja odaklanıyordu | Mesaj/alıntı kontrol anahtarı; conversation |

RSS eylemlerinde eski kaynak, belirsiz hedef, değişmiş kopyalar/durum ve tekrar kullanılan onay reddedilir. Ayrıntılar ve 150 test/Windows görselleri: [teslim](../implementation/feeds-discovery-assistant-2026-11-02/README.md).
