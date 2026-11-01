# Sinematik medya omurgası — 1 Kasım 2026

Bu teslimin amacı üst medya gezinmesini, ana sayfayı, keşfeti, film ve yorum/analiz deneyimini, asistanı, tarayıcı menülerini/ayarlarını ve yerel oynatıcıyı aynı ürün hiyerarşisine bağlamaktır. Üst menü, grafit/amber palet, Sora/Plex fontları ve mevcut medya–altyazı–dublaj yetenekleri korunur. Bu belge bir bug taraması veya tüm programın kusursuz olduğuna dair beyan değildir. Kullanıcının sonraya bıraktığı raporlar bu turda yeni görev olarak işlenmedi.

## Somut yerleşim kararları

**Gezinme:** İki satırdaki eşit ağırlıklı araçlar tek baz çizgisine alındı. Soldaki simge hover, tıklama ve klavyeyle uygulama menüsünü açar. İkincil sayfalar ve üretim araçları burada gruplanır. Küçük ekranda modlar ve sığmayan bütün sayfa düğmeleri aynı menüye taşınır; yazılar kırpılmaz. Arama ikonla açılır; sorgu, temizleme ve Escape davranışı korunur. Ayrı bir genel sol gezinme çubuğu eklenmedi.

**Medya kimliği:** Ana sayfanın geniş görseli mevcut güvenilir backdrop yolundan, üç eşzamanlı işi geçmeyen mevcut resim kuyruğuyla yüklenir. Kapak hemen görünür, uygun geniş resim geldiyse yerini alır; başarısız/portre resim mevcut kapağı silmez. Keşfette yalnız katalogda gerçek geniş görseli olan yapım öne çıkarılır. Sorgu sonuçları, kişisel/tercih listesi ve yükleme durumuna dekoratif hero zorlanmaz. Afiş puanları mevcut gerçek katalog puanıdır.

**Film:** Kütüphane ve Keşfet ayrı kısacık modal yerine mevcut tam film sayfasını kullanır. Poster–başlık–olgular–ana eylem aynı ölçüye bağlandı. Yorumlar tam okuma genişliğine taşındı. Var olan kişi verileri yüklendiğinde gerçek portreler yuvarlak görünür; eksik kişi fotoğrafı uydurulmaz. Konu çevirisi, kaynak düzenleme, izleme/puan tercihi ve tüm ileri işlemler kalır.

**Yorum ve analiz:** Özet ana anlatı, kişisel uygunluk ikinci alandır. Övgü/eleştiri/ayrışma gerekçelerinin yanında analizde kullanılan gerçek alıntılar okunur. Kaynak yazar adı iç ID yerine öne çıkarılır; tam kaynak, alıntı açıklaması ve örnek sınırları ayrıca açılabilir. Yorum okuyucusu seçili kaynağı gösterir; uzun metinler yalnız sunumda katlanır. Kaynağın tamamı model/evidence sözleşmesinden kesilmez. Hazırlanmış kayıtlı spoiler analizi koruması aynen bırakıldı; bu tur başka rapor düzeltmelerine genişletilmedi.

**Asistan:** Bir doğrudan Kopyala; sabitleme, dallandırma, yeni soru olarak düzenleme ve kod kopyalama erişilebilir mesaj menüsündedir. Menü durumu/odak yeni mesaj render'ında korunur, Escape/dış tıklama çalışır. Arşivlenmiş sabit mesajlar da aynı yolu kullanır. Kaynak, onay kartı ve gerçek iş durumu korunur. Yazma alanı kısa başlar, metinle büyür ve üst sınıra ulaşınca kendi içinde kayar.

**Tarayıcı ve oynatıcı:** Adres/gezinti/eylemler ayrı gruplardır; aktif sekme/ayar seçimi aynı amber çizgi dilini taşır. Menü ve ayar yüzeyleri tek katmanlı grafit ölçüye bağlandı. Yerel videoda Play ana kontrol, diğer taşıma araçları sessiz bir taşıma düzlemidir. İleri menü/kısayollar silinmez. Yeni ana sayfa menüsünün native video ve tarayıcı üstüne taşmasını engellemek için katman sınırı ana sayfa sahibinde kuruldu. Oynatma, medya anahtarı, geri dönüş ve kullanıcı oturumu sahipliği değişmedi.

**Hareket:** Mevcut bağımlılıksız WAAPI sahibi genişletildi. Sayfa360ms ve afiş420ms anlamlı içerik geçişidir; sıradan kontrol180ms. Afiş kaynaktan film sayfasına tek dekoratif öğe olarak taşınır, hedef çift resim üretmez. Hızlı gezinme, hedefin DOM'dan ayrılması, reduced-motion ve sayfadan çıkış temizlenir. Özgün düğme parlama/retro efekt paketi eklenmedi.

