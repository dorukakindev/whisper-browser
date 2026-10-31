# Kritik iş devamlılığı ve doğru videoya ses bağlama

Temel: master `f6dab324` / PR736. Sayı kotası yok; yalnız doğrulanan önemli sorunlar düzeltildi.

## Düzeltilenler

- **Eski sesin yeni videoya bağlanması:** A kaynağında üretim başladıktan sonra B’ye geçilip A tamamlandığında manuel Sesi kullan, A çıktısını güncel B’ye bağlayabiliyordu. Alt katman kendisine verilen güncel bağlamı doğru kontrol ediyordu; hatalı olan, eski çıktıya güncel bağlam verilmesiydi. Manuel düğme ve asistan şimdi ortak doğrulama kullanır: üretilen ses `{id, source}` ile native kayıttan doğrulanır, gerçek native çıktı metadatası kullanılır. Bekleme sırasında kaynak/generation, çıktı veya aktif üretim değişirse bağlanmaz; yeni işin durum mesajı ezilmez. Üretim kimliği olmayan, açıkça içe alınmış bağımsız proje hâlâ elle kullanılabilir.
- **Geciken düğme durumu:** Kaynak doğrulaması beklerken yeni üretim başlarsa eski Use isteğinin finally adımı düğmeyi tekrar açmamalıdır. Kullanılabilirlik güncel kontrol durumundan türetilir.
- **Eski Durdur’un yeni işi iptal etmesi:** Native A bitmiş ama renderer henüz son olayı almamışken B başlayabilir. Kimliksiz Durdur native tarafta o anki B’yi hedefliyordu. Dublaj, referans hazırlama, kitap Durdur ve kitap penceresi kapanışı artık ekrandaki tam iş kimliğini gönderir. Native uyumluluk değiştirilmedi; zaten doğru olan text studio çağrısı korundu. Renderer’da kimliksiz cancelDub çağrısı kalmadı.

## Kontroller

- `tests/dub-output-owner-continuity.test.js`: gerçek generator modülüyle browser/player A→B üretim bitişi, doğru kaynağa geri dönüş, bekleyen native kanıtta generation değişimi, yeni üretim ve bağımsız içe aktarılmış proje. Önceki sürümde iki kaynak sahipliği senaryosu gerçek yanlış bağlamayı üretti.
- `tests/renderer-stop-identity-critical.test.js`: dört gerçek renderer callback’i → gerçek preload → gerçek native servis handler’ı; eski A/yeni B ve güncel B için toplam sekiz senaryo. Eski sürüm B’yi yanlış sonlandırdı; onarılmış sürüm eski isteği reddederken güncel işi durduruyor. Kitap kapanışı taslağı bir kere kaydedip pencereyi kaldırıyor.
- `tests/assistant-job-continuity-critical.test.js`: geç iptal hatası, çift Durdur/yeniden deneme ve eski terminal olayın yeni işe sızmaması. Bu mevcut doğru ledger davranışı yeni bug diye sunulmadı.
- 19 ilgili dosya ayrı çalıştırıldı; her çıkış kodu 0, kaynaklar koşu boyunca sabit. Yeni ve değişen sekiz JS dosyası strict UTF-8/sözdizimi kontrolünden geçti. Tam npm test bu dar renderer paketi için tekrar koşulmadı; eşikler gevşetilmedi.
- `tests/electron-home-job-continuity.smoke.js`: son kaynakla gerçek izole Windows Electron/main/preload/scheduler ve yerel video. Birinci istek beklerken Ana sayfa → Ana sayfadayken bir sonuç → ikinci istek beklerken Oturuma dön → tekrar Ana sayfa → tamamlanma → aynı tab/key/media/generation ile dönüş. Üç sağlayıcı çağrısı, sıfır iptal ve sıfır yeniden başlatma, exit 0. Ana sayfada kalırken sonuç odağı çalmadı.
- Home geçişi zaten doğruydu; üretim kodunda gereksiz değişiklik yapılmadı. `home-pending.png` gerçek render olarak incelendi; Oturuma dön düğmesi erişilebilir. Geniş tasarım denetimi veya yeni kozmetik iyileştirme iddiası yok.

## Sınırlar

Native devamlılık browser altyazı scheduler’ını kontrollü sağlayıcı yanıtlarıyla sınar. Tam Whisper alt süreci, canlı DeepInfra/YouTube/DRM/GPU ve doğal ses/çeviri kalitesi doğrulaması değildir. Kısmi/kalite kontrolü eksik dublajın otomatik bağlanmaması, bütün grupları başarısız çıktının hata olması mevcut koddan ve ilgili testlerden ayrıca teyit edildi; yeni hata diye sayılmadı.

Kişisel profil/anahtar kullanılmadı ve açık kişisel uygulama kapatılmadı. CI arka planda sürebilir.
