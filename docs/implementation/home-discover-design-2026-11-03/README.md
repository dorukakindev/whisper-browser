# Ana sayfa + Keşfet — ilk tasarım paketi

## Kapsam ve görsel yön

Yalnız ortak görsel altyapı, Ana sayfa ve Keşfet. Film ayrıntısı, kütüphane sayfa içerikleri, RSS, browser/altyazı paneli sonraki ekran turlarıdır. Ortak üst menü ve metadata bildirimi aynı uygulama kabuğunda kullanılır. Mevcut komutlar, kaynak kimlikleri, iş sahipliği ve veritabanı biçimleri korunur.

Kullanıcının ekran brief'i skill önerilerinden önceliklidir. `frontend-design`, `frontend-design-premium`, `make-interfaces-feel-better` yerleşim, erişilebilirlik ve ince işçilik için kullanıldı. Luna ekranları kalite eşiğidir; kodu/markası/yerleşimi kopyalanmadı. Yeni hesap, dış font, UI framework veya paket bağımlılığı yok.

Grafit palet runtime `theme-palette.css` kaynağından gelir. `media-visual.css` bu palete bağlı sıcak yüzey, 4/8 boşluk, yazı, köşe ve 160ms hareket tokenlarını içerir. Bu iki ekranda IBM Plex Sans kullanılır. `MediaVisual` mevcut DOM düğmelerini taşıyan ortak kart, düğme, boş durum, menü, filtre ve kaydırma kontrollerini sağlar. İşlem callback'leri yeniden yazılmaz.

Üstte tek dolu ana eylem Medya aç; diğer navigasyon tek yatay çizgi ve alt çizgili aktif durum. Arama açılır, ikincil araçlar mevcut sol uygulama menüsünde kalır, Browser ve dar ekranda ayarlar kompakt işlem menüsündedir. Asistan aynı native paneli üst araç simgesinden açar; bu iki ekranda kapalı baloncuk içerik üstüne binmez.

## Önce görsel kompozisyon

Üretim değişikliğinden önce [Ana sayfa kompozisyonu](composition-home.png) ve [Keşfet kompozisyonu](composition-discover.png) hazırlandı, gösterildi ve incelendi. Kaynak: [bağımsız HTML kompozisyonu](composition-design.html).

Bütün yapımlar, katalog ve izleme kayıtları **kontrollü/sentetiktir**; kişisel profil değildir. Aynı izinli Tears of Steel fotoğrafının test için tekrar kullanılması gerçek katalog sanılmamalıdır. Görsel `docs/media/demo-poster.png` kaynaklıdır; Blender Foundation Tears of Steel, CC BY 3.0, atıf `docs/media/README.md` içindedir. Native görüntüler test penceresinden alınmıştır; tasarım maketiyle karıştırılmaz. DPI 150%; test genişlikleri CSS/content px'tir, PNG fiziksel boyutu daha büyük olabilir.

## Ana sayfa — görüntü, eleştiri, düzeltme

[Önce](home-before.png) · [Sonra 1440](home-1440.png) · [Dar 480](home-480.png) · [Geniş 1920](home-1920.png) · [Boş](home-empty-1440.png) · [Bildirim](home-notification.png)

- Daha sakin iki satırlık hero başlığı, sağda bulanık/karartılmış gerçek kaynak görseli, güçlü okunabilir gradyan, devam eylemi ve sessiz klasör eylemi.
- İnce ilerleme hemen eylemlerin altında; kalan süre ayrı küçük metin. Hero kontrolleri ve yatay raf okları ayrıdır.
- Devam kartları 16:9; afiş rafları 2:3. Başlık iki satır, bilgi hemen altında. Afişsiz kayıt deterministik sıcak gradyan + baş harfler alır. Dosya adı temizliği yalnız gösterimdir, kaydedilmiş kimlik/metin değiştirilmez.
- Sıradaki hikâyen tek görünür seçim ve diğer iki eylemi içeren menü; ileri altyazı/ses araçları erişilebilir ayrıntı altında.
- İlk native görüntüde kart başlığı–bilgi aralığı eski 3em kuralından uzundu; scoped düzeltildi. `.mkv - YouTube` temizleme sırası ve Windows dosya yolu ayrımı düzeltildi. Boş durumda asıl medya ekleme alanı önce gösterildi. Önceki görüntüyü yalnız test geçti diye teslim etmedik.
- Metadata durumu sabit küçük kapatılabilir toast; kapatma işi iptal etmez. Eşleştirme, durdurma ve yeniden deneme eylemleri yerinde.