## Gerçek Windows görüntüleri

Görüntüler uygulamanın gerçek renderer/preload/native asistan yüzeylerinden, ayrı profilde alınmıştır. Film/metin/analiz fikstürleri kontrollüdür; yeni canlı model veya Letterboxd/YouTube başarısı göstermez. Kaynak görsel/video projede bulunan Blender Foundation **Tears of Steel** örneğidir; atıf [medya kaydında](../../media/README.md) bulunur. Çoğaltılmış afişler, sentetik başlık/puan/yorumlar yalnız yerleşim test verisidir. Bunlar yeni gerçek izleyici görüşleri olarak sunulmaz.

### Üst menü ve ana sayfa

![Tek baz çizgisindeki üst menü ve açılan araçlar](menu-wide.png)

![Dar pencerede aynı menü](menu-narrow.png)

![Ana sayfanın geniş gerçek görseli](home.png)

### Keşfet ve film

![Keşfet: denetim fikstürü, gerçek geniş görüntü](discovery.png)

![Kütüphane film sayfası](film.png)

![Keşfet film sayfası](discovery-detail.png)

### Yorum, kaynak ve asistan

![Yorum analizi ve görünür kaynak alıntıları](review.png)

![Dar okuma düzeni](review-narrow.png)

![Gerçek ayrı asistan yüzeyi](assistant.png)

![Asistanın klavye erişimli mesaj işlemleri](assistant-menu.png)

### Tarayıcı ve oynatıcı

![Tarayıcı menüsü](browser-menu.png)

![Tarayıcı ayarları](browser-settings.png)

![Yerel oynatıcı](player.png)

![Dar oynatıcıda ileri menü](player-menu.png)

![Oynatıcı ayarları](player-settings.png)

[Afişten film sayfasına gerçek geçiş kaydı](media-transition.mp4). Bu capturePage kareleri ve gerçek zaman aralıklarından oluşturulmuştur; masaüstü ekran kaydı, FPS veya performans ölçümü değildir.

## Doğrulama ve açık sınırlar

- Değişen davranışlara yönelik85benzersiz Node kontrolü:84ilk koşuda geçti; stdio adaptörü sandbox'ta `spawn EPERM` aldı. Aynı asistan dosyasının10kontrolü alt süreç izniyle tekrar çalışınca tamamı geçti. Son yorum byline/sunum değişikliğinden sonra36yorum kontrolü ayrıca geçti. Bu sayılar toplanarak yeni bug sayısı üretilmez.
- Kalıcı `tests/electron-media-identity.smoke.js`: gerçek1440/1280/720/620/480CSS genişliklerinde57üst menü kontrolü,9ana yüzey görüntüsü, afiş geçişi, target opacity geri dönüşü ve gerçek asistan child-view. Önceki geçici capture'ın maximized pencere nedeniyle yanlış ölçülen dar ekran kanıtı kullanılmaz; test pencereyi açıkça unmaximize eder.
- `tests/electron-home-discovery-design.smoke.js`:21kayıt; gerçek geniş artwork, mevcut katalog puanı, filtre/sorgu, film sayfası/tam genişlik yorumlar, gelişmiş seçenek, tercih işlemi ve kontrollü hata/yeniden deneme. Önceki sorgu yeni turda bilinçli temizlenir; sorgu varken hero beklenmez.
- `tests/electron-review-reading833.smoke.js --after`:43görüntü; uzun/tam kaynak, tek okuma sahibi, örnek önizlemesi, geri dönüş, doğrulama uyarısı, arşiv/spoiler erişimi. Kaynak/draft/analiz sözleşmesi korunur.
- `tests/electron-assistant-message-actions.smoke.js`:360×580TRkoyu,480×720ENkoyu,680×800TRaçık; native Space/Tab/Escape, hit-test, gerçek composer büyümesi/üst sınır, kopyala/dallandır bridge ve mevcut açık onay yolu.
- Tarayıcı/yerel oynatıcı kontrolü:19hedefli etkileşim,16önce/sonra görüntü; gerçek yerel videoda Play/Pause, aynı mediaKey, menü viewport sınırı ve Home katmanının diğer çalışma alanlarını örtmemesi. Son kontrolde Ana sayfa düğmesi aynı42pxbaz çizgisine alındı; ayarlardaki gereksiz üst etiket kaldırıldı.
-13değişen/yeni JavaScript dosyasında `node --check`, scoped `git diff --check`: geçti. Tam `npm test`, uzun CI, kişisel profil, canlı API/model/GPU/DRM/gerçek site oturumu bu tasarım turunun kabulü değildir. `start.bat`/kurulum/back-end değiştirilmedi; Windows native uygulama açılışı doğrudan izole Electron fixture ile yapıldı.
- Yakın alanda ayrıca çalıştırılan, **bu turda değişmeyen** `tests/discovery-review810.test.js` tek kırmızı: boş sonuç `{}` beklerken `{feedback:undefined,feedbackIdentity:undefined}` dönüyor. Test ve Node servisinin HEAD blobları mevcut dosyayla aynı; UI değişikliği bunları çalıştırmıyor. Eşik/test değiştirilmedi ve kullanıcı sonraya bıraktığı işlevsel raporlara genişletilmedi. CI sonucu beklenmeden teslim edilir; tüm testler yeşil iddiası yok.

