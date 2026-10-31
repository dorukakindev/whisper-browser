# Güncel kapsam: yalnız önemli ürün sorunları

Kullanıcı, 31 Ekim 2026’da önceki 200 aday listesindeki bazı işleri keyfi bulduğunu, yalnız önemli işlerin yapılmasını ve 100 maddelik bir sayının bile gereksiz olabileceğini belirtti. Sayı hedefi kaldırıldı. Eski liste tarihsel aday listesidir; bütün satırların uygulanması kabul koşulu değildir.

## Kabul ölçütleri

1. **Doğru asistan işlemi:** Güncel kaynak/iz/sohbetle çalışır; eski onay ve geciken sonuç başka kaynağa veya daha yeni insan ayarına uygulanmaz. Ses referansı ve çeviri sağlayıcısı gibi kalan değiştirme aileleri de bu ilkeyle kontrol edilir. Yanlış/eski karta güvenli, anlaşılır yeni inceleme yolu vardır.
2. **Çeviri bütünlüğü:** Eksik/başarısız satırlar tamamlanmış diye gösterilmez. Anlamı değiştiren eksiltme, olumsuzluk/sayı kaybı veya başarısız son düzenleme özgün tam metni kaybettirmez. Gerçek ses için çeviri yolu ve normal altyazı yolu uygun hedefli örneklerle kontrol edilir.
3. **Tam ve kullanılabilir dublaj:** Son parça takılması/timeout/isteğe bağlı doğrulama hatası tamamlanmış kullanılabilir parçaları yok etmez. Son çıktı kaynak/grup kapsamını ve doğru referansı korur. İşe özel örnek seçimi sonraki işe sızmaz.
4. **Senkron ve özgün ses:** Konuşmayı koruma modu yanlışlıkla konuşmayı kesmez; yeni sesin kaldırılması, sayfa kaynağı değişimi ve seek/pause/speed durumları özgün sesi bozuk/sessiz bırakmaz. Gerçek kullanım sınırları açıkça raporlanır.
5. **İş yaşamı:** Ana sayfa/browser geçişinde başlayan üretim uygun şekilde sürer; iptal ve yeniden deneme doğru tek işi hedefler. Kabul edildi, çalışıyor, durduruluyor ve tamamlandı ayrılır; eksik sonuç tam diye sunulmaz.
6. **Kullanım engelleri:** Gerçek ekranlarda mesaj, menü veya düğme çakışması, ulaşılamayan kontrol ve taşma varsa giderilir. Yeni tema, animasyon veya cila sırf listeyi doldurmak için yapılmaz.

## Çalışma biçimi

Hazır paket02’deki ayar/örnek üretim onarımları doğrulanıp ana sürüme teslim edilir. Sonra bu kabul ölçütleri gerçek kod ve hedefli akışlarla denetlenir; zaten doğru davranış için gereksiz değişiklik yapılmaz. Bulunan önemli hatalar düzeltilir; yeni özellik fikirleri zorunlu işe dönüştürülmez. Kütüphane/Letterboxd/zevk profili yeni genişletmeleri bekler; mevcut teslim edilen yararlı onarımlar korunur.

Ajanlar GPT-6.1 Sol / medium. API testleri gerektiğinde DeepInfra DeepSeek-V4.1 standard, çok büyük toplu işler Flex. Kişisel anahtarlar/profil dosyaları raporlanmaz; kişisel uygulama kapatılmaz. Fixture, native arayüz, gerçek model, GPU ve insan dinleme kanıtları ayrıdır. CI arka planda devam eder; sonucu beklemek teslimin varsayılan şartı değildir.

## Kritik kaynak/ses paketi — 31 Ekim

Ayar/örnek paketi PR735 ile teslim edildi. Sonraki kritik onarımlar: eski sağlayıcı/referans onayı, bekleyen mute sonucu ve native mute sahipliği, isteğe bağlı süre düzenlemesinden önce tam sesin korunması. Ayrıntı ve kanıt: `docs/audits/critical-source-audio-2026-10-31/README.md`.

Native cross-origin test yalnız sentetik yerel medya üzerinde gerçek Windows uygulaması/IPC/decoder doğrulamasıdır. Sağlayıcı/model kalitesi, gerçek YouTube ve GPU doğal ses kanıtı değildir. Kalan çeviri bütünlüğü, iş yaşamı ve gerçek UI engelleri topluca tamamlandı sayılmadı.
