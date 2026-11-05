# Bekleyen işler

Son durum kontrolü: **2026-11-05**. Son ürün `e174602e05bea8df96bc12ebb3a616e1461f5920` Claude tam v2 kompozisyon entegrasyonudur; browser temelli ortak Podcast/Çift dilli sahipleri korunur. [Güncel teslim](docs/devir/2026-11-05-0904.md). Merge SHA teslimde ve Git geçmişinde doğrulanır.

Tamamlanmış teslimler açık iş değildir. Eski raporların veya doğrulanmamış kullanım sınırlarının varlığı tek başına ürün hatası sayılmaz. Ayrıntılı geçmiş [devir indeksinde](DEVIR-NOTU.md) korunur.

## Uygulama sırası

1. **D001 — Rapor indeksini tamamla:** kişisel indeks farkını koruyarak takipli eksik bağlantıları birleştir; yalnız bağlantı/diff kontrolü.
2. **P018 / P004 — Kaynak erişimi ve kalan canlı sınırlar:** yalnız erişim sağlandığında veya somut ihtiyaçta kısa kontrol; önceki başarılı testleri topluca tekrarlama.
3. **P003 — Kütüphane:** gerçek kullanım ihtiyacında; şu an genel doğrulama kampanyası yok.
4. **P001 — Performans:** ertelendi; benchmark/CPU/matris veya eski dalı otomatik merge etme.


Bu sıra bir tam denetim veya bütün eski raporları yeniden açma planı değildir. Her seferinde tek kapsam kapatılır; yeni somut arıza önceliği değiştirebilir.

## P019 — Tam v2 entegrasyonu tamamlandı

- **Durum:** kullanıcının doğrudan uygulama talimatıyla tam `files (6).zip` v2 kompozisyonları mevcut sahipler üzerinden entegre edildi; ara ZIP ve örnek veriler alınmadı. Ortak aktif Podcast/Çift dilli görünüm ve asistanın mevcut davranışı korunur; bunları yeniden tasarlamak bu teslimin şartı değildir.
- **Dal / kod:** `codex/claude-v2-native-integration-20261105`, ürün `e174602e05bea8df96bc12ebb3a616e1461f5920`. [Devir](docs/devir/2026-11-05-0904.md).
- **Kanıt:** değişen davranışlara kısa Node/DOM regresyonları; LG ikinci monitörde izole Windows sayfaları, canlı Cinemeta detay/listesi, kayıtlı yayıncı RSS'i. Son yerleşim düzeltmeleri monitör kullanılmadan Electron offscreen render ve RSS → mevcut kuyruk → ortak çift dilli görünüm ile doğrulandı. İzin denemesi ve konsol hatası 0.
- **Görsel sınır:** LG son kontrolde sistemden ayrıldı; son cila aynı fiziksel monitörde tekrar sınanmadı. İlk monitöre düşülmedi. Dolu yorum/analiz ve dolu ağın native görseli alınmadı; hedefli DOM ve kalıcılık testleri native estetik kanıtı sayılmaz.
- **Tam sonraki adım:** ürün için yeni toplu test veya yeniden tasarım işi yok. LG erişilebilir olduğunda somut bir görünüm sorunu bildirilirse yalnız ilgili sayfayı kısaca kontrol et. Model/GPU/Spotify canlı ASR bu tasarım tesliminde yeniden sınanmadı; önceki canlı başarı veya sınırlar değişmiş sayılmaz.

## Birleşik Podcast/Çift dilli görünüm — 08:20

- **Tamamlanan ürün:** `152389cdcc1725e0afd989a046e2e49157dee93e`, dal `codex/unified-browser-study-20261105`; [devir](docs/devir/2026-11-05-0820.md). Browser, ana sayfa, RSS/shelf ve yerel girişler tek browser temelli kompozisyonu kullanır; oynatma/işlem sahipleri korunur. Ayrı podcast deck'i kaldırıldı, ileri araç düğümleri korunur; 1.75 hız sonraki bölüme taşınır.
- **Kanıt:** 35 hedefli test + iki browser betiği; izole Windows RSS/yerel/kontrollü browser ve geniş/dar kontrol; son koşularda konsol hatası/izin denemesi 0. Gerçek model/Spotify/mpv bu tur yeniden sınanmadı.
- **Devam:** P019 tasarım geliştirmeleri aynı ortak bileşen üzerinde yapılacak; ayrı kaynak tasarımı yeniden kurulmayacak. Önceki paketin aktif ekran PNG'leri bu son birleşik düzenin birebir referansı sayılmaz. Kalan düz metin çevirisi/klasik okuma sınırları bu sunum işiyle kapanmış sayılmaz.