## Kaynaklardan alınan fikirler

Buradaki bileşenler özgün JS/CSS ile mevcut ürüne uyarlandı. Dış repo kodu, marka görseli, font paketi veya çalışma zamanı bağımlılığı kopyalanmadı. Reiverr/BrowserOS görsel örnekleri yalnız yerel araştırmada incelendi; kendi ürün görüntülerimiz diye sunulmadı.

| Kaynak ve sabit revizyon | Gerçekte incelenen | Uygulamaya aktarılan / aktarılmayan |
|---|---|---|
| [Reiverr dbdd50d](https://github.com/aleksilassila/reiverr/tree/dbdd50dfa8366a0c311b21ba513aabbbc0f28c87) | HeroShowcase, HeroInfoLayout, Sidebar, Button ve uygulama CSS'i; resmî demo GIF karesi. | Backdrop–poster–başlık ilişkisi, ikincil araçların bağlamda açılması. Sol rail ve TV odak düzeni kullanıcı talebine uymadığı için alınmadı. |
| [BrowserOS b04405a](https://github.com/browseros-ai/BrowserOS/tree/b04405ad9826bde42cd55d2aeab17096a5fb12e3) | ChatMessageActions, ChatMessages, SidebarNavigation, global CSS; README'deki neo dashboard görseli ayrıca incelendi. | Yanıt metninin eylem kontrollerinden baskın olması. Neo dashboard'un sol rail/açık mavi dünyası alınmadı; bizim asistan izin/source/draft modeli korundu. |
| [Jellyfin Vue 6b80dd8](https://github.com/jellyfin/jellyfin-vue/tree/6b80dd89c37aa03b32c4d3ffb76b0ccf63902043) | AppBar, GenericItemCard, MediaDetailContent. | Kompakt sabit kontrol ölçüsü, görüntü odaklı kart ve teknik ayrıntının ayrı sahibi olması. Vue/Vuetify veya sunucu mimarisi eklenmedi. |
| [IINA 1b05edd](https://github.com/iina/iina/tree/1b05edd0f7524ecc95286af75529007d4cfe1124) | OSCBottomView, OSCToolbarButton; resmî ürün sayfası. | Taşıma düzleminde tek hiyerarşi, sessiz ikincil ikonlar ve kompakt ölçü. AppKit/liquid-glass/macOS davranışı Windows'a taşınmadı. |
| [Zen 147e6eb](https://github.com/zen-browser/desktop/tree/147e6ebb2ebf8ce59980a95636bb077fedc641fe) | zen-popup.css ve compact-mode/toolbar.inc.css. | Hover/popup açıkken güvenli kalma, tek menü ölçüsü. Dikey genel gezinme ve tarayıcı motoru taşınmadı. |
| [Fluent2 yerleşim](https://fluent2.microsoft.design/layout), [hareket](https://fluent2.microsoft.design/motion) | Gruplama, boşluk ilişkisi ve hedefe bağlı hareket ilkeleri. | Mevcut token/WAAPI sahibiyle düzen; yeni görsel framework eklenmedi. |
| [Luna](https://github.com/Nothingman333/Luna-Player) | Kullanıcının verdiği üç gerçek görsel; üst medya menüsü, afişli keşif ve film kişi görünümü. | Kalite karşılaştırması. Turuncu logo/piksel yerleşimi/marka kopyası yapılmadı. |

Bu paket PDF/kitap/dublaj/stüdyodaki her ekranı baştan çizmiş sayılmaz. Bu alanların mevcut yetenekleri ve ortak renk/hareket altyapısı korunur; gerçek görüntüsü alınmayan akışlar tamamlandı veya kusursuz diye etiketlenmez.
