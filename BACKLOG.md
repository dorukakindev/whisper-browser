# Bekleyen işler

Son durum kontrolü: **2026-11-05**. Sahne entegrasyon tabanı `9ca44189a367176b90edb0aef2c70ef4065dd5b3`, tamamlanan ürün `683b7bc6fc8caaa91ac26677d5623cbce2692480`. Son merge/ana kopya kimliği teslimde doğrulanır.

Tamamlanmış teslimler açık iş değildir. Eski raporların veya doğrulanmamış kullanım sınırlarının varlığı tek başına ürün hatası sayılmaz. Ayrıntılı geçmiş [devir indeksinde](DEVIR-NOTU.md) korunur.

## Uygulama sırası

1. **D001 — Rapor indeksini tamamla:** doğrulanmış tek somut belge eksiği. Kişisel indeks farkını koruyarak 12 eksik bağlantıyı birleştir; yalnız bağlantı/diff kontrolü yap.
2. **P004 — Browser canlı kullanımındaki kalan kontroller:** aşağıdaki sırayla kısa ve izin penceresiz ilerle; yalnız yeniden üretilen hataya kod düzeltmesi yap. Mevcut podcast canlı testini tekrar etme.
3. **P003 — Kütüphane doğrulaması:** büyük kişisel arşivle ilgili somut ihtiyaç veya arıza geldiğinde ilgili işlemi incele. Şimdilik aktif geliştirme işi değil.
4. **P001 — Performans:** ertelendi. Ağır benchmark/CPU/matris veya eski dalı otomatik birleştirme yok.

Bu sıra bir tam denetim veya bütün eski raporları yeniden açma planı değildir. Her seferinde tek kapsam kapatılır; yeni somut arıza önceliği değiştirebilir.

## D001 — Rapor indeksindeki 12 eksik bağlantı

- **Durum:** planlandı; somut belge eksiği, ürün hatası değil.
- **Kanıt:** güncel master'ın takipli rapor dosyaları ile takipli `docs/raporlar/INDEX.md` karşılaştırıldı. R835, R837, R838, R839, R840, R841, R842, R845, R847, R849, R851 ve R852 indekste yok. Eski raporların bulgularının hâlâ açık olduğu iddia edilmez.
- **Dal/PR:** henüz uygulama dalı yok; bu kayıt `codex/backlog-current-main-20261105` belge dalında yenilendi.
- **Koruma:** ana kopyadaki kişisel `docs/raporlar/INDEX.md` farkı üzerine yazılmayacak; untracked raporlar otomatik yayımlanmayacak.
- **Kabul / sonraki adım:** kişisel ve takipli indeks farklarını karşılaştır, yalnız mevcut takipli raporların eksik bağlantılarını ekle. Belge bağlantı/diff kontrolü yeterli; ürün suite'i yok.

## P004 — Browser panelinin kalan canlı doğrulaması

- **Durum:** özellik ve menü düzeltmeleri main'de; aşağıdakiler doğrulanmamış sınırlar, teyitli yeni bug değil.
- **Main kanıtı:** PR808 paneli, sonraki web çift dilli/podcast geçişleri ve menü düzeltmeleri birleşti. [Web çift dilli kabulü](docs/devir/2026-11-05-0155.md), [podcast kaynak/yeniden açma](docs/devir/2026-11-05-0221.md), [yan panel](docs/devir/2026-11-05-0225.md), [menü turu](docs/devir/2026-11-05-0251.md).
- **Kalan kısa kontrol sırası:** (1) izin penceresi gerektirmeyen gerçek sağlayıcı altyazısı indirme/açma ve yüklü gerçek izde sıfırdan farklı senkron kayması, (2) izole site profilini yeniden açma, (3) erişilebilir bir sayfada fullscreen/Shadow DOM altyazı yalıtımı. Uzun iş iptali ancak gerçek takılma veya ihtiyaç olduğunda ilgili iş üzerinde incelenir.
- **Kabul:** seçilen akış aynı sekme/kaynakta doğru çalışmalı; sorun varsa yalnız ilgili sahipte düzeltme ve kısa regresyon. Test verisi ile canlı sağlayıcı sonucu ayrı belirtilir.
- **Dal/PR / sonraki adım:** yeni düzeltme dalı yok. İlk adım, dosya erişim penceresi açmadan kullanılabilen sağlayıcı/iz yolunu seçmek; bu koşul sağlanmıyorsa o adımı zorlamadan kayda geçirmek. Computer Use, etkileşim trace kampanyası ve geniş kabul turu yok.

## P003 — Film kütüphanesinin kullanım sınırları

- **Durum:** ihtiyaç halinde; aktif ürün düzeltmesi yok. Onaylı film tasarımı PR808 ile main'de, tekrar merge veya tasarım onayı beklemiyor.
- **Kanıt:** [PR808 teslimi](docs/devir/2026-11-04-0936.md), main geçmişinde PR808 merge'i `459bf2e0bbbf0bfb19566ed16080806bb6e76126`.
- **Doğrulanmamış:** büyük kişisel kütüphanenin tüm yönetim yolları ve canlı TMDB'nin bütün koşulları. Kişisel veriler toplu test malzemesi yapılmaz.
- **Dal/PR / sonraki adım:** yeni dal yok; kullanıcı gerçek kullanımda bir sorun bildirdiğinde yalnız o işlem kısa yeniden üretilir. Genel katalog testi ve tasarım yenilemesi başlatılmaz. Performans ayrı P001'dir.