## Keşfet — görüntü, eleştiri, düzeltme

[Önce](discover-before.png) · [Sonra 1440](discover-1440.png) · [Dar 480](discover-480.png) · [Geniş 1920](discover-1920.png) · [Filtre açık](discover-filter-open.png) · [Kaydırma](discover-sticky.png) · [Yükleniyor](discover-loading.png) · [Boş sonuç](discover-empty.png)

- Arama solda; Yapım/Liste/Tür mevcut select'lerini koruyan kompakt açılır filtrelerde. İzlenme seçimi segment; toplu seçim aynı kontrol satırında.
- Gerçek katalog backdrop'u, solda okunabilir gradyan, küçük kaynak puanı ve tek hero eylemi. Görsel yüklenemezse mevcut gizleme davranışı korunur.
- Afiş ızgarası, küçük puan rozeti, yakın yıl/başlık, tembel görseller ve gerçek iş yüklenirken skeleton. Üst filtreler gerçek başlığın altına sabitlenir.
- İlk native görüntüde eski pseudo katmanı görselin altında kalıyordu; `::before` ve z sırası düzeltildi. Arama simgesi alanın uzağındaydı; aynı kapsayıcıya taşındı ve input tam genişlik yapıldı. Açık filtre popover'ı ve 480px görünüm ayrıca incelendi.

## Hedefli doğrulama

- `node --test tests/media-visual.test.js tests/assistant-overlay.test.js tests/media-home-model.test.js tests/media-discovery-service.test.js`: **28/28 PASS**.
- Değişen JS sözdizimi ve iki yeni CSS modülünün esbuild parser kontrolü: PASS.
- `tests/electron-home-discover-design.smoke.js`: gerçek Windows ana/preload/renderer; ayrı test profili, kontrollü ağ. Ana sayfa dolu/boş, 480/1440/1920; hero geçişi, progress, menü, toast kapatma. Keşfet filtre/arama/izlenme, toplu seçime erişim, sticky hizası, skeleton, boş sonuç ve kontrollü 503 sonrası mevcut yeniden deneme: PASS. Makine tarafından yazılan kabul JSON'ları yanındadır.
- İlk sandbox denemelerinde süreç başlatma EPERM verdi; izinli native çalıştırmada tekrarlandı. Bir testin yanlış `close` komutunu kullanması gerçek overlay sözleşmesi `toggle` olarak düzeltildi; ürünün kapatma eylemi değiştirilmedi.
- Tam npm suite, gerçek sağlayıcı, YouTube/DRM, GPU, ses üretimi ve diğer ekranlar bu tasarım paketinde sınanmadı. Test ağı reklam listelerini bilerek reddetti; bu gerçek reklam engelleme deneyi değildir. Uzun CI veya Actions çalışması başlatılmadı.
- Native ekran görüntüsü estetik konusunda kullanıcı onayının yerini tutmaz. Bu paket iki ekranın görsel/yerleşim brief'ini uygular; bütün uygulama yeniden tasarlandı veya Luna'dan üstün olduğu iddia edilmez.

### Yerel yeniden üretme

Projenin Electron ortamı ve mevcut bağımlılıklarıyla `electron tests/electron-home-discover-design.smoke.js --disable-gpu`, ardından `--discover` veya `--empty` kullanılır. Windows'ta `ELECTRON_RUN_AS_NODE` tanımlı olmamalıdır. Test kendi `tmp/home-discover-design-*` profilini oluşturur, kişisel uygulamayı kapatmaz. `--before` yalnız belgelenen başlangıç commit'i Git'te varsa karşılaştırma amacıyla kullanılır.
