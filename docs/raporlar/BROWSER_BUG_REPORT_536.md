# Rapor536 — Otomatik TMDB afişleri ve gerçek film ayrıntı ekranı

## Doğrulanan sorun ve sonuç

Kayıtlı TMDB anahtarı olmasına rağmen ana sayfa boş afiş gösteriyordu. Anahtar kaydı yalnız ayarı saklıyor, kütüphaneyi yenilemiyordu. Önceki toplu doldurma yalnız TMDB/IMDb kimliği olan en çok30 kaydı işliyordu; mevcut arşivin117 kaydında bu kimliklerin hiçbiri yoktu. Ana sayfa kartı da film ekranı yerine yönetim penceresine gidiyordu.

Anahtar kaydından ve uygulama açılışından sonra eksik metadata tek işçiyle arka planda tamamlanır. Pencereyi kapatmak işi iptal etmez; ana sayfa/Ayarlar bölümünde ilerleme, Durdur ve yeniden deneme vardır. Birden çok başlangıç çağrısı paralel işler oluşturmaz. Değişen credential/dil eski isteği iptal eder. Yetkisiz/rate-limit yanıtında toplu iş durur; aynı yapılandırmada otomatik tekrar yapılmaz. Başarısız/eksik isteğin24saatlik tekrar önleme kaydı yalnız hash/zaman içerir; yeniden deneme ve anahtar değişimi bu engeli aşar.

Kimlik varsa o kullanılır. Yoksa tam normalize başlık/özgün başlık ve verilmişse aynı yıl aranır. Sonuç sayfası tek olmalı; aynı ada iki film veya yıl uyuşmazlığında otomatik seçim yapılmaz. Yıl yoksa da yalnız tekil tam başlık kabul edilir. Dolu başlık, özet, tür, oyuncu, yönetmen, süre, puan, favori, kaynak ve izleme geçmişi ezilmez. Silinmiş yerel afiş dosyası eksik sayılır.

Gerçek denemede Türkçe TMDB sonuçlarının içe aktarılmış İngilizce alternatif adı taşımadığı görüldü: ilk üç kayıttan ikisi eşleşmedi. Arama EN ve seçili bilgi dilinde yapılır, ayrıntı seçili dilde alınır. Yerelleştirilmiş özet boşsa İngilizce özet kullanılır; uygulama bunu kendisi çevirdiğini iddia etmez. Bu regresyon ayrı testle sabitlendi.

## Film ekranı

Kart/Ayrıntılar düğmesi artık bağımsız, ortalanmış ve kaydırılabilir film/dizi ekranını açar. Büyük yerel afiş, isteğe bağlı TMDB sahne görseli, özgün ad, yıl, süre, tür, TMDB puanı, mevcut IMDb/Letterboxd/kişisel puan, konu, oyuncular ve yönetmen/yaratıcı gösterilir. Favori, kişisel puan ve izleme durumu doğrudan kaydedilir. Kaynak varsa devam/oynat ve mevcut Türkçe izleme hazırlığına geçiş; yoksa dosya seçimi vardır. Dizi için sezon/bölüm listesi; yorum/zevk profili, kaynak yönetimi ve elle TMDB eşleştirme eski gerçek işlevlere bağlıdır.

Yeni CSS sınıfları `mtd-` ile ayrıldı: ilk görsel kontrolde zevk profilinin `mt-hero` kuralıyla çakışma, açık tema kontrastı ve solda kalan dialog bulundu ve giderildi. Canlı metadata güncellemesi sırasında yazılmakta olan kişisel puan ve klavye odağı korunur. Kapandıktan sonra geciken Play sonucu başka bir yapım ekranını kapatmaz.

## Kanıtlar

- 14 hedefli Node sonucu: `node --test tests/catalog-metadata-sync.test.js tests/tmdb-settings.test.js tests/media-catalog-service.test.js tests/catalog-roadmap.test.js tests/media-home-model.test.js` geçti; roadmap/service kendi davranış bataryalarını da çalıştırır.
- Windows Electron `tests/electron-metadata-settings.smoke.js` geçti. Ayrı sentetik profil;5 kontrollü TMDB/görsel yanıtı,0gerçek TMDB isteği. Kaydet→pencereyi kapat→otomatik eşleştir→diske afiş→ana sayfada gör→karttan film ekranı; belirsiz adayın reddi; favori, puan, izlendi, odak/taslak; TR1920koyu/EN940açık ve yatay taşma kontrolü.
- Ayrıca kullanıcı tarafından istenen TMDB işi için kayıtlı credential main belleğinde kullanıldı; anahtar yazdırılmadı. Önce3 kayıt gerçek API ve gerçek afiş/sahne görselleriyle Windows ekranında doğrulandı. Sonra117 kayıtlık arşivin ayrı, kaynak/yol ve diğer anahtarları taşımayan kopyasında gerçek API koşumu:54 metadata güncellemesi,53 afiş,54 özet,63 elle eşleştirme,0işlem hatası. Bir doğrulanmış yapımda sağlayıcı afişi yoktu. Asıl kullanıcı profili değiştirilmedi. Bu sonuç tüm arşivin otomatik eşleştiği anlamına gelmez.
- Gerçek ekran kanıtları `.uiprev/live-metadata/1792865057780-21116/`; tüm-arşiv denemesi `.uiprev/live-metadata/1792865136003-26356/`; son sentetik UI `.uiprev/metadata-settings/1792865421894-17508/`. Özel profil, credential, çıktı ve ekranlar Git'e alınmadı.
- Preload kullanım:286export,7dormant,0kullanılmayan; paket bütünlüğü9test geçti. Değişen JS sözdizimi ve diff kontrolü geçti. İlk sandbox test çağrısı EPERM verdi, izinli hedefli tekrar geçti. Yanlış `.cjs` araç adıyla ilk ratchet çağrısı dosya bulunamadı verdi; doğru `tests/preload-usage-ratchet.test.js` geçti.

## Kullanım ve sınırlar

Bu dalın açık önizlemesini tamamen kapatıp aynı `preview-luna.bat` ile yeniden aç. Kaydedilmiş TMDB anahtarı yeniden girilmez; eksikler otomatik işlenir. Belirsizleri Ayarlar→Film bilgileri ve afişler→Eşleştir ile onayla. Film kartına tıklayarak yeni ekranı aç. Durdurma o oturumda otomatik yeniden başlamaz; yeniden deneme açıktır.

Ana/master checkout güncellenmedi ve PR birleştirilmedi. start.bat/install.bat değişmedi; normal start.bat açılışı, CUDA/model, gerçek video oynatma/DRM ve tam npm test bu tur yeniden koşulmadı. CI açık, sonucu beklenmez. Film sayfasındaki online sahne resmi bellekte sınırlı önbelleklidir; yerel afiş/metadata kalıcıdır. Yeni opsiyonel katalog alanları tagline/backdrop/tmdbRating/tmdbVotes, eski kayıtlarla uyumludur; dependency veya kurulum değişmedi.

Resmî referanslar: [TMDB Search](https://developer.themoviedb.org/reference/search-movie), [Image basics](https://developer.themoviedb.org/docs/image-basics), [Rate limiting](https://developer.themoviedb.org/docs/rate-limiting).
