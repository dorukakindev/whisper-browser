# Rapor582 — Kaynaklara ayrılmış arama ve TMDB görsel galerisi

25 Ekim2026 18:36. Repo https://github.com/dorukakindev/whisper-browser; dal `codex/luna-gap581`, PR488 devamı. Başlangıç `72134a648b0b0f51250d7013686387624e7092e3`; ana ürün `19dab054dc178464d933b4d103e0ffa9ad2593a9`, son görsel düzeltmesiyle bitiş **2835470c2072cd32cbb853ebbc4d3e44994cd34f**.

## Kullanım

Ana sayfa arama alanındaki büyüteç veya **Enter**, **Tüm kaynaklarda ara** penceresini açar. Mevcut sayfa filtresi yazarken çalışmayı sürdürür. Pencerede filmler/diziler, kitaplar, müzik ve izleme geçmişi ayrı başlıklardır; Türkçe aksanlı/aksansız arama desteklenir. Her kategoride en fazla40satır çizilir, toplam eşleşme ve sınır aşımında aramayı daraltma mesajı gösterilir. Sonuç kendi gerçek kimliğine açılır: film ayrıntısı, kitap okuyucu, müzik için mevcut yetkili dosya oynatımı, geçmiş için mevcut izleme kaydı.

**Çevrimiçi film ve dizi ara** veya penceredekiEnter açık arama eylemidir; yazarken ağa sorgu gönderilmez. Mevcut Cinemeta film/dizi aramaları ayrı sonuç grupları; mevcut yerel sonuçlar korunur, kısmi hata görünür. Çevrimiçi sonuçta kütüphaneye eklenip ayrıntının açılacağı açıkça yazılır; tıklamadan kayıt/video/AIişi başlatılmaz. Sorgu değişirse geç gelen eski çevrimiçi yanıt reddedilir. Kitap/müzik çevrimiçi araması bu paketin kapsamı değildir.

Film/dizi **tam ayrıntı sayfası → Görseller**: TMDB'den büyük görsel, önceki/sonraki, klavyeokları, küçükresimşeridi, sıra ve kapatma. Kayıtlı doğru movie/tvkimliği ve mevcutTMDBayarı kullanılır. En fazla80backdrop+20poster, tekil ve güvenli yol; sabit image.tmdb.org/w1280-w185adresleri. Aynı endpoint/kimlik/ayar/dil için mevcut10dkcache. Gelenliste en fazla100görsel, küçükresimDOM'u aynıanda12öğe. APIanahtarı renderer'a taşınmaz; mevcut yetkili mediaCatalogIPC ile yalnız görüntüadresleri gelir. Hata/yeniden dene/boşliste görünür; geç gelen yanıt kapatılmışgaleriye uygulanmaz. ÖzelPoster veya kaynakdosyası değiştirilmez.

## Dosya amaçları ve düzeltmeler

- `catalog-discovery.js`: `images()` mevcut TMDB istemcisi/cache/boyut/token/kimlik katmanını kullanır. `catalog-extensions.js`: `metadata-images` mevcut yetkili eylem yoluna bağlanır.
- `renderer/title-gallery.js`: temalı/native modalgaleri, boundedthumbstrip, klavye/odak/yaşam döngüsü. `media-title.js`: Görsellergirişi. `media-title.css`: gövde/containbüyükresim/kontrol/thumbnail/dar düzen; overflow gizleyerek kontroller kesilmez.
- `media-search-model.js`: yerel çokkaynak eşleştirme,40satırgrup/TRnormalizasyonu, kaynaklistesini değiştirmez.
- `media-search-ui.js`: ayrıprofilgerektirmeyen normal uygulama aramaUI; mevcutAPIlerden yerelveriler, açıkremoteisteği, sürümguard, sonuçların doğru açılması ve görünürhatalar. Katalogafişleri en fazla2eşzamanlıyereldiskokuması; geç yanıt bağlı olmayan kartı güncellemez. KitapkapaklarıdataURL, geçmişYouTubevalidkimlik, remoteafişler izinlihost. Yeni ağfetchrenderer'a eklenmedi.
- `media-home.js/CSS`: mevcutarama düzeninde kompakt erişilebilirbüyüteç veEnter, ekgeniştoolbarbutonu yok; aramapenceresi/sourcebaşlıkları ve görseller. `index.html`: selfCSPuyumlu yerelscriptler.
- `media-search-gallery.test.js`: Unicode/kaynak/cap, güvenliTMDByol/kimlik/cache, yazarkenremoteolmaması ve geçyanıtın yeni sorguyu ezememesi.
- `electron-library-search-gallery.smoke.js`: gerçekWindowsElectron/main/preload/IPC/yerelPDF ve kontrollünetworkgörselleri.