## P018 — Kullanıcı podcast listesi: dış kaynakta kalan erişimler

- **Durum:** bağlantı/Spotify kod düzeltmesi tamamlandı; kullanıcı listesindeki 60 öneriden 54 RSS ve 1 Spotify kaynağı kişisel kütüphaneye eklendi. Beş öneride kullanılabilir kaynak/kimlik doğrulanamadı; bunlar ürün bug'ı diye sunulmaz.
- **Dal/PR:** `codex/podcast-sources-spotify-20261105`; ürün `12aaf3de93b3e5534df02ea1c770b6e81dace2a6`. [Devir](docs/devir/2026-11-05-0717.md).
- **Kanıt:** 42 Node ve 8 Python hedefli kontrol; Windows mevcut browser'a doğrudan Spotify geçişi ve 55 kaynaklı kütüphane geniş/dar görünümü. Dosya izin denemesi 0. Spotify'da medya oynarken podcast girişi RSS aramasına dönmez; gerçek Spotify sesiyle Canlı Whisper/çeviri bu turda doğrulanmadı.
- **Kalan kabul:** beş yayının doğru, erişilebilir resmî kaynağı; ayrıca içe aktarılan bir yayındaki istenen eski bölüm ilk 200 kaydın dışında. Kişisel ayrıntılar yalnız `artifacts/podcast-import-2026-11-05/EKLEME-NOTU.md` içindedir, Git'e girmez.
- **Tam sonraki adım:** erişilebilir doğru yayıncı/RSS bilgisi elde edilirse yalnız kalan kaynakları tekrar çöz; benzer isimli programı otomatik ikame etme. Spotify canlı ASR ancak gerçekten oynayan ve mevcut browser tarafından gözlenen medyada, açık sistem sesi onayıyla doğrulanır; hesap/DRM sınırını aşma veya tam bölüm indirme başarısı iddia etme. Geniş test kampanyası başlatma.

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

## Aktif podcast düzeltmesi — 07:54

- **Doğrulanmış ürün:** `c99bbe77b4b82345aaaa32be003a0619e99f95c1`, dal `codex/podcast-scene-actions-20261105`; görünür yazıya dök/çevir ve ses kontrolü, sesli çift dilli kompozisyon, native üst alan, RSS asistan yönlendirmesi. [Devir](docs/devir/2026-11-05-0754.md).
- **Kanıt:** 47 kısa test, izole Windows gerçek RSS oynatma sahibi ve geniş/dar görünüm; izin denemesi 0. Gerçek Whisper/çeviri üretimi bu turda yeniden çalıştırılmadı; bu tek başına yeni bug görevi değildir.
- **Kalan:** yeni görsel tasarım P019 kapsamında; mevcut Claude paketi bu üç aktif ekranı içermiyordu. Sonraki somut adım genişletilmiş gerçek ZIP'i Claude'a gönderip yeni teslimi güncel main ile karşılaştırmak. Başka sohbetin yalnız rapor bulguları bu tura otomatik uygulama kapsamı yapılmaz.

## Main'de tamamlananlar — tekrar yapılmayacak

| Kapsam | Main teslimi / kanıt |
|---|---|
| D002: Güncel görsel öncelik | [Belge teslimi](docs/devir/2026-11-05-0724.md). Görünüm en önemli öncelik; genel sakinlik/minimalizm ve düşük hareket kısıtları kaldırıldı. Ürün kodu değişmedi. |
| P018 ürün: RSS zorunluluğu olmadan Spotify girişi ve gerçek kaynak kaydı | [Teslim](docs/devir/2026-11-05-0717.md), ürün `12aaf3de`. Program/bölüm linki, doğrudan mevcut browser, medya gözlendiğinde görünüm geçişi, güvenli büyük RSS/kütüphane sınırları. Kalan dış kaynaklar yukarıda. |
| P017: Gerçek podcast kütüphanesi ve yerel sinema Sahnesi | [Teslim](docs/devir/2026-11-05-0628.md), ürün `b71d6fae`. Abonelik/arama/kuyruk/çift dilli açılış, mevcut video üzerinden bölüm ve sözcük işlemleri; 26 kısa test ve izole Windows geniş/dar kontrolü. |
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
