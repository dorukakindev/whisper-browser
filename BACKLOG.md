# Bekleyen işler

Son durum kontrolü: **2026-11-04**. Bu dosya açık işlerin giriş noktasıdır. Eski raporların tamamı açık bug değildir; kodda doğrulanmadan yeniden açılmaz.

## Durum kuralı

Her kayıt: **durum + kapsam + dal/PR + kanıt + kalan kabul koşulu + kesin sonraki adım** içerir. Durumlar: planlandı, sürüyor, kullanıcı onayı bekliyor, engelli. Tamamlanan işi burada açık tutma; doğrulama/devir bağlantısıyla CHANGELOG.md'ye geçir. Bir görev kapanmadan veya sohbet değişmeden yarım işi güncelle. Tarihsel test başarısını güncel kabul diye kullanma.

## P001 — Sinematik hareket performansı

- **Durum:** ölçülen performans açıkları kayıtlı; kullanıcı 2026-11-04 kararıyla yeni ekranlar için bloklayıcı değil. PR805 ana sürüme alınmadı. Home/Keşfet/film tasarımı kullanıcı tarafından kabul edildi.
- **Dal/PR:** codex/cinema-performance-round5 · [draft PR805](https://github.com/dorukakindev/whisper-browser/pull/805).
- **Son ürün:** d53ffb5a65e724afce52696bafa08657ab97a5dd; teslim commit'i 5aa8e5637786093f3864ca31ec88b49b856b5630. Başlangıç ürün/master:922f5474c517e15d9fb060633605dd0267d62f86. Bu belgenin merge'i ürün kodunu değiştirmez.
- **Kanıt:** [ölçümler ve trace dosyaları](https://github.com/dorukakindev/whisper-browser/blob/codex/cinema-performance-round5/docs/implementation/cinematic-performance-round5-2026-11-03/PERFORMANCE.md), [ayrıntılı devir](https://github.com/dorukakindev/whisper-browser/blob/codex/cinema-performance-round5/docs/devir/2026-11-03-1519.md).
- **Gerçek kalan sorun:** son kaynak-güvenli sürümde1440 detay69,5ms, scroll55,5ms;1920 detay20,8ms maksimum. Önceki27,8ms farklı denemeydi; son sürümün başarısı değildir.41 hedefli kontrol ve son9 hareket kontrolü, performans kabulü yerine geçmez.
- **Önceki sayısal hedef (artık bloklayıcı değil):** onaylı hareket/görünüm korunarak her etkileşim maksimum<20ms, p95<16,7ms;1440/1920'de son revizyon için60s görünür/odaklı aktif hero CPU<%3 ve GPU kaydı. Son CPU ölçümleri son görsel katman değişiminden önce; yeniden doğrulanmalı. Son revizyona ait native1440/1920 karşılaştırması ve0/100/200/400/900ms kareler gerekli.
- **Sonraki adım:** bu dalı tekrar aç; işaretli1440 detail/scroll rAF aralıklarını renderer/compositor/raster thread'leriyle aynı zaman ekseninde eşleştir. Sabit blur yüzeyinin ilk raster'ını, rota microtask'ini ve ilk style/layout/commit fazlarını tek değişkenle incele. Renderer fetch'i geri ekleme; büyük JPEG'i renk örneklemek için ana thread'de kopyalama. Sayısal hedef tutmadığında gerçek ölçümü bildir; sonraki ekranı durdurma. PR805 için son revizyonun görünüm/akış incelemesi ayrı kalır; bu tur merge edilmedi.

## P003 — Kütüphane film detayının canlı kabul sınırları

- **Durum:** onaylı tasarım PR808 içinde uygulandı; kullanıcı 2026-11-04 tarihinde master birleştirmesini istedi. Canlı kabulün kalan kısmı açık.
- **Dal/PR:** codex/library-film-motion-preview · [PR808](https://github.com/dorukakindev/whisper-browser/pull/808); ürün HEAD `942bd7b5cc17141d3100691aacd40b79167108f3`.
- **Kanıt:** önceki izole Windows 1440/1920/940 incelemesi; bu teslimde temiz worktree üzerinde katalog/film/panel hedefli kontrolleri 18/18. [Birleştirme teslimi](docs/devir/2026-11-04-0936.md).
- **Kalan kabul:** canlı TMDB, büyük kişisel kütüphane ve tüm yönetim yolları; kaydedilmiş film açılış/kaydırma performans açıkları kapanmış sayılmaz. P001 ayrı kalır.
- **Kesin sonraki adım:** kullanıcı gerçek kullanım doğrulaması istediğinde ilgili kişisel katalog akışını açık seçimlerle doğrula; yeni tasarım veya performans turunu kendiliğinden başlatma.

## P004 — Browser panelinin canlı kabul sınırları

- **Durum:** onaylı panel ve üç iç tasarım uygulandı; kullanıcı 2026-11-04 tarihinde PR808'in master'a birleştirilmesini istedi. Canlı kabulün kalan kısmı açık.
- **Dal/PR:** codex/library-film-motion-preview · [PR808](https://github.com/dorukakindev/whisper-browser/pull/808); ürün HEAD `942bd7b5cc17141d3100691aacd40b79167108f3`.
- **Kanıt:** [uygulama, native kontroller ve sınırlar](docs/implementation/browser-panel-2026-11-04/README.md); bu teslimde temiz worktree üzerinde hedefli testler ve değişen JS sözdizimleri geçti.
- **Kalan kabul:** gerçek sağlayıcı indirmesi/açma, yüklü canlı izde nonzero senkron, gerçek uzun iş iptali, site profili yeniden açma, fullscreen/Shadow DOM yalıtımı ve etkileşim trace ayrımı. Fixture sonucu bunları kapatmaz.
- **Kesin sonraki adım:** kullanıcı gerçek kullanımda istediğinde bu akışları ayrı kısa turda doğrula; mevcut uygulama/ileri ayarları koru. CI bekleme işi başlatma.

## D001 — Mevcut rapor indeksinin eksikleri

- **Durum:** planlandı; bu belge düzenlemesinden önce de var olan doğrulama eksiği.
- **Kanıt:** değişmemiş master indeksinde node tests/docs-index-integrity.test.js başarısız: R835,837,838,839,840,841,842,845,847,849,851,852 dosyaları mevcut, [INDEX.md](docs/raporlar/INDEX.md) içinde karşılıkları yok. Bu, bu raporların bütün bulgularının açık olduğu anlamına gelmez.
- **Kabul:** mevcut raporları silmeden doğru indeks bağlantılarını eklemek; genel belge indeks kontrolünün geçmesi. D:\Whisper Local içindeki kişisel INDEX.md değişikliği korunmalı.
- **Sonraki adım:** ana kopyanın kişisel indeks farkını ve depodaki indeksi karşılaştır; yalnız eksik kayıtları onaylı durumlarıyla birleştir. Bu tur kişisel indekse dokunulmadı.

## Başka bir oturumdan iş devralırken

DEVIR-NOTU.md'nin ilgili son kaydını ve aktif dalı kontrol et. Yeni yarım işler buraya ayrı ID ile eklenir; eski rapor arşivi veya plan dosyası otomatik olarak yüzlerce açık işe dönüştürülmez. Kullanıcı kararıyla ertelenen/kapsam dışı işin durumunu açık yaz. Ana programda hangi kodun bulunduğunu git HEAD ile yeniden doğrula.

## P005 — Oynatıcı/V3 kabul ve teslim

- **Durum:** oynatıcı, katalog/podcast, asistan bağlamı ve beş V3 yüzeyi bağlandı. Uçtan uca canlı kabul ve bazı paket alt işleri açık.
- **Dal:** `codex/player-v3-integration-20261104`. PR808 içeren taban `459bf2e0bbbf0bfb19566ed16080806bb6e76126`. Son ürün `083a914cf6f3fe05a1cd1aa607aa84f7ee00af9e`. [Taslak PR #809](https://github.com/dorukakindev/whisper-browser/pull/809).
- **Kanıt:** [4 Kasım devir notu](docs/devir/2026-11-04-1028.md). 26 hedefli test geçti. İzole Windows uygulamasında beş V3 yüzeyi 1440/940 px’de açıldı. Okundu, rota üyeliği ve CSV yazımı doğrulandı. Gerçek Windows mpv, yerel sentetik H.264 klipte d3d11va ve kare ölçümlerini döndürdü. Eski nesil reddi ve temiz kapanış geçti.
- **Kalan kabul:** gerçek YouTube/podcast, mpv HDR ve ses çıkışı, canlı asistan ve dublaj, DRM ve start.bat. Rota üyeliği ve sıra iki ayrı mevcut yazma adımıdır. Birleşik geri alma ve arşiv yeniden bağlama geri alması açık. Karşılaştırma katalog temelli oturum görünümüdür. Asistan çıktısına kalıcı bağ ve artifact revizyon arşivi açık.
- **Sonraki adım:** önce izole profilde gerçek kamu podcast ve YouTube örneklerini normal Windows açılışından dene. Mevcut mpv yolunda HDR ve ses çıkışını uygun test örnekleriyle doğrula. Ardından geri alma ve kalıcı artifact kapsamını tamamla. Açık kabul varken taslak PR’ı birleştirme. GitHub Actions başlatma.
