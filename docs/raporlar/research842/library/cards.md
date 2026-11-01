# R842 — Medya kütüphanesi kaynak kartları

Yalnız araştırma. Ürün kodu/test/kurulum/branch/commit/push yapılmadı. Baseline `df972383ab5a9b736b832ba64401b206beb6dedc`.

20 kart; 13 NEW, 7 OLD-DEEPENING. NEW, R839 ve R841 yakın kapsamına göre yeni mekanizma adayı demektir; bütün tarihsel raporlarda hiç geçmediği iddiası değildir. Kartlar bağımsız bug veya hazır uygulanmış özellik sayılmaz.

6 esas repo incelendi: 5 yeni kaynak repo (Jellyfin web, Kometa, MediaTracker, Yamtrack ve MediaElch) + 1 eski repo derinleştirmesi (Jellyfin server). `jellyfin/jellyfin` R838'de aynı `5b385862fb97201d954a6ac7c9c745d791a738fa` HEAD ile zaten kayıtlıdır; yeni repo sayılmaz. Buradaki sürüm/parça/bonus/next-up/tarama mekanizmaları R838'deki konu kapsamından ayrı değerlendirilmiştir. Seerr zaten R839 kaynağı olduğundan yeni repo sayılmadı. Immich medya kütüphanesi video/altyazı amacıyla zayıf bağlantılı bulundu ve kartlara alınmadı. `Yamtrack/Yamtrack` 404 verdi; doğrulanan resmî kaynak `FuzzyGrim/Yamtrack`.

Kamu kodu/lisansı sabit HEAD üzerinden okundu; upstream kurulmadı, çalıştırılmadı, canlı hesap/API kullanılmadı. Şema/UX/kabul koşulları bize ait öneridir. R841 tek arama, seri tamamlama, takvim, filmografi, editoryal raf, offline, öneri motoru değerlendirmesi ve export başlıkları yeni sayı diye tekrar edilmedi. Müzik analizi veya otomatik içerik indirme eklenmedi.

## Önce mevcut üründe olanlar

Klasör önizleme/uygulama, guessit ile film/bölüm ayrımı, çok bölüm numaralı dosyanın kaynak olarak tekrar kullanımı, elle TMDB arama ve alan seçmeli eski/yeni önizleme, eksik metadata senkronu, dizi sezonu ekleme, kişisel puan/collection, duplicate görünümü, kayıp dosyayı toplu yeniden bağlama, izleme günlüğü ve rewatchIndex içe aktarımı, resume ve dil/altyazı filtreleri zaten var. Aşağıdaki kartlar bunları yok saymaz.

## Edinim ve ortak ürün kabulü