Görselincelemede iki gerçekbütünleşmesorunu çıktı ve düzeldi: (1) arkaplanmetadata yenilemesi galeriyi açan düğmeyi yeniden çizince kapatmadaklavyeodakıbody'ye düşüyordu. Aynıyapımkimliğindeki günceldüğme bulunup sonraki frame'de odaklanır, farklıfilm hedeflenmez. (2) Aramakartı DOM'a katılmadan `isConnected` kontrolü yapıldığı için kapak yüklemesi başlatılmıyordu; kartlar katıldıktan sonra microtask'ta yükleme yapılır. Son nativekontrolde gerçektenyüklenmişimg.naturalWidth şartı eklendi. Bunlar bu yeni pakette yakalanıp düzeltilen sorunlardır; önceki master'da varmış gibi bug sayısı üretilmez.

## Doğrulama

14hedefliNodePASS (`media-search-gallery`, `catalog-related`, `csp-policy`), syntax/diff temiz. Son artworkonarımından sonra ilgili3test tekrarPASS. İlk gallerytest sahtecredential20karakter sınırını karşılamıyordu; fixture geçerli uzunlukla düzeltildi, güvenlikeşiği değiştirilmedi.

NativeWindows sonkoşu **exit0**, `.uiprev/search-gallery-1792942533730`:1440×1000 ve gerçek800×900viewport. Yerelfilm/kitap/geçmişayrımı, aramada gerçekimgyükleme, açıkremotefilm/dizisonuçları, onlineresultkaydıve tam ayrıntısı, gerçekPDFkitabınaramadan açılması,3galeriresmi, sağokla2/3, kapatınca odakaynıdüğmeye, yataytaşmayok. `search-local-tr`, `search-online-tr`, `gallery-tr`, `gallery-narrow-tr` görüntüleri incelendi. Görseller sentetiknetworkfixture'dır, gerçek kullanıcıafişi diye sunulmaz. Yalnıztestpenceresiminimumu640'a indi, normaluygulamaminimumu değişmedi. OS-DPI/karmaekrandoğrulaması değildir.

Komşuakış kontrolü `electron-home-entry-actions.smoke.js` **exit0**, `.uiprev/home-entry-actions-1792942445199`: öncekiYouTubethumbnail/Keşfetçeviri/Letterboxdörneği/tamfilmegeçiş/PDFsesgirişi korundu. Yeni testglobalfetch sahte404döndürdüğünden reklamfiltreindirme uyarısı oluştu; canlıreklamengelleyici testi değil.

YeniWhisperbağımlılığı/kurulum/kalıcıayarşeması yok; start/install/package/lock değişmedi. ÜcretliAPI/canlıTMDBanahtarı/gerçekCinemetakalite/tümsite/GPU/DRM/kişiselstart.bat/fullsuite bu tur sınanmadı. CIbeklenmedi/kapatılmadı, eski ratchet sınırı kapatıldı sayılmadı. Ürünmotoru/Whisper/dublaj hattı değiştirilmedi. LunaGPLkodu/asset kopyalanmadı; öncekiRapor581güncelkaynak incelemesinden özgünuyarlama.

KalanLunafarkları: altıhikâyelizevktesti, açıkklasik/LibriVoxkeşfi; kaynaklaraayrılmışarama yerelmüzik/kitap+onlinefilm/dizi ile sınırlıdır, bütün çevrimiçikaynaklar entegre değildir. PR488 yeni paketi içerir; ana master/kullanıcının açıkuygulaması değiştirilmedi. Kullanıcıbirleştirme onayı olmadan start.bat'da henüzyeniler görünmez.
