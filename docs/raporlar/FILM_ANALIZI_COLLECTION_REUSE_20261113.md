# Film Analizi projesinden yararlanma — Anime/Manga ayrıntıları

Kaynak yalnız okundu: H:/PROJE/Diğer Projeler/Film Analizi/electron-app. Eski proje, ayarları ve kişisel dosyaları değiştirilmedi. Agent kullanılmadı.

## Okunan gerçek kod ve alınan mekanizmalar

- js/library.js:320–397: AniList GraphQL genres/tags/rank/spoiler alanları, kimlik seçme ve zaman aşımı. Bizde mevcut kesin MAL → AniList adaptörü korundu; kayıp olan otomatik sayfa yüklemesi bağlandı. Tema kategorisi de eklendi.
- js/manhwa_assistant.js:435–465 ve js/anime_assistant.js:42–68: ağırlıklı temalar, açık beğenilerden etiket çıkarımı. Bizde mevcut metadata cosine motoru kullanıldı; sayfada olumlu ve karşıt gerçek puanlı yapımlar ve ortak etiketler gösterilir.
- recommendation_engine.py:471–527: kişisel skor yanında gerekçe ve kaçınılan unsurlar; 640 ve devamı: tür/puan dağılımları. Profil icat edilmedi, mevcut ayrı medya havuzlarına bağlanıldı. Açılışta zenginleşen bilgiler ayrı cache üzerinden mevcut Zevkim/öneri hesabına da girer.
- server.py:2885 ve devamı: yapım kimliğine bağlı public AniList review ve forum akışları. Bizde ilk 12 review, kesin medya kimliği kontrolü, kaynak linki, düz metin ve spoiler uyarısıyla mevcut mediaShelf servisinde sunulur. Forum zincirinin ek istekleri veya AI analizi otomatik başlatılmadı.
- js/profile.js:91–93,273 ve devamı: tür dağılımı görünümü; mevcut profil/portre işlevimiz bulunduğu için ikinci paralel profil veya yeni Python sunucusu eklenmedi.

## Taşınmayan riskler

- Eski manhwa yardımcı kodunda ilk arama sonucu kullanılıyor, bazı hatalar boş listeye dönüşüyor. Bizde yanlış yapımı sessizce bağlama yok; kesin ID doğrulanır, hata görünür.
- Eski library örüntü hesabı kişisel puan yokken analiz/topluluk puanına düşebiliyor. Bizde topluluk puanı kişisel beğeni değildir; kaynakta puansız0 olumsuz sayılmaz; anime ve manga/film havuzları ayrıdır.
- Eski cross-context boost, geniş forum taraması ve sağlayıcıya otomatik içerik gönderimi alınmadı. Bu görev ücretli model çalışması değildir.

## Uygulama

Eksik konu/metadata sayfa açılırken otomatik alınır. Public detay cache'i kişisel arşivden ayrıdır: collection-detail-cache.json, en fazla50 kayıt/4MB, tazelik24saat; eşzamanlı aynı istek birleştirilir, public istekler aralıklı çalışır, otomatik hata30sn bekler. Kaynak kapalıysa eski bilgi ve açık uyarı kalır; manuel yeniden deneme vardır. Puan/not/ilerleme ve açık metadata düzeltmeleri değişmez. Detaydan çıkma/kimlik değişimi gecikmiş yanıtı yeni sayfaya uygulamaz.

Uygunluk0–100 metadata benzerliğidir; beğenme olasılığı veya model tahmini diye sunulmaz. Hedef kendi puanıyla eğitilmez; sıradaki başka bir yapımın skoru hedef yerine kullanılamaz. Yetersiz puanda sayı uydurulmaz. Temalar kaynak kategori/ağırlığıyla gruplanır; spoiler etiketleri dışarıda kalır. Yorumlar kullanıcı düğmesiyle okunur ve ayrı cache'i10dakikadır; sağlayıcıya gönderilmez.

Resmi alan/protokol kontrolü: https://docs.anilist.co/reference/object/mediatag , https://docs.anilist.co/reference/object/review , https://docs.anilist.co/reference/enum/reviewsort . Tarayıcıda ilk doğrudan belge çağrısı403 döndü; resmi indeks araması ve gerçek GraphQL sorgusu ile alanlar doğrulandı.

## Kanıt ve sınırlar

- Yeni7 servis/eşleşme testi, ayrıntı/UI6 testi geçti. Mevcut personal-collection76 ve recommendation-hub kontrolleri geçti. İlk tek-yapım eşleşmesi, daha yüksek skorlu başka planned yapımı seçebiliyordu: yeni regresyon100/null başarısızdı; yalnız hedefi değerlendirme onarımı sonrası geçti.
- Gerçek public AniList: manga MAL13492 → AniList43492 Ao no Exorcist: konu536karakter,23etiket,9kategori,0review. Anime MAL9919 → AniList9919: konu660karakter,14etiket,8kategori,3review. Manga review boşluğu doğrudan public response ile doğrulandı; yanlışlıkla veri var denmedi. Bu sayılar tarihli snapshot'tır.
- Kişisel profil kullanılmadan geçici arşivlerde denendi; rating null kaldı. Yeni canlı ücretli API/AI çağrısı yapılmadı.
- İzole gerçek Windows Electron, ASUS VG27AQ1A; OS çözünürlüğü değişmedi. Tam ekran CSS viewport1707×960; gerçek1920×1080 iddiası yok. Yüklenme, konu/etiket/uygunluk, menüden gezinme, açık yorum metni görünürlüğü ve taşma kontrolü geçti. Görseller .uiprev/collection-auto-20261113/ altında; içerik/görseller/puanlar fixture'dır. Gerçek API kabulü yukarıdaki ayrı servis kontrolüdür, görseller canlı kişisel kayıt değildir. İlk UI fixture'ında frozen api nesnesine yazma çalışmadı; Proxy ile düzeltildi, hata ürün koduna taşınmadı.
- Kişisel uygulama açıkken değiştirilmedi; start.bat ve kişisel kayıtlarda kullanıcı kabulü yapılmadı. Yorumlarda kapsam12 public AniList review; MAL/forum/ücretli yorum analizi bu teslimde yok.
