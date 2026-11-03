# Akışlar — onaylı kompozisyonun uygulaması

Ürün commitleri:95e8bd44,60dc4c5a,a74a94d6; son test commit’i3c023cac. Başlangıç master: 86288ffbab579970aea3449c10fd46bfed5170cb. [Onay/native karşılaştırma](comparison.html), [performans](PERFORMANCE.md).

## Uygulananlar

- Aynı grafit/amber kabuk, özgün uygulama logosu; 1352px içerik, iki bağımsız kaydırıcı. Okuyucu hero/metin/eylem aynı 680px sütunda. Küçük metin en az12px; görsel altı scrim ve beyaz12px kaynak etiketi.
- Kayar segment, iki aynı helper'ı kullanan özel menü: okuma filtresi + en yeni/en eski/tercih sırası. Yukarı/aşağı/Home/End, Enter/Space, Escape, dış tıklama ve focus-out. Yerel eski select gizli sözleşme adaptörüdür; görünür filtre değildir.
- Seç ile açılan checkbox'lar ve kaymayan toplu işlem alanı. Okundu/Kaydet/Daha sonra mevcut stateBatches ve geri alma yolunda; asistanın en fazla3 kaynak sınırı yalnız asistan için.
- Satır hover ve okuyucu ikonlarında Kaydet/Okundu/Daha sonra; tooltip + erişilebilir ad. j/k veya oklar: yazı; Enter: başlık odağından kaynak; m: okundu. Yazı alanında kısayollar çalışmaz. Seç alanındaki tooltip kısayolları açıklar.
- Aynı sağlayıcı/anahtar/config/istek yolu üzerinden Türkçe makale çevirisi. Özgün metin değiştirilmez; 2200 karakterlik kayıpsız parçalama, revizyon kontrolü, iptal ve sınırlı oturum cache. Metin değişince eski sonuç uygulanmaz. Çevirinin diskte kalıcı bir kopyası oluşturulmaz.
- Feed image/enclosure veya besleme HTML'indeki görsel; eksik/bozuksa favicon+baş harfli deterministik sıcak yedek. Görseller cover/center, lazy/async, opacity ile açılır. İlave olarak her makalenin web sayfasını otomatik indiren og:image taraması eklenmedi.
- İlk100 ve mevcut devam sayfalaması, content-visibility. Yazı açarken liste yeniden kurulmaz; yalnız aktif durum değişir. Yalnız yeni satırlar kademeli görünür. Hareket tam/azalt/kapalı ve OS azaltılmış hareket gözetilir; blur animasyonu yok.
- İlk yükleme skeleton, boş abonelik, sonuçsuz filtre, hata/yeniden dene, dar okuyucu/geri dönüş tasarlandı.

## Eski işlevlerin yeri

| İşlem | Yeni yer / aynı sahibi |
|---|---|
| Görünenleri okundu yap | Liste başlığındaki … menüsü; aynı görünür-snapshot/geri alma |
| Tercih sırası | Sıralama menüsü; aynı ranked API |
| Bu kaynağı asistana sor | Okuyucu sohbet ikonu; aynı spoiler/bağlam kapısı |
| Bu sıranın nedeni ve tercihlerim | Okuyucu altındaki aynı akordeon |
| Kaydet / Okundu / Daha sonra | Satır hover + okuyucu ikonları + seçim alanı |
| OPML/abonelik/yenileme ayarları | Kaynaklar → Kaynakları ve OPML’yi yönet |
| Kaynak-kütüphane bağı | Okuyucu altı; aynı önizleme ve onay, izlenmiş yapmaz |
| Yayıncının özeti uyarısı | Kaynak summary olduğunda okuyucuda görünür |

## Kontroller ve sınırlar

39 kısa mevcut/yeni kontrol geçti; son19 kontrol ve18 toplu işlem/yarış kontrolü de geçti (örtüşen koşular ayrı bug/test sayısı değildir). Yeni11 test:9 reading-desk +2 service. Syntax ve diff kontrolü geçti. Tam npm test veya GitHub Actions çalıştırılmadı.

Native 26 PNG:1440/1920/720, dolu, boş, yükleme, hata, seçim, sonuçsuz arama, bozuk/eksik görsel ve özel menü. 1440/1920 hero/metin sol kenarı eşit, üç genişlikte yatay taşma yok.720 geometri kontrolü menü için okuyucu gizlendikten sonradır; sıfır rect değerleri hizalama kanıtı sayılmadı. Temsili screenshot ve fixture verileri src içinde yok; yalnız tests/kanıt. UI/işlem kontrolleri gerçek Windows uygulaması/preload/store üzerinde. Son durumların boş/hata/loading cevapları kontrollüdür. Live Letterboxd'un52 yazısı veya gerçek AI kalitesi bu turda sınanmadı. Native görünüm renk/fontları uygulamanın ortak tokenlarından gelir; onaylı maketin tek başına kabuk örneği uygulama üst menüsünün üzerine kopyalanmadı.