## P001 — Sinematik hareket performansı

- **Durum:** ertelendi, bloklayıcı değil. Mevcut onaylı Home/Keşfet/film tasarımları main'de; eski performans denemesi otomatik alınmayacak.
- **Dal/PR:** `codex/cinema-performance-round5` / [draft PR805](https://github.com/dorukakindev/whisper-browser/pull/805), 2026-11-05 kontrolünde hâlâ açık ve birleşmemiş. Bu dalın teslimi `5aa8e5637786093f3864ca31ec88b49b856b5630`; güncel master'dan eski.
- **Kanıt:** [eski performans kaydı](https://github.com/dorukakindev/whisper-browser/blob/codex/cinema-performance-round5/docs/implementation/cinematic-performance-round5-2026-11-03/PERFORMANCE.md). O revizyonda 1440 detay/scroll maksimumları 69,5/55,5 ms, 1920 detay 20,8 ms idi; güncel main ölçümü değildir.
- **Sonraki adım:** yalnız görünür bir takılma bildirildiğinde güncel main'de kısa yeniden üretim ve hedefli düzeltme. Yeni CPU/frame hedefi, uzun benchmark veya boyut matrisi başlatılmaz. Eski hedefler karşılandı diye gösterilmez.

## Main'de tamamlananlar — tekrar yapılmayacak

| Kapsam | Main teslimi / kanıt |
|---|---|
| P016: Sahne v2 podcast/çift dilli entegrasyonu ve uyumlu medya cilası | [Sahne teslimi](docs/devir/2026-11-05-0600.md), ürün `683b7bc6`. 13 kısa kontrol; Windows HTML5 yerel/web geçişleri, seek ve klasik dönüş. Main/yerel SHA son teslimde doğrulanır. |
| P005–P007: V3, native tasarım, katalog, podcast temeli, browser menüsü | PR809/810 ve [17:30 teslimi](docs/devir/2026-11-04-1730.md); native kabul verilmiş, eski onay/merge bekleme kayıtları geçersiz. |
| G1–G5: podcast planı, güncel denetim düzeltmeleri, uyumlu eski paketler, kısa bug turu | PR812–815 ve [sıralı son teslim](docs/devir/2026-11-04-1833.md). |
| P008–P009: canlı podcast örneği, asistan ve zevk profili | [Canlı kabul](docs/devir/2026-11-04-2302.md), [asistan/profil](docs/devir/2026-11-04-2341.md). |
| P010–P013: web çift dilli/podcast, yeniden açma, yan panel ve menüler | Yukarıdaki P004 kanıtları; main'de. |
| P014–P015: görünür girişler, Spotify linki → RSS → gerçek Whisper/çeviri | PR823/824, [doğrudan girişler](docs/devir/2026-11-05-0317.md), [son canlı zincir](docs/devir/2026-11-05-0323.md). NPR'de 12 saniye CUDA small + DeepInfra 4+4 cue; görünüm korunarak yeniden açma geçti. |

Spotify/RSS farklı ses sürümleri otomatik aynı zaman ekseni sayılmaz; eşitliği kanıtlanmayan yeniden açılışta kaydın salt okunur gösterilmesi bilinçli güvenlik sınırıdır. Tüm Spotify bölümlerine erişim/indirme garantisi yoktur.

Genel ses/model kalitesi, bütün siteler, uzun işlerin tüm hata koşulları, kişisel start.bat oturumu, fiziksel HDR/çok kanallı çıkış ve Windows UNC/reparse/safeStorage'ın bütün koşulları tam doğrulanmış değildir. Bunlar somut arıza olmadan yeni geliştirme görevi oluşturmaz. DRM aşma kapsam dışıdır.

Sahne için mpv canlı kabulü dosya erişim onayı gerektirdiğinden test korumasında durduruldu; pencere açılmadı ve tekrar denenmedi. Windows browser ana PNG yakalamasındaki `UnknownVizError` görsel doğrulama sınırıdır; görüntü alma atlanarak kalan gerçek WebContents/video/seek/dar görünüm/geri dönüş kontrolleri geçti. Yeni Whisper/çeviri/Spotify canlı zinciri bu UI turunda yeniden çalıştırılmadı; önceki kanıt geçerlilik sınırları korunur. Bu sınırlar yeni teyitli ürün bug'ı veya geniş test görevi değildir.

## Çalışma sınırları

Kısa hedefli kontrol; Computer Use ve dosya erişim penceresi yok. GitHub Actions yok; commit/PR/merge başlıklarında `[skip ci]`. Kişisel manifest/indeks/start.sh farkları ile korunan `src/media-source-envelope.js` ve `tests/media-source-envelope.test.js` dosyalarına dokunma. Her yeni işte güncel dal/HEAD ve ilgili son devir kontrol edilir.
