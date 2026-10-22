# 518 — Ses ve kalıcılık denetimi: yedi yeni doğrulanmış hata

2026-10-22. Taban master: `1371bc9316cc134a40084b416f49073d34103e49`. Önceki PR473 düzeltmeleri dalda korunmuştur. Kullanıcı hedefi **10 yeni önemli hata** idi; bu tur **7 bağımsız yeni hata** doğrulanıp düzeltildi. Önceki üç hata yeni keşif sayılmaz. Toplam yayına alınacak onarım sayısı 10'dur; yeni hata hedefinin kalan üçü için başarı iddiası yok.

| Kimlik | Etki / kök neden | Düzeltme ve kanıt |
|---|---|---|
| 518-01 | Durdurma/kaldırma sonrası bekleyen `play()` çözümlenince ses yeniden başlayabiliyor. Promise devamı yalnız eski oturum hâlâ aktifken pause uyguluyordu. | Oturum yoksa geç voice/background sonucu tekrar pause edilir. Yeni oturumun sesine dokunmama koruması sürer. report518 iki kanalı kontrollü Promise ile sınar; eski kodda voice yeniden başladı. |
| 518-02 | Elle ses eklerken seçili ses düzeyi doğrudan audio.volume'a yazılıyor, sonraki tick varsayılan mix.voice=1 ile üstüne yazıyordu. | Elle ekleme görünür voice/background/music/ambience/duck ayarlarını controller mix'ine aktarır. player-dub-ui içinde 0.23 düzeyinin timeupdate sonrasında kaldığı doğrulandı. |
| 518-03 | Asset kaydı `forSpeech` ve `speechProtocol` alanlarını beyaz listede düşürüyor; yüklemede ses çevirisi kimliği kayboluyordu. | Asset yazma/okuma, main persist/restore taşıması alanları korur. Eski metadata'sız kayıtlar ses çevirisi diye tahmin edilmez. report518 put/get eski kodda undefined, yeni kodda true/v6. |
| 518-04 | Sağlayıcı URL'si kullanıcı/parola ve API anahtarlı query ile ham asset/arşiv JSON'una yazılabiliyordu. | Mevcut safePlaceUrl temizleyicisi disk metadatasına uygulanır; watch index'e temiz değer iletilir. Sentetik user/password/api_key örneği diskten tekrar okunarak temizlendiği doğrulandı. Eski kodda ham URL kalıyordu. |
| 518-05 | Bozuk/gelecek sürüm arşiv indeksi boş indeks sayılıyor; sonraki kayıt önceki indeksin üstüne yazıp arşiv bağlantılarını kaybettiriyordu. | Yalnız ENOENT boş arşivdir. Bozuk/uyumsuz/okunamayan indeks yazımdan önce işlemi reddeder ve dosyayı korur. report518 bozuk JSON ve version900 ile doğrular; eski kod istisnasız üzerine yazıyordu. |
| 518-06 | Dublaj worker'ı exit0 ve mevcut dosya ile başarılı sayılıyordu; boş/kesilmiş/medya olmayan WAV hazır sunulabiliyordu. | Bounded RIFF/RF64-WAVE, fmt kanalı/örnek hızı/block align ve dosyaya sığan dolu data kontrolü. Hem üretim tamamlanması hem latest çıktı bu kontrolden geçer. report518 ve dub-service sıfır baytlı çıkışın error olup temizlendiğini doğrular. |
| 518-07 | Video yavaşlatma modunda `.sync.json` içeriği null olunca nullable validator geçiyor; zaman haritasız uzun ses senkron diye sunuluyordu. | Bu modda harita zorunlu. Sağlam WAV kurtarılabilir çıktı olarak korunur, otomatik bağlanmaz. dub-service null sidecar ile error/recoverablePath doğrular. |

## Koşulan kontroller

Windows Node: `report518-regressions` 5 test; ayrıca `player-dub-ui` ve `dub-service` içine 518-02/06/07 kontrolleri eklendi. `report517-regressions` 3; `browser-note-store` 11; `watch-index-assets` 20; `browser-translation-archive`; `browser-dub-audio`; `dub-workspace` 4; `dub-generator-ui` geçti. Değişen ana süreç/renderer JS sözdizimi ve diff kontrolü geçti. Son belge kontrolü devir notunda kaydedilir.

Eski master'ın üç modülü Module._compile ile izole yüklenip yeni report518 testleri tekrar çalıştırıldı: 518-01/03/04/05 doğru nedenlerle kırmızı; yeni WAV yardımcısının testi aynı koşumda yeşildi (bu satır eski service'in başarı yolunu doğrulamaz). İlk baseline komutu sandbox'ın nested git spawn EPERM engeline takıldı; ardından salt okunur eski ana kopya kaynaklarıyla kontrol tamamlandı. Hiçbir eski ürün dosyası değişmedi.

## Sınırlar

UI yerleşimi değişmedi; arayüz davranışları jsdom'da doğrulandı. Gerçek Electron pencere/start.bat, GPU, DRM, YouTube, gerçek ses cihazı ve canlı model sınanmadı. WAV kontrolü tam codec decode/dinleme veya anlamsal konuşma kalitesi kanıtı değildir. Eski assetlerde bulunmayan speech metadata geri üretilemez; eski gizli URL içeren kişisel dosyalar topluca taranıp Git'e alınmadı veya silinmedi. İndeks kurtarma otomasyonu eklenmedi; bozuk indeks güvenle reddedilir. Yeni bağımlılık yok. CI açık kalır, sonuç beklenmez.
