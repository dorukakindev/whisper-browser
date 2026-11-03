# Bekleyen işler

Son durum kontrolü: **2026-11-04**. Bu dosya açık işlerin giriş noktasıdır. Eski raporların tamamı açık bug değildir; kodda doğrulanmadan yeniden açılmaz.

## Durum kuralı

Her kayıt: **durum + kapsam + dal/PR + kanıt + kalan kabul koşulu + kesin sonraki adım** içerir. Durumlar: planlandı, sürüyor, kullanıcı onayı bekliyor, engelli. Tamamlanan işi burada açık tutma; doğrulama/devir bağlantısıyla CHANGELOG.md'ye geçir. Bir görev kapanmadan veya sohbet değişmeden yarım işi güncelle. Tarihsel test başarısını güncel kabul diye kullanma.

## P001 — Sinematik hareket performansı

- **Durum:** sürüyor; kabul geçmedi. Ana sürüme alınmadı.
- **Dal/PR:** codex/cinema-performance-round5 · [draft PR805](https://github.com/dorukakindev/whisper-browser/pull/805).
- **Son ürün:** d53ffb5a65e724afce52696bafa08657ab97a5dd; teslim commit'i 5aa8e5637786093f3864ca31ec88b49b856b5630. Başlangıç ürün/master:922f5474c517e15d9fb060633605dd0267d62f86. Bu belgenin merge'i ürün kodunu değiştirmez.
- **Kanıt:** [ölçümler ve trace dosyaları](https://github.com/dorukakindev/whisper-browser/blob/codex/cinema-performance-round5/docs/implementation/cinematic-performance-round5-2026-11-03/PERFORMANCE.md), [ayrıntılı devir](https://github.com/dorukakindev/whisper-browser/blob/codex/cinema-performance-round5/docs/devir/2026-11-03-1519.md).
- **Gerçek kalan sorun:** son kaynak-güvenli sürümde1440 detay69,5ms, scroll55,5ms;1920 detay20,8ms maksimum. Önceki27,8ms farklı denemeydi; son sürümün başarısı değildir.41 hedefli kontrol ve son9 hareket kontrolü, performans kabulü yerine geçmez.
- **Kabul:** onaylı hareket/görünüm korunarak her etkileşim maksimum<20ms, p95<16,7ms;1440/1920'de son revizyon için60s görünür/odaklı aktif hero CPU<%3 ve GPU kaydı. Son CPU ölçümleri son görsel katman değişiminden önce; yeniden doğrulanmalı. Son revizyona ait native1440/1920 karşılaştırması ve0/100/200/400/900ms kareler gerekli.
- **Sonraki adım:** bu dalı tekrar aç; işaretli1440 detail/scroll rAF aralıklarını renderer/compositor/raster thread'leriyle aynı zaman ekseninde eşleştir. Sabit blur yüzeyinin ilk raster'ını, rota microtask'ini ve ilk style/layout/commit fazlarını tek değişkenle incele. Renderer fetch'i geri ekleme; büyük JPEG'i renk örneklemek için ana thread'de kopyalama. Eşik geçmeden merge/tamamlandı iddiası yok.

## P002 — Akışlar (RSS) tasarım turu

- **Durum:** planlandı; P001'in kullanıcı tarafından kabulünü bekliyor. Yeni tasarım uygulaması başlamadı; mevcut RSS özelliği var.
- **Kaynak:** kullanıcının onaylı ekran sırası ve P001 devir notu.
- **Kapsam/kabul:** aynı token/bileşenlerle önce hareketli standalone kompozisyon ve kullanıcı onayı; sonra uygulama. Abonelikler, okundu/kaydetme, kaynak kimliği, reader/oynatıcı ve ileri ayarlar korunur. Gerçek geniş/dar görüntü ve performans ölçümü gerekir.
- **Sonraki adım:** P001 kabulünden sonra mevcut RSS ekranını inceleyip kompozisyonu hazırla.

## P003 — Afişsiz yerel film detay tasarımı

- **Durum:** planlandı; P001 kabulünü ve P002 ekranının tamamlanmasını bekliyor.
- **Kapsam/kabul:** mevcut yerel film işlemleri korunarak tasarlanmış afiş/backdrop yedeği, temiz başlık ve Keşfet detaylarıyla aynı görsel dil. Önce standalone kompozisyon/onay; sonra native geniş/dar ve hareket kontrolü. Sahte veri üretime girmez.
- **Sonraki adım:** ilgili ekran sırası geldiğinde mevcut poster/metadata davranışını doğrula ve taslağı göster.

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