- [jellyfin/jellyfin-web](https://github.com/jellyfin/jellyfin-web/tree/fb34d1c6f2cbda2b1a8f4e5cf5853b9db9b52c09) — HEAD `fb34d1c6f2cbda2b1a8f4e5cf5853b9db9b52c09`, commit tarihi 2026-11-01T08:20:27Z, archived=False; [lisans kanıtı](https://github.com/jellyfin/jellyfin-web/blob/fb34d1c6f2cbda2b1a8f4e5cf5853b9db9b52c09/LICENSE): GPLv2 metni gözlendi; doğrudan türev dağıtımında notice, kaynak sunumu ve birleşik eser lisans uyumu gerekir. Ayrı servis otomatik muafiyet değildir. Bağımsız veri modeli/algoritma uygulaması veya kullanıcıya ait Jellyfin sunucusuna belgeli API bağlantısı değerlendirilebilir.
- [jellyfin/jellyfin](https://github.com/jellyfin/jellyfin/tree/5b385862fb97201d954a6ac7c9c745d791a738fa) — HEAD `5b385862fb97201d954a6ac7c9c745d791a738fa`, commit tarihi 2026-11-01T05:32:05Z, archived=False; [lisans kanıtı](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/LICENSE): GPLv2 metni gözlendi; doğrudan türev dağıtımında notice, kaynak sunumu ve birleşik eser lisans uyumu gerekir. Ayrı servis otomatik muafiyet değildir. Bağımsız veri modeli/algoritma uygulaması veya kullanıcıya ait Jellyfin sunucusuna belgeli API bağlantısı değerlendirilebilir.
- [Kometa-Team/Kometa](https://github.com/Kometa-Team/Kometa/tree/cc35af0686967b74ead474277d9eb16119bc888c) — HEAD `cc35af0686967b74ead474277d9eb16119bc888c`, commit tarihi 2026-10-31T15:06:59Z, archived=False; [lisans kanıtı](https://github.com/Kometa-Team/Kometa/blob/cc35af0686967b74ead474277d9eb16119bc888c/LICENSE): MIT metni gözlendi; seçilen kod notice ve copyright korunarak port adayıdır. Transitive bağımlılık, sağlayıcı verisi ve görseller ayrıca değerlendirilir.
- [bonukai/MediaTracker](https://github.com/bonukai/MediaTracker/tree/22aedac26329893b6441d74d12be9a48e190ca9c) — HEAD `22aedac26329893b6441d74d12be9a48e190ca9c`, commit tarihi 2025-02-04T03:01:20Z, archived=False; [lisans kanıtı](https://github.com/bonukai/MediaTracker/blob/22aedac26329893b6441d74d12be9a48e190ca9c/LICENSE.md): MIT metni gözlendi; seçilen kod notice ve copyright korunarak port adayıdır. Transitive bağımlılık, sağlayıcı verisi ve görseller ayrıca değerlendirilir.
- [FuzzyGrim/Yamtrack](https://github.com/FuzzyGrim/Yamtrack/tree/387274467e771845cf84fe3ceb1b249ad8405e41) — HEAD `387274467e771845cf84fe3ceb1b249ad8405e41`, commit tarihi 2026-10-31T15:18:01Z, archived=False; [lisans kanıtı](https://github.com/FuzzyGrim/Yamtrack/blob/387274467e771845cf84fe3ceb1b249ad8405e41/LICENSE): AGPLv3 metni gözlendi; doğrudan türev/dağıtım ve ağ sunumu yükümlülükleri değerlendirilmeden kopyalanmaz. Python/Django servisinin bütünü Electron içine taşınmaz; bağımsız model tasarımı uygulanabilir.
- [Komet/MediaElch](https://github.com/Komet/MediaElch/tree/e60309e6b4917db30001a261ff91ae38ad465a0e) — HEAD `e60309e6b4917db30001a261ff91ae38ad465a0e`, commit tarihi 2026-08-28T11:31:18Z, archived=False; [lisans kanıtı](https://github.com/Komet/MediaElch/blob/e60309e6b4917db30001a261ff91ae38ad465a0e/COPYING): COPYING içinde LGPLv3 metni gözlendi. C++/Qt kodu port edilirse LGPL türev/kütüphane ve yeniden bağlama koşulları ayrıca incelenir; Qt/transitive lisanslar bu metinden türetilemez. İlk tercih davranışa göre bağımsız JS/Python uyarlamasıdır.

Kod lisansı TMDB/TVDB/IMDb/Letterboxd verisi, poster, NFO içeriği veya sağlayıcı markalarını otomatik lisanslamaz. Kotalar, atıf, görüntü önbelleği ve yeniden dağıtım koşulları entegrasyondan önce ayrıca doğrulanır. Tam transitive/telif taraması yapılmadı. Her öneri mevcut grafit/amber tema, tek etkin EN/TR dili, dar pencere ve gerçek Windows görüntüsüyle gelecekte kabul edilmelidir. Bu araştırma Windows UI/GPU/DRM kabulü değildir.

## L842-01 — Aynı eserin kesim ve dosya sürümlerini tek kayıtta seçme

**NEW · P1 · Büyük; kalıcı şema ve oynatma kimliği**

**Gerçek kod:** Video, ana sürüm kimliği ve alternatif yerel/bağlı sürümleri ayrı tutuyor; resolver adlandırma ve yıl kontrolleriyle alternatifleri örgütlüyor. Bu bir indirme veya otomatik en iyi kalite seçimi değildir.

- [jellyfin/jellyfin — `MediaBrowser.Controller/Entities/Video.cs:38` / `LocalAlternateVersions`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/MediaBrowser.Controller/Entities/Video.cs#L38)
- [jellyfin/jellyfin — `Emby.Naming/Video/VideoListResolver.cs:156` / `OrganizeAlternateVersions`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/Emby.Naming/Video/VideoListResolver.cs#L156)

**Bizde bugün:** `src/media-catalog-store.js:itemOf/sourceOf`; `src/catalog-discovery.js:scanFolder`; `src/renderer/media-catalog.js:sourceControls`.

**Öneri / fark:** Şimdiki eser ve her bölüm tek source taşır. Aynı yapımın theatrical/extended veya 1080p/4K dosyalarını ayrı filmmiş gibi çoğaltmadan sürüm altına bağlama; farklı kesimlerde konum ve altyazıyı sürüm bazında koruma.

**Kullanıcı deneyimi:** Filmde Oynat yanında Sürüm seç: süre, kesim adı, ses/altyazı ve yerel erişim görünür. Kullanıcı extended sürümüne geçince theatrical zamanına sessizce atlanmaz.

**Edinim:** GPL kaynak algoritmasını birebir port etmek yerine eser/sürüm/kaynak şemasını bağımsız kur; kullanıcı seçimiyle eşleştir. Jellyfin API bağlayıcısı ayrıca mümkün.

**Kabul:** Aynı IMDb kimliğine bağlı iki farklı süre tek eser altında görünür; yanlış otomatik birleştirme geri alınır; her sürüm kendi konumunu korur.

**Windows / tema / veri:** Windows sürücü harfi/uzun yol kimliği korunur. Grafit/amber küçük seçim paneli; Edition/Kesim çift dil. TMDB kimliği kesim eşitliği kanıtı değildir.

## L842-02 — Fragman, sahne arkası ve bonus videolarını esere bağlı raf yapma

**NEW · P2 · Orta; ilişki şeması ve tarama önizlemesi**

**Gerçek kod:** Resolver ana videoları ExtraType dolu dosyalardan ayırır; Video bazı ekstra türlerinde resume desteğini farklı değerlendirir. Bonus dosyası ana filme eşdeğer sayılmaz.

- [jellyfin/jellyfin — `Emby.Naming/Video/VideoListResolver.cs:53` / `nonExtras`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/Emby.Naming/Video/VideoListResolver.cs#L53)
- [jellyfin/jellyfin — `MediaBrowser.Controller/Entities/Video.cs:67` / `ExtraType`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/MediaBrowser.Controller/Entities/Video.cs#L67)

**Bizde bugün:** `backend/catalog_scan.py:scan`; `src/catalog-discovery.js:scanFolder`; `src/media-catalog-store.js:itemOf`.

**Öneri / fark:** Yerel bonusları kullanıcı onaylı tür ve ana eser ilişkisiyle saklama. Mevcut çevrimiçi fragman eylemi ile yerel extras koleksiyonu farklıdır; katalogda aynı filmin beş kopyası oluşmasını azaltır.

**Kullanıcı deneyimi:** Film ayrıntısında Ek videolar bölümü: fragman, röportaj, silinen sahne; kullanıcı yanlış sınıflanan dosyayı ana eserden ayırabilir.

**Edinim:** Sınıflama davranışını bağımsız uygula; GPL resolver kopyalanacaksa uyumlu türev dağıtım kararı gerekir. Dosya adı yalnız aday sinyalidir.

**Kabul:** Film-trailer.mkv ana film tamamlanma durumunu değiştirmez; bir bonusun kaldırılması ana kaydı veya dosyayı silmez.

**Windows / tema / veri:** Dosyalara yazmadan seçili klasörde envanter; Türkçe dosya adları desteklenir. Public bonus videoları dahi otomatik indirilmez. Grafit ayrıntı rafında küçük rozetler.

## L842-03 — CD1/CD2 gibi bölünmüş filmi tek oynatma eseri olarak yönetme

**NEW · P2 · Büyük; zaman ekseni ve oynatıcı geçişi**

**Gerçek kod:** VideoListResolver stack sonucunu Files listesine dönüştürür; Video AdditionalParts tutar. Alternatif sürümlerden farklı olarak parçalar aynı içeriğin sıralı bölümleridir.

- [jellyfin/jellyfin — `Emby.Naming/Video/VideoListResolver.cs:57` / `StackResolver.Resolve`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/Emby.Naming/Video/VideoListResolver.cs#L57)
- [jellyfin/jellyfin — `MediaBrowser.Controller/Entities/Video.cs:37` / `AdditionalParts`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/MediaBrowser.Controller/Entities/Video.cs#L37)

**Bizde bugün:** `backend/catalog_scan.py:scan`; `src/media-catalog-store.js:sourceOf`; `src/watch-library-store.js`.

**Öneri / fark:** Kullanıcı onaylı parça sırası, parça içi konum ve toplam ilerleme modeli. Çok dosyalı film iki bağımsız film veya iki farklı kesim olarak yanlış sunulmasın.

**Kullanıcı deneyimi:** Kütüphane kartında 2 parça; ayrıntıda sıra düzenleme. Oynatma ikinci parçadaysa devam kartı doğru parçayı ve dakikayı açar.

**Edinim:** GPL resolveri kopyalamadan sıralama modelini bağımsız uygula; sadece ad kalıbıyla parçaları sessiz birleştirme.

**Kabul:** İkinci parça bulunamazsa ilkinden başlatmak yerine eksik parça açıkça gösterilir; her parçanın altyazı yolu ve zaman ekseni ayrıdır.

**Windows / tema / veri:** Windows doğal sayısal sıralaması CD2/CD10 için doğrulanmalı. Ürün genelindeki not/altyazı konumlarını toplam süreye körlemesine dönüştürme; kesim kartıyla aynı aile ama ayrı mekanizma.

## L842-04 — Bölüm kimliğinden ayrı izleme sırası ve özel bölüm yerleşimi

**NEW · P1 · Orta-büyük; bölüm şeması göçü**

**Gerçek kod:** EpisodeXmlReader sezon/bölüm değerlerinin yanında displayseason/displayepisode değerlerini ayrı okur. Kaynak kod yalnız NFO alan ayrımını kanıtlar; bütün sağlayıcılarda DVD/absolute order desteği varsayılmadı.

- [Komet/MediaElch — `src/media_center/kodi/EpisodeXmlReader.cpp:79` / `displayseason`](https://github.com/Komet/MediaElch/blob/e60309e6b4917db30001a261ff91ae38ad465a0e/src/media_center/kodi/EpisodeXmlReader.cpp#L79)
- [Komet/MediaElch — `src/media_center/kodi/EpisodeXmlReader.cpp:83` / `displayepisode`](https://github.com/Komet/MediaElch/blob/e60309e6b4917db30001a261ff91ae38ad465a0e/src/media_center/kodi/EpisodeXmlReader.cpp#L83)

**Bizde bugün:** `src/media-catalog-store.js:episodeOf`; `src/catalog-extensions.js:season-apply`; `src/renderer/media-catalog.js`.

**Öneri / fark:** Kalıcı episode ID ve kaynak bağlantısını koruyup gösterim/izleme sırasını ayrı düzenleme. Special bölüm araya girdiğinde sezon numarasını değiştirerek geçmişi bozmak gerekmez.

**Kullanıcı deneyimi:** Dizi ayrıntısında Sıra: yayın / kişisel; özel bölümü iki bölüm arasına taşıma. Hangi sıranın etkin olduğu görünür.

**Edinim:** MediaElch LGPL parserini doğrudan taşımadan alan modelini bağımsız kur; veri alınacak sağlayıcının order alanı ayrı doğrulanır.

**Kabul:** Sıra değişince kayıtlı kaynak, not ve izleme geçmişi aynı episode ID üzerinde kalır; aynı sezon/bölüm doğrulaması gevşetilmez.

**Windows / tema / veri:** Türkçe özel bölüm başlıkları ve dar pencere sıralama kontrolü; metadata sıra bilgisi olmadığı durumda tahmin gösterilmez. Yerel dosya taşınmaz.

## L842-05 — Dizide kaldığım yerden sonraki gerçekten oynatılabilir bölüm

**OLD-DEEPENING:D841-04;R839-D06 · P2 · Orta; L842-04 ile ortak bölüm kimliği**

**Gerçek kod:** NextUpService kullanıcıya göre izlenmeyen adayları ve isteğe bağlı özel bölümleri toplu hesaplar. Bu servis tek başına yerel dosyanın Windows üzerinde oynayabildiğini kanıtlamaz.

- [jellyfin/jellyfin — `Jellyfin.Server.Implementations/Item/NextUpService.cs:73` / `GetNextUpEpisodesBatch`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/Jellyfin.Server.Implementations/Item/NextUpService.cs#L73)

**Bizde bugün:** `src/media-catalog-service.js:visible/progress`; `src/media-catalog-store.js:episodeOf`; `src/renderer/media-catalog.js:renderResume`.

**Öneri / fark:** Seri tamamlama önerisini yeniymiş gibi saymadan, mevcut bölüm ilerlemesinden sonraki aday + kaynak var/yok + sıra açıklamasını tek kartta birleştirme.

**Kullanıcı deneyimi:** S02E04 tamamlanınca Sonraki: S02E05 görünür; dosya bağlı değilse Oynat yerine Dosya bağla çıkar. Sıra seçimi L842-04 ile uyumlu olur.

**Edinim:** GPL sorgu kodu .NET/EF bağımlılığıyla taşınmaz; mevcut küçük JSON kataloğundan bağımsız hesaplama.

**Kabul:** İzlenmiş, henüz yayınlanmamış veya kaynağı olmayan bölüm sessizce oynatılmaz; özel bölüm atlama tercihi açıklanır.

**Windows / tema / veri:** Native Windows dosya erişimi başlatma anında doğrulanır; ağ yokken yerel bölüm çalışır. Grafit/amber tek ana eylem, EN/TR.

## L842-06 — Kodi/Jellyfin NFO yan dosyasından çevrimdışı katalog zenginleştirme

**NEW · P1 · Orta; XML sınırı ve alan eşleme**

**Gerçek kod:** KodiXml yerel NFO konumunu bulup UTF-8 XML içeriğini okur; EpisodeXmlReader farklı sağlayıcılara ait uniqueid alanlarını ayırır. Tam NFO standardının tüm varyantları test edilmedi.

- [Komet/MediaElch — `src/media_center/KodiXml.cpp:293` / `KodiXml::loadMovie`](https://github.com/Komet/MediaElch/blob/e60309e6b4917db30001a261ff91ae38ad465a0e/src/media_center/KodiXml.cpp#L293)
- [Komet/MediaElch — `src/media_center/kodi/EpisodeXmlReader.cpp:42` / `uniqueid`](https://github.com/Komet/MediaElch/blob/e60309e6b4917db30001a261ff91ae38ad465a0e/src/media_center/kodi/EpisodeXmlReader.cpp#L42)

**Bizde bugün:** `backend/catalog_scan.py:scan`; `src/catalog-discovery.js:scanFolder`; `src/catalog-extensions.js:metadata-preview`; `src/media-catalog-store.js:itemOf`.

**Öneri / fark:** Mevcut video taramasına isteğe bağlı yerel movie.nfo/dosya-adı.nfo okuma ekleyerek TMDB anahtarı olmadan başlık, yıl, kimlik ve bölüm bilgisi edinme. Mevcut elle metadata eşleştirmesinin yerine sessizce yazma yapılmaz.

**Kullanıcı deneyimi:** Tarama önizlemesinde Kaynak: yerel NFO; alan bazlı eski/yeni farkı. Kullanıcı kimliği kabul ederken synopsis alanını reddedebilir.

**Edinim:** LGPL XML reader kopyalanabilirliği incelenebilir; ilk tercih sınırlı ve dış varlık çözmeyen bağımsız parser. NFO export ayrı karar, ilk dilim yalnız okuma.

**Kabul:** Bozuk/çok büyük XML, dış entity ve dış ağ referansı açılmaz; çakışan TMDB/IMDb kimliği önizlemede durur; video dosyası değişmez.

**Windows / tema / veri:** UTF-8 BOM/Türkçe karakter, aynı klasörde çok film ve case-insensitive adlar sınanmalı. Seçilen kök dışında yan dosya takip edilmez. Afiş/veri hakları kod lisansından ayrıdır.

## L842-07 — Elle düzeltilen metadata alanını kalıcı kilitleme

**NEW · P1 · Orta; kalıcı şema ve tüm metadata yazıcıları**

**Gerçek kod:** Metadata editor seçilmiş kilit alanlarını LockedFields olarak gönderir; ProviderIds ayrı tutulur. Bizdeki alan seçmeli önizleme zaten mevcut olduğundan öneri tekrar bir eşleştirme ekranı değildir.

- [jellyfin/jellyfin-web — `src/components/metadataEditor/metadataEditor.js:168` / `LockedFields`](https://github.com/jellyfin/jellyfin-web/blob/fb34d1c6f2cbda2b1a8f4e5cf5853b9db9b52c09/src/components/metadataEditor/metadataEditor.js#L168)

**Bizde bugün:** `src/catalog-extensions.js:metadata-apply`; `src/catalog-extensions.js:metadata-complete-missing`; `src/catalog-metadata-sync.js:createMetadataSync`; `src/media-catalog-store.js:itemOf`.

**Öneri / fark:** Eser bazında kalıcı fieldLocks + kullanıcı düzenlemesi/kaynak bilgisi. Yalnız eksik alanı doldurma bugünkü yaklaşımını koruyarak daha sonra toplu yenileme eklenince bilinçli düzeltmeyi koruma.

**Kullanıcı deneyimi:** Synopsis yanında Elle koru; güncelleme önizlemesinde 3 alan güncellenecek, 1 alan kilitli. Kilidi açmak veri silmez.

**Edinim:** GPL UI kodu yerine mevcut DOM mimarisinde bağımsız veri sözleşmesi. Kaynağın birebir görseli veya React kontrolü alınmaz.

**Kabul:** Elle düzeltilen Türkçe başlık yeniden eşleştirme/senkron sonrasında korunur; farklı eser kimliğine geçişte kilitlerin kapsamı kullanıcıya gösterilir.

**Windows / tema / veri:** Grafit/amber kilit simgesi tek başına anlam taşımaz, metin açıklaması ve klavye erişimi gerekir. Provider lisansı ve atıf bilgisi alan kaynağına bağlı tutulur.

## L842-08 — Seçilen kütüphane klasörü için artımlı değişiklik gelen kutusu

**NEW · P1 · Orta-büyük; çalışma işi ve kalıcı kök izinleri**

**Gerçek kod:** LibraryMonitor FileSystemWatcher olayları, geçici ignore listesi ve watcher nesliyle yaşam döngüsü yönetir. Bu C# servisinin varlığı Node fs.watch davranışının eşdeğer veya kusursuz olduğu anlamına gelmez.

- [jellyfin/jellyfin — `Emby.Server.Implementations/IO/LibraryMonitor.cs:159` / `StartWatchingPath`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/Emby.Server.Implementations/IO/LibraryMonitor.cs#L159)
- [jellyfin/jellyfin — `Emby.Server.Implementations/IO/LibraryMonitor.cs:83` / `ReportFileSystemChangeBeginning`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/Emby.Server.Implementations/IO/LibraryMonitor.cs#L83)

**Bizde bugün:** `backend/catalog_scan.py:scan`; `src/catalog-extensions.js:folder-preview/folder-apply`; `src/media-relink-matcher.js`.

**Öneri / fark:** Bugünkü elle klasör taramasına seçili kök, son tarama imzası ve yeni/değişen/kayıp aday gelen kutusu ekleme. Otomatik katalog silme veya sürekli tüm diski tarama yok.

**Kullanıcı deneyimi:** Kütüphanede 3 yeni dosya, 1 taşınmış, 1 erişilemiyor bildirimi; kullanıcı önizleyip kabul eder. Klasör takibini durdurabilir.

**Edinim:** Jellyfin yaşam döngüsü yaklaşımını bağımsız uygula; Node watcher + periyodik salt okunur mutabakat birlikte düşünülür.

**Kabul:** USB çıkarılınca bütün katalog silinmez; yarım kopyalanan dosya hemen eklenmez; aynı olay patlaması tek aday üretir; izleme kapatılınca watcher kapanır.

**Windows / tema / veri:** Windows reparse/junction dışına çıkılmaz; izin ve dosya kilidi hataları görünür. Grafit küçük gelen kutusu, kişisel dosya yolları dış sağlayıcıya gönderilmez.

## L842-09 — Kütüphane seçiminde gerçek dosyanın ses ve görüntü özellikleri

**OLD-DEEPENING:D841-02;D841-24 · P2 · Orta; sonuç önbelleği ve source fingerprint**

**Gerçek kod:** StreamDetails codec, boyut, HDR türü, ses dili/kanal ve altyazı dili alanlarını ayırır; Jellyfin web ses dilini ayrı filtreler. Codec etiketi tek başına cihaz uyumluluğu kanıtı değildir.

- [Komet/MediaElch — `src/media/StreamDetails.cpp:21` / `StreamDetails::detailToString(VideoDetails`](https://github.com/Komet/MediaElch/blob/e60309e6b4917db30001a261ff91ae38ad465a0e/src/media/StreamDetails.cpp#L21)
- [jellyfin/jellyfin-web — `src/apps/modern/features/libraries/components/filter/FiltersAudioLanguages.tsx:7` / `FiltersAudioLanguages`](https://github.com/jellyfin/jellyfin-web/blob/fb34d1c6f2cbda2b1a8f4e5cf5853b9db9b52c09/src/apps/modern/features/libraries/components/filter/FiltersAudioLanguages.tsx#L7)

**Bizde bugün:** `src/library-filters.js:applyLibraryFilters`; `src/media-compatibility.js`; `src/media-audio-tracks.js`; `src/media-catalog-store.js:itemOf`.

**Öneri / fark:** Mevcut dil/altyazı filtrelerini yeniymiş gibi saymadan, catalog source sürümüne bağlı stream envanteriyle ses dili + kanal + HDR/codec filtresi ve teknik durum sunma.

**Kullanıcı deneyimi:** Türkçe sesli yerel filmler filtresi; kart ayrıntısında 1080p HEVC, HDR, TR 5.1 ve envanter tarihi. Bilinmeyen veri eşleşmiş sayılmaz.

**Edinim:** MediaElch Qt/MediaInfo katmanı taşınmaz; mevcut ffprobe/track altyapısı tekrar kullanılır; GPL/ LGPL kaynaklar model referansı.

**Kabul:** Aynı filmin iki sürümünde farklı ses dili doğru görünür; dosya değişince teknik bilgi bayatlar; bilinmeyen özellik için boş sonucu kesin yok diye göstermez.

**Windows / tema / veri:** GPU/DRM desteği etiketle vaat edilmez. Windows ffprobe yolu ve Türkçe metadata doğrulanır; küçük erişilebilir filtre çipleri; müzik analizi hedefi eklenmez.

## L842-10 — Altyazı hazır mı: dosya ve dil durumunu çalışma kuyruğuna bağlama

**OLD-DEEPENING:D841-24;R839-D06 · P2 · Orta; source ile asset ilişkilendirmesi**

**Gerçek kod:** Jellyfin dosya/özellik modelinde SubtitleFiles ve HasSubtitles ayrımı, UI tarafında altyazı varlığı filtresi var. Kaynak otomatik transkripsiyon yapmıyor; önerilen görev bağlantısı bize ait sentezdir.

- [jellyfin/jellyfin-web — `src/apps/modern/features/libraries/components/filter/FiltersFeatures.tsx:9` / `FeatureFilters.HasSubtitles`](https://github.com/jellyfin/jellyfin-web/blob/fb34d1c6f2cbda2b1a8f4e5cf5853b9db9b52c09/src/apps/modern/features/libraries/components/filter/FiltersFeatures.tsx#L9)
- [jellyfin/jellyfin — `MediaBrowser.Controller/Entities/Video.cs:39` / `SubtitleFiles`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/MediaBrowser.Controller/Entities/Video.cs#L39)

**Bizde bugün:** `src/library-filters.js:applyLibraryFilters`; `src/media-catalog-service.js:progress`; `src/media-subtitle-tracks.js`; `src/renderer/media-workflows-ui.js`.

**Öneri / fark:** Mevcut hasSubs filtresini aşan, sürüme bağlı kaynak dil/çeviri/hazır/değişmiş/eksik dosya özeti; seçilen birkaç eserden altyazı oluşturma iş önizlemesine gitme.

**Kullanıcı deneyimi:** Bu akşam listesinde Türkçe altyazı hazır 4/7; eksik 3 eseri seçince mevcut iş akışında her dosyanın ayarı ve tahmini iş gösterilir.

**Edinim:** Özellik modelini bağımsız uygula; mevcut kuyruğu tekrar kullan. Harici sağlayıcıdan altyazı indirme bu kartın kapsamında değil.

**Kabul:** Altyazı dosyası taşınmışsa hazır görünmez; bir sürümün altyazısı diğerine sessiz atanmaz; iş önizlemesinden çıkınca kuyruk değişmez.

**Windows / tema / veri:** Windows yol kontrolü gerçek dosya seçici/grant üzerinden; İngilizce/Türkçe durum metni. Dil bilgisi dosya adına göre kesinleştirilmez, kişisel altyazı dışa yüklenmez.

## L842-11 — Dosya ve yan dosyalar için çakışma gösteren düzenleme planı

**NEW · P2 · Büyük; veri kaybı riski sebebiyle sonraki faz**

**Gerçek kod:** MovieRenamer ad şablonunu hesaplar, önizleme tablosuna işlem ekler ve gerçek rename yolunu ayırır; Renamer case-only değişimlerde geçici ad kullanır. Tam rollback garantisi kaynakta varsayılmadı.

- [Komet/MediaElch — `src/renamer/MovieRenamer.cpp:112` / `MovieRenamer::renameMovie`](https://github.com/Komet/MediaElch/blob/e60309e6b4917db30001a261ff91ae38ad465a0e/src/renamer/MovieRenamer.cpp#L112)
- [Komet/MediaElch — `src/renamer/Renamer.cpp:52` / `bool Renamer::rename`](https://github.com/Komet/MediaElch/blob/e60309e6b4917db30001a261ff91ae38ad465a0e/src/renamer/Renamer.cpp#L52)

**Bizde bugün:** `src/media-relink-matcher.js`; `src/catalog-discovery.js:scanFolder`; `src/watch-library-store.js`.

**Öneri / fark:** Kütüphane düzenlemek isteyen kullanıcı için önce salt okunur eski/yeni yol ve çakışma planı; sonra ayrı açık onaylı dosya düzenleme. Mevcut taşınanı yeniden bağlama işlevinden farklıdır.

**Kullanıcı deneyimi:** Film adı (Yıl) düzeni önerisi; video, SRT ve NFO beraber gösterilir. Çakışma veya açık dosya varsa ilgili satır uygulanamaz.

**Edinim:** LGPL renamer kopyalamadan bağımsız planlayıcı; gerçek uygulama yapılacaksa dosya sistemi ve katalog güncellemesi için journal/rollback tasarımı şart.

**Kabul:** Plan açılması hiçbir dosya taşımaz; iki dosya aynı hedefi alamaz; yarım hatada katalog kaynağı eski/yeni gerçek konumla tutarlı kalır.

**Windows / tema / veri:** Windows reserved adlar, MAX_PATH, case-only rename, Türkçe NFC ve kilitli dosya özel kabul gerektirir. Amber Uygula ancak plan gözden geçirildikten sonra; otomatik düzenleyici yok.

## L842-12 — Birden fazla eserde alan bazlı metadata düzeltme makbuzu

**NEW · P1 · Orta; toplu atomiklik ve L842-07**

**Gerçek kod:** Kometa metadata işlemlerini eşleşen eserlere uygular ve etiketlerde ekle/çıkar/senkron kiplerini ayırır. Mevcut kod Plex nesnelerine bağlıdır; geri alınabilir Electron önizlemesi hazır bileşen değildir.

- [Kometa-Team/Kometa — `modules/meta.py:1659` / `def update_metadata`](https://github.com/Kometa-Team/Kometa/blob/cc35af0686967b74ead474277d9eb16119bc888c/modules/meta.py#L1659)
- [Kometa-Team/Kometa — `modules/meta.py:1639` / `def edit_tags`](https://github.com/Kometa-Team/Kometa/blob/cc35af0686967b74ead474277d9eb16119bc888c/modules/meta.py#L1639)

**Bizde bugün:** `src/catalog-extensions.js:metadata-apply`; `src/catalog-metadata-sync.js`; `src/renderer/media-catalog.js:renderMetadata`.

**Öneri / fark:** Bizde tek eser için alan seçimi ve eksik metadata senkronu var. Yeni kısım çoklu seçimde ortak alan düzeltme, her satır eski/yeni farkı, kilitleri koruma ve işlem makbuzudur.

**Kullanıcı deneyimi:** Beş filmi seç, tür etiketine Belgesel ekle; mevcut türleri değiştirmeden neyin ekleneceği görünür. Senkron/yerine koy kipi ayrı ve açık olur.

**Edinim:** MIT küçük etiket fark algoritmaları notice ile port adayı; Plex/Docker veya Python çalışma sistemi kurulmaz. Mevcut store yazıcıları kullanılır.

**Kabul:** Eşzamanlı değişen satır sessiz ezilmez; bir satır hatası diğerlerinin durumunu doğru raporlar; kişisel puan/izleme durumu metadata işiyle değişmez.

**Windows / tema / veri:** Windows dosya yazımı mevcut fsync akışıyla; dar pencerede yatay sonsuz tablo yerine satır ayrıntısı. TMDB veri yenileme kotası ayrı; kontrolsüz toplu API çağrısı yok.

## L842-13 — Koleksiyona yalnız eser değil sezon ve bölüm de ekleme

**NEW · P2 · Orta; sezon/bölüm kimliği ve silme ilişkisi**

**Gerçek kod:** MediaTracker ListItem hem mediaItemId hem isteğe bağlı seasonId/episodeId taşır. Bu kaynak liste üyeliğinin kapsamını kanıtlar; bir oynatma motoru veya paylaşım kabulü değildir.

- [bonukai/MediaTracker — `server/src/entity/list.ts:33` / `seasonId?: number`](https://github.com/bonukai/MediaTracker/blob/22aedac26329893b6441d74d12be9a48e190ca9c/server/src/entity/list.ts#L33)
- [bonukai/MediaTracker — `server/src/entity/list.ts:34` / `episodeId?: number`](https://github.com/bonukai/MediaTracker/blob/22aedac26329893b6441d74d12be9a48e190ca9c/server/src/entity/list.ts#L34)

**Bizde bugün:** `src/media-catalog-store.js:itemOf/episodeOf`; `src/media-shelf-service.js`; `src/renderer/media-shelf-ui.js`.

**Öneri / fark:** Eser düzeyindeki collections alanından ayrı, stable kimlikli üye referanslarıyla seçilmiş bölümler rafı. Antoloji, özel gece veya hatırlanan bölümlere doğrudan erişim sağlanır.

**Kullanıcı deneyimi:** En sevdiğim beş bölüm koleksiyonu, dizi afişiyle birlikte bölüm adı ve numarasını gösterir; aç eylemi doğru bölüm ayrıntısına gider.

**Edinim:** MIT üyelik tipi notice korunarak port adayı; SQL/React servisinin bütünü taşınmaz. Kendi JSON store sınırlarına uygun üyelik kaydı.

**Kabul:** Bir bölüm başka sıraya taşınınca koleksiyon referansı bozulmaz; dizi silinirse kırık üye kullanıcıya görünür; kaldırma dosyayı silmez.

**Windows / tema / veri:** Türkçe uzun bölüm adları ve tek dil UI; yerel yol listelerde paylaşılmaz. İsteğe bağlı liste dışa aktarma ayrı kapsam, bu kart çevrimiçi sosyal özellik gerektirmez.

## L842-14 — Ara verdim ve bıraktım durumlarını izleniyor listesinden ayırma

**NEW · P1 · Küçük-orta; tüm filtre ve aktarım sözleşmeleri**

**Gerçek kod:** Yamtrack Status modeli PAUSED ve DROPPED durumlarını açık tutar; Media.process_status ilerleme/durum ilişkisini işler. Bu mekanizma bir filme düşük puan vermeyle aynı değildir.

- [FuzzyGrim/Yamtrack — `src/app/models.py:774` / `class Status(models.TextChoices)`](https://github.com/FuzzyGrim/Yamtrack/blob/387274467e771845cf84fe3ceb1b249ad8405e41/src/app/models.py#L774)

**Bizde bugün:** `src/media-catalog-store.js:STATUSES`; `src/renderer/media-catalog.js:statusLabels/filtered`; `src/media-discovery-service.js`.

**Öneri / fark:** Mevcut planned/watching/completed/unspecified durumlarına isteğe bağlı paused/dropped ekleme; yarım kalmış bir dizi devam rafını sürekli işgal etmesin. Bırakmayı otomatik olumsuz zevk sinyaline çevirmeme.

**Kullanıcı deneyimi:** Dizi menüsünde Ara ver / Bıraktım; devam rafından kalkar, ayrı filtrede bulunur; Yeniden başla eski konumu korur.

**Edinim:** AGPL Django kodunu taşımadan basit enum ve geçiş politikasını bağımsız uygula. Kayıt göçü eski durumları aynen korur.

**Kabul:** Bıraktım seçimi izlenmiş işaretlemez; puanı veya konumu silmez; geri alınır; paket içe/dışa aktarmada durum kaybolmaz.

**Windows / tema / veri:** EN/TR Paused/Ara verildi ve Dropped/Bırakıldı metinleri net; renk tek sinyal olmaz. Windows dosya erişimi gerektirmeyen tamamen yerel özellik.

## L842-15 — İzleme günlüğünde yeniden izleme oturumunu ayrı tutma

**OLD-DEEPENING:D841-23 · P2 · Orta-büyük; olay/oturum ayrımı**

**Gerçek kod:** Yamtrack sezon watch işlemi bölüm için tekrar kaydı üretir; MediaTracker progress zaman, bölüm, süre ve cihaz alanlarını ayırır. Bütün progress olaylarının tekrar izleme oturumu olduğu varsayılmaz.

- [FuzzyGrim/Yamtrack — `src/app/models.py:1597` / `def watch(self, episode_number, end_date, notes=`](https://github.com/FuzzyGrim/Yamtrack/blob/387274467e771845cf84fe3ceb1b249ad8405e41/src/app/models.py#L1597)
- [bonukai/MediaTracker — `server/src/entity/progress.ts:1` / `export type Progress`](https://github.com/bonukai/MediaTracker/blob/22aedac26329893b6441d74d12be9a48e190ca9c/server/src/entity/progress.ts#L1)

**Bizde bugün:** `src/media-shelf-service.js:diaryKey/rewatchIndex`; `src/watch-library-store.js`; `src/media-catalog-service.js:progress`.

**Öneri / fark:** Bizde içe aktarılan günlükte rewatchIndex zaten var. Gelişim: yerel oynatmayla ikinci izlemeyi bilinçli başlatma, ayrı oturum tarihçesi ve güncel resume bilgisinin geçmiş puanı ezmemesi.

**Kullanıcı deneyimi:** Tekrar izlemeye başla seçimi yeni oturum açar; film ayrıntısında 2025 ve 2026 izlemeleri ayrı görünür; önceki yorum kaybolmaz.

**Edinim:** AGPL tarihçe modeli bağımsız uygulanır; MIT progress alanları notice ile aday. Dış tracker scrobble, hesap ve webhook zorunlu değil.

**Kabul:** Bir videoyu duraklatıp sürdürmek iki rewatch üretmez; yarım oturum tamamlanmış gösterilmez; yanlış açılan oturum eski günlüğü bozmadan kaldırılır.

**Windows / tema / veri:** Windows saat dilimi ve tarih değişimleri korunur; yalnız izinli yerel olaylar kaydedilir. D841-23 export kartı yeni diye tekrar sayılmadı.

## L842-16 — Bölüme bağlı kısa not ve izleme sonrası düşünce

**NEW · P2 · Orta; iki not türünü anlaşılır bağlama**

**Gerçek kod:** Episode modelinde notes ve tarihçe alanı bulunur; MediaManager notlarda metin aramasını da kapsayabilir. Kaynak timestamp alıntılı sahne notu motoru değildir.

- [FuzzyGrim/Yamtrack — `src/app/models.py:1773` / `class Episode(models.Model)`](https://github.com/FuzzyGrim/Yamtrack/blob/387274467e771845cf84fe3ceb1b249ad8405e41/src/app/models.py#L1773)
- [FuzzyGrim/Yamtrack — `src/app/models.py:865` / `notes = models.TextField`](https://github.com/FuzzyGrim/Yamtrack/blob/387274467e771845cf84fe3ceb1b249ad8405e41/src/app/models.py#L865)

**Bizde bugün:** `src/media-catalog-store.js:episodeOf`; `src/watch-library-store.js`; `src/renderer/media-catalog.js:renderEpisodeForm`.

**Öneri / fark:** Yerel medya/watch-library notları zaten vardır; not özelliği eksik iddiası yoktur. Mevcut dosya/not/altyazı bağlamına ek olarak oynatıcı açmadan stable bölüm kimliğine kısa düşünce kaydetme. Dosya sonra yeniden bağlansa veya katalog sırası değişse de bölüm notu kalır.

**Kullanıcı deneyimi:** Bölüm satırından Not ekle; dizi ayrıntısında yalnız benim notlarım görünümü. Aynı dizinin notlarında arama doğrudan ilgili bölümü açar.

**Edinim:** AGPL model kodu taşınmaz; mevcut not mimarisine bağımsız entityRef genişlemesi. Oynatma zamanı olan notlar ayrı referansını korur.

**Kabul:** Bölüm yeniden numaralansa not ID ile kalır; arama sonuçları başka dizideki aynı S01E01 ile karışmaz; not dış metadata yenilemesiyle değişmez.

**Windows / tema / veri:** Yerel not hiçbir sağlayıcıya varsayılan gönderilmez; EN/TR kontrol etiketleri, kullanıcı notunun içeriği çevrilmez. Grafit yan panelde okunabilir metin alanı.

## L842-17 — Koleksiyon yenilemesinde ekle/çıkar farkı ve üyelik politikası

**OLD-DEEPENING:R839-F09;D841-08 · P2 · Orta; üyelik provenance ve revision**

**Gerçek kod:** Kometa append/sync ayrımını ve collection üyelerinin eklenme/çıkarılma mekanizmalarını tutar. Bu kaynak salt okunur önizlemeyi hazır sunuyor denmedi; bizim makbuz önerimiz sentezdir.

- [Kometa-Team/Kometa — `modules/builder.py:6783` / `def run_collections_again`](https://github.com/Kometa-Team/Kometa/blob/cc35af0686967b74ead474277d9eb16119bc888c/modules/builder.py#L6783)
- [Kometa-Team/Kometa — `modules/builder.py:1544` / `self.sync = self.library.sync_mode`](https://github.com/Kometa-Team/Kometa/blob/cc35af0686967b74ead474277d9eb16119bc888c/modules/builder.py#L1544)

**Bizde bugün:** `src/media-catalog-store.js:itemOf.collections`; `src/media-shelf-service.js`; `src/renderer/media-shelf-ui.js`.

**Öneri / fark:** Önceki kaydedilen raf/editoryal liste fikirlerini derinleştir: yenilemede elle eklenen üyeyi koru, yalnız kaynağın üyelerini eşitle veya sadece ekle kipleri. Dış liste değişince kişisel çalışma kaybolmasın.

**Kullanıcı deneyimi:** Listeyi yenile: 4 eklenecek, 2 kaynaktan çıktı, 1 elle eklenen korunacak. Kullanıcı farkı görüp uygular; kaynaktan çıktı dosyası silinmez.

**Edinim:** MIT set fark/senkron kavramı notice ile port adayı; Radarr/Sonarr/torrent ve otomatik indirme dalları tamamen kapsam dışı.

**Kabul:** Boş/başarısız kaynak yanıtı bütün üyeleri çıkarmaz; aynı revizyon ikinci kez işlendiğinde fark oluşmaz; elle üyeler seçilen politikaya göre korunur.

**Windows / tema / veri:** Yerel katalog kaydı ve dosya silme aynı işlem değildir. Liste/veri atıfları korunur; grafit fark paneli ve EN/TR kip açıklaması gerekir.

## L842-18 — İzlenmemiş bölümün görsel ve açıklamasını kütüphanede gizleme

**OLD-DEEPENING:R839-A09;D841-21 · P2 · Küçük-orta; tüm bölüm preview yüzeylerini izleme**

**Gerçek kod:** Yamtrack kullanıcı modelinde izlenmemiş bölüm resim/açıklamasını gizlemeye yönelik obfuscate_unseen_episodes ayarı var. Bu tur render template/çalışan UI doğrulanmadı; gözlenen kanıt yapılandırma sözleşmesidir.

- [FuzzyGrim/Yamtrack — `src/users/models.py:315` / `obfuscate_unseen_episodes`](https://github.com/FuzzyGrim/Yamtrack/blob/387274467e771845cf84fe3ceb1b249ad8405e41/src/users/models.py#L315)

**Bizde bugün:** `src/media-catalog-store.js:episodeOf`; `src/renderer/media-catalog.js`; `src/renderer/media-discovery-ui.js`.

**Öneri / fark:** Önceki spoiler güvenli asistan/yorum planını kütüphanenin bölüm görseli ve synopsis yüzeyine taşıma; görüntüye uygulanan gizleme AI bağlamında spoiler garantisi diye sunulmaz.

**Kullanıcı deneyimi:** Henüz izlenmeyen bölümde nötr küçük görsel ve Açıklamayı göster eylemi; tek sefer açmak bölümü izlendi işaretlemez.

**Edinim:** AGPL ayar kodu yerine bağımsız yerel tercih; template davranışı incelenmeden hazır blur bileşeni alındı denmez.

**Kabul:** Arama/hover/koleksiyon/sonraki bölüm yüzeylerinde aynı tercih uygulanır; ekran okuyucu gizli synopsis metnini okumaz; açıkça göster eylemi geri alınabilir.

**Windows / tema / veri:** Spoiler kapatma için yalnız CSS blur yeterli değildir; DOM/erişilebilir adlar da ele alınır. EN/TR kısa kontrol, Windows klavye odağı; D841-21 tekrar sayılmadı.

## L842-19 — Yerel arşiv için sahne küçük görselleriyle görsel göz atma

**OLD-DEEPENING:R76-1.1 · P2 · Büyük; görev kuyruğu ve disk bütçesi**

**Gerçek kod:** TrickplayManager mevcut görsel tablolarını keşfeder, çözünürlük/zaman aralığı bilgisiyle tile envanterini yönetir ve FFmpeg üretim akışına sahiptir. Semantik video arama veya sahne tanıma değildir.

- [jellyfin/jellyfin — `Jellyfin.Server.Implementations/Trickplay/TrickplayManager.cs:86` / `CanGenerateTrickplay`](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/Jellyfin.Server.Implementations/Trickplay/TrickplayManager.cs#L86)

**Bizde bugün:** `src/renderer/media-catalog.js`; `src/media-workflows.js`; `src/media-compatibility.js`; `src/media-catalog-service.js`.

**Tekrar ayrımı:** R76-1.1 Jellyfin TrickplayManager ile seekbar önizlemesini zaten önerdi. Kütüphane göz atma yüzeyi aynı mekanizmanın derinleştirmesidir; yeni sayılmadı.

**Öneri / fark:** Kütüphanede aynı adlı yerel kaydı ayırt etmek veya hatırlanan bölüme göz atmak için isteğe bağlı, bütçeli zaman çizgisi küçük görselleri. Varsayılan tüm arşivi GPU işine sokma yok.

**Kullanıcı deneyimi:** Ayrıntıda Sahnelere göz at: belli aralıklarda küçük görseller ve zaman kodları. Birine basınca dosya izinleri doğrulanıp oynatıcı o noktayı açar.

**Edinim:** GPL tile manager kopyalanmaz; mevcut FFmpeg çevresinde bağımsız sınırlı iş, iptal ve cache modeli. Üretim yalnız açık kullanıcı eylemiyle.

**Kabul:** İptal yarım görselleri hazır göstermez; dosya sürümü değişince önbellek geçersizleşir; ağ videosu/DRM için çalışıyor iddiası yok.

**Windows / tema / veri:** Windows FFmpeg yolu, dosya kilidi ve silinmiş kaynak kabulü gerekir. Yerel kareler kişiseldir, buluta gönderilmez/Git olmaz; EN/TR kontrol ve sade amber odak.

## L842-20 — Eklenme tarihi ile yayın ve izleme tarihini ayrı sıralama

**NEW · P2 · Küçük-orta; şema ve eski veri açıklaması**

**Gerçek kod:** Jellyfin editor DateCreated ve PremiereDate alanlarını ayırır; MediaTracker liste sıralamasında recently-added/recently-watched/release-date farklıdır ve üyede addedAt vardır.

- [jellyfin/jellyfin-web — `src/components/metadataEditor/metadataEditor.js:157` / `DateCreated: getDateValue`](https://github.com/jellyfin/jellyfin-web/blob/fb34d1c6f2cbda2b1a8f4e5cf5853b9db9b52c09/src/components/metadataEditor/metadataEditor.js#L157)
- [bonukai/MediaTracker — `server/src/entity/list.ts:5` / `'recently-added'`](https://github.com/bonukai/MediaTracker/blob/22aedac26329893b6441d74d12be9a48e190ca9c/server/src/entity/list.ts#L5)

**Bizde bugün:** `src/media-catalog-store.js:itemOf`; `src/renderer/media-catalog.js:filtered`; `src/media-shelf-service.js`.

**Öneri / fark:** Katalog kaydının ilk eklenme tarihi, koleksiyona giriş tarihi, yayın yılı ve son oynatma zamanını karıştırmadan sıralama; toplu eski arşiv ithali de kaynağıyla gösterilsin.

**Kullanıcı deneyimi:** Kütüphanede Yeni eklenenler: bu hafta bağladığım eski filmler. Ayrıntıda Kütüphaneye eklendi ve Yayın tarihi açıkça ayrı yer alır.

**Edinim:** Basit tarih modelini bağımsız kur; MIT liste sort sözleşmesi notice ile port adayı. Eski kayıtlara sahte ilk eklenme tarihi uydurulmaz.

**Kabul:** Metadata yenileme addedAt değerini değiştirmez; bir koleksiyona tekrar ekleme eser tarihini ezmez; bilinmeyen eski tarih belirsiz gösterilir.

**Windows / tema / veri:** Windows yerel saat dilimi/tarih gösterimi ve kararlı eşitlik sıralaması doğrulanır. Türkçe/İngilizce tarih etiketleri net; ham UTC saklanıp kullanıcıya yerel gösterilir.
