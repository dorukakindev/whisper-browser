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

## P003 — Afişsiz yerel film detay tasarımı

- **Durum:** bağımsız hareketli kompozisyon hazır; kullanıcı tasarım onayı bekleniyor. Akışlar kabul edildi. P001 ölçüm eşiği bloklayıcı değil.
- **Kapsam/kabul:** mevcut yerel film işlemleri korunarak tasarlanmış afiş/backdrop yedeği, temiz başlık ve Keşfet detaylarıyla aynı görsel dil. Önce standalone kompozisyon/onay; sonra native geniş/dar ve hareket kontrolü. Sahte veri üretime girmez.
- **Kanıt:** D:\Whisper Local\artifacts\library-film-composition-2026-11-04\gallery.html; üç senaryo ×1440/1920, 720 taşma ve menü/kopya/akordeon kontrolü. [Devir](docs/devir/2026-11-04-0331.md).
- **Dal:** codex/library-film-motion-preview; başlangıç master8b6534fb0a3cb0d11dd5a906108f6c58bb27cbe2. Ürün kodu değiştirilmedi.
- **Sonraki adım:** kullanıcı maketi onayladıktan sonra mevcut handler/kimlikleri ortak Keşfet detay yapısına bağla. Yerel afiş → TMDB token/cache → tasarlanmış yedek sırasını uygula; üretimde örnek dosya bilgisi kullanma. Native aç/geri/akordeon/scroll ölçümü uygulama sonrası;20ms aşımı raporlanır, bloklayıcı değildir.

## P004 — Browser ve altyazı yan paneli tasarımı

- **Durum:** planlandı; önceki ekranların kabulünü bekliyor.
- **Kapsam/kabul:** araç çubuğu ve sağ panelin onaylı sinematik dilde kompozisyonu; altyazı/çeviri/dublaj/asistan, iş sürekliliği, kaynak ve ayar/onay davranışları korunur. Önce taslak/onay, sonra1440/1920/dar native görüntü ve performans kontrolü.
- **Sonraki adım:** ekran sırası geldiğinde mevcut kontrolleri envanterleyip hareketli kompozisyonu hazırla.

## D001 — Mevcut rapor indeksinin eksikleri

- **Durum:** planlandı; bu belge düzenlemesinden önce de var olan doğrulama eksiği.
- **Kanıt:** değişmemiş master indeksinde node tests/docs-index-integrity.test.js başarısız: R835,837,838,839,840,841,842,845,847,849,851,852 dosyaları mevcut, [INDEX.md](docs/raporlar/INDEX.md) içinde karşılıkları yok. Bu, bu raporların bütün bulgularının açık olduğu anlamına gelmez.
- **Kabul:** mevcut raporları silmeden doğru indeks bağlantılarını eklemek; genel belge indeks kontrolünün geçmesi. D:\Whisper Local içindeki kişisel INDEX.md değişikliği korunmalı.
- **Sonraki adım:** ana kopyanın kişisel indeks farkını ve depodaki indeksi karşılaştır; yalnız eksik kayıtları onaylı durumlarıyla birleştir. Bu tur kişisel indekse dokunulmadı.

## Başka bir oturumdan iş devralırken

DEVIR-NOTU.md'nin ilgili son kaydını ve aktif dalı kontrol et. Yeni yarım işler buraya ayrı ID ile eklenir; eski rapor arşivi veya plan dosyası otomatik olarak yüzlerce açık işe dönüştürülmez. Kullanıcı kararıyla ertelenen/kapsam dışı işin durumunu açık yaz. Ana programda hangi kodun bulunduğunu git HEAD ile yeniden doğrula.
